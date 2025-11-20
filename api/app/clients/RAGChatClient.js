const OpenAIClient = require('./OpenAIClient');
const { logger } = require('~/config');

/**
 * Custom client for rag-chat-server that uses polling instead of streaming.
 * Extends OpenAIClient and overrides sendCompletion to implement polling workflow.
 */
class RAGChatClient extends OpenAIClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.sender = options.sender ?? 'Legal Research Assistant';

    // RAG server configuration
    this.ragServerUrl = options.ragServerUrl || process.env.RAG_SERVER_URL || 'http://legal-search-api:8123';
    this.pollIntervalMs = options.pollIntervalMs || parseInt(process.env.RAG_POLL_INTERVAL_MS || '15000', 10);
    this.maxPollAttempts = options.maxPollAttempts || parseInt(process.env.RAG_MAX_POLL_ATTEMPTS || '25', 10);
  }

  /**
   * Override sendCompletion to implement polling workflow.
   * @param {Array} payload - Array of message objects
   * @param {Object} opts - Options including onProgress and abortController
   * @returns {string} The final response text
   */
  async sendCompletion(payload, opts = {}) {
    const { onProgress, abortController } = opts;
    const signal = abortController?.signal;

    // Extract the latest user message from payload
    const lastMessage = payload[payload.length - 1];
    const query = typeof lastMessage === 'string'
      ? lastMessage
      : lastMessage?.content || '';

    if (!query) {
      throw new Error('No query found in payload');
    }

    logger.info(`[RAGChatClient] Starting search for query: "${query.substring(0, 100)}..."`);

    // Step 1: Submit search task
    let taskId;
    try {
      const startResponse = await fetch(`${this.ragServerUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          query,
          top_n: 20,
          per_page: 100,
        }),
        signal,
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        throw new Error(`Search request failed: ${startResponse.status} - ${errorText}`);
      }

      const startData = await startResponse.json();
      taskId = startData.task_id;

      if (!taskId) {
        throw new Error('No task_id received from /search endpoint');
      }

      logger.info(`[RAGChatClient] Task created: ${taskId}`);
    } catch (error) {
      logger.error(`[RAGChatClient] Failed to start search: ${error.message}`);
      throw error;
    }

    // Step 2: Poll for results
    let result = null;
    let attempts = 0;

    while (attempts < this.maxPollAttempts) {
      // Check for abort signal
      if (signal?.aborted) {
        logger.info(`[RAGChatClient] Request aborted by user`);
        throw new Error('Request aborted by user');
      }

      // Wait before polling (except first attempt)
      if (attempts > 0) {
        await this.sleep(this.pollIntervalMs);
      }
      attempts++;

      try {
        const statusResponse = await fetch(`${this.ragServerUrl}/tasks/${taskId}`, {
          headers: {
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          signal,
        });

        if (!statusResponse.ok) {
          logger.warn(`[RAGChatClient] Poll attempt ${attempts} failed: ${statusResponse.status}`);
          continue;
        }

        const statusData = await statusResponse.json();
        const status = statusData.status?.toUpperCase();

        logger.info(`[RAGChatClient] Poll ${attempts}/${this.maxPollAttempts}: Status = ${status}`);

        if (status === 'SUCCESS' || status === 'COMPLETED') {
          result = statusData.result;
          break;
        } else if (status === 'FAILURE' || status === 'FAILED' || status === 'ERROR') {
          const errorMsg = statusData.result?.error || statusData.error || 'Unknown error';
          throw new Error(`Search task failed: ${errorMsg}`);
        }
        // If PROCESSING/PENDING, continue polling
      } catch (error) {
        if (error.message === 'Request aborted by user') {
          throw error;
        }
        logger.error(`[RAGChatClient] Poll error: ${error.message}`);
        // Continue polling on transient errors
      }
    }

    // Check if we got a result
    if (!result) {
      throw new Error(`Search timed out after ${attempts} attempts (${(attempts * this.pollIntervalMs) / 1000}s)`);
    }

    // Step 3: Extract and return the answer
    const finalText = result.answer || result.text || JSON.stringify(result);

    logger.info(`[RAGChatClient] Search completed. Answer length: ${finalText.length} chars`);

    // Stream the text to frontend (simulates typing effect)
    if (onProgress) {
      await this.streamTextToFrontend(finalText, onProgress);
    }

    return finalText;
  }

  /**
   * Stream text to frontend with a typing effect.
   * @param {string} text - The text to stream
   * @param {Function} onProgress - Callback for progress updates
   */
  async streamTextToFrontend(text, onProgress) {
    // Split into chunks for typing effect
    const chunkSize = 50;
    let sent = 0;

    while (sent < text.length) {
      const chunk = text.substring(sent, sent + chunkSize);
      onProgress(chunk);
      sent += chunkSize;

      // Small delay for typing effect
      await this.sleep(10);
    }
  }

  /**
   * Sleep utility function.
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RAGChatClient;

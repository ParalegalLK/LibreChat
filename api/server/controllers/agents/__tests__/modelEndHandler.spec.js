jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  emitEvent: jest.fn(),
  createToolExecuteHandler: jest.fn(),
  markSummarizationUsage: (usage) => usage,
}));
jest.mock('~/server/services/Files/Citations', () => ({
  processFileCitations: jest.fn(),
}));
jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  runPreviewFinalize: jest.fn(),
}));
jest.mock('~/server/services/Files/process', () => ({
  saveBase64Image: jest.fn(),
}));

const {
  ModelEndHandler,
  ModelStreamUsageHandler,
  contextualizeModelUsage,
} = require('../callbacks');

const buildGraph = () => ({
  getAgentContext: () => ({
    provider: 'vertexai',
    clientOptions: { model: 'gemini-3.1-flash-lite-preview' },
  }),
});

describe('ModelEndHandler — Vertex thoughtSignature capture (issue #13006 follow-up)', () => {
  it('leaves usage usable when graph context is unavailable', () => {
    const usage = { input_tokens: 10, output_tokens: 5 };

    expect(contextualizeModelUsage(usage, undefined, undefined)).toEqual(usage);
    expect(contextualizeModelUsage(usage, undefined, null)).toEqual(usage);
  });

  it('prefers the actually invoked fallback provider and model', () => {
    const usage = { input_tokens: 10, output_tokens: 5 };
    const result = contextualizeModelUsage(
      usage,
      {
        __invoked_provider: 'anthropic',
        __invoked_model: 'claude-fallback',
      },
      {
        provider: 'bedrock',
        agentId: 'agent-1',
        clientOptions: { model: 'configured-model' },
      },
    );

    expect(result).toEqual({
      ...usage,
      provider: 'anthropic',
      model: 'claude-fallback',
      agentId: 'agent-1',
    });
  });

  it('prefers provider-reported model metadata over the invoked fallback model', () => {
    expect(
      contextualizeModelUsage(
        { input_tokens: 10, output_tokens: 5 },
        { ls_model_name: 'reported-model', __invoked_model: 'fallback-model' },
        { clientOptions: { model: 'configured-model' } },
      ).model,
    ).toBe('reported-model');
  });

  it('maps non-empty signatures onto tool_call_ids in order', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          tool_calls: [
            { id: 'tc_a', name: 'a', args: {} },
            { id: 'tc_b', name: 'b', args: {} },
          ],
          additional_kwargs: { signatures: ['SIG_A', '', 'SIG_B'] },
        },
      },
      { ls_model_name: 'gemini-3.1-flash-lite-preview', user_id: 'u1' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({ tc_a: 'SIG_A', tc_b: 'SIG_B' });
    expect(collectedUsage).toHaveLength(1);
  });

  it('accumulates per-id across multiple model_end events (multi-step tool turn)', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc_step1', name: 'a', args: {} }],
          additional_kwargs: { signatures: ['SIG_step1'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );
    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc_step2', name: 'b', args: {} }],
          additional_kwargs: { signatures: ['SIG_step2'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({
      tc_step1: 'SIG_step1',
      tc_step2: 'SIG_step2',
    });
  });

  it('is a no-op for signatures when collectedThoughtSignatures is null', async () => {
    const collectedUsage = [];
    const handler = new ModelEndHandler(collectedUsage, null);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc1', name: 'a', args: {} }],
          additional_kwargs: { signatures: ['SIG'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedUsage).toHaveLength(1);
  });

  it('does not store anything when signatures field is missing (non-Vertex providers)', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc1', name: 'a', args: {} }],
          additional_kwargs: {},
        },
      },
      { ls_model_name: 'gpt-4', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({});
  });

  it('does not store anything when tool_calls is missing', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          additional_kwargs: { signatures: ['SIG_orphan'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({});
  });

  it('tags the producing agent on collected + emitted usage for per-endpoint pricing', async () => {
    const collectedUsage = [];
    const emitUsage = jest.fn();
    const handler = new ModelEndHandler(collectedUsage, null, emitUsage);
    const graph = {
      getAgentContext: () => ({
        provider: 'openai',
        agentId: 'agent_sub',
        clientOptions: { model: 'gpt-4' },
      }),
    };

    await handler.handle(
      'on_chat_model_end',
      { output: { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
      { ls_model_name: 'gpt-4', run_id: 'r1', user_id: 'u1' },
      graph,
    );

    expect(collectedUsage[0].agentId).toBe('agent_sub');
    expect(collectedUsage[0].provider).toBe('openai');
    expect(collectedUsage[0].model).toBe('gpt-4');
    expect(emitUsage).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agent_sub' }));
  });

  it('leaves usage untagged when the graph context has no agentId (single-endpoint)', async () => {
    const collectedUsage = [];
    const emitUsage = jest.fn();
    const handler = new ModelEndHandler(collectedUsage, null, emitUsage);

    await handler.handle(
      'on_chat_model_end',
      { output: { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
      { ls_model_name: 'gemini-3.1-flash-lite-preview', run_id: 'r1', user_id: 'u1' },
      buildGraph(),
    );

    expect(collectedUsage[0].agentId).toBeUndefined();
    expect(emitUsage).toHaveBeenCalledWith(expect.objectContaining({ agentId: undefined }));
  });

  it('falls back to usage from the terminal stream chunk when model end omits it', async () => {
    const collectedUsage = [];
    const emitUsage = jest.fn();
    const streamUsageByRunId = new Map();
    const streamHandler = new ModelStreamUsageHandler(streamUsageByRunId);
    const endHandler = new ModelEndHandler(collectedUsage, null, emitUsage, streamUsageByRunId);
    const usage = { input_tokens: 890794, output_tokens: 11269, total_tokens: 902063 };
    const metadata = { run_id: 'silva-run', ls_model_name: 'silva' };

    streamHandler.handle('on_chat_model_stream', { chunk: { usage_metadata: usage } }, metadata);
    await endHandler.handle('on_chat_model_end', { output: {} }, metadata, buildGraph());

    expect(collectedUsage).toHaveLength(1);
    expect(collectedUsage[0]).toMatchObject(usage);
    expect(emitUsage).toHaveBeenCalledTimes(1);
    expect(streamUsageByRunId.size).toBe(0);
  });

  it('prefers model-end usage and clears any streamed fallback for the run', async () => {
    const collectedUsage = [];
    const streamUsageByRunId = new Map();
    const streamHandler = new ModelStreamUsageHandler(streamUsageByRunId);
    const endHandler = new ModelEndHandler(collectedUsage, null, null, streamUsageByRunId);
    const metadata = { run_id: 'normal-run', ls_model_name: 'gpt-4' };
    const streamedUsage = { input_tokens: 10, output_tokens: 2, total_tokens: 12 };
    const endUsage = { input_tokens: 11, output_tokens: 3, total_tokens: 14 };

    streamHandler.handle(
      'on_chat_model_stream',
      { chunk: { usage_metadata: streamedUsage } },
      metadata,
    );
    await endHandler.handle(
      'on_chat_model_end',
      { output: { usage_metadata: endUsage } },
      metadata,
      buildGraph(),
    );

    expect(collectedUsage).toHaveLength(1);
    expect(collectedUsage[0]).toMatchObject(endUsage);
    expect(streamUsageByRunId.size).toBe(0);
  });

  it('throws when collectedUsage is not an array (existing contract)', () => {
    expect(() => new ModelEndHandler(null)).toThrow('collectedUsage must be an array');
  });
});

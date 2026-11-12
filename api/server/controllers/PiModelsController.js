const { extractEnvVariable, normalizeEndpointName, parsePiAllowedModels } = require('librechat-data-provider');

/** Only proxy catalogs from administrator-configured, opted-in endpoints. */
module.exports = async function piModelsController(req, res) {
  const endpoint = req.config?.endpoints?.custom?.find(
    (entry) => normalizeEndpointName(entry.name ?? '') === normalizeEndpointName(req.params.endpoint),
  );
  if (endpoint?.piModelPicker !== true) return res.status(404).json({ error: 'Not found' });
  const baseURL = extractEnvVariable(endpoint.baseURL ?? '');
  const apiKey = extractEnvVariable(endpoint.apiKey ?? '');
  if (!/^https?:\/\//.test(baseURL) || !apiKey || /user_provided/i.test(`${baseURL} ${apiKey}`)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const upstream = await fetch(`${baseURL.replace(/\/$/, '')}/pi/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return res.status(502).json({ error: 'Model catalog unavailable' });
    const payload = await upstream.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const allowed = parsePiAllowedModels(extractEnvVariable(endpoint.piAllowedModels ?? ''));
    return res.json({ models: models.filter((model) =>
      model != null && typeof model.provider === 'string' && typeof model.id === 'string' && typeof model.name === 'string' && allowed.has(`${model.provider}/${model.id}`),
    ).slice(0, 500).map(({ provider, id, name, contextWindow, maxTokens, reasoning, thinkingLevels, images }) =>
      ({ provider, id, name, contextWindow, maxTokens, reasoning, thinkingLevels, images })) });
  } catch {
    return res.status(502).json({ error: 'Model catalog unavailable' });
  }
};

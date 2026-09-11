import express from 'express';

const app = express();
app.use(express.json({ limit: '1mb' }));

const port = Number(process.env.PORT || 8787);
const upstreamBase = (process.env.UPSTREAM_FIRECRAWL_URL || 'https://api.firecrawl.dev').replace(/\/+$/, '');
const upstreamKey = process.env.UPSTREAM_FIRECRAWL_KEY || '';
const proxyToken = process.env.PROXY_SHARED_TOKEN || '';
const upstreamTimeoutMs = Number(process.env.FIRECRAWL_UPSTREAM_TIMEOUT_MS || 30000);
const logLevel = String(process.env.FIRECRAWL_PROXY_LOG_LEVEL || 'info').toLowerCase();
const logRequests = asBool(process.env.FIRECRAWL_PROXY_LOG_REQUESTS, true);
const allowlist = (process.env.ALLOWLIST_DOMAINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const logRank = {
  off: 0,
  error: 1,
  info: 2,
  debug: 3,
};

function asBool(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function canLog(level) {
  const configured = logRank[logLevel] ?? logRank.info;
  const required = logRank[level] ?? logRank.info;
  return configured >= required;
}

function logInfo(...args) {
  if (canLog('info')) {
    console.log(...args);
  }
}

function logError(...args) {
  if (canLog('error')) {
    console.error(...args);
  }
}

function logDebug(...args) {
  if (canLog('debug')) {
    console.log(...args);
  }
}

const disableUpstreamCache = asBool(process.env.FIRECRAWL_DISABLE_CACHE, true);
const enforceZeroDataRetention = asBool(process.env.FIRECRAWL_ENFORCE_ZDR, false);

app.use((req, _res, next) => {
  if (logRequests) {
    logDebug(`[proxy] ${req.method} ${req.originalUrl}`);
  }
  next();
});

function isAllowedHost(host) {
  return allowlist.some((rule) =>
    rule.startsWith('*.')
      ? host === rule.slice(2) || host.endsWith(`.${rule.slice(2)}`)
      : host === rule,
  );
}

function hasRequiredConfig() {
  return Boolean(upstreamKey && proxyToken && allowlist.length > 0);
}

app.get('/healthz', (_req, res) => {
  if (!hasRequiredConfig()) {
    return res.status(500).json({
      ok: false,
      error: 'Missing UPSTREAM_FIRECRAWL_KEY, PROXY_SHARED_TOKEN, or ALLOWLIST_DOMAINS',
    });
  }
  return res.json({ ok: true });
});

app.post('/:version/scrape', async (req, res) => {
  if (req.header('authorization') !== `Bearer ${proxyToken}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!hasRequiredConfig()) {
    return res.status(500).json({ success: false, error: 'Proxy not fully configured' });
  }

  const version = req.params.version;
  if (!['v1', 'v2'].includes(version)) {
    return res.status(404).json({ success: false, error: 'Unsupported Firecrawl version' });
  }

  const target = req.body?.url;
  if (!target) {
    logInfo('[proxy] REJECTED: missing url');
    return res.status(400).json({ success: false, error: 'Missing url' });
  }

  let host;
  try {
    const u = new URL(target);
    if (!['http:', 'https:'].includes(u.protocol)) {
      throw new Error('invalid protocol');
    }
    host = u.hostname.toLowerCase();
  } catch {
    logInfo(`[proxy] REJECTED: invalid url "${String(target)}"`);
    return res.status(400).json({ success: false, error: 'Invalid target URL' });
  }

  logInfo(`[proxy] scrape requested: ${target}`);

  if (!isAllowedHost(host)) {
    logInfo(`[proxy] BLOCKED: ${host}`);
    return res.status(403).json({ success: false, error: `Domain not allowlisted: ${host}` });
  }
  logInfo(`[proxy] ALLOWED: ${host}`);

  try {
    const upstreamPayload = {
      ...req.body,
    };
    if (disableUpstreamCache) {
      upstreamPayload.storeInCache = false;
    }
    if (enforceZeroDataRetention) {
      upstreamPayload.zeroDataRetention = true;
    }

    const upstream = await fetch(`${upstreamBase}/${version}/scrape`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${upstreamKey}`,
      },
      body: JSON.stringify(upstreamPayload),
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });

    const text = await upstream.text();
    logInfo(`[proxy] upstream status: ${upstream.status}`);
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) {
      res.setHeader('content-type', ct);
    }
    return res.send(text);
  } catch (e) {
    logError('[proxy] upstream request failed', e);
    return res.status(502).json({ success: false, error: `Upstream error: ${String(e)}` });
  }
});

app.listen(port, () => {
  logInfo(
    `[proxy] config: cache_disabled=${disableUpstreamCache} zdr_enforced=${enforceZeroDataRetention} timeout_ms=${upstreamTimeoutMs}`,
  );
  logInfo(
    `[proxy] config: log_level=${logLevel} log_requests=${logRequests}`,
  );
  logInfo(`firecrawl-allowlist-proxy listening on :${port}`);
});

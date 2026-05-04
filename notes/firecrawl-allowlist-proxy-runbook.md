# Firecrawl Allowlist Proxy Runbook (LibreChat)

Last updated: 2026-04-27

## 1) Goal

Enforce domain restrictions for LibreChat `web_search` scraping by routing Firecrawl traffic through an allowlist proxy.

## 2) Architecture

```text
LibreChat web_search
  -> Search provider (Serper/SearXNG)
  -> Scraper (Firecrawl via local proxy)
       - Allowlist decision (ALLOW/BLOCK)
       - Forward allowed requests to Firecrawl upstream
  -> Reranker (Jina/Cohere)
```

Important: this proxy enforces the **scraper layer**. Search providers can still return off-domain links; blocked links are prevented from scraping.

## 3) Files Added/Changed

- `firecrawl-allowlist-proxy/server.js`
- `firecrawl-allowlist-proxy/package.json`
- `firecrawl-allowlist-proxy/Dockerfile`
- `docker-compose.override.yml`
- `librechat.yaml`
- `.env`

## 4) Current Required Env Vars

Set in `.env` (use your own values):

```bash
# LibreChat -> Proxy auth (shared token)
FIRECRAWL_API_KEY=<proxy_shared_token>
FIRECRAWL_API_URL=http://firecrawl-allowlist-proxy:8787
FIRECRAWL_VERSION=v2

# Proxy -> Firecrawl upstream
UPSTREAM_FIRECRAWL_KEY=<real_firecrawl_api_key>
UPSTREAM_FIRECRAWL_URL=https://api.firecrawl.dev
PROXY_SHARED_TOKEN=<same_as_FIRECRAWL_API_KEY>

# Domain policy
ALLOWLIST_DOMAINS=*.gov.lk,*.parliament.lk,*.lawnet.gov.lk,*.supremecourt.lk,*.courtofappeal.lk,*.judicial.lk,*.humanrights.lk,*.basl.lk

# Proxy behavior policy
FIRECRAWL_DISABLE_CACHE=true
FIRECRAWL_ENFORCE_ZDR=false
FIRECRAWL_UPSTREAM_TIMEOUT_MS=30000
FIRECRAWL_PROXY_LOG_LEVEL=info
FIRECRAWL_PROXY_LOG_REQUESTS=true
```

## 5) `librechat.yaml` Web Search Block

```yaml
webSearch:
  serperApiKey: "${SERPER_API_KEY}"
  firecrawlApiKey: "${FIRECRAWL_API_KEY}"
  firecrawlApiUrl: "${FIRECRAWL_API_URL}"
  firecrawlVersion: "${FIRECRAWL_VERSION}"
  jinaApiKey: "${JINA_API_KEY}"
  searchProvider: "serper"
  scraperProvider: "firecrawl"
  rerankerType: "jina"
  safeSearch: 1
```

## 6) Docker Compose Wiring

`docker-compose.override.yml` includes:

- `api.depends_on` includes `firecrawl-allowlist-proxy`
- `firecrawl-allowlist-proxy` service with `env_file: .env`

Bring up service:

```bash
docker compose up -d --build firecrawl-allowlist-proxy
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

## 7) Why 403 Happened and Fix

Observed behavior:

- Upstream `403` was caused by forcing `zeroDataRetention: true`.
- Free Firecrawl keys may not have ZDR enabled.

Verified behavior:

- Without ZDR: upstream returns `200`.
- With ZDR: upstream returns `403` with ZDR-not-enabled message.

Fix implemented:

- Proxy now makes ZDR optional via `FIRECRAWL_ENFORCE_ZDR`.
- Default set to `false` for compatibility.

## 8) Proxy Status Code Interpretation

- `200`: scrape success.
- `401` from proxy: bad/mismatched `FIRECRAWL_API_KEY` vs `PROXY_SHARED_TOKEN`.
- `403` from proxy with `Domain not allowlisted`: domain blocked by policy.
- `403` from upstream (in logs as `upstream status: 403`): upstream policy/feature restriction (for example ZDR on unsupported plan).
- `402` upstream: insufficient Firecrawl credits.
- `408` upstream: upstream timeout.
- `502` from proxy: upstream/network failure.

## 9) Proxy Logging Controls

Use env vars to control proxy logs without changing code:

```bash
FIRECRAWL_PROXY_LOG_LEVEL=info   # off | error | info | debug
FIRECRAWL_PROXY_LOG_REQUESTS=true
```

Recommended presets:

- Quiet production:

```bash
FIRECRAWL_PROXY_LOG_LEVEL=error
FIRECRAWL_PROXY_LOG_REQUESTS=false
```

- Normal operations:

```bash
FIRECRAWL_PROXY_LOG_LEVEL=info
FIRECRAWL_PROXY_LOG_REQUESTS=true
```

- Deep debugging:

```bash
FIRECRAWL_PROXY_LOG_LEVEL=debug
FIRECRAWL_PROXY_LOG_REQUESTS=true
```

Apply any logging change:

```bash
docker compose up -d --build firecrawl-allowlist-proxy
```

## 10) Verification Checklist

### A) Service health

```bash
docker compose ps
docker compose logs --tail 30 firecrawl-allowlist-proxy
```

Expected startup line:

```text
[proxy] config: cache_disabled=true zdr_enforced=false timeout_ms=30000
```

### B) Confirm active env in running proxy

```bash
docker compose exec firecrawl-allowlist-proxy printenv ALLOWLIST_DOMAINS
docker compose exec firecrawl-allowlist-proxy printenv FIRECRAWL_ENFORCE_ZDR
```

### C) Live scrape probe through proxy

```bash
docker compose exec api sh -lc '
TOKEN=$(awk -F= "/^FIRECRAWL_API_KEY=/{print \$2; exit}" /app/.env)
TOKEN="$TOKEN" node -e "fetch(\"http://firecrawl-allowlist-proxy:8787/v2/scrape\",{method:\"POST\",headers:{\"content-type\":\"application/json\",authorization:\"Bearer \"+process.env.TOKEN},body:JSON.stringify({url:\"https://www.ird.gov.lk/en/\",formats:[\"markdown\",\"rawHtml\"]})}).then(async r=>{console.log(r.status);console.log((await r.text()).slice(0,220))})"
'
```

### D) Runtime policy evidence

```bash
docker compose logs -f firecrawl-allowlist-proxy
```

You should see `ALLOWED` and `BLOCKED` decisions for each URL.

## 11) Verifying Web Search Response Correctness

For high-confidence answers, verify at 3 levels:

1. **Pipeline**: proxy logs show relevant trusted URLs as `ALLOWED` and `upstream status: 200`.
2. **Citation/domain**: cited URLs are within allowlist policy.
3. **Claim validation**: key legal/tax claims are traceable to those sources (with quote + date).

## 12) Security Notes

- Keep secrets only in `.env`, never in docs/commits.
- Rotate any key/token that has been exposed in terminal logs/chats.
- Keep `PROXY_SHARED_TOKEN` and `UPSTREAM_FIRECRAWL_KEY` separate.
- Use least-privilege allowlist domains.
- Keep ZDR disabled unless upstream explicitly enables it for your team.

## 13) Operational Notes

- `UID/GID` warnings in compose logs are unrelated to scraping behavior.
- If config changes do not apply, rebuild/recreate proxy image:

```bash
docker compose up -d --build firecrawl-allowlist-proxy
```

- If only env changed and code unchanged:

```bash
docker compose up -d --force-recreate firecrawl-allowlist-proxy
```

## 14) Optional Strict Compliance Mode

If your Firecrawl plan supports ZDR and compliance requires it:

```bash
FIRECRAWL_ENFORCE_ZDR=true
```

Then rebuild/restart proxy and confirm upstream remains `200`.

## 15) Stop or Remove the Proxy

### A) Stop only (temporary)

Use this if you only want to pause proxy traffic.

```bash
docker compose stop firecrawl-allowlist-proxy
```

Note: if `FIRECRAWL_API_URL` still points to `http://firecrawl-allowlist-proxy:8787`, web scraping through LibreChat will fail while proxy is stopped.

### B) Remove proxy but keep LibreChat web search working (recommended rollback)

1. Update `.env` to direct Firecrawl usage:

```bash
# Use real Firecrawl key directly
FIRECRAWL_API_KEY=<real_firecrawl_api_key>
FIRECRAWL_API_URL=https://api.firecrawl.dev
FIRECRAWL_VERSION=v2
```

2. Remove proxy-only env vars (optional cleanup):

```bash
# Optional cleanup
# UPSTREAM_FIRECRAWL_KEY=...
# PROXY_SHARED_TOKEN=...
# FIRECRAWL_DISABLE_CACHE=...
# FIRECRAWL_ENFORCE_ZDR=...
# FIRECRAWL_UPSTREAM_TIMEOUT_MS=...
# ALLOWLIST_DOMAINS=...
```

3. Remove proxy service references from `docker-compose.override.yml`:

- remove `firecrawl-allowlist-proxy` from `api.depends_on`
- remove the `firecrawl-allowlist-proxy:` service block

4. Apply config:

```bash
docker compose up -d --build api
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

5. Remove proxy container/resources:

```bash
docker compose stop firecrawl-allowlist-proxy
docker compose rm -f firecrawl-allowlist-proxy
```

6. Optional filesystem cleanup:

```bash
rm -rf firecrawl-allowlist-proxy
```

### C) Remove everything proxy-related (hard cleanup)

Do steps in **B**, then also remove any proxy-specific notes/docs references if not needed.

### D) Verify proxy is fully removed

```bash
docker compose ps
docker compose config | rg -n "firecrawl-allowlist-proxy|UPSTREAM_FIRECRAWL_KEY|PROXY_SHARED_TOKEN"
```

Expected:

- no `firecrawl-allowlist-proxy` service in running containers
- no proxy-only env keys in resolved compose config

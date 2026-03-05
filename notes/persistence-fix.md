# Persistence and Deployment Fix Notes (`desaram-ai-prod`)

## Goal

Keep all desaram-specific behavior persistent by building and deploying from `desaram-ai-prod` image tags in GHCR, not upstream `latest`.

## Issues Encountered

1. Upstream image usage reintroduced upstream defaults.
2. GHCR rejected image tags when owner/repo path was not lowercase.
3. Workflow did not always trigger on lockfile-only changes.
4. `npm ci` failed when `package-lock.json` and manifests were out of sync.
5. White-screen runtime failure in browser:
   - `Cannot read properties of undefined (reading 'crypto')`
6. Some stale hashed asset paths were being served as SPA HTML fallback.

## Fixes Applied

1. Branch image workflow is in place:
   - `.github/workflows/desaram-ai-prod-images.yml`
2. GHCR tags standardized:
   - `ghcr.io/paralegallk/librechat-desaram-ai-prod:<sha>`
   - `ghcr.io/paralegallk/librechat-desaram-ai-prod:latest`
3. Workflow now uses lowercase owner path for GHCR tags.
4. Workflow trigger paths include lock/manifests so rebuilds are not skipped.
5. Lockfile mismatch fixed by regenerating `package-lock.json` and committing it.
6. API static fallback hardened:
   - `api/server/index.js` now returns `404` for missing asset-like paths instead of returning `index.html`.
7. PWA stayed enabled, but runtime globals were stabilized:
   - `client/src/polyfills/runtime-globals.js`
   - imported first in `client/src/main.jsx`
   - commit: `28094e0e2`
8. PWA build toggle remains optional (default enabled):
   - Docker build arg `DISABLE_PWA` supported, default `false`.
9. Branding text updates:
   - `.env`: `CUSTOM_FOOTER="desaram.ai | powered by paralegal.lk"` (runtime/local only, not pushed)
   - `client/index.html` meta description updated and pushed (`fe724dddc`).

## Critical Build Notes

1. `.env` is excluded by `.dockerignore`, so env flags there do not affect Docker image build steps.
2. `VITE_DISABLE_PWA=true ` (with trailing space) is not equal to `true`; trim/fix if using env toggles.
3. Long `npm ci` and frontend build times on ARM64 are expected.

## Runtime Config

`docker-compose.override.yml`:

```yaml
services:
  api:
    image: ${API_IMAGE:-ghcr.io/paralegallk/librechat-desaram-ai-prod:latest}
```

## Build and Deploy Commands

```bash
docker buildx build \
  --platform linux/arm64 \
  --target node \
  -f Dockerfile \
  -t ghcr.io/paralegallk/librechat-desaram-ai-prod:latest \
  -t ghcr.io/paralegallk/librechat-desaram-ai-prod:$(git rev-parse --short HEAD) \
  --push .

docker compose pull api
docker compose up -d api
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

## Post-Deploy Validation

```bash
docker compose exec -T api node -e "const http=require('http');http.get('http://127.0.0.1:3080/',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log((d.match(/<title>[\\s\\S]*?<\\/title>/i)||['NONE'])[0]));});"
docker compose exec -T api node -e "const http=require('http');http.get('http://127.0.0.1:3080/api/config',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{const j=JSON.parse(d);console.log(j.appTitle);console.log(j.customFooter);});});"
```

Expected:
- `<title>desaram.ai</title>`
- `appTitle` = `desaram.ai`
- `customFooter` = `desaram.ai | powered by paralegal.lk`

If browser still shows white screen after deploy:
1. DevTools -> Application -> Service Workers -> Unregister.
2. DevTools -> Application -> Clear storage -> Clear site data.
3. Hard refresh (`Ctrl+Shift+R`).

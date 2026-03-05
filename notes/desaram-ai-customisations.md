# desaram.ai Customisations Log

This document tracks customisations applied in this LibreChat deployment, including what is persistent in repo/config vs. what was applied as runtime hotfixes.

## 1) Branding and Title

### 1.1 App title
- `.env`
  - `APP_TITLE=desaram.ai`
- Code-level fallback logic added (committed) to avoid `LibreChat` title flash:
  - `api/server/index.js`
  - `api/server/routes/config.js`
  - `client/src/App.jsx`
  - `client/src/hooks/Config/useAppStartup.ts`
  - `client/src/hooks/useNewConvo.ts`
  - `client/src/routes/Layouts/Startup.tsx`
  - `client/index.html`
  - `client/vite.config.ts`
- Detailed implementation notes:
  - `notes/app-title-fix.md`

### 1.2 Footer
- Decision: use `.env` `CUSTOM_FOOTER` approach (not hardcoded in source).
- `client/src/components/Chat/Footer.tsx` code edit was reverted.

## 2) Endpoint Visibility and Model Selector

### 2.1 Hide My Agents / Assistants from selector
- `.env`
  - `ENDPOINTS=openAI,anthropic,google,custom`
- Result: selector only shows OpenAI/Anthropic/Google/custom endpoints.

### 2.2 Model lists from env
- `.env`
  - `OPENAI_MODELS=gpt-5.1,o3,gpt-4.1,gpt-4o,gpt-4o-mini`
  - `ANTHROPIC_MODELS=claude-opus-4-6,claude-sonnet-4-6`
  - `GOOGLE_MODELS=gemini-3.1-pro-preview,gemini-3-flash-preview,gemini-3.1-flash-lite-preview`
- `modelSpecs` block was temporarily added then removed to avoid duplicate dropdown entries.

## 3) Custom Endpoints (Legal Agents)

Current `librechat.yaml` custom endpoint state:

### 3.1 `paralegal.lk`
- `name: "paralegal.lk"`
- `baseURL: "https://www.chat.paralegal.lk/talkapi/v1"`
- `models.default: ["junior-silva-01"]`
- `modelDisplayLabel: "Junior Silva"`

### 3.2 `De Saram AI`
- Renamed from `dl-f-de-saram-chat` to `De Saram AI`
- `baseURL: "https://www.dlft.paralegal.lk/talkapi/v1"`
- `models.default: ["junior-de-saram-01"]`
- `modelDisplayLabel: "Junior De Saram"`
- `iconURL: "/images/dsai-legal.jpeg"`

### 3.3 File handling behavior for custom endpoints
- `fileConfig.endpoints` in `librechat.yaml`:
  - `paralegal.lk: disabled: true`
  - `De Saram AI: disabled: true`
- This prevents file upload/search UI for these two custom endpoints.

## 4) Icons and Assets

### 4.1 Endpoint icon assets
- `images/dsai-legal.jpeg` added and used for `De Saram AI` endpoint icon.
- `images/minion-legal.png` was used earlier for testing and replaced by `dsai-legal.jpeg` in config.

### 4.2 Browser/app icon set generated from `desaram-ai.png`
- Source: `client/public/assets/desaram-ai.png`
- Generated/replaced files:
  - `client/public/assets/favicon-16x16.png`
  - `client/public/assets/favicon-32x32.png`
  - `client/public/assets/apple-touch-icon-180x180.png`
  - `client/public/assets/icon-192x192.png`
  - `client/public/assets/maskable-icon.png`

### 4.3 Login logo
- `client/src/components/Auth/AuthLayout.tsx`
  - reverted to `assets/logo.svg` (no hardcoded custom image path).
- `client/public/assets/logo.svg`
  - replaced with branded `desaram-ai.svg` content.

## 5) RAG and OCR

### 5.1 OCR config
- `librechat.yaml`
  - `ocr.strategy: mistral_ocr`
  - `ocr.apiKey: "${MISTRAL_API_KEY}"`
  - `ocr.baseURL: "https://api.mistral.ai/v1"`
  - `ocr.mistralModel: mistral-ocr-latest`
- `.env`
  - `MISTRAL_API_KEY` set.

### 5.2 RAG config
- `.env`
  - `RAG_API_KEY` set
  - `RAG_OPENAI_API_KEY` set
  - `RAG_USE_FULL_CONTEXT=True` set
  - `EMBEDDINGS_PROVIDER=openai` set
  - `EMBEDDINGS_MODEL=text-embedding-3-small` set
- Operational note:
  - Environment changes for `rag_api` required `docker compose up -d --force-recreate rag_api api` (plain restart did not reload updated env in container).

### 5.3 Health validation performed
- `api` log confirmed: `RAG API is running and reachable at http://rag_api:8000`
- `rag_api` log confirmed embeddings initialized (`OpenAIEmbeddings`).
- Direct probe from `api` to `rag_api` returned `401` (expected protected endpoint, confirms reachability).

## 6) Docker Compose / Runtime behavior

### 6.1 `librechat.yaml` mount
- `docker-compose.override.yml` updated to mount config into API container:
  - `./librechat.yaml:/app/librechat.yaml`
- This fixed prior `ENOENT /app/librechat.yaml` issue.

### 6.2 Persistent branding asset mount
- `docker-compose.override.yml` updated to mount local assets into served dist assets:
  - `./client/public/assets:/app/client/dist/assets`
- This makes logo/favicon/app-icon customisations persistent across container recreate/restart.
- Without this mount, runtime `docker cp` changes to `/app/client/dist/assets` are lost on recreate.

### 6.2.1 Incident: white-screen regression from full `dist/assets` bind mount
- Symptom: browser rendered a white screen after deploy/recreate.
- Root cause: mounting `./client/public/assets` to `/app/client/dist/assets` hides built JS/CSS bundles in `dist/assets`, not just icons.
- Fix applied: removed this mount from `docker-compose.override.yml` and recreated `api`.
- Result: app JS bundles became visible again under `/app/client/dist/assets`, UI recovered.
- Recommendation: do **not** mount an entire folder onto `/app/client/dist/assets`; use targeted file mounts or rebuild image with desired assets baked in.

### 6.3 Branch image deployment (current)
- Production branch now deploys from GHCR image built from `desaram-ai-prod`:
  - `ghcr.io/paralegallk/librechat-desaram-ai-prod:latest`
- This avoids upstream image drift and keeps desaram fixes persistent.

### 6.4 Asset fallback and PWA runtime hardening
- `api/server/index.js` adjusted so missing hashed assets return `404` (not SPA HTML fallback).
- PWA remains enabled, with runtime globals shim added to prevent browser `undefined.crypto` crashes:
  - `client/src/polyfills/runtime-globals.js`
  - imported in `client/src/main.jsx`
- Service worker cache reset may still be required once after deploy.

## 7) Runtime Hotfixes (Non-Persistent)

These were applied directly inside running containers and are not durable across recreate/pull:
- Replacing live logo/favicon files under `/app/client/dist/assets/*`.
- Any direct `docker cp` asset patching into container filesystem.

Treat these as temporary; persistent behavior should come from repo files + compose mounts + image rebuilds.

## 8) Related commits already created

- `540539e25` - `fix: prevent LibreChat title flash with desaram.ai fallback`
- `4b4cef3c7` - `docs: update AGENTS.md instructions`
- `8df7b15da` - `docs: add deploy checklist for app-title-fix`
- `15188ca91` - `fix: return 404 for missing static asset requests`
- `15d54a3f2` - `fix: keep PWA enabled with safer workbox updates and stable vendor init`
- `28094e0e2` - `fix(pwa): bootstrap global crypto/runtime shims before app load`
- `fe724dddc` - `brand: update desaram meta description`

## 9) Current operational reminders

- After `.env` / `librechat.yaml` changes:
  - `docker compose exec librechat-redis redis-cli FLUSHALL`
  - `docker compose restart api`
- After changing env meant for `rag_api`:
  - `docker compose up -d --force-recreate rag_api api`
- Browser validation should use hard refresh/private window due aggressive favicon/app-shell caching.

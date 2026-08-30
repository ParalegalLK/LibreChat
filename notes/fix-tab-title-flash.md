# Fix: Browser Tab Title Flashing "LibreChat" on Reload

## Problem
When reloading or opening chat.paralegal.lk in a new tab, the browser tab briefly flashes "LibreChat" before showing the correct title "chat.paralegal.lk".

## Root Cause
Multiple places hardcode "LibreChat" as a fallback title. During page load, the browser picks these up before the app config (APP_TITLE) is fetched and applied.

## Files Changed

### 1. `client/index.html` (line 11)
**Static HTML title** — first thing the browser displays.
```html
<!-- Before -->
<title>paralegal.lk</title>

<!-- After -->
<title>chat.paralegal.lk</title>
```

### 2. `client/src/routes/Layouts/Startup.tsx` (line 41)
**React fallback** — sets document.title before startup config loads on auth pages.
```typescript
// Before
document.title = startupConfig?.appTitle || 'LibreChat';

// After
document.title = startupConfig?.appTitle || 'chat.paralegal.lk';
```

### 3. `client/vite.config.ts` (lines 61-62)
**PWA manifest** — browser reads this on load and can use it as the tab title.
```typescript
// Before
name: 'LibreChat',
short_name: 'LibreChat',

// After
name: 'chat.paralegal.lk',
short_name: 'chat.paralegal.lk',
```

## In-Container Hotfix (Temporary)
These changes were also applied directly inside the running container for immediate effect (lost on rebuild):

```bash
# Fix HTML title
docker compose exec -T api sed -i 's|<title>paralegal.lk</title>|<title>chat.paralegal.lk</title>|' /app/client/dist/index.html

# Fix JS fallbacks
docker compose exec -T api sed -i 's/.appTitle)||"LibreChat"/.appTitle)||"chat.paralegal.lk"/g' /app/client/dist/assets/index.*.js
docker compose exec -T api sed -i 's/.appTitle)??"LibreChat"/.appTitle)??"chat.paralegal.lk"/g' /app/client/dist/assets/index.*.js

# Fix PWA manifest
docker compose exec -T api sed -i 's/"name":"LibreChat"/"name":"chat.paralegal.lk"/; s/"short_name":"LibreChat"/"short_name":"chat.paralegal.lk"/' /app/client/dist/manifest.webmanifest

# Flush cache and restart
docker compose exec -T librechat-redis redis-cli FLUSHALL
docker compose restart api
```

## To Persist
Rebuild the Docker image so the source changes are compiled into the production build:
```bash
./scripts/pre-build-cleanup.sh --build
```

## Note on Upstream Merges
These changes will likely conflict when merging upstream updates. The files to watch are:
- `client/index.html`
- `client/src/routes/Layouts/Startup.tsx`
- `client/vite.config.ts`

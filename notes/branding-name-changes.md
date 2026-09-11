# Branding Name Changes

## Commit
- Hash: `fd0f7bcc5bdcde3d28bd112befc2b44b0f81d464`
- Message: `feat: update app_title configuration`
- Date: `2026-04-28`

## Summary
This change standardizes app title branding so the UI and manifest no longer fall back to `LibreChat` when a custom brand title is expected.
Current setup intentionally splits branding:
- Runtime webpage title comes from `.env` `APP_TITLE`.
- PWA manifest `name`/`short_name` are fixed to `chat.paralegal.lk` in `client/vite.config.ts`.

## Branding Configuration (.env)
Primary branding value is controlled in the repo root `.env` file and overrides Vite fallback:

```bash
APP_TITLE=devchat.paralegal.lk
```

Where to change it:
- File: `.env` (project root)
- Key: `APP_TITLE`
- Priority: if `APP_TITLE` is set, that exact value is used for runtime webpage title.

To use fallback from `vite.config.ts` (`chat.paralegal.lk`), unset `APP_TITLE` or set it directly to `chat.paralegal.lk`.

After changing:
1. Rebuild/restart services so backend and frontend pick up the new value.
2. Hard refresh browser (`Ctrl+Shift+R`).
3. Reinstall the PWA if manifest name/short_name needs to update on installed app.

## What Changed
- `api/server/index.js`
  - Added app title normalization and HTML escaping.
  - Replaces the `<title>` tag in server-rendered `index.html` with the effective app title.
- `api/server/routes/config.js`
  - Added `getAppTitle()` and changed startup payload to use it.
  - `appTitle` now uses normalized branding title instead of direct fallback to `LibreChat`.
- `client/index.html`
  - Updated static defaults:
    - description: `chat.paralegal.lk - where legal work happens`
    - title: `chat.paralegal.lk`
- `client/src/App.jsx`
  - Added a runtime guard that resets title if it becomes `LibreChat`.
  - Uses current title or hostname as fallback.
  - Watches `<title>` mutations to keep branding consistent.
- `client/src/routes/Layouts/Startup.tsx`
  - Removed hard fallback `LibreChat`; now only sets title when `startupConfig.appTitle` exists.
- `client/vite.config.ts`
  - Added normalized app title logic and HTML escaping.
  - Injects app title into `index.html` at build/dev time.
  - PWA manifest `name` and `short_name` are now fixed to `chat.paralegal.lk`.

## Effective Branding Behavior
- If `APP_TITLE` is set to a non-empty value other than `LibreChat`, that value is used.
- If `APP_TITLE` is empty or `LibreChat`, fallback title is used:
  - Server/runtime default: `chat.paralegal.lk`
  - Vite/frontend default: `chat.paralegal.lk`
- Current environment note:
  - With `APP_TITLE=devchat.paralegal.lk`, webpage title is `devchat.paralegal.lk`.
  - PWA manifest name/short_name remain `chat.paralegal.lk` (hardcoded in build config).

## Mobile PWA Icon Branding Update
- `client/public/assets/maskable-icon.png` was replaced with the paralegal.lk branded logo.
- Mobile Chrome install now uses the branded `maskable-icon.png` for the app icon.
- If an old icon still appears on a device, uninstall the PWA, clear site data/service worker, and reinstall.

## PWA Logo Source Of Truth (Desktop + Mobile)
To update installed PWA branding logos, both manifest config and image assets must match.

Where to configure:
- Manifest icon paths: `client/vite.config.ts` (`VitePWA -> manifest -> icons`)
- Icon image files: `client/public/assets/*`

Minimum icon files to keep branded:
- `client/public/assets/favicon-16x16.png`
- `client/public/assets/favicon-32x32.png`
- `client/public/assets/icon-192x192.png`
- `client/public/assets/maskable-icon.png`

Recommended additional file:
- `client/public/assets/icon-512x512.png` (non-maskable high-resolution app icon)

Operational note:
- PWA icon updates are build-time static and require rebuild/redeploy.
- A new phone install showed the correct updated logo, confirming server build is correct.
- If an existing phone still shows old icon, it is usually local WebAPK/launcher cache state.

## Manual PWA Manifest Patch (Running Container)
Legacy hotfix for older builds only. If this repository state is deployed, this patch should not be needed because default fallback is now `chat.paralegal.lk`.

### Patch Target
- `name`: `devchat.paralegal.lk` -> `chat.paralegal.lk`
- `short_name`: `devchat.paralegal.lk` -> `chat.paralegal.lk`

### 1) Check Current Manifest Values
```bash
docker compose exec api sh -lc "grep -E '\"name\"|\"short_name\"' /app/client/dist/manifest.webmanifest"
```

### 2) Backup and Patch
```bash
docker compose exec api sh -lc '
cp /app/client/dist/manifest.webmanifest /app/client/dist/manifest.webmanifest.bak
sed -i -E "s/\"name\":\"devchat\\.paralegal\\.lk\"/\"name\":\"chat.paralegal.lk\"/; s/\"short_name\":\"devchat\\.paralegal\\.lk\"/\"short_name\":\"chat.paralegal.lk\"/" /app/client/dist/manifest.webmanifest
'
```

### 3) Verify Patch
```bash
docker compose exec api sh -lc "cat /app/client/dist/manifest.webmanifest"
```

Expected values:
- `"name":"chat.paralegal.lk"`
- `"short_name":"chat.paralegal.lk"`

### 4) Refresh PWA in Browser
1. Uninstall/remove the currently installed PWA.
2. Hard refresh browser (`Ctrl+Shift+R`) or clear site data/service worker.
3. Reinstall the PWA.

### 5) Rollback (If Needed)
```bash
docker compose exec api sh -lc '
cp /app/client/dist/manifest.webmanifest.bak /app/client/dist/manifest.webmanifest
cat /app/client/dist/manifest.webmanifest
'
```

### Notes
- This patch is temporary and will be overwritten by rebuild/redeploy/container replacement.
- Permanent behavior:
  - Runtime webpage title depends on `.env` `APP_TITLE`.
  - PWA manifest name/short_name are controlled in `client/vite.config.ts` and require rebuild to change.

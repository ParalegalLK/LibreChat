# App Title Flash Fix (`LibreChat` -> `desaram.ai`)

## Symptom

Browser tab briefly shows `LibreChat` during startup/login, then changes back to `desaram.ai`.

## Root Causes

1. Initial HTML title can come from prebuilt `client/dist/index.html` before React mounts.
2. Startup config default (`/api/config`) can emit `LibreChat` if not normalized.
3. A late client-side title mutation can still temporarily set `LibreChat`.
4. Running `api` from a prebuilt upstream image ignores local source fixes unless you rebuild/use a local image.

## Permanent Code Changes

### 1) Normalize server-served HTML `<title>`

File: `api/server/index.js`

- Add effective app title fallback:
  - `APP_TITLE` if non-empty and not `LibreChat`
  - else `desaram.ai`
- HTML-escape that value.
- Replace `<title>...</title>` in loaded `indexHTML` with effective title before SPA fallback responses.

Result: first paint tab title is `desaram.ai`.

### 2) Normalize startup config `appTitle`

File: `api/server/routes/config.js`

- Replace `appTitle: process.env.APP_TITLE || 'LibreChat'` with the same normalized fallback logic:
  - non-empty, non-`LibreChat` `APP_TITLE`
  - else `desaram.ai`

Result: client startup/title effects never receive `LibreChat` default.

### 3) Guard against transient late title writes

File: `client/src/App.jsx`

- Add a small `useEffect` with `MutationObserver` on `<title>`:
  - if title becomes `LibreChat` (case-insensitive trim), immediately reset to `desaram.ai`.

Result: blocks one-frame flashes caused by late or hidden title writes.

## Deployment/Runtime Changes

### 4) Use local image build (recommended)

File: `docker-compose.override.yml`

- Override `api` service to build from local repo:
  - `image: librechat-local:dev`
  - `build.context: .`
  - `build.dockerfile: Dockerfile`

Then:

```bash
docker compose up -d --build api
```

Why: ensures running container includes your local code fixes.

### 5) Fix lockfile mismatch before local build

If Docker build fails at `npm ci` with lockfile sync errors:

```bash
npm install
```

Commit updated `package-lock.json`, then rebuild:

```bash
docker compose up -d --build api
```

Without this, Compose may keep running upstream `latest` image, reintroducing title issues.

## Temporary Emergency Hotfix (if rebuild blocked)

Patch running container `dist/index.html`:

1. Ensure `<title>desaram.ai</title>`.
2. Inject early `app-title-guard` script after `</title>`.
3. Restart `api`.

Example:

```bash
docker compose exec -T api node -e "const fs=require('fs');const p='/app/client/dist/index.html';let h=fs.readFileSync(p,'utf8');h=h.replace('<title>LibreChat</title>','<title>desaram.ai</title>');if(!h.includes('app-title-guard')){const g='<script id=\"app-title-guard\">(()=>{const t=\"desaram.ai\";const n=()=>{if((document.title||\"\").trim().toLowerCase()===\"librechat\"){document.title=t;}};n();const o=new MutationObserver(n);const s=()=>{const e=document.querySelector(\"title\");if(!e){requestAnimationFrame(s);return;}o.observe(e,{childList:true,characterData:true,subtree:true});};s();})();</script>';h=h.replace(/<\\/title>/i,'</title>'+g);}fs.writeFileSync(p,h);"
docker compose restart api
```

Warning: this is not persistent across image recreate/pull.

## Verification Checklist

Run from container:

```bash
node -e "const http=require('http');http.get('http://localhost:3080/',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log((d.match(/<title>[\\s\\S]*?<\\/title>/i)||['NONE'])[0]);console.log('guard='+d.includes('app-title-guard'));});});"
node -e "const http=require('http');http.get('http://localhost:3080/api/config',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(JSON.parse(d).appTitle));});"
```

Expected:

- HTML title: `<title>desaram.ai</title>`
- guard present: `true` (if using guard)
- `/api/config` appTitle: `desaram.ai`

## Notes

- `LibreChat` in meta description does not affect tab title.
- Hard refresh/private window recommended when validating to avoid stale cached assets.

## Deploy Checklist (Do Not Lose the Fix)

1. Push the commits containing the fix:

```bash
git checkout dev
git push origin dev
```

2. On the deployment host, pull the same branch/commits:

```bash
git checkout dev
git pull origin dev
```

3. Build and run `api` from local source (not upstream prebuilt image):

```bash
docker compose up -d --build api
```

4. Clear Redis config cache and restart `api`:

```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

5. Browser validation:
   - Hard refresh (`Ctrl+Shift+R`) or open a private window.
   - Start a new conversation.
   - Confirm tab title stays `desaram.ai` (no `LibreChat` flash).

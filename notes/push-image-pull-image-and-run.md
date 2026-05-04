# Git to GHCR to Prod Runbook (API + Firecrawl Proxy)

This runbook covers the exact flow from `git add` to pushing and deploying both API and Firecrawl proxy images on production.

## 1. Stage only related files

```bash
cd /home/paralegaluser/app/LibreChat

git add api/server/index.js \
  api/server/routes/config.js \
  client/index.html \
  client/vite.config.ts \
  client/src/App.jsx \
  client/src/routes/Layouts/Startup.tsx
```

Verify staged files:

```bash
git diff --cached --name-only
git status --porcelain=v1
```

## 2. Commit and push code

```bash
git commit -m "feat: update app_title configuration"
git push
```

If `git push` fails with `Permission denied (publickey)`, fix SSH key/auth first.

## 3. Build and run locally (dev)

```bash
cd /home/paralegaluser/app/LibreChat
docker compose build --no-cache
docker compose up -d
```

Confirm container image:

```bash
CID=$(docker compose ps -q api)
docker inspect "$CID" --format 'Container={{.Name}} ImageRef={{.Config.Image}} ImageID={{.Image}}'
```

## 4. Tag current running API image for GHCR

```bash
IMG_ID=$(docker inspect "$CID" --format '{{.Image}}')
GHCR_IMAGE=ghcr.io/paralegallk/chat-paralegal-lk
GIT_SHA=$(git rev-parse --short HEAD)

docker tag "$IMG_ID" "$GHCR_IMAGE:latest"
docker tag "$IMG_ID" "$GHCR_IMAGE:$GIT_SHA"
```

Verify tags point to same image ID:

```bash
docker images | grep chat-paralegal-lk
```

## 5. Push API image to GHCR

Login (if needed):

```bash
echo "<ghp_token>" | docker login ghcr.io -u <github-username> --password-stdin
```

Push both tags:

```bash
docker push "$GHCR_IMAGE:latest"
docker push "$GHCR_IMAGE:$GIT_SHA"
```

Verify digest:

```bash
docker pull "$GHCR_IMAGE:latest"
docker inspect "$GHCR_IMAGE:latest" --format '{{index .RepoDigests 0}}'
```

## 6. Build and push Firecrawl proxy image to GHCR

If proxy was built locally by compose, publish that built image:

```bash
PROXY_LOCAL_IMAGE=librechat-firecrawl-allowlist-proxy
PROXY_GHCR_IMAGE=ghcr.io/paralegallk/firecrawl-allowlist-proxy
GIT_SHA=$(git rev-parse --short HEAD)

docker tag "$PROXY_LOCAL_IMAGE" "$PROXY_GHCR_IMAGE:latest"
docker tag "$PROXY_LOCAL_IMAGE" "$PROXY_GHCR_IMAGE:$GIT_SHA"
docker push "$PROXY_GHCR_IMAGE:latest"
docker push "$PROXY_GHCR_IMAGE:$GIT_SHA"
```

Alternative (if building directly from folder):

```bash
docker build -t ghcr.io/paralegallk/firecrawl-allowlist-proxy:latest ./firecrawl-allowlist-proxy
docker push ghcr.io/paralegallk/firecrawl-allowlist-proxy:latest
```

## 7. Run pulled images on production

In `docker-compose.override.yml`, production should use `image` and not `build`:

```yaml
services:
  api:
    image: ${API_IMAGE:-ghcr.io/paralegallk/chat-paralegal-lk:latest}
    # build: ... (keep disabled in prod)
  firecrawl-allowlist-proxy:
    image: ${PROXY_IMAGE:-ghcr.io/paralegallk/firecrawl-allowlist-proxy:latest}
    # build: ... (keep disabled in prod)
```

Deploy:

```bash
cd /home/paralegaluser/app/LibreChat
export UID=$(id -u)
export GID=$(id -g)
export API_IMAGE=ghcr.io/paralegallk/chat-paralegal-lk:latest
export PROXY_IMAGE=ghcr.io/paralegallk/firecrawl-allowlist-proxy:latest

docker compose pull api firecrawl-allowlist-proxy
docker compose up -d --no-build
docker compose up -d --no-build api firecrawl-allowlist-proxy
or
docker compose up -d --no-build firecrawl-allowlist-proxy
```

Verify runtime image:

```bash
CID=$(docker compose ps -q api)
docker inspect "$CID" --format 'ImageRef={{.Config.Image}} ImageID={{.Image}}'
docker inspect "$(docker compose ps -q firecrawl-allowlist-proxy)" --format 'ImageRef={{.Config.Image}} ImageID={{.Image}}'
```

## 8. Pull/restart only what changed

Only API changed:

```bash
docker compose pull api
docker compose up -d --no-build api
```

Only proxy changed:

```bash
docker compose pull firecrawl-allowlist-proxy
docker compose up -d --no-build firecrawl-allowlist-proxy
docker compose restart api
```

## 9. Rollback to previous tag

```bash
export API_IMAGE=ghcr.io/paralegallk/chat-paralegal-lk:560868ac7
docker compose pull api
docker compose up -d --no-build api
```

Proxy rollback:

```bash
export PROXY_IMAGE=ghcr.io/paralegallk/firecrawl-allowlist-proxy:3e8363630
docker compose pull firecrawl-allowlist-proxy
docker compose up -d --no-build firecrawl-allowlist-proxy
docker compose restart api
```

Verify:

```bash
docker inspect "$(docker compose ps -q api)" --format '{{.Config.Image}}'
docker inspect "$(docker compose ps -q firecrawl-allowlist-proxy)" --format '{{.Config.Image}}'
```

## 10. Important behavior notes

- `API_IMAGE=... docker compose up -d` works only if `image: ${API_IMAGE:-...}` is used.
- `PROXY_IMAGE=... docker compose up -d` works only if `image: ${PROXY_IMAGE:-...}` is used.
- If `build:` is enabled, compose can run/build local image instead of GHCR.
- `--no-build` prevents accidental local builds during deployment.
- `UID/GID` warnings appear when those vars are unset; export them before compose commands to avoid warnings.
- `git pull` updates source code only; GHCR images require `docker pull` or `docker compose pull`.

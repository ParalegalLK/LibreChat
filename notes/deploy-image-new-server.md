# Deploying `chat-paralegal-lk` on a New Server

This runbook sets up a LibreChat instance on a fresh server by pulling the prebuilt image from GHCR — **no build on the target server**.

Target image: **`ghcr.io/paralegallk/chat-paralegal-lk:latest`** (or a pinned `:<git-sha>` tag).
Target path on server: **`/home/paralegaluser/app/LibreChat`** (must match for volumes and scripts to work).

---

## 1. Prerequisites on the target server

- Linux (tested on Ubuntu 24.04, kernel 6.8).
- User `paralegaluser` with sudo.
- Docker Engine + the Compose v2 plugin (`docker compose`, not legacy `docker-compose`).
- SSH access to `github.com:ParalegalLK/LibreChat.git` (deploy key or your user key).
- Outbound HTTPS to `ghcr.io`.
- At least 8 GB RAM and 30 GB free disk.

Verify:
```bash
docker --version
docker compose version
whoami                         # → paralegaluser
ls /home/paralegaluser          # exists and is writable by you
```

---

## 2. Log Docker in to GHCR (pull-only PAT)

The image is **private**, so the server needs credentials to pull it.

Create a dedicated pull-only PAT for the server:

1. https://github.com/settings/tokens/new
2. **Note:** `ghcr-pull-<server-hostname>`
3. **Expiration:** match your server’s renewal cadence (e.g. 1 year).
4. **Scopes:** `read:packages` **only**.
5. Click **Configure SSO** after generation and authorise for **ParalegalLK**.

On the server:
```bash
echo "<ghp_...>" | docker login ghcr.io -u <your-github-username> --password-stdin
```
Should print `Login Succeeded`.

> Don’t reuse a push-capable token on a server. If the server is compromised, you want the blast radius limited to read.

---

## 3. Clone the repo to the canonical path

```bash
sudo mkdir -p /home/paralegaluser/app
sudo chown paralegaluser:paralegaluser /home/paralegaluser/app
cd /home/paralegaluser/app
git clone git@github.com:ParalegalLK/LibreChat.git
cd LibreChat
git checkout prod          # or the specific branch/tag you're deploying
git log -1                 # note the short SHA — should match the image tag you plan to pin
```

The server paths (`/home/paralegaluser/app/LibreChat/...`) must match exactly — the override binds config and asset files from these paths into the container.

---

## 4. Drop in the secrets and customised config

These files are **not** in git and must be copied across from the current production server (or from your secret store):

| File | Purpose |
|---|---|
| `.env` | All runtime secrets (API keys, Mongo URI, session secrets, SMTP creds, etc.) |
| `librechat.yaml` | UI/endpoint configuration bound into the container at `/app/librechat.yaml` |
| `client/public/assets/svgviewer-output.svg` | Custom logo (bound into the container) |
| `client/public/assets/minion-legal.png` | Custom avatar asset (bound into the container) |

Copy them from the existing prod server, for example:
```bash
# run on your laptop
scp prod-server:/home/paralegaluser/app/LibreChat/.env            new-server:/home/paralegaluser/app/LibreChat/
scp prod-server:/home/paralegaluser/app/LibreChat/librechat.yaml  new-server:/home/paralegaluser/app/LibreChat/
scp prod-server:/home/paralegaluser/app/LibreChat/client/public/assets/svgviewer-output.svg \
    new-server:/home/paralegaluser/app/LibreChat/client/public/assets/
scp prod-server:/home/paralegaluser/app/LibreChat/client/public/assets/minion-legal.png \
    new-server:/home/paralegaluser/app/LibreChat/client/public/assets/
```

Permissions:
```bash
chmod 600 /home/paralegaluser/app/LibreChat/.env
```

---

## 5. Point the compose override at the right image

`docker-compose.override.yml` currently resolves the API image from the `API_IMAGE` env var, defaulting to `ghcr.io/paralegallk/chat-paralegal:latest` **(note: old name, not `-lk`)**. The safest path is to set `API_IMAGE` explicitly — no file edits needed.

Add to `.env`:
```bash
# Pin to an immutable SHA tag in production — do NOT use :latest on prod
API_IMAGE=ghcr.io/paralegallk/chat-paralegal-lk:560868ac7
```

Why pin:
- `:latest` moves as new images are pushed — a `docker compose up -d` months from now could pick up something untested.
- Pinning to the git SHA lets you confirm the running code matches what's in the repo checkout.

To roll forward to a new version, update `API_IMAGE` in `.env` and re-run step 7.

---

## 6. Create the data volumes / directories used by bind mounts

These directories must exist before bringing the stack up (Docker will create them as root-owned if missing, which then fails to write):

```bash
cd /home/paralegaluser/app/LibreChat
mkdir -p data-node images uploads logs meili_data_v1.12 pgdata2
```

If you’re migrating from another server and want to preserve data (chat history, uploads, search index), `rsync` these directories across before starting:

```bash
# on the old server
sudo systemctl stop docker   # or just: docker compose down
rsync -avz --progress \
  /home/paralegaluser/app/LibreChat/data-node \
  /home/paralegaluser/app/LibreChat/images \
  /home/paralegaluser/app/LibreChat/uploads \
  /home/paralegaluser/app/LibreChat/logs \
  /home/paralegaluser/app/LibreChat/meili_data_v1.12 \
  /home/paralegaluser/app/LibreChat/pgdata2 \
  new-server:/home/paralegaluser/app/LibreChat/
```

Bringing `docker compose down` on the old host first avoids partially-flushed Mongo/Meili state.

---

## 7. Pull and start the stack

```bash
cd /home/paralegaluser/app/LibreChat
docker compose pull
docker compose up -d
```

`docker compose pull` pulls the pinned image from GHCR (using the login from step 2). `up -d` starts all services detached.

Expected containers:
```bash
docker compose ps
# LibreChat          running   0.0.0.0:3080->3080/tcp
# chat-mongodb       running
# chat-meilisearch   running
# vectordb           running
# rag_api            running
# librechat-redis    running
```

---

## 8. Verify

```bash
# Container logs — look for "Server listening on ..." and no repeating errors
docker compose logs -f api --tail 200

# Image digest actually running
docker inspect LibreChat --format '{{.Image}} {{.Config.Image}}'

# App health
curl -I http://localhost:3080/             # expect 200 / 302

# Confirm Redis + Mongo reachable from the api container
docker compose exec api sh -c 'nc -zv mongodb 27017 && nc -zv librechat-redis 6379'
```

Then hit the public URL (whatever your reverse proxy points at this server — e.g. `devchat.paralegal.lk`) and sign in with a test user.

---

## 9. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `pull access denied` on `chat-paralegal-lk` | Not logged into GHCR, or PAT missing `read:packages`, or PAT not SSO-authorised for ParalegalLK | Redo step 2 |
| API container keeps restarting, logs show missing env var | `.env` not copied over, or path wrong | Copy `.env` to `/home/paralegaluser/app/LibreChat/.env` (see step 4) |
| 502 from reverse proxy | api container not bound to `0.0.0.0:3080` | Check `PORT` in `.env`, check `docker compose ps` output |
| Chat UI shows stale config after editing `librechat.yaml` | Redis has cached the config | `./scripts/flush-config-cache.sh && docker compose restart api`, then hard-refresh browser |
| Custom logo missing | `svgviewer-output.svg` / `minion-legal.png` not copied | Re-copy those files to `client/public/assets/` (step 4) |
| “`ghcr.io/paralegallk/chat-paralegal:latest`” pulled instead of `chat-paralegal-lk` | `API_IMAGE` not set in `.env` (fell back to old default) | Set `API_IMAGE` in `.env` (step 5); `docker compose up -d` again |

---

## 10. Rolling forward to a new image

When a new image has been pushed (see `build-and-push-image.md`):

```bash
cd /home/paralegaluser/app/LibreChat
git pull origin prod

# update the pinned tag in .env
sed -i 's|^API_IMAGE=.*|API_IMAGE=ghcr.io/paralegallk/chat-paralegal-lk:<new-sha>|' .env

docker compose pull api
docker compose up -d api
docker compose logs -f api --tail 100
```

To roll back: set `API_IMAGE` to the previous SHA tag and re-run `docker compose up -d api`. Because we pushed both `:latest` and `:<sha>`, prior versions are still pullable.

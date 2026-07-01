# Building and Pushing the LibreChat Image to GHCR

This is the runbook for building the customised LibreChat image from this repo and publishing it to GitHub Container Registry (GHCR) at:

**`ghcr.io/paralegallk/chat-paralegal-lk:<tag>`**

The package lives under the **ParalegalLK** GitHub org. You have been granted write access, so you can push under your own PAT.

---

## 1. One-time setup: your GHCR personal access token (PAT)

You only need to do this the first time, or when your token expires.

### 1.1 Generate a GitHub PAT (classic)

1. Go to https://github.com/settings/tokens/new
2. **Note:** `ghcr-push-paralegallk`
3. **Expiration:** 90 days (or whatever your security policy requires)
4. **Scopes (tick exactly these):**
   - `write:packages`
   - `read:packages`
   - `delete:packages` *(optional — only if you may need to remove old tags)*
5. Click **Generate token** and copy the `ghp_...` value.

### 1.2 Authorise the token for the ParalegalLK org (SSO)

If the org enforces SSO, the token page will show an **“Configure SSO”** button after creation. Click it and authorise the token for **ParalegalLK**. Without this, pushes will fail with `denied: permission_denied`.

### 1.3 Log Docker into GHCR

```bash
echo "<ghp_...your-token...>" | docker login ghcr.io -u <your-github-username> --password-stdin
```

You should see `Login Succeeded`. Docker stores the credential in `~/.docker/config.json`. You do **not** need to log in again until the token expires.

Verify:
```bash
cat ~/.docker/config.json   # should contain an entry for "ghcr.io"
```

> **Security note:** the value stored is base64-encoded, **not** encrypted. Don’t share your home directory or commit `~/.docker/config.json` anywhere.

---

## 2. Build the image

### 2.1 Free memory first (required on the dev server — it OOMs otherwise)

```bash
cd /home/paralegaluser/app/LibreChat
./scripts/pre-build-cleanup.sh
```

This stops containers, prunes Docker caches, drops the Linux page cache, and restarts swap.

### 2.2 Build

Two ways — pick one.

**A. Direct `docker build` (simplest, recommended):**
```bash
cd /home/paralegaluser/app/LibreChat
docker build -t librechat:local .
```

**B. Via docker compose** — requires temporarily uncommenting the build block in `docker-compose.override.yml`:
```yaml
# docker-compose.override.yml
services:
  api:
    build:
      context: .
      target: node
    image: librechat:local
    # image: ${API_IMAGE:-ghcr.io/paralegallk/chat-paralegal:latest}
```
Then:
```bash
docker compose build api
```
Re-comment the build block when done so production deployments still pull from GHCR.

### 2.3 Verify the build

```bash
docker images | grep librechat
docker inspect librechat:local --format '{{.Created}} {{.Id}}'
```
Confirm the **Created** timestamp is recent and you recognise the image ID.

---

## 3. Tag for GHCR

Always push **two** tags so deployments can pin to an immutable version:

```bash
cd /home/paralegaluser/app/LibreChat
GIT_SHA=$(git rev-parse --short HEAD)

docker tag librechat:local ghcr.io/paralegallk/chat-paralegal-lk:latest
docker tag librechat:local ghcr.io/paralegallk/chat-paralegal-lk:$GIT_SHA
```

Verify:
```bash
docker images | grep chat-paralegal-lk
# Both tags should point to the same IMAGE ID as librechat:local
```

---

## 4. Push

```bash
docker push ghcr.io/paralegallk/chat-paralegal-lk:latest
docker push ghcr.io/paralegallk/chat-paralegal-lk:$GIT_SHA
```

The image is ~2GB. First push from a machine will upload everything; subsequent pushes only transfer new layers (`Layer already exists` lines are normal).

At the end each tag prints a digest line:
```
latest: digest: sha256:... size: 4504
```
Both tags should resolve to the **same digest**. If they don’t, you tagged different image IDs — re-check step 3.

---

## 5. Verify on GHCR

```bash
docker pull ghcr.io/paralegallk/chat-paralegal-lk:latest
```

Then visit https://github.com/orgs/ParalegalLK/packages and open the `chat-paralegal-lk` package to:

- Confirm the new tags are listed.
- Check the **SHA digest** matches what you pushed.
- Confirm **visibility** (should stay **private** unless product explicitly asks otherwise).

### First push of a brand-new package only
The first time a package name is published, GitHub creates it unlinked to any repo and with no permissions inherited. One-time steps on the package settings page:

1. **Manage Actions access / Repository** → link to `ParalegalLK/LibreChat`.
2. Confirm **visibility** (private by default — keep it that way).
3. Under **Manage access**, confirm the team has the right roles.

---

## 6. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `denied: permission_denied` | PAT missing `write:packages` or not SSO-authorised for `ParalegalLK` | Recreate token with correct scope; click **Configure SSO** and authorise the org |
| `unauthorized` | `~/.docker/config.json` is authed as a different user | `docker logout ghcr.io` then log in again with your own PAT |
| `Error response from daemon: Get "https://ghcr.io/v2/..."` | Network / DNS on the host | Check connectivity; retry |
| Build OOM-killed | Low-memory host, Docker cache full | Run `./scripts/pre-build-cleanup.sh` first; make sure swap is active |
| Tags have different digests | You re-tagged after a new build in between | Re-run step 3 from a single source image |

---

## 7. Quick-reference: full push in one block

```bash
cd /home/paralegaluser/app/LibreChat
./scripts/pre-build-cleanup.sh

docker build -t librechat:local .

GIT_SHA=$(git rev-parse --short HEAD)
docker tag librechat:local ghcr.io/paralegallk/chat-paralegal-lk:latest
docker tag librechat:local ghcr.io/paralegallk/chat-paralegal-lk:$GIT_SHA

docker push ghcr.io/paralegallk/chat-paralegal-lk:latest
docker push ghcr.io/paralegallk/chat-paralegal-lk:$GIT_SHA
```

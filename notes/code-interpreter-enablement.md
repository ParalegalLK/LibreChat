# Code Execution (Code Interpreter) — Enabled

Date: 2026-07-08
Repo: `/home/paralegaluser/app/LibreChat`
Status: **LIVE** — self-hosted sandbox at sandbox.paralegal.lk, verified end-to-end.

## Architecture (as built)

```
LibreChat (37.27.248.14 / 2a01:4f9:c013:c61::/64)
  └─ execute_code tool POSTs to LIBRECHAT_CODE_BASEURL
       └─ https://sandbox.paralegal.lk/v1  (Cloudflare-proxied DNS)
            └─ OpenResty on sandbox VM (Hetzner, 37.27.14.134, ssh: code-sandbox-hetzner-paralegaluser)
                 ├─ TLS: Let's Encrypt (/etc/letsencrypt/live/sandbox.paralegal.lk/)
                 ├─ ACL: only LibreChat server IPs (via CF-Connecting-IP)
                 └─ proxy → 127.0.0.1:3112 (code-interpreter API container)
                      └─ ClickHouse/code-interpreter stack at /home/paralegaluser/code-interpreter
                         (api, sandbox-runner, service-worker, file_server, tool_call_server,
                          egress_gateway, minio, redis)
```

Verified 2026-07-08: `py` and `js` execs return stdout through the full path (~50ms wall time);
ACL admits the LibreChat server and returns 403 to everyone else.

## Why No API Key (Fork Divergence)

Upstream docs say to set `LIBRECHAT_CODE_API_KEY` — **that path does not exist in this fork**.
The fork's `@librechat/agents` sends no `x-api-key`; its only auth is optional per-user JWTs
(`packages/api/src/auth/codeapi.ts`, enabled via `CODEAPI_JWT_ENABLED` + `CODEAPI_JWT_PRIVATE_KEY`),
which the OSS sandbox doesn't verify anyway. Security therefore rests on:

1. **OpenResty IP allowlist** (`/etc/openresty/lua/sandbox_acl.lua` on the sandbox VM):
   allows `37.27.248.14` (v4) and prefix `2a01:4f9:c013:c61:` (v6), read from `CF-Connecting-IP`
   (traffic arrives via Cloudflare) with `remote_addr` fallback for direct hits.
   **If the LibreChat server's IP ever changes, update this file and `sudo systemctl reload openresty`.**
2. **Firewall**: only 22/80/443 open on the sandbox VM. Docker-published ports (3112, MinIO
   19000/19001, Redis 16379, runner 2000) verified unreachable from the internet.
3. Cloudflare proxying in front of the domain.

## Config Reference

### Sandbox VM (`code-sandbox-hetzner-paralegaluser`)
- Stack: `/home/paralegaluser/code-interpreter`, `docker compose up -d`
- OpenResty vhost: `/etc/openresty/conf.d/sandbox.paralegal.lk.conf`
  (80→443 redirect; `/health` unauthenticated 200; `/v1/upload` with `client_max_body_size 25M`;
  everything else 1M; all `/v1/*` behind the Lua ACL; proxy to `127.0.0.1:3112`)
- ACL module: `/etc/openresty/lua/sandbox_acl.lua`
  (loaded via `lua_package_path "/etc/openresty/lua/?.lua;;"` in `nginx.conf` http block,
  alongside `include /etc/openresty/conf.d/*.conf;`)
- Runtimes: built by `./build-packages.sh` into `data/pkgs`, mounted read-only into
  `sandbox-runner` at `/pkgs`. Installed: Python 3.14.4, Node 24.15.0, Bun 1.3.14 (JS/TS), Bash 5.2.0.
- **Extra tools live in `/pkgs`, not the VM.** Sandboxed runs execute in a jail whose rootfs is
  minimal (no `apt-get`, no `which`) and only mounts `/pkgs`; anything installed on the VM host
  (e.g. `apt install pandoc` → `/usr/bin/pandoc`) is invisible to runs. Pandoc 3.6.4 is shipped at
  `data/pkgs/bash/5.2.0/bin/pandoc`, and that dir is prepended to `PATH` in both
  `data/pkgs/bash/5.2.0/.env` and `data/pkgs/python/3.14.4/.env` (2026-07-29, for the
  `legal-docx-build` skill). `build-packages.sh` was patched (backup:
  `build-packages.sh.bak-2026-07-29`) so package rebuilds re-download pandoc and regenerate the
  PATHs — rebuilds start with `rm -rf /pkgs/*`, so unpatched rebuilds would silently drop it.
  After changing `/pkgs`: `docker compose restart sandbox-runner`.

### LibreChat (this server)
- `.env`: `LIBRECHAT_CODE_BASEURL=https://sandbox.paralegal.lk/v1`
- `librechat.yaml`: `interface.runCode: true`; `execute_code` in `endpoints.agents.capabilities`
- Silva/Siriwardena unaffected (`hideBadgeRow: true` on their specs)
- Optional later: add `programmatic_tools` capability (MCP tool orchestration from sandbox code)

## Health Checks

```bash
# From the LibreChat server (only host that passes the ACL):
curl https://sandbox.paralegal.lk/health                       # -> healthy (no auth)
curl https://sandbox.paralegal.lk/v1/health                    # -> OK
curl -X POST https://sandbox.paralegal.lk/v1/exec \
  -H "Content-Type: application/json" \
  -d '{"lang":"py","code":"print(40+2)"}'                      # -> stdout "42\n"

# On the sandbox VM:
curl localhost:2000/api/v2/runtimes                            # -> 5 runtimes
docker compose ps                                              # all Up
```

## Gotchas

- **Runner caches the runtime list at startup.** If `sandbox-runner` starts before a package
  build finishes (or after adding runtimes), it reports "runtime is unknown" —
  `docker compose restart sandbox-runner` rescans `/pkgs`. This was the actual cause of the
  initial "python-3.14.4 runtime is unknown" error (packages were fine).
- OpenResty's systemd unit uses the compiled-in config path; `/etc/openresty/nginx.conf` and
  `/usr/local/openresty/nginx/conf/nginx.conf` are the same content on this box — validate with
  `sudo openresty -t -c /etc/openresty/nginx.conf`.
- Sandbox has no network egress; max 10 generated files per run; limits tuned via `SANDBOX_*`
  env on the stack. Inline artifact previews in LibreChat bounded by
  `FILE_PREVIEW_MAX_EXTRACT_BYTES`.
- LE cert renewal: certbot on the sandbox VM must keep port 80 reachable (it is; the 80 server
  block only redirects, but certbot's own hook handles renewals — verify with
  `sudo certbot renew --dry-run` if in doubt).

## UI Usage
Hard refresh (Ctrl+Shift+R), new conversation, open the tools dropdown ("+") and toggle
**Code Interpreter**, or press "Run Code" on a code block. Also unlocks script-driven workflows
in the document skills — but note the four Anthropic document skills (`docx`, `pptx`, `xlsx`,
`pdf`) are proprietary-licensed and dev-only; client deployments get paralegal.lk-authored
equivalents (see licensing box in `migration-plan.md` §4).

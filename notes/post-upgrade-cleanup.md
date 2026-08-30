# Post-upgrade cleanup — 2026-04-21

Follow-on work after the image upgrade that got the paralegal deployment back into a working shape. Read `notes/image-upgrade-landmines.md` first for the initial landmines — this note covers what came after.

## What we changed

### 1. Environment parity with desaram
Compared `/home/paralegaluser/app/LibreChat/.env` against the De Saram prod `.env`. Applied the config-level items that weren't secret/host-specific:

- `EMAIL_ENCRYPTION=starttls` (required for Gmail SMTP on port 587 — was empty before)
- `EMAIL_FROM_NAME="chat.paralegal.lk"` (was empty)
- `OPENID_POST_LOGOUT_REDIRECT_URI=https://www.chat.paralegal.lk/login` (new; paired with the `OPENID_USE_END_SESSION_ENDPOINT=true` flip from the previous round so Asgardeo lands the user back on our login page)
- `NODE_MAX_OLD_SPACE_SIZE=6144` (Docker build heap arg)
- `VITE_DISABLE_PWA=true` (skip installable-app prompts)
- `MISTRAL_API_KEY` rotated to the desaram-shared key (the previous paralegal key was stale)

We also added `SERPER_API_KEY`, `FIRECRAWL_API_KEY`, `JINA_API_KEY` for web search.

### 2. UID/GID change — backed out
Set `UID=1000 / GID=1000` to silence the `The "UID" variable is not set` warnings. **This broke mongodb and meilisearch**: `docker-compose.yml` applies `user: "${UID}:${GID}"` to *every* service, and mongo's data volume is owned by the mongo user (UID 999) baked into its image. Containers crash-looped with `Unable to read the storage engine metadata file`. Reverted to `# UID=1000 / # GID=1000`. The warnings are cosmetic; ignore them.

### 3. Model lists (now driven purely by `.env`)
- `ANTHROPIC_MODELS=claude-sonnet-4-6,claude-opus-4-6`
- `OPENAI_MODELS=gpt-4.1,gpt-5.1,gpt-5.4,gpt-4o-mini`
- `GOOGLE_MODELS=gemini-3.1-pro-preview,gemini-3-flash-preview,gemini-3.1-flash-lite-preview`

We stripped all non-custom `modelSpecs` from `librechat.yaml`. That endpoint yaml now has no explicit model lists either — raw endpoints read from `.env` directly, and silva is represented via the `paralegal.lk` custom endpoint alone.

### 4. `modelSpecs` subtle UI side-effect
The presence of *any* entry in `modelSpecs.list` silently flips `interface.parameters` and `interface.presets` to `false` in the config the frontend receives. Symptom: the raw model dropdown for OpenAI/Anthropic/Google endpoints disappears from the UI even though `/api/models` reports all the models correctly.

Fix: explicitly set them in `librechat.yaml`:
```yaml
interface:
  runCode: false
  endpointsMenu: true
  modelSelect: true
  parameters: true
  presets: true
```
(`endpointsMenu` is silently ignored in this LibreChat version — the key was removed upstream — but leaving it in is harmless.)

### 5. `carrom-bot` retirement
- Removed the `carrom-bot` custom endpoint from `librechat.yaml` (both the `custom:` entry and the `fileConfig.endpoints.carrom-bot` disable flag).
- Deleted the orphaned agent `sc-tab-03-2025-researcher` from MongoDB — it referenced `provider: "carrom-bot"` and would have shown up broken in the UI:
  ```bash
  docker compose exec -T mongodb mongosh --quiet --eval "
    db.getSiblingDB('LibreChat').agents.deleteOne({name:'sc-tab-03-2025-researcher'})"
  ```
- `CARROM_RAG_API_KEY=5Q4MFNnKKh4rY&` is still in `.env` but unused — harmless.

### 6. Silva display: rename at the endpoint, drop the modelSpec
User wanted `silva-01` to appear as `researcher-silva-1` in the UI.

First attempt — use a `modelSpec` with `label: "researcher-silva-1"` — caused silva to appear *twice* in the paralegal.lk dropdown: once as the raw model `silva-01`, once as the preset `researcher-silva-1`. The spec doesn't replace the endpoint's model, it gets added alongside.

Final approach: rename the model in the custom endpoint itself and drop the modelSpec:
```yaml
custom:
  - name: "paralegal.lk"
    models:
      default: ["researcher-silva-1"]
```
The HTTP POST to the RAG backend at `http://host.docker.internal:8123/v1` now carries `"model": "researcher-silva-1"` instead of `"silva-01"`. **The RAG backend ignores the model field** (it has one fixed agent internally named `legal-research-agent`), so the rename is transparent end-to-end. Verified with a direct curl against `/v1/chat/completions`.

Also: `models.default: []` is a config validation error — LibreChat refuses to start. You need at least one entry.

### 7. `modelDisplayLabel: "Junior Silva"` → `"Researcher Silva"`
Controls the chat input placeholder (`Message Researcher Silva`).

### 8. `agents` endpoint removed from `.env`
`ENDPOINTS=custom,openAI,anthropic,google` (dropped `agents`). With no agents in the database, the "My Agents" panel was showing empty — this hides it entirely. If you later want to bring agents back, add `agents` back to the list and provision at least one agent document.

## Final working state
- Endpoints: openAI, anthropic, google, paralegal.lk (no agents, no carrom-bot)
- paralegal.lk exposes one model: `researcher-silva-1`
- OIDC/SSO still disabled (`ALLOW_SOCIAL_LOGIN=false`); email login enabled
- Email invites send via Gmail SMTP with correct `https://www.chat.paralegal.lk` host in the links

## Operational gotchas to remember

1. **`.env` changes need `docker compose up -d`, not `restart`.** `env_file` is read at container *creation*. `restart` silently keeps the old values.
2. **Container recreation drops the `docker cp`'d `api/models/inviteUser.js`.** Re-copy after every `up -d`. Long-term fix is still to port `config/bulk-invite.js` onto `@librechat/api`'s new `createInvite(email, deps)` signature so this custom file isn't needed.
3. **Flush Redis after any yaml/env change**: `docker compose exec librechat-redis redis-cli FLUSHALL`. LibreChat caches `librechat.yaml` there.
4. **Do not set `UID` / `GID` in `.env`** on this host. It will crash mongodb and meilisearch.
5. **Custom endpoint `models.default` cannot be empty** — the model name listed there is sent verbatim to the backend, so renames are safe only if the backend accepts or ignores the model field.

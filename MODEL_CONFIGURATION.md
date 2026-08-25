# Memo: Configuring Models in `librechat.yaml`

**Audience:** ops / anyone maintaining the desaram.ai LibreChat deployment
**Last updated:** 2026-07-07
**Reference implementation:** the live `librechat.yaml` in this repo

This memo explains how we configure models in `librechat.yaml`: custom (in-house)
endpoints, enforced firm system prompts, and provider grouping so a single icon
appears at the provider level in the model menu.

---

## 1. The two-layer model

Model configuration has two layers that work together:

| Layer | Section | What it does |
|---|---|---|
| **Connection** | `endpoints:` | How LibreChat talks to a provider — base URL, API key, which model IDs exist. Built-in providers (`openAI`, `anthropic`, `google`) are configured via `.env`; in-house/OpenAI-compatible backends go under `endpoints.custom`. |
| **Presentation & policy** | `modelSpecs:` | What users actually see and select. Each spec is a named preset: display label, group, icons, and the full request preset (endpoint + model + system prompt + token limits). |

With `modelSpecs.enforce: true` (our setup), **modelSpecs is the only path to a
model**. Users never pick endpoints or raw models — they pick a spec, and the
server substitutes the spec's preset into the request.

## 2. Custom endpoints (in-house research agents)

Any OpenAI-compatible backend is registered under `endpoints.custom`. Ours:

```yaml
endpoints:
  custom:
    - name: "paralegal.lk"                 # endpoint id — referenced by modelSpecs presets
      apiKey: "${RAG_API_KEY}"             # env var substitution from .env
      baseURL: "https://www.chat.paralegal.lk/talkapi/v1"
      models:
        default: ["researcher-silva-2"]    # model IDs sent to the backend
        fetch: false                       # backend has no /models route — don't try
      titleConvo: true
      titleModel: "gpt-4o-mini"            # cheap model generates conversation titles…
      titleEndpoint: "openAI"              # …via the OpenAI endpoint, not the agent itself
      summarize: false
      modelDisplayLabel: "Researcher Silva" # name shown on assistant messages in chat
      iconURL: "https://em-content.zobj.net/source/twitter/408/feather_1fab6.png"
```

Notes:

- `apiKey` supports `${VAR}` substitution from `.env`.
- `fetch: false` + an explicit `models.default` list is required when the
  backend doesn't implement `GET /models` (both of ours don't).
- `titleEndpoint`/`titleModel` offload title generation to a cheap OpenAI model
  so the (slow, expensive) research agent isn't invoked twice per conversation.
- `modelDisplayLabel` is the sender name on messages; the menu label comes from
  the modelSpec (§3).
- `iconURL` can be an external URL or a local path like `/images/dsai-legal.jpeg`
  (served from the client's public images directory).
- The model ID (e.g. `researcher-silva-2`) is what gets POSTed to the backend.
  Our backends accept any model string, so renaming is a yaml-only change —
  but see §7 on what a rename does to existing conversations.
- File upload support per endpoint is controlled separately under
  `fileConfig.endpoints` — we disable uploads for both in-house agents there
  (`paralegal.lk: { disabled: true }`).

## 3. modelSpecs: the menu users see

```yaml
modelSpecs:
  enforce: true      # server replaces the request body with the spec's preset;
                     # any request not matching a listed spec is REJECTED
  prioritize: true   # the spec marked `default: true` auto-loads for new chats
  list:
    - name: "researcher-silva"        # internal spec id (stable, kebab-case)
      label: "Researcher Silva"       # what users see in the model menu
      group: "paralegal.lk"           # provider grouping — see §5
      groupIcon: "https://…/feather_1fab6.png"
      iconURL: "https://…/feather_1fab6.png"
      showIconInMenu: false           # icon at group level only, not per-model
      preset:
        endpoint: "paralegal.lk"      # must match an endpoint name (custom or built-in)
        model: "researcher-silva-2"   # must be in that endpoint's models list
```

`enforce: true` is our core security posture: users cannot strip or edit the
firm system prompt, and **every usable model must be listed here** — a model
present in `.env` (`OPENAI_MODELS` etc.) but missing from `modelSpecs.list` is
unusable. This pairs with the interface lockdown:

```yaml
interface:
  endpointsMenu: true
  modelSelect: false   # hide raw model picker
  presets: false       # hide user presets
  parameters: false    # hide parameter sliders
```

All four settings work as a unit. Loosening any of them reopens a path around
the enforced prompt.

## 4. Custom prompts (the firm system prompt)

The firm prompt is set via `promptPrefix` inside the spec's `preset`. To keep it
in one place we define it once as a **YAML anchor** on the first third-party
spec and reuse it everywhere else:

```yaml
    # First third-party spec defines the anchor:
    - name: "claude-opus-4-6"
      preset:
        endpoint: "anthropic"
        model: "claude-opus-4-6"
        promptPrefix: &firmPrompt |
          You are an AI assistant for D. L. & F. de Saram, a law firm in Sri Lanka.
          You are assisting {{current_user}}. Today's date is {{current_date}}.
          ...

    # Every other third-party spec reuses it:
    - name: "gpt-5.1"
      preset:
        endpoint: "openAI"
        model: "gpt-5.1"
        promptPrefix: *firmPrompt
```

- Editing the anchor text updates **all** third-party models at once.
- **Special variables** are substituted at runtime
  (`packages/api/src/agents/initialize.ts` → `replaceSpecialVars`):
  `{{current_user}}` = signed-in user's name, `{{current_date}}` =
  e.g. `2026-06-30 (Tuesday)`.
- **In-house agents (Researcher Silva, Junior De Saram) get NO `promptPrefix`**
  — they already operate under their own firm context server-side. Adding the
  firm prompt there would duplicate/conflict with their built-in instructions.
- Because of `enforce: true`, the prefix is applied server-side
  (`api/server/middleware/buildEndpointOption.js`) — users can't remove it.

## 5. Provider grouping (icons at provider level)

Three fields per spec control grouping and icons:

| Field | Effect |
|---|---|
| `group` | Specs sharing the same `group` string are collected under one collapsible provider header in the model menu. |
| `groupIcon` | Icon shown next to the **group header**. |
| `showIconInMenu: false` | Suppresses the per-model icon inside the group, so the icon appears **once at provider level** instead of repeating on every row. |
| `iconURL` | Still set on each spec — used for the selected-model indicator and message avatars even when hidden in the menu. |

Icon values can be:

- **Built-in provider keywords:** `"anthropic"`, `"openAI"`, `"google"` — render
  LibreChat's bundled provider logos.
- **External URL:** e.g. the feather emoji PNG for paralegal.lk.
- **Local path:** e.g. `/images/dsai-legal.jpeg` for De Saram AI.

**Group ordering:** groups appear in the menu in the order they *first appear*
in `modelSpecs.list`. Our order — De Saram AI, paralegal.lk, Anthropic, OpenAI,
Google — is achieved purely by list order, and the in-house agents are listed
first so they lead the menu. `default: true` on `junior-de-saram` makes it the
preselected model for new chats (with `prioritize: true`).

Give every spec in a group identical `group` and `groupIcon` values — a
mismatched string (case-sensitive) splits the group in two.

## 6. Recipe: adding a new model

**Third-party model (e.g. new OpenAI model):**

1. Add the model ID to the provider's model list in `.env`
   (e.g. `OPENAI_MODELS=gpt-4.1,gpt-5.1,<new-model>`).
2. Add a spec to `modelSpecs.list` in the provider's section:

   ```yaml
    - name: "<new-model>"
      label: "<Display Name>"
      group: "OpenAI"            # match existing group string exactly
      groupIcon: "openAI"
      iconURL: "openAI"
      showIconInMenu: false
      preset:
        endpoint: "openAI"
        model: "<new-model>"
        maxContextTokens: 400000  # only if it differs from defaults — check provider docs
        max_tokens: 128000
        promptPrefix: *firmPrompt # REQUIRED for all third-party models
   ```

3. Apply (§7).

**In-house agent model:** add/adjust the `endpoints.custom` entry (§2) *and*
its modelSpec (§3), with **no** `promptPrefix`. If it shouldn't accept file
uploads, disable it under `fileConfig.endpoints`.

## 7. Applying changes & gotchas

LibreChat caches the parsed config in Redis. After any `librechat.yaml` change:

```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

Then hard-refresh the browser (Ctrl+Shift+R) and start a **new conversation**.

Gotchas:

- **Old conversations lock to their original model.** With `enforce: true`,
  a conversation created on a spec that no longer exists (e.g. after renaming
  `junior-silva` → `researcher-silva`) can be rejected — users must start a new
  chat.
- **Renames don't rewrite history.** Messages keep their historical `model` and
  `sender` values in MongoDB. When querying usage across a rename, match a
  common substring (e.g. `/silva/i` catches both `junior-silva-01` and
  `researcher-silva-2`).
- **Anchor placement matters.** `&firmPrompt` must be defined on a spec that
  appears *before* any `*firmPrompt` reference (YAML anchors resolve top-down).
  If you remove the spec carrying the anchor, move the anchor definition to the
  new first third-party spec.
- **`enforce: true` means no spec → no model.** Forgetting the modelSpec entry
  (not just the `.env` entry) makes a model silently unusable.

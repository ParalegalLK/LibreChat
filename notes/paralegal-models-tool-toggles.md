# Tool Toggles for paralegal.lk Model Specs (Web Search / File Search / Skills / Artifacts)

Date: 2026-07-08
Repo: `/home/paralegaluser/app/LibreChat`

## Goal
Researcher Silva and Translator Siriwardena are custom RAG/translation backends that cannot handle
LibreChat's ephemeral tools (web search, file search, skills, artifacts). This note documents how to
disable those tools per model spec, and how artifacts is disabled platform-wide, using **config only**
(no rebuild needed).

## Where the Models Live
Both models are custom endpoints wrapped in model specs in `librechat.yaml`:

| Display name | Spec name | Endpoint | Backend |
|---|---|---|---|
| Researcher Silva | `silva-01` | `paralegal.lk` | `http://host.docker.internal:8123/v1` |
| Translator Siriwardena | `siriwardena-01` | `translate.lk` | `https://www.devtranslate.paralegal.lk/api/v1` |

## Per-Spec Tool Toggles (Current Config)
Each spec under `modelSpecs.list` in `librechat.yaml`:

```yaml
    - name: "silva-01"
      label: "researcher-silva-2"
      group: "paralegal.lk"
      showIconInMenu: false
      hideBadgeRow: true      # hides the ENTIRE tools row (dropdown + pinned chips)
      webSearch: false        # ephemeral-agent default OFF
      fileSearch: false
      skills: false
      artifacts: false
      preset:
        endpoint: "paralegal.lk"
        model: "researcher-silva-2"
```

Same block on `siriwardena-01` (endpoint `translate.lk`).

### What each field does
- `hideBadgeRow: true` — removes the whole badge row while the spec is active: the "+" tools
  dropdown and all pinned tool chips (web search, code, file search, skills, memory, artifacts,
  MCP). Users cannot re-enable anything from the UI.
  - Gating: `client/src/components/Chat/Input/ChatForm.tsx` (`modelSpec?.hideBadgeRow === true`)
    → `BadgeRow.tsx` (`showEphemeralBadges === true && <ToolsDropdown />` and the pinned badge block).
  - Feature added in commit `738ed005b` (PR #13124) — images built before it silently ignore the field.
- `webSearch/fileSearch/skills/artifacts/executeCode/memory: false` — zero out the ephemeral-agent
  defaults when a user switches to the spec (`client/src/utils/endpoints.ts`,
  `applyModelSpecEphemeralAgent`). This guards against toggles carried over via localStorage from
  another model's conversation, so keep them even though `hideBadgeRow` already hides the UI.
- Full list of supported spec fields: `packages/data-provider/src/models.ts` (`TModelSpec`) —
  also supports `mcpServers`, `subagents`, `executeCode`, `memory`.

## Artifacts Disabled Platform-Wide
Artifacts has **no global `interface` switch** in this version — it is gated by the agents-endpoint
capability list. `librechat.yaml` sets the capabilities explicitly, omitting `artifacts`:

```yaml
endpoints:
  # Capabilities list intentionally omits `artifacts` to disable artifacts platform-wide
  agents:
    capabilities:
      - deferred_tools
      - execute_code
      - file_search
      - web_search
      - subagents
      - actions
      - context
      - skills
      - memory
      - tools
      - chain
      - ocr
```

- Default capability list (what you get when the block is absent):
  `packages/data-provider/src/config.ts` → `defaultAgentCapabilities` (includes `artifacts`).
- Omitting `artifacts` removes it from the tools dropdown for **every** model and from the
  agent builder.
- If you later add a capability upstream introduces, remember this explicit list **replaces**
  the defaults — new default capabilities must be added here manually.

## Applying Changes
`librechat.yaml` is bind-mounted into the container (`docker-compose.override.yml`:
`./librechat.yaml → /app/librechat.yaml`), so edits are runtime config — **no image rebuild**:

```bash
./scripts/flush-config-cache.sh
docker compose restart api
```

Then hard-refresh the browser (Ctrl+Shift+R). Validate the yaml before applying:

```bash
node -e "require('js-yaml').load(require('fs').readFileSync('librechat.yaml','utf8')); console.log('parsed OK')"
```

Rule of thumb: `librechat.yaml` / `.env` → flush + restart. Anything in `client/`, `api/`,
`packages/` → image rebuild (`./scripts/pre-build-cleanup.sh --build`).

## Legacy Hardcoded Hack (Superseded)
`client/src/components/Chat/Input/ChatForm.tsx` (~line 384) contains an older fork hack that hides
badges by endpoint name:

```ts
endpoint !== 'paralegal.lk' &&
endpoint !== 'dl-f-de-saram-chat'
```

- This is why Silva never showed badges while Siriwardena (endpoint `translate.lk`, never added to
  the list) did.
- The `hideBadgeRow` spec config supersedes it. Safe to delete the hack in a future cleanup, but
  removal requires a client rebuild — harmless if left in place.

## Adding a New paralegal.lk Model (Checklist)
1. Add the custom endpoint under `endpoints.custom` in `librechat.yaml`.
2. Add a `modelSpecs.list` entry with `group: "paralegal.lk"` and, if the backend cannot handle
   tools, the same five toggle lines (`hideBadgeRow` + four `false` toggles).
3. Do **not** add the endpoint name to the `ChatForm.tsx` hardcoded list — use the spec config.
4. Flush Redis + restart API + hard refresh.

## Known Limitation
The paperclip/attach-file button is separate from the badge row and still shows for these specs
(file uploads ≠ file search toggle). Hiding it would require a client code change.

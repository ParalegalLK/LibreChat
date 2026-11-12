# Pi model and effort controls for LibreChat

This optional feature is currently enabled for **Junior De Saram Pi**. It can be reused for another administrator-configured Pi endpoint. It changes the internal Pi model and thinking effort while keeping LibreChat's visible endpoint and model alias stable.

## User interface

One compact gauge button sits in the primary message composer immediately beside the context indicator. It opens a panel headed “Pick model to run the agent with”, with Model and Effort choices. Model opens a searchable list; selecting one returns to the first panel. Effort opens a separate slider view that names the selected model. A Back button returns from either view. The button is transparent at rest and darkens on hover or while open, like the neighboring composer controls. It does not appear for other LibreChat endpoints. The main LibreChat model selector remains in the header at its original size.

The model menu lists only models that are both present in the Pi host's available catalog and included in the administrator allowlist. The effort slider uses the selected model's supported levels; it defaults to **Medium** where supported. If the user changes to a model that does not support the current level, the UI chooses Medium when supported, otherwise the model's first supported level. The button has an accessible name and a hover title that include the selected model and effort.

## Configuration

Under the Pi entry in `endpoints.custom` in [librechat.yaml](../librechat.yaml):

```yaml
- name: "Junior De Saram Pi"
  piModelPicker: true
  piDefaultModel: "google/gemini-3.8-flash"
  piDefaultEffort: "medium"
  piAllowedModels: "${JUNIOR_SILVA_ALLOWED_MODELS}"
  apiKey: "${JUNIOR_DE_SARAM_API_KEY}"
  baseURL: "http://junior-de-saram:8160/v1"
  models:
    default: ["junior-de-saram-pi"]
    fetch: false
```

In LibreChat's `.env`, add the comma-separated `provider/id` list. This intentionally keeps the exact variable name requested for the deployment even though the current endpoint is Junior De Saram:

```dotenv
JUNIOR_SILVA_ALLOWED_MODELS=anthropic/claude-opus-5-5,anthropic/claude-sonnet-5-5,google/gemini-4-carbon,google/gemini-4-argon,google/gemini-3.8-flash,openai/gpt-6.1-sol,openai/gpt-6.1-terra
```

The list is a maximum, not an invented catalog: a model appears only if Pi currently knows it and has the credentials needed to use it. If the list is absent, the model menu is empty and selections are rejected. Keep provider API keys in the Pi host `.env`, never in the browser or YAML. The current Pi host needs a matching provider key for each provider the administrator wants available.

## Request flow

1. The authenticated LibreChat client requests `GET /api/endpoints/pi-models/:endpoint`. LibreChat authenticates to the configured Pi host, gets `/v1/pi/models`, intersects it with the allowlist, and sends only safe model metadata and supported thinking levels to the browser.
2. The user changes the model or effort in the composer. Unsent choices are keyed by endpoint and conversation. The chosen values enter the chat request and are saved as `piModel` and `piEffort` on the conversation. Reloading a saved chat restores both.
3. LibreChat validates the model against the administrator allowlist, checks the effort value, and sends `X-Pi-Model` and `X-Pi-Thinking` to the Pi host. Model-spec enforcement preserves these two choices.
4. The Pi host checks the exact model against its available catalog and the effort against that model's supported levels. It launches Pi with `--provider`, `--model`, and `--thinking`, and records the chosen provider, model, and effort in its trace.

The existing endpoint alias, tool setup, skills, and document handling do not depend on these controls.

## Files to adapt for another Pi endpoint

| File | Purpose |
| --- | --- |
| [client/src/components/Chat/Input/ChatForm.tsx](../client/src/components/Chat/Input/ChatForm.tsx) | Places the combined control beside the context indicator. |
| [client/src/components/Chat/Menus/Endpoints/PiModelPicker.tsx](../client/src/components/Chat/Menus/Endpoints/PiModelPicker.tsx) | Searchable, provider-grouped model picker and supported-effort slider in one popover. |
| [client/src/store/piModelPicker.ts](../client/src/store/piModelPicker.ts), [client/src/hooks/Chat/useChatFunctions.ts](../client/src/hooks/Chat/useChatFunctions.ts) | Unsent selection state and chat payload. |
| [api/server/controllers/PiModelsController.js](../api/server/controllers/PiModelsController.js), [packages/data-provider/src/pi-model-policy.ts](../packages/data-provider/src/pi-model-policy.ts) | Authenticated, filtered model catalog and allowlist parsing. |
| [packages/api/src/endpoints/custom/initialize.ts](../packages/api/src/endpoints/custom/initialize.ts) | Checks model and effort, then sends headers to Pi. |
| [packages/api/src/endpoints/custom/config.ts](../packages/api/src/endpoints/custom/config.ts), [packages/data-provider/src/config.ts](../packages/data-provider/src/config.ts) | Endpoint configuration schema and safe client defaults. |
| [packages/data-provider/src/schemas.ts](../packages/data-provider/src/schemas.ts), [packages/data-schemas/src/schema/defaults.ts](../packages/data-schemas/src/schema/defaults.ts) | Conversation schema and persistence. |

The separate Pi host uses `junior-de-saram/core/pi-models.mjs` for catalog and effort metadata, `junior-de-saram/server/openai.mjs` for request validation, and `junior-de-saram/core/runtime.mjs` for CLI arguments. Its Docker build generates the upstream Pi packages before the host imports their model metadata. Native operation must build Pi first.

## Deployment and verification

Rebuild and recreate the Pi host and LibreChat API after source changes. A YAML or `.env` edit alone needs a LibreChat recreation. Check that the button appears only for the configured endpoint, that the model menu contains only allowed and available models, that effort choices match the selected model, and that a sent choice survives refresh. Send a request at a different effort and inspect the Pi trace for the chosen provider, model, and thinking level. Test a second chat to ensure an unsent selection does not carry across.

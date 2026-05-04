# Web Search Planner Prompt (Web-Search-Only)

Date: 2026-05-04
Repo: `/home/paralegaluser/app/LibreChat`

## Goal
Configure a planner/system prompt that is applied **only** when `web_search` is enabled, not as a global prompt prefix.

## Planner Prompt (Current)
```text
Research the following legal question and provide relevant context, recent developments, and any current news.
Unless specified, the jurisdiction is Sri Lanka.
Rely on official government sources where possible.
```

## Key Clarification
- The planner prompt is **not shown in the UI query box**.
- It is injected server-side into tool/system context during request assembly.
- User query text is unchanged.

## Exact Runtime Order (with `{user_query}`)
1. User enters `{user_query}` and toggles web search ON.
2. Backend builds system context and injects web-search planner prompt.
3. First LLM call receives:
   - system/tool context (includes planner prompt), and
   - user message `{user_query}`.
4. LLM decides to call `web_search` and generates tool args from `{user_query}` (e.g., `query`, optional `country`, `date`, `news`).
5. Search provider (`serper`) runs the query and returns candidate links/results.
6. Scraper (`firecrawl`) fetches/scrapes page content from selected links (subject to your allowlist/proxy policy if configured).
7. Reranker (`jina`) ranks/highlights relevant content.
8. Tool output is returned to the model.
9. Second LLM call produces final answer using retrieved content and citation rules.

## Important Jurisdiction Note
- `serper` is **not automatically Sri-Lanka-only** by default.
- Sri Lanka targeting depends on the model/tool args (e.g., setting `country: "lk"`, query shaping, or domain constraints).

## Options Considered
1. `modelSpecs.preset.promptPrefix` (no code)
   - Applies to all turns for that spec, not web-search-only.
2. Dedicated research model spec/agent (no code)
   - Operationally useful, but not a true backend-only web-search planner hook.
3. Hardcode prompt in web toolkit code
   - Works, but not admin-configurable.
4. **Chosen:** YAML-configurable `webSearch.plannerPrompt` + code injection only for `web_search`.

## Implementation Completed

### 1) Added config field to schema/types
- File: `/packages/data-provider/src/config.ts`
- Change: Added `plannerPrompt: z.string().optional()` to `webSearchSchema`.

### 2) Web-search context builder accepts planner prompt
- File: `/packages/api/src/tools/toolkits/web.ts`
- Change: `buildWebSearchContext(plannerPrompt?: string)`
- Behavior:
  - If provided/non-empty, adds `**PLANNER INSTRUCTIONS:**` block.
  - Keeps existing citation/anchor instructions intact.

### 3) Inject planner prompt only when web search tool is active
- File: `/api/server/services/ToolService.js`
- Change:
  - From: `buildWebSearchContext()`
  - To: `buildWebSearchContext(appConfig?.webSearch?.plannerPrompt)`
- This is inside existing `if (hasWebSearch)` logic.

### 4) Added tests
- New file: `/packages/api/src/tools/toolkits/web.spec.ts`
  - default context present
  - planner block present when prompt is set
  - planner block omitted for empty prompt
- Updated: `/packages/api/src/app/checks.spec.ts`
  - confirms `plannerPrompt` is ignored by env-var credential validation checks.

### 5) YAML updates
- Active config: `/librechat.yaml`
  - Added under `webSearch:` -> `plannerPrompt: | ...`
- Example docs config: `/librechat.example.yaml`
  - Added commented `plannerPrompt` example in webSearch section.

## Verification Run
- Executed in `packages/api`:
  - `npx jest src/tools/toolkits/web.spec.ts src/app/checks.spec.ts`
- Result:
  - 2 test suites passed
  - 21 tests passed

## How to Observe/Log It

### No-code signal (basic)
1. Enable relevant debug env vars (if used in your stack)
2. `docker compose logs -f api`
3. Observe web-search tool invocations and results flow

### Code-level temporary debug (recommended)
Add temporary `logger.debug` statements in:
- `/api/server/services/ToolService.js`
  - Log when `hasWebSearch` is true
  - Log plannerPrompt presence/length (avoid full prompt in logs if sensitive)
- Web-search tool execution path (tool call args)
  - Log `query`, `country`, `date`, `news` to verify Sri Lanka targeting behavior

Remove debug logs after validation.

## Apply/Deploy Steps
1. `docker compose build api`
2. `docker compose up -d api` (or restart API with updated image)
3. `docker compose exec librechat-redis redis-cli FLUSHALL`
4. Hard refresh browser (`Ctrl+Shift+R`)
5. Start a new conversation and test with web search ON

## Notes
- `{user_query}` placeholder is not required by LibreChat variable replacement for this feature; user text is already the normal user message in the LLM request.
- Planner prompt remains server-side and does not appear in the chat input UI.

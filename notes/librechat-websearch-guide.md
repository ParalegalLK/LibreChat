# LibreChat Web Search Guide

Last verified: 2026-04-24

Scope: LibreChat docs references + current source code in this repository.

## 1) Direct answer: why citations appear with LibreChat websearch but not always with default model web search

### LibreChat websearch (`Tools.web_search`) citation path

LibreChat websearch is designed end-to-end around a specific citation format.

1. Backend injects strict citation instructions into tool context.
2. Search formatter emits anchor markers like `\ue202turn0search0`, `\ue202turn0news1`, `\ue202turn0ref0`.
3. Tool output includes a structured `web_search` artifact attachment (sources/turn data).
4. Frontend markdown plugin parses those markers and renders citation UI (hover cards, source chips).
5. Copy-to-clipboard can convert markers into numbered citation links.

Because the format, artifact, and renderer are all controlled by LibreChat, citations are consistent.

### Default model web search (`web_search` model option) citation path

Default model web search only enables the provider-native tool:

- OpenAI/Azure: `{ type: "web_search" }`
- Anthropic: `{ type: "web_search_20250305", name: "web_search" }`
- Google/Vertex: `{ googleSearch: {} }`

In this mode, citation behavior depends on the model/provider response format.

In LibreChat’s current Responses pipeline, output text is assembled with empty `annotations` arrays, so provider-native URL citation annotations are not converted into LibreChat inline citation chips. That is why you can see fewer/no inline citations with default model web search compared to LibreChat websearch.

## 2) How LibreChat websearch works

LibreChat websearch is a 3-stage pipeline:

1. Search provider stage: finds candidate links.
2. Scraper stage: fetches/extracts page content.
3. Reranker stage: ranks evidence by relevance.

Typical mapping:

- Search provider: Serper or SearXNG
- Scraper: Firecrawl or Serper Scrape
- Reranker: Jina or Cohere

## 3) Why Serper, Firecrawl, and Jina keys are needed

Each key serves a different layer:

- `SERPER_API_KEY`: discovery/search provider (or Serper scraper mode).
- `FIRECRAWL_API_KEY`: scraping/extraction layer.
- `JINA_API_KEY`: reranking layer.

Alternatives are supported:

- Search alternative: `SEARXNG_INSTANCE_URL` (+ optional `SEARXNG_API_KEY`)
- Reranker alternative: `COHERE_API_KEY`
- Scraper alternative: Serper scraper (uses Serper key)

Auth is validated by category (`providers`, `scrapers`, `rerankers`), and each category needs at least one authenticated service.

## 4) How LibreChat web search API flow works

Typical internal flow:

1. UI checks websearch auth: `GET /api/agents/tools/web_search/auth`
2. If system keys are missing, user can save personal keys as plugin auth (`web_search`).
3. Chat request runs through agent/chat pipeline.
4. If agent capability `web_search` is enabled, backend loads auth and builds `createSearchTool(...)`.
5. Search results are emitted as `Tools.web_search` attachments/artifacts.
6. UI uses these attachments for source list display and inline citation resolution.

## 5) How to configure LibreChat websearch

Set environment variables in `.env`:

```bash
# Search provider
SERPER_API_KEY=...
# OR
SEARXNG_INSTANCE_URL=...
SEARXNG_API_KEY=...

# Scraper
FIRECRAWL_API_KEY=...
FIRECRAWL_API_URL=...
FIRECRAWL_VERSION=v2

# Reranker
JINA_API_KEY=...
JINA_API_URL=...
# OR
COHERE_API_KEY=...
```

Then configure `librechat.yaml` using env references:

```yaml
webSearch:
  serperApiKey: "${SERPER_API_KEY}"
  firecrawlApiKey: "${FIRECRAWL_API_KEY}"
  jinaApiKey: "${JINA_API_KEY}"

  # Optional provider selectors
  searchProvider: "serper"      # or "searxng"
  scraperProvider: "firecrawl"  # or "serper"
  rerankerType: "jina"          # or "cohere"

  # Optional tuning
  safeSearch: 1
  scraperTimeout: 7500

  # Optional Firecrawl scraping controls
  firecrawlOptions:
    formats: ["markdown", "rawHtml"]
    onlyMainContent: true
    parsePDF: true
```

Notes:

- Use env-var references in YAML, not raw secrets.
- If system keys are not complete, users can provide personal keys in the Web Search auth dialog.

## 6) Agent toggle vs default model web search toggle

### A) Agent capability toggle: LibreChat `web_search`

- Adds `Tools.web_search` to agent tools.
- Uses LibreChat provider+scraper+reranker stack.
- Produces LibreChat search attachments and citation anchors.
- Best choice when you want consistent inline source citations in LibreChat UI.

### B) Default model option: `web_search: true`

- Enables provider-native web search tool for the selected endpoint/model.
- Does not require Serper/Firecrawl/Jina keys.
- Citation style/availability is provider-dependent.
- In current LibreChat Responses handling, provider annotation metadata is not surfaced as LibreChat inline citation chips.

### Tool compatibility note

- OpenAI/Azure/Anthropic can combine provider-native tools and agent tools.
- Google/Vertex throws `GOOGLE_TOOL_CONFLICT` if provider tools and agent tools are both present.

## 7) Other LibreChat websearch features available

LibreChat websearch provides additional capabilities beyond a simple provider-native toggle:

- Citation anchor protocol with parser-supported standalone/composite/highlight markers.
- Source artifacts attached per tool turn and rendered in UI.
- Progressive search status UI (`searching`, `processing`, `reading`) with source previews.
- Hovercards with title/domain/snippet for cited sources.
- Copy output with normalized numbered citation list.
- Configurable `safeSearch` levels (`0`, `1`, `2`).
- Configurable `scraperTimeout`.
- Rich Firecrawl options (`formats`, `headers`, `waitFor`, `location`, `onlyMainContent`, `parsePDF`, etc.).
- Multi-provider routing (Serper vs SearXNG, Firecrawl vs Serper scraper, Jina vs Cohere).
- Category-level auth typing (system-defined vs user-provided keys).

## 8) How to create a custom web search agent

UI path:

1. Go to `Agents` endpoint.
2. Create or edit an agent.
3. Enable `Web Search` capability.
4. Save agent.
5. If prompted, add web search keys in auth dialog.
6. Test with a current-events query.

YAML model spec path:

```yaml
modelSpecs:
  list:
    - name: "research-assistant"
      label: "Research Assistant"
      webSearch: true
      preset:
        endpoint: "openAI"
        model: "gpt-4o"
```

For provider-native search on default model/custom endpoint:

```yaml
endpoints:
  custom:
    - name: "My Provider"
      apiKey: "${MY_API_KEY}"
      baseURL: "https://my-endpoint/v1"
      addParams:
        web_search: true
```

## 9) Legal Domain Restriction Approaches

This section documents the two implementation patterns for domain-restricted legal web research in LibreChat.

### 1. Prompt-based domain restriction (current approach)

Domain restriction is enforced through LibreChat Agent Instructions (system prompt behavior), for example:

`When using web search, automatically restrict search queries to approved domains using site: operators.`

Default legal restriction set:

```text
site:documents.gov.lk OR site:parliament.lk OR site:lawnet.gov.lk OR site:supremecourt.lk OR site:courtofappeal.lk OR site:judicial.lk OR site:cbsl.gov.lk OR site:sec.gov.lk OR site:ird.gov.lk OR site:bribcom.gov.lk OR site:humanrights.lk OR site:basl.lk
```

This is soft enforcement: the model is instructed to restrict domains, but it is not technically blocked at the search engine layer.

Advantages:

- Fast
- No coding needed
- No infrastructure changes
- Easy to test
- Works immediately

Summary: `Tell the AI what to do`

### 2. Server-side enforcement with SearXNG + LibreChat (recommended long-term)

SearXNG provides hard enforcement by restricting domains at the search engine layer before results reach LibreChat.

Recommended architecture:

`LibreChat + SearXNG + Firecrawl + Jina`

With this model, even if the LLM attempts to search outside approved domains, the search backend does not return non-allowed sources.

Advantages:

- Strict domain allowlisting
- Production-grade compliance
- Stronger legal research reliability
- Enterprise-grade enforcement

Summary: `Make the system only allow it`

### Short comparison

| Aspect | Prompt-based control | SearXNG enforcement |
|---|---|---|
| Enforcement type | Soft (instruction-based) | Hard (system-enforced) |
| Restriction point | LLM query generation | Search engine result filtering |
| Reliability | Medium | High |
| Compliance strength | Moderate | Strong |
| Implementation effort | Low | Medium |
| Production suitability | Pilot/internal | Long-term enterprise |

## 10) Practical recommendation

If citations in the final response are critical, prefer LibreChat `web_search` capability.

For legal production workloads, use SearXNG server-side restriction as the target state, and use prompt-based `site:` controls as an interim approach.

If you only want quick built-in web access with minimal setup, use default model `web_search`, but expect citation formatting to vary by provider and current LibreChat annotation handling.

## 11) LibreChat docs references

- https://www.librechat.ai/docs/features/web_search
- https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/web_search
- https://www.librechat.ai/docs/features/agents
- https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/custom_endpoint
- https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/model_specs

## 12) Key source-code references used

- `packages/api/src/tools/toolkits/web.ts`
- `node_modules/@librechat/agents/src/tools/search/tool.ts`
- `node_modules/@librechat/agents/src/tools/search/format.ts`
- `node_modules/@librechat/agents/src/tools/search/schema.ts`
- `node_modules/@librechat/agents/src/tools/search/search.ts`
- `node_modules/@librechat/agents/src/tools/search/types.ts`
- `packages/api/src/web/web.ts`
- `packages/data-schemas/src/app/web.ts`
- `packages/data-provider/src/config.ts`
- `librechat.example.yaml`
- `packages/api/src/agents/load.ts`
- `packages/api/src/agents/initialize.ts`
- `packages/api/src/agents/run.ts`
- `packages/api/src/endpoints/openai/llm.ts`
- `packages/api/src/endpoints/anthropic/llm.ts`
- `packages/api/src/endpoints/google/llm.ts`
- `packages/api/src/agents/responses/handlers.ts`
- `packages/api/src/agents/responses/service.ts`
- `api/server/controllers/agents/responses.js`
- `api/server/controllers/agents/callbacks.js`
- `client/src/components/Chat/Messages/Content/Markdown.tsx`
- `client/src/components/Web/plugin.ts`
- `client/src/utils/citations.ts`
- `client/src/components/Web/Citation.tsx`
- `client/src/components/Chat/Messages/Content/WebSearch.tsx`
- `client/src/hooks/Messages/useSearchResultsByTurn.ts`
- `client/src/hooks/Messages/useCopyToClipboard.ts`

# Architecture — devchat.paralegal.lk

A unified AI chat gateway for Sri Lankan law firms, built as a white-labeled [LibreChat](https://github.com/danny-avila/LibreChat) fork. Lawyers authenticate via SSO, then interact with commercial LLMs for general tasks and custom legal research agents backed by ~107k indexed Sri Lankan legal documents — all through one chat interface with document upload, OCR, and RAG.

---

## System Overview

Three projects compose the full system:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         devchat.paralegal.lk                            │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  LibreChat (fork)                                                │   │
│  │  /home/paralegaluser/app/LibreChat                               │   │
│  │  Chat UI + commercial LLMs + user management                     │   │
│  └───────────────┬──────────────────────────────────────────────────┘   │
│                  │ POST /v1/chat/completions (OpenAI-compatible)        │
│                  ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  rag-chat-server (FastAPI)                                       │   │
│  │  /home/paralegaluser/app/rag-chat-server                         │   │
│  │  Legal research agent: query analysis → search planning →        │   │
│  │  retrieval → case summarization → answer synthesis + citations   │   │
│  └───────────────┬──────────────────────────────────────────────────┘   │
│                  │ Typesense search API (hybrid + semantic)             │
│                  ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  search-engine-server (Typesense)                                │   │
│  │  /home/paralegaluser/app/search-engine-server                    │   │
│  │  ~107k indexed documents: case law, legislation, constitution    │   │
│  │  Local embeddings: all-MiniLM-L12-v2 (384-dim)                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

| Project | Stack | Port | Role |
|---------|-------|------|------|
| LibreChat | Node 20 / React / Express | 3080 | Chat UI, auth, user mgmt, commercial LLM routing |
| rag-chat-server | Python / FastAPI / Celery | 8123 | Legal research RAG agent (agentic pipeline) |
| search-engine-server | Typesense 0.26 / Node.js indexers | 8108 | Vector + keyword search over legal corpus |

---

## LibreChat Infrastructure (Docker Compose)

```
┌──────────────────────────────────────────────────────────────┐
│                       Docker Host                            │
│                                                              │
│  ┌──────────┐    ┌───────────┐    ┌────────────────────┐     │
│  │  Nginx   │───▶│  API      │───▶│  MongoDB 8.x       │     │
│  │  :80/443 │    │  :3080    │    │  :27017             │     │
│  │          │    │ (Node 20) │    │  users, convos,     │     │
│  └──────────┘    │           │    │  messages, tokens   │     │
│                  └─────┬─────┘    └────────────────────┘     │
│                        │                                      │
│          ┌─────────────┼─────────────┐                        │
│          │             │             │                         │
│   ┌──────▼────┐  ┌─────▼─────┐  ┌───▼───────────┐           │
│   │  Redis    │  │  RAG API  │  │  Meilisearch  │           │
│   │  :6379   │  │  :8000    │  │  :7700        │           │
│   │  config   │  │  embed +  │  │  full-text    │           │
│   │  cache,   │  │  chunk    │  │  search       │           │
│   │  sessions │  └─────┬─────┘  └───────────────┘           │
│   └───────────┘        │                                      │
│                  ┌─────▼──────┐                               │
│                  │  pgvector  │                               │
│                  │  :5432     │                               │
│                  │  vector    │                               │
│                  │  embeddings│                               │
│                  └────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

| Service | Image | Port | Role |
|---------|-------|------|------|
| Nginx | nginx | 80/443 | Reverse proxy, 25MB upload limit, SSL-ready |
| API | librechat (local build) | 3080 | Express/Node 20, Alpine, jemalloc, 6GB heap |
| MongoDB | mongo:8 | 27017 | Users, conversations, messages, invite tokens |
| Redis | redis:7-alpine | 6379 | Config cache (`librechat.yaml`), sessions, JWT (512MB LRU) |
| Meilisearch | meilisearch:v1.35.1 | 7700 | Full-text conversation search |
| RAG API | librechat-rag-api-dev-lite | 8000 | Document chunking and embedding (user-uploaded files) |
| pgvector | pgvector:0.8.0-pg15 | 5432 | Vector store for user-uploaded document embeddings |

---

## Authentication

```
Browser ──▶ Asgardeo (WSO2 IDaaS) ──▶ OpenID Connect (PKCE) ──▶ API
                  ↑
            Auto-redirect
            (no login page)
```

- **Invite-only** — no self-registration, no social login, no email/password
- Users are bulk-invited via `config/bulk-invite.js` (CSV input, branded email output)
- Asgardeo tenant: `paralegallk`, PKCE enabled, auto-redirect (seamless SSO)
- JWT sessions: 15min access / 7-day refresh

---

## LLM Endpoints

```
LibreChat UI
    │
    ├── OpenAI ──────────▶ gpt-4.1, gpt-5.1
    ├── Anthropic ───────▶ claude-sonnet-4-5
    ├── Google ──────────▶ gemini-2.5-pro, flash, flash-lite
    │
    ├── paralegal.lk ───▶ silva-01 ("Junior Silva")       ← localhost:8123
    ├── De Saram AI ────▶ dl-f-de-saram-chat               ← dlft.paralegal.lk
    └── Carrom Bot ─────▶ carrom-bot                       ← carrom.paralegal.lk
```

### Commercial Models

Standard API access to OpenAI, Anthropic, and Google via their respective API keys.

### Custom Legal Research Agents

Three OpenAI-compatible `/v1` endpoints, each backed by a rag-chat-server instance:

| Agent | UI Label | Purpose | Host |
|-------|----------|---------|------|
| silva-01 | Junior Silva | General legal research | `host.docker.internal:8123` (local) |
| dl-f-de-saram-chat | Junior De Saram | D.L. & F. De Saram firm | `dlft.paralegal.lk` |
| carrom-bot | Carrom Case Researcher | Case law research | `carrom.paralegal.lk` |

All three: 200k context / 16k output. File uploads disabled (lawyers use pre-indexed documents).

---

## Legal Research Agent — rag-chat-server

The core differentiator. A multi-step agentic RAG pipeline that turns a lawyer's natural language question into a cited, evidence-based legal answer.

### Request Flow

```
LibreChat POST /v1/chat/completions (Bearer token, SSE streaming)
    │
    ▼
1. Query Analysis (OpenAI / Gemini)
   ├─ RESEARCH_READY      → proceed to RAG pipeline
   ├─ NEEDS_CLARIFICATION  → ask user for details
   ├─ CONTEXT_ANSWERABLE   → answer from conversation history
   ├─ META_QUESTION         → describe system capabilities
   └─ SIMPLE_ACKNOWLEDGMENT → greeting response
    │
    ▼
2. Search Planning (LLM function calling)
   LLM generates a search strategy via tool use:
   ├─ query_type: law_related | case_specific | person_related
   ├─ search steps with mode + filters
   └─ case identifiers (if case_specific)
    │
    ▼
3. Parallel Search Execution (Typesense)
   ├─ Hybrid search (keyword + semantic)
   ├─ Semantic search (vector similarity)
   ├─ Exact search (keyword only)
   ├─ Case number search (infix matching)
   └─ Parties search (normalized "X vs. Y")
   Results reranked, top N selected + high-citation rescue
    │
    ▼
4. Case Preprocessing (LLM per case)
   ├─ Summarize each case
   ├─ Extract legislation & constitution references
   └─ Identify relevant excerpts
    │
    ▼
5. Legislation & Constitution Fetching
   ├─ Acts: SQLite (lex.paralegal.lk) or MongoDB
   └─ Constitution: MongoDB (paralegal_prod.lex collection)
    │
    ▼
6. Answer Synthesis (always OpenAI gpt-4.1)
   Combine case law + legislation + constitution into
   comprehensive cited answer
    │
    ▼
7. Citation Insertion (post-processing)
   ├─ Case numbers → markdown links to paralegal.lk
   └─ Legislation refs → links to lex.paralegal.lk
    │
    ▼
SSE stream to LibreChat (status updates + token-by-token answer)
   Heartbeat every 15s (zero-width space) to prevent Cloudflare 524
```

### rag-chat-server Docker Services

| Service | Port | Role |
|---------|------|------|
| legal-search-api (FastAPI/uvicorn) | 8123 | Main API — query analysis, RAG pipeline, streaming |
| celery-worker | — | Async task processor (legacy `/search` endpoint) |
| redis | 6379 | Celery broker and result backend |

### LLM Usage by Stage

| Stage | Provider | Model |
|-------|----------|-------|
| Query analysis | OpenAI (primary), Gemini (fallback) | gpt-4 / gemini-2.5-flash |
| Search planning | Configurable (`DEFAULT_LLM_PROVIDER`) | Function calling |
| Case summarization | Configurable | Per-case LLM calls |
| Legislation filtering | Configurable | Relevance checking |
| Answer synthesis | **OpenAI (hardcoded)** | gpt-4.1 |

### Multi-turn Conversation

The context compiler builds stage-specific views from conversation history:
- **Search plan context**: turn summary for planning
- **Retrieval query**: rewritten query for keyword search
- **Relevance context**: current question + brief prior summary
- **Synthesis context**: full turn-by-turn history

### Logging

All queries logged to MongoDB Atlas (`paralegal_logs.chat`) with:
- Token usage per stage, search strategy, raw + final answer, case URLs
- Fallback: JSON files in `answers/` directory

---

## Search Engine — search-engine-server

The knowledge base. Typesense indexes ~107k Sri Lankan legal document chunks with local sentence-transformer embeddings.

### Collections

| Collection | Document Type | Count | Source |
|------------|--------------|-------|--------|
| `paralegal` | Case law chunks (SC & CA decisions) | 42,611 | SRI LR 1978–2021 |
| `legislation_sections` | Act sections | 64,606 | Sri Lankan legislation |
| `legislation_sections` | Constitution articles | 271 | 2022 Revised Edition |

### Embedding

- **Model**: `all-MiniLM-L12-v2` (sentence-transformers, 384-dim, runs locally inside Typesense)
- **Index-time**: Typesense auto-embeds text fields (`chunk_text`, `full_section_text`)
- **Query-time**: User query embedded to same space for vector similarity

### Case Law Schema (paralegal collection)

Key fields: `chunk_text`, `chunk_vec` (384-dim), `standard_casenumber` (infix), `nameofparties`, `decision_year`, `sc_or_ca`, `judge_final[]`, `action_type`, `link`

### Legislation Schema (legislation_sections collection)

Key fields: `full_section_text`, `section_vec` (384-dim), `legislation_name`, `legislation_title`, `enactment_year`, `section_number`, `section_content[]`

### Indexing Pipeline

```
Source JSONL files (from /home/paralegaluser/rag-chunk-server/data/after_chunk/)
    │
    ├── chunk_SRI_LR_1978_to_2021_enriched_fixed.jsonl  (case law)
    ├── chunk_legislations.jsonl                          (acts)
    └── chunk_constitution.jsonl                          (constitution)
    │
    ▼
Node.js indexer scripts (batch upsert)
    ├── indexDataInTypesense.js    → paralegal collection (batch 200)
    ├── indexLegislationData.js    → legislation_sections (batch 100, recreates)
    └── indexConstitution.js       → legislation_sections (batch 100, appends)
    │
    ▼
Typesense 0.26 (port 8108)
    ├── Auto-embeds via all-MiniLM-L12-v2
    └── Stores in RocksDB
```

### Dual Typesense Instances (Production)

The rag-chat-server queries two remote Typesense hosts:

| Client | Host | Collection | Purpose |
|--------|------|------------|---------|
| Chunk client | `www.chat.paralegal.lk:443` | `paralegal` | Semantic + hybrid search over case chunks |
| Decision client | `www.dev.paralegal.lk:443` | `paralegal` | Full decision text retrieval |

The local Typesense server (port 8108) is for development and re-indexing.

---

## User-Uploaded Document Pipeline (RAG + OCR)

Separate from the legal research pipeline. This handles ad hoc file uploads within LibreChat conversations:

```
Upload (PDF/DOCX/images, max 10 files / 50MB per conversation)
    │
    ├── Native PDF/DOCX ──▶ RAG API ──▶ chunk ──▶ OpenAI embeddings ──▶ pgvector
    │                                              (text-embedding-3-small)
    │
    └── Scanned PDF/Images ──▶ Mistral OCR ──▶ text ──▶ injected as context
                                (mistral-ocr-latest)
```

- Enabled for OpenAI, Anthropic, Google endpoints
- **Disabled** for custom legal research agents (lawyers use pre-indexed corpus)
- Supported formats: PDF, DOCX, PPTX, XLSX, EPUB, JPG, PNG, WebP, HEIC, HEIF

---

## Agents

The LibreChat Agents system composes multi-step tool-using agents:

- **Providers**: OpenAI, Anthropic, and all three custom legal endpoints
- **Capabilities**: file_search, web_search, actions, context, tools, chain, OCR
- **Recursion limit**: 150 steps (max 200)

Lawyers can build agents that chain calls across legal research backends and commercial LLMs.

---

## Code Customizations (vs Upstream LibreChat)

The fork is intentionally light on code changes — most customization is config-driven:

| What | Path | Description |
|------|------|-------------|
| Email templates | `api/server/utils/emails/*.handlebars` | Branded HTML with paralegal.lk branding |
| Bulk invite script | `config/bulk-invite.js` | CSV-driven user provisioning with email delivery |
| Custom asset | `client/public/assets/minion-legal.png` | De Saram AI icon |
| Pre-build cleanup | `scripts/pre-build-cleanup.sh` | Memory management for low-RAM Docker builds |
| Integration notes | `notes/` | Asgardeo, RAG/OCR setup guides |

Everything else — endpoints, models, auth, file handling, rate limits — is pure configuration in `.env` and `librechat.yaml`.

---

## Fork Maintenance

```
upstream/main ──▶ main (clean mirror) ──▶ dev ──▶ prod
                                           ↑
                                     feature branches
```

| Branch | Purpose |
|--------|---------|
| `main` | Clean mirror of upstream — never commit directly |
| `dev` | Active development, all feature PRs merge here |
| `prod` | Production deployment |

Remotes: `origin` = ParalegalLK/LibreChat, `upstream` = danny-avila/LibreChat.

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `.env` | API keys, endpoints, auth, rate limits, feature flags |
| `librechat.yaml` | Model specs, endpoint config, file handling, speech |
| `docker-compose.yml` | LibreChat service definitions |
| `docker-compose.override.yml` | Local dev overrides (Redis persistence, volume mounts) |
| `deploy-compose.yml` | Production compose with pre-built images + Nginx |
| `Dockerfile` | Multi-stage Alpine build (Node 20, jemalloc) |
| `client/nginx.conf` | Reverse proxy config (SSL-ready) |

---

## End-to-End Example: Lawyer Asks a Legal Question

```
1. Lawyer opens devchat.paralegal.lk → auto-redirected to Asgardeo SSO → logged in
2. Selects "Junior Silva" endpoint in LibreChat UI
3. Types: "What is the law on adverse possession of government land?"
4. LibreChat POSTs to rag-chat-server at localhost:8123/v1/chat/completions
5. Query analyzer classifies as RESEARCH_READY
6. LLM creates search plan: 3 hybrid searches + 1 legislation search
7. Typesense returns top case chunks (ranked by semantic similarity + BM25)
8. Each case summarized by LLM, legislation/constitution refs extracted
9. Relevant Acts fetched from lex.paralegal.lk, constitution articles from MongoDB
10. OpenAI gpt-4.1 synthesizes final answer from all sources
11. Citation inserter converts case numbers to clickable paralegal.lk links
12. Answer streamed token-by-token back through LibreChat UI
13. Query logged to MongoDB Atlas (paralegal_logs.chat)
```

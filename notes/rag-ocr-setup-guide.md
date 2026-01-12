# LibreChat RAG & OCR Setup Guide

## Overview

This guide sets up:
- **RAG (Retrieval-Augmented Generation)** - Chat with uploaded documents using vector search
- **OCR** - Extract text from scanned documents using Mistral

## Architecture

```
User uploads file
       |
+----------------------------------------------+
| File Search (native PDFs)                    |
|   -> RAG API -> OpenAI Embeddings -> pgvector|
|   -> Query retrieves relevant chunks         |
+----------------------------------------------+
| File Context/OCR (scanned PDFs)              |
|   -> Mistral OCR -> Text in agent context    |
+----------------------------------------------+
```

## Prerequisites

- Docker & Docker Compose installed
- OpenAI API key (for embeddings)
- Mistral API key (for OCR)

---

## Step 1: Docker Compose Services

Ensure `docker-compose.yml` includes these services:

```yaml
services:
  api:
    depends_on:
      - mongodb
      - rag_api
    environment:
      - RAG_PORT=${RAG_PORT:-8000}
      - RAG_API_URL=http://rag_api:${RAG_PORT:-8000}

  vectordb:
    container_name: vectordb
    image: pgvector/pgvector:0.8.0-pg15-trixie
    environment:
      POSTGRES_DB: mydatabase
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: mypassword
    restart: always
    volumes:
      - pgdata2:/var/lib/postgresql/data

  rag_api:
    container_name: rag_api
    image: ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest
    environment:
      - DB_HOST=vectordb
      - RAG_PORT=${RAG_PORT:-8000}
    restart: always
    depends_on:
      - vectordb
    env_file:
      - .env

volumes:
  pgdata2:
```

---

## Step 2: Environment Variables

Add to `.env`:

```bash
#==================================================#
#                        RAG                       #
#==================================================#

RAG_API_URL=http://rag_api:8000
RAG_OPENAI_API_KEY=sk-your-openai-api-key
EMBEDDINGS_PROVIDER=openai
EMBEDDINGS_MODEL=text-embedding-3-small

# Optional: for securing RAG API
RAG_API_KEY=generate-a-random-string-here

#==================================================#
#                    Mistral OCR                   #
#==================================================#

MISTRAL_API_KEY=your-mistral-api-key
```

---

## Step 3: librechat.yaml Configuration

Add/update these sections:

```yaml
version: 1.2.1
cache: true

fileStrategy: "local"

fileConfig:
  # OCR processing for scanned documents
  ocr:
    supportedMimeTypes:
      - "^image/(jpeg|gif|png|webp|heic|heif)$"
      - "^application/pdf$"
      - "^application/vnd\\.openxmlformats-officedocument\\.(wordprocessingml\\.document|presentationml\\.presentation|spreadsheetml\\.sheet)$"
      - "^application/vnd\\.ms-(word|powerpoint|excel)$"
      - "^application/epub\\+zip$"
  endpoints:
    openAI:
      fileLimit: 10
      fileSizeLimit: 50
      supportedMimeTypes:
        - "application/pdf"
        - "text/.*"
        - "application/vnd.*"
        - "image/.*"
    agents:
      fileLimit: 10
      fileSizeLimit: 50
      supportedMimeTypes:
        - "application/pdf"
        - "text/.*"
        - "application/vnd.*"
        - "image/.*"

ocr:
  strategy: "mistral_ocr"
  apiKey: "${MISTRAL_API_KEY}"
  baseURL: "https://api.mistral.ai/v1"
  mistralModel: "mistral-ocr-latest"

endpoints:
  agents:
    capabilities:
      - file_search
      - ocr
      # ... other capabilities
```

---

## Step 4: Deploy

```bash
# Start all services
docker compose up -d

# Verify RAG API is running
docker compose logs api | grep "RAG API"
# Should show: "RAG API is running and reachable at http://rag_api:8000"

# Verify embeddings are working
docker compose logs rag_api | grep "Initialized embeddings"
# Should show: "Initialized embeddings of type: <class 'langchain_openai.embeddings.base.OpenAIEmbeddings'>"
```

---

## Step 5: Apply Config Changes (after any updates)

```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

Then hard-refresh browser (Ctrl+Shift+R).

---

## Usage Guide for End Users

| Document Type | Upload Method | How it Works |
|---------------|---------------|--------------|
| Native PDF (selectable text) | Agents -> File Search | RAG: chunks, embeds, retrieves |
| Scanned PDF / Images | Agents -> File Context (OCR) | Mistral OCR extracts text to context |
| Text files | Either method | Direct text extraction |

---

## Verification Commands

```bash
# Check services are running
docker compose ps

# Check RAG API logs
docker compose logs -f rag_api

# Check embeddings count in vector DB
docker compose exec vectordb psql -U myuser -d mydatabase \
  -c "SELECT COUNT(*) FROM langchain_pg_embedding;"

# Check API logs for file processing
docker compose logs api | grep -i "file\|rag\|ocr"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "RAG API is not reachable" | Check `RAG_API_URL` in .env, verify rag_api container is running |
| Files not embedding | Check `RAG_OPENAI_API_KEY` is valid |
| OCR not working | Verify `MISTRAL_API_KEY`, use "File Context (OCR)" not "File Search" |
| Changes not applying | Flush Redis: `docker compose exec librechat-redis redis-cli FLUSHALL` |

---

## Key Limitation

OCR does **not** work with File Search/RAG. For scanned documents:
- Use **File Context (OCR)** upload option
- Or convert to native PDF before uploading to File Search

---

## References

- [RAG API Configuration](https://www.librechat.ai/docs/configuration/rag_api)
- [OCR Configuration](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/ocr)
- [File Config](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/file_config)
- [RAG API GitHub](https://github.com/danny-avila/rag_api)

# Overall Context

I run LibreChat (https://github.com/danny-avila/LibreChat) as a managed service for law firms. I have my own legal deep research agent exposed as a tool call so lawyers can use it with LLMs in their daily workflows.

# Common Commands

## User Management
**Note:** Always use `-T` flag with `docker compose exec` to avoid "input device is not a TTY" errors.

```bash
# Create single user (interactive - run manually in terminal)
docker-compose exec api npm run create-user

# Bulk invite users (from config/bulk-invite.js)
docker compose exec -T api node config/bulk-invite.js /app/config/my-invite.txt /app/config/results.csv

# Send password reset email
docker compose exec -T api node config/send-password-reset.js user@example.com

# Query users
docker compose exec -T mongodb mongosh --eval "db.getSiblingDB('LibreChat').users.find({email: /pattern/i}, {email:1, name:1})"

# Check pending invite tokens
docker compose exec -T mongodb mongosh --eval "db.getSiblingDB('LibreChat').tokens.find({email: /pattern/i})"
```

## Docker Operations
```bash
docker-compose ps          # Check running services
docker-compose logs -f api # Follow API logs
docker-compose restart api # Restart API service
```

## Docker Builds (Free Memory First)
Docker builds can crash on low-memory systems. Run the cleanup script before building:
```bash
# Cleanup and show status (stops containers, clears caches, frees memory)
./scripts/pre-build-cleanup.sh

# Or cleanup and build in one go
./scripts/pre-build-cleanup.sh --build
```

The script does:
1. Stops all Docker containers
2. Prunes Docker (containers, images, build cache)
3. Clears Linux page cache (sudo)
4. Restarts swap (sudo)
5. Shows memory/disk status

## Redis Cache
LibreChat caches config (including `librechat.yaml` settings) in Redis. After changing UI/config settings, flush the cache and restart the API:
```bash
./scripts/flush-config-cache.sh
docker compose restart api
```
Then hard-refresh the browser (Ctrl+Shift+R).

**Never use `redis-cli FLUSHALL`** — Redis also holds `OPENID_SESSION:*` keys (server-side SSO
sessions). FLUSHALL signs every user out: their next token refresh fails against Asgardeo and
they land on the login page. The script deletes only config/roles/tool caches.

## S3 PDF Links (private URL generator)

Markdown links to `paralegal-prod` / `paralegal-decisions` S3 objects are opened via `POST /api/pdf/open`
(`api/server/routes/pdf.js`), which asks the private URL generator (`PDF_GENERATOR_URL`, default
`https://www.dev.paralegal.lk/api/pdf/get-pdf-url`) for a presigned URL.

- SSO sign-ins forward the user's own Asgardeo access token.
- Email + password sign-ins (including `provider: openid` accounts that still have a password) have **no**
  Asgardeo token. The route falls back to `PDF_GENERATOR_SERVICE_TOKEN`, then a client-credentials grant
  using `PDF_GENERATOR_CLIENT_ID/SECRET` (default `OPENID_CLIENT_ID/SECRET`), and forwards the request
  regardless — the generator decides. Look for `tokenSource` (`user` / `service` / `none`) in the
  `[pdf.open]` log lines when triaging.

## Adding a New OpenAI Model

To add a new OpenAI model (e.g., GPT-5.1), update two files:

### Step 1: Add to `.env`
Add the model to the `OPENAI_MODELS` list:
```bash
OPENAI_MODELS=gpt-4.1,gpt-5.1
```

### Step 2: Add to `librechat.yaml` (recommended)
Add a modelSpec entry to configure token limits and display settings:
```yaml
modelSpecs:
  list:
    - name: "gpt-5.1"
      label: "GPT-5.1"
      description: "OpenAI's GPT-5.1 model"
      preset:
        endpoint: "openAI"
        model: "gpt-5.1"
        maxContextTokens: 400000    # Check OpenAI docs for actual limit
        max_tokens: 128000          # Check OpenAI docs for actual limit
```

### Step 3: Apply changes
```bash
./scripts/flush-config-cache.sh
docker compose restart api
```
Then hard-refresh the browser (Ctrl+Shift+R) and start a **new conversation**.

### Finding model limits
Check OpenAI's model comparison page for token limits:
https://platform.openai.com/docs/models/compare

### Troubleshooting

#### Model not showing in dropdown
1. **Check `.env`** - Is the model in `OPENAI_MODELS`?
   ```bash
   grep OPENAI_MODELS .env
   ```
2. **Flush cache and restart**
   ```bash
   ./scripts/flush-config-cache.sh
   docker compose restart api
   ```
3. **Hard refresh browser** (Ctrl+Shift+R)
4. **Check you're on the right endpoint** - Select "OpenAI" not "Agents"

#### Model shows but wrong one is used
1. **Start a NEW conversation** - Old conversations lock to their original model
2. **Check conversation model in database:**
   ```bash
   docker compose exec mongodb mongosh --quiet --eval \
     "db.getSiblingDB('LibreChat').conversations.find({}, {endpoint:1, model:1}).sort({updatedAt:-1}).limit(5).toArray()"
   ```

#### "max_tokens is too large" error
This means wrong model is being sent to OpenAI. Check:
1. **Verify model in conversation:**
   ```bash
   docker compose exec mongodb mongosh --quiet --eval \
     "db.getSiblingDB('LibreChat').conversations.findOne({conversationId: 'YOUR_CONVO_ID'}, {model:1, endpoint:1})"
   ```
2. If it shows old model, **start a new conversation**

#### Check what config API loaded
```bash
docker compose logs api --tail 200 | grep -A5 "modelSpecs"
```

#### Verify Redis is cleared
```bash
docker compose exec librechat-redis redis-cli KEYS "*"
```
Should return empty or minimal keys after flush.

#### Debug API requests
Enable debug logging temporarily:
```bash
# In .env
DEBUG_OPENAI=true
```
Then restart and check logs:
```bash
docker compose restart api
docker compose logs -f api
```

#### Nuclear option - full reset
```bash
./scripts/flush-config-cache.sh   # while redis is still up
docker compose down
docker compose up -d
```
Then hard refresh browser and start new conversation.

# Project Structure

## Key Customizations
- `api/server/utils/emails/` - Email templates (custom branding)
- `config/bulk-invite.js` - Bulk user invitation script
- `config/send-password-reset.js` - Send password reset email to user
- `.env` - Environment config

## MongoDB Collections
- `users` - User accounts
- `tokens` - Invite/verification tokens
- `conversations` - Chat history
- `messages` - Individual messages

# Fork Maintenance Workflow

## Git Remotes
- `origin` → ParalegalLK/LibreChat (my fork)
- `upstream` → danny-avila/LibreChat (original)

## Branch Structure
```
upstream/main → main (mirror) → dev (development) → prod (production)
                                  ↑
                            feature branches
```

| Branch | Purpose |
|--------|---------|
| `main` | Clean mirror of upstream (never commit directly) |
| `dev` | Development - all feature PRs merge here first |
| `prod` | Production - deploy from this branch |

## Feature Development Workflow
```bash
# 1. Start a new feature (branch off dev)
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# 2. Develop and test locally
# ... make changes ...

# 3. Push and create PR to dev
git push origin feature/my-feature
# Create PR: feature/my-feature → dev

# 4. After testing on dev, create PR to prod
# Create PR: dev → prod

# 5. Deploy from prod
git checkout prod
git pull origin prod
# Deploy to production server
```

## Syncing Upstream Updates
```bash
# 1. Update main from upstream
git fetch upstream
git checkout main
git merge upstream/main
git push origin main

# 2. Merge upstream changes into dev
git checkout dev
git merge main
git push origin dev

# 3. Test on dev, then PR to prod when ready
```

## Handling Merge Conflicts
1. Fix conflicts in files
2. `git add <fixed-files>`
3. `git commit` (or `git merge --continue`)

## Fixing package-lock.json Conflicts in PRs

When a PR fails CI with `npm ci` errors like "Missing: package@version from lock file", it means `package-lock.json` is out of sync. This happens because CI merges the target branch into your feature branch, causing lock file conflicts.

**Solution:** Merge the target branch locally, regenerate the lock file, and push:
```bash
# 1. Merge target branch (e.g., dev) into your feature branch
git checkout feature/my-feature
git merge dev

# 2. If package-lock.json has conflicts, regenerate it
git checkout --ours package-lock.json
npm install

# 3. Commit and push
git add package-lock.json
git commit -m "Merge dev and regenerate package-lock.json"
git push origin feature/my-feature
```

This ensures CI gets the already-merged state with no conflicts.
# LibreChat

## Project Overview

LibreChat is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server — minimize changes here |
| `/packages/api` | **TypeScript** | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here (TS only, consumed by `/api`) |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects |
| `/packages/data-provider` | TypeScript | Shared | — | Shared API types, endpoints, data-service — used by both frontend and backend |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities |

The source code for `@librechat/agents` (major backend dependency, same team) lives at
<https://github.com/danny-avila/agents>.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.

---

## Code Style

### Naming and File Organization

- **Single-word file names** whenever possible (e.g., `permissions.ts`, `capabilities.ts`, `service.ts`).
- When multiple words are needed, prefer grouping related modules under a **single-word directory** rather than using multi-word file names (e.g., `admin/capabilities.ts` not `adminCapabilities.ts`).
- The directory already provides context — `app/service.ts` not `app/appConfigService.ts`.

### Structure and Clarity

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce` over imperative loops. Only reach for OOP when it clearly improves domain modeling or state encapsulation.
- **No dynamic imports** unless absolutely necessary.

### DRY

- Extract repeated logic into utility functions.
- Reusable hooks / higher-order components for UI patterns.
- Parameterized helpers instead of near-duplicate functions.
- Constants for repeated values; configuration objects over duplicated init code.
- Shared validators, centralized error handling, single source of truth for business rules.
- Shared typing system with interfaces/types extending common base definitions.
- Abstraction layers for external API interactions.

### Iteration and Performance

- **Minimize looping** — especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Backend Database Performance

- On request startup and first page load paths, watch for serial database reads.
  Multiple round trips to MongoDB can add significant latency when the database
  is far from the app server.
- Prefer passing already-loaded request/user/config data through helper
  functions instead of re-reading the same user, role, tenant, or principal data.
- When two reads are independent, start them in parallel and gate the response
  on the authorization or validation result before returning data.
- Keep authorization, permission, and tenant checks semantically identical when
  parallelizing reads. Speculative reads must remain scoped to the authenticated
  user or tenant and must not write to the response before validation succeeds.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** — avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** — before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed — do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** — sorted shortest to longest line length (`react` always first).
2. **`import type` imports** — sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** — sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` — never inline `type` inside value imports.

### JS/TS Loop Preferences

- **Limit looping as much as possible.** Prefer single-pass transformations and avoid re-iterating the same data.
- `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- `for...of` for simple array iteration.
- `for...in` only for object property enumeration.

---

## Frontend Rules (`client/src/**/*`)

### Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json` (other languages are automated externally).
- Semantic key prefixes: `com_ui_`, `com_assistants_`, etc.

### Components

- TypeScript for all React components with proper type imports.
- Semantic HTML with ARIA labels (`role`, `aria-label`) for accessibility.
- Group related components in feature directories (e.g., `SidePanel/Memories/`).
- Use index files for clean exports.

### Theming and styling

- **Compose before styling.** Search `@librechat/client` for an existing primitive, semantic
  variant, or composition before adding feature-local classes or CSS.
- **Use semantic roles.** Colors and shared appearance values must come from the semantic
  Tailwind/theme roles. Do not add raw palette utilities, hard-coded hex/RGB/HSL colors, or
  light/dark-specific values in feature components.
- **Deepen the system when the need is reusable.** Add a focused variant to a shared primitive or
  extend the canonical, versioned theme-token registry when multiple screens should share the
  same design decision. Do not create shallow local wrappers that merely relocate class strings.
- **Themes are data, not arbitrary CSS.** Theme definitions may select semantic colors and shared
  appearance roles. They must not contain selectors, arbitrary CSS, application behavior, or
  alternate feature layouts. Preserve existing environment and stored-theme compatibility when
  changing the theme engine.
- **Keep layout and behavior local.** Feature structure, responsive layout, state-driven
  transitions, and specialized visualization may remain feature-owned. Expose a theme role only
  when it represents a stable, reusable appearance decision; do not turn every measurement into a
  global token.
- **Treat custom CSS as an exception.** Use it only when shared primitives and semantic utilities
  cannot express the requirement. Keep it narrowly scoped, consume theme variables where
  applicable, support light/dark and reduced motion, and add a brief code or PR explanation of why
  the exception is necessary.
- **Preserve defaults and prove variability.** New theme-aware variants must reproduce the current
  default appearance unless a redesign is explicitly requested. Test semantic-token use and, when
  extending theme capabilities, include a deliberately different reference theme to prove that
  components adapt without feature-specific overrides.

### Data Management

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` → `[Feature]/index.ts` → `client/src/data-provider/index.ts`.
- React Query (`@tanstack/react-query`) for all API interactions; proper query invalidation on mutations.
- QueryKeys and MutationKeys in `packages/data-provider/src/keys.ts`.

### Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`
- Data service: `packages/data-provider/src/data-service.ts`
- Types: `packages/data-provider/src/types/queries.ts`
- Use `encodeURIComponent` for dynamic URL parameters.

### Performance

- Prioritize memory and speed efficiency at scale.
- Cursor pagination for large datasets.
- Proper dependency arrays to avoid unnecessary re-renders.
- Leverage React Query caching and background refetching.

---

## Backend Rules (`api/**`, `packages/api/**`)

### Auth cache invalidation

When adding or changing code that mutates user documents, invalidate the auth user document cache
for the affected users. This covers single-user updates as well as bulk role and user mutations.
Without it, OpenID JWT request burst caching can serve a stale `req.user` until its TTL expires.

---

## Development Commands

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run backend` | Start the backend server |
| `npm run backend:dev` | Start backend with file watching (development) |
| `npm run build` | Build all compiled code via Turborepo (parallel, cached) |
| `npm run frontend` | Build all compiled code sequentially (legacy fallback) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |

- Node.js: v24.16.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies. Mocking is a last resort.
- **Spies over mocks.** Assert that real functions are called with expected arguments and frequency without replacing underlying logic.
- **MongoDB**: use `mongodb-memory-server` for a real in-memory MongoDB instance. Test actual queries and schema validation, not mocked DB calls.
- **MCP**: use real `@modelcontextprotocol/sdk` exports for servers, transports, and tool definitions. Mirror real scenarios, don't stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services, non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.

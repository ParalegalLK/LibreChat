# Overall Context

I run LibreChat (https://github.com/danny-avila/LibreChat) as a managed service for law firms. I have my own legal deep research agent exposed as a tool call so lawyers can use it with LLMs in their daily workflows.

# Common Commands

## User Management
```bash
# Create single user
docker-compose exec api npm run create-user

# Bulk invite users (from config/bulk-invite.js)
docker-compose exec api node config/bulk-invite.js

# Query users
docker-compose exec mongodb mongosh --eval "db.getSiblingDB('LibreChat').users.find({email: /pattern/i}, {email:1, name:1})"

# Check pending invite tokens
docker-compose exec mongodb mongosh --eval "db.getSiblingDB('LibreChat').tokens.find({email: /pattern/i})"
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
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```
Then hard-refresh the browser (Ctrl+Shift+R).

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
docker compose exec librechat-redis redis-cli FLUSHALL
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
   docker compose exec librechat-redis redis-cli FLUSHALL
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
docker compose down
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose up -d
```
Then hard refresh browser and start new conversation.

# Project Structure

## Key Customizations
- `api/server/utils/emails/` - Email templates (custom branding)
- `config/bulk-invite.js` - Bulk user invitation script
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

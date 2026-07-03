# Overall Context

I run LibreChat (https://github.com/danny-avila/LibreChat) as a managed service for law firms. I have my own legal deep research agent exposed as a tool call so lawyers can use it with LLMs in their daily workflows.

# Permission / Elevation Defaults
- Default to elevated permissions for operational read commands that require Docker socket or host access (for example `docker compose ps`, `docker compose logs`, `docker compose exec -T ... mongosh --eval`, Redis reads, and similar diagnostics).
- Do not repeatedly ask for permission for the same safe read-only command pattern once approved; reuse stored prefix approvals.
- Keep explicit approval for destructive or state-changing actions (for example deletes, resets, pruning, writes outside workspace, schema/data mutation, container/image removal).

# Common Commands

## User Management
**Note:** Always use `-T` flag with `docker compose exec` to avoid "input device is not a TTY" errors.
**Note:** For `mongosh --eval` commands wrapped in double quotes, always escape Mongo `$` operators as `\$` (for example `\$regex`, `\$in`, `\$or`) so Bash does not remove them before `mongosh` runs.

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

# Search chat history - "Who asked about X?"
# Step 1: Find messages matching the search term
docker compose exec -T mongodb mongosh --quiet --eval "db.getSiblingDB('LibreChat').messages.find({text: /SEARCH_TERM/i, isCreatedByUser: true}, {text:1, user:1, createdAt:1}).sort({createdAt:-1}).limit(10)"

# Step 2: Look up user by ID from results
docker compose exec -T mongodb mongosh --quiet --eval "db.getSiblingDB('LibreChat').users.findOne({_id: ObjectId('USER_ID')}, {name:1, email:1})"

# Domain count example (escaped $ operators)
docker compose exec -T mongodb mongosh --quiet --eval "db.getSiblingDB('LibreChat').users.countDocuments({email:{\$regex:/@desaram\.com$/i}})"
```

**Note:** When I ask "who asked about X?" or similar questions, search the MongoDB `messages` collection for that topic and look up the user. The `user` field is a string ID, so use a two-step query.

## Web Search Usage
**Note:** Web search usage can be retrieved directly from the MongoDB `messages` collection. Assistant messages that used web search contain an attachment with `type: "web_search"`.
**Note:** For these message documents, the `user` field is stored as a string, while `users._id` is an `ObjectId`, so use `\$toObjectId` before joining to `users`.
**Note:** Custom models such as `junior de saram` and `silva` cannot use web search, so if a turn has a `web_search` attachment it did not run on those custom models.
**Note:** Assistant replies may have empty top-level `text`; the actual answer may be stored in the `content` array under entries with `type: "text"`.
**Note:** LibreChat allows switching model/endpoint per turn. The `conversations.model` and `conversations.endpoint` fields reflect only the most recent turn. To determine which model actually answered a given question, read the per-message `model`, `endpoint`, and `sender` fields on the `messages` collection — filtering by `conversations.model` will miss earlier turns that used a different model.
**Note:** For file search lookups, use the same instructions and queries below but replace `web_search` with `file_search`.

```bash
# Count distinct users who used web search on a UTC day
docker compose exec -T mongodb mongosh --quiet --eval 'db.getSiblingDB("LibreChat").messages.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-05-05T00:00:00Z"),
        $lt: ISODate("2026-05-06T00:00:00Z")
      },
      attachments: { $elemMatch: { type: "web_search" } }
    }
  },
  { $group: { _id: "$user" } },
  { $count: "distinctUsers" }
]).toArray()'

# List which users used web search on a UTC day, with counts
docker compose exec -T mongodb mongosh --quiet --eval 'db.getSiblingDB("LibreChat").messages.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-05-05T00:00:00Z"),
        $lt: ISODate("2026-05-06T00:00:00Z")
      },
      attachments: { $elemMatch: { type: "web_search" } }
    }
  },
  { $addFields: { userObjId: { $toObjectId: "$user" } } },
  { $lookup: { from: "users", localField: "userObjId", foreignField: "_id", as: "userDoc" } },
  { $unwind: "$userDoc" },
  {
    $group: {
      _id: "$user",
      email: { $first: "$userDoc.email" },
      name: { $first: "$userDoc.name" },
      messageCount: { $sum: 1 },
      conversations: { $addToSet: "$conversationId" }
    }
  },
  {
    $project: {
      _id: 0,
      email: 1,
      name: 1,
      messageCount: 1,
      conversationCount: { $size: "$conversations" }
    }
  },
  { $sort: { messageCount: -1 } }
]).toArray()'

# Show prompts that produced web search replies, excluding a specific user ID
docker compose exec -T mongodb mongosh --quiet --eval 'db.getSiblingDB("LibreChat").messages.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-05-05T00:00:00Z"),
        $lt: ISODate("2026-05-06T00:00:00Z")
      },
      user: { $ne: "ELIJAH_USER_ID" },
      attachments: { $elemMatch: { type: "web_search" } }
    }
  },
  { $addFields: { userObjId: { $toObjectId: "$user" } } },
  { $lookup: { from: "users", localField: "userObjId", foreignField: "_id", as: "userDoc" } },
  { $unwind: "$userDoc" },
  { $lookup: { from: "messages", localField: "parentMessageId", foreignField: "messageId", as: "parentMsg" } },
  {
    $project: {
      _id: 0,
      email: "$userDoc.email",
      createdAt: 1,
      prompt: {
        $let: {
          vars: { p: { $arrayElemAt: ["$parentMsg", 0] } },
          in: { $ifNull: ["$$p.text", ""] }
        }
      }
    }
  },
  { $sort: { email: 1, createdAt: 1 } }
]).toArray()'

# Show prompt and answer for web search replies, excluding a specific user ID
docker compose exec -T mongodb mongosh --quiet --eval 'db.getSiblingDB("LibreChat").messages.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-05-05T00:00:00Z"),
        $lt: ISODate("2026-05-06T00:00:00Z")
      },
      user: { $ne: "ELIJAH_USER_ID" },
      attachments: { $elemMatch: { type: "web_search" } }
    }
  },
  { $addFields: { userObjId: { $toObjectId: "$user" } } },
  { $lookup: { from: "users", localField: "userObjId", foreignField: "_id", as: "userDoc" } },
  { $unwind: "$userDoc" },
  { $lookup: { from: "messages", localField: "parentMessageId", foreignField: "messageId", as: "parentMsg" } },
  {
    $project: {
      _id: 0,
      email: "$userDoc.email",
      createdAt: 1,
      prompt: {
        $let: {
          vars: { p: { $arrayElemAt: ["$parentMsg", 0] } },
          in: { $ifNull: ["$$p.text", ""] }
        }
      },
      answer: {
        $reduce: {
          input: {
            $filter: {
              input: "$content",
              as: "c",
              cond: {
                $and: [
                  { $eq: ["$$c.type", "text"] },
                  { $ne: ["$$c.text", null] },
                  { $ne: ["$$c.text", ""] }
                ]
              }
            }
          },
          initialValue: "",
          in: {
            $cond: [
              { $eq: ["$$value", ""] },
              "$$this.text",
              { $concat: ["$$value", "\n\n", "$$this.text"] }
            ]
          }
        }
      }
    }
  },
  { $sort: { email: 1, createdAt: 1 } }
]).toArray()'
```

**Note:** If I specifically ask for raw web search callback volume rather than persisted message usage, use API logs and search for `[onSearchResults]`. Log counts can be higher than message counts because one assistant reply may trigger multiple web search callback events.

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

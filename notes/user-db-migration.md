# LibreChat Conversation Migration: desaram.com Users

## Overview

Migrate conversations of `desaram.com` email users from one LibreChat instance to another. The common key between instances is **email address**.

## Strategy

Let users create accounts on the target instance first (via self-registration or bulk invite), then migrate their conversation data with ID remapping.

### Why create accounts first?

- Users set their own passwords (no need to transfer hashes or force resets)
- Email verification flows naturally
- SSO/OAuth links are set up correctly on the new instance
- No risk of importing stale auth data (tokens, sessions, refresh tokens)

## Data Relationships

The key linking pattern in LibreChat:

```
users._id (ObjectId) --> stored as STRING in conversations.user, messages.user
```

Migration is a two-step lookup: **email → user _id → all linked data**.

### User field type varies by collection

| Type | Collections |
|------|-------------|
| String | conversations, messages, presets, conversationTag, sharedLink, pluginAuth |
| ObjectId | files, balance, memoryEntry, toolCall, agent, prompt, promptGroup |

## Collections to Migrate

### Must migrate (core conversation data)

| Collection | Link Field | Link Type | Notes |
|---|---|---|---|
| `conversations` | `user` | string | All chats |
| `messages` | `user` + `conversationId` | string | All messages in those convos |

### Should migrate (conversation-adjacent)

| Collection | Link Field | Link Type | Notes |
|---|---|---|---|
| `conversationTag` | `user` | string | Custom tags on conversations |
| `sharedLink` | `user` | string | Shared conversation links |
| `files` | `user` + `conversationId` | ObjectId | Uploaded files referenced in messages |
| `toolCall` | `user` + `conversationId` | ObjectId | Tool execution records |

### Optional (user preferences, not conversation-specific)

| Collection | Link Field | Link Type |
|---|---|---|
| `presets` | `user` | string |
| `memoryEntry` | `userId` | ObjectId |
| `balance` | `user` | ObjectId |
| `pluginAuth` | `userId` | string |
| `agent` | `author` | ObjectId |
| `prompt` / `promptGroup` | `author` | ObjectId |

### Skip (do not migrate)

- `users` — created fresh on target
- `tokens` — session/invite tokens, not portable
- `sessions` — refresh token sessions, not portable

## Migration Flow

### Step 1: Invite users on target instance

Use `bulk-invite.js` or let users self-register on the new instance.

### Step 2: Build ID mapping

Query both instances to build an email-to-ID mapping:

```bash
# Source instance: get old user IDs
docker compose exec -T mongodb mongosh --quiet --eval "
  db.getSiblingDB('LibreChat').users.find(
    {email: /@desaram\.com$/i},
    {_id:1, email:1, name:1}
  ).toArray()
"

# Target instance: get new user IDs (same command on target)
```

This produces a mapping like:

```
{ "user@desaram.com": { old_id: "abc123", new_id: "xyz789" } }
```

### Step 3: Export from source

```bash
# Conversations (user field is STRING)
mongoexport --db LibreChat --collection conversations \
  --query '{"user": {"$in": ["oldId1","oldId2"]}}' \
  --out conversations.json

# Messages (user field is STRING)
mongoexport --db LibreChat --collection messages \
  --query '{"user": {"$in": ["oldId1","oldId2"]}}' \
  --out messages.json

# ConversationTags
mongoexport --db LibreChat --collection conversationTag \
  --query '{"user": {"$in": ["oldId1","oldId2"]}}' \
  --out conversationTags.json

# Files (user field is ObjectId — need $oid syntax)
mongoexport --db LibreChat --collection files \
  --query '{"user": {"$in": [{"$oid":"oldId1"},{"$oid":"oldId2"}]}}' \
  --out files.json
```

### Step 4: Remap user IDs

For each exported JSON file, replace all old user IDs with new user IDs. For string fields this is a straightforward find-and-replace. For ObjectId fields, replace the `$oid` value.

### Step 5: Import on target

```bash
mongoimport --db LibreChat --collection conversations --file conversations.json
mongoimport --db LibreChat --collection messages --file messages.json
mongoimport --db LibreChat --collection conversationTag --file conversationTags.json
mongoimport --db LibreChat --collection files --file files.json
```

### Step 6: Post-import cleanup

```bash
# Flush Redis cache
docker compose exec librechat-redis redis-cli FLUSHALL

# Restart API
docker compose restart api

# Trigger Meilisearch reindex if full-text search is enabled
# (imported docs won't appear in search until reindexed)
```

## Critical Considerations

1. **ID remapping is required** — New accounts get new `_id` values. All `user` fields in exported data must be remapped from old ID to new ID before importing.

2. **Unique indexes** — `conversationId` and `messageId` are globally unique. Collisions will cause import failures (unlikely unless users were active on both instances).

3. **File blobs** — The `files` collection only stores metadata. Actual file content (on disk or S3) must be copied separately, and `filepath` values may need updating if storage paths differ.

4. **Meilisearch** — After import, search index won't include new data. Trigger a reindex or flush Meilisearch.

5. **String vs ObjectId** — The `user` field is a string in conversations/messages but an ObjectId in files/toolCall. Handle both types during remapping.

6. **Compound unique indexes to watch:**
   - `conversations: {conversationId: 1, user: 1}`
   - `messages: {messageId: 1, user: 1}`
   - `conversationTag: {tag: 1, user: 1}`

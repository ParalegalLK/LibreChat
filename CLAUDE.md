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

## Redis Cache
LibreChat caches config (including `librechat.yaml` settings) in Redis. After changing UI/config settings, flush the cache and restart the API:
```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```
Then hard-refresh the browser (Ctrl+Shift+R).

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

## Git remotes
- `origin` → ParalegalLK/LibreChat (my fork)
- `upstream` → danny-avila/LibreChat (original)

## Branches
- `main` = clean mirror of upstream (never commit directly)
- `custom-branding` = my customizations (email templates, branding)

## To sync with upstream updates
```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
git checkout custom-branding
git rebase main
git push origin custom-branding --force-with-lease
```

## Handling rebase conflicts
1. Fix conflicts in files
2. `git add <fixed-files>`
3. `git rebase --continue`

# User Deletion Audit - 2026-04-28

## Objective
Delete only these 4 users from the live LibreChat instance:
- anandhiy@juliusandcreasy.com
- diluka@juliusandcreasy.com
- malsirini@lexag.co
- tmtlaw@juliusandcreasy.com

## Execution Summary
Completed end-to-end with backup and verification.
Final status in `users` collection: `remaining=0` for all 4 target emails.

## Step-by-Step Record (Completed)

### 1) Pre-check: identify exact target records
- Queried MongoDB `LibreChat.users` for the 4 target emails.
- Confirmed all 4 existed at the start and captured `_id`, `name`, `username`, `provider`, `role`, `createdAt`, `updatedAt`.
- Result at this stage: `FOUND=4`, `EXPECTED=4`.

### 2) Backup: full database archive before delete
Command used:
```bash
cd /home/paralegaluser/app/LibreChat
TS=$(date +%F-%H%M%S)
mkdir -p /home/paralegaluser/app/backups
docker compose exec -T mongodb mongodump --db LibreChat --archive --gzip > /home/paralegaluser/app/backups/librechat-${TS}.archive.gz
ls -lh /home/paralegaluser/app/backups/librechat-${TS}.archive.gz
```
Output artifact:
- `/home/paralegaluser/app/backups/librechat-2026-04-28-144317.archive.gz`
- Size: `4.2M`

### 3) Snapshot: export only target users before delete
Command used:
```bash
cd /home/paralegaluser/app/LibreChat
: "${TS:=$(date +%F-%H%M%S)}"
docker compose exec -T mongodb mongosh --quiet --eval '
const target=["anandhiy@juliusandcreasy.com","diluka@juliusandcreasy.com","malsirini@lexag.co","tmtlaw@juliusandcreasy.com"];
const d=db.getSiblingDB("LibreChat");
printjson(d.users.find({email:{$in:target}},{_id:1,email:1,name:1,username:1,provider:1,role:1,createdAt:1,updatedAt:1}).toArray());
' > /home/paralegaluser/app/backups/predelete-target-users-${TS}.json
ls -lh /home/paralegaluser/app/backups/predelete-target-users-${TS}.json
```
Output artifact:
- `/home/paralegaluser/app/backups/predelete-target-users-2026-04-28-144317.json`
- Size: `1.2K`

### 4) Re-validation: one email at a time
Ran exact-match validation (`COUNT`) per user before deletion:
- `anandhiy@juliusandcreasy.com` -> `COUNT=1`
- `diluka@juliusandcreasy.com` -> `COUNT=1`
- `malsirini@lexag.co` -> `COUNT=1`
- `tmtlaw@juliusandcreasy.com` -> `COUNT=1`

### 5) Deletion execution
Command used:
```bash
cd /home/paralegaluser/app/LibreChat
docker compose exec api node config/delete-user.js <email>
```
When prompted:
- Confirm delete all user data: `y`
- Delete transaction history: `y` or `n` (user choice; first user had `y`)

All 4 target users removed via this method.

### 6) Final post-delete verification
Command used:
```bash
cd /home/paralegaluser/app/LibreChat
docker compose exec -T mongodb mongosh --quiet --eval '
const target=["anandhiy@juliusandcreasy.com","diluka@juliusandcreasy.com","malsirini@lexag.co","tmtlaw@juliusandcreasy.com"];
const d=db.getSiblingDB("LibreChat");
print("remaining="+d.users.countDocuments({email:{$in:target}}));
d.users.find({email:{$in:target}},{_id:1,email:1,name:1}).forEach(printjson);
'
```
Result:
- `remaining=0`
- No user documents returned for any target email.

## Evidence Files
- `/home/paralegaluser/app/backups/librechat-2026-04-28-144317.archive.gz`
- `/home/paralegaluser/app/backups/predelete-target-users-2026-04-28-144317.json`

## Conclusion
All requested target users were removed from the live LibreChat `users` collection after backup, pre-snapshot, and post-verification.
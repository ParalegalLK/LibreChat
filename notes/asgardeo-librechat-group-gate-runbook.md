# Asgardeo + LibreChat Group-Gated Login Runbook (Non-Enterprise)

Date: 2026-04-27  
Scope: Detailed setup and operations guide for allowing only `chat-pro-users` to log in via Asgardeo OpenID in LibreChat, without Asgardeo Conditional Authentication (enterprise feature).

---

## 1. What This Runbook Solves

This runbook implements and documents:

1. Asgardeo as the OpenID provider for LibreChat login.
2. Login gate based on Asgardeo group membership (`chat-pro-users`).
3. No dependency on Conditional Authentication templates.
4. Clear troubleshooting for common failures:
   - `Key 'groups' not found in id token!`
   - OpenID identity mismatch (`stored openidId does not match token sub`).

---

## 2. Constraints Agreed in This Thread

1. Do **not** use Asgardeo Conditional Authentication (enterprise plan feature).
2. Use Asgardeo groups/roles claims and LibreChat OpenID role checks.
3. Primary allowlist is group `chat-pro-users`.

---

## 3. Effective Login Design

### 3.1 Gate condition

A user can log in only if the OpenID ID token contains:

- claim path: `groups`
- required value: `chat-pro-users`

LibreChat enforces this with:

- `OPENID_REQUIRED_ROLE=chat-pro-users`
- `OPENID_REQUIRED_ROLE_TOKEN_KIND=id`
- `OPENID_REQUIRED_ROLE_PARAMETER_PATH=groups`

Implementation reference:

- `api/strategies/openidStrategy.js` role check block around `requiredRole`.
- `packages/api/src/auth/openid.ts` user matching and fallback protection.

### 3.2 Why this works without Conditional Auth

Even if Asgardeo does not hard-block before callback, LibreChat blocks at callback unless required group claim is present and matches.

---

## 4. Asgardeo Configuration (Non-Enterprise Path)

## 4.1 Group management

1. Create/maintain group `chat-pro-users`.
2. Add only approved users.

## 4.2 OIDC claim release

Ensure your Asgardeo OIDC app is configured so `groups` is available in token/claims used by LibreChat:

1. Request scope including `groups`.
2. In app user-attribute/claim settings, include required attributes/claims for OIDC.
3. Verify by decoding ID token after login.

## 4.3 User onboarding policy

1. Keep self-registration off if onboarding must be admin-controlled.
2. Admin creates/invites users and assigns `chat-pro-users`.

---

## 5. LibreChat Configuration

Use these `.env` values:

```env
ALLOW_EMAIL_LOGIN=false
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=true
ALLOW_SOCIAL_REGISTRATION=false

OPENID_SCOPE="openid profile email groups"
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_REQUIRED_ROLE=chat-pro-users
OPENID_REQUIRED_ROLE_TOKEN_KIND=id
OPENID_REQUIRED_ROLE_PARAMETER_PATH=groups

OPENID_AUTO_REDIRECT=false
OPENID_USE_PKCE=true
```

Optional UI hardening in `librechat.yaml`:

```yaml
registration:
  socialLogins: ['openid']
```

---

## 6. Runtime Notes (Important)

In this project, `.env` is bind-mounted into `/app/.env` inside the `api` container via compose.  
`printenv` in the container may not show these variables as exported shell envs.

After `.env` changes:

1. `docker compose restart api`
2. `docker compose exec librechat-redis redis-cli FLUSHALL`
3. `docker compose restart api`

---

## 7. Login Flow for a New User

With current code/config:

1. User authenticates at Asgardeo.
2. LibreChat receives tokens and userinfo.
3. LibreChat checks required group claim (`groups` contains `chat-pro-users`).
4. If check fails, login is rejected.
5. If check passes, LibreChat searches local user by:
   - `openidId` (token `sub`)
   - `idOnTheSource` (if present)
   - email fallback (guarded)
6. If no local user found, LibreChat auto-creates local user with `provider: openid`.
7. User logs in successfully.

Important: `ALLOW_SOCIAL_REGISTRATION=false` does not block this OpenID auto-provisioning path.

---

## 8. Troubleshooting Matrix

## 8.1 Error: `Key 'groups' not found in id token!`

Meaning:

- LibreChat tried to read `groups` from ID token and it was absent.

Checks:

1. `OPENID_SCOPE` includes `groups`.
2. Asgardeo app releases `groups` claim/attribute.
3. User is actually in `chat-pro-users`.
4. API restarted after env/config changes.

Result:

- User is denied with message similar to:  
  `You must have "chat-pro-users" role to log in.`

## 8.2 Error: `Rejected email fallback ... stored openidId does not match token sub`

Meaning:

- A local user exists with the same email but a different stored OpenID subject (`openidId`).
- LibreChat blocks this for account takeover protection.

Code reference:

- `packages/api/src/auth/openid.ts` (`if (user?.openidId && user.openidId !== openidId)`).

Fix options:

1. Preserve account/history: update existing user `openidId` to current Asgardeo `sub`.
2. Fresh start: delete local user record and let OpenID re-create on next successful login.

---

## 9. Incident Example from This Thread

Observed logs:

- `user found with email ...`
- `Rejected email fallback ... stored openidId does not match token sub`

Executed fix (preserve account/history):

```bash
docker compose exec mongodb mongosh --quiet --eval \
"db.getSiblingDB('LibreChat').users.updateOne(
  { email: 'mailtoinfas2001@gmail.com', openidId: '12540682-4fdc-445e-9337-890453c94619' },
  { \$set: { openidId: 'ba6c0cdf-7bee-46aa-a32f-dd77edd50e70', provider: 'openid' } }
)"
```

Verification:

```bash
docker compose exec mongodb mongosh --quiet --eval \
"db.getSiblingDB('LibreChat').users.find(
  { email: 'mailtoinfas2001@gmail.com' },
  { email:1, provider:1, openidId:1, updatedAt:1 }
).toArray()"
```

---

## 10. Useful Operational Commands

Check effective auth settings in local `.env`:

```bash
rg -n "^(ALLOW_SOCIAL_LOGIN|ALLOW_EMAIL_LOGIN|ALLOW_REGISTRATION|ALLOW_SOCIAL_REGISTRATION|OPENID_SCOPE|OPENID_REQUIRED_ROLE|OPENID_REQUIRED_ROLE_TOKEN_KIND|OPENID_REQUIRED_ROLE_PARAMETER_PATH)=" .env
```

Check mounted config inside API container:

```bash
docker compose exec api /bin/sh -lc "grep -En '^(ALLOW_SOCIAL_LOGIN|ALLOW_EMAIL_LOGIN|OPENID_SCOPE|OPENID_REQUIRED_ROLE|OPENID_REQUIRED_ROLE_TOKEN_KIND|OPENID_REQUIRED_ROLE_PARAMETER_PATH)=' /app/.env"
```

Watch auth logs:

```bash
docker compose logs -f api | grep -E "openidStrategy|role to log in|Key 'groups' not found|AUTH_FAILED|Authentication blocked"
```

---

## 11. Optional Role Mapping (Asgardeo -> LibreChat Admin)

If needed, map a claim value to LibreChat admin:

```env
OPENID_ADMIN_ROLE=chat-admins
OPENID_ADMIN_ROLE_TOKEN_KIND=id
OPENID_ADMIN_ROLE_PARAMETER_PATH=roles
```

If admin marker is group-based:

```env
OPENID_ADMIN_ROLE_PARAMETER_PATH=groups
```

---

## 12. Security Notes

1. Do not store real client secrets in docs/notes.
2. Keep identity mismatch protection enabled; do not bypass `openidId` mismatch checks.
3. Use explicit, auditable admin onboarding for users and group assignments.

---

## 13. Reference Links

- Manage Groups: https://wso2.com/asgardeo/docs/guides/users/manage-groups/
- Manage Roles: https://wso2.com/asgardeo/docs/guides/users/manage-roles/
- Manage Scopes: https://wso2.com/asgardeo/docs/guides/users/attributes/manage-scopes/
- Enable Attributes for OIDC App: https://wso2.com/asgardeo/docs/guides/authentication/user-attributes/enable-attributes-for-oidc-app/
- OIDC Attribute Mappings: https://wso2.com/asgardeo/docs/guides/users/attributes/manage-oidc-attribute-mappings/
- Self Registration: https://wso2.com/asgardeo/docs/guides/account-configurations/user-onboarding/self-registration/
- Invite User to Set Password: https://wso2.com/asgardeo/docs/guides/account-configurations/user-onboarding/invite-user-to-set-password/
- Conditional Auth Group Template (feature context only): https://wso2.com/asgardeo/docs/guides/authentication/conditional-auth/group-based-template-access-control/


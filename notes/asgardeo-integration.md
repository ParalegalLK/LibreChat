# Asgardeo OpenID Connect Integration for LibreChat

This guide covers integrating Asgardeo (WSO2 IDaaS) as the OpenID Connect authentication provider for LibreChat deployed at `https://www.devchat.paralegal.lk`.

## Overview

- **Protocol:** OpenID Connect (Authorization Code flow with PKCE)
- **Provider:** Asgardeo (`https://api.asgardeo.io/t/paralegallk`)
- **Reverse Proxy:** OpenResty with SSL (already configured)
- **Registration model:** Invite-only. Users must have an existing LibreChat account (created via email invite). Asgardeo login links to the existing account by matching email.

---

## 1. Asgardeo Console Setup

### 1.1 Register the Application

1. Log into the Asgardeo Console
2. Go to **Applications** > **New Application** > **Traditional Web Application**
3. Note the **Client ID** and **Client Secret**

### 1.2 Configure Redirect URI

Set the authorized redirect URI to:

```
https://www.devchat.paralegal.lk/oauth/openid/callback
```

### 1.3 Enable Required User Attributes

Go to your app > **User Attributes** tab and ensure the following are enabled:

| Attribute | Scope | Why |
|-----------|-------|-----|
| **Email** (`email`) | `email` | Required. LibreChat uses email to match existing accounts. Login fails without it. |
| **First Name** (`given_name`) | `profile` | Required. Without this, LibreChat overwrites the user's display name with their email on every login. |
| **Last Name** (`family_name`) | `profile` | Required. Same reason as above. |

**This is critical.** If `given_name`/`family_name` are not returned, the greeting will show the user's email instead of their name (e.g., "Hello, john@paralegal.lk" instead of "Hello, John").

### 1.4 Grant Type

Ensure **Authorization Code** grant type is enabled under the **Protocol** tab.

---

## 2. LibreChat `.env` Configuration

### 2.1 Domain Settings

These must match the actual URL users access the app from. Do NOT leave as `localhost`.

```env
DOMAIN_CLIENT=https://www.devchat.paralegal.lk
DOMAIN_SERVER=https://www.devchat.paralegal.lk
```

### 2.2 Login and Registration Settings

```env
ALLOW_EMAIL_LOGIN=false            # Hide email/password login form
ALLOW_SOCIAL_LOGIN=true
ALLOW_SOCIAL_REGISTRATION=false    # Keep false for invite-only model
```

- `ALLOW_EMAIL_LOGIN=false` — removes the email/password form entirely. All authentication goes through Asgardeo.
- `ALLOW_SOCIAL_REGISTRATION=false` — only users with an existing account can log in via Asgardeo. New users must be invited first (via `create-user` or `bulk-invite.js`), then they can use Asgardeo to log in.

**To revert to email login** (e.g., for emergency admin access), set `ALLOW_EMAIL_LOGIN=true` and `OPENID_AUTO_REDIRECT=false`, then restart.

### 2.3 OpenID Settings

```env
OPENID_CLIENT_ID=<your_asgardeo_client_id>
OPENID_CLIENT_SECRET=<your_asgardeo_client_secret>
OPENID_ISSUER=https://api.asgardeo.io/t/paralegallk/oauth2/token
OPENID_SESSION_SECRET=<generate with: openssl rand -hex 32>
OPENID_SCOPE="openid profile email"
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_USE_PKCE=true
```

### 2.4 UI Customization (Optional)

```env
OPENID_BUTTON_LABEL=Asgardeo
OPENID_IMAGE_URL=https://www.paralegal.lk/static/media/fav.c327ba42927508ed4193.webp
```

### 2.5 Settings Left Empty (Defaults Are Fine)

```env
OPENID_REQUIRED_ROLE=
OPENID_REQUIRED_ROLE_TOKEN_KIND=
OPENID_REQUIRED_ROLE_PARAMETER_PATH=
OPENID_USERNAME_CLAIM=
OPENID_NAME_CLAIM=
OPENID_AUDIENCE=
OPENID_AUTO_REDIRECT=true          # Skip login page, go straight to Asgardeo
```

---

## 3. User Migration

### The Problem

Existing users registered with email/password have `provider: "local"` in MongoDB. LibreChat blocks OpenID login for these users to prevent account takeover. You must update each user's provider before they can log in via Asgardeo.

### 3.1 Migrate a Single User

```bash
docker compose exec mongodb mongosh --quiet --eval \
  "db.getSiblingDB('LibreChat').users.updateOne(
    {email: 'user@paralegal.lk'},
    {\$set: {provider: 'openid'}}
  )"
```

### 3.2 Bulk Migrate All Local Users

```bash
docker compose exec mongodb mongosh --quiet --eval \
  "db.getSiblingDB('LibreChat').users.updateMany(
    {provider: 'local'},
    {\$set: {provider: 'openid'}}
  )"
```

**Note:** After bulk migration, users can no longer log in with email/password. Only Asgardeo login will work.

### 3.3 Verify a User's Provider

```bash
docker compose exec mongodb mongosh --quiet --eval \
  "db.getSiblingDB('LibreChat').users.findOne(
    {email: 'user@paralegal.lk'},
    {email:1, name:1, provider:1, openidId:1}
  )"
```

---

## 4. Apply Changes

After any `.env` changes, always run:

```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

Then hard-refresh the browser (Ctrl+Shift+R).

---

## 5. Troubleshooting

### Enable Debug Logging

Add to `.env` temporarily:

```env
DEBUG_OPENID_REQUESTS=true
```

Then restart and check logs:

```bash
docker compose restart api
docker compose logs -f api
```

Remove when done debugging.

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Asgardeo button goes to `localhost` | `DOMAIN_SERVER` is set to `localhost` | Set to `https://www.devchat.paralegal.lk` |
| `email: can't be blank` | Asgardeo not returning `email` claim | Enable `email` attribute in Asgardeo app > User Attributes |
| `auth_failed` / "login failed, please check your method" | User has `provider: "local"` in MongoDB | Update user's provider to `"openid"` (see Section 3) |
| Greeting shows email instead of name | Asgardeo not returning `given_name`/`family_name` | Enable First Name and Last Name in Asgardeo app > User Attributes |
| 401 on `/oauth/openid` | Rate limiting or session issue | Wait and retry, or restart API |

### Useful Log Searches

```bash
# Check OpenID-related logs
docker compose logs api --tail 100 | grep -iE "openid|email|login failed|auth_failed|claim"

# Verify OpenID strategy loaded
docker compose logs api --tail 50 | grep "OpenID Connect"
```

---

## 6. Asgardeo-Specific Notes

- **Issuer URL is unusual:** It ends with `/oauth2/token` (not just the base URL). This must match exactly in `OPENID_ISSUER`.
- **Discovery URL:** `https://api.asgardeo.io/t/paralegallk/oauth2/token/.well-known/openid-configuration`
- **`sub` claim defaults to a UUID**, not email. LibreChat handles this correctly — it uses the `email` claim separately for account matching.
- **Scopes are case-sensitive.** Use lowercase: `openid profile email`.
- **PKCE is recommended.** Asgardeo supports it and LibreChat has `OPENID_USE_PKCE=true`.

---

## 7. Architecture Reference

```
Browser
  → https://www.devchat.paralegal.lk (OpenResty, SSL termination)
    → http://localhost:3080 (LibreChat Docker container)
      → Asgardeo OIDC (authentication)
      → MongoDB (user accounts)
      → Redis (config cache)
```

OpenResty config: `/usr/local/openresty/nginx/conf/conf.d/paralegal-app-chat.conf`

---

## 8. New User Onboarding Flow (Post-Migration)

1. Admin creates user account via `create-user` or `bulk-invite.js` (email must match their Asgardeo email)
2. User visits `https://www.devchat.paralegal.lk`
3. User clicks "Asgardeo" button
4. Asgardeo authenticates user (or uses existing session)
5. LibreChat matches email, links OpenID identity, logs user in

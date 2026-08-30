# LibreChat image-upgrade landmines

Concrete things that broke when pulling a new LibreChat image on 2026-04-21. Treat this as a pre/post-flight checklist for the next upgrade.

## What went wrong

### 1. Fork customization `api/models/inviteUser.js` was lost from the image

The host's `config/` is bind-mounted, but `api/` is baked into the image — so any custom files we've added under `api/` are silently dropped when we pull a fresh upstream image.

**Symptom:** `docker compose exec api node config/bulk-invite.js ...` throws:
```
Cannot find module '/app/api/models/inviteUser'
```

**Quick fix:** copy it in by hand.
```bash
cd 
```
This is lost on every container *recreate*, not just restart.

**Proper fix:** update `config/bulk-invite.js` to call `@librechat/api`'s new exported `createInvite(email, deps)` signature — upstream moved it to `packages/api/src/auth/invite.ts` and it now takes an injected `{ createToken, findToken }`. Or add a Dockerfile layer that copies our custom files in.

### 2. `.env` SMTP credentials came back blank

`EMAIL_HOST`, `EMAIL_USERNAME`, `EMAIL_PASSWORD` were all empty. `bulk-invite.js` then logged "Email service not configured" and wrote the invite link to CSV instead of emailing.

Correct values:
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USERNAME=admin@paralegal.lk
EMAIL_PASSWORD=<gmail app password>
EMAIL_FROM=admin@paralegal.lk
```

### 3. `DOMAIN_CLIENT` / `DOMAIN_SERVER` pointed at the wrong host

Came back as `https://www.devchat.paralegal.lk` (dev). Production is `https://www.chat.paralegal.lk`. Invite links carry this host, so getting it wrong silently breaks every invite.

### 4. `docker compose restart` does NOT reload `.env`

`env_file` is read at container *creation*. After any `.env` change you must:
```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose up -d   # recreates containers, picks up new env
```
A plain `restart` makes it look like your changes had no effect.

### 5. Recreation drops the `docker cp`'d files from step 1

Order of operations for an `.env` change matters:
1. Edit `.env`
2. `docker compose up -d` (recreates)
3. `docker cp` custom files back
4. Run invite scripts

### 6. `OPENID_USE_END_SESSION_ENDPOINT` was blank

Caused a logout → instant-auto-login loop: LibreChat cleared its own session but not the Asgardeo IdP session, so the next SSO attempt auto-succeeded. Set to `true` so the IdP end-session endpoint is called on logout. Asgardeo client config must also allow the post-logout redirect URI.

### 7. OpenID strategy auto-creates users on first SSO login

It bypasses `ALLOW_SOCIAL_REGISTRATION` entirely (that flag only applies to Google/GitHub/etc. in `socialLogin.js`; `openidStrategy.js` has its own user-creation path). Since Asgardeo registration is open across our org, any Asgardeo user can self-provision a chat account.

**Mitigation today:** `ALLOW_SOCIAL_LOGIN=false` (disables social + OIDC entirely).

**Planned fix:** Asgardeo group + `OPENID_REQUIRED_ROLE=chat-user` so only users in that group can sign in. Requires `OPENID_REQUIRED_ROLE_TOKEN_KIND` and `OPENID_REQUIRED_ROLE_PARAMETER_PATH` to point at where Asgardeo puts groups in the id_token.

## Pre-flight checklist for next upgrade

Before sending invites or announcing the upgrade:

```bash
# (a) env sanity
docker compose exec -T api node -e "console.log({
  EMAIL_HOST: process.env.EMAIL_HOST,
  DOMAIN_CLIENT: process.env.DOMAIN_CLIENT,
  OPENID_USE_END_SESSION_ENDPOINT: process.env.OPENID_USE_END_SESSION_ENDPOINT,
  ALLOW_SOCIAL_LOGIN: process.env.ALLOW_SOCIAL_LOGIN,
  ALLOW_EMAIL_LOGIN: process.env.ALLOW_EMAIL_LOGIN,
})"

# (b) custom files present
docker compose exec -T api ls /app/api/models/inviteUser.js

# (c) end-to-end: invite a test address, confirm email lands, link host matches prod domain
```

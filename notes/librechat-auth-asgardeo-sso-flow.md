# Auth Structure and Asgardeo Flow

Date: 2026-04-23

This note describes the current authentication structure in this LibreChat fork, with emphasis on the configured Asgardeo OpenID Connect login/register behavior.

## Current Effective Auth Mode

The current `.env` config makes Asgardeo/OpenID the only visible login method:

| Area | Current setting | Effect |
| --- | --- | --- |
| Client/server domain | `DOMAIN_CLIENT=https://www.devchat.paralegal.lk`, `DOMAIN_SERVER=https://www.devchat.paralegal.lk` | OAuth callbacks and redirects are generated for the deployed devchat domain. |
| Email/password login | `ALLOW_EMAIL_LOGIN=false` | The login form is hidden. Local password login endpoint still exists, but UI does not expose it. |
| LibreChat registration | `ALLOW_REGISTRATION=false` | The login page does not show the sign-up link. Direct `/register` requests are rejected unless an invite token is valid. |
| Social/OAuth login | `ALLOW_SOCIAL_LOGIN=true` | `/oauth/*` routes and configured Passport social/OpenID strategies are enabled. |
| Generic social registration | `ALLOW_SOCIAL_REGISTRATION=false` | Blocks first-time account creation for generic social providers handled by `api/strategies/socialLogin.js`. |
| OpenID provider | `OPENID_BUTTON_LABEL=Asgardeo` | UI shows the Asgardeo button. |
| OpenID callback | `OPENID_CALLBACK_URL=/oauth/openid/callback` | Asgardeo must redirect to `https://www.devchat.paralegal.lk/oauth/openid/callback`. |
| OpenID PKCE | `OPENID_USE_PKCE=true` | Authorization code flow uses PKCE. |
| OpenID auto redirect | `OPENID_AUTO_REDIRECT=false` | Users land on `/login` and click the Asgardeo button manually. |
| OpenID token reuse | `OPENID_REUSE_TOKENS=` empty | LibreChat uses its own JWT/session after OAuth callback, not Asgardeo tokens as the app bearer token. |
| OpenID logout endpoint | `OPENID_USE_END_SESSION_ENDPOINT=` empty | LibreChat logout clears LibreChat cookies/session only; it does not redirect to Asgardeo logout. |
| SAML/LDAP | empty | Not active. SAML is also hidden when OpenID is active. |
| Password reset | `ALLOW_PASSWORD_RESET=false` | Reset UI is disabled. |
| Email service | SMTP configured | Verification/invite/password emails can be sent, but password reset is disabled by flag. Secrets are intentionally not repeated here. |

Sensitive `.env` values such as `OPENID_CLIENT_SECRET`, `OPENID_SESSION_SECRET`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `EMAIL_PASSWORD` are set but redacted in this note.

## Production Target Flow: Group-Gated Asgardeo SSO Only

This section describes the exact target you requested:

1. Users authenticate only with Asgardeo SSO.
2. Users must belong to Asgardeo group `chat-pro-users`.
3. Users outside that group are denied login.
4. No Asgardeo self-registration.
5. No Google/Facebook/other social sign-ins.

### Critical behavior to remember

In LibreChat, Asgardeo OpenID is initialized under the social-login bootstrap path.  
That means:

- To use Asgardeo SSO, `ALLOW_SOCIAL_LOGIN` must remain `true`.
- If `ALLOW_SOCIAL_LOGIN=false`, OpenID strategy is not registered and Asgardeo login is disabled.

### A. Asgardeo configuration

#### A1. Create and manage the access group

1. In Asgardeo Console, go to `User Management > Groups`.
2. Create group `chat-pro-users`.
3. Assign only allowed users to this group.

Reference: Manage groups  
https://wso2.com/asgardeo/docs/guides/users/manage-groups/

#### A2. Disable Asgardeo self-registration

1. Go to `Login & Registration`.
2. Under `User Onboarding`, open `Self Registration`.
3. Turn the self-registration toggle OFF.

Reference: Self-registration enable/disable  
https://wso2.com/asgardeo/docs/guides/account-configurations/user-onboarding/self-registration/

#### A3. Restrict app login to `chat-pro-users`

1. Open your LibreChat application in Asgardeo: `Applications > <your app> > Login Flow`.
2. Start from default username/password login flow (if needed).
3. Enable `Conditional Authentication`.
4. Apply the `Group-Based` access-control template.
5. Configure allowed groups as `chat-pro-users`.
6. Save/update the login flow.

Result: users outside the group are redirected to an auth error page and cannot log in.

Reference: Group-based access control template  
https://wso2.com/asgardeo/docs/guides/authentication/conditional-auth/group-based-template-access-control/

#### A4. Keep only Asgardeo native sign-in options

In the same Asgardeo app login flow:

1. Remove federated/social sign-in options (Google, Facebook, Apple, etc.) if present.
2. Keep only the authenticators you want for organization users (typically username/password, plus your conditional group access rule).

### B. LibreChat configuration

Use this baseline `.env` model for group-gated Asgardeo SSO only:

```env
ALLOW_EMAIL_LOGIN=false
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=true
ALLOW_SOCIAL_REGISTRATION=false
ALLOW_PASSWORD_RESET=false

OPENID_BUTTON_LABEL="Login with paralegal-lk SSO"
OPENID_USE_END_SESSION_ENDPOINT=true
OPENID_AUTO_REDIRECT=false
OPENID_USE_PKCE=true
OPENID_SCOPE="openid profile email"
```

Important:

1. Keep all non-OpenID social provider credentials empty (`GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, etc.).
2. Optionally force only OpenID button ordering via `librechat.yaml`:

```yaml
registration:
  socialLogins: ['openid']
```

### Optional defense-in-depth (LibreChat-side group claim check)

Primary enforcement should stay in Asgardeo login flow (A3).  
If you also want LibreChat to reject tokens missing group membership:

1. Add `groups` to OIDC scope:
   - `OPENID_SCOPE="openid profile email groups"`
2. Ensure Asgardeo app is configured to release required attributes/claims for requested scopes.
3. Configure LibreChat required role checks:

```env
OPENID_REQUIRED_ROLE=chat-pro-users
OPENID_REQUIRED_ROLE_TOKEN_KIND=id
OPENID_REQUIRED_ROLE_PARAMETER_PATH=groups
```

References:

- OIDC scopes (`groups` scope):  
  https://wso2.com/asgardeo/docs/guides/users/attributes/manage-scopes/
- Enable attributes for OIDC apps:  
  https://wso2.com/asgardeo/docs/guides/authentication/user-attributes/enable-attributes-for-oidc-app/

### C. User onboarding model (no self-sign-up)

When self-registration is disabled, users are onboarded by admins:

1. Admin creates users (single, bulk, or invite) in Asgardeo.
2. Admin assigns users to group `chat-pro-users`.
3. Only then can users access LibreChat.

Reference: Onboard users  
https://wso2.com/asgardeo/docs/guides/users/onboard-users/

### D. Apply and validate

After config updates:

1. Restart LibreChat API service.
2. Flush Redis config cache (LibreChat caches startup config).
3. Hard-refresh browser.

Validation matrix:

1. User in `chat-pro-users`: login succeeds.
2. User not in `chat-pro-users`: login denied by Asgardeo conditional auth.
3. New user tries self-register in Asgardeo: no self-registration path available.
4. No Google/Facebook/etc buttons shown in LibreChat.
5. Logout redirects through end-session flow when supported by provider metadata and app settings.

### E. Rollback plan

If users are blocked unexpectedly:

1. Temporarily remove group restriction from Asgardeo login flow (A3) to restore broad SSO access.
2. Re-check group memberships for affected users.
3. Reapply restriction once memberships are correct.

## Common Config Switch: Local Login Only

If these variables are changed to:

```env
ALLOW_EMAIL_LOGIN=true
ALLOW_SOCIAL_LOGIN=false
OPENID_BUTTON_LABEL="Login with paralegal-lk SSO"
OPENID_USE_END_SESSION_ENDPOINT=true
```

the app becomes local LibreChat email/password login only. It does not become "SSO with an email login form."

This distinction is important for anyone new to the project:

| Term | Meaning in this project |
| --- | --- |
| Asgardeo credentials | The username/password a user enters on the Asgardeo-hosted SSO page. LibreChat does not store or verify this password. |
| LibreChat local credentials | An email/password stored in LibreChat's MongoDB user collection. The password is a bcrypt hash on the local user record. |
| OpenID/SSO login | Browser redirects to `/oauth/openid`, then to Asgardeo, then back to `/oauth/openid/callback`. |
| Local login | Browser submits email/password to `POST /api/auth/login`; LibreChat validates the password itself. |

What each variable does in that setup:

| Variable | Result |
| --- | --- |
| `ALLOW_EMAIL_LOGIN=true` | Shows the LibreChat email/password login form. |
| `ALLOW_SOCIAL_LOGIN=false` | Disables social/OAuth setup, including Asgardeo/OpenID. The OpenID Passport strategy is not registered. |
| `OPENID_BUTTON_LABEL="Login with paralegal-lk SSO"` | Has no visible effect while social login is disabled, because the OpenID button is not rendered. |
| `OPENID_USE_END_SESSION_ENDPOINT=true` | Has no practical effect for local-login users. It is only relevant when users authenticate through OpenID and logout should call the provider's end-session endpoint. |

After changing these values and restarting the API, a user will see the LibreChat email/password login form. They will not see the Asgardeo SSO button. If they try to use their old Asgardeo username/password in that form, it will fail unless the same email also has a LibreChat local password stored in MongoDB.

Credentials in this mode must be LibreChat local credentials stored in MongoDB. Asgardeo username/password credentials are not checked by the LibreChat email/password form.

The local login flow checks:

1. A user document exists in MongoDB with the submitted email.
2. The user has a local bcrypt password hash.
3. The submitted password matches that hash.
4. The user is email-verified, unless `ALLOW_UNVERIFIED_EMAIL_LOGIN=true`.

Because Asgardeo/OpenID-created users normally have `provider: openid` and no local `password` field, those users cannot log in through the local form until a LibreChat password is set for them. The previous Asgardeo password cannot be reused automatically because LibreChat never receives the real Asgardeo password during OpenID login.

Expected results by user type:

| User type | Can log in after `ALLOW_SOCIAL_LOGIN=false`? | Why |
| --- | --- | --- |
| Existing Asgardeo/OpenID-only user with no local password | No | User has no LibreChat password hash. |
| Existing Asgardeo/OpenID user after a local password is set | Yes | Local login can validate the MongoDB password hash. |
| Existing local user with verified email and password | Yes | This is the flow local login expects. |
| Existing local user with unverified email | No, unless `ALLOW_UNVERIFIED_EMAIL_LOGIN=true` | Current config blocks unverified local login. |
| New user who only exists in Asgardeo | No | OpenID is disabled, so LibreChat never redirects to Asgardeo or provisions the user. |

Ways to create usable local credentials:

1. Create a user with `docker-compose exec api npm run create-user`.
2. Invite users through the invite scripts so they complete `/register?token=...` and create a local password.
3. Temporarily enable `ALLOW_PASSWORD_RESET=true` with email configured, then let existing local-compatible users set a password.
4. Manually set/reset a local password for existing OpenID users through an admin script or database-safe maintenance process.

For new local users, the most direct admin path is:

```bash
docker-compose exec api npm run create-user
```

That creates a LibreChat user in MongoDB with a local password. The user logs in on the LibreChat login form, not on Asgardeo.

For invite-based local registration:

```bash
docker-compose exec api node config/bulk-invite.js
```

or use the single-user invite flow documented in `CLAUDE.md`. The invite link points to `/register?token=...`, and the user sets a LibreChat local password during registration. This still works with `ALLOW_REGISTRATION=false` because a valid invite token bypasses the public-registration block.

For existing OpenID users, choose one migration policy before switching production to local login:

| Policy | Result |
| --- | --- |
| Keep OpenID users as-is | They will be locked out when social login is disabled. |
| Set local passwords for OpenID users | They can use the email/password form. |
| Keep SSO enabled instead | They continue using Asgardeo and do not need local passwords. |

Operational checklist before switching to local-login-only:

1. Confirm at least one admin account has a local password and `emailVerified=true`.
2. Confirm users know that Asgardeo passwords will not work in the LibreChat form.
3. Create local credentials for every user who needs access.
4. Restart the API after `.env` changes.
5. Hard-refresh the browser or clear cached startup config if the old login UI still appears.

Recommended configurations:

| Goal | Suggested settings |
| --- | --- |
| Asgardeo SSO only | `ALLOW_EMAIL_LOGIN=false`, `ALLOW_SOCIAL_LOGIN=true`, `OPENID_BUTTON_LABEL="Login with paralegal-lk SSO"` |
| Local email/password only | `ALLOW_EMAIL_LOGIN=true`, `ALLOW_SOCIAL_LOGIN=false` |
| Local login plus Asgardeo button | `ALLOW_EMAIL_LOGIN=true`, `ALLOW_SOCIAL_LOGIN=true` |

If SSO logout should also end the Asgardeo browser session, set `OPENID_USE_END_SESSION_ENDPOINT=true` only while OpenID login is enabled. Also confirm Asgardeo exposes an `end_session_endpoint` in discovery metadata and that `OPENID_POST_LOGOUT_REDIRECT_URI` is allowed by the provider.

## Key Files

| File | Responsibility |
| --- | --- |
| `api/server/index.js` | Initializes Passport, local JWT/local strategies, optionally configures social/OpenID strategies when `ALLOW_SOCIAL_LOGIN=true`, mounts `/oauth` and `/api/auth`. |
| `api/server/socialLogins.js` | Registers provider strategies. OpenID is configured only when `OPENID_CLIENT_ID`, `OPENID_CLIENT_SECRET`, `OPENID_ISSUER`, `OPENID_SCOPE`, and `OPENID_SESSION_SECRET` are set. |
| `api/server/routes/oauth.js` | Defines `/oauth/openid` and `/oauth/openid/callback`, plus other OAuth providers. |
| `api/strategies/openidStrategy.js` | Core Asgardeo/OpenID login, user lookup, optional role checks, user creation/update, avatar handling. |
| `packages/api/src/auth/openid.ts` | Shared helper for finding/migrating OpenID users by `openidId`, `idOnTheSource`, or email. |
| `api/server/controllers/auth/oauth.js` | Converts a successful Passport OAuth login into LibreChat auth cookies/JWT, then redirects to the client. |
| `api/server/services/AuthService.js` | Registration, verification email, password reset, JWT/refresh-token cookies, OpenID-token cookie/session handling. |
| `api/server/controllers/AuthController.js` | `/api/auth/register`, `/api/auth/refresh`, reset, and graph-token controllers. |
| `api/server/middleware/validateRegistration.js` | Blocks local registration unless `ALLOW_REGISTRATION=true` or a valid invite token was accepted. |
| `api/server/middleware/checkInviteUser.js` | Validates invite tokens for `/register?token=...`. |
| `client/src/components/Auth/Login.tsx` | Hides/shows login form and handles OpenID auto-redirect behavior. |
| `client/src/components/Auth/SocialLoginRender.tsx` | Renders provider buttons from startup config. |
| `client/src/components/Auth/Registration.tsx` | Local registration form; still routable at `/register`, but backend rejects without enabled registration or valid invite. |
| `client/src/hooks/AuthContext.tsx` | Stores frontend auth state, runs silent refresh through `/api/auth/refresh`, and sets the Authorization bearer token. |

## Startup Config to UI

The client calls `GET /api/config` through `useGetStartupConfig()`. The server builds auth flags in `api/server/routes/config.js`.

With the current `.env`, the unauthenticated startup payload effectively exposes:

| Payload field | Effective value |
| --- | --- |
| `emailLoginEnabled` | `false` |
| `registrationEnabled` | `false` |
| `socialLoginEnabled` | `true` |
| `openidLoginEnabled` | `true` |
| `openidLabel` | `Asgardeo` |
| `openidImageUrl` | Paralegal favicon URL |
| `openidAutoRedirect` | `false` |
| `serverDomain` | `https://www.devchat.paralegal.lk` |
| `googleLoginEnabled`, `githubLoginEnabled`, etc. | `false` because those client IDs/secrets are empty |
| `samlLoginEnabled` | `false` because SAML is empty and OpenID is enabled |

`librechat.yaml` does not currently define `registration.socialLogins`, so the default provider order is used. Only providers whose env config is active render; currently that means OpenID/Asgardeo.

## Asgardeo Login Flow

1. User opens `/login`.
2. Client fetches `GET /api/config`.
3. UI hides email/password login because `emailLoginEnabled=false`.
4. UI renders the Asgardeo button because `socialLoginEnabled=true` and `openidLoginEnabled=true`.
5. User clicks the button. `SocialButton` sends the browser to `https://www.devchat.paralegal.lk/oauth/openid`.
6. `api/server/routes/oauth.js` starts Passport `openid` authentication with a generated state.
7. `api/strategies/openidStrategy.js` uses `openid-client` discovery from `OPENID_ISSUER`, `OPENID_CLIENT_ID`, `OPENID_CLIENT_SECRET`, `OPENID_SCOPE`, and `OPENID_USE_PKCE=true`.
8. Asgardeo authenticates the user and redirects back to `https://www.devchat.paralegal.lk/oauth/openid/callback`.
9. Passport exchanges the authorization code for tokens and calls the OpenID strategy callback.
10. `processOpenIDAuth()` merges ID-token claims with `userinfo` if an access token exists.
11. LibreChat resolves the email using `OPENID_EMAIL_CLAIM` if set, otherwise `email`, `preferred_username`, then `upn`.
12. LibreChat checks the email domain against `registration.allowedDomains` from app config. There is no current allowlist in `librechat.yaml`, so all email domains pass.
13. LibreChat looks up an existing user by `openidId`, `idOnTheSource`/`oid`, then email.
14. If an existing user is found and its provider is already `openid`, the user is updated with the latest OpenID fields.
15. If an existing user is found by email but has a different provider, login is rejected with `AUTH_FAILED`.
16. If no user is found, the OpenID strategy creates a new MongoDB user with `provider: openid`, `openidId: sub`, email, name, username, and `emailVerified` from the provider claim.
17. `createOAuthHandler()` sets LibreChat auth tokens and redirects to `DOMAIN_CLIENT`.
18. Because `OPENID_REUSE_TOKENS` is empty, the app uses normal LibreChat JWT auth: an access token is returned to the frontend and `refreshToken` plus `token_provider=librechat` cookies are set.
19. The frontend then silently refreshes auth state as needed through `/api/auth/refresh`.

Important current behavior: `ALLOW_SOCIAL_REGISTRATION=false` blocks new users for generic providers in `api/strategies/socialLogin.js`, but the OpenID path in `api/strategies/openidStrategy.js` does not check that flag. A first-time Asgardeo login can create a local LibreChat user if Asgardeo returns valid claims and domain checks pass.

## Asgardeo Registration Behavior

There are two different "registration" concepts:

1. Asgardeo-side user registration or provisioning.
2. LibreChat-side local account creation.

The current LibreChat app does not call an Asgardeo registration API. If a new person is added or self-registers in Asgardeo, LibreChat only sees them when they complete OpenID login.

On first successful Asgardeo login, LibreChat provisions its own local user record automatically in `processOpenIDAuth()` unless an incompatible existing account blocks the login. This means the effective Asgardeo registration flow is:

1. User exists or signs up in Asgardeo.
2. User clicks Asgardeo login in LibreChat.
3. Asgardeo returns OIDC claims.
4. LibreChat creates or links a local MongoDB user.

This is different from the local `/register` form:

1. `/register` is still a client route.
2. The login page does not link to it because `registrationEnabled=false`.
3. A direct `/register` visit still shows the form, but `POST /api/auth/register` returns `403 Registration is not allowed` unless a valid invite token is submitted.
4. Invite links are generated as `${DOMAIN_CLIENT}/register?token=...` by `config/invite-user.js` and `config/bulk-invite.js`.
5. When `checkInviteUser` validates the token, `validateRegistration` allows registration even with `ALLOW_REGISTRATION=false`.

## Local Email/Password Flow

The local flow still exists in the backend:

1. `POST /api/auth/login` runs `loginLimiter`, `checkBan`, then `requireLocalAuth`.
2. `api/strategies/localStrategy.js` validates email/password against a local MongoDB user.
3. Unverified email is blocked because `ALLOW_UNVERIFIED_EMAIL_LOGIN=false`.
4. `loginController` returns a LibreChat JWT and sets refresh cookies through `setAuthTokens()`.

Current UI does not expose this flow because `ALLOW_EMAIL_LOGIN=false`. If an API client posts directly to `/api/auth/login`, the backend route still exists.

## Local Registration Flow

The local registration endpoint is `POST /api/auth/register`.

Middleware order:

1. `registerLimiter`
2. `checkBan`
3. `checkInviteUser`
4. `validateRegistration`
5. `registrationController`

Without a valid invite token, `validateRegistration` requires `ALLOW_REGISTRATION=true`. Current value is false, so public registration is blocked.

With a valid invite token, `registerUser()`:

1. Validates the body using `registerSchema`.
2. Checks email domain against app config.
3. Rejects duplicate email by returning the generic verification message.
4. Creates a local user with `provider: local`, bcrypt password hash, and default user role unless it is the first registered user.
5. Sends verification email if email is configured and the user is not already verified.

## Session, Refresh, and Logout

Normal current Asgardeo login ends in LibreChat-managed auth because `OPENID_REUSE_TOKENS` is not enabled.

After successful OAuth login:

1. `setAuthTokens()` creates a DB session and refresh token.
2. It sets `refreshToken` and `token_provider=librechat` as `httpOnly`, `sameSite=strict`, secure cookies when appropriate.
3. It returns a short-lived LibreChat JWT signed by `JWT_SECRET`.
4. The frontend stores that JWT in memory and sends it as the Authorization bearer token.

Refresh:

1. Frontend calls `/api/auth/refresh`.
2. Because `token_provider=librechat`, the normal refresh branch verifies `refreshToken` with `JWT_REFRESH_SECRET`.
3. It checks the session in MongoDB and returns a new access token.

Logout:

1. `POST /api/auth/logout` requires JWT auth.
2. `LogoutController` deletes the matching session and clears auth cookies.
3. Since `OPENID_USE_END_SESSION_ENDPOINT` is empty, LibreChat does not redirect to Asgardeo's OIDC end-session endpoint.
4. The user's Asgardeo browser session may remain active, so the next Asgardeo login may silently SSO.

If `OPENID_REUSE_TOKENS=true` were enabled later, behavior changes: `createOAuthHandler()` would call `setOpenIDAuthTokens()`, `token_provider=openid` would be set, OpenID JWT validation would use the provider JWKS, and refresh would call the OpenID refresh-token grant.

## Current Environment Variables

Auth and routing:

```env
DOMAIN_CLIENT=https://www.devchat.paralegal.lk
DOMAIN_SERVER=https://www.devchat.paralegal.lk
ALLOW_EMAIL_LOGIN=false
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=true
ALLOW_SOCIAL_REGISTRATION=false
ALLOW_PASSWORD_RESET=false
ALLOW_UNVERIFIED_EMAIL_LOGIN=false
SESSION_EXPIRY=1000 * 60 * 15
REFRESH_TOKEN_EXPIRY=(1000 * 60 * 60 * 24) * 7
JWT_SECRET=[set/redacted]
JWT_REFRESH_SECRET=[set/redacted]
```

Configured social providers:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY_PATH=
```

Only OpenID/Asgardeo is effectively configured:

```env
OPENID_CLIENT_ID=[set]
OPENID_CLIENT_SECRET=[set/redacted]
OPENID_ISSUER=https://api.asgardeo.io/t/paralegallk/oauth2/token
OPENID_SESSION_SECRET=[set/redacted]
OPENID_SCOPE="openid profile email"
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_REQUIRED_ROLE=
OPENID_REQUIRED_ROLE_TOKEN_KIND=
OPENID_REQUIRED_ROLE_PARAMETER_PATH=
OPENID_USERNAME_CLAIM=
OPENID_NAME_CLAIM=
OPENID_AUDIENCE=
OPENID_BUTTON_LABEL=Asgardeo
OPENID_IMAGE_URL=https://www.paralegal.lk/static/media/fav.c327ba42927508ed4193.webp
OPENID_AUTO_REDIRECT=false
OPENID_USE_PKCE=true
OPENID_REUSE_TOKENS=
OPENID_JWKS_URL_CACHE_ENABLED=
OPENID_JWKS_URL_CACHE_TIME=
OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED=
OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE="user.read"
OPENID_USE_END_SESSION_ENDPOINT=
OPENID_POST_LOGOUT_REDIRECT_URI=https://www.devchat.paralegal.lk/login
```

Inactive SAML/LDAP:

```env
SAML_ENTRY_POINT=
SAML_ISSUER=
SAML_CERT=
SAML_CALLBACK_URL=/oauth/saml/callback
SAML_SESSION_SECRET=
LDAP_URL not set
LDAP_USER_SEARCH_BASE not set
```

Email is configured:

```env
EMAIL_SERVICE=
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_ENCRYPTION=starttls
EMAIL_USERNAME=admin@paralegal.lk
EMAIL_PASSWORD=[set/redacted]
EMAIL_FROM_NAME="devchat.paralegal.lk"
EMAIL_FROM=admin@paralegal.lk
```

Rate limiting and ban controls:

```env
BAN_VIOLATIONS=true
BAN_DURATION=1000 * 60 * 60 * 2
BAN_INTERVAL=20
LOGIN_MAX=7
LOGIN_WINDOW=5
REGISTER_MAX=5
REGISTER_WINDOW=60
LOGIN_VIOLATION_SCORE=1
REGISTRATION_VIOLATION_SCORE=1
```

## Notable Risks and Mismatches

1. Existing `notes/asgardeo-integration.md` describes an invite-only model where users must already exist. The current code does not enforce that for normal OpenID login; it creates a user when no existing OpenID/email match is found.
2. `ALLOW_SOCIAL_REGISTRATION=false` does not stop OpenID first-login provisioning in `api/strategies/openidStrategy.js`.
3. `OPENID_USE_END_SESSION_ENDPOINT` is empty, so logout does not end the Asgardeo browser session.
4. `OPENID_REUSE_TOKENS` is empty, so OpenID provider tokens are not reused for normal app authentication. This is simpler, but any feature requiring the original federated access token will not have it after login.
5. No `registration.allowedDomains` allowlist is configured in `librechat.yaml`, so OpenID users from any email domain allowed by Asgardeo can be provisioned locally.

# Asgardeo Group Provisioning Plan + Live Test Log

Date: 2026-05-05  
Project: LibreChat + Asgardeo (`paralegallk`)

---

## 1. Goal

Automate access to LibreChat so that users who pay are added to the Asgardeo group `chat-pro-users` via API, instead of manual admin work.

Current user onboarding model:

1. User can sign in with either local LibreChat email/password or Asgardeo SSO.
2. For Asgardeo SSO, user cannot log in to LibreChat unless they are in `chat-pro-users`.
3. After payment, backend should call Asgardeo API and add that user to `chat-pro-users`.

---

## 2. Confirmed Current LibreChat Gate Condition

Active `.env` settings confirm Section 3.1-style gate:

- `OPENID_REQUIRED_ROLE=chat-pro-users`
- `OPENID_REQUIRED_ROLE_TOKEN_KIND=id`
- `OPENID_REQUIRED_ROLE_PARAMETER_PATH=groups`
- `OPENID_SCOPE="openid profile email groups"`

Related auth settings:

- `ALLOW_EMAIL_LOGIN=true`
- `ALLOW_REGISTRATION=true`
- `ALLOW_SOCIAL_LOGIN=true`
- `ALLOW_SOCIAL_REGISTRATION=true`

Notes:

- `librechat.yaml` currently has no `registration.socialLogins` override.
- Access check is based on `groups` claim in ID token for OpenID login.
- Local email/password login does not evaluate OpenID group claims.

---

## 3. Key Clarifications We Established

## 3.1 Can existing Asgardeo users be added to groups by API?

Yes. Use SCIM2 group PATCH operations (`add` to `members`) to add existing users to an existing group.

## 3.2 Does enabling `client_credentials` change normal user login behavior?

No, if current login config remains unchanged.

- Login continues using browser-based authorization code flow + PKCE.
- `client_credentials` is separate and only for backend machine-to-machine API calls.

What would break login:

1. Removing/altering code-flow login settings.
2. Removing required `openid/profile/email/groups` login scopes.
3. Breaking claim release for `groups`.

## 3.3 Is M2M app mandatory?

Not mandatory. A Traditional Web App can be used if `client_credentials` is enabled and authorized correctly.  
Best practice is a separate M2M app for isolation/least privilege.

---

## 4. Token Storage Clarification (Important)

Question raised: can we reuse OpenID token from MongoDB user record?

Answer:

- OpenID access/id tokens are not stored in MongoDB `users` document for this flow.
- Tokens are stored in session (`req.session.openidTokens`) and cookies.
- With `USE_REDIS=true`, OpenID session data is Redis-backed.

MongoDB check for `infas1002@gmail.com` showed:

- `provider: openid`
- `openidId: 2f458c21-5650-4a0d-a894-2df7a03d9441`
- no persisted `openidTokens`/`federatedTokens` in user doc.

Conclusion: provisioning should use backend `client_credentials` token, not user login token from DB.

---

## 5. Asgardeo Setup Required for Provisioning

## 5.1 Grant Type

Enabled on app:

- `client_credentials`

## 5.2 API Authorization / RBAC Resources and Scopes

Required:

- `SCIM2 Users API` (`/scim2/Users`)
  - `internal_user_mgt_list`
  - `internal_user_mgt_view`

- `SCIM2 Groups API` (`/scim2/Groups`)
  - `internal_group_mgt_view`
  - `internal_group_mgt_update`

Not required for this use case:

- `User Credential Management API`

---

## 6. Troubleshooting Sequence We Hit

## 6.1 Initial failure

Token request failed:

- `unauthorized_client`
- reason: app not authorized for `client_credentials`

## 6.2 After enabling client credentials

Token issued, but SCIM failed:

- HTTP `403 Operation is not permitted`
- reason: API resource/scope authorization not yet effective

## 6.3 After authorizing SCIM resources/scopes

Token returned with effective scopes:

- `internal_group_mgt_update internal_group_mgt_view internal_user_mgt_list internal_user_mgt_view`

SCIM calls became authorized.

---

## 7. User Identity Mapping Result (Critical)

Direct lookup by `infas1002@gmail.com` did not return a user in SCIM.

Discovered matching account in Asgardeo:

- `userName: DEFAULT/infas`
- `id: 2f458c21-5650-4a0d-a894-2df7a03d9441`

This ID exactly matches LibreChat `openidId` for the account, so it is the correct identity to provision.

---

## 8. Live API Provisioning Test Result

Action performed:

- Added user ID `2f458c21-5650-4a0d-a894-2df7a03d9441` to group `chat-pro-users` via SCIM2 PATCH.

Verification:

- Membership re-check confirmed user is now in `chat-pro-users`.

Final status:

- `SUCCESS: 2f458c21-5650-4a0d-a894-2df7a03d9441 added to chat-pro-users`

---

## 9. Recommended Production Automation Flow

1. Receive trusted payment webhook (backend only).
2. Resolve Asgardeo user by stable identity (prefer Asgardeo user ID; fallback to username mapping strategy).
3. PATCH add member to `chat-pro-users`.
4. On cancellation/refund/expiry, PATCH remove member.
5. Make operations idempotent and retry-safe.
6. Keep provisioning credentials server-side only; rotate secrets.
7. Keep local login policy explicit: keep `ALLOW_REGISTRATION=true` for public local signup, or set `ALLOW_REGISTRATION=false` for admin-controlled local accounts via invite/create-user flows.

---

## 10. Dual Login Configuration Snapshot (Email + SSO)

Use this `.env` baseline when both login methods should be available:

```env
ALLOW_EMAIL_LOGIN=true
ALLOW_REGISTRATION=true
ALLOW_SOCIAL_LOGIN=true
ALLOW_SOCIAL_REGISTRATION=true

OPENID_SCOPE="openid profile email groups"
OPENID_REQUIRED_ROLE=chat-pro-users
OPENID_REQUIRED_ROLE_TOKEN_KIND=id
OPENID_REQUIRED_ROLE_PARAMETER_PATH=groups
```

Optional lock-down variant (keep both login methods, disable self-signup):

```env
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_REGISTRATION=false
```

---

## 11. Security and Operations Notes

1. Keep login OIDC flow and provisioning API flow logically separate.
2. Do not expose `client_secret` in frontend.
3. Audit every group add/remove with payment event ID.
4. Use least-privilege scopes only.
5. If possible, move provisioning to a separate M2M app later for stronger isolation.

---

## 12. Reference Docs Used

- Manage Groups: https://wso2.com/asgardeo/docs/guides/users/manage-groups/
- SCIM2 Patch Operations: https://wso2.com/asgardeo/docs/apis/scim2/scim2-patch-operations/
- Register M2M App: https://wso2.com/asgardeo/docs/guides/applications/register-machine-to-machine-app/
- OIDC/Web App Settings (grant types): https://wso2.com/asgardeo/docs/references/app-settings/oidc-settings-for-app/
- Grant Types: https://wso2.com/asgardeo/docs/references/grant-types/

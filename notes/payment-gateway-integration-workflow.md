# Payment Gateway Integration Workflow (Paralegal + Chat Entitlement)

Date: 2026-05-05  
Scope: End-to-end payment-to-access workflow for `paralegal.lk`, `chat.paralegal.lk`, and dev environments.

---

## 1. Objective

Grant and revoke access to `chat.paralegal.lk` based on subscription payment status, using Asgardeo group membership (`chat-pro-users`) as the entitlement control.

---

## 2. System Roles

1. `paralegal.lk` (and `dev.paralegal.lk`)
- Hosts pricing/checkout entry.
- Owns payment-session creation and user-facing billing actions.

2. `chat.paralegal.lk` (and `devchat.paralegal.lk`)
- Hosts chat workspace.
- Enforces access by Asgardeo group claim checks during login.

3. Asgardeo (same tenant, different applications)
- Separate app clients for `paralegal.lk` and `chat.paralegal.lk`.
- Shared user store/identity across apps in the same tenant.
- Group `chat-pro-users` is the access gate for chat workspace.

4. Payment Provider
- Sends webhook events to backend after checkout/payment lifecycle events.

5. Backend Entitlement Service
- Verifies webhooks.
- Maps payer identity to Asgardeo user.
- Adds/removes users from `chat-pro-users` via SCIM API.

---

## 3. Environment Matrix

## 3.1 Production

1. Web app: `https://www.paralegal.lk`
2. Chat app: `https://chat.paralegal.lk`
3. Asgardeo apps: separate prod clients for web and chat
4. Payment mode: live keys/webhooks

## 3.2 Development

1. Web app: `https://dev.paralegal.lk`
2. Chat app: `https://devchat.paralegal.lk`
3. Asgardeo apps: separate dev clients for web and chat
4. Payment mode: sandbox/test keys/webhooks

Important: dev and prod must use separate payment credentials and webhook secrets.

---

## 4. Identity and Linking Strategy

Use server-validated identity as the source of truth:

1. Preferred user key: Asgardeo `sub` (or stable Asgardeo user ID).
2. Do not trust client-submitted email for entitlement writes.
3. Persist an internal mapping table:
- `internal_user_id`
- `asgardeo_user_id` (`sub`)
- `payment_customer_id`
- `subscription_id`
- `entitlement_state`

---

## 5. Access Control Model

1. User can access chat only when member of Asgardeo group `chat-pro-users`.
2. Chat app verifies required claim on login token (`groups` includes `chat-pro-users`).
3. Payment status changes update group membership.

---

## 6. Primary Workflow (Happy Path)

1. User logs in on `paralegal.lk`.
2. User starts subscription checkout.
3. Backend creates payment session for authenticated user.
4. User completes payment at payment gateway.
5. Gateway sends `payment_succeeded`/`subscription_active` webhook.
6. Backend verifies webhook signature and idempotency.
7. Backend resolves Asgardeo user ID for that payer.
8. Backend SCIM PATCH adds user to `chat-pro-users`.
9. User signs in to `chat.paralegal.lk`.
10. Chat app sees group claim and grants access.

---

## 7. Revocation Workflow

On cancellation, expiry, chargeback, or terminal payment failure:

1. Gateway sends relevant webhook event.
2. Backend verifies signature + idempotency.
3. Backend SCIM PATCH removes user from `chat-pro-users`.
4. Next chat login is denied by group gate.

Revocation timing policy (immediate vs end-of-period) should be configurable.

---

## 8. Webhook Handling Requirements

1. Verify signature using environment-specific webhook secret.
2. Store and reject duplicate event IDs (idempotency).
3. Process events asynchronously with retry-safe jobs.
4. Keep auditable logs:
- `event_id`
- `event_type`
- `customer_id`
- `asgardeo_user_id`
- `group_action` (add/remove)
- `status` (success/fail/retry)

Recommended terminal actions:

1. `payment_succeeded` or `subscription_activated` -> add to group
2. `subscription_canceled` or `subscription_expired` -> remove from group
3. `payment_refunded` (policy-based) -> remove or mark review

---

## 9. Asgardeo API Permissions (Provisioning App)

Provisioning client should have least-privilege scopes required for SCIM user/group operations, including group membership update and user lookup.

Keep this client separate from frontend/public clients where possible.

---

## 10. Security Controls

1. Never expose payment secret keys or Asgardeo client secrets to frontend.
2. Enforce HTTPS and strict webhook verification.
3. Use per-environment credentials and endpoints.
4. Rate-limit webhook endpoint.
5. Add replay protection and timestamp tolerance.
6. Log and alert on repeated SCIM failures.
7. Restrict admin/service credentials by IP/network policy where possible.

---

## 11. Failure Scenarios and Fallbacks

1. Webhook received but SCIM update fails:
- Mark entitlement job failed.
- Retry with backoff.
- Alert ops if retries exceed threshold.

2. Payment succeeded but user identity cannot be resolved:
- Move event to manual review queue.
- Do not grant access until identity is linked.

3. Group updated but user still denied at chat login:
- Verify chat app token includes `groups` claim.
- Verify user is in `chat-pro-users`.
- Force re-login to refresh token/claims.

---

## 12. Deployment and Rollout Plan

1. Implement on dev first (`dev.paralegal.lk` + `devchat.paralegal.lk`).
2. Run test matrix:
- new user payment -> access granted
- cancellation -> access revoked
- duplicate webhooks -> no duplicate writes
- invalid signature -> rejected
3. After validation, promote same flow to production with prod credentials.

---

## 13. Minimal Implementation Checklist

1. Backend endpoint for checkout session creation (auth required).
2. Backend webhook endpoint with signature verification.
3. Entitlement service for Asgardeo group add/remove.
4. Idempotency store for webhook event IDs.
5. Admin/ops log view for entitlement event history.
6. Environment-specific `.env` configuration for all secrets and URLs.

---

## 14. Configuration Keys (Example Names)

Use environment-specific values for dev/prod:

1. `PAYMENT_SECRET_KEY`
2. `PAYMENT_WEBHOOK_SECRET`
3. `PAYMENT_PRICE_ID_MONTHLY`
4. `ASGARDEO_PROVISION_CLIENT_ID`
5. `ASGARDEO_PROVISION_CLIENT_SECRET`
6. `ASGARDEO_TOKEN_URL`
7. `ASGARDEO_SCIM_BASE_URL`
8. `ASGARDEO_CHAT_PRO_GROUP_ID`
9. `CHAT_APP_URL`
10. `WEB_APP_URL`

---

## 15. Final Architecture Rule

Payment system decides subscription state.  
Asgardeo group membership represents access state.  
`chat.paralegal.lk` authorizes strictly from group claim at login.

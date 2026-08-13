# Deployment Changelog

Tracks the drift between the running `api` container and the `librechat:local` image,
so nothing is lost or silently reverted on the next image build / container recreate.

**Rule:** every hot-patch (files copied into the running container without an image
rebuild) gets an entry under *Pending*. When a new image is built and deployed, verify
each pending entry's commit is in the build, then move it to *Shipped*.

---

## Current image

| | |
|---|---|
| Image | `librechat:local` |
| Built | 2026-07-06 |
| Built from | `1760d6df4` (docs: ops runbook updates and research notes, 2026-07-03) |

⚠️ **The running container is hot-patched beyond this image.** Recreating the container
(`docker compose up -d --force-recreate`, `pre-build-cleanup.sh`, host reboot with
`--force-recreate`, etc.) reverts everything under *Pending* until a new image is built.

## Pending (in container, NOT in image)

### 2026-08-11 — De Saram Document Drafter endpoint (`118983adb`)
- **What:** Drafter endpoint with Asgardeo-authorized downloads; new
  `/api/auth/openid-token` route.
- **Hot-patched:** api server files copied into container —
  `api/server/services/OpenIdTokenService.js` (new file, **missing from image**),
  `api/server/controllers/AuthController.js`, `api/server/controllers/auth/oauth.js`,
  `api/server/routes/auth.js`. Client changes shipped via the 2026-08-13 dist copy below.
- **Breaks on recreate:** drafter document downloads fail (missing service + route).
- **Also touched:** `docker-compose.override.yml` (junior-drafter-network),
  `librechat.yaml` — both read from host, unaffected by recreate.

### 2026-08-11 — Service worker: exclude /files from navigation fallback (`2c2faac84`)
- **What:** `client/vite.config.ts` change so the PWA service worker doesn't hijack
  `/files` navigations.
- **Hot-patched:** included in the 2026-08-13 client dist copy below (built from a
  branch containing this commit).

### 2026-08-13 — Footnote anchors scroll in-page (`6a221cdd6`, branch `fix/footnote-anchor-scroll`)
- **What:** `MarkdownComponents.tsx` — hash-only links (GFM footnote refs like
  `#user-content-fn-3`) scroll to the footnote within the same message instead of
  opening a new tab.
- **Hot-patched:** client bundle built on host (`npm ci && npm run frontend`) and
  copied: `docker compose cp client/dist/. api:/app/client/dist/` + `docker compose restart api`.
  This dist includes ALL client-side changes of the two commits above.
- **Merge before next build:** `fix/footnote-anchor-scroll` → `desaram-ai-prod`.

## Uncommitted host state (not in git at all)

- `librechat.yaml` — modified on host (mounted into container, live). Commit or the
  change exists only on this machine.
- `MODEL_CONFIGURATION.md` — untracked.

## Next image build checklist

1. Merge `fix/footnote-anchor-scroll` into `desaram-ai-prod`.
2. Commit / reconcile `librechat.yaml` and `MODEL_CONFIGURATION.md`.
3. Build from `desaram-ai-prod` tip (`./scripts/pre-build-cleanup.sh --build`).
4. After deploy, verify:
   - `docker compose exec -T api ls /app/api/server/services/OpenIdTokenService.js` (drafter auth)
   - drafter download works end-to-end (Asgardeo token flow)
   - footnote click in a Junior De Saram reply scrolls in-page
5. Move the entries above to *Shipped* with the new image build date, and update the
   *Current image* table.

## Shipped

*(nothing yet — first entry after next image build)*

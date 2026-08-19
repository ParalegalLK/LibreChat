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

### 2026-08-14 — Theme-aware paralegal.lk icon in model selector (`0fb3c4402`)
- **What:** New `ParalegalLKIcon` component (mark follows `currentColor`: black in
  light mode, white in dark mode) replacing the static white-box
  `/images/paralegal-lk.svg` in the model selector. Registered as icon key
  `"paralegal"`; `librechat.yaml` researcher-silva spec now uses
  `groupIcon: "paralegal"` / `iconURL: "paralegal"`.
- **Files:** `packages/client/src/svgs/ParalegalLKIcon.tsx` (new),
  `packages/client/src/svgs/index.ts`, `client/src/hooks/Endpoint/Icons.tsx`
  (committed as `0fb3c4402` on `fix/footnote-anchor-scroll`); the
  `librechat.yaml` part is in `ef1061ba3`.
- **Hot-patched:** rebuilt `packages/client` dist + client bundle on host, then
  `docker cp client/dist LibreChat:/app/client/dist` (after `rm -rf` of the old dist).
  This dist supersedes the 2026-08-13 copy and includes all its changes.
- **Breaks on recreate:** selector falls back to the endpoint/unknown icon for the
  paralegal.lk spec (yaml `iconURL: "paralegal"` no longer resolves); old client
  bundle returns (also reverting the two entries above).
- **Incident note:** first deploy attempt copied the bundle to `/app/client/dis`
  (typo) after deleting `dist`, crash-looping the api (`ENOENT index.html`).
  Fixed by copying to the correct path; stray `dis` dir removed.

### 2026-08-19 — Drafter model renamed + rewired to new backend (`ef1061ba3`)
- **What:** Drafter model ID `document-drafter-de-saram-01` → `document-drafter-01-preview`
  (labels now "Document Drafter"); drafter endpoint `baseURL` changed from
  `http://junior-drafter-formatter:9124/v1` to `http://document-drafter:9124/v1`
  because the backend moved to the new `document-drafter` container
  (`~/document-drafter` repo compose) on the external `document-drafter-network`.
- **Applied live:** mounted `librechat.yaml` + Redis `FLUSHALL` + `docker compose
  restart api`; api container attached to the network with
  `docker network connect document-drafter-network LibreChat`.
- **Breaks on recreate:** nothing — `docker-compose.override.yml` now declares
  `document-drafter-network`, so a recreated api container re-attaches automatically.
  (The old backend container relies on nothing here; requires the `document-drafter`
  compose stack to be up.)
- **Leftovers:** old `junior-drafter-formatter` container is stopped but not removed;
  `junior-drafter-network` is still declared/attached (still used by the main
  De Saram AI junior backend). New container publishes host port 9124 — review
  firewall exposure.

## Uncommitted host state (not in git at all)

*(none as of 2026-08-19 — `librechat.yaml`, `docker-compose.override.yml`,
`MODEL_CONFIGURATION.md`, and the paralegal.lk icon changes are committed as
`0fb3c4402` / `ef1061ba3` on `fix/footnote-anchor-scroll`.)*

## Next image build checklist

1. Merge `fix/footnote-anchor-scroll` into `desaram-ai-prod`.
2. ~~Commit / reconcile `librechat.yaml`, `MODEL_CONFIGURATION.md`, and the
   paralegal.lk icon changes~~ — done 2026-08-19 (`0fb3c4402`, `ef1061ba3`).
3. Build from `desaram-ai-prod` tip (`./scripts/pre-build-cleanup.sh --build`).
4. After deploy, verify:
   - `docker compose exec -T api ls /app/api/server/services/OpenIdTokenService.js` (drafter auth)
   - drafter download works end-to-end (Asgardeo token flow)
   - footnote click in a Junior De Saram reply scrolls in-page
5. Move the entries above to *Shipped* with the new image build date, and update the
   *Current image* table.

## Shipped

*(nothing yet — first entry after next image build)*

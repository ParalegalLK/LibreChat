# Deployment Changelog

Tracks the drift between the running `api` container and the `librechat:local` image,
so nothing is lost or silently reverted on the next image build / container recreate.

**Rule:** every hot-patch (files copied into the running container without an image
rebuild) gets an entry under *Pending*. When a new image is built and deployed, verify
each pending entry's commit is in the build, then move it to *Shipped*.

---

## Development upgrade source — 2026-11-09

- **Upstream:** `main` / `upstream/main` at `6d499ba3c` integrated into
  `desaram-ai-dev` by merge commit `7b0050ccc` (v0.8.8-rc1 upgrade).
- **Firm prompt:** integrated the already-merged PR #18 (`e651f03f5`, including
  `050c825d3`). Kept `firm.ts`, the email-domain firm prompt, and the
  `claude-sonnet-5` model spec. Resolved `initialize.ts` by applying firm
  substitution while retaining the upstream conversation date/time anchor,
  request timezone, and stable/dynamic instruction handling. No additional
  v0.8.5 firm change is required.
- **Configuration:** `ce35615b4` commits the shared skill-directory mount, agent
  capabilities, Firecrawl proxy allowlist, and UI/model feature settings.
- **Local only:** deployment skill bundles under `skill/` remain untracked. The
  development-only URL fallback in `MarkdownComponents.tsx` remains uncommitted;
  the tracked fallback is `https://www.desaram.ai` for production. These rules are
  recorded in `AGENTS.md`.
- **Validation:** `npm ci`, all four shared-package builds, a production frontend
  build in a temporary output directory, Docker Compose/YAML validation, and
  176 tests across seven focused suites passed. The suites cover firm and
  instruction resolution, web-search context, authentication, audio, and chat
  attachments. Merge-resolution source files passed lint and formatting checks.
- **Deployment:** this records source integration and validation. No image was
  rebuilt or container restarted; the image and hot-patch records below remain
  separate from the source upgrade.

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

### 2026-08-26 — Stack recreated after `docker compose down`; all hot-patches re-applied
- **What:** The stack had been taken down with `docker compose down` on 2026-08-25
  ~15:30 UTC (containers removed, so every hot-patch above was gone). Brought back up
  2026-08-26 ~02:57 UTC with `docker compose up -d`, which created fresh containers
  from the 2026-07-06 image. Data was untouched (`data-node`, `meili_data_v1.12`,
  `librechat_pgdata2` / redis volumes).
- **Re-applied:** `docker cp` of the four drafter-auth api files from the
  `fix/footnote-anchor-scroll` worktree (unchanged since `118983adb`) and the host
  `client/dist` from 2026-08-14 00:24 (the paralegal-icon bundle, which supersedes
  the earlier ones), then `docker compose restart api`.
- **Verified:** `/health` 200; `/api/auth/openid-token` returns 401 (route present);
  `ParalegalLKIcon` present in bundle; api attached to `document-drafter-network`
  via the override file. Nothing new is pending beyond the entries above — this
  entry only records that they had to be re-applied.
- **Note:** `document-drafter` container (separate compose stack) was left stopped
  (`docker stop document-drafter` in shell history); Document Drafter model won't
  respond until it's started.

### 2026-10-29 — Stack recreated again after `docker compose down`; all hot-patches re-applied
- **What:** Same as 2026-08-26 — `docker compose down` + Docker restart recreated the
  containers from the 2026-07-06 image, dropping every hot-patch above
  (`/api/auth/openid-token` was 404, container served the July client bundle).
- **Re-applied:** `docker cp` of the four drafter-auth api files (host copies identical
  to `118983adb`); `rm -rf /app/client/dist` then `docker cp client/dist
  LibreChat:/app/client/dist` (host bundle from 2026-08-14 00:24, `index.Cd_49uhw.js`,
  includes the footnote fix + theme-aware paralegal.lk icon); `chown node:node`;
  `docker compose restart api`.
- **Verified:** `/health` 200; `/api/auth/openid-token` 401 (route present);
  `ParalegalLKIcon` SVG path present in the deployed bundle; `/images/paralegal-lk.svg`
  200; api attached to `document-drafter-network`; `document-drafter` container up.
- **Reminder:** this keeps happening — building a new image (checklist below) removes
  the need to re-apply after every `down`.

### 2026-10-29 — `{{current_firm}}` prompt variable by email domain (branch `fix/current-firm-variable`)
- **What:** Corporate Advisory users' minutes/letters were being rewritten to
  "D. L. & F. de Saram" because the shared `&firmPrompt` said to "override any other
  firm name". New `{{current_firm}}` variable resolved from the user's email domain;
  firm prompt now uses it and defers to the user / their documents instead of overriding.
- **Files:** `packages/api/src/agents/firm.ts` (+ `firm.spec.ts`, new),
  `packages/api/src/agents/initialize.ts`; `librechat.yaml` (firm prompt; the host copy
  also removes the `claude-sonnet-5` spec, see below); `.env` (`FIRM_NAME_DEFAULT`,
  `FIRM_NAME_BY_EMAIL_DOMAIN`).
- **Hot-patched:** `npm run build` in `packages/api` on host (no `packages/` drift vs
  `1760d6df4`, so only this change); old container dist backed up, then
  `rm -rf /app/packages/api/dist` + `docker cp packages/api/dist
  LibreChat:/app/packages/api/dist` + `chown node:node`; Redis `FLUSHALL`;
  `docker compose restart api`.
- **Breaks on recreate:** ⚠️ the yaml/.env are host-mounted and survive, but the image's
  api bundle doesn't know `{{current_firm}}` — the literal text `{{current_firm}}` is
  sent to every third-party model. Re-copy `packages/api/dist` or revert the yaml prompt.

## Uncommitted host state (not in git at all)

- 2026-11-09 development checkout: the local deployment skill bundles and the
  development-only presigned-URL fallback remain outside commits. The upgrade
  retains `claude-sonnet-5`; the v0.8.5 host-only removal below is historical.

- 2026-10-29: `claude-sonnet-5` spec removed from the host `librechat.yaml` only, on
  purpose — the running v0.8.5 container can't serve it, and the spec stays in git for
  the v0.8.8 upgrade. `.env` additions are host-only by design.

*(previously none as of 2026-08-19 — `librechat.yaml`, `docker-compose.override.yml`,
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

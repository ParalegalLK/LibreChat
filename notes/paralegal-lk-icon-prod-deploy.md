# paralegal.lk Icon — What to Do on Prod After Deploying the New Image

Date: 2026-08-30
Repo: `/home/paralegaluser/app/LibreChat`
Branch: `feat/add-stop-button-to-voice` (commit "Wire up paralegal.lk provider icon")

## What Changed in Code (ships with the image)
The paralegal.lk SVG is now a first-class provider icon, following the upstream
`ProviderId` → `providerIcons` → `<ProviderIcon>` pipeline:

| File | Change |
|---|---|
| `packages/data-provider/src/providers.ts` | `ProviderId.paralegal`; alias `paralegallk` so the endpoint name `paralegal.lk` also resolves |
| `packages/client/src/icons/provider/registry.ts` | `[ProviderId.paralegal]` → `ParalegalLKIcon`, `mono: true` (inherits `currentColor`, follows light/dark theme) |
| `packages/client/src/svgs/ParalegalLKIcon.tsx` | Exported from `packages/client/src/svgs/index.ts` |

`resolveProviderId()` normalises case and separators, so any of `"paralegal"`, `"paralegal.lk"`,
`"Paralegal LK"` resolve to the same icon. Because the endpoint named `paralegal.lk` now
resolves by name, that endpoint gets the icon even with no `iconURL` at all; the other
endpoints/specs (drafter, translator, reviewer) need `iconURL: "paralegal"` explicitly.

## What Does NOT Ship with the Image
`librechat.yaml` is **not tracked in git** and lives only on the prod server. The image alone
will not change any icons: prod's yaml still points at the feather emoji PNG
(`https://em-content.zobj.net/source/twitter/408/feather_1fab6.png`).

## Prod Steps (after `docker compose pull` / `up -d` with the new image)

1. Edit `librechat.yaml` on the prod server. Replace every feather URL with the bare provider id:

   ```bash
   cp librechat.yaml librechat.yaml.bak-$(date +%F)
   sed -i 's#"https://em-content.zobj.net/source/twitter/408/feather_1fab6.png"#"paralegal"#' librechat.yaml
   grep -n '"paralegal"' librechat.yaml   # expect ~12 hits: 4 endpoints × iconURL, 4 specs × (groupIcon + iconURL)
   ```

   Resulting shape:

   ```yaml
   endpoints:
     custom:
       - name: "paralegal.lk"
         iconURL: "paralegal"
       - name: "drafter-weeramantry"
         iconURL: "paralegal"
       - name: "translator-siriwardena"
         iconURL: "paralegal"
       - name: "reviever-agent"
         iconURL: "paralegal"

   modelSpecs:
     list:
       - name: "silva-01"
         group: "paralegal.lk"
         groupIcon: "paralegal"
         iconURL: "paralegal"
       # same groupIcon/iconURL on siriwardena-01, weeramantry-01, reviewer-01
   ```

2. Flush the cached config and restart the API (config is cached in Redis; the API also reads
   `index.html` into memory at startup):

   ```bash
   ./scripts/flush-config-cache.sh   # never redis-cli FLUSHALL — it drops OPENID_SESSION:* and signs everyone out
   docker compose restart api
   ```

3. Hard-refresh the browser (Ctrl+Shift+R) and check:
   - model selector: `paralegal.lk` group header + each spec row show the mark;
   - message avatars for the custom endpoints;
   - toggle light/dark — the mark should flip with the theme (it is `fill-current`).

## Ordering Caveat
Do **not** change the yaml before the new image is running. On the old image `"paralegal"` is an
unknown provider id, so `<ProviderIcon>` falls back to the generic `CustomMinimalIcon` (no error,
just a blank/generic mark). The feather PNG keeps working on either image, so yaml-last is the
safe order.

## Rollback
`cp librechat.yaml.bak-<date> librechat.yaml && ./scripts/flush-config-cache.sh && docker compose restart api`.

# Manual PWA Manifest Patch (Running Container)

This runbook patches the built PWA manifest inside the running `api` container to change:

- `name`: `devchat.paralegal.lk` -> `chat.paralegal.lk`
- `short_name`: `devchat.paralegal.lk` -> `chat.paralegal.lk`

Use this as a temporary hotfix when you do not want to rebuild.

## 1) Check current manifest values

```bash
docker compose exec api sh -lc "grep -E '\"name\"|\"short_name\"' /app/client/dist/manifest.webmanifest"
```

## 2) Backup and patch

```bash
docker compose exec api sh -lc '
cp /app/client/dist/manifest.webmanifest /app/client/dist/manifest.webmanifest.bak
sed -i -E "s/\"name\":\"devchat\\.paralegal\\.lk\"/\"name\":\"chat.paralegal.lk\"/; s/\"short_name\":\"devchat\\.paralegal\\.lk\"/\"short_name\":\"chat.paralegal.lk\"/" /app/client/dist/manifest.webmanifest
'
```

## 3) Verify patch

```bash
docker compose exec api sh -lc "cat /app/client/dist/manifest.webmanifest"
```

Expected values:

- `"name":"chat.paralegal.lk"`
- `"short_name":"chat.paralegal.lk"`

## 4) Refresh PWA on browser

1. Uninstall/remove the currently installed PWA.
2. Hard refresh browser (`Ctrl+Shift+R`) or clear site data/service worker.
3. Reinstall the PWA.

## 5) Rollback (if needed)

```bash
docker compose exec api sh -lc '
cp /app/client/dist/manifest.webmanifest.bak /app/client/dist/manifest.webmanifest
cat /app/client/dist/manifest.webmanifest
'
```

## Notes

- This is temporary and will be overwritten by rebuild/redeploy/container replacement.
- Permanent fix is to pass `APP_TITLE` at frontend build time and rebuild.

# Fix: API container restart loop — broken chevrotain hoisting

**Date**: 2026-03-13

## Symptom

API container (`LibreChat`) stuck in a restart loop with:

```
error: There was an uncaught error: ENOENT: no such file or directory, open '/app/client/dist/index.html'
```

The frontend build artifacts were missing from the Docker image.

## Root cause

Two issues combined:

### 1. Broken dependency hoisting in `package-lock.json`

The lockfile sync merge (`b29929ab3`) regenerated `package-lock.json` locally, which changed npm's hoisting decisions:

| Package | Upstream | Our fork |
|---|---|---|
| `chevrotain-allstar` | root `node_modules/` | root `node_modules/` |
| `chevrotain` | **root `node_modules/`** | `client/node_modules/` only |

`chevrotain-allstar` has `chevrotain` as a **peer dependency**. With `chevrotain` only in `client/node_modules/`, Vite/Rollup couldn't resolve the import from `node_modules/chevrotain-allstar/lib/all-star-lookahead.js` during the frontend build, causing:

```
Rollup failed to resolve import "chevrotain" from "/app/node_modules/chevrotain-allstar/lib/all-star-lookahead.js"
```

### 2. Dockerfile used `;` instead of `&&`

The Dockerfile's build step used semicolons between commands:

```dockerfile
RUN \
    NODE_OPTIONS="..." npm run frontend; \
    npm prune --production; \
    npm cache clean --force
```

This meant the failed `npm run frontend` didn't fail the Docker build — the image was created without `client/dist/`.

## Fixes applied

### `package-lock.json`

Replaced with upstream's lockfile (`git checkout upstream/main -- package-lock.json`) which has correct hoisting — `chevrotain` at root `node_modules/` where `chevrotain-allstar` can find it.

### `Dockerfile`

Changed `;` to `&&` so build failures propagate:

```dockerfile
RUN \
    NODE_OPTIONS="..." npm run frontend && \
    npm prune --production && \
    npm cache clean --force
```

## Lesson

When regenerating `package-lock.json` locally (e.g., after merge conflicts), always verify the build works. npm workspace hoisting is non-deterministic across environments — prefer using upstream's lockfile when possible.

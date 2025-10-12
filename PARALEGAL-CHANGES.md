# Chat Paralegal - Changes from LibreChat

**Base Version:** LibreChat v0.8.0-rc3
**Project:** Chat Paralegal (paralegal.lk)

---

## Changes Made

### 1. Environment Configuration
**File:** `.env`

**What Changed:**
- `APP_TITLE=Chat | Paralegal`
- `CUSTOM_FOOTER="Copyright © paralegal.lk 2025"`
- `HELP_AND_FAQ_URL=https://www.paralegal.lk/help`

**What It Reflects:**
Customizes branding throughout the application - page titles, footer text, and help documentation links now reflect Chat Paralegal instead of LibreChat.

---

### 2. HTML Page Title
**File:** `client/index.html`

**What Changed:**
Changed `<title>` tag to "Chat | Paralegal"

**What It Reflects:**
Browser tab displays "Chat | Paralegal" as the initial page title.

---

### 3. Title Flicker Fix
**File:** `client/src/routes/Layouts/Startup.tsx`

**What Changed:**
Updated the fallback title from `'LibreChat'` to `'Chat | Paralegal'`

**What It Reflects:**
Prevents title flickering between "LibreChat" and "Chat | Paralegal" when refreshing login/register pages. Now consistently shows "Chat | Paralegal".

---

### 4. Docker Local Build
**File:** `docker-compose.yml`

**What Changed:**
- Commented out: `image: ghcr.io/danny-avila/librechat:latest`
- Added build configuration:
  ```yaml
  build:
    context: .
    dockerfile: Dockerfile
    target: node
  ```

**What It Reflects:**
Builds the application from local Dockerfile instead of pulling a pre-built image. This allows adding custom dependencies for legal document features and faster development iteration with `docker-compose up --build`.

---

## Summary

These changes customize LibreChat for the Chat Paralegal platform, focusing on branding and development workflow improvements. The application now identifies as "Chat | Paralegal" and can be built locally for custom legal-specific features.

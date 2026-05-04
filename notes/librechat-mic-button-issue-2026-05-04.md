# LibreChat Mic Button Issue (May 4, 2026)

## Symptom
- On login and opening a **new chat**, microphone button was missing.
- After sending the first message, mic button appeared.
- Existing/old chats showed mic button.
- Refreshing could hide the mic again on new chat.

## Root Cause
Two separate issues were identified:

1. Frontend rendering bug (primary)
- In `client/src/components/Chat/Input/AudioRecorder.tsx`, mic UI returned `null` when `textAreaRef.current` was not ready on initial render.
- With memoized chat form behavior, new chat could stay without mic until later state changes.

2. Config schema mismatch during troubleshooting
- Setting `speechTab.speechToText.engineSTT: "external"` and `speechTab.textToSpeech.engineTTS: "external"` caused config validation failure in this LibreChat version (`v0.8.5-rc1`).
- API container crash-looped and site returned `502 Bad Gateway`.
- Valid values in this version are provider names (e.g. `"openai"`), not `"external"`.

## Code Changes Applied
1. `client/src/components/Chat/Input/AudioRecorder.tsx`
- Removed `textAreaRef` prop requirement.
- Removed render-time guard:
  - `if (!textAreaRef.current) return null;`
- Result: mic button is no longer blocked by first-render ref timing.

2. `client/src/components/Chat/Input/ChatForm.tsx`
- Removed `textAreaRef` prop passed into `AudioRecorder`.

3. `librechat.yaml`
- Kept engine values as:
  - `engineSTT: "openai"`
  - `engineTTS: "openai"`
- This avoids config validation failure and API crash.

## Operational Findings
- `STT_API_KEY` and `TTS_API_KEY` were set in `.env`.
- After restoring valid `librechat.yaml`, API recovered and `/login` returned HTTP `200`.

## Deploy Steps for Mic Fix (Code-Level)
Because this setup uses a Docker image (`librechat:local`), source edits require rebuild:

```bash
docker compose build api
docker compose up -d api
docker compose ps
docker compose logs --tail 120 api
```

Then clear config cache (optional but recommended after speech/config changes):

```bash
docker compose exec librechat-redis redis-cli FLUSHALL
docker compose restart api
```

Finally hard refresh browser:
- `Ctrl+Shift+R`

## Verification Checklist
- API container status is `Up` (not restarting).
- `/login` returns `200`.
- In `/c/new`, mic icon is visible before first message.
- Mic remains visible after refresh and when switching between new/old chats.


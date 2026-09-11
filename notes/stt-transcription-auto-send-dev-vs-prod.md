# STT: transcription lands in the input box on dev, but not on prod

**Date:** 2026-08-30
**Image:** `ghcr.io/paralegallk/chat-paralegal-lk:latest` (dev commit `c58dd0eef`) — same image on both hosts.

## Observed

- **Dev:** click mic → speak → click stop → transcribed text appears in the chat input, user can edit it, then sends manually.
- **Prod:** not the case (either the text is auto-submitted to the model, or it never appears in the input — see §4 to tell which).

Because the image is identical, **the code path is identical**. The difference must come from one of three
places that are *not* baked into the image:

1. `librechat.yaml` on the prod host (gitignored, per-host file)
2. Redis config cache on prod (stale copy of an older `librechat.yaml`)
3. Browser `localStorage` for the user who tested on prod

## 1. How the code actually decides

Relevant files (all in the image):

| File | Role |
|---|---|
| `client/src/hooks/Input/useSpeechToTextExternal.ts:60-70` | External STT (Whisper) completion handler |
| `client/src/hooks/Input/useSpeechToTextBrowser.ts:78-82` | Browser Web-Speech completion handler |
| `client/src/hooks/Input/useAudioRecorder.ts:35-60` | `onTranscriptionComplete` → calls `ask({ text })` i.e. **submits** |
| `client/src/hooks/Config/useSpeechSettingsInit.ts` | Pushes yaml `speechTab` values into Recoil/localStorage |
| `client/src/store/settings.ts:120-139` | Recoil atoms + localStorage keys + defaults |
| `api/server/services/Files/Audio/getCustomConfigSpeech.js` | Server: flattens yaml `speech.speechTab` into a flat JSON |
| `GET /api/files/speech/config/get` | Endpoint the client reads on login |

Completion logic (external STT; the browser path is equivalent):

```ts
setText(extractedText);                       // ALWAYS puts text in the input box
if (autoSendText > -1 && speechToText && extractedText.length > 0) {
  setTimeout(() => onTranscriptionComplete(extractedText), autoSendText * 1000);  // submits
}
```

So:

- `autoSendText === -1` → text stays in the box, user edits and sends. **(dev behaviour)**
- `autoSendText >= 0` → text is put in the box and then **auto-submitted after N seconds** (`0` = immediately, which looks like "it never showed up in the box").
- `speechToText === false` → the mic button shouldn't even be usable.

`conversationMode` is *not* read directly by the recorder. But toggling it on in Settings → Speech
(`ConversationModeSwitch.tsx:18`) **sets `autoSendText = 3`** as a side effect, so a user who flipped it
on once is now on auto-send even if the yaml says `-1`.

## 2. Dev host config (the working reference)

`librechat.yaml` on dev:

```yaml
speech:
  speechTab:
    conversationMode: false
    advancedMode: true
    speechToText:
      autoTranscribeAudio: false
      decibelValue: -45
      autoSendText: -1        # <- this is the switch
    textToSpeech: true
  stt:
    openai:
      apiKey: ${STT_API_KEY}
      model: 'whisper-1'
  tts:
    openai:
      apiKey: ${TTS_API_KEY}
      model: 'tts-1'
      voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
```

`.env` on dev: `STT_API_KEY` and `TTS_API_KEY` set; `STT_VIOLATION_SCORE=0`, `TTS_VIOLATION_SCORE=0`.

What the server sends the client for this yaml (`GET /api/files/speech/config/get`):

```json
{
  "sttExternal": true,
  "ttsExternal": true,
  "advancedMode": true,
  "autoTranscribeAudio": false,
  "decibelValue": -45,
  "autoSendText": -1,
  "textToSpeech": true
}
```

Note `conversationMode` is **not** forwarded by `getCustomConfigSpeech.js` (it only handles
`advancedMode`, `speechToText`, `textToSpeech`), so setting it in yaml is a no-op — the default `false`
from `settings.ts` applies unless the user changed it in the UI.

## 3. How yaml values reach the browser (why localStorage matters)

`useSpeechSettingsInit.ts` runs on login and, for each key from the endpoint:

- Records what it applied in `localStorage.appliedSpeechConfig`.
- **Applies the yaml value only if** the key was never applied before, **or** the yaml value differs from
  what was last applied. Otherwise the user's stored preference (`localStorage.<key>`) wins.

Consequence: if prod's yaml *used* to say `autoSendText: 0` (or a user toggled conversation mode /
auto-send in Settings), the browser keeps `localStorage.autoSendText = 0` and a later yaml change
to `-1` **does** override it (value changed since last applied) — but only after the new config is
actually served, which is where the Redis cache comes in.

Also: a pre-existing `localStorage.autoSendText` set by the UI with **no** `appliedSpeechConfig` entry
(e.g. from a build before this hook existed) *will* be overwritten on first load with the new build —
so "user preference" is the less likely cause than stale server config, but it's the cheapest to check.

## 4. Troubleshooting checklist for prod

Run in order; stop at the first mismatch.

1. **What does prod's yaml say?**
   ```bash
   grep -n -A12 '^speech:' librechat.yaml
   ```
   Look for `autoSendText`. If it's absent, `0`, or any value ≥ 0 → that's the cause; set `-1`.
   Also confirm `stt:` block exists with a key (otherwise `sttExternal:false` and the client falls back
   to browser Web Speech, which behaves differently and is Chrome-only).

2. **What is the API actually serving?** (bypasses the yaml file, hits the cached config)
   In a logged-in prod browser session, DevTools → Network → reload → find
   `files/speech/config/get` → Response. Or from the host with a JWT:
   ```bash
   curl -s -H "Authorization: Bearer <jwt>" https://<prod>/api/files/speech/config/get
   ```
   Expected: the JSON in §2. If `autoSendText` differs from the yaml file → **stale Redis config cache**:
   ```bash
   ./scripts/flush-config-cache.sh   # never redis-cli FLUSHALL (kills SSO sessions)
   docker compose restart api
   ```

3. **What does the user's browser hold?** DevTools → Application → Local Storage → prod origin:
   ```
   autoSendText            expect -1
   speechToText            expect true
   conversationMode        expect false
   engineSTT               expect "external"
   appliedSpeechConfig     expect {"autoSendText":-1,...}
   ```
   Quick reset for one user: delete `appliedSpeechConfig` and `autoSendText`, hard-refresh (Ctrl+Shift+R).
   Or in-app: Settings → Speech → "Auto send text" toggle should be **off**; "Conversation mode" off.

4. **Distinguish "auto-sent" from "never transcribed":**
   - If a new user message appears in the thread right after stop → auto-send (`autoSendText ≥ 0`).
   - If nothing appears anywhere → transcription failed. Check `docker compose logs api | grep -i stt`
     for a 4xx/5xx from OpenAI (`STT_API_KEY` missing/invalid on prod `.env`) or a
     `STT_VIOLATION_SCORE` ban, and DevTools → Network → `files/speech/stt` response.

5. **Hard-refresh after any fix.** The client bundle caches the config query; a normal reload can keep
   the old values for the session.

## 5. Most likely cause (my bet)

Prod's `librechat.yaml` has `autoSendText: 0` (the upstream sample config uses `0` together with
`autoTranscribeAudio: true` — the commented-out block in our dev yaml is exactly that), or prod's
Redis still holds the config from before the yaml was edited. Step 2 settles it in one request.

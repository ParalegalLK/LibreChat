import { useEffect, useRef } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import { STTEndpoints, TTSEndpoints } from '~/common';
import { logger } from '~/utils';
import store from '~/store';

const VALID_TTS_ENGINES: string[] = [TTSEndpoints.browser, TTSEndpoints.external];
const SKIPPED_KEYS = new Set(['sttExternal', 'ttsExternal', 'message']);
export const APPLIED_SPEECH_CONFIG_KEY = 'appliedSpeechConfig';

type SpeechSettingValue = string | number | boolean | null | undefined;
type AppliedSpeechConfig = Record<string, SpeechSettingValue>;
type SpeechConfigData = Record<string, SpeechSettingValue> & {
  sttExternal?: boolean;
  ttsExternal?: boolean;
};

/**
 * The yaml `engineSTT`/`engineTTS` values name providers, not client engines,
 * so the client engine is derived from whether an external provider is configured.
 */
function withEngineDefaults(data: SpeechConfigData): SpeechConfigData {
  return {
    ...data,
    engineSTT: data.sttExternal ? STTEndpoints.external : STTEndpoints.browser,
    engineTTS: data.ttsExternal ? TTSEndpoints.external : TTSEndpoints.browser,
  };
}

function readAppliedConfig(): AppliedSpeechConfig {
  try {
    return JSON.parse(localStorage.getItem(APPLIED_SPEECH_CONFIG_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Initializes speech-related Recoil values from the server-side custom
 * configuration (only when the user is authenticated).
 *
 * A config value is pushed into the browser when it has not been applied before
 * or when the admin changed it since it was last applied; otherwise the user's
 * stored preference wins.
 */
export default function useSpeechSettingsInit(isAuthenticated: boolean) {
  const { data } = useGetCustomConfigSpeechQuery({ enabled: isAuthenticated });
  const [engineTTS, setEngineTTS] = useRecoilState<string>(store.engineTTS);

  const setters = useRef({
    conversationMode: useSetRecoilState(store.conversationMode),
    advancedMode: useSetRecoilState(store.advancedMode),
    speechToText: useSetRecoilState(store.speechToText),
    textToSpeech: useSetRecoilState(store.textToSpeech),
    cacheTTS: useSetRecoilState(store.cacheTTS),
    engineSTT: useSetRecoilState(store.engineSTT),
    languageSTT: useSetRecoilState(store.languageSTT),
    autoTranscribeAudio: useSetRecoilState(store.autoTranscribeAudio),
    decibelValue: useSetRecoilState(store.decibelValue),
    autoSendText: useSetRecoilState(store.autoSendText),
    engineTTS: setEngineTTS,
    voice: useSetRecoilState(store.voice),
    cloudBrowserVoices: useSetRecoilState(store.cloudBrowserVoices),
    languageTTS: useSetRecoilState(store.languageTTS),
    automaticPlayback: useSetRecoilState(store.automaticPlayback),
    playbackRate: useSetRecoilState(store.playbackRate),
  }).current;

  useEffect(() => {
    if (!isAuthenticated || !data || data.message === 'not_found') return;

    logger.log('Initializing speech settings from config:', data);

    const applied = readAppliedConfig();
    const nextApplied: AppliedSpeechConfig = {};

    Object.entries(withEngineDefaults(data)).forEach(([key, value]) => {
      if (SKIPPED_KEYS.has(key)) return;

      const setter = setters[key as keyof typeof setters];
      if (!setter) return;

      nextApplied[key] = value;

      const unchangedSinceApplied = key in applied && applied[key] === value;
      if (unchangedSinceApplied && localStorage.getItem(key) !== null) return;

      logger.log(`Applying speech setting from config: ${key} = ${value}`);
      setter(value as never);
    });

    localStorage.setItem(APPLIED_SPEECH_CONFIG_KEY, JSON.stringify(nextApplied));
  }, [isAuthenticated, data, setters]);

  useEffect(() => {
    if (VALID_TTS_ENGINES.includes(engineTTS)) return;
    logger.log(`Resetting invalid TTS engine "${engineTTS}" to ${TTSEndpoints.browser}`);
    setEngineTTS(TTSEndpoints.browser);
  }, [engineTTS, setEngineTTS]);
}

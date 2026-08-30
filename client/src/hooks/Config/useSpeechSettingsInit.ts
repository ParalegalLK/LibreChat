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
  message?: string;
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
  const { data, isError, isFetched } = useGetCustomConfigSpeechQuery({ enabled: isAuthenticated });
  const [engineSTT, setEngineSTT] = useRecoilState<string>(store.engineSTT);
  const [engineTTS, setEngineTTS] = useRecoilState<string>(store.engineTTS);
  const setSpeechSettingsInitialized = useSetRecoilState(store.speechSettingsInitialized);

  const setters = useRef({
    conversationMode: useSetRecoilState(store.conversationMode),
    advancedMode: useSetRecoilState(store.advancedMode),
    speechToText: useSetRecoilState(store.speechToText),
    textToSpeech: useSetRecoilState(store.textToSpeech),
    cacheTTS: useSetRecoilState(store.cacheTTS),
    engineSTT: setEngineSTT,
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
    if (!isAuthenticated) {
      setSpeechSettingsInitialized(false);
      return;
    }

    if (!isFetched) return;

    if (
      isError &&
      (localStorage.getItem('engineSTT') === null || localStorage.getItem('engineTTS') === null)
    ) {
      setSpeechSettingsInitialized(false);
      return;
    }

    const effectiveConfig =
      data && data.message !== 'not_found' ? withEngineDefaults(data) : undefined;

    if (effectiveConfig) {
      logger.log('Initializing speech settings from config:', data);

      const applied = readAppliedConfig();
      const nextApplied: AppliedSpeechConfig = {};

      Object.entries(effectiveConfig).forEach(([key, value]) => {
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
    }

    const hasSavedEngineSTT = localStorage.getItem('engineSTT') !== null;
    const hasSavedEngineTTS = localStorage.getItem('engineTTS') !== null;
    const configuredEngineSTT = hasSavedEngineSTT ? engineSTT : effectiveConfig?.engineSTT;
    const configuredEngineTTS = hasSavedEngineTTS ? engineTTS : effectiveConfig?.engineTTS;
    const sttExternalUnavailable = data?.sttExternal != null && !data.sttExternal;
    const ttsExternalUnavailable = data?.ttsExternal != null && !data.ttsExternal;

    if (sttExternalUnavailable && configuredEngineSTT === STTEndpoints.external) {
      setEngineSTT(STTEndpoints.browser);
    }
    if (ttsExternalUnavailable && configuredEngineTTS === TTSEndpoints.external) {
      setEngineTTS(TTSEndpoints.browser);
    }

    setSpeechSettingsInitialized(true);
  }, [
    data,
    engineSTT,
    engineTTS,
    isAuthenticated,
    isError,
    isFetched,
    setEngineSTT,
    setEngineTTS,
    setSpeechSettingsInitialized,
    setters,
  ]);

  useEffect(() => {
    if (VALID_TTS_ENGINES.includes(engineTTS)) return;
    logger.log(`Resetting invalid TTS engine "${engineTTS}" to ${TTSEndpoints.browser}`);
    setEngineTTS(TTSEndpoints.browser);
  }, [engineTTS, setEngineTTS]);
}

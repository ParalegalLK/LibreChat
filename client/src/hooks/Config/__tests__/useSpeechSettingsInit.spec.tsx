import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook, waitFor } from '@testing-library/react';

const mockUseGetCustomConfigSpeechQuery = jest.fn();

jest.mock('librechat-data-provider/react-query', () => ({
  useGetCustomConfigSpeechQuery: () => mockUseGetCustomConfigSpeechQuery(),
}));

jest.mock('~/utils', () => ({
  logger: { log: jest.fn() },
}));

import useSpeechSettingsInit, { APPLIED_SPEECH_CONFIG_KEY } from '../useSpeechSettingsInit';
import store from '~/store';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

const useSpeechSettingsHarness = (isAuthenticated = true) => {
  useSpeechSettingsInit(isAuthenticated);
  return {
    autoTranscribeAudio: useRecoilValue(store.autoTranscribeAudio),
    decibelValue: useRecoilValue(store.decibelValue),
    engineSTT: useRecoilValue(store.engineSTT),
    engineTTS: useRecoilValue(store.engineTTS),
    speechSettingsInitialized: useRecoilValue(store.speechSettingsInitialized),
  };
};

function mockSpeechConfig(config: Record<string, unknown>, isError = false) {
  mockUseGetCustomConfigSpeechQuery.mockReturnValue({
    data: config,
    isFetched: true,
    isError,
  });
}

describe('useSpeechSettingsInit', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockSpeechConfig({ sttExternal: true, ttsExternal: true });
  });

  it('overrides a stale localStorage value the first time a config value is applied', async () => {
    localStorage.setItem('autoTranscribeAudio', 'true');
    localStorage.setItem('decibelValue', '-80');
    mockSpeechConfig({ autoTranscribeAudio: false, decibelValue: -45 });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => expect(result.current.decibelValue).toBe(-45));
    expect(result.current.autoTranscribeAudio).toBe(false);
    expect(localStorage.getItem('autoTranscribeAudio')).toBe('false');
    expect(JSON.parse(localStorage.getItem(APPLIED_SPEECH_CONFIG_KEY) ?? '{}')).toEqual({
      autoTranscribeAudio: false,
      decibelValue: -45,
      engineSTT: 'browser',
      engineTTS: 'browser',
    });
  });

  it('defaults engines to external when external providers are configured', async () => {
    localStorage.setItem('engineSTT', JSON.stringify('browser'));
    mockSpeechConfig({ sttExternal: true, ttsExternal: false });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => expect(result.current.engineSTT).toBe('external'));
    expect(result.current.engineTTS).toBe('browser');
    expect(localStorage.getItem('engineSTT')).toBe(JSON.stringify('external'));
  });

  it('keeps a user-chosen engine once the external default has been applied', async () => {
    localStorage.setItem(APPLIED_SPEECH_CONFIG_KEY, JSON.stringify({ engineSTT: 'external' }));
    localStorage.setItem('engineSTT', JSON.stringify('browser'));
    mockSpeechConfig({ sttExternal: true });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => expect(result.current.speechSettingsInitialized).toBe(true));
    expect(result.current.engineSTT).toBe('browser');
  });

  it('keeps the user preference once the same config has already been applied', async () => {
    localStorage.setItem(
      APPLIED_SPEECH_CONFIG_KEY,
      JSON.stringify({
        autoTranscribeAudio: false,
        decibelValue: -45,
        engineSTT: 'browser',
        engineTTS: 'browser',
      }),
    );
    localStorage.setItem('autoTranscribeAudio', 'true');
    mockSpeechConfig({ autoTranscribeAudio: false, decibelValue: -45 });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => expect(result.current.speechSettingsInitialized).toBe(true));
    expect(result.current.autoTranscribeAudio).toBe(true);
  });

  it('re-applies a config value when the admin changes it', async () => {
    localStorage.setItem(
      APPLIED_SPEECH_CONFIG_KEY,
      JSON.stringify({ autoTranscribeAudio: false, decibelValue: -45 }),
    );
    localStorage.setItem('autoTranscribeAudio', 'true');
    localStorage.setItem('decibelValue', '-45');
    mockSpeechConfig({ autoTranscribeAudio: false, decibelValue: -60 });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => expect(result.current.decibelValue).toBe(-60));
    expect(result.current.autoTranscribeAudio).toBe(true);
  });

  it('does not apply config values when config is not found', async () => {
    localStorage.setItem('autoTranscribeAudio', 'true');
    mockSpeechConfig({ message: 'not_found' });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => expect(result.current.speechSettingsInitialized).toBe(true));
    expect(result.current.autoTranscribeAudio).toBe(true);
    expect(localStorage.getItem(APPLIED_SPEECH_CONFIG_KEY)).toBeNull();
  });

  it.each(['openai', 'azureOpenAI'])(
    'migrates the persisted STT provider "%s" to the external engine',
    async (engineSTT) => {
      localStorage.setItem('engineSTT', JSON.stringify(engineSTT));

      const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

      await waitFor(() => expect(result.current.engineSTT).toBe('external'));
      expect(localStorage.getItem('engineSTT')).toBe(JSON.stringify('external'));
    },
  );

  it.each(['openai', 'azureOpenAI', 'elevenlabs', 'localai'])(
    'migrates the persisted TTS provider "%s" to the external engine',
    async (engineTTS) => {
      localStorage.setItem('engineTTS', JSON.stringify(engineTTS));

      const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

      await waitFor(() => expect(result.current.engineTTS).toBe('external'));
      expect(localStorage.getItem('engineTTS')).toBe(JSON.stringify('external'));
    },
  );

  it('falls back saved external engines when their providers are unavailable', async () => {
    localStorage.setItem(
      APPLIED_SPEECH_CONFIG_KEY,
      JSON.stringify({
        engineSTT: 'external',
        engineTTS: 'external',
      }),
    );
    localStorage.setItem('engineSTT', JSON.stringify('external'));
    localStorage.setItem('engineTTS', JSON.stringify('external'));
    mockSpeechConfig({ sttExternal: false, ttsExternal: false });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current).toMatchObject({
        engineSTT: 'browser',
        engineTTS: 'browser',
        speechSettingsInitialized: true,
      });
    });
    expect(localStorage.getItem('engineSTT')).toBe(JSON.stringify('browser'));
    expect(localStorage.getItem('engineTTS')).toBe(JSON.stringify('browser'));
  });

  it('keeps speech controls disabled until configuration initialization settles', () => {
    mockUseGetCustomConfigSpeechQuery.mockReturnValue({
      data: undefined,
      isFetched: false,
      isError: false,
    });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    expect(result.current.speechSettingsInitialized).toBe(false);
  });

  it('keeps speech controls disabled after a configuration error on fresh storage', () => {
    mockUseGetCustomConfigSpeechQuery.mockReturnValue({
      data: undefined,
      isFetched: true,
      isError: true,
    });

    const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

    expect(result.current.speechSettingsInitialized).toBe(false);
  });

  it.each(['engineSTT', 'engineTTS'])(
    'keeps speech controls disabled after an error when only %s is saved',
    (savedEngine) => {
      localStorage.setItem(savedEngine, JSON.stringify('browser'));
      mockUseGetCustomConfigSpeechQuery.mockReturnValue({
        data: undefined,
        isFetched: true,
        isError: true,
      });

      const { result } = renderHook(() => useSpeechSettingsHarness(), { wrapper });

      expect(result.current.speechSettingsInitialized).toBe(false);
    },
  );
});

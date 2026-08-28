import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook } from '@testing-library/react';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import useSpeechSettingsInit, { APPLIED_SPEECH_CONFIG_KEY } from '../useSpeechSettingsInit';
import store from '~/store';

jest.mock('librechat-data-provider/react-query', () => ({
  useGetCustomConfigSpeechQuery: jest.fn(),
}));

const mockedQuery = useGetCustomConfigSpeechQuery as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

function renderInit(config: Record<string, unknown>) {
  mockedQuery.mockReturnValue({ data: config });
  return renderHook(
    () => {
      useSpeechSettingsInit(true);
      return {
        autoTranscribeAudio: useRecoilValue(store.autoTranscribeAudio),
        decibelValue: useRecoilValue(store.decibelValue),
        engineSTT: useRecoilValue(store.engineSTT),
        engineTTS: useRecoilValue(store.engineTTS),
      };
    },
    { wrapper },
  );
}

describe('useSpeechSettingsInit', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('overrides a stale localStorage value the first time a config value is applied', () => {
    localStorage.setItem('autoTranscribeAudio', 'true');
    localStorage.setItem('decibelValue', '-80');

    const { result } = renderInit({ autoTranscribeAudio: false, decibelValue: -45 });

    expect(result.current.autoTranscribeAudio).toBe(false);
    expect(result.current.decibelValue).toBe(-45);
    expect(localStorage.getItem('autoTranscribeAudio')).toBe('false');
    expect(JSON.parse(localStorage.getItem(APPLIED_SPEECH_CONFIG_KEY) ?? '{}')).toEqual({
      autoTranscribeAudio: false,
      decibelValue: -45,
      engineSTT: 'browser',
      engineTTS: 'browser',
    });
  });

  it('defaults engines to external when external providers are configured', () => {
    localStorage.setItem('engineSTT', '"browser"');

    const { result } = renderInit({ sttExternal: true, ttsExternal: false });

    expect(result.current.engineSTT).toBe('external');
    expect(result.current.engineTTS).toBe('browser');
    expect(localStorage.getItem('engineSTT')).toBe('"external"');
  });

  it('keeps a user-chosen engine once the external default has been applied', () => {
    localStorage.setItem(APPLIED_SPEECH_CONFIG_KEY, JSON.stringify({ engineSTT: 'external' }));
    localStorage.setItem('engineSTT', '"browser"');

    const { result } = renderInit({ sttExternal: true });

    expect(result.current.engineSTT).toBe('browser');
  });

  it('keeps the user preference once the same config has already been applied', () => {
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

    const { result } = renderInit({ autoTranscribeAudio: false, decibelValue: -45 });

    expect(result.current.autoTranscribeAudio).toBe(true);
  });

  it('re-applies a config value when the admin changes it', () => {
    localStorage.setItem(
      APPLIED_SPEECH_CONFIG_KEY,
      JSON.stringify({ autoTranscribeAudio: false, decibelValue: -45 }),
    );
    localStorage.setItem('autoTranscribeAudio', 'true');
    localStorage.setItem('decibelValue', '-45');

    const { result } = renderInit({ autoTranscribeAudio: false, decibelValue: -60 });

    expect(result.current.autoTranscribeAudio).toBe(true);
    expect(result.current.decibelValue).toBe(-60);
  });

  it('does nothing when config is not found', () => {
    localStorage.setItem('autoTranscribeAudio', 'true');

    const { result } = renderInit({ message: 'not_found' });

    expect(result.current.autoTranscribeAudio).toBe(true);
    expect(localStorage.getItem(APPLIED_SPEECH_CONFIG_KEY)).toBeNull();
  });
});

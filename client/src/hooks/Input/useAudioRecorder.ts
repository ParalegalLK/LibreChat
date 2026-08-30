import { useCallback, useRef } from 'react';
import { useToastContext } from '@librechat/client';
import type { TAskFunction } from '~/common';
import type { useChatFormContext } from '~/Providers';
import useGetAudioSettings from './useGetAudioSettings';
import useSpeechToText from './useSpeechToText';
import { globalAudioId } from '~/common';
import { useLocalize } from '~/hooks';

const isExternalSTT = (speechToTextEndpoint: string) => speechToTextEndpoint === 'external';

/**
 * Owns the speech-to-text lifecycle for the chat form: merges transcriptions into
 * the form text, submits on auto-send, and exposes start/stop/cancel plus the live
 * microphone stream for visualisation.
 */
export default function useAudioRecorder({
  ask,
  methods,
  isSubmitting,
}: {
  ask: TAskFunction;
  methods: ReturnType<typeof useChatFormContext>;
  isSubmitting: boolean;
}) {
  const { setValue, reset, getValues } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();

  const existingTextRef = useRef<string>('');
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      if (isSubmittingRef.current) {
        showToast({
          message: localize('com_ui_speech_while_submitting'),
          status: 'error',
        });
        return;
      }
      if (!text) {
        return;
      }
      const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
      if (globalAudio) {
        globalAudio.muted = false;
      }
      const finalText =
        isExternalSTT(speechToTextEndpoint) && existingTextRef.current
          ? `${existingTextRef.current} ${text}`
          : text;
      const submitted = ask({ text: finalText });
      if (submitted === false) {
        return;
      }
      reset({ text: '' });
      existingTextRef.current = '';
    },
    [ask, reset, showToast, localize, speechToTextEndpoint],
  );

  const setText = useCallback(
    (text: string) => {
      const newText = existingTextRef.current ? `${existingTextRef.current} ${text}` : text;
      setValue('text', newText, { shouldValidate: true });
    },
    [setValue],
  );

  const {
    isListening,
    isLoading,
    audioStream,
    startRecording: startSpeechRecording,
    stopRecording: stopSpeechRecording,
    cancelRecording: cancelSpeechRecording,
  } = useSpeechToText(setText, onTranscriptionComplete);

  const startRecording = useCallback(() => {
    existingTextRef.current = getValues('text') || '';
    startSpeechRecording();
  }, [getValues, startSpeechRecording]);

  const stopRecording = useCallback(() => {
    stopSpeechRecording();
    if (!isExternalSTT(speechToTextEndpoint)) {
      existingTextRef.current = '';
    }
  }, [stopSpeechRecording, speechToTextEndpoint]);

  const cancelRecording = useCallback(() => {
    cancelSpeechRecording();
    setValue('text', existingTextRef.current, { shouldValidate: true });
    existingTextRef.current = '';
  }, [cancelSpeechRecording, setValue]);

  return {
    isListening: isListening === true,
    isLoading: isLoading === true,
    audioStream,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

import useSpeechToTextExternal from './useSpeechToTextExternal';
import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useGetAudioSettings from './useGetAudioSettings';

const useSpeechToText = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
): {
  isLoading?: boolean;
  isListening?: boolean;
  audioStream: MediaStream | null;
  cancelRecording: () => void;
  stopRecording: () => void | (() => Promise<void>);
  startRecording: () => void | (() => Promise<void>);
} => {
  const { speechToTextEndpoint } = useGetAudioSettings();
  const externalSpeechToText = speechToTextEndpoint === 'external';

  const {
    isListening: speechIsListeningBrowser,
    isLoading: speechIsLoadingBrowser,
    startRecording: startSpeechRecordingBrowser,
    stopRecording: stopSpeechRecordingBrowser,
    cancelRecording: cancelSpeechRecordingBrowser,
  } = useSpeechToTextBrowser(setText, onTranscriptionComplete);

  const {
    isListening: speechIsListeningExternal,
    isLoading: speechIsLoadingExternal,
    externalStartRecording: startSpeechRecordingExternal,
    externalStopRecording: stopSpeechRecordingExternal,
    externalCancelRecording: cancelSpeechRecordingExternal,
    audioStream: externalAudioStream,
  } = useSpeechToTextExternal(setText, onTranscriptionComplete);

  const isListening = externalSpeechToText ? speechIsListeningExternal : speechIsListeningBrowser;
  const isLoading = externalSpeechToText ? speechIsLoadingExternal : speechIsLoadingBrowser;

  const startRecording = externalSpeechToText
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = externalSpeechToText
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const cancelRecording = externalSpeechToText
    ? cancelSpeechRecordingExternal
    : cancelSpeechRecordingBrowser;
  const audioStream = externalSpeechToText ? externalAudioStream : null;

  return {
    isLoading,
    isListening,
    audioStream,
    stopRecording,
    startRecording,
    cancelRecording,
  };
};

export default useSpeechToText;

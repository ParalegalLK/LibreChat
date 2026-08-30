import { memo } from 'react';
import {
  IconButton,
  TooltipAnchor,
  ListeningIcon,
  StopRecordingIcon,
  Spinner,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

export default memo(function AudioRecorder({
  disabled,
  isListening,
  isLoading,
  onStart,
  onStop,
}: {
  disabled: boolean;
  isListening: boolean;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const localize = useLocalize();
  const label = isListening ? localize('com_ui_stop_recording') : localize('com_ui_use_micrphone');

  const renderIcon = () => {
    if (isListening) {
      return <StopRecordingIcon className="text-text-secondary" />;
    }
    if (isLoading) {
      return <Spinner className="stroke-text-secondary" />;
    }
    return <ListeningIcon className="stroke-text-secondary" />;
  };

  return (
    <TooltipAnchor
      description={label}
      render={
        <IconButton
          id="audio-recorder"
          type="button"
          variant="ghost"
          size="theme"
          shape="theme"
          label={label}
          data-testid={isListening ? 'stop-recording-button' : undefined}
          onClick={isListening ? onStop : onStart}
          disabled={!isListening && (disabled || isLoading)}
          className="p-1 hover:bg-surface-composer-hover"
          aria-pressed={isListening}
        >
          {renderIcon()}
        </IconButton>
      }
    />
  );
});

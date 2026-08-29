import { memo } from 'react';
import { TooltipAnchor, ListeningIcon, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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

  if (isListening) {
    return (
      <TooltipAnchor
        description={localize('com_ui_stop_recording')}
        render={
          <button
            id="audio-recorder"
            type="button"
            data-testid="stop-recording-button"
            aria-label={localize('com_ui_stop_recording')}
            aria-pressed="true"
            onClick={onStop}
            className="flex size-9 items-center justify-center rounded-full bg-text-primary p-1 transition-all duration-200 hover:opacity-80"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="icon-lg text-surface-primary"
              aria-hidden="true"
            >
              <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor" />
            </svg>
          </button>
        }
      />
    );
  }

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          id="audio-recorder"
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          aria-pressed="false"
          onClick={onStart}
          disabled={disabled || isLoading}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
          )}
          title={localize('com_ui_use_micrphone')}
        >
          {isLoading ? (
            <Spinner className="stroke-text-secondary" />
          ) : (
            <ListeningIcon className="stroke-text-secondary" />
          )}
        </button>
      }
    />
  );
});

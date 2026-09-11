import { memo } from 'react';
import { X } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';

export default memo(function Cancel({ onCancel }: { onCancel: () => void }) {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_ui_cancel_recording')}
      render={
        <button
          type="button"
          data-testid="cancel-recording-button"
          aria-label={localize('com_ui_cancel_recording')}
          onClick={onCancel}
          className="flex size-9 items-center justify-center rounded-full border border-border-medium text-text-primary transition-colors hover:bg-surface-hover"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );
});

import { useEffect, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Progress, Spinner } from '@librechat/client';
import { ContentTypes, EModelEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useLatestMessage, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { cn, getLatestText } from '~/utils';
import store from '~/store';

type AnalysisPhase = 'idle' | 'waiting' | 'working' | 'done';

const TICK_MS = 400;
const HIDE_DELAY_MS = 600;
const CREEP_RATE = 0.12;
const PHASE_CEILING: Record<'waiting' | 'working', number> = { waiting: 35, working: 92 };

const ACTIVITY_PART_TYPES = new Set<string>([
  ContentTypes.THINK,
  ContentTypes.TOOL_CALL,
  ContentTypes.AGENT_UPDATE,
  ContentTypes.ACTIVITY_LABEL,
]);

const hasActivityParts = (message: TMessage | null): boolean =>
  message?.content?.some((part) => ACTIVITY_PART_TYPES.has(part.type)) === true;

const hasAttachments = (message?: TMessage): boolean => (message?.files?.length ?? 0) > 0;

const findTurnUserMessage = (
  latestMessage: TMessage | null,
  messages: TMessage[] | undefined,
): TMessage | undefined => {
  if (!latestMessage) {
    return undefined;
  }
  if (latestMessage.isCreatedByUser) {
    return latestMessage;
  }
  return messages?.find((message) => message.messageId === latestMessage.parentMessageId);
};

const resolvePhase = ({
  active,
  responseStarted,
  working,
}: {
  active: boolean;
  responseStarted: boolean;
  working: boolean;
}): AnalysisPhase => {
  if (!active) {
    return 'idle';
  }
  if (responseStarted) {
    return 'done';
  }
  return working ? 'working' : 'waiting';
};

/**
 * Simulates a 0-100% analysis progress value from coarse streaming phases.
 * The value creeps asymptotically toward a per-phase ceiling so it never
 * stalls at a fixed number, snaps to 100% on completion, and resets to 0
 * once the bar has faded out.
 */
function useAnalysisProgress(phase: AnalysisPhase): { progress: number; visible: boolean } {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (phase === 'idle') {
      setVisible(false);
      setProgress(0);
      return;
    }

    if (phase === 'done') {
      setProgress(100);
      const timeout = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, HIDE_DELAY_MS);
      return () => clearTimeout(timeout);
    }

    setVisible(true);
    const ceiling = PHASE_CEILING[phase];
    const interval = setInterval(() => {
      setProgress((current) =>
        current >= ceiling
          ? current
          : Math.min(ceiling, current + (ceiling - current) * CREEP_RATE),
      );
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [phase]);

  return { progress, visible };
}

/**
 * Standalone "Analyzing..." indicator shown between the message list and the
 * composer while an agent or custom endpoint is processing a turn that carries
 * file attachments. It reads submission state only; it never touches the
 * message render tree.
 */
export default function AIAnalysisProgressBar() {
  const localize = useLocalize();
  const { index, isSubmitting, getMessages } = useChatContext();
  const endpoint = useRecoilValue(store.conversationEndpointByIndex(index));
  const effectiveEndpoint = useRecoilValue(store.effectiveEndpointByIndex(index));
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const latestMessage = useLatestMessage(index);

  const isEligibleEndpoint =
    isAgentsEndpoint(endpoint) || effectiveEndpoint === EModelEndpoint.custom;

  const turnHasAttachments = useMemo(
    () => hasAttachments(findTurnUserMessage(latestMessage, getMessages())),
    [latestMessage, getMessages],
  );

  const responseStarted =
    latestMessage?.isCreatedByUser === false && getLatestText(latestMessage).trim().length > 0;

  const phase = resolvePhase({
    active: isSubmitting && isEligibleEndpoint && turnHasAttachments,
    responseStarted,
    working: hasActivityParts(latestMessage),
  });

  const { progress, visible } = useAnalysisProgress(phase);

  if (!visible) {
    return null;
  }

  const percent = Math.round(progress);

  return (
    <div
      className={cn(
        'mx-auto w-full px-3 pb-2 transition-opacity duration-300 motion-reduce:transition-none sm:px-2',
        maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
        phase === 'done' && 'opacity-0',
      )}
    >
      <div className="rounded-xl border border-border-light bg-surface-tertiary px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
          <span className="flex items-center gap-2" role="status" aria-live="polite">
            <Spinner className="shrink-0" size={14} />
            {localize('com_ui_analyzing_attachment')}
          </span>
          <span className="tabular-nums" aria-hidden="true">
            {percent}%
          </span>
        </div>
        <Progress
          value={percent}
          className="mt-1.5 h-1.5"
          aria-label={localize('com_ui_analyzing_attachment_progress', { percent })}
        />
      </div>
    </div>
  );
}

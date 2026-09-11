import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Progress, Spinner } from '@librechat/client';
import { ContentTypes, EModelEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useLatestMessage, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { cn, getLatestText } from '~/utils';
import store from '~/store';

type AnalysisPhase = 'idle' | 'waiting' | 'working' | 'done';

const HIDE_DELAY_MS = 600;

// Step-based progress: each step has a label and the % it represents
const PROGRESS_STEPS = [
  { label: 'Preparing document . . .', percent: 5 },
  { label: 'Analyzing text . . .', percent: 15 },
  { label: 'Processing your document . . .', percent: 25 },
  { label: 'Working on your translation . . .', percent: 35 },
  { label: 'Your content is getting ready . . .', percent: 45 },
  { label: 'Translating your text . . .', percent: 55 },
  { label: 'Just a moment longer . . .', percent: 65 },
  { label: 'Crafting your translation . . .', percent: 72 },
  { label: 'Processing your document . . .', percent: 79 },
  { label: 'Working on your translation . . .', percent: 84 },
  { label: 'Your content is getting ready . . .', percent: 88 },
  { label: 'Just a moment longer . . .', percent: 91 },
  { label: 'Crafting your translation . . .', percent: 94 },
  { label: 'Almost ready for you . . .', percent: 96 },
  { label: 'Finalizing output . . .', percent: 98 },
];

// How long each step stays visible (ms)
const STEP_DURATION_MS = 2800;

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
  if (!latestMessage) return undefined;
  if (latestMessage.isCreatedByUser) return latestMessage;
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
  if (!active) return 'idle';
  if (responseStarted) return 'done';
  return working ? 'working' : 'waiting';
};

/**
 * Steps through PROGRESS_STEPS at a fixed interval.
 * Snaps to 100% when done, resets when idle.
 */
function useAnalysisProgress(phase: AnalysisPhase): {
  progress: number;
  visible: boolean;
  label: string;
} {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const stepIndexRef = useRef(0);

  useEffect(() => {
    if (phase === 'idle') {
      setVisible(false);
      setStepIndex(0);
      stepIndexRef.current = 0;
      return;
    }

    if (phase === 'done') {
      setStepIndex(PROGRESS_STEPS.length); // signals 100%
      const timeout = setTimeout(() => {
        setVisible(false);
        setStepIndex(0);
        stepIndexRef.current = 0;
      }, HIDE_DELAY_MS);
      return () => clearTimeout(timeout);
    }

    setVisible(true);

    const interval = setInterval(() => {
      const next = stepIndexRef.current + 1;
      if (next < PROGRESS_STEPS.length) {
        stepIndexRef.current = next;
        setStepIndex(next);
      }
      // If we've hit the last step, just stay there — don't loop
    }, STEP_DURATION_MS);

    return () => clearInterval(interval);
  }, [phase]);

  const isDone = stepIndex >= PROGRESS_STEPS.length;
  const progress = isDone ? 100 : PROGRESS_STEPS[stepIndex].percent;
  const label = isDone ? 'Translation completed' : PROGRESS_STEPS[stepIndex].label;

  return { progress, visible, label };
}

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

  const { progress, visible, label } = useAnalysisProgress(phase);

  if (!visible) return null;

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
            <span className="truncate max-w-[200px] sm:max-w-[300px]">
              {label}
            </span>
          </span>
          <span className="tabular-nums" aria-hidden="true">
            {percent}%
          </span>
        </div>
        <Progress
          value={percent}
          className="mt-1.5 h-1.5"
          aria-label={label}
        />
      </div>
    </div>
  );
}

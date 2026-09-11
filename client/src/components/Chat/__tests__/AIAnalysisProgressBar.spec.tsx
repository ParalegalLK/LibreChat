import React, { useMemo } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  ContentTypes,
  EModelEndpoint,
  type TConversation,
  type TMessage,
} from 'librechat-data-provider';
import AIAnalysisProgressBar from '../AIAnalysisProgressBar';
import { ChatContext, useChatContext } from '~/Providers';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLatestMessage: jest.requireActual('~/hooks/Messages/useLatestMessage').useLatestMessage,
  useLocalize: () => (key: string) => key,
}));

const CONVERSATION_ID = 'conversation-analysis';

const agentsConversation = {
  conversationId: CONVERSATION_ID,
  endpoint: EModelEndpoint.agents,
  agent_id: 'agent_translate',
} as TConversation;

const customConversation = {
  conversationId: CONVERSATION_ID,
  endpoint: EModelEndpoint.custom,
  endpointType: EModelEndpoint.custom,
  model: 'translator',
} as TConversation;

const openAIConversation = {
  conversationId: CONVERSATION_ID,
  endpoint: EModelEndpoint.openAI,
  model: 'gpt-4.1',
} as TConversation;

const pdfFile = {
  file_id: 'file-deed',
  filename: 'deed.pdf',
  filepath: '/uploads/deed.pdf',
  type: 'application/pdf',
};

const userMessageWithFile = {
  messageId: 'user-message',
  parentMessageId: '00000000-0000-0000-0000-000000000000',
  conversationId: CONVERSATION_ID,
  text: 'Translate this deed',
  isCreatedByUser: true,
  files: [pdfFile],
} as TMessage;

const userMessageWithoutFile = { ...userMessageWithFile, files: [] } as TMessage;

const pendingAssistantMessage = {
  messageId: 'assistant-message_',
  parentMessageId: userMessageWithFile.messageId,
  conversationId: CONVERSATION_ID,
  sender: 'Assistant',
  text: '',
  isCreatedByUser: false,
  content: [],
} as TMessage;

const toolCallAssistantMessage = {
  ...pendingAssistantMessage,
  content: [
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: 'call_1', name: 'legal_research', args: '{}' },
    },
  ],
} as TMessage;

const streamingAssistantMessage = {
  ...pendingAssistantMessage,
  content: [{ type: ContentTypes.TEXT, text: 'Translation: ...' }],
} as TMessage;

const messagesKey = [QueryKeys.messages, CONVERSATION_ID];

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Harness({ submitting }: { submitting: boolean }) {
  const queryClient = useQueryClient();
  const chatContext = useMemo(
    () =>
      ({
        index: 0,
        isSubmitting: submitting,
        getMessages: () => queryClient.getQueryData<TMessage[]>(messagesKey),
      }) as unknown as ReturnType<typeof useChatContext>,
    [queryClient, submitting],
  );

  return (
    <ChatContext.Provider value={chatContext}>
      <AIAnalysisProgressBar />
    </ChatContext.Provider>
  );
}

function renderBar({
  conversation = agentsConversation,
  messages = [userMessageWithFile, pendingAssistantMessage],
  submitting = true,
}: {
  conversation?: TConversation;
  messages?: TMessage[];
  submitting?: boolean;
} = {}) {
  const queryClient = createQueryClient();
  queryClient.setQueryData<TMessage[]>(messagesKey, messages);

  const initializeState = ({ set }: MutableSnapshot) => {
    set(store.conversationByIndex(0), conversation);
    set(store.isSubmittingFamily(0), submitting);
  };

  const tree = (isSubmitting: boolean) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <MemoryRouter initialEntries={[`/c/${CONVERSATION_ID}`]}>
          <Harness submitting={isSubmitting} />
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>
  );

  const view = render(tree(submitting));
  return {
    queryClient,
    rerender: (isSubmitting: boolean) => view.rerender(tree(isSubmitting)),
  };
}

const getPercent = () => Number.parseInt(screen.getByText(/^\d+%$/).textContent ?? '', 10);

/**
 * React Query v4 delivers cache notifications through a zero-delay timer
 * followed by a microtask, so under fake timers both must be flushed.
 */
const updateMessages = async (queryClient: QueryClient, messages: TMessage[]) => {
  await act(async () => {
    queryClient.setQueryData<TMessage[]>(messagesKey, messages);
  });
  await act(async () => {
    jest.advanceTimersByTime(0);
    await Promise.resolve();
  });
};

describe('AIAnalysisProgressBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays hidden when nothing is submitting', () => {
    renderBar({ submitting: false });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('stays hidden when the turn has no file attachment', () => {
    renderBar({ messages: [userMessageWithoutFile, pendingAssistantMessage] });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('stays hidden for non-agent, non-custom endpoints', () => {
    renderBar({ conversation: openAIConversation });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows and advances while an agent processes an attachment', () => {
    renderBar();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('com_ui_analyzing_attachment')).toBeInTheDocument();
    expect(getPercent()).toBe(0);

    act(() => {
      jest.advanceTimersByTime(400);
    });
    const afterFirstTick = getPercent();
    expect(afterFirstTick).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(getPercent()).toBeGreaterThan(afterFirstTick);
    expect(getPercent()).toBeLessThanOrEqual(35);
  });

  it('shows for custom endpoints and raises the ceiling once tool calls start', async () => {
    const { queryClient } = renderBar({ conversation: customConversation });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await updateMessages(queryClient, [userMessageWithFile, toolCallAssistantMessage]);
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(getPercent()).toBeGreaterThan(35);
    expect(getPercent()).toBeLessThanOrEqual(92);
  });

  it('completes to 100% and unmounts once response text streams in', async () => {
    const { queryClient } = renderBar();

    act(() => {
      jest.advanceTimersByTime(800);
    });
    await updateMessages(queryClient, [userMessageWithFile, streamingAssistantMessage]);

    expect(getPercent()).toBe(100);

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('unmounts and resets immediately when submission stops without text', () => {
    const { rerender } = renderBar();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(getPercent()).toBeGreaterThan(0);

    rerender(false);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    rerender(true);
    expect(getPercent()).toBe(0);
  });
});

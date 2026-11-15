import * as Ariakit from '@ariakit/react';
import { useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, Gauge } from 'lucide-react';
import { Slider } from '@librechat/client';
import { Constants, dataService } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { piModelDraftAtom, piEffortDraftAtom } from '~/store/piModelPicker';
import store from '~/store';

type PiModelInfo = Awaited<ReturnType<typeof dataService.getPiModels>>['models'][number];
type PickerView = 'settings' | 'models' | 'effort';

const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  xai: 'xAI',
};

function providerLabel(provider: string): string {
  return providerLabels[provider.toLowerCase()] ?? provider.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function effortLabel(level: string): string {
  return level === 'xhigh' ? 'X-High' : level.charAt(0).toUpperCase() + level.slice(1);
}

/** One composer control with separate model and effort views. */
export default function PiModelPicker() {
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { data: endpoints } = useGetEndpointsQuery();
  const [modelDrafts, setModelDrafts] = useAtom(piModelDraftAtom);
  const [effortDrafts, setEffortDrafts] = useAtom(piEffortDraftAtom);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<PickerView>('settings');
  const popover = Ariakit.usePopoverStore({ placement: 'top-end' });
  const open = popover.useState('open');
  const endpoint = conversation?.endpoint ?? '';
  const config = endpoints?.[endpoint];
  const enabled = config?.piModelPicker === true;
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const draftKey = `${endpoint}:${conversationId}`;
  const newDraftKey = `${endpoint}:${Constants.NEW_CONVO}`;
  const selected = modelDrafts[draftKey] ?? conversation?.piModel ?? config?.piDefaultModel ?? '';
  const { data, isLoading, isError } = useQuery(
    ['pi-models', endpoint],
    () => dataService.getPiModels(endpoint),
    { enabled, staleTime: 30_000, retry: 1 },
  );

  useEffect(() => {
    if (open) return;
    setView('settings');
    setSearch('');
  }, [open]);

  // A new-chat choice should not silently carry into the next new chat.
  useEffect(() => {
    if (conversationId === Constants.NEW_CONVO || (!modelDrafts[newDraftKey] && !effortDrafts[newDraftKey])) return;
    setModelDrafts((previous) => {
      const next = { ...previous };
      delete next[newDraftKey];
      return next;
    });
    setEffortDrafts((previous) => {
      const next = { ...previous };
      delete next[newDraftKey];
      return next;
    });
  }, [conversationId, modelDrafts, effortDrafts, newDraftKey, setModelDrafts, setEffortDrafts]);

  const groups = useMemo(() => {
    const result = new Map<string, PiModelInfo[]>();
    for (const model of data?.models ?? []) {
      if (!`${model.provider} ${model.name} ${model.id}`.toLowerCase().includes(search.toLowerCase())) continue;
      result.set(model.provider, [...(result.get(model.provider) ?? []), model]);
    }
    return result;
  }, [data, search]);

  const chosen = data?.models.find((model) => `${model.provider}/${model.id}` === selected);
  const label = chosen?.name ?? (selected ? selected.split('/').at(-1) : 'Select a model');
  const levels = chosen?.thinkingLevels?.length ? chosen.thinkingLevels : ['medium'];
  const savedEffort = effortDrafts[draftKey] ?? conversation?.piEffort ?? config?.piDefaultEffort ?? 'medium';
  const effort = levels.includes(savedEffort) ? savedEffort : levels.includes('medium') ? 'medium' : levels[0];

  // A restored conversation may have an effort that the current model no longer supports.
  useEffect(() => {
    if (!enabled || !chosen?.thinkingLevels?.length || chosen.thinkingLevels.includes(savedEffort)) return;
    setEffortDrafts((previous) => ({ ...previous, [draftKey]: effort }));
  }, [enabled, chosen, savedEffort, draftKey, effort, setEffortDrafts]);

  if (!enabled) return null;

  const selectModel = (model: PiModelInfo) => {
    setModelDrafts((previous) => ({ ...previous, [draftKey]: `${model.provider}/${model.id}` }));
    const nextLevels = model.thinkingLevels?.length ? model.thinkingLevels : ['medium'];
    if (!nextLevels.includes(savedEffort)) {
      setEffortDrafts((previous) => ({ ...previous, [draftKey]: nextLevels.includes('medium') ? 'medium' : nextLevels[0] }));
    }
    setView('settings');
  };

  return (
    <>
      <Ariakit.PopoverDisclosure
        store={popover}
        type="button"
        data-testid="pi-model-picker-button"
        aria-label={`Pi model ${label}; thinking effort ${effort}. Change model or effort`}
        title={`${label} · ${effort} thinking`}
        className={`flex size-theme-control items-center justify-center rounded-theme-control-round bg-transparent text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary ${open ? 'bg-surface-hover' : ''}`}
      >
        <Gauge className="size-4" aria-hidden="true" />
      </Ariakit.PopoverDisclosure>
      <Ariakit.Popover
        store={popover}
        gutter={8}
        portal
        unmountOnHide
        aria-label="Pi model and thinking effort"
        className="z-[200] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border-medium bg-surface-secondary p-3 text-sm text-text-primary shadow-lg focus:outline-none"
      >
        {view === 'settings' && (
          <div>
            <h2 className="mb-3 text-base font-semibold">Pick model to run the agent with</h2>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setView('models')}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
              >
                <span className="font-medium">Model</span>
                <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                  <span className="max-w-44 truncate">{label}</span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView('effort')}
                disabled={!chosen}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-medium">Effort</span>
                <span className="flex items-center gap-2 text-text-secondary">
                  <span>{effortLabel(effort)}</span>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </button>
            </div>
          </div>
        )}

        {view === 'models' && (
          <div>
            <button
              type="button"
              onClick={() => setView('settings')}
              className="mb-3 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </button>
            <h2 className="mb-2 text-base font-semibold">Choose model</h2>
            <input
              type="search"
              aria-label="Search Pi models"
              placeholder="Search models"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mb-2 w-full rounded-lg border border-border-light bg-transparent px-3 py-2 text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
            />
            <div className="max-h-52 overflow-y-auto">
              {isLoading && <p className="px-2 py-2 text-text-secondary">Loading Pi models…</p>}
              {isError && <p className="px-2 py-2 text-text-secondary">Pi models unavailable</p>}
              {!isLoading && !isError && groups.size === 0 && <p className="px-2 py-2 text-text-secondary">No matching models</p>}
              {Array.from(groups, ([provider, models]) => (
                <div key={provider}>
                  <p className="px-2 py-1 text-sm font-semibold text-text-secondary">{providerLabel(provider)}</p>
                  {models.map((model) => {
                    const reference = `${model.provider}/${model.id}`;
                    return (
                      <button
                        type="button"
                        key={reference}
                        aria-pressed={selected === reference}
                        title={reference}
                        onClick={() => selectModel(model)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg py-2 pl-6 pr-2 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                      >
                        <span className="min-w-0 break-words">{model.name}</span>
                        {selected === reference && <Check className="size-4 shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'effort' && (
          <div>
            <button
              type="button"
              onClick={() => setView('settings')}
              className="mb-3 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </button>
            <h2 className="mb-1 text-base font-semibold">Thinking effort</h2>
            <p className="mb-5 break-words text-text-secondary">Model: {label}</p>
            <div className="mb-4 flex items-center justify-between gap-3">
              <span>Effort</span><strong>{effortLabel(effort)}</strong>
            </div>
            <Slider
              aria-label={`Thinking effort for ${label}`}
              min={0}
              max={levels.length - 1}
              step={1}
              value={[Math.max(0, levels.indexOf(effort))]}
              onValueChange={([index]) => setEffortDrafts((previous) => ({ ...previous, [draftKey]: levels[index] ?? effort }))}
              disabled={levels.length < 2}
            />
            <div className="mt-3 flex justify-between text-xs text-text-secondary">
              <span>{effortLabel(levels[0])}</span><span>{effortLabel(levels.at(-1) ?? levels[0])}</span>
            </div>
          </div>
        )}
      </Ariakit.Popover>
    </>
  );
}

import { atom } from 'jotai';

/** Unsubmitted model choices, keyed by conversation ID (or "new"). */
export const piModelDraftAtom = atom<Record<string, string>>({});

/** Unsubmitted Pi thinking choices, scoped to the same conversation key. */
export const piEffortDraftAtom = atom<Record<string, string>>({});

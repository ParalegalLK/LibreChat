/** Parse administrator-approved provider/model pairs. An absent list permits none. */
export function parsePiAllowedModels(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((item) => item.trim()).filter((item) =>
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+$/.test(item),
  ));
}

export const PI_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

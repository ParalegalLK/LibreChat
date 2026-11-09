/**
 * Parses `FIRM_NAME_BY_EMAIL_DOMAIN` ("domain=Firm Name;domain2=Other Firm") into a map
 * keyed by lowercased email domain.
 */
export function parseFirmDomainMap(raw?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) {
    return map;
  }
  for (const entry of raw.split(';')) {
    const index = entry.indexOf('=');
    if (index === -1) {
      continue;
    }
    const domain = entry.slice(0, index).trim().toLowerCase();
    const name = entry.slice(index + 1).trim();
    if (domain && name) {
      map.set(domain, name);
    }
  }
  return map;
}

/**
 * Resolves the firm name for a user from their email domain, falling back to `FIRM_NAME_DEFAULT`.
 */
export function getFirmName(email?: string | null, env: NodeJS.ProcessEnv = process.env): string {
  const fallback = env.FIRM_NAME_DEFAULT?.trim() ?? '';
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  if (!domain) {
    return fallback;
  }
  return parseFirmDomainMap(env.FIRM_NAME_BY_EMAIL_DOMAIN).get(domain) ?? fallback;
}

/**
 * Replaces `{{current_firm}}` with the firm resolved from the user's email domain.
 * Leaves the text untouched when no firm can be resolved.
 */
export function replaceFirmVar(
  text: string,
  email?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!text || !/{{current_firm}}/i.test(text)) {
    return text;
  }
  const firm = getFirmName(email, env);
  if (!firm) {
    return text;
  }
  return text.replace(/{{current_firm}}/gi, firm);
}

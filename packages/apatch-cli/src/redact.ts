import type { RedactionCategory, RedactionResult } from './types.js';

const sensitiveKey = /(^|_)(password|passwd|secret|api_?key|access_?token|refresh_?token|authorization|cookie|session|private_?key)($|_)/i;

const patterns: Array<{ category: RedactionCategory; expression: RegExp }> = [
  { category: 'EMAIL', expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { category: 'PAYMENT_CARD', expression: /\b(?:\d[ -]*?){13,19}\b/g },
  { category: 'IP_ADDRESS', expression: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  { category: 'WALLET', expression: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g },
  { category: 'PHONE', expression: /(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g },
  { category: 'SECRET', expression: /\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g },
];

export function redactTrace(input: unknown): RedactionResult {
  const labels = new Map<string, string>();
  const counters = new Map<RedactionCategory, number>();
  const counts: Partial<Record<RedactionCategory, number>> = {};

  const placeholderFor = (category: RedactionCategory, raw: string): string => {
    const identity = `${category}:${raw}`;
    const existing = labels.get(identity);
    if (existing) return existing;

    const next = (counters.get(category) ?? 0) + 1;
    counters.set(category, next);
    counts[category] = (counts[category] ?? 0) + 1;
    const label = `[REDACTED:${category}_${next}]`;
    labels.set(identity, label);
    return label;
  };

  const redactString = (value: string): string => {
    let result = value;
    for (const pattern of patterns) {
      pattern.expression.lastIndex = 0;
      result = result.replace(pattern.expression, (match) => placeholderFor(pattern.category, match));
    }
    return result;
  };

  const visit = (value: unknown, key?: string): unknown => {
    if (key && sensitiveKey.test(key) && value !== null && value !== undefined) {
      return placeholderFor('SECRET', typeof value === 'string' ? value : JSON.stringify(value));
    }
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, visit(entryValue, entryKey)]));
    }
    return value;
  };

  const redacted = visit(input);
  const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);
  return { value: redacted, counts, total };
}

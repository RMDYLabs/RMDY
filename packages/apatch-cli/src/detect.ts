import type { FailureFinding, JsonObject } from './types.js';

const urlExpression = /https?:\/\/[^\s)\]}>"']+/g;
const purchaseTool = /(checkout|purchase|place[_ -]?order|submit[_ -]?order)/i;
const retrievalTool = /(fetch|browse|browser|open[_ -]?url|http|get[_ -]?page|search)/i;
const requiredPurchaseFields = ['size', 'price', 'seller', 'delivery'];

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function eventsFrom(trace: unknown): JsonObject[] {
  if (Array.isArray(trace)) return trace.map(asObject);
  const root = asObject(trace);
  for (const key of ['events', 'steps', 'trace']) {
    if (Array.isArray(root[key])) return (root[key] as unknown[]).map(asObject);
  }
  return [];
}

function toolName(event: JsonObject): string {
  return String(event.tool ?? event.name ?? asObject(event.function).name ?? '');
}

function toolArguments(event: JsonObject): JsonObject {
  const candidate = event.arguments ?? event.args ?? asObject(event.function).arguments ?? {};
  if (typeof candidate === 'string') {
    try { return asObject(JSON.parse(candidate)); } catch { return {}; }
  }
  return asObject(candidate);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${key}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function urlsIn(value: unknown): string[] {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.match(urlExpression) ?? [];
}

export function detectFailures(trace: unknown): FailureFinding[] {
  const events = eventsFrom(trace);
  const findings: FailureFinding[] = [];
  let previousSignature = '';
  let repeated = 0;
  let loopReported = false;

  events.forEach((event, index) => {
    const name = toolName(event);
    if (!name) return;
    const args = toolArguments(event);
    const signature = `${name}:${stable(args)}`;
    if (signature === previousSignature) repeated += 1;
    else { previousSignature = signature; repeated = 1; loopReported = false; }

    if (repeated >= 3 && !loopReported) {
      findings.push({
        type: 'tool_loop',
        severity: 'high',
        title: 'Repeated tool loop detected',
        description: `The agent called ${name} three times without materially changing its arguments.`,
        event_index: index,
        metadata: { tool: name, repetitions: repeated },
      });
      loopReported = true;
    }

    if (purchaseTool.test(name)) {
      const normalizedKeys = new Set(Object.keys(args).map((key) => key.toLowerCase()));
      const missing = requiredPurchaseFields.filter((field) => !normalizedKeys.has(field));
      if (missing.length > 0) {
        findings.push({
          type: 'missing_purchase_constraints',
          severity: 'high',
          title: 'Purchase constraints were not verified',
          description: `A purchase action is missing ${missing.length} required constraint${missing.length === 1 ? '' : 's'}.`,
          event_index: index,
          metadata: { tool: name, missing },
        });
      }
    }
  });

  const retrieved = new Set<string>();
  for (const event of events) {
    if (retrievalTool.test(toolName(event)) && String(event.status ?? 'success') !== 'error') {
      for (const url of [...urlsIn(toolArguments(event)), ...urlsIn(event.output ?? event.result)]) retrieved.add(url);
    }
  }
  const root = asObject(trace);
  const finalOutput = root.output ?? root.final_answer ?? root.response;
  const unsupported = [...new Set(urlsIn(finalOutput).filter((url) => !retrieved.has(url)))];
  if (unsupported.length > 0) {
    findings.push({
      type: 'unsupported_citation',
      severity: 'medium',
      title: 'Final answer contains unvisited citations',
      description: `${unsupported.length} cited URL${unsupported.length === 1 ? ' was' : 's were'} not present in a successful retrieval event.`,
      metadata: { count: unsupported.length },
    });
  }

  return findings;
}

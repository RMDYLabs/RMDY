import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import type { JsonObject, PatchFixtureCase, PatchSpec, PatchTestResult } from './types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid patch spec: ${message}`);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0);
}

function withinDirectory(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function loadPatchSpec(specPath: string): Promise<{ spec: PatchSpec; patchDirectory: string }> {
  const absoluteSpec = path.resolve(specPath);
  const patchDirectory = path.dirname(absoluteSpec);
  const source = await readFile(absoluteSpec, 'utf8');
  const raw = path.extname(absoluteSpec).toLowerCase() === '.json' ? JSON.parse(source) : parse(source);
  const value = raw as Partial<PatchSpec>;

  assert(value.schema === 'apatch/v0.1', 'schema must be apatch/v0.1');
  assert(typeof value.id === 'string' && /^AP-[A-Z0-9-]+$/.test(value.id), 'id must use the AP-XXXX format');
  assert(typeof value.name === 'string' && /^[a-z0-9-]+$/.test(value.name), 'name must be lowercase kebab-case');
  assert(typeof value.version === 'string' && /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(value.version), 'version must be semantic');
  assert(typeof value.description === 'string' && value.description.length >= 10, 'description must explain the patch');
  assert(isStringArray(value.runtimes), 'runtimes must contain at least one runtime');
  assert(Boolean(value.trigger) && typeof value.trigger?.type === 'string', 'trigger.type is required');
  assert(value.intervention?.type === 'require_tool_arguments' || value.intervention?.type === 'limit_repeated_tool_calls', 'intervention.type is unsupported');
  if (value.intervention.type === 'require_tool_arguments') {
    assert(typeof value.intervention.tool === 'string', 'intervention.tool is required');
    assert(isStringArray(value.intervention.required), 'intervention.required must list required arguments');
    assert(value.intervention.on_failure === 'block', 'intervention.on_failure must be block');
  } else {
    assert(Number.isInteger(value.intervention.threshold) && value.intervention.threshold >= 2 && value.intervention.threshold <= 10, 'intervention.threshold must be an integer from 2 to 10');
    assert(value.intervention.on_failure === 'replan' || value.intervention.on_failure === 'hand_back', 'loop intervention must replan or hand_back');
  }
  assert(typeof value.verification?.fixture === 'string', 'verification.fixture is required');
  assert(typeof value.verification?.minimum_pass_rate === 'number' && value.verification.minimum_pass_rate >= 0 && value.verification.minimum_pass_rate <= 1, 'minimum_pass_rate must be between 0 and 1');
  assert(value.privacy?.redaction === 'local_required' || value.privacy?.redaction === 'local_recommended', 'privacy.redaction is invalid');

  const fixturePath = path.resolve(patchDirectory, value.verification.fixture);
  assert(withinDirectory(patchDirectory, fixturePath), 'verification.fixture must stay inside the patch directory');
  return { spec: value as PatchSpec, patchDirectory };
}

export function applyDeclarativePatch(spec: PatchSpec, input: PatchFixtureCase['input']): PatchFixtureCase['expect'] {
  if (spec.intervention.type === 'limit_repeated_tool_calls') {
    if (!('history' in input) || !('current' in input)) return { allow: true };
    const fingerprint = canonicalJson(input.current);
    let repetitions = 1;
    for (let index = input.history.length - 1; index >= 0; index -= 1) {
      if (canonicalJson(input.history[index]) !== fingerprint) break;
      repetitions += 1;
    }
    return repetitions >= spec.intervention.threshold
      ? { allow: false, action: spec.intervention.on_failure, repetitions }
      : { allow: true };
  }
  if (!('tool' in input) || !('arguments' in input)) return { allow: true };
  if (input.tool !== spec.intervention.tool) return { allow: true };
  const keys = new Set(Object.keys(input.arguments).map((key) => key.toLowerCase()));
  const missing = spec.intervention.required.filter((field) => !keys.has(field.toLowerCase()) || input.arguments[field] === '' || input.arguments[field] === null || input.arguments[field] === undefined);
  return missing.length > 0 ? { allow: false, missing } : { allow: true };
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export async function testPatch(specPath: string): Promise<PatchTestResult> {
  const { spec, patchDirectory } = await loadPatchSpec(specPath);
  const fixturePath = path.resolve(patchDirectory, spec.verification.fixture);
  const raw = JSON.parse(await readFile(fixturePath, 'utf8')) as { cases?: PatchFixtureCase[] };
  assert(Array.isArray(raw.cases) && raw.cases.length > 0, 'fixture must contain cases');

  const cases = raw.cases.map((fixture) => {
    const actual = applyDeclarativePatch(spec, fixture.input);
    const passed = JSON.stringify(normalize(actual)) === JSON.stringify(normalize(fixture.expect));
    return { name: fixture.name, passed, expected: fixture.expect, actual };
  });
  const passedCases = cases.filter((fixture) => fixture.passed).length;
  const passRate = passedCases / cases.length;
  return {
    passed: passRate >= spec.verification.minimum_pass_rate,
    passRate,
    minimumPassRate: spec.verification.minimum_pass_rate,
    passedCases,
    totalCases: cases.length,
    cases,
  };
}

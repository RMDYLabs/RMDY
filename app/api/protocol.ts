import { parse } from 'yaml';

export type AttestationPayload = {
  failure_id: string;
  patch_id: string;
  patch_name: string;
  patch_version: string;
  pass_rate: number;
  passed_cases: number;
  total_cases: number;
  spec_sha256: string;
  fixture_sha256: string;
  signed_at: string;
};

export type AttestationBundle = {
  schema: 'apatch/attestation/v0.1';
  payload: AttestationPayload;
  public_key: JsonWebKey;
  signature: string;
  spec_yaml: string;
  fixture_json: string;
};

type JsonRecord = Record<string, unknown>;
type RegistryReplayResult = {
  passedCases: number;
  totalCases: number;
  passRate: number;
};

const residualSensitive = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b|authorization["'\s:]+bearer\s+[A-Za-z0-9._-]+|\+[0-9 ()-]{9,}/i;

export function hasResidualSensitiveValue(value: string): boolean {
  return residualSensitive.test(value);
}

export function requestBodyTooLarge(request: Request, maximumBytes: number): boolean {
  const value = Number(request.headers.get('content-length'));
  return Number.isFinite(value) && value > maximumBytes;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0);
}

function applyDeclarativePatch(spec: JsonRecord, input: JsonRecord): JsonRecord {
  const intervention = spec.intervention as JsonRecord;
  if (intervention.type === 'limit_repeated_tool_calls') {
    if (!Array.isArray(input.history) || !isRecord(input.current)) return { allow: true };
    const fingerprint = canonicalJson(input.current);
    let repetitions = 1;
    for (let index = input.history.length - 1; index >= 0; index -= 1) {
      if (canonicalJson(input.history[index]) !== fingerprint) break;
      repetitions += 1;
    }
    return repetitions >= Number(intervention.threshold)
      ? { allow: false, action: intervention.on_failure, repetitions }
      : { allow: true };
  }

  if (intervention.type === 'require_tool_arguments') {
    if (typeof input.tool !== 'string' || !isRecord(input.arguments)) return { allow: true };
    if (input.tool !== intervention.tool) return { allow: true };
    const required = intervention.required as string[];
    const missing = required.filter((field) => input.arguments[field] === '' || input.arguments[field] === null || input.arguments[field] === undefined);
    return missing.length > 0 ? { allow: false, missing } : { allow: true };
  }

  throw new Error('The registry cannot execute this intervention type.');
}

function replayFixtures(spec: JsonRecord, fixtureSource: string): RegistryReplayResult {
  let fixtureValue: unknown;
  try { fixtureValue = JSON.parse(fixtureSource); }
  catch { throw new Error('The regression fixture is not valid JSON.'); }
  if (!isRecord(fixtureValue) || !Array.isArray(fixtureValue.cases) || fixtureValue.cases.length < 1 || fixtureValue.cases.length > 100) {
    throw new Error('The regression fixture must contain 1–100 cases.');
  }

  let passedCases = 0;
  for (const fixture of fixtureValue.cases) {
    if (!isRecord(fixture) || typeof fixture.name !== 'string' || !isRecord(fixture.input) || !isRecord(fixture.expect)) {
      throw new Error('Every regression case needs a name, input, and expected result.');
    }
    const actual = applyDeclarativePatch(spec, fixture.input);
    if (canonicalJson(actual) === canonicalJson(fixture.expect)) passedCases += 1;
  }
  return { passedCases, totalCases: fixtureValue.cases.length, passRate: passedCases / fixtureValue.cases.length };
}

export async function verifyAttestationBundle(value: unknown, failureId: string): Promise<{ bundle: AttestationBundle; passRateBps: number; registryResult: RegistryReplayResult }> {
  if (!isRecord(value) || value.schema !== 'apatch/attestation/v0.1' || !isRecord(value.payload) || !isRecord(value.public_key)) {
    throw new Error('Use an apatch/attestation/v0.1 bundle.');
  }
  const bundle = value as unknown as AttestationBundle;
  const payload = bundle.payload;
  if (typeof bundle.spec_yaml !== 'string' || typeof bundle.fixture_json !== 'string' || typeof bundle.signature !== 'string') {
    throw new Error('The signed bundle is incomplete.');
  }
  if (bundle.spec_yaml.length > 32_000 || bundle.fixture_json.length > 64_000 || bundle.signature.length > 512) {
    throw new Error('The signed bundle is too large.');
  }
  if (payload.failure_id !== failureId || !/^AP-[A-Z0-9-]+$/.test(payload.patch_id) || !/^[a-z0-9-]+$/.test(payload.patch_name)) {
    throw new Error('The attestation does not match this failure or patch format.');
  }
  if (!Number.isInteger(payload.passed_cases) || !Number.isInteger(payload.total_cases) || payload.total_cases < 1 || payload.passed_cases < 0 || payload.passed_cases > payload.total_cases) {
    throw new Error('The attested regression counts are invalid.');
  }
  const computedRate = payload.passed_cases / payload.total_cases;
  if (Math.abs(computedRate - payload.pass_rate) > 0.000001) throw new Error('The attested pass rate is inconsistent.');

  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(payload.patch_version) || !/^[a-f0-9]{64}$/i.test(payload.spec_sha256) || !/^[a-f0-9]{64}$/i.test(payload.fixture_sha256)) {
    throw new Error('The signed patch version or source hashes are invalid.');
  }
  const signedAt = Date.parse(payload.signed_at);
  if (!Number.isFinite(signedAt) || signedAt > Date.now() + 300_000) throw new Error('The attestation timestamp is invalid.');

  const parsed = parse(bundle.spec_yaml) as Record<string, unknown>;
  if (!isRecord(parsed)) throw new Error('The patch spec is invalid.');
  const intervention = isRecord(parsed.intervention) ? parsed.intervention : {};
  const verification = isRecord(parsed.verification) ? parsed.verification : {};
  if (parsed.schema !== 'apatch/v0.1' || parsed.id !== payload.patch_id || parsed.name !== payload.patch_name || parsed.version !== payload.patch_version) {
    throw new Error('The patch spec does not match the signed payload.');
  }
  const minimumPassRate = verification.minimum_pass_rate;
  if (typeof minimumPassRate !== 'number' || minimumPassRate < 0 || minimumPassRate > 1 || computedRate < minimumPassRate) {
    throw new Error('The patch does not meet its minimum pass rate.');
  }
  if (await sha256(bundle.spec_yaml) !== payload.spec_sha256 || await sha256(bundle.fixture_json) !== payload.fixture_sha256) {
    throw new Error('The signed source hashes do not match the submitted files.');
  }
  if (typeof parsed.description !== 'string' || parsed.description.length < 10 || !isStringArray(parsed.runtimes) || !isRecord(parsed.trigger)) {
    throw new Error('The patch spec is missing its description, runtimes, or trigger.');
  }
  if (intervention.type === 'require_tool_arguments') {
    if (typeof intervention.tool !== 'string' || !isStringArray(intervention.required) || intervention.on_failure !== 'block') {
      throw new Error('The required-argument intervention is invalid.');
    }
  } else if (intervention.type === 'limit_repeated_tool_calls') {
    if (!Number.isInteger(intervention.threshold) || Number(intervention.threshold) < 2 || Number(intervention.threshold) > 10 || !['replan', 'hand_back'].includes(String(intervention.on_failure))) {
      throw new Error('The repeated-call intervention is invalid.');
    }
  } else {
    throw new Error('The registry only accepts declarative interventions it can replay safely.');
  }
  const registryResult = replayFixtures(parsed, bundle.fixture_json);
  if (registryResult.passedCases !== payload.passed_cases || registryResult.totalCases !== payload.total_cases || Math.abs(registryResult.passRate - payload.pass_rate) > 0.000001) {
    throw new Error('The registry replay does not match the solver attestation.');
  }
  if (registryResult.passRate < Number(minimumPassRate)) throw new Error('The registry replay does not meet the minimum pass rate.');
  if (bundle.public_key.kty !== 'EC' || bundle.public_key.crv !== 'P-256') throw new Error('Only ECDSA P-256 validator keys are accepted.');

  const key = await crypto.subtle.importKey('jwk', bundle.public_key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    fromBase64Url(bundle.signature),
    new TextEncoder().encode(canonicalJson(payload)),
  );
  if (!valid) throw new Error('The validator signature is invalid.');
  return { bundle, passRateBps: Math.round(registryResult.passRate * 10_000), registryResult };
}

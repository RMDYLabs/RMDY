import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, loadPatchSpec, testPatch } from './spec.js';

type ValidatorKey = { privateKey: JsonWebKey; publicKey: JsonWebKey };

function base64Url(value: ArrayBuffer): string {
  return Buffer.from(value).toString('base64url');
}

async function sha256(value: string): Promise<string> {
  return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
}

async function loadOrCreateKey(keyPath: string): Promise<ValidatorKey> {
  try { return JSON.parse(await readFile(keyPath, 'utf8')) as ValidatorKey; }
  catch {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const keys = {
      privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
      publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
    };
    await mkdir(path.dirname(keyPath), { recursive: true });
    await writeFile(keyPath, `${JSON.stringify(keys, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return keys;
  }
}

export async function createAttestation(specPath: string, failureId: string, keyPath = path.resolve('.apatch', 'validator-key.json')) {
  if (!/^AP-F-[A-Z0-9]+$/.test(failureId)) throw new Error('failure ID must use the AP-F-XXXXXXXX format');
  const { spec, patchDirectory } = await loadPatchSpec(specPath);
  const result = await testPatch(specPath);
  if (!result.passed) throw new Error(`${spec.id} failed its minimum regression pass rate`);
  const specYaml = await readFile(specPath, 'utf8');
  const fixtureJson = await readFile(path.resolve(patchDirectory, spec.verification.fixture), 'utf8');
  const keys = await loadOrCreateKey(keyPath);
  const payload = {
    failure_id: failureId,
    patch_id: spec.id,
    patch_name: spec.name,
    patch_version: spec.version,
    pass_rate: result.passRate,
    passed_cases: result.passedCases,
    total_cases: result.totalCases,
    spec_sha256: await sha256(specYaml),
    fixture_sha256: await sha256(fixtureJson),
    signed_at: new Date().toISOString(),
  };
  const privateKey = await crypto.subtle.importKey('jwk', keys.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(canonicalJson(payload)));
  return {
    schema: 'apatch/attestation/v0.1',
    payload,
    public_key: keys.publicKey,
    signature: base64Url(signature),
    spec_yaml: specYaml,
    fixture_json: fixtureJson,
  };
}

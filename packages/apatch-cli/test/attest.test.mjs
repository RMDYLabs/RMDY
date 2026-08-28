import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createAttestation } from '../dist/attest.js';
import { canonicalJson } from '../dist/spec.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('creates a verifiable AP-0051 attestation', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'apatch-attest-'));
  try {
    const bundle = await createAttestation(
      path.join(packageRoot, 'builtins', 'AP-0051', 'patch.yaml'),
      'AP-F-TEST0001',
      path.join(temporary, 'validator-key.json'),
    );
    const key = await crypto.subtle.importKey('jwk', bundle.public_key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      Buffer.from(bundle.signature, 'base64url'),
      new TextEncoder().encode(canonicalJson(bundle.payload)),
    );
    assert.equal(bundle.payload.passed_cases, 6);
    assert.equal(bundle.payload.total_cases, 6);
    assert.equal(valid, true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

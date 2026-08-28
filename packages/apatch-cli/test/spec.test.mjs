import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadPatchSpec, testPatch } from '../dist/spec.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specPath = path.join(packageRoot, 'builtins', 'AP-0042', 'patch.yaml');
const loopSpecPath = path.join(packageRoot, 'builtins', 'AP-0051', 'patch.yaml');

test('loads and validates AP-0042', async () => {
  const { spec } = await loadPatchSpec(specPath);
  assert.equal(spec.id, 'AP-0042');
  assert.equal(spec.intervention.type, 'require_tool_arguments');
});

test('runs every AP-0051 anti-loop regression case', async () => {
  const result = await testPatch(loopSpecPath);
  assert.equal(result.passed, true);
  assert.equal(result.totalCases, 6);
  assert.equal(result.passedCases, 6);
});

test('runs every AP-0042 regression case', async () => {
  const result = await testPatch(specPath);
  assert.equal(result.passed, true);
  assert.equal(result.totalCases, 5);
  assert.equal(result.passedCases, 5);
  assert.equal(result.passRate, 1);
});

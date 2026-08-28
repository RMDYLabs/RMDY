#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { detectFailures } from './detect.js';
import { redactTrace } from './redact.js';
import { installPatch, resolvePatch } from './registry.js';
import { loadPatchSpec, testPatch } from './spec.js';
import { createAttestation } from './attest.js';

const green = (value: string) => `\u001b[38;2;198;255;53m${value}\u001b[0m`;
const dim = (value: string) => `\u001b[2m${value}\u001b[0m`;
const red = (value: string) => `\u001b[31m${value}\u001b[0m`;

function showHelp(): void {
  console.log(`
${green('RMDY')}  ${dim('CLI beta 0.6.1 · APATCH/V0.1 compatible')}

Usage
  rmdy scan <trace.json> [--out <file>]
  rmdy test <AP-ID | patch.yaml>
  rmdy install <AP-ID | patch-directory> [--dir <project>] [--runtime openai-agents]
  rmdy validate <patch.yaml>
  rmdy attest <AP-ID | patch.yaml> --failure <AP-F-ID> [--out <file>] [--key <file>]
  rmdy init [directory] [--id <AP-ID>]

Privacy
  scan runs entirely on your machine and writes only a redacted copy.
  The original trace is never uploaded by this CLI.
`);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positional(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) { index += 1; continue; }
    values.push(args[index]);
  }
  return values;
}

async function scan(inputPath: string, outputOption?: string): Promise<void> {
  const absoluteInput = path.resolve(inputPath);
  const trace = JSON.parse(await readFile(absoluteInput, 'utf8')) as unknown;
  const findings = detectFailures(trace);
  const redaction = redactTrace(trace);
  const fallbackName = `${path.basename(inputPath, path.extname(inputPath))}.sanitized.json`;
  const outputPath = path.resolve(outputOption ?? path.join('.apatch', 'cases', fallbackName));
  await mkdir(path.dirname(outputPath), { recursive: true });
  const artifact = {
    schema: 'apatch/case/v0.1',
    created_at: new Date().toISOString(),
    source: path.basename(inputPath),
    privacy: { mode: 'local_redaction', redactions: redaction.counts, total: redaction.total },
    findings,
    trace: redaction.value,
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(`${green('✓')} Wrote privacy-safe case to ${outputPath}`);
  console.log(`  ${redaction.total} sensitive value${redaction.total === 1 ? '' : 's'} redacted · ${findings.length} failure signal${findings.length === 1 ? '' : 's'} detected`);
  for (const finding of findings) console.log(`  ${finding.severity === 'high' ? red('!') : '•'} ${finding.title}`);
}

async function validate(specPath: string): Promise<void> {
  const { spec } = await loadPatchSpec(specPath);
  console.log(`${green('✓')} ${spec.id} is a valid ${spec.schema} package`);
  console.log(`  ${spec.name}@${spec.version} · ${spec.runtimes.join(', ')}`);
}

async function runTests(identifier: string): Promise<void> {
  const specPath = await resolvePatch(identifier);
  const { spec } = await loadPatchSpec(specPath);
  const result = await testPatch(specPath);
  console.log(`${result.passed ? green('✓') : red('×')} ${spec.id} ${result.passedCases}/${result.totalCases} cases passed (${Math.round(result.passRate * 100)}%)`);
  for (const fixture of result.cases) console.log(`  ${fixture.passed ? green('✓') : red('×')} ${fixture.name}`);
  if (!result.passed) process.exitCode = 1;
}

async function createPatch(directory: string, id: string): Promise<void> {
  const target = path.resolve(directory);
  await mkdir(path.join(target, 'cases'), { recursive: true });
  const normalizedName = path.basename(target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-patch';
  const yaml = `schema: apatch/v0.1
id: ${id}
name: ${normalizedName}
version: 0.1.0
description: Describe the behavior this patch corrects.
runtimes:
  - custom
trigger:
  type: tool_call
  tool: example.action
intervention:
  type: require_tool_arguments
  tool: example.action
  required: [required_field]
  on_failure: block
verification:
  fixture: ./cases/regression.json
  minimum_pass_rate: 1
privacy:
  redaction: local_required
`;
  const fixture = {
    cases: [
      { name: 'blocks an incomplete action', input: { tool: 'example.action', arguments: {} }, expect: { allow: false, missing: ['required_field'] } },
      { name: 'allows a complete action', input: { tool: 'example.action', arguments: { required_field: 'present' } }, expect: { allow: true } },
    ],
  };
  await writeFile(path.join(target, 'patch.yaml'), yaml, { encoding: 'utf8', flag: 'wx' });
  await writeFile(path.join(target, 'cases', 'regression.json'), `${JSON.stringify(fixture, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`${green('✓')} Created ${id} at ${target}`);
}

async function attest(identifier: string, failureId: string, outputOption?: string, keyOption?: string): Promise<void> {
  const specPath = await resolvePatch(identifier);
  const bundle = await createAttestation(specPath, failureId, path.resolve(keyOption ?? path.join('.apatch', 'validator-key.json')));
  const outputPath = path.resolve(outputOption ?? path.join('.apatch', 'attestations', `${failureId}-${bundle.payload.patch_id}.json`));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  console.log(`${green('✓')} Signed ${bundle.payload.patch_id} for ${failureId}`);
  console.log(`  ${bundle.payload.passed_cases}/${bundle.payload.total_cases} regression cases passed · ${outputPath}`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') { showHelp(); return; }
  if (command === '--version' || command === 'version') { console.log('0.6.1'); return; }
  const values = positional(args);

  if (command === 'scan') {
    if (!values[0]) throw new Error('scan requires a trace JSON file');
    await scan(values[0], option(args, '--out'));
  } else if (command === 'validate') {
    if (!values[0]) throw new Error('validate requires a patch.yaml file');
    await validate(values[0]);
  } else if (command === 'test') {
    if (!values[0]) throw new Error('test requires an AP-ID or patch.yaml path');
    await runTests(values[0]);
  } else if (command === 'install') {
    if (!values[0]) throw new Error('install requires an AP-ID or patch directory');
    const runtime = option(args, '--runtime');
    if (runtime && runtime !== 'openai-agents') throw new Error('supported runtime: openai-agents');
    const result = await installPatch(values[0], path.resolve(option(args, '--dir') ?? '.'), runtime as 'openai-agents' | undefined);
    console.log(`${green('✓')} ${result.alreadyPresent ? 'Kept' : 'Installed'} ${result.id} at ${result.target}`);
    if (result.adapterPath) {
      console.log(`${green('✓')} Generated OpenAI Agents SDK guardrail at ${result.adapterPath}`);
      console.log(`  Import applyAgentPatches() and wrap your Agent tools array. See .apatch/runtime/README.md`);
    }
  } else if (command === 'attest') {
    if (!values[0]) throw new Error('attest requires an AP-ID or patch.yaml path');
    const failureId = option(args, '--failure');
    if (!failureId) throw new Error('attest requires --failure AP-F-XXXXXXXX');
    await attest(values[0], failureId, option(args, '--out'), option(args, '--key'));
  } else if (command === 'init') {
    await createPatch(values[0] ?? 'my-agent-patch', option(args, '--id') ?? 'AP-LOCAL-0001');
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(`${red('error')} ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

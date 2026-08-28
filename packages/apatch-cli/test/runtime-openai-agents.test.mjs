import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import { installPatch } from '../dist/registry.js';

function callData(context, name, args) {
  return {
    toolCall: { type: 'function_call', callId: crypto.randomUUID(), name, arguments: JSON.stringify(args) },
    context,
    agent: {},
  };
}

test('generated OpenAI Agents SDK adapter blocks repeated calls and missing arguments', async (t) => {
  const project = await mkdtemp(path.join(process.cwd(), '.apatch-runtime-test-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const first = await installPatch('AP-0051', project, 'openai-agents');
  assert.equal(first.alreadyPresent, false);
  assert.ok(first.adapterPath);

  await installPatch('AP-0042', project, 'openai-agents');
  const repeated = await installPatch('AP-0051', project, 'openai-agents');
  assert.equal(repeated.alreadyPresent, true);

  const moduleUrl = `${pathToFileURL(repeated.adapterPath).href}?test=${Date.now()}`;
  const runtime = await import(moduleUrl);
  assert.deepEqual(runtime.installedPatches.map((patch) => patch.id).sort(), ['AP-0042', 'AP-0051']);

  let executions = 0;
  const searchInventory = tool({
    name: 'inventory_search',
    description: 'Search inventory',
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => { executions += 1; return { query }; },
  });
  const checkout = tool({
    name: 'commerce.checkout',
    description: 'Complete checkout',
    parameters: z.object({ size: z.string(), price: z.number(), seller: z.string(), delivery: z.string() }),
    execute: async (args) => args,
  });

  const decisions = [];
  const configured = runtime.createAgentPatchRuntime({ onDecision: (event) => decisions.push(event) });
  const patchedTools = configured.applyAgentPatches([searchInventory, checkout]);
  assert.equal(patchedTools[0].inputGuardrails.length, 1);
  assert.equal(patchedTools[1].inputGuardrails.length, 1);
  assert.doesNotThrow(() => new Agent({ name: 'Runtime test', instructions: 'Test', tools: patchedTools }));

  const guardrail = patchedTools[0].inputGuardrails[0];
  const runContext = {};
  const one = await guardrail.run(callData(runContext, 'inventory_search', { query: 'running shoes' }));
  const two = await guardrail.run(callData(runContext, 'inventory_search', { query: 'running shoes' }));
  const three = await guardrail.run(callData(runContext, 'inventory_search', { query: 'running shoes' }));
  assert.equal(one.behavior.type, 'allow');
  assert.equal(two.behavior.type, 'allow');
  assert.equal(three.behavior.type, 'rejectContent');
  assert.match(three.behavior.message, /Repeated identical tool call blocked/);
  assert.equal(executions, 0, 'guardrail evaluation does not invoke the function tool');

  const changed = await guardrail.run(callData(runContext, 'inventory_search', { query: 'trail shoes' }));
  assert.equal(changed.behavior.type, 'allow');

  const missing = await guardrail.run(callData({}, 'commerce.checkout', { Size: '42', price: 90 }));
  assert.equal(missing.behavior.type, 'rejectContent');
  assert.match(missing.behavior.message, /seller, delivery/);
  assert.ok(decisions.some((event) => event.reason === 'repeated_tool_call'));
  assert.ok(decisions.some((event) => event.reason === 'missing_arguments'));
});

test('adapter leaves hosted and built-in tools unchanged', async (t) => {
  const project = await mkdtemp(path.join(process.cwd(), '.apatch-runtime-test-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const installed = await installPatch('AP-0051', project, 'openai-agents');
  const runtime = await import(`${pathToFileURL(installed.adapterPath).href}?test=${Date.now()}`);
  const hostedTool = { type: 'hosted_tool', name: 'web_search' };
  assert.equal(runtime.applyAgentPatches([hostedTool])[0], hostedTool);
});

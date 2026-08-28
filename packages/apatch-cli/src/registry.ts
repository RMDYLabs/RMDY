import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatchSpec } from './spec.js';
import { installOpenAIAgentsRuntime } from './adapters/openai-agents.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export const builtinsRoot = path.join(packageRoot, 'builtins');

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

export async function resolvePatch(identifier: string): Promise<string> {
  const direct = path.resolve(identifier);
  const installed = path.resolve('.apatch', 'patches', identifier);
  const builtin = path.join(builtinsRoot, identifier.toUpperCase());
  for (const candidate of [direct, installed, builtin]) {
    if (await exists(candidate)) {
      const extension = path.extname(candidate);
      return extension ? candidate : path.join(candidate, 'patch.yaml');
    }
  }
  throw new Error(`Patch ${identifier} was not found locally or in the alpha registry.`);
}

export async function installPatch(identifier: string, destinationRoot = process.cwd(), runtime?: 'openai-agents'): Promise<{ id: string; target: string; alreadyPresent: boolean; adapterPath?: string }> {
  const specPath = await resolvePatch(identifier);
  const { spec, patchDirectory } = await loadPatchSpec(specPath);
  const patchesDirectory = path.join(destinationRoot, '.apatch', 'patches');
  const target = path.join(patchesDirectory, spec.id);
  const alreadyPresent = await exists(target);
  await mkdir(patchesDirectory, { recursive: true });
  if (!alreadyPresent) await cp(patchDirectory, target, { recursive: true, errorOnExist: true, force: false });
  else {
    const { spec: installedSpec } = await loadPatchSpec(path.join(target, 'patch.yaml'));
    if (installedSpec.version !== spec.version || installedSpec.id !== spec.id) throw new Error(`${spec.id} is already installed with a different version at ${target}`);
  }

  const manifestPath = path.join(destinationRoot, '.apatch', 'installed.json');
  let manifest: { schema: string; patches: Array<{ id: string; version: string; installed_at: string }> } = { schema: 'apatch/installed/v0.1', patches: [] };
  if (await exists(manifestPath)) {
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof manifest; } catch { /* replace malformed local manifest */ }
  }
  manifest.patches = [...manifest.patches.filter((entry) => entry.id !== spec.id), { id: spec.id, version: spec.version, installed_at: new Date().toISOString() }];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const adapter = runtime === 'openai-agents' ? await installOpenAIAgentsRuntime(destinationRoot, manifest) : undefined;
  return { id: spec.id, target, alreadyPresent, adapterPath: adapter?.adapterPath };
}

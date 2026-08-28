# RMDY CLI

RMDY turns real AI-agent failures into privacy-safe regression cases and verified runtime fixes. It remains compatible with the `apatch/v0.1` package format and existing AP identifiers.

## Alpha guarantees

- `scan` performs redaction locally and never uploads the original trace.
- Patch packages are declarative YAML plus JSON fixtures; the alpha runner does not execute arbitrary patch code.
- AP-0042 and the AP-0051 tool-loop circuit breaker are bundled behavior patches.
- `install --runtime openai-agents` generates a real OpenAI Agents SDK function-tool guardrail.
- `attest` signs passing regression results with a local ECDSA P-256 validator key. The public registry independently replays supported declarative fixtures before marking a submission verified.
- Everything runs on Node.js 22.13 or newer.

## Install

From the project checkout:

```sh
npm install
npm run build:cli
npm link --workspace rmdy
```

## Try it

```sh
rmdy scan packages/apatch-cli/examples/failing-trace.json
rmdy test AP-0042
rmdy test AP-0051
rmdy attest AP-0051 --failure AP-F-XXXXXXXX
rmdy install AP-0042 --runtime openai-agents
rmdy install AP-0051 --runtime openai-agents
rmdy init my-first-patch --id AP-LOCAL-0001
```

`scan` writes a sanitized artifact to `.apatch/cases`. `install` writes verified patch packages to `.apatch/patches` and records versions in `.apatch/installed.json`. With `--runtime openai-agents`, it also generates `.apatch/runtime/openai-agents.mjs`; import `applyAgentPatches()` from that file and wrap the custom function tools passed to your Agent. Re-running install is safe and regenerates the adapter from all installed patches. `attest` writes a portable signed bundle while keeping the private validator key local. The older `faultmesh` and `apatch` executables remain compatibility aliases during the alpha.

## Patch package

```text
AP-0042/
├── patch.yaml
└── cases/
    └── regression.json
```

The v0.1 runtime supports declarative required-argument gates and repeated-tool-call circuit breakers. The registry never executes arbitrary submitted code: it validates the signature and safely replays these two declarative intervention types against the submitted JSON fixtures.

The legacy `apatch` executable remains an alias during the alpha compatibility window.

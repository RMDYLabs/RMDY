# RMDY

Verified runtime fixes for AI agents.

RMDY turns privacy-safe failure traces into reproducible cases, signed regression evidence, and portable runtime patches. The alpha includes a public failure registry, a local-first CLI, USDT bounty states, and a working OpenAI Agents SDK function-tool guardrail.

## Quick start

```sh
npm install
npm run test:cli
npm run dev
```

Install a bundled runtime patch:

```sh
rmdy install AP-0051 --runtime openai-agents
```

RMDY 0.x remains compatible with the `apatch/v0.1` package format and AP identifiers. The legacy `apatch` and `faultmesh` executables are retained as aliases during the alpha.

The public alpha is live at [rmdy-repair-network.ahmed186aa.chatgpt.site](https://rmdy-repair-network.ahmed186aa.chatgpt.site). Install the public CLI from npm:

```sh
npm install --global @rmdylabs/rmdy
```

The signed release archive remains available as `rmdy-0.6.1.tgz` · SHA-256 `C4350D366B0DA2DA794A26129E2B0AD600AE19FFD6A9DC819EC58006D349A917`.

## What is real today

- Local trace redaction and deterministic failure detection.
- Declarative patch validation and regression fixtures.
- Signed ECDSA P-256 patch attestations plus independent registry replay of supported declarative fixtures.
- OpenAI Agents SDK function-tool input guardrails.
- Persistent failure, non-exclusive solver application, evidence, patch, and USDT bounty records.

USDT bounty targets are not represented as funded until a verifiable treasury allocation exists.

## Trust boundaries

- Built-in patch results are labelled as lab fixtures, not adoption or install counts.
- Solver applications require a public HTTPS profile and never lock a case.
- Registry verification covers source hashes, signatures, schema checks, and deterministic replay of supported declarative fixtures. It is not a universal production-safety guarantee.
- Token holders receive no equity, revenue share, governance right, or claim on creator fees or treasury assets.

## Development

```sh
npm run db:verify
npm run test:cli
npm run lint
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

RMDY is MIT licensed. See [LICENSE](LICENSE).

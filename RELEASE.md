# RMDY release checklist

## Code and package

- [x] Run `npm run db:verify`, `npm run test:cli`, `npm run lint`, and `npm run build`.
- [x] Run `npm audit --omit=dev` and record the result: zero production vulnerabilities on 28 August 2026.
- [x] Pack the CLI with `npm run pack:cli` and verify the archive in a clean temporary directory.
- [x] Record the archive SHA-256 checksum: `C4350D366B0DA2DA794A26129E2B0AD600AE19FFD6A9DC819EC58006D349A917` (`rmdy-0.6.1.tgz`).
- [x] Publish the source repository before publishing the npm package.
- [x] Publish `@rmdylabs/rmdy@0.6.1` publicly on npm.
- [ ] Configure npm trusted publishing so future releases receive provenance automatically.

## Product truth

- [x] Every “live” case ID resolves through the registry API; built-ins are explicitly labeled as lab fixtures.
- [x] No adoption, install, funding, partner, or user metric appears without an auditable source.
- [x] Proposed, funded, and paid USDT remain separate.
- [ ] The disclosed Solana treasury wallet matches the production environment.
- [ ] Terms, privacy, token disclosure, transparency, and security contact are public.

## Accounts and token

- [ ] Secure the official X account with a unique password and hardware-backed 2FA.
- [ ] Publish the official website, source repository, npm package, and treasury address on X before creating the token.
- [ ] Verify the final name, ticker, image, description, website, and social URL; Pump coin metadata cannot be relied on as editable after creation.
- [ ] Never promise returns, price appreciation, liquidity, revenue sharing, buybacks, or exchange listings.
- [ ] Publish the mint address once, then treat every other address as an impersonator.

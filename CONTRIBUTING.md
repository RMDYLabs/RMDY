# Contributing to RMDY

Start from a concrete agent failure. A useful patch must include a privacy-safe reproduction, the smallest enforceable intervention, and regression fixtures that fail before the intervention and pass after it.

Before opening a change:

```sh
npm install
npm run db:verify
npm run test:cli
npm run lint
npm run build
```

Never commit raw traces, credentials, wallet keys, personal data, or private validator keys. Keep the existing `apatch/v0.1` wire format stable during the 0.x compatibility window.

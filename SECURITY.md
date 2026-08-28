# RMDY security policy

## Supported release

Security fixes are applied to the latest `0.x` beta release. The registry accepts only declarative `apatch/v0.1` interventions it can replay without executing submitted code.

## Reporting a vulnerability

Do not publish secrets, exploit payloads, private traces, personal data, or active vulnerabilities as registry cases. Use [GitHub private vulnerability reporting](https://github.com/RMDYLabs/RMDY/security/advisories/new) and include:

- the affected route, CLI command, or patch format;
- the impact and minimum reproduction;
- whether personal data, keys, funds, or account access may be at risk; and
- a safe way to validate the issue.

Private vulnerability reporting is RMDY's official security channel. A public operator identity and support contact must also be attached to the website and social accounts before a token launch.

## Security boundaries

- Submitted artifacts are size-limited and scanned for common credentials and personal identifiers.
- Claim tokens are bearer secrets. They are hashed in storage and must not be shared.
- A solver signature proves control of its signing key; it does not establish reputation by itself.
- “Registry replay verified” means the registry independently reproduced the submitted result using a supported declarative evaluator.
- Treasury private keys must never be stored in this repository, Sites environment variables, registry records, or support messages.

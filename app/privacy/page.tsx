import { LegalShell } from '@/app/legal-shell';

export default function PrivacyPage() {
  return <LegalShell eyebrow="LEGAL / 02" title="Privacy by construction.">
    <section><h2>What the public registry stores</h2><p>RMDY stores the failure title and description you submit, expected behavior, runtime, timestamps, public solver name and profile URL, solver approach, sanitized fixture content, source hashes, public signing keys, signatures, verification results, and bounty proposals.</p></section>
    <section><h2>What should never be submitted</h2><p>Do not submit raw private traces, prompts containing personal data, credentials, access tokens, private keys, phone numbers, email addresses, or confidential business information. The CLI redacts common sensitive fields locally, and the API rejects several common sensitive patterns, but no automated filter is perfect.</p></section>
    <section><h2>Abuse prevention</h2><p>For write-rate limiting, the service derives a short-lived one-way bucket from the connecting network address and hourly window. The raw network address is not written to the registry. Platform infrastructure may process standard request logs for security and reliability.</p></section>
    <section><h2>Purpose and sharing</h2><p>Public records are used to reproduce failures, evaluate fixes, distribute patches, prevent abuse, and keep the bounty ledger transparent. RMDY does not sell registry data. Public submissions are intentionally accessible to anyone.</p></section>
    <section><h2>Retention and removal</h2><p>Public technical records may be retained to preserve auditability. Material that exposes personal data, secrets, or rights violations may be redacted or removed after a verified request. The official operator contact will be displayed on the homepage before token launch.</p></section>
    <section><h2>Your choices</h2><p>You can use the CLI locally without submitting a record. Review every generated artifact before uploading it. If you do not want information to become public, do not submit it to the registry.</p></section>
  </LegalShell>;
}

import { LegalShell } from '@/app/legal-shell';

export default function TermsPage() {
  return <LegalShell eyebrow="LEGAL / 01" title="Beta terms of use.">
    <section><h2>1. What RMDY is</h2><p>RMDY is an experimental public registry and developer tool for reporting AI-agent failures, reproducing them safely, and distributing declarative runtime patches. The service and CLI are provided as a public beta and may change or be withdrawn.</p></section>
    <section><h2>2. No guarantee</h2><p>RMDY patches, tests, scores, signatures, and registry labels are technical evidence—not a guarantee that an agent will behave correctly in every model, runtime, environment, or future version. You are responsible for reviewing and testing a patch before production use.</p></section>
    <section><h2>3. Public submissions</h2><p>Failure reports, solver profiles, approaches, sanitized fixtures, and patch specifications are public. Do not submit secrets, personal data, private traces, copyrighted material you cannot share, malicious code, or deceptive evidence. You represent that you have the right to submit the material.</p></section>
    <section><h2>4. Open licensing</h2><p>Patch specifications and fixtures submitted for registry distribution may be copied, tested, modified, and redistributed under the MIT License. Descriptive failure reports may be reproduced as needed to operate and audit the registry.</p></section>
    <section><h2>5. Claims and verification</h2><p>A solver application does not reserve or lock a case and is not an endorsement. Multiple solvers may work in parallel. “Registry replay verified” means RMDY independently reran the submitted declarative fixtures and matched the signed result; it does not mean RMDY executed arbitrary code or tested every real-world environment.</p></section>
    <section><h2>6. Bounties</h2><p>A proposed bounty is not funded, escrowed, or promised. A bounty becomes funded only when RMDY identifies an on-chain treasury allocation in USDT on Solana. Payment remains subject to the published criteria, verification, applicable law, network availability, and sufficient treasury funds.</p></section>
    <section><h2>7. Acceptable use</h2><p>You may not abuse rate limits, impersonate others, lock or spam cases, submit fraudulent evidence, attack the service, or use RMDY to facilitate unlawful, unsafe, or privacy-invasive activity.</p></section>
    <section><h2>8. Liability</h2><p>To the maximum extent permitted by law, RMDY is provided “as is” without warranties. RMDY is not responsible for agent actions, lost data, failed transactions, token losses, missed bounties, or damages caused by relying on a patch or registry record.</p></section>
  </LegalShell>;
}

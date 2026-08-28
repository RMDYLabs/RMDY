import { LegalShell } from '@/app/legal-shell';

export default function TokenDisclosurePage() {
  return <LegalShell eyebrow="LEGAL / 03" title="Token risk disclosure.">
    <section><h2>Utility, not ownership</h2><p>Any future RMDY token is intended as a community coordination and distribution mechanism. It is not equity, debt, a share of RMDY, a claim on treasury assets, a right to creator fees, governance power, or an entitlement to profit.</p></section>
    <section><h2>No expectation of return</h2><p>Digital assets are speculative and highly volatile. A purchaser may lose all value. RMDY does not promise price appreciation, liquidity, exchange listings, buybacks, returns, dividends, or successful creator-fee collection.</p></section>
    <section><h2>Creator fees and bounties</h2><p>The operating policy is to reserve 100% of net creator fees actually received by the disclosed treasury for verified USDT bounties after network and conversion costs. This policy benefits the repair network; it does not create a payment or revenue right for token holders.</p></section>
    <section><h2>Funding truth</h2><p>Proposed bounty targets are not funds. Only confirmed USDT allocated on Solana is displayed as funded. Until a public treasury wallet is connected, the funded balance remains zero.</p></section>
    <section><h2>Independent decisions</h2><p>Nothing on RMDY is legal, tax, financial, or investment advice. Eligibility and obligations vary by jurisdiction. Do your own research and obtain qualified advice before creating, buying, holding, or promoting a token.</p></section>
  </LegalShell>;
}

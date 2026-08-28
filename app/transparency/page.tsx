'use client';

import { useEffect, useState } from 'react';
import { LegalShell } from '@/app/legal-shell';

type Treasury = { wallet: string | null; explorerUrl: string | null; walletConnected: boolean; allocationPolicy: string; tokenHolderRights: string; totals: { proposed: number; funded: number; paid: number } };

export default function TransparencyPage() {
  const [treasury, setTreasury] = useState<Treasury | null>(null);
  useEffect(() => { fetch('/api/treasury').then((response) => response.ok ? response.json() : null).then(setTreasury).catch(() => setTreasury(null)); }, []);
  return <LegalShell eyebrow="PUBLIC LEDGER / 01" title="Verify, don’t trust.">
    <section className="transparency-status"><h2>Treasury status</h2><p><strong>{treasury?.walletConnected ? 'CONNECTED' : 'NOT CONNECTED'}</strong></p><p>{treasury?.wallet ? <a href={treasury.explorerUrl ?? '#'} rel="noreferrer" target="_blank">{treasury.wallet} ↗</a> : 'No treasury wallet is configured. Funded and paid totals must remain zero.'}</p></section>
    <section><h2>USDT ledger</h2><div className="ledger-totals"><p><strong>{treasury?.totals.proposed.toLocaleString() ?? '—'}</strong><span>USDT proposed</span></p><p><strong>{treasury?.totals.funded.toLocaleString() ?? '0'}</strong><span>USDT funded</span></p><p><strong>{treasury?.totals.paid.toLocaleString() ?? '0'}</strong><span>USDT paid</span></p></div></section>
    <section><h2>Allocation policy</h2><p>{treasury?.allocationPolicy ?? 'Loading the public treasury policy…'}</p><p>{treasury?.tokenHolderRights}</p></section>
    <section><h2>Patch verification levels</h2><p><strong>Signed:</strong> the solver’s public key matches its submitted bundle. <strong>Registry replay verified:</strong> RMDY also executes the supported declarative intervention against every submitted fixture and independently reproduces the result. Neither label is a promise of universal safety.</p></section>
    <section><h2>Release integrity</h2><p>Published CLI archives are built from the repository release, tested before publication, and accompanied by a SHA-256 checksum. npm and source-host links appear only after those releases are actually public.</p></section>
  </LegalShell>;
}

'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type PatchStatus = 'verified' | 'review' | 'bounty' | 'case' | 'claimed';

type PatchRecord = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: PatchStatus;
  bounty?: string;
  before: string;
  after: string;
  evidence: string;
  models: string[];
  signal: string;
  mechanism: string;
  updated: string;
};

type FailureApiRecord = {
  publicId: string;
  title: string;
  observedBehavior: string;
  expectedBehavior: string;
  runtime: string;
  category: string;
  status: string;
  submittedAt: string;
};

type CaseDetail = {
  failure: FailureApiRecord & { status: string };
  artifact: null | { publicId: string; schema: string; contentHash: string; createdAt: string };
  patches: Array<{ publicId: string; patchId: string; patchName: string; passRateBps: number; verificationMode: string; independentPassedCases: number; independentTotalCases: number; status: string; submittedAt: string }>;
  claim: null | { publicId: string; solverName: string; solverProfileUrl: string; identityStatus: string; approach: string; status: string; claimedAt: string; completedAt: string | null };
  solverCount: number;
  bounty: {
    proposedTotal: number;
    fundedTotal: number;
    paidTotal: number;
    currency: 'USDT_SOL';
    fundingSource: 'creator_fees';
    settlementNetwork: 'solana';
    settlementStatus: 'wallet_not_connected' | 'live';
    treasuryWallet: string | null;
    pledges: Array<{ publicId: string; sponsorName: string; amount: number; status: 'proposed' | 'funded' | 'paid'; createdAt: string }>;
  };
};

type TreasuryStatus = {
  wallet: string | null;
  explorerUrl: string | null;
  walletConnected: boolean;
  totals: { proposed: number; funded: number; paid: number };
};

function failureToPatch(record: FailureApiRecord): PatchRecord {
  const submitted = new Date(record.submittedAt).getTime();
  const minutes = Math.max(0, Math.floor((Date.now() - submitted) / 60_000));
  const updated = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  const resolved = record.status === 'resolved';
  const claimed = record.status === 'claimed';
  return {
    id: record.publicId,
    title: record.title,
    summary: record.observedBehavior,
    category: record.category,
    status: resolved ? 'verified' : claimed ? 'claimed' : 'case',
    before: 'OPEN',
    after: resolved ? 'VERIFIED' : '—',
    evidence: resolved ? 'REGISTRY REPLAY' : 'AWAITING PATCH',
    models: [record.runtime],
    signal: record.observedBehavior,
    mechanism: `Expected behavior: ${record.expectedBehavior}`,
    updated,
  };
}

const patches: PatchRecord[] = [
  {
    id: 'AP-0042',
    title: 'Purchase constraint validator',
    summary: 'Stops shopping agents from submitting an order until every user constraint has been re-checked.',
    category: 'COMMERCE',
    status: 'verified',
    before: '0/5',
    after: '5/5',
    evidence: 'BUILT-IN LAB',
    models: ['Declarative runner', 'OpenAI Agents SDK adapter'],
    signal: 'Agent selects a product and calls checkout before verifying size, price ceiling, seller, and delivery date.',
    mechanism: 'Intercepts the purchase tool call, creates a typed constraint checklist, and blocks execution until every field is explicitly resolved.',
    updated: 'CLI 0.6.1',
  },
  {
    id: 'AP-0051',
    title: 'Tool-loop circuit breaker',
    summary: 'Detects repeated actions with no state change and forces the agent to re-plan or hand control back.',
    category: 'RUNTIME',
    status: 'verified',
    before: '0/6',
    after: '6/6',
    evidence: 'BUILT-IN LAB',
    models: ['Declarative runner', 'OpenAI Agents SDK adapter'],
    signal: 'The same tool and materially identical arguments execute three times without changing the environment state.',
    mechanism: 'Hashes normalized tool actions, tracks state deltas, and inserts a structured re-plan event after the configured repetition threshold.',
    updated: 'CLI 0.6.1',
  },
];

const statusLabel: Record<PatchStatus, string> = {
  verified: 'VERIFIED',
  review: 'IN REVIEW',
  bounty: 'OPEN BOUNTY',
  case: 'OPEN CASE',
  claimed: 'SOLVERS ACTIVE',
};

export default function Home() {
  const [filter, setFilter] = useState<'all' | PatchStatus>('all');
  const [query, setQuery] = useState('');
  const [selectedPatch, setSelectedPatch] = useState<PatchRecord | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [communityFailures, setCommunityFailures] = useState<PatchRecord[]>([]);
  const [registryState, setRegistryState] = useState<'loading' | 'live' | 'offline'>('loading');
  const [submissionState, setSubmissionState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [submissionError, setSubmissionError] = useState('');
  const [submittedId, setSubmittedId] = useState('');
  const [toast, setToast] = useState('');
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [caseDetailState, setCaseDetailState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [caseAction, setCaseAction] = useState<'none' | 'claim' | 'bounty' | 'evidence'>('none');
  const [caseActionState, setCaseActionState] = useState<'idle' | 'saving'>('idle');
  const [caseActionError, setCaseActionError] = useState('');
  const [claimToken, setClaimToken] = useState('');
  const [treasury, setTreasury] = useState<TreasuryStatus | null>(null);

  const registryPatches = useMemo(() => [...communityFailures, ...patches], [communityFailures]);
  const featuredCase = useMemo(() => communityFailures.find((patch) => patch.status === 'verified') ?? null, [communityFailures]);
  const visiblePatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return registryPatches.filter((patch) => {
      const matchesFilter = filter === 'all' || patch.status === filter;
      const matchesQuery = !normalized || `${patch.id} ${patch.title} ${patch.summary} ${patch.category}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, registryPatches]);

  useEffect(() => {
    let active = true;
    fetch('/api/failures', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('registry unavailable');
        return response.json() as Promise<{ failures: FailureApiRecord[] }>;
      })
      .then((payload) => {
        if (!active) return;
        setCommunityFailures(payload.failures.map(failureToPatch));
        setRegistryState('live');
      })
      .catch(() => { if (active) setRegistryState('offline'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    fetch('/api/treasury', { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() as Promise<TreasuryStatus> : null)
      .then((payload) => { if (payload) setTreasury(payload); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPatch(null);
        setSubmitOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const openPatch = (patch: PatchRecord) => {
    const isCase = patch.id.startsWith('AP-F-');
    setCaseDetail(null);
    setCaseDetailState(isCase ? 'loading' : 'idle');
    setCaseAction('none');
    setCaseActionError('');
    setClaimToken(isCase ? window.localStorage.getItem(`apatch-claim:${patch.id}`) ?? '' : '');
    setSelectedPatch(patch);
  };

  useEffect(() => {
    if (!selectedPatch?.id.startsWith('AP-F-')) return;
    let active = true;
    const localClaimToken = window.localStorage.getItem(`apatch-claim:${selectedPatch.id}`) ?? '';
    fetch(`/api/failures/${encodeURIComponent(selectedPatch.id)}`, { headers: { Accept: 'application/json', ...(localClaimToken ? { 'X-Apatch-Claim-Token': localClaimToken } : {}) } })
      .then(async (response) => {
        if (!response.ok) throw new Error('case unavailable');
        return response.json() as Promise<CaseDetail>;
      })
      .then((detail) => { if (active) { setCaseDetail(detail); setCaseDetailState('ready'); } })
      .catch(() => { if (active) setCaseDetailState('error'); });
    return () => { active = false; };
  }, [selectedPatch?.id]);

  const refreshCase = async (publicId: string, token = claimToken) => {
    const response = await fetch(`/api/failures/${encodeURIComponent(publicId)}`, { headers: { Accept: 'application/json', ...(token ? { 'X-Apatch-Claim-Token': token } : {}) } });
    if (!response.ok) throw new Error('The case could not be refreshed.');
    const detail = await response.json() as CaseDetail;
    setCaseDetail(detail);
    setCaseDetailState('ready');
    const nextPatch = failureToPatch(detail.failure);
    setCommunityFailures((current) => current.map((item) => item.id === publicId ? nextPatch : item));
    setSelectedPatch((current) => current?.id === publicId ? nextPatch : current);
  };

  const claimCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPatch) return;
    setCaseActionState('saving');
    setCaseActionError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/failures/${encodeURIComponent(selectedPatch.id)}/claim`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solverName: form.get('solverName'), solverProfileUrl: form.get('solverProfileUrl'), approach: form.get('approach') }),
      });
      const payload = await response.json() as { claimToken?: string; error?: string };
      if (!response.ok || !payload.claimToken) throw new Error(payload.error ?? 'The case could not be claimed.');
      window.localStorage.setItem(`apatch-claim:${selectedPatch.id}`, payload.claimToken);
      setClaimToken(payload.claimToken);
      await refreshCase(selectedPatch.id, payload.claimToken);
      setCaseAction('evidence');
      setToast('Solver application created — keep the token private');
    } catch (error) { setCaseActionError(error instanceof Error ? error.message : 'The case could not be claimed.'); }
    finally { setCaseActionState('idle'); }
  };

  const pledgeBounty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPatch) return;
    setCaseActionState('saving');
    setCaseActionError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/failures/${encodeURIComponent(selectedPatch.id)}/bounties`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorName: form.get('sponsorName'), amount: Number(form.get('amount')), note: form.get('note') }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The proposal could not be saved.');
      await refreshCase(selectedPatch.id);
      setCaseAction('none');
      setToast('USDT bounty target proposed');
    } catch (error) { setCaseActionError(error instanceof Error ? error.message : 'The proposal could not be saved.'); }
    finally { setCaseActionState('idle'); }
  };

  const attachArtifact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPatch || !claimToken) return;
    setCaseActionState('saving');
    setCaseActionError('');
    const raw = String(new FormData(event.currentTarget).get('artifactJson') ?? '');
    try {
      JSON.parse(raw);
      const response = await fetch(`/api/failures/${encodeURIComponent(selectedPatch.id)}/artifacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Apatch-Claim-Token': claimToken }, body: raw,
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The reproduction could not be attached.');
      await refreshCase(selectedPatch.id);
      setToast('Privacy-safe reproduction attached');
    } catch (error) { setCaseActionError(error instanceof Error ? error.message : 'Paste a valid case JSON file.'); }
    finally { setCaseActionState('idle'); }
  };

  const submitSignedPatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPatch || !claimToken) return;
    setCaseActionState('saving');
    setCaseActionError('');
    const raw = String(new FormData(event.currentTarget).get('bundleJson') ?? '');
    try {
      JSON.parse(raw);
      const response = await fetch(`/api/failures/${encodeURIComponent(selectedPatch.id)}/patches`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Apatch-Claim-Token': claimToken }, body: raw,
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The signed patch could not be submitted.');
      await refreshCase(selectedPatch.id);
      setCaseAction('none');
      setToast('Patch verified — case resolved');
    } catch (error) { setCaseActionError(error instanceof Error ? error.message : 'Paste a valid attestation bundle.'); }
    finally { setCaseActionState('idle'); }
  };

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(message);
    } catch {
      setToast('Copy failed — select the command manually');
    }
  };

  const openSubmission = () => {
    setSubmissionState('idle');
    setSubmissionError('');
    setSubmittedId('');
    setSubmitOpen(true);
  };

  const submitFailure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionState('saving');
    setSubmissionError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/failures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          observedBehavior: form.get('observedBehavior'),
          expectedBehavior: form.get('expectedBehavior'),
          runtime: form.get('runtime'),
          privacyConfirmed: form.get('privacyConfirmed') === 'on',
          website: form.get('website'),
        }),
      });
      const payload = await response.json() as { failure?: FailureApiRecord; error?: string };
      if (!response.ok || !payload.failure) throw new Error(payload.error ?? 'The failure could not be saved.');
      const patch = failureToPatch(payload.failure);
      setCommunityFailures((current) => [patch, ...current.filter((item) => item.id !== patch.id)]);
      setSubmittedId(payload.failure.publicId);
      setRegistryState('live');
      setSubmissionState('done');
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'The failure could not be saved.');
      setSubmissionState('idle');
    }
  };

  return (
    <main>
      <nav className="nav-shell">
        <a className="brand" href="#top" aria-label="RMDY home">
          <span className="brand-mark">R/</span>
          <span>RMDY</span>
        </a>
        <div className="nav-links" aria-label="Primary navigation">
          <a href="#registry">Registry</a>
          <a href="#protocol">Protocol</a>
          <a href="#network">Network</a>
          <a href="/transparency">Transparency</a>
        </div>
        <button className="nav-cta" type="button" onClick={openSubmission}>
          Submit a failure <span>↗</span>
        </button>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> LIVE REPAIR NETWORK · RMDY CLI 0.6</div>
          <h1>Every failure makes<br />every agent <em>stronger.</em></h1>
          <p className="hero-lede">
            The open repair network for AI agents. Reproduce failures, fund fixes,
            and install runtime patches backed by executable evidence.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#registry">Explore patches <span>↘</span></a>
            <a className="button button-ghost" href="#protocol"><span className="terminal-prompt">›_</span> Read the spec</a>
          </div>
          <div className="hero-proof" aria-label="MVP capabilities">
            <div><strong>02</strong><span>tested patches</span></div>
            <div><strong>01</strong><span>live SDK adapter</span></div>
            <div><strong>LOCAL</strong><span>trace redaction</span></div>
          </div>
        </div>

        <div className="proof-window" aria-label="Patch verification example">
          <div className="window-bar">
            <div className="window-title"><span>{featuredCase?.id ?? 'AP-0051'}</span> {featuredCase ? 'LIVE CASE' : 'BUILT-IN LAB'} · TOOL LOOP</div>
            <div className="window-state"><span /> RESOLVED</div>
          </div>
          <div className="comparison">
            <article className="run-card run-before">
              <div className="run-label"><span>BEFORE</span><b>FAILED</b></div>
              <div className="agent-log">
                <div className="log-step"><i>01</i><p>Search inventory<br/><small>No matching result</small></p></div>
                <div className="log-step"><i>02</i><p>Repeat same search<br/><small>No state change</small></p></div>
                <div className="log-step log-error"><i>03</i><p>Repeat again<br/><small>Agent stuck in loop</small></p></div>
              </div>
              <div className="score score-bad"><span>BASELINE</span><strong>0/6</strong></div>
            </article>

            <div className="patch-bridge" aria-hidden="true">
              <span>+</span><b>RM</b><small>AP-0051<br/>APPLIED</small>
            </div>

            <article className="run-card run-after">
              <div className="run-label"><span>AFTER</span><b>PASSED</b></div>
              <div className="agent-log">
                <div className="log-step"><i>01</i><p>Search inventory<br/><small>No matching result</small></p></div>
                <div className="log-step"><i>02</i><p>Second attempt<br/><small>Repetition counted</small></p></div>
                <div className="log-step log-success"><i>03</i><p>Circuit breaker<br/><small>Re-plan required</small></p></div>
              </div>
              <div className="score score-good"><span>REGRESSION</span><strong>6/6</strong></div>
            </article>
          </div>
          <div className="install-strip">
            <code><span>$</span> rmdy install AP-0051 --runtime openai-agents</code>
            <button type="button" onClick={() => copy('rmdy install AP-0051 --runtime openai-agents', 'Install command copied')}>COPY</button>
          </div>
        </div>
      </section>

      <div className="signal-strip" aria-hidden="true">
        <span>REPRODUCE</span><b>◆</b><span>BOUNTY</span><b>◆</b><span>PATCH</span><b>◆</b><span>VERIFY</span><b>◆</b><span>INSTALL</span><b>◆</b><span>REGRESS</span>
      </div>

      <section className="registry-section" id="registry">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / REGISTRY</span>
            <h2>Known failures.<br/><em>Working fixes.</em></h2>
          </div>
          <p>Each case moves through four visible stages: report, non-exclusive solver applications, privacy-safe reproduction, and independently replayed signed patch.</p>
        </div>

        <div className="registry-toolbar">
          <div className="filter-group" role="group" aria-label="Filter registry">
            {([
              ['all', 'ALL'],
              ['verified', 'VERIFIED'],
              ['review', 'IN REVIEW'],
              ['bounty', 'OPEN BOUNTY'],
              ['claimed', 'CLAIMED'],
              ['case', 'OPEN CASES'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <label className="registry-search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patches or failure IDs" aria-label="Search patches" />
          </label>
        </div>

        <div className="registry-table" role="list">
          <div className="registry-head" aria-hidden="true">
            <span>PATCH / FAILURE</span><span>STATUS</span><span>REGRESSION</span><span>EVIDENCE</span><span />
          </div>
          {visiblePatches.map((patch) => (
            <button className="patch-row" type="button" role="listitem" key={patch.id} onClick={() => openPatch(patch)}>
              <span className="patch-main"><b>{patch.id}</b><span><strong>{patch.title}</strong><small>{patch.category}</small></span></span>
              <span className={`status-chip status-${patch.status}`}><i />{statusLabel[patch.status]}</span>
              <span className="improvement"><small>{patch.before}</small><b>→</b><strong>{patch.after}</strong></span>
              <span className="adoption"><strong>{patch.status === 'case' ? 'OPEN TO SOLVERS' : patch.status === 'claimed' ? 'PARALLEL WORK' : patch.id.startsWith('AP-F-') ? 'RESOLVED' : patch.bounty ?? patch.evidence}</strong><small>{patch.status === 'case' ? 'NEXT ACTION' : patch.status === 'claimed' ? 'NON-EXCLUSIVE' : patch.id.startsWith('AP-F-') ? 'LIFECYCLE' : patch.bounty ? 'BOUNTY' : 'TEST SOURCE'}</small></span>
              <span className="row-arrow">↗</span>
            </button>
          ))}
          {visiblePatches.length === 0 && <div className="empty-state">No patches match that search.</div>}
        </div>
        <p className="demo-note"><span className={`registry-sync registry-${registryState}`}><i />{registryState === 'loading' ? 'SYNCING REGISTRY' : registryState === 'live' ? 'PERSISTENT REGISTRY LIVE' : 'SHOWING BUILT-IN PATCHES'}</span><span>AP-F records are stored cases. Solver applications are non-exclusive; a case resolves only after signature validation and an independent registry fixture replay.</span></p>
      </section>

      <section className="protocol-section" id="protocol">
        <div className="section-heading inverse">
          <div>
            <span className="section-index">02 / PATCH SPEC</span>
            <h2>A fix you can<br/><em>prove.</em></h2>
          </div>
          <p>A patch is not advice. It is a small, inspectable package with a trigger, intervention, regression test, and compatibility manifest.</p>
        </div>

        <div className="protocol-grid">
          <div className="protocol-steps">
            {[
              ['01', 'REPRODUCE', 'Turn one real failure into a deterministic, privacy-safe test case.'],
              ['02', 'REMEDIATE', 'Attach the smallest policy, middleware, or tool-schema change that fixes it.'],
              ['03', 'VERIFY', 'Run the same case across supported models, agents, and environment versions.'],
              ['04', 'DISTRIBUTE', 'Publish one signed ID that developers can test and install from the registry.'],
            ].map(([number, title, description]) => (
              <article className="protocol-step" key={number}>
                <span>{number}</span><div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>

          <div className="spec-card">
            <div className="spec-top"><span>patch.yaml</span><b>AP SPEC / 0.1</b></div>
            <pre>{`id: AP-0042
name: purchase-constraint-validator
trigger:
  tool: commerce.checkout
  requires: [size, price, seller, delivery]
intervention:
  type: require_tool_arguments
  tool: commerce.checkout
  required: [size, price, seller, delivery]
  on_failure: block
verification:
  fixture: ./cases/regression.json
  minimum_pass_rate: 1
privacy:
  redaction: local_required`}</pre>
            <div className="spec-bottom"><span>SCHEMA VALID</span><button type="button" onClick={() => copy('rmdy init my-patch --id AP-LOCAL-0001', 'Starter command copied')}>COPY STARTER ↗</button></div>
          </div>
        </div>
      </section>

      <section className="network-section" id="network">
        <div className="network-copy">
          <span className="section-index">03 / NETWORK</span>
          <h2>Fees become<br/><em>verified fixes.</em></h2>
          <p>Net creator fees actually received by the disclosed treasury are reserved for verified bounties, converted into USDT on Solana, and separated from community proposals. No wallet means no funded balance.</p>
          <button className="button button-primary" type="button" onClick={openSubmission}>Open a failure case <span>↗</span></button>
          <a className="network-ledger-link" href="/transparency">View the public treasury policy ↗</a>
        </div>
        <div className="utility-grid">
          <article><span>01</span><h3>ROUTE FEES</h3><p>Creator-fee proceeds move only to a disclosed Solana treasury. SOL or USDC does not count as bounty funding until converted and allocated in USDT.</p><b>{treasury?.walletConnected ? 'WALLET DISCLOSED' : 'WALLET NOT CONNECTED'}</b></article>
          <article><span>02</span><h3>FUND CASES</h3><p>The community proposes USDT targets. A bounty becomes funded only after treasury allocation is visible on-chain.</p><b>PROPOSAL ≠ FUNDS ↗</b></article>
          <article><span>03</span><h3>VERIFY WORK</h3><p>The registry validates source hashes and the solver signature, then independently replays every supported declarative regression fixture.</p><b>REGISTRY REPLAY REQUIRED ↗</b></article>
          <article className="utility-principle"><span>04</span><h3>PAY IN USDT</h3><p>Only verified work can qualify for USDT on Solana. A token does not give holders any right to fees, treasury assets, or bounty payments.</p><b>{treasury?.totals.funded.toLocaleString() ?? '0'} USDT FUNDED TODAY</b></article>
        </div>
      </section>

      <section className="builder-section" id="builders">
        <div className="builder-terminal">
          <div className="terminal-header"><span>RMDY CLI · 0.6.1</span><i>REGISTRY-REPLAY READY</i></div>
          <div className="terminal-body">
            <p><span>01</span><code><b>$</b> npm install -g ./rmdy-0.6.1.tgz</code></p>
            <p><span>02</span><code><b>$</b> rmdy install AP-0051 --runtime openai-agents</code></p>
            <p><span>03</span><code><b>$</b> import {'{'} applyAgentPatches {'}'} from &apos;./.apatch/runtime/openai-agents.mjs&apos;</code></p>
            <div className="terminal-result"><i>✓</i><span><strong>TOOL GUARDRAIL ACTIVE</strong><small>identical third call blocked · agent instructed to re-plan</small></span></div>
          </div>
        </div>
        <div className="builder-copy">
          <span className="section-index">04 / BUILDERS</span>
          <h2>Start with the<br/>failure.</h2>
          <p>The CLI now generates a real OpenAI Agents SDK function-tool guardrail. Installed patches run before your custom tool executes: AP-0051 blocks a repeated third call and tells the agent to re-plan, while AP-0042 rejects incomplete checkout arguments.</p>
          <div className="builder-actions">
            <a className="button button-lime" href="https://github.com/RMDYLabs/RMDY/releases/download/v0.6.1/rmdy-0.6.1.tgz">Download RMDY CLI <span>↓</span></a>
            <button className="builder-copy-button" type="button" onClick={() => copy('npm install -g ./rmdy-0.6.1.tgz', 'Install command copied')}>Copy install command ↗</button>
          </div>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">R/</span><span>RMDY</span></a>
        <p>VERIFIED FIXES FOR AI AGENTS · APATCH/V0.1 COMPATIBLE.</p>
        <div><a href="#registry">REGISTRY</a><a href="/transparency">TRANSPARENCY</a><a href="/terms">TERMS</a><a href="/privacy">PRIVACY</a><a href="/token-disclosure">TOKEN RISK</a></div>
      </footer>

      {selectedPatch && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPatch(null); }}>
          <section className="patch-detail" role="dialog" aria-modal="true" aria-labelledby="patch-detail-title">
            <button className="modal-close" type="button" aria-label="Close patch details" onClick={() => setSelectedPatch(null)}>×</button>
            <div className="detail-kicker"><span>{selectedPatch.id}</span><b>{selectedPatch.category}</b><i>UPDATED {selectedPatch.updated.toUpperCase()}</i></div>
            <h2 id="patch-detail-title">{selectedPatch.title}</h2>
            <p className="detail-summary">{selectedPatch.summary}</p>
            <div className="detail-score">
              <div><small>BEFORE</small><strong>{selectedPatch.before}</strong></div>
              <span>→</span>
              <div><small>AFTER</small><strong>{selectedPatch.after}</strong></div>
              <div className="detail-status"><small>STATE</small><b className={`status-chip status-${selectedPatch.status}`}><i />{statusLabel[selectedPatch.status]}</b></div>
            </div>
            <div className="detail-block"><span>FAILURE SIGNAL</span><p>{selectedPatch.signal}</p></div>
            <div className="detail-block"><span>PATCH MECHANISM</span><p>{selectedPatch.mechanism}</p></div>
            <div className="compatibility"><span>TEST MATRIX</span><div>{selectedPatch.models.map((model) => <b key={model}>{model}</b>)}</div></div>
            {selectedPatch.id.startsWith('AP-F-') ? (
              <div className="case-proof">
                {caseDetailState === 'loading' && <p>Loading the case lifecycle…</p>}
                {caseDetailState === 'error' && <p>Case details are temporarily unavailable.</p>}
                {caseDetailState === 'ready' && caseDetail && (
                  <>
                    <div className="case-lifecycle-title"><span>LIVE CASE LIFECYCLE</span><b>{caseDetail.failure.status === 'resolved' ? '4 / 4 COMPLETE' : caseDetail.solverCount ? `2 / 4 · ${caseDetail.solverCount} SOLVER${caseDetail.solverCount === 1 ? '' : 'S'}` : '1 / 4 OPEN'}</b></div>
                    <div className="proof-line proof-complete"><i>✓</i><span><small>PROBLEM</small><b>PUBLIC FAILURE RECORDED</b></span></div>
                    <div className={`proof-line ${caseDetail.claim ? 'proof-complete' : ''}`}><i>{caseDetail.claim ? '✓' : '2'}</i><span><small>NON-EXCLUSIVE SOLVER APPLICATION</small><b>{caseDetail.claim ? (caseDetail.claim.solverProfileUrl ? <a href={caseDetail.claim.solverProfileUrl} rel="noreferrer" target="_blank">{caseDetail.claim.solverName.toUpperCase()} · {caseDetail.claim.identityStatus.replace('_', ' ').toUpperCase()} ↗</a> : `${caseDetail.claim.solverName.toUpperCase()} · HISTORICAL CORE CLAIM`) : 'OPEN TO PARALLEL SOLVERS'}</b></span></div>
                    <div className={`proof-line ${caseDetail.artifact ? 'proof-complete' : ''}`}><i>{caseDetail.artifact ? '✓' : '3'}</i><span><small>REPRODUCTION</small><b>{caseDetail.artifact ? `SANITIZED · ${caseDetail.artifact.contentHash.slice(0, 12)}` : 'AWAITING PRIVACY-SAFE ARTIFACT'}</b></span></div>
                    <div className={`proof-line ${caseDetail.patches.length ? 'proof-complete' : ''}`}><i>{caseDetail.patches.length ? '✓' : '4'}</i><span><small>INDEPENDENT REGISTRY REPLAY</small><b>{caseDetail.patches[0] ? `${caseDetail.patches[0].patchId} · ${caseDetail.patches[0].independentPassedCases}/${caseDetail.patches[0].independentTotalCases} FIXTURES PASSED` : 'AWAITING SIGNED PATCH + REGISTRY REPLAY'}</b></span></div>

                    <div className="case-ledger">
                      <div><small>USDT BOUNTY LEDGER</small><strong>{caseDetail.bounty.fundedTotal.toLocaleString()} USDT FUNDED</strong><span>{caseDetail.bounty.proposedTotal.toLocaleString()} USDT PROPOSED · {caseDetail.bounty.settlementStatus === 'live' ? 'TREASURY DISCLOSED' : 'TREASURY NOT CONNECTED'}</span></div>
                      {caseDetail.claim && <div><small>SOLVER APPROACH</small><p>{caseDetail.claim.approach}</p></div>}
                    </div>

                    {caseDetail.failure.status !== 'resolved' && (
                      <div className="case-action-bar">
                        <button type="button" onClick={() => { setCaseAction('claim'); setCaseActionError(''); }}>{caseDetail.solverCount ? 'Join as another solver' : 'Apply as a solver'}</button>
                        {claimToken && caseDetail.claim?.status === 'active' && <button type="button" onClick={() => { setCaseAction('evidence'); setCaseActionError(''); }}>Submit the fix</button>}
                        <button type="button" onClick={() => { setCaseAction('bounty'); setCaseActionError(''); }}>Propose USDT bounty</button>
                      </div>
                    )}

                    {caseAction === 'claim' && (
                      <form className="case-action-form" onSubmit={claimCase}>
                        <span>APPLY AS A SOLVER</span>
                        <p>Cases do not lock. Add a public identity and approach so multiple teams can work in parallel without blocking one another.</p>
                        <label><small>SOLVER OR TEAM NAME</small><input name="solverName" required minLength={2} maxLength={40} placeholder="Runtime Reliability Lab" /></label>
                        <label><small>PUBLIC PROFILE · HTTPS</small><input name="solverProfileUrl" required type="url" maxLength={180} placeholder="https://github.com/your-team" /></label>
                        <label><small>IMPLEMENTATION APPROACH</small><textarea name="approach" required minLength={20} maxLength={320} placeholder="Add a normalized tool-call fingerprint and force a re-plan after three no-progress repetitions." /></label>
                        <button className="button button-primary" disabled={caseActionState === 'saving'}>{caseActionState === 'saving' ? 'Applying…' : 'Create solver application'} <span>↗</span></button>
                      </form>
                    )}

                    {caseAction === 'bounty' && (
                      <form className="case-action-form" onSubmit={pledgeBounty}>
                        <span>PROPOSE USDT BOUNTY</span>
                        <p>Choose a target for creator-fee treasury allocation. This does not deposit or escrow USDT; only a verified treasury transaction can mark it funded.</p>
                        <label><small>PROPOSER NAME</small><input name="sponsorName" required minLength={2} maxLength={40} placeholder="Agent Reliability DAO" /></label>
                        <label><small>USDT TARGET · SOLANA</small><input name="amount" required type="number" min={10} max={1000000} step={10} defaultValue={1000} /></label>
                        <label><small>NOTE</small><input name="note" maxLength={180} placeholder="Priority: browser agents" /></label>
                        <button className="button button-primary" disabled={caseActionState === 'saving'}>{caseActionState === 'saving' ? 'Saving…' : 'Propose target'} <span>↗</span></button>
                      </form>
                    )}

                    {caseAction === 'evidence' && caseDetail.claim?.status === 'active' && (
                      <div className="case-evidence">
                        <div className="claim-token"><span>PRIVATE CLAIM TOKEN</span><code>{claimToken ? `${claimToken.slice(0, 8)}••••••••` : 'Not found on this device'}</code></div>
                        {!claimToken ? <p className="form-error">This claim belongs to another browser. The solver must submit from the device that created it.</p> : !caseDetail.artifact ? (
                          <form className="case-action-form" onSubmit={attachArtifact}>
                            <span>STEP 1 · ATTACH REPRODUCTION</span>
                            <p>Run <code>rmdy scan trace.json</code>, then paste the generated sanitized case JSON.</p>
                            <label><small>SANITIZED CASE JSON</small><textarea className="code-input" name="artifactJson" required placeholder={'{\n  "schema": "apatch/case/v0.1"\n}'} /></label>
                            <button className="button button-primary" disabled={caseActionState === 'saving'}>{caseActionState === 'saving' ? 'Checking…' : 'Attach reproduction'} <span>↗</span></button>
                          </form>
                        ) : (
                          <form className="case-action-form" onSubmit={submitSignedPatch}>
                            <span>STEP 2 · SUBMIT SIGNED PATCH</span>
                            <p>Run <code>rmdy attest AP-ID --failure {selectedPatch.id}</code>, then paste the signed bundle.</p>
                            <label><small>ATTESTATION BUNDLE JSON</small><textarea className="code-input" name="bundleJson" required placeholder={'{\n  "schema": "apatch/attestation/v0.1"\n}'} /></label>
                            <button className="button button-primary" disabled={caseActionState === 'saving'}>{caseActionState === 'saving' ? 'Replaying…' : 'Replay, verify, and resolve'} <span>↗</span></button>
                          </form>
                        )}
                      </div>
                    )}

                    {caseActionError && <p className="form-error case-action-error" role="alert">{caseActionError}</p>}
                    {caseDetail.patches[0] && <div className="detail-install"><span>INSTALL</span><code>rmdy install {caseDetail.patches[0].patchId}</code><button type="button" onClick={() => copy(`rmdy install ${caseDetail.patches[0].patchId}`, 'Install command copied')}>COPY</button></div>}
                  </>
                )}
              </div>
            ) : selectedPatch.status === 'bounty' ? (
              <button className="detail-install detail-bounty" type="button" onClick={() => { setSelectedPatch(null); openSubmission(); }}><span>PROPOSED BOUNTY</span><code>{selectedPatch.bounty}</code><b>SUBMIT A FIX ↗</b></button>
            ) : (
              <div className="detail-install"><span>INSTALL</span><code>rmdy install {selectedPatch.id}</code><button type="button" onClick={() => copy(`rmdy install ${selectedPatch.id}`, 'Install command copied')}>COPY</button></div>
            )}
          </section>
        </div>
      )}

      {submitOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubmitOpen(false); }}>
          <section className="submit-modal" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <button className="modal-close" type="button" aria-label="Close submission form" onClick={() => setSubmitOpen(false)}>×</button>
            {submissionState !== 'done' ? (
              <>
                <span className="section-index">NEW FAILURE / PERSISTENT CASE</span>
                <h2 id="submit-title">Make it reproducible.</h2>
                <p>Describe the behavior without uploading a private trace. This description becomes a real open case in the registry.</p>
                <form onSubmit={submitFailure}>
                  <label className="form-trap" aria-hidden="true"><span>WEBSITE</span><input aria-hidden="true" name="website" tabIndex={-1} autoComplete="off" /></label>
                  <label><span>FAILURE TITLE</span><input required minLength={8} maxLength={100} name="title" placeholder="Agent ignores delivery-date constraint" /></label>
                  <label><span>WHAT HAPPENED?</span><textarea required minLength={20} name="observedBehavior" placeholder="The agent selected the first result and submitted checkout without checking delivery…" /></label>
                  <label><span>WHAT SHOULD HAVE HAPPENED?</span><textarea required minLength={20} name="expectedBehavior" placeholder="The agent should verify arrival before Friday…" /></label>
                  <label><span>AGENT RUNTIME</span><select required name="runtime" defaultValue=""><option value="" disabled>Select a runtime</option><option>OpenAI Agents SDK</option><option>LangGraph</option><option>Browser-use</option><option>Custom runtime</option></select></label>
                  <label className="privacy-check"><input required name="privacyConfirmed" type="checkbox" /><span>I confirm this description contains no secrets or personal data.</span></label>
                  {submissionError && <p className="form-error" role="alert">{submissionError}</p>}
                  <button className="button button-primary" type="submit" disabled={submissionState === 'saving'}>{submissionState === 'saving' ? 'Saving case…' : 'Publish open case'} <span>↗</span></button>
                </form>
              </>
            ) : (
              <div className="submit-success">
                <i>✓</i><span className="section-index">CASE PUBLISHED</span><h2 id="submit-title">Failure {submittedId} is live.</h2><p>The record is stored in the persistent registry and will remain after refresh. The next stage is attaching a redacted reproduction and signed patch result.</p><button className="button button-primary" type="button" onClick={() => { setSubmitOpen(false); document.getElementById('registry')?.scrollIntoView(); }}>View in registry <span>↗</span></button>
              </div>
            )}
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

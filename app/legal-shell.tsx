import type { ReactNode } from 'react';
import Link from 'next/link';

export function LegalShell({ eyebrow, title, updated = '28 August 2026', children }: { eyebrow: string; title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" href="/"><span className="brand-mark">R/</span><span>RMDY</span></Link>
        <Link href="/">Back to product ↗</Link>
      </nav>
      <article className="legal-document">
        <header><span className="section-index">{eyebrow}</span><h1>{title}</h1><p>Last updated {updated}</p></header>
        {children}
      </article>
      <footer className="legal-footer"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/token-disclosure">Token disclosure</Link><Link href="/transparency">Transparency</Link></footer>
    </main>
  );
}

import { env } from 'cloudflare:workers';
import { ensureRegistrySchema, getD1 } from '@/db';

const solanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET() {
  try {
    await ensureRegistrySchema();
    const totals = await getD1().prepare(`SELECT
      COALESCE(SUM(CASE WHEN status = 'proposed' THEN amount ELSE 0 END), 0) AS proposed_total,
      COALESCE(SUM(CASE WHEN status = 'funded' THEN amount ELSE 0 END), 0) AS funded_total,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid_total
      FROM bounty_pledges`).first<{ proposed_total: number; funded_total: number; paid_total: number }>();
    const wallet = env.RMDY_TREASURY_WALLET?.trim() ?? '';
    const walletConnected = solanaAddress.test(wallet);
    return Response.json({
      network: 'solana',
      settlementCurrency: 'USDT_SOL',
      fundingSource: 'creator_fees',
      wallet: walletConnected ? wallet : null,
      explorerUrl: walletConnected ? `https://solscan.io/account/${wallet}` : null,
      walletConnected,
      allocationPolicy: '100% of net creator fees received by the disclosed treasury are reserved for verified USDT bounties after network and conversion costs.',
      tokenHolderRights: 'No equity, revenue share, governance right, or entitlement to treasury assets.',
      totals: {
        proposed: Number(totals?.proposed_total ?? 0),
        funded: Number(totals?.funded_total ?? 0),
        paid: Number(totals?.paid_total ?? 0),
      },
    });
  } catch {
    return Response.json({ error: 'Treasury status is temporarily unavailable.' }, { status: 503 });
  }
}

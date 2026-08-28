import { desc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { ensureRegistrySchema, getDb } from '@/db';
import { bountyPledges, failures } from '@/db/schema';
import { allowWrite } from '@/app/api/rate-limit';
import { hasResidualSensitiveValue, requestBodyTooLarge } from '@/app/api/protocol';

function clean(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  try {
    await ensureRegistrySchema();
    const pledges = await getDb().select().from(bountyPledges).where(eq(bountyPledges.failurePublicId, publicId)).orderBy(desc(bountyPledges.createdAt)).limit(50);
    const wallet = env.RMDY_TREASURY_WALLET?.trim() ?? '';
    const walletConnected = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet);
    return Response.json({
      pledges,
      proposedTotal: pledges.filter((pledge) => pledge.status === 'proposed').reduce((sum, pledge) => sum + pledge.amount, 0),
      fundedTotal: pledges.filter((pledge) => pledge.status === 'funded').reduce((sum, pledge) => sum + pledge.amount, 0),
      paidTotal: pledges.filter((pledge) => pledge.status === 'paid').reduce((sum, pledge) => sum + pledge.amount, 0),
      currency: 'USDT_SOL',
      fundingSource: 'creator_fees',
      settlementNetwork: 'solana',
      settlementStatus: walletConnected ? 'live' : 'wallet_not_connected',
      treasuryWallet: walletConnected ? wallet : null,
    });
  } catch { return Response.json({ error: 'Bounty status is temporarily unavailable.' }, { status: 503 }); }
}

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  if (requestBodyTooLarge(request, 4_096)) return Response.json({ error: 'Bounty proposals are limited to 4 KB.' }, { status: 413 });
  const { publicId } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: 'A valid USDT bounty proposal is required.' }, { status: 400 }); }
  const sponsorName = clean(body.sponsorName, 40);
  const note = clean(body.note, 180);
  const amount = typeof body.amount === 'number' ? Math.floor(body.amount) : Number(body.amount);
  if (sponsorName.length < 2 || !Number.isInteger(amount) || amount < 10 || amount > 1_000_000) return Response.json({ error: 'Enter a proposer name and a target of 10–1,000,000 USDT.' }, { status: 422 });
  if (hasResidualSensitiveValue(`${sponsorName} ${note}`)) return Response.json({ error: 'Do not include contact details or secrets in a public proposal.' }, { status: 422 });
  if (!await allowWrite(request, 'bounty', 10)) return Response.json({ error: 'Too many proposals. Try again next hour.' }, { status: 429 });
  try {
    await ensureRegistrySchema();
    const db = getDb();
    const failure = await db.select().from(failures).where(eq(failures.publicId, publicId)).get();
    if (!failure) return Response.json({ error: 'Failure not found.' }, { status: 404 });
    if (failure.status === 'resolved') return Response.json({ error: 'This case is already resolved.' }, { status: 409 });
    const [pledge] = await db.insert(bountyPledges).values({
      publicId: `BNT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      failurePublicId: publicId,
      sponsorName,
      amount,
      currency: 'USDT_SOL',
      note,
      status: 'proposed',
      createdAt: new Date().toISOString(),
    }).returning();
    return Response.json({ pledge, settlement: 'proposal_only', fundingSource: 'creator_fees' }, { status: 201 });
  } catch { return Response.json({ error: 'The bounty proposal could not be saved.' }, { status: 500 }); }
}

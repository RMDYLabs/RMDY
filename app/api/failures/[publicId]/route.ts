import { desc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { ensureRegistrySchema, getDb } from '@/db';
import { bountyPledges, caseClaims, failureArtifacts, failures, patchSubmissions } from '@/db/schema';
import { sha256 } from '@/app/api/protocol';

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  try {
    await ensureRegistrySchema();
    const db = getDb();
    const failure = await db.select().from(failures).where(eq(failures.publicId, publicId)).get();
    if (!failure) return Response.json({ error: 'Failure not found.' }, { status: 404 });
    const artifact = await db.select({
      publicId: failureArtifacts.publicId,
      schema: failureArtifacts.schema,
      contentHash: failureArtifacts.contentHash,
      createdAt: failureArtifacts.createdAt,
    }).from(failureArtifacts).where(eq(failureArtifacts.failurePublicId, publicId)).get();
    const patches = await db.select({
      publicId: patchSubmissions.publicId,
      patchId: patchSubmissions.patchId,
      patchName: patchSubmissions.patchName,
      passRateBps: patchSubmissions.passRateBps,
      verificationMode: patchSubmissions.verificationMode,
      independentPassedCases: patchSubmissions.independentPassedCases,
      independentTotalCases: patchSubmissions.independentTotalCases,
      status: patchSubmissions.status,
      submittedAt: patchSubmissions.submittedAt,
    }).from(patchSubmissions).where(eq(patchSubmissions.failurePublicId, publicId)).orderBy(desc(patchSubmissions.submittedAt)).limit(20);
    const claims = await db.select({
      publicId: caseClaims.publicId,
      solverName: caseClaims.solverName,
      solverProfileUrl: caseClaims.solverProfileUrl,
      identityStatus: caseClaims.identityStatus,
      approach: caseClaims.approach,
      status: caseClaims.status,
      claimedAt: caseClaims.claimedAt,
      completedAt: caseClaims.completedAt,
      claimTokenHash: caseClaims.claimTokenHash,
    }).from(caseClaims).where(eq(caseClaims.failurePublicId, publicId)).orderBy(desc(caseClaims.claimedAt)).limit(20);
    const suppliedClaimToken = request.headers.get('x-apatch-claim-token') ?? '';
    const suppliedClaimTokenHash = suppliedClaimToken ? await sha256(suppliedClaimToken) : '';
    const preferredClaim = claims.find((claim) => suppliedClaimTokenHash && claim.claimTokenHash === suppliedClaimTokenHash)
      ?? claims.find((claim) => claim.status === 'active')
      ?? claims[0];
    const publicClaim = preferredClaim ? {
      publicId: preferredClaim.publicId,
      solverName: preferredClaim.solverName,
      solverProfileUrl: preferredClaim.solverProfileUrl,
      identityStatus: preferredClaim.identityStatus,
      approach: preferredClaim.approach,
      status: preferredClaim.status,
      claimedAt: preferredClaim.claimedAt,
      completedAt: preferredClaim.completedAt,
    } : null;
    const pledges = await db.select({
      publicId: bountyPledges.publicId,
      sponsorName: bountyPledges.sponsorName,
      amount: bountyPledges.amount,
      status: bountyPledges.status,
      createdAt: bountyPledges.createdAt,
    }).from(bountyPledges).where(eq(bountyPledges.failurePublicId, publicId)).orderBy(desc(bountyPledges.createdAt)).limit(50);
    const wallet = env.RMDY_TREASURY_WALLET?.trim() ?? '';
    const walletConnected = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet);
    return Response.json({
      failure,
      artifact: artifact ?? null,
      patches,
      claim: publicClaim,
      solverCount: claims.filter((claim) => claim.status === 'active' || claim.status === 'completed').length,
      bounty: {
        proposedTotal: pledges.filter((pledge) => pledge.status === 'proposed').reduce((sum, pledge) => sum + pledge.amount, 0),
        fundedTotal: pledges.filter((pledge) => pledge.status === 'funded').reduce((sum, pledge) => sum + pledge.amount, 0),
        paidTotal: pledges.filter((pledge) => pledge.status === 'paid').reduce((sum, pledge) => sum + pledge.amount, 0),
        currency: 'USDT_SOL',
        fundingSource: 'creator_fees',
        settlementNetwork: 'solana',
        settlementStatus: walletConnected ? 'live' : 'wallet_not_connected',
        treasuryWallet: walletConnected ? wallet : null,
        pledges,
      },
    });
  } catch {
    return Response.json({ error: 'Case details are temporarily unavailable.' }, { status: 503 });
  }
}

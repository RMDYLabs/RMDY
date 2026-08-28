import { and, eq } from 'drizzle-orm';
import { ensureRegistrySchema, getD1, getDb } from '@/db';
import { caseClaims, failureArtifacts, failures } from '@/db/schema';
import { requestBodyTooLarge, sha256, verifyAttestationBundle } from '@/app/api/protocol';
import { allowWrite } from '@/app/api/rate-limit';

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  if (requestBodyTooLarge(request, 110_000)) return Response.json({ error: 'Signed bundles are limited to 110 KB.' }, { status: 413 });
  const { publicId } = await context.params;
  let value: unknown;
  try { value = await request.json(); }
  catch { return Response.json({ error: 'A valid signed bundle is required.' }, { status: 400 }); }

  try {
    if (!await allowWrite(request, 'patch', 12)) return Response.json({ error: 'Too many patch submissions. Try again next hour.' }, { status: 429 });
    const { bundle, passRateBps, registryResult } = await verifyAttestationBundle(value, publicId);
    await ensureRegistrySchema();
    const db = getDb();
    const failure = await db.select().from(failures).where(eq(failures.publicId, publicId)).get();
    if (!failure) return Response.json({ error: 'Failure not found.' }, { status: 404 });
    if (failure.status === 'resolved') return Response.json({ error: 'This case is already resolved.' }, { status: 409 });
    const claimToken = request.headers.get('x-apatch-claim-token') ?? '';
    const claimTokenHash = claimToken ? await sha256(claimToken) : '';
    const claim = claimTokenHash ? await db.select().from(caseClaims).where(and(eq(caseClaims.failurePublicId, publicId), eq(caseClaims.claimTokenHash, claimTokenHash), eq(caseClaims.status, 'active'))).get() : null;
    if (!claim) return Response.json({ error: 'An active solver claim token is required.' }, { status: 403 });
    const artifact = await db.select({ id: failureArtifacts.id }).from(failureArtifacts).where(eq(failureArtifacts.failurePublicId, publicId)).get();
    if (!artifact) return Response.json({ error: 'Attach a privacy-safe reproduction before submitting a patch.' }, { status: 409 });
    const publicPatchId = `APS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const submittedAt = new Date().toISOString();
    await getD1().batch([
      getD1().prepare(`INSERT INTO patch_submissions (
        public_id, failure_public_id, patch_id, patch_name, spec_yaml, fixture_json,
        attestation_json, validator_public_key, signature, pass_rate_bps,
        verification_mode, independent_passed_cases, independent_total_cases, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registry_replay', ?, ?, 'verified', ?)`).bind(
        publicPatchId, publicId, bundle.payload.patch_id, bundle.payload.patch_name,
        bundle.spec_yaml, bundle.fixture_json, JSON.stringify(bundle.payload), JSON.stringify(bundle.public_key),
        bundle.signature, passRateBps, registryResult.passedCases, registryResult.totalCases, submittedAt,
      ),
      getD1().prepare("UPDATE failures SET status = 'resolved' WHERE public_id = ?").bind(publicId),
      getD1().prepare("UPDATE case_claims SET status = 'completed', completed_at = ? WHERE id = ?").bind(submittedAt, claim.id),
      getD1().prepare("UPDATE case_claims SET status = 'closed', completed_at = ? WHERE failure_public_id = ? AND status = 'active' AND id <> ?").bind(submittedAt, publicId, claim.id),
    ]);
    return Response.json({
      patch: {
        publicId: publicPatchId,
        patchId: bundle.payload.patch_id,
        patchName: bundle.payload.patch_name,
        passRateBps,
        verificationMode: 'registry_replay',
        independentPassedCases: registryResult.passedCases,
        independentTotalCases: registryResult.totalCases,
        status: 'verified',
        submittedAt,
      },
      failureStatus: 'resolved',
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The signed patch could not be verified.' }, { status: 422 });
  }
}

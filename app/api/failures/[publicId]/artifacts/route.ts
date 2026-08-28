import { and, eq } from 'drizzle-orm';
import { ensureRegistrySchema, getDb } from '@/db';
import { caseClaims, failureArtifacts, failures } from '@/db/schema';
import { hasResidualSensitiveValue, requestBodyTooLarge, sha256 } from '@/app/api/protocol';
import { allowWrite } from '@/app/api/rate-limit';

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  if (requestBodyTooLarge(request, 70_000)) return Response.json({ error: 'Artifacts are limited to 64 KB.' }, { status: 413 });
  const { publicId } = await context.params;
  let artifact: Record<string, unknown>;
  try { artifact = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: 'A valid JSON artifact is required.' }, { status: 400 }); }

  const contentJson = JSON.stringify(artifact);
  if (artifact.schema !== 'apatch/case/v0.1') return Response.json({ error: 'Use an apatch/case/v0.1 artifact.' }, { status: 422 });
  if (contentJson.length > 64_000) return Response.json({ error: 'Artifacts are limited to 64 KB.' }, { status: 413 });
  if (hasResidualSensitiveValue(contentJson)) return Response.json({ error: 'Residual personal data or credentials were detected. Run apatch scan locally first.' }, { status: 422 });
  if (!await allowWrite(request, 'artifact', 8)) return Response.json({ error: 'Too many artifact submissions. Try again next hour.' }, { status: 429 });

  try {
    await ensureRegistrySchema();
    const db = getDb();
    const failure = await db.select().from(failures).where(eq(failures.publicId, publicId)).get();
    if (!failure) {
      return Response.json({ error: 'Failure not found.' }, { status: 404 });
    }
    if (failure.status === 'resolved') return Response.json({ error: 'This case is already resolved.' }, { status: 409 });
    const claimToken = request.headers.get('x-apatch-claim-token') ?? '';
    const claimTokenHash = claimToken ? await sha256(claimToken) : '';
    const claim = claimTokenHash ? await db.select().from(caseClaims).where(and(eq(caseClaims.failurePublicId, publicId), eq(caseClaims.claimTokenHash, claimTokenHash), eq(caseClaims.status, 'active'))).get() : null;
    if (!claim) {
      return Response.json({ error: 'An active claim token is required to attach a reproduction.' }, { status: 403 });
    }
    if (await db.select({ id: failureArtifacts.id }).from(failureArtifacts).where(eq(failureArtifacts.failurePublicId, publicId)).get()) {
      return Response.json({ error: 'This failure already has a reproduction artifact.' }, { status: 409 });
    }
    const record = {
      publicId: `ART-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      failurePublicId: publicId,
      schema: 'apatch/case/v0.1',
      contentJson,
      contentHash: await sha256(contentJson),
      createdAt: new Date().toISOString(),
    };
    await db.insert(failureArtifacts).values(record);
    return Response.json({ artifact: { publicId: record.publicId, schema: record.schema, contentHash: record.contentHash, createdAt: record.createdAt } }, { status: 201 });
  } catch {
    return Response.json({ error: 'The reproduction artifact could not be saved.' }, { status: 500 });
  }
}

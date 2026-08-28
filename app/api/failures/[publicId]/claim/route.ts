import { and, desc, eq } from 'drizzle-orm';
import { ensureRegistrySchema, getDb } from '@/db';
import { caseClaims, failures } from '@/db/schema';
import { allowWrite } from '@/app/api/rate-limit';
import { hasResidualSensitiveValue, requestBodyTooLarge, sha256 } from '@/app/api/protocol';

function clean(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

function claimResponse(claim: typeof caseClaims.$inferSelect) {
  return {
    publicId: claim.publicId,
    solverName: claim.solverName,
    solverProfileUrl: claim.solverProfileUrl,
    identityStatus: claim.identityStatus,
    approach: claim.approach,
    status: claim.status,
    claimedAt: claim.claimedAt,
    completedAt: claim.completedAt,
  };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  try {
    await ensureRegistrySchema();
    const claims = await getDb().select().from(caseClaims).where(eq(caseClaims.failurePublicId, publicId)).orderBy(desc(caseClaims.claimedAt)).limit(20);
    return Response.json({ claims: claims.map(claimResponse) });
  } catch { return Response.json({ error: 'Claim status is temporarily unavailable.' }, { status: 503 }); }
}

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  if (requestBodyTooLarge(request, 4_096)) return Response.json({ error: 'Solver applications are limited to 4 KB.' }, { status: 413 });
  const { publicId } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: 'A valid claim is required.' }, { status: 400 }); }
  const solverName = clean(body.solverName, 40);
  const solverProfileUrl = clean(body.solverProfileUrl, 180);
  const approach = clean(body.approach, 320);
  let profile: URL;
  try { profile = new URL(solverProfileUrl); }
  catch { return Response.json({ error: 'Add a valid public profile URL.' }, { status: 422 }); }
  if (profile.protocol !== 'https:' || !profile.hostname.includes('.')) return Response.json({ error: 'Use a public HTTPS profile URL.' }, { status: 422 });
  if (solverName.length < 2 || approach.length < 20) return Response.json({ error: 'Add a solver name and a short implementation approach.' }, { status: 422 });
  if (hasResidualSensitiveValue(`${solverName} ${solverProfileUrl} ${approach}`)) return Response.json({ error: 'Do not include contact details or secrets in a public claim.' }, { status: 422 });
  if (!await allowWrite(request, 'claim', 3)) return Response.json({ error: 'Too many solver applications. Try again next hour.' }, { status: 429 });

  try {
    await ensureRegistrySchema();
    const db = getDb();
    const failure = await db.select().from(failures).where(eq(failures.publicId, publicId)).get();
    if (!failure) return Response.json({ error: 'Failure not found.' }, { status: 404 });
    if (failure.status === 'resolved') return Response.json({ error: 'This case is already resolved.' }, { status: 409 });
    const normalizedProfile = `${profile.protocol}//${profile.hostname.toLowerCase()}${profile.pathname.replace(/\/$/, '')}`;
    const duplicate = await db.select({ id: caseClaims.id }).from(caseClaims).where(and(eq(caseClaims.failurePublicId, publicId), eq(caseClaims.solverIdentityHash, await sha256(normalizedProfile)))).get();
    if (duplicate) return Response.json({ error: 'This public solver profile already has an application for the case.' }, { status: 409 });
    const claimToken = randomToken();
    const authenticatedUserId = request.headers.get('oai-authenticated-user-id')?.trim() ?? '';
    const record = {
      publicId: `CLAIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      failurePublicId: publicId,
      solverName,
      solverProfileUrl: normalizedProfile,
      solverIdentityHash: await sha256(normalizedProfile),
      identityStatus: authenticatedUserId ? 'site_authenticated' : 'public_profile',
      approach,
      status: 'active',
      claimTokenHash: await sha256(claimToken),
      claimedAt: new Date().toISOString(),
    };
    const [inserted] = await db.insert(caseClaims).values(record).returning();
    await db.update(failures).set({ status: 'claimed' }).where(eq(failures.publicId, publicId));
    return Response.json({ claim: claimResponse(inserted), claimToken, note: 'Solver applications do not lock a case; multiple teams may work in parallel.' }, { status: 201 });
  } catch { return Response.json({ error: 'The case could not be claimed.' }, { status: 500 }); }
}

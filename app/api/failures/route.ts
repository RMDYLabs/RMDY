import { desc } from 'drizzle-orm';
import { ensureRegistrySchema, getDb } from '@/db';
import { failures, type FailureRecord } from '@/db/schema';
import { allowWrite } from '@/app/api/rate-limit';
import { requestBodyTooLarge } from '@/app/api/protocol';

const runtimeValues = new Set(['OpenAI Agents SDK', 'LangGraph', 'Browser-use', 'Custom runtime']);
const sensitiveValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b|(?:\+?\d[\d ().-]{8,}\d)/i;

type FailureResponse = {
  publicId: string;
  title: string;
  observedBehavior: string;
  expectedBehavior: string;
  runtime: string;
  category: string;
  status: string;
  submittedAt: string;
};

function toResponse(record: FailureRecord): FailureResponse {
  return {
    publicId: record.publicId,
    title: record.title,
    observedBehavior: record.observedBehavior,
    expectedBehavior: record.expectedBehavior,
    runtime: record.runtime,
    category: record.category,
    status: record.status,
    submittedAt: record.submittedAt,
  };
}

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

export async function GET() {
  try {
    await ensureRegistrySchema();
    const records = await getDb().select().from(failures).orderBy(desc(failures.submittedAt)).limit(50);
    return Response.json({ failures: records.map(toResponse) });
  } catch {
    return Response.json({ error: 'Registry storage is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 8_192)) return Response.json({ error: 'Failure submissions are limited to 8 KB.' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'A valid JSON submission is required.' }, { status: 400 });
  }

  if (body.website) return new Response(null, { status: 204 });
  const title = cleanText(body.title, 100);
  const observedBehavior = cleanText(body.observedBehavior, 800);
  const expectedBehavior = cleanText(body.expectedBehavior, 800);
  const runtime = cleanText(body.runtime, 40);
  const privacyConfirmed = body.privacyConfirmed === true;

  if (title.length < 8 || observedBehavior.length < 20 || expectedBehavior.length < 20 || !runtimeValues.has(runtime) || !privacyConfirmed) {
    return Response.json({ error: 'Complete every field and confirm the privacy check.' }, { status: 422 });
  }
  if (sensitiveValue.test(`${title} ${observedBehavior} ${expectedBehavior}`)) {
    return Response.json({ error: 'Remove emails, phone numbers, credentials, and other sensitive values before submitting.' }, { status: 422 });
  }
  if (!await allowWrite(request, 'failure', 6)) return Response.json({ error: 'Too many submissions. Try again next hour.' }, { status: 429 });

  const publicId = `AP-F-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const submittedAt = new Date().toISOString();
  try {
    await ensureRegistrySchema();
    const inserted = await getDb().insert(failures).values({
      publicId,
      title,
      observedBehavior,
      expectedBehavior,
      runtime,
      category: 'COMMUNITY',
      status: 'open',
      submittedAt,
    }).returning();
    return Response.json({ failure: toResponse(inserted[0]) }, { status: 201 });
  } catch {
    return Response.json({ error: 'The failure could not be saved. Try again.' }, { status: 500 });
  }
}

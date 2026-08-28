import { ensureRegistrySchema, getD1 } from '@/db';
import { sha256 } from '@/app/api/protocol';

export async function allowWrite(request: Request, action: string, limit: number): Promise<boolean> {
  await ensureRegistrySchema();
  const address = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  const windowStart = new Date().toISOString().slice(0, 13);
  const bucket = (await sha256(`${address}|${windowStart}|rmdy-registry-v1`)).slice(0, 32);
  const result = await getD1().prepare(`INSERT INTO write_limits (bucket, action, count, window_start)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket, action) DO UPDATE SET count = count + 1
    RETURNING count`).bind(bucket, action, windowStart).first<{ count: number }>();
  return Boolean(result && result.count <= limit);
}

import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

let schemaReady: Promise<void> | null = null;

export function ensureRegistrySchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const d1 = getD1();
  schemaReady = (async () => {
    await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      observed_behavior TEXT NOT NULL,
      expected_behavior TEXT NOT NULL,
      runtime TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'COMMUNITY',
      status TEXT NOT NULL DEFAULT 'open',
      submitted_at TEXT NOT NULL
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_failures_submitted_at ON failures (submitted_at)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_failures_status_submitted_at ON failures (status, submitted_at)'),
    d1.prepare(`CREATE TABLE IF NOT EXISTS failure_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      failure_public_id TEXT NOT NULL UNIQUE REFERENCES failures(public_id) ON DELETE CASCADE,
      schema TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS patch_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      failure_public_id TEXT NOT NULL REFERENCES failures(public_id) ON DELETE CASCADE,
      patch_id TEXT NOT NULL,
      patch_name TEXT NOT NULL,
      spec_yaml TEXT NOT NULL,
      fixture_json TEXT NOT NULL,
      attestation_json TEXT NOT NULL,
      validator_public_key TEXT NOT NULL,
      signature TEXT NOT NULL,
      pass_rate_bps INTEGER NOT NULL,
      verification_mode TEXT NOT NULL DEFAULT 'registry_replay',
      independent_passed_cases INTEGER NOT NULL DEFAULT 0,
      independent_total_cases INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'verified',
      submitted_at TEXT NOT NULL
    )`),
      d1.prepare('CREATE INDEX IF NOT EXISTS idx_patch_submissions_failure_status_submitted ON patch_submissions (failure_public_id, status, submitted_at)'),
    d1.prepare(`CREATE TABLE IF NOT EXISTS case_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      failure_public_id TEXT NOT NULL REFERENCES failures(public_id) ON DELETE CASCADE,
      solver_name TEXT NOT NULL,
      solver_profile_url TEXT NOT NULL DEFAULT '',
      solver_identity_hash TEXT NOT NULL DEFAULT '',
      identity_status TEXT NOT NULL DEFAULT 'profile_submitted',
      approach TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      claim_token_hash TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS bounty_pledges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      failure_public_id TEXT NOT NULL REFERENCES failures(public_id) ON DELETE CASCADE,
      sponsor_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDT_SOL',
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      created_at TEXT NOT NULL
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_bounty_pledges_failure_status_created ON bounty_pledges (failure_public_id, status, created_at)'),
    d1.prepare(`UPDATE bounty_pledges SET currency = 'USDT_SOL', status = 'proposed'
      WHERE currency = 'APATCH_CREDITS' OR status = 'pledged'`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS write_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL,
      action TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      window_start TEXT NOT NULL
    )`),
    d1.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_write_limits_bucket_action ON write_limits (bucket, action)'),
    d1.prepare(`INSERT OR IGNORE INTO case_claims (
      public_id, failure_public_id, solver_name, approach, status, claim_token_hash, claimed_at, completed_at
    ) SELECT
      'CLAIM-' || SUBSTR(public_id, 5), failure_public_id, 'RMDY Core Team',
      'Built and regression-tested the first declarative patch for this failure.',
      'completed', '', submitted_at, submitted_at
    FROM patch_submissions`),
    d1.prepare(`UPDATE case_claims SET solver_name = 'RMDY Core Team'
      WHERE solver_name IN ('Agent Patch Core Team', 'FaultMesh Core Team')`),
      d1.prepare(`UPDATE failures SET status = 'resolved'
        WHERE EXISTS (SELECT 1 FROM patch_submissions WHERE patch_submissions.failure_public_id = failures.public_id AND patch_submissions.status = 'verified')`),
    ]);

    // Sites persists D1 between versions. CREATE TABLE IF NOT EXISTS does not add
    // columns to an older table, so upgrade the alpha schema in place before any
    // route relies on the new verification and solver identity fields.
    const claimColumns = new Set(
      ((await d1.prepare('PRAGMA table_info(case_claims)').all<{ name: string }>()).results ?? []).map((column) => column.name),
    );
    const patchColumns = new Set(
      ((await d1.prepare('PRAGMA table_info(patch_submissions)').all<{ name: string }>()).results ?? []).map((column) => column.name),
    );
    const upgrades: D1PreparedStatement[] = [];
    if (!claimColumns.has('solver_profile_url')) upgrades.push(d1.prepare("ALTER TABLE case_claims ADD COLUMN solver_profile_url TEXT NOT NULL DEFAULT ''"));
    if (!claimColumns.has('solver_identity_hash')) upgrades.push(d1.prepare("ALTER TABLE case_claims ADD COLUMN solver_identity_hash TEXT NOT NULL DEFAULT ''"));
    if (!claimColumns.has('identity_status')) upgrades.push(d1.prepare("ALTER TABLE case_claims ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'profile_submitted'"));
    if (!patchColumns.has('verification_mode')) upgrades.push(d1.prepare("ALTER TABLE patch_submissions ADD COLUMN verification_mode TEXT NOT NULL DEFAULT 'registry_replay'"));
    if (!patchColumns.has('independent_passed_cases')) upgrades.push(d1.prepare('ALTER TABLE patch_submissions ADD COLUMN independent_passed_cases INTEGER NOT NULL DEFAULT 0'));
    if (!patchColumns.has('independent_total_cases')) upgrades.push(d1.prepare('ALTER TABLE patch_submissions ADD COLUMN independent_total_cases INTEGER NOT NULL DEFAULT 0'));
    if (upgrades.length) await d1.batch(upgrades);

    await d1.batch([
      d1.prepare('DROP INDEX IF EXISTS case_claims_failure_public_id_unique'),
      d1.prepare('CREATE INDEX IF NOT EXISTS idx_case_claims_failure_status_claimed ON case_claims (failure_public_id, status, claimed_at)'),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

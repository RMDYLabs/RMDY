import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
const migrationsDirectory = new URL('../drizzle/', import.meta.url);
const migrationFiles = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
for (const name of migrationFiles) {
  if (name.startsWith('0003_')) {
    database.exec(`INSERT INTO failures (public_id, title, observed_behavior, expected_behavior, runtime, category, status, submitted_at)
      VALUES ('AP-F-USDTTEST', 'Legacy bounty', 'Old credit pledge', 'USDT proposal', 'test', 'TEST', 'open', '2026-01-01T00:00:00.000Z')`);
    database.exec(`INSERT INTO bounty_pledges (public_id, failure_public_id, sponsor_name, amount, currency, note, status, created_at)
      VALUES ('BNT-LEGACY', 'AP-F-USDTTEST', 'Legacy sponsor', 500, 'APATCH_CREDITS', '', 'pledged', '2026-01-01T00:00:00.000Z')`);
  }
  const migration = await readFile(new URL(name, migrationsDirectory), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) database.exec(statement);
}
database.exec('PRAGMA optimize');

const indexes = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'failures'").all();
const indexNames = new Set(indexes.map((index) => index.name));
assert.ok(indexNames.has('failures_public_id_unique'));
assert.ok(indexNames.has('idx_failures_submitted_at'));
assert.ok(indexNames.has('idx_failures_status_submitted_at'));

const plan = database.prepare('EXPLAIN QUERY PLAN SELECT * FROM failures WHERE status = ? ORDER BY submitted_at DESC LIMIT 50').all('open');
assert.ok(plan.some((step) => String(step.detail).includes('idx_failures_status_submitted_at')));

const artifactIndexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'failure_artifacts'").all().map((index) => index.name));
assert.ok(artifactIndexes.has('failure_artifacts_public_id_unique'));
assert.ok(artifactIndexes.has('failure_artifacts_failure_public_id_unique'));

const patchIndexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'patch_submissions'").all().map((index) => index.name));
assert.ok(patchIndexes.has('patch_submissions_public_id_unique'));
assert.ok(patchIndexes.has('idx_patch_submissions_failure_status_submitted'));
const patchPlan = database.prepare('EXPLAIN QUERY PLAN SELECT * FROM patch_submissions WHERE failure_public_id = ? AND status = ? ORDER BY submitted_at DESC LIMIT 20').all('AP-F-TEST', 'verified');
assert.ok(patchPlan.some((step) => String(step.detail).includes('idx_patch_submissions_failure_status_submitted')));

const claimIndexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'case_claims'").all().map((index) => index.name));
assert.ok(claimIndexes.has('idx_case_claims_failure_status_claimed'));
const claimPlan = database.prepare('EXPLAIN QUERY PLAN SELECT * FROM case_claims WHERE failure_public_id = ? AND status = ? ORDER BY claimed_at DESC LIMIT 20').all('AP-F-TEST', 'active');
assert.ok(claimPlan.some((step) => String(step.detail).includes('idx_case_claims_failure_status_claimed')));
const claimColumns = database.prepare("PRAGMA table_info('case_claims')").all();
assert.ok(claimColumns.some((column) => column.name === 'solver_profile_url'));
assert.ok(claimColumns.some((column) => column.name === 'identity_status'));
const patchColumns = database.prepare("PRAGMA table_info('patch_submissions')").all();
assert.equal(patchColumns.find((column) => column.name === 'verification_mode')?.dflt_value, "'registry_replay'");
assert.ok(patchColumns.some((column) => column.name === 'independent_total_cases'));
const bountyIndexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'bounty_pledges'").all().map((index) => index.name));
assert.ok(bountyIndexes.has('idx_bounty_pledges_failure_status_created'));
const bountyPlan = database.prepare('EXPLAIN QUERY PLAN SELECT * FROM bounty_pledges WHERE failure_public_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50').all('AP-F-TEST', 'proposed');
assert.ok(bountyPlan.some((step) => String(step.detail).includes('idx_bounty_pledges_failure_status_created')));
const bountyColumns = database.prepare("PRAGMA table_info('bounty_pledges')").all();
assert.equal(bountyColumns.find((column) => column.name === 'currency')?.dflt_value, "'USDT_SOL'");
assert.equal(bountyColumns.find((column) => column.name === 'status')?.dflt_value, "'proposed'");
const convertedBounty = database.prepare("SELECT currency, status FROM bounty_pledges WHERE public_id = 'BNT-LEGACY'").get();
assert.equal(convertedBounty.currency, 'USDT_SOL');
assert.equal(convertedBounty.status, 'proposed');
const limitIndexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'write_limits'").all().map((index) => index.name));
assert.ok(limitIndexes.has('idx_write_limits_bucket_action'));

console.log(`Registry schema verified across ${migrationFiles.length} migrations; feed, bounty, parallel claims, and registry-replayed patch evidence are ready.`);

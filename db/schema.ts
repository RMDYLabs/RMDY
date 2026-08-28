import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const failures = sqliteTable(
  'failures',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique(),
    title: text('title').notNull(),
    observedBehavior: text('observed_behavior').notNull(),
    expectedBehavior: text('expected_behavior').notNull(),
    runtime: text('runtime').notNull(),
    category: text('category').notNull().default('COMMUNITY'),
    status: text('status').notNull().default('open'),
    submittedAt: text('submitted_at').notNull(),
  },
  (table) => [
    index('idx_failures_submitted_at').on(table.submittedAt),
    index('idx_failures_status_submitted_at').on(table.status, table.submittedAt),
  ],
);

export const failureArtifacts = sqliteTable(
  'failure_artifacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique(),
    failurePublicId: text('failure_public_id').notNull().unique().references(() => failures.publicId, { onDelete: 'cascade' }),
    schema: text('schema').notNull(),
    contentJson: text('content_json').notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
);

export const patchSubmissions = sqliteTable(
  'patch_submissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique(),
    failurePublicId: text('failure_public_id').notNull().references(() => failures.publicId, { onDelete: 'cascade' }),
    patchId: text('patch_id').notNull(),
    patchName: text('patch_name').notNull(),
    specYaml: text('spec_yaml').notNull(),
    fixtureJson: text('fixture_json').notNull(),
    attestationJson: text('attestation_json').notNull(),
    validatorPublicKey: text('validator_public_key').notNull(),
    signature: text('signature').notNull(),
    passRateBps: integer('pass_rate_bps').notNull(),
    verificationMode: text('verification_mode').notNull().default('registry_replay'),
    independentPassedCases: integer('independent_passed_cases').notNull().default(0),
    independentTotalCases: integer('independent_total_cases').notNull().default(0),
    status: text('status').notNull().default('verified'),
    submittedAt: text('submitted_at').notNull(),
  },
  (table) => [
    index('idx_patch_submissions_failure_status_submitted').on(table.failurePublicId, table.status, table.submittedAt),
  ],
);

export const caseClaims = sqliteTable(
  'case_claims',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique(),
    failurePublicId: text('failure_public_id').notNull().references(() => failures.publicId, { onDelete: 'cascade' }),
    solverName: text('solver_name').notNull(),
    solverProfileUrl: text('solver_profile_url').notNull().default(''),
    solverIdentityHash: text('solver_identity_hash').notNull().default(''),
    identityStatus: text('identity_status').notNull().default('profile_submitted'),
    approach: text('approach').notNull(),
    status: text('status').notNull().default('active'),
    claimTokenHash: text('claim_token_hash').notNull(),
    claimedAt: text('claimed_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [index('idx_case_claims_failure_status_claimed').on(table.failurePublicId, table.status, table.claimedAt)],
);

export const bountyPledges = sqliteTable(
  'bounty_pledges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique(),
    failurePublicId: text('failure_public_id').notNull().references(() => failures.publicId, { onDelete: 'cascade' }),
    sponsorName: text('sponsor_name').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('USDT_SOL'),
    note: text('note').notNull(),
    status: text('status').notNull().default('proposed'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_bounty_pledges_failure_status_created').on(table.failurePublicId, table.status, table.createdAt)],
);

export const writeLimits = sqliteTable(
  'write_limits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bucket: text('bucket').notNull(),
    action: text('action').notNull(),
    count: integer('count').notNull().default(1),
    windowStart: text('window_start').notNull(),
  },
  (table) => [uniqueIndex('idx_write_limits_bucket_action').on(table.bucket, table.action)],
);

export type FailureRecord = typeof failures.$inferSelect;
export type NewFailureRecord = typeof failures.$inferInsert;
export type FailureArtifactRecord = typeof failureArtifacts.$inferSelect;
export type PatchSubmissionRecord = typeof patchSubmissions.$inferSelect;
export type CaseClaimRecord = typeof caseClaims.$inferSelect;
export type BountyPledgeRecord = typeof bountyPledges.$inferSelect;

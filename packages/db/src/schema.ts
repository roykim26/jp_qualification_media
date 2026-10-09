import {
  pgEnum,
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const factStatus = pgEnum('fact_status', [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'superseded',
  'withdrawn',
]);
export const riskLevel = pgEnum('risk_level', [
  'low',
  'medium',
  'high',
  'critical',
]);
export const factValueType = pgEnum('fact_value_type', [
  'date',
  'datetime',
  'money',
  'integer',
  'decimal',
  'text',
  'boolean',
  'json',
]);
export const eventType = pgEnum('event_type', [
  'application_open',
  'application_deadline',
  'exam_date',
  'result_date',
  'fee_change',
  'eligibility_change',
  'schedule_change',
  'system_change',
]);

export const qualifications = pgTable('qualifications', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  officialNameJa: text('official_name_ja').notNull(),
  aliasesJa: jsonb('aliases_ja').$type<string[]>().notNull(),
  field: text('field').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const institutions = pgTable('institutions', {
  id: text('id').primaryKey(),
  nameJa: text('name_ja').notNull(),
  official: boolean('official').notNull().default(true),
});
export const sources = pgTable(
  'sources',
  {
    id: text('id').primaryKey(),
    institutionId: text('institution_id')
      .notNull()
      .references(() => institutions.id),
    canonicalUrl: text('canonical_url').notNull(),
    allowedDomain: text('allowed_domain').notNull(),
    sourceType: text('source_type').notNull(),
    active: boolean('active').notNull().default(true),
    qualificationId: text('qualification_id').references(
      () => qualifications.id,
    ),
    contentScope: text('content_scope'),
    updateCycle: text('update_cycle'),
    parserAdapter: text('parser_adapter'),
    defaultRisk: riskLevel('default_risk'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('sources_url_idx').on(t.canonicalUrl)],
);
export const sourceScopes = pgTable(
  'source_scopes',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    qualificationId: text('qualification_id')
      .notNull()
      .references(() => qualifications.id),
    providerId: text('provider_id'),
    examLevelId: text('exam_level_id'),
    examComponent: text('exam_component'),
    deliveryMode: text('delivery_mode'),
    paymentMethod: text('payment_method'),
    contentScope: text('content_scope').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('source_scopes_unique_dimensions_idx').on(
      t.sourceId,
      t.qualificationId,
      t.providerId,
      t.examLevelId,
      t.examComponent,
      t.deliveryMode,
      t.paymentMethod,
    ),
  ],
);
export const captureRuns = pgTable('capture_runs', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  errorType: text('error_type'),
  errorMessage: text('error_message'),
  collectorVersion: text('collector_version'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const snapshots = pgTable(
  'snapshots',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    contentHash: text('content_hash').notNull(),
    objectKey: text('object_key').notNull(),
    synthetic: boolean('synthetic').notNull().default(false),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
    captureRunId: text('capture_run_id').references(() => captureRuns.id),
    originalUrl: text('original_url'),
    finalUrl: text('final_url'),
    httpStatus: integer('http_status'),
    retrievedAtJst: timestamp('retrieved_at_jst', { withTimezone: true }),
    title: text('title'),
    etag: text('etag'),
    lastModified: text('last_modified'),
    responseHeaders: jsonb('response_headers').$type<Record<string, string>>(),
    textVersion: text('text_version'),
    collectorVersion: text('collector_version'),
  },
  (t) => [
    uniqueIndex('snapshot_idempotency_idx').on(t.sourceId, t.contentHash),
  ],
);
export const sourceChecks = pgTable(
  'source_checks',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    captureRunId: text('capture_run_id').references(() => captureRuns.id),
    snapshotId: text('snapshot_id').references(() => snapshots.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('source_checks_latest_idx').on(t.sourceId, t.checkedAt)],
);
export const candidateFacts = pgTable(
  'candidate_facts',
  {
    id: text('id').primaryKey(),
    qualificationId: text('qualification_id')
      .notNull()
      .references(() => qualifications.id),
    examLevelId: text('exam_level_id'),
    providerId: text('provider_id'),
    examComponent: text('exam_component'),
    deliveryMode: text('delivery_mode'),
    paymentMethod: text('payment_method'),
    examYear: integer('exam_year').notNull(),
    factKey: text('fact_key').notNull(),
    valueType: factValueType('value_type').notNull(),
    normalizedValue: jsonb('normalized_value').notNull(),
    displayValue: text('display_value').notNull(),
    evidenceText: text('evidence_text'),
    status: factStatus('status').notNull().default('pending_review'),
    riskLevel: riskLevel('risk_level').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    sourceSnapshotId: text('source_snapshot_id')
      .notNull()
      .references(() => snapshots.id),
    synthetic: boolean('synthetic').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('candidate_idempotency_idx').on(
      t.sourceSnapshotId,
      t.qualificationId,
      t.providerId,
      t.examLevelId,
      t.examComponent,
      t.deliveryMode,
      t.paymentMethod,
      t.examYear,
      t.factKey,
    ),
  ],
);
export const factRevisions = pgTable(
  'fact_revisions',
  {
    id: text('id').primaryKey(),
    candidateFactId: text('candidate_fact_id')
      .notNull()
      .references(() => candidateFacts.id),
    status: factStatus('status').notNull(),
    normalizedValue: jsonb('normalized_value').notNull(),
    displayValue: text('display_value').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (t) => [uniqueIndex('revision_idempotency_idx').on(t.idempotencyKey)],
);
export const facts = pgTable(
  'facts',
  {
    id: text('id').primaryKey(),
    qualificationId: text('qualification_id')
      .notNull()
      .references(() => qualifications.id),
    examLevelId: text('exam_level_id'),
    providerId: text('provider_id'),
    examComponent: text('exam_component'),
    deliveryMode: text('delivery_mode'),
    paymentMethod: text('payment_method'),
    examYear: integer('exam_year').notNull(),
    factKey: text('fact_key').notNull(),
    currentRevisionId: text('current_revision_id').references(
      () => factRevisions.id,
    ),
    status: factStatus('status').notNull().default('draft'),
  },
  (t) => [
    uniqueIndex('facts_current_key_idx').on(
      t.qualificationId,
      t.providerId,
      t.examLevelId,
      t.examComponent,
      t.deliveryMode,
      t.paymentMethod,
      t.examYear,
      t.factKey,
    ),
  ],
);
export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(),
  candidateFactId: text('candidate_fact_id')
    .notNull()
    .references(() => candidateFacts.id),
  decision: text('decision').notNull(),
  reviewerId: text('reviewer_id').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const factRetractions = pgTable('fact_retractions', {
  id: text('id').primaryKey(),
  factId: text('fact_id')
    .notNull()
    .references(() => facts.id)
    .unique(),
  rejectedCandidateId: text('rejected_candidate_id')
    .notNull()
    .references(() => candidateFacts.id)
    .unique(),
  reviewerId: text('reviewer_id').notNull(),
  reason: text('reason').notNull(),
  retractedAt: timestamp('retracted_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const conflicts = pgTable('conflicts', {
  id: text('id').primaryKey(),
  candidateFactId: text('candidate_fact_id')
    .notNull()
    .references(() => candidateFacts.id),
  otherSourceId: text('other_source_id')
    .notNull()
    .references(() => sources.id),
  status: text('status').notNull().default('open'),
  details: jsonb('details').notNull(),
});
export const changeEvents = pgTable('change_events', {
  id: text('id').primaryKey(),
  factId: text('fact_id')
    .notNull()
    .references(() => facts.id),
  eventType: eventType('event_type').notNull(),
  previousRevisionId: text('previous_revision_id'),
  newRevisionId: text('new_revision_id').notNull(),
  affectedPages: jsonb('affected_pages').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

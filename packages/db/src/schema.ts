import {
  pgEnum,
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
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
  },
  (t) => [uniqueIndex('sources_url_idx').on(t.canonicalUrl)],
);
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
  },
  (t) => [
    uniqueIndex('snapshot_idempotency_idx').on(t.sourceId, t.contentHash),
  ],
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

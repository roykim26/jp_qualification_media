function canonicalHttpsUrl(url, allowedDomain) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === String(allowedDomain).toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Converts one approved-fact provenance row into a value-free audit result.
 * Candidate values and evidence are intentionally excluded from this shape.
 */
export function auditProvenanceRow(row) {
  const issues = [];
  if (!canonicalHttpsUrl(row.canonical_url, row.allowed_domain))
    issues.push('canonical_url_not_allowed_https');
  if (!row.source_snapshot_id || !row.snapshot_id)
    issues.push('snapshot_missing');
  if (row.snapshot_source_id !== row.source_id)
    issues.push('snapshot_source_mismatch');
  if (row.snapshot_synthetic) issues.push('synthetic_snapshot');
  if (!row.content_hash) issues.push('snapshot_hash_missing');
  if (!row.object_key || row.object_key.startsWith('ci://'))
    issues.push('snapshot_not_real');
  if (row.latest_review_decision !== 'approve')
    issues.push('final_review_not_approved');
  if (!row.latest_review_at) issues.push('review_timestamp_missing');

  return {
    factId: row.fact_id,
    qualificationSlug: row.qualification_slug,
    sourceId: row.source_id,
    sourceSnapshotId: row.source_snapshot_id,
    issues,
  };
}

export function summarizeProvenanceAudit(rows) {
  const facts = rows.map(auditProvenanceRow);
  const issueCounts = {};
  for (const fact of facts)
    for (const issue of fact.issues)
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
  return {
    status: facts.some((fact) => fact.issues.length) ? 'blocked' : 'passed',
    totalFacts: facts.length,
    passedFacts: facts.filter((fact) => !fact.issues.length).length,
    blockedFacts: facts.filter((fact) => fact.issues.length).length,
    issueCounts,
    facts,
  };
}

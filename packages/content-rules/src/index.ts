import { highRiskFactKeys } from '../../schema/src/index.js';

export type Role =
  'collector' | 'validator' | 'reviewer' | 'publisher' | 'public' | 'ai';
export type Resource =
  | 'snapshot'
  | 'candidate_fact'
  | 'review'
  | 'fact'
  | 'revision'
  | 'change_event';

const permissions: Record<Role, ReadonlySet<Resource>> = {
  collector: new Set(['snapshot', 'candidate_fact']),
  validator: new Set(['snapshot', 'candidate_fact', 'review']),
  reviewer: new Set([
    'snapshot',
    'candidate_fact',
    'review',
    'fact',
    'revision',
    'change_event',
  ]),
  publisher: new Set(['fact', 'revision', 'change_event']),
  public: new Set(),
  ai: new Set(),
};

export function canWrite(role: Role, resource: Resource): boolean {
  return permissions[role].has(resource);
}

export function changedTargetFields(changedFields: string[]): string[] {
  return changedFields.filter(
    (field) =>
      field !== 'navigation' &&
      field !== 'footer' &&
      field !== 'copyright' &&
      field !== 'css' &&
      field !== 'script',
  );
}

export function requiresReview(
  factKey: string,
  riskLevel: string,
  hasSourceSnapshot: boolean,
): boolean {
  return (
    !hasSourceSnapshot ||
    riskLevel === 'high' ||
    riskLevel === 'critical' ||
    highRiskFactKeys.has(factKey)
  );
}

/** Presentation groups only. These never change a finding's saved verification or category. */
export type ResultDomain = 'functional' | 'security' | 'seo' | 'ux' | 'other';
export type ResultFinding = {
  id: string; title: string; category: string; verification: string;
  rule_id?: string | null; rule_source?: string | null; impact?: string; lifecycle?: string | null;
};
type Rule = { id: string; text: string; source?: string };
export const RESULT_DOMAINS: { key: ResultDomain; label: string; description: string }[] = [
  { key: 'functional', label: 'Functionality', description: 'Forms, saved changes and workflow behavior' },
  { key: 'security', label: 'Security', description: 'Access boundaries, data exposure and configuration' },
  { key: 'seo', label: 'SEO', description: 'Search visibility and page metadata' },
  { key: 'ux', label: 'UI/UX', description: 'Layout, accessibility and mobile usability' },
  { key: 'other', label: 'Other findings', description: 'Results without a recognized category rule' },
];

export function resultDomain(f: ResultFinding, rules: Rule[]): ResultDomain {
  const rule = rules.find(r => r.id === f.rule_id);
  // Owner rule IDs can overlap the baseline. Never infer a baseline meaning from an ID alone.
  if (rule?.source === 'baseline') {
    if (['B3', 'B4', 'B7', 'B9'].includes(rule.id)) return 'security';
    if (rule.id === 'B5') return 'ux';
    if (['B1', 'B2', 'B6', 'B8', 'B10', 'B11'].includes(rule.id)) return 'functional';
  }
  // Existing header instrumentation has no rule ID. This is a configuration observation,
  // never an exploit or a new security assertion.
  if (f.category === 'configuration_observation' && f.title === 'No Content-Security-Policy on HTML pages') return 'security';
  if (rule) {
    if (/\b(?:SEO|canonical URL|meta description|search engine|robots\.txt|sitemap)\b/i.test(rule.text)) return 'seo';
    if (/\b(?:accessibility|screen reader|keyboard navigation|contrast|mobile|phone|overlap|viewport)\b/i.test(rule.text)) return 'ux';
    if (/\b(?:unauthorized|permission|private records|security|cross.site scripting)\b/i.test(rule.text)) return 'security';
  }
  return 'other';
}

/** A finding that counts as a verified issue: the category and the saved verification must both say so. */
export const isVerifiedIssue = (f: { category: string; verification: string }) => f.category === 'verified_issue' && f.verification === 'verified';

export function resultCounts(findings: ResultFinding[]) {
  return {
    verified: findings.filter(isVerifiedIssue).length,
    review: findings.filter(f => f.category === 'needs_review').length,
    observations: findings.filter(f => f.category === 'configuration_observation').length,
    suggestions: findings.filter(f => f.category === 'suggestion').length,
  };
}

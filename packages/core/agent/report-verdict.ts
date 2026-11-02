export type ReportVerificationResult = {
  candidateIndex: number;
  reportMatch?: boolean;
  findingId: string;
  title: string;
  impact: 'high' | 'medium' | 'low';
  verification: 'verified' | 'dismissed' | 'inconclusive' | 'candidate';
  category: 'verified_issue' | 'needs_review';
};

export type ReportRunCounts = { actions: number; pages: number; candidates: number };
export type ReportVerdict =
  | { verdict: 'reproduced'; findingId: string; title: string }
  | ({ verdict: 'not_reproduced'; text: string } & ReportRunCounts);

/** Trusted report result derived only from candidate-to-finding links created during verification. */
export function computeReportVerdict(results: readonly ReportVerificationResult[], counts: ReportRunCounts, verificationRan: boolean): ReportVerdict {
  const impactRank = { high: 0, medium: 1, low: 2 } as const;
  const match = results
    .filter((r) => r.reportMatch === true && r.verification === 'verified' && r.category === 'verified_issue')
    .sort((a, b) => impactRank[a.impact] - impactRank[b.impact] || a.candidateIndex - b.candidateIndex)[0];
  if (match) return { verdict: 'reproduced', findingId: match.findingId, title: match.title };
  return {
    verdict: 'not_reproduced',
    text: verificationRan ? 'Not reproduced within the tested scope' : 'Not reproduced: the run ended before verification',
    ...counts,
  };
}

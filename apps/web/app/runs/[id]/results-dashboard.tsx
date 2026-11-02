'use client';
import { useState } from 'react';
import { Icon, type IconName } from '@/ui/icons';
import { StatusBadge, findingStatus } from '@/ui/status';
import { RESULT_DOMAINS, resultCounts, resultDomain, type ResultDomain, type ResultFinding } from './results-data';

const ICONS: Record<ResultDomain, IconName> = { functional: 'workflow', security: 'shield', seo: 'globe', ux: 'desktop', other: 'list' };
type Props = {
  status: string; reason?: string; findings: ResultFinding[];
  rules: { id: string; text: string; source?: string }[];
  states: { route: string; device: string }[];
  coverage?: { exercised: number; total: number; outcomeChecked?: number; blocked: number } | null;
  discovery?: { pendingRoutes: number; pendingControls: number; excluded: number } | null;
  onSelectFinding: (id: string) => void; onOpenCoverage: () => void;
};

export function ResultsDashboard({ status, reason, findings, rules, states, coverage, discovery, onSelectFinding, onOpenCoverage }: Props) {
  const [filter, setFilter] = useState<ResultDomain | 'all'>('all');
  const totals = resultCounts(findings);
  const grouped = RESULT_DOMAINS.map(domain => ({ ...domain, findings: findings.filter(f => resultDomain(f, rules) === domain.key) }));
  const visible = filter === 'all' ? findings : grouped.find(d => d.key === filter)!.findings;
  const mobile = states.some(s => s.device === 'mobile');
  return <section className="results-dashboard" aria-label="Results dashboard">
    <div className="card">
      <div className="card-header"><h1 className="h2"><Icon name="report" /> Run results</h1><StatusBadge value={status} /></div>
      <div className="results-intro">
        <p>{status === 'completed' ? 'Results from the tested scope.' : 'Partial results. This run did not complete its exploration.'}{reason ? ` Reason: ${reason.replace(/_/g, ' ')}.` : ''}</p>
        <div className="results-totals">
          <div><strong>{totals.verified}</strong><span>Verified issues</span></div>
          <div><strong>{totals.review}</strong><span>Needs review</span></div>
          <div><strong>{totals.observations}</strong><span>Configuration observations</span></div>
          <div><strong>{totals.suggestions}</strong><span>Suggestions</span></div>
        </div>
        <p className="muted">Categories organize saved findings. Zero findings is not a pass; no overall or category score is calculated.</p>
      </div>
    </div>
    <div className="results-categories" role="group" aria-label="Result categories">
      {grouped.map(domain => {
        const counts = resultCounts(domain.findings);
        return <button key={domain.key} className="card result-category" aria-pressed={filter === domain.key} onClick={() => setFilter(domain.key)}>
          <span className="result-category-title"><Icon name={ICONS[domain.key]} />{domain.label}<strong>{domain.findings.length}</strong></span>
          <span className="muted">{domain.description}</span>
          <span>{domain.findings.length ? `${counts.verified} verified · ${counts.review} review · ${counts.observations} observations · ${counts.suggestions} suggestions` : 'No findings recorded. Category coverage is not established.'}</span>
        </button>;
      })}
    </div>
    <div className="card">
      <div className="card-header"><h2 className="h3">{filter === 'all' ? 'All findings' : grouped.find(d => d.key === filter)!.label}</h2><span className="count">{visible.length}</span><button className="btn btn-ghost btn-sm" onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>All categories</button></div>
      {visible.length ? <ul className="results-findings">{visible.map(f => <li key={f.id}><button onClick={() => onSelectFinding(f.id)}><span><strong>{f.title}</strong><span className="muted">{RESULT_DOMAINS.find(d => d.key === resultDomain(f, rules))!.label}{f.impact ? ` · ${f.impact} impact` : ''}</span></span><StatusBadge value={findingStatus({ ...f, lifecycle: f.lifecycle ?? null })} /><Icon name="chevron" /></button></li>)}</ul>
        : <p className="results-intro muted">No findings recorded here. This does not establish that the category was tested or passed.</p>}
    </div>
    <div className="card">
      <div className="card-header"><h2 className="h3"><Icon name="pointer" /> Coverage and gaps</h2><button className="btn btn-sm" onClick={onOpenCoverage}>View coverage</button></div>
      <div className="results-intro">
        <p><strong>{new Set(states.map(s => s.route)).size} paths reached</strong> · {states.length} saved states · {mobile ? 'Mobile states recorded' : 'No mobile states recorded'}</p>
        {coverage ? <p>{coverage.exercised} of {coverage.total} observed controls exercised · {coverage.outcomeChecked ?? 0} outcome checks · {coverage.blocked} controls blocked by policy.</p> : <p>No control coverage recorded.</p>}
        {discovery ? <p>{discovery.pendingRoutes} discovered routes and {discovery.pendingControls} controls still pending · {discovery.excluded} entries excluded by contract.</p> : <p>No discovery backlog recorded.</p>}
        <p className="muted">Reached pages and successful clicks do not establish correct behavior. SEO and UI/UX need their own recorded checks; this dashboard does not run additional audits.</p>
      </div>
    </div>
  </section>;
}

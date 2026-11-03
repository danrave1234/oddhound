'use client';
import { useState } from 'react';
import { Icon, type IconName } from '@/ui/icons';
import { copyText } from '@/ui/copy';
import { StatusBadge, findingStatus } from '@/ui/status';
import type { ReportVerdict, Comparison } from '@/lib/run-data';
import { checklistMarkdown, type GapItem } from '@core/reports/gaps.ts';
import { RESULT_DOMAINS, resultCounts, resultDomain, type ResultDomain, type ResultFinding } from './results-data';

const ICONS: Record<ResultDomain, IconName> = { functional: 'workflow', security: 'shield', seo: 'globe', ux: 'desktop', other: 'list' };
type Props = {
  status: string; reason?: string; findings: ResultFinding[];
  report?: string | null; reportVerdict?: ReportVerdict | null;
  rules: { id: string; text: string; source?: string }[];
  states: { route: string; device: string }[];
  coverage?: { exercised: number; total: number; outcomeChecked?: number; blocked: number } | null;
  discovery?: { pendingRoutes: number; pendingControls: number; excluded: number } | null;
  comparison?: Comparison | null; gaps?: GapItem[]; origin?: string; runId?: string;
  onSelectFinding: (id: string) => void; onOpenCoverage: () => void;
};

export function ResultsDashboard({ status, reason, report, reportVerdict, findings, rules, states, coverage, discovery, comparison, gaps = [], origin = '', runId = '', onSelectFinding, onOpenCoverage }: Props) {
  const [filter, setFilter] = useState<ResultDomain | 'all'>('all');
  const [listState, setListState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const changeCounts = comparison ? Object.values(comparison.changes).reduce((n, c) => ({ ...n, [c]: n[c] + 1 }), { new: 0, repeat: 0 }) : null;
  async function copyChecklist() {
    const text = checklistMarkdown(gaps, { origin, runUrl: `${window.location.origin}/runs/${runId}` });
    setListState(await copyText(text));
  }
  const totals = resultCounts(findings);
  const grouped = RESULT_DOMAINS.map(domain => ({ ...domain, findings: findings.filter(f => resultDomain(f, rules) === domain.key) }));
  const visible = filter === 'all' ? findings : grouped.find(d => d.key === filter)!.findings;
  const mobile = states.some(s => s.device === 'mobile');
  const current = filter === 'all' ? null : grouped.find(d => d.key === filter)!;
  return <section className="results-dashboard rs" aria-label="Results dashboard">
    <header className="rs-head">
      <div className="row" style={{ gap: 10, alignItems: 'center' }}><h1 className="h1">Run results</h1><StatusBadge value={status} /></div>
      <p className="text-2" style={{ margin: 0 }}>{status === 'completed' ? 'Results from the tested scope.' : 'Partial results. This run did not complete its exploration.'}{reason ? ` Reason: ${reason.replace(/_/g, ' ')}.` : ''}</p>
    </header>
    {report && <section className="rs-report" aria-labelledby="rs-report-title">
      <h2 id="rs-report-title" className="h3">Bug report to reproduce</h2>
      <blockquote className="rs-report-text">{report}</blockquote>
      {reportVerdict?.verdict === 'reproduced'
        ? <p className="rs-verdict rs-verdict-yes"><Icon name="fail" /><span><strong>Reproduced.</strong> The agent linked this report to <button type="button" className="link-btn" onClick={() => onSelectFinding(reportVerdict.findingId)}>{reportVerdict.title}</button>, which fresh replays verified. The replays prove that finding; check that it is the behaviour the report describes.</span></p>
        : reportVerdict?.verdict === 'not_reproduced'
          ? <p className="rs-verdict"><Icon name="info" /><span><strong>{reportVerdict.text}.</strong> {[reportVerdict.actions != null && `${reportVerdict.actions} actions`, reportVerdict.pages != null && `${reportVerdict.pages} pages`, reportVerdict.candidates != null && `${reportVerdict.candidates} candidates recorded`, reportVerdict.replayed != null && `${reportVerdict.replayed} replayed`].filter(Boolean).join(', ')}{reportVerdict.actions != null ? '. ' : ''}This does not show the bug is absent; it was not reproduced in what this run tried.</span></p>
          : <p className="rs-verdict"><Icon name="clock" /><span>No reproduction verdict was recorded for this run.</span></p>}
    </section>}
    <dl className="instruments rs-totals">
      <div className={totals.verified ? 'is-hot' : undefined}><dt>Verified issues</dt><dd className="tabular">{totals.verified}</dd></div>
      <div><dt>Needs review</dt><dd className="tabular">{totals.review}</dd></div>
      <div><dt>Configuration observations</dt><dd className="tabular">{totals.observations}</dd></div>
      <div><dt>Suggestions</dt><dd className="tabular">{totals.suggestions}</dd></div>
    </dl>
    <p className="muted rs-note">Categories organize saved findings. Zero findings is not a pass; no overall or category score is calculated.</p>
    {comparison && changeCounts && <p className="rs-since" aria-label="Since the previous run">
      <span suppressHydrationWarning>Since the <a href={`/runs/${comparison.previousRunId}`}>previous run</a>{comparison.previousAt ? ` (${new Date(comparison.previousAt).toLocaleDateString()})` : ''}:</span>
      <span><strong>{changeCounts.new}</strong> new</span>
      <span><strong>{changeCounts.repeat}</strong> also found then</span>
      <span><strong>{comparison.notSeen.length}</strong> found then, not this time</span>
      {comparison.notSeen.length > 0 && <details><summary>Not found this time is not fixed: only a retest replays the saved check.</summary>
        <ul>{comparison.notSeen.map((n, i) => <li key={i}>{n.title}{n.ruleId ? ` (${n.ruleId})` : ''}</li>)}</ul></details>}
    </p>}

    <div className="segmented rs-filter" role="group" aria-label="Result categories">
      <button aria-pressed={filter === 'all'} aria-label="All categories" onClick={() => setFilter('all')}>All <span className="rs-count">{findings.length}</span></button>
      {grouped.map(domain => <button key={domain.key} aria-pressed={filter === domain.key} onClick={() => setFilter(domain.key)}>
        <Icon name={ICONS[domain.key]} />{domain.label} <span className="rs-count">{domain.findings.length}</span></button>)}
    </div>
    <div className="rs-list-head">
      <h2 className="h3">{current ? current.label : 'All findings'}</h2>
      {current && <p className="muted">{current.description}{current.findings.length ? '' : ' No findings recorded. Category coverage is not established.'}</p>}
    </div>
    {visible.length ? <ul className="rs-findings">{visible.map(f => <li key={f.id}><button onClick={() => onSelectFinding(f.id)}>
        <StatusBadge value={findingStatus({ ...f, lifecycle: f.lifecycle ?? null })} />
        <span className="rs-title"><strong>{f.title}</strong><span className="muted">{RESULT_DOMAINS.find(d => d.key === resultDomain(f, rules))!.label}{f.impact ? `, ${f.impact} impact` : ''}</span></span>
        {comparison?.changes[f.id] && <span className={`rs-change rs-change-${comparison.changes[f.id]}`}>{comparison.changes[f.id] === 'new' ? 'New' : 'Also last run'}</span>}
        <Icon name="chevron" /></button></li>)}</ul>
      : <p className="muted">No findings recorded here. This does not establish that the category was tested or passed.</p>}

    <section className="rs-coverage" aria-labelledby="rs-coverage-title">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><h2 id="rs-coverage-title" className="h3">Coverage and gaps</h2><button className="btn btn-sm" onClick={onOpenCoverage}>View coverage</button></div>
      <dl className="rs-cov">
        <div><dt>Paths reached</dt><dd>{new Set(states.map(s => s.route)).size} paths, {states.length} saved states. {mobile ? 'Mobile states recorded.' : 'No mobile states recorded.'}</dd></div>
        <div><dt>Controls</dt><dd>{coverage ? `${coverage.exercised} of ${coverage.total} observed controls exercised, ${coverage.outcomeChecked ?? 0} outcome checks, ${coverage.blocked} blocked by policy.` : 'No control coverage recorded.'}</dd></div>
        <div><dt>Still pending</dt><dd>{discovery ? `${discovery.pendingRoutes} discovered routes and ${discovery.pendingControls} controls not yet tried; ${discovery.excluded} entries excluded by the run contract.` : 'No discovery backlog recorded.'}</dd></div>
      </dl>
      <p className="muted rs-note">Reached pages and successful clicks do not establish correct behavior. SEO and UI/UX need their own recorded checks; this page does not run additional audits.</p>
    </section>

    <section className="rs-gaps" aria-labelledby="rs-gaps-title">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <h2 id="rs-gaps-title" className="h3">Not tested: take these by hand</h2>
        {gaps.length > 0 && <button className="btn btn-sm" onClick={copyChecklist}><Icon name={listState === 'copied' ? 'tick' : 'copy'} /> {listState === 'copied' ? 'Checklist copied' : 'Copy as checklist'}</button>}
      </div>
      {gaps.length
        ? <ul>{gaps.slice(0, 12).map((g, i) => <li key={i}><span className="mono">{g.path}</span>{g.text.slice(g.path.length)}</li>)}{gaps.length > 12 && <li className="muted">{gaps.length - 12} more in the copied checklist.</li>}</ul>
        : <p className="muted">No gaps were recorded. This does not mean everything was tested; the run left no pending pages or untried controls.</p>}
    </section>
  </section>;
}

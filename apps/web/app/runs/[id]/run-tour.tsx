'use client';
// A three-step first-visit tour of the run page: what the agent is doing, how a bug is proven, and
// how a fix is handed off and proven. Skippable, remembered in this browser, closes with Escape.
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/ui/icons';

const KEY = 'oh_tour_run_v1';
const STEPS: { title: string; text: string; target: string[] }[] = [
  { title: 'Watch the agent work', text: 'The route and activity show every page it opens and what it tries there: odd inputs, a second account, a phone screen. Nothing is scripted.', target: ['.deck', '.course'] },
  { title: 'A bug is called a bug only after proof', text: 'Open a finding. Two fresh replays must break the rule and a valid case must still pass. The stamp shows the result.', target: ['.pc', '.rs-list', '[data-tour="findings"]'] },
  { title: 'Hand it off, then prove the fix', text: 'Copy the fix prompt into your coding AI. After you deploy, Retest replays the exact same check twice and marks it Fixed only if it holds.', target: ['[data-tour="fix"]', '[data-tour="retest"]'] },
];

const seen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } };
const remember = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* private window: show again next time */ } };

export function RunTour() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => { if (!seen()) setStep(0); }, []);
  const close = useCallback(() => { remember(); setStep(null); }, []);
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, close]);
  useEffect(() => {
    if (step === null) return;
    const el = STEPS[step]!.target.map((s) => document.querySelector(s)).find(Boolean) as HTMLElement | undefined;
    el?.classList.add('tour-spot');
    return () => el?.classList.remove('tour-spot');
  }, [step]);
  if (step === null) return null;
  const s = STEPS[step]!;
  const show = () => {
    const el = s.target.map((t) => document.querySelector(t)).find(Boolean) as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  };
  return (
    <aside className="tour fade-in" role="dialog" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div className="tour-top"><span className="tour-count tabular">{step + 1} of {STEPS.length}</span><button type="button" className="link-btn" onClick={close}>Skip tour</button></div>
      <h2 id="tour-title" className="tour-title">{s.title}</h2>
      <p id="tour-text" className="tour-text">{s.text}</p>
      <div className="tour-actions">
        <button type="button" className="btn btn-sm" onClick={show}><Icon name="eye" /> Show me</button>
        <span style={{ flex: 1 }} />
        {step > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < STEPS.length - 1
          ? <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep(step + 1)} autoFocus>Next</button>
          : <button type="button" className="btn btn-sm btn-primary" onClick={close} autoFocus>Got it</button>}
      </div>
    </aside>
  );
}

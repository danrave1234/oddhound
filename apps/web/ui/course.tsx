// A run drawn as an orienteering course: start triangle, numbered controls joined by straight legs,
// double-circle finish. A red cross marks a control only where a verified finding's assertion points.
// Pure SVG with deterministic layout, so it renders on the server and never invents positions per load.

export type CourseStop = { key: string; route: string; label: string; failed?: boolean; title?: string };

const R = 13; // control circle radius

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

/** Positions along a meander (left→right, then right→left), nudged by a hash of each route. */
export function courseLayout(stops: CourseStop[], width: number, height: number) {
  const n = stops.length;
  const rows = n <= 5 ? 1 : n <= 10 ? 2 : 3;
  const perRow = Math.ceil(n / rows);
  const padX = 40, padY = 38;
  const rowH = rows === 1 ? 0 : (height - padY * 2) / (rows - 1);
  return stops.map((s, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const t = perRow === 1 ? 0.5 : col / (perRow - 1);
    const x0 = padX + (row % 2 === 0 ? t : 1 - t) * (width - padX * 2);
    const jx = (hash(s.route + 'x') - 0.5) * Math.min(36, (width - padX * 2) / perRow * 0.4);
    const jy = (hash(s.route + 'y') - 0.5) * (rows === 1 ? height * 0.42 : rowH * 0.42);
    const y0 = rows === 1 ? height / 2 : padY + row * rowH;
    return { ...s, x: Math.round(x0 + jx), y: Math.round(y0 + jy), n: i };
  });
}

function leg(a: { x: number; y: number }, b: { x: number; y: number }, gapA: number, gapB: number) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  if (d <= gapA + gapB + 2) return null;
  return { x1: a.x + (dx / d) * gapA, y1: a.y + (dy / d) * gapA, x2: b.x - (dx / d) * gapB, y2: b.y - (dy / d) * gapB };
}

export function Course({ stops, width = 560, height = 260, label, selectedKey, onSelect }: {
  stops: CourseStop[]; width?: number; height?: number; label: string; selectedKey?: string | null; onSelect?: (key: string) => void;
}) {
  if (!stops.length) return null;
  const pts = courseLayout(stops, width, height);
  const last = pts.length - 1;
  const first = pts[0]!, second = pts[1];
  // The start triangle points along the first leg, as on a real course.
  const angle = second ? Math.atan2(second.y - first.y, second.x - first.x) : 0;
  const tri = [0, 1, 2].map((k) => {
    const a = angle + (k * 2 * Math.PI) / 3;
    return `${(first.x + Math.cos(a) * (R + 3)).toFixed(1)},${(first.y + Math.sin(a) * (R + 3)).toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="course" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {pts.slice(1).map((p, i) => {
        const a = pts[i]!;
        const l = leg(a, p, i === 0 ? R + 2 : R + 3, p.n === last ? R + 6 : R + 3);
        return l ? <line key={`leg-${p.key}`} className="course-leg" {...l} /> : null;
      })}
      <polygon className="course-start" points={tri} />
      {pts.slice(1).map((p) => {
        const isFinish = p.n === last;
        const selected = selectedKey === p.key;
        const body = (
          <g className={`course-control${p.failed ? ' is-failed' : ''}${selected ? ' is-selected' : ''}`}>
            <title>{`${p.n}. ${p.title ?? p.label}${p.failed ? ' (verified finding here)' : ''}`}</title>
            <circle cx={p.x} cy={p.y} r={R} />
            {isFinish && <circle cx={p.x} cy={p.y} r={R + 5} />}
            {p.failed && <path className="course-cross" d={`M${p.x - 8} ${p.y - 8}l16 16M${p.x + 8} ${p.y - 8}l-16 16`} />}
            <text x={p.x + R + 5} y={p.y - R + 2} className="course-num">{p.n}</text>
          </g>
        );
        return onSelect
          ? <a key={p.key} href={`#control-${p.n}`} onClick={(e) => { e.preventDefault(); onSelect(p.key); }} aria-label={`Control ${p.n}: ${p.label}`}>{body}</a>
          : <g key={p.key}>{body}</g>;
      })}
    </svg>
  );
}

/** Route with record IDs replaced, so /bookings/42 and /bookings/:id are the same place. */
export function placeOf(path: string): string {
  return (path.split('?')[0] || '/').split('/').map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || seg === '{id}' ? ':id' : seg)).join('/') || '/';
}

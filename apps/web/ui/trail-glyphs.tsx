// Original Oddhound "Trail" icon set (Trail design v2): 20-unit grid, 2-unit keyline, 1.6 stroke, round caps and joins,
// at most one region tinted with currentColor. Generated from redesign/oddhound-concept.html; edit there and regenerate.
// Static, authored markup only (no user data), so inner SVG is set directly.
import type { SVGProps } from 'react';

type GlyphProps = { size?: number; 'aria-label'?: string; 'aria-hidden'?: boolean };

const MARKUP = {
  "start": "<path d=\"M10 3.4 16.8 15.4H3.2Z\" fill=\"currentColor\" fill-opacity=\".16\"/>",
  "control": "<circle cx=\"10\" cy=\"10\" r=\"6.6\"/><circle cx=\"10\" cy=\"10\" r=\"1.2\" fill=\"currentColor\"/>",
  "finish": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><circle cx=\"10\" cy=\"10\" r=\"3.8\" fill=\"currentColor\" fill-opacity=\".16\"/>",
  "route": "<path d=\"M2.8 16.8 5.6 11.8 8.4 16.8Z\" fill=\"currentColor\" fill-opacity=\".16\"/><path d=\"M7.6 11.2c1.6-3 4-1.6 5.4-4\" stroke-dasharray=\"1.4 2.4\"/><circle cx=\"14.8\" cy=\"5\" r=\"2.4\"/>",
  "flag": "<rect x=\"3.8\" y=\"3.8\" width=\"12.4\" height=\"12.4\" rx=\"2.2\"/><path d=\"M6 3.8h8a2.2 2.2 0 0 1 2.2 2.2v8Z\" fill=\"currentColor\" fill-opacity=\".22\" stroke=\"none\"/><path d=\"M6 3.8 16.2 14\"/>",
  "kennel": "<path d=\"M3.4 9.2 10 3.6l6.6 5.6V15a1.8 1.8 0 0 1-1.8 1.8H5.2A1.8 1.8 0 0 1 3.4 15Z\"/><path d=\"M7.8 16.8v-2.6a2.2 2.2 0 0 1 4.4 0v2.6\" fill=\"currentColor\" fill-opacity=\".16\"/>",
  "stamp": "<circle cx=\"10\" cy=\"4.8\" r=\"2.1\"/><path d=\"M8.8 6.8v2.6h2.4V6.8\"/><rect x=\"3.6\" y=\"9.4\" width=\"12.8\" height=\"3.8\" rx=\"1.6\" fill=\"currentColor\" fill-opacity=\".16\"/><path d=\"M4.6 16.4h10.8\"/>",
  "paw": "<circle cx=\"5\" cy=\"8.8\" r=\"1.6\"/><circle cx=\"8.1\" cy=\"5.2\" r=\"1.6\"/><circle cx=\"11.9\" cy=\"5.2\" r=\"1.6\"/><circle cx=\"15\" cy=\"8.8\" r=\"1.6\"/><path d=\"M10 9.4c2.1 0 4.2 2.5 4.2 4.4 0 1.5-1 2.2-2.1 2.2-.8 0-1.3-.4-2.1-.4s-1.3.4-2.1.4c-1.1 0-2.1-.7-2.1-2.2 0-1.9 2.1-4.4 4.2-4.4Z\" fill=\"currentColor\" fill-opacity=\".2\"/>",
  "sniff": "<circle cx=\"4.8\" cy=\"10\" r=\"2\" fill=\"currentColor\" fill-opacity=\".2\"/><path d=\"M9.4 6.4a5 5 0 0 1 0 7.2\"/><path d=\"M12.6 3.8a8.6 8.6 0 0 1 0 12.4\"/>",
  "replay": "<path d=\"M3.4 10a6.6 6.6 0 0 1 11.6-4.3\"/><path d=\"M15.4 2.8v3.4H12\"/><path d=\"M16.6 10A6.6 6.6 0 0 1 5 14.3\"/><path d=\"M4.6 17.2v-3.4H8\"/>",
  "shield": "<path d=\"M10 2.6 16 4.9v4.5c0 3.9-2.5 6.4-6 7.9-3.5-1.5-6-4-6-7.9V4.9Z\" fill=\"currentColor\" fill-opacity=\".1\"/><path d=\"m7.3 10 1.9 1.9 3.5-3.7\"/>",
  "share": "<path d=\"M8.6 4.4H5.6a1.8 1.8 0 0 0-1.8 1.8v8.2a1.8 1.8 0 0 0 1.8 1.8h8.2a1.8 1.8 0 0 0 1.8-1.8v-3\"/><path d=\"M11.6 3.6h4.8v4.8\"/><path d=\"M16.4 3.6 9.4 10.6\"/>",
  "deploy": "<path d=\"M10 12.6V3.4\"/><path d=\"M6.4 7 10 3.4 13.6 7\"/><path d=\"M3.6 11.6v2.8a1.8 1.8 0 0 0 1.8 1.8h9.2a1.8 1.8 0 0 0 1.8-1.8v-2.8\"/>",
  "held": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><path d=\"m6.9 10.2 2.1 2.1 4.1-4.5\"/>",
  "broke": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><path d=\"m7.6 7.6 4.8 4.8m0-4.8-4.8 4.8\"/>",
  "cand": "<circle cx=\"10\" cy=\"10\" r=\"6.8\" stroke-dasharray=\"2.8 2.4\"/><circle cx=\"10\" cy=\"10\" r=\"1.6\" fill=\"currentColor\"/>",
  "open": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><circle cx=\"10\" cy=\"10\" r=\"3\" fill=\"currentColor\" fill-opacity=\".9\" stroke=\"none\"/>",
  "eye": "<path d=\"M2.4 10S5.2 4.6 10 4.6 17.6 10 17.6 10 14.8 15.4 10 15.4 2.4 10 2.4 10Z\"/><circle cx=\"10\" cy=\"10\" r=\"2.4\" fill=\"currentColor\" fill-opacity=\".2\"/>",
  "dismiss": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><path d=\"M5.2 14.8 14.8 5.2\"/>",
  "copy": "<rect x=\"7\" y=\"7\" width=\"9.6\" height=\"9.6\" rx=\"2.2\"/><path d=\"M13 7V5.4a1.8 1.8 0 0 0-1.8-1.8H5.4a1.8 1.8 0 0 0-1.8 1.8v5.8A1.8 1.8 0 0 0 5.4 13H7\"/>",
  "brief": "<path d=\"M5.4 2.8h6l4 4v9a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V4.6a1.8 1.8 0 0 1 1.8-1.8Z\"/><path d=\"M11.2 2.8v4.2h4.2\" fill=\"currentColor\" fill-opacity=\".16\"/><path d=\"M6.8 10.6h6.4M6.8 13.6h4\"/>",
  "spark": "<path d=\"M9 2.8c.6 3.8 1.6 4.8 5.4 5.4-3.8.6-4.8 1.6-5.4 5.4-.6-3.8-1.6-4.8-5.4-5.4 3.8-.6 4.8-1.6 5.4-5.4Z\" fill=\"currentColor\" fill-opacity=\".18\"/><path d=\"M15.2 12.6v4.4M13 14.8h4.4\"/>",
  "play": "<path d=\"M6.4 4.2v11.6L15.6 10Z\" fill=\"currentColor\" stroke-width=\"1.2\"/>",
  "pause": "<rect x=\"5.4\" y=\"4.2\" width=\"3.2\" height=\"11.6\" rx=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"11.4\" y=\"4.2\" width=\"3.2\" height=\"11.6\" rx=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>",
  "skip": "<path d=\"M4.4 4.6v10.8l7.6-5.4Z\" fill=\"currentColor\" fill-opacity=\".16\"/><path d=\"M15.4 4.6v10.8\"/>",
  "plus": "<path d=\"M10 4v12M4 10h12\"/>",
  "chev": "<path d=\"M7.6 4.6 13 10l-5.4 5.4\"/>",
  "arrow": "<path d=\"M3.8 10h12M11.4 5.4 16 10l-4.6 4.6\"/>",
  "close": "<path d=\"m5.6 5.6 8.8 8.8m0-8.8-8.8 8.8\"/>",
  "link": "<path d=\"M8.6 11.4a3.1 3.1 0 0 0 4.4 0l2.4-2.4a3.1 3.1 0 0 0-4.4-4.4l-1 1\"/><path d=\"M11.4 8.6a3.1 3.1 0 0 0-4.4 0L4.6 11a3.1 3.1 0 0 0 4.4 4.4l1-1\"/>",
  "test": "<path d=\"M7.4 3.2h5.2M8.4 3.2v4.6L3.8 15a1.6 1.6 0 0 0 1.4 2.4h9.6a1.6 1.6 0 0 0 1.4-2.4l-4.6-7.2V3.2\"/><path d=\"M5.2 14.2h9.6l-1.6-2.6H6.8Z\" fill=\"currentColor\" fill-opacity=\".18\" stroke=\"none\"/>",
  "phone": "<rect x=\"5.4\" y=\"2.4\" width=\"9.2\" height=\"15.2\" rx=\"2.2\"/><path d=\"M8.8 14.8h2.4\"/>",
  "desktop": "<rect x=\"2.4\" y=\"3.4\" width=\"15.2\" height=\"10\" rx=\"2.2\"/><path d=\"M7.4 16.8h5.2M10 13.4v3.4\"/>",
  "lock": "<rect x=\"4.2\" y=\"8.4\" width=\"11.6\" height=\"8.6\" rx=\"2.2\" fill=\"currentColor\" fill-opacity=\".12\"/><path d=\"M6.8 8.4V6.2a3.2 3.2 0 0 1 6.4 0v2.2\"/>",
  "key": "<circle cx=\"6.6\" cy=\"10\" r=\"3.4\" fill=\"currentColor\" fill-opacity=\".14\"/><path d=\"M10 10h6.6M14.4 10v2.8M16.6 10v2\"/>",
  "person": "<circle cx=\"10\" cy=\"6.8\" r=\"3.1\"/><path d=\"M4.2 16.6a5.8 5.8 0 0 1 11.6 0\"/>",
  "clock": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><path d=\"M10 6.2V10l2.6 1.8\"/>",
  "coin": "<circle cx=\"10\" cy=\"10\" r=\"6.8\"/><path d=\"M12.2 7.6c-.4-.8-1.2-1.2-2.2-1.2-1.3 0-2.2.7-2.2 1.7 0 2.3 4.6 1.2 4.6 3.7 0 1-1 1.8-2.4 1.8-1.1 0-2-.5-2.4-1.3M10 5.2v1.2M10 13.6v1.2\"/>",
  "file": "<path d=\"M5.4 2.8h6l4 4v9a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V4.6a1.8 1.8 0 0 1 1.8-1.8Z\"/><path d=\"M11.2 2.8v4.2h4.2\"/>",
  "tag": "<path d=\"M6.8 5 3 10l3.8 5M13.2 5 17 10l-3.8 5\"/><path d=\"m11.2 4.4-2.4 11.2\"/>",
  "dns": "<rect x=\"3\" y=\"3.8\" width=\"14\" height=\"5\" rx=\"1.8\"/><rect x=\"3\" y=\"11.2\" width=\"14\" height=\"5\" rx=\"1.8\"/><path d=\"M6 6.3h.01M6 13.7h.01\" stroke-width=\"2.2\"/>",
  "sun": "<circle cx=\"10\" cy=\"10\" r=\"3.4\" fill=\"currentColor\" fill-opacity=\".16\"/><path d=\"M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.8 4.8l1.2 1.2M14 14l1.2 1.2M4.8 15.2 6 14M14 6l1.2-1.2\"/>",
  "moon": "<path d=\"M16 11.8A6.6 6.6 0 0 1 8.2 4a6.6 6.6 0 1 0 7.8 7.8Z\" fill=\"currentColor\" fill-opacity=\".16\"/>",
} as const;

export type TrailGlyphName = keyof typeof MARKUP;

function trailSvg(name: TrailGlyphName, { size = 16, ...rest }: GlyphProps): SVGProps<SVGSVGElement> {
  const labelled = Boolean(rest['aria-label']);
  return { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
    role: labelled ? 'img' : undefined, 'aria-label': rest['aria-label'], 'aria-hidden': labelled ? undefined : true, focusable: false,
    style: { verticalAlign: 'text-bottom', flex: 'none', overflow: 'visible' }, dangerouslySetInnerHTML: { __html: MARKUP[name] } };
}

/** A component per glyph, for the Icon registry in icons.tsx. */
export const trail = (name: TrailGlyphName) => {
  const Glyph = (p: GlyphProps) => <svg {...trailSvg(name, p)} />;
  Glyph.displayName = `Trail(${name})`;
  return Glyph;
};

// Small SVG charts for the top bar's panes. Thin marks, hairline axes, text in
// ink (never the series colour). Every mark has a tooltip (<title>) and is
// tappable: data-act="tip" writes its text into the chart's caption, since
// phones have no hover.
import { esc } from './util.js';

const INK = '#1d1b22';
const MUTED = '#5a5347';
const GRID = '#d9cba8';
const SURFACE = '#f4ead3';
// Diverging pair for money in / money out (validated against the paper surface).
export const UP = '#2f5d9a';
export const DOWN = '#b8372e';

const W = 320;
const pad = { l: 42, r: 12, t: 12, b: 20 };

function frame(h, inner, caption) {
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${h}" width="100%" role="img" aria-label="${esc(caption)}">${inner}</svg><figcaption class="chart-tip">${esc(caption)}</figcaption></figure>`;
}

const tick = (x, y, text, anchor = 'end') => `<text x="${x}" y="${y}" font-size="10" fill="${MUTED}" text-anchor="${anchor}" font-family="system-ui,sans-serif">${esc(text)}</text>`;

// Columns that grow up or down from zero: up in one hue, down in the other.
// values: [{ label, value, tip }] oldest first. fmt formats an axis value.
export function columnChart(values, { h = 150, fmt = String, caption = '' } = {}) {
  const n = values.length;
  // Zero is always on the axis; a top or bottom tick only when there are values out there.
  let max = Math.max(0, ...values.map((v) => v.value));
  const min = Math.min(0, ...values.map((v) => v.value));
  if (max === min) max = 1;
  const plotH = h - pad.t - pad.b;
  const y = (v) => pad.t + ((max - v) / (max - min)) * plotH;
  const zero = y(0);
  const band = (W - pad.l - pad.r) / Math.max(n, 1);
  const bw = Math.min(24, band - 4);
  let s = '';
  // Axis ticks: top, zero, bottom.
  for (const v of [...new Set([max, 0, min])]) if (v === 0 || values.some((x) => Math.sign(x.value) === Math.sign(v))) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}" stroke-width="1"/>${tick(pad.l - 4, y(v) + 3, fmt(v))}`;
  values.forEach((v, i) => {
    const x = pad.l + i * band + (band - bw) / 2;
    const top = Math.min(y(v.value), zero);
    const hgt = Math.max(1, Math.abs(y(v.value) - zero));
    const r = Math.min(4, hgt / 2, bw / 2);
    const up = v.value >= 0;
    // Rounded at the data end, square at the baseline.
    const d = up
      ? `M${x} ${zero} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${zero} Z`
      : `M${x} ${zero} V${top + hgt - r} Q${x} ${top + hgt} ${x + r} ${top + hgt} H${x + bw - r} Q${x + bw} ${top + hgt} ${x + bw} ${top + hgt - r} V${zero} Z`;
    s += `<g data-act="tip" data-text="${esc(v.tip)}"><rect x="${x - (band - bw) / 2}" y="${pad.t}" width="${band}" height="${plotH}" fill="transparent"/><path d="${d}" fill="${up ? UP : DOWN}"><title>${esc(v.tip)}</title></path></g>`;
  });
  // Label the latest column only.
  if (n) {
    const last = values[n - 1];
    const x = pad.l + (n - 1) * band + band / 2;
    s += tick(x, last.value >= 0 ? y(last.value) - 4 : y(last.value) + 12, fmt(last.value), 'middle');
  }
  return frame(h, s, caption);
}

// A single line over time with an area wash, optional reference lines, and the
// latest value labelled. points: [{ label, value, tip }] oldest first.
export function lineChart(points, { h = 150, min = 0, max = 100, color = UP, refs = [], caption = '' } = {}) {
  const n = points.length;
  const plotH = h - pad.t - pad.b;
  const plotW = W - pad.l - pad.r;
  const x = (i) => pad.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => pad.t + ((max - v) / (max - min)) * plotH;
  let s = '';
  for (const v of [min, (min + max) / 2, max]) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}" stroke-width="1"/>${tick(pad.l - 4, y(v) + 3, String(v))}`;
  for (const r of refs) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(r.y)}" y2="${y(r.y)}" stroke="${MUTED}" stroke-width="1" opacity=".6"/>${tick(W - pad.r, y(r.y) - 3, r.label)}`;
  if (n) {
    const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    s += `<path d="M${x(0)} ${y(min)} L${pts.join(' L')} L${x(n - 1)} ${y(min)} Z" fill="${color}" opacity=".1"/>`;
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    points.forEach((p, i) => {
      // Big tap target, small mark; the latest point gets a ringed dot and a label.
      s += `<g data-act="tip" data-text="${esc(p.tip)}"><circle cx="${x(i)}" cy="${y(p.value)}" r="12" fill="transparent"/>${i === n - 1 ? `<circle cx="${x(i)}" cy="${y(p.value)}" r="4" fill="${color}" stroke="${SURFACE}" stroke-width="2"/>` : ''}<title>${esc(p.tip)}</title></g>`;
    });
    const last = points[n - 1];
    s += `<text x="${Math.min(x(n - 1), W - pad.r - 4)}" y="${y(last.value) - 8}" font-size="11" font-weight="700" fill="${INK}" text-anchor="${n > 1 ? 'end' : 'middle'}" font-family="system-ui,sans-serif">${esc(String(last.value))}</text>`;
  }
  return frame(h, s, caption);
}

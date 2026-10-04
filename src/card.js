// Shareable snapshots: a crew member's profile card (captured from the game's
// own HTML) and a heist recap (drawn as SVG), as PNGs for the Web Share API
// (or a save fallback).
import { JOB_TYPES } from './data.js';
import { portraitSVG, displayName } from './dogs.js';
import { esc, money } from './util.js';


function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

// How each crew member's night ended, for the recap card.
export const FATES = { away: 'got away', nicked: 'nicked', farm: 'the farm', hospital: 'hospital', ran: 'did a runner', copper: 'a copper!' };
const GRADE_INK = { S: '#2a6d8e', A: '#a57e1f', B: '#a57e1f', C: '#5a5347', D: '#8a2419', F: '#8a2419' };

// A heist report: what, where, how it went, who did what. Grows to fit the steps.
function recapSVG(r) {
  const W = 600;
  const serif = 'Georgia,serif';
  const sans = 'system-ui,sans-serif';
  const text = (x, y, str, size, o = {}) => `<text x="${x}" y="${y}" font-size="${size}" font-family="${o.font || sans}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.weight ? `font-weight="${o.weight}"` : ''} ${o.italic ? 'font-style="italic"' : ''} ${o.spacing ? `letter-spacing="${o.spacing}"` : ''} fill="${o.fill || '#1d1b22'}">${esc(str)}</text>`;
  let y = 80;
  let t = text(300, y, 'CRIMEDOG', 40, { anchor: 'middle', weight: 900, font: serif, spacing: 6, fill: '#a57e1f' });
  y += 28;
  t += text(300, y, 'HEIST REPORT', 15, { anchor: 'middle', weight: 700, spacing: 5, fill: '#5a5347' });
  y += 46;
  for (const l of wrap(r.name, 24)) { t += text(300, y, l, 34, { anchor: 'middle', weight: 900, font: serif }); y += 40; }
  const kind = JOB_TYPES[r.type]?.label || 'Break-in';
  for (const l of wrap(`${kind} · ${r.venue}${r.district ? `, ${r.district}` : ''}`, 46)) { t += text(300, y, l, 18, { anchor: 'middle', fill: '#5a5347' }); y += 24; }
  if (r.headline) {
    y += 6;
    for (const l of wrap(r.headline, 40)) { t += text(300, y, l, 17, { anchor: 'middle', weight: 800, font: serif }); y += 22; }
  }
  // Grade and the take.
  y += 20;
  const gy = y + 44;
  t += `<circle cx="112" cy="${gy}" r="46" fill="#101a30" stroke="#d6a93b" stroke-width="4"/>`;
  t += text(112, gy + 22, r.grade, 62, { anchor: 'middle', weight: 900, font: serif, fill: r.grade === 'S' ? '#7fd6ff' : ['D', 'F'].includes(r.grade) ? '#ff7a6b' : '#e9c46a' });
  t += text(186, gy - 16, `Grade ${r.grade}${r.score != null ? ` · ${r.score}/100` : ''}`, 22, { weight: 800, fill: GRADE_INK[r.grade] || '#1d1b22' });
  t += text(186, gy + 14, `Take: ${money(r.take || 0)}`, 20, { weight: 700 });
  if (r.alarmMax != null) t += text(186, gy + 40, `Alarm ${r.alarmMax}/10 · ${r.clues} clue${r.clues === 1 ? '' : 's'} left`, 16, { fill: '#5a5347' });
  y = gy + 70;
  // The crew, and how their night ended.
  const crew = (r.crew || []).slice(0, 6);
  if (crew.length) {
    const size = 76;
    const gap = 12;
    const x0 = 300 - (crew.length * size + (crew.length - 1) * gap) / 2;
    crew.forEach((c, k) => {
      const x = x0 + k * (size + gap);
      t += portraitSVG(c, { size, bg: '#e9dcc3' }).replace('<svg ', `<svg x="${x}" y="${y}" `);
      t += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="none" stroke="#1d1b22" stroke-width="2"/>`;
      t += text(x + size / 2, y + size + 20, c.nick ? c.nick.replace(/^The /, '') : c.first, 15, { anchor: 'middle', weight: 700 });
      t += text(x + size / 2, y + size + 38, FATES[c.fate] || '', 13, { anchor: 'middle', fill: c.fate === 'away' ? '#2f7d52' : '#8a2419' });
    });
    y += size + 64;
  }
  // Who did what.
  if (r.steps?.length) {
    t += text(60, y, 'HOW IT WENT DOWN', 15, { weight: 800, spacing: 3, fill: '#a57e1f' });
    t += `<line x1="60" x2="540" y1="${y + 10}" y2="${y + 10}" stroke="#cdbb95"/>`;
    y += 38;
    r.steps.forEach((st, k) => {
      t += text(60, y, `${k + 1}. ${st.label}${st.surprise ? ' (surprise!)' : ''}`, 18, { weight: 800 });
      y += 22;
      const how = st.tries.map((x) => `${x.dog} ${x.ok ? '✓' : '✗'}${x.improv ? ' (improvised)' : ''}`).join('  →  ');
      for (const l of wrap(`${how} · ${st.tries[st.tries.length - 1].how}`, 52)) { t += text(80, y, l, 15, { fill: '#5a5347' }); y += 20; }
      y += 8;
    });
  }
  for (const m of (r.moments || []).slice(0, 2)) {
    for (const l of wrap(`"${m}"`, 48)) { t += text(300, y, l, 16, { anchor: 'middle', italic: true, font: serif }); y += 21; }
    y += 6;
  }
  const H = y + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#101a30"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="22" fill="#f4ead3"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="16" fill="none" stroke="#d6a93b" stroke-width="4"/>
  ${t}
  ${text(300, H - 50, 'A heist game. For dogs.', 16, { anchor: 'middle', fill: '#5a5347' })}
  </svg>`;
}

const canvasPNG = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

// Rasterise an SVG card to a PNG blob.
async function svgPNG(svg) {
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = Number(w); c.height = Number(h);
    c.getContext('2d').drawImage(img, 0, 0);
    return await canvasPNG(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// html2canvas draws the page's own HTML and CSS onto a canvas. Loaded the first
// time someone shares a card, not on boot.
let h2c = null;
function loadHtml2canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return (h2c ||= new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = new URL('./vendor/html2canvas.min.js', import.meta.url).href;
    el.onload = () => res(window.html2canvas);
    el.onerror = () => { h2c = null; rej(new Error('html2canvas failed to load')); };
    document.head.appendChild(el);
  }));
}

// Picture the profile card exactly as it looks in the game: render the same
// HTML off-screen at phone width, then capture it at 2x. html2canvas copies the
// page into an iframe it can't reach inside a sandboxed frame (a hosted build),
// so there the card is drawn straight from the page instead.
async function htmlPNG(html) {
  const el = document.createElement('div');
  el.className = 'modal share-card';
  el.innerHTML = `${html}<div class="share-mark"><b>CRIMEDOG</b> · A heist game. For dogs.</div>`;
  document.body.appendChild(el);
  try {
    await document.fonts?.ready;
    if (!sandboxed()) {
      try {
        const render = await loadHtml2canvas();
        return await canvasPNG(await render(el, { scale: 2, backgroundColor: null, logging: false, useCORS: true }));
      } catch (e) {
        console.warn('html2canvas failed; drawing the card directly', e);
      }
    }
    return await canvasPNG(await drawDOM(el, 2));
  } finally {
    el.remove();
  }
}

// An opaque origin (a sandboxed iframe) can't reach into iframes it makes.
const sandboxed = () => window.origin === 'null';

// ------------------------------------------------------------------ drawing the page
// A small DOM-to-canvas painter for the share cards: boxes (background colour or
// a simple gradient, borders, rounded corners), images, inline SVG and text, each
// at the place the browser laid it out. No shadows, no background images.
export async function drawDOM(root, scale = 2) {
  const box = root.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(box.width * scale);
  canvas.height = Math.ceil(box.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(-box.left, -box.top);
  const pics = await loadPictures(root);
  paint(ctx, root, pics);
  return canvas;
}

// Every <img> and inline <svg> in the card, as a loaded image.
async function loadPictures(root) {
  const pics = new Map();
  const load = (node, src, revoke) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { pics.set(node, img); res(); };
    img.onerror = () => res();
    img.src = src;
  }).finally(() => revoke && URL.revokeObjectURL(src));
  const jobs = [];
  for (const img of root.querySelectorAll('img')) jobs.push(load(img, img.currentSrc || img.src));
  for (const svg of root.querySelectorAll('svg')) {
    if (svg.parentElement.closest('svg')) continue;
    const r = svg.getBoundingClientRect();
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', r.width);
    copy.setAttribute('height', r.height);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
    jobs.push(load(svg, url, true));
  }
  await Promise.all(jobs);
  return pics;
}

const px = (v) => parseFloat(v) || 0;
const visibleColour = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);

function roundRect(ctx, r, rad) {
  const k = Math.max(0, Math.min(rad, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.left + k, r.top);
  ctx.arcTo(r.right, r.top, r.right, r.bottom, k);
  ctx.arcTo(r.right, r.bottom, r.left, r.bottom, k);
  ctx.arcTo(r.left, r.bottom, r.left, r.top, k);
  ctx.arcTo(r.left, r.top, r.right, r.top, k);
  ctx.closePath();
}

function radiusOf(cs, r) {
  const v = cs.borderTopLeftRadius;
  return v.endsWith('%') ? (px(v) / 100) * Math.min(r.width, r.height) : px(v);
}

// The colours of a linear-gradient, top to bottom (or left to right at 90deg).
function gradientFill(ctx, r, image) {
  const m = image.match(/linear-gradient\(([^]*)\)/);
  if (!m) return null;
  const colours = m[1].match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi);
  if (!colours?.length) return null;
  const across = /^\s*(90deg|to right)/.test(m[1]);
  const g = across ? ctx.createLinearGradient(r.left, 0, r.right, 0) : ctx.createLinearGradient(0, r.top, 0, r.bottom);
  colours.forEach((c, i) => g.addColorStop(colours.length === 1 ? 0 : i / (colours.length - 1), c));
  return g;
}

function paintBox(ctx, el, cs) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const rad = radiusOf(cs, r);
  const fill = (visibleColour(cs.backgroundColor) && cs.backgroundColor) || null;
  const grad = cs.backgroundImage !== 'none' ? gradientFill(ctx, r, cs.backgroundImage) : null;
  if (fill || grad) {
    roundRect(ctx, r, rad);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (grad) { ctx.fillStyle = grad; ctx.fill(); }
  }
  const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ s, w: px(cs[`border${s}Width`]), c: cs[`border${s}Color`], st: cs[`border${s}Style`] }));
  const shown = sides.filter((b) => b.w > 0 && b.st !== 'none' && b.st !== 'hidden' && visibleColour(b.c));
  if (!shown.length) return;
  const dash = (b) => ctx.setLineDash(b.st === 'dashed' ? [b.w * 3, b.w * 2] : b.st === 'dotted' ? [b.w, b.w] : []);
  if (shown.length === 4 && shown.every((b) => b.w === shown[0].w && b.c === shown[0].c)) {
    const b = shown[0];
    const inset = { left: r.left + b.w / 2, top: r.top + b.w / 2, right: r.right - b.w / 2, bottom: r.bottom - b.w / 2 };
    inset.width = inset.right - inset.left;
    inset.height = inset.bottom - inset.top;
    roundRect(ctx, inset, Math.max(0, rad - b.w / 2));
    ctx.strokeStyle = b.c; ctx.lineWidth = b.w; dash(b); ctx.stroke();
  } else {
    for (const b of shown) {
      ctx.beginPath();
      const h = b.w / 2;
      if (b.s === 'Top') { ctx.moveTo(r.left, r.top + h); ctx.lineTo(r.right, r.top + h); }
      if (b.s === 'Bottom') { ctx.moveTo(r.left, r.bottom - h); ctx.lineTo(r.right, r.bottom - h); }
      if (b.s === 'Left') { ctx.moveTo(r.left + h, r.top); ctx.lineTo(r.left + h, r.bottom); }
      if (b.s === 'Right') { ctx.moveTo(r.right - h, r.top); ctx.lineTo(r.right - h, r.bottom); }
      ctx.strokeStyle = b.c; ctx.lineWidth = b.w; dash(b); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function paintPicture(ctx, el, cs, img) {
  const r = el.getBoundingClientRect();
  const bw = px(cs.borderTopWidth);
  const inner = { left: r.left + bw, top: r.top + bw, right: r.right - bw, bottom: r.bottom - bw, width: r.width - 2 * bw, height: r.height - 2 * bw };
  ctx.save();
  roundRect(ctx, inner, Math.max(0, radiusOf(cs, r) - bw));
  ctx.clip();
  ctx.drawImage(img, inner.left, inner.top, inner.width, inner.height);
  ctx.restore();
}

const TRANSFORM = { uppercase: (t) => t.toUpperCase(), lowercase: (t) => t.toLowerCase(), capitalize: (t) => t.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) };

// Text, a word at a time, wherever the browser put each word.
function paintText(ctx, node, cs) {
  const text = node.textContent;
  if (!text.trim()) return;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  const shape = TRANSFORM[cs.textTransform] || ((t) => t);
  const range = document.createRange();
  for (const m of text.matchAll(/\S+/g)) {
    range.setStart(node, m.index);
    range.setEnd(node, m.index + m[0].length);
    const rects = range.getClientRects();
    if (!rects.length) continue;
    const r = rects[0];
    const word = shape(m[0]);
    const mt = ctx.measureText(word);
    const asc = mt.fontBoundingBoxAscent ?? px(cs.fontSize) * 0.8;
    const desc = mt.fontBoundingBoxDescent ?? px(cs.fontSize) * 0.2;
    ctx.fillText(word, r.left, r.top + (r.height + asc - desc) / 2);
  }
}

function paint(ctx, el, pics) {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
  ctx.save();
  ctx.globalAlpha *= Number(cs.opacity);
  paintBox(ctx, el, cs);
  const pic = pics.get(el);
  if (pic) paintPicture(ctx, el, cs, pic);
  else if (el.tagName.toLowerCase() !== 'svg') {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) paintText(ctx, child, cs);
      else if (child.nodeType === Node.ELEMENT_NODE) paint(ctx, child, pics);
    }
  }
  ctx.restore();
}

// A crew member's card: the image plus what to call it when shared.
export async function cardPNG(dog, html) {
  return {
    blob: await htmlPNG(html),
    file: `crimedog-${dog.first.toLowerCase()}.png`,
    title: displayName(dog),
    text: `${displayName(dog)}: "${dog.catchphrase}" #Crimedog`,
  };
}

// The mastermind's career card: the same HTML as the one in the game.
export async function careerPNG(state, html) {
  return {
    blob: await htmlPNG(html),
    file: `crimedog-career-day-${state.day}.png`,
    title: 'Your career',
    text: `${state.stats.jobs} jobs, ${money(state.cash)} put away, and the Inspector still hasn't caught me. #Crimedog`,
  };
}

// A heist's recap card.
export async function recapPNG(r) {
  return {
    blob: await svgPNG(recapSVG(r)),
    file: `crimedog-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`,
    title: r.name,
    text: `${r.name}: grade ${r.grade}${r.take ? `, ${money(r.take)}` : ''}. #Crimedog`,
  };
}

// Try the native share sheet; the caller shows the PNG in a modal either way,
// so players inside sandboxed viewers can long-press to save it.
export async function shareBlob(card) {
  const file = new File([card.blob], card.file, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: card.title, text: card.text });
      return 'shared';
    } catch (e) {
      return e && e.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }
  return 'unsupported';
}

export function canShareFiles() {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  } catch {
    return false;
  }
}

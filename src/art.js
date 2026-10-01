// Scenic SVG illustrations: a night-time facade for each venue type (job
// board banner) and the rooftop skyline on the title screen. Seeded, so a
// given job always looks the same.
import { makeRng, hashString } from './rng.js';
import { esc } from './util.js';

let artUid = 0;
const f1 = (n) => n.toFixed(1);

// The sky for a scene. mood: { day, tone: 'night' | 'dusk' | 'deep', weather }.
const SKIES = {
  night: ['#0a1226', '#1d2f59', '#2d3f6b'],
  dusk: ['#1b1440', '#5a3a6e', '#c9726a'],
  deep: ['#05080f', '#101a33', '#1c2846'],
  day: ['#4f8fd0', '#8fbde6', '#d6e8f4'],
};
function sky(u, W, H, rng, mood = {}) {
  const [c0, c1, c2] = SKIES[mood.day ? 'day' : mood.tone || 'night'];
  let s = `<defs>
    <linearGradient id="${u}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".7" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <radialGradient id="${u}moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${mood.day ? '#fffbe6' : '#fff8dc'}" stop-opacity="${mood.day ? '.8' : '.55'}"/><stop offset="1" stop-color="#fff8dc" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}lamp" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#ffd27a" stop-opacity="${mood.day ? 0 : 0.55}"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}win" cx="50%" cy="50%" r="60%">${mood.day ? '<stop offset="0" stop-color="#e8f3fb"/><stop offset="1" stop-color="#8fb4d4"/>' : '<stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#f0b24a"/>'}</radialGradient>
    <linearGradient id="${u}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb2d6" stop-opacity="0"/><stop offset="1" stop-color="#9fb2d6" stop-opacity="${mood.weather === 'fog' ? 0.6 : 0.28}"/></linearGradient>
    <linearGradient id="${u}street" x1="0" y1="0" x2="0" y2="1">${mood.day ? '<stop offset="0" stop-color="#5b6274"/><stop offset="1" stop-color="#3a3f4d"/>' : '<stop offset="0" stop-color="#1b2238"/><stop offset="1" stop-color="#0b0f1c"/>'}</linearGradient>
    <pattern id="${u}brick" width="12" height="6" patternUnits="userSpaceOnUse"><path d="M0 .3H12M0 3.3H12M3 .3V3.3M9 3.3V6.3" stroke="#000" stroke-width=".6" opacity=".22"/><rect x="4" y="1" width="3" height="1.4" fill="#fff" opacity=".05"/></pattern>
    <pattern id="${u}stone" width="20" height="9" patternUnits="userSpaceOnUse"><path d="M0 .3H20M10 .3V9" stroke="#000" stroke-width=".6" opacity=".18"/><rect x="2" y="2" width="5" height="1" fill="#fff" opacity=".08"/></pattern>
  </defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#${u}sky)"/>`;
  if (mood.day) {
    // Sun and a few clouds.
    const sx = rng.float(W * 0.65, W * 0.9), sy = rng.float(16, 28);
    s += `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="34" fill="url(#${u}moon)"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="10" fill="#fff6c8"/>`;
    for (let i = 0; i < 4; i++) {
      const cx = rng.float(0, W), cy = rng.float(10, 46), w = rng.float(26, 50);
      s += `<g fill="#fff" opacity=".75"><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(w / 2)}" ry="6"/><ellipse cx="${f1(cx - w / 6)}" cy="${f1(cy - 4)}" rx="${f1(w / 4)}" ry="6"/><ellipse cx="${f1(cx + w / 6)}" cy="${f1(cy - 3)}" rx="${f1(w / 5)}" ry="5"/></g>`;
    }
    return s;
  }
  if (mood.weather !== 'fog') for (let i = 0; i < 18; i++) s += `<circle cx="${f1(rng.float(0, W))}" cy="${f1(rng.float(2, H * 0.4))}" r="${f1(rng.float(0.4, 1.1))}" fill="#fff" opacity="${f1(rng.float(0.3, 0.8))}"/>`;
  const mx = rng.float(W * 0.65, W * 0.92), my = rng.float(18, 32);
  s += `<circle cx="${f1(mx)}" cy="${f1(my)}" r="30" fill="url(#${u}moon)"/><circle cx="${f1(mx)}" cy="${f1(my)}" r="11" fill="#f6efd6"/><circle cx="${f1(mx + 5)}" cy="${f1(my - 3)}" r="10" fill="${c1}" opacity=".9"/>`;
  return s;
}

function rooftops(W, base, rng, col, minH, maxH) {
  let s = '';
  let x = -10;
  while (x < W + 10) {
    const w = rng.int(26, 58);
    const h = rng.int(minH, maxH);
    const y = base - h;
    const kind = rng.int(0, 3);
    if (kind === 0) s += `<path d="M${x} ${base} V${y + 8} L${x + w / 2} ${y - 6} L${x + w} ${y + 8} V${base} Z" fill="${col}"/>`;
    else s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}"/>`;
    if (rng.chance(0.7)) {
      const cx = x + rng.int(4, Math.max(5, w - 12));
      s += `<rect x="${cx}" y="${y - 10}" width="7" height="12" fill="${col}"/><rect x="${cx - 1}" y="${y - 12}" width="9" height="3" fill="${col}"/>`;
      if (rng.chance(0.4)) s += `<rect x="${cx + 1}" y="${y - 15}" width="2" height="4" fill="${col}"/><rect x="${cx + 4}" y="${y - 14}" width="2" height="3" fill="${col}"/>`;
    }
    if (rng.chance(0.5)) {
      for (let k = 0; k < rng.int(1, 3); k++) {
        const wx = x + rng.int(4, Math.max(5, w - 8)), wy = y + rng.int(10, Math.max(11, h - 10));
        s += `<rect x="${wx}" y="${wy}" width="4" height="5" fill="#f5c46a" opacity="${rng.chance(0.5) ? 0.9 : 0.5}"/>`;
      }
    }
    x += w - 2;
  }
  return s;
}

function windows(u, x0, y0, cols, rows, w, h, gx, gy, rng, frame = '#2a2230') {
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (w + gx), y = y0 + r * (h + gy);
      const lit = rng.chance(0.45);
      s += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${w + 3}" height="${h + 3}" fill="${frame}"/>`;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${lit ? `url(#${u}win)` : '#1a2440'}"/>`;
      s += `<path d="M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}" stroke="${frame}" stroke-width="1"/>`;
      if (lit) s += `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" fill="url(#${u}lamp)" opacity=".5"/>`;
      else s += `<path d="M${x + 1} ${y + 1} L${x + w * 0.4} ${y + h * 0.4}" stroke="#fff" stroke-opacity=".15"/>`;
    }
  }
  return s;
}

function sign(x, y, w, text, bg = '#1d1b22', fg = '#e2b447') {
  return `<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="16" rx="2" fill="${bg}" stroke="${fg}" stroke-width="1"/><text x="${x}" y="${y + 3.2}" text-anchor="middle" font-family="Alfa Slab One, Rockwell, Georgia, serif" font-size="10" letter-spacing="1.5" fill="${fg}">${text}</text>`;
}

function awning(x, y, w, a, b, n = 8) {
  let s = '';
  const sw = w / n;
  for (let i = 0; i < n; i++) s += `<path d="M${f1(x + i * sw)} ${y} h${f1(sw)} l${f1(sw * 0.15)} 14 h${f1(-sw * 1.0)} Z" fill="${i % 2 ? b : a}"/>`;
  for (let i = 0; i < n; i++) s += `<path d="M${f1(x + i * sw + sw * 0.15)} ${y + 14} q${f1(sw / 2)} 6 ${f1(sw)} 0" fill="${i % 2 ? b : a}"/>`;
  s += `<rect x="${x}" y="${y - 2}" width="${w}" height="3" fill="#1d1b22"/>`;
  return s;
}

function columns(x, y, w, h, n, col = '#d8cfbb') {
  let s = '';
  const step = w / (n - 1);
  for (let i = 0; i < n; i++) {
    const cx = x + i * step;
    s += `<rect x="${f1(cx - 4)}" y="${y}" width="8" height="${h}" fill="${col}"/><rect x="${f1(cx - 4)}" y="${y}" width="3" height="${h}" fill="#fff" opacity=".25"/><rect x="${f1(cx - 6)}" y="${y - 3}" width="12" height="4" fill="${col}"/><rect x="${f1(cx - 6)}" y="${y + h - 2}" width="12" height="4" fill="${col}"/>`;
  }
  return s;
}

function building(u, type, cx, ground, rng) {
  let s = '';
  const stone = '#b9ae97', stoneDk = '#8d8472';
  if (type === 'bank' || type === 'museum' || type === 'auction') {
    const w = 190, h = type === 'auction' ? 92 : 78, x = cx - w / 2, y = ground - h;
    if (type === 'museum') s += `<ellipse cx="${cx}" cy="${y - 20}" rx="34" ry="28" fill="#7f9aa0"/><rect x="${cx - 36}" y="${y - 22}" width="72" height="22" fill="${stone}"/><path d="M${cx - 30} ${y - 30} Q${cx} ${y - 60} ${cx + 30} ${y - 30}" stroke="#fff" stroke-opacity=".2" fill="none" stroke-width="3"/><rect x="${cx - 1.5}" y="${y - 56}" width="3" height="10" fill="#7f9aa0"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${stone}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${u}stone)"/>`;
    s += `<path d="M${x} ${y} h${w} v6 h${-w} Z" fill="${stoneDk}"/>`;
    if (type !== 'auction') {
      s += `<path d="M${x - 8} ${y} L${cx} ${y - 30} L${x + w + 8} ${y} Z" fill="${stone}" stroke="${stoneDk}" stroke-width="2"/><path d="M${x + 14} ${y - 3} L${cx} ${y - 24} L${x + w - 14} ${y - 3} Z" fill="${stoneDk}" opacity=".5"/>`;
      s += columns(x + 22, y + 18, w - 44, h - 30, 5);
      s += `<rect x="${x + 6}" y="${y + 8}" width="${w - 12}" height="8" fill="${stoneDk}"/>`;
      s += sign(cx, y + 12, 80, type === 'bank' ? 'BANK' : 'MUSEUM', '#2b2a30', '#e2b447');
      s += `<rect x="${cx - 12}" y="${ground - 32}" width="24" height="30" fill="#2a2230"/><rect x="${cx - 10}" y="${ground - 30}" width="20" height="28" fill="${rng.chance(0.4) ? `url(#${u}win)` : '#3a2f28'}"/>`;
      if (type === 'museum') s += `<rect x="${x + 4}" y="${y + 18}" width="10" height="36" fill="#9c2e27"/><rect x="${x + w - 14}" y="${y + 18}" width="10" height="36" fill="#9c2e27"/><path d="M${x + 4} ${y + 54} l5 -5 l5 5 M${x + w - 14} ${y + 54} l5 -5 l5 5" fill="#9c2e27"/>`;
    } else {
      s += `<path d="M${x - 4} ${y} h${w + 8} v-8 h${-w - 8} Z" fill="${stoneDk}"/>`;
      for (let i = 0; i < 4; i++) {
        const wx = x + 18 + i * 44;
        const lit = rng.chance(0.5);
        s += `<path d="M${wx} ${y + 70} V${y + 34} a12 12 0 0 1 24 0 V${y + 70} Z" fill="#2a2230"/><path d="M${wx + 2} ${y + 68} V${y + 34} a10 10 0 0 1 20 0 V${y + 68} Z" fill="${lit ? `url(#${u}win)` : '#1a2440'}"/>`;
      }
      s += sign(cx, y + 16, 110, 'AUCTIONS', '#1d1b22', '#e2b447');
    }
    s += `<path d="M${x - 14} ${ground} h${w + 28} v-4 h${-w - 20} v-3 h${w + 12} v-3 h${-w - 4} Z" fill="${stoneDk}"/>`;
  } else if (type === 'jeweller' || type === 'butcher') {
    const w = 170, h = 96, x = cx - w / 2, y = ground - h;
    const brick = type === 'jeweller' ? '#3b2c3f' : '#7a3b2e';
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${brick}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${u}brick)"/>`;
    s += windows(u, x + 20, y + 10, 4, 1, 22, 20, 18, 0, rng);
    s += `<rect x="${x + 6}" y="${y + 44}" width="${w - 12}" height="${h - 44}" fill="#1d1b22"/>`;
    s += sign(cx, y + 43, 120, type === 'jeweller' ? 'JEWELLERS' : 'BUTCHER', type === 'jeweller' ? '#1d1b22' : '#1f3a2a', type === 'jeweller' ? '#e2b447' : '#f3ead3');
    s += awning(x + 10, y + 54, w - 20, type === 'jeweller' ? '#7a2340' : '#2f6b45', '#efe6cf', 9);
    s += `<rect x="${x + 16}" y="${y + 72}" width="${w - 64}" height="${h - 74}" fill="url(#${u}win)"/><rect x="${x + w - 42}" y="${y + 70}" width="26" height="${h - 70}" fill="#2a2230"/>`;
    if (type === 'jeweller') {
      for (let i = 0; i < 4; i++) s += `<path d="M${x + 30 + i * 22} ${y + 84} l5 -5 l5 5 l-5 7 Z" fill="#dff4ff" stroke="#7fb6d6" stroke-width=".8"/>`;
    } else {
      for (let i = 0; i < 6; i++) s += `<path d="M${x + 26 + i * 15} ${y + 74} q2 8 0 14" stroke="#b84a3a" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    }
  } else if (type === 'mansion') {
    const w = 200, h = 80, x = cx - w / 2, y = ground - h;
    s += `<path d="M${x - 6} ${y} L${cx} ${y - 34} L${x + w + 6} ${y} Z" fill="#3c2f3a"/>`;
    s += `<rect x="${x + 30}" y="${y - 44}" width="10" height="24" fill="#6a3a2e"/><rect x="${x + w - 40}" y="${y - 44}" width="10" height="24" fill="#6a3a2e"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#8a4a38"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${u}brick)"/>`;
    s += windows(u, x + 16, y + 10, 5, 2, 20, 22, 18, 12, rng, '#efe6cf');
    s += `<path d="M${cx - 14} ${ground} V${ground - 30} a14 14 0 0 1 28 0 V${ground} Z" fill="#2b3b30" stroke="#efe6cf" stroke-width="2"/><circle cx="${cx + 20}" cy="${ground - 34}" r="3" fill="#ffd27a"/>`;
    s += `<ellipse cx="${x + 10}" cy="${ground - 4}" rx="18" ry="9" fill="#1f3a2a"/><ellipse cx="${x + w - 10}" cy="${ground - 4}" rx="18" ry="9" fill="#1f3a2a"/>`;
  } else if (type === 'casino') {
    const w = 190, h = 90, x = cx - w / 2, y = ground - h;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#241a2e"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${u}brick)" opacity=".6"/>`;
    s += windows(u, x + 14, y + 36, 6, 1, 18, 16, 11, 0, rng, '#120d18');
    s += `<rect x="${x + 20}" y="${y + 6}" width="${w - 40}" height="24" rx="4" fill="#3a1030" stroke="#ff5ca8" stroke-width="2"/>`;
    s += `<text x="${cx}" y="${y + 23}" text-anchor="middle" font-family="Alfa Slab One, Rockwell, Georgia, serif" font-size="14" letter-spacing="2" fill="#ffd3ea">CASINO</text>`;
    for (let i = 0; i < 18; i++) s += `<circle cx="${f1(x + 22 + i * ((w - 44) / 17))}" cy="${y + 4}" r="1.6" fill="${i % 2 ? '#ffe08a' : '#ff9a4a'}"/>`;
    s += `<path d="M${x + 30} ${ground - 26} h${w - 60} l8 -10 h${-w + 44} Z" fill="#7a1f16"/>`;
    for (let i = 0; i < 14; i++) s += `<circle cx="${f1(x + 26 + i * ((w - 52) / 13))}" cy="${ground - 36}" r="1.4" fill="#ffe08a"/>`;
    s += `<rect x="${cx - 16}" y="${ground - 26}" width="32" height="26" fill="url(#${u}win)"/>`;
  } else if (type === 'ring') {
    // A boxing club: an old brick hall with a fight-night banner and bulbs.
    const w = 180, h = 88, x = cx - w / 2, y = ground - h;
    s += `<path d="M${x - 4} ${y} L${cx} ${y - 22} L${x + w + 4} ${y} Z" fill="#4a2a24"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#6a3328"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${u}brick)"/>`;
    s += windows(u, x + 16, y + 10, 5, 1, 20, 16, 13, 0, rng, '#2a1a18');
    s += `<rect x="${x + 18}" y="${y + 34}" width="${w - 36}" height="20" fill="#9c2e27" stroke="#e2b447" stroke-width="1.5"/><text x="${cx}" y="${y + 48}" text-anchor="middle" font-family="Alfa Slab One, Rockwell, Georgia, serif" font-size="12" letter-spacing="1.5" fill="#f3ead3">FIGHT NIGHT</text>`;
    for (let i = 0; i < 16; i++) s += `<circle cx="${f1(x + 12 + i * ((w - 24) / 15))}" cy="${f1(y + 30 + Math.sin(i / 2.4) * 2)}" r="1.5" fill="${i % 2 ? '#ffe08a' : '#ff9a4a'}"/>`;
    s += `<path d="M${cx - 18} ${ground} V${ground - 26} a18 14 0 0 1 36 0 V${ground} Z" fill="#2a1a18"/><path d="M${cx - 15} ${ground} V${ground - 25} a15 11 0 0 1 30 0 V${ground} Z" fill="url(#${u}win)"/>`;
    s += `<rect x="${x + 12}" y="${ground - 28}" width="22" height="26" fill="#efe6cf"/><circle cx="${x + 23}" cy="${ground - 19}" r="5" fill="#9c2e27"/><rect x="${x + 15}" y="${ground - 10}" width="16" height="3" fill="#1d1b22"/><rect x="${x + w - 34}" y="${ground - 28}" width="22" height="26" fill="#e2b447"/><rect x="${x + w - 31}" y="${ground - 24}" width="16" height="3" fill="#1d1b22"/><rect x="${x + w - 31}" y="${ground - 18}" width="12" height="2" fill="#1d1b22"/>`;
  } else if (type === 'train') {
    // A brick viaduct across the scene, the night mail on top.
    const top = ground - 56;
    s += `<rect x="0" y="${top}" width="360" height="${ground - top}" fill="#5a3a2e"/><rect x="0" y="${top}" width="360" height="${ground - top}" fill="url(#${u}brick)"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="M${14 + i * 60} ${ground} V${top + 26} a23 23 0 0 1 46 0 V${ground} Z" fill="#0e1528"/>`;
    s += `<rect x="0" y="${top - 4}" width="360" height="6" fill="#3a2620"/>`;
    const tx = cx - 150;
    for (let c = 0; c < 3; c++) {
      const kx = tx + 90 + c * 72;
      s += `<rect x="${kx}" y="${top - 30}" width="66" height="24" rx="3" fill="${c === 1 ? '#8a2419' : '#7a1f16'}"/><rect x="${kx}" y="${top - 32}" width="66" height="4" rx="2" fill="#3a1410"/>`;
      for (let wdw = 0; wdw < 4; wdw++) s += `<rect x="${kx + 6 + wdw * 15}" y="${top - 25}" width="10" height="8" fill="${rng.chance(0.6) ? `url(#${u}win)` : '#2a1a18'}"/>`;
      if (c === 1) s += `<text x="${kx + 33}" y="${top - 10}" text-anchor="middle" font-size="5" font-family="system-ui,sans-serif" font-weight="800" fill="#e2b447">ROYAL MAIL</text>`;
      s += `<circle cx="${kx + 12}" cy="${top - 4}" r="4" fill="#14161f"/><circle cx="${kx + 54}" cy="${top - 4}" r="4" fill="#14161f"/>`;
    }
    s += `<rect x="${tx + 20}" y="${top - 34}" width="62" height="28" rx="4" fill="#1d2a22"/><rect x="${tx + 56}" y="${top - 46}" width="24" height="40" rx="2" fill="#24362b"/><rect x="${tx + 60}" y="${top - 42}" width="14" height="10" fill="url(#${u}win)"/><rect x="${tx + 28}" y="${top - 48}" width="9" height="16" fill="#14161f"/><path d="M${tx + 14} ${top - 6} l8 -10 v10 Z" fill="#14161f"/>`;
    s += `<circle cx="${tx + 34}" cy="${top - 4}" r="6" fill="#14161f"/><circle cx="${tx + 52}" cy="${top - 4}" r="6" fill="#14161f"/><circle cx="${tx + 70}" cy="${top - 4}" r="6" fill="#14161f"/><circle cx="${tx + 22}" cy="${top - 30}" r="5" fill="#ffe3a0"/><path d="M${tx + 22} ${top - 30} L${tx - 40} ${top - 44} L${tx - 40} ${top - 16} Z" fill="#ffe3a0" opacity=".18"/>`;
    for (let k = 0; k < 5; k++) s += `<circle cx="${f1(tx + 34 + k * 14 + rng.float(-3, 3))}" cy="${f1(top - 54 - k * 7)}" r="${f1(6 + k * 2.5)}" fill="#c9d3e6" opacity="${f1(0.35 - k * 0.05)}"/>`;
  } else {
    // show: striped marquee tent
    const w = 200, x = cx - w / 2, y = ground - 70;
    for (let i = 0; i < 10; i++) {
      const sx = x + i * (w / 10);
      s += `<path d="M${cx} ${y - 30} L${f1(sx)} ${y + 10} L${f1(sx + w / 10)} ${y + 10} Z" fill="${i % 2 ? '#efe6cf' : '#b8372e'}"/>`;
      s += `<rect x="${f1(sx)}" y="${y + 10}" width="${f1(w / 10)}" height="60" fill="${i % 2 ? '#e3d8bc' : '#9c2e27'}"/>`;
    }
    s += `<path d="M${cx} ${y - 30} V${y - 46}" stroke="#1d1b22" stroke-width="2"/><path d="M${cx} ${y - 46} l14 4 l-14 4 Z" fill="#e2b447"/>`;
    s += `<path d="M${cx - 16} ${ground} V${ground - 34} Q${cx} ${ground - 44} ${cx + 16} ${ground - 34} V${ground} Z" fill="url(#${u}win)"/>`;
    s += sign(cx, y + 22, 120, 'BEST IN SHOW', '#1d1b22', '#e2b447');
    for (let i = 0; i < 12; i++) s += `<path d="M${f1(x + i * (w / 12))} ${y + 10} l${f1(w / 24)} 7 l${f1(w / 24)} -7" fill="${['#e2b447', '#2f5d9a', '#2f7d52'][i % 3]}"/>`;
  }
  return s;
}

// Something out front that says what kind of job it is.
function props(u, type, W, ground, rng, day) {
  const x = rng.chance(0.5) ? 70 : W - 120;
  const ink = '#14161f';
  switch (type) {
    case 'van': // the armoured van, and a guard
      return `<g><rect x="${x}" y="${ground - 30}" width="56" height="26" rx="3" fill="#5a6270"/><rect x="${x + 40}" y="${ground - 24}" width="18" height="20" rx="3" fill="#4a515e"/><rect x="${x + 44}" y="${ground - 21}" width="11" height="8" fill="${day ? '#9fc3e6' : '#2a3a5a'}"/>
        <rect x="${x + 4}" y="${ground - 26}" width="34" height="10" fill="#3a404b"/><text x="${x + 21}" y="${ground - 18.5}" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" font-weight="800" fill="#e2b447">SECURI-K9</text>
        <circle cx="${x + 12}" cy="${ground - 3}" r="5" fill="${ink}"/><circle cx="${x + 46}" cy="${ground - 3}" r="5" fill="${ink}"/><circle cx="${x + 12}" cy="${ground - 3}" r="2" fill="#777"/><circle cx="${x + 46}" cy="${ground - 3}" r="2" fill="#777"/>
        <rect x="${x - 12}" y="${ground - 20}" width="7" height="14" rx="2" fill="#26314a"/><circle cx="${x - 8.5}" cy="${ground - 24}" r="4" fill="#c69064"/><rect x="${x - 13}" y="${ground - 29}" width="9" height="3" fill="#111"/></g>`;
    case 'smash': // a bin mid-flight and glass on the pavement
      return `<g><rect x="${W / 2 - 50}" y="${ground - 46}" width="12" height="15" rx="2" fill="#3c4a3a" transform="rotate(-24 ${W / 2 - 44} ${ground - 38})"/><path d="M${W / 2 - 70} ${ground - 40} q8 -4 14 -2" stroke="#fff" stroke-opacity=".5" fill="none" stroke-dasharray="2 2"/>
        ${Array.from({ length: 10 }, (_, i) => `<path d="M${f1(W / 2 - 40 + i * 9 + rng.float(-3, 3))} ${f1(ground + 2 + rng.float(0, 6))} l2 -3 l2 3 Z" fill="#cfe8ff" opacity=".8"/>`).join('')}</g>`;
    case 'con': // a red carpet and a gala sign
      return `<g><path d="M${W / 2 - 14} ${ground} L${W / 2 + 14} ${ground} L${W / 2 + 26} ${ground + 26} L${W / 2 - 26} ${ground + 26} Z" fill="#9c2e27"/>
        <rect x="${x + 4}" y="${ground - 30}" width="40" height="22" rx="2" fill="#1d1b22" stroke="#e2b447"/><text x="${x + 24}" y="${ground - 21}" text-anchor="middle" font-size="6" font-family="Alfa Slab One, Georgia, serif" fill="#e2b447">GALA</text><text x="${x + 24}" y="${ground - 13}" text-anchor="middle" font-size="5" font-family="system-ui,sans-serif" fill="#efe6cf">TONIGHT</text><rect x="${x + 22}" y="${ground - 8}" width="3" height="8" fill="${ink}"/></g>`;
    case 'swap': // a crate of replicas being delivered
      return `<g><rect x="${x}" y="${ground - 18}" width="30" height="18" fill="#a07a48" stroke="#6d5130"/><path d="M${x} ${ground - 18} l30 18 M${x + 30} ${ground - 18} l-30 18" stroke="#6d5130"/><text x="${x + 15}" y="${ground - 21}" text-anchor="middle" font-size="5" font-family="system-ui,sans-serif" font-weight="800" fill="#f3ead3">FRAGILE</text></g>`;
    case 'hack': // a van with a dish and a glowing screen
      return `<g><rect x="${x}" y="${ground - 26}" width="52" height="22" rx="4" fill="#e9e3d2"/><rect x="${x + 38}" y="${ground - 22}" width="12" height="9" fill="${day ? '#9fc3e6' : '#2a3a5a'}"/><rect x="${x + 6}" y="${ground - 21}" width="16" height="9" fill="#5fffa8" opacity=".85"/>
        <text x="${x + 26}" y="${ground - 8}" text-anchor="middle" font-size="5" font-family="system-ui,sans-serif" font-weight="800" fill="#7a2340">FLOWERS</text><path d="M${x + 20} ${ground - 26} l4 -8 M${x + 18} ${ground - 38} a8 8 0 0 0 12 8" stroke="#bbb" stroke-width="1.6" fill="none"/>
        <circle cx="${x + 10}" cy="${ground - 3}" r="4.5" fill="${ink}"/><circle cx="${x + 42}" cy="${ground - 3}" r="4.5" fill="${ink}"/></g>`;
    case 'fraud': // the job advert in the window
      return `<g><rect x="${x + 6}" y="${ground - 34}" width="36" height="14" rx="2" fill="#efe6cf" stroke="#1d1b22"/><text x="${x + 24}" y="${ground - 24.5}" text-anchor="middle" font-size="6" font-family="Alfa Slab One, Georgia, serif" fill="#9c2e27">NOW HIRING</text><rect x="${x + 22}" y="${ground - 20}" width="3" height="20" fill="${ink}"/></g>`;
    case 'tunnel': // a mound of fresh earth and a TO LET sign
      return `<g><path d="M${x - 6} ${ground} q16 -16 34 0 Z" fill="#5a3e28"/><path d="M${x + 2} ${ground - 4} q8 -6 16 0" stroke="#7a5a3a" fill="none"/><path d="M${x + 30} ${ground - 2} l6 -18" stroke="#8a6a4a" stroke-width="2"/><path d="M${x + 33} ${ground - 22} l6 2 l-3 6 l-6 -2 Z" fill="#9aa0a8"/>
        <rect x="${x + 44}" y="${ground - 30}" width="26" height="14" fill="#efe6cf" stroke="#1d1b22"/><text x="${x + 57}" y="${ground - 20}" text-anchor="middle" font-size="6.5" font-family="Alfa Slab One, Georgia, serif" fill="#9c2e27">TO LET</text><rect x="${x + 56}" y="${ground - 16}" width="2.5" height="16" fill="${ink}"/></g>`;
    case 'roof': { // a figure on the skyline and a rope down the wall
      const rx = W / 2 + 60;
      return `<g><path d="M${rx} ${ground - 92} q-3 30 1 60 q3 20 -1 32" stroke="#c9b38a" stroke-width="1.6" fill="none"/><g transform="translate(${rx - 6} ${ground - 108})"><ellipse cx="6" cy="12" rx="5" ry="7" fill="${ink}"/><circle cx="6" cy="3" r="4" fill="${ink}"/><path d="M2 1 l-3 -4 l4 2 M10 1 l3 -4 l-4 2" fill="${ink}"/><rect x="1" y="1.5" width="10" height="2" fill="#2a3a5a"/></g></g>`;
    }
    case 'fix': // the bookies next door
      return `<g><rect x="${x}" y="${ground - 34}" width="48" height="34" fill="#1f3a2a"/><rect x="${x + 2}" y="${ground - 32}" width="44" height="9" fill="#e2b447"/><text x="${x + 24}" y="${ground - 25}" text-anchor="middle" font-size="6.5" font-family="Alfa Slab One, Georgia, serif" fill="#1d1b22">BOOKIES</text><rect x="${x + 6}" y="${ground - 20}" width="18" height="14" fill="url(#${u}win)"/><rect x="${x + 30}" y="${ground - 20}" width="12" height="20" fill="#14161f"/></g>`;
    case 'train': // a railway signal, at red
      return `<g><rect x="${x + 20}" y="${ground - 46}" width="3" height="46" fill="${ink}"/><rect x="${x + 15}" y="${ground - 58}" width="13" height="16" rx="3" fill="${ink}"/><circle cx="${x + 21.5}" cy="${ground - 53}" r="3" fill="#ff5a4a"/><circle cx="${x + 21.5}" cy="${ground - 53}" r="7" fill="#ff5a4a" opacity=".25"/><circle cx="${x + 21.5}" cy="${ground - 46}" r="2.5" fill="#2a3a2a"/></g>`;
    default: // a break-in: a rope dangling from the roof
      return `<path d="M${W / 2 + 70} ${ground - 76} q-4 24 2 46 q4 16 -2 30" stroke="#c9b38a" stroke-width="1.6" fill="none"/><path d="M${W / 2 + 66} ${ground - 79} l4 3 l4 -3" stroke="#999" stroke-width="1.4" fill="none"/>`;
  }
}

// The job's scene: its venue, by day or night, in its own weather, with a hint of the job.
// compact: a shorter crop for the job board.
export function venueSVG(job, opts = {}) {
  const u = `va${++artUid}`;
  const W = 360, H = 150, ground = 124;
  const rng = makeRng({ s: hashString(job.id + job.venueName) });
  const day = job.time === 'day';
  const mood = { day, tone: rng.pick(['night', 'night', 'dusk', 'deep']), weather: rng.pick(['rain', 'rain', 'fog', 'clear', 'drizzle']) };
  if (job.twist === 'fog') mood.weather = 'fog';
  if (job.twist === 'storm') mood.weather = 'rain';
  let s = sky(u, W, H, rng, mood);
  s += rooftops(W, ground - 20, rng, day ? '#6e7f9e' : '#131c33', 30, 70);
  s += rooftops(W, ground, rng, day ? '#566682' : '#0e1528', 16, 44);
  s += building(u, job.venueType, W / 2, ground, rng);
  // street & lamp
  s += `<rect y="${ground}" width="${W}" height="${H - ground}" fill="url(#${u}street)"/>`;
  s += `<rect y="${ground}" width="${W}" height="2" fill="#000" opacity=".25"/>`;
  for (let i = 0; i < 40; i++) s += `<ellipse cx="${f1(rng.float(0, W))}" cy="${f1(rng.float(ground + 4, H - 2))}" rx="${f1(rng.float(3, 6))}" ry="1.4" fill="#fff" opacity="${mood.weather === 'clear' ? 0.03 : 0.06}"/>`;
  // Wet street: the building's lights shine back up from the road.
  if (!day && mood.weather !== 'clear') {
    for (let i = 0; i < 7; i++) {
      const rx = W / 2 - 84 + i * 28 + rng.float(-6, 6);
      for (let k = 0; k < 4; k++) s += `<rect x="${f1(rx + rng.float(-2, 2))}" y="${f1(ground + 4 + k * 5)}" width="${f1(rng.float(4, 9) - k)}" height="1.2" rx=".6" fill="#ffd27a" opacity="${f1(0.28 - k * 0.06)}"/>`;
    }
  }
  const lx = rng.chance(0.5) ? 34 : W - 34;
  s += `<path d="M${lx - 40} ${H} L${lx - 4} ${ground - 58} L${lx + 4} ${ground - 58} L${lx + 40} ${H} Z" fill="url(#${u}lamp)"/>`;
  s += `<rect x="${lx - 1.5}" y="${ground - 56}" width="3" height="58" fill="#0a0d16"/><path d="M${lx - 7} ${ground - 58} h14 l-3 -10 h-8 Z" fill="#0a0d16"/><rect x="${lx - 4}" y="${ground - 66}" width="8" height="8" fill="${day ? '#cfd8e3' : '#ffe3a0'}"/>`;
  if (!day) s += `<circle cx="${lx}" cy="${ground - 62}" r="14" fill="#ffd27a" opacity=".25"/><ellipse cx="${lx}" cy="${ground + 14}" rx="22" ry="3" fill="#ffd27a" opacity=".18"/>`;
  s += props(u, job.type || 'breakin', W, ground, rng, day);
  s += `<rect y="${ground - 40}" width="${W}" height="${H - ground + 40}" fill="url(#${u}fog)"/>`;
  if (mood.weather === 'fog') s += `<rect width="${W}" height="${H}" fill="#c9d3e6" opacity="${day ? 0.25 : 0.12}"/>`;
  // rain or drizzle
  if (mood.weather === 'rain' || mood.weather === 'drizzle') {
    let rain = '';
    const n = mood.weather === 'rain' ? 46 : 20;
    for (let i = 0; i < n; i++) { const x = rng.float(0, W), y = rng.float(0, H); rain += `M${f1(x)} ${f1(y)} l-3 10 `; }
    s += `<path d="${rain}" stroke="#bcd3f5" stroke-opacity="${day ? 0.3 : 0.18}" stroke-width=".8"/>`;
  }
  if (job.twist === 'storm') {
    const bx = rng.float(40, W - 40);
    s += `<rect width="${W}" height="${H}" fill="#dfe8ff" opacity=".07"/><path d="M${f1(bx)} 0 l-8 22 l7 -2 l-10 26 l6 -2 l-9 22" stroke="#fff6c8" stroke-width="2" fill="none" stroke-linejoin="round" opacity=".9"/>`;
  }
  return `<svg class="venue-art ${opts.compact ? 'compact' : ''}" viewBox="0 0 ${W} ${H}" ${opts.compact ? 'preserveAspectRatio="xMidYMid slice"' : ''} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(job.venueName)} ${day ? 'by day' : 'at night'}">${s}</svg>`;
}

export function skylineSVG(seed = 7) {
  const u = `sk${++artUid}`;
  const W = 400, H = 150, base = 150;
  const rng = makeRng({ s: seed });
  let s = `<defs><linearGradient id="${u}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a30" stop-opacity="0"/><stop offset="1" stop-color="#101a30"/></linearGradient>
  <linearGradient id="${u}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb2d6" stop-opacity="0"/><stop offset="1" stop-color="#9fb2d6" stop-opacity=".22"/></linearGradient></defs>`;
  s += rooftops(W, base - 30, rng, '#1a2646', 30, 80);
  // a clock tower and a gasholder, generic city landmarks
  s += `<rect x="300" y="${base - 128}" width="22" height="100" fill="#1a2646"/><path d="M296 ${base - 128} L311 ${base - 150} L326 ${base - 128} Z" fill="#1a2646"/><circle cx="311" cy="${base - 112}" r="7" fill="#f3dfa0" opacity=".85"/><path d="M311 ${base - 112} v-5 M311 ${base - 112} h4" stroke="#1a2646" stroke-width="1.4"/>`;
  s += `<rect y="${base - 60}" width="${W}" height="60" fill="url(#${u}m)"/>`;
  s += rooftops(W, base, rng, '#0c1326', 20, 58);
  s += `<rect y="${base - 40}" width="${W}" height="40" fill="url(#${u}f)"/>`;
  return `<svg class="skyline" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${s}</svg>`;
}

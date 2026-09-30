// Scenic SVG illustrations: a night-time facade for each venue type (job
// board banner) and the rooftop skyline on the title screen. Seeded, so a
// given job always looks the same.
import { makeRng, hashString } from './rng.js';

let artUid = 0;
const f1 = (n) => n.toFixed(1);

function sky(u, W, H, rng) {
  let s = `<defs>
    <linearGradient id="${u}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1226"/><stop offset=".7" stop-color="#1d2f59"/><stop offset="1" stop-color="#2d3f6b"/></linearGradient>
    <radialGradient id="${u}moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff8dc" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}lamp" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}win" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#f0b24a"/></radialGradient>
    <linearGradient id="${u}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb2d6" stop-opacity="0"/><stop offset="1" stop-color="#9fb2d6" stop-opacity=".28"/></linearGradient>
    <linearGradient id="${u}street" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2238"/><stop offset="1" stop-color="#0b0f1c"/></linearGradient>
  </defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#${u}sky)"/>`;
  for (let i = 0; i < 18; i++) s += `<circle cx="${f1(rng.float(0, W))}" cy="${f1(rng.float(2, H * 0.4))}" r="${f1(rng.float(0.4, 1.1))}" fill="#fff" opacity="${f1(rng.float(0.3, 0.8))}"/>`;
  const mx = rng.float(W * 0.65, W * 0.92), my = rng.float(18, 32);
  s += `<circle cx="${f1(mx)}" cy="${f1(my)}" r="30" fill="url(#${u}moon)"/><circle cx="${f1(mx)}" cy="${f1(my)}" r="11" fill="#f6efd6"/><circle cx="${f1(mx + 5)}" cy="${f1(my - 3)}" r="10" fill="#1a2a50" opacity=".9"/>`;
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
      if (lit) s += `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" fill="#ffd27a" opacity=".12"/>`;
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
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${stone}"/>`;
    s += `<path d="M${x} ${y} h${w} v6 h${-w} Z" fill="${stoneDk}"/>`;
    for (let r = 1; r < h / 9; r++) s += `<path d="M${x} ${y + r * 9} h${w}" stroke="${stoneDk}" stroke-opacity=".35"/>`;
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
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${brick}"/>`;
    for (let r = 0; r < h / 6; r++) s += `<path d="M${x} ${y + r * 6} h${w}" stroke="#000" stroke-opacity=".12"/>`;
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
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#8a4a38"/>`;
    for (let r = 0; r < h / 6; r++) s += `<path d="M${x} ${y + r * 6} h${w}" stroke="#000" stroke-opacity=".12"/>`;
    s += windows(u, x + 16, y + 10, 5, 2, 20, 22, 18, 12, rng, '#efe6cf');
    s += `<path d="M${cx - 14} ${ground} V${ground - 30} a14 14 0 0 1 28 0 V${ground} Z" fill="#2b3b30" stroke="#efe6cf" stroke-width="2"/><circle cx="${cx + 20}" cy="${ground - 34}" r="3" fill="#ffd27a"/>`;
    s += `<ellipse cx="${x + 10}" cy="${ground - 4}" rx="18" ry="9" fill="#1f3a2a"/><ellipse cx="${x + w - 10}" cy="${ground - 4}" rx="18" ry="9" fill="#1f3a2a"/>`;
  } else if (type === 'casino') {
    const w = 190, h = 90, x = cx - w / 2, y = ground - h;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#241a2e"/>`;
    s += windows(u, x + 14, y + 36, 6, 1, 18, 16, 11, 0, rng, '#120d18');
    s += `<rect x="${x + 20}" y="${y + 6}" width="${w - 40}" height="24" rx="4" fill="#3a1030" stroke="#ff5ca8" stroke-width="2"/>`;
    s += `<text x="${cx}" y="${y + 23}" text-anchor="middle" font-family="Alfa Slab One, Rockwell, Georgia, serif" font-size="14" letter-spacing="2" fill="#ffd3ea">CASINO</text>`;
    for (let i = 0; i < 18; i++) s += `<circle cx="${f1(x + 22 + i * ((w - 44) / 17))}" cy="${y + 4}" r="1.6" fill="${i % 2 ? '#ffe08a' : '#ff9a4a'}"/>`;
    s += `<path d="M${x + 30} ${ground - 26} h${w - 60} l8 -10 h${-w + 44} Z" fill="#7a1f16"/>`;
    for (let i = 0; i < 14; i++) s += `<circle cx="${f1(x + 26 + i * ((w - 52) / 13))}" cy="${ground - 36}" r="1.4" fill="#ffe08a"/>`;
    s += `<rect x="${cx - 16}" y="${ground - 26}" width="32" height="26" fill="url(#${u}win)"/>`;
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

export function venueSVG(job) {
  const u = `va${++artUid}`;
  const W = 360, H = 150, ground = 124;
  const rng = makeRng({ s: hashString(job.id + job.venueName) });
  let s = sky(u, W, H, rng);
  s += rooftops(W, ground - 20, rng, '#131c33', 30, 70);
  s += rooftops(W, ground, rng, '#0e1528', 16, 44);
  s += building(u, job.venueType, W / 2, ground, rng);
  // street & lamp
  s += `<rect y="${ground}" width="${W}" height="${H - ground}" fill="url(#${u}street)"/>`;
  for (let i = 0; i < 40; i++) s += `<ellipse cx="${f1(rng.float(0, W))}" cy="${f1(rng.float(ground + 4, H - 2))}" rx="${f1(rng.float(3, 6))}" ry="1.4" fill="#fff" opacity=".06"/>`;
  const lx = rng.chance(0.5) ? 34 : W - 34;
  s += `<path d="M${lx - 40} ${H} L${lx - 4} ${ground - 58} L${lx + 4} ${ground - 58} L${lx + 40} ${H} Z" fill="url(#${u}lamp)"/>`;
  s += `<rect x="${lx - 1.5}" y="${ground - 56}" width="3" height="58" fill="#0a0d16"/><path d="M${lx - 7} ${ground - 58} h14 l-3 -10 h-8 Z" fill="#0a0d16"/><rect x="${lx - 4}" y="${ground - 66}" width="8" height="8" fill="#ffe3a0"/><circle cx="${lx}" cy="${ground - 62}" r="14" fill="#ffd27a" opacity=".25"/>`;
  s += `<ellipse cx="${lx}" cy="${ground + 14}" rx="22" ry="3" fill="#ffd27a" opacity=".18"/>`;
  s += `<rect y="${ground - 40}" width="${W}" height="${H - ground + 40}" fill="url(#${u}fog)"/>`;
  // rain
  let rain = '';
  for (let i = 0; i < 40; i++) { const x = rng.float(0, W), y = rng.float(0, H); rain += `M${f1(x)} ${f1(y)} l-3 10 `; }
  s += `<path d="${rain}" stroke="#bcd3f5" stroke-opacity=".18" stroke-width=".8"/>`;
  return `<svg class="venue-art" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${job.venueName.replace(/[&<>"]/g, "")} at night">${s}</svg>`;
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

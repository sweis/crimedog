// Shareable "wanted poster" snapshot of a crew member, rendered as SVG then
// rasterised to PNG for the Web Share API (or a download fallback).
import { BREEDS, FACTIONS, SKILL_INFO, TALENTS, QUIRKS, RARITY, SIGNATURES, JOB_TYPES } from './data.js';
import { portraitSVG, displayName, relationLabel, topSkills } from './dogs.js';
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

function cardSVG(dog) {
  const W = 600, H = 860;
  const b = BREEDS[dog.breed];
  const known = topSkills(dog, 10).filter(([s]) => dog.known.skills[s]);
  const specialty = known.length ? `${SKILL_INFO[known[0][0]].label} ${known[0][1]}` : 'Unknown';
  const portrait = portraitSVG(dog, { size: 300, bg: '#e9dcc3' }).replace('<svg ', '<svg x="150" y="118" ');
  const nameLines = wrap(displayName(dog), 26);
  let y = 470;
  let t = '';
  for (const l of nameLines) { t += `<text x="300" y="${y}" text-anchor="middle" font-size="34" font-weight="900" font-family="Georgia,serif" fill="#1d1b22">${esc(l)}</text>`; y += 40; }
  t += `<text x="300" y="${y}" text-anchor="middle" font-size="20" fill="#5a5347" font-family="system-ui,sans-serif">${esc(b.label)} · ${esc(FACTIONS[dog.faction].label)}</text>`;
  y += 44;
  const row = (label, value) => {
    const s = `<text x="60" y="${y}" font-size="19" font-family="system-ui,sans-serif" fill="#5a5347">${esc(label)}</text><text x="540" y="${y}" text-anchor="end" font-size="19" font-weight="700" font-family="system-ui,sans-serif" fill="#1d1b22">${esc(value)}</text><line x1="60" x2="540" y1="${y + 12}" y2="${y + 12}" stroke="#cdbb95" stroke-dasharray="4 4"/>`;
    y += 40;
    return s;
  };
  t += row('Specialty', specialty);
  t += row('Relationship', relationLabel(dog));
  t += row('Jobs together', String(dog.jobs));
  const talents = dog.known.talents.map((x) => TALENTS[x]?.name).filter(Boolean);
  const quirks = dog.known.quirks.map((x) => QUIRKS[x]?.name).filter(Boolean);
  t += row('Known for', talents.slice(0, 2).join(', ') || quirks[0] || '???');
  y += 6;
  // Stars get a ribbon across the foot of the portrait and a matching frame.
  const frame = dog.rarity === 'legendary' ? '#d6a93b' : dog.rarity === 'rare' ? '#6fa8dc' : '#d6a93b';
  const ribbon = dog.rarity ? `<rect x="70" y="388" width="460" height="40" rx="8" fill="${frame}" stroke="#1d1b22" stroke-width="2"/><text x="300" y="414" text-anchor="middle" font-size="17" font-weight="900" letter-spacing="1" font-family="system-ui,sans-serif" fill="#1d1b22">${esc(`${RARITY[dog.rarity].icon} ${RARITY[dog.rarity].label.toUpperCase()}${dog.signature ? ` · ${SIGNATURES[dog.signature].name.toUpperCase()}` : ''}`)}</text>` : '';
  for (const l of wrap(`"${dog.catchphrase}"`, 40)) { t += `<text x="300" y="${y}" text-anchor="middle" font-size="21" font-style="italic" font-family="Georgia,serif" fill="#1d1b22">${esc(l)}</text>`; y += 28; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#101a30"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="22" fill="#f4ead3"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="16" fill="none" stroke="${frame}" stroke-width="${dog.rarity ? 8 : 4}"/>
  <text x="300" y="92" text-anchor="middle" font-size="44" font-weight="900" letter-spacing="6" font-family="Georgia,serif" fill="#a57e1f">CRIMEDOG</text>
  ${portrait}
  <rect x="150" y="118" width="300" height="300" fill="none" stroke="#1d1b22" stroke-width="3" rx="14"/>
  ${ribbon}
  ${t}
  <text x="300" y="${H - 50}" text-anchor="middle" font-size="16" fill="#5a5347" font-family="system-ui,sans-serif">A heist game. For dogs.</text>
  </svg>`;
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
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A crew member's card: the image plus what to call it when shared.
export async function cardPNG(dog) {
  return {
    blob: await svgPNG(cardSVG(dog)),
    file: `crimedog-${dog.first.toLowerCase()}.png`,
    title: displayName(dog),
    text: `${displayName(dog)}: "${dog.catchphrase}" #Crimedog`,
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

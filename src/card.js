// Shareable "wanted poster" snapshot of a crew member, rendered as SVG then
// rasterised to PNG for the Web Share API (or a download fallback).
import { BREEDS, FACTIONS, SKILL_INFO, TALENTS, QUIRKS } from './data.js';
import { portraitSVG, displayName, relationLabel, skillOf, topSkills } from './dogs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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

export function cardSVG(dog) {
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
  for (const l of wrap(`"${dog.catchphrase}"`, 40)) { t += `<text x="300" y="${y}" text-anchor="middle" font-size="21" font-style="italic" font-family="Georgia,serif" fill="#1d1b22">${esc(l)}</text>`; y += 28; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#101a30"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="22" fill="#f4ead3"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="16" fill="none" stroke="#d6a93b" stroke-width="4"/>
  <text x="300" y="92" text-anchor="middle" font-size="44" font-weight="900" letter-spacing="6" font-family="Georgia,serif" fill="#a57e1f">CRIMEDOG</text>
  ${portrait}
  <rect x="150" y="118" width="300" height="300" fill="none" stroke="#1d1b22" stroke-width="3" rx="14"/>
  ${t}
  <text x="300" y="${H - 50}" text-anchor="middle" font-size="16" fill="#5a5347" font-family="system-ui,sans-serif">A heist game. For dogs.</text>
  </svg>`;
}

export async function cardPNG(dog) {
  const svg = cardSVG(dog);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = 600; c.height = 860;
    c.getContext('2d').drawImage(img, 0, 0);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Try the native share sheet; the caller shows the PNG in a modal either way,
// so players inside sandboxed viewers can long-press to save it.
export async function shareBlob(dog, blob) {
  const name = `crimedog-${dog.first.toLowerCase()}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const text = `${displayName(dog)}: "${dog.catchphrase}" #Crimedog`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: displayName(dog), text });
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

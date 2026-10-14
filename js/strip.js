// The day strip: 24 hours of real light at the edition's city, the newsroom's pulse as bars,
// the chosen few as numbered points, and a mark for when you were last here.
// Everything is sized in screen pixels, so it reads the same on a phone and a desk.
import { CITIES, solarElevation, skyColour } from './sun.js';
import { urlFor } from './snapshot.js';

const fmtHour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit' });
const PILLARS = ['news', 'opinion', 'sport', 'arts', 'lifestyle', 'none'];
let resizeTimer = null;
let last = null;

export function renderStrip(el, opts) {
  last = { el, opts };
  draw(el, opts);
  if (!el.dataset.resizeWired) {
    el.dataset.resizeWired = '1';
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (last) draw(last.el, { ...last.opts, quiet: true }); }, 150);
    });
  }
}

function draw(el, { snap, edition, chosen, lastVisit, quiet = false }) {
  const W = Math.max(300, el.clientWidth || 600);
  const narrow = W < 600;
  const wide = W >= 900;
  const H = narrow ? 210 : 200;
  const BAND = 20;
  const BARS = narrow ? 44 : 54;        // height given to the pulse bars
  const R = narrow ? 13 : 11;
  const skyH = H - BAND;
  const laneTop = narrow ? 44 : 30;
  const laneBottom = skyH - BARS - R - (wide ? 18 : 6);
  const LANES = [laneTop, (laneTop + laneBottom) / 2, laneBottom];

  const from = new Date(snap.window.from).getTime();
  const to = new Date(snap.window.to).getTime();
  const x = (t) => ((t - from) / (to - from)) * W;
  const city = CITIES[edition];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('class', 'strip' + (quiet ? ' is-quiet' : ''));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `The last 24 hours as light over ${city.name}. Bars show how many pieces were published every 20 minutes, ${snap.counts.published24h} in all. The ${chosen.length} chosen for you are numbered points.`);

  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `<clipPath id="strip-reveal"><rect class="reveal" x="0" y="0" width="${W}" height="${H}" style="--w:${W}px"/></clipPath>`;
  svg.appendChild(defs);

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('clip-path', 'url(#strip-reveal)');

  // Sky, every 20 minutes.
  const steps = 72;
  let sky = '';
  for (let i = 0; i < steps; i++) {
    const t = from + (to - from) * (i + 0.5) / steps;
    const elev = solarElevation(new Date(t), city.lat, city.lon);
    sky += `<rect x="${(W * i / steps).toFixed(1)}" y="0" width="${(W / steps + 0.7).toFixed(1)}" height="${skyH}" fill="${skyColour(elev)}"/>`;
  }

  // The pulse: pieces published per 20 minutes, stacked by pillar.
  const buckets = Array.from({ length: steps }, () => Object.fromEntries(PILLARS.map(p => [p, 0])));
  for (const id of snap.day) {
    const it = snap.items[id];
    if (!it) continue;
    const i = Math.min(steps - 1, Math.max(0, Math.floor((new Date(it.published).getTime() - from) / (to - from) * steps)));
    buckets[i][PILLARS.includes(it.pillar) ? it.pillar : 'none']++;
  }
  const peak = Math.max(1, ...buckets.map(b => Object.values(b).reduce((a, c) => a + c, 0)));
  const bw = W / steps;
  let bars = '';
  buckets.forEach((b, i) => {
    let y = skyH - 2;
    for (const p of PILLARS) {
      if (!b[p]) continue;
      const h = (b[p] / peak) * BARS;
      y -= h;
      bars += `<rect class="bar p-${p}" x="${(i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}"/>`;
    }
  });
  g.innerHTML = sky + `<g class="bars">${bars}</g>`;
  svg.appendChild(g);

  // Before your last visit, the strip is faded.
  if (lastVisit && lastVisit > from && lastVisit < to) {
    const veil = document.createElementNS(ns, 'rect');
    veil.setAttribute('class', 'before');
    veil.setAttribute('x', 0); veil.setAttribute('y', 0);
    veil.setAttribute('width', x(lastVisit).toFixed(1)); veil.setAttribute('height', skyH);
    svg.appendChild(veil);
  }

  // Hour labels in the reader's local time.
  let band = `<rect x="0" y="${skyH}" width="${W}" height="${BAND}" class="band"/>`;
  const firstHour = new Date(from); firstHour.setMinutes(0, 0, 0);
  const every = narrow ? 6 : 3;
  for (let t = firstHour.getTime(); t <= to; t += 3600 * 1000) {
    const d = new Date(t);
    if (d.getHours() % every !== 0 || t < from) continue;
    if (x(t) < 14 || x(t) > W - 14) continue;
    band += `<text class="hour" x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmtHour.format(d)}</text>`;
  }
  const bandG = document.createElementNS(ns, 'g');
  bandG.innerHTML = band;
  svg.appendChild(bandG);

  // Words inside the picture, so it needs no caption.
  const words = document.createElementNS(ns, 'g');
  words.setAttribute('class', 'words');
    words.innerHTML = `<text class="count" x="8" y="18" text-anchor="start">${snap.counts.published24h} pieces published${narrow ? '' : ' in 24 hours'}. ${chosen.length} for you, numbered.</text>`;
  svg.appendChild(words);

  if (lastVisit) {
    const inWindow = lastVisit >= from && lastVisit <= to;
    const lx = inWindow ? x(lastVisit) : 0;
    const marker = document.createElementNS(ns, 'g');
    marker.setAttribute('class', 'visit');
    const label = inWindow ? 'you were here' : 'you were here, before this';
    const flip = lx > W - 140;
    marker.innerHTML = `<line x1="${lx.toFixed(1)}" y1="0" x2="${lx.toFixed(1)}" y2="${skyH}"/>` +
      `<text x="${(flip ? lx - 6 : lx + 6).toFixed(1)}" y="${skyH - BARS - 10}" text-anchor="${flip ? 'end' : 'start'}">${label}</text>`;
    svg.appendChild(marker);
  }

  // The chosen few, as numbered points you can open, with a few words each where there is room.
  const pts = chosen.map((p, i) => ({ p, i, px: x(new Date(p.published).getTime()) })).sort((a, b) => a.px - b.px);
  const points = document.createElementNS(ns, 'g');
  points.setAttribute('class', 'points');
  const placed = [];
  pts.forEach((pt, k) => {
    const px = Math.max(R + 2, Math.min(W - R - 2, pt.px));
    const lane = k % LANES.length;
    const py = LANES[lane];
    const a = document.createElementNS(ns, 'a');
    a.setAttribute('href', urlFor(pt.p.id));
    a.setAttribute('class', `point p-${pt.p.pillar || 'none'}`);
    a.style.animationDelay = `${(0.3 + 2.0 * px / W).toFixed(2)}s`;
    let label = '';
    if (wide) {
      const room = !placed.some(q => q.lane === lane && Math.abs(q.px - px) < 200);
      if (room) {
        const short = shorten(pt.p.title, 30);
        const anchor = px < 120 ? 'start' : px > W - 120 ? 'end' : 'middle';
        const lx = anchor === 'start' ? px - R : anchor === 'end' ? px + R : px;
        label = `<text class="label" x="${lx.toFixed(1)}" y="${py + R + 14}" text-anchor="${anchor}">${escapeXml(short)}</text>`;
        placed.push({ lane, px });
      }
    }
    a.innerHTML = `<title>${escapeXml(pt.p.title)}</title><circle class="hit" cx="${px.toFixed(1)}" cy="${py}" r="${R + 9}"/><circle class="dot" cx="${px.toFixed(1)}" cy="${py}" r="${R}"/><text class="num" x="${px.toFixed(1)}" y="${py + 4}" text-anchor="middle">${pt.i + 1}</text>${label}`;
    const show = () => el.dispatchEvent(new CustomEvent('point', { detail: pt.p }));
    a.addEventListener('mouseenter', show);
    a.addEventListener('focus', show);
    points.appendChild(a);
  });
  svg.appendChild(points);
  el.replaceChildren(svg);
}

function shorten(title, max) {
  const clean = title.replace(/^[‘“"]/, '').replace(/[’”"](?=:)/, '').replace(/\s+[–-]\s+.*$/, '');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max).replace(/\s+\S*$/, '');
  return cut + '…';
}
function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

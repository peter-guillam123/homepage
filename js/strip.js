// The day strip: 24 hours of real light at the edition's city, every piece published as a tick,
// the chosen few as numbered points, and a mark for when you were last here.
// Everything is sized in screen pixels, so it reads the same on a phone and a desk.
import { CITIES, solarElevation, skyColour } from './sun.js';
import { urlFor } from './snapshot.js';

const fmtHour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit' });
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
  const H = narrow ? 190 : 170;
  const BAND = 20;                      // hour labels
  const TICKS = 16;                     // the published-piece ticks
  const R = narrow ? 13 : 11;           // point radius
  const skyH = H - BAND;
  const laneTop = 30, laneBottom = skyH - TICKS - R - 6;
  const LANES = narrow ? [laneTop, (laneTop + laneBottom) / 2, laneBottom] : [laneTop + 8, (laneTop + laneBottom) / 2, laneBottom - 4];

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
  svg.setAttribute('aria-label', `The last 24 hours as light over ${city.name}. ${snap.counts.published24h} pieces published, shown as ticks. The ${chosen.length} chosen for you are numbered points.`);

  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `<clipPath id="strip-reveal"><rect class="reveal" x="0" y="0" width="${W}" height="${H}" style="--w:${W}px"/></clipPath>`;
  svg.appendChild(defs);

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('clip-path', 'url(#strip-reveal)');
  const steps = 72;
  let sky = '';
  for (let i = 0; i < steps; i++) {
    const t = from + (to - from) * (i + 0.5) / steps;
    const elev = solarElevation(new Date(t), city.lat, city.lon);
    sky += `<rect x="${(W * i / steps).toFixed(1)}" y="0" width="${(W / steps + 0.7).toFixed(1)}" height="${skyH}" fill="${skyColour(elev)}"/>`;
  }
  let ticks = '';
  for (const id of snap.day) {
    const it = snap.items[id];
    if (!it) continue;
    const px = x(new Date(it.published).getTime()).toFixed(1);
    ticks += `<line class="tick p-${it.pillar || 'none'}" x1="${px}" y1="${skyH - TICKS}" x2="${px}" y2="${skyH - 2}"/>`;
  }
  g.innerHTML = sky + `<g class="ticks">${ticks}</g>`;
  svg.appendChild(g);

  let band = `<rect x="0" y="${skyH}" width="${W}" height="${BAND}" class="band"/>`;
  const firstHour = new Date(from); firstHour.setMinutes(0, 0, 0);
  const every = narrow ? 6 : 3;
  for (let t = firstHour.getTime(); t <= to; t += 3600 * 1000) {
    const d = new Date(t);
    if (d.getHours() % every !== 0 || t < from) continue;
    band += `<text class="hour" x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmtHour.format(d)}</text>`;
  }
  const bandG = document.createElementNS(ns, 'g');
  bandG.innerHTML = band;
  svg.appendChild(bandG);

  if (lastVisit) {
    const inWindow = lastVisit >= from && lastVisit <= to;
    const lx = inWindow ? x(lastVisit) : 0;
    const marker = document.createElementNS(ns, 'g');
    marker.setAttribute('class', 'visit');
    const label = inWindow ? 'you were here' : 'you were here, before this';
    marker.innerHTML = `<line x1="${lx.toFixed(1)}" y1="0" x2="${lx.toFixed(1)}" y2="${skyH}"/>` +
      `<text x="${(lx + 6).toFixed(1)}" y="16">${label}</text>`;
    svg.appendChild(marker);
  }
  const nowG = document.createElementNS(ns, 'g');
  nowG.setAttribute('class', 'now');
  nowG.innerHTML = `<text x="${W - 6}" y="16" text-anchor="end">now</text>`;
  svg.appendChild(nowG);

  const pts = chosen.map((p, i) => ({ p, i, px: x(new Date(p.published).getTime()) })).sort((a, b) => a.px - b.px);
  const points = document.createElementNS(ns, 'g');
  points.setAttribute('class', 'points');
  pts.forEach((pt, k) => {
    const px = Math.max(R + 2, Math.min(W - R - 2, pt.px));
    const py = LANES[k % LANES.length];
    const a = document.createElementNS(ns, 'a');
    a.setAttribute('href', urlFor(pt.p.id));
    a.setAttribute('class', 'point');
    a.style.animationDelay = `${(0.3 + 2.0 * px / W).toFixed(2)}s`;
    a.innerHTML = `<title>${escapeXml(pt.p.title)}</title><circle class="hit" cx="${px.toFixed(1)}" cy="${py}" r="${R + 9}"/><circle cx="${px.toFixed(1)}" cy="${py}" r="${R}"/><text x="${px.toFixed(1)}" y="${py + 4}" text-anchor="middle">${pt.i + 1}</text>`;
    const show = () => el.dispatchEvent(new CustomEvent('point', { detail: pt.p }));
    a.addEventListener('mouseenter', show);
    a.addEventListener('focus', show);
    points.appendChild(a);
  });
  svg.appendChild(points);
  el.replaceChildren(svg);
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

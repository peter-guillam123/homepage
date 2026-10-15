// The day strip: 24 hours of real light at the edition's city, the newsroom's pulse as bars,
// the chosen few as labelled points, and a mark for when you were last here.
// Everything is sized in screen pixels, so it reads the same on a phone and a desk.
import { CITIES, solarElevation, skyColour } from './sun.js';
import { urlFor } from './snapshot.js';

const fmtHour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit' });
const PILLARS = ['news', 'opinion', 'sport', 'arts', 'lifestyle', 'none'];
const NS = 'http://www.w3.org/2000/svg';
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

function make(tag, attrs = {}, text = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

function draw(el, { snap, edition, chosen, lastVisit, quiet = false }) {
  const W = Math.max(300, el.clientWidth || 600);
  const narrow = W < 600;
  const words = W >= 760;
  const H = narrow ? 200 : 240;
  const BAND = 22;
  const BARS = narrow ? 40 : 46;
  const skyH = H - BAND;
  const PILL = 26;                      // pill height, badge diameter
  const laneGap = 8;
  const lanesTop = 40;
  const lanesBottom = skyH - BARS - 8;
  const laneCount = narrow ? 3 : 4;
  const laneStep = Math.max(PILL + laneGap, (lanesBottom - lanesTop - PILL) / (laneCount - 1));
  const LANES = Array.from({ length: laneCount }, (_, i) => lanesTop + i * laneStep);

  const from = new Date(snap.window.from).getTime();
  const to = new Date(snap.window.to).getTime();
  const x = (t) => ((t - from) / (to - from)) * W;
  const city = CITIES[edition];

  const svg = make('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
    class: 'strip' + (quiet ? ' is-quiet' : ''),
    'aria-label': `The last 24 hours as light over ${city.name}. Bars show how many pieces were published every 20 minutes, ${snap.counts.published24h} in all. The ${chosen.length} chosen for you are numbered.`,
  });
  const defs = make('defs');
  defs.innerHTML = `<clipPath id="strip-reveal"><rect class="reveal" x="0" y="0" width="${W}" height="${H}" style="--w:${W}px"/></clipPath>`;
  svg.appendChild(defs);

  // Sky and pulse, every 20 minutes.
  const steps = 72;
  const skyAt = [];
  let sky = '';
  for (let i = 0; i < steps; i++) {
    const t = from + (to - from) * (i + 0.5) / steps;
    const colour = skyColour(solarElevation(new Date(t), city.lat, city.lon));
    skyAt.push(colour);
    sky += `<rect x="${(W * i / steps).toFixed(1)}" y="0" width="${(W / steps + 0.7).toFixed(1)}" height="${skyH}" fill="${colour}"/>`;
  }
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
  const g = make('g', { 'clip-path': 'url(#strip-reveal)' });
  g.innerHTML = sky + `<g class="bars">${bars}</g>`;
  svg.appendChild(g);

  if (lastVisit && lastVisit > from && lastVisit < to) {
    svg.appendChild(make('rect', { class: 'before', x: 0, y: 0, width: x(lastVisit).toFixed(1), height: skyH }));
  }

  // Hour band, with the visit mark living in it.
  const bandG = make('g');
  bandG.appendChild(make('rect', { class: 'band', x: 0, y: skyH, width: W, height: BAND }));
  const visitX = lastVisit && lastVisit >= from && lastVisit <= to ? x(lastVisit) : (lastVisit ? 0 : null);
  const firstHour = new Date(from); firstHour.setMinutes(0, 0, 0);
  const every = narrow ? 6 : 3;
  for (let t = firstHour.getTime(); t <= to; t += 3600 * 1000) {
    const d = new Date(t);
    if (d.getHours() % every !== 0 || t < from) continue;
    const hx = x(t);
    if (hx < 14 || hx > W - 14) continue;
    if (visitX != null && Math.abs(hx - visitX) < (narrow ? 70 : 90)) continue;
    bandG.appendChild(make('text', { class: 'hour', x: hx.toFixed(1), y: H - 7, 'text-anchor': 'middle' }, fmtHour.format(d)));
  }
  svg.appendChild(bandG);

  if (visitX != null) {
    const marker = make('g', { class: 'visit' });
    marker.appendChild(make('line', { x1: visitX.toFixed(1), y1: 0, x2: visitX.toFixed(1), y2: skyH }));
    const flip = visitX > W - 120;
    const label = visitX === 0 && lastVisit < from ? 'you were here, before this' : 'you were here';
    marker.appendChild(make('text', { x: (flip ? visitX - 6 : visitX + 6).toFixed(1), y: H - 7, 'text-anchor': flip ? 'end' : 'start' }, label));
    svg.appendChild(marker);
  }

  el.replaceChildren(svg);

  // Pills: the count, then the chosen few. Measured in the DOM so nothing overlaps.
  const lum = (px) => {
    const c = skyAt[Math.min(steps - 1, Math.max(0, Math.floor(px / bw)))].match(/\d+/g).map(Number);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  };
  const pills = make('g', { class: 'pills' });
  svg.appendChild(pills);
  const lanes = Array.from({ length: laneCount }, () => []);
  const fits = (lane, left, right) => !lanes[lane].some(([a, b]) => left < b + 8 && right > a - 8);

  // The count, top left, in lane 0.
  const countText = `${snap.counts.published24h} pieces published${narrow ? '' : ' in 24 hours'} · ${chosen.length} for you`;
  const count = pill(pills, { x: 8, y: 10, text: countText, dark: lum(8) < 0.45, badge: null, size: 12 });
  lanes[0].push([0, 8 + count.width]);

  const pts = chosen.map((p, i) => ({ p, i, px: x(new Date(p.published).getTime()) })).sort((a, b) => a.px - b.px);
  const labelFor = (p) => (snap.labels && snap.labels.text && snap.labels.text[p.id]) || p.topic || shorten(p.title);

  // Phase one: every point gets a badge, in whichever lane has most room around it.
  // Nothing can overlap after this, whatever happens to the words.
  const roomIn = (lane, left, right) => {
    if (!fits(lane, left, right)) return -1;
    const before = lanes[lane].filter(([, b]) => b <= left).map(([, b]) => left - b);
    const after = lanes[lane].filter(([a]) => a >= right).map(([a]) => a - right);
    return Math.min(left, ...before) + Math.min(W - right, ...after);
  };
  const reserved = pts.map(pt => {
    const px = Math.max(PILL / 2 + 2, Math.min(W - PILL / 2 - 2, pt.px));
    let best = null;
    for (let l = 0; l < laneCount; l++) {
      const room = roomIn(l, px - PILL / 2, px + PILL / 2);
      if (room >= 0 && (!best || room > best.room)) best = { lane: l, room };
    }
    if (!best) best = { lane: pt.i % laneCount, room: 0 };
    const box = [px - PILL / 2, px + PILL / 2];
    lanes[best.lane].push(box);
    return { pt, px, lane: best.lane, box };
  });

  // Phase two: words, best pieces first, only where they fit beside the badge.
  for (const r of [...reserved].sort((a, b) => a.pt.i - b.pt.i)) {
    const { pt, px, lane, box } = r;
    const full = words ? labelFor(pt.p) : '';
    const tiers = full ? [full, full.split(' ').slice(0, 2).join(' ')] : [];
    let text = '';
    let placed = null;
    for (const candidate of tiers) {
      const w = measurePill(pills, candidate);
      for (const rightwards of [true, false]) {
        const left = rightwards ? px - PILL / 2 : px + PILL / 2 - w;
        if (left < 2 || left + w > W - 2) continue;
        const others = lanes[lane].filter(b => b !== box);
        const clash = others.some(([a, b]) => left < b + 8 && left + w > a - 8);
        if (!clash) { placed = { left, w, rightwards }; text = candidate; break; }
      }
      if (placed) break;
    }
    if (placed) { box[0] = placed.left; box[1] = placed.left + placed.w; }
    else placed = { left: box[0], w: PILL, rightwards: true };
    const dark = lum(px) < 0.45;
    const a = make('a', { href: urlFor(pt.p.id), class: `point p-${pt.p.pillar || 'none'}` });
    a.appendChild(make('title', {}, pt.p.title));
    pills.appendChild(a);
    pill(a, { x: placed.left, y: LANES[lane], text, dark, badge: String(pt.i + 1), badgeAt: placed.rightwards ? 'start' : 'end', size: 12.5 });
    a.style.animationDelay = `${(0.3 + 2.0 * px / W).toFixed(2)}s`;
    const show = () => el.dispatchEvent(new CustomEvent('point', { detail: pt.p }));
    a.addEventListener('mouseenter', show);
    a.addEventListener('focus', show);
  }
}

// Draws one pill at (x, y): an optional round badge with a number, then words.
function pill(parent, { x, y, text, dark, badge, badgeAt = 'start', size }) {
  const PILL = 26;
  const padX = text ? 10 : 0;
  const g = make('g', { class: 'pill' + (dark ? ' is-dark' : ' is-light') });
  const t = text ? make('text', { class: 'pill-text', 'font-size': size, y: y + PILL / 2 + 4.5 }, text) : null;
  parent.appendChild(g);
  let textW = 0;
  if (t) { g.appendChild(t); textW = t.getComputedTextLength(); }
  const w = (badge ? PILL : 0) + (text ? textW + padX * 2 - (badge ? 4 : 0) : 0);
  const width = Math.max(PILL, w);
  g.insertBefore(make('rect', { class: 'pill-bg', x: x.toFixed(1), y, width: width.toFixed(1), height: PILL, rx: PILL / 2 }), g.firstChild);
  if (badge) {
    const bx = badgeAt === 'start' ? x + PILL / 2 : x + width - PILL / 2;
    g.appendChild(make('circle', { class: 'badge', cx: bx.toFixed(1), cy: y + PILL / 2, r: PILL / 2 - 2 }));
    g.appendChild(make('text', { class: 'badge-num', x: bx.toFixed(1), y: y + PILL / 2 + 4.5, 'text-anchor': 'middle' }, badge));
    if (t) t.setAttribute('x', (badgeAt === 'start' ? x + PILL + padX - 4 : x + padX).toFixed(1));
  } else if (t) {
    t.setAttribute('x', (x + padX).toFixed(1));
  }
  return { width };
}

function measurePill(parent, text) {
  const PILL = 26;
  if (!text) return PILL;
  const t = make('text', { class: 'pill-text', 'font-size': 12.5 }, text);
  parent.appendChild(t);
  const w = t.getComputedTextLength();
  t.remove();
  return PILL + w + 20 - 4;
}

// A clean cut of a headline: the part before a colon or dash when it stands alone,
// otherwise the first few words, never ending on a small word, never with an ellipsis.
function shorten(title) {
  const max = 26;
  let s = title.replace(/^[‘“"']+/, '').replace(/[’”"']+(?=:)/, '');
  const head = s.split(/\s[–—-]\s|:\s|\?\s|\.\s/)[0];
  if (head.length >= 10 && head.length <= max + 6) return tidy(head);
  if (s.length <= max) return tidy(s);
  const cut = s.slice(0, max + 1).replace(/\s+\S*$/, '');
  return tidy(cut);
}
function tidy(s) {
  let out = s, prev = null;
  while (out !== prev) {
    prev = out;
    out = out.replace(/\s+(a|an|the|of|to|in|on|at|for|and|or|but|as|by|with|is|are|was|were|its|his|her|their|that|this|from|into|over|after|before|about|up|has|have|had|be|been|not|no|so|if|who|how|why|what|when|where)$/i, '')
      .replace(/[,;:–—-]+$/, '').replace(/[‘’“”"']$/, '').trim();
  }
  return out;
}

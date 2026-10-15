// Around the world: ten stories on a dot map, the same for every edition.
// The numbered pins stay put. A panel beside the map runs through the ten, one at a
// time on a loop, with a line to the pin it means. Hover pauses it; a pin jumps to its story.
import { aroundTheWorld, readingMinutes } from './choose.js';
import { PLACES } from './places.js';
import { urlFor } from './snapshot.js';
import { esc } from './ticker.js';
import { makeLoop } from './loop.js';

let loop = null;

const CELL = 5;
const PERIOD = 7000;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

export function renderWorld(gridEl, dots, snap) {
  const stories = aroundTheWorld(snap, PLACES, 10);
  draw(gridEl, dots, snap, stories);
  return stories;
}

function draw(gridEl, dots, snap, stories) {
  const W = dots.cols * CELL, H = dots.rows * CELL;
  const proj = (lon, lat) => [((lon + 180) / 360) * W, ((dots.latTop - lat) / (dots.latTop - dots.latBottom)) * H];
  let circles = '';
  dots.grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '1') circles += `<circle cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="1.7"/>`;
  });
  const pins = stories.map((st, i) => { const [px, py] = proj(st.place.lon, st.place.lat); return { st, i, px, py }; });
  for (let pass = 0; pass < 6; pass++) {
    for (const a of pins) for (const b of pins) {
      if (a === b) continue;
      const dx = b.px - a.px, dy = b.py - a.py, d = Math.hypot(dx, dy);
      if (d < 32) { const push = (32 - d) / 2; const ux = d ? dx / d : 1, uy = d ? dy / d : 0; a.px -= ux * push; a.py -= uy * push; b.px += ux * push; b.py += uy * push; }
    }
  }
  const R = 15;
  const pinSvg = pins.map(({ st, i, px, py }) => `<a href="${urlFor(st.id)}" class="wpin p-${st.pillar || 'none'}" data-i="${i}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
      <title>${esc(st.place.name)}: ${esc(st.title)}</title>
      <circle class="wpin-halo" r="${R + 10}"/><circle class="wpin-dot" r="${R}"/><text y="${(R * 0.38).toFixed(1)}" text-anchor="middle" font-size="${(R * 1.05).toFixed(1)}">${i + 1}</text>
    </a>`).join('');

  gridEl.classList.add('is-loop');
  gridEl.innerHTML = `<div class="map-box" id="map"><svg viewBox="0 0 ${W} ${H}" class="world" role="img" aria-label="A dot map of the world with ten numbered stories pinned where they happen.">
      <g class="land">${circles}</g><g class="wpins">${pinSvg}</g></svg></div>
    <div class="wstage" aria-label="The ten stories, one at a time">
      <div class="wstage-body"></div>
      <div class="board-nav">
        <button type="button" class="nav-btn" data-nav="-1" aria-label="Previous story">←</button>
        <button type="button" class="nav-btn" data-nav="1" aria-label="Next story">→</button>
        <span class="board-count"><span class="wstage-n">1</span> of ${stories.length}<span class="loop-paused"> · paused</span></span>
        <span class="progress" aria-hidden="true"><span class="progress-bar wprogress"></span></span>
      </div>
    </div>
    <ol class="world-list is-backup">${stories.map((st, i) => `<li><a href="${urlFor(st.id)}">${i + 1}. ${esc(st.place.name)}: ${esc(st.title)}</a></li>`).join('')}</ol>`;

  const body = gridEl.querySelector('.wstage-body');
  const stage = gridEl.querySelector('.wstage');
  const bar = gridEl.querySelector('.wprogress');
  let i = 0;

  const restartBar = () => { if (!bar) return; bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; };
  const show = (k) => {
    i = (k + stories.length) % stories.length;
    const st = stories[i];
    const m = readingMinutes(st.words);
    body.className = `wstage-body p-${st.pillar || 'none'}`;
    body.innerHTML = `<p class="wstage-top"><span class="wcard-num">${i + 1}</span><span class="place">${esc(st.place.name)}</span><span class="muted">· ${esc(st.section)}${m ? ` · ${m} min` : ''}</span></p>
      <h3><a href="${urlFor(st.id)}" data-id="${esc(st.id)}">${esc(st.title)}</a></h3>
      ${st.trail ? `<p class="trail">${esc(st.trail)}</p>` : ''}`;
    gridEl.querySelectorAll('.wpin').forEach(p => p.classList.toggle('is-hot', Number(p.dataset.i) === i));
    gridEl.querySelector('.wstage-n').textContent = i + 1;
    restartBar();
  };
  loop?.destroy();
  loop = makeLoop({ root: gridEl, restEls: [stage, gridEl.querySelector('.wpins')], period: PERIOD, bar, tick: () => show(i + 1), reduced: reduced.matches || stories.length < 2 });
  gridEl.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { show(i + Number(b.dataset.nav)); loop.restart(); }));
  gridEl.querySelectorAll('.wpin').forEach(p => {
    p.addEventListener('click', (e) => { e.preventDefault(); show(Number(p.dataset.i)); loop.restart(); });
    p.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(Number(p.dataset.i)); });
    p.addEventListener('focus', () => show(Number(p.dataset.i)));
  });
  if (reduced.matches) gridEl.classList.add('is-static');
  show(0);
  loop.sync();
}

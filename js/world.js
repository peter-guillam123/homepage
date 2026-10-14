// Around the world: ten stories pinned on a dot map, the same for every edition.
import { aroundTheWorld } from './choose.js';
import { PLACES } from './places.js';
import { urlFor } from './snapshot.js';
import { esc } from './ticker.js';
import { readingMinutes } from './choose.js';

const CELL = 5;

export function renderWorld(mapEl, listEl, dots, snap) {
  const stories = aroundTheWorld(snap, PLACES, 10);
  const W = dots.cols * CELL, H = dots.rows * CELL;
  const proj = (lon, lat) => [((lon + 180) / 360) * W, ((dots.latTop - lat) / (dots.latTop - dots.latBottom)) * H];
  let circles = '';
  dots.grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') circles += `<circle cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="1.7"/>`;
    }
  });
  // Nudge pins apart when two places sit close together.
  const pins = stories.map((s, i) => { const [px, py] = proj(s.place.lon, s.place.lat); return { s, i, px, py }; });
  for (let pass = 0; pass < 6; pass++) {
    for (const a of pins) for (const b of pins) {
      if (a === b) continue;
      const dx = b.px - a.px, dy = b.py - a.py, d = Math.hypot(dx, dy);
      if (d < 38) { const push = (38 - d) / 2; const ux = d ? dx / d : 1, uy = d ? dy / d : 0; a.px -= ux * push; a.py -= uy * push; b.px += ux * push; b.py += uy * push; }
    }
  }
  const pinSvg = pins.map(({ s, i, px, py }) => `<a href="${urlFor(s.id)}" class="wpin p-${s.pillar || 'none'}" data-i="${i}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
      <title>${esc(s.place.name)}: ${esc(s.title)}</title>
      <circle class="wpin-halo" r="24"/><circle class="wpin-dot" r="15"/><text y="5" text-anchor="middle">${i + 1}</text>
    </a>`).join('');
  mapEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="world" role="img" aria-label="A dot map of the world with ten numbered stories pinned where they happen.">
    <g class="land">${circles}</g><g class="wpins">${pinSvg}</g></svg>`;

  listEl.innerHTML = stories.map((s, i) => {
    const m = readingMinutes(s.words);
    return `<li class="wstory p-${s.pillar || 'none'}" data-i="${i}">
      <span class="wnum" aria-hidden="true">${i + 1}</span>
      <div><p class="meta"><span class="place">${esc(s.place.name)}</span> <span class="sep">·</span> ${esc(s.section)}${m ? ` <span class="sep">·</span> ${m} min` : ''}</p>
      <h3><a href="${urlFor(s.id)}" data-id="${esc(s.id)}">${esc(s.title)}</a></h3></div>
    </li>`;
  }).join('');

  const link = (i, on) => {
    mapEl.querySelector(`.wpin[data-i="${i}"]`)?.classList.toggle('is-hot', on);
    listEl.querySelector(`.wstory[data-i="${i}"]`)?.classList.toggle('is-hot', on);
  };
  for (const el of [...mapEl.querySelectorAll('.wpin'), ...listEl.querySelectorAll('.wstory')]) {
    const i = el.dataset.i;
    el.addEventListener('mouseenter', () => link(i, true));
    el.addEventListener('mouseleave', () => link(i, false));
    el.addEventListener('focusin', () => link(i, true));
    el.addEventListener('focusout', () => link(i, false));
  }
  return stories;
}

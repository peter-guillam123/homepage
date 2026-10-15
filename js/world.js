// Around the world: ten stories on a dot map, the same for every edition.
// On wide screens the notes sit in two margins either side of the map, each level with
// its pin where the stack allows, joined by a leader line. On phones the list beneath does the job.
import { aroundTheWorld } from './choose.js';
import { PLACES } from './places.js';
import { urlFor } from './snapshot.js';
import { esc } from './ticker.js';
import { readingMinutes } from './choose.js';

const CELL = 5;
let resizeTimer = null;
let last = null;

export function renderWorld(gridEl, dots, snap) {
  const stories = aroundTheWorld(snap, PLACES, 10);
  last = { gridEl, dots, snap, stories };
  draw(gridEl, dots, snap, stories);
  if (!gridEl.dataset.resizeWired) {
    gridEl.dataset.resizeWired = '1';
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (last) draw(last.gridEl, last.dots, last.snap, last.stories); }, 150);
    });
  }
  return stories;
}

function draw(gridEl, dots, snap, stories) {
  const W = dots.cols * CELL, H = dots.rows * CELL;
  const wide = (gridEl.clientWidth || 900) >= 900;
  const proj = (lon, lat) => [((lon + 180) / 360) * W, ((dots.latTop - lat) / (dots.latTop - dots.latBottom)) * H];

  let circles = '';
  dots.grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') circles += `<circle cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="1.7"/>`;
    }
  });
  const pins = stories.map((st, i) => { const [px, py] = proj(st.place.lon, st.place.lat); return { st, i, px, py }; });
  for (let pass = 0; pass < 6; pass++) {
    for (const a of pins) for (const b of pins) {
      if (a === b) continue;
      const dx = b.px - a.px, dy = b.py - a.py, d = Math.hypot(dx, dy);
      if (d < 30) { const push = (30 - d) / 2; const ux = d ? dx / d : 1, uy = d ? dy / d : 0; a.px -= ux * push; a.py -= uy * push; b.px += ux * push; b.py += uy * push; }
    }
  }
  const R = wide ? 14 : 15;
  const pinSvg = pins.map(({ st, i, px, py }) => `<a href="${urlFor(st.id)}" class="wpin p-${st.pillar || 'none'}" data-i="${i}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
      <title>${esc(st.place.name)}: ${esc(st.title)}</title>
      <circle class="wpin-halo" r="${R + 8}"/><circle class="wpin-dot" r="${R}"/><text y="${(R * 0.38).toFixed(1)}" text-anchor="middle" font-size="${(R * 1.05).toFixed(1)}">${i + 1}</text>
    </a>`).join('');
  const mapHtml = `<div class="map-box" id="map"><svg viewBox="0 0 ${W} ${H}" class="world" role="img" aria-label="A dot map of the world with ten numbered stories pinned where they happen.">
      <g class="land">${circles}</g><g class="wpins">${pinSvg}</g></svg></div>`;

  const card = (p, cls) => `<li class="wcard p-${p.st.pillar || 'none'} ${cls}" data-i="${p.i}">
      <a href="${urlFor(p.st.id)}" data-id="${esc(p.st.id)}">
        <span class="wcard-top"><span class="wcard-num">${p.i + 1}</span><span class="wcard-place">${esc(p.st.place.name)}</span></span>
        <span class="wcard-title">${esc(p.st.title)}</span>
      </a></li>`;
  const listItem = (st, i) => {
    const m = readingMinutes(st.words);
    return `<li class="wstory p-${st.pillar || 'none'}" data-i="${i}">
      <span class="wnum" aria-hidden="true">${i + 1}</span>
      <div><p class="meta"><span class="place">${esc(st.place.name)}</span> <span class="sep">·</span> ${esc(st.section)}${m ? ` <span class="sep">·</span> ${m} min` : ''}</p>
      <h3><a href="${urlFor(st.id)}" data-id="${esc(st.id)}">${esc(st.title)}</a></h3></div>
    </li>`;
  };

  if (!wide) {
    gridEl.classList.remove('is-wide');
    gridEl.innerHTML = mapHtml + `<ol class="world-list" id="world-list">${stories.map(listItem).join('')}</ol>`;
    wireHover(gridEl);
    return;
  }

  // Wide: notes on all four sides. The three northernmost pins above, the three
  // southernmost below, the rest split west and east.
  const byY = [...pins].sort((a, b) => a.py - b.py);
  const top = byY.slice(0, 3).sort((a, b) => a.px - b.px);
  const bottom = byY.slice(-3).sort((a, b) => a.px - b.px);
  const middle = byY.slice(3, -3).sort((a, b) => a.px - b.px);
  const left = middle.slice(0, Math.ceil(middle.length / 2)).sort((a, b) => a.py - b.py);
  const right = middle.slice(Math.ceil(middle.length / 2)).sort((a, b) => a.py - b.py);
  gridEl.classList.add('is-wide');
  gridEl.innerHTML = `<ol class="wrow wrow-top" aria-label="Stories, north">${top.map(p => card(p, 'is-top')).join('')}</ol>` +
    `<ol class="wside wside-left" aria-label="Stories, west">${left.map(p => card(p, 'is-left')).join('')}</ol>` + mapHtml +
    `<ol class="wside wside-right" aria-label="Stories, east">${right.map(p => card(p, 'is-right')).join('')}</ol>` +
    `<ol class="wrow wrow-bottom" aria-label="Stories, south">${bottom.map(p => card(p, 'is-bottom')).join('')}</ol>` +
    `<svg class="wleaders" aria-hidden="true"></svg>`;

  // Rows take the height of their tallest card.
  for (const row of gridEl.querySelectorAll('.wrow')) {
    row.style.height = `${Math.max(0, ...[...row.children].map(c => c.offsetHeight))}px`;
  }
  const mapBox = gridEl.querySelector('.map-box');
  const svg = gridEl.querySelector('.world');
  const gridRect = gridEl.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const pinPx = (p) => ({ x: svgRect.left - gridRect.left + p.px / W * svgRect.width, y: svgRect.top - gridRect.top + p.py / H * svgRect.height });

  // Lay cards along one axis near their pins, pushing apart where they would overlap.
  const layout = (cards, wants, sizes, limit) => {
    const gap = 10;
    const pos = cards.map((c, k) => wants[k] - sizes[k] / 2);
    for (let k = 1; k < cards.length; k++) pos[k] = Math.max(pos[k], pos[k - 1] + sizes[k - 1] + gap);
    const end = pos.length ? pos[pos.length - 1] + sizes[sizes.length - 1] : 0;
    if (end > limit) {
      let shift = end - limit;
      for (let k = cards.length - 1; k >= 0 && shift > 0; k--) {
        const floor = k ? pos[k - 1] + sizes[k - 1] + gap : 0;
        const move = Math.min(Math.max(0, pos[k] - floor), shift);
        for (let j = k; j < cards.length; j++) pos[j] -= move;
        shift -= move;
      }
    }
    if (pos.length && pos[0] < 0) { const d = -pos[0]; for (let k = 0; k < pos.length; k++) pos[k] += d; }
    return pos;
  };
  for (const [side, list] of [['left', left], ['right', right]]) {
    const col = gridEl.querySelector(`.wside-${side}`);
    const cards = [...col.children];
    const colRect = col.getBoundingClientRect();
    const tops = layout(cards, list.map(p => pinPx(p).y - (colRect.top - gridRect.top)), cards.map(c => c.offsetHeight), mapBox.offsetHeight);
    cards.forEach((c, k) => { c.style.top = `${tops[k].toFixed(1)}px`; });
  }
  for (const [where, list] of [['top', top], ['bottom', bottom]]) {
    const row = gridEl.querySelector(`.wrow-${where}`);
    const cards = [...row.children];
    const lefts = layout(cards, list.map(p => pinPx(p).x), cards.map(c => c.offsetWidth), gridRect.width);
    cards.forEach((c, k) => { c.style.left = `${lefts[k].toFixed(1)}px`; });
  }

  // Leader lines from each card's inner edge to its pin.
  const leaders = gridEl.querySelector('.wleaders');
  leaders.setAttribute('viewBox', `0 0 ${gridRect.width} ${gridRect.height}`);
  leaders.setAttribute('width', gridRect.width);
  leaders.setAttribute('height', gridRect.height);
  let lines = '';
  const edge = (r, where) => where === 'left' ? [r.right, r.top + r.height / 2] : where === 'right' ? [r.left, r.top + r.height / 2]
    : where === 'top' ? [r.left + r.width / 2, r.bottom] : [r.left + r.width / 2, r.top];
  for (const [where, list] of [['left', left], ['right', right], ['top', top], ['bottom', bottom]]) {
    const holder = gridEl.querySelector(`.w${where === 'left' || where === 'right' ? 'side-' + where : 'row-' + where}`);
    [...holder.children].forEach((c, k) => {
      const r = c.getBoundingClientRect();
      const [ex0, ey0] = edge(r, where);
      const sx = ex0 - gridRect.left, sy = ey0 - gridRect.top;
      const p = pinPx(list[k]);
      const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1;
      const ex = p.x - dx / d * (R + 2), ey = p.y - dy / d * (R + 2);
      lines += `<line data-i="${list[k].i}" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    });
  }
  leaders.innerHTML = lines;
  wireHover(gridEl);
}

function wireHover(root) {
  const link = (i, on) => root.querySelectorAll(`[data-i="${i}"]`).forEach(el => el.classList.toggle('is-hot', on));
  for (const el of root.querySelectorAll('.wpin, .wcard, .wstory')) {
    const i = el.dataset.i;
    el.addEventListener('mouseenter', () => link(i, true));
    el.addEventListener('mouseleave', () => link(i, false));
    el.addEventListener('focusin', () => link(i, true));
    el.addEventListener('focusout', () => link(i, false));
  }
}

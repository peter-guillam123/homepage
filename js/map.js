// Four desks on a dot-matrix world. Each edition's front, pinned where its desk sits.
import { CITIES } from './sun.js';
import { EDITION_NAMES } from './choose.js';

const CELL = 5;

export function renderMap(el, dots, { snap, edition, onEdition }) {
  const W = dots.cols * CELL, H = dots.rows * CELL;
  const proj = (lon, lat) => [
    ((lon + 180) / 360) * W,
    ((dots.latTop - lat) / (dots.latTop - dots.latBottom)) * H,
  ];
  let circles = '';
  dots.grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') circles += `<circle cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="1.7"/>`;
    }
  });
  const pins = Object.keys(snap.editions).map(ed => {
    const city = ed === 'international' ? { lat: -8, lon: -22 } : CITIES[ed];
    const [px, py] = proj(city.lon, city.lat);
    return `<a href="#desk-${ed}" class="pin${ed === edition ? ' is-current' : ''}${ed === 'international' ? ' is-roaming' : ''}" data-edition="${ed}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
      <title>${EDITION_NAMES[ed]} edition</title>
      <circle class="pin-halo" r="14"/><circle class="pin-dot" r="5"/>
      <text y="-20" text-anchor="middle">${EDITION_NAMES[ed]}</text>
    </a>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="world" role="img" aria-label="A dot map of the world with the four Guardian editions pinned: UK, US, Australia and International.">
    <g class="land">${circles}</g><g class="pins">${pins}</g></svg>`;
  el.querySelectorAll('.pin').forEach(pin => {
    pin.addEventListener('click', (e) => { e.preventDefault(); onEdition(pin.dataset.edition); });
  });
}

// Slow: features, pictures and series, outside the news. One column of big pictures,
// newest first, with the series as a row of bubbles to pick from and a Keep button on
// everything. Kept pieces live in the browser and are listed in "What this page knows".
import { store } from './store.js';
import { ago, esc } from './ticker.js';
import { urlFor } from './snapshot.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const BATCH = 12;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { data: null, filter: null, kept: {}, items: [], shown: 0 };

init().catch(err => { console.error(err); $('#status').textContent = 'Slow could not load its data. Try again in a moment.'; $('#status').hidden = false; });

async function init() {
  store.visit();
  state.kept = store.get().kept || {};
  state.data = await fetch('data/slow.json').then(r => r.json());
  wire();
  renderBubbles();
  render();
  document.body.classList.add('is-ready');
}

function wire() {
  $('#more').addEventListener('click', () => { state.shown += BATCH; renderList(true); });
  $('#knows-open').addEventListener('click', openKnows);
  $('#knows-close').addEventListener('click', () => $('#knows').close());
  $('#forget').addEventListener('click', () => { store.forget(); location.reload(); });
  document.addEventListener('click', (e) => {
    const bubble = e.target.closest('[data-series]');
    if (bubble) { state.filter = state.filter === bubble.dataset.series ? null : bubble.dataset.series; renderBubbles(); render(); window.scrollTo({ top: $('#slow').offsetTop - 80, behavior: reduced.matches ? 'auto' : 'smooth' }); return; }
    const keep = e.target.closest('[data-keep]');
    if (keep) {
      const id = keep.dataset.keep;
      if (state.kept[id]) delete state.kept[id]; else state.kept[id] = Date.now();
      store.set({ kept: state.kept });
      $$(`[data-keep="${CSS.escape(id)}"]`).forEach(b => { b.setAttribute('aria-pressed', String(Boolean(state.kept[id]))); b.querySelector('span').textContent = state.kept[id] ? 'Kept' : 'Keep'; });
      return;
    }
    const unkeep = e.target.closest('[data-unkeep]');
    if (unkeep) { delete state.kept[unkeep.dataset.unkeep]; store.set({ kept: state.kept }); renderKept(); render(); return; }
    const nav = e.target.closest('[data-frame]');
    if (nav) {
      const strip = nav.closest('.gallery').querySelector('.frames');
      strip.scrollBy({ left: Number(nav.dataset.frame) * strip.clientWidth, behavior: reduced.matches ? 'auto' : 'smooth' });
      return;
    }
    const a = e.target.closest('a[data-id]');
    if (a) store.opened(a.dataset.id);
  });
}

function renderBubbles() {
  const { series } = state.data;
  const list = Object.entries(series).sort((a, b) => b[1].n - a[1].n).slice(0, 14);
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  $('#bubbles').innerHTML = `<li><button type="button" class="bubble${state.filter ? '' : ' is-on'}" data-series=""><span class="bubble-ring"><span class="bubble-face bubble-all">All</span></span><span class="bubble-name">Everything</span></button></li>` +
    list.map(([id, s]) => `<li><button type="button" class="bubble${state.filter === id ? ' is-on' : ''}" data-series="${esc(id)}" style="--h:${hue(id)}">
      <span class="bubble-ring"><span class="bubble-face">${esc(initials(s.name))}</span></span>
      <span class="bubble-name">${esc(s.name)}</span></button></li>`).join('');
}

function initials(name) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(w => w && !/^(the|a|an|of|and|with|in|on|to)$/i.test(w));
  return (words.slice(0, 2).map(w => w[0]).join('') || name.slice(0, 2)).toUpperCase();
}

function render() {
  const { data, filter } = state;
  state.items = data.items.filter(it => !filter || it.seriesId === filter);
  state.shown = BATCH;
  const s = filter && data.series[filter];
  $('#since').textContent = s
    ? `${s.name}: ${s.n} piece${s.n === 1 ? '' : 's'} in the last couple of days. Pick the bubble again for everything.`
    : `Features, pictures and the series you follow, outside the news. ${data.items.length} pieces from the last couple of days, newest first, no hurry.`;
  renderList(false);
}

function renderList(append) {
  const list = $('#slow');
  const slice = append ? state.items.slice(state.shown - BATCH, state.shown) : state.items.slice(0, state.shown);
  let html = '';
  let lastDay = append ? list.dataset.lastDay : null;
  for (const it of slice) {
    const day = dayLabel(it.published);
    if (day !== lastDay) { html += `<li class="slow-day"><span>${esc(day)}</span></li>`; lastDay = day; }
    html += card(it);
  }
  list.dataset.lastDay = lastDay || '';
  if (append) list.insertAdjacentHTML('beforeend', html); else list.innerHTML = html;
  $('#more').hidden = state.shown >= state.items.length;
  $('#slow-end').textContent = state.shown >= state.items.length ? 'That is the lot. Come back tomorrow, or go and sit outside.' : '';
  watchFades();
  wireFrames();
}

function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : fmtDay.format(d);
}

function card(it) {
  const kept = Boolean(state.kept[it.id]);
  const who = it.series || it.section;
  const minutes = it.words ? `${Math.max(1, Math.round(it.words / 230))} min read` : '';
  const picture = it.type === 'gallery' ? gallery(it) : `<a class="pic" href="${urlFor(it.id)}" data-id="${esc(it.id)}" tabindex="-1" aria-hidden="true">
      <img loading="lazy" src="${esc(it.image.src)}" alt="" width="${it.image.w}" height="${it.image.h}" style="aspect-ratio:${it.image.w}/${it.image.h}">
    </a>${it.image.credit ? `<p class="credit">${esc(it.image.credit)}</p>` : ''}`;
  return `<li class="s-card p-${it.pillar || 'none'}${it.type === 'gallery' ? ' is-gallery' : ''}" data-id="${esc(it.id)}">
    <p class="s-who"><span class="s-dot" aria-hidden="true"></span><span class="s-name">${esc(who)}</span><span class="s-sep">·</span><span class="s-kind">${esc(it.kind)}</span><time class="s-ago" datetime="${it.published}">${ago(it.published)}</time></p>
    ${picture}
    <div class="s-text">
      <h2><a href="${urlFor(it.id)}" data-id="${esc(it.id)}">${esc(it.title)}</a>${it.stars ? ` <span class="stars" aria-label="${it.stars} stars">${'★'.repeat(it.stars)}<span class="stars-off">${'★'.repeat(5 - it.stars)}</span></span>` : ''}</h2>
      ${it.trail ? `<p class="s-trail">${esc(it.trail)}</p>` : ''}
      <p class="s-foot">${it.byline ? `<span>${esc(it.byline)}</span>` : ''}${minutes ? `<span>${minutes}</span>` : ''}${it.loved ? `<span class="s-loved">Readers stayed with this</span>` : ''}
        <button type="button" class="keep" data-keep="${esc(it.id)}" aria-pressed="${kept}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 1h10v14l-5-4-5 4z" fill="currentColor"/></svg><span>${kept ? 'Kept' : 'Keep'}</span></button>
      </p>
    </div>
  </li>`;
}

function gallery(it) {
  return `<div class="gallery">
    <div class="frames" tabindex="0" aria-label="${esc(it.title)}, ${it.frames.length} pictures">${it.frames.map((f, i) => `
      <figure class="frame"><img loading="lazy" src="${esc(f.src)}" alt="${esc(f.alt || '')}" width="${f.w}" height="${f.h}">${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
    ${it.frames.length > 1 ? `<div class="frames-nav"><button type="button" class="nav-btn" data-frame="-1" aria-label="Previous picture">←</button><span class="frames-count"><span class="frames-n">1</span> of ${it.frames.length}</span><button type="button" class="nav-btn" data-frame="1" aria-label="Next picture">→</button></div>` : `<p class="credit">${esc(it.frames.length)} picture${it.frames.length === 1 ? ', more in the gallery' : 's'}</p>`}
  </div>`;
}

function wireFrames() {
  $$('.gallery .frames:not([data-wired])').forEach(strip => {
    strip.dataset.wired = '1';
    const n = strip.closest('.gallery').querySelector('.frames-n');
    if (n) strip.addEventListener('scroll', () => { n.textContent = Math.round(strip.scrollLeft / strip.clientWidth) + 1; }, { passive: true });
  });
}

function watchFades() {
  if (reduced.matches || !('IntersectionObserver' in window)) { $$('.s-card').forEach(c => c.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('.s-card:not(.is-in)').forEach(c => io.observe(c));
}

function openKnows() {
  const d = store.get();
  const rows = [
    ['Last visit before this one', d.previousVisit ? ago(new Date(d.previousVisit).toISOString()) : 'none, this is the first'],
    ['Series you are looking at', state.filter ? state.data.series[state.filter].name : 'all of them'],
    ['Pieces you opened from here', String(Object.keys(d.opened || {}).length || 'none yet')],
  ];
  $('#knows-list').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  renderKept();
  $('#knows').showModal();
}

function renderKept() {
  const ids = Object.keys(state.kept).sort((a, b) => state.kept[b] - state.kept[a]);
  const byId = Object.fromEntries(state.data.items.map(it => [it.id, it]));
  $('#kept').innerHTML = ids.length
    ? ids.map(id => `<li><a href="${urlFor(id)}">${esc(byId[id] ? byId[id].title : id)}</a><button type="button" class="linklike" data-unkeep="${esc(id)}">Let go</button></li>`).join('')
    : '<li class="muted">Nothing yet. Each piece has a Keep button.</li>';
}

setInterval(() => $$('.s-ago').forEach(el => { el.textContent = ago(el.getAttribute('datetime')); }), 60000);

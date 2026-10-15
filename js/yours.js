// Yours: everything the site remembers, in one place, with a way to change each thing.
import { store } from './store.js';
import { EDITION_NAMES } from './choose.js';
import { ago, esc } from './ticker.js';
import { urlFor } from './snapshot.js';
import { updateHeaderCount } from './keep.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtWhen = new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

let wireBlogs = {};
let slowSeries = {};
fetch('data/wire.json').then(r => r.json()).then(w => { wireBlogs = w.blogs || {}; renderLess(); }).catch(() => {});
fetch('data/slow.json').then(r => r.json()).then(d => { slowSeries = d.series || {}; renderLess(); }).catch(() => {});

render();
updateHeaderCount();

document.addEventListener('click', (e) => {
  const unkeep = e.target.closest('[data-unkeep]');
  if (unkeep) { store.unkeep(unkeep.dataset.unkeep); renderKept(); updateHeaderCount(); return; }
  const unmute = e.target.closest('[data-unmute]');
  if (unmute) {
    const d = store.get(); const m = { blogs: [], topics: [], sections: [], series: [], kinds: [], ...(d.mutes || {}) };
    m[unmute.dataset.unmute] = m[unmute.dataset.unmute].filter(v => v !== unmute.dataset.value);
    store.set({ mutes: m }); renderLess(); return;
  }
  const ed = e.target.closest('[data-edition]');
  if (ed) { store.set({ edition: ed.dataset.edition }); renderBasics(); return; }
  if (e.target.closest('#forget')) { store.forget(); location.reload(); }
});
$('#key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  store.set({ capiKey: $('#key-input').value.trim() || null });
  renderBasics();
  $('#key-input').blur();
});

function render() { renderKept(); renderLess(); renderBasics(); }

function renderKept() {
  const kept = store.get().kept || {};
  const ids = Object.keys(kept).sort((a, b) => (kept[b].at || kept[b]) - (kept[a].at || kept[a]));
  $('#kept-note').textContent = ids.length
    ? `${ids.length} piece${ids.length === 1 ? '' : 's'}, newest first. Each links to the Guardian; "Let go" removes it from here.`
    : 'Nothing yet. There is a Keep button on every piece on Today, the wire and Slow.';
  $('#kept-list').innerHTML = ids.map(id => {
    const r = typeof kept[id] === 'object' ? kept[id] : { at: kept[id], title: 'A piece you kept', who: '' };
    const mins = r.words ? `${Math.max(1, Math.round(r.words / 230))} min` : '';
    return `<li class="kept-card">
      ${r.image ? `<a class="kept-pic" href="${urlFor(id)}" tabindex="-1" aria-hidden="true"><img loading="lazy" src="${esc(r.image.src)}" alt="" width="${r.image.w}" height="${r.image.h}"></a>` : ''}
      <p class="meta">${r.who ? `<span class="place">${esc(r.who)}</span>` : ''}${r.kind ? ` <span class="sep">·</span> ${esc(r.kind)}` : ''}${mins ? ` <span class="sep">·</span> ${mins}` : ''}</p>
      <h3><a href="${urlFor(id)}">${esc(r.title)}</a></h3>
      <p class="kept-foot"><span class="muted">kept ${ago(new Date(r.at || Date.now()).toISOString())}</span><button type="button" class="linklike" data-unkeep="${esc(id)}">Let go</button></p>
    </li>`;
  }).join('');
}

function renderLess() {
  const d = store.get();
  const m = { blogs: [], topics: [], sections: [], series: [], kinds: [], ...(d.mutes || {}) };
  const rows = [
    ...m.blogs.map(v => ({ kind: 'blogs', value: v, label: wireBlogs[v] ? `Posts from ${wireBlogs[v].topic} live` : `Posts from a live blog (${v.split('/').pop().replace(/-/g, ' ')})`, note: 'live blog, on the wire' })),
    ...m.topics.map(v => ({ kind: 'topics', value: v, label: v, note: 'subject, on the wire' })),
    ...m.sections.map(v => ({ kind: 'sections', value: v, label: v.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), note: 'section, on the wire and on Slow' })),
    ...m.series.map(v => ({ kind: 'series', value: v, label: slowSeries[v]?.name || v.split('/').pop().replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), note: 'series, on Slow' })),
    ...m.kinds.map(v => ({ kind: 'kinds', value: v, label: `${v}s`, note: 'kind of piece, on Slow' })),
  ];
  $('#less-note').textContent = rows.length
    ? 'These are hidden on the wire or on Slow. Turn any of them back on here.'
    : 'Nothing muted. Every item on the wire and on Slow has a "Less" button for a blog, a subject, a section, a series or a kind of piece.';
  $('#less-list').innerHTML = rows.map(r => `<li><span><strong>${esc(r.label)}</strong> <span class="muted">${esc(r.note)}</span></span><button type="button" class="ghost" data-unmute="${r.kind}" data-value="${esc(r.value)}">Show again</button></li>`).join('');
}

function renderBasics() {
  const d = store.get();
  const edition = d.edition || 'uk';
  $$('[data-edition]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.edition === edition)));
  const rows = [
    ['Reading budget on Today', d.budget ? `${d.budget} minutes` : 'none set'],
    ['Last visit before this one', d.previousVisit ? fmtWhen.format(new Date(d.previousVisit)) : 'none, this is the first'],
    ['Visits counted', String(d.visits || 1)],
    ['Pieces opened from here', String(Object.keys(d.opened || {}).length || 'none yet')],
    ['Showing on the wire', [d.wireShow?.articles !== false && 'articles', d.wireShow?.posts !== false && 'live blog posts'].filter(Boolean).join(' and ')],
    ['Content API key', d.capiKey ? 'one is stored, used for live fetches on Today' : 'none'],
  ];
  $('#basics-list').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#key-input').value = d.capiKey || '';
}

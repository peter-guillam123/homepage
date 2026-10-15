// Daylight: a Guardian homepage for people who come once a day.
import { buildSnapshot, urlFor, EDITIONS } from './snapshot.js';
import { choose, reasonText, readingMinutes, otherDesks, EDITION_NAMES } from './choose.js';
import { headlineBrief } from './brief.js';
import { renderStrip } from './strip.js';
import { renderTicker, esc } from './ticker.js';
import { renderWorld } from './world.js';
import { store } from './store.js';
import { CITIES } from './sun.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDayNum = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtWhen = new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

// Sections that are never 'further afield'. They are the front.
const NEAR = new Set(['politics', 'uk-news', 'us-news', 'world', 'australia-news', 'business', 'commentisfree', 'society', 'law', 'media', 'education', 'money']);
const isShop = (it) => (it.sectionId || '').startsWith('thefilter');

const state = { snap: null, dots: null, edition: null, budget: null, visit: null, random: {} };

init().catch(err => {
  console.error(err);
  $('#status').textContent = 'Daylight could not load its data. Try again in a moment.';
  $('#status').hidden = false;
});

async function init() {
  tintByHour();
  state.visit = store.visit();
  const saved = store.get();
  state.edition = saved.edition || guessEdition();
  state.budget = saved.budget || null;

  const [snap, dots] = await Promise.all([loadSnapshot(saved.capiKey), fetch('data/world-dots.json').then(r => r.json())]);
  state.snap = snap;
  state.dots = dots;

  wireControls();
  render();
  document.body.classList.add('is-ready');
}

async function loadSnapshot(capiKey) {
  if (capiKey) {
    setStatus('Fetching the last 24 hours live from the Guardian Content API…');
    try {
      const snap = await buildSnapshot({ fetchJson: (u) => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), apiKey: capiKey });
      snap.brief = { method: 'headlines', model: null, text: Object.fromEntries(EDITIONS.map(ed => [ed, headlineBrief(snap, ed)])) };
      snap.live = true;
      setStatus('');
      return snap;
    } catch (err) {
      setStatus('Live fetch failed (' + err.message + '). Showing the last snapshot instead.');
    }
  }
  return fetch('data/snapshot.json').then(r => r.json());
}

function setStatus(msg) { const el = $('#status'); el.textContent = msg; el.hidden = !msg; }

function guessEdition() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (tz.startsWith('America/')) return 'us';
  if (tz.startsWith('Australia/') || tz === 'Pacific/Auckland') return 'au';
  if (tz === 'Europe/London' || tz === 'Europe/Dublin') return 'uk';
  return 'international';
}

function tintByHour() {
  const h = new Date().getHours();
  const tod = h < 5 || h >= 22 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'dusk';
  document.documentElement.dataset.tod = tod;
}

function wireControls() {
  $$('[data-edition]', $('#editions')).forEach(btn => btn.addEventListener('click', () => setEdition(btn.dataset.edition)));
  $$('[data-budget]').forEach(btn => btn.addEventListener('click', () => {
    state.budget = btn.dataset.budget === 'all' ? null : Number(btn.dataset.budget);
    store.set({ budget: state.budget });
    renderWorth();
  }));
  $$('[data-another]').forEach(btn => btn.addEventListener('click', () => { state.random[btn.dataset.another] = Math.random(); renderOff(); }));
  $('#knows-open').addEventListener('click', () => { renderKnows(); $('#knows').showModal(); });
  $('#knows-close').addEventListener('click', () => $('#knows').close());
  $('#forget').addEventListener('click', () => { store.forget(); location.reload(); });
  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('#key-input').value.trim();
    store.set({ capiKey: key || null });
    location.reload();
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (a) { store.opened(a.dataset.id); a.closest('[data-id]')?.classList.add('is-opened'); }
  });
  $('#strip').addEventListener('point', (e) => {
    const p = e.detail;
    $('#strip-caption').innerHTML = `<strong>${esc(p.title)}</strong> <span class="muted">${esc(p.section)}, ${fmtTime.format(new Date(p.published))}</span>`;
  });
}

function setEdition(ed) {
  state.edition = ed;
  store.set({ edition: ed });
  render();
}

function render() {
  const { snap, edition } = state;
  $$('[data-edition]', $('#editions')).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.edition === edition)));
  renderHead();
  state.chosen = choose(snap, edition, 8);
  renderStrip($('#strip'), { snap, edition, chosen: state.chosen, lastVisit: state.visit.last });
  $('#strip-caption').innerHTML = `<span class="muted">Real light over ${esc(CITIES[edition].name)}. Bars: pieces published every 20 minutes, by pillar. Points: the eight below.</span>`;
  renderBrief();
  renderTicker($('#board'), snap.ticker, { lastVisit: state.visit.last });
  renderWorth();
  renderDesks();
  renderOff();
  renderEnd();
}

function renderHead() {
  const { snap } = state;
  const taken = new Date(snap.takenAt);
  $('#today').innerHTML = `<span class="day-num">${fmtDayNum.format(taken)}</span><span class="day-rest"><span>${fmtWeekday.format(taken)}</span><span>${fmtMonth.format(taken)}</span></span>`;
  $('#today').setAttribute('aria-label', fmtDate.format(taken));
  const last = state.visit.last;
  const from = new Date(snap.window.from).getTime();
  let since;
  if (!last) {
    since = `Your first visit. Here is the last 24 hours, and no more.`;
  } else {
    const cutoff = Math.max(last, from);
    const pieces = snap.day.filter(id => new Date(snap.items[id].published).getTime() > cutoff).length;
    const events = snap.ticker.filter(t => new Date(t.time).getTime() > cutoff).length;
    const ago = describeAgo(last);
    since = last < from
      ? `You were last here ${ago}. That is more than a day, so here is the last 24 hours.`
      : `You were last here ${ago}. Since then: ${pieces} pieces published and ${events} events on the live blogs.`;
  }
  $('#since').textContent = since;
  const ageHours = (Date.now() - taken.getTime()) / 3600000;
  const stale = $('#stale');
  if (snap.live) { stale.hidden = true; }
  else if (ageHours > 3) {
    stale.textContent = `This snapshot is ${Math.round(ageHours)} hours old. The hourly refresh needs an API key in GitHub; see About.`;
    stale.hidden = false;
  } else stale.hidden = true;
}

function describeAgo(t) {
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${mins} minutes ago`;
  if (mins < 36 * 60) return `${Math.round(mins / 60)} hours ago, on ${fmtWhen.format(new Date(t))}`;
  return `${Math.round(mins / 1440)} days ago`;
}

function renderBrief() {
  const { snap, edition } = state;
  const text = (snap.brief && snap.brief.text && snap.brief.text[edition]) || headlineBrief(snap, edition);
  $('#brief').textContent = text;
  const at = fmtTime.format(new Date(snap.takenAt));
  $('#brief-method').textContent = snap.brief && snap.brief.method === 'claude'
    ? `The news at the top of the ${EDITION_NAMES[edition]} front at ${at}, in three sentences by a model. Unedited.`
    : `The news at the top of the ${EDITION_NAMES[edition]} front at ${at}, stitched from headlines by a script. No model, no editor.`;
}

function renderWorth() {
  const { chosen, budget, edition } = state;
  const mins = chosen.map(p => readingMinutes(p.words) || 0);
  const total = mins.reduce((a, b) => a + b, 0);
  let used = 0;
  const inside = new Set();
  if (budget) chosen.forEach((p, i) => { if (used + mins[i] <= budget) { inside.add(i); used += mins[i]; } });
  else chosen.forEach((_, i) => inside.add(i));
  $$('[data-budget]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.budget === 'all' && !budget) || Number(b.dataset.budget) === budget)));

  $('#worth-list').innerHTML = chosen.map((p, i) => `
    <li class="piece p-${p.pillar || 'none'}${inside.has(i) ? '' : ' is-outside'}${store.wasOpened(p.id) ? ' is-opened' : ''}" data-id="${esc(p.id)}">
      <span class="num" aria-hidden="true">${i + 1}</span>
      <div class="piece-body">
        <p class="meta"><span class="kind">${esc(p.kind || 'Piece')}</span> <span class="sep">·</span> ${esc(p.section)} <span class="sep">·</span> ${mins[i]} min${p.byline ? ` <span class="sep">·</span> ${esc(p.byline)}` : ''}</p>
        <h3><a href="${urlFor(p.id)}" data-id="${esc(p.id)}">${esc(p.title)}</a></h3>
        ${p.trail ? `<p class="trail">${esc(p.trail)}</p>` : ''}
        <p class="why">${esc(reasonText(p, edition))}.<span class="opened-mark"> You opened this.</span></p>
      </div>
      ${p.thumb ? `<img class="thumb" loading="lazy" src="${esc(p.thumb)}" alt="" width="140" height="84">` : '<span class="thumb thumb-empty" aria-hidden="true"></span>'}
    </li>`).join('');

  const left = total - used;
  $('#worth-sum').textContent = budget
    ? (left > 0 ? `${used} minutes inside your budget. The rest would take another ${left}.` : `All eight fit in ${used} minutes.`)
    : `About ${total} minutes of reading, all in.`;
}

function renderDesks() {
  const { snap, edition, dots } = state;
  const world = renderWorld($('#world-grid'), dots, snap);
  const others = otherDesks(snap, edition);
  state.shownElsewhere = [...world.map(w => w.id), ...others.map(o => o.id)];
  $('#desks').innerHTML = others.map(o => `
    <li class="desk p-${o.pillar || 'none'}">
      <p class="desk-h">${EDITION_NAMES[o.edition]} <span class="muted">· ${esc(CITIES[o.edition].name)}</span></p>
      <h3><a href="${urlFor(o.id)}" data-id="${esc(o.id)}">${esc(o.title)}</a></h3>
      <p class="mark${o.elsewhere.length ? '' : ' mark-only'}">${o.elsewhere.length ? 'also on the ' + o.elsewhere.map(e => EDITION_NAMES[e]).join(' and ') + ' front' : 'only on this front'}</p>
    </li>`).join('');
}

// Series readers come back for. Preferred first; any other series after, newest first.
const LOVED_SERIES = ['lifeandstyle/series/a-moment-that-changed-me', 'lifeandstyle/series/experience', 'lifeandstyle/series/blind-date',
  'lifeandstyle/series/how-we-met', 'news/series/the-long-read', 'lifeandstyle/series/tim-dowlings-weekend-column', 'food/series/comfort-eating-with-grace-dent',
  'lifeandstyle/series/this-is-how-we-do-it', 'lifeandstyle/series/the-moment-i-knew', 'books/series/the-books-of-my-life', 'music/series/how-we-made',
  'lifeandstyle/series/ask-annalisa-barbieri', 'lifeandstyle/series/you-be-the-judge', 'tv-and-radio/series/the-g2-interview', 'artanddesign/series/the-big-picture'];

function renderOff() {
  const { snap, chosen } = state;
  const shown = new Set([...chosen.map(p => p.id), ...(state.shownElsewhere || [])]);
  const items = snap.items;
  const readable = (id) => { const it = items[id]; return it && it.type === 'article' && it.kind !== 'Live' && !isShop(it); };
  const nth = (list, name) => list.length ? list[Math.floor(seeded(name) * list.length)] : null;

  // Deeply read, anywhere, but not already on this page. Longer first.
  const deep = [...new Set(Object.values(snap.editions).flatMap(e => e.deeplyRead))]
    .filter(id => readable(id) && !shown.has(id) && (items[id].words || 0) >= 400)
    .sort((a, b) => (items[b].words || 0) - (items[a].words || 0));

  // The latest from a series, loved ones first.
  const pool = [...new Set([...snap.day, ...snap.pools.quiet, ...snap.pools.long])];
  const dull = /newsletter|briefing|quiz|podcast|weekly|tonight|of the day|review/i;
  const series = pool.filter(id => readable(id) && !shown.has(id) && items[id].seriesId && !['Editorial', 'Letters', 'Comment', 'Review', 'Obituary'].includes(items[id].kind) && !dull.test(items[id].series))
    .sort((a, b) => {
      const la = LOVED_SERIES.indexOf(items[a].seriesId), lb = LOVED_SERIES.indexOf(items[b].seriesId);
      const ra = la < 0 ? 99 : la, rb = lb < 0 ? 99 : lb;
      return ra - rb || new Date(items[b].published) - new Date(items[a].published);
    });
  const quiet = snap.pools.quiet.filter(id => !shown.has(id) && !isShop(items[id]) && items[id].kind !== 'Obituary');

  card('deep', deep.length ? deep[Math.floor(seeded('deep') * Math.min(deep.length, 5))] : null, (it) => `Readers stayed with this one. It is on the deeply read list and nowhere else on this page.`);
  card('series', series.length ? series[Math.floor(seeded('series') * Math.min(series.length, 6))] : null, (it) => `The latest in the series <strong>${esc(it.series)}</strong>.`);
  card('quiet', nth(quiet, 'quiet'), () => 'Nothing in it that counts as news.');

  function card(name, id, note) {
    const el = $(`#off-${name} .card-body`);
    const it = id && items[id];
    if (!it) { el.innerHTML = `<p class="muted">Nothing in the pool today.</p>`; return; }
    const m = readingMinutes(it.words);
    el.innerHTML = `<p class="meta"><span class="kind">${esc(it.kind || 'Piece')}</span> <span class="sep">·</span> ${esc(it.section)}${m ? ` <span class="sep">·</span> ${m} min` : ''}</p>
      <h3><a href="${urlFor(id)}" data-id="${esc(id)}">${esc(it.title)}</a></h3>
      ${it.trail ? `<p class="trail">${esc(it.trail)}</p>` : ''}
      <p class="why">${note(it)}</p>`;
  }
  function seeded(name) {
    if (state.random[name] == null) state.random[name] = Math.random();
    return state.random[name];
  }
}

function renderEnd() {
  const { snap } = state;
  const taken = new Date(snap.takenAt);
  $('#taken').textContent = snap.live
    ? `Fetched live from the Guardian Content API at ${fmtTime.format(new Date())} using your key.`
    : `Snapshot taken at ${fmtTime.format(taken)} your time. It refreshes every hour when the key is in place.`;
}

function renderKnows() {
  const d = store.get();
  const opened = Object.keys(d.opened || {});
  const rows = [
    ['Edition', EDITION_NAMES[state.edition]],
    ['Last visit before this one', state.visit.last ? fmtWhen.format(new Date(state.visit.last)) : 'none, this is the first'],
    ['Visits counted', String(d.visits || 1)],
    ['Reading budget', state.budget ? `${state.budget} minutes` : 'none set'],
    ['Pieces you opened from here', opened.length ? `${opened.length}` : 'none yet'],
    ['Content API key', d.capiKey ? 'one is stored, used for live fetches' : 'none'],
  ];
  $('#knows-list').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#key-input').value = d.capiKey || '';
}

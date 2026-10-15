// The wire: news only, newest first. Every article and the latest posts from every news
// live blog, since this time yesterday. Articles on your edition's front run big; other
// fronts' and deeply read ones medium; the rest small. Posts show a taste of themselves.
// "Less" hides a blog, a subject or a section, and the page remembers, locally.
import { store } from './store.js';
import { EDITION_NAMES } from './choose.js';
import { ago, esc } from './ticker.js';
import { urlFor, tickerUrl } from './snapshot.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtHour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtWhen = new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
const BATCH = 70;

const state = { data: null, edition: null, show: { articles: true, posts: true }, mutes: null, visit: null, items: [], shown: 0, hidden: 0 };

init().catch(err => { console.error(err); $('#status').textContent = 'The wire could not load its data. Try again in a moment.'; $('#status').hidden = false; });

async function init() {
  state.visit = store.visit();
  const saved = store.get();
  state.edition = saved.edition || 'uk';
  state.mutes = normaliseMutes(saved.mutes);
  state.show = { ...state.show, ...(saved.wireShow || {}) };
  state.data = await fetch('data/wire.json').then(r => r.json());
  wire();
  render();
  document.body.classList.add('is-ready');
}

function normaliseMutes(m) { return { blogs: [], topics: [], sections: [], ...(m || {}) }; }

function wire() {
  $$('[data-edition]').forEach(b => b.addEventListener('click', () => { state.edition = b.dataset.edition; store.set({ edition: state.edition }); render(); }));
  $$('[data-show]').forEach(b => b.addEventListener('click', () => {
    state.show[b.dataset.show] = !state.show[b.dataset.show];
    if (!state.show.articles && !state.show.posts) state.show[b.dataset.show] = true;
    store.set({ wireShow: state.show });
    render();
  }));
  $('#more').addEventListener('click', () => { state.shown += BATCH; renderList(); });
  $('#knows-open').addEventListener('click', openKnows);
  $('#manage').addEventListener('click', openKnows);
  $('#knows-close').addEventListener('click', () => $('#knows').close());
  $('#forget').addEventListener('click', () => { store.forget(); location.reload(); });
  document.addEventListener('click', (e) => {
    const less = e.target.closest('[data-mute]');
    if (less) {
      const [kind, value] = [less.dataset.mute, less.dataset.value];
      if (!state.mutes[kind].includes(value)) state.mutes[kind].push(value);
      store.set({ mutes: state.mutes });
      less.closest('details')?.removeAttribute('open');
      render();
      return;
    }
    const unmute = e.target.closest('[data-unmute]');
    if (unmute) {
      const [kind, value] = [unmute.dataset.unmute, unmute.dataset.value];
      state.mutes[kind] = state.mutes[kind].filter(v => v !== value);
      store.set({ mutes: state.mutes });
      render();
      renderMutes();
      return;
    }
    const fold = e.target.closest('[data-unfold]');
    if (fold) { fold.closest('.w-fold').classList.add('is-open'); return; }
    const a = e.target.closest('a[data-id]');
    if (a) store.opened(a.dataset.id);
  });
  document.addEventListener('toggle', (e) => {
    if (!e.target.classList.contains('less') || !e.target.open) return;
    $$('details.less[open]').forEach(d => { if (d !== e.target) d.removeAttribute('open'); });
  }, true);
}

function render() {
  const { data, edition } = state;
  $$('[data-edition]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.edition === edition)));
  $$('[data-show]').forEach(b => b.setAttribute('aria-pressed', String(state.show[b.dataset.show])));

  const tierOf = (a) => {
    if ((data.fronts[a.id] || []).includes(edition)) return 1;
    if ((data.fronts[a.id] || []).length || (data.deep[a.id] || []).includes(edition) || (data.viewed[a.id] || []).includes(edition)) return 2;
    return 3;
  };
  const muted = (it) => {
    const m = state.mutes;
    if (it.type === 'post') { const b = data.blogs[it.blogId]; return m.blogs.includes(it.blogId) || m.sections.includes(b.sectionId); }
    return (it.topic && m.topics.includes(it.topic)) || m.sections.includes(it.sectionId);
  };
  let all = [];
  if (state.show.articles) all.push(...data.articles.map(a => ({ type: 'article', time: a.published, tier: tierOf(a), ...a })));
  if (state.show.posts) all.push(...data.posts.map(p => ({ type: 'post', ...p })));
  all.sort((a, b) => new Date(b.time) - new Date(a.time));
  const visible = all.filter(it => !muted(it));
  state.hidden = all.length - visible.length;
  state.items = foldRuns(visible);
  state.shown = BATCH;

  const last = state.visit.last;
  const since = last ? all.filter(it => new Date(it.time).getTime() > last).length : null;
  $('#since').textContent = last
    ? `${since} new since you were here ${ago(new Date(last).toISOString()).replace(/^today /, 'at ')}. News only, newest first.`
    : `${all.length} things since this time yesterday. News only, newest first.`;
  $('#hidden-note').hidden = !state.hidden;
  $('#hidden-n').textContent = state.hidden;
  renderList();
}

// Three or more posts in a row from the same blog fold into the newest two and a count.
function foldRuns(items) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.type !== 'post') { out.push(it); i++; continue; }
    let j = i;
    while (j < items.length && items[j].type === 'post' && items[j].blogId === it.blogId) j++;
    const run = items.slice(i, j);
    if (run.length >= 4) {
      out.push(run[0], run[1], { type: 'fold', blogId: it.blogId, time: run[2].time, posts: run.slice(2) });
    } else out.push(...run);
    i = j;
  }
  return out;
}

function renderList() {
  const { data, items, edition } = state;
  const list = $('#wire');
  const last = state.visit.last;
  const slice = items.slice(0, state.shown);
  let html = '';
  let lastHour = null, visitDone = !last;
  const now = Date.now();
  for (const it of slice) {
    const t = new Date(it.time);
    if (!visitDone && t.getTime() <= last) { html += `<li class="w-mark w-visit"><span>You were here</span></li>`; visitDone = true; }
    const hourKey = `${t.toDateString()} ${t.getHours()}`;
    if (hourKey !== lastHour) {
      const day = t.toDateString() === new Date(now).toDateString() ? '' : 'Yesterday ';
      html += `<li class="w-mark w-hour"><span>${day}${fmtHour.format(new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours()))}</span></li>`;
      lastHour = hourKey;
    }
    html += it.type === 'article' ? article(it) : it.type === 'post' ? post(it) : fold(it);
  }
  list.innerHTML = html;
  $('#more').hidden = state.shown >= items.length;
  $('#more').textContent = `Show the next ${Math.min(BATCH, items.length - state.shown)}`;
  $('#wire-end').textContent = state.shown >= items.length
    ? `That is everything since ${fmtWhen.format(new Date(data.window.from))}. Taken at ${fmtTime.format(new Date(data.takenAt))}; it refreshes every hour.`
    : '';

  function rail(iso) {
    return `<div class="w-rail"><time datetime="${iso}">${fmtTime.format(new Date(iso))}</time><span class="w-ago" data-time="${iso}">${ago(iso)}</span></div>`;
  }
  function less(options) {
    return `<details class="less"><summary aria-label="See less like this"><span aria-hidden="true">Less</span></summary><div class="less-menu">${options.map(o => `<button type="button" data-mute="${o.kind}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div></details>`;
  }
  function article(a) {
    const fronts = data.fronts[a.id] || [];
    const badge = a.tier === 1 ? `On the ${EDITION_NAMES[edition]} front`
      : fronts.length ? `On the ${fronts.map(e => EDITION_NAMES[e]).join(', ')} front${fronts.length > 1 ? 's' : ''}`
      : (data.deep[a.id] || []).includes(edition) ? 'Deeply read' : (data.viewed[a.id] || []).includes(edition) ? 'Most viewed' : '';
    const opts = [];
    if (a.topic) opts.push({ kind: 'topics', value: a.topic, label: `Less ${a.topic}` });
    opts.push({ kind: 'sections', value: a.sectionId, label: `Less ${a.section}` });
    const m = a.words ? `${Math.max(1, Math.round(a.words / 230))} min` : '';
    return `<li class="w-item w-article tier-${a.tier}" data-id="${esc(a.id)}">
      ${rail(a.published)}
      <div class="w-body">
        <p class="w-kicker">${badge ? `<span class="w-badge">${esc(badge)}</span>` : ''}<span class="kind">${esc(a.kind)}</span> <span class="sep">·</span> ${esc(a.section)}${a.topic && a.topic !== a.section ? ` <span class="sep">·</span> ${esc(a.topic)}` : ''}</p>
        <h2><a href="${urlFor(a.id)}" data-id="${esc(a.id)}">${esc(a.title)}</a></h2>
        ${a.tier === 1 && a.thumb ? `<img class="w-pic" loading="lazy" src="${esc(a.thumb)}" alt="" width="500" height="300">` : ''}
        ${a.tier <= 2 && a.trail ? `<p class="w-trail">${esc(a.trail)}</p>` : ''}
        ${a.tier <= 2 ? `<p class="w-foot">${a.byline ? esc(a.byline) : ''}${a.byline && m ? ' · ' : ''}${m}</p>` : ''}
      </div>
      ${a.tier === 2 && a.thumb ? `<img class="w-thumb" loading="lazy" src="${esc(a.thumb)}" alt="" width="140" height="84">` : ''}
      ${less(opts)}
    </li>`;
  }
  function post(p) {
    const b = data.blogs[p.blogId];
    const opts = [{ kind: 'blogs', value: p.blogId, label: `Fewer posts from ${b.topic}` }, { kind: 'sections', value: b.sectionId, label: `Less ${b.section}` }];
    return `<li class="w-item w-post${p.key ? ' is-key' : ''}" data-blog="${esc(p.blogId)}">
      ${rail(p.time)}
      <div class="w-body">
        <p class="w-kicker"><a class="w-blog" href="${urlFor(p.blogId)}">${b.live ? '<span class="live-dot" aria-label="live"></span>' : ''}${esc(b.topic)} live</a>${p.key ? ' <span class="sep">·</span> <span class="w-key">key event</span>' : ''}</p>
        ${p.title ? `<h3><a href="${tickerUrl(p)}">${esc(p.title)}</a></h3>` : ''}
        ${p.text ? `<p class="w-text">${p.title ? '' : `<a class="w-text-link" href="${tickerUrl(p)}">`}${esc(p.text)}${p.title ? '' : '</a>'}</p>` : ''}
      </div>
      ${less(opts)}
    </li>`;
  }
  function fold(f) {
    const b = data.blogs[f.blogId];
    return `<li class="w-fold" data-blog="${esc(f.blogId)}">
      <button type="button" class="w-fold-btn" data-unfold>${f.posts.length} more posts from ${esc(b.topic)} live, ${fmtTime.format(new Date(f.posts[f.posts.length - 1].time))} to ${fmtTime.format(new Date(f.posts[0].time))}</button>
      <ol class="w-fold-list">${f.posts.map(post).join('')}</ol>
    </li>`;
  }
}

function openKnows() {
  const d = store.get();
  const rows = [
    ['Edition', EDITION_NAMES[state.edition]],
    ['Last visit before this one', state.visit.last ? fmtWhen.format(new Date(state.visit.last)) : 'none, this is the first'],
    ['Showing', [state.show.articles && 'articles', state.show.posts && 'live blog posts'].filter(Boolean).join(' and ')],
    ['Pieces you opened from here', String(Object.keys(d.opened || {}).length || 'none yet')],
  ];
  $('#knows-list').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  renderMutes();
  $('#knows').showModal();
}

function renderMutes() {
  const m = state.mutes;
  const b = state.data.blogs;
  const rows = [
    ...m.blogs.map(v => ({ kind: 'blogs', value: v, label: `Posts from ${b[v] ? b[v].topic + ' live' : v}` })),
    ...m.topics.map(v => ({ kind: 'topics', value: v, label: v })),
    ...m.sections.map(v => ({ kind: 'sections', value: v, label: `The ${v.replace(/-/g, ' ')} section` })),
  ];
  $('#mutes').innerHTML = rows.length
    ? rows.map(r => `<li><span>${esc(r.label)}</span><button type="button" class="linklike" data-unmute="${r.kind}" data-value="${esc(r.value)}">Show again</button></li>`).join('')
    : '<li class="muted">Nothing yet. Each item has a "Less" button.</li>';
}

setInterval(() => $$('[data-time]').forEach(el => { el.textContent = ago(el.dataset.time); }), 30000);

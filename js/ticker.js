// Still moving: one board. Down the side, the live blogs that are live now or just closed.
// On the stage, up to twelve key events looping one at a time, or one blog's whole timeline.
// Times are relative and keep counting while the page is open.
import { tickerUrl, urlFor } from './snapshot.js';
import { pickTicker, movingBlogs } from './choose.js';

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDayTime = new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const PERIOD = 6500;
let timer = null;
let clock = null;

export function ago(iso, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 6) return `${hours} h ago`;
  const d = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now - 86400000);
  if (d.toDateString() === today.toDateString()) return `today ${fmtTime.format(d)}`;
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${fmtTime.format(d)}`;
  return fmtDayTime.format(d);
}

export function renderTicker(boardEl, items, { lastVisit }) {
  const { ids, fallback } = movingBlogs(items);
  const picked = pickTicker(items, 12, ids);
  const isNew = (t) => lastVisit && new Date(t.time).getTime() > lastVisit;
  const rel = (iso, cls = 'ago') => `<span class="${cls}" data-time="${iso}">${ago(iso)}</span>`;

  const groups = new Map();
  for (const t of items) {
    if (!ids.has(t.blogId)) continue;
    if (!groups.has(t.blogId)) groups.set(t.blogId, { blog: t.blog, blogId: t.blogId, topic: t.topic, live: t.live, updated: t.updated || t.time, section: t.section, pillar: t.pillar, events: [] });
    groups.get(t.blogId).events.push(t);
  }
  const blogs = [...groups.values()].sort((a, b) => (b.live - a.live) || (new Date(b.updated) - new Date(a.updated)));
  const liveCount = blogs.filter(b => b.live).length;
  const closedCount = blogs.length - liveCount;
  const eyebrow = fallback
    ? 'Nothing is live right now'
    : [liveCount ? `${liveCount} live now` : '', closedCount ? `${closedCount} closed in the last hour` : ''].filter(Boolean).join(' · ');

  if (!blogs.length) {
    boardEl.innerHTML = `<div class="board-empty"><p class="board-eyebrow">Nothing is live right now</p><p>No live blogs ran in the last 24 hours.</p></div>`;
    return;
  }

  const status = (b) => b.live
    ? `<span class="live-dot" aria-hidden="true"></span>live now`
    : `closed ${ago(b.updated)}`;

  boardEl.innerHTML = `
    <div class="board-side">
      <p class="board-eyebrow">${esc(eyebrow)}</p>
      ${fallback ? `<p class="board-note">The last one closed ${rel(blogs[0].updated)}. Here it is anyway.</p>` : ''}
      <ol class="channels">${blogs.map(b => `
        <li><button type="button" class="channel p-${b.pillar || 'none'}${b.live ? ' is-live' : ''}" data-blog="${esc(b.blogId)}" aria-pressed="false">
          <span class="chan-top"><span class="topic">${esc(b.topic)}</span><span class="chan-n">${b.events.length}</span></span>
          <span class="chan-title">${esc(shortBlog(b.blog))}</span>
          <span class="chan-status" data-status="${esc(b.updated)}" data-live="${b.live}">${status(b)}</span>
        </button></li>`).join('')}</ol>
    </div>
    <div class="stage">
      <div class="stage-loop">
        <ol class="slides">${picked.map((t, i) => `
          <li class="slide p-${t.pillar || 'none'}${i === 0 ? ' is-on' : ''}" data-blog="${esc(t.blogId)}">
            <p class="slide-top"><span class="topic">${esc(t.topic)}</span>
              ${rel(t.time, 'ago ago-big')}<time datetime="${t.time}">${fmtTime.format(new Date(t.time))}</time>${isNew(t) ? '<span class="new">new since you left</span>' : ''}</p>
            <h3><a href="${tickerUrl(t)}">${esc(t.title)}</a></h3>
            ${t.summary ? `<p class="slide-sum">${esc(t.summary)}</p>` : ''}
          </li>`).join('')}</ol>
        <div class="board-nav">
          <button type="button" class="nav-btn" data-nav="-1" aria-label="Previous event">←</button>
          <button type="button" class="nav-btn" data-nav="1" aria-label="Next event">→</button>
          <span class="board-count"><span class="board-n">1</span> of ${picked.length}</span>
          <span class="progress" aria-hidden="true"><span class="progress-bar"></span></span>
        </div>
      </div>
      <div class="stage-blog" hidden></div>
    </div>`;

  let i = 0;
  const n = picked.length;
  const slides = [...boardEl.querySelectorAll('.slide')];
  const channels = [...boardEl.querySelectorAll('.channel')];
  const bar = boardEl.querySelector('.progress-bar');
  const loopEl = boardEl.querySelector('.stage-loop');
  const blogEl = boardEl.querySelector('.stage-blog');
  let openBlog = null;

  const tune = (blogId) => channels.forEach(c => c.classList.toggle('is-on', c.dataset.blog === blogId));
  const restartBar = () => { if (!bar) return; bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; };
  const show = (k) => {
    i = (k + n) % n;
    slides.forEach((s, j) => s.classList.toggle('is-on', j === i));
    boardEl.querySelector('.board-n').textContent = i + 1;
    if (!openBlog) tune(slides[i].dataset.blog);
    restartBar();
  };
  const start = () => { stop(); if (!reduced.matches && n > 1 && !openBlog) { timer = setInterval(() => show(i + 1), PERIOD); restartBar(); } };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  const openChannel = (blogId) => {
    const b = groups.get(blogId);
    openBlog = blogId;
    stop();
    tune(blogId);
    channels.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.blog === blogId)));
    blogEl.innerHTML = `
      <div class="stage-blog-head p-${b.pillar || 'none'}">
        <p class="slide-top"><span class="topic">${esc(b.topic)}</span><span class="muted">${b.live ? '<span class="live-dot" aria-hidden="true"></span> live now' : `closed ${ago(b.updated)}`} · ${b.events.length} key events</span></p>
        <h3><a href="${urlFor(b.blogId)}">${esc(b.blog)}</a></h3>
      </div>
      <ol class="timeline">${b.events.map(t => `
        <li class="${isNew(t) ? 'is-new' : ''}"><span class="tl-when">${rel(t.time)}<time datetime="${t.time}">${fmtTime.format(new Date(t.time))}</time></span>
          <div><a href="${tickerUrl(t)}">${esc(t.title)}</a>${t.summary ? `<p>${esc(t.summary)}</p>` : ''}</div></li>`).join('')}</ol>
      <button type="button" class="ghost back">Back to the loop</button>`;
    loopEl.hidden = true;
    blogEl.hidden = false;
    boardEl.classList.add('is-open');
    blogEl.querySelector('.back').addEventListener('click', closeChannel);
  };
  const closeChannel = () => {
    openBlog = null;
    channels.forEach(c => c.setAttribute('aria-pressed', 'false'));
    blogEl.hidden = true;
    loopEl.hidden = false;
    boardEl.classList.remove('is-open');
    tune(slides[i].dataset.blog);
    start();
  };

  channels.forEach(c => c.addEventListener('click', () => (openBlog === c.dataset.blog ? closeChannel() : openChannel(c.dataset.blog))));
  boardEl.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { show(i + Number(b.dataset.nav)); start(); }));
  boardEl.addEventListener('mouseenter', stop);
  boardEl.addEventListener('mouseleave', () => { if (!openBlog) start(); });
  boardEl.addEventListener('focusin', stop);
  boardEl.addEventListener('focusout', () => { if (!openBlog) start(); });
  if (reduced.matches) boardEl.classList.add('is-static');
  tune(slides[0]?.dataset.blog);
  start();

  // Keep the relative times honest while the page sits open.
  if (clock) clearInterval(clock);
  clock = setInterval(() => {
    boardEl.querySelectorAll('[data-time]').forEach(el => { el.textContent = ago(el.dataset.time); });
    boardEl.querySelectorAll('[data-status][data-live="false"]').forEach(el => { el.textContent = `closed ${ago(el.dataset.status)}`; });
  }, 30000);
}

function shortBlog(title) {
  return title.replace(/\s+[–-]\s+[^–-]+$/, '').replace(/\s+live$/i, '').trim();
}
export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

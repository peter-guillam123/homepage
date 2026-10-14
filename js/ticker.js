// Still moving: one board. Down the side, the day's live blogs as channels.
// On the stage, twelve key events looping one at a time, or one blog's whole timeline.
import { tickerUrl, urlFor } from './snapshot.js';
import { pickTicker } from './choose.js';

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const PERIOD = 6500;
let timer = null;

export function renderTicker(boardEl, items, { lastVisit }) {
  const picked = pickTicker(items, 12);
  const isNew = (t) => lastVisit && new Date(t.time).getTime() > lastVisit;

  const groups = new Map();
  for (const t of items) {
    if (!groups.has(t.blogId)) groups.set(t.blogId, { blog: t.blog, blogId: t.blogId, topic: t.topic, live: t.live, section: t.section, pillar: t.pillar, events: [] });
    groups.get(t.blogId).events.push(t);
  }
  const blogs = [...groups.values()].sort((a, b) => new Date(b.events[0].time) - new Date(a.events[0].time));
  const liveCount = blogs.filter(b => b.live).length;

  boardEl.innerHTML = `
    <div class="board-side">
      <p class="board-eyebrow">${blogs.length} live blog${blogs.length === 1 ? '' : 's'} today${liveCount ? `, ${liveCount} still going` : ''}</p>
      <ol class="channels">${blogs.map((b, k) => `
        <li><button type="button" class="channel p-${b.pillar || 'none'}" data-blog="${esc(b.blogId)}" aria-pressed="false">
          <span class="chan-top"><span class="topic">${b.live ? '<span class="live-dot" aria-label="still live"></span>' : ''}${esc(b.topic)}</span><span class="chan-n">${b.events.length}</span></span>
          <span class="chan-title">${esc(shortBlog(b.blog))}</span>
        </button></li>`).join('')}</ol>
    </div>
    <div class="stage">
      <div class="stage-loop">
        <ol class="slides">${picked.map((t, i) => `
          <li class="slide p-${t.pillar || 'none'}${i === 0 ? ' is-on' : ''}" data-blog="${esc(t.blogId)}">
            <p class="slide-top"><span class="topic">${t.live ? '<span class="live-dot" aria-label="still live"></span>' : ''}${esc(t.topic)}</span>
              <time datetime="${t.time}">${fmtTime.format(new Date(t.time))}</time>${isNew(t) ? '<span class="new">new since you left</span>' : ''}</p>
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
        <p class="slide-top"><span class="topic">${b.live ? '<span class="live-dot" aria-label="still live"></span>' : ''}${esc(b.topic)}</span><span class="muted">${b.events.length} key events</span></p>
        <h3><a href="${urlFor(b.blogId)}">${esc(b.blog)}</a></h3>
      </div>
      <ol class="timeline">${b.events.map(t => `
        <li class="${isNew(t) ? 'is-new' : ''}"><time datetime="${t.time}">${fmtDay.format(new Date(t.time))}</time>
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
}

function shortBlog(title) {
  return title.replace(/\s+[–-]\s+[^–-]+$/, '').replace(/\s+live$/i, '').trim();
}
export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

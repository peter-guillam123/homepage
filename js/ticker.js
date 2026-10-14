// Still moving: twelve key events from the day's live blogs, one at a time,
// plus a row of the blogs themselves that opens their key events.
import { tickerUrl, urlFor } from './snapshot.js';
import { pickTicker } from './choose.js';

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let timer = null;

export function renderTicker(boardEl, blogsEl, items, { lastVisit }) {
  const picked = pickTicker(items, 12);
  const isNew = (t) => lastVisit && new Date(t.time).getTime() > lastVisit;
  const slide = (t, i) => `<li class="slide p-${t.pillar || 'none'}${i === 0 ? ' is-on' : ''}" data-i="${i}">
      <p class="slide-top"><span class="topic">${t.live ? '<span class="live-dot" aria-label="still live"></span>' : ''}${esc(t.topic)}</span>
        <time datetime="${t.time}">${fmtTime.format(new Date(t.time))}</time>${isNew(t) ? '<span class="new">new since you left</span>' : ''}</p>
      <h3><a href="${tickerUrl(t)}">${esc(t.title)}</a></h3>
      ${t.summary ? `<p class="slide-sum">${esc(t.summary)}</p>` : ''}
    </li>`;
  boardEl.innerHTML = `
    <ol class="slides" aria-live="off">${picked.map(slide).join('')}</ol>
    <div class="board-nav">
      <button type="button" class="nav-btn" data-nav="-1" aria-label="Previous event">←</button>
      <ol class="dots" aria-label="Events">${picked.map((t, i) => `<li><button type="button" data-go="${i}" aria-label="Event ${i + 1} of ${picked.length}" aria-current="${i === 0}"></button></li>`).join('')}</ol>
      <button type="button" class="nav-btn" data-nav="1" aria-label="Next event">→</button>
      <span class="board-count"><span class="board-n">1</span> of ${picked.length}</span>
    </div>`;

  let i = 0;
  const n = picked.length;
  const slides = [...boardEl.querySelectorAll('.slide')];
  const dots = [...boardEl.querySelectorAll('[data-go]')];
  const show = (k) => {
    i = (k + n) % n;
    slides.forEach((s, j) => s.classList.toggle('is-on', j === i));
    dots.forEach((d, j) => d.setAttribute('aria-current', String(j === i)));
    boardEl.querySelector('.board-n').textContent = i + 1;
  };
  const start = () => { stop(); if (!reduced.matches && n > 1) timer = setInterval(() => show(i + 1), 6000); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  boardEl.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { show(i + Number(b.dataset.nav)); start(); }));
  dots.forEach(d => d.addEventListener('click', () => { show(Number(d.dataset.go)); start(); }));
  boardEl.addEventListener('mouseenter', stop);
  boardEl.addEventListener('mouseleave', start);
  boardEl.addEventListener('focusin', stop);
  boardEl.addEventListener('focusout', start);
  if (reduced.matches) boardEl.classList.add('is-static');
  start();

  // The blogs themselves, as chips that open their key events.
  const groups = new Map();
  for (const t of items) {
    if (!groups.has(t.blogId)) groups.set(t.blogId, { blog: t.blog, blogId: t.blogId, topic: t.topic, live: t.live, section: t.section, pillar: t.pillar, events: [] });
    groups.get(t.blogId).events.push(t);
  }
  const list = [...groups.values()];
  blogsEl.innerHTML = list.map((gp, k) => `
    <details class="blog p-${gp.pillar || 'none'}">
      <summary><span class="topic">${gp.live ? '<span class="live-dot" aria-label="still live"></span>' : ''}${esc(gp.topic)}</span> ${esc(shortBlog(gp.blog))}</summary>
      <ol>${gp.events.map(t => `<li${isNew(t) ? ' class="is-new"' : ''}><time datetime="${t.time}">${fmtDay.format(new Date(t.time))}</time>
        <a href="${tickerUrl(t)}">${esc(t.title)}</a></li>`).join('')}</ol>
      <p class="blog-link"><a href="${urlFor(gp.blogId)}">Open the whole blog</a></p>
    </details>`).join('');
}

function shortBlog(title) {
  return title.replace(/\s+[–-]\s+[^–-]+$/, '').replace(/\s+live$/i, '').trim();
}
export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

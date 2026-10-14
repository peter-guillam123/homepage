// The ticker: key events from the day's live blogs, as a slow strip and a full list.
import { tickerUrl } from './snapshot.js';

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export function renderTicker(stripEl, listEl, items, { lastVisit }) {
  const latest = items.slice(0, 24);
  const isNew = (t) => lastVisit && new Date(t.time).getTime() > lastVisit;
  const item = (t) => `<a class="tick-item${isNew(t) ? ' is-new' : ''}" href="${tickerUrl(t)}">` +
    `<time datetime="${t.time}">${fmtTime.format(new Date(t.time))}</time> <span class="tick-title">${esc(t.title)}</span>` +
    `<span class="tick-blog">${esc(shortBlog(t.blog))}</span></a>`;
  const track = latest.map(item).join('');
  stripEl.innerHTML = `<div class="ticker-track" style="--n:${latest.length}">${track}${track}</div>`;
  stripEl.style.setProperty('--ticker-seconds', `${Math.max(40, latest.length * 6)}s`);

  // The full list, grouped by live blog, newest first.
  const groups = new Map();
  for (const t of items) {
    if (!groups.has(t.blogId)) groups.set(t.blogId, { blog: t.blog, section: t.section, pillar: t.pillar, events: [] });
    groups.get(t.blogId).events.push(t);
  }
  listEl.innerHTML = [...groups.values()].map(gp => `
    <section class="blog p-${gp.pillar || 'none'}">
      <h4>${esc(shortBlog(gp.blog))} <span class="muted">${esc(gp.section)}</span></h4>
      <ol>${gp.events.map(t => `<li${isNew(t) ? ' class="is-new"' : ''}><time datetime="${t.time}">${fmtDay.format(new Date(t.time))}</time>
        <a href="${tickerUrl(t)}">${esc(t.title)}</a>${t.summary ? `<p>${esc(t.summary)}</p>` : ''}</li>`).join('')}</ol>
    </section>`).join('');
}

function shortBlog(title) {
  return title.replace(/\s*[–-]\s*(live|as it happened).*$/i, '').replace(/\s+live$/i, '').trim();
}
export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

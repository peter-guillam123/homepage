// The "last updated" stamp every data page carries. Says when the data was taken,
// how long ago that is, and keeps counting. Goes amber when the hourly refresh is late.
import { ago } from './ticker.js';

const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtFull = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
let clock = null;

export function renderStamp(el, takenAt, { live = false } = {}) {
  if (!el || !takenAt) return;
  const paint = () => {
    const mins = (Date.now() - new Date(takenAt).getTime()) / 60000;
    const late = !live && mins > 95;
    el.classList.toggle('is-stale', late);
    el.innerHTML = `<span class="stamp-dot" aria-hidden="true"></span>` +
      `<time datetime="${takenAt}" title="${fmtFull.format(new Date(takenAt))}">${live ? 'Fetched live' : 'Updated'} ${fmtTime.format(new Date(takenAt))}</time>` +
      `<span class="stamp-ago">${ago(takenAt)}</span>` +
      `<span class="stamp-note">${live ? 'with your key' : late ? 'the hourly refresh is late' : 'refreshes every hour'}</span>`;
  };
  paint();
  if (clock) clearInterval(clock);
  clock = setInterval(paint, 30000);
}

// Keep: a reading list that lives in the browser. The button goes on any piece; the
// record saved with it is enough to show the piece again on Yours, even once it has
// dropped out of the day's data.
import { store } from './store.js';
import { esc } from './ticker.js';

export function keepRecord(it) {
  const image = it.image ? { src: it.image.src, w: it.image.w, h: it.image.h } : it.thumb ? { src: it.thumb, w: 500, h: 300 } : null;
  return { at: Date.now(), title: it.title, who: it.series || it.section || '', kind: it.kind || '', words: it.words || null, image };
}

export function keepButton(it, extraClass = '') {
  const kept = store.isKept(it.id);
  return `<button type="button" class="keep ${extraClass}" data-keep="${esc(it.id)}" aria-pressed="${kept}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 1h10v14l-5-4-5 4z" fill="currentColor"/></svg><span>${kept ? 'Kept' : 'Keep'}</span></button>`;
}

// One listener per page. `lookup(id)` returns the item so a record can be written.
export function wireKeep(root, lookup) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-keep]');
    if (!btn) return;
    const id = btn.dataset.keep;
    if (store.isKept(id)) store.unkeep(id);
    else { const it = lookup(id); if (it) store.keep(id, keepRecord(it)); }
    const on = store.isKept(id);
    root.querySelectorAll(`[data-keep="${CSS.escape(id)}"]`).forEach(b => { b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? 'Kept' : 'Keep'; });
    updateHeaderCount();
  });
}

export function updateHeaderCount() {
  const n = Object.keys(store.get().kept || {}).length;
  document.querySelectorAll('.yours-count').forEach(el => { el.textContent = n; el.hidden = !n; });
}

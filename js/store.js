// Everything the page remembers lives here, in the reader's own browser.
// No account, no cookie, nothing sent anywhere. The "What this page knows" panel shows it all.
const KEY = 'daylight';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export const store = {
  get() { return read(); },
  set(patch) { write({ ...read(), ...patch }); },
  forget() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY + ':visit'); } catch {} },

  // Records this visit and returns the previous one. A reload within 30 minutes is the same visit.
  visit(now = Date.now()) {
    let current = null;
    try { current = Number(sessionStorage.getItem(KEY + ':visit')) || null; } catch {}
    const data = read();
    if (current) return { last: data.previousVisit || null, current };
    const last = data.lastVisit || null;
    const previousVisit = (last && now - last > 30 * 60 * 1000) ? last : (data.previousVisit || last);
    write({ ...data, lastVisit: now, previousVisit, visits: (data.visits || 0) + 1 });
    try { sessionStorage.setItem(KEY + ':visit', String(now)); } catch {}
    return { last: previousVisit, current: now };
  },

  opened(id) {
    const data = read();
    const opened = data.opened || {};
    if (!opened[id]) { opened[id] = Date.now(); write({ ...data, opened }); }
  },
  wasOpened(id) { return Boolean((read().opened || {})[id]); },
};

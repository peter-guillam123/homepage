// Picks the pieces worth a once-a-day reader's time for one edition,
// using signals the Guardian already has: editors' picks, deeply read, most viewed.
// Shared by the page and the build scripts, so both agree on the eight.

export const EDITION_NAMES = { uk: 'UK', us: 'US', au: 'Australia', europe: 'Europe', international: 'International' };

const READABLE_TYPES = new Set(['article', 'interactive']);

export function choose(snap, edition, n = 8) {
  const e = snap.editions[edition];
  const items = snap.items;
  const score = new Map();
  const why = new Map();
  const bump = (id, s, reason) => {
    score.set(id, (score.get(id) || 0) + s);
    if (reason) { const w = why.get(id) || new Set(); w.add(reason); why.set(id, w); }
  };

  e.picks.forEach((id, i) => bump(id, (25 - Math.min(i, 24)) / 25 * 2, 'pick'));
  e.deeplyRead.forEach((id, i) => bump(id, 2 + (10 - Math.min(i, 10)) / 10, 'deep'));
  e.mostViewed.forEach((id, i) => bump(id, 1 + (20 - Math.min(i, 19)) / 20 * 0.5, 'viewed'));

  const onFronts = new Map();
  for (const [ed, data] of Object.entries(snap.editions)) {
    for (const id of data.picks) onFronts.set(id, (onFronts.get(id) || 0) + 1);
  }
  for (const [id, count] of onFronts) if (count >= 3 && score.has(id)) bump(id, 0.4, 'everywhere');
  const fronts = Object.keys(snap.editions).length;

  const ranked = [...score.entries()]
    .map(([id, s]) => ({ id, s, item: items[id] }))
    .filter(({ item }) => item && READABLE_TYPES.has(item.type) && item.kind !== 'Live' && (item.words || 0) >= 150)
    .sort((a, b) => b.s - a.s);

  const perSection = new Map();
  const chosen = [];
  for (const r of ranked) {
    const sec = r.item.sectionId;
    if ((perSection.get(sec) || 0) >= 3) continue;
    perSection.set(sec, (perSection.get(sec) || 0) + 1);
    chosen.push({ ...r.item, score: r.s, why: [...(why.get(r.id) || [])], fronts: onFronts.get(r.id) || 0, frontsTotal: fronts });
    if (chosen.length >= n) break;
  }
  return chosen;
}

const WORDS = { 3: 'three', 4: 'four', 5: 'five' };

export function reasonText(piece, edition) {
  const ed = EDITION_NAMES[edition];
  const parts = [];
  if (piece.why.includes('pick')) parts.push(`an editors’ pick in the ${ed} edition`);
  if (piece.why.includes('deep')) parts.push('read deeply, not just opened');
  if (piece.why.includes('viewed')) parts.push('among the most viewed');
  const total = piece.frontsTotal || 5;
  if (piece.fronts >= total) parts.push(`on all ${WORDS[total] || total} fronts`);
  else if (piece.fronts >= 3) parts.push(`on ${WORDS[piece.fronts] || piece.fronts} of the ${WORDS[total] || total} fronts`);
  if (!parts.length) return 'chosen by the editors';
  return parts.join(', ').replace(/^./, c => c.toUpperCase());
}

export function readingMinutes(words) {
  if (!words) return null;
  return Math.max(1, Math.round(words / 230));
}

// Ten stories from around the world, the same for every edition. One per place,
// at most three per continent, favouring what the fronts chose and readers kept.
export function aroundTheWorld(snap, places, n = 10) {
  const items = snap.items;
  const score = new Map();
  const bump = (id, s) => score.set(id, (score.get(id) || 0) + s);
  for (const data of Object.values(snap.editions)) {
    data.picks.forEach((id, i) => bump(id, 2 + (25 - Math.min(i, 24)) / 25));
    data.deeplyRead.forEach(id => bump(id, 2));
    data.mostViewed.forEach(id => bump(id, 1));
  }
  const now = new Date(snap.takenAt).getTime();
  for (const id of snap.day) {
    const it = items[id];
    if (!it) continue;
    const age = (now - new Date(it.published).getTime()) / 3600000;
    bump(id, Math.max(0, 1 - age / 24));
  }
  const ranked = [...score.entries()]
    .map(([id, s]) => ({ id, s, item: items[id] }))
    .filter(({ item }) => item && item.place && places[item.place] && item.type === 'article' && item.kind !== 'Live' && (item.words || 0) >= 300)
    .sort((a, b) => b.s - a.s);
  const usedPlace = new Set();
  const perContinent = new Map();
  const out = [];
  for (const r of ranked) {
    const place = places[r.item.place];
    const key = place.name;
    if (usedPlace.has(key)) continue;
    if ((perContinent.get(place.continent) || 0) >= 3) continue;
    usedPlace.add(key);
    perContinent.set(place.continent, (perContinent.get(place.continent) || 0) + 1);
    out.push({ ...r.item, place, score: r.s });
    if (out.length >= n) break;
  }
  return out;
}

// The one story each other desk is running that yours is not. Highest pick first.
export function otherDesks(snap, edition) {
  const mine = new Set(snap.editions[edition].picks);
  const out = [];
  for (const [ed, data] of Object.entries(snap.editions)) {
    if (ed === edition) continue;
    const id = data.picks.find(pid => !mine.has(pid) && snap.items[pid] && snap.items[pid].kind !== 'Live');
    if (!id) continue;
    const elsewhere = Object.entries(snap.editions).filter(([o, d]) => o !== ed && d.picks.includes(id)).map(([o]) => o);
    out.push({ edition: ed, ...snap.items[id], elsewhere });
  }
  return out;
}

// Only blogs that are live now, or closed within the last hour, count as still moving.
// If there are none, the most recently closed one stands in, and the page says so.
export function movingBlogs(ticker, now = Date.now(), graceMinutes = 60) {
  const byBlog = new Map();
  for (const t of ticker) if (!byBlog.has(t.blogId)) byBlog.set(t.blogId, t);
  const all = [...byBlog.values()];
  const last = (t) => new Date(t.updated || t.time).getTime();
  const moving = all.filter(t => t.live || now - last(t) <= graceMinutes * 60000);
  if (moving.length) return { ids: new Set(moving.map(t => t.blogId)), fallback: false };
  const latest = all.sort((a, b) => last(b) - last(a))[0];
  return { ids: new Set(latest ? [latest.blogId] : []), fallback: true };
}

// Twelve events shared fairly across the moving blogs: the newest from each,
// then the second newest, and so on, until there are twelve.
export function pickTicker(ticker, n = 12, only = null) {
  const byBlog = new Map();
  for (const t of ticker) {
    if (only && !only.has(t.blogId)) continue;
    if (!byBlog.has(t.blogId)) byBlog.set(t.blogId, []);
    byBlog.get(t.blogId).push(t);
  }
  const blogs = [...byBlog.values()].sort((a, b) => new Date(b[0].time) - new Date(a[0].time));
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let any = false;
    for (const events of blogs) {
      if (events[round]) { out.push(events[round]); any = true; }
      if (out.length >= n) break;
    }
    if (!any) break;
  }
  return out;
}

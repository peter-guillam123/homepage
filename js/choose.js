// Picks the pieces worth a once-a-day reader's time for one edition,
// using signals the Guardian already has: editors' picks, deeply read, most viewed.
// Shared by the page and the build scripts, so both agree on the eight.

export const EDITION_NAMES = { uk: 'UK', us: 'US', au: 'Australia', international: 'International' };

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
    chosen.push({ ...r.item, score: r.s, why: [...(why.get(r.id) || [])], fronts: onFronts.get(r.id) || 0 });
    if (chosen.length >= n) break;
  }
  return chosen;
}

export function reasonText(piece, edition) {
  const ed = EDITION_NAMES[edition];
  const parts = [];
  if (piece.why.includes('pick')) parts.push(`an editors’ pick in the ${ed} edition`);
  if (piece.why.includes('deep')) parts.push('read deeply, not just opened');
  if (piece.why.includes('viewed')) parts.push('among the most viewed');
  if (piece.fronts >= 4) parts.push('on all four fronts');
  else if (piece.fronts === 3) parts.push('on three of the four fronts');
  if (!parts.length) return 'chosen by the editors';
  return parts.join(', ').replace(/^./, c => c.toUpperCase());
}

export function readingMinutes(words) {
  if (!words) return null;
  return Math.max(1, Math.round(words / 230));
}

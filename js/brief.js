// The fallback brief, stitched from headlines. Shared by the page (live mode) and the build script.
import { frontNews, EDITION_NAMES } from './choose.js';

export function headlineBrief(snap, ed) {
  const top = frontNews(snap, ed, 4);
  const s = [];
  if (top[0]) s.push(`The ${EDITION_NAMES[ed]} front leads with: ${top[0].title}.`);
  if (top.length > 1) s.push(`Then: ${top.slice(1).map(p => p.title).join('; ')}.`);
  s.push(`The Guardian published ${snap.counts.published24h} pieces since this time yesterday.`);
  return s.join(' ');
}

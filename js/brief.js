// The fallback brief, stitched from headlines. Shared by the page (live mode) and the build script.
import { choose, EDITION_NAMES } from './choose.js';

export function headlineBrief(snap, ed) {
  const eight = choose(snap, ed, 8);
  const lead = eight[0];
  const deep = snap.editions[ed].deeplyRead.map(id => snap.items[id]).find(i => i && i.kind !== 'Live');
  const s = [];
  if (lead) s.push(`Leading the ${EDITION_NAMES[ed]} edition: ${lead.title}.`);
  if (deep && (!lead || deep.id !== lead.id)) s.push(`Readers stayed longest with: ${deep.title}.`);
  s.push(`The Guardian published ${snap.counts.published24h} pieces since this time yesterday.`);
  return s.join(' ');
}

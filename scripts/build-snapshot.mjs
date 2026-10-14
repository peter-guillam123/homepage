// Fetches a fresh snapshot from the Guardian Content API and writes data/snapshot.json.
// Usage: GUARDIAN_API_KEY=... node scripts/build-snapshot.mjs
// Without a key it still tries, which works where a proxy injects one.
import { writeFile, readFile } from 'node:fs/promises';
import { buildSnapshot } from '../js/snapshot.js';
import { writeBrief } from './brief.mjs';

const apiKey = process.env.GUARDIAN_API_KEY || null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.replace(/api-key=[^&]+/, 'api-key=***')}`);
  return res.json();
}

const snap = await buildSnapshot({ fetchJson, apiKey, log: (m) => console.error('·', m) });
snap.brief = await writeBrief(snap);

let previous = null;
try { previous = JSON.parse(await readFile('data/snapshot.json', 'utf8')); } catch {}
if (previous && previous.counts) {
  console.error(`previous snapshot: ${previous.takenAt}, ${previous.counts.published24h} pieces`);
}
await writeFile('data/snapshot.json', JSON.stringify(snap));
console.error(`wrote data/snapshot.json: ${snap.counts.published24h} pieces, ${snap.ticker.length} ticker items, ${Object.keys(snap.items).length} items, brief by ${snap.brief.method}`);

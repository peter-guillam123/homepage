// Writes the short daily brief for each edition.
// With ANTHROPIC_API_KEY set and the SDK installed, Claude writes it.
// Otherwise the brief is stitched from headlines, and says so.
import { choose, frontNews, EDITION_NAMES } from '../js/choose.js';
import { headlineBrief } from '../js/brief.js';

const MODEL = 'claude-opus-5-5';

async function claudeBrief(snap) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const material = {};
  for (const ed of Object.keys(snap.editions)) {
    material[ed] = {
      edition: EDITION_NAMES[ed],
      topOfFront: frontNews(snap, ed, 8).map((p, i) => ({
        position: i + 1, headline: p.title, section: p.section, kind: p.kind, standfirst: p.trail,
        latest: p.kind === 'Live' ? snap.ticker.filter(t => t.blogId === p.id).slice(0, 2).map(t => t.title) : undefined,
      })),
    };
  }
  const system = [
    'You write a three-sentence brief for a reader who looks at the news once a day.',
    'The material is the news block at the top of one Guardian edition front, in the order the editors placed it. Position 1 is the lead.',
    'Say what leads and what follows, weighted as the editors weighted it. For a live blog, use its latest events for what is happening.',
    'British English. Plain words. Active voice. Present tense. No em dashes. No hype. No adjectives of excitement.',
    'Under 75 words per edition. Do not invent anything not in the material. Do not mention the Guardian, the front or the editors.',
    'Reply with JSON only: an object whose keys are the edition ids given and whose values are the brief text.',
  ].join(' ');
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: `Material, as JSON:\n${JSON.stringify(material)}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('brief: model declined');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const out = {};
  for (const ed of Object.keys(snap.editions)) {
    if (typeof json[ed] !== 'string' || json[ed].length < 20) throw new Error(`brief: missing ${ed}`);
    out[ed] = json[ed].trim();
  }
  return out;
}

// Two-to-four-word subjects for the pieces the strip labels: every edition's eight.
async function claudeLabels(snap) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const ids = [...new Set(Object.keys(snap.editions).flatMap(ed => choose(snap, ed, 8).map(p => p.id)))];
  const material = ids.map(id => ({ id, headline: snap.items[id].title, standfirst: snap.items[id].trail || '', section: snap.items[id].section }));
  const system = [
    'For each piece, write its subject in two to four plain words, as a label on a chart.',
    'British English. Name the person, place or thing the piece is about: "Gaza base", "Brand trial", "School uniforms", "Kemi Badenoch".',
    'No verbs where a noun will do. No quotation marks, no full stops, no hype. Sentence case.',
    'Reply with JSON only: an object whose keys are the ids given and whose values are the labels.',
  ].join(' ');
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: `Pieces, as JSON:\n${JSON.stringify(material)}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('labels: model declined');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const out = {};
  for (const id of ids) {
    const v = typeof json[id] === 'string' ? json[id].trim().replace(/[.\u2018\u2019\u201c\u201d"']+$/g, '').replace(/^[\u2018\u2019\u201c\u201d"']+/g, '') : '';
    if (v && v.length <= 40) out[id] = v;
  }
  if (Object.keys(out).length < ids.length / 2) throw new Error('labels: too few came back');
  return out;
}

export async function writeLabels(snap) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { method: 'claude', model: MODEL, text: await claudeLabels(snap) };
    } catch (err) {
      console.error('labels: none this time:', err.message);
    }
  }
  return { method: 'none', model: null, text: {} };
}

export async function writeBrief(snap) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const text = await claudeBrief(snap);
      return { method: 'claude', model: MODEL, text };
    } catch (err) {
      console.error('brief: falling back to headlines:', err.message);
    }
  }
  const text = {};
  for (const ed of Object.keys(snap.editions)) text[ed] = headlineBrief(snap, ed);
  return { method: 'headlines', model: null, text };
}

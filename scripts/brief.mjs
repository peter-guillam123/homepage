// Writes the short daily brief for each edition.
// With ANTHROPIC_API_KEY set and the SDK installed, Claude writes it.
// Otherwise the brief is stitched from headlines, and says so.
import { choose, EDITION_NAMES } from '../js/choose.js';
import { headlineBrief } from '../js/brief.js';

const MODEL = 'claude-opus-5-5';

async function claudeBrief(snap) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const material = {};
  for (const ed of Object.keys(snap.editions)) {
    material[ed] = {
      edition: EDITION_NAMES[ed],
      pieces: choose(snap, ed, 8).map(p => ({ headline: p.title, section: p.section, kind: p.kind, standfirst: p.trail })),
      latest: snap.ticker.slice(0, 8).map(t => ({ time: t.time, event: t.title, blog: t.blog })),
    };
  }
  const system = [
    'You write a three-sentence brief for a reader who looks at the news once a day.',
    'British English. Plain words. Active voice. No em dashes. No hype. No adjectives of excitement.',
    'Name the stories plainly, in present tense, as a careful colleague would over coffee.',
    'Under 75 words per edition. Do not invent anything not in the material.',
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

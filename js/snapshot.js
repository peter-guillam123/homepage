// Builds the Daylight snapshot from the Guardian Content API.
// Runs in Node (scripts/build-snapshot.mjs) and in the browser (live mode).
// Pass a fetchJson(url) function and, optionally, an API key.

import { placeOf } from './places.js';

const API = 'https://content.guardianapis.com';
export const SITE = 'https://www.theguardian.com/';
export const urlFor = (id) => SITE + id;
export const tickerUrl = (t) => `${SITE}${t.blogId}?page=with:block-${t.block}#block-${t.block}`;
export const EDITIONS = ['uk', 'us', 'au', 'europe', 'international'];

const FIELDS = 'headline,trailText,thumbnail,wordcount,byline,lastModified';
const TAGS = 'tone,type,series,keyword';

// Tags too broad to name a live blog by.
const GENERIC_TAGS = new Set(['world/europe-news', 'football/europeanfootball', 'us-news/us-politics', 'politics/politics', 'uk/uk', 'world/world', 'business/economics', 'sport/sport', 'culture/culture', 'lifeandstyle/lifeandstyle', 'tv-and-radio/tv-and-radio', 'society/society', 'world/americas', 'world/africa', 'world/asia-pacific', 'world/middleeast', 'us-news/trump-administration']);

const QUIET_SECTIONS = [
  'lifeandstyle', 'food', 'travel', 'books', 'film', 'music', 'games',
  'stage', 'artanddesign', 'tv-and-radio', 'science', 'environment',
];

function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function toneOf(tags = []) {
  const ids = tags.map(t => t.id);
  const pick = (id, label) => ids.includes(id) ? label : null;
  return pick('tone/minutebyminute', 'Live')
    || pick('tone/analysis', 'Analysis')
    || pick('tone/comment', 'Comment')
    || pick('tone/editorials', 'Editorial')
    || pick('tone/explainers', 'Explainer')
    || pick('tone/interview', 'Interview')
    || pick('tone/reviews', 'Review')
    || pick('tone/obituaries', 'Obituary')
    || pick('tone/recipes', 'Recipe')
    || pick('tone/letters', 'Letters')
    || pick('tone/features', 'Feature')
    || pick('tone/news', 'Report')
    || null;
}

function topicOf(tags, sectionName) {
  const keywords = tags.filter(t => t.type === 'keyword');
  const generic = (t) => { const [a, b] = t.id.split('/'); return a === b || GENERIC_TAGS.has(t.id) || t.webTitle === sectionName; };
  const t = keywords.find(k => !generic(k));
  return t ? t.webTitle : undefined;
}

function compact(r) {
  const f = r.fields || {};
  const tags = r.tags || [];
  return {
    id: r.id,
    title: (f.headline || r.webTitle).trim(),
    type: r.type,
    section: r.sectionName,
    sectionId: r.sectionId,
    pillar: (r.pillarName || '').toLowerCase() || null,
    published: r.webPublicationDate,
    words: f.wordcount ? Number(f.wordcount) : null,
    kind: toneOf(tags),
    place: placeOf(tags.map(t => t.id), r.sectionId) || undefined,
    topic: topicOf(tags, r.sectionName),
    series: (tags.find(t => t.type === 'series') || {}).webTitle,
    seriesId: (tags.find(t => t.type === 'series') || {}).id,
    longRead: tags.some(t => t.id === 'news/series/the-long-read'),
    trail: f.trailText ? stripHtml(f.trailText).slice(0, 220) : undefined,
    byline: f.byline || undefined,
    thumb: f.thumbnail || undefined,
  };
}

export function trimWords(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export function stripHtml(s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

// What a live blog is about, in a word or two: the headline's suffix ("– UK politics"),
// else its first specific tag, else its section.
export function blogTopic(blog) {
  const keywords = (blog.tags || []).filter(t => t.type === 'keyword');
  const generic = (t) => { const [a, b] = t.id.split('/'); return a === b || GENERIC_TAGS.has(t.id); };
  const topicTag = keywords.find(t => !generic(t));
  const headline = (blog.fields && blog.fields.headline) || blog.webTitle;
  const suffix = headline.match(/\s[–-]\s([^–-]+?)\s*$/);
  let topic = suffix ? suffix[1].replace(/\b(live|as it happened|latest( news| updates)?)\b/gi, '').replace(/\s+/g, ' ').trim() : '';
  if (!topic) topic = topicTag ? topicTag.webTitle : blog.sectionName;
  return topic.charAt(0).toUpperCase() + topic.slice(1);
}

export async function buildSnapshot({ fetchJson, apiKey = null, now = new Date(), log = () => {} }) {
  const q = (path, params) => {
    const u = new URL(API + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (apiKey) u.searchParams.set('api-key', apiKey);
    return fetchJson(u.toString());
  };

  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const items = {};
  const add = (r) => {
    const c = compact(r);
    const prev = items[c.id] || {};
    for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
    items[c.id] = { ...prev, ...c };
    return c.id;
  };

  // 1. Each edition's front: editors' picks, deeply read, most viewed.
  const editions = {};
  for (const ed of EDITIONS) {
    log(`front: ${ed}`);
    const res = await q(`/${ed}`, {
      'show-editors-picks': 'true', 'show-most-viewed': 'true', 'show-deeply-read': 'true',
      'show-fields': FIELDS, 'show-tags': TAGS,
    });
    const r = res.response;
    const uniq = (list) => [...new Set((list || []).map(add))];
    editions[ed] = {
      picks: uniq(r.editorsPicks),
      deeplyRead: uniq(r.deeplyRead),
      mostViewed: uniq(r.mostViewed),
    };
  }

  // 2. Everything published in the last 24 hours (for the day strip and "further afield").
  log('day: all pieces in 24h');
  const day = [];
  for (let page = 1; page <= 3; page++) {
    const res = await q('/search', {
      'from-date': iso(dayAgo), 'page-size': '200', 'page': String(page),
      'order-by': 'newest', 'show-fields': 'headline,wordcount', 'show-tags': TAGS,
    });
    const r = res.response;
    for (const it of r.results) day.push(add(it));
    if (page >= r.pages) break;
  }

  // 3. Live blogs from the last 24 hours, with their key events: the ticker.
  log('ticker: live blog key events');
  const live = await q('/search', {
    'tag': 'tone/minutebyminute', 'from-date': iso(dayAgo), 'page-size': '30',
    'order-by': 'newest', 'show-blocks': 'body:key-events', 'show-fields': 'headline,liveBloggingNow,lastModified', 'show-tags': 'keyword',
  });
  const ticker = [];
  for (const blog of live.response.results) {
    const topic = blogTopic(blog);
    const isLive = Boolean(blog.fields && blog.fields.liveBloggingNow === 'true');
    const blocks = (blog.blocks && blog.blocks.requestedBodyBlocks && blog.blocks.requestedBodyBlocks['body:key-events']) || [];
    for (const b of blocks) {
      if (!b.title || !b.firstPublishedDate) continue;
      if (/^(closing|opening|early) (summary|post)$/i.test(b.title.trim())) continue;
      if (new Date(b.firstPublishedDate) < dayAgo) continue;
      ticker.push({
        time: b.firstPublishedDate,
        title: stripHtml(b.title),
        summary: b.bodyTextSummary ? trimWords(stripHtml(b.bodyTextSummary), 160) : null,
        blog: (blog.fields && blog.fields.headline) || blog.webTitle,
        blogId: blog.id,
        block: b.id,
        topic,
        live: isLive,
        updated: (blog.fields && blog.fields.lastModified) || blog.webPublicationDate,
        section: blog.sectionName,
        pillar: (blog.pillarName || '').toLowerCase() || null,
      });
    }
  }
  ticker.sort((a, b) => new Date(b.time) - new Date(a.time));

  // 4. Pools for "off the front".
  log('pools: long reads and quieter pieces');
  const longReads = await q('/search', {
    'tag': 'news/series/the-long-read', 'from-date': iso(weekAgo),
    'page-size': '20', 'order-by': 'newest', 'show-fields': FIELDS, 'show-tags': TAGS,
  });
  const features = await q('/search', {
    'tag': 'tone/features,type/article', 'from-date': iso(weekAgo),
    'page-size': '60', 'order-by': 'newest', 'show-fields': FIELDS, 'show-tags': TAGS,
  });
  const quiet = await q('/search', {
    'tag': '-tone/news,-tone/minutebyminute,-tone/callout', 'section': QUIET_SECTIONS.join('|'),
    'from-date': iso(weekAgo), 'page-size': '60', 'order-by': 'newest', 'show-fields': FIELDS, 'show-tags': TAGS,
  });
  const pools = {
    long: [...new Set([...longReads.response.results, ...features.response.results].map(add))].filter(id => (items[id].words || 0) >= 1800),
    quiet: quiet.response.results.map(add).filter(id => items[id].type === 'article' && (items[id].words || 0) >= 400),
  };

  return {
    name: 'Daylight',
    takenAt: iso(now),
    window: { from: iso(dayAgo), to: iso(now) },
    counts: { published24h: day.length, ticker: ticker.length },
    editions,
    day,
    ticker: ticker.slice(0, 80),
    pools,
    items,
    brief: null,
    labels: null,
  };
}

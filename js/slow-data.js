// Builds the slow page: features, interviews, recipes, reviews and picture galleries from the
// last two or three days, outside the news, with proper pictures. Runs in Node and the browser.
import { trimWords, stripHtml } from './snapshot.js';

const API = 'https://content.guardianapis.com';
const HARD = new Set(['politics', 'uk-news', 'us-news', 'world', 'australia-news', 'business', 'money', 'law', 'media', 'commentisfree']);
const SOFT_NEWS = new Set(['science', 'environment', 'global-development', 'cities', 'education', 'society']);

function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function pickAsset(el, maxW = 1000) {
  const assets = (el.assets || []).map(a => ({ src: a.file, w: Number(a.typeData && a.typeData.width), h: Number(a.typeData && a.typeData.height), td: a.typeData || {} }))
    .filter(a => a.src && a.w && a.h && a.w <= maxW).sort((a, b) => b.w - a.w);
  const a = assets[0];
  if (!a) return null;
  return { src: a.src, w: a.w, h: a.h, alt: a.td.altText ? stripHtml(a.td.altText).slice(0, 160) : undefined, credit: a.td.credit ? stripHtml(a.td.credit).slice(0, 80) : undefined, caption: a.td.caption ? trimWords(stripHtml(a.td.caption), 180) : undefined };
}

export async function buildSlow({ fetchJson, apiKey = null, now = new Date(), snap = null, log = () => {} }) {
  const q = (path, params) => {
    const u = new URL(API + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (apiKey) u.searchParams.set('api-key', apiKey);
    return fetchJson(u.toString());
  };
  const twoDays = new Date(now.getTime() - 48 * 3600 * 1000);
  const threeDays = new Date(now.getTime() - 72 * 3600 * 1000);
  const deep = new Set(snap ? Object.values(snap.editions).flatMap(e => e.deeplyRead) : []);

  log('slow: features');
  const items = [];
  for (let page = 1; page <= 2; page++) {
    const res = await q('/search', {
      'tag': 'tone/features|tone/interview|tone/recipes|tone/reviews', 'type': 'article', 'from-date': iso(twoDays),
      'page-size': '200', 'page': String(page), 'order-by': 'newest',
      'show-fields': 'headline,trailText,wordcount,byline,starRating', 'show-tags': 'series,tone', 'show-elements': 'image',
    });
    for (const r of res.response.results) {
      const pillar = (r.pillarName || '').toLowerCase();
      if (pillar === 'opinion' || HARD.has(r.sectionId) || (r.sectionId || '').startsWith('thefilter')) continue;
      if (pillar === 'news' && !SOFT_NEWS.has(r.sectionId)) continue;
      const main = (r.elements || []).find(e => e.type === 'image' && e.relation === 'main') || (r.elements || []).find(e => e.type === 'image');
      const image = main ? pickAsset(main) : null;
      if (!image) continue;
      const f = r.fields || {};
      const series = (r.tags || []).find(t => t.type === 'series');
      if (series && /newsletter|briefing|quiz|podcast/i.test(series.webTitle)) continue;
      const tones = (r.tags || []).filter(t => t.type === 'tone').map(t => t.id);
      items.push({
        id: r.id, type: 'article',
        title: (f.headline || r.webTitle).trim(),
        trail: f.trailText ? trimWords(stripHtml(f.trailText), 220) : undefined,
        words: f.wordcount ? Number(f.wordcount) : undefined,
        byline: f.byline || undefined,
        stars: f.starRating ? Number(f.starRating) : undefined,
        section: r.sectionName, sectionId: r.sectionId, pillar,
        published: r.webPublicationDate,
        kind: tones.includes('tone/recipes') ? 'Recipe' : tones.includes('tone/interview') ? 'Interview' : tones.includes('tone/reviews') ? 'Review' : 'Feature',
        series: series ? series.webTitle : undefined, seriesId: series ? series.id : undefined,
        image,
        loved: deep.has(r.id) || undefined,
      });
    }
    if (page >= res.response.pages) break;
  }

  log('slow: galleries');
  const gal = await q('/search', {
    'type': 'gallery', 'from-date': iso(threeDays), 'page-size': '30', 'order-by': 'newest',
    'show-fields': 'headline,trailText,byline', 'show-tags': 'series', 'show-elements': 'image',
  });
  for (const r of gal.response.results) {
    const frames = (r.elements || []).filter(e => e.type === 'image').map(e => pickAsset(e)).filter(Boolean).slice(0, 12);
    if (frames.length < 2) continue;
    const f = r.fields || {};
    const series = (r.tags || []).find(t => t.type === 'series');
    items.push({
      id: r.id, type: 'gallery',
      title: (f.headline || r.webTitle).trim().replace(/\s*[–-]\s*in pictures$/i, ''),
      trail: f.trailText ? trimWords(stripHtml(f.trailText), 220) : undefined,
      byline: f.byline || undefined,
      section: r.sectionName, sectionId: r.sectionId, pillar: (r.pillarName || '').toLowerCase(),
      published: r.webPublicationDate,
      kind: 'In pictures',
      series: series ? series.webTitle : undefined, seriesId: series ? series.id : undefined,
      image: frames[0], frames,
      loved: deep.has(r.id) || undefined,
    });
  }

  items.sort((a, b) => new Date(b.published) - new Date(a.published));
  const seriesCount = {};
  for (const it of items) if (it.seriesId) seriesCount[it.seriesId] = { name: it.series, n: (seriesCount[it.seriesId] || { n: 0 }).n + 1 };
  return { takenAt: iso(now), items, series: seriesCount };
}

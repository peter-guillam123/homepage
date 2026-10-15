// Builds the wire: every news article from the last 24 hours and the latest posts from every
// news live blog, for the feed page. Runs in Node and in the browser, like the snapshot builder.
import { trimWords, stripHtml, blogTopic } from './snapshot.js';
import { placeOf } from './places.js';

const API = 'https://content.guardianapis.com';
const GENERIC = new Set(['politics/politics', 'uk/uk', 'world/world', 'us-news/us-news', 'australia-news/australia-news', 'business/business', 'world/europe-news', 'us-news/us-politics', 'business/economics']);

function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function topicOf(tags, sectionName) {
  const t = (tags || []).filter(t => t.type === 'keyword').find(t => { const [a, b] = t.id.split('/'); return a !== b && !GENERIC.has(t.id) && t.webTitle !== sectionName; });
  return t ? t.webTitle : undefined;
}

export async function buildWire({ fetchJson, apiKey = null, now = new Date(), snap = null, log = () => {} }) {
  const q = (path, params) => {
    const u = new URL(API + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (apiKey) u.searchParams.set('api-key', apiKey);
    return fetchJson(u.toString());
  };
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  log('wire: news articles');
  const articles = [];
  for (let page = 1; page <= 2; page++) {
    const res = await q('/search', {
      'tag': 'tone/news|tone/analysis|tone/explainers', 'type': 'article', 'from-date': iso(dayAgo),
      'page-size': '200', 'page': String(page), 'order-by': 'newest',
      'show-fields': 'headline,trailText,thumbnail,wordcount,byline', 'show-tags': 'keyword,tone',
    });
    for (const r of res.response.results) {
      if (r.pillarName !== 'News') continue;
      const f = r.fields || {};
      const tones = (r.tags || []).filter(t => t.type === 'tone').map(t => t.id);
      articles.push({
        id: r.id,
        title: (f.headline || r.webTitle).trim(),
        trail: f.trailText ? trimWords(stripHtml(f.trailText), 200) : undefined,
        thumb: f.thumbnail || undefined,
        words: f.wordcount ? Number(f.wordcount) : undefined,
        byline: f.byline || undefined,
        section: r.sectionName, sectionId: r.sectionId,
        published: r.webPublicationDate,
        kind: tones.includes('tone/analysis') ? 'Analysis' : tones.includes('tone/explainers') ? 'Explainer' : 'Report',
        topic: topicOf(r.tags, r.sectionName),
        place: placeOf((r.tags || []).map(t => t.id), r.sectionId) || undefined,
      });
    }
    if (page >= res.response.pages) break;
  }

  log('wire: live blog posts');
  const live = await q('/search', {
    'tag': 'tone/minutebyminute', 'from-date': iso(dayAgo), 'page-size': '40', 'order-by': 'newest',
    'show-blocks': 'body:latest:14', 'show-fields': 'headline,liveBloggingNow,lastModified', 'show-tags': 'keyword',
  });
  const keyBlocks = new Set((snap && snap.ticker || []).map(t => t.block));
  const posts = [];
  const blogs = {};
  for (const blog of live.response.results) {
    if (blog.pillarName !== 'News') continue;
    const blocks = (blog.blocks && blog.blocks.requestedBodyBlocks && blog.blocks.requestedBodyBlocks['body:latest:14']) || [];
    blogs[blog.id] = {
      title: ((blog.fields && blog.fields.headline) || blog.webTitle).trim(),
      topic: blogTopic(blog),
      section: blog.sectionName, sectionId: blog.sectionId,
      live: Boolean(blog.fields && blog.fields.liveBloggingNow === 'true'),
      updated: (blog.fields && blog.fields.lastModified) || blog.webPublicationDate,
      total: (blog.blocks && blog.blocks.totalBodyBlocks) || blocks.length,
    };
    for (const b of blocks) {
      if (!b.firstPublishedDate || new Date(b.firstPublishedDate) < dayAgo) continue;
      const text = b.bodyTextSummary ? trimWords(stripHtml(b.bodyTextSummary), 320) : '';
      if (!b.title && !text) continue;
      posts.push({
        blogId: blog.id, block: b.id, time: b.firstPublishedDate,
        title: b.title ? stripHtml(b.title) : undefined,
        text: text || undefined,
        key: keyBlocks.has(b.id) || undefined,
        hasImage: (b.elements || []).some(e => e.type === 'image') || undefined,
      });
    }
  }

  // Where each article sits on the fronts, from the snapshot.
  const fronts = {}, deep = {}, viewed = {};
  if (snap) {
    for (const [ed, data] of Object.entries(snap.editions)) {
      for (const id of data.picks) (fronts[id] = fronts[id] || []).push(ed);
      for (const id of data.deeplyRead) (deep[id] = deep[id] || []).push(ed);
      for (const id of data.mostViewed) (viewed[id] = viewed[id] || []).push(ed);
    }
  }
  const ids = new Set(articles.map(a => a.id));
  const only = (m) => Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)));

  return {
    takenAt: iso(now),
    window: { from: iso(dayAgo), to: iso(now) },
    articles, posts, blogs,
    fronts: only(fronts), deep: only(deep), viewed: only(viewed),
  };
}

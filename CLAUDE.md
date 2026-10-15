# Daylight

Kind: Work
Audience: colleagues, as a provocation. What a Guardian homepage might be for people who come once a day.
Voice: my voice for the About page and the brief's framing; plain, instructional for UI copy.
Design: its own look. Warm paper, ink, one sun. Pillar colours are a cue, not the Guardian's.
Public: yes. GitHub Pages, as a sketch, not a product.

## What it is

A one-page site that rebuilds the homepage for a less frequent reader. The data comes from the
Guardian Content API: editors' picks, deeply read and most viewed for the five edition fronts,
every piece published in the last 24 hours, and the key events from the day's live blogs.
No Ophan, no personalisation beyond what the browser remembers locally.

## How it works

- `js/snapshot.js` builds the data. It runs in Node (`scripts/build-snapshot.mjs`, hourly in
  GitHub Actions) and in the browser, when a reader stores their own API key.
- `js/choose.js` picks the eight pieces worth a reader's time and explains why, the ten for the
  world map, the twelve ticker events and the other desks' stories. The page and the brief
  script both use it, so they never disagree.
- `js/places.js` maps the Guardian's country tags to coordinates for the world map.
- `scripts/brief.mjs` writes the brief: Claude if `ANTHROPIC_API_KEY` is set, otherwise
  stitched headlines. The page says which.
- `js/wire-data.js` builds `data/wire.json` for the wire page (`wire.html`, `js/wire.js`): news
  articles and live blog posts from the last 24 hours.
- `js/slow-data.js` builds `data/slow.json` for the slow page (`slow.html`, `js/slow.js`):
  features and galleries outside the news, with full-size images.
- `data/snapshot.json` is committed. `data/world-dots.json` is the dot map, built once from
  world-atlas with `scripts/build-world-dots.mjs`.
- No build step for the site. Vanilla JS modules, one stylesheet, two Google fonts.

## Rules for this project

- Keep the page short. The whole point is that it ends.
- Every item says why it is there. Never hide the signal behind the choice.
- Nothing leaves the browser. The "What this page knows" panel must list everything stored.
- Keyboard, screen reader, reduced motion and phone are the minimum, not extras.
- Update `about.html`'s diary with each significant change, newest first.

## Running it

    python3 -m http.server 8765        # then open http://localhost:8765/
    GUARDIAN_API_KEY=... node scripts/build-snapshot.mjs

In a Claude cloud session the proxy injects the key, but Node needs `NODE_USE_ENV_PROXY=1`.

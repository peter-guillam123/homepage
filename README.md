# Daylight

A Guardian homepage for people who come once a day. A sketch, not a product.

The real homepage answers "what is happening now". This one answers "what happened since you
left, and what is worth your time". It is built from signals the Guardian already has, it
chooses eight pieces and says why, and it ends.

## Pieces

- **The day strip.** Twenty-four hours of real sunlight at the edition's city, the newsroom's
  output as bars every 20 minutes, the chosen eight as numbered points, and a mark for your last visit.
- **The brief.** Three sentences. Claude writes them when a key is present; otherwise a script
  stitches headlines and says so.
- **Still moving.** Twelve key events shared across the day's live blogs, one at a time.
- **Worth your time.** Eight pieces, each with its reason: editors' pick, deeply read, most
  viewed, on how many fronts. A time budget trims the list to fit.
- **Around the world.** Ten stories from ten places on an annotated dot map, placed by the
  Guardian's own country tags. The same for every edition.
- **From the other editions.** For each other edition, the top story it runs that no other front does.
- **Off the front.** Deeply read, from a series, a quieter piece.
- **The end.** That's the day.

## Data

`scripts/build-snapshot.mjs` fetches from the Guardian Content API and writes
`data/snapshot.json`. A GitHub Action runs it hourly when the `GUARDIAN_API_KEY` secret is set,
and publishes the site. `ANTHROPIC_API_KEY` is optional and turns on the written brief.

Readers with their own Content API key can paste it into "What this page knows" and the page
fetches live, in the browser. The key stays there.

## Running locally

    python3 -m http.server 8765
    GUARDIAN_API_KEY=... node scripts/build-snapshot.mjs

The dot map comes from `world-atlas`: `npm pack world-atlas@2.0.2`, unpack, then
`node scripts/build-world-dots.mjs package/land-110m.json`.

Built by Chris Moran with Claude. Stories link to theguardian.com. Not a Guardian product.

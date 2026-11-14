# Passalong starter

Worksheets that fit in a tiny file, work offline on any phone, and send answers back as a short code.

This is the tested starting point for the AccessED Hacks entry. The roadmap doc says what to build on top of it.

## What is here

- `src/core/` — the worksheet parser, the answer code, the pack link, grading, rendering and the single-file filler. 22 unit tests.
- `src/player/` — the Practise screen: checking, hints, saved progress, the code screen.
- `scripts/postbuild.mjs` — writes the service worker, prints sizes, fails the build if the empty player passes 20 KB.
- `scripts/e2e.mjs` — headless Chrome check: pack opened from disk, scripts off, and the link player offline.
- `index.html`, `collect/index.html`, `about/index.html` — empty shells. **These are yours to write.**

## Commands

```bash
npm install
npm run dev         # http://localhost:5173  (the player is at /p/)
npm test            # unit tests
npm run typecheck
npm run build       # site + single-file template + sw.js + size report
npm run e2e         # build, then the browser check
npm run preview
```

`npm run e2e` uses the Chrome installed on your computer. If it cannot find it:

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run e2e
```

It should print the code `01E1-284G-02ZG` twice and write a sample pack to `out/`.

## Try the player in dev

There is no Make screen yet, so open the sample from the browser console on any page of the dev server:

```js
const { encodeLink } = await import('/src/core/link.ts');
const { SAMPLE } = await import('/src/core/sample.ts');
location.href = '/p/#' + encodeLink(SAMPLE);
```

## Hosting

Serve `dist/` from a domain root (all paths start with `/`). `vercel.json` is included.

## Disclosure

This starter was written with AI assistance (Claude) on 14 Nov 2026, during the hackathon window. Say so in the submission.

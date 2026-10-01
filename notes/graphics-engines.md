# Graphics: should Crimedog move to a 2D engine?

Research only, no game code changed. Written 2026-10-01.

**Short answer:** no wholesale move. Keep the DOM + inline-SVG UI and add motion with persistent SVG nodes, the
Web Animations API (WAAPI) and a portrait bitmap cache. If a one-day spike shows that isn't enough for the heist board,
add a **PixiJS v8 canvas for the heist playback (and maybe the venue scene) only**, behind the existing DOM UI.
Phaser and Kaplay don't suit this game. Details, measurements and sources follow.

## 1. What we have today (measured)

The renderer is HTML strings plus procedurally generated inline SVG: portraits (`src/dogs.js portraitSVG`), venues and
skyline (`src/art.js`), the heist blueprint (`src/ui.js blueprintSVG`) and share cards (`src/card.js`, SVG → PNG). Motion is
CSS keyframes: the marching route, room glow, alarm wash and sirens (`styles.css` ~L391–421). It is turned off under
`prefers-reduced-motion`.

SVG features the art depends on (counts of occurrences in source):

| feature | art.js | dogs.js | ui.js | card.js |
|---|---|---|---|---|
| gradients | 16 | 14 | 4 | 0 |
| `<pattern>` | 2 | 3 | 2 | 0 |
| `transform=` | 2 | 1 | 5 | 0 |
| `filter=` (blur glow) | 0 | 0 | 3 | 0 |
| `<text>` (incl. emoji icons) | 12 | 0 | 8 | 9 |

Probe numbers: headless Chromium 390×844 @2x, SwiftShader (software GPU), 4× CPU throttle, seed 3, median of 5.
The timings cover JS plus forced style and layout. **Paint is not included**, so treat them as relative.

| screen | render ms | DOM nodes | SVG elements |
|---|---|---|---|
| title | 11.5 | 209 | 195 |
| select (job board) | 26 | 537 | 463 |
| job | 18.5 | 287 | 207 |
| **pub** | **40** | 612 | 520 (6 portraits) |
| crew | 10.5 | 134 | 89 |
| kit / fixer / plan / aftermath | 7–18 | 30–163 | 0 |
| **heist, per beat (`cd.step(1)`)** | **25–51** | 179 | 150 |

- A portrait is about 6.6 KB of markup and about 90 elements, and costs about 1.2 ms of JS to build.
- **The heist board re-renders the whole blueprint on every beat** (`patchHeist` sets `.heist-head` innerHTML, which
  rebuilds every token's nested portrait). That costs 25–50 ms per beat on a throttled phone. It is also why tokens
  *jump* between rooms instead of *moving*: no node survives from one beat to the next, so nothing can animate.
  This is the main obstacle to "tokens moving on the blueprint", and changing the renderer doesn't remove it.
  The scene has to keep its nodes between beats.
- Rasterising one portrait SVG to a bitmap (Blob → `<img>` decode → canvas → `ImageBitmap`, 320 px) took a
  **median of 8.8 ms (max 11) unthrottled and 51 ms (max 105) at 4×**. Caching is a win only for portraits drawn
  repeatedly (tokens every beat, the pub list on every render). The cache must be filled lazily or at idle time, never all at once
  on a screen change. Every engine that takes SVG art pays this same cost, because they all rasterise through the browser.

## 2. The options

### 2.1 PixiJS v8 (renderer library)
- **Version and maintenance:** 8.21.0, published 2026-09-17 (npm). Releases are frequent: 8.17 (Mar), 8.18 (Apr), 8.19 (Jun),
  8.20 (Aug) and 8.21 (Sep) 2026. The `dev` tag was published on 2026-10-01. MIT. The PixiJS blog reports more than 500k weekly npm
  downloads (claim not verified).
- **Size (measured from the npm tarball):** `dist/pixi.min.mjs` is 829 KB raw and **233 KB gzip**. It is self-contained: no
  bare imports, no dynamic chunks. For comparison, all of Crimedog's `src/*.js` and `styles.css` come to about 162 KB gzip, so Pixi
  roughly 2.4×es the download. Without a bundler there's no tree-shaking, so the whole bundle ships.
- **No build step:** works. I imported `pixi.min.mjs` as a plain ES module, ran `Application.init` and rendered with the WebGL
  renderer in headless Chromium. Import took about 220 ms and init about 58 ms, unthrottled on SwiftShader. jsDelivr mirrors every npm
  version (`https://cdn.jsdelivr.net/npm/pixi.js@8.21.0/dist/pixi.min.mjs`). cdnjs lists v8 builds up to at least 8.12 in search
  results. I could not reach either CDN from this sandbox to confirm that 8.21 is there. Vendoring one file into `vendor/` also works and
  keeps GitHub Pages and the claude.ai artifact build free of third-party fetches.
- **Mobile:** WebGL/WebGPU batching. Fast for many sprites and particles, which are things SVG is bad at: hundreds of raindrops,
  blurred light pools, displacement and colour-matrix filters. It needs care with context loss, texture memory and DPR on phones.
  I have no first-hand phone numbers. The v8 launch post claims large gains over v7 in Bunnymark-style benchmarks.
- **Text/UI:** canvas text (`Text`, `BitmapText`, `HTMLText`). There is an opt-in **AccessibilitySystem** that lays focusable DOM divs
  over accessible objects, and an experimental **`DOMContainer`** that positions real HTML elements from the scene graph. Both
  ship in the default bundle (checked: `PIXI.AccessibilitySystem` and `PIXI.DOMContainer` exist). A Pixi-only UI
  would need us to rebuild buttons, scrolling lists, modals and wrapping text that CSS gives us for free.
- **Carrying SVG art over (tested with our real art, see `notes/captures/graphics-pixi-svg-probe.png`):**
  - `Graphics.svg(string)` parses only `path, circle, rect, ellipse, line, polygon, polyline, g, svg`, plus linear and radial gradients in
    `<defs>`. In the 8.21 parser source I found **no `<pattern>`, no `filter`, no `transform` attribute, and `<text>` is
    unsupported** (it logs a warning). The pub portrait came out wrong: no backdrop, a white hat and white jacket, no cloth pattern.
    The venue lost its text and overflowed its viewBox. **Our art can't go through `Graphics.svg()` without a rewrite.**
  - **Texture path:** `Assets.load({ src, parser: 'svg', data: { resolution } })` rasterises through the browser, and the result was
    **pixel-faithful**: backdrop pattern, lighting gradients, tweed jacket. It took about 150 ms for the first one (cold, unthrottled). So
    `portraitSVG()` and `venueSVG()` carry over unchanged as textures, but they become static bitmaps. To animate parts of a picture (blinking eyes,
    rain) you split it into layers or draw those parts natively in Pixi.
  - The PixiJS blog says 8.18–8.19 added "HTML-in-Canvas" textures. In 8.21 this is the separate `packages/html-source` add-on, and
    it throws unless the browser's experimental HTML-in-Canvas API (`texElementImage2D`) is enabled. That rules it out for real phones today.
- **Testing:** Playwright composited screenshots still work. The stills sweep's luma/variance check is unchanged, and WebGL ran under
  headless SwiftShader in the probe. You can't tap a canvas object by DOM selector, so tests tap coordinates that
  `cd` exposes (for example `cd.getState().heist.tokens[i].{x,y}`) or assert on state. A hybrid keeps every button in the DOM, so
  `tools/smoke.mjs` taps don't change. As a bonus, the `drawCalls` and `shaderPrograms` fields in `getState()` become real numbers.

### 2.2 Phaser (3 and 4)
- **Version and maintenance:** Phaser 4 is out. 4.0.0 "Caladan" (2026-04-10), 4.1.0 (2026-04-30), 4.2.0 (2026-06-19) and
  **4.2.1 (2026-07-09)** is the npm `latest`. It has a new RenderNode WebGL renderer and a unified Filters system. The Canvas renderer is "still
  available but should be considered deprecated". Phaser 3's last release is **3.90.0 (2025-05-23)**, and npm `latest` is now v4,
  so treat v3 as legacy. MIT.
- **Size (measured):** 4.2.1 `phaser.esm.min.js` is 1.38 MB raw and **353 KB gzip**. 3.90.0 is 1.20 MB raw and **316 KB gzip**. Both have
  ESM builds that need no build step.
- **Fit:** Phaser is a full game framework: scenes, loader, physics, cameras, input, tweens and sound. Crimedog would use almost none
  of it. `load.svg(key, url, {width,height,scale})` rasterises SVG to textures, like the Pixi texture path. A
  `DOMElement` game object exists for HTML. UI-in-canvas has the same problems as Pixi, with a heavier bundle and an API that wants to own
  the page and the game loop (ours is in `main.js`).
- **Testing and migration:** the same coordinate-tap story as Pixi. Phaser's scene lifecycle and loader would need wrapping to keep
  `freeze/step/simdt` deterministic. Migration cost is high, close to a rewrite of `ui.js` (990 lines) and `main.js`.

### 2.3 Kaplay (formerly Kaboom)
- **Version and maintenance:** stable `latest` is **3001.0.19 (2025-06-15)**. The v4000 line is still in alpha: **4000.0.0-alpha.27.1
  (2026-05-12)**, and the alphas have been running since at least alpha.22 (Oct 2025). That's 15 months without a stable release and an
  unknown date for v4000 (I couldn't find a published roadmap). MIT.
- **Size (measured):** 3001.0.19 `kaplay.mjs` is 189 KB raw and **69 KB gzip**. The v4000 alpha is **102 KB gzip**. It is the lightest
  engine here, and the ESM build works from a CDN.
- **Fit:** a fun-first, whole-screen canvas game library with a component/tag model, made for arcade games. All UI and text live in the
  WebGL canvas. Its docs say rich text effects (stroke, gradient) need a plugin that draws to a 2D canvas first. It has no SVG
  pipeline beyond loading images through the browser (not verified that `loadSprite` accepts SVG data URLs). There's no
  accessibility story for menu-heavy UI.
- **Verdict:** wrong shape for a card- and menu-driven management game, and its release cadence is a risk.

### 2.4 Stay with DOM + SVG, plus small helpers
- **WAAPI / CSS** (no dependency): `element.animate()` on `transform`/`opacity` of SVG `<g>` nodes runs on the compositor in modern
  browsers, so it stays smooth when the main thread is busy (motion.dev performance guide). It also respects the existing
  reduced-motion rule. That covers tokens sliding between rooms, a portrait idle bob or blink, flickering lamps, drifting fog and rain
  sheets (one `<path>` translated, not 46 animated nodes).
- **Tween libraries, if WAAPI isn't enough** (measured min+gzip): GSAP 3.15.0 `gsap.min.js` is **28 KB**. It's free for commercial use since the
  Webflow acquisition, under the GSAP "Standard 'no charge'" license, which is not an OSI license. anime.js 4.5.0 ESM bundle is **41 KB** and MIT. Motion 13.5.0
  (published today) builds on WAAPI. None of them is required.
- **Portrait cache:** generate each dog's SVG once and keep a Blob URL (or `ImageBitmap`) keyed by `dog.id + look + size`. Use `<img>`
  or SVG `<image href>` in the pub, blueprint tokens and beat log. That removes hundreds of duplicate `<defs>`/patterns from the DOM
  (pub: 520 SVG elements) and the per-render string building. Fill it lazily (`requestIdleCallback`), given the 9–51 ms per-portrait
  raster cost. Portraits contain no `<text>`, so SVG-in-`<img>` font limits don't matter.
- **Persistent heist scene:** build the blueprint SVG once per job. On each beat, update attributes, classes and token transforms instead of
  re-setting innerHTML. This is the change that makes motion possible and takes the 25–50 ms per-beat cost off the main thread.
- **Cost:** zero bytes for WAAPI, no new test model, smoke tests and stills sweep unchanged, accessibility unchanged. The ceiling:
  heavy particles, real-time lighting/blur over large areas and per-pixel effects are expensive in SVG on phones. SVG filters in
  particular repaint on the CPU in some browsers.

### 2.5 Hybrid: DOM UI + a Pixi canvas for the heist board (and optionally the venue scene)
- Keep every menu, card, button and text in the DOM. Mount one `<canvas>` in place of `.blueprint` (and optionally the venue
  banner on the job screen), driven by `G.state` and our existing frame loop (`app.ticker` off, `app.render()` from `frame()`, so
  `freeze/step/simdt` keep working).
- Art carries over as textures from the existing `portraitSVG`/`venueSVG` (faithful, as tested). Native Pixi drawing covers what
  should move: tokens, route dashes, alarm wash, sirens, rain/fog particles, torch-light cones.
- Cost: 233 KB gzip loaded only on the heist screen (`import()` on demand), plus about 300–500 lines of new scene code replacing
  `blueprintSVG` (~100 lines). Smoke-test taps don't change. Add `getState().heist.tokens` and a canvas non-blank check. Risks:
  WebGL context loss on Android (must re-upload textures), texture memory for cached portraits, and keeping a second renderer's
  look consistent with the SVG art around it.

## 3. Comparison

| | Pixi v8 (full) | Pixi hybrid (heist board) | Phaser 4 | Kaplay | DOM+SVG+WAAPI |
|---|---|---|---|---|---|
| Current version | 8.21.0 (2026-09-17) | same | 4.2.1 (2026-07-09) | 3001.0.19 (2025-06); 4000 alpha | n/a (browser) |
| Maintenance | very active | very active | active, v4 new | stable line quiet; v4000 in long alpha | n/a |
| min+gzip | 233 KB | 233 KB, lazy | 353 KB (v3: 316) | 69 KB (v4000α: 102) | 0 (GSAP 28 if wanted) |
| No build step / CDN ESM | yes (tested) | yes | yes (ESM build) | yes | yes |
| Our SVG art | texture: faithful; `Graphics.svg`: broken | texture | texture (`load.svg`) | image load only | native |
| Text/UI/a11y | rebuild in canvas; opt-in a11y overlay | DOM stays | rebuild; `DOMElement` | rebuild in canvas | native, CSS |
| Motion/particles/lighting | excellent | excellent where it matters | excellent | good | good for transforms; weak for particles and filters |
| Playwright | coordinate taps + state | taps unchanged | coordinate taps + state | coordinate taps + state | unchanged |
| Migration | weeks (rewrite `ui.js`) | days | weeks+ | weeks+ | 1–3 days |

## 4. Recommendation

1. **Don't migrate the game to an engine.** Crimedog is menus, cards and text, and the DOM is the best UI toolkit available on phones
   (layout, scrolling, wrapping, accessibility, real taps in tests). Phaser and Kaplay would make us rebuild all of it for features we
   don't use. Kaplay's stable line has also stalled behind a long v4000 alpha.
2. **Get motion from DOM+SVG first.** Make the heist blueprint a persistent scene and animate tokens with WAAPI. Add a lazily filled
   portrait bitmap/Blob-URL cache, and add idle and weather motion with CSS/WAAPI transforms. "Richer, more characterful art" is
   a job for the art generators, whatever renders it.
3. **If an engine is needed, use PixiJS v8 as a hybrid, scoped to the heist board (and possibly the venue scene)**, loaded on
   demand, with art brought over through the SVG *texture* path (not `Graphics.svg`). Pixi is the only option that's a renderer
   rather than a framework. It drops into a DOM app, is actively released, ships one self-contained ESM file, and has a DOM-friendly
   accessibility layer and `DOMContainer` if we ever need them.

## 5. A low-risk first step: a heist-board spike, two ways, one day each

Do it on a branch, behind `?gfx=pixi`, leaving the default path untouched. Use the same seed and the same job for both.

- **A, DOM:** build `blueprintSVG` once per job. Per beat, move token `<g>`s with `el.animate({transform: …}, 450 ms)`,
  toggle room classes, and keep the alarm wash and sirens as CSS. Draw tokens from a portrait Blob-URL cache (`<image href>`). Add a rain
  sheet translated by WAAPI on night or rain jobs.
- **B, Pixi hybrid:** replace `.blueprint` with a Pixi canvas loaded by `import()` from `vendor/pixi.min.mjs`. Rooms and corridors
  drawn natively, portraits as SVG textures, tokens tweened in our own `frame()`, rain as a `ParticleContainer`, alarm as a
  colour overlay.

**What to measure** (same conditions for both: Playwright 390×844 @2x at 4× CPU throttle, and at least one real mid-range
Android and an iPhone in Safari, because SwiftShader numbers don't predict phone GPUs):
- main-thread ms per beat (today 25–51 ms; target < 8 ms) and p95 frame ms while tokens move (target < 16.7 ms, no long tasks > 50 ms);
- time from tapping "Pull the job" to the first board frame, including Pixi's import and init and the portrait rasters;
- bytes over the wire for the heist screen, JS heap and (for B) texture memory, and behaviour after a forced context loss
  (`WEBGL_lose_context`);
- the look: `cam('blueprint')` captures before and after, through the real player path;
- test churn: lines changed in `tools/smoke.mjs`, plus a new `getState().heist.tokens[]` assertion that tokens end each beat in the room
  that beat names.

**Decision rule:** if A meets the frame and beat budgets on the real phones and looks good enough, ship A and drop B. Adopt B
only if A misses the budget, or the effects we want (weather particles, light cones, screen-wide filters) look poor or run slowly in SVG,
*and* B's first-frame time and bytes are acceptable on the phone.

## 6. Verified vs not verified

- **Verified here:** npm versions and publish dates for pixi.js, phaser and kaplay, plus gsap, animejs and motion (registry.npmjs.org).
  Min+gzip sizes were measured from the npm tarballs with `gzip -9`. Pixi 8.21 imports and renders as a plain ES module with no build step.
  `Graphics.svg()` breaks our portraits and venue while the SVG texture path is faithful (capture saved). The list of elements the SVG parser supports
  comes from the 8.21 source. `AccessibilitySystem` and `DOMContainer` are in the default bundle. The html-source add-on needs an experimental
  browser API. The DOM render timings and per-portrait raster cost in section 1 were measured with headless Chromium and SwiftShader at 1× and 4× throttle.
- **Not verified:** any real-phone performance, for any option. Whether cdnjs or jsDelivr serve pixi.js 8.21, phaser 4.2.1 and kaplay
  (both CDNs were blocked from this sandbox; jsDelivr mirrors npm by design, and cdnjs showed pixi v8 up to 8.12 in search). Pixi's
  ">500k weekly downloads" and the v8 benchmark claims (from their blog). Whether Phaser 3 gets any further patches. The KAPLAY v4000
  release date. Whether Kaplay's `loadSprite` takes SVG data URLs. Brotli sizes (no brotli tool here; gzip only). Paint cost of the
  DOM screens (the timings exclude paint).

## Sources
- npm registry metadata: https://registry.npmjs.org/pixi.js, https://registry.npmjs.org/phaser, https://registry.npmjs.org/kaplay,
  https://registry.npmjs.org/gsap, https://registry.npmjs.org/animejs, https://registry.npmjs.org/motion
- PixiJS June 2026 update (8.18/8.19, HTML-in-Canvas, Graphics→SVG export): https://pixijs.com/blog/june-2026
- PixiJS v8.20 release news: https://gamedev.net/news/5221-pixijs-v8200-released/
- PixiJS SVG guide: https://pixijs.com/8.x/guides/components/assets/svg
- PixiJS accessibility guide: https://pixijs.com/8.x/guides/components/accessibility
- PixiJS DOMContainer (experimental): https://claudemarket.ai/skills/pixijs/pixijs-skills/pixijs-scene-dom-container (summary of the official pixijs-skills package)
- PixiJS v8 launch and benchmarks: https://pixijs.com/blog/pixi-v8-launches
- cdnjs pixi.js listing: https://cdnjs.com/libraries/pixi.js/8.12.0
- Phaser 4 stable download: https://phaser.io/download/stable
- Phaser 4 renderer and Canvas deprecation: https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games and
  https://cdn.jsdelivr.net/npm/phaser@4.2.0/docs/Phaser%204%20Rendering%20Concepts/Phaser%204%20Rendering%20Concepts.md
- Phaser v4.0.0 changelog: https://raw.githubusercontent.com/phaserjs/phaser/HEAD/changelog/v4/4.0/CHANGELOG-v4.0.0.md
- Phaser 4.2.1 news: https://gamedev.net/news/4825-phaser-v421-released/
- Phaser archive (3.90.0 "Tsugumi", 2025-05-23): https://phaser.io/download/archive
- Phaser `load.svg` / SVGSizeConfig: https://newdocs.phaser.io/docs/3.80.0/focus/Phaser.Loader.LoaderPlugin-svg
- KAPLAY on npm: https://npmjs.com/package/kaplay. KAPLAY text plugin notes: https://unpkg.com/kaplay-plugin-text@1.0.0/README.md
- GSAP free for commercial use: https://webflow.com/blog/gsap-becomes-free. License: https://gsap.com/community/standard-license/
- Animation performance (compositor, WAAPI): https://motion.dev/docs/performance
- Testing canvas games with Playwright (state seams, coordinate helpers): https://momentic.ai/resources/the-definitive-guide-to-webgl-and-canvas-test-automation-from-pixels-to-pipelines
- Probe capture (Pixi 8.21, left: `Graphics.svg()`, right: SVG texture; below: venue via `Graphics.svg()`): `notes/captures/graphics-pixi-svg-probe.png`

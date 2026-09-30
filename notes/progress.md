# Crimedog — progress notes

## How to run
- Play: `npm run serve` → http://localhost:8080/ (no build step; vanilla ES modules, DOM + inline SVG).
- Dev hooks + diagnostics overlay: `?dev=1` (optionally `&seed=N`, `&simdt=ms` for heist beat speed).
- Tests: `npm test` (engine/content/balance, node --test) and `npm run smoke` (Playwright: cold boot
  play-through with real touch taps, 10 s dev boot, stills sweep over every screen). `npm run check` runs both.
- Balance probe: `node tools/balance.mjs [careers]`.
- Hosted build: `tools/artifact.html` is a head-less page fragment published with `styles.css` + `src/*.js`
  as a private claude.ai artifact (https://claude.ai/artifact/67hUULmWTEsCNWrUs5UqH1). Downloads/Web Share
  are blocked there, so the share card also shows as an in-page image (long-press to save).

## Architecture
| File | What |
|---|---|
| `src/data.js` | All content: 10 skills, 100 talents, 16 quirks, 20 breeds / 7 factions, voices, names, catchphrases, kit, approaches, venues, loot, intel, fences |
| `src/dogs.js` | Dog generation, derived skills, procedural SVG portraits |
| `src/heists.js` | Job generation: venue → ordered stages (entry, obstacles, hidden hazards, vault, exit, getaway), each with 3–5 approaches |
| `src/sim.js` | Pure heist resolution → list of beats + outcome (pear-shaped improvisation, chaos, alarms, captures, betrayals, undercover coppers, interrogation) |
| `src/groups.js` | The city's outfits: standing, job offers (own leads, cuts, commissions, rival hits, markers), settling results, debts, hostile moves |
| `src/engine.js` | Game state + all player actions (hire, case, surveil, insider, bribe, plan, pull, fence, pay, lawyer, farm, next job, game over) |
| `src/ui.js` | Screens as `(state, ui) → HTML`; blueprint SVG for heist playback |
| `src/main.js` | Boot, save/load (localStorage, try/catch), input routing, fixed-step frame loop |
| `src/debug.js` | `window.cd` hooks + overlay |
| `src/art.js` | Seeded SVG scenery: night-time facades per venue type (job board) and the title skyline |
| `src/card.js` | Shareable character card (SVG → PNG, Web Share API or download) |

All randomness goes through a seeded RNG stored in the save, so a seed + inputs replays identically.

## Debug hooks (`?dev=1`, `window.cd`)
`screens()`, `getState()`, `teleport(screen)`, `freeze()/step(n)/resume()`, `simdt(ms)`, `setTimeOfDay(h)`,
`setSeed(n)`, `spawn('dog'|'cash'|'kit'|'intel', at)` (`spawn('dog','copper')` plants an undercover cop),
`clearAll()`, `win()/lose()`, `cam('overview'|'hero-close'|'hud-check'|'blueprint')`.
The 3D-specific items in CLAUDE.md §2.2 are adapted: `teleport` targets named screens, `drawCalls`/`shaderPrograms`
report 0 (DOM/SVG renderer), `renderer` is the WebGL renderer string, `contextLost` is always false.

## Game loop (one heist ≈ 5–10 min)
0. **Job board** — pick your next job: your own small leads, or offers from groups once your rep clears their bar (Firm 30, Ze 35, Poodles 40, Greyhound Family 45, Shiba Syndicate 55). Debts show here with a pay-off button; groups that are owed put up a marker job.
1. **Job** — a generated venue with loot, a 5-day window, day/night choice.
2. **Prep** (each costs money and/or a day): hire at the pub or from your black book, buy kit, case the joint
   (reveals intel & hidden hazards; clumsy casers get spotted → +difficulty), have dogs followed (reveals
   loyalty/quirks/undercover), plant an inside dog, bribe a guard, safehouse, fake IDs, line up the Collector,
   vet the flashy fence, lie low.
3. **Plan** — per stage pick an approach and a dog; odds shown only for skills you actually know.
4. **Pull the job** — watch it play out beat by beat on a blueprint. Failures go pear-shaped → improvisation,
   chaos events, alarms, the Old Bill, captures, betrayals, and surprise hazards you didn't scout.
5. **Aftermath** — Daily Bark headline, fence (Hal / Francesca (may be a sting at 40+ heat) / the Collector),
   pay the crew a cut (loyalty), grade S–F, crew who used a skill may improve, pound/lawyer, farm.
6. Game over: Inspector heat 100, rep 0, or skint with nobody to hire.

## Balance (tools/balance.mjs, 200 careers × up to 10 jobs)
- Scripted "careful" policy: ~40% B or better, ~5% S (perfect).
- Reckless (hire one stranger, no prep): ~70% F.
- Pinned in `tests/balance.test.mjs` (careful B+ ≥ 30%, reckless D/F ≥ 60%, S achievable but < 20%).

## Verified vs not
- Verified: unit/content/balance tests pass; Playwright cold boot on a 390×844 touch viewport with real
  `touchscreen.tap` plays one full job with no console errors; save/continue survives reload; dev boot 10 s
  sim time advances, freeze/step exact, seeded heists replay identically; stills sweep over all 11 screens
  non-blank. Captures in `notes/captures/`.
- Not verified: real phones (iOS Safari / Android Chrome), Web Share on device, human playtest for fun/pacing,
  long careers by a human past tier 3.

## Groups & story (job selection)
- Five groups (`GROUPS` in data.js): Bulldog Firm, Ze Germans, Poodle Set, Greyhound Family (Italian Greyhounds), Shiba Syndicate (Shiba Inu). Rivals: Family↔Syndicate, Firm↔Poodles.
- Deals: cut (they take % of the fence, share intel), commission (they pay directly for one wanted item — delivered in the aftermath before fencing), rival hit (target owned by their rival). Family/Syndicate may front cash.
- Venues can be owned (`VENUE_OWNERS`); robbing an owner's venue costs standing (−25 if they can tell it was you, −8 otherwise).
- Failing the Family/Syndicate → debt; marker jobs clear it; unpaid debts escalate (Family tips off the Inspector, Syndicate raids your cash). Enemies (≤ −40) act between jobs.
- Story scenes: first contact, debts, pressure and hostile moves queue in `state.story` and show on the job board.
- Save format bumped to v2 (older saves are ignored).

## Graphics pass (depth & texture)
- Portraits: outlines, shared lighting overlay (highlight/shade), fur strokes, layered eyes, lapels, hat sheen, pinstripe backdrop. Contact sheet: `tools/portraits.html` (dev server).
- Chrome: self-hosted fonts in `assets/fonts/` (Alfa Slab One display, Roboto Slab headings, Libre Baskerville italic quotes, UnifrakturMaguntia masthead; OFL/Apache licences alongside), paper grain + rain textures as inline SVG, bevelled brass/red buttons, deeper card shadows, lit nav tab.
- Job board venue illustrations; title skyline; blueprint with corridors, walked route, pulsing current room, red alarm wash, siren lights when the police arrive, and a drawing title block.
- Before/after captures: `notes/captures/before-gfx/` vs `notes/captures/`.

## Next
- Human playtest of the first five minutes; tune copy and pacing from that.
- More obstacle types/venues and multi-dog steps (e.g. a lookout + a cracker on the same stage).
- Inspector escalation beyond undercover plants and sting fences (raids on the safehouse, wanted posters).
- Dog-to-dog relationships (rivalries, faction beef — Ze Germans vs the Bulldog Firm).
- Sound, and a little motion on the blueprint tokens.

# Crimedog — progress notes

## How to run
- Play: `npm run serve` → http://localhost:8080/ (no build step; vanilla ES modules, DOM + inline SVG).
- Dev hooks + diagnostics overlay: `?dev=1` (optionally `&seed=N`, `&simdt=ms` for heist beat speed).
- Tests: `npm test` (engine/content/balance, node --test) and `npm run smoke` (Playwright: cold boot
  play-through with real touch taps, 10 s dev boot, stills sweep over every screen). `npm run check` runs both.
- Balance probe: `node tools/balance.mjs [careers]`.

## Architecture
| File | What |
|---|---|
| `src/data.js` | All content: 10 skills, 100 talents, 16 quirks, 20 breeds / 7 factions, voices, names, catchphrases, kit, approaches, venues, loot, intel, fences |
| `src/dogs.js` | Dog generation, derived skills, procedural SVG portraits |
| `src/heists.js` | Job generation: venue → ordered stages (entry, obstacles, hidden hazards, vault, exit, getaway), each with 3–5 approaches |
| `src/sim.js` | Pure heist resolution → list of beats + outcome (pear-shaped improvisation, chaos, alarms, captures, betrayals, undercover coppers, interrogation) |
| `src/engine.js` | Game state + all player actions (hire, case, surveil, insider, bribe, plan, pull, fence, pay, lawyer, farm, next job, game over) |
| `src/ui.js` | Screens as `(state, ui) → HTML`; blueprint SVG for heist playback |
| `src/main.js` | Boot, save/load (localStorage, try/catch), input routing, fixed-step frame loop |
| `src/debug.js` | `window.cd` hooks + overlay |
| `src/card.js` | Shareable character card (SVG → PNG, Web Share API or download) |

All randomness goes through a seeded RNG stored in the save, so a seed + inputs replays identically.

## Debug hooks (`?dev=1`, `window.cd`)
`screens()`, `getState()`, `teleport(screen)`, `freeze()/step(n)/resume()`, `simdt(ms)`, `setTimeOfDay(h)`,
`setSeed(n)`, `spawn('dog'|'cash'|'kit'|'intel', at)` (`spawn('dog','copper')` plants an undercover cop),
`clearAll()`, `win()/lose()`, `cam('overview'|'hero-close'|'hud-check'|'blueprint')`.
The 3D-specific items in CLAUDE.md §2.2 are adapted: `teleport` targets named screens, `drawCalls`/`shaderPrograms`
report 0 (DOM/SVG renderer), `renderer` is the WebGL renderer string, `contextLost` is always false.

## Game loop (one heist ≈ 5–10 min)
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

## Next
- Human playtest of the first five minutes; tune copy and pacing from that.
- More obstacle types/venues and multi-dog steps (e.g. a lookout + a cracker on the same stage).
- Inspector escalation beyond undercover plants and sting fences (raids on the safehouse, wanted posters).
- Dog-to-dog relationships (rivalries, faction beef — Ze Germans vs the Bulldog Firm).
- Sound, and a little motion on the blueprint tokens.

# Crimedog — progress notes

## How to run
- Play: `npm run serve` → http://localhost:8080/ (no build step; vanilla ES modules, DOM + inline SVG).
- Dev hooks + diagnostics overlay: `?dev=1` (optionally `&seed=N`, `&simdt=ms` for heist beat speed).
- Tests: `npm test` (engine/content/balance, node --test) and `npm run smoke` (Playwright: cold boot
  play-through with real touch taps, 10 s dev boot, stills sweep over every screen). `npm run check` runs both.
- Balance probe: `node tools/balance.mjs [careers]`. Chaos probe: `node tools/chaos.mjs [careers]` (hazards, arrests, losses).
- Hosted build: `tools/artifact.html` is a head-less page fragment published with `styles.css` + `src/*.js`
  as a private claude.ai artifact (https://claude.ai/artifact/67hUULmWTEsCNWrUs5UqH1). Downloads/Web Share
  are blocked there, so the share card also shows as an in-page image (long-press to save).

## Architecture
| File | What |
|---|---|
| `src/data.js` | All content: 10 skills, 100 talents, 16 quirks, 22 breeds / 9 factions, 5 groups, voices, names, catchphrases, kit, approaches, venues, loot, intel, fences |
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
`setSeed(n)`, `spawn('dog'|'cash'|'kit'|'intel'|'rep', at)` (`spawn('dog','copper')` plants an undercover cop; `'rare'`/`'legend'` a star),
`clearAll()`, `win()/lose()`, `cam('overview'|'hero-close'|'hud-check'|'blueprint')`.
Planning screens auto-take the first job-board offer when needed. The 3D-specific items in CLAUDE.md §2.2 are adapted: `teleport` targets named screens, `drawCalls`/`shaderPrograms`
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
   chaos events, alarms, the Old Bill, captures, betrayals, and surprise hazards you didn't scout. Fumbled risky
   moves (climbing, brawling, driving, drilling) can send a dog to the farm for good; being spotted going in
   raises the alarm, on the way out it gets dogs collared; the police arriving always catch someone.
5. **Aftermath** — Daily Bark headline, fence (Hal / Francesca (may be a sting at 40+ heat) / the Collector),
   pay the crew a cut (loyalty), grade S–F, crew who used a skill may improve, pound/lawyer, farm
   (farming a copper: +6 rep; a real crook: −8 rep).
6. Game over: Inspector heat 100, rep 0, or skint with nobody to hire.

## Balance (tools/balance.mjs, 150 careers × up to 10 jobs)
- Start with £2,500 (enough to survive two busted jobs; was £1,000).
- Scripted "careful" policy: ~41% B or better, ~7% S (perfect); 12/200 careers end inside 10 jobs (52 at £1,000).
- Reckless (hire one stranger, no prep): ~68% F.
- Chaos (first 5 jobs): every job has a hazard, ~36% have the security cat, ~30% spring a surprise; ~55–63% of
  pear-shaped jobs cost a dog; ~0.8 arrests and ~0.1 permanent losses per job.
- Pinned in `tests/balance.test.mjs` (careful B+ ≥ 30%, reckless D/F ≥ 60%, S achievable but < 20%) and
  `tests/chaos.test.mjs`.
- Grading: loyal crew doing time count half toward "crew got away".

## Code conventions
- `src/util.js` holds the shared helpers (esc, money, count, clamp, fail/done, addHeat/addRep/addRelation); `lootItem(job, id)` lives in heists.js.
- `simulate()` is split into named phases: `lead` (who takes a step), `attempt`, `recover` (pear-shaped retry), `succeed`/`botch`, then clean-up, `interrogate`, heat and `outcomeOf`.
- Refactor check: `node tools/snapshots.mjs <dir> --compare <baseline>` pixel-diffs every screen; hash `career()` results before and after for sim changes.

## Verified vs not
- Verified: unit/content/balance tests pass; Playwright cold boot on a 390×844 touch viewport with real
  `touchscreen.tap` plays one full job with no console errors; save/continue survives reload; dev boot 10 s
  sim time advances, freeze/step exact, seeded heists replay identically; stills sweep over all 11 screens
  non-blank; job board, group story scene, deal and relations; hire-from-plan-step flow; profile fits
  390×844 and 375×667 without scrolling. Captures in `notes/captures/`.
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

## Rare and legendary crew (stars)
- `RARITY` and `SIGNATURES` in data.js; `genDog(..., { rarity, primary, signature })`. Stars have primary 5 (+a +2 talent), all skills known, higher fees (rare ×2.5, legendary ×4), legendary needs rep 30 and takes its signature as a nickname.
- Visits: `starVisit` in engine.js puts at most one star in the pub per job (`d.inTown = job.id`); they stay through Ask Around and leave after the job. They're never regulars and can't be hired from the black book while out of town. The first job always has a rare one whose signature fits the job (the teaser). Odds per job: `0.12 + rep/250` (22% at rep 25, 44% at 80); legendary share rises from 5% to 50% with rep.
- Signature moves: one per skill, each an approach (`s_*`) that fits certain steps (`fits`: stage kind, stage id or `vault:type`). `stageOptions(stage, crew)` adds them only when the owner is on the crew; `canDo(dog, ap)` keeps them the owner's. Picked on the plan, the step goes to the owner; in the heist, if the owner is gone the step falls back to improvisation. Hidden hazard steps (cat, plates) can use one as a surprise.
- Marker: blue (rare) / gold (legendary) card frame and portrait ring, ★ badge, ✨ signature on the pub card, a gold chip in the profile, gold "secret" options on the plan, a ribbon on the share card.
- Debug: `spawn('dog','rare'|'legend')`; `getState().stars` lists the pub's stars. Tests: `tests/stars.test.mjs`; smoke section 1f hires the teaser with real taps and picks the secret option.

## Heist playback
- The log grows downwards; each new beat scrolls the page to the end so it sits just above the sticky controls (smoke checks this after 12 real taps on Next).

## UI text
- Mobile-first: headers and chips over sentences. Keep story scenes, the heist log and boss quotes; cut helper text.

## Next
Ideas from the playthrough pass (not built yet):
- **Pound break**: a crew member doing time unlocks a "spring them" job at the pound (loyalty ++, heat ++).
- **The Inspector as a character**: named, with a face; at heat thresholds they appear in story scenes, pin your wanted poster, raid a hideout.
- **Crew chemistry**: pairs who've worked together get a small bonus; rival factions on one crew (Ze Germans + Bulldog Firm) squabble.
- **Trophy room**: famous loot you kept instead of fencing, shown in the den; groups sometimes ask to buy it.
- **Heat by district**: jobs in a hot district are harder; lying low in a district cools it.
- **Job board timing**: offers expire after a day or two, so waiting has a cost.
- **Replay card**: share the heist log as an image (like the crew card) — "The Fossil Job, grade B".
- Balance group jobs separately from own leads (they're full-size, so a step up in difficulty).
- Human playtest of the first five minutes; tune copy and pacing from that.
- More obstacle types/venues and multi-dog steps (e.g. a lookout + a cracker on the same stage).
- Inspector escalation beyond undercover plants and sting fences (raids on the safehouse, wanted posters).
- Dog-to-dog relationships (rivalries, faction beef — Ze Germans vs the Bulldog Firm).
- Sound, and a little motion on the blueprint tokens.

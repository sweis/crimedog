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
- Scripted "careful" policy: ~44% B or better, ~6% S (perfect); it buys kit a step needs and sends the caser with the best expected finds.
- Reckless (hire one stranger, no prep): ~60% F, ~86% D or F.
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

## Crew drama and promotions
- `src/drama.js`: five arcs (Borrowed Time: a debt to a group; Family Matters; The Old Crew: an old partner poaching them; The Big Break: a master's apprenticeship; Heat on the Street: the Inspector watching them). Each is 2–3 choice scenes on the job board, usually a job apart; `ARCS` holds the text, choices, effects and branches.
- Between jobs (`advanceArcs` in `nextJob`): last job's drama effects wear off, unanswered scenes take their last (always free) choice, due scenes come up, and 40% of the time someone you know (met, free, not a known copper) starts a new arc. At most 2 arcs at once, one per dog.
- Effects: cash, relation, loyalty, greed, group standing, heat, +1 best skill, promotion, the pound, leaving (runner with some of your cash, grass = +20 heat, poached), a relative joining your black book. Next-job effects on `dog.drama`: `edge` (±8% odds on every step; shows on the plan), `away` (can't be hired), `trouble` (heavies, a relative tagging along, a police tail: played by sim.js at one step, adding alarm/clues or an escape check).
- Promotions: `earnedPromotion`/`promote` in dogs.js. After a job, crew who got away go common→rare at a base skill of 5, 4+ jobs and relation 20+, and rare→legendary at 8+ jobs, relation 45+ and a second base skill of 3+. Arcs can promote too (paying a debt, loyalty to you over an old partner, a master's lessons). Home-grown stars are `homegrown`: mates'-rates fees (rare ×1.4, legendary ×2) and never "out of town".
- UI: scene modal with the dog's portrait and choice buttons (cost shown, disabled if unaffordable); 📖 Story / 🔥 Fired up / 😟 Distracted / ⚠️ Trouble / 🏠 Away chips; 🔥/😟/⚠️ on plan assignees; a 🌟 promotion line in the aftermath.
- Probe: `node tools/drama.mjs [careers]`. Careful 12-job careers: ~0.36 arcs per job, ~0.9 home-grown rares and ~0.12 legendaries per career; the balance probe's careful player pays when it has £800 to spare, the reckless one always takes the free option.
- Debug: `spawn('arc', kind)`, `live()` (the real state, for scripted set-ups); `getState().arcs` / `.drama`. Tests: `tests/drama.test.mjs`; smoke 1g answers a scene with a real tap and checks a promotion.

## Heist history and sharing
- Every graded job leaves a recap in `state.history` (last 30; `src/recap.js`): kind, venue, grade, take, headline, each step with who tried it and how (✓/✗, improvised, surprise), the big moments, loot, and a snapshot of each crew member (enough to draw them) with their fate (got away / nicked / the farm / did a runner / a copper).
- Rap sheet (modal, `data-act="history"`): from the job board, the crew page and the game-over screen. Tap a job for its recap; "Share this heist" there or on the grade screen.
- Share card: `recapPNG(r)` in card.js draws a heist report (grade, take, crew portraits and fates, how it went down, moments) that grows to fit; crew and heist cards share one pipeline (`svgPNG`, `shareBlob(card)`, a generic card modal). No emoji on cards (they don't rasterise reliably).
- Tests: `tests/recap.test.mjs`; smoke 1l plays a job, shares it with a real tap (600px PNG saved to `notes/captures/history-card-image.png`) and reads it back on the rap sheet.

## Casing, roles, special kit (latest pass)
- Casing: each INTEL key has the `skill` that finds it best (nose smells, tech systems, sneak watching, charm chatting, wheels routes). `caseOdds(state, dog)`: each unknown piece has p = 0.1 + 0.16×skill (+0.15 with an intel talent, max 0.9); up to 3 a day, at least 1. Spotted: 0.35 − 0.08×max(sneak, disguise). Specialists in nose/tech/sneak/charm each find ~1.8–2.0 a day (nose used to find 3).
- Security alert: `raiseAlert(job, why)` keeps `job.alertWhy`; the job screen lists the reasons ("every step +N harder"), the plan shows an Alert chip.
- Roles (`ROLES`, `dog.role = {kind, level}`): ~20% of dogs. Leader (best on crew): +2%/level on every step for everyone, loyalty +10/level against running, −12%/level chance of losing a dog on a botched risky step, −5%/level talking, rallies the crew once when it goes pear-shaped. Wildcard: per step 10%+3%/level chance of an event (`WILD`), good 50%+4%/level; +5%/level when improvising. Roles grow 25% per job they get away from. Plan odds count everyone who turns up.
- Special kit (`KIT[*].special`): Master Key Card (3 swipes; adds a sneak way into break-ins), Laser Detector, Police Scanner, Skeleton Key, Catnip Pouch, Little Black Ledger. Not for sale; 40% of jobs where one's possible carry a `prize` (shown on the board and in The Goods); kept if anything was secured. Effects (`effect: {stage | kind | skill | types, diff}`) apply in `difficulty()`; plan options tag the kit that helps. Kit shop lists them under "Found on Jobs" with where to find them.
- Two new kinds of job: The Wire Job (hack) and The Paper Trail (fraud); see below.
- Rebalance: job base difficulty is now 2 + tier (was 1 + tier), bringing careful play back to ~44% B or better (it had crept to ~56% with leaders, kit and more options). Reckless: ~86% D or F.

## Kinds of job
- `JOB_TYPES` in data.js (breakin, swap, con, smash, van): each has venues, a weight on the board, and whether an insider can be planted. `LAYOUTS` in heists.js builds each type's steps from its own option pools (con: introduction / pitch / convincer / hand-over / blow-off, no getaway; smash: hit the shop / grab the lot / getaway; van: stop the van / guards / back doors / getaway; swap: a break-in whose vault is The Switch, mostly needing a 🏺 replica). Stage kinds stay entry/obstacle/vault/exit/getaway so the sim is shared.
- Hidden hazards by type (`HAZARDS`): con adds the suspicious butler, smash the have-a-go hero, van the police escort; all with intel to find them.
- Specialist steps (`SPECIALISTS`, `stage.needs`): all options one skill; below 4 is +3 difficulty. 30–45% of jobs (by tier) outside smash & grabs. `refreshPub` guarantees someone qualified in the pub.
- `job.noInsider`: cons and smash & grabs always; 20% of break-ins. No `e_insider` option, fixer's plant disabled, `plantInsider` refuses.
- `noSig` steps (con steps, the van stop, smash entry) take no signature moves. Daylight witness clues don't apply to cons. Failure lines per type.
- UI: type / specialist / no-insider / replica chips on the job board and job screen; the plan's specialist step shows "🥸 4+ only" (green if someone on the crew is known to qualify).
- Probe by type (careful player, 200×8 jobs): surprises 14–28%, bust 13–34% (switches highest), aborted 4–9%. Tests: `tests/jobs.test.mjs`; smoke 1h takes a con with real taps.

## Skill coverage
- Every skill has 4+ approaches across 3+ kinds of step (nose, aim, locks and wheels gained entry/exit/vault/getaway options), 10 talents and 3+ breeds that lean towards it (`tests/skills.test.mjs`).
- The pub spreads new faces across the skills (`refreshPub`): each face's speciality is weighted against what you can already see around you, against what you've been shown least over the whole game (`state.faces`), and slightly towards what the job uses; 70% get a breed known for it. The pub starts at 5 dogs. Result: every skill is a speciality in 40–60% of first pubs (disguise 36% → 57%), and you see ~8.4 of 10 specialities after one Ask Around.
- `specialty(dog)` in dogs.js is the best *known* skill (what cards show).
- Profile header compacts for long names; the talents row shows the best three (two beside a signature) plus "+N more", so any legendary fits 375×667.

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

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
| `src/data.js` | All content: 10 skills, 100 talents, 23 quirks, 22 breeds / 9 factions, 5 groups, voices, names, catchphrases, kit, approaches, venues, loot, intel, fences |
| `src/dogs.js` | Dog generation, derived skills, procedural SVG portraits |
| `src/heists.js` | Job generation: venue → ordered stages (entry, obstacles, hidden hazards, vault, exit, getaway), each with 3–5 approaches |
| `src/sim.js` | Pure heist resolution → list of beats + outcome (pear-shaped improvisation, chaos, alarms, captures, betrayals, undercover coppers, interrogation) |
| `src/groups.js` | The city's outfits: standing, job offers (own leads, cuts, commissions, rival hits, markers), settling results, debts, hostile moves |
| `src/engine.js` | Game state + all player actions (hire, case, surveil, insider, bribe, plan, pull, fence, pay, lawyer, farm, next job, game over) |
| `src/ui.js` | Screens as `(state, ui) → HTML`; blueprint SVG for heist playback |
| `src/main.js` | Boot, save/load (localStorage, try/catch), input routing, fixed-step frame loop |
| `src/debug.js` | `window.cd` hooks + overlay |
| `src/art.js` | Seeded SVG scenery: night-time facades per venue type (job board) and the title skyline |
| `src/bonds.js` | How the crew get on: a bond per pair (-100..100, starting from their outfits), settled after each job, chemistry for the odds, cohesion for the plan |
| `src/story.js` | The story queue's shared machinery: `pushScene`, `affordable`, `answerScene` (the Inspector, rivals and runners use it; `engine.chooseStory`/`storyChoices` dispatch by scene type, drama included) |
| `src/career.js` | Career summary (`careerOf`): nest egg, rep, heat, the record (with arrest/runner/lost/hospital counters, seeded from the rap sheet for old saves), best/worst job, closest mate, biggest enemy |
| `src/card.js` | Share cards: the crew profile card captured from the game's own HTML (html2canvas, vendored in `src/vendor/`, loaded on first share), and the heist recap card (SVG → PNG); Web Share API or save |

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

## Crew chemistry, rescues, out of town, recruit to case (latest, 0.16.0)
- **Bonds** (`src/bonds.js`, `state.bonds`, keyed by sorted dog-id pair): start where outfits put them (same outfit +15, rival outfits -30, else 0); after each job every pair on it moves by the outcome (clean +8 … bust -6) plus 2 per step pulled off and -3 per step bungled (capped ±15); grassing or doing a runner on your mates sets -35; going back for a mate +25 (+30 if it worked). Aftermath lines for pairs crossing into "get on well" (25+) or "aren't speaking" (-20 or less) and for rescues.
- **Chemistry on a job** (`bonds.chemistry` in `sim.odds`): average bond with the rest of the crew → up to +8% odds among friends, down to -10% among enemies; a leader cuts the bad side by 15% a level. The step odds on the plan include it.
- **Visible**: a 🤝 Crew chemistry panel on the plan (💢/💚 pairs, "The leader keeps a lid on it"); 💢/💚 chips naming crewmates on dog cards while planning (pub, book, crew); "Gets on with" on the profile; a help entry.
- **Rescues** (`sim.rescue`, called when someone's collared): the most willing active crewmate (nerve, bond, quirks: nervous −, steel/goodboy +, lone wolf −) may go back (≤70%); success 45% + 6%/best of muscle/agility/sneak − alarm, frees them (and they can't be re-caught in that same step); failure leaves the rescuer to make their own escape. Rescuers reveal their nerve. Beats styled gold; rescues count as moments on the rap sheet.
- **Out of Town** section on the Crew screen (stars not in town this job).
- **Recruit to case the joint**: the casing picker has "＋ Recruit someone to case it": everyone hireable right now (`engine.hireProblem`, now shared with `hire`), best-suited first by known casing skills; tapping one hires them and returns to the casing list.
- Balance (`tools/balance.mjs 150`): careful player's grades within a point of before, Inspector game-overs 19 (was 18). Rescue tuning: a first cut (failure = automatic arrest) pushed them to 25, so failed rescuers now get their own escape check. `justice.test` hospital/farm ratio now samples 1,200 jobs (400 swung ±0.4 on the ratio).
- Verified: tests/bonds.test.mjs (starting bonds, settling, snitches, rescues binding, chemistry and leader, odds, rescues on real jobs with no double capture, the recruit list's hiring rules); smoke 1s with real taps (hire three, chemistry panel, crew marks, recruit flow); captures bonds-plan/crew/recruit; a heist with a successful and a failed rescue checked by eye. Not verified: how it feels over a long human-played career.

## Endings fixes (0.15.3)
- Skint ending no longer says "not a dog to your name" (now "not a soul"); a runner's hideout is "behind the racetrack", not the dog track. Kept on purpose: dog puns on human idioms ("inside dog", "Every dog for himself!", "Bad dog— bad luck"), the scanner's "a dog" gag, the Dog & Duck, the tagline. Test: no game-over text uses "dog" (pub name aside).
- Loot names mid-sentence lose their leading capital (`util.inSentence`: "did a runner with a solid gold roulette ball"; quoted titles keep theirs): runner scenes, hunts, the Players row, aftermath and news, the career card's enemy line, the runner epilogue, a betrayal beat, and handing goods to a patron. Lists and labels keep the capital.
- One closest-mate ranking (`dogs.closestMates`: likes you most, then most jobs together; coppers you never caught drop off once the game's over) shared by the career card and the retirement epilogues. The closest mate always gets the first epilogue ("came too", or "still inside" if they're in the pound; the Ghost's goodbye stays with the rivals). Test: over 40 careers the first epilogue and the card name the same dog; a tie goes to more jobs together.

## Performance and code-quality pass (0.15.2)
- **Portraits as cached images** (`dogs.portraitHTML`): each face is drawn once as an SVG blob URL and reused as an `<img>` (inline SVG was ~60 DOM nodes a face). The blueprint's nested portraits and the recap card's SVG still use `portraitSVG`. Measured on a 40-job career in desktop Chromium (render + save per tap): crew 17.4 → 2.8 ms (2,999 → 411 nodes), a profile 12.9 → 2.9, reputation pane 12.0 → 1.9, players 6.1 → 1.1, job board 10.1 → 6.1. Venue art stays inline: its signs use the Alfa Slab web font, which an `<img>` can't load.
- **Saving off the tap**: `G.commit` renders now and saves 250 ms later (coalesced), flushing on `pagehide` and when the tab is hidden; `clearSave` cancels a pending save.
- **Story scenes consolidated** (`src/story.js`): one `pushScene`/`affordable`/`answerScene` for the Inspector, rivals and runners (was four copies); `engine.chooseStory` and `storyChoices` replace per-type dispatch in main.js, engine.dismissStory and the balance tool; one `storyModal` renders every kind of scene (was three branches).
- **Shared helpers**: `meter`/`tile`/`heatLevel` (charts.js), `moneyShort` (util; rounds down, so £99,600 never reads £100k), `nestEggPct` and `canRetire` reuse, `GRADE_ORDER` (recap.js), `ownOffer`/`pinJob`/`keepPinned` for jobs pinned to the board (heists.js), `payForDay` for the six "costs money and a day" actions (engine), `playerRow`/`bossFace`/`fromBoss`/`dogCards`/`tierStars` in ui.js, modal tables in main.js (`OPENS`) and ui.js (`MODALS`), `yScale`/`rule` in charts.js.
- **Dead code removed**: `CARD_WIDTH`, per-type `*Choices` functions, an unused import, unused parameters and test variables; three exports made file-local.
- Verified unchanged behaviour: 153 unit tests; `tools/balance.mjs 60` output identical before and after; 550 generated jobs (every type, 50 seeds) byte-identical to the previous commit; ESLint (no-unused-vars, no-undef) and jscpd clean; smoke passes; captures checked by eye (pub, Inspector/rival/drama/outfit scenes, the career share card built from image portraits).

## Small-text edit (0.15.1)
- Went through every screen's small text (full-page captures plus a DOM dump of everything ≤15px) and cut only what repeats something already on screen. Flavour (catchphrases, nicknames, quotes, kit jokes, Francesca's "Anybody could be anybody") stays.
- Cut: the "Lately" lists in the ⭐ and 🕵️ panes (the chart above shows the same per job); "It counts towards your reputation" (the tiles above show it); the pub hint's specialist clause; the Fixer's Inspector box (repeated the top bar's 🕵️, and its 25+/40+ thresholds were out of date: plants start at 12, stings at 25); the twist and prize chips on the job screen (its twist note and "Yours to keep" row say it); the debt amount on the Players row (the debt card above has it); Honest Hal's third sentence. Tightened the aftermath's Inspector-file line.
- Verified: unit tests, smoke; before/after captures compared by eye; DOM text diff confirms only those strings changed.

## Career card (0.15.0)
- 📇 **Your career card** (rap sheet, bottom of the Players tab; and in place of the old summary on the game-over screen): the Guv'nor, status (still at large / retired / banged up / washed up / skint), nest egg toward £100,000, reputation (with generosity and soft/hard), the Inspector's heat, the record (pulled off, flops, perfect, arrests, runners, hospital, lost on jobs, farmed, earned), best and worst job, closest mate, biggest enemy. 📸 shares the same card as a PNG (`careerPNG`, same html2canvas path as the profile card).
- New counters in `state.stats`: `arrests`, `runners`, `lost`, `hospital` (`career.bump` in `engine.resolveHeist`); farming a found runner now counts in `farmed`.
- Biggest enemy: the worst of hostile outfits (standing ≤ −20, worse with a debt), loose runners, and the Jack Russells / Dandy Dan by grudge. The Grey Ghost never counts.
- Verified: `tests/career.test.mjs` (fresh game, 40 careers' records add up and match the rap sheet, old-save fallback, enemy choice); smoke opens it from the rap sheet with real taps and checks the 780px PNG; captures `career-card.png`, `career-card-share.png`, `career-card-png.png`; game-over screen checked by eye on a washed-up career. Not checked on a real phone's share sheet.

## Share card is the profile card (0.14.2)
- 📸 Share on a crew member now captures the in-game profile card itself (`profileHTML` in ui.js, shared by the profile sheet and the card) instead of a separate poster layout. It's rendered off-screen at 390px with the game's CSS and captured at 2x (780px PNG) by html2canvas 1.4.1 (MIT, `src/vendor/`, loaded on first share). A one-line CRIMEDOG footer is added under it.
- html2canvas draws inset box-shadows as hard bands and drops spread rings, so `.share-card` swaps those for borders (pips, chips, the rare/legendary portrait ring).
- Verified: smoke checks the PNG is 780px wide; capture `share-card-png.png` compared by eye against the live profile sheet. Not verified on a real iPhone/Android share sheet.

## Grey Ghost audition fix (0.14.1)
- The audition ("an A or better, and not a single alarm") failed whenever the alarm meter moved at all (peak ≥ 1/10), even if the alarm never went off: players saw S grades with no alarm fail. Now it fails only if the alarm actually rang (an `alarm` beat: the bell, a silent alarm, sirens or a setup) or the grade is below A. The failure note says which, and the Players tab spells out the audition terms.
- Probe (150 seeded careers, audition armed every job): all S jobs and all A jobs without an alarm going off pass.

## Names, nicknames, film nods (0.14.0)
- **No shared names**: `genDog` draws first names and nicknames from pools filtered by `namesInUse` (every living dog's short name and nick; farmed/gone dogs free theirs). Same RNG draw count, so seeds stay stable. Legendary signature nicks get sequels if taken ("The Phantom II", "III", "Returns"); `promote(dog, state)` uses it too. Existing saves aren't renamed.
- **Bigger pools**: ~15–25 first names per voice, 10+ surnames per voice, 112 nicknames (film faces: Bullet-Dodger, One-Punch, Verbal, Baby Face, The Closer, Sheep-Counter, Backup Plan, The Tell…).
- **Seven film-nod quirks** (effects in `sim.odds`/`attempt`/`escapeCheck`, `engine.payCrew`; revealed via `learn`): Thirty Seconds Flat (escape ≥ 90%), Doesn't Tip (cut swings capped at ±3), A Closer (+0.1 at the vault), Has a Tell (−0.1 charm/disguise), Heavy Is Reliable (+muscle, −agility), Back-Up Plan (+0.15 improvising), Blows the Doors Off (+0.1 and +1 noise on drill work). New clashes: Doesn't Tip/Greedy, Tell/Closer.
- **References** (Mamet's Heist, House of Games, The Spanish Prisoner, Glengarry, Snatch, Lock Stock, The Gentlemen, Reservoir Dogs, Heat, Ronin, Ocean's, The Italian Job, The Usual Suspects, The Godfather, Goodfellas): 15 new catchphrases; voice lines; chaos and wildcard beats; job names per type; group pitches; fence blurbs; Inspector and Dandy Dan lines; game-over texts.
- **Grade verdicts** (`VERDICTS` in data.js) on the grade card; **headline variants** per outcome (plus a sting headline for setups); **Reservoir codenames** in ~35% of heist intros (someone is always Mr Pink). All picked with `pickBy` (a stable hash of job id + venue), so they use no game RNG.
- A dog never says the same line twice running in one heist.
- Content probe (`tests/names.test.mjs`): no nationality/real-place words or " dog " in names, quirks, catchphrases, voices, chaos, wildcard, verdicts.
- Verified: 149 unit tests; smoke incl. new `12b-verdict` capture (verdict on the grade card). Codename intro covered by a unit test over 20 seeded jobs, not by a capture.

## Records, briefs, hospital; nest egg off the board (0.13.0)
- `src/justice.js`. Records: `dog.record` (previous convictions) from the look seed at generation (so no RNG draw shifts): ~25% clean, ~45% one or two, ~25% three to seven; undercovers 1–3; stars +1/+2. `sendDown` adds a conviction. Sentence = 1–2 + min(4, record) + 1 if the police were there (−1 if they talked). Drama "nicked" ends: fx.pound + record/2.
- Briefs: £150 + £50 per previous (to 6); one job off each; never below half the original sentence (`minSentence`), so a sentence can't be bought off. The profile says when no brief can shorten it.
- Hospital: in the sim `loseDog` sends 70% to hospital (2–4 jobs) and 30% to the farm; 35% of hospital stays leave a lasting injury (−1 to the skill they were using; `d.injuries`, shown on the profile and cards). Bill £120 a job (+£100 for a lasting injury); pay it (aftermath, profile) for +12 relation, +5 loyalty, a little generosity; unpaid at discharge: −15 relation, −8 loyalty. Status `hospital`, counted down in `nextJob`; can't be hired. Crew tab: In Hospital. Recap fate 'hospital'. Chaos probe: farm 0.04/job, hospital 0.08/job.
- Profile: a fourth Character tile, Record. The nest egg moved off the job board into the 💷 pane (with the Retire button); the board shows a one-line note only when you can retire.
- Verified: 139 unit tests (justice.test new), smoke 1r (aftermath hospital bill paid with a tap; brief taps until it can't go lower; the injury on the profile), 1o retire via the 💷 pane; 375×667 profiles still fit. Not verified: human playtest; real phones.

## Bottom bar everywhere, runners, reputation's sides, amends (0.12.0)
- Navigation: the bottom bar shows between jobs too (six tabs: Job, Pub, Crew, Kit, Fixer, Players). Between jobs the Job tab is the job board and Fixer is disabled. New Players tab (`playersScreen`): debts, the outfits (with amends), the competition (rivals and runners). The board keeps a debt reminder linking there. No bar during the heist playback and aftermath (they run in sequence).
- `src/repute.js`: `state.generosity` (0–100, start 50) and `state.hardness` (−100..100). The ⭐ score includes a generosity bonus of round((g−50)×0.3), applied through `addRep(…, 'generosity')`; `state.repParts` tracks the parts. Cuts move both (`CUT_REPUTE`); briefs and paying for drama: generous and soft; the farm: +15 hard (+5 for a copper); rival snubs and set-ups: harder; peace: softer. Effects (`crewFeeling`): fear = max(0,h)/100×0.7 off runner and talk chances; soft adds up to +0.04 runner chance; warmth = −h/25 relation per paid job. The reputation pane shows the parts, a generosity meter and a soft–hard dial.
- `src/runners.js`: a runner (on a job, or a drama arc's runner ending) becomes `state.runners[dogId]` with a plotline: loose → hunting (£150) → found after 2 leads (1 a job, +1 with a nose or sneak 4+ in your book) → steal it back (hideout break-in on the board, persists until taken; a win ends it) / the farm (+12 hard, +2 rep, half back) / mercy (−12 hard, 30% back, back in your book) / let go (−4 hard). Loose runners: 20% a job, +4 heat or security on alert. Story type `runner`; Players tab rows with the actions.
- Amends (`groups.js`): at standing −20 or worse. Pay: debt×1.25 + 20×grudge, standing to 0. Job: `groupOffer(…, 'amends')`: tier 3, base +1, no fee, persists on the board (`g.amends`) until taken; success: standing to 15 and debt cleared; failure: −15 standing, no new debt.
- Graphics: notes/graphics-engines.md (research, no code change): stay DOM+SVG; make the heist board a persistent scene animated with WAAPI plus a portrait bitmap cache; if that isn't enough, a PixiJS v8 canvas for the heist board only. Phaser and Kaplay don't fit.
- Verified: 132 unit tests (repute, runners, amends new), smoke 1p (bar between jobs, Players tab) and 1q (runner scene, hunt, found, mercy on the Players tab; amends; reputation pane) with real taps. Version 0.12.0. Not verified: human playtest of the hardness balance; real phones.

## Version in the help panel
- `src/version.js` exports `VERSION` (0.11.0), shown at the foot of the help panel and in `getState().version`. package.json's version matches (tests/version.test.mjs). Bump both with each release to main.

## The talent, from the job board
- The pub is drawn when the job board comes up (`refreshPub` at the end of `nextJob` and in `newGame`; `state.townKey` = `board-<jobs>-<day>`), after the Inspector's and rivals' moves, so his plant is in it. Taking a job keeps those faces (`pubForJob`): stars seen on the board move to the job (`inTown`), the job's star roll is the board's (rate unchanged, ~18% of jobs), and job-specific arrivals are added (a specialist the job needs, the first-job teaser star, a pending plant). Asking around during planning still redraws it.
- Job board: "🍺 The pub" and "🐾 Your crew" buttons open the pub and the little black book read-only (`currentScreen` allows pub/crew in the select phase); profiles say "Pick a job to hire".
- Verified: tests/pub.test.mjs (same faces after taking a job, no hiring from the board, specialist arrives, a board star is hireable on the job), smoke 1p with real taps (board-pub, board-crew captures). 114 tests.

## Rivals, the boxing-club fix, retirement
- Boxing club (`fix` at venue `ring`): the nobble step always offers `k_kibble` (spike his kibble); half the time the job is a ringer instead (`job.ringer`): Get on the Card, Training Camp, Bet on Ourselves, Into the Ring (muscle/agility/sneak/aim), Collect the Winnings.
- `src/rivals.js`: three rivals with plotlines, scenes are `story` entries of type `rival` with data-driven `EFFECTS` (save-safe), rendered like the Inspector's.
  - Jack Russell Gang (from job 2): intro, then mischief (chance 0.25 + 0.05×grudge, max 0.5): tip-off (alert), gatecrash (`state.gatecrash` → the next job gets an `obs_rivals` step named for them), nick kit (remembered), scare crew.
  - Dandy Dan (from job 3): notes (compliment on S/A, taunt and -2 rep on D/F, or he beats you to the best own lead), then a wager (an A or better on a tier-3 job; win pays and he leaves town; lose pays and -4 rep; walking away -3 rep).
  - Responses: rat out (away 4 jobs, -6 rep, -2 Ghost interest, back angrier), set up (cost, 60%: away 6 and +4 rep; else they gatecrash), rob (their place goes on the job board and stays until taken; a win ends them, +6 rep, kit returned), let it go (grudge +1).
  - The Grey Ghost: interest from S (+2) / A (+1) grades and a calling card (+2 on S/A, +1 on B). Intro at 2, a gift (special kit) at 5, an audition at 8 (next job A+ with no alarm), then joins as a legendary home-grown (`d.ghost`). Drawn as a dark figure in fog until then.
  - Calling card: plan toggle (`toggleCallingCard`), +1 clue on the job. The job board has "The Competition".
- `src/retire.js`: £100,000 nest egg (`RETIRE`), on the job board and in the books pane; two-tap Retire ends the game (`over.reason = 'retired'`) with epilogues: closest mate (by best skill, recalling your best job together), runner tracked down (`d.ranWith`) / farm visit (`d.farmedBy`, `d.lostOn`) / grass, a star, then a rival line and the Inspector. No careful bot career reaches the goal in 12 jobs; p90 reaches it around job 30.
- Phones: at ≤ 400px the day counter lives on the job board (tap opens the day book) and cash ≥ £10k shows as £Nk; no sideways scroll at 320–480px even with £999,999.
- Balance (careful bot, 150 careers × 15 jobs): rivals cost about 9 careers by job 15 (71 vs 80 alive), mainly extra heat; the bot doesn't take rival hits.
- Verified: 110 unit tests (rivals.test, retire.test new; jobs.test covers the ringer), smoke 1o with real taps and captures (rival-*.png, rivals-board, calling-card, nest-egg, retired, retired-epilogues). Not verified: a human playtest of the rival pacing and the length of the road to retirement.

## The Inspector acts; more jobs and more variety
- Why: playtest feedback said the game got easy and repetitive after a few heists, the Inspector did nothing, and no undercover crew ever showed up (coppers only appeared at heat 25+, which careful play reached around job 5).
- `src/inspector.js`: Inspector Hound (bloodhound, trilby, mac). Between jobs `inspectorMoves` may make a move (always by job 3, then chance 0.2 + heat/70): plant (a guaranteed copper in the next pub), stakeout (marks a board job 🚓 Watched), warn (next job on alert), tail, questioning, sting (a stranger's tip that is a setup; casing with the tipster reveals it; walking away from a known setup costs no rep), flip (turns a regular with loyalty < 65 into a grass; "find out who" unmasks 70%), raid. Scenes are `story` entries of type `inspector` with data-driven choices (`EFFECTS`), so they survive a save. Undercovers now possible from heat 12.
- His file (`state.mo`): every approach used on a noticed job is recorded, fading by 0.6 a job; +1 difficulty the second time running, +2 by the third. Shown on plan options ("He's seen this before") and in the heat pane with his recent moves. Police arrive sooner (alarm 8) at heat 60+. Fancy Francesca stings from heat 30.
- New kinds of job: tunnel, roof, fix, train (`LAYOUTS` in heists.js), with ~100 new approaches, hazards (flood, neighbour, pigeons, searchlight, steward, heavies, guard's van, railway police), intel, two new venues (Boxing Club, Mail Train) with art and props. `tools/venues.html` is a contact sheet of every job kind at each venue.
- Variety within jobs: obstacles motion/watchman/gate/glassfloor join guards/cameras/lasers; vaults boxes and wallsafe; obstacles and big vaults offer a sampled mix of options; cons sometimes build a big store; `TWISTS` (10) on 35–65% of jobs by tier, with difficulty mods by skill/stage/kind, noise, and generation effects (rush, bigger, rivals, grudge). Fog and storm change the venue art.
- Balance (tools/balance.mjs, careful bot now cases tips, answers his scenes, surveils strangers once he's about, lies low at heat 50): B+ by job falls from ~54% to ~30% mid-career (was ~40% flat); survival to job 15 unchanged (84 vs 85 of 150). Bot hires a copper on ~2.7% of jobs.
- Verified: 94 unit tests (tests/inspector.test.mjs new; jobs.test covers new kinds, twists, layout variety), smoke 1n with real taps (his scene, a setup tip spotted and sprung, each new kind's plan, his file on the plan and in the heat pane). Not verified: a human playtest of the new difficulty; on a real phone.

## Art pass 2, help and the top-bar panes
- Portraits (`src/dogs.js`): seven backdrops picked per dog (damask, brick, police line-up, wood panel, baize, blueprint, velvet) with spotlight and vignette; tweed/herringbone/pinstripe cloth on jackets; fur texture on head and ears. Cards and brand art pass a plain `bg`.
- Venues (`src/art.js`): night/dusk/deep/day skies (sun and clouds by day), brick and stone textures, weather (fog, wet-street shimmer), and props per job type (armoured van, smashed glass, gala carpet, crate, flower van with a dish, NOW HIRING, rope and hook). The job board shows a compact venue banner on every offer.
- The books: every cash change goes through `book(state, cat, amount)` (util.js); `closeBooks` files each job's items and net, and `timelinePoint` records cash/rep/heat after each job (`state.books`, `state.timeline`; both lazy, so old saves are fine). tests/books.test.mjs reconciles books to cash over 120 careers.
- Top bar: 💷 ⭐ 🕵️ 📅 are buttons opening panes (`src/panes.js`): the books (P&L column chart per job, earned/spent, job-by-job breakdown), reputation (line chart, what it unlocks, star chance), the Inspector (meter, line chart with plant/sting thresholds, what the heat brings), and the day book. Charts in `src/charts.js` (tap a mark to read it in the caption). Lines end on a "Now" point when the value moved since the last job.
- ? help button in the top bar and "How to play" on the title screen (works before a game exists).
- Narrow phones: the full CRIMEDOG wordmark only shows above 480px; below 370px the logo goes and stats spread. Verified no sideways scroll from 320px to 520px with six-figure cash.
- Verified: unit tests (81), smoke 1m with real taps (each pane, chart tap tooltip, help from title and top bar, 360px fit), captures `pane-*.png`, `help-*.png`, `topbar-360.png`. Not verified: on a real phone, and the live site (crimedog.live isn't reachable from the sandbox).

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

## Favicon and link previews
- `tools/brand.html` draws the brand art from the game's own portraits, skyline and fonts; `node tools/brand.mjs` screenshots it into `assets/`: `icon.svg` (favicon), `favicon-32.png`, `apple-touch-icon.png` (180, square for iOS), `icon-192.png` / `icon-512.png` (manifest), `og-image.png` (1200×630: CRIMEDOG over the skyline with the Guv'nor and a crew line-up).
- `index.html` links the icons and `site.webmanifest`, and has Open Graph + Twitter `summary_large_image` tags pointing at https://crimedog.live/ (stamped by `node tools/brand.mjs --site https://crimedog.live/`; rerun with another address if it moves).
- Tests: `tests/brand.test.mjs` (files exist, sizes, tags); smoke checks every icon and preview URL loads on the cold boot.
- Not covered: the hosted claude.ai artifact; its link previews and tab icon are set by claude.ai, not by our page.

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
- Balance group jobs separately from own leads (they're full-size, so a step up in difficulty).
- Human playtest of the first five minutes; tune copy and pacing from that.
- More obstacle types/venues and multi-dog steps (e.g. a lookout + a cracker on the same stage).
- Inspector escalation beyond undercover plants and sting fences (raids on the safehouse, wanted posters).
- Dog-to-dog relationships (rivalries, faction beef — Ze Germans vs the Bulldog Firm).
- Sound, and a little motion on the blueprint tokens.

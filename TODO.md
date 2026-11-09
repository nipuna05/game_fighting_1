# Where we stopped (end of session 1) and what is next

State: everything up to commit `328b395` works and is tested (typecheck + browser tests). Nothing is half-applied in the code.
**Not pushed to GitHub yet.** Run `git push -u origin main` in your own terminal (needs your GitHub sign-in).

## Start the game again

    cd D:\my\project\Game\Fight
    npm run dev:server     # ws://localhost:8080
    npm run dev:client     # http://localhost:5173   (open it with Ctrl+F5)

Share link for a teammate on the same network: `http://<this PC's IP>:5173`.

## Done so far (short)
Rounds + bomb, 3 maps, 12 weapons (real gun models), 4 soldier costumes (Soldier Cole + 3 Mixamo soldiers with retargeted
animations), team choice (Sentinels / Raiders), landing page + menu, profile + history + coins + unlocks, cash loot, kill feed,
multi-kill titles (DOUBLE STRIKE ... LEGENDARY) + FIRST BLOOD + MATCH MVP saved in the profile, tracers / muzzle flash /
impacts, sniper scope (right mouse, zoom animation), key rebinding (Controls tab), smoother controls (prediction).

## Next, in this order
1. **Done:** spectator view + slow-motion kill cam, and team-only voice chat (WebRTC, signalling relayed by the server between
   real players on the same team only; push-to-talk key T or open mic, set in Controls tab; off by default). Tested with three
   browser tabs and a fake microphone: teammates connect and hear each other, the enemy tab gets no connection even with a forged
   offer. Limits: the microphone needs https or localhost (a teammate on `http://<LAN IP>:5173` cannot use it until the game is
   served over https), and across the internet a TURN server may be needed on top of the public STUN.
2. **Done:** Medieval Village map (4th map, `?map=village`), built from the CC0 Quaternius kit in `client/public/models/village` (roofs, wagon, crate, stone textures) plus painted plaster and dirt.
3. Mixamo animations: idle/run were never downloaded, but Cole's animations are retargeted onto the Mixamo soldiers, so
   this is not needed any more.
4. Attach the CuiGames scopes / foregrip / light to the rifles (kit is in `assets-src/accessories`, not redistributable).
5. **Done:** mobile controls (sticks + PLANT/DEFUSE, SCOPE, SWAP, TALK buttons, fullscreen + landscape, phone HUD). Still to do: a Flutter / Android wrapper, and a test on a real phone.
   **Done:** realistic per-weapon gunshots, hit / wall / hurt / death sounds (synthesised; real recordings can be dropped into `client/public/sounds/guns`).
6. Put the game online (host the server, https, accounts so profiles and coins follow the player). Before that: compress the
   soldier models (about 9 MB each) with meshopt / KTX2.

## Done since: jump / kneel / bigger maps
Jump (Space) hops over low cover, kneel (C, hold) is steadier and hides you behind low cover, standing shooters fire over low cover
and kneeling ones are blocked by it. All maps are 2400 x 1800 (1.5x per side) with 20-26 pieces of low cover. A game is one round.
Esc or the Menu button leaves the game at any time; there is an end-of-game screen.

## Done: attachments, hands on weapons, credits
Holo sights / 4x / 8x scopes and a foregrip on the AK-47, MP5, M4A1 and L118A (CuiGames kit in `client/public/models/accessories`, gitignored,
about 11 MB: compress before going online). The weapon rides on the chest bone and both hands are placed on it with arm IK
(`applyArmIK` in characters.ts). Credits tab reads `client/public/credits.json` (gun authors still to confirm).
Phone / wrapper work is optional and postponed: the target is the responsive web version.

## Done: game styles + weapon sets (phase 1 of the roadmap)
Bomb mission and Team deathmatch (kills only, first to 25 or 5 minutes). Weapon sets: all guns (buy), pistols, SMGs, shotguns, rifles,
snipers, random every life; choice: I choose / automatic. Free loadouts (no cash) for everything except bomb + "all guns". Each team gets
an instruction text (`RoundState.goal`) shown under the top bar. Public rooms are per style. Dev URL: `?style=tdm&wset=sniper&pick=auto`.

## Done: weapons feel + music
Magazines and reload (R; auto-reload when empty; ammo HUD; swap takes 0.35 s and cancels a reload), muzzle flash, smoke and ejected shell casings,
first-person look up/down, weapon customization (sight / foregrip / finish, saved in the profile, seen by other players, small trade-offs in
`customMods`), and a generated "mission" soundtrack (`client/src/music.ts`: calm / game / intense moods, volume slider in Controls, M mutes).

## Done: new menu (replaces the idea below)
Left navigation (Play, Equipment, Rewards, Shop, Profile, Settings, Credits), profile chip with a rank (from XP = matches*20 + wins*100 + kills*10),
a home screen with just Single player / Multiplayer, a separate match-setup screen (map, style, weapons, team, room code) with a sticky Start
button, a 28-day daily reward calendar (coins, costumes, sidearms, finishes; one claim per day, nothing resets if a day is missed), a Shop for
coin unlocks (costumes, sidearms, Arctic / Gold finishes). FIXED: the menu's Multiplayer button had the same id as the in-game multi-kill
popup (`#multi`), so it was invisible and dead; the menu buttons are now `homeSingle` / `homeMulti`. Keep ids unique!

## (old idea, now done) UI from the user's screenshots of another game's menu
Left-hand navigation (Play, Practice, Equipment, Shop, Rewards, Settings, Community), currency bar, a 28-day "daily login rewards" calendar
(coins, weapon finishes), crate slots, a featured-item card and a season / battle-pass strip. Build it with coins only (no real-money items).

## Done: missions (phase 2)
Hostage rescue (Sentinels untie 2 hostages with E, escort them to the extraction zone at their spawn; Raiders stop them; 4 minutes) and
Collect the intel (first team to 8 cases; cases respawn after 25 s). Both have world objects (hostage figures, glowing cases with light
beams), screen markers with distances, hints, an untie progress bar, toasts and sounds, and bot behaviour. Add a new mission by adding a
`GameMode`, its `step...` function in sim.ts, its goal text, and objects in `syncObjectives`.

## Done: items (phase 3)
Healing (bandage 2 s +25, medkit 4 s +75, adrenaline 3 s +30 and a 10 s speed boost; slowed while using, interrupted by damage) and throwables
(frag, smoke, flashbang, molotov) on keys 3-9. Start kit in free modes, equipment shop in the bomb mission, supply boxes around each map
(40 s respawn), bots heal and throw. Item bar, using bar, flash whiteout, smoke / fire clouds, explosion shake, sounds, kill-feed names.
Possible later: armor/helmet levels, ammo boxes, a throw-distance charge, touch buttons for items.

## Done: multi-floor buildings (phase 4)
Every map now has two enterable two-storey houses (mirrored) with a door, a ground floor, a stair ramp you walk up (z follows the ramp), an upper
floor with windows (low walls you can shoot over) and an interior wall. Bomb site C is upstairs in one house. Floors are levels (lv 0/1):
walls, bullets, grenades, smoke/fire, bomb plant/defuse and pickups all respect the floor; bots find the door, cross the interior and use the
stairs to plant / defuse upstairs. Client: house geometry + stair ramp, upper floor hidden while you are on the ground floor inside,
camera / characters / bullets / effects follow the floor height. Code: `house()` + `withBuildings()` in shared/src/maps.ts, level rules in
shared/src/sim.ts (`wallsAt`, `botGoLv`), `buildHouses()` in client/src/world.ts.
Possible next: a roof / third floor, jumping up onto ledges and crates, balcony ladders, more houses per map, hostages / cases upstairs.

## Roadmap the user asked for (in this order)
2. (done: rescue + collect) more missions could be: escort a VIP, defend a point, capture-the-flag.
3. (done: healing items, grenades, supplies)
4. (done) **Multi-floor buildings**: floors, stairs, jump up onto ledges, bomb sites upstairs. Needs a z-level on players/walls/bullets in the sim,
   floor + stairs geometry in world.ts, bot navigation per floor. The biggest change: everything is flat today.
5. **Themed bigger maps** inspired by PUBG / IGI / Task Force / Delta Force / Call of Duty (use original layouts and names), each with its
   own mission text. Larger area than the current 2400 x 1800.
(Prone + sneak, first-person default, attachments, respawn, etc. are done.)

## Known issues / notes
- Bots give the Raiders about 58% of rounds on every map (bot AI, not the layouts).
- Coins, unlocks, titles and key bindings live in the browser (localStorage) and are not tamper-proof.
- Downloaded packs are kept out of git (`assets-src/*`, `client/public/models/{cole,mixamo,guns,characters,thumbs}`) because of
  their licences. Without them the game falls back to the Kenney character and built-in guns.
- Credits to show in the game: Kenney (CC0), Quaternius Medieval Village (CC0), "Soldier Cole by Grigory Petrov",
  CuiGames accessory kit, and the Poly Pizza gun authors (author names still needed from the Poly Pizza pages).
- Dev URL options: `?mode=single`, `&map=dock|desert|town`, `&zoom=0.4`, `&timescale=40`, `&god=1` (invincible), `&top=1`,
  `&debug=1`, `?gallery=1` (weapon models), `/preview.html`, `/gallery.html`.

## Done (2026-11-09): maps, weapons, outfits, equipment, menu pages
- Four more themed maps: Outpost Delta (military base), Jungle Ruins, Frozen Pass (snow canyon), Dead Canyon (winding gorge). Same 2400 x 1800 size
  (per-map sizes would touch WORLD_W/WORLD_H everywhere; still on the list). Add a map with a `MapDef`, a theme entry in world.ts `THEMES`, a floor texture and a `.mapprev` colour.
- Seven new weapons appended to `WEAPONS` (Vector, AUG, SCAR-H, SVD Marksman, M870 Pump, RPK, AWM) with built-in models and their own gunshot voices. NEVER insert weapons in the middle: indexes are saved in profiles and sent over the network.
- Aim down the sights (hold right mouse) for every gun: tighter spread (`ADS_SPREAD`), slower walk (`ADS_SPEED`), a light zoom; snipers still get the scope. Recoil climbs the camera and kicks the gun, the gun sways when you walk, and the aim cross shows the real spread.
- Dress kits: 7 colour outfits over any costume (Standard, Woodland free; others cost coins). The kit is packed into the skin number (`skin = costume + 4 * kit`), so no protocol change.
- New items: Painkillers (key 0), First-aid kit (F), Impact grenade (H, bursts on contact). Appended to `ITEMS`.
- Menu: sub-tabs so nothing needs scrolling (Equipment: Weapons / Customize / Outfit; Setup: Map / Game / Player; Settings: Options / Movement / Weapons / Items / Other; Shop; Rewards). Mark blocks with `data-s="page"` and call `subTabs(...)` in menu.ts.
- Hit feedback: an X marker on the aim cross when my bullet hits (red and bigger on a kill) with a tick / thud sound, red arcs pointing at whoever shot me (`ImpactEvent` now carries shooter, victim and bullet direction), and a shockwave ring on frag / impact grenade blasts.

## Balance pass (2026-11-09), measured with bot-only games (64 team deathmatches with a random gun every life, plus 36 games per mission)
- Weapon K/D now ranges from about 0.5 (SPAS-12) to 1.1 (SCAR-H); before it was 0.54 to 1.26. Tuned: RPK, Striker, SPAS-12, L118A (one-shot kill now), SVD, MP5, Vector, M870, AUG, Barrett cost. Shotguns are still the weakest against bots (short range), a bot-AI limit as much as a weapon one.
- Bomb: plant 3 -> 3.5 s, defuse 5 -> 4 s; Raiders won 67% of games before, now about 47%.
- Rescue: untie 2 -> 1.2 s, time 240 -> 270 s, and the Sentinel bots now gather half way to the hostage and push together (they used to arrive one by one and die at the Raiders' camp). Sentinels won 25% before, now 50% (18 of 36).
- Collect the intel: Sentinels won 61% (not changed, within noise).
- Test scripts: balance.ts / modewins.ts were temporary (scratchpad); worth keeping as `tools/balance.ts` if we balance again.
- Bots now use painkillers, first-aid kits and impact grenades, and aim down the sights with rifles / SMGs / LMGs at medium range (tighter spread, slower walk).

## Done (2026-11-09): two new missions
- **Control point** (`point`): a glowing zone in the middle (found by searching straight up / down from the centre so neither team is favoured). Only your team inside = +1 point per second, 100 points or the best score at 5 minutes wins. World: ring + disc + beam coloured by who holds it; HUD line, toasts, marker.
- **Capture the flag** (`flag`): the Raiders' flag is placed in front of their spawn, the Sentinels' flag is its mirror image. Touch the enemy flag to carry it (it follows you, drops where you die, goes home by itself after 20 s, or touch your own dropped flag to send it home); get it to your own flag while yours is at home to score. First to 3 captures or most at 6 minutes (tie: more kills). Bots: defenders by the flag, attackers gather then push together, carriers run home, everyone hunts a stolen flag.
- Bot-only results: control point 16 vs 16, capture the flag about 58% Raiders (28 vs 20); both tie-break on kills.
- Still open for more missions: VIP escort. A roof / third floor was dropped for now (shots only hit players on the same floor, so a roof would be a place nobody can reach by gunfire; it needs a high-ground shooting rule first).
- **VIP escort** (`vip`): one Sentinel (random, can be you) is the VIP with body armor and 40% less damage taken; the Sentinels escort them to a green extraction zone about a third of the way from the Raiders' spawn. If the VIP dies (or time runs out) the Raiders win. Gold beam and marker on the VIP, extraction marker for Sentinels. Bots: the VIP waits for two escorts then walks, escorts lead ahead, Raiders ambush along the route and hunt a VIP within about 560 units. Bot-only result: 20 vs 20.
- Controls cheat sheet (F1): built from the player's own key bindings, shown automatically once in a new player's first game (after the mission banner), reopened any time with F1. `profile.options.helpSeen` remembers it. Checked live: the GitHub Pages site starts all mission types with no script errors; only the optional art packs 404 (the game falls back to built-in models).
- Bot difficulty (Easy / Normal / Hard) in the match setup, Game page: changes how far bot aim wanders (0.26 / 0.12 / 0.04 rad), their damage (x0.7 / x1 / x1.12) and reaction time (x1.4 / x1 / x0.7). Single player only (`SimOptions.difficulty`; dev URL `?diff=hard`); the multiplayer server uses Normal. Saved in the profile.
- Mobile / phone responsiveness: deferred by the user (desktop first).
- Match stats: the sim counts shots fired, bullets that hit and damage dealt per player (`PlayerState.sh / ht / dd`, reset each game). The end screen shows my score, deaths, K/D, accuracy and damage, my best weapon and best multi-kill streak, and a scoreboard of everyone. Bot-only check: about 27% accuracy and about 109 damage per kill.
- **Practice range** (`range`, single player only; menu: Game style > Practice range): no enemy bots; 9 target dummies in a lane in front of your spawn (5 stand, 4 strafe; `Sim.addDummies`, `Player.dummy`), a knocked-down target stands up after 1.2 s, the game never ends. You are always a Sentinel with every gun: the weapon list stays open (click = instant swap with a full magazine; B hides / shows it). HUD shows targets down, accuracy and damage. The multiplayer Start button refuses the range.
- Lifetime stats: Profile now has sub-tabs Overview / Stats / History. Stats shows accuracy, damage per game, best game, best streak, favourite weapons (kills per weapon, bar chart) and results by mission from the recent fights. Saved in the browser with each finished game (`Totals.shots / hits / dmg / bestKills / bestStreak / byWeapon / statGames`, `MatchEntry.style / map / shots / hits / dmg`); older profiles load fine and just start counting.
- Daily challenges (Rewards > Daily challenges): three a day, picked from the date (same for everybody): kills with a weapon class, win a mission, total damage, a kill streak, an accuracy game, games played, total kills. Progress counts from each finished game (not the range); claim for 100-200 coins each; the Rewards red dot lights when something is ready. Profile field `challenges` (date, progress, claimed); generator `makeChallenges(date)` in profile.ts.
- Map previews: real screenshots of each map from the game's own 3D renderer in `client/public/maps/<id>.jpg` (made with a headless-browser capture; redo them when a map's look changes), shown as 4 picture tiles in the setup screen. `mapthumb.ts` draws a layout picture as a fallback if a photo is missing. A new map needs its own jpg.
- Multiplayer on the GitHub page: the client now takes the game server address from the link (`?server=wss://...`, remembered in the browser) or from a Game server box on the multiplayer setup > Player page; only wss:// (or ws:// to this PC / a private network) is accepted. `assets.ts` has `getServerUrl / setServerUrl / validServerUrl / isStaticHost`. The Multiplayer button is no longer disabled on github.io; Join refuses until an address is set. A server still has to run somewhere reachable over wss (a cloudflared tunnel to a PC, or a cloud host).
- Multiplayer is hosted on Fly.io: app `game-fighting-1` (region sin), wss://game-fighting-1.fly.dev, built from the repo's `Dockerfile` + `fly.toml` (server + shared only). The Pages workflow bakes it in as `VITE_WS_URL`, so the GitHub site's Multiplayer button works for everybody. Redeploy: Fly dashboard > app > Launch/Deploy from GitHub, or `flyctl deploy`. Changing the sim/server needs a redeploy; the Pages site and the server must run the same version.

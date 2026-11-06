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

## Next UI idea from the user (screenshots of another game's menu)
Left-hand navigation (Play, Practice, Equipment, Shop, Rewards, Settings, Community), currency bar, a 28-day "daily login rewards" calendar
(coins, weapon finishes), crate slots, a featured-item card and a season / battle-pass strip. Build it with coins only (no real-money items).

## Roadmap the user asked for (in this order)
2. **Missions with instruction text**: rescue the hostage, collect items / intel, escort, defend. The `goal` text and mode framework are ready;
   add `GameMode`s (e.g. 'rescue', 'collect') with their own objective entities in the sim.
3. **Items (PUBG style)**: medkit / bandage / painkillers / energy drink (heal over time), armor and helmet levels, grenade types (frag,
   smoke, flash), and different bombs. Pickups on the map + an inventory bar.
4. **Multi-floor buildings**: floors, stairs, jump up onto ledges, bomb sites upstairs. Needs a z-level on players/walls/bullets in the sim,
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

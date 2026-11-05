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
1. **Spectator view + slow-motion kill cam** (requested). The code is written but not applied:
   `tools/pending/patch_spectate.py` (run with `python tools/pending/patch_spectate.py`, then `npm run typecheck`).
   It adds: kill cam replay (about 1.8 s before the death at 0.4x speed, follows the killer, letterbox + "KILL CAM" text,
   Space skips), spectating with Space / click to switch player, R to watch the death again, an on/off option in
   Controls tab -> Options. Needs testing after applying (history recording, camera follow, no duplicate kill-feed events).
2. **Team-only voice chat with a headset** (requested). Plan: WebRTC peer-to-peer voice between teammates, signalling through
   the game server (the server only relays between players on the same team in the same room), push-to-talk key (default T)
   or open mic, mic indicator by the player name, on/off + mode option in Controls tab (profile.options.voice already exists
   in the plan). Limits to know: browsers only allow the microphone on https or localhost, so a teammate opening
   `http://<LAN IP>:5173` cannot use the mic until the game is served over https (do that when we host it online).
   Public STUN is fine on a LAN; across the internet a TURN server may be needed.
3. Medieval Village map (the kit pieces are already in `client/public/models/village`, CC0).
4. Mixamo animations: idle/run were never downloaded, but Cole's animations are retargeted onto the Mixamo soldiers, so
   this is not needed any more.
5. Attach the CuiGames scopes / foregrip / light to the rifles (kit is in `assets-src/accessories`, not redistributable).
6. Mobile pass (touch buttons for plant / defuse / buy / scope, then a Flutter or Android wrapper).
7. Put the game online (host the server, https, accounts so profiles and coins follow the player). Before that: compress the
   soldier models (about 9 MB each) with meshopt / KTX2.

## Known issues / notes
- Bots give the Raiders about 58% of rounds on every map (bot AI, not the layouts).
- Coins, unlocks, titles and key bindings live in the browser (localStorage) and are not tamper-proof.
- Downloaded packs are kept out of git (`assets-src/*`, `client/public/models/{cole,mixamo,guns,characters,thumbs}`) because of
  their licences. Without them the game falls back to the Kenney character and built-in guns.
- Credits to show in the game: Kenney (CC0), Quaternius Medieval Village (CC0), "Soldier Cole by Grigory Petrov",
  CuiGames accessory kit, and the Poly Pizza gun authors (author names still needed from the Poly Pizza pages).
- Dev URL options: `?mode=single`, `&map=dock|desert|town`, `&zoom=0.4`, `&timescale=40`, `&god=1` (invincible), `&top=1`,
  `&debug=1`, `?gallery=1` (weapon models), `/preview.html`, `/gallery.html`.

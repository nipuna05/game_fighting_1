# Fight (game_fighting_1)

A browser 3D tactical shooter for desktop. Play it here: **https://nipuna05.github.io/game_fighting_1/**
Single player runs fully in the browser; multiplayer connects to a game server on Fly.io.

## What is in the game

- **Seven missions**: Bomb mission, Team deathmatch, Hostage rescue, Collect the intel, Control point, Capture the flag and VIP escort, plus a **Practice range** (single player).
  Each team gets its own instruction text, a mission card with live progress and markers on the screen.
- **Eight maps**: Old Town, Harbor Docks, Dune Outpost, Medieval Village, Outpost Delta, Jungle Ruins, Frozen Pass, Dead Canyon. Every map has two enterable two-storey houses with stairs.
- **19 weapons** (3 sidearms, 16 primaries) with magazines, reload, recoil, aim down the sights (hold right mouse), attachments (sights, foregrip) and weapon finishes, 10 items (heals, grenades, supply boxes),
  first-person (default) and top-down cameras, kneel / prone / sneak / jump.
- **Bots** with Easy / Normal / Hard difficulty. They gather and push together, use items and aim down the sights.
- **Progress** (saved in the browser): coins, a 28-day daily reward calendar, three daily challenges, a Shop, costumes, dress kits, finishes, a Collection page, lifetime stats, rank, match stats on the end screen.
- **Multiplayer**: rooms by code or a public game per style, team voice chat (WebRTC), spectating and a slow-motion replay of your death.

## Controls (desktop)

Press **F1** in the game for the full list (your own key bindings). Basics: WASD move, mouse aim, left click shoot, hold right click to aim down the sights, R reload, Space jump, C kneel, X lie down,
Shift walk slowly, E plant / defuse / untie, 1 / 2 / Q / mouse wheel switch weapon, 3-9, 0, F, H items, P camera, Esc menu. Every key can be changed in Settings.

## Run it

    npm install
    npm run dev:server   # game server, ws://localhost:8080   (terminal 1)
    npm run dev:client   # the game, http://localhost:5173    (terminal 2)

Single player needs only the client. Other people on your network open `http://<your PC's IP>:5173` (voice chat needs https or localhost).

### Two environments on one PC
| | Client | Game server | Started with |
|---|---|---|---|
| **dev** (live reload) | http://localhost:5173 | ws :8080 | `npm run dev:server` + `npm run dev:client` |
| **test** (a built, stable copy for testers) | http://localhost:5174 | ws :8081 | `npm run test-env:build`, then `npm run test-env:server` + `npm run test-env:client` |

Rebuild the test copy with `npm run test-env:build` whenever testers should get the newest version.

## Hosting

- **The website**: GitHub Pages. `.github/workflows/pages.yml` builds the client on every push to `main` and publishes it (Settings > Pages > Source: GitHub Actions).
  The multiplayer address is baked in at build time (`VITE_WS_URL`, in that workflow). A link can also carry another server: `...?server=wss://other-server`.
- **The multiplayer server**: Fly.io, app `game-fighting-1` (`wss://game-fighting-1.fly.dev`, region Singapore), built from `Dockerfile` + `fly.toml` (server and shared rules only).
  `.github/workflows/fly-deploy.yml` redeploys it when `server/`, `shared/` or the container files change, once the `FLY_API_TOKEN` secret is set (instructions at the top of that file).
  Without that, use the Fly dashboard (Deploy) or `flyctl deploy`.
- **A public server is protected**: only the listed websites may connect (`ALLOWED_ORIGINS` in `fly.toml`), at most 8 connections per address, at most 60 games, and a flood of messages drops the connection.

### What happens to players when the server is updated
Everyone is told "The server is updating" a few seconds before it stops, their game reconnects by itself and joins a fresh game.
Coins, unlocks and stats live in the player's browser, so they are never lost; only the match in progress restarts.
The game and the server compare a protocol version (`PROTOCOL_VERSION` in `shared/src/sim.ts`) when joining: a page that is out of date is told to reload.
**Bump that number whenever the messages or the snapshot change in a way an old page cannot understand**, and redeploy the server together with the website.
Changes that only touch the client (menus, pictures, sounds) never need a server redeploy.

## Layout

- `shared/` the game simulation (`sim.ts`), maps (`maps.ts`) and network protocol, used by the client and the server
- `server/` WebSocket rooms and the 30 Hz game loop
- `client/` Vite + Three.js: `main.ts` (game and HUD), `world.ts` (maps and gun graphics), `characters.ts`, `menu.ts`, `profile.ts` (browser save), `landing.ts` (menu background), `music.ts` / `audio.ts` (generated sound)
- `tools/` checks and picture-capture scripts (see `tools/README.md`)
- `TODO.md` what was built, how it works, and what is left

## Dev URL options

`?mode=single` skips the menu, `&map=<id>`, `&style=<mission>` (`bomb`, `tdm`, `rescue`, `collect`, `point`, `flag`, `vip`, `range`), `&diff=easy|normal|hard`, `&view=top|fps`, `&god=1`, `&debug=1`, `&timescale=40`, `?gallery=1` (weapon models).

## Art that is not in the repository

Downloaded art packs are not redistributable, so they are kept out of git (see `.gitignore` and the READMEs in `assets-src/*`). The game runs without them and falls back to free built-in graphics:

| Missing | Folder | Fallback |
|---|---|---|
| Realistic soldiers (Cole, Mixamo) | `client/public/models/cole`, `mixamo` | the CC0 Kenney soldier |
| Gun models | `client/public/models/guns/<weapon id>.glb` | built-in low-poly guns |
| Rifle sights / foregrip (CuiGames kit) | `client/public/models/accessories` | guns without attachments |
| Pictures made from those models | `client/public/weapons/real`, `client/public/costumes/real` | pictures of the built-in guns and the Kenney soldier (`weapons/`, `costumes/`) |

In git: the Kenney characters, the CC0 Medieval Village kit, all code, generated sounds and music, the map pictures (`client/public/maps`), and `client/public/credits.json`.

## Credits

Character model, animations and skins: Kenney "Animated Characters 2" (CC0), https://kenney.nl. Medieval village kit: Quaternius (CC0). More are listed on the Credits tab (`client/public/credits.json`).

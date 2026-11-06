# Fight (game_fighting_1)

Browser 3D tactical arena shooter. Bomb-defusal rounds, 3v3, with bots filling empty slots.

- **Landing page** with a live 3D background; tabs for Play, Loadout, Costume and Profile.
- **Maps**: Old Town (sunny plaza), Harbor Docks (container yard), Dune Outpost (desert). Pick one in the menu; in multiplayer the first player in a room chooses its map.
- **Teams**: Sentinels (defenders) and Raiders (attackers). Pick a side or let the game balance you.
- **Weapons**: 3 sidearms (free, chosen in the menu) and 9 primaries bought each round (SMG, shotgun, rifle, sniper, LMG). Optional auto-buy of a favourite primary.
- **Economy**: money from kills and round wins, plus cash loot lying on the map and bags dropped by fallen players. Coins are earned after each finished match and unlock costumes and sidearms.
- **Single player**: you + bots, simulation runs fully in the browser. **Multiplayer**: authoritative Node WebSocket server, room codes.

## Controls (desktop)

WASD move, mouse aim, click shoot, hold E to plant / defuse the bomb, click the buy menu in the buy phase (V = armor, B = rebuy last pack), 1 = sidearm, 2 = primary, mouse wheel / Q switch weapon, M mute.
Mobile: left stick moves, right stick aims and shoots (plant / buy buttons are not built yet).

## Run

    npm install
    npm run dev:server   # ws://localhost:8080
    npm run dev:client   # http://localhost:5173 (also reachable from other devices on the same network)

Set `VITE_WS_URL` to point the client at a deployed server.

## Layout

- `shared/` game simulation, maps (`maps.ts`) and network protocol, used by client and server
- `server/` WebSocket rooms and game loop (30 Hz)
- `client/` Vite + Three.js: renderer (`main.ts`), map and weapon graphics (`world.ts`), characters (`characters.ts`), landing background (`landing.ts`), menu (`menu.ts`), profile storage (`profile.ts`)

## Profile

Name, costume, team, sidearm, auto-buy, coins, unlocks, last weapon pack and your last 20 finished fights are saved in the browser (localStorage). They are per browser and not tamper-proof. Cross-device accounts need a server database (not built yet).

## Dev URL options

`?mode=single` skips the menu, `&map=dock|desert|town`, `&zoom=0.3`, `&timescale=40` (fast-forward single player), `?gallery=1` (weapon models).

## Credits

Character model, animations and skins: Kenney "Animated Characters 2" (CC0), https://kenney.nl

## Two environments (dev and test)

| | Client | Game server | Started with |
|---|---|---|---|
| **dev** (live reload, your day-to-day work) | http://localhost:5173 | ws :8080 | `npm run dev:server` + `npm run dev:client` |
| **test** (a built, stable copy to share with testers) | http://localhost:5174 | ws :8081 | `npm run test-env:build`, then `npm run test-env:server` + `npm run test-env:client` |

They run side by side with separate rooms, so testers are not disturbed while you change dev. The test client is a production build
(`client/dist-test`) and is pointed at port 8081 through `client/.env.test` (`VITE_WS_PORT`). Rebuild it with `npm run test-env:build`
whenever you want testers to get the newest version.

## Run it from a fresh GitHub clone

```
git clone https://github.com/nipuna05/game_fighting_1.git
cd game_fighting_1
npm install
npm run dev:server      # game server, ws://localhost:8080   (terminal 1)
npm run dev:client      # the game,   http://localhost:5173  (terminal 2)
```

Open http://localhost:5173. **Single player works with the client alone** (the game simulation runs in the browser); the server is only needed for multiplayer.
Other people on the same network open `http://<your PC's IP>:5173` (the server must be running on your PC; voice chat needs https or localhost).

### What is not in the repository (and what happens without it)
Downloaded art packs are not redistributable, so they are kept out of git (see `.gitignore` and the READMEs in `assets-src/*`). The game still runs without them
and falls back to built-in graphics:

| Missing | Folder | Fallback |
|---|---|---|
| Soldier Cole + Mixamo soldiers | `client/public/models/cole`, `client/public/models/mixamo` | the CC0 Kenney soldier (included) |
| Gun models | `client/public/models/guns/<weapon id>.glb` | built-in low-poly guns |
| Rifle sights / foregrip (CuiGames kit) | `client/public/models/accessories` | guns without attachments |
| Soldier portraits | `client/public/models/thumbs` | plain cards |

Included in git: the CC0 Kenney characters, the CC0 Medieval Village kit, all code, the generated sounds and music (no audio files are used), and `client/public/credits.json`.
Copy your own downloads into those folders (file names are in the READMEs) to get the full look.

### Putting it online
`npm run build` makes the static client in `client/dist`. A static host (for example GitHub Pages) is enough for **single player**. Multiplayer needs the Node server
(`server/`) running somewhere with a public address, and the client built with `VITE_WS_URL` pointing at it (use `wss://` when the page is https).

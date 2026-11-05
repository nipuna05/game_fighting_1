# Fight (game_fighting_1)

Browser 3D arena shooter (angled third-person camera). Playable on desktop and mobile web.

- **Mode**: CS-style bomb defusal, 3v3 (CT vs T). Buy phase, then a live round. First to 6 round wins takes the match.
- **Single player**: you + bots, simulation runs fully in the browser.
- **Multiplayer**: authoritative Node WebSocket server, room codes, bots fill empty slots.
- Desktop: WASD move, mouse aim, click shoot, hold E plant/defuse, Z/X/C/V buy shotgun/rifle/sniper/armor, 1-4 switch weapon.
- Mobile: left stick moves, right stick aims and shoots (plant/defuse button not built yet).

## Run

    npm install
    npm run dev:server   # ws://localhost:8080
    npm run dev:client   # http://localhost:5173 (also reachable from phones on the same Wi-Fi)

Set `VITE_WS_URL` to point the client at a deployed server.

## Layout

- `shared/` game simulation + network protocol (used by client and server)
- `server/` WebSocket rooms and game loop (30 Hz)
- `client/` Vite + Three.js 3D renderer, menu and touch controls



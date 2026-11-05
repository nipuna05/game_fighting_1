# Fight (game_fighting_1)

Browser top-down arena shooter. Playable on desktop and mobile web.

- **Single player**: you vs bots, simulation runs fully in the browser.
- **Multiplayer**: authoritative Node WebSocket server, room codes, bots fill empty slots.
- Desktop: WASD + mouse. Mobile: left stick moves, right stick aims and shoots.

## Run

    npm install
    npm run dev:server   # ws://localhost:8080
    npm run dev:client   # http://localhost:5173 (also reachable from phones on the same Wi-Fi)

Set `VITE_WS_URL` to point the client at a deployed server.

## Layout

- `shared/` game simulation + network protocol (used by client and server)
- `server/` WebSocket rooms and game loop (30 Hz)
- `client/` Vite + Phaser renderer, menu and touch controls

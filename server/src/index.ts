import { WebSocketServer, WebSocket } from 'ws';
import { Sim, TICK_RATE, TEAM_SIZE, type ClientMsg, type ServerMsg } from '@fight/shared';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_PER_ROOM = 6; // matches 2 teams of TEAM_SIZE; bots are replaced as humans join

interface Room { code: string; sim: Sim; clients: Map<string, WebSocket> }
const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  let r = rooms.get(code);
  if (!r) { r = { code, sim: new Sim({ rounds: true }), clients: new Map() }; rooms.set(code, r); }
  return r;
}

const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

const wss = new WebSocketServer({ port: PORT });
let nextId = 1;

wss.on('connection', (ws) => {
  let room: Room | null = null;
  const id = `p${nextId++}`;

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.type === 'join' && !room) {
      const code = String(msg.room || 'public').slice(0, 16).replace(/[^\w-]/g, '') || 'public';
      const r = getRoom(code);
      if (r.clients.size >= MAX_PER_ROOM) { ws.close(1013, 'room full'); return; }
      room = r;
      r.clients.set(id, ws);
      r.sim.join(id, String(msg.name || 'Player').slice(0, 14));
      r.sim.fillBots(TEAM_SIZE);
      send(ws, { type: 'welcome', id, room: code });
    } else if (msg.type === 'input' && room) {
      room.sim.setInput(id, msg.input);
    } else if (msg.type === 'buy' && room) {
      room.sim.buy(id, Number(msg.item));
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.sim.removePlayer(id);
    room.clients.delete(id);
    if (room.clients.size === 0) rooms.delete(room.code);
    else room.sim.fillBots(TEAM_SIZE);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    room.sim.step(1 / TICK_RATE);
    const snap = { type: 'snap', snap: room.sim.snapshot() } as const;
    for (const ws of room.clients.values()) send(ws, snap);
  }
}, 1000 / TICK_RATE);

console.log(`Fight server listening on ws://localhost:${PORT}`);

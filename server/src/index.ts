import { WebSocketServer, WebSocket } from 'ws';
import { Sim, TICK_RATE, type ClientMsg, type ServerMsg } from '@fight/shared';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_PER_ROOM = 8;
const MIN_PLAYERS = 4; // bots fill empty slots so a lone player is never waiting

interface Room { code: string; sim: Sim; clients: Map<string, WebSocket> }
const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  let r = rooms.get(code);
  if (!r) { r = { code, sim: new Sim(), clients: new Map() }; rooms.set(code, r); }
  return r;
}

function rebalanceBots(room: Room) {
  const humans = room.sim.humanCount();
  const want = Math.max(0, MIN_PLAYERS - humans);
  let have = room.sim.botCount();
  while (have < want) { room.sim.addPlayer(`bot${Date.now()}${have}`, `Bot ${have + 1}`, true); have++; }
  // removing surplus bots is left to attrition: bots are dropped when a human joins a full room
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
      r.sim.addPlayer(id, String(msg.name || 'Player').slice(0, 14));
      rebalanceBots(r);
      send(ws, { type: 'welcome', id, room: code });
    } else if (msg.type === 'input' && room) {
      room.sim.setInput(id, msg.input);
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.sim.removePlayer(id);
    room.clients.delete(id);
    if (room.clients.size === 0) rooms.delete(room.code);
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

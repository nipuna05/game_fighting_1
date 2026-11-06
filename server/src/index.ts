import { WebSocketServer, WebSocket } from 'ws';
import { Sim, TICK_RATE, TEAM_SIZE, type ClientMsg, type ServerMsg } from '@fight/shared';

const portArg = process.argv.find((a) => a.startsWith('--port='))?.slice(7);
const PORT = Number(portArg ?? process.env.PORT ?? 8080);   // dev 8080, test environment 8081 (--port=8081)
const MAX_PER_ROOM = 6; // matches 2 teams of TEAM_SIZE; bots are replaced as humans join

interface Room { code: string; sim: Sim; clients: Map<string, WebSocket>; voice: Set<string> }
const rooms = new Map<string, Room>();
const heartbeat = new Map<WebSocket, () => void>();   // drops dead connections (a closed laptop / phone) so ghost players leave
const staleCheck = new Map<WebSocket, () => void>();

function getRoom(code: string, mapId?: string): Room {
  let r = rooms.get(code);
  if (!r) { r = { code, sim: new Sim({ rounds: true, map: mapId }), clients: new Map(), voice: new Set() }; rooms.set(code, r); } // the first player picks the room's map
  return r;
}

const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

const wss = new WebSocketServer({ port: PORT, maxPayload: 8 * 1024 }); // game messages are tiny: refuse anything big
// A bad message or a bug must never take the whole server (and everybody's game) down.
process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));
let nextId = 1;

wss.on('connection', (ws) => {
  let room: Room | null = null;
  const id = `p${nextId++}`;
  let alive = true, lastInput = Date.now();
  ws.on('pong', () => { alive = true; });
  heartbeat.set(ws, () => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); });
  ws.on('error', () => undefined);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    try { handle(msg); } catch (e) { console.error('bad message from', id, e); }
  });

  /** Quiet players (tab in the background, phone asleep) stop moving and shooting instead of running on their last input. */
  staleCheck.set(ws, () => { if (room && Date.now() - lastInput > 800) room.sim.setInput(id, { mx: 0, my: 0, angle: 0, fire: false }); });

  function handle(msg: ClientMsg) {
    if (msg.type === 'ping') { send(ws, { type: 'pong', t: Number(msg.t) || 0 }); return; }
    if (msg.type === 'join' && !room) {
      const code = String(msg.room || 'public').slice(0, 16).replace(/[^\w-]/g, '') || 'public';
      const r = getRoom(code, msg.map);
      if (r.clients.size >= MAX_PER_ROOM) { ws.close(1013, 'room full'); return; }
      room = r;
      r.clients.set(id, ws);
      r.sim.join(id, String(msg.name || 'Player').slice(0, 14), Number(msg.skin) || 0, Number(msg.sidearm) || 0, msg.team === 'CT' || msg.team === 'T' ? msg.team : 'auto');
      r.sim.fillBots(TEAM_SIZE);
      send(ws, { type: 'welcome', id, room: code, map: r.sim.map.id });
    } else if (msg.type === 'input' && room) {
      lastInput = Date.now();
      room.sim.setInput(id, msg.input);
    } else if (msg.type === 'voice' && room) {
      // announce / withdraw my microphone to my TEAMMATES only (real players on my team)
      const myTeam = room.sim.humanTeam(id);
      if (!myTeam) return;
      if (msg.ready) room.voice.add(id); else room.voice.delete(id);
      for (const [otherId, otherWs] of room.clients) {
        if (otherId === id || room.sim.humanTeam(otherId) !== myTeam) continue;
        send(otherWs, { type: 'voice', from: id, ready: !!msg.ready });
        if (msg.ready && room.voice.has(otherId)) send(ws, { type: 'voice', from: otherId, ready: true });
      }
    } else if (msg.type === 'rtc' && room) {
      // relay WebRTC set-up messages, but only between two real players on the same team
      const target = typeof msg.to === 'string' ? room.clients.get(msg.to) : undefined;
      const a = room.sim.humanTeam(id), b = typeof msg.to === 'string' ? room.sim.humanTeam(msg.to) : undefined;
      if (target && a && a === b) send(target, { type: 'rtc', from: id, data: msg.data });
    } else if (msg.type === 'buy' && room) {
      room.sim.buy(id, Number(msg.item));
    }
  }

  ws.on('close', () => {
    if (!room) return;
    if (room.voice.delete(id)) for (const [otherId, otherWs] of room.clients) if (otherId !== id) send(otherWs, { type: 'voice', from: id, ready: false });
    heartbeat.delete(ws); staleCheck.delete(ws);
    room.sim.removePlayer(id);
    room.clients.delete(id);
    if (room.clients.size === 0) rooms.delete(room.code);
    else room.sim.fillBots(TEAM_SIZE);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    try {
      room.sim.step(1 / TICK_RATE);
      const snap = { type: 'snap', snap: room.sim.snapshot() } as const;
      for (const ws of room.clients.values()) send(ws, snap);
    } catch (e) { console.error('room', room.code, 'step failed', e); }
  }
  for (const f of staleCheck.values()) f();
}, 1000 / TICK_RATE);
setInterval(() => { for (const f of heartbeat.values()) f(); }, 15000);

console.log(`Fight server listening on ws://localhost:${PORT}`);

import { WebSocketServer, WebSocket } from 'ws';
import { Sim, TICK_RATE, TEAM_SIZE, PROTOCOL_VERSION, type ClientMsg, type ServerMsg, type SimOptions, type GameMode, type WeaponSet, type PickMode } from '@fight/shared';

const portArg = process.argv.find((a) => a.startsWith('--port='))?.slice(7);
const PORT = Number(portArg ?? process.env.PORT ?? 8080);   // dev 8080, test environment 8081 (--port=8081)
const MAX_PER_ROOM = 6; // matches 2 teams of TEAM_SIZE; bots are replaced as humans join
// ---- protection for a public server ----
const MAX_ROOMS = 60;                 // games running at once on this server
const MAX_PER_IP = 8;                 // connections from one address
const MAX_MSGS_PER_SEC = 250;         // normal play sends about 35 per second (inputs + pings); far more than this is a flood
// Which websites may open a connection (set ALLOWED_ORIGINS="https://a.example,http://localhost:5173" on a public server; unset = anyone, for local play).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const perIp = new Map<string, number>();

interface Room { code: string; sim: Sim; clients: Map<string, WebSocket>; voice: Set<string> }
const rooms = new Map<string, Room>();
const heartbeat = new Map<WebSocket, () => void>();   // drops dead connections (a closed laptop / phone) so ghost players leave
const staleCheck = new Map<WebSocket, () => void>();

function getRoom(code: string, mapId?: string, rules: Partial<SimOptions> = {}): Room {
  let r = rooms.get(code);
  if (!r) { r = { code, sim: new Sim({ rounds: true, map: mapId, ...rules }), clients: new Map(), voice: new Set() }; rooms.set(code, r); } // the first player picks the room's map
  return r;
}

const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

const wss = new WebSocketServer({
  port: PORT,
  maxPayload: 8 * 1024,                // game messages are tiny: refuse anything big
  // The game state is JSON full of repeated words, so compressing every message (a standard WebSocket feature, every browser supports it)
  // makes each player download several times less. Level 1 and no shared memory between messages keep the server's cost low.
  perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 1 }, serverNoContextTakeover: true, clientNoContextTakeover: true, concurrencyLimit: 8 },
});
// A bad message or a bug must never take the whole server (and everybody's game) down.
process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));
let nextId = 1;

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length && (!origin || !ALLOWED_ORIGINS.includes(origin))) { ws.close(1008, 'origin not allowed'); return; }
  const fwd = req.headers['fly-client-ip'] ?? String(req.headers['x-forwarded-for'] ?? '').split(',')[0];
  const ip = String(fwd || req.socket.remoteAddress || '?').trim();
  const open = perIp.get(ip) ?? 0;
  if (open >= MAX_PER_IP) { ws.close(1013, 'too many connections'); return; }
  perIp.set(ip, open + 1);
  ws.on('close', () => { const n = (perIp.get(ip) ?? 1) - 1; if (n <= 0) perIp.delete(ip); else perIp.set(ip, n); });
  let room: Room | null = null;
  const id = `p${nextId++}`;
  let winStart = Date.now(), winCount = 0;
  let alive = true, lastInput = Date.now();
  ws.on('pong', () => { alive = true; });
  heartbeat.set(ws, () => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); });
  ws.on('error', () => undefined);

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - winStart >= 1000) { winStart = now; winCount = 0; }
    if (++winCount > MAX_MSGS_PER_SEC) { ws.terminate(); return; }          // a flood: drop this connection
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
      if (msg.ver !== undefined && Number(msg.ver) !== PROTOCOL_VERSION) {            // an out-of-date (or too new) page: tell it to reload instead of playing a broken game
        send(ws, { type: 'outdated', server: PROTOCOL_VERSION });
        setTimeout(() => ws.close(4001, 'outdated'), 300);
        return;
      }
      const style: GameMode = (['tdm', 'rescue', 'collect', 'point', 'flag', 'vip'] as string[]).includes(String(msg.style)) ? (msg.style as GameMode) : 'bomb';
      const wset: WeaponSet = (['all', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'random'] as WeaponSet[]).includes(msg.wset as WeaponSet) ? msg.wset as WeaponSet : 'all';
      const pick: PickMode = msg.pick === 'auto' ? 'auto' : 'manual';
      // the public room is per game style, so people who want different rules never end up in the same game
      const code = String(msg.room || `public-${style}-${wset}-${pick}`).slice(0, 28).replace(/[^\w-]/g, '') || 'public';
      if (!rooms.has(code) && rooms.size >= MAX_ROOMS) { ws.close(1013, 'server busy'); return; }
      const r = getRoom(code, msg.map, { mode: style, weaponSet: wset, pick });
      if (r.clients.size >= MAX_PER_ROOM) { ws.close(1013, 'room full'); return; }
      room = r;
      r.clients.set(id, ws);
      r.sim.join(id, String(msg.name || 'Player').slice(0, 14), Number(msg.skin) || 0, Number(msg.sidearm) || 0, msg.team === 'CT' || msg.team === 'T' ? msg.team : 'auto', msg.cu && typeof msg.cu === 'object' ? msg.cu : {});
      r.sim.fillBots(TEAM_SIZE);
      send(ws, { type: 'welcome', id, room: code, map: r.sim.map.id, mode: r.sim.mode });
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

// When the server is about to stop (a new version is being deployed), tell everybody first so the game can say so instead of just freezing.
let stopping = false;
function shutdown(why: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${why}: telling the players, then stopping`);
  for (const r of rooms.values()) for (const ws of r.clients.values()) send(ws, { type: 'notice', text: 'The server is updating. Back in a moment...', restart: true });
  setTimeout(() => process.exit(0), 2500);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log(`Fight server listening on ws://localhost:${PORT} (protocol ${PROTOCOL_VERSION})`);

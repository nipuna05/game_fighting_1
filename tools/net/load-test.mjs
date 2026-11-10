// Does the server keep up with several players? Opens N players in 2 rooms, then measures the time between snapshots for one of them.
// usage: node tools/net/load-test.mjs ws://localhost:8080 [players, max 8 per address] [seconds]
import { WebSocket } from 'ws';
const url = process.argv[2] || 'ws://localhost:8080', n = Math.min(8, Number(process.argv[3] || 8)), secs = Number(process.argv[4] || 12);
const opts = process.env.ORIGIN ? { headers: { Origin: process.env.ORIGIN } } : {};
const sockets = [], gaps = []; let last = 0, snaps = 0;
for (let i = 0; i < n; i++) {
  const ws = new WebSocket(url, opts); sockets.push(ws);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'join', ver: 1, name: 'Load' + i, room: 'load-' + (i % 2) + '-' + Date.now(), skin: 0, sidearm: 0, team: 'auto', map: 'town', style: 'tdm', wset: 'rifle', pick: 'auto', cu: {} }));
    setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', input: { mx: Math.sin(Date.now() / 700 + i), my: Math.cos(Date.now() / 900 + i), angle: Date.now() / 500, fire: i % 3 === 0 } })); }, 33);   // everybody runs around and some shoot
  });
  if (i === 0) ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.type !== 'snap') return; const now = Date.now(); if (last) gaps.push(now - last); last = now; snaps++; });
}
setTimeout(() => {
  const q = (f) => { const b = [...gaps].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * f))] ?? 0; };
  const wire = sockets[0]._socket ? sockets[0]._socket.bytesRead : 0;
  console.log(`${n} players in 2 rooms for ${secs}s: snapshots every median ${q(0.5)} ms, 95% under ${q(0.95)} ms, worst ${Math.max(0, ...gaps)} ms (target 33). One player received ${(wire / secs / 1024).toFixed(0)} KB/s.`);
  process.exit(0);
}, secs * 1000);

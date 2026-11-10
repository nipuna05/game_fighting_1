// How much data does the server send each player? usage: node tools/net/bandwidth.mjs ws://localhost:8080 [style] [seconds]
// (ORIGIN=https://nipuna05.github.io for a public server)
import { WebSocket } from 'ws';
const url = process.argv[2] || 'ws://localhost:8080', style = process.argv[3] || 'bomb', secs = Number(process.argv[4] || 20);
const ws = new WebSocket(url, process.env.ORIGIN ? { headers: { Origin: process.env.ORIGIN } } : {});
let bytes = 0, snaps = 0, max = 0; const parts = new Map(); const gaps = []; let last = 0; const rtts = [];
ws.on('open', () => ws.send(JSON.stringify({ type: 'join', ver: 1, name: 'Bandwidth', room: 'bw-' + Date.now(), skin: 0, sidearm: 0, team: 'auto', map: 'town', style, wset: 'rifle', pick: 'auto', cu: {} })));
setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); }, 1000);
ws.on('message', (d) => {
  const raw = String(d); bytes += raw.length;
  const m = JSON.parse(raw);
  if (m.type === 'pong') { rtts.push(Date.now() - m.t); return; }
  if (m.type !== 'snap') return;
  const now = Date.now(); if (last) gaps.push(now - last); last = now;
  snaps++; max = Math.max(max, raw.length);
  for (const [k, v] of Object.entries(m.snap)) parts.set(k, (parts.get(k) ?? 0) + JSON.stringify(v).length);
  if (m.snap.round) for (const [k, v] of Object.entries(m.snap.round)) parts.set('round.' + k, (parts.get('round.' + k) ?? 0) + JSON.stringify(v).length);
});
setTimeout(() => {
  console.log(`${style}: ${snaps} snapshots in ${secs}s (${(snaps / secs).toFixed(1)}/s), average ${Math.round(bytes / Math.max(1, snaps))} bytes each, biggest ${max}`);
  console.log(`=> ${(bytes / secs / 1024).toFixed(0)} KB/s to this one player (${((bytes * 8) / secs / 1e6).toFixed(2)} Mbit/s)`);
  const wire = ws._socket ? ws._socket.bytesRead : 0;   // what really crossed the network (after compression, with WebSocket framing)
  console.log(`=> on the wire: ${(wire / secs / 1024).toFixed(0)} KB/s (${(100 * wire / Math.max(1, bytes)).toFixed(0)}% of the text size)  [extensions: ${ws.extensions || 'none'}]`);
  const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * f))] : 0; };
  console.log(`time between snapshots: median ${q(gaps, 0.5)} ms, 95% under ${q(gaps, 0.95)} ms, worst ${Math.max(0, ...gaps)} ms  (the game sends one every ${Math.round(1000 / 30)} ms)`);
  console.log(`round trip to the server: median ${q(rtts, 0.5)} ms, worst ${Math.max(0, ...rtts)} ms`);
  const top = [...parts].filter(([k]) => !k.startsWith('round.') || true).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('biggest parts (average bytes per snapshot):', top.map(([k, v]) => `${k} ${Math.round(v / Math.max(1, snaps))}`).join(' | '));
  process.exit(0);
}, secs * 1000);

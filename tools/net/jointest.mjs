import { WebSocket } from 'ws';
const url = process.argv[2];
// usage: node tools/net/jointest.mjs wss://game-fighting-1.fly.dev   (a public server only accepts known websites: ORIGIN=https://nipuna05.github.io node ...)
const ws = new WebSocket(url, process.env.ORIGIN ? { headers: { Origin: process.env.ORIGIN } } : {});
let types = new Set(), players = 0;
const t0 = Date.now();
ws.on('open', () => { console.log('connected in', Date.now() - t0, 'ms'); ws.send(JSON.stringify({ type: 'join', name: 'TunnelTest', room: 'tunnel-check', skin: 0, sidearm: 0, team: 'auto', map: 'town', style: 'tdm', wset: 'rifle', pick: 'auto', cu: {} })); });
ws.on('message', (d) => { const m = JSON.parse(String(d)); types.add(m.type); if (m.type === 'snap' || m.snap) players = (m.snap?.players ?? m.players ?? []).length || players; });
ws.on('error', (e) => console.log('error', e.message));
setTimeout(() => { console.log('message types received:', [...types].join(', '), '| players in snapshot:', players); ws.close(); process.exit(0); }, 6000);

import { WebSocket } from 'ws';
const URL = 'ws://localhost:8098';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const join = { type: 'join', ver: 1, name: 'T', room: 'limits', skin: 0, sidearm: 0, team: 'auto', map: 'town', style: 'tdm', wset: 'rifle', pick: 'auto', cu: {} };
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
function conn(origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL, origin ? { headers: { Origin: origin } } : {});
    const r = { ws, types: [], code: null, open: false };
    ws.on('open', () => { r.open = true; ws.send(JSON.stringify(join)); });
    ws.on('message', (d) => { const t = JSON.parse(String(d)).type; if (!r.types.includes(t)) r.types.push(t); });
    ws.on('close', (c) => { r.code = c; }); ws.on('error', () => undefined);
    setTimeout(() => resolve(r), 1200);
  });
}
// 1) origin rules
const none = await conn(null); ok('a connection with no website origin is refused (1008)', none.code === 1008);
const evil = await conn('https://evil.example'); ok('a different website is refused (1008)', evil.code === 1008);
const good = await conn('https://nipuna05.github.io'); ok('the GitHub page is allowed (gets a game)', good.types.includes('welcome'));
// 2) per-address limit: 8 open connections allowed, the 9th refused
const many = [good]; for (let i = 0; i < 8; i++) many.push(await conn('https://nipuna05.github.io'));
const refused = many.filter((c) => c.code === 1013).length;
ok(`more than 8 connections from one address are refused (refused: ${refused})`, refused >= 1);
for (const c of many) c.ws.close(); await sleep(500);
// 3) a message flood is cut off
const flood = await conn('https://nipuna05.github.io');
for (let i = 0; i < 600; i++) flood.ws.send(JSON.stringify({ type: 'ping', t: i }));
await sleep(1200);
ok('a flood of 600 messages in a moment gets the connection dropped', flood.code !== null && flood.ws.readyState !== 1);
// 4) normal play is NOT affected: 35 messages a second for 3 seconds
const normal = await conn('https://nipuna05.github.io');
for (let s = 0; s < 3; s++) { for (let i = 0; i < 35; i++) normal.ws.send(JSON.stringify({ type: 'input', input: { mx: 0, my: 0, angle: 0, fire: false } })); await sleep(1000); }
ok('normal play traffic (35 messages per second) is not touched', normal.ws.readyState === 1);
process.exit(0);

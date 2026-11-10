import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2];                       // where the jpg files go
const maps = (process.argv[3] || 'town,dock,desert,village,outpost,jungle,arctic,canyon').split(',');
const ZOOM = process.argv[4] || '2.4';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const map of maps) {
  const r0 = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' });
  const tabId = (await r0.json());
  const ws = new WebSocket(tabId.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 520, height: 390, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://localhost:5173/?mode=single&map=${map}&god=1&noadapt=1&debug=1&style=range&view=top&zoom=${ZOOM}` });
  for (let i = 0; i < 120; i++) { if (await ev('Boolean(window.__game && window.__game.me && window.__game.me())')) break; await sleep(500); }
  for (let i = 0; i < 80; i++) { if ((await ev('window.__game.snap.round.phase')) === 'live') break; await sleep(400); }
  // a clean picture: no HUD, no other soldiers, me standing in a free spot near the middle, daytime shadows settled
  await ev(`(() => { const st = document.createElement('style'); st.textContent = 'body > *:not(:has(canvas)):not(canvas) { display: none !important } body > :has(canvas) > *:not(canvas) { display: none !important }'; document.head.appendChild(st);
    const g = window.__game, s = g.sim, me = s.players.get(g.myId);
    s.players.forEach((p) => { if (p !== me) { p.alive = false; p.respawnAt = 1e9; p.x = -999; p.y = -999; } });
    const spot = s.freeSpot(s.map ? 1200 : 1200, 900, 70, true, true); me.x = spot.x; me.y = spot.y + 60; me.protect = 1e9; g.pred = null; })()`);
  await sleep(6000);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
  writeFileSync(`${OUT}/${map}.jpg`, Buffer.from(shot.result.data, 'base64'));
  console.log(map, 'saved', Math.round(shot.result.data.length * 0.75 / 1024), 'KB', errs.length ? 'errors ' + JSON.stringify(errs.slice(0, 2)) : '');
  ws.close();
  await fetch(`http://127.0.0.1:9223/json/close/${tabId.id}`).catch(() => undefined);
}
process.exit(0);

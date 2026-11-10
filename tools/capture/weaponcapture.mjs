import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2], REAL = process.argv[3] === '1';
const ids = (process.argv[4] || 'usp,deagle,glock,mp5,p90,spas12,striker,ak47,m4a1,l118a,m60e4,barrett,vector,aug,scar,svd,m870,rpk,awm').split(',');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r0 = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' });
const tab = await r0.json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.once('open', r));
let id = 0; const pend = new Map(); const errs = [];
ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 240, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const w of ids) {
  await send('Page.navigate', { url: `http://localhost:5173/weaponshot.html?w=${w}&real=${REAL ? 1 : 0}` });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { await sleep(400); ready = await ev('window.__ready === true'); }
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(`${OUT}/${w}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(w, ready ? 'ok' : 'NOT READY', Math.round(shot.result.data.length * 0.75 / 1024) + ' KB');
}
if (errs.length) console.log('errors', JSON.stringify(errs.slice(0, 3)));
await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`).catch(() => undefined);
process.exit(0);

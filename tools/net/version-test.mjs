import { WebSocket } from 'ws';
const url = process.argv[2];
async function tryJoin(label, extra) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url); const types = []; let code = null;
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name: 'VerTest', room: 'ver-' + label, skin: 0, sidearm: 0, team: 'auto', map: 'town', style: 'tdm', wset: 'rifle', pick: 'auto', cu: {}, ...extra })));
    ws.on('message', (d) => { const m = JSON.parse(String(d)); if (!types.includes(m.type)) types.push(m.type); });
    ws.on('close', (c) => { code = c; });
    setTimeout(() => { console.log(label.padEnd(22), 'messages:', types.join(','), '| closed with', code); ws.close(); resolve(); }, 2000);
  });
}
await tryJoin('matching version', { ver: 1 });
await tryJoin('no version (old page)', {});
await tryJoin('wrong version', { ver: 99 });
process.exit(0);

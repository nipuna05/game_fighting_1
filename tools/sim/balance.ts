import { Sim, TEAM_SIZE, WEAPONS } from '../../shared/src/sim.ts';
const maps = (process.argv[2] || 'town,dock,desert,village,outpost,jungle,arctic,canyon').split(',');
const games = Number(process.argv[3] || 6);
type Acc = { kills: number; deaths: number; secs: number };
const acc = new Map<number, Acc>();
const get = (w: number) => { let a = acc.get(w); if (!a) { a = { kills: 0, deaths: 0, secs: 0 }; acc.set(w, a); } return a; };
let total = 0, tWins = 0, ctWins = 0;
for (const map of maps) for (let g = 0; g < games; g++) {
  const sim: any = new Sim({ map, mode: 'tdm', rounds: true, weaponSet: 'random', pick: 'auto' } as any);
  sim.fillBots(TEAM_SIZE * 2);
  const seenKills = new Set<number>();
  const last = new Map<string, number>();            // the weapon each player held at the last look
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 330; i++) {
    sim.step(dt);
    if (i % 3) continue;                              // look every 0.1 s
    const snap = sim.snapshot();
    for (const p of snap.players) { if (p.alive) { get(p.weapon).secs += 0.1; last.set(p.id, p.weapon); } }
    for (const k of snap.kills) {
      if (seenKills.has(k.id)) continue; seenKills.add(k.id);
      if (k.weapon < WEAPONS.length) get(k.weapon).kills++;
      const vw = last.get(k.victim); if (vw !== undefined) get(vw).deaths++;
    }
    if (snap.round?.phase === 'over') { if (snap.round.winner === 'T') tWins++; else ctWins++; break; }
  }
  total++;
}
console.log(`games ${total}: Raiders ${tWins}, Sentinels ${ctWins}`);
const rows = [...acc.entries()].filter(([w]) => WEAPONS[w].slot === 'primary').map(([w, a]) => ({ id: WEAPONS[w].id, cat: WEAPONS[w].cat, cost: WEAPONS[w].cost, kills: a.kills, deaths: a.deaths, kd: a.deaths ? +(a.kills / a.deaths).toFixed(2) : 99, kpm: +(a.kills / (a.secs / 60)).toFixed(2), mins: +(a.secs / 60).toFixed(1) }));
rows.sort((x, y) => y.kd - x.kd);
console.log('weapon   cat      cost  kills deaths  K/D  kills/min  minutes');
for (const r of rows) console.log(`${r.id.padEnd(8)} ${r.cat.padEnd(8)} ${String(r.cost).padStart(5)} ${String(r.kills).padStart(5)} ${String(r.deaths).padStart(6)} ${String(r.kd).padStart(5)} ${String(r.kpm).padStart(9)} ${String(r.mins).padStart(8)}`);

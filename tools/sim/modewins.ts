import { Sim, TEAM_SIZE } from '../../shared/src/sim.ts';
const mode = process.argv[2] as any, maps = (process.argv[3] || 'town,dock,desert,village').split(','), games = Number(process.argv[4] || 8);
let t = 0, ct = 0; const reasons: Record<string, number> = {};
for (const map of maps) for (let g = 0; g < games; g++) {
  const sim: any = new Sim({ map, mode, rounds: true, weaponSet: 'rifle', pick: 'auto' } as any);
  sim.fillBots(TEAM_SIZE * 2);
  for (let i = 0; i < 30 * 480; i++) { sim.step(1 / 30); const r = sim.snapshot().round; if (r?.phase === 'over') { if (r.winner === 'T') t++; else ct++; const k = (r.reason as string).replace(/\d+/g, 'N'); reasons[k] = (reasons[k] ?? 0) + 1; break; } }
}
console.log(mode, `Raiders ${t} / Sentinels ${ct}`, JSON.stringify(reasons));

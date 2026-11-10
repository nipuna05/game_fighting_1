import { Sim, TEAM_SIZE } from '../../shared/src/sim.ts';
import { MAPS } from '../../shared/src/maps.ts';
const ids = process.argv.slice(2);
for (const id of ids) {
  const m = MAPS[id];
  console.log(`== ${id}: buildings ${m.buildings?.length ?? 0}, sites ${m.sites.map((s) => s.id + (s.lv ? '^' : '')).join(',')}, walls ${m.walls.length}, supply ${m.supply?.length}`);
  for (const mode of ['bomb', 'tdm', 'rescue', 'collect'] as const) {
    const sim: any = new Sim({ map: id, mode, rounds: true, weaponSet: 'rifle', pick: 'auto' } as any);
    sim.fillBots(TEAM_SIZE * 2);
    let steps = 0, err = '';
    try { for (; steps < 30 * 420; steps++) { sim.step(1 / 30); if (sim.snapshot().round?.phase === 'over') break; } } catch (e) { err = String(e).slice(0, 160); }
    const r = sim.snapshot().round;
    const alive = sim.snapshot().players.filter((p: any) => p.alive).length;
    console.log(`  ${mode}: phase ${r?.phase} winner ${r?.winner} reason "${r?.reason}" after ${Math.round(steps / 30)}s, alive ${alive}${err ? ' ERROR ' + err : ''}`);
  }
}

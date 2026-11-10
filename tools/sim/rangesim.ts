import { Sim, WEAPONS } from '../../shared/src/sim.ts';
import { MAPS } from '../../shared/src/maps.ts';
for (const map of Object.keys(MAPS)) {
  const sim: any = new Sim({ rounds: true, map, mode: 'range', weaponSet: 'all', pick: 'manual' } as any);
  sim.join('me', 'Me', 0, 0, 'CT', {});
  sim.addDummies();
  for (let i = 0; i < 30 * 4; i++) sim.step(1 / 30);            // buy phase (2 s) passes, the game is live
  const me = sim.players.get('me'), dummies = [...sim.players.values()].filter((p: any) => p.dummy);
  const phase = sim.snapshot().round.phase;
  // dummies must be on free ground
  const stuck = dummies.filter((d: any) => sim.map.walls.some((w: any) => d.x > w.x - 12 && d.x < w.x + w.w + 12 && d.y > w.y - 12 && d.y < w.y + w.h + 12)).length;
  // shoot the nearest dummy with an M4A1 (picked instantly)
  sim.pickWeapon('me', WEAPONS.findIndex((w: any) => w.id === 'm4a1'));
  const target = dummies.sort((a: any, b: any) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  let killedAt = -1, backAt = -1;
  for (let i = 0; i < 30 * 8; i++) {
    me.x = target.dummy.x + 150; me.y = target.dummy.y; me.protect = 99999;
    sim.setInput('me', { mx: 0, my: 0, angle: Math.PI, fire: true });
    sim.step(1 / 30);
    if (killedAt < 0 && !target.alive) killedAt = i / 30;
    if (killedAt >= 0 && backAt < 0 && target.alive) backAt = i / 30;
  }
  const dmgToMe = 100 - me.hp, over = sim.snapshot().round.phase === 'over';
  console.log(map.padEnd(8), 'phase', phase, '| dummies', dummies.length, 'in walls', stuck, '| killed after', killedAt.toFixed(1), 's, back after', backAt.toFixed(1), 's | damage to me', dmgToMe, '| game over', over, '| my score', me.score);
}

// Landing page background: the real game map at golden hour with posed soldiers, a slow camera sweep and drifting dust.
import * as THREE from 'three';
import { MAP_SCALE } from '@fight/shared';
import { getMap, WEAPONS } from '@fight/shared';
import { buildWorld, makeWeaponModel } from './world';
import { template, makeModelCharacter, makeCharacter, applyArmIK, type Character } from './characters';

export interface Landing {
  setMap(id: string): void;
  setSkin(i: number): void;
  setPrimary(weapon: number | null): void;
  stop(): void;
}

interface Initial { map: string; skin: number; primary: number | null }

const STAGE = new THREE.Vector3(660 * MAP_SCALE, 0, 760 * MAP_SCALE); // an open patch of ground on all three maps
const AK47 = WEAPONS.findIndex((w) => w.id === 'ak47');
const M4A1 = WEAPONS.findIndex((w) => w.id === 'm4a1');
const MP5 = WEAPONS.findIndex((w) => w.id === 'mp5');

export function startLanding(host: HTMLElement, initial: Initial): Landing {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(42, 1, 5, 4000);
  const resize = () => {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const scene = new THREE.Scene();
  let heroes: Character[] = [];
  let dust: THREE.Points | null = null;
  let mapId = initial.map, skin = initial.skin, primary = initial.primary;

  let heroGroup: THREE.Group | null = null;
  function buildHeroes() {
    if (heroGroup) scene.remove(heroGroup);
    heroGroup = new THREE.Group();
    heroes = [];
    scene.add(heroGroup);

    // three soldiers in a V formation, facing the camera (+z), holding different rifles
    const crew = [
      { x: 0, z: 0, skin, gun: primary ?? AK47, yaw: 0 },
      { x: -40, z: -26, skin: (skin + 1) % 4, gun: M4A1, yaw: 0.12 },
      { x: 40, z: -26, skin: (skin + 2) % 4, gun: MP5, yaw: -0.12 },
    ];
    crew.forEach((m, i) => {
      const color = i === 0 ? 0xffb15e : 0x7db4ff;
      const c = template ? makeModelCharacter(m.skin, color) : makeCharacter(color);
      c.root.position.set(STAGE.x + m.x, 0, STAGE.z + m.z);
      c.root.rotation.y = -0.55 + m.yaw;              // three-quarter view: facing right (toward the menu), a little toward the camera
      c.gunHolder.add(makeWeaponModel(m.gun));
      c.idle?.setEffectiveWeight(1); c.run?.setEffectiveWeight(0);
      c.mixer?.update(i * 0.37);                       // desynchronise their idle loops
      heroGroup!.add(c.root);
      heroes.push(c);
    });
  }

  function build() {
    scene.clear();
    buildWorld(scene, getMap(mapId));
    scene.traverse((o) => { if (o.userData.lamp && Math.hypot(o.position.x - STAGE.x, o.position.z - STAGE.z) < 450) o.visible = false; }); // keep lamp posts out of the camera's way
    buildHeroes();

    // drifting dust in the light
    const N = 280, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = STAGE.x + (Math.random() - 0.5) * 420; pos[i * 3 + 1] = Math.random() * 130; pos[i * 3 + 2] = STAGE.z + (Math.random() - 0.5) * 420; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe2b0, size: 1.8, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(dust);
  }
  build();

  let raf = 0, last = performance.now(), t = 0, stopped = false;
  const target = new THREE.Vector3();
  const frame = () => {
    if (stopped) return;
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
    last = now; t += dt;

    // slow cinematic sweep in front of the soldiers; the target is shifted right so they sit left of the menu panel
    const phi = 0.4 * Math.sin(t * 0.12), R = 235 + 14 * Math.sin(t * 0.2), h = 64 + 8 * Math.sin(t * 0.17);
    camera.position.set(STAGE.x + Math.sin(phi) * R, h, STAGE.z + Math.cos(phi) * R);
    const wide = camera.aspect > 1.1;
    target.set(STAGE.x + (wide ? 78 : 0) * Math.cos(phi), 30, STAGE.z - (wide ? 78 : 0) * Math.sin(phi));
    camera.lookAt(target);

    for (const c of heroes) { c.mixer?.update(dt); applyArmIK(c); }
    if (dust) {
      const a = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        a.setY(i, (a.getY(i) + dt * (6 + (i % 5))) % 130);
        a.setX(i, a.getX(i) + Math.sin(t * 0.5 + i) * dt * 4);
      }
      a.needsUpdate = true;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setMap(id) { if (id !== mapId) { mapId = id; build(); } },
    setSkin(i) { if (i !== skin) { skin = i; buildHeroes(); } },
    setPrimary(w) { if (w !== primary) { primary = w; buildHeroes(); } },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

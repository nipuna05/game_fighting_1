// Dev tool (/coleprep.html): makes web-sized files from the Soldier Cole pack.
//   window.__glb   = compact character GLB (base64): 1024px JPEG colour + normal map
//   window.__anims = JSON of the animation clips (idle, walk, run, death, jump)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const base = '/models/cole/';
const w = window as unknown as { __glb?: string; __anims?: string; __info?: string; __done?: boolean; __error?: string };
const MAX = 1024;

type Img = HTMLImageElement | ImageBitmap | HTMLCanvasElement;
function shrink(t: THREE.Texture, srgb: boolean): THREE.Texture {
  const img = t.image as Img;
  const sw = (img as HTMLImageElement).naturalWidth || img.width, sh = (img as HTMLImageElement).naturalHeight || img.height;
  const k = Math.min(1, MAX / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  const nt = new THREE.CanvasTexture(c);
  nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
  nt.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  nt.userData.mimeType = 'image/jpeg';
  return nt;
}

const round = (v: number) => Math.round(v * 10000) / 10000;

async function main() {
  const loader = new GLTFLoader();
  const info: string[] = [];

  // ---- character ----
  const gltf = await loader.loadAsync(base + 'raw_character.glb');
  const normal = await new THREE.TextureLoader().loadAsync(base + 'raw_normal.png');
  normal.flipY = false; // glTF convention
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const old = m.material as THREE.MeshStandardMaterial;
    m.material = new THREE.MeshStandardMaterial({
      name: old.name, map: old.map ? shrink(old.map, true) : undefined, normalMap: shrink(normal, false),
      roughness: 0.8, metalness: 0.1,
    });
    info.push(`mesh ${m.name}: colour ${old.map ? 'yes' : 'no'}`);
  });
  const buf = await new Promise<ArrayBuffer>((res, rej) => new GLTFExporter().parse(gltf.scene, (r) => res(r as ArrayBuffer), rej, { binary: true, onlyVisible: false }));
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  w.__glb = btoa(s);
  info.push(`character glb ${(bytes.length / 1048576).toFixed(2)} MB`);

  // ---- animations: each *_withSkin.glb carries one clip ----
  const files: [string, string][] = [
    ['idle', 'raw_anim_Idle_9.glb'], ['walk', 'raw_anim_Walking.glb'], ['run', 'raw_anim_Running.glb'],
    ['death', 'raw_anim_Shot_in_the_Back_and_Fall.glb'], ['jump', 'raw_anim_Jump_Over_Obstacle.glb'],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, f] of files) {
    const g = await loader.loadAsync(base + f);
    const clip = g.animations[0];
    if (!clip) { info.push(`${name}: NO CLIP`); continue; }
    clip.name = name;
    const j = THREE.AnimationClip.toJSON(clip) as { tracks: { values: number[]; times: number[] }[] };
    for (const t of j.tracks) { t.values = t.values.map(round); t.times = t.times.map((v) => Math.round(v * 1000) / 1000); }
    out[name] = j;
    info.push(`${name}: ${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks, e.g. ${clip.tracks.slice(0, 3).map((t) => t.name).join(' | ')}`);
  }
  w.__anims = JSON.stringify(out);
  info.push(`anims json ${(w.__anims.length / 1024).toFixed(0)} KB`);
  w.__info = info.join('\n');
  w.__done = true;
}
main().catch((e) => { w.__error = String(e?.stack ?? e); w.__done = true; });

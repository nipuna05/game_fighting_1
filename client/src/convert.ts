// Dev tool: converts a heavy FBX character into a compact GLB with downscaled JPEG textures.
// Open /convert.html?file=/models/mixamo/ch15.fbx&tex=1024 and read window.__glb (base64) when window.__done is true.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const q = new URLSearchParams(location.search);
const file = q.get('file') ?? '';
const maxTex = Number(q.get('tex') ?? 1024);
const out = document.getElementById('log')!;
const log = (t: string) => { out.textContent += '\n' + t; };
const w = window as unknown as { __glb?: string; __done?: boolean; __error?: string; __stats?: string };

type Img = HTMLImageElement | ImageBitmap | HTMLCanvasElement;
const shrink = (t: THREE.Texture | null | undefined, srgb: boolean, jpeg: boolean): THREE.Texture | undefined => {
  if (!t || !t.image) return undefined;
  const img = t.image as Img;
  const sw = (img as HTMLImageElement).naturalWidth || img.width, sh = (img as HTMLImageElement).naturalHeight || img.height;
  const k = Math.min(1, maxTex / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  const nt = new THREE.CanvasTexture(c);
  nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
  nt.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  nt.userData.mimeType = jpeg ? 'image/jpeg' : 'image/png';
  log(`  texture ${sw}x${sh} -> ${c.width}x${c.height}`);
  return nt;
};

/** FBX meshes often come with hundreds of tiny material groups. Reorder the triangles so each material is one group (one draw call). */
function mergeGroups(geo: THREE.BufferGeometry, nMats: number) {
  if (geo.groups.length <= nMats) return;
  const order = [...geo.groups].sort((a, b) => (a.materialIndex ?? 0) - (b.materialIndex ?? 0) || a.start - b.start);
  const total = order.reduce((n, g) => n + g.count, 0);
  if (geo.index) {
    const old = geo.index.array as ArrayLike<number>;
    const arr = new (geo.index.array.constructor as new (n: number) => Uint32Array)(total);
    let o = 0;
    for (const g of order) for (let i = 0; i < g.count; i++) arr[o++] = old[g.start + i];
    geo.setIndex(new THREE.BufferAttribute(arr, 1));
  } else {
    for (const [name, attr] of Object.entries(geo.attributes)) {
      const a = attr as THREE.BufferAttribute;
      const arr = new (a.array.constructor as new (n: number) => Float32Array)(total * a.itemSize);
      let o = 0;
      for (const g of order) { arr.set((a.array as Float32Array).subarray(g.start * a.itemSize, (g.start + g.count) * a.itemSize), o); o += g.count * a.itemSize; }
      geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
  }
  geo.clearGroups();
  let start = 0;
  for (let mi = 0; mi < nMats; mi++) {
    const cnt = order.filter((g) => g.materialIndex === mi).reduce((n, g) => n + g.count, 0);
    if (cnt) { geo.addGroup(start, cnt, mi); start += cnt; }
  }
  log(`  merged material groups -> ${geo.groups.length}`);
}

async function main() {
  const t0 = performance.now();
  const obj = await new FBXLoader().loadAsync(file);
  log(`parsed ${file} in ${(performance.now() - t0).toFixed(0)} ms`);

  // FBX textures decode asynchronously: wait until every image is ready
  const textures = new Set<THREE.Texture>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(m.material)) for (const v of Object.values(mat as unknown as Record<string, unknown>)) { const t = v as THREE.Texture; if (t && t.isTexture) textures.add(t); }
  });
  const t1 = performance.now();
  while (performance.now() - t1 < 30000) {
    const ready = [...textures].every((t) => t.image && ((t.image as HTMLImageElement).complete !== false) && ((t.image as Img).width > 0));
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  log(`textures found: ${textures.size}`);

  // rebuild each material as a light-weight standard material: colour map + normal map only
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = ([] as THREE.Material[]).concat(m.material).map((old) => {
      const p = old as THREE.MeshPhongMaterial;
      log(`material "${old.name}": map=${!!p.map} normal=${!!p.normalMap} specular=${!!p.specularMap}`);
      return new THREE.MeshStandardMaterial({
        name: old.name, map: shrink(p.map, true, true), normalMap: shrink(p.normalMap, false, true),
        roughness: 0.85, metalness: 0.05, color: p.map ? 0xffffff : p.color,
      });
    });
    m.material = Array.isArray(m.material) ? mats : mats[0];
    mergeGroups(m.geometry, mats.length);
    m.castShadow = true;
  });

  const buf = await new Promise<ArrayBuffer>((resolve, reject) =>
    new GLTFExporter().parse(obj, (r) => resolve(r as ArrayBuffer), reject, { binary: true, onlyVisible: false }));
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  w.__glb = btoa(s);
  w.__stats = `glb size ${(bytes.length / 1048576).toFixed(2)} MB`;
  log(w.__stats);
  w.__done = true;
}
main().catch((e) => { w.__error = String(e?.stack ?? e); log('ERROR: ' + w.__error); w.__done = true; });

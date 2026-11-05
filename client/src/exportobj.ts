// Dev tool: /exportobj.html?file=/models/characters/x.glb  -> window.__obj (OBJ text), window.__tex (PNG base64), window.__mat (material name)
// Used to build a zip that Mixamo's auto-rigger accepts (OBJ + MTL + texture).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

const q = new URLSearchParams(location.search);
const w = window as unknown as { __obj?: string; __tex?: string; __mat?: string; __done?: boolean; __error?: string; __info?: string };

async function main() {
  const gltf = await new GLTFLoader().loadAsync(q.get('file') ?? '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  let texture: THREE.Texture | null = null, matName = 'Material';
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    const mat = ([] as THREE.Material[]).concat(m.material)[0] as THREE.MeshStandardMaterial;
    if (mat?.map && !texture) { texture = mat.map; matName = (mat.name || 'Material').replace(/\s+/g, '_'); }
    if (mat) mat.name = matName;
  });

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  // stand the model on the ground at the origin, scaled to 180 cm tall, in centimetres
  const k = 180 / size.y;
  scene.scale.multiplyScalar(k);
  scene.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  scene.updateMatrixWorld(true);

  w.__obj = new OBJExporter().parse(scene);
  w.__mat = matName;
  if (texture) {
    const img = (texture as THREE.Texture).image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement('canvas');
    const scaleUp = Math.max(1, Math.round(512 / Math.max(img.width, img.height))); // upscale tiny palette textures with sharp pixels
    c.width = img.width * scaleUp; c.height = img.height * scaleUp;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, c.width, c.height);
    w.__tex = c.toDataURL('image/png').split(',')[1];
  }
  w.__info = `meshes ${meshes.length}, height ${size.y.toFixed(2)} -> 180, texture ${texture ? 'yes' : 'no'}, material ${matName}`;
  w.__done = true;
}
main().catch((e) => { w.__error = String(e?.stack ?? e); w.__done = true; });

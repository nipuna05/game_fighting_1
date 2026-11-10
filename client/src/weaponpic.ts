import { asset } from './assets';

// Pictures of guns and soldier costumes. Two sets exist for each: renders of the downloaded realistic models (…/real/, only on this PC,
// not published) and renders of the built-in / free models (published). We check once which set is there and use ONE of them
// (the pictures are transparent, so stacking both would show both).
const real = { weapons: false, costumes: false };
const listeners: (() => void)[] = [];
/** Called when a real-model picture set turns out to exist, so the menus can draw themselves again. */
export const onArtReady = (f: () => void) => { listeners.push(f); };
const probe = (kind: 'weapons' | 'costumes', file: string) => {
  const im = new Image();
  im.onload = () => { real[kind] = true; listeners.forEach((f) => f()); };
  im.src = asset(`/${kind}/real/${file}`);
};
probe('weapons', 'ak47.png');
probe('costumes', '0.png');

export const weaponPicUrl = (id: string) => asset(real.weapons ? `/weapons/real/${id}.png` : `/weapons/${id}.png`);
export const costumePicUrl = (i: number) => asset(real.costumes ? `/costumes/real/${i}.png` : `/costumes/${i}.png`);
/** A picture of a gun. */
export const weaponPic = (id: string, cls = 'wpic') => `<div class="${cls}" style="background-image:url(${weaponPicUrl(id)})"></div>`;

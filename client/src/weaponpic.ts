import { asset } from './assets';

/** A picture of a gun: the render of the downloaded realistic model when it exists on this PC, otherwise the built-in model's render
 *  (the second background layer shows through when the first file is missing, e.g. on GitHub Pages). */
export const weaponPic = (id: string, cls = 'wpic') =>
  `<div class="${cls}" style="background-image:url(${asset(`/weapons/real/${id}.png`)}),url(${asset(`/weapons/${id}.png`)})"></div>`;

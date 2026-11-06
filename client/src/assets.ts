// Public files (models, sounds, credits) live under the site's base path: "/" in development, "/game_fighting_1/" on GitHub Pages.
export const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
/** True on a static host (GitHub Pages) where no game server is available, so multiplayer cannot work. */
export const staticHost = !import.meta.env.VITE_WS_URL && /\.github\.io$/.test(location.hostname);

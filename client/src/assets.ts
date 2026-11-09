// Public files (models, sounds, credits) live under the site's base path: "/" in development, "/game_fighting_1/" on GitHub Pages.
export const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
// ---------- the game server address ----------
// A static website (GitHub Pages) has no game server of its own. The multiplayer address can be typed in the menu or passed in the
// link (?server=wss://...) and is remembered in this browser, so the same site can use any server (a tunnel to a PC, or a cloud host).
const SERVER_KEY = 'fight.server';
/** Only secure wss:// addresses (or plain ws:// to this machine / a private network) are accepted. */
export const validServerUrl = (u: string) => /^wss:\/\/[A-Za-z0-9.-]+(:\d{2,5})?(\/[\w./-]*)?$/.test(u) || /^ws:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d{2,5})?$/.test(u);
export const setServerUrl = (u: string) => { try { if (u) localStorage.setItem(SERVER_KEY, u); else localStorage.removeItem(SERVER_KEY); } catch { /* storage blocked */ } };
const queryServer = new URLSearchParams(location.search).get('server');
if (queryServer && validServerUrl(queryServer)) setServerUrl(queryServer);
export const getServerUrl = (): string | undefined => {
  try { const v = localStorage.getItem(SERVER_KEY); if (v && validServerUrl(v)) return v; } catch { /* storage blocked */ }
  return import.meta.env.VITE_WS_URL;
};
/** True on a static host (GitHub Pages) where no game server address is set, so multiplayer cannot connect yet. */
export const isStaticHost = () => /\.github\.io$/.test(location.hostname) && !getServerUrl();

# Tools

Small scripts used to check the game. Run them from the repository root (`D:\my\project\Game\Fight`).

## Simulation checks (no browser needed): `npx tsx tools/sim/<file>.ts`
| Script | What it does |
|---|---|
| `regression.ts <map ...>` | plays all four classic missions with bots on the given maps and prints how each game ended (a quick "does everything still work" check) |
| `modewins.ts <mode> <maps,comma,separated> <games per map>` | win rate per team for one mission (`bomb`, `tdm`, `rescue`, `collect`, `point`, `flag`, `vip`) |
| `balance.ts <maps> <games>` | random-weapon deathmatches; prints kills / deaths per weapon (the weapon balance table) |
| `rangesim.ts` | checks the practice range on every map (targets on open ground, fall and stand up) |

## Server checks: `node tools/net/<file>.mjs`
| Script | What it does |
|---|---|
| `jointest.mjs <ws-url>` | joins a game server and prints what it sends (`ORIGIN=https://nipuna05.github.io` for a public server) |
| `version-test.mjs <ws-url>` | the version check: matching, missing and wrong versions |
| `protect-test.mjs` | the public-server protections (start a server with `ALLOWED_ORIGINS=https://nipuna05.github.io npx tsx server/src/index.ts --port=8098` first) |

## Picture capture (needs the dev client running and a headless Edge with `--remote-debugging-port=9223`)
These render the game's own 3D models and save pictures for the menus (see TODO.md for the full recipe):
`capture/mapcapture.mjs <out dir> <maps>`, `capture/weaponcapture.mjs <out dir> <0|1 real models> [ids]`, `capture/costumecapture.mjs <out dir> <0|1> [skins]`.

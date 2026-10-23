# IRONFRONT V15 | Tactical Arena

Free-to-play original low-poly tactical FPS for browsers. **Offline bots** and **dedicated-server multiplayer**. **Campaign remains COMING SOON.**

## Play
- Open [index.html](index.html) directly for offline mode.
- For hosted play, run `npm start` and visit http://localhost:8080.
- Host the dedicated Node.js server behind HTTPS/WSS for multiplayer. Online quick-match won't work from GitHub Pages alone.

## V15 visual changes
- More detailed original procedural 3D operators: faceted helmets, headset, visor, respirator, armor, rig, straps, gloves, kneepads and boots.
- Unique rifle, DMR and pistol meshes, plus optics and first-person animations.
- Distant LOD operators with substantially reduced polygon counts.
- Client respawn generation checks and server-authoritative damage/ammo/reload retained.

## Controls
WASD movement, Shift sprint, C crouch, Q/E lean, R reload, right mouse aim, left mouse fire, 1/2 change weapon, Tab scoreboard, F3 FPS, Esc pause.

## Develop / verify
```sh
node --check game/game.js
node --check server/server.js
npm test
```
Browser tests require Python Playwright and Chromium. Do not infer real Chromebook performance from software-rendered test environments.

## Architecture
`game/index.html`, `game/game.js`, `game/config.js`: distributable browser app. `index.html`: downloadable all-in-one offline app. `server/server.js`: zero-dependency Node.js WebSocket dedicated server. `server/Dockerfile`: container recipe.

The game-only package is the correct starting point for CrazyGames submissions; public multiplayer requires a separately deployed WSS endpoint. No licensed third-party 3D models are embedded. Not a final AAA model pipeline.

## Limitations
The visuals remain original procedural meshes, not skeletal GLB models. Public server is not deployed. QA still needed on real Chromebooks, browsers, connection drop/recovery, and real players.

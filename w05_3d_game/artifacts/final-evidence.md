# Soul Maze · S3D-M1-03 Verification Evidence

## Commands

```text
npm run build
```

Result: Vite production build passed after the final implementation changes.

```text
npm run dev -- --host 127.0.0.1
```

Result: Vite served `http://127.0.0.1:5173/`; the HTTP smoke request returned `STATUS=200`.

The smoke request also confirmed the served page/module contains Soul Maze, Pointer Lock, continuous collision, A* pathfinding, and fragment systems.

## Fixed-map check

```text
ROWS=32
LENGTHS_UNIQUE=1
WALKABLE=705
FRAGMENTS_REACHABLE=true
EXIT_REACHABLE=true
ENEMY_REACHABLE=true
```

## Implemented behavior

- First-person PerspectiveCamera and Pointer Lock mouse look
- WASD continuous floating-point movement
- Shift sprint with stamina drain/recovery
- Circle-vs-wall AABB collision and axis sliding
- Ten fragment collectibles with one-time collection
- Locked/unlocked exit and real exit-area win condition
- PATROL / CHASE / SEARCH / RETURN enemy state machine
- Distance + view cone + sampled wall line-of-sight detection
- A* route calculation on walkable map cells
- Enemy continuous movement and collision
- Web Audio collection, alert, result and ambient feedback
- Mute, pause, restart and safe Demo transitions

## Not executed

No Chrome, Edge, Chromium, or Firefox executable was available in the execution environment. Therefore the following remain untested in a real browser: Pointer Lock acquisition/release, mouse movement, WebGL canvas pixels, audio playback, full collection-to-exit progression, enemy encounter timing, and cross-refresh-rate feel.

No Git write operation was performed. The working directory and its parent were not Git repositories, so branch/HEAD/status could not be reported.

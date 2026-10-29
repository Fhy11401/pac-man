# Soul Maze · S3D-M1-03 Progress

## Intent
Deliver a single-level, local-only first-person maze survival prototype from the existing Three.js game.

## Constraints
- Preserve the existing Vite/JavaScript/Three.js stack and directory.
- Use a fixed 32×32 map, continuous floating-point movement, no external runtime services.
- Keep visual assets procedural and replaceable.

## Completed
- Fixed 32×32 wall-plan map with BFS key-point validation.
- Floating-point player movement with acceleration/deceleration, diagonal normalization, sprint stamina, and circle-vs-AABB wall collision with axis sliding.
- Perspective first-person camera, Pointer Lock, mouse pitch clamp, Escape pause/resume flow.
- Ten soul fragments, locked/unlocked exit, HUD progress and win/lose/restart states.
- Enemy PATROL / CHASE / SEARCH / RETURN state machine, view-angle + distance + sampled wall line-of-sight, A* grid routing, continuous enemy movement.
- Web Audio feedback, mute control, ambient loop, safe Demo mode and menu transitions.
- Build and HTTP smoke checks completed.

## Verification evidence
- `npm run build` passed after final code changes.
- Fixed-map check: 32 rows, one row length, 705 reachable cells, fragments/exit/enemy all reachable.
- Local dev server returned HTTP 200 and served Soul Maze, Pointer Lock, continuous collision, A* and fragment code.

## Remaining risks
- No real browser executable was available in this environment, so Pointer Lock, mouse, WebGL, audio, and full progression are not manually playtested.
- Enemy behavior is intentionally prototype-level and may need tuning after human play.

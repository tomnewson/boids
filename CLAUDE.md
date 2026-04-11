# Boids

An interactive web-based implementation of Craig Reynolds' boids flocking algorithm. Vanilla JS (no build step, no dependencies), deployed to Netlify as a static site.

## Stack
- HTML5 Canvas 2D for rendering
- Web Audio API for sound
- No runtime frameworks, no package manager
- Vitest + jsdom for testing (dev dependency only)

## Files
- `app.js` — UI init, slider/tool event binding
- `simulation.js` — main loop, update/draw, walls, food, spawning, population control
- `boid.js` — individual boid physics, steering forces, health, reproduction, drawing
- `audio.js` — Web Audio synthesis, pentatonic scale, death/birth sounds
- `index.html` — DOM structure
- `styles.css` — layout and UI styling
- `tests/boid.test.js` — unit tests for Boid class
- `tests/simulation.test.js` — unit tests for Simulation class

## How it works
Each boid applies three steering forces per frame: **separation** (avoid crowding), **alignment** (match neighbors' heading), **cohesion** (move toward neighbors' center of mass). Predators chase prey; prey flee predators.

The simulation runs on a fixed 16.6ms timestep (frame-rate independent). Boids have a health/energy system — they reproduce when healthy and die when energy runs out. Population is capped at 500 with a ~85%/15% prey/predator ratio enforced automatically.

Walls are drawn by the user and stored in a spatial grid for O(1) collision queries. They're rendered to a separate off-screen canvas and composited each frame to avoid redundant redraws.

## User controls
Toolbar modes: Wall, Eraser, Boid (spawn prey), Predator, Food — all work with mouse and touch.
Right panel sliders control separation, alignment, and cohesion weights.

## Testing

Run tests with `npm test` (or `npm run test:watch` for watch mode).

### What we test and why

Tests cover **pure logic only** — no rendering, no audio, no animation loop:

- **`boid.test.js`**: steering forces (`separation`, `alignment`, `cohesion`), health system (`updateHealth`, `checkReproduction`, `reproduce`), physics helpers (`applyForce`, `countNeighbors`, `edges`), predator/prey collision (`checkPreyCollision`).
- **`simulation.test.js`**: spatial wall index (`rebuildWallSpatialIndex`, `getWallPointsNearPosition`, `isPointNearWall`, `getWallNormal`), entity management (`spawnBoid`, `spawnFood`, `eraseBoids`, `eraseFood`, `clearWalls`), population cap (`applyPopulationControls`), parameter updates.

Drawing methods (`draw`, `drawWalls`) and the animation loop (`animate`) are **not tested** — they are thin wrappers over the Canvas 2D API and have no testable logic.

### How testability is maintained

**ES modules**: all source files export their classes/constants so tests can import them directly. `simulation.js` imports `Boid` and `AudioEngine` rather than relying on shared script scope.

**`Simulation` constructor vs `init()`**: the constructor accepts an `HTMLCanvasElement` and sets up pure state. All DOM side-effects (event listeners, canvas sizing, wall canvas creation, animation loop) live in `init()`, which `app.js` calls after construction. Tests construct `Simulation` without calling `init()`, so no `requestAnimationFrame` or event binding occurs.

**Mock canvas**: tests pass a plain object `{ logicalWidth, logicalHeight }` as the canvas to `Boid`, and a fuller stub (with `getContext` returning a mock ctx) to `Simulation`. No real Canvas API is needed.

**`AudioEngine` mock**: the entire `audio.js` module is mocked with `vi.mock` in simulation tests, preventing any Web Audio API calls.

### Guidelines for new tests

- **Always write unit tests alongside new logic.** Every new method or state change on `Simulation` or `Boid` that contains testable logic should have corresponding tests added in the same change.
- Test **behaviour** (what a method does), not implementation details (how it does it).
- For steering forces, assert **direction** (positive/negative x or y), not exact values — small floating-point changes from tuning should not break tests.
- New methods that touch `ctx` or `wallCtx` should be split: keep the calculation in a pure helper that returns data, and keep the `ctx` calls in a thin renderer method. Test the helper, skip the renderer.
- Do not add `requestAnimationFrame`, `document.createElement`, or Web Audio calls to the constructor — keep them in `init()` or dedicated methods so the constructor stays testable.
- New constructor properties should have a corresponding default-value test in the `Simulation constructor` or `Boid constructor` describe block.

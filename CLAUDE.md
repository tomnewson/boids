# Boids

An interactive web-based implementation of Craig Reynolds' boids flocking algorithm. Vanilla JS (no build step, no dependencies), deployed to Netlify as a static site.

## Stack
- HTML5 Canvas 2D for rendering
- Web Audio API for sound
- No frameworks, no package manager

## Files
- `app.js` — UI init, slider/tool event binding
- `simulation.js` — main loop, update/draw, walls, food, spawning, population control
- `boid.js` — individual boid physics, steering forces, health, reproduction, drawing
- `audio.js` — Web Audio synthesis, pentatonic scale, death/birth sounds
- `index.html` — DOM structure
- `styles.css` — layout and UI styling

## How it works
Each boid applies three steering forces per frame: **separation** (avoid crowding), **alignment** (match neighbors' heading), **cohesion** (move toward neighbors' center of mass). Predators chase prey; prey flee predators.

The simulation runs on a fixed 16.6ms timestep (frame-rate independent). Boids have a health/energy system — they reproduce when healthy and die when energy runs out. Population is capped at 500 with a ~85%/15% prey/predator ratio enforced automatically.

Walls are drawn by the user and stored in a spatial grid for O(1) collision queries. They're rendered to a separate off-screen canvas and composited each frame to avoid redundant redraws.

## User controls
Toolbar modes: Wall, Eraser, Boid (spawn prey), Predator, Food — all work with mouse and touch.
Right panel sliders control separation, alignment, and cohesion weights.

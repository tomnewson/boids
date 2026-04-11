import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Simulation } from '../simulation.js';
import { Boid } from '../boid.js';

// AudioEngine uses document.addEventListener in its constructor — mock the
// whole module so tests never touch Web Audio or DOM event registration.
vi.mock('../audio.js', () => ({
  AudioEngine: vi.fn().mockImplementation(() => ({
    _initialized: false,
    isRunning: vi.fn(() => false),
    playDeathSound: vi.fn(),
    processBoids: vi.fn(),
    initialize: vi.fn(),
    toggle: vi.fn(() => false),
  })),
}));

// ─── Mock canvas factory ──────────────────────────────────────────────────────

function makeMockCtx() {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'medium',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    shadowColor: '',
    shadowBlur: 0,
    lineJoin: '',
  };
}

function makeMockCanvas(width = 800, height = 600) {
  const ctx = makeMockCtx();
  return {
    width,
    height,
    logicalWidth: width,
    logicalHeight: height,
    style: { cursor: '', transform: '', backfaceVisibility: '', webkitUserSelect: '', userSelect: '', touchAction: '' },
    getContext: vi.fn(() => ctx),
    getBoundingClientRect: vi.fn(() => ({ width, height, left: 0, top: 0, right: width, bottom: height })),
    addEventListener: vi.fn(),
  };
}

// Build a Simulation without calling init() so no DOM events or rAF are set up
function makeSimulation(width = 800, height = 600) {
  return new Simulation(makeMockCanvas(width, height));
}

// Convenience: add a wall point directly to the spatial index
function addWallPoint(sim, x, y, size = 4) {
  const cellX = Math.floor(x / sim.gridCellSize);
  const cellY = Math.floor(y / sim.gridCellSize);
  const key = `${cellX},${cellY}`;
  if (!sim.wallSpatialIndex.has(key)) sim.wallSpatialIndex.set(key, []);
  sim.wallSpatialIndex.get(key).push({ x, y, size });
}

// ─── Constructor defaults ─────────────────────────────────────────────────────

describe('Simulation constructor', () => {
  it('starts with an empty boids array', () => {
    expect(makeSimulation().boids).toEqual([]);
  });

  it('starts with an empty food array', () => {
    expect(makeSimulation().food).toEqual([]);
  });

  it('starts with an empty walls array', () => {
    expect(makeSimulation().walls).toEqual([]);
  });

  it('initialises default flocking factors', () => {
    const sim = makeSimulation();
    expect(sim.separationFactor).toBe(1.5);
    expect(sim.alignmentFactor).toBe(1.0);
    expect(sim.cohesionFactor).toBe(1.0);
  });

  it('starts with no background image', () => {
    expect(makeSimulation().bgImage).toBeNull();
  });

  it('starts with bgImageDirty false', () => {
    expect(makeSimulation().bgImageDirty).toBe(false);
  });

  it('starts with trails disabled', () => {
    expect(makeSimulation().trailsEnabled).toBe(false);
  });

  it('initialises CURSOR_MODES enum', () => {
    const sim = makeSimulation();
    expect(sim.CURSOR_MODES.WALL).toBe('WALL');
    expect(sim.CURSOR_MODES.BOID).toBe('BOID');
    expect(sim.CURSOR_MODES.PREDATOR).toBe('PREDATOR');
    expect(sim.CURSOR_MODES.ERASER).toBe('ERASER');
    expect(sim.CURSOR_MODES.FOOD).toBe('FOOD');
  });

  it('default cursor mode is WALL', () => {
    expect(makeSimulation().cursorMode).toBe('WALL');
  });

  it('respects boidCount config', () => {
    const sim = new Simulation(makeMockCanvas(), { boidCount: 10 });
    expect(sim.config.boidCount).toBe(10);
  });
});

// ─── updateParams ─────────────────────────────────────────────────────────────

describe('Simulation.reset', () => {
  it('marks bgImageDirty true to clear trails', () => {
    const sim = makeSimulation();
    sim.bgImageDirty = false;
    sim.reset();
    expect(sim.bgImageDirty).toBe(true);
  });
});

describe('Simulation.updateParams', () => {
  it('updates all three factors', () => {
    const sim = makeSimulation();
    sim.updateParams(2.5, 0.5, 1.8);
    expect(sim.separationFactor).toBe(2.5);
    expect(sim.alignmentFactor).toBe(0.5);
    expect(sim.cohesionFactor).toBe(1.8);
  });
});

// ─── setCursorMode / getCursorMode ────────────────────────────────────────────

describe('Simulation cursor mode', () => {
  it('setCursorMode changes the active mode for valid values', () => {
    const sim = makeSimulation();
    // updateCursor touches canvas.style.cursor — mock it via the canvas stub
    sim.canvas.style.cursor = '';
    sim.setCursorMode(sim.CURSOR_MODES.BOID);
    expect(sim.getCursorMode()).toBe('BOID');
  });

  it('setCursorMode ignores invalid values', () => {
    const sim = makeSimulation();
    sim.setCursorMode('INVALID');
    expect(sim.getCursorMode()).toBe('WALL'); // unchanged default
  });
});

// ─── Spatial index ────────────────────────────────────────────────────────────

describe('Simulation.rebuildWallSpatialIndex', () => {
  it('starts with an empty index', () => {
    const sim = makeSimulation();
    expect(sim.wallSpatialIndex.size).toBe(0);
  });

  it('indexes wall points into the correct grid cell', () => {
    const sim = makeSimulation();
    sim.walls = [[{ x: 20, y: 20, size: 4 }]];
    sim.rebuildWallSpatialIndex();

    const cellX = Math.floor(20 / sim.gridCellSize);
    const cellY = Math.floor(20 / sim.gridCellSize);
    const key = `${cellX},${cellY}`;
    expect(sim.wallSpatialIndex.has(key)).toBe(true);
    expect(sim.wallSpatialIndex.get(key)).toHaveLength(1);
  });

  it('indexes points from multiple walls', () => {
    const sim = makeSimulation();
    sim.walls = [
      [{ x: 20, y: 20, size: 4 }],
      [{ x: 200, y: 200, size: 4 }],
    ];
    sim.rebuildWallSpatialIndex();

    let totalPoints = 0;
    for (const points of sim.wallSpatialIndex.values()) totalPoints += points.length;
    expect(totalPoints).toBe(2);
  });

  it('clears stale index entries on rebuild', () => {
    const sim = makeSimulation();
    sim.walls = [[{ x: 20, y: 20, size: 4 }]];
    sim.rebuildWallSpatialIndex();
    sim.walls = [];
    sim.rebuildWallSpatialIndex();
    expect(sim.wallSpatialIndex.size).toBe(0);
  });
});

// ─── getWallPointsNearPosition ───────────────────────────────────────────────

describe('Simulation.getWallPointsNearPosition', () => {
  it('returns empty array when there are no walls', () => {
    const sim = makeSimulation();
    expect(sim.getWallPointsNearPosition(100, 100, 20)).toEqual([]);
  });

  it('returns points that lie within the search radius', () => {
    const sim = makeSimulation();
    addWallPoint(sim, 100, 100);
    const result = sim.getWallPointsNearPosition(100, 100, 20);
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not return points far outside the search radius', () => {
    const sim = makeSimulation();
    addWallPoint(sim, 500, 500);
    // Search near origin — 500,500 is many cells away
    const result = sim.getWallPointsNearPosition(0, 0, 20);
    expect(result).toEqual([]);
  });
});

// ─── isPointNearWall ─────────────────────────────────────────────────────────

describe('Simulation.isPointNearWall', () => {
  it('returns false when there are no walls', () => {
    const sim = makeSimulation();
    expect(sim.isPointNearWall(100, 100, 10)).toBe(false);
  });

  it('returns true when the point is on top of a wall point', () => {
    const sim = makeSimulation();
    addWallPoint(sim, 100, 100);
    expect(sim.isPointNearWall(100, 100, 10)).toBe(true);
  });

  it('returns false when the point is far from any wall', () => {
    const sim = makeSimulation();
    addWallPoint(sim, 100, 100);
    expect(sim.isPointNearWall(400, 400, 10)).toBe(false);
  });
});

// ─── getWallNormal ────────────────────────────────────────────────────────────

describe('Simulation.getWallNormal', () => {
  it('returns { x:0, y:0 } when no walls are nearby', () => {
    const sim = makeSimulation();
    const n = sim.getWallNormal(100, 100);
    expect(n).toEqual({ x: 0, y: 0 });
  });

  it('returns a unit vector pointing away from the nearest wall point', () => {
    const sim = makeSimulation();
    // Wall is directly to the left of the query point
    addWallPoint(sim, 80, 100);
    const n = sim.getWallNormal(100, 100);
    // Normal should point to the right (positive x), y ≈ 0
    expect(n.x).toBeGreaterThan(0);
    expect(Math.abs(n.y)).toBeLessThan(0.01);
    // Should be approximately unit length
    const len = Math.sqrt(n.x ** 2 + n.y ** 2);
    expect(len).toBeCloseTo(1, 5);
  });
});

// ─── clearWalls ───────────────────────────────────────────────────────────────

describe('Simulation.clearWalls', () => {
  it('empties the walls array', () => {
    const sim = makeSimulation();
    sim.walls = [[{ x: 50, y: 50, size: 4 }]];
    sim.clearWalls();
    expect(sim.walls).toEqual([]);
  });

  it('clears the spatial index', () => {
    const sim = makeSimulation();
    addWallPoint(sim, 50, 50);
    sim.clearWalls();
    expect(sim.wallSpatialIndex.size).toBe(0);
  });
});

// ─── eraseFood ────────────────────────────────────────────────────────────────

describe('Simulation.eraseFood', () => {
  function makeFood(x, y) {
    return { position: { x, y }, size: 4, nutritionValue: 30, color: '#fff', glowColor: '#fff0' };
  }

  it('removes food within the radius', () => {
    const sim = makeSimulation();
    sim.food = [makeFood(100, 100)];
    sim.eraseFood(100, 100, 100); // radius² = 100
    expect(sim.food).toHaveLength(0);
  });

  it('keeps food outside the radius', () => {
    const sim = makeSimulation();
    sim.food = [makeFood(200, 200)];
    sim.eraseFood(100, 100, 100); // far away
    expect(sim.food).toHaveLength(1);
  });

  it('returns true when food was removed', () => {
    const sim = makeSimulation();
    sim.food = [makeFood(100, 100)];
    expect(sim.eraseFood(100, 100, 100)).toBe(true);
  });

  it('returns false when nothing was removed', () => {
    const sim = makeSimulation();
    sim.food = [makeFood(200, 200)];
    expect(sim.eraseFood(100, 100, 100)).toBe(false);
  });
});

// ─── eraseBoids ───────────────────────────────────────────────────────────────

describe('Simulation.eraseBoids', () => {
  function makeBoidAt(x, y) {
    return new Boid(x, y, { logicalWidth: 800, logicalHeight: 600 });
  }

  it('removes boids within the radius', () => {
    const sim = makeSimulation();
    sim.boids = [makeBoidAt(100, 100)];
    sim.eraseBoids(100, 100, 100);
    expect(sim.boids).toHaveLength(0);
  });

  it('keeps boids outside the radius', () => {
    const sim = makeSimulation();
    sim.boids = [makeBoidAt(200, 200)];
    sim.eraseBoids(100, 100, 100); // 200² + 200² >> 100
    // distance² = (200-100)²+(200-100)² = 20000 > 100
    expect(sim.boids).toHaveLength(1);
  });

  it('returns true when boids were removed', () => {
    const sim = makeSimulation();
    sim.boids = [makeBoidAt(100, 100)];
    expect(sim.eraseBoids(100, 100, 100)).toBe(true);
  });

  it('returns false when nothing was removed', () => {
    const sim = makeSimulation();
    sim.boids = [makeBoidAt(500, 500)];
    expect(sim.eraseBoids(100, 100, 100)).toBe(false);
  });
});

// ─── spawnBoid ────────────────────────────────────────────────────────────────

describe('Simulation.spawnBoid', () => {
  it('adds a prey boid to the boids array', () => {
    const sim = makeSimulation();
    sim.spawnBoid(100, 100, false);
    expect(sim.boids).toHaveLength(1);
    expect(sim.boids[0].isPredator).toBe(false);
  });

  it('adds a predator boid when isPredator=true', () => {
    const sim = makeSimulation();
    sim.spawnBoid(100, 100, true);
    expect(sim.boids).toHaveLength(1);
    expect(sim.boids[0].isPredator).toBe(true);
  });

  it('sets predator-specific properties on predator boids', () => {
    const sim = makeSimulation();
    sim.spawnBoid(100, 100, true);
    const b = sim.boids[0];
    expect(b.maxHealth).toBe(150);
    expect(b.healthDecayRate).toBe(0.12);
  });
});

// ─── spawnFood ────────────────────────────────────────────────────────────────

describe('Simulation.spawnFood', () => {
  it('adds a food item at the given position', () => {
    const sim = makeSimulation();
    // No walls, so food can spawn
    sim.spawnFood(200, 200);
    expect(sim.food).toHaveLength(1);
    expect(sim.food[0].position).toEqual({ x: 200, y: 200 });
  });

  it('does not spawn food on top of a wall', () => {
    const sim = makeSimulation();
    addWallPoint(sim, 200, 200);
    sim.spawnFood(200, 200);
    expect(sim.food).toHaveLength(0);
  });

  it('food has a positive nutritionValue', () => {
    const sim = makeSimulation();
    sim.spawnFood(200, 200);
    expect(sim.food[0].nutritionValue).toBeGreaterThan(0);
  });

  it('food starts with glowDrawn false', () => {
    const sim = makeSimulation();
    sim.spawnFood(200, 200);
    expect(sim.food[0].glowDrawn).toBe(false);
  });
});

// ─── applyPopulationControls ──────────────────────────────────────────────────

describe('Simulation.applyPopulationControls', () => {
  function addPrey(sim, n) {
    for (let i = 0; i < n; i++) {
      const b = new Boid(Math.random() * 800, Math.random() * 600, { logicalWidth: 800, logicalHeight: 600 });
      b.isPredator = false;
      sim.boids.push(b);
    }
  }

  function addPredators(sim, n) {
    for (let i = 0; i < n; i++) {
      const b = new Boid(Math.random() * 800, Math.random() * 600, { logicalWidth: 800, logicalHeight: 600 });
      b.isPredator = true;
      b.health = 80;
      sim.boids.push(b);
    }
  }

  it('does nothing when population is under the cap', () => {
    const sim = makeSimulation();
    addPrey(sim, 10);
    addPredators(sim, 2);
    sim.applyPopulationControls();
    expect(sim.boids).toHaveLength(12);
  });

  it('trims the population to the cap when over 500', () => {
    const sim = makeSimulation();
    addPrey(sim, 450);
    addPredators(sim, 60); // total 510 > 500
    sim.applyPopulationControls();
    expect(sim.boids.length).toBeLessThanOrEqual(500);
  });

  it('always keeps at least minPredators (3) predators', () => {
    const sim = makeSimulation();
    addPrey(sim, 490);
    addPredators(sim, 15); // total 505 but few predators
    sim.applyPopulationControls();
    const predCount = sim.boids.filter((b) => b.isPredator).length;
    expect(predCount).toBeGreaterThanOrEqual(3);
  });
});

// ─── setBackgroundImage ───────────────────────────────────────────────────────

describe('Simulation.setBackgroundImage', () => {
  it('sets bgImage to the provided image', () => {
    const sim = makeSimulation();
    const img = { naturalWidth: 1920, naturalHeight: 1080 };
    sim.setBackgroundImage(img);
    expect(sim.bgImage).toBe(img);
  });

  it('marks bgImageDirty true', () => {
    const sim = makeSimulation();
    sim.setBackgroundImage({ naturalWidth: 800, naturalHeight: 600 });
    expect(sim.bgImageDirty).toBe(true);
  });

  it('replaces a previously set image', () => {
    const sim = makeSimulation();
    const first = { naturalWidth: 100, naturalHeight: 100 };
    const second = { naturalWidth: 200, naturalHeight: 200 };
    sim.setBackgroundImage(first);
    sim.setBackgroundImage(second);
    expect(sim.bgImage).toBe(second);
  });
});

// ─── calcBgCrop ───────────────────────────────────────────────────────────────

describe('Simulation.calcBgCrop', () => {
  it('crops the sides when the image is wider than the canvas', () => {
    const sim = makeSimulation(800, 600); // canvas aspect 4:3
    sim.bgImage = { naturalWidth: 1600, naturalHeight: 600 }; // image aspect 8:3 — wider
    const { sx, sy, sw, sh } = sim.calcBgCrop();
    // Source height should equal image height, width cropped to match canvas aspect
    expect(sh).toBe(600);
    expect(sw).toBeCloseTo(1600 / 2); // canvas is 4:3, image is 8:3, so use half the width
    expect(sy).toBe(0);
    expect(sx).toBeGreaterThan(0); // centred horizontally
  });

  it('crops the top/bottom when the image is taller than the canvas', () => {
    const sim = makeSimulation(800, 600); // canvas aspect 4:3
    sim.bgImage = { naturalWidth: 800, naturalHeight: 1200 }; // image aspect 2:3 — taller
    const { sx, sy, sw, sh } = sim.calcBgCrop();
    expect(sw).toBe(800);
    expect(sh).toBeCloseTo(800 * (600 / 800)); // sh = sw / dstAspect
    expect(sx).toBe(0);
    expect(sy).toBeGreaterThan(0); // centred vertically
  });

  it('returns scale factors matching src/dst ratio', () => {
    const sim = makeSimulation(800, 600);
    sim.bgImage = { naturalWidth: 800, naturalHeight: 600 }; // exact match
    const { sw, sh, scaleX, scaleY } = sim.calcBgCrop();
    expect(scaleX).toBeCloseTo(sw / 800);
    expect(scaleY).toBeCloseTo(sh / 600);
  });
});

// ─── toggleTrails ─────────────────────────────────────────────────────────────

describe('Simulation.toggleTrails', () => {
  it('enables trails when currently disabled', () => {
    const sim = makeSimulation();
    sim.toggleTrails();
    expect(sim.trailsEnabled).toBe(true);
  });

  it('disables trails when currently enabled', () => {
    const sim = makeSimulation();
    sim.toggleTrails();
    sim.toggleTrails();
    expect(sim.trailsEnabled).toBe(false);
  });

  it('returns the new state after toggling on', () => {
    const sim = makeSimulation();
    expect(sim.toggleTrails()).toBe(true);
  });

  it('returns the new state after toggling off', () => {
    const sim = makeSimulation();
    sim.toggleTrails();
    expect(sim.toggleTrails()).toBe(false);
  });
});

// ─── isFoodNearPosition ───────────────────────────────────────────────────────

describe('Simulation.isFoodNearPosition', () => {
  it('returns false when there is no food', () => {
    const sim = makeSimulation();
    expect(sim.isFoodNearPosition(100, 100, 20)).toBe(false);
  });

  it('returns true when food overlaps the check radius', () => {
    const sim = makeSimulation();
    sim.food = [{ position: { x: 100, y: 100 }, size: 4 }];
    expect(sim.isFoodNearPosition(100, 100, 20)).toBe(true);
  });

  it('returns false when food is far away', () => {
    const sim = makeSimulation();
    sim.food = [{ position: { x: 400, y: 400 }, size: 4 }];
    expect(sim.isFoodNearPosition(100, 100, 20)).toBe(false);
  });
});

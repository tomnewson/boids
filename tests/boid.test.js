import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Boid,
  PREY_MAX_SPEED,
  PREDATOR_MAX_SPEED,
  PREY_STEERING_FACTOR,
  PREDATOR_STEERING_FACTOR,
} from '../boid.js';

// Minimal canvas stub — only the properties Boid actually reads
function makeMockCanvas(width = 800, height = 600) {
  return { logicalWidth: width, logicalHeight: height };
}

// Create a prey boid at a fixed position, no random variation in tests
function makeBoid(x = 100, y = 100, canvas = makeMockCanvas()) {
  return new Boid(x, y, canvas);
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('Boid constructor', () => {
  it('sets position from arguments', () => {
    const b = makeBoid(42, 99);
    expect(b.position.x).toBe(42);
    expect(b.position.y).toBe(99);
  });

  it('is prey by default', () => {
    expect(makeBoid().isPredator).toBe(false);
  });

  it('starts with positive health', () => {
    expect(makeBoid().health).toBeGreaterThan(0);
  });

  it('starts with an empty trail buffer', () => {
    expect(makeBoid().trail).toEqual([]);
  });

  it('assigns a unique id', () => {
    const a = makeBoid();
    const b = makeBoid();
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('velocity magnitude is between minSpeed and maxSpeed after construction', () => {
    // Run a few times because velocity is randomised
    for (let i = 0; i < 10; i++) {
      const b = makeBoid();
      const speed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
      expect(speed).toBeGreaterThan(0);
      expect(speed).toBeLessThanOrEqual(b.maxSpeed + 0.001); // float tolerance
    }
  });
});

// ─── updateHealth ─────────────────────────────────────────────────────────────

describe('Boid.updateHealth', () => {
  it('reduces health each tick by healthDecayRate', () => {
    const b = makeBoid();
    const before = b.health;
    b.updateHealth(1.0);
    // Prey also gain foodGenerationRate, so net change is -(decay - food)
    const expected = before - b.healthDecayRate + b.foodGenerationRate;
    expect(b.health).toBeCloseTo(expected, 5);
  });

  it('prey passively gain health via foodGenerationRate', () => {
    const b = makeBoid();
    b.isPredator = false;
    b.health = 50;
    b.healthDecayRate = 0; // isolate food generation
    b.updateHealth(1.0);
    expect(b.health).toBeGreaterThan(50);
  });

  it('predators do NOT gain passive health', () => {
    const b = makeBoid();
    b.isPredator = true;
    b.foodGenerationRate = 0;
    b.health = 50;
    b.healthDecayRate = 0;
    b.updateHealth(1.0);
    expect(b.health).toBe(50);
  });

  it('caps health at maxHealth', () => {
    const b = makeBoid();
    b.health = b.maxHealth;
    b.healthDecayRate = 0;
    b.foodGenerationRate = 10; // would overshoot without cap
    b.updateHealth(1.0);
    expect(b.health).toBe(b.maxHealth);
  });

  it('sets killed flag when health reaches zero', () => {
    const b = makeBoid();
    b.health = 0.01;
    b.healthDecayRate = 1;
    b.foodGenerationRate = 0;
    b.updateHealth(1.0);
    expect(b.killed).toBe(true);
  });

  it('scales decay by timeScale', () => {
    const b = makeBoid();
    const before = b.health;
    b.foodGenerationRate = 0;
    b.updateHealth(2.0);
    expect(b.health).toBeCloseTo(before - b.healthDecayRate * 2, 5);
  });
});

// ─── checkReproduction ────────────────────────────────────────────────────────

describe('Boid.checkReproduction', () => {
  it('sets readyToReproduce when health meets threshold and cooldown is zero', () => {
    const b = makeBoid();
    b.health = b.reproductionThreshold;
    b.reproductionCooldown = 0;
    b.readyToReproduce = false;
    b.checkReproduction();
    expect(b.readyToReproduce).toBe(true);
  });

  it('does NOT set flag when health is below threshold', () => {
    const b = makeBoid();
    b.health = b.reproductionThreshold - 1;
    b.reproductionCooldown = 0;
    b.checkReproduction();
    expect(b.readyToReproduce).toBe(false);
  });

  it('does NOT set flag when cooldown is active', () => {
    const b = makeBoid();
    b.health = b.reproductionThreshold + 10;
    b.reproductionCooldown = 50;
    b.checkReproduction();
    expect(b.readyToReproduce).toBe(false);
  });

  it('clears flag when health falls below threshold', () => {
    const b = makeBoid();
    b.readyToReproduce = true;
    b.health = b.reproductionThreshold - 1;
    b.checkReproduction();
    expect(b.readyToReproduce).toBe(false);
  });
});

// ─── reproduce ────────────────────────────────────────────────────────────────

describe('Boid.reproduce', () => {
  it('returns null when not ready', () => {
    const b = makeBoid();
    b.readyToReproduce = false;
    expect(b.reproduce()).toBeNull();
  });

  it('returns a Boid offspring when ready', () => {
    const b = makeBoid();
    b.readyToReproduce = true;
    b.health = b.reproductionThreshold + 20;
    const child = b.reproduce();
    expect(child).toBeInstanceOf(Boid);
  });

  it('deducts reproduction cost from parent health', () => {
    const b = makeBoid();
    b.readyToReproduce = true;
    b.health = 90;
    const before = b.health;
    b.reproduce();
    expect(b.health).toBeCloseTo(before - b.reproductionCost, 5);
  });

  it('resets readyToReproduce after reproducing', () => {
    const b = makeBoid();
    b.readyToReproduce = true;
    b.health = 90;
    b.reproduce();
    expect(b.readyToReproduce).toBe(false);
  });

  it('starts a cooldown after reproducing', () => {
    const b = makeBoid();
    b.readyToReproduce = true;
    b.health = 90;
    b.reproductionCooldown = 0;
    b.reproduce();
    expect(b.reproductionCooldown).toBeGreaterThan(0);
  });

  it('offspring inherits predator status from parent', () => {
    const b = makeBoid();
    b.isPredator = true;
    b.readyToReproduce = true;
    b.health = 150;
    b.maxHealth = 150;
    b.reproductionCost = 60;
    const child = b.reproduce();
    expect(child.isPredator).toBe(true);
  });
});

// ─── applyForce ───────────────────────────────────────────────────────────────

describe('Boid.applyForce', () => {
  it('adds force to acceleration, scaled by steeringFactor', () => {
    const b = makeBoid();
    b.acceleration = { x: 0, y: 0 };
    b.steeringFactor = 1.0;
    b.applyForce({ x: 0.5, y: -0.3 });
    expect(b.acceleration.x).toBeCloseTo(0.5);
    expect(b.acceleration.y).toBeCloseTo(-0.3);
  });

  it('scales force by steeringFactor', () => {
    const b = makeBoid();
    b.acceleration = { x: 0, y: 0 };
    b.steeringFactor = 2.0;
    b.applyForce({ x: 1, y: 1 });
    expect(b.acceleration.x).toBeCloseTo(2);
    expect(b.acceleration.y).toBeCloseTo(2);
  });

  it('accumulates multiple forces', () => {
    const b = makeBoid();
    b.acceleration = { x: 0, y: 0 };
    b.steeringFactor = 1.0;
    b.applyForce({ x: 1, y: 0 });
    b.applyForce({ x: 0, y: 1 });
    expect(b.acceleration.x).toBeCloseTo(1);
    expect(b.acceleration.y).toBeCloseTo(1);
  });
});

// ─── separation ───────────────────────────────────────────────────────────────

describe('Boid.separation', () => {
  it('returns zero vector when there are no other boids', () => {
    const b = makeBoid(100, 100);
    const f = b.separation([b], 1.5);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });

  it('steers away from a nearby boid', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    b.velocity = { x: 0, y: 0 };
    // Place a neighbour directly to the right, very close
    const neighbor = makeBoid(110, 100, canvas);
    const f = b.separation([b, neighbor], 1.5);
    // Force should push b to the left (negative x)
    expect(f.x).toBeLessThan(0);
  });

  it('returns zero when the only neighbour is far away', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    const far = makeBoid(500, 500, canvas);
    const f = b.separation([b, far], 1.5);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });
});

// ─── alignment ────────────────────────────────────────────────────────────────

describe('Boid.alignment', () => {
  it('returns zero vector when no neighbours', () => {
    const b = makeBoid(100, 100);
    const f = b.alignment([b], 1.0);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });

  it('steers toward average velocity of neighbours', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    b.velocity = { x: 0, y: 0 };

    // Neighbour moving strongly to the right
    const n = makeBoid(110, 100, canvas);
    n.velocity = { x: 5, y: 0 };

    const f = b.alignment([b, n], 1.0);
    expect(f.x).toBeGreaterThan(0); // pushed rightward
  });

  it('returns zero when neighbour is too far away', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    const far = makeBoid(600, 600, canvas);
    far.velocity = { x: 5, y: 0 };
    const f = b.alignment([b, far], 1.0);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });
});

// ─── cohesion ─────────────────────────────────────────────────────────────────

describe('Boid.cohesion', () => {
  it('returns zero vector when no neighbours', () => {
    const b = makeBoid(100, 100);
    const f = b.cohesion([b], 1.0);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });

  it('steers toward the center of mass of neighbours', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    b.velocity = { x: 0, y: 0 };

    // Neighbour is to the right
    const n = makeBoid(130, 100, canvas);

    const f = b.cohesion([b, n], 1.0);
    expect(f.x).toBeGreaterThan(0); // pulled rightward toward neighbour
  });
});

// ─── countNeighbors ──────────────────────────────────────────────────────────

describe('Boid.countNeighbors', () => {
  it('returns 0 when there are no other boids', () => {
    const b = makeBoid(100, 100);
    expect(b.countNeighbors([b], 50)).toBe(0);
  });

  it('does not count itself', () => {
    const b = makeBoid(100, 100);
    expect(b.countNeighbors([b], 50)).toBe(0);
  });

  it('counts boids within radius', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    const near = makeBoid(110, 100, canvas);   // distance = 10
    const far  = makeBoid(200, 100, canvas);   // distance = 100
    expect(b.countNeighbors([b, near, far], 50)).toBe(1);
  });

  it('counts all boids inside radius', () => {
    const canvas = makeMockCanvas();
    const b = makeBoid(100, 100, canvas);
    const n1 = makeBoid(105, 100, canvas);
    const n2 = makeBoid(100, 110, canvas);
    expect(b.countNeighbors([b, n1, n2], 50)).toBe(2);
  });
});

// ─── checkPreyCollision ───────────────────────────────────────────────────────

describe('Boid.checkPreyCollision', () => {
  it('marks prey as killed when predator touches it', () => {
    const canvas = makeMockCanvas();
    const predator = makeBoid(100, 100, canvas);
    predator.isPredator = true;
    predator.huntingCooldown = 0;

    const prey = makeBoid(100, 100, canvas); // same position = touching
    prey.isPredator = false;

    const distSq = 0;
    predator.checkPreyCollision(prey, distSq);
    expect(prey.killed).toBe(true);
  });

  it('does NOT kill prey that is out of collision range', () => {
    const canvas = makeMockCanvas();
    const predator = makeBoid(100, 100, canvas);
    predator.isPredator = true;
    predator.huntingCooldown = 0;

    const prey = makeBoid(200, 200, canvas);
    const distSq = (200 - 100) ** 2 + (200 - 100) ** 2; // far away

    predator.checkPreyCollision(prey, distSq);
    expect(prey.killed).toBe(false);
  });

  it('predator gains health on a kill', () => {
    const canvas = makeMockCanvas();
    const predator = makeBoid(100, 100, canvas);
    predator.isPredator = true;
    predator.huntingCooldown = 0;
    predator.health = 50;
    predator.maxHealth = 150;

    const prey = makeBoid(100, 100, canvas);
    predator.checkPreyCollision(prey, 0);
    expect(predator.health).toBeGreaterThan(50);
  });

  it('does not kill when hunting cooldown is active', () => {
    const canvas = makeMockCanvas();
    const predator = makeBoid(100, 100, canvas);
    predator.isPredator = true;
    predator.huntingCooldown = 10;

    const prey = makeBoid(100, 100, canvas);
    predator.checkPreyCollision(prey, 0);
    expect(prey.killed).toBe(false);
  });

  it('sets huntingCooldown after a kill', () => {
    const canvas = makeMockCanvas();
    const predator = makeBoid(100, 100, canvas);
    predator.isPredator = true;
    predator.huntingCooldown = 0;
    predator.maxHealth = 150;

    predator.checkPreyCollision(makeBoid(100, 100, canvas), 0);
    expect(predator.huntingCooldown).toBeGreaterThan(0);
  });
});

// ─── edges (canvas wrapping) ─────────────────────────────────────────────────

describe('Boid.edges', () => {
  it('wraps x past the right edge to 0', () => {
    const canvas = makeMockCanvas(800, 600);
    const b = makeBoid(801, 300, canvas);
    b.edges();
    expect(b.position.x).toBe(0);
  });

  it('wraps x past the left edge to canvas width', () => {
    const canvas = makeMockCanvas(800, 600);
    const b = makeBoid(-1, 300, canvas);
    b.edges();
    expect(b.position.x).toBe(800);
  });

  it('wraps y past the bottom edge to 0', () => {
    const canvas = makeMockCanvas(800, 600);
    const b = makeBoid(400, 601, canvas);
    b.edges();
    expect(b.position.y).toBe(0);
  });

  it('wraps y past the top edge to canvas height', () => {
    const canvas = makeMockCanvas(800, 600);
    const b = makeBoid(400, -1, canvas);
    b.edges();
    expect(b.position.y).toBe(600);
  });

  it('leaves position unchanged when inside bounds', () => {
    const canvas = makeMockCanvas(800, 600);
    const b = makeBoid(400, 300, canvas);
    b.edges();
    expect(b.position.x).toBe(400);
    expect(b.position.y).toBe(300);
  });
});

// ─── exported constants ──────────────────────────────────────────────────────

describe('exported constants', () => {
  it('predators are faster than prey', () => {
    expect(PREDATOR_MAX_SPEED).toBeGreaterThan(PREY_MAX_SPEED);
  });

  it('prey steer faster than predators', () => {
    expect(PREY_STEERING_FACTOR).toBeGreaterThan(PREDATOR_STEERING_FACTOR);
  });
});

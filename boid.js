// Movement characteristic constants
const PREY_STEERING_FACTOR = 1.6; // Higher value means prey turn more quickly
const PREDATOR_STEERING_FACTOR = 0.9; // Improved from 0.7 - still slower than prey but better hunting ability
const PREY_MAX_SPEED = 3.2; // Slightly lower max speed for prey
const PREDATOR_MAX_SPEED = 4.5; // Higher max speed for predators

class Boid {
  constructor(x, y, canvas) {
    this.id = Math.random().toString(36).substring(2, 15); // Add unique ID
    this.position = {
      x: x,
      y: y,
    };
    this.velocity = {
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
    };
    this.acceleration = {
      x: 0,
      y: 0,
    };
    this.maxForce = 0.1; // Reduced from 0.2 for smoother steering
    this.maxSpeed = 3.5; // Slightly reduced for better control
    this.minSpeed = 1.0; // Ensure boids keep moving to prevent stalling
    this.size = 5;
    this.canvas = canvas;

    // Add previous velocity for smoothing
    this.prevVelocity = {
      x: 0,
      y: 0,
    };

    // Add previous position for collision resolution
    this.prevPosition = {
      x: x,
      y: y,
    };

    // Add collision response properties
    this.collisionRadius = this.size * 0.8; // Slightly smaller than visual size
    this.restitution = 0.6; // Energy preserved after collision (bounce factor)

    // Add color properties
    this.hue = Math.floor(Math.random() * 360); // Random hue between 0-359
    this.baseColor = `hsl(${this.hue}, 100%, 50%)`; // Base HSL color with full saturation and medium lightness

    // Normalize initial velocity
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
    );
    this.velocity.x = (this.velocity.x / speed) * this.maxSpeed * 0.5;
    this.velocity.y = (this.velocity.y / speed) * this.maxSpeed * 0.5;

    this.isPredator = false; // Flag to identify predator boids
    this.predatorDetectionRadius = 100; // How far prey can detect predators
    this.preyDetectionRadius = 150; // How far predators can detect prey
    this.predatorChaseStrength = 1.2; // How strongly predators chase prey
    this.predatorFleeStrength = 2.0; // How strongly prey flee from predators
    this.huntingCooldown = 0; // Cooldown timer for predator kills

    // Add turning agility factor - prey turn faster than predators
    this.steeringFactor = 1.0; // Base steering factor, will be adjusted based on predator status

    // Predator/Prey system - health and reproduction
    this.health = this.isPredator ? 80 : 75; // Prey start with slightly higher health (was 70)
    this.maxHealth = this.isPredator ? 150 : 100; // Predators have higher max health
    this.healthDecayRate = this.isPredator ? 0.12 : 0.03; // Reduce prey decay rate (was 0.05)
    this.killed = false; // Flag to mark if this boid is killed

    // Reproduction properties
    this.reproductionThreshold = this.isPredator ? 120 : 85; // Lower prey threshold (was 90)
    this.reproductionCost = this.isPredator ? 60 : 50; // Lower prey reproduction cost (was 60)
    this.reproductionCooldown = this.isPredator ? 0 : 100; // Shorter initial cooldown for prey (was 120)
    this.readyToReproduce = false; // Flag to indicate reproductive readiness

    // Food properties
    this.healthGainPerKill = 45; // Health gained when predator kills prey
    this.foodGenerationRate = this.isPredator ? 0 : 0.04; // Increase prey health gain rate (was 0.01)
  }

  // Update boid's position based on its velocity and acceleration
  update(timeScale = 1.0) {
    // Store previous position for collision resolution
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;

    // Store previous velocity for smoothing
    this.prevVelocity.x = this.velocity.x;
    this.prevVelocity.y = this.velocity.y;

    // Update velocity based on acceleration with damping
    // Apply time scaling to ensure consistent movement speed regardless of frame rate
    this.velocity.x += this.acceleration.x * timeScale;
    this.velocity.y += this.acceleration.y * timeScale;

    // Apply velocity smoothing by blending with previous velocity
    const smoothingFactor = 0.3; // 0 = no smoothing, 1 = maximum smoothing
    this.velocity.x =
      this.velocity.x * (1 - smoothingFactor) +
      this.prevVelocity.x * smoothingFactor;
    this.velocity.y =
      this.velocity.y * (1 - smoothingFactor) +
      this.prevVelocity.y * smoothingFactor;

    // Calculate current speed
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
    );

    // Apply speed limits - both minimum and maximum
    if (speed > this.maxSpeed) {
      this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
      this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
    } else if (speed < this.minSpeed && speed > 0) {
      // Only enforce minimum speed if the boid is actually moving
      this.velocity.x = (this.velocity.x / speed) * this.minSpeed;
      this.velocity.y = (this.velocity.y / speed) * this.minSpeed;
    }

    // Calculate next position
    const nextX = this.position.x + this.velocity.x * timeScale;
    const nextY = this.position.y + this.velocity.y * timeScale;

    // Check for wall collisions before updating position
    if (this.checkWallCollision(nextX, nextY)) {
      // Position has been updated in the collision handling
    } else {
      // No collision, update position as normal
      this.position.x = nextX;
      this.position.y = nextY;
    }

    // Reset acceleration
    this.acceleration.x = 0;
    this.acceleration.y = 0;

    // Wrap around edges
    this.edges();

    // Decrement hunting cooldown if it exists
    if (this.huntingCooldown > 0) {
      this.huntingCooldown -= timeScale;
    }

    // Decrement reproduction cooldown if it exists
    if (this.reproductionCooldown > 0) {
      this.reproductionCooldown -= timeScale;
    }

    // Process health mechanics - decay and food
    this.updateHealth(timeScale);

    // Check for reproduction possibility
    this.checkReproduction();
  }

  // Update boid health - handles health decay and food generation
  updateHealth(timeScale) {
    // Apply health decay over time
    this.health -= this.healthDecayRate * timeScale;

    // Prey slowly generate health by "grazing"
    if (!this.isPredator) {
      this.health += this.foodGenerationRate * timeScale;
    }

    // Cap health at maximum
    if (this.health > this.maxHealth) {
      this.health = this.maxHealth;
    }

    // Mark as dead if health reaches zero
    if (this.health <= 0) {
      this.killed = true;
    }
  }

  // Check if the boid can reproduce
  checkReproduction() {
    // Only reproduce if:
    // 1. Not on cooldown
    // 2. Has enough health
    // 3. Not already marked as ready to reproduce
    if (
      this.reproductionCooldown <= 0 &&
      this.health >= this.reproductionThreshold &&
      !this.readyToReproduce
    ) {
      this.readyToReproduce = true;
    } else if (this.health < this.reproductionThreshold) {
      this.readyToReproduce = false;
    }
  }

  // Handle reproduction - creates a new boid
  reproduce() {
    // Can only reproduce if ready flag is set
    if (!this.readyToReproduce) {
      return null;
    }

    // Deduct reproduction cost from health
    this.health -= this.reproductionCost;

    // Reset reproduction flag and start cooldown
    this.readyToReproduce = false;
    this.reproductionCooldown = this.isPredator ? 300 : 150; // Predators have longer cooldown

    // Create a new boid of the same type at a slightly offset position
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = (Math.random() - 0.5) * 10;

    // Initialize offspring
    const offspring = new Boid(
      this.position.x + offsetX,
      this.position.y + offsetY,
      this.canvas
    );

    // Child inherits parent's predator status
    offspring.isPredator = this.isPredator;

    // Update properties based on predator status
    if (offspring.isPredator) {
      offspring.health = 80;
      offspring.maxHealth = 150;
      offspring.healthDecayRate = 0.12;
      offspring.reproductionThreshold = 120;
      offspring.reproductionCost = 60;
      offspring.foodGenerationRate = 0;

      // Inherit predator movement characteristics
      offspring.maxSpeed = PREDATOR_MAX_SPEED; // Higher max speed for predators
      offspring.steeringFactor = PREDATOR_STEERING_FACTOR; // Lower steering factor for predators (turn more slowly)
    } else {
      // Inherit prey movement characteristics
      offspring.maxSpeed = PREY_MAX_SPEED; // Slightly lower max speed for prey
      offspring.steeringFactor = PREY_STEERING_FACTOR; // Higher steering factor for prey (turn more quickly)
    }

    // Return the new boid to be added to the simulation
    return offspring;
  }

  // Check for wall collisions and handle them
  checkWallCollision(nextX, nextY, simulation) {
    // Get the simulation object from the window if not provided
    if (!simulation && window.simulation) {
      simulation = window.simulation;
    }

    // If there's no simulation available, we can't check for walls
    if (!simulation) return false;

    // Check if the boid's next position would intersect a wall
    if (simulation.isPointNearWall(nextX, nextY, this.collisionRadius)) {
      this.handleWallCollision(simulation);
      return true;
    }

    // Check for collisions along the path (for fast-moving boids)
    const moveDistSq =
      (nextX - this.position.x) * (nextX - this.position.x) +
      (nextY - this.position.y) * (nextY - this.position.y);

    // If the boid is moving fast enough to potentially skip over walls, check intermediate points
    if (moveDistSq > this.collisionRadius * this.collisionRadius) {
      const steps = Math.ceil(
        Math.sqrt(moveDistSq) / (this.collisionRadius * 0.5)
      );
      const stepX = (nextX - this.position.x) / steps;
      const stepY = (nextY - this.position.y) / steps;

      for (let i = 1; i < steps; i++) {
        const checkX = this.position.x + stepX * i;
        const checkY = this.position.y + stepY * i;

        if (simulation.isPointNearWall(checkX, checkY, this.collisionRadius)) {
          this.handleWallCollision(simulation);
          return true;
        }
      }
    }

    return false;
  }

  // Handle collision with a wall
  handleWallCollision(simulation) {
    // Get the normal vector from the wall
    const normal = simulation.getWallNormal(this.position.x, this.position.y);

    // Calculate reflection for velocity
    const dotProduct = this.velocity.x * normal.x + this.velocity.y * normal.y;

    // Apply reflection formula: v' = v - 2(v·n)n
    this.velocity.x = this.velocity.x - 2 * dotProduct * normal.x;
    this.velocity.y = this.velocity.y - 2 * dotProduct * normal.y;

    // Apply restitution (energy loss)
    this.velocity.x *= this.restitution;
    this.velocity.y *= this.restitution;

    // Ensure minimum speed
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
    );

    if (speed < this.minSpeed) {
      // Normalize and scale to minimum speed
      this.velocity.x = (this.velocity.x / speed) * this.minSpeed;
      this.velocity.y = (this.velocity.y / speed) * this.minSpeed;
    }

    // Move boid along the new direction slightly to prevent getting stuck
    this.position.x += this.velocity.x * 0.1;
    this.position.y += this.velocity.y * 0.1;

    // Move boid away from the wall if it's still too close
    if (
      simulation.isPointNearWall(
        this.position.x,
        this.position.y,
        this.collisionRadius
      )
    ) {
      // Push the boid out along the normal vector
      const pushDistance = this.collisionRadius + 1; // Extra 1px for safety
      this.position.x += normal.x * pushDistance;
      this.position.y += normal.y * pushDistance;
    }
  }

  // Apply force to boid's acceleration with smoothing
  applyForce(force) {
    // Apply steering factor based on predator/prey status
    // Predators turn more slowly (lower steering factor)
    const steeringMultiplier = this.steeringFactor;

    // Apply force with gradual influence based on current acceleration
    // and adjusted by the steering factor
    this.acceleration.x += force.x * steeringMultiplier;
    this.acceleration.y += force.y * steeringMultiplier;
  }

  // Calculate separation force - steer to avoid crowding local flockmates
  separation(boids, separationFactor) {
    // Dynamic perception radius based on local density
    const basePerceptionRadius = 30;
    const neighborCount = this.countNeighbors(boids, basePerceptionRadius);
    const perceptionRadius = basePerceptionRadius * (1 + neighborCount * 0.05);

    let steering = { x: 0, y: 0 };
    let total = 0;

    for (const other of boids) {
      if (other !== this) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        const distSquared = dx * dx + dy * dy;
        const dist = Math.sqrt(distSquared);

        if (dist < perceptionRadius) {
          // Improved force calculation with smoother falloff
          // Use inverse square law with squared distance for more natural behavior
          const force = 1 / Math.max(0.5, distSquared);

          // Normalize the direction vector
          const distInv = dist > 0 ? 1 / dist : 0;
          steering.x += dx * distInv * force;
          steering.y += dy * distInv * force;
          total++;
        }
      }
    }

    if (total > 0) {
      steering.x /= total;
      steering.y /= total;

      // Get magnitude of steering vector
      const magnitude = Math.sqrt(
        steering.x * steering.x + steering.y * steering.y
      );

      // Only normalize if vector is not too small
      if (magnitude > 0.001) {
        steering.x = (steering.x / magnitude) * this.maxSpeed;
        steering.y = (steering.y / magnitude) * this.maxSpeed;

        // Subtract current velocity for smoother steering
        steering.x -= this.velocity.x;
        steering.y -= this.velocity.y;

        // Limit the steering force with smoother curve at high densities
        const steerMag = Math.sqrt(
          steering.x * steering.x + steering.y * steering.y
        );

        // Use adaptive force limit based on neighbor count
        const adaptiveForceLimit =
          this.maxForce * (1 + Math.min(0.5, total / 30));

        if (steerMag > adaptiveForceLimit) {
          steering.x = (steering.x / steerMag) * adaptiveForceLimit;
          steering.y = (steering.y / steerMag) * adaptiveForceLimit;
        }
      }
    }

    // Apply separation factor with gradual scaling for dense groups
    const scaledFactor = Math.min(
      separationFactor * (1 + total * 0.02),
      separationFactor * 1.5
    );
    steering.x *= scaledFactor;
    steering.y *= scaledFactor;

    return steering;
  }

  // Calculate alignment force - steer towards the average heading of local flockmates
  alignment(boids, alignmentFactor) {
    // Dynamic perception radius that grows slightly with density
    const basePerceptionRadius = 50;
    const perceptionRadius =
      basePerceptionRadius *
      (1 + this.countNeighbors(boids, basePerceptionRadius) * 0.01);

    let steering = { x: 0, y: 0 };
    let total = 0;

    for (const other of boids) {
      if (other !== this) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < perceptionRadius) {
          steering.x += other.velocity.x;
          steering.y += other.velocity.y;
          total++;
        }
      }
    }

    if (total > 0) {
      steering.x /= total;
      steering.y /= total;

      // Set magnitude to maxSpeed
      const magnitude = Math.sqrt(
        steering.x * steering.x + steering.y * steering.y
      );
      if (magnitude > 0) {
        steering.x = (steering.x / magnitude) * this.maxSpeed;
        steering.y = (steering.y / magnitude) * this.maxSpeed;

        // Subtract current velocity to get steering force
        steering.x -= this.velocity.x;
        steering.y -= this.velocity.y;

        // Limit the steering force
        const steerMag = Math.sqrt(
          steering.x * steering.x + steering.y * steering.y
        );
        if (steerMag > this.maxForce) {
          steering.x = (steering.x / steerMag) * this.maxForce;
          steering.y = (steering.y / steerMag) * this.maxForce;
        }
      }
    }

    // Apply alignment factor
    steering.x *= alignmentFactor;
    steering.y *= alignmentFactor;

    return steering;
  }

  // Calculate cohesion force - steer to move towards the average position of local flockmates
  cohesion(boids, cohesionFactor) {
    // Dynamic perception radius that shrinks slightly with density to prevent over-grouping
    const basePerceptionRadius = 50;
    const neighborCount = this.countNeighbors(boids, basePerceptionRadius);
    const perceptionRadius =
      basePerceptionRadius * Math.max(0.5, 1 - neighborCount * 0.02);

    let steering = { x: 0, y: 0 };
    let center = { x: 0, y: 0 };
    let total = 0;

    for (const other of boids) {
      if (other !== this) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < perceptionRadius) {
          center.x += other.position.x;
          center.y += other.position.y;
          total++;
        }
      }
    }

    if (total > 0) {
      center.x /= total;
      center.y /= total;

      // Vector pointing from current position to the center
      steering.x = center.x - this.position.x;
      steering.y = center.y - this.position.y;

      // Set magnitude to maxSpeed
      const magnitude = Math.sqrt(
        steering.x * steering.x + steering.y * steering.y
      );
      if (magnitude > 0) {
        steering.x = (steering.x / magnitude) * this.maxSpeed;
        steering.y = (steering.y / magnitude) * this.maxSpeed;

        // Subtract current velocity to get steering force
        steering.x -= this.velocity.x;
        steering.y -= this.velocity.y;

        // Limit the steering force
        const steerMag = Math.sqrt(
          steering.x * steering.x + steering.y * steering.y
        );
        if (steerMag > this.maxForce) {
          steering.x = (steering.x / steerMag) * this.maxForce;
          steering.y = (steering.y / steerMag) * this.maxForce;
        }
      }
    }

    // Apply cohesion factor
    steering.x *= cohesionFactor;
    steering.y *= cohesionFactor;

    return steering;
  }

  // Keep boids within the canvas by wrapping around edges
  edges() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (this.position.x > width) this.position.x = 0;
    if (this.position.x < 0) this.position.x = width;
    if (this.position.y > height) this.position.y = 0;
    if (this.position.y < 0) this.position.y = height;
  }

  // Combine all forces and apply to the boid
  flock(boids, separationFactor, alignmentFactor, cohesionFactor) {
    // Calculate forces
    const separation = this.separation(boids, separationFactor);
    const alignment = this.alignment(boids, alignmentFactor);
    const cohesion = this.cohesion(boids, cohesionFactor);

    // Calculate approximate density for adaptive behavior
    const neighborCount = this.countNeighbors(boids, 40);
    const density = neighborCount / 40; // Normalized density

    // Apply forces with adaptive weighting
    // Increase separation in dense areas, reduce cohesion
    const dynamicSepFactor = density > 0.5 ? 1.2 : 1.0;
    const dynamicCohFactor = density > 0.5 ? 0.8 : 1.0;

    this.applyForce({
      x: separation.x * dynamicSepFactor,
      y: separation.y * dynamicSepFactor,
    });
    this.applyForce(alignment);
    this.applyForce({
      x: cohesion.x * dynamicCohFactor,
      y: cohesion.y * dynamicCohFactor,
    });

    // Apply predator-prey behavior
    if (boids.length > 1) {
      if (this.isPredator) {
        // Predators chase nearby prey
        this.chasePrey(boids);
      } else {
        // Normal boids flee from predators
        this.fleeFromPredators(boids);
      }
    }
  }

  // Food seeking method for prey
  seekFood(foodItems) {
    if (this.isPredator || foodItems.length === 0) return;

    const foodDetectionRadius = 120; // How far prey can detect food
    let nearestFood = null;
    let nearestDist = Infinity;

    // Find nearest food within detection range
    for (const food of foodItems) {
      const dx = food.position.x - this.position.x;
      const dy = food.position.y - this.position.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < foodDetectionRadius * foodDetectionRadius && distSquared < nearestDist) {
        nearestDist = distSquared;
        nearestFood = food;
      }
    }

    // Apply attraction force to nearest food
    if (nearestFood) {
      const dx = nearestFood.position.x - this.position.x;
      const dy = nearestFood.position.y - this.position.y;
      const dist = Math.sqrt(nearestDist);

      // Normalize direction and scale by attraction strength
      const attractionStrength = 0.8;
      const proximityFactor = Math.min(1, (foodDetectionRadius - dist) / foodDetectionRadius);
      
      const foodForce = {
        x: (dx / dist) * attractionStrength * proximityFactor,
        y: (dy / dist) * attractionStrength * proximityFactor,
      };

      this.applyForce(foodForce);
    }
  }

  // Check for food collision and consume
  checkFoodCollision(foodItems) {
    if (this.isPredator) return null;

    const consumeRadius = this.size + 4; // Collision radius for food consumption
    const consumeRadiusSquared = consumeRadius * consumeRadius;

    for (let i = 0; i < foodItems.length; i++) {
      const food = foodItems[i];
      const dx = food.position.x - this.position.x;
      const dy = food.position.y - this.position.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < consumeRadiusSquared) {
        // Consume the food - boost health and accelerate reproduction
        this.health += food.nutritionValue;
        
        // Cap health at maximum
        if (this.health > this.maxHealth) {
          this.health = this.maxHealth;
        }

        // Return the index of consumed food for removal
        return i;
      }
    }

    return null;
  }

  // Wall avoidance method
  avoidWalls(simulation) {
    // Wall detection parameters
    const wallDetectionRadius = 20; // How far to look ahead for walls
    const wallAvoidanceStrength = 2.0; // How strongly to avoid walls

    // Look ahead based on current velocity
    const lookAheadX = this.position.x + this.velocity.x * 5;
    const lookAheadY = this.position.y + this.velocity.y * 5;

    // Check if the boid is near any wall
    if (
      simulation.isPointNearWall(lookAheadX, lookAheadY, wallDetectionRadius)
    ) {
      // Get the normal vector to the closest wall
      const normal = simulation.getWallNormal(lookAheadX, lookAheadY);

      // Calculate distance to nearest wall point (approximate)
      const dx = lookAheadX - this.position.x;
      const dy = lookAheadY - this.position.y;
      const distToWall = Math.sqrt(dx * dx + dy * dy); // This is an approximation

      // Calculate avoidance force (stronger when closer)
      const avoidanceForce = Math.min(
        30,
        wallDetectionRadius / Math.max(5, distToWall)
      );

      // Create wall avoidance force vector
      const wallForce = {
        x: normal.x * avoidanceForce * wallAvoidanceStrength,
        y: normal.y * avoidanceForce * wallAvoidanceStrength,
      };

      // Apply the wall avoidance force
      this.applyForce(wallForce);

      // If very close to wall, apply immediate corrective force
      if (simulation.isPointNearWall(this.position.x, this.position.y, 5)) {
        // Stronger immediate avoidance
        this.velocity.x += normal.x * 0.5;
        this.velocity.y += normal.y * 0.5;
      }
    }
  }

  // Cursor avoidance method
  avoidCursor(simulation) {
    // First check if cursor is even on the canvas
    if (simulation.cursorPosition.x < 0 || simulation.cursorPosition.y < 0) {
      return;
    }

    // Directly calculate distance to cursor
    const dx = simulation.cursorPosition.x - this.position.x;
    const dy = simulation.cursorPosition.y - this.position.y;
    const distToCursor = Math.sqrt(dx * dx + dy * dy);

    // Return early if cursor is very far away (optimization)
    if (distToCursor > 200) {
      return;
    }

    // If within the detection radius, apply avoidance force
    if (distToCursor < simulation.cursorRadius * 1.5) {
      // Calculate normalized vector pointing away from cursor
      const nx = -dx / distToCursor;
      const ny = -dy / distToCursor;

      // Stronger force when closer to cursor (inverse square law)
      const forceMagnitude =
        5.0 * (simulation.cursorRadius / Math.max(10, distToCursor));

      // Apply avoidance force with high priority
      const force = {
        x: nx * forceMagnitude * simulation.cursorAvoidStrength,
        y: ny * forceMagnitude * simulation.cursorAvoidStrength,
      };

      this.applyForce({
        x: force.x,
        y: force.y,
      });
    }
  }

  // Method for predators to chase prey
  chasePrey(boids) {
    if (!this.isPredator || this.huntingCooldown > 0) return;

    let nearestPreyDist = Infinity;
    let nearestPrey = null;
    let chaseVector = { x: 0, y: 0 };

    // Find the nearest prey
    for (const other of boids) {
      if (other === this || other.isPredator) continue; // Skip self and other predators

      const dx = other.position.x - this.position.x;
      const dy = other.position.y - this.position.y;
      const distSquared = dx * dx + dy * dy;

      // Only consider prey within detection range
      if (distSquared < this.preyDetectionRadius * this.preyDetectionRadius) {
        if (distSquared < nearestPreyDist) {
          nearestPreyDist = distSquared;
          nearestPrey = other;

          // Calculate normalized direction vector to prey
          const dist = Math.sqrt(distSquared);
          if (dist > 0) {
            chaseVector.x = dx / dist;
            chaseVector.y = dy / dist;
          }
        }
      }
    }

    // If found prey, apply chase force
    if (nearestPrey) {
      // Stronger chase force when closer to prey (inverse square law)
      const chaseStrength =
        this.predatorChaseStrength *
        (1 +
          (this.preyDetectionRadius - Math.sqrt(nearestPreyDist)) /
            this.preyDetectionRadius);

      const chaseForce = {
        x: chaseVector.x * this.maxSpeed * chaseStrength,
        y: chaseVector.y * this.maxSpeed * chaseStrength,
      };

      // Subtract current velocity to get steering force
      chaseForce.x -= this.velocity.x;
      chaseForce.y -= this.velocity.y;

      // Limit the chase force
      const forceMag = Math.sqrt(
        chaseForce.x * chaseForce.x + chaseForce.y * chaseForce.y
      );
      if (forceMag > this.maxForce * 2) {
        // Allow stronger chase forces
        chaseForce.x = (chaseForce.x / forceMag) * this.maxForce * 2;
        chaseForce.y = (chaseForce.y / forceMag) * this.maxForce * 2;
      }

      // Apply the chase force
      this.applyForce(chaseForce);

      // Check for collision with prey
      this.checkPreyCollision(nearestPrey, nearestPreyDist);
    }
  }

  // Method for normal boids to flee from predators
  fleeFromPredators(boids) {
    if (this.isPredator) return; // Only prey flee

    let fleeVector = { x: 0, y: 0 };
    let nearestPredatorDist = Infinity;
    let predatorCount = 0;

    // Check all nearby predators
    for (const other of boids) {
      if (other === this || !other.isPredator) continue; // Skip self and non-predators

      const dx = this.position.x - other.position.x; // Note: reversed direction - away from predator
      const dy = this.position.y - other.position.y;
      const distSquared = dx * dx + dy * dy;

      // Only consider predators within detection range
      if (
        distSquared <
        this.predatorDetectionRadius * this.predatorDetectionRadius
      ) {
        predatorCount++;

        // Normalize flee vector
        const dist = Math.sqrt(distSquared);
        if (dist > 0) {
          // Weight: stronger response to closer predators
          const weight = 1 / Math.max(0.1, distSquared);

          // Add to flee vector (weighted by inverse squared distance)
          fleeVector.x += (dx / dist) * weight;
          fleeVector.y += (dy / dist) * weight;

          // Track nearest predator
          if (distSquared < nearestPredatorDist) {
            nearestPredatorDist = distSquared;
          }
        }
      }
    }

    // Apply flee force if predators are nearby
    if (predatorCount > 0) {
      // Normalize the flee vector
      const magnitude = Math.sqrt(
        fleeVector.x * fleeVector.x + fleeVector.y * fleeVector.y
      );
      if (magnitude > 0) {
        // Scale by max speed and flee strength
        fleeVector.x =
          (fleeVector.x / magnitude) *
          this.maxSpeed *
          this.predatorFleeStrength;
        fleeVector.y =
          (fleeVector.y / magnitude) *
          this.maxSpeed *
          this.predatorFleeStrength;

        // Subtract current velocity to get steering force
        fleeVector.x -= this.velocity.x;
        fleeVector.y -= this.velocity.y;

        // Limit the flee force but allow it to be stronger than normal steering
        const fleeMag = Math.sqrt(
          fleeVector.x * fleeVector.x + fleeVector.y * fleeVector.y
        );
        if (fleeMag > this.maxForce * 3) {
          // Allow stronger flee forces
          fleeVector.x = (fleeVector.x / fleeMag) * this.maxForce * 3;
          fleeVector.y = (fleeVector.y / fleeMag) * this.maxForce * 3;
        }

        // Scale force by proximity - more urgent when predator is very close
        const proximityFactor =
          1 +
          ((this.predatorDetectionRadius - Math.sqrt(nearestPredatorDist)) /
            this.predatorDetectionRadius) *
            2;

        fleeVector.x *= proximityFactor;
        fleeVector.y *= proximityFactor;

        // Apply the flee force
        this.applyForce(fleeVector);
      }
    }
  }

  // Check if this predator collides with prey
  checkPreyCollision(prey, distSquared) {
    if (!this.isPredator || this.huntingCooldown > 0 || !prey) return false;

    // Collision radius is sum of both boid sizes
    const collisionRadiusSq = Math.pow(this.size + prey.size, 2);

    // If predator is touching prey, mark prey for death
    if (distSquared <= collisionRadiusSq) {
      prey.killed = true;

      // Predator gains health from killing prey
      this.health += this.healthGainPerKill;

      // Cap health at maximum
      if (this.health > this.maxHealth) {
        this.health = this.maxHealth;
      }

      // Add cooldown to prevent immediate chasing of next prey
      this.huntingCooldown = 30; // frames cooldown

      return true;
    }

    return false;
  }

  // Calculate color based on boid properties
  getColor() {
    // Calculate health percentage for visual indicator
    const healthPercentage = this.health / this.maxHealth;

    // Predator boids use a red hue
    if (this.isPredator) {
      // Calculate current speed for saturation
      const speed = Math.sqrt(
        this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
      );

      // Normalize speed (0 to 1)
      const normalizedSpeed = Math.min(speed / this.maxSpeed, 1.0);

      // Fixed hue for predators (red)
      const hue = 0;

      // Calculate saturation based on speed
      const saturation = 70 + normalizedSpeed * 30;

      // Calculate lightness - use health percentage to impact lightness
      // Healthy predators are bright, dying ones are dark
      const baseLight = 40 + (1 - this.position.y / this.canvas.height) * 30;
      const lightness = healthPercentage * baseLight;

      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    } else {
      // Normal boid color calculation with health indicator
      const speed = Math.sqrt(
        this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
      );

      // Normalize speed (0 to 1)
      const normalizedSpeed = Math.min(speed / this.maxSpeed, 1.0);

      // Calculate saturation based on speed
      const saturation = 30 + normalizedSpeed * 40;

      // Apply a subtle hue shift based on horizontal position
      const normalizedX = this.position.x / this.canvas.width;
      const hueShift = (normalizedX - 0.5) * 20; // -10 to +10 degree shift
      const adjustedHue = (this.hue + hueShift + 360) % 360;

      // Health affects lightness - low health boids are darker
      const baseLight = 30 + (1 - this.position.y / this.canvas.height) * 50;
      const lightness = healthPercentage * baseLight;

      // Return the final HSL color
      return `hsl(${adjustedHue}, ${saturation}%, ${lightness}%)`;
    }
  }

  // Count nearby neighbors for flock position awareness
  countNeighbors(boids, radius = 50) {
    let count = 0;
    for (const other of boids) {
      if (other !== this) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < radius) {
          count++;
        }
      }
    }
    return count;
  }

  // Draw the boid on the canvas with neighbor awareness
  draw(ctx, boids) {
    // Save the current context state
    ctx.save();

    // Translate to the boid's position
    ctx.translate(this.position.x, this.position.y);

    // Rotate to match the boid's velocity direction
    const angle = Math.atan2(this.velocity.y, this.velocity.x);
    ctx.rotate(angle);

    // Get dynamic color based on boid properties
    let dynamicColor = this.getColor();

    // Get neighbor count for size adjustment
    const neighborCount = this.countNeighbors(boids);
    const sizeMultiplier = this.isPredator
      ? 1.2 // Predators are slightly larger
      : Math.min(1 + neighborCount / 20, 1.5); // Max 50% larger based on neighbor count

    // Draw the boid as a triangle with dynamic size
    ctx.beginPath();
    ctx.fillStyle = dynamicColor;

    // Create path for the triangle
    ctx.moveTo(this.size * 2 * sizeMultiplier, 0); // Nose
    ctx.lineTo(-this.size * sizeMultiplier, this.size * sizeMultiplier); // Left tail
    ctx.lineTo(-this.size * sizeMultiplier, -this.size * sizeMultiplier); // Right tail
    ctx.closePath();

    // Fill the triangle
    ctx.fill();

    // Add a stroke - red for predators, subtle for normal boids
    if (this.isPredator) {
      ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = dynamicColor;
      ctx.lineWidth = 0.5;
    }
    ctx.lineJoin = "round";
    ctx.stroke();

    // Add indicator for reproduction readiness
    if (this.readyToReproduce) {
      // Draw a glowing circle around the boid to indicate it's ready to reproduce
      ctx.beginPath();

      // Color based on predator status
      if (this.isPredator) {
        ctx.fillStyle = "rgba(255, 120, 120, 0.4)"; // Soft red glow for predators
      } else {
        ctx.fillStyle = "rgba(150, 255, 150, 0.4)"; // Soft green glow for prey
      }

      // Draw circle slightly larger than the boid
      const glowRadius = this.size * 2.5 * sizeMultiplier;
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Restore the context state
    ctx.restore();
  }
}

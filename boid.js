const PREY_STEERING_FACTOR = 1.6;
const PREDATOR_STEERING_FACTOR = 0.9;
const PREY_MAX_SPEED = 3.2;
const PREDATOR_MAX_SPEED = 4.5;

class Boid {
  constructor(x, y, canvas) {
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
    this.maxForce = 0.1;
    this.maxSpeed = 3.5;
    this.minSpeed = 1.0; // prevent stalling
    this.size = 5;
    this.canvas = canvas;

    this.prevVelocity = { x: 0, y: 0 };

    this.collisionRadius = this.size * 0.8;
    this.restitution = 0.6;

    this.hue = Math.floor(Math.random() * 360);

    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
    );
    this.velocity.x = (this.velocity.x / speed) * this.maxSpeed * 0.5;
    this.velocity.y = (this.velocity.y / speed) * this.maxSpeed * 0.5;

    this.trail = [];

    this.isPredator = false;
    this.predatorDetectionRadius = 100; // how far prey can detect predators
    this.preyDetectionRadius = 150; // how far predators can detect prey
    this.predatorChaseStrength = 1.2;
    this.predatorFleeStrength = 2.0;
    this.huntingCooldown = 0;
    this.steeringFactor = 1.0;

    this.health = this.isPredator ? 80 : 75;
    this.maxHealth = this.isPredator ? 150 : 100;
    this.healthDecayRate = this.isPredator ? 0.12 : 0.03;
    this.killed = false;

    this.reproductionThreshold = this.isPredator ? 120 : 85;
    this.reproductionCost = this.isPredator ? 60 : 50;
    this.reproductionCooldown = this.isPredator ? 0 : 100;
    this.readyToReproduce = false;

    this.healthGainPerKill = 45;
    this.foodGenerationRate = this.isPredator ? 0 : 0.04;
  }

  update(timeScale = 1.0) {
    this.prevVelocity.x = this.velocity.x;
    this.prevVelocity.y = this.velocity.y;

    this.velocity.x += this.acceleration.x * timeScale;
    this.velocity.y += this.acceleration.y * timeScale;

    // Blend with previous velocity for smoothing
    const smoothingFactor = 0.3;
    this.velocity.x = this.velocity.x * (1 - smoothingFactor) + this.prevVelocity.x * smoothingFactor;
    this.velocity.y = this.velocity.y * (1 - smoothingFactor) + this.prevVelocity.y * smoothingFactor;

    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);

    if (speed > this.maxSpeed) {
      this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
      this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
    } else if (speed < this.minSpeed && speed > 0) {
      this.velocity.x = (this.velocity.x / speed) * this.minSpeed;
      this.velocity.y = (this.velocity.y / speed) * this.minSpeed;
    }

    const nextX = this.position.x + this.velocity.x * timeScale;
    const nextY = this.position.y + this.velocity.y * timeScale;

    if (!this.checkWallCollision(nextX, nextY)) {
      this.position.x = nextX;
      this.position.y = nextY;
    }

    this.acceleration.x = 0;
    this.acceleration.y = 0;

    this.edges();

    if (this.huntingCooldown > 0) this.huntingCooldown -= timeScale;
    if (this.reproductionCooldown > 0) this.reproductionCooldown -= timeScale;

    this.updateHealth(timeScale);
    this.checkReproduction();
  }

  updateHealth(timeScale) {
    this.health -= this.healthDecayRate * timeScale;

    if (!this.isPredator) {
      this.health += this.foodGenerationRate * timeScale;
    }

    if (this.health > this.maxHealth) {
      this.health = this.maxHealth;
    }

    if (this.health <= 0) {
      this.killed = true;
    }
  }

  checkReproduction() {
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

  reproduce() {
    if (!this.readyToReproduce) {
      return null;
    }

    this.health -= this.reproductionCost;
    this.readyToReproduce = false;
    this.reproductionCooldown = this.isPredator ? 300 : 150;

    const offspring = new Boid(
      this.position.x + (Math.random() - 0.5) * 10,
      this.position.y + (Math.random() - 0.5) * 10,
      this.canvas
    );

    offspring.isPredator = this.isPredator;

    if (offspring.isPredator) {
      offspring.health = 80;
      offspring.maxHealth = 150;
      offspring.healthDecayRate = 0.12;
      offspring.reproductionThreshold = 120;
      offspring.reproductionCost = 60;
      offspring.foodGenerationRate = 0;
      offspring.maxSpeed = PREDATOR_MAX_SPEED;
      offspring.steeringFactor = PREDATOR_STEERING_FACTOR;
    } else {
      offspring.maxSpeed = PREY_MAX_SPEED;
      offspring.steeringFactor = PREY_STEERING_FACTOR;
    }

    return offspring;
  }

  checkWallCollision(nextX, nextY, simulation) {
    if (!simulation && window.simulation) {
      simulation = window.simulation;
    }
    if (!simulation) return false;

    if (simulation.isPointNearWall(nextX, nextY, this.collisionRadius)) {
      this.handleWallCollision(simulation);
      return true;
    }

    // For fast-moving boids, check intermediate points to avoid tunnelling
    const moveDistSq = (nextX - this.position.x) ** 2 + (nextY - this.position.y) ** 2;
    if (moveDistSq > this.collisionRadius ** 2) {
      const steps = Math.ceil(Math.sqrt(moveDistSq) / (this.collisionRadius * 0.5));
      const stepX = (nextX - this.position.x) / steps;
      const stepY = (nextY - this.position.y) / steps;

      for (let i = 1; i < steps; i++) {
        if (simulation.isPointNearWall(
          this.position.x + stepX * i,
          this.position.y + stepY * i,
          this.collisionRadius
        )) {
          this.handleWallCollision(simulation);
          return true;
        }
      }
    }

    return false;
  }

  handleWallCollision(simulation) {
    const normal = simulation.getWallNormal(this.position.x, this.position.y);
    const dot = this.velocity.x * normal.x + this.velocity.y * normal.y;

    // Reflect velocity: v' = v - 2(v·n)n
    this.velocity.x = (this.velocity.x - 2 * dot * normal.x) * this.restitution;
    this.velocity.y = (this.velocity.y - 2 * dot * normal.y) * this.restitution;

    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
    if (speed < this.minSpeed) {
      this.velocity.x = (this.velocity.x / speed) * this.minSpeed;
      this.velocity.y = (this.velocity.y / speed) * this.minSpeed;
    }

    this.position.x += this.velocity.x * 0.1;
    this.position.y += this.velocity.y * 0.1;

    if (simulation.isPointNearWall(this.position.x, this.position.y, this.collisionRadius)) {
      this.position.x += normal.x * (this.collisionRadius + 1);
      this.position.y += normal.y * (this.collisionRadius + 1);
    }
  }

  applyForce(force) {
    this.acceleration.x += force.x * this.steeringFactor;
    this.acceleration.y += force.y * this.steeringFactor;
  }

  separation(boids, separationFactor) {
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
          const force = 1 / Math.max(0.5, distSquared);
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

      const magnitude = Math.sqrt(steering.x ** 2 + steering.y ** 2);

      if (magnitude > 0.001) {
        steering.x = (steering.x / magnitude) * this.maxSpeed;
        steering.y = (steering.y / magnitude) * this.maxSpeed;

        steering.x -= this.velocity.x;
        steering.y -= this.velocity.y;

        const steerMag = Math.sqrt(steering.x ** 2 + steering.y ** 2);
        const adaptiveForceLimit = this.maxForce * (1 + Math.min(0.5, total / 30));

        if (steerMag > adaptiveForceLimit) {
          steering.x = (steering.x / steerMag) * adaptiveForceLimit;
          steering.y = (steering.y / steerMag) * adaptiveForceLimit;
        }
      }
    }

    const scaledFactor = Math.min(separationFactor * (1 + total * 0.02), separationFactor * 1.5);
    steering.x *= scaledFactor;
    steering.y *= scaledFactor;

    return steering;
  }

  alignment(boids, alignmentFactor) {
    const basePerceptionRadius = 50;
    const perceptionRadius = basePerceptionRadius * (1 + this.countNeighbors(boids, basePerceptionRadius) * 0.01);

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

      const magnitude = Math.sqrt(steering.x ** 2 + steering.y ** 2);
      if (magnitude > 0) {
        steering.x = (steering.x / magnitude) * this.maxSpeed;
        steering.y = (steering.y / magnitude) * this.maxSpeed;

        steering.x -= this.velocity.x;
        steering.y -= this.velocity.y;

        const steerMag = Math.sqrt(steering.x ** 2 + steering.y ** 2);
        if (steerMag > this.maxForce) {
          steering.x = (steering.x / steerMag) * this.maxForce;
          steering.y = (steering.y / steerMag) * this.maxForce;
        }
      }
    }

    steering.x *= alignmentFactor;
    steering.y *= alignmentFactor;

    return steering;
  }

  cohesion(boids, cohesionFactor) {
    const basePerceptionRadius = 50;
    const neighborCount = this.countNeighbors(boids, basePerceptionRadius);
    const perceptionRadius = basePerceptionRadius * Math.max(0.5, 1 - neighborCount * 0.02);

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
    const width = this.canvas.logicalWidth;
    const height = this.canvas.logicalHeight;

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

    if (boids.length > 1) {
      if (this.isPredator) {
        this.chasePrey(boids);
      } else {
        this.fleeFromPredators(boids);
      }
    }
  }

  seekFood(foodItems) {
    if (this.isPredator || foodItems.length === 0) return;

    const foodDetectionRadius = 120;
    let nearestFood = null;
    let nearestDist = Infinity;

    for (const food of foodItems) {
      const dx = food.position.x - this.position.x;
      const dy = food.position.y - this.position.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < foodDetectionRadius ** 2 && distSquared < nearestDist) {
        nearestDist = distSquared;
        nearestFood = food;
      }
    }

    if (nearestFood) {
      const dx = nearestFood.position.x - this.position.x;
      const dy = nearestFood.position.y - this.position.y;
      const dist = Math.sqrt(nearestDist);
      const attractionStrength = 0.8;
      const proximityFactor = Math.min(1, (foodDetectionRadius - dist) / foodDetectionRadius);

      this.applyForce({
        x: (dx / dist) * attractionStrength * proximityFactor,
        y: (dy / dist) * attractionStrength * proximityFactor,
      });
    }
  }

  checkFoodCollision(foodItems) {
    if (this.isPredator) return null;

    const consumeRadiusSq = (this.size + 4) ** 2;

    for (let i = 0; i < foodItems.length; i++) {
      const food = foodItems[i];
      const dx = food.position.x - this.position.x;
      const dy = food.position.y - this.position.y;

      if (dx * dx + dy * dy < consumeRadiusSq) {
        this.health = Math.min(this.health + food.nutritionValue, this.maxHealth);
        return i;
      }
    }

    return null;
  }

  avoidWalls(simulation) {
    const wallDetectionRadius = 20;
    const wallAvoidanceStrength = 2.0;
    const lookAheadX = this.position.x + this.velocity.x * 5;
    const lookAheadY = this.position.y + this.velocity.y * 5;

    if (simulation.isPointNearWall(lookAheadX, lookAheadY, wallDetectionRadius)) {
      const normal = simulation.getWallNormal(lookAheadX, lookAheadY);
      const dx = lookAheadX - this.position.x;
      const dy = lookAheadY - this.position.y;
      const distToWall = Math.sqrt(dx * dx + dy * dy);
      const avoidanceForce = Math.min(30, wallDetectionRadius / Math.max(5, distToWall));

      this.applyForce({
        x: normal.x * avoidanceForce * wallAvoidanceStrength,
        y: normal.y * avoidanceForce * wallAvoidanceStrength,
      });

      if (simulation.isPointNearWall(this.position.x, this.position.y, 5)) {
        this.velocity.x += normal.x * 0.5;
        this.velocity.y += normal.y * 0.5;
      }
    }
  }

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

      const forceMagnitude = 5.0 * (simulation.cursorRadius / Math.max(10, distToCursor));

      this.applyForce({
        x: nx * forceMagnitude * simulation.cursorAvoidStrength,
        y: ny * forceMagnitude * simulation.cursorAvoidStrength,
      });
    }
  }

  chasePrey(boids) {
    if (!this.isPredator || this.huntingCooldown > 0) return;

    let nearestPreyDist = Infinity;
    let nearestPrey = null;
    let chaseDir = { x: 0, y: 0 };

    for (const other of boids) {
      if (other === this || other.isPredator) continue;

      const dx = other.position.x - this.position.x;
      const dy = other.position.y - this.position.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < this.preyDetectionRadius ** 2 && distSquared < nearestPreyDist) {
        nearestPreyDist = distSquared;
        nearestPrey = other;

        const dist = Math.sqrt(distSquared);
        if (dist > 0) {
          chaseDir.x = dx / dist;
          chaseDir.y = dy / dist;
        }
      }
    }

    if (nearestPrey) {
      const chaseStrength = this.predatorChaseStrength *
        (1 + (this.preyDetectionRadius - Math.sqrt(nearestPreyDist)) / this.preyDetectionRadius);

      const chaseForce = {
        x: chaseDir.x * this.maxSpeed * chaseStrength - this.velocity.x,
        y: chaseDir.y * this.maxSpeed * chaseStrength - this.velocity.y,
      };

      const forceMag = Math.sqrt(chaseForce.x ** 2 + chaseForce.y ** 2);
      if (forceMag > this.maxForce * 2) {
        chaseForce.x = (chaseForce.x / forceMag) * this.maxForce * 2;
        chaseForce.y = (chaseForce.y / forceMag) * this.maxForce * 2;
      }

      this.applyForce(chaseForce);
      this.checkPreyCollision(nearestPrey, nearestPreyDist);
    }
  }

  fleeFromPredators(boids) {
    if (this.isPredator) return;

    let fleeVector = { x: 0, y: 0 };
    let nearestPredatorDist = Infinity;
    let predatorCount = 0;

    for (const other of boids) {
      if (other === this || !other.isPredator) continue;

      const dx = this.position.x - other.position.x;
      const dy = this.position.y - other.position.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < this.predatorDetectionRadius ** 2) {
        predatorCount++;

        const dist = Math.sqrt(distSquared);
        if (dist > 0) {
          const weight = 1 / Math.max(0.1, distSquared);
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
      const magnitude = Math.sqrt(fleeVector.x ** 2 + fleeVector.y ** 2);
      if (magnitude > 0) {
        fleeVector.x = (fleeVector.x / magnitude) * this.maxSpeed * this.predatorFleeStrength;
        fleeVector.y = (fleeVector.y / magnitude) * this.maxSpeed * this.predatorFleeStrength;

        fleeVector.x -= this.velocity.x;
        fleeVector.y -= this.velocity.y;

        const fleeMag = Math.sqrt(fleeVector.x ** 2 + fleeVector.y ** 2);
        if (fleeMag > this.maxForce * 3) {
          fleeVector.x = (fleeVector.x / fleeMag) * this.maxForce * 3;
          fleeVector.y = (fleeVector.y / fleeMag) * this.maxForce * 3;
        }

        const proximityFactor = 1 +
          ((this.predatorDetectionRadius - Math.sqrt(nearestPredatorDist)) /
            this.predatorDetectionRadius) * 2;

        fleeVector.x *= proximityFactor;
        fleeVector.y *= proximityFactor;

        this.applyForce(fleeVector);
      }
    }
  }

  checkPreyCollision(prey, distSquared) {
    if (!this.isPredator || this.huntingCooldown > 0 || !prey) return false;

    if (distSquared <= (this.size + prey.size) ** 2) {
      prey.killed = true;
      this.health = Math.min(this.health + this.healthGainPerKill, this.maxHealth);
      this.huntingCooldown = 30;
      return true;
    }

    return false;
  }

  getColor() {
    const healthPercentage = this.health / this.maxHealth;

    if (this.isPredator) {
      const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
      const normalizedSpeed = Math.min(speed / this.maxSpeed, 1.0);
      const saturation = 70 + normalizedSpeed * 30;
      const baseLight = 40 + (1 - this.position.y / this.canvas.logicalHeight) * 30;
      const lightness = healthPercentage * baseLight;

      return `hsl(0, ${saturation}%, ${lightness}%)`;
    } else {
      const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
      const normalizedSpeed = Math.min(speed / this.maxSpeed, 1.0);
      const saturation = 30 + normalizedSpeed * 40;
      const hueShift = (this.position.x / this.canvas.logicalWidth - 0.5) * 20;
      const adjustedHue = (this.hue + hueShift + 360) % 360;
      const baseLight = 30 + (1 - this.position.y / this.canvas.logicalHeight) * 50;
      const lightness = healthPercentage * baseLight;

      return `hsl(${adjustedHue}, ${saturation}%, ${lightness}%)`;
    }
  }

  countNeighbors(boids, radius = 50) {
    let count = 0;
    for (const other of boids) {
      if (other !== this) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < radius) count++;
      }
    }
    return count;
  }

  draw(ctx, boids) {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));

    const dynamicColor = this.getColor();
    const neighborCount = this.countNeighbors(boids);
    const sizeMultiplier = this.isPredator
      ? 1.2
      : Math.min(1 + neighborCount / 20, 1.5);

    ctx.beginPath();
    ctx.fillStyle = dynamicColor;
    ctx.moveTo(this.size * 2 * sizeMultiplier, 0);
    ctx.lineTo(-this.size * sizeMultiplier, this.size * sizeMultiplier);
    ctx.lineTo(-this.size * sizeMultiplier, -this.size * sizeMultiplier);
    ctx.closePath();

    ctx.fill();

    ctx.strokeStyle = this.isPredator ? "rgba(255, 0, 0, 0.8)" : dynamicColor;
    ctx.lineWidth = this.isPredator ? 1.5 : 0.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    if (this.readyToReproduce) {
      ctx.beginPath();
      ctx.fillStyle = this.isPredator ? "rgba(255, 120, 120, 0.4)" : "rgba(150, 255, 150, 0.4)";
      ctx.arc(0, 0, this.size * 2.5 * sizeMultiplier, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export { Boid, PREY_MAX_SPEED, PREDATOR_MAX_SPEED, PREY_STEERING_FACTOR, PREDATOR_STEERING_FACTOR };

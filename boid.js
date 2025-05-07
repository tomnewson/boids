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

    // Add color properties
    this.hue = Math.floor(Math.random() * 360); // Random hue between 0-359
    this.baseColor = `hsl(${this.hue}, 100%, 50%)`; // Base HSL color with full saturation and medium lightness

    // Normalize initial velocity
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
    );
    this.velocity.x = (this.velocity.x / speed) * this.maxSpeed * 0.5;
    this.velocity.y = (this.velocity.y / speed) * this.maxSpeed * 0.5;
  }

  // Update boid's position based on its velocity and acceleration
  update(timeScale = 1.0) {
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

    // Update position based on velocity with time scaling
    this.position.x += this.velocity.x * timeScale;
    this.position.y += this.velocity.y * timeScale;

    // Reset acceleration
    this.acceleration.x = 0;
    this.acceleration.y = 0;

    // Wrap around edges
    this.edges();
  }

  // Apply force to boid's acceleration with smoothing
  applyForce(force) {
    // Apply force with gradual influence based on current acceleration
    this.acceleration.x += force.x;
    this.acceleration.y += force.y;
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

  // Calculate color based on boid properties
  getColor() {
    // Calculate current speed
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
    );

    // Normalize speed (0 to 1)
    const normalizedSpeed = Math.min(speed / this.maxSpeed, 1.0);

    // Calculate saturation based on speed (faster = more saturated)
    // Changed from 50-100% to 30-70% for lower saturation values
    const saturation = 30 + normalizedSpeed * 40;

    // Calculate lightness based on height (higher = brighter)
    const normalizedHeight = this.position.y / this.canvas.height;
    const lightness = 30 + (1 - normalizedHeight) * 50; // Higher boids (lower y values) are brighter (30% to 80%)

    // Apply a subtle hue shift based on horizontal position
    // This keeps the base hue but adds a slight shift (-10 to +10 degrees)
    const normalizedX = this.position.x / this.canvas.width;
    const hueShift = (normalizedX - 0.5) * 20; // -10 to +10 degree shift
    const adjustedHue = (this.hue + hueShift + 360) % 360; // Ensure it stays in 0-359 range

    // Return the final HSL color
    return `hsl(${adjustedHue}, ${saturation}%, ${lightness}%)`;
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
    const sizeMultiplier = Math.min(1 + neighborCount / 20, 1.5); // Max 50% larger based on neighbor count

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

    // Add a very subtle stroke with same color but slightly transparent
    // This helps with anti-aliasing the edges
    ctx.strokeStyle = dynamicColor;
    ctx.lineWidth = 0.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Restore the context state
    ctx.restore();
  }
}

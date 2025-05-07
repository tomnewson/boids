class Simulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.boids = [];
    this.running = true;
    this.separationFactor = 1.5;
    this.alignmentFactor = 1.0;
    this.cohesionFactor = 1.0;

    // Add cursor tracking with more subtle parameters
    this.cursorPosition = { x: -100, y: -100 }; // Start off-screen
    this.cursorRadius = 20; // Reduced from 60 to 40
    this.cursorAvoidStrength = 0.1; // Reduced from 3.5 to 1.8 for less noticeable avoidance

    // Wall drawing functionality
    this.walls = []; // Array to store wall points
    this.drawingWalls = true; // Always enabled since it's the only mode
    this.currentWall = null; // Current wall being drawn
    this.wallBrushSize = 8; // Wall brush size in pixels
    this.wallColor = "#ffffff"; // Wall color (white)
    this.lastDrawPoint = null; // Last point where brush was drawn
    this.minDrawDistance = 2; // Significantly reduced for continuous walls
    this.eraserMode = false; // Track if we're in eraser mode
    this.eraserSize = 16; // Size of eraser (slightly larger than draw brush)

    // Set cursor to crosshair by default since drawing is always enabled
    this.canvas.style.cursor = "crosshair";

    // Audio system initialization
    this.audioEngine = new AudioEngine();
    this.audioEnabled = false; // Keep audio off by default
    this.audioTriggerCount = 0;
    this.audioTriggerInterval = 8; // Trigger sound every N frames

    // Note: AudioContext will be initialized only when audio toggle button is clicked

    // Set canvas dimensions
    this.resizeCanvas();

    // Create initial boids
    this.initBoids(100);

    // Set up wall drawing event listeners
    this.setupWallDrawing();

    // Add cursor tracking listener
    this.setupCursorTracking();

    // Start animation loop
    this.animate();

    // Handle window resize
    window.addEventListener("resize", () => {
      this.resizeCanvas();
    });
  }

  // Resize canvas to fill its container
  resizeCanvas() {
    const container = this.canvas.parentElement;
    // Use full window dimensions
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // Handle window resize events
  handleResize(width, height) {
    // Update canvas dimensions
    this.canvas.width = width;
    this.canvas.height = height;

    // Keep boids within the new canvas bounds
    for (const boid of this.boids) {
      if (boid.position.x > width) boid.position.x = width - 10;
      if (boid.position.y > height) boid.position.y = height - 10;
    }
  }

  // Create initial boids
  initBoids(count) {
    this.boids = [];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.canvas.width;
      const y = Math.random() * this.canvas.height;
      this.boids.push(new Boid(x, y, this.canvas));
    }
  }

  // Reset the simulation
  reset() {
    this.initBoids(100);
  }

  // Update parameters
  updateParams(separation, alignment, cohesion) {
    this.separationFactor = separation;
    this.alignmentFactor = alignment;
    this.cohesionFactor = cohesion;
  }

  // Get accurate canvas coordinates from mouse event
  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();

    // Calculate the scaling ratio of the canvas
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    // Apply scaling to the mouse coordinates
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    return { x, y };
  }

  // Setup wall drawing event listeners
  setupWallDrawing() {
    this.canvas.addEventListener("mousedown", (e) => {
      if (!this.drawingWalls) return;

      const coords = this.getCanvasCoordinates(e);

      if (this.eraserMode) {
        // In eraser mode, we immediately erase at this point
        this.eraseWallsAt(coords.x, coords.y);
      } else {
        // In draw mode, start a new wall
        this.currentWall = [];
        this.lastDrawPoint = coords;

        // Add first point
        this.addWallPoint(coords.x, coords.y);
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.drawingWalls) return;

      const coords = this.getCanvasCoordinates(e);

      if (this.eraserMode) {
        // Only erase if mouse is pressed (button is being held down)
        if (e.buttons > 0) {
          this.eraseWallsAt(coords.x, coords.y);
        }
      } else if (this.currentWall) {
        // In draw mode, continue drawing the current wall
        // Calculate distance from last point
        const dx = coords.x - this.lastDrawPoint.x;
        const dy = coords.y - this.lastDrawPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Add points continuously for a solid wall
        if (distance >= this.minDrawDistance) {
          // For a continuous wall, always add intermediate points
          const steps = Math.max(Math.ceil(distance / this.minDrawDistance), 1);

          for (let i = 1; i <= steps; i++) {
            const ratio = i / steps;
            const interpX = this.lastDrawPoint.x + dx * ratio;
            const interpY = this.lastDrawPoint.y + dy * ratio;
            this.addWallPoint(interpX, interpY);
          }

          this.lastDrawPoint = coords;
        }
      }
    });

    this.canvas.addEventListener("mouseup", () => {
      if (!this.drawingWalls || !this.currentWall) return;

      // Finalize the wall - only keep if it has some points
      if (this.currentWall.length > 1) {
        this.walls.push(this.currentWall);
      }

      this.currentWall = null;
      this.lastDrawPoint = null;
    });

    // Also handle mouse leaving canvas
    this.canvas.addEventListener("mouseleave", () => {
      if (!this.drawingWalls || !this.currentWall) return;

      if (this.currentWall.length > 1) {
        this.walls.push(this.currentWall);
      }

      this.currentWall = null;
      this.lastDrawPoint = null;
    });
  }

  // Add a point to the current wall
  addWallPoint(x, y) {
    // Use consistent size for pixel-like effect
    const pointSize = this.wallBrushSize;

    this.currentWall.push({
      x,
      y,
      size: pointSize,
    });
  }

  // Toggle wall drawing mode
  toggleWallDrawing() {
    this.drawingWalls = !this.drawingWalls;
    // Change cursor style based on mode
    this.canvas.style.cursor = this.drawingWalls ? "crosshair" : "default";
    return this.drawingWalls;
  }

  // Toggle eraser mode
  toggleEraserMode() {
    this.eraserMode = !this.eraserMode;

    // Update cursor based on mode
    if (this.eraserMode) {
      this.canvas.style.cursor =
        'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23ff000055"/></svg>\') 12 12, auto';
    } else {
      this.canvas.style.cursor = "crosshair";
    }

    return this.eraserMode;
  }

  // Erase wall points at the given coordinates
  eraseWallsAt(x, y) {
    const eraseRadiusSquared = Math.pow(this.eraserSize, 2);
    let modified = false;

    // Check each wall collection
    for (let w = 0; w < this.walls.length; w++) {
      // Filter out points that are within the eraser radius
      const originalLength = this.walls[w].length;
      this.walls[w] = this.walls[w].filter((point) => {
        const dx = point.x - x;
        const dy = point.y - y;
        const distSquared = dx * dx + dy * dy;

        // Keep points that are outside eraser radius
        return distSquared > eraseRadiusSquared;
      });

      // Check if we modified this wall
      if (this.walls[w].length !== originalLength) {
        modified = true;
      }
    }

    // Remove any empty wall collections
    if (modified) {
      this.walls = this.walls.filter((wall) => wall.length > 0);
    }
  }

  // Clear all walls
  clearWalls() {
    this.walls = [];
  }

  // Check if a point is close to a wall (for boid collision detection)
  isPointNearWall(x, y, radius) {
    // Check each wall (which is now a collection of brush points)
    for (let w = 0; w < this.walls.length; w++) {
      const wall = this.walls[w];

      // Check each brush point in the wall
      for (let p = 0; p < wall.length; p++) {
        const point = wall[p];

        // Simple distance check between point and brush point
        const dx = x - point.x;
        const dy = y - point.y;
        const distanceSquared = dx * dx + dy * dy;

        // If the point is within the brush point radius plus the check radius
        // Note: we use a smaller value than before to let boids get closer
        if (distanceSquared < Math.pow(point.size / 2 + radius * 0.6, 2)) {
          return true;
        }
      }
    }
    return false;
  }

  // Calculate normal vector away from nearest wall point
  getWallNormal(x, y) {
    let closestDistance = Infinity;
    let normal = { x: 0, y: 0 };

    // Check each wall (collection of brush points)
    for (const wall of this.walls) {
      // Check each brush point in the wall
      for (const point of wall) {
        // Calculate distance from boid to brush point
        const dx = x - point.x;
        const dy = y - point.y;
        const distanceSquared = dx * dx + dy * dy;

        // If this is the closest wall point so far
        if (distanceSquared < closestDistance) {
          closestDistance = distanceSquared;

          // Normalize the vector away from the wall point
          const distance = Math.sqrt(distanceSquared);
          if (distance > 0) {
            // Normal points away from the wall point
            normal.x = dx / distance;
            normal.y = dy / distance;
          }
        }
      }
    }

    return normal;
  }

  // Track cursor position across the canvas
  setupCursorTracking() {
    this.canvas.addEventListener("mousemove", (e) => {
      const coords = this.getCanvasCoordinates(e);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
    });

    // Reset cursor position when mouse leaves canvas
    this.canvas.addEventListener("mouseleave", () => {
      this.cursorPosition.x = -100;
      this.cursorPosition.y = -100;
    });

    // Also track when mouse enters canvas again
    this.canvas.addEventListener("mouseenter", (e) => {
      const coords = this.getCanvasCoordinates(e);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
    });
  }

  // Check if a point is near the cursor with improved detection
  isPointNearCursor(x, y, radius) {
    // If cursor is off-screen, nothing is near it
    if (this.cursorPosition.x < 0 || this.cursorPosition.y < 0) {
      return false;
    }

    const dx = x - this.cursorPosition.x;
    const dy = y - this.cursorPosition.y;
    const distanceSquared = dx * dx + dy * dy;

    // Calculate the effective radius (sum of cursor radius and check radius)
    const effectiveRadius = this.cursorRadius + radius;

    return distanceSquared < effectiveRadius * effectiveRadius;
  }

  // Get normal vector away from cursor
  getCursorNormal(x, y) {
    const dx = x - this.cursorPosition.x;
    const dy = y - this.cursorPosition.y;
    const distanceSquared = dx * dx + dy * dy;
    const distance = Math.sqrt(distanceSquared);

    // Return normalized vector pointing away from cursor
    if (distance > 0) {
      return {
        x: dx / distance,
        y: dy / distance,
      };
    }

    // Fallback if exactly at cursor position (unlikely)
    return { x: Math.random() - 0.5, y: Math.random() - 0.5 };
  }

  // Update all boids
  update() {
    for (const boid of this.boids) {
      // Always apply cursor avoidance first if the method exists
      if (typeof boid.avoidCursor === "function") {
        boid.avoidCursor(this);
      }

      // Check for wall collisions and provide wall avoidance vectors
      if (this.walls.length > 0) {
        boid.avoidWalls(this);
      }

      boid.flock(
        this.boids,
        this.separationFactor,
        this.alignmentFactor,
        this.cohesionFactor
      );
      boid.update();
    }

    // Process audio if enabled
    if (this.audioEnabled) {
      this.audioTriggerCount++;
      if (this.audioTriggerCount % this.audioTriggerInterval === 0) {
        this.audioEngine.processBoids(
          this.boids,
          this.canvas,
          this.audioTriggerCount
        );
      }
    }
  }

  // Draw all boids and walls
  draw() {
    // Clear canvas
    this.ctx.fillStyle = "#111";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw walls (collections of brush points)
    this.ctx.fillStyle = this.wallColor;

    // Use different drawing approaches for better performance and visual effect
    // Draw each wall as a collection of squares for a pixel-like effect
    for (const wall of this.walls) {
      this.drawWallSegment(wall);
    }

    // Draw current wall being drawn
    if (this.drawingWalls && this.currentWall) {
      this.drawWallSegment(this.currentWall);
    }

    // Draw each boid, passing the full boids array for neighbor awareness
    for (const boid of this.boids) {
      boid.draw(this.ctx, this.boids);
    }
  }

  // Helper method to draw a wall segment with pixel-like appearance
  drawWallSegment(wallPoints) {
    for (const point of wallPoints) {
      // Draw as a square for pixel-like effect
      const halfSize = point.size / 2;
      this.ctx.fillRect(
        point.x - halfSize,
        point.y - halfSize,
        point.size,
        point.size
      );
    }
  }

  // Main animation loop
  animate() {
    if (this.running) {
      this.update();
      this.draw();
    }
    requestAnimationFrame(() => this.animate());
  }

  // Toggle pause/resume
  togglePause() {
    this.running = !this.running;
  }

  // Toggle audio on/off
  toggleAudio() {
    // Initialize audio engine on first toggle if not already initialized
    if (!this.audioEngine._initialized && !this.audioEnabled) {
      setTimeout(() => {
        this.audioEngine.initialize();
      }, 100);
    }

    this.audioEnabled = this.audioEngine.toggle();
    return this.audioEnabled;
  }
}

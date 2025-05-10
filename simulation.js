class Simulation {
  constructor(canvasId, config = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    // Enable anti-aliasing for boids but not for walls
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "medium";

    // Create a separate offscreen canvas for walls with pixel-perfect rendering
    this.wallCanvas = document.createElement("canvas");
    this.wallCtx = this.wallCanvas.getContext("2d", { alpha: true });
    this.wallNeedsUpdate = true; // Flag to redraw walls only when needed

    // Create a spatial index for walls to improve collision detection performance
    this.wallSpatialIndex = new Map();
    this.gridCellSize = 20; // Size of each grid cell in the spatial index

    // Define cursor modes as an enum-like object
    this.CURSOR_MODES = {
      WALL: "WALL",
      ERASER: "ERASER",
      BOID: "BOID",
      PREDATOR: "PREDATOR",
    };

    // Current cursor mode (default to WALL)
    this.cursorMode = this.CURSOR_MODES.WALL;

    this.boids = [];
    this.running = true;
    this.separationFactor = 1.5;
    this.alignmentFactor = 1.0;
    this.cohesionFactor = 1.0;

    // Apply device-specific configuration
    this.config = {
      useHighPerformanceMode:
        config.useHighPerformanceMode !== undefined
          ? config.useHighPerformanceMode
          : true,
      boidCount: config.boidCount !== undefined ? config.boidCount : 0,
      targetFPS: config.targetFPS || 60,
    };

    // Add cursor tracking with more subtle parameters
    this.cursorPosition = { x: -100, y: -100 }; // Start off-screen
    this.cursorRadius = 20; // Reduced from 60 to 40
    this.cursorAvoidStrength = 0.1;
    this.touchActive = false; // Track if touch is currently active

    // Wall drawing functionality
    this.walls = []; // Array to store wall points
    this.currentWall = null; // Current wall being drawn
    this.wallBrushSize = 4; // Wall brush size in pixels
    this.wallColor = "#ffffff"; // Wall color (white)
    this.lastDrawPoint = null; // Last point where brush was drawn
    this.minDrawDistance = 2; // For continuous walls
    this.eraserSize = this.wallBrushSize * 3; // Size of eraser relative to brush size

    // Set cursor to crosshair by default
    this.canvas.style.cursor = "crosshair";

    // Audio system initialization
    this.audioEngine = new AudioEngine();
    this.audioEnabled = false; // Keep audio off by default
    this.audioTriggerCount = 0;
    this.audioTriggerInterval = 8; // Trigger sound every N frames

    // Add time tracking variables for frame-rate independence
    this.lastTime = 0;
    this.targetFPS = this.config.targetFPS;
    this.timeStep = 1000 / this.targetFPS; // ms per update
    this.accumulatedTime = 0;

    // Set canvas dimensions
    this.resizeCanvas();

    // Create initial boids (now 0 by default)
    this.initBoids(this.config.boidCount);

    // Set up drawing event listeners
    this.setupDrawing();

    // Add cursor tracking listener
    this.setupCursorTracking();

    // Prevent text selection on canvas to improve mobile experience
    this.preventTextSelection();

    // Apply special handling for Safari/iOS devices
    this.applySafariOptimizations();

    // Initialize the spatial index after walls are set up
    this.rebuildWallSpatialIndex();

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

    // Resize wall canvas to match main canvas
    this.wallCanvas.width = this.canvas.width;
    this.wallCanvas.height = this.canvas.height;
    this.wallNeedsUpdate = true; // Mark walls for redraw

    // Rebuild spatial index when canvas size changes
    this.rebuildWallSpatialIndex();
  }

  // Handle window resize events
  handleResize(width, height) {
    // Update canvas dimensions
    this.canvas.width = width;
    this.canvas.height = height;

    // Resize wall canvas to match main canvas
    this.wallCanvas.width = width;
    this.wallCanvas.height = height;
    this.wallNeedsUpdate = true; // Mark walls for redraw

    // Keep boids within the new canvas bounds
    for (const boid of this.boids) {
      if (boid.position.x > width) boid.position.x = width - 10;
      if (boid.position.y > height) boid.position.y = height - 10;
    }

    // Rebuild spatial index when canvas size changes
    this.rebuildWallSpatialIndex();
  }

  // Create a spatial index for more efficient wall collision detection
  rebuildWallSpatialIndex() {
    this.wallSpatialIndex.clear();

    // Index all walls by grid cell
    for (const wall of this.walls) {
      for (const point of wall) {
        const cellX = Math.floor(point.x / this.gridCellSize);
        const cellY = Math.floor(point.y / this.gridCellSize);
        const cellKey = `${cellX},${cellY}`;

        if (!this.wallSpatialIndex.has(cellKey)) {
          this.wallSpatialIndex.set(cellKey, []);
        }
        this.wallSpatialIndex.get(cellKey).push(point);
      }
    }

    // Also add the current wall being drawn
    if (this.currentWall) {
      for (const point of this.currentWall) {
        const cellX = Math.floor(point.x / this.gridCellSize);
        const cellY = Math.floor(point.y / this.gridCellSize);
        const cellKey = `${cellX},${cellY}`;

        if (!this.wallSpatialIndex.has(cellKey)) {
          this.wallSpatialIndex.set(cellKey, []);
        }
        this.wallSpatialIndex.get(cellKey).push(point);
      }
    }
  }

  // Create initial boids
  initBoids(count) {
    this.boids = [];

    // Define predator ratio - around 15% of boids should be predators
    const predatorRatio = 0.15;
    const predatorCount = Math.round(count * predatorRatio);
    const preyCount = count - predatorCount;

    // Create prey boids
    for (let i = 0; i < preyCount; i++) {
      const x = Math.random() * this.canvas.width;
      const y = Math.random() * this.canvas.height;
      const boid = new Boid(x, y, this.canvas);

      // Set prey properties
      boid.isPredator = false;
      boid.maxSpeed = PREY_MAX_SPEED;
      boid.steeringFactor = PREY_STEERING_FACTOR;

      this.boids.push(boid);
    }

    // Create predator boids
    for (let i = 0; i < predatorCount; i++) {
      const x = Math.random() * this.canvas.width;
      const y = Math.random() * this.canvas.height;
      const boid = new Boid(x, y, this.canvas);

      // Set predator properties
      boid.isPredator = true;
      boid.health = 80;
      boid.maxHealth = 150;
      boid.healthDecayRate = 0.12;
      boid.reproductionThreshold = 120;
      boid.reproductionCost = 60;
      boid.foodGenerationRate = 0;

      // Make predators faster but with slower turning
      boid.maxSpeed = PREDATOR_MAX_SPEED;
      boid.steeringFactor = PREDATOR_STEERING_FACTOR;

      this.boids.push(boid);
    }
  }

  // Reset the simulation
  reset() {
    // Play death sounds for all existing boids if audio is enabled
    if (
      this.audioEnabled &&
      this.audioEngine._initialized &&
      this.boids.length > 0
    ) {
      // Get canvas dimensions for sound placement
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;

      // Store the current boids
      const oldBoids = [...this.boids];

      // Play death sounds for some boids (up to 8 randomly selected)
      const maxSounds = Math.min(oldBoids.length, 8);
      const selectedBoids = oldBoids
        .sort(() => Math.random() - 0.5) // Shuffle array
        .slice(0, maxSounds);

      // Play the sounds with slight delays for a chorus of cries
      selectedBoids.forEach((boid, index) => {
        // Stagger the sounds slightly for a more chaotic effect
        setTimeout(() => {
          this.audioEngine.playDeathSound(
            boid.position.x,
            boid.position.y,
            canvasWidth,
            canvasHeight
          );
        }, index * 60); // 60ms delay between each sound
      });
    }

    // Create new boids
    this.initBoids(this.config.boidCount);
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

  // Get accurate canvas coordinates from touch event
  getTouchCoordinates(touch) {
    const rect = this.canvas.getBoundingClientRect();

    // Calculate the scaling ratio of the canvas
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    // Apply scaling to the touch coordinates
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    return { x, y };
  }

  getCursorMode() {
    return this.cursorMode;
  }

  // Setup drawing event listeners
  setupDrawing() {
    // MOUSE EVENTS
    this.canvas.addEventListener("mousedown", (e) => {
      const coords = this.getCanvasCoordinates(e);

      switch (this.cursorMode) {
        case this.CURSOR_MODES.ERASER:
          this.eraseWallsAt(coords.x, coords.y);
          break;
        case this.CURSOR_MODES.BOID:
          this.spawnBoid(coords.x, coords.y);
          break;
        case this.CURSOR_MODES.WALL:
          this.currentWall = [];
          this.lastDrawPoint = coords;
          this.addWallPoint(coords.x, coords.y);
          break;
        case this.CURSOR_MODES.PREDATOR:
          this.spawnBoid(coords.x, coords.y, true);
          break;
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      const coords = this.getCanvasCoordinates(e);

      if (e.buttons > 0) {
        switch (this.cursorMode) {
          case this.CURSOR_MODES.ERASER:
            this.eraseWallsAt(coords.x, coords.y);
            break;
          case this.CURSOR_MODES.BOID:
          case this.CURSOR_MODES.PREDATOR:
            const now = Date.now();
            if (!this.lastBoidSpawnTime || now - this.lastBoidSpawnTime > 100) {
              this.spawnBoid(
                coords.x,
                coords.y,
                this.cursorMode === this.CURSOR_MODES.PREDATOR
              );
              this.lastBoidSpawnTime = now;
            }
            break;
          case this.CURSOR_MODES.WALL:
            if (this.currentWall) {
              const dx = coords.x - this.lastDrawPoint.x;
              const dy = coords.y - this.lastDrawPoint.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance >= this.minDrawDistance) {
                const steps = Math.max(
                  Math.ceil(distance / this.minDrawDistance),
                  1
                );

                for (let i = 1; i <= steps; i++) {
                  const ratio = i / steps;
                  const interpX = this.lastDrawPoint.x + dx * ratio;
                  const interpY = this.lastDrawPoint.y + dy * ratio;
                  this.addWallPoint(interpX, interpY);
                }

                this.lastDrawPoint = coords;
              }
            }
            break;
        }
      }
    });

    this.canvas.addEventListener("mouseup", () => {
      if (this.cursorMode === this.CURSOR_MODES.WALL && this.currentWall) {
        if (this.currentWall.length > 1) {
          this.walls.push(this.currentWall);
          this.rebuildWallSpatialIndex();
        }

        this.currentWall = null;
        this.lastDrawPoint = null;
        this.wallNeedsUpdate = true;
      }
    });

    this.canvas.addEventListener("mouseleave", () => {
      if (this.cursorMode === this.CURSOR_MODES.WALL && this.currentWall) {
        if (this.currentWall.length > 1) {
          this.walls.push(this.currentWall);
          this.rebuildWallSpatialIndex();
        }

        this.currentWall = null;
        this.lastDrawPoint = null;
        this.wallNeedsUpdate = true;
      }
    });

    // TOUCH EVENTS for mobile support
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();

      const touch = e.touches[0];
      const coords = this.getTouchCoordinates(touch);

      switch (this.cursorMode) {
        case this.CURSOR_MODES.ERASER:
          this.eraseWallsAt(coords.x, coords.y);
          this.lastDrawPoint = coords;
          break;
        case this.CURSOR_MODES.BOID:
          this.spawnBoid(coords.x, coords.y);
          break;
        case this.CURSOR_MODES.WALL:
          this.currentWall = [];
          this.lastDrawPoint = coords;
          this.addWallPoint(coords.x, coords.y);
          break;
        case this.CURSOR_MODES.PREDATOR:
          this.spawnBoid(coords.x, coords.y, true);
          break;
      }
    });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();

      const touch = e.touches[0];
      const coords = this.getTouchCoordinates(touch);

      switch (this.cursorMode) {
        case this.CURSOR_MODES.ERASER:
          if (!this.lastDrawPoint) {
            this.lastDrawPoint = coords;
          }

          const dx = coords.x - this.lastDrawPoint.x;
          const dy = coords.y - this.lastDrawPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance >= this.minDrawDistance) {
            const steps = Math.max(
              Math.ceil(distance / this.minDrawDistance),
              1
            );

            for (let i = 1; i <= steps; i++) {
              const ratio = i / steps;
              const interpX = this.lastDrawPoint.x + dx * ratio;
              const interpY = this.lastDrawPoint.y + dy * ratio;
              this.eraseWallsAt(interpX, interpY);
            }

            this.lastDrawPoint = coords;
          }
          break;
        case this.CURSOR_MODES.BOID:
        case this.CURSOR_MODES.PREDATOR:
          const now = Date.now();
          if (!this.lastBoidSpawnTime || now - this.lastBoidSpawnTime > 100) {
            this.spawnBoid(
              coords.x,
              coords.y,
              this.cursorMode === this.CURSOR_MODES.PREDATOR
            );
            this.lastBoidSpawnTime = now;
          }
          break;
        case this.CURSOR_MODES.WALL:
          if (this.currentWall) {
            const dx = coords.x - this.lastDrawPoint.x;
            const dy = coords.y - this.lastDrawPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance >= this.minDrawDistance) {
              const steps = Math.max(
                Math.ceil(distance / this.minDrawDistance),
                1
              );

              for (let i = 1; i <= steps; i++) {
                const ratio = i / steps;
                const interpX = this.lastDrawPoint.x + dx * ratio;
                const interpY = this.lastDrawPoint.y + dy * ratio;
                this.addWallPoint(interpX, interpY);
              }

              this.lastDrawPoint = coords;
            }
          }
          break;
      }
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();

      if (this.cursorMode === this.CURSOR_MODES.WALL && this.currentWall) {
        if (this.currentWall.length > 1) {
          this.walls.push(this.currentWall);
          this.rebuildWallSpatialIndex();
        }

        this.currentWall = null;
        this.lastDrawPoint = null;
        this.wallNeedsUpdate = true;
      }
    });

    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();

      if (this.cursorMode === this.CURSOR_MODES.WALL && this.currentWall) {
        if (this.currentWall.length > 1) {
          this.walls.push(this.currentWall);
          this.rebuildWallSpatialIndex();
        }

        this.currentWall = null;
        this.lastDrawPoint = null;
        this.wallNeedsUpdate = true;
      }
    });
  }

  // Add a point to the current wall
  addWallPoint(x, y) {
    // Use circular brush pattern made up of small square tiles
    const pointSize = this.wallBrushSize;
    const brushRadius = this.wallBrushSize * 1.5; // Circle radius slightly larger than tile size

    // Create a circular pattern of points around the cursor position
    for (
      let offsetX = -brushRadius;
      offsetX <= brushRadius;
      offsetX += pointSize
    ) {
      for (
        let offsetY = -brushRadius;
        offsetY <= brushRadius;
        offsetY += pointSize
      ) {
        // Check if this offset point is within our circular brush
        const distSq = offsetX * offsetX + offsetY * offsetY;
        if (distSq <= brushRadius * brushRadius) {
          this.currentWall.push({
            x: x + offsetX,
            y: y + offsetY,
            size: pointSize,
          });

          // Also add point to the spatial index
          const pointX = x + offsetX;
          const pointY = y + offsetY;
          const cellX = Math.floor(pointX / this.gridCellSize);
          const cellY = Math.floor(pointY / this.gridCellSize);
          const cellKey = `${cellX},${cellY}`;

          if (!this.wallSpatialIndex.has(cellKey)) {
            this.wallSpatialIndex.set(cellKey, []);
          }
          this.wallSpatialIndex.get(cellKey).push({
            x: pointX,
            y: pointY,
            size: pointSize,
          });
        }
      }
    }

    // Update wall canvas immediately as points are added
    this.wallNeedsUpdate = true;
  }

  // Toggle cursor mode
  setCursorMode(mode) {
    if (Object.values(this.CURSOR_MODES).includes(mode)) {
      this.cursorMode = mode;
      this.updateCursor();
    }
  }

  // Update cursor appearance based on current mode
  updateCursor() {
    switch (this.cursorMode) {
      case this.CURSOR_MODES.ERASER:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23ff000055"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.BOID:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="%2300ff0055"/><circle cx="12" cy="12" r="4" fill="%2300ff00aa"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.PREDATOR:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="%23ff000055"/><circle cx="12" cy="12" r="4" fill="%23ff0000aa"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.WALL:
      default:
        this.canvas.style.cursor = "crosshair";
        break;
    }
  }

  // Spawn a new boid at the given coordinates
  spawnBoid(x, y, isPredator = false) {
    const newBoid = new Boid(x, y, this.canvas);

    if (isPredator) {
      // Set predator properties
      newBoid.isPredator = true;
      newBoid.health = 80;
      newBoid.maxHealth = 150;
      newBoid.healthDecayRate = 0.12;
      newBoid.reproductionThreshold = 120;
      newBoid.reproductionCost = 60;
      newBoid.foodGenerationRate = 0;

      // Make predators faster but with slower turning
      newBoid.maxSpeed = PREDATOR_MAX_SPEED;
      newBoid.steeringFactor = PREDATOR_STEERING_FACTOR;
    } else {
      // Set prey properties
      newBoid.isPredator = false;
      newBoid.maxSpeed = PREY_MAX_SPEED;
      newBoid.steeringFactor = PREY_STEERING_FACTOR;
    }

    const angle = Math.random() * Math.PI * 2;
    newBoid.velocity.x = Math.cos(angle) * newBoid.maxSpeed * 0.5;
    newBoid.velocity.y = Math.sin(angle) * newBoid.maxSpeed * 0.5;

    this.boids.push(newBoid);
    newBoid.update(1.0);
  }

  // Erase wall points and boids at the given coordinates
  eraseWallsAt(x, y) {
    const eraseRadiusSquared = Math.pow(this.eraserSize, 2);
    let wallsModified = false;

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
        wallsModified = true;
      }
    }

    // Remove any empty wall collections
    if (wallsModified) {
      this.walls = this.walls.filter((wall) => wall.length > 0);
      this.wallNeedsUpdate = true; // Mark walls for redraw

      // Rebuild the spatial index after erasing
      this.rebuildWallSpatialIndex();
    }

    // Also remove any boids within the eraser radius
    const boidsRemoved = this.eraseBoids(x, y, eraseRadiusSquared);

    return wallsModified || boidsRemoved;
  }

  // Remove boids within the specified radius
  eraseBoids(x, y, radiusSquared) {
    const originalLength = this.boids.length;

    // Store boid positions before removal to use for death sound
    const removedBoids = [];

    // Find which boids will be removed
    this.boids.forEach((boid) => {
      const dx = boid.position.x - x;
      const dy = boid.position.y - y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared <= radiusSquared) {
        // Store position for sound effect
        removedBoids.push({
          x: boid.position.x,
          y: boid.position.y,
        });
      }
    });

    // Filter out boids that are within the eraser radius
    this.boids = this.boids.filter((boid) => {
      const dx = boid.position.x - x;
      const dy = boid.position.y - y;
      const distSquared = dx * dx + dy * dy;

      // Keep boids that are outside the eraser radius
      return distSquared > radiusSquared;
    });

    // Play death sounds for removed boids if audio is enabled
    if (
      this.audioEnabled &&
      removedBoids.length > 0 &&
      this.audioEngine._initialized
    ) {
      // Play up to 3 death sounds to avoid overwhelming audio
      const maxSounds = Math.min(removedBoids.length, 3);

      for (let i = 0; i < maxSounds; i++) {
        const boid = removedBoids[i];
        this.audioEngine.playDeathSound(
          boid.x,
          boid.y,
          this.canvas.width,
          this.canvas.height
        );
      }
    }

    // Return true if any boids were removed
    return this.boids.length < originalLength;
  }

  // Clear all walls
  clearWalls() {
    this.walls = [];
    this.wallSpatialIndex.clear(); // Clear the spatial index
    this.wallNeedsUpdate = true; // Mark walls for redraw
  }

  // Get wall points near a position using spatial indexing
  getWallPointsNearPosition(x, y, radius) {
    const cellRadius = Math.ceil(radius / this.gridCellSize);
    const centerCellX = Math.floor(x / this.gridCellSize);
    const centerCellY = Math.floor(y / this.gridCellSize);
    const nearbyPoints = [];

    // Check cells in a square around the position
    for (let offsetX = -cellRadius; offsetX <= cellRadius; offsetX++) {
      for (let offsetY = -cellRadius; offsetY <= cellRadius; offsetY++) {
        const cellKey = `${centerCellX + offsetX},${centerCellY + offsetY}`;

        // Get points in this cell and add to our collection
        if (this.wallSpatialIndex.has(cellKey)) {
          nearbyPoints.push(...this.wallSpatialIndex.get(cellKey));
        }
      }
    }

    return nearbyPoints;
  }

  // Check if a point is close to a wall (for boid collision detection)
  isPointNearWall(x, y, radius) {
    // Use spatial index to get nearby wall points
    const nearbyPoints = this.getWallPointsNearPosition(
      x,
      y,
      radius + this.wallBrushSize
    );

    // Check distance against each nearby point
    for (const point of nearbyPoints) {
      const dx = x - point.x;
      const dy = y - point.y;
      const distanceSquared = dx * dx + dy * dy;

      // If the point is within the brush point radius plus the check radius
      if (distanceSquared < Math.pow(point.size / 2 + radius * 0.6, 2)) {
        return true;
      }
    }

    // Also check the current wall being drawn if it exists
    if (this.currentWall && this.currentWall.length > 0) {
      for (let p = 0; p < this.currentWall.length; p++) {
        const point = this.currentWall[p];

        // Distance check for current wall points
        const dx = x - point.x;
        const dy = y - point.y;
        const distanceSquared = dx * dx + dy * dy;

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

    // Use spatial index to get nearby wall points
    const nearbyPoints = this.getWallPointsNearPosition(x, y, 50); // 50 is a reasonable search radius

    // Find the closest point and calculate normal
    for (const point of nearbyPoints) {
      // Calculate distance from point to wall point
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

    // Also check the current wall being drawn
    if (this.currentWall && this.currentWall.length > 0) {
      for (const point of this.currentWall) {
        // Calculate distance from point to current wall point
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
    // Mouse tracking
    this.canvas.addEventListener("mousemove", (e) => {
      const coords = this.getCanvasCoordinates(e);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
      this.touchActive = false; // Mouse takes precedence over touch
    });

    // Reset cursor position when mouse leaves canvas
    this.canvas.addEventListener("mouseleave", () => {
      // Only reset if no touch is active
      if (!this.touchActive) {
        this.cursorPosition.x = -100;
        this.cursorPosition.y = -100;
      }
    });

    // Also track when mouse enters canvas again
    this.canvas.addEventListener("mouseenter", (e) => {
      const coords = this.getCanvasCoordinates(e);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
      this.touchActive = false; // Mouse takes precedence
    });

    // Touch tracking for mobile devices - make boids dodge touch
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const coords = this.getTouchCoordinates(touch);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
      this.touchActive = true;
    });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const coords = this.getTouchCoordinates(touch);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
      this.touchActive = true;
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      // Only reset cursor position if no other touches are active
      if (e.touches.length === 0) {
        this.cursorPosition.x = -100;
        this.cursorPosition.y = -100;
        this.touchActive = false;
      } else {
        // If there are still touches, use the first one
        const touch = e.touches[0];
        const coords = this.getTouchCoordinates(touch);
        this.cursorPosition.x = coords.x;
        this.cursorPosition.y = coords.y;
      }
    });

    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        this.cursorPosition.x = -100;
        this.cursorPosition.y = -100;
        this.touchActive = false;
      }
    });
  }

  // Prevent text selection on canvas
  preventTextSelection() {
    this.canvas.style.webkitUserSelect = "none"; // Safari
    this.canvas.style.userSelect = "none"; // Standard
    this.canvas.style.touchAction = "none"; // Disable browser handling of all touch events

    // Prevent context menu on right click or long press
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
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

  // Apply optimizations specifically for Safari/iOS
  applySafariOptimizations() {
    // Check if we're on iOS Safari
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      // iOS Safari specific optimizations
      console.log("Applying Safari/iOS optimizations");

      // Force high performance rendering mode
      this.canvas.style.transform = "translateZ(0)";
      this.canvas.style.backfaceVisibility = "hidden";

      // Fix the time step for more consistent updates
      this.timeStep = 16.666; // Lock to 60fps equivalent
    }
  }

  // Update all boids
  update(deltaTime) {
    // Scale factor helps maintain consistent speed across different devices/framerates
    const timeScale = deltaTime / this.timeStep;

    // Track boids that have been killed by predators
    const killedBoids = [];

    // Track new boids created through reproduction
    const newBoids = [];

    for (const boid of this.boids) {
      // Always apply cursor avoidance first if the method exists
      if (typeof boid.avoidCursor === "function") {
        boid.avoidCursor(this);
      }

      // Apply wall avoidance forces (steering away from walls)
      if (
        this.walls.length > 0 ||
        (this.currentWall && this.currentWall.length > 0)
      ) {
        boid.avoidWalls(this);
      }

      // Apply flocking behaviors
      boid.flock(
        this.boids,
        this.separationFactor,
        this.alignmentFactor,
        this.cohesionFactor
      );

      // Update boid position and apply true collision detection
      boid.update(timeScale);

      // Check if this boid has been killed
      if (boid.killed) {
        killedBoids.push(boid);
      }

      // Check for reproduction - if ready, create a new boid
      if (boid.readyToReproduce) {
        const offspring = boid.reproduce();
        if (offspring) {
          newBoids.push(offspring);
        }
      }
    }

    // Remove killed boids
    if (killedBoids.length > 0) {
      // Play death sounds for killed boids if audio is enabled
      if (this.audioEnabled && this.audioEngine._initialized) {
        // Play up to 2 death sounds to avoid overwhelming audio
        const maxSounds = Math.min(killedBoids.length, 2);

        for (let i = 0; i < maxSounds; i++) {
          const boid = killedBoids[i];
          this.audioEngine.playDeathSound(
            boid.position.x,
            boid.position.y,
            this.canvas.width,
            this.canvas.height
          );
        }
      }

      // Filter out killed boids
      this.boids = this.boids.filter((boid) => !boid.killed);
    }

    // Add any new boids created through reproduction
    if (newBoids.length > 0) {
      // Optional: Add a sound for reproduction events if audio is enabled
      if (
        this.audioEnabled &&
        this.audioEngine._initialized &&
        newBoids.length > 0
      ) {
        // Just play one birth sound even if multiple births happened
        const newBoid = newBoids[0];
        // Use a different sound for births if available, or reuse another sound
        // this.audioEngine.playBirthSound(newBoid.position.x, newBoid.position.y, this.canvas.width, this.canvas.height);
      }

      // Add the new boids to the simulation
      this.boids = this.boids.concat(newBoids);
    }

    // Apply population controls
    this.applyPopulationControls();

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

  // Population control system - maintains balance in the ecosystem
  applyPopulationControls() {
    const maxBoids = 300; // Hard upper limit on total boids
    const minPreyRatio = 0.6; // Minimum percentage of prey (60%)
    const maxPredatorRatio = 0.3; // Maximum percentage of predators (30%)
    const minPredators = 3; // Always keep a few predators

    // Count current populations
    let predatorCount = 0;
    let preyCount = 0;

    for (const boid of this.boids) {
      if (boid.isPredator) {
        predatorCount++;
      } else {
        preyCount++;
      }
    }

    const totalBoids = predatorCount + preyCount;

    // Check for overpopulation
    if (totalBoids > maxBoids) {
      // Remove excess boids
      const excessBoids = totalBoids - maxBoids;
      const killedPrey = [];
      const killedPredators = [];

      // Calculate current ratios
      const currentPredatorRatio = predatorCount / totalBoids;
      const currentPreyRatio = preyCount / totalBoids;

      // Determine if we should remove predators or prey or both
      let predatorsToRemove = 0;
      let preyToRemove = 0;

      if (currentPredatorRatio > maxPredatorRatio) {
        // Too many predators, remove more predators
        predatorsToRemove = Math.min(
          excessBoids,
          predatorCount -
            Math.max(minPredators, Math.floor(totalBoids * maxPredatorRatio))
        );
        preyToRemove = excessBoids - predatorsToRemove;
      } else if (
        currentPreyRatio < minPreyRatio &&
        predatorCount > minPredators
      ) {
        // Too few prey, remove more predators to restore balance
        predatorsToRemove = Math.min(excessBoids, predatorCount - minPredators);
        preyToRemove = excessBoids - predatorsToRemove;
      } else {
        // Remove proportionally
        predatorsToRemove = Math.min(
          Math.floor(excessBoids * currentPredatorRatio),
          predatorCount - minPredators
        );
        preyToRemove = excessBoids - predatorsToRemove;
      }

      // Remove predators (oldest/weakest first)
      if (predatorsToRemove > 0) {
        // Sort by health, remove weakest first
        const predators = this.boids
          .filter((b) => b.isPredator)
          .sort((a, b) => a.health - b.health);

        for (let i = 0; i < predatorsToRemove && i < predators.length; i++) {
          predators[i].killed = true;
          killedPredators.push(predators[i]);
        }
      }

      // Remove prey (oldest/weakest first)
      if (preyToRemove > 0) {
        // Sort by health, remove weakest first
        const prey = this.boids
          .filter((b) => !b.isPredator)
          .sort((a, b) => a.health - b.health);

        for (let i = 0; i < preyToRemove && i < prey.length; i++) {
          prey[i].killed = true;
          killedPrey.push(prey[i]);
        }
      }

      // Play death sounds for a sample of the killed boids if audio is enabled
      if (this.audioEnabled && this.audioEngine._initialized) {
        const maxSounds = 2;

        // Play sound for a killed predator if any
        if (killedPredators.length > 0) {
          const predator = killedPredators[0];
          this.audioEngine.playDeathSound(
            predator.position.x,
            predator.position.y,
            this.canvas.width,
            this.canvas.height
          );
        }

        // Play sound for a killed prey if any
        if (killedPrey.length > 0) {
          const prey = killedPrey[0];
          this.audioEngine.playDeathSound(
            prey.position.x,
            prey.position.y,
            this.canvas.width,
            this.canvas.height
          );
        }
      }

      // Remove killed boids
      this.boids = this.boids.filter((boid) => !boid.killed);
    }
  }

  // Draw all boids and walls
  draw() {
    // Clear canvas
    this.ctx.fillStyle = "#111";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Redraw walls only if needed
    if (this.wallNeedsUpdate) {
      this.wallCtx.clearRect(
        0,
        0,
        this.wallCanvas.width,
        this.wallCanvas.height
      );
      this.wallCtx.fillStyle = this.wallColor;

      // Draw walls (collections of brush points)
      for (const wall of this.walls) {
        this.drawWallSegment(this.wallCtx, wall);
      }

      // Draw current wall being drawn
      if (this.cursorMode === this.CURSOR_MODES.WALL && this.currentWall) {
        this.drawWallSegment(this.wallCtx, this.currentWall);
      }

      this.wallNeedsUpdate = false; // Reset update flag
    }

    // Draw walls from offscreen canvas
    this.ctx.drawImage(this.wallCanvas, 0, 0);

    // Draw each boid, passing the full boids array for neighbor awareness
    for (const boid of this.boids) {
      boid.draw(this.ctx, this.boids);
    }
  }

  // Helper method to draw a wall segment with pixel-perfect appearance
  drawWallSegment(ctx, wallPoints) {
    // Disable image smoothing for wall canvas to get crisp edges
    ctx.imageSmoothingEnabled = false;

    // Group nearby points into clusters for more efficient rendering
    const wallMap = new Map();
    const gridSize = Math.floor(this.wallBrushSize);

    // Create a grid-based map of wall points
    for (const point of wallPoints) {
      // Snap to grid for crisp rendering
      const gridX = Math.floor(point.x / gridSize) * gridSize;
      const gridY = Math.floor(point.y / gridSize) * gridSize;
      const key = `${gridX},${gridY}`;

      if (!wallMap.has(key)) {
        wallMap.set(key, { x: gridX, y: gridY });
      }
    }

    // Draw crisp wall points
    for (const [_, point] of wallMap.entries()) {
      // Draw as sharp-edged square
      ctx.fillRect(point.x, point.y, gridSize, gridSize);
    }

    // If we're drawing the active wall segment, add a subtle glow effect
    if (wallPoints === this.currentWall && wallPoints.length > 0) {
      // Enable smoothing just for the glow effect
      ctx.imageSmoothingEnabled = true;

      // Add subtle highlight to show where user is drawing
      const lastPoint = wallPoints[wallPoints.length - 1];
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(lastPoint.x, lastPoint.y, gridSize, 0, Math.PI * 2);
      ctx.fill();

      // Reset to wall color
      ctx.fillStyle = this.wallColor;
    }
  }

  // Main animation loop with time-based updates
  animate(currentTime = 0) {
    // Calculate time elapsed since last frame
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Accumulate time since last update
    this.accumulatedTime += deltaTime;

    // Use a maximum frame time to prevent spiral of death on slow devices
    const maxFrameTime = 200; // Cap at 5 FPS equivalent
    if (this.accumulatedTime > maxFrameTime) {
      this.accumulatedTime = maxFrameTime;
    }

    // Update simulation at a fixed time step for consistency
    if (this.running) {
      // Process all accumulated time in fixed time steps
      while (this.accumulatedTime >= this.timeStep) {
        this.update(this.timeStep);
        this.accumulatedTime -= this.timeStep;
      }

      // Draw the current state
      this.draw();
    }

    requestAnimationFrame((time) => this.animate(time));
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

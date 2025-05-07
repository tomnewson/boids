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
      // Always use default boid count (100) regardless of device
      boidCount: 100,
      targetFPS: config.targetFPS || 60,
    };

    // Add cursor tracking with more subtle parameters
    this.cursorPosition = { x: -100, y: -100 }; // Start off-screen
    this.cursorRadius = 20; // Reduced from 60 to 40
    this.cursorAvoidStrength = 0.1; // Reduced from 3.5 to 1.8 for less noticeable avoidance

    // Wall drawing functionality
    this.walls = []; // Array to store wall points
    this.drawingWalls = true; // Always enabled since it's the only mode
    this.currentWall = null; // Current wall being drawn
    this.wallBrushSize = 4; // Wall brush size in pixels (halved from 8px to 4px)
    this.wallColor = "#ffffff"; // Wall color (white)
    this.lastDrawPoint = null; // Last point where brush was drawn
    this.minDrawDistance = 2; // Significantly reduced for continuous walls
    this.eraserMode = false; // Track if we're in eraser mode
    this.eraserSize = this.wallBrushSize * 3; // Size of eraser relative to brush size

    // Set cursor to crosshair by default since drawing is always enabled
    this.canvas.style.cursor = "crosshair";

    // Audio system initialization
    this.audioEngine = new AudioEngine();
    this.audioEnabled = false; // Keep audio off by default
    this.audioTriggerCount = 0;
    this.audioTriggerInterval = 8; // Trigger sound every N frames

    // Note: AudioContext will be initialized only when audio toggle button is clicked

    // Add time tracking variables for frame-rate independence
    this.lastTime = 0;
    this.targetFPS = this.config.targetFPS;
    this.timeStep = 1000 / this.targetFPS; // ms per update
    this.accumulatedTime = 0;

    // Set canvas dimensions
    this.resizeCanvas();

    // Create initial boids
    this.initBoids(this.config.boidCount);

    // Set up wall drawing event listeners
    this.setupWallDrawing();

    // Add cursor tracking listener
    this.setupCursorTracking();

    // Prevent text selection on canvas to improve mobile experience
    this.preventTextSelection();

    // Apply special handling for Safari/iOS devices
    this.applySafariOptimizations();

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

  // Setup wall drawing event listeners
  setupWallDrawing() {
    // MOUSE EVENTS
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
      this.wallNeedsUpdate = true; // Mark walls for redraw
    });

    // Also handle mouse leaving canvas
    this.canvas.addEventListener("mouseleave", () => {
      if (!this.drawingWalls || !this.currentWall) return;

      if (this.currentWall.length > 1) {
        this.walls.push(this.currentWall);
      }

      this.currentWall = null;
      this.lastDrawPoint = null;
      this.wallNeedsUpdate = true; // Mark walls for redraw
    });

    // TOUCH EVENTS for mobile support
    this.canvas.addEventListener("touchstart", (e) => {
      // Prevent default to stop scrolling/zooming
      e.preventDefault();

      if (!this.drawingWalls) return;

      const touch = e.touches[0]; // Get first touch point
      const coords = this.getTouchCoordinates(touch);

      if (this.eraserMode) {
        this.eraseWallsAt(coords.x, coords.y);
        // Save the last touch position for eraser interpolation
        this.lastDrawPoint = coords;
      } else {
        this.currentWall = [];
        this.lastDrawPoint = coords;
        this.addWallPoint(coords.x, coords.y);
      }
    });

    this.canvas.addEventListener("touchmove", (e) => {
      // Prevent default to stop scrolling/zooming
      e.preventDefault();

      if (!this.drawingWalls) return;

      const touch = e.touches[0]; // Get first touch point
      const coords = this.getTouchCoordinates(touch);

      if (this.eraserMode) {
        // Calculate distance from last point
        if (!this.lastDrawPoint) {
          this.lastDrawPoint = coords;
        }

        const dx = coords.x - this.lastDrawPoint.x;
        const dy = coords.y - this.lastDrawPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Add points continuously for erasing with interpolation
        if (distance >= this.minDrawDistance) {
          // For continuous erasing, add intermediate points
          const steps = Math.max(Math.ceil(distance / this.minDrawDistance), 1);

          for (let i = 1; i <= steps; i++) {
            const ratio = i / steps;
            const interpX = this.lastDrawPoint.x + dx * ratio;
            const interpY = this.lastDrawPoint.y + dy * ratio;
            this.eraseWallsAt(interpX, interpY);
          }

          this.lastDrawPoint = coords;
        }
      } else if (this.currentWall) {
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

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();

      if (!this.drawingWalls) return;

      if (!this.eraserMode && this.currentWall && this.currentWall.length > 1) {
        // Finalize the wall - only keep if it has some points
        this.walls.push(this.currentWall);
      }

      this.currentWall = null;
      this.lastDrawPoint = null;
      this.wallNeedsUpdate = true; // Mark walls for redraw
    });

    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();

      if (!this.drawingWalls) return;

      if (!this.eraserMode && this.currentWall && this.currentWall.length > 1) {
        // Finalize the wall - only keep if it has some points
        this.walls.push(this.currentWall);
      }

      this.currentWall = null;
      this.lastDrawPoint = null;
      this.wallNeedsUpdate = true; // Mark walls for redraw
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
        }
      }
    }

    // Update wall canvas immediately as points are added
    this.wallNeedsUpdate = true;
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
      this.wallNeedsUpdate = true; // Mark walls for redraw
    }
  }

  // Clear all walls
  clearWalls() {
    this.walls = [];
    this.wallNeedsUpdate = true; // Mark walls for redraw
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

    // Also check the current wall being drawn
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

    // Also check the current wall being drawn
    if (this.currentWall && this.currentWall.length > 0) {
      for (const point of this.currentWall) {
        // Calculate distance from boid to current wall point
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

    for (const boid of this.boids) {
      // Always apply cursor avoidance first if the method exists
      if (typeof boid.avoidCursor === "function") {
        boid.avoidCursor(this);
      }

      // Check for wall collisions and provide wall avoidance vectors
      // Also check for currentWall to handle the first wall being drawn
      if (
        this.walls.length > 0 ||
        (this.currentWall && this.currentWall.length > 0)
      ) {
        boid.avoidWalls(this);
      }

      boid.flock(
        this.boids,
        this.separationFactor,
        this.alignmentFactor,
        this.cohesionFactor
      );
      boid.update(timeScale); // Pass time scaling factor to boid update
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
      if (this.drawingWalls && this.currentWall) {
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

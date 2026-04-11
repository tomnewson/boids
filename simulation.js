import { Boid, PREY_MAX_SPEED, PREDATOR_MAX_SPEED, PREY_STEERING_FACTOR, PREDATOR_STEERING_FACTOR } from './boid.js';
import { AudioEngine } from './audio.js';

class Simulation {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d");

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "medium";

    // wallCanvas is created in init() to keep the constructor free of DOM side-effects
    this.wallCanvas = null;
    this.wallCtx = null;
    this.wallNeedsUpdate = true;

    this.wallSpatialIndex = new Map();
    this.gridCellSize = 20;

    this.CURSOR_MODES = {
      WALL: "WALL",
      ERASER: "ERASER",
      BOID: "BOID",
      PREDATOR: "PREDATOR",
      FOOD: "FOOD",
    };

    this.cursorMode = this.CURSOR_MODES.WALL;

    this.boids = [];
    this.food = [];
    this.running = true;
    this.separationFactor = 1.5;
    this.alignmentFactor = 1.0;
    this.cohesionFactor = 1.0;

    this.config = {
      boidCount: config.boidCount !== undefined ? config.boidCount : 0,
      targetFPS: config.targetFPS || 60,
    };

    this.cursorPosition = { x: -100, y: -100 };
    this.cursorRadius = 20;
    this.cursorAvoidStrength = 0.1;
    this.touchActive = false;

    this.walls = [];
    this.currentWall = null;
    this.wallBrushSize = 4;
    this.wallColor = "#ffffff";
    this.lastDrawPoint = null;
    this.minDrawDistance = 2;
    this.eraserSize = this.wallBrushSize * 3;

    this.bgImage = null;

    this.audioEngine = new AudioEngine();
    this.audioEnabled = false;
    this.audioTriggerCount = 0;
    this.audioTriggerInterval = 8;

    this.lastTime = 0;
    this.targetFPS = this.config.targetFPS;
    this.timeStep = 1000 / this.targetFPS;
    this.accumulatedTime = 0;
  }

  // Called by app.js after construction; keeps constructor free of DOM side-effects
  init() {
    this.wallCanvas = document.createElement("canvas");
    this.wallCtx = this.wallCanvas.getContext("2d", { alpha: true });

    this.canvas.style.cursor = "crosshair";

    this.resizeCanvas();
    this.initBoids(this.config.boidCount);
    this.setupDrawing();
    this.setupCursorTracking();
    this.preventTextSelection();
    this.applySafariOptimizations();
    this.rebuildWallSpatialIndex();
    this.animate();
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    // Read CSS-pixel size from DOM (accounts for zoom, Safari URL bar, etc.)
    const rect = this.canvas.getBoundingClientRect();
    const logicalWidth = rect.width;
    const logicalHeight = rect.height;

    this.canvas.logicalWidth = logicalWidth;
    this.canvas.logicalHeight = logicalHeight;

    // Scale buffer to physical pixels for crisp HiDPI rendering
    this.canvas.width = Math.round(logicalWidth * dpr);
    this.canvas.height = Math.round(logicalHeight * dpr);

    // Canvas resize resets all context state — re-apply settings
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "medium";

    // Wall canvas stays at logical size (solid fills are crisp at 1:1)
    this.wallCanvas.width = Math.round(logicalWidth);
    this.wallCanvas.height = Math.round(logicalHeight);
    this.wallNeedsUpdate = true;

    this.rebuildWallSpatialIndex();
  }

  handleResize() {
    this.resizeCanvas();

    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    for (const boid of this.boids) {
      if (boid.position.x > w) boid.position.x = w - 10;
      if (boid.position.y > h) boid.position.y = h - 10;
    }
  }

  rebuildWallSpatialIndex() {
    this.wallSpatialIndex.clear();

    const indexPoint = (point) => {
      const cellKey = `${Math.floor(point.x / this.gridCellSize)},${Math.floor(point.y / this.gridCellSize)}`;
      if (!this.wallSpatialIndex.has(cellKey)) this.wallSpatialIndex.set(cellKey, []);
      this.wallSpatialIndex.get(cellKey).push(point);
    };

    for (const wall of this.walls) {
      for (const point of wall) indexPoint(point);
    }

    if (this.currentWall) {
      for (const point of this.currentWall) indexPoint(point);
    }
  }

  initBoids(count) {
    this.boids = [];

    const predatorCount = Math.round(count * 0.15);
    const preyCount = count - predatorCount;

    for (let i = 0; i < preyCount; i++) {
      const boid = new Boid(
        Math.random() * this.canvas.logicalWidth,
        Math.random() * this.canvas.logicalHeight,
        this.canvas
      );
      boid.maxSpeed = PREY_MAX_SPEED;
      boid.steeringFactor = PREY_STEERING_FACTOR;
      this.boids.push(boid);
    }

    for (let i = 0; i < predatorCount; i++) {
      const boid = new Boid(
        Math.random() * this.canvas.logicalWidth,
        Math.random() * this.canvas.logicalHeight,
        this.canvas
      );
      boid.isPredator = true;
      boid.health = 80;
      boid.maxHealth = 150;
      boid.healthDecayRate = 0.12;
      boid.reproductionThreshold = 120;
      boid.reproductionCost = 60;
      boid.foodGenerationRate = 0;
      boid.maxSpeed = PREDATOR_MAX_SPEED;
      boid.steeringFactor = PREDATOR_STEERING_FACTOR;
      this.boids.push(boid);
    }
  }

  reset() {
    if (this.audioEnabled && this.audioEngine._initialized && this.boids.length > 0) {
      const { logicalWidth: w, logicalHeight: h } = this.canvas;
      [...this.boids]
        .sort(() => Math.random() - 0.5)
        .slice(0, 8)
        .forEach((boid, i) => {
          setTimeout(() => {
            this.audioEngine.playDeathSound(boid.position.x, boid.position.y, w, h, "player");
          }, i * 60);
        });
    }

    this.food = [];
    this.initBoids(this.config.boidCount);
  }

  updateParams(separation, alignment, cohesion) {
    this.separationFactor = separation;
    this.alignmentFactor = alignment;
    this.cohesionFactor = cohesion;
  }

  setBackgroundImage(img) {
    this.bgImage = img;
  }

  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  getTouchCoordinates(touch) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
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
        case this.CURSOR_MODES.FOOD:
          this.spawnFood(coords.x, coords.y);
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
          case this.CURSOR_MODES.FOOD:
            const nowFood = Date.now();
            if (!this.lastFoodSpawnTime || nowFood - this.lastFoodSpawnTime > 100) {
              this.spawnFood(coords.x, coords.y);
              this.lastFoodSpawnTime = nowFood;
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
        case this.CURSOR_MODES.FOOD:
          this.spawnFood(coords.x, coords.y);
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
        case this.CURSOR_MODES.FOOD:
          const nowFood = Date.now();
          if (!this.lastFoodSpawnTime || nowFood - this.lastFoodSpawnTime > 100) {
            this.spawnFood(coords.x, coords.y);
            this.lastFoodSpawnTime = nowFood;
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

  addWallPoint(x, y) {
    const checkRadius = Math.max(this.wallBrushSize * 2, 12);
    if (this.isFoodNearPosition(x, y, checkRadius)) return;

    const pointSize = this.wallBrushSize;
    const brushRadius = this.wallBrushSize * 1.5;

    for (let offsetX = -brushRadius; offsetX <= brushRadius; offsetX += pointSize) {
      for (let offsetY = -brushRadius; offsetY <= brushRadius; offsetY += pointSize) {
        if (offsetX * offsetX + offsetY * offsetY <= brushRadius * brushRadius) {
          const px = x + offsetX;
          const py = y + offsetY;
          const point = { x: px, y: py, size: pointSize };

          this.currentWall.push(point);

          const cellKey = `${Math.floor(px / this.gridCellSize)},${Math.floor(py / this.gridCellSize)}`;
          if (!this.wallSpatialIndex.has(cellKey)) this.wallSpatialIndex.set(cellKey, []);
          this.wallSpatialIndex.get(cellKey).push(point);
        }
      }
    }

    this.wallNeedsUpdate = true;
  }

  setCursorMode(mode) {
    if (Object.values(this.CURSOR_MODES).includes(mode)) {
      this.cursorMode = mode;
      this.updateCursor();
    }
  }

  updateCursor() {
    switch (this.cursorMode) {
      case this.CURSOR_MODES.ERASER:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23ff0000" fill-opacity="0.6"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.BOID:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="%2300ff00" fill-opacity="0.333"/><circle cx="12" cy="12" r="4" fill="%2300ff00" fill-opacity="0.667"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.PREDATOR:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="%23ff0000" fill-opacity="0.333"/><circle cx="12" cy="12" r="4" fill="%23ff0000" fill-opacity="0.667"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.FOOD:
        this.canvas.style.cursor =
          'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="%23ffaa00" fill-opacity="0.333"/><circle cx="12" cy="12" r="4" fill="%23ffaa00" fill-opacity="0.667"/></svg>\') 12 12, auto';
        break;
      case this.CURSOR_MODES.WALL:
      default:
        this.canvas.style.cursor = "crosshair";
        break;
    }
  }

  spawnBoid(x, y, isPredator = false) {
    const newBoid = new Boid(x, y, this.canvas);

    if (isPredator) {
      newBoid.isPredator = true;
      newBoid.health = 80;
      newBoid.maxHealth = 150;
      newBoid.healthDecayRate = 0.12;
      newBoid.reproductionThreshold = 120;
      newBoid.reproductionCost = 60;
      newBoid.foodGenerationRate = 0;
      newBoid.maxSpeed = PREDATOR_MAX_SPEED;
      newBoid.steeringFactor = PREDATOR_STEERING_FACTOR;
    } else {
      newBoid.maxSpeed = PREY_MAX_SPEED;
      newBoid.steeringFactor = PREY_STEERING_FACTOR;
    }

    const angle = Math.random() * Math.PI * 2;
    newBoid.velocity.x = Math.cos(angle) * newBoid.maxSpeed * 0.5;
    newBoid.velocity.y = Math.sin(angle) * newBoid.maxSpeed * 0.5;

    this.boids.push(newBoid);
    newBoid.update(1.0);
  }

  generateSaturatedColor() {
    const hue = Math.random();
    let r, g, b;

    if (hue < 0.33) {
      r = Math.floor(Math.random() * 56) + 200;
      g = Math.floor(Math.random() * 156) + 100;
      b = Math.floor(Math.random() * 156) + 100;
    } else if (hue < 0.66) {
      r = Math.floor(Math.random() * 156) + 100;
      g = Math.floor(Math.random() * 56) + 200;
      b = Math.floor(Math.random() * 156) + 100;
    } else {
      r = Math.floor(Math.random() * 156) + 100;
      g = Math.floor(Math.random() * 156) + 100;
      b = Math.floor(Math.random() * 56) + 200;
    }

    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  }

  generateGlowColor(baseColor) {
    const match = baseColor.match(/rgba\((\d+), (\d+), (\d+), [\d.]+\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0.3)`;
    }
    return "rgba(255, 255, 255, 0.3)";
  }

  spawnFood(x, y) {
    if (this.isPointNearWall(x, y, 16)) return;

    const color = this.generateSaturatedColor();
    this.food.push({
      position: { x, y },
      size: 4,
      nutritionValue: 30,
      color,
      glowColor: this.generateGlowColor(color),
    });
  }

  eraseWallsAt(x, y) {
    const eraseRadiusSquared = this.eraserSize ** 2;
    let wallsModified = false;

    for (let w = 0; w < this.walls.length; w++) {
      const originalLength = this.walls[w].length;
      this.walls[w] = this.walls[w].filter((point) => {
        const dx = point.x - x;
        const dy = point.y - y;
        return dx * dx + dy * dy > eraseRadiusSquared;
      });
      if (this.walls[w].length !== originalLength) wallsModified = true;
    }

    if (wallsModified) {
      this.walls = this.walls.filter((wall) => wall.length > 0);
      this.wallNeedsUpdate = true;
      this.rebuildWallSpatialIndex();
    }

    const boidsRemoved = this.eraseBoids(x, y, eraseRadiusSquared);
    const foodRemoved = this.eraseFood(x, y, eraseRadiusSquared);

    return wallsModified || boidsRemoved || foodRemoved;
  }

  eraseBoids(x, y, radiusSquared) {
    const removedBoids = [];
    this.boids = this.boids.filter((boid) => {
      const dx = boid.position.x - x;
      const dy = boid.position.y - y;
      if (dx * dx + dy * dy <= radiusSquared) {
        removedBoids.push(boid);
        return false;
      }
      return true;
    });

    if (this.audioEnabled && removedBoids.length > 0 && this.audioEngine._initialized) {
      const maxSounds = Math.min(removedBoids.length, 3);
      for (let i = 0; i < maxSounds; i++) {
        this.audioEngine.playDeathSound(
          removedBoids[i].position.x,
          removedBoids[i].position.y,
          this.canvas.logicalWidth,
          this.canvas.logicalHeight,
          "player"
        );
      }
    }

    return removedBoids.length > 0;
  }

  eraseFood(x, y, radiusSquared) {
    const originalLength = this.food.length;
    this.food = this.food.filter((food) => {
      const dx = food.position.x - x;
      const dy = food.position.y - y;
      return dx * dx + dy * dy > radiusSquared;
    });
    return this.food.length < originalLength;
  }

  clearWalls() {
    this.walls = [];
    this.wallSpatialIndex.clear();
    this.wallNeedsUpdate = true;
  }

  getWallPointsNearPosition(x, y, radius) {
    const cellRadius = Math.ceil(radius / this.gridCellSize);
    const cx = Math.floor(x / this.gridCellSize);
    const cy = Math.floor(y / this.gridCellSize);
    const nearbyPoints = [];

    for (let ox = -cellRadius; ox <= cellRadius; ox++) {
      for (let oy = -cellRadius; oy <= cellRadius; oy++) {
        const cell = this.wallSpatialIndex.get(`${cx + ox},${cy + oy}`);
        if (cell) nearbyPoints.push(...cell);
      }
    }

    return nearbyPoints;
  }

  isPointNearWall(x, y, radius) {
    const nearbyPoints = this.getWallPointsNearPosition(x, y, radius + this.wallBrushSize);
    for (const point of nearbyPoints) {
      const dx = x - point.x;
      const dy = y - point.y;
      if (dx * dx + dy * dy < (point.size / 2 + radius * 0.6) ** 2) return true;
    }
    return false;
  }

  isFoodNearPosition(x, y, radius) {
    for (const food of this.food) {
      const dx = x - food.position.x;
      const dy = y - food.position.y;
      if (dx * dx + dy * dy < (food.size * 2 + radius) ** 2) return true;
    }
    return false;
  }

  getWallNormal(x, y) {
    let closestDistance = Infinity;
    let normal = { x: 0, y: 0 };

    for (const point of this.getWallPointsNearPosition(x, y, 50)) {
      const dx = x - point.x;
      const dy = y - point.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < closestDistance) {
        closestDistance = distSq;
        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          normal.x = dx / dist;
          normal.y = dy / dist;
        }
      }
    }

    return normal;
  }

  setupCursorTracking() {
    this.canvas.addEventListener("mousemove", (e) => {
      const coords = this.getCanvasCoordinates(e);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
      this.touchActive = false;
    });

    this.canvas.addEventListener("mouseleave", () => {
      if (!this.touchActive) {
        this.cursorPosition.x = -100;
        this.cursorPosition.y = -100;
      }
    });

    this.canvas.addEventListener("mouseenter", (e) => {
      const coords = this.getCanvasCoordinates(e);
      this.cursorPosition.x = coords.x;
      this.cursorPosition.y = coords.y;
      this.touchActive = false;
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

  preventTextSelection() {
    this.canvas.style.webkitUserSelect = "none";
    this.canvas.style.userSelect = "none";
    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  getCursorNormal(x, y) {
    const dx = x - this.cursorPosition.x;
    const dy = y - this.cursorPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      return { x: dx / distance, y: dy / distance };
    }

    return { x: Math.random() - 0.5, y: Math.random() - 0.5 };
  }

  applySafariOptimizations() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      this.canvas.style.transform = "translateZ(0)";
      this.canvas.style.backfaceVisibility = "hidden";
      this.timeStep = 16.666;
    }
  }

  update(deltaTime) {
    const timeScale = deltaTime / this.timeStep;
    const killedBoids = [];
    const newBoids = [];

    for (const boid of this.boids) {
      boid.avoidCursor(this);

      if (this.walls.length > 0 || (this.currentWall && this.currentWall.length > 0)) {
        boid.avoidWalls(this);
      }

      boid.flock(this.boids, this.separationFactor, this.alignmentFactor, this.cohesionFactor);

      if (this.food.length > 0) boid.seekFood(this.food);

      boid.update(timeScale);

      if (this.food.length > 0) {
        const consumedFoodIndex = boid.checkFoodCollision(this.food);
        if (consumedFoodIndex !== null) this.food.splice(consumedFoodIndex, 1);
      }

      if (boid.killed) killedBoids.push(boid);

      if (boid.readyToReproduce) {
        const offspring = boid.reproduce();
        if (offspring) newBoids.push(offspring);
      }
    }

    if (killedBoids.length > 0) {
      if (this.audioEnabled && this.audioEngine._initialized) {
        const maxSounds = Math.min(killedBoids.length, 2);
        for (let i = 0; i < maxSounds; i++) {
          this.audioEngine.playDeathSound(
            killedBoids[i].position.x,
            killedBoids[i].position.y,
            this.canvas.logicalWidth,
            this.canvas.logicalHeight,
            "predator"
          );
        }
      }
      this.boids = this.boids.filter((boid) => !boid.killed);
    }

    if (newBoids.length > 0) {
      this.boids = this.boids.concat(newBoids);
    }

    this.applyPopulationControls();

    if (this.audioEnabled) {
      this.audioTriggerCount++;
      if (this.audioTriggerCount % this.audioTriggerInterval === 0) {
        this.audioEngine.processBoids(this.boids, this.canvas, this.audioTriggerCount);
      }
    }
  }

  applyPopulationControls() {
    const maxBoids = 500;
    const minPreyRatio = 0.6;
    const maxPredatorRatio = 0.3;
    const minPredators = 3;

    let predatorCount = 0;
    let preyCount = 0;
    for (const boid of this.boids) {
      if (boid.isPredator) predatorCount++;
      else preyCount++;
    }

    const totalBoids = predatorCount + preyCount;

    if (totalBoids > maxBoids) {
      const excessBoids = totalBoids - maxBoids;
      const currentPredatorRatio = predatorCount / totalBoids;
      const currentPreyRatio = preyCount / totalBoids;

      let predatorsToRemove = 0;
      let preyToRemove = 0;

      if (currentPredatorRatio > maxPredatorRatio) {
        predatorsToRemove = Math.min(
          excessBoids,
          predatorCount - Math.max(minPredators, Math.floor(totalBoids * maxPredatorRatio))
        );
        preyToRemove = excessBoids - predatorsToRemove;
      } else if (currentPreyRatio < minPreyRatio && predatorCount > minPredators) {
        predatorsToRemove = Math.min(excessBoids, predatorCount - minPredators);
        preyToRemove = excessBoids - predatorsToRemove;
      } else {
        predatorsToRemove = Math.min(
          Math.floor(excessBoids * currentPredatorRatio),
          predatorCount - minPredators
        );
        preyToRemove = excessBoids - predatorsToRemove;
      }

      if (predatorsToRemove > 0) {
        const predators = this.boids.filter((b) => b.isPredator).sort((a, b) => a.health - b.health);
        for (let i = 0; i < predatorsToRemove && i < predators.length; i++) {
          predators[i].killed = true;
        }
      }

      if (preyToRemove > 0) {
        const prey = this.boids.filter((b) => !b.isPredator).sort((a, b) => a.health - b.health);
        for (let i = 0; i < preyToRemove && i < prey.length; i++) {
          prey[i].killed = true;
        }
      }

      this.boids = this.boids.filter((boid) => !boid.killed);
    }
  }

  draw() {
    if (this.bgImage) {
      const iw = this.bgImage.naturalWidth, ih = this.bgImage.naturalHeight;
      const cw = this.canvas.logicalWidth,  ch = this.canvas.logicalHeight;
      const srcAspect = iw / ih, dstAspect = cw / ch;
      let sx, sy, sw, sh;
      if (srcAspect > dstAspect) {
        sh = ih; sw = sh * dstAspect;
        sx = (iw - sw) / 2; sy = 0;
      } else {
        sw = iw; sh = sw / dstAspect;
        sx = 0; sy = (ih - sh) / 2;
      }
      this.ctx.drawImage(this.bgImage, sx, sy, sw, sh, 0, 0, cw, ch);
    } else {
      this.ctx.fillStyle = "#111";
      this.ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);
    }

    if (this.wallNeedsUpdate) {
      this.wallCtx.clearRect(0, 0, this.wallCanvas.width, this.wallCanvas.height);
      this.wallCtx.fillStyle = this.wallColor;

      for (const wall of this.walls) {
        this.drawWallSegment(this.wallCtx, wall);
      }

      if (this.cursorMode === this.CURSOR_MODES.WALL && this.currentWall) {
        this.drawWallSegment(this.wallCtx, this.currentWall);
      }

      this.wallNeedsUpdate = false;
    }

    // Disable smoothing when compositing walls to keep edges crisp on fractional DPR screens
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.wallCanvas, 0, 0);
    this.ctx.imageSmoothingEnabled = true;

    for (const food of this.food) {
      const glowSize = food.size * 4;
      this.ctx.fillStyle = food.glowColor;
      this.ctx.fillRect(food.position.x - glowSize / 2, food.position.y - glowSize / 2, glowSize, glowSize);

      const foodSize = food.size * 2;
      this.ctx.fillStyle = food.color;
      this.ctx.fillRect(food.position.x - foodSize / 2, food.position.y - foodSize / 2, foodSize, foodSize);
    }

    for (const boid of this.boids) {
      boid.draw(this.ctx, this.boids);
    }
  }

  drawWallSegment(ctx, wallPoints) {
    ctx.imageSmoothingEnabled = false;

    const gridSize = Math.floor(this.wallBrushSize);
    const wallMap = new Map();

    for (const point of wallPoints) {
      const gx = Math.floor(point.x / gridSize) * gridSize;
      const gy = Math.floor(point.y / gridSize) * gridSize;
      const key = `${gx},${gy}`;
      if (!wallMap.has(key)) wallMap.set(key, { x: gx, y: gy });
    }

    for (const [_, point] of wallMap.entries()) {
      ctx.fillRect(point.x, point.y, gridSize, gridSize);
    }

    if (wallPoints === this.currentWall && wallPoints.length > 0) {
      ctx.imageSmoothingEnabled = true;
      const lastPoint = wallPoints[wallPoints.length - 1];
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(lastPoint.x, lastPoint.y, gridSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.wallColor;
    }
  }


  animate(currentTime = 0) {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    this.accumulatedTime += deltaTime;

    // Cap accumulated time to prevent spiral of death on slow devices
    if (this.accumulatedTime > 200) this.accumulatedTime = 200;

    if (this.running) {
      while (this.accumulatedTime >= this.timeStep) {
        this.update(this.timeStep);
        this.accumulatedTime -= this.timeStep;
      }
      this.draw();
    }

    requestAnimationFrame((time) => this.animate(time));
  }

  togglePause() {
    this.running = !this.running;
  }

  toggleAudio() {
    if (!this.audioEngine._initialized && !this.audioEnabled) {
      setTimeout(() => this.audioEngine.initialize(), 100);
    }
    this.audioEnabled = this.audioEngine.toggle();
    return this.audioEnabled;
  }
}

export { Simulation };

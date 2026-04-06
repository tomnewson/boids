class AudioEngine {
  constructor() {
    this._audioContext = null;
    this._masterGain = null;
    this._initialized = false;

    // Pentatonic scale frequencies in Hz
    this.pentatonicScale = [
      261.63, // C4
      293.66, // D4
      329.63, // E4
      392.0,  // G4
      440.0,  // A4
      523.25, // C5
      587.33, // D5
      659.25, // E5
    ];

    this.lastNoteTriggers = {};
    this.noteThrottle = 200;
    this.lastDeathSoundTime = 0;
    this.deathSoundThrottle = 100;

    document.addEventListener(
      "visibilitychange",
      this._handleVisibilityChange.bind(this)
    );
  }

  _handleVisibilityChange() {
    if (document.visibilityState === "visible" && this._initialized) {
      this._checkAndRecoverAudioContext();
    }
  }

  _checkAndRecoverAudioContext() {
    if (this._audioContext && this._audioContext.state !== "running") {
      this._recreateAudioContext();
    }
  }

  _recreateAudioContext() {
    try {
      if (this._audioContext) {
        try {
          this._masterGain.disconnect();
        } catch (e) {
          // ignore
        }
      }

      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._audioContext.createGain();
      this._masterGain.gain.value = 0.3;
      this._masterGain.connect(this._audioContext.destination);
    } catch (e) {
      console.error("Failed to recreate AudioContext:", e);
      this._initialized = false;
    }
  }

  initialize() {
    if (!this._initialized) {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._audioContext.createGain();
      this._masterGain.gain.value = 0.3;
      this._masterGain.connect(this._audioContext.destination);
      this._initialized = true;
    }
    return this._initialized;
  }

  get audioContext() {
    if (!this._initialized) return null;
    this._checkAndRecoverAudioContext();
    return this._audioContext;
  }

  // Map Y position to a note in the pentatonic scale
  positionToNote(y, canvasHeight) {
    const noteIndex = Math.floor((y / canvasHeight) * this.pentatonicScale.length);
    return this.pentatonicScale[Math.min(noteIndex, this.pentatonicScale.length - 1)];
  }

  playNote(frequency, duration = 0.5, pan = 0, volume = 0.2, type = "sine") {
    if (!this._initialized || !this._audioContext) return;

    const now = this._audioContext.currentTime;
    const oscillator = this._audioContext.createOscillator();
    const gainNode = this._audioContext.createGain();
    const pannerNode = this._audioContext.createStereoPanner();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    pannerNode.pan.value = pan;

    oscillator.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(this._masterGain);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);

    oscillator.onended = () => {
      gainNode.disconnect();
      pannerNode.disconnect();
    };
  }

  playDeathSound(x, y, canvasWidth, canvasHeight, cause = "unknown") {
    if (cause !== "predator" && cause !== "player") return;
    if (!this._initialized || !this._audioContext) return;

    const now = Date.now();
    if (now - this.lastDeathSoundTime < this.deathSoundThrottle) return;
    this.lastDeathSoundTime = now;

    const pan = (x / canvasWidth) * 2 - 1;
    const oscCount = 3;
    const oscillators = [];
    const gainNodes = [];
    const pannerNodes = [];
    const baseFreq = this.positionToNote(y, canvasHeight) * 0.5;

    for (let i = 0; i < oscCount; i++) {
      const oscillator = this._audioContext.createOscillator();
      const gainNode = this._audioContext.createGain();
      const pannerNode = this._audioContext.createStereoPanner();

      oscillator.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(this._masterGain);
      pannerNode.pan.value = pan;

      oscillators.push(oscillator);
      gainNodes.push(gainNode);
      pannerNodes.push(pannerNode);
    }

    const startTime = this._audioContext.currentTime;

    oscillators[0].type = "sawtooth";
    oscillators[0].frequency.setValueAtTime(baseFreq * 1.5, startTime);
    oscillators[0].frequency.exponentialRampToValueAtTime(baseFreq * 0.3, startTime + 0.4);
    gainNodes[0].gain.setValueAtTime(0, startTime);
    gainNodes[0].gain.linearRampToValueAtTime(0.3, startTime + 0.02);
    gainNodes[0].gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    oscillators[1].type = "square";
    oscillators[1].frequency.setValueAtTime(baseFreq * 1.0, startTime + 0.05);
    oscillators[1].frequency.exponentialRampToValueAtTime(baseFreq * 0.2, startTime + 0.5);
    gainNodes[1].gain.setValueAtTime(0, startTime);
    gainNodes[1].gain.linearRampToValueAtTime(0.25, startTime + 0.1);
    gainNodes[1].gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

    oscillators[2].type = "triangle";
    oscillators[2].frequency.setValueAtTime(baseFreq * 2, startTime);
    oscillators[2].frequency.linearRampToValueAtTime(baseFreq * 1.5, startTime + 0.2);
    oscillators[2].frequency.exponentialRampToValueAtTime(baseFreq * 0.7, startTime + 0.4);
    gainNodes[2].gain.setValueAtTime(0, startTime);
    gainNodes[2].gain.linearRampToValueAtTime(0.2, startTime + 0.05);
    gainNodes[2].gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    const duration = 0.5;
    oscillators.forEach((osc, i) => {
      osc.start(startTime);
      osc.stop(startTime + duration);
      osc.onended = () => {
        gainNodes[i].disconnect();
        pannerNodes[i].disconnect();
      };
    });
  }

  processBoids(boids, canvas, audioTriggerCount) {
    if (!this._initialized) return;

    const maxNotes = 3;
    const now = Date.now();

    const interestingBoids = this.findInterestingBoids(boids, maxNotes, audioTriggerCount);

    interestingBoids.forEach((boid) => {
      const boidId = boid.id;

      if (
        this.lastNoteTriggers[boidId] &&
        now - this.lastNoteTriggers[boidId] < this.noteThrottle
      ) {
        return;
      }

      const frequency = this.positionToNote(boid.position.y, canvas.logicalHeight);
      const speed = Math.sqrt(boid.velocity.x ** 2 + boid.velocity.y ** 2);
      const normalizedSpeed = Math.min(speed / boid.maxSpeed, 1.0);
      const duration = 0.3 + (1 - normalizedSpeed) * 0.7;
      const pan = (boid.position.x / canvas.logicalWidth) * 2 - 1;
      const volume = 0.1 + normalizedSpeed * 0.2;

      const types = ["sine", "triangle", "sawtooth"];
      const typeIndex = Math.floor((boid.position.x / canvas.logicalWidth) * types.length);
      const type = types[Math.min(typeIndex, types.length - 1)];

      this.playNote(frequency, duration, pan, volume, type);
      this.lastNoteTriggers[boidId] = now;
    });
  }

  findInterestingBoids(boids, count, seed) {
    const criteriaIndex = seed % 4;
    let sortedBoids;

    switch (criteriaIndex) {
      case 0: // Fast moving boids
        sortedBoids = [...boids].sort((a, b) => {
          const speedA = Math.sqrt(a.velocity.x ** 2 + a.velocity.y ** 2);
          const speedB = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
          return speedB - speedA;
        });
        break;
      case 1: // Boids near the top of the screen
        sortedBoids = [...boids].sort((a, b) => a.position.y - b.position.y);
        break;
      case 2: // Boids in crowded areas
        sortedBoids = [...boids]
          .map((boid) => {
            let neighborCount = 0;
            for (const other of boids) {
              if (other !== boid) {
                const dx = boid.position.x - other.position.x;
                const dy = boid.position.y - other.position.y;
                if (Math.sqrt(dx * dx + dy * dy) < 30) neighborCount++;
              }
            }
            return { boid, neighborCount };
          })
          .sort((a, b) => b.neighborCount - a.neighborCount)
          .map((item) => item.boid);
        break;
      case 3: // Random selection
        sortedBoids = [...boids].sort(() => Math.random() - 0.5);
        break;
    }

    return sortedBoids.slice(0, count);
  }

  start() {
    if (!this._initialized) {
      this.initialize();
    } else {
      this._checkAndRecoverAudioContext();
    }

    if (this._audioContext && this._audioContext.state === "suspended") {
      this._audioContext.resume().catch((e) => {
        console.error("Failed to resume AudioContext:", e);
        this._recreateAudioContext();
      });
    }

    return (
      this._initialized &&
      this._audioContext &&
      this._audioContext.state === "running"
    );
  }

  stop() {
    if (this._audioContext && this._audioContext.state === "running") {
      this._audioContext.suspend();
    }
    return false;
  }

  toggle() {
    if (!this._initialized) {
      this.initialize();

      if (this._audioContext && this._audioContext.state !== "running") {
        this._audioContext.resume().catch((e) => {
          console.error("Failed to start AudioContext:", e);
          this._recreateAudioContext();
        });
      }

      return true;
    }

    if (this._audioContext && this._audioContext.state === "closed") {
      this._recreateAudioContext();
      if (this._audioContext) {
        this._audioContext.resume().catch((e) => {
          console.error("Failed to start recreated AudioContext:", e);
        });
      }
      return true;
    }

    try {
      if (this._audioContext?.state === "running") {
        return this.stop();
      } else if (this._audioContext) {
        this._audioContext.resume().catch((e) => {
          console.error("Failed to resume AudioContext:", e);
          this._recreateAudioContext();
        });
        return true;
      }
    } catch (e) {
      console.error("Error in audio toggle:", e);
      this._recreateAudioContext();
      return true;
    }

    return false;
  }

  isRunning() {
    return this._initialized && this._audioContext?.state === "running";
  }
}

export { AudioEngine };

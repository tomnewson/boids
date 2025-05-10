class AudioEngine {
  constructor() {
    // Defer creation of AudioContext until a user interaction
    this._audioContext = null;
    this._masterGain = null;
    this._initialized = false;

    // Define pentatonic scale notes (frequencies in Hz)
    this.pentatonicScale = [
      261.63, // C4
      293.66, // D4
      329.63, // E4
      392.0, // G4
      440.0, // A4
      523.25, // C5
      587.33, // D5
      659.25, // E5
    ];

    this.lastNoteTriggers = {};
    this.noteThrottle = 200; // Minimum ms between notes from the same source
    this.lastDeathSoundTime = 0; // Track when we last played a death sound
    this.deathSoundThrottle = 100; // Minimum ms between death sounds

    // Add visibility change listener to handle tab switching
    document.addEventListener(
      "visibilitychange",
      this._handleVisibilityChange.bind(this)
    );
  }

  // Handle visibility changes (tab switching)
  _handleVisibilityChange() {
    // When coming back to the tab, check if audio context needs recovery
    if (document.visibilityState === "visible" && this._initialized) {
      this._checkAndRecoverAudioContext();
    }
  }

  // Check and recover audio context if it's in a suspended or interrupted state
  _checkAndRecoverAudioContext() {
    if (this._audioContext && this._audioContext.state !== "running") {
      console.log(
        "AudioContext needs recovery. Current state:",
        this._audioContext.state
      );
      // The context exists but is suspended - we need to recreate it
      this._recreateAudioContext();
    }
  }

  // Recreate the audio context if it's in an unrecoverable state
  _recreateAudioContext() {
    try {
      // Clean up old context if possible
      if (this._audioContext) {
        try {
          this._masterGain.disconnect();
        } catch (e) {
          console.warn("Could not disconnect old master gain:", e);
        }
      }

      // Create new context and gain node
      this._audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this._masterGain = this._audioContext.createGain();
      this._masterGain.gain.value = 0.3; // Set overall volume
      this._masterGain.connect(this._audioContext.destination);
      console.log(
        "AudioContext recreated successfully. New state:",
        this._audioContext.state
      );
    } catch (e) {
      console.error("Failed to recreate AudioContext:", e);
      this._initialized = false; // Mark as uninitialized so next toggle will try again
    }
  }

  // Lazy initialize the AudioContext on first user interaction
  initialize() {
    if (!this._initialized) {
      // Initialize Web Audio API
      this._audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this._masterGain = this._audioContext.createGain();
      this._masterGain.gain.value = 0.3; // Set overall volume
      this._masterGain.connect(this._audioContext.destination);
      this._initialized = true;
      console.log("AudioContext initialized successfully");
    }
    return this._initialized;
  }

  // Get audioContext, initializing if needed
  get audioContext() {
    if (!this._initialized) {
      console.warn("AudioContext accessed before initialization");
      return null;
    }

    // Check if context needs recovery
    this._checkAndRecoverAudioContext();

    return this._audioContext;
  }

  // Map Y position to a note in our scale
  positionToNote(y, canvasHeight) {
    const normalizedY = y / canvasHeight;
    const noteIndex = Math.floor(normalizedY * this.pentatonicScale.length);
    return this.pentatonicScale[
      Math.min(noteIndex, this.pentatonicScale.length - 1)
    ];
  }

  // Play a note with the given frequency
  playNote(frequency, duration = 0.5, pan = 0, volume = 0.2, type = "sine") {
    if (!this._initialized || !this._audioContext) return;

    const now = this._audioContext.currentTime;

    // Create oscillator and gain nodes
    const oscillator = this._audioContext.createOscillator();
    const gainNode = this._audioContext.createGain();
    const pannerNode = this._audioContext.createStereoPanner();

    // Set parameters
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    pannerNode.pan.value = pan; // -1 (left) to 1 (right)

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(this._masterGain);

    // Apply envelope
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Start and stop
    oscillator.start(now);
    oscillator.stop(now + duration);

    // Clean up when done
    oscillator.onended = () => {
      gainNode.disconnect();
      pannerNode.disconnect();
    };
  }

  // Play a blood-curdling cry when a boid is killed
  playDeathSound(x, y, canvasWidth, canvasHeight) {
    if (!this._initialized || !this._audioContext) return;

    // Throttle death sounds to prevent audio overload
    const now = Date.now();
    if (now - this.lastDeathSoundTime < this.deathSoundThrottle) return;
    this.lastDeathSoundTime = now;

    // Calculate pan based on x position
    const pan = (x / canvasWidth) * 2 - 1; // -1 (left) to 1 (right)

    // Create oscillators for a complex sound
    const oscCount = 3;
    const oscillators = [];
    const gainNodes = [];
    const pannerNodes = [];

    // Get base frequency from y position but with lower range than normal notes
    const baseFreq = this.positionToNote(y, canvasHeight) * 0.5; // Halve the frequency to make it lower

    for (let i = 0; i < oscCount; i++) {
      // Create audio nodes
      const oscillator = this._audioContext.createOscillator();
      const gainNode = this._audioContext.createGain();
      const pannerNode = this._audioContext.createStereoPanner();

      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(this._masterGain);

      // Add to arrays for frequency/envelope control
      oscillators.push(oscillator);
      gainNodes.push(gainNode);
      pannerNodes.push(pannerNode);

      // Set pan position
      pannerNode.pan.value = pan;
    }

    // Start time
    const startTime = this._audioContext.currentTime;

    // First oscillator: quick falling pitch (initial scream) - lowered
    oscillators[0].type = "sawtooth";
    oscillators[0].frequency.setValueAtTime(baseFreq * 1.5, startTime);
    oscillators[0].frequency.exponentialRampToValueAtTime(
      baseFreq * 0.3,
      startTime + 0.4
    );
    gainNodes[0].gain.setValueAtTime(0, startTime);
    gainNodes[0].gain.linearRampToValueAtTime(0.3, startTime + 0.02);
    gainNodes[0].gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    // Second oscillator: noisy tone (distorted chip) - lowered
    oscillators[1].type = "square";
    oscillators[1].frequency.setValueAtTime(baseFreq * 1.0, startTime + 0.05);
    oscillators[1].frequency.exponentialRampToValueAtTime(
      baseFreq * 0.2,
      startTime + 0.5
    );
    gainNodes[1].gain.setValueAtTime(0, startTime);
    gainNodes[1].gain.linearRampToValueAtTime(0.25, startTime + 0.1);
    gainNodes[1].gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

    // Third oscillator: lower-pitched growl (keeping chip tune feeling but deeper)
    oscillators[2].type = "triangle";
    oscillators[2].frequency.setValueAtTime(baseFreq * 2, startTime);
    oscillators[2].frequency.linearRampToValueAtTime(
      baseFreq * 1.5,
      startTime + 0.2
    );
    oscillators[2].frequency.exponentialRampToValueAtTime(
      baseFreq * 0.7,
      startTime + 0.4
    );
    gainNodes[2].gain.setValueAtTime(0, startTime);
    gainNodes[2].gain.linearRampToValueAtTime(0.2, startTime + 0.05);
    gainNodes[2].gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    // Start and stop all oscillators
    const duration = 0.5; // Slightly longer sound duration for lower tones
    oscillators.forEach((osc, i) => {
      osc.start(startTime);
      osc.stop(startTime + duration);

      // Clean up when done
      osc.onended = () => {
        gainNodes[i].disconnect();
        pannerNodes[i].disconnect();
      };
    });
  }

  // Process boids to generate music
  processBoids(boids, canvas, audioTriggerCount) {
    if (!this._initialized) return;

    // Limit how many notes we play at once
    const maxNotes = 3;
    const now = Date.now();

    // Find boids that are interesting (fast moving, close to others, etc)
    const interestingBoids = this.findInterestingBoids(
      boids,
      maxNotes,
      audioTriggerCount
    );

    // Play notes for each interesting boid
    interestingBoids.forEach((boid) => {
      const boidId = boid.id || Math.random().toString(36).substring(2, 9); // Generate ID if needed

      // Throttle notes from the same boid
      if (
        this.lastNoteTriggers[boidId] &&
        now - this.lastNoteTriggers[boidId] < this.noteThrottle
      ) {
        return;
      }

      // Calculate note parameters
      const frequency = this.positionToNote(boid.position.y, canvas.height);
      const speed = Math.sqrt(
        boid.velocity.x * boid.velocity.x + boid.velocity.y * boid.velocity.y
      );
      const normalizedSpeed = Math.min(speed / boid.maxSpeed, 1.0);

      // Map speed to duration (faster = shorter note)
      const duration = 0.3 + (1 - normalizedSpeed) * 0.7;

      // Map horizontal position to pan
      const pan = (boid.position.x / canvas.width) * 2 - 1;

      // Map speed to volume (faster = louder)
      const volume = 0.1 + normalizedSpeed * 0.2;

      // Choose oscillator type based on position in the flock
      const types = ["sine", "triangle", "sawtooth"];
      const typeIndex = Math.floor(
        (boid.position.x / canvas.width) * types.length
      );
      const type = types[Math.min(typeIndex, types.length - 1)];

      // Play the note
      this.playNote(frequency, duration, pan, volume, type);
      this.lastNoteTriggers[boidId] = now;
    });
  }

  // Find boids that are "interesting" for sound generation
  findInterestingBoids(boids, count, seed) {
    // We'll use different criteria each time to create rhythmic variety
    const criteriaIndex = seed % 4;

    let sortedBoids;
    switch (criteriaIndex) {
      case 0: // Fast moving boids
        sortedBoids = [...boids].sort((a, b) => {
          const speedA = Math.sqrt(
            a.velocity.x * a.velocity.x + a.velocity.y * a.velocity.y
          );
          const speedB = Math.sqrt(
            b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y
          );
          return speedB - speedA;
        });
        break;

      case 1: // Boids near the top of the screen
        sortedBoids = [...boids].sort((a, b) => a.position.y - b.position.y);
        break;

      case 2: // Boids near other boids (crowded areas)
        sortedBoids = [...boids]
          .map((boid) => {
            let neighborCount = 0;
            for (const other of boids) {
              if (other !== boid) {
                const dx = boid.position.x - other.position.x;
                const dy = boid.position.y - other.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 30) neighborCount++;
              }
            }
            return { boid, neighborCount };
          })
          .sort((a, b) => b.neighborCount - a.neighborCount)
          .map((item) => item.boid);
        break;

      case 3: // Random selection for variety
        sortedBoids = [...boids].sort(() => Math.random() - 0.5);
        break;
    }

    return sortedBoids.slice(0, count);
  }

  // Start or resume audio
  start() {
    if (!this._initialized) {
      this.initialize();
    } else {
      // Check if context needs recovery
      this._checkAndRecoverAudioContext();
    }

    // Handle the case where context is suspended
    if (this._audioContext && this._audioContext.state === "suspended") {
      this._audioContext.resume().catch((e) => {
        console.error("Failed to resume AudioContext:", e);
        // If resume fails, try recreating
        this._recreateAudioContext();
      });
    }

    return (
      this._initialized &&
      this._audioContext &&
      this._audioContext.state === "running"
    );
  }

  // Suspend audio
  stop() {
    if (this._audioContext && this._audioContext.state === "running") {
      this._audioContext.suspend();
    }
    return false;
  }

  // Toggle audio state
  toggle() {
    console.log(
      "Audio toggle clicked. Current state:",
      this._initialized ? this._audioContext?.state : "not initialized"
    );

    // If not initialized, initialize and explicitly start it
    if (!this._initialized) {
      this.initialize();

      // After initialization, immediately resume the context
      // This is crucial for browsers that create AudioContext in suspended state
      if (this._audioContext && this._audioContext.state !== "running") {
        try {
          // Use .then to ensure we update the UI correctly after starting
          this._audioContext
            .resume()
            .then(() => {
              console.log(
                "AudioContext successfully started after initialization"
              );
            })
            .catch((e) => {
              console.error(
                "Failed to start AudioContext after initialization:",
                e
              );
              this._recreateAudioContext();
            });
        } catch (e) {
          console.error("Error trying to resume after initialization:", e);
          this._recreateAudioContext();
        }
      }

      // Always return true to update the UI immediately
      return true;
    }

    // First check if the context is in a valid state
    if (this._audioContext && this._audioContext.state === "closed") {
      // If context is closed (happens sometimes after tab switching), recreate it
      console.log("AudioContext was closed, recreating...");
      this._recreateAudioContext();

      // Then explicitly start it
      if (this._audioContext) {
        this._audioContext.resume().catch((e) => {
          console.error("Failed to start recreated AudioContext:", e);
        });
      }

      return true;
    }

    // Try the normal toggle flow with better promise handling
    try {
      if (this._audioContext?.state === "running") {
        return this.stop();
      } else if (this._audioContext) {
        // If suspended, try to resume it with better promise handling
        this._audioContext
          .resume()
          .then(() => {
            console.log("AudioContext successfully resumed");
          })
          .catch((e) => {
            console.error("Failed to resume AudioContext:", e);
            // If resume fails, try recreating the context
            this._recreateAudioContext();
          });

        // Always return true to update the UI immediately
        return true;
      }
    } catch (e) {
      // If any errors occur, recreate the context
      console.error("Error in audio toggle:", e);
      this._recreateAudioContext();

      // Always return true to update the UI
      return true;
    }

    // Fallback
    return false;
  }

  // Check if audio is currently running
  isRunning() {
    // First do the basic checks
    const basicCheck =
      this._initialized &&
      this._audioContext &&
      this._audioContext.state === "running";

    // If basic check passes, do a deeper check to ensure we're actually able to produce sound
    if (basicCheck) {
      return true;
    }

    // If audio context exists but isn't running, return false
    if (this._audioContext && this._audioContext.state !== "running") {
      return false;
    }

    // Default to false for any other state
    return false;
  }
}

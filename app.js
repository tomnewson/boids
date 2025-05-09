window.onload = () => {
  // Debug info
  const canvas = document.getElementById("boids-canvas");

  // Set canvas to fill the entire window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Enable anti-aliasing through image smoothing
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium"; // Balance between quality and performance

  console.log("Canvas element:", canvas);
  console.log("Canvas dimensions:", canvas.width, "x", canvas.height);

  // Configure simulation for optimal performance across devices
  const configureForDevice = () => {
    // Check for iOS device
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    // Create configuration object
    const config = {
      useHighPerformanceMode: true,
      boidCount: 0,
      targetFPS: 60,
    };

    // Check for low-end devices or potential low-power mode
    if (
      (isMobile && navigator.deviceMemory && navigator.deviceMemory < 4) ||
      (isIOS && isSafari)
    ) {
      // These settings help ensure consistent speed even in low power mode
      config.useHighPerformanceMode = false;
      // Never reduce the number of boids

      console.log(
        "Detected potential low-power mode device, optimizing performance"
      );
    }

    return config;
  };

  // Get configuration based on device
  const deviceConfig = configureForDevice();

  // Handle window resize
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // If simulation exists in global scope, tell it about the resize
    if (window.simulation) {
      window.simulation.handleResize(canvas.width, canvas.height);
    }
  });

  try {
    // Initialize simulation with device-specific configuration
    const simulation = new Simulation("boids-canvas", deviceConfig);
    // Store in window object so resize handler can access it
    window.simulation = simulation;

    // UI elements
    const separationSlider = document.getElementById("separation");
    const alignmentSlider = document.getElementById("alignment");
    const cohesionSlider = document.getElementById("cohesion");
    const separationValue = document.getElementById("separation-value");
    const alignmentValue = document.getElementById("alignment-value");
    const cohesionValue = document.getElementById("cohesion-value");
    const resetBtn = document.getElementById("reset-btn");
    const audioBtn = document.getElementById("audio-btn");
    const eraserBtn = document.getElementById("eraser-btn");
    const clearWallsBtn = document.getElementById("clear-walls-btn");
    const minimizeBtn = document.getElementById("minimize-btn");
    const floatingControls = document.querySelector(".floating-controls");

    // New brush control buttons
    const brushBtn1 = document.getElementById("brush-btn-1");
    const brushBtn2 = document.getElementById("brush-btn-2");

    // Initialize minimize state
    let isMinimized = false;

    // Update simulation parameters when sliders change
    function updateParams() {
      const separation = parseFloat(separationSlider.value);
      const alignment = parseFloat(alignmentSlider.value);
      const cohesion = parseFloat(cohesionSlider.value);

      separationValue.textContent = separation.toFixed(1);
      alignmentValue.textContent = alignment.toFixed(1);
      cohesionValue.textContent = cohesion.toFixed(1);

      simulation.updateParams(separation, alignment, cohesion);
    }

    // Toggle audio on/off
    function toggleAudio() {
      const audioEnabled = simulation.toggleAudio();

      // Update UI immediately for better user experience
      updateAudioButtonUI(audioEnabled);

      // Check actual state after a brief delay to ensure accuracy
      setTimeout(() => {
        const actualState = simulation.audioEngine.isRunning();
        if (actualState !== audioEnabled) {
          console.log(
            "Correcting audio button state to match actual audio state"
          );
          updateAudioButtonUI(actualState);
        }
      }, 500);
    }

    // Helper function to update audio button UI
    function updateAudioButtonUI(enabled) {
      if (enabled) {
        audioBtn.textContent = "🔊";
        audioBtn.title = "Sound On";
        audioBtn.classList.remove("audio-off");
        audioBtn.classList.add("audio-on");
      } else {
        audioBtn.textContent = "🔇";
        audioBtn.title = "Sound Off";
        audioBtn.classList.remove("audio-on");
        audioBtn.classList.add("audio-off");
      }
    }

    // Clear active state from all brush buttons
    function clearActiveBrushes() {
      eraserBtn.classList.remove("active");
      brushBtn1.classList.remove("active");
      brushBtn2.classList.remove("active");
    }

    // Toggle eraser mode
    function toggleEraser() {
      clearActiveBrushes();

      // Exit boid spawner mode if active
      if (simulation.spawnBoidMode) {
        simulation.toggleBoidSpawner();
      }

      const eraserActive = simulation.toggleEraserMode();
      if (eraserActive) {
        // Now in eraser mode
        eraserBtn.classList.add("active");
        eraserBtn.title = "Eraser Mode Active";
      } else {
        // Now in drawing mode
        brushBtn1.classList.add("active");
        eraserBtn.title = "Switch to Eraser Mode";
      }
    }

    // Toggle to brush tool 1 (default drawing mode)
    function toggleBrush1() {
      clearActiveBrushes();

      // Exit any special modes
      if (simulation.eraserMode) {
        simulation.toggleEraserMode();
      }
      if (simulation.spawnBoidMode) {
        simulation.toggleBoidSpawner();
      }

      // Add active class to brush 1 button
      brushBtn1.classList.add("active");
      brushBtn1.title = "Wall Drawing Mode Active";
    }

    // Toggle to boid spawner tool
    function toggleBoidSpawner() {
      const wasAlreadyActive = simulation.spawnBoidMode;

      // If already in boid spawner mode, toggle predator mode
      if (wasAlreadyActive) {
        const predatorActive = simulation.togglePredatorMode();

        // Update button appearance to indicate predator mode
        if (predatorActive) {
          // Change to predator visual indicator
          brushBtn2.textContent = "🦅"; // Eagle emoji for predator
          brushBtn2.title = "Predator Spawner Active";
        } else {
          // Change back to prey visual indicator
          brushBtn2.textContent = "🧬"; // Original emoji for normal boids
          brushBtn2.title = "Boid Spawner Active";
        }
      } else {
        clearActiveBrushes();

        // Exit eraser mode if active
        if (simulation.eraserMode) {
          simulation.toggleEraserMode();
        }

        // Toggle boid spawner mode
        simulation.toggleBoidSpawner();

        // Now in boid spawner mode
        brushBtn2.classList.add("active");
        brushBtn2.textContent = "🧬"; // Reset to original emoji
        brushBtn2.title = "Boid Spawner Active";
      }
    }

    // Clear walls
    function clearWalls() {
      simulation.clearWalls();
    }

    // Toggle minimize/expand
    function toggleMinimize() {
      isMinimized = !isMinimized;

      if (isMinimized) {
        floatingControls.classList.add("minimized");
        minimizeBtn.textContent = "+";
        minimizeBtn.title = "Expand";
      } else {
        floatingControls.classList.remove("minimized");
        minimizeBtn.textContent = "−";
        minimizeBtn.title = "Minimize";
      }
    }

    // Set up event listeners
    separationSlider.addEventListener("input", updateParams);
    alignmentSlider.addEventListener("input", updateParams);
    cohesionSlider.addEventListener("input", updateParams);
    resetBtn.addEventListener("click", () => simulation.reset());
    audioBtn.addEventListener("click", toggleAudio);
    eraserBtn.addEventListener("click", toggleEraser);
    brushBtn1.addEventListener("click", toggleBrush1);
    brushBtn2.addEventListener("click", toggleBoidSpawner);
    clearWallsBtn.addEventListener("click", clearWalls);
    minimizeBtn.addEventListener("click", toggleMinimize);

    // Initialize parameter display
    updateParams();

    // Set boid spawner as the default active tool instead of the wall drawing tool
    clearActiveBrushes();
    brushBtn2.classList.add("active");
    brushBtn2.title = "Boid Spawner Active";

    // Activate boid spawner mode in the simulation
    simulation.toggleBoidSpawner();

    // Update button titles for better UI feedback
    brushBtn1.title = "Wall Drawing Mode (Default)";
    brushBtn2.title = "Switch to Boid Spawner";
  } catch (error) {
    console.error("Error initializing simulation:", error);
  }
};

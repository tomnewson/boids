window.onload = () => {
  // Debug info
  const canvas = document.getElementById("boids-canvas");

  // Set canvas to fill the entire window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  console.log("Canvas element:", canvas);
  console.log("Canvas dimensions:", canvas.width, "x", canvas.height);

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
    // Initialize simulation
    const simulation = new Simulation("boids-canvas");
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
      if (audioEnabled) {
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

    // Toggle eraser mode
    function toggleEraser() {
      const eraserActive = simulation.toggleEraserMode();
      if (eraserActive) {
        // Now in eraser mode, show drawing icon to indicate clicking will switch to draw mode
        eraserBtn.textContent = "✏️";
        eraserBtn.title = "Switch to Drawing Mode";
      } else {
        // Now in drawing mode, show eraser icon to indicate clicking will switch to eraser mode
        eraserBtn.textContent = "🧽";
        eraserBtn.title = "Switch to Eraser Mode";
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
    clearWallsBtn.addEventListener("click", clearWalls);
    minimizeBtn.addEventListener("click", toggleMinimize);

    // Initialize parameter display
    updateParams();
  } catch (error) {
    console.error("Error initializing simulation:", error);
  }
};

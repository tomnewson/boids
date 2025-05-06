window.onload = () => {
  // Debug info
  const canvas = document.getElementById("boids-canvas");

  // Explicitly set canvas dimensions
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = 500;

  console.log("Canvas element:", canvas);
  console.log("Canvas dimensions:", canvas.width, "x", canvas.height);

  try {
    // Initialize simulation
    const simulation = new Simulation("boids-canvas");

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

    // Keep audio button showing "Sound Off" state by default
    audioBtn.textContent = "🔇 Sound Off";
    audioBtn.classList.remove("audio-on");
    audioBtn.classList.add("audio-off");

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
        audioBtn.textContent = "🔊 Sound On";
        audioBtn.classList.remove("audio-off");
        audioBtn.classList.add("audio-on");
      } else {
        audioBtn.textContent = "🔇 Sound Off";
        audioBtn.classList.remove("audio-on");
        audioBtn.classList.add("audio-off");
      }
    }

    // Toggle eraser mode
    function toggleEraser() {
      const eraserActive = simulation.toggleEraserMode();
      if (eraserActive) {
        eraserBtn.textContent = "✏️ Draw";
        eraserBtn.classList.add("active");
      } else {
        eraserBtn.textContent = "🧽 Eraser";
        eraserBtn.classList.remove("active");
      }
    }

    // Clear all walls
    function clearWalls() {
      simulation.clearWalls();
    }

    // Set up event listeners
    separationSlider.addEventListener("input", updateParams);
    alignmentSlider.addEventListener("input", updateParams);
    cohesionSlider.addEventListener("input", updateParams);
    resetBtn.addEventListener("click", () => simulation.reset());
    audioBtn.addEventListener("click", toggleAudio);
    eraserBtn.addEventListener("click", toggleEraser);
    clearWallsBtn.addEventListener("click", clearWalls);

    // Initialize parameter display
    updateParams();

    // Display instructions
    console.log(
      "Draw on the canvas to create walls for the boids to navigate around."
    );
    console.log(
      "Click 'Eraser' to switch to eraser mode and remove parts of walls."
    );
    console.log("Use the sliders to adjust boid behavior parameters.");
    console.log(
      "Click 'Sound On/Off' to toggle audio generation from boid movement."
    );
    console.log("Press the Reset button to restart with new boids.");
    console.log("Click 'Clear Walls' to remove all walls.");
  } catch (error) {
    console.error("Error initializing simulation:", error);
  }
};

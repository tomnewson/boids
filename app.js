import { Simulation } from './simulation.js';

window.onload = () => {
  const canvas = document.getElementById("boids-canvas");

  window.addEventListener("resize", () => {
    if (window.simulation) {
      window.simulation.handleResize();
    }
  });

  try {
    const simulation = new Simulation(canvas);
    simulation.init();
    window.simulation = simulation;

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

    const brushBtn1 = document.getElementById("brush-btn-1"); // WALL mode
    const brushBtn2 = document.getElementById("brush-btn-2"); // PREY mode
    const brushBtn3 = document.getElementById("brush-btn-3"); // PREDATOR mode
    const foodBtn = document.getElementById("food-btn"); // FOOD mode

    let isMinimized = true;
    floatingControls.classList.add("minimized");
    minimizeBtn.textContent = "+";
    minimizeBtn.title = "Expand";

    function updateParams() {
      const separation = parseFloat(separationSlider.value);
      const alignment = parseFloat(alignmentSlider.value);
      const cohesion = parseFloat(cohesionSlider.value);

      separationValue.textContent = separation.toFixed(1);
      alignmentValue.textContent = alignment.toFixed(1);
      cohesionValue.textContent = cohesion.toFixed(1);

      simulation.updateParams(separation, alignment, cohesion);
    }

    function toggleAudio() {
      const audioEnabled = simulation.toggleAudio();
      updateAudioButtonUI(audioEnabled);

      // Check actual state after a brief delay to ensure accuracy
      setTimeout(() => {
        const actualState = simulation.audioEngine.isRunning();
        if (actualState !== audioEnabled) {
          updateAudioButtonUI(actualState);
        }
      }, 500);
    }

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

    function clearActiveBrushes() {
      eraserBtn.classList.remove("active");
      brushBtn1.classList.remove("active");
      brushBtn2.classList.remove("active");
      brushBtn3.classList.remove("active");
      foodBtn.classList.remove("active");
    }

    function setEraserMode() {
      clearActiveBrushes();
      eraserBtn.classList.add("active");
      simulation.setCursorMode(simulation.CURSOR_MODES.ERASER);
    }

    function setWallMode() {
      clearActiveBrushes();
      brushBtn1.classList.add("active");
      simulation.setCursorMode(simulation.CURSOR_MODES.WALL);
    }

    function setPreyMode() {
      clearActiveBrushes();
      brushBtn2.classList.add("active");
      simulation.setCursorMode(simulation.CURSOR_MODES.BOID);
    }

    function setPredatorMode() {
      clearActiveBrushes();
      brushBtn3.classList.add("active");
      simulation.setCursorMode(simulation.CURSOR_MODES.PREDATOR);
    }

    function setFoodMode() {
      clearActiveBrushes();
      foodBtn.classList.add("active");
      simulation.setCursorMode(simulation.CURSOR_MODES.FOOD);
    }

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

    separationSlider.addEventListener("input", updateParams);
    alignmentSlider.addEventListener("input", updateParams);
    cohesionSlider.addEventListener("input", updateParams);
    resetBtn.addEventListener("click", () => simulation.reset());
    audioBtn.addEventListener("click", toggleAudio);
    eraserBtn.addEventListener("click", setEraserMode);
    brushBtn1.addEventListener("click", setWallMode);
    brushBtn2.addEventListener("click", setPreyMode);
    brushBtn3.addEventListener("click", setPredatorMode);
    foodBtn.addEventListener("click", setFoodMode);
    clearWallsBtn.addEventListener("click", () => simulation.clearWalls());
    minimizeBtn.addEventListener("click", toggleMinimize);

    updateParams();

    setPreyMode();
  } catch (error) {
    console.error("Error initializing simulation:", error);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // --- STATE ---
  const state = {
    file: null,
    img: null,

    // Pre-rendered layers for performance
    originalCanvas: null,
    blurredCanvas: null,
    pixelatedCanvas: null,

    redactions: [], // History stack

    // Tool settings
    mode: "blur", // blur | pixelate | solid
    drawType: "rect", // rect | brush
    brushSize: "medium",

    // Interaction state
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentPath: [],

    faceDetectionReady: false,
  };

  const brushSizes = { small: 20, medium: 40, large: 80 };

  // --- ELEMENTS ---
  const els = {
    uploadZone: document.getElementById("upload-zone"),
    fileInput: document.getElementById("file-input"),
    editorContainer: document.getElementById("editor-container"),
    canvasWrapper: document.getElementById("canvas-wrapper"),
    canvas: document.getElementById("editor-canvas"),
    ctx: document.getElementById("editor-canvas").getContext("2d"),
    loadingOverlay: document.getElementById("loading-overlay"),

    // Buttons
    btnAutoFace: document.getElementById("btn-auto-face"),
    btnUndo: document.getElementById("btn-undo"),
    btnClear: document.getElementById("btn-clear"),
    btnTogglePreview: document.getElementById("btn-toggle-preview"),
    btnDownload: document.getElementById("btn-download"),
    btnNew: document.getElementById("btn-new"),
  };

  // --- UPLOAD HANDLERS ---
  els.uploadZone.addEventListener("click", () => els.fileInput.click());

  ["dragenter", "dragover"].forEach((e) => {
    els.uploadZone.addEventListener(e, (evt) => {
      evt.preventDefault();
      els.uploadZone.style.borderColor = "var(--accent-color)";
    });
  });

  ["dragleave", "drop"].forEach((e) => {
    els.uploadZone.addEventListener(e, (evt) => {
      evt.preventDefault();
      els.uploadZone.style.borderColor = "var(--border-color)";
    });
  });

  els.uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) initEditor(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) initEditor(e.target.files[0]);
  });

  // --- INITIALIZATION ---
  async function initEditor(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    state.file = file;
    const reader = new FileReader();

    reader.onload = async (e) => {
      state.img = new Image();
      state.img.onload = async () => {
        // 1. Setup Main Display Canvas
        els.canvas.width = state.img.width;
        els.canvas.height = state.img.height;

        // 2. Prepare Layers (Optimized Approach)
        prepareLayers();

        // 3. UI Transition
        els.uploadZone.classList.add("hidden");
        els.editorContainer.classList.remove("hidden");

        renderCanvas();

        // 4. Load AI Model
        if (!state.faceDetectionReady && typeof faceapi !== "undefined") {
          await loadFaceDetection();
        }
      };
      state.img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function prepareLayers() {
    const w = state.img.width;
    const h = state.img.height;

    // A. Original Layer
    state.originalCanvas = document.createElement("canvas");
    state.originalCanvas.width = w;
    state.originalCanvas.height = h;
    state.originalCanvas.getContext("2d").drawImage(state.img, 0, 0);

    // B. Blur Layer (Pre-calculated)
    state.blurredCanvas = document.createElement("canvas");
    state.blurredCanvas.width = w;
    state.blurredCanvas.height = h;
    const blurCtx = state.blurredCanvas.getContext("2d");
    blurCtx.filter = "blur(15px)"; // Adjust blur strength here
    blurCtx.drawImage(state.img, 0, 0);
    blurCtx.filter = "none"; // Reset

    // C. Pixelate Layer (Pre-calculated)
    state.pixelatedCanvas = document.createElement("canvas");
    state.pixelatedCanvas.width = w;
    state.pixelatedCanvas.height = h;
    const pixCtx = state.pixelatedCanvas.getContext("2d");

    // Pixelation effect using drawImage scaling
    const pixelSize = 0.02; // 2% of size
    const sw = w * pixelSize;
    const sh = h * pixelSize;

    pixCtx.imageSmoothingEnabled = false;
    // Draw tiny, then scale back up
    pixCtx.drawImage(state.img, 0, 0, w, h, 0, 0, sw, sh);
    pixCtx.drawImage(state.pixelatedCanvas, 0, 0, sw, sh, 0, 0, w, h);
  }

  async function loadFaceDetection() {
    try {
      const MODEL_URL =
        "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      state.faceDetectionReady = true;
      els.btnAutoFace.disabled = false;
    } catch (err) {
      console.error("Face detection failed to load:", err);
      els.btnAutoFace.textContent = "❌ AI Unavailable";
      els.btnAutoFace.disabled = true;
    }
  }

  // --- TOOLBAR CONTROLS ---

  // Mode Switcher
  document.querySelectorAll(".tool-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tool-btn[data-mode]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
    });
  });

  // Draw Type (Rect/Brush)
  document.querySelectorAll(".tool-btn[data-draw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tool-btn[data-draw]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.drawType = btn.dataset.draw;
      updateCursor();
    });
  });

  // Brush Size
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".size-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.brushSize = btn.dataset.size;
    });
  });

  function updateCursor() {
    els.canvasWrapper.className = "canvas-wrapper";
    if (state.drawType === "rect") {
      els.canvasWrapper.classList.add("drawing-rect");
    } else {
      els.canvasWrapper.classList.add("drawing-brush");
    }
  }

  // --- DRAWING LOGIC ---
  els.canvas.addEventListener("mousedown", startDraw);
  els.canvas.addEventListener("mousemove", moveDraw);
  els.canvas.addEventListener("mouseup", endDraw);
  els.canvas.addEventListener("mouseout", () => (state.isDrawing = false));

  // Touch
  els.canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startDraw(e.touches[0]);
  });
  els.canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    moveDraw(e.touches[0]);
  });
  els.canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    endDraw(e.changedTouches[0]);
  });

  function getPos(e) {
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e) {
    state.isDrawing = true;
    const pos = getPos(e);
    state.startX = pos.x;
    state.startY = pos.y;

    if (state.drawType === "brush") {
      state.currentPath = [{ x: pos.x, y: pos.y }];
    }
  }

  function moveDraw(e) {
    if (!state.isDrawing) return;
    const pos = getPos(e);

    if (state.drawType === "brush") {
      // Add point to path
      state.currentPath.push({ x: pos.x, y: pos.y });
      // Render everything to show live update
      renderCanvas();
      // Draw current stroke preview
      drawBrushPath(els.ctx, state.currentPath, state.mode, true);
    } else {
      // Rectangle Preview
      renderCanvas();
      els.ctx.save();
      els.ctx.strokeStyle = "#2563eb";
      els.ctx.lineWidth = 2;
      els.ctx.setLineDash([5, 5]);
      els.ctx.strokeRect(
        state.startX,
        state.startY,
        pos.x - state.startX,
        pos.y - state.startY,
      );
      els.ctx.restore();
    }
  }

  function endDraw(e) {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    const pos = getPos(e);

    if (state.drawType === "brush") {
      if (state.currentPath.length > 1) {
        state.redactions.push({
          type: "brush",
          mode: state.mode,
          path: [...state.currentPath],
          size: brushSizes[state.brushSize],
        });
      }
      state.currentPath = [];
    } else {
      const w = pos.x - state.startX;
      const h = pos.y - state.startY;
      if (Math.abs(w) > 2 && Math.abs(h) > 2) {
        state.redactions.push({
          type: "rect",
          mode: state.mode,
          x: state.startX,
          y: state.startY,
          w: w,
          h: h,
        });
      }
    }
    updateUndoState();
    renderCanvas();
  }

  // --- RENDERING CORE (OPTIMIZED) ---
  function renderCanvas() {
    const ctx = els.ctx;
    const w = els.canvas.width;
    const h = els.canvas.height;

    // 1. Clear & Draw Original
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(state.originalCanvas, 0, 0);

    // 2. Group redactions by mode for batch processing (Optional optimization, but simple loop is fine here)

    // We need a temporary "Mask Canvas" to perform non-destructive compositing
    // Actually, for simplicity and performance, we can just draw them in order.
    // For 'brush', we draw the stroke on a temp canvas, composite the effect, then draw back.

    state.redactions.forEach((item) => {
      if (item.mode === "solid") {
        // Solid is easy, just draw black on top
        ctx.fillStyle = "#000000";
        if (item.type === "rect") {
          ctx.fillRect(item.x, item.y, item.w, item.h);
        } else {
          drawBrushPath(ctx, item.path, "solid", false, item.size);
        }
      } else {
        // Blur or Pixelate
        // Technique: Draw the shape (Rect or Brush) into a clipping region,
        // then draw the pre-rendered effect canvas into that region.

        ctx.save();
        ctx.beginPath();

        if (item.type === "rect") {
          ctx.rect(item.x, item.y, item.w, item.h);
        } else {
          // Create path from points
          if (item.path.length > 0) {
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = item.size;
            ctx.moveTo(item.path[0].x, item.path[0].y);
            for (let i = 1; i < item.path.length; i++) {
              ctx.lineTo(item.path[i].x, item.path[i].y);
            }
          }
        }

        // This logic is crucial for Brush Stroke masking
        if (item.type === "brush") {
          // Canvas 'clip()' does not support stroke width.
          // So we must use composite operations.
          // 1. Draw shape to temp layer
          // Since we are inside the main loop, we can't easily switch context without losing performance.
          // BUT, drawing stroke-based clips is hard.
          // ALTERNATIVE: Draw the shape normally with 'destination-in' composite on a fresh layer?
          // Let's use the simple clipping for RECT and a special handler for BRUSH.
        } else {
          ctx.clip();
          const source =
            item.mode === "blur" ? state.blurredCanvas : state.pixelatedCanvas;
          ctx.drawImage(source, 0, 0);
        }
        ctx.restore();

        // Special handling for Brush Stroke (since clip() doesn't work on strokes)
        if (item.type === "brush") {
          applyBrushMask(item);
        }
      }
    });
  }

  // Helper to handle Brush Masking correctly
  function applyBrushMask(item) {
    // 1. Create a temp offscreen canvas of the same size
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = els.canvas.width;
    maskCanvas.height = els.canvas.height;
    const mCtx = maskCanvas.getContext("2d");

    // 2. Draw the brush stroke (white)
    drawBrushPath(mCtx, item.path, "solid", false, item.size);
    // (drawBrushPath draws black, but color doesn't matter for source-in, alpha does)

    // 3. Composite the Effect (Blur/Pixelate) onto the stroke
    mCtx.globalCompositeOperation = "source-in";
    const source =
      item.mode === "blur" ? state.blurredCanvas : state.pixelatedCanvas;
    mCtx.drawImage(source, 0, 0);

    // 4. Draw the masked brush result onto the main canvas
    els.ctx.drawImage(maskCanvas, 0, 0);
  }

  function drawBrushPath(ctx, path, mode, isPreview, sizeOverride) {
    if (path.length < 1) return;
    const size = sizeOverride || brushSizes[state.brushSize];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size;

    if (mode === "solid" || isPreview) {
      // For solid or preview, we just draw the line
      ctx.strokeStyle =
        mode === "solid" || !isPreview ? "#000000" : "rgba(37, 99, 235, 0.5)"; // Blue semi-transparent for preview
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- AI FACE DETECTION ---
  els.btnAutoFace.addEventListener("click", async () => {
    if (!state.faceDetectionReady) return;

    els.loadingOverlay.classList.remove("hidden");
    els.btnAutoFace.disabled = true;

    try {
      const detections = await faceapi.detectAllFaces(
        els.canvas,
        new faceapi.TinyFaceDetectorOptions(),
      );

      const padding = 20;
      detections.forEach((d) => {
        const box = d.box;
        state.redactions.push({
          type: "rect",
          mode: "blur", // Auto blur
          x: box.x - padding,
          y: box.y - padding,
          w: box.width + padding * 2,
          h: box.height + padding * 2,
        });
      });

      updateUndoState();
      renderCanvas();

      if (detections.length === 0) alert("No faces detected.");
    } catch (err) {
      console.error(err);
      alert("AI Detection failed.");
    } finally {
      els.loadingOverlay.classList.add("hidden");
      els.btnAutoFace.disabled = false;
    }
  });

  // --- ACTION BUTTONS ---
  els.btnUndo.addEventListener("click", () => {
    state.redactions.pop();
    updateUndoState();
    renderCanvas();
  });

  els.btnClear.addEventListener("click", () => {
    if (confirm("Clear all redactions?")) {
      state.redactions = [];
      updateUndoState();
      renderCanvas();
    }
  });

  els.btnTogglePreview.addEventListener("click", () => {
    // For this tool, preview is always live, maybe just toggle showing original?
    // Let's make it hold-to-view original
    alert(
      "Hold 'Undo' to quickly view original? (Not implemented in this UI flow yet)",
    );
  });

  els.btnDownload.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "redacted-image.jpg";
    link.href = els.canvas.toDataURL("image/jpeg", 0.95);
    link.click();
  });

  els.btnNew.addEventListener("click", () => location.reload());

  function updateUndoState() {
    els.btnUndo.disabled = state.redactions.length === 0;
  }

  updateCursor();
});

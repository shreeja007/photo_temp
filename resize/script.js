document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTS ---
  const els = {
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    uploadContent: document.getElementById("upload-content"),

    // New Preview Elements
    previewSection: document.getElementById("preview-section"),
    smallPreview: document.getElementById("small-preview"), // Changed ID
    fileName: document.getElementById("file-name"),
    originalDims: document.getElementById("original-dims"),
    btnRemove: document.getElementById("btn-remove"),

    controls: document.getElementById("controls"),
    presetSelect: document.getElementById("preset-select"),
    inputWidth: document.getElementById("input-width"),
    inputHeight: document.getElementById("input-height"),
    btnLock: document.getElementById("btn-lock"),
    cropEditor: document.getElementById("crop-editor"),
    cropCanvas: document.getElementById("crop-canvas"),
    canvasContainer: document.getElementById("canvas-container"),
    zoomSlider: document.getElementById("zoom-slider"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    actionArea: document.getElementById("action-area"),
    btnResize: document.getElementById("btn-resize"),
    outputDims: document.getElementById("output-dims"),
    rotateLeft: document.getElementById("rotate-left"),
    rotateRight: document.getElementById("rotate-right"),
    flipHorizontal: document.getElementById("flip-horizontal"),
    flipVertical: document.getElementById("flip-vertical"),
  };

  let state = {
    file: null,
    imageBitmap: null,
    originalWidth: 0,
    originalHeight: 0,
    aspectRatio: 0,
    isLocked: true,
    targetWidth: 0,
    targetHeight: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    fitMode: "cover",
    rotation: 0,
    flipH: false,
    flipV: false,
  };

  // Upload handlers
  els.dropZone.addEventListener("click", () => els.fileInput.click());

  ["dragenter", "dragover"].forEach((e) => {
    els.dropZone.addEventListener(e, (evt) => {
      evt.preventDefault();
      els.dropZone.classList.add("drag-active");
    });
  });

  ["dragleave", "drop"].forEach((e) => {
    els.dropZone.addEventListener(e, (evt) => {
      evt.preventDefault();
      els.dropZone.classList.remove("drag-active");
    });
  });

  els.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  els.btnRemove.addEventListener("click", resetUI);

  async function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    state.file = file;

    // Create bitmap for processing
    const bitmap = await createImageBitmap(file);
    state.imageBitmap = bitmap;
    state.originalWidth = bitmap.width;
    state.originalHeight = bitmap.height;
    state.aspectRatio = state.originalWidth / state.originalHeight;

    // SHOW COMPACT PREVIEW
    const url = URL.createObjectURL(file);
    els.smallPreview.src = url; // Set thumbnail
    els.fileName.textContent = file.name;
    els.originalDims.textContent = `${state.originalWidth} × ${state.originalHeight} px`;

    // Set default dimensions to original size
    els.inputWidth.value = state.originalWidth;
    els.inputHeight.value = state.originalHeight;
    els.presetSelect.value = "custom";

    // Toggle Views
    els.dropZone.classList.add("hidden");
    els.previewSection.classList.remove("hidden");
    els.controls.classList.remove("hidden");

    // Initialize Crop Editor
    updateCropEditor();
  }

  // --- (Rest of logic remains the same) ---
  // Copy/Paste the Dimension controls, Transform controls, and Resize logic
  // from the previous script here. The key change was the `handleFile` function above.

  // Dimension controls
  els.btnLock.addEventListener("click", () => {
    state.isLocked = !state.isLocked;
    els.btnLock.classList.toggle("active");
    els.btnLock.textContent = state.isLocked ? "🔒" : "🔓";

    if (state.isLocked && els.inputWidth.value) {
      els.inputHeight.value = Math.round(
        els.inputWidth.value / state.aspectRatio,
      );
      updateCropEditor();
    }
  });

  els.inputWidth.addEventListener("input", () => {
    els.presetSelect.value = "custom";
    if (state.isLocked && els.inputWidth.value) {
      els.inputHeight.value = Math.round(
        els.inputWidth.value / state.aspectRatio,
      );
    }
    updateCropEditor();
  });

  els.inputHeight.addEventListener("input", () => {
    els.presetSelect.value = "custom";
    if (state.isLocked && els.inputHeight.value) {
      els.inputWidth.value = Math.round(
        els.inputHeight.value * state.aspectRatio,
      );
    }
    updateCropEditor();
  });

  els.presetSelect.addEventListener("change", () => {
    const val = els.presetSelect.value;
    if (val === "custom") return;

    const [w, h] = val.split("x").map(Number);
    els.inputWidth.value = w;
    els.inputHeight.value = h;
    updateCropEditor();
  });

  function updateCropEditor() {
    const w = parseInt(els.inputWidth.value);
    const h = parseInt(els.inputHeight.value);

    if (!w || !h || !state.imageBitmap) return;

    state.targetWidth = w;
    state.targetHeight = h;

    els.cropEditor.classList.remove("hidden");
    els.actionArea.classList.remove("hidden");
    els.outputDims.textContent = `${w} × ${h} px`;

    initCropCanvas();
  }

  function initCropCanvas() {
    const container = els.canvasContainer;
    const maxWidth = Math.min(600, container.clientWidth);
    const targetAspect = state.targetWidth / state.targetHeight;

    const canvasWidth = maxWidth;
    const canvasHeight = canvasWidth / targetAspect;

    els.cropCanvas.width = canvasWidth;
    els.cropCanvas.height = canvasHeight;

    els.cropCanvas.style.width = canvasWidth + "px";
    els.cropCanvas.style.height = canvasHeight + "px";

    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    els.zoomSlider.value = 100;

    applyFitMode();
    drawCropPreview();
  }

  function applyFitMode() {
    const canvasAspect = els.cropCanvas.width / els.cropCanvas.height;
    const isRotated = state.rotation === 90 || state.rotation === 270;
    const effectiveImgWidth = isRotated
      ? state.originalHeight
      : state.originalWidth;
    const effectiveImgHeight = isRotated
      ? state.originalWidth
      : state.originalHeight;
    const imageAspect = effectiveImgWidth / effectiveImgHeight;

    if (state.fitMode === "cover") {
      if (imageAspect > canvasAspect) {
        state.scale = els.cropCanvas.height / effectiveImgHeight;
      } else {
        state.scale = els.cropCanvas.width / effectiveImgWidth;
      }
    } else {
      if (imageAspect > canvasAspect) {
        state.scale = els.cropCanvas.width / effectiveImgWidth;
      } else {
        state.scale = els.cropCanvas.height / effectiveImgHeight;
      }
    }
    state.offsetX = 0;
    state.offsetY = 0;
    els.zoomSlider.value = 100;
  }

  document.querySelectorAll(".fit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".fit-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.fitMode = btn.dataset.mode;
      applyFitMode();
      drawCropPreview();
    });
  });

  els.rotateLeft.addEventListener("click", () => {
    state.rotation = (state.rotation - 90 + 360) % 360;
    applyFitMode();
    drawCropPreview();
  });

  els.rotateRight.addEventListener("click", () => {
    state.rotation = (state.rotation + 90) % 360;
    applyFitMode();
    drawCropPreview();
  });

  els.flipHorizontal.addEventListener("click", () => {
    state.flipH = !state.flipH;
    drawCropPreview();
  });

  els.flipVertical.addEventListener("click", () => {
    state.flipV = !state.flipV;
    drawCropPreview();
  });

  function drawCropPreview() {
    const ctx = els.cropCanvas.getContext("2d");
    ctx.clearRect(0, 0, els.cropCanvas.width, els.cropCanvas.height);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, els.cropCanvas.width, els.cropCanvas.height);
    ctx.save();
    ctx.translate(
      els.cropCanvas.width / 2 + state.offsetX,
      els.cropCanvas.height / 2 + state.offsetY,
    );
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(
      state.scale * (state.flipH ? -1 : 1),
      state.scale * (state.flipV ? -1 : 1),
    );
    ctx.drawImage(
      state.imageBitmap,
      -state.originalWidth / 2,
      -state.originalHeight / 2,
    );
    ctx.restore();
  }

  els.zoomSlider.addEventListener("input", (e) => {
    const zoom = e.target.value / 100;
    const canvasAspect = els.cropCanvas.width / els.cropCanvas.height;
    const isRotated = state.rotation === 90 || state.rotation === 270;
    const effectiveImgWidth = isRotated
      ? state.originalHeight
      : state.originalWidth;
    const effectiveImgHeight = isRotated
      ? state.originalWidth
      : state.originalHeight;
    const imageAspect = effectiveImgWidth / effectiveImgHeight;

    let baseScale;
    if (state.fitMode === "cover") {
      baseScale =
        imageAspect > canvasAspect
          ? els.cropCanvas.height / effectiveImgHeight
          : els.cropCanvas.width / effectiveImgWidth;
    } else {
      baseScale =
        imageAspect > canvasAspect
          ? els.cropCanvas.width / effectiveImgWidth
          : els.cropCanvas.height / effectiveImgHeight;
    }

    state.scale = baseScale * zoom;
    drawCropPreview();
  });

  els.zoomIn.addEventListener("click", () => {
    els.zoomSlider.value = Math.min(200, parseInt(els.zoomSlider.value) + 10);
    els.zoomSlider.dispatchEvent(new Event("input"));
  });

  els.zoomOut.addEventListener("click", () => {
    els.zoomSlider.value = Math.max(50, parseInt(els.zoomSlider.value) - 10);
    els.zoomSlider.dispatchEvent(new Event("input"));
  });

  els.cropCanvas.addEventListener("mousedown", startDrag);
  els.cropCanvas.addEventListener("touchstart", startDrag);

  function startDrag(e) {
    state.isDragging = true;
    const pos = getEventPos(e);
    state.lastX = pos.x;
    state.lastY = pos.y;
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", drag);
    document.addEventListener("touchend", stopDrag);
  }

  function drag(e) {
    if (!state.isDragging) return;
    e.preventDefault();
    const pos = getEventPos(e);
    const dx = pos.x - state.lastX;
    const dy = pos.y - state.lastY;
    state.offsetX += dx;
    state.offsetY += dy;
    state.lastX = pos.x;
    state.lastY = pos.y;
    drawCropPreview();
  }

  function stopDrag() {
    state.isDragging = false;
    document.removeEventListener("mousemove", drag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchmove", drag);
    document.removeEventListener("touchend", stopDrag);
  }

  function getEventPos(e) {
    const rect = els.cropCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  els.btnResize.addEventListener("click", async () => {
    if (!state.file) return;

    els.btnResize.textContent = "Processing...";
    els.btnResize.disabled = true;

    try {
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = state.targetWidth;
      outputCanvas.height = state.targetHeight;
      const ctx = outputCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, state.targetWidth, state.targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const scaleMapX = state.targetWidth / els.cropCanvas.width;
      const scaleMapY = state.targetHeight / els.cropCanvas.height;
      const finalScale = state.scale * scaleMapX;

      ctx.save();
      ctx.translate(
        (els.cropCanvas.width / 2 + state.offsetX) * scaleMapX,
        (els.cropCanvas.height / 2 + state.offsetY) * scaleMapY,
      );
      ctx.rotate((state.rotation * Math.PI) / 180);
      ctx.scale(
        finalScale * (state.flipH ? -1 : 1),
        finalScale * (state.flipV ? -1 : 1),
      );
      ctx.drawImage(
        state.imageBitmap,
        -state.originalWidth / 2,
        -state.originalHeight / 2,
      );
      ctx.restore();

      outputCanvas.toBlob(
        (blob) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          const ext = state.file.type.split("/")[1];
          const baseName = state.file.name.replace(/\.[^.]+$/, "");
          const dimStr = `${state.targetWidth}x${state.targetHeight}`;
          link.download = `${baseName}-${dimStr}.${ext}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          els.btnResize.textContent = "Download Resized Image";
          els.btnResize.disabled = false;
        },
        state.file.type,
        0.95,
      );
    } catch (err) {
      console.error(err);
      alert("Error processing image");
      els.btnResize.textContent = "Download Resized Image";
      els.btnResize.disabled = false;
    }
  });

  function resetUI() {
    if (els.smallPreview.src) URL.revokeObjectURL(els.smallPreview.src);

    state = {
      file: null,
      imageBitmap: null,
      originalWidth: 0,
      originalHeight: 0,
      aspectRatio: 0,
      isLocked: true,
      targetWidth: 0,
      targetHeight: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      isDragging: false,
      lastX: 0,
      lastY: 0,
      fitMode: "cover",
      rotation: 0,
      flipH: false,
      flipV: false,
    };

    els.fileInput.value = "";
    els.dropZone.classList.remove("hidden");
    els.previewSection.classList.add("hidden");
    els.controls.classList.add("hidden");
    els.cropEditor.classList.add("hidden");
    els.actionArea.classList.add("hidden");
  }
});

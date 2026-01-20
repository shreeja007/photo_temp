document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTS ---
  const els = {
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    controls: document.getElementById("controls"),
    uploadContent: document.getElementById("upload-content"),
    fileInfo: document.getElementById("file-info"),
    fileName: document.getElementById("file-name"),
    btnRemove: document.getElementById("btn-remove"),

    // Resizer Specifics
    presetSelect: document.getElementById("preset-select"),
    inputWidth: document.getElementById("input-width"),
    inputHeight: document.getElementById("input-height"),
    btnLock: document.getElementById("btn-lock"),

    actionArea: document.getElementById("action-area"),
    btnResize: document.getElementById("btn-resize"),
    statusMsg: document.getElementById("status-msg"),
  };

  let currentFile = null;
  let originalWidth = 0;
  let originalHeight = 0;
  let aspectRatio = 0;
  let isLocked = true; // Default locked

  // --- UPLOAD HANDLERS ---
  els.dropZone.addEventListener("click", (e) => {
    if (e.target !== els.btnRemove) els.fileInput.click();
  });

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
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  els.btnRemove.addEventListener("click", (e) => {
    e.stopPropagation();
    resetUI();
  });

  // --- MAIN LOGIC ---
  async function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    currentFile = file;
    els.fileName.textContent = file.name;

    // Get Dimensions
    const bitmap = await createImageBitmap(file);
    originalWidth = bitmap.width;
    originalHeight = bitmap.height;
    aspectRatio = originalWidth / originalHeight;

    // Set Initial Values (Custom by default to show original size)
    els.inputWidth.value = originalWidth;
    els.inputHeight.value = originalHeight;
    els.presetSelect.value = "custom";

    // Show UI
    els.uploadContent.classList.add("hidden");
    els.fileInfo.classList.remove("hidden");
    els.dropZone.classList.add("collapsed");
    els.controls.classList.remove("hidden");
    els.actionArea.classList.remove("hidden");
  }

  // --- INPUT HANDLERS ---

  // Toggle Lock
  els.btnLock.addEventListener("click", () => {
    isLocked = !isLocked;
    els.btnLock.classList.toggle("active");
    els.btnLock.textContent = isLocked ? "🔒" : "🔓";

    // If re-locking, sync height to width immediately
    if (isLocked && els.inputWidth.value) {
      els.inputHeight.value = Math.round(els.inputWidth.value / aspectRatio);
    }
  });

  // Handle Width Change
  els.inputWidth.addEventListener("input", () => {
    els.presetSelect.value = "custom"; // Switch dropdown to custom
    if (isLocked && els.inputWidth.value) {
      els.inputHeight.value = Math.round(els.inputWidth.value / aspectRatio);
    }
  });

  // Handle Height Change
  els.inputHeight.addEventListener("input", () => {
    els.presetSelect.value = "custom";
    if (isLocked && els.inputHeight.value) {
      els.inputWidth.value = Math.round(els.inputHeight.value * aspectRatio);
    }
  });

  // Handle Preset Selection
  els.presetSelect.addEventListener("change", () => {
    const val = els.presetSelect.value;
    if (val === "custom") return;

    const [w, h] = val.split("x").map(Number);

    // Update inputs
    els.inputWidth.value = w;
    els.inputHeight.value = h;

    // Disable lock visually for presets (since ratio is fixed by preset)
    // But logic-wise we just let the inputs update.
  });

  // --- RESIZE EXECUTION ---
  els.btnResize.addEventListener("click", async () => {
    if (!currentFile) return;

    const w = parseInt(els.inputWidth.value);
    const h = parseInt(els.inputHeight.value);

    if (!w || !h) {
      alert("Please enter valid dimensions");
      return;
    }

    els.btnResize.textContent = "Processing...";
    els.btnResize.disabled = true;

    try {
      const bitmap = await createImageBitmap(currentFile);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      // High quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(bitmap, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          downloadFile(blob);
          els.btnResize.textContent = "Resize & Download";
          els.btnResize.disabled = false;
        },
        currentFile.type,
        0.95,
      );
    } catch (err) {
      console.error(err);
      els.statusMsg.textContent = "Error resizing file.";
      els.btnResize.textContent = "Try Again";
      els.btnResize.disabled = false;
    }
  });

  function downloadFile(blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);

    // Add dimension to filename (e.g., photo-1080x1080.jpg)
    const nameParts = currentFile.name.split(".");
    const ext = nameParts.pop();
    const base = nameParts.join(".");
    const dimStr = `${els.inputWidth.value}x${els.inputHeight.value}`;

    link.download = `${base}-${dimStr}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function resetUI() {
    currentFile = null;
    els.fileInput.value = "";
    els.uploadContent.classList.remove("hidden");
    els.fileInfo.classList.add("hidden");
    els.dropZone.classList.remove("collapsed");
    els.controls.classList.add("hidden");
    els.actionArea.classList.add("hidden");
  }
});

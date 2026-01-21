document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTS ---
  const els = {
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    processView: document.getElementById("process-view"),
    successView: document.getElementById("success-view"),

    // Card Elements
    previewThumb: document.getElementById("preview-thumb"),
    fileName: document.getElementById("file-name"),
    btnRemove: document.getElementById("btn-remove"),

    btnProcess: document.getElementById("btn-process"),
    btnRestart: document.getElementById("btn-restart"),
  };

  let currentFile = null;

  // --- UPLOAD HANDLERS ---
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
  els.btnRestart.addEventListener("click", resetUI);

  async function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    currentFile = file;
    els.fileName.textContent = file.name;

    // Create Thumbnail
    const url = URL.createObjectURL(file);
    els.previewThumb.src = url;

    // Toggle Views
    els.dropZone.classList.add("hidden");
    els.processView.classList.remove("hidden");
    els.successView.classList.add("hidden");

    // Reset Button State
    els.btnProcess.textContent = "Scrub Metadata & Download";
    els.btnProcess.disabled = false;
  }

  // --- CLEANING LOGIC ---
  els.btnProcess.addEventListener("click", async () => {
    if (!currentFile) return;

    els.btnProcess.textContent = "Scrubbing...";
    els.btnProcess.disabled = true;

    try {
      // 1. Decode Image (This creates a pure pixel bitmap, dropping metadata)
      const bitmap = await createImageBitmap(currentFile);

      // 2. Draw to Canvas
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");

      // Handle PNG transparency
      if (currentFile.type === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(bitmap, 0, 0);

      // 3. Export (Creates new file container with ZERO metadata)
      // Use quality 1.0 (max) because we want to preserve visual quality
      // We are only trying to lose the metadata, not compression quality.
      canvas.toBlob(
        (blob) => {
          downloadFile(blob);

          // Show Success State
          els.processView.classList.add("hidden");
          els.successView.classList.remove("hidden");
        },
        currentFile.type,
        1.0,
      );
    } catch (err) {
      console.error(err);
      alert("Error processing image.");
      els.btnProcess.textContent = "Try Again";
      els.btnProcess.disabled = false;
    }
  });

  function downloadFile(blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);

    // Add "-clean" to filename
    const nameParts = currentFile.name.split(".");
    const ext = nameParts.pop();
    const base = nameParts.join(".");

    link.download = `${base}-clean.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function resetUI() {
    if (els.previewThumb.src) URL.revokeObjectURL(els.previewThumb.src);

    currentFile = null;
    els.fileInput.value = "";

    els.dropZone.classList.remove("hidden");
    els.processView.classList.add("hidden");
    els.successView.classList.add("hidden");
  }
});

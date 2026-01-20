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
    actionArea: document.getElementById("action-area"),
    btnConvert: document.getElementById("btn-convert"),
    statusMsg: document.getElementById("status-msg"),
  };

  let currentFile = null;

  // --- DRAG & DROP HANDLERS ---

  // Click triggers file input
  els.dropZone.addEventListener("click", (e) => {
    // Prevent click if we clicked the "remove" button
    if (e.target !== els.btnRemove) {
      els.fileInput.click();
    }
  });

  // Drag Enter/Over styling
  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.dropZone.classList.add("drag-active");
      },
      false,
    );
  });

  // Drag Leave/Drop styling cleanup
  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.dropZone.classList.remove("drag-active");
      },
      false,
    );
  });

  // Handle Drop
  els.dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length) {
      handleFile(dt.files[0]);
    }
  });

  // Handle Input Change
  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length) {
      handleFile(e.target.files[0]);
    }
  });

  // Remove Button
  els.btnRemove.addEventListener("click", (e) => {
    e.stopPropagation(); // Stop click from triggering upload again
    resetUI();
  });

  // --- MAIN LOGIC ---

  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    currentFile = file;
    els.fileName.textContent = file.name;

    // Show Controls & Action
    els.uploadContent.classList.add("hidden");
    els.fileInfo.classList.remove("hidden");
    els.dropZone.classList.add("collapsed");

    els.controls.classList.remove("hidden");
    els.actionArea.classList.remove("hidden");

    els.btnConvert.textContent = "Convert & Download";
    els.btnConvert.disabled = false;
    els.statusMsg.textContent = "";
  }

  els.btnConvert.addEventListener("click", async () => {
    if (!currentFile) return;

    els.btnConvert.textContent = "Processing...";
    els.btnConvert.disabled = true;

    const targetFormat = document.querySelector(
      'input[name="format"]:checked',
    ).value;

    try {
      // 1. Create ImageBitmap (fastest way to decode)
      const bitmap = await createImageBitmap(currentFile);

      // 2. Setup Canvas
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");

      // 3. Handle Transparency for JPG
      // If we are converting a transparent PNG to JPG, the background becomes black by default.
      // We fill it with white instead.
      if (targetFormat === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 4. Draw Image
      ctx.drawImage(bitmap, 0, 0);

      // 5. Export and Download
      canvas.toBlob(
        (blob) => {
          if (blob) {
            downloadFile(blob, targetFormat);
            // Optional: Reset UI after download, or let user convert same file to another format?
            // Let's reset the button state but keep the file loaded.
            els.btnConvert.textContent = "Downloaded!";
            setTimeout(() => {
              els.btnConvert.textContent = "Convert & Download";
              els.btnConvert.disabled = false;
            }, 2000);
          } else {
            throw new Error("Conversion failed");
          }
        },
        targetFormat,
        0.95,
      ); // 0.95 quality is standard for high-res
    } catch (err) {
      console.error(err);
      els.statusMsg.textContent =
        "Error converting file. It might be corrupted or format not supported.";
      els.btnConvert.textContent = "Try Again";
      els.btnConvert.disabled = false;
    }
  });

  function downloadFile(blob, format) {
    const extMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const ext = extMap[format];

    // Remove old extension from name if it exists
    const nameParts = currentFile.name.split(".");
    if (nameParts.length > 1) nameParts.pop();
    const cleanName = nameParts.join(".");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${cleanName}-converted.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up memory
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
  }

  function resetUI() {
    currentFile = null;
    els.fileInput.value = "";

    els.uploadContent.classList.remove("hidden");
    els.fileInfo.classList.add("hidden");
    els.dropZone.classList.remove("collapsed");

    els.controls.classList.add("hidden");
    els.actionArea.classList.add("hidden");
    els.statusMsg.textContent = "";
  }
});

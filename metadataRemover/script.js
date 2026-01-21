document.addEventListener("DOMContentLoaded", () => {
  const state = {
    file: null,
    exifData: null,
    metadataCount: 0,
    originalSize: 0,
  };

  const els = {
    uploadZone: document.getElementById("upload-zone"),
    fileInput: document.getElementById("file-input"),
    analysisSection: document.getElementById("analysis-section"),
    successSection: document.getElementById("success-section"),
    fileThumb: document.getElementById("file-thumb"),
    fileName: document.getElementById("file-name"),
    fileSize: document.getElementById("file-size"),
    btnRemove: document.getElementById("btn-remove"),
    btnClean: document.getElementById("btn-clean"),
    btnRestart: document.getElementById("btn-restart"),
    alertContainer: document.getElementById("alert-container"),
    metadataGrid: document.getElementById("metadata-grid"),
    beforeSize: document.getElementById("before-size"),
    beforeMetadata: document.getElementById("before-metadata"),
    afterSize: document.getElementById("after-size"),
  };

  // Upload handlers
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
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  els.btnRemove.addEventListener("click", resetUI);
  els.btnRestart.addEventListener("click", resetUI);
  els.btnClean.addEventListener("click", cleanMetadata);

  async function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    state.file = file;
    state.originalSize = file.size;

    // Show preview
    const url = URL.createObjectURL(file);
    els.fileThumb.src = url;
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatSize(file.size);

    // Show analysis section
    els.uploadZone.classList.add("hidden");
    els.analysisSection.classList.remove("hidden");
    els.successSection.classList.add("hidden");

    // Scan for EXIF
    await scanExif(file);
  }

  function scanExif(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          EXIF.getData(img, function () {
            state.exifData = EXIF.getAllTags(this);
            displayMetadata();
            resolve();
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function displayMetadata() {
    const data = state.exifData;
    const keys = Object.keys(data);

    state.metadataCount = keys.length;

    // Check for sensitive data
    const hasGPS = data.GPSLatitude || data.GPSLongitude;
    const hasLocation = hasGPS || data.GPSAltitude;

    // Show alert
    if (keys.length === 0) {
      showAlert(
        "success",
        "No Metadata Found",
        "This image appears to be clean already. You can still re-process it to be sure.",
      );
    } else if (hasLocation) {
      showAlert(
        "danger",
        "⚠️ Location Data Exposed!",
        `This image contains GPS coordinates that reveal exactly where it was taken. ${keys.length} metadata items found.`,
      );
    } else {
      showAlert(
        "warning",
        "Metadata Detected",
        `Found ${keys.length} hidden data items in this image. They reveal camera settings and potentially identifiable information.`,
      );
    }

    // Display metadata items
    els.metadataGrid.innerHTML = "";

    if (keys.length === 0) {
      els.metadataGrid.innerHTML =
        '<p style="color: var(--text-secondary); grid-column: 1/-1;">No EXIF metadata detected in this image.</p>';
      return;
    }

    const sensitiveFields = [
      "GPSLatitude",
      "GPSLongitude",
      "GPSAltitude",
      "GPSTimeStamp",
      "GPSDateStamp",
    ];
    const importantFields = [
      "Make",
      "Model",
      "DateTime",
      "DateTimeOriginal",
      "Software",
      "Artist",
      "Copyright",
    ];

    const priorityFields = [...sensitiveFields, ...importantFields];
    const displayFields = keys.filter((k) => priorityFields.includes(k));
    const otherFields = keys.filter((k) => !priorityFields.includes(k));

    displayFields.forEach((key) => {
      const isSensitive = sensitiveFields.includes(key);
      addMetadataItem(key, data[key], isSensitive);
    });

    if (otherFields.length > 0) {
      const item = document.createElement("div");
      item.className = "metadata-item";
      item.innerHTML = `<span class="metadata-label">Other Metadata</span><span class="metadata-value">${otherFields.length} additional fields</span>`;
      els.metadataGrid.appendChild(item);
    }
  }

  function addMetadataItem(key, value, isSensitive = false) {
    const item = document.createElement("div");
    item.className = "metadata-item" + (isSensitive ? " sensitive" : "");

    let displayValue = value;
    if (typeof value === "object") {
      displayValue = JSON.stringify(value);
    }
    if (displayValue.length > 50) {
      displayValue = displayValue.substring(0, 50) + "...";
    }

    item.innerHTML = `
        <span class="metadata-label">
          ${formatLabel(key)}
          ${isSensitive ? '<span class="sensitive-badge">SENSITIVE</span>' : ""}
        </span>
        <span class="metadata-value">${displayValue}</span>
      `;

    els.metadataGrid.appendChild(item);
  }

  function formatLabel(key) {
    return key.replace(/([A-Z])/g, " $1").trim();
  }

  function showAlert(type, title, message) {
    els.alertContainer.innerHTML = `
        <div class="alert-box ${type}">
          <div class="alert-icon">${type === "danger" ? "🚨" : type === "warning" ? "⚠️" : "✅"}</div>
          <div class="alert-content">
            <div class="alert-title">${title}</div>
            <div>${message}</div>
          </div>
        </div>
      `;
  }

  async function cleanMetadata() {
    if (!state.file) return;

    els.btnClean.innerHTML = '<span class="spinner"></span> Cleaning...';
    els.btnClean.disabled = true;

    try {
      const bitmap = await createImageBitmap(state.file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");

      if (state.file.type === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(bitmap, 0, 0);

      const quality = state.file.type === "image/jpeg" ? 0.95 : 1.0;

      canvas.toBlob(
        (blob) => {
          downloadFile(blob);
          showSuccess(blob.size);
        },
        state.file.type,
        quality,
      );
    } catch (err) {
      console.error(err);
      alert("Error processing image");
      els.btnClean.textContent = "🧹 Strip All Metadata & Download";
      els.btnClean.disabled = false;
    }
  }

  function downloadFile(blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const nameParts = state.file.name.split(".");
    const ext = nameParts.pop();
    const base = nameParts.join(".");
    link.download = `${base}-clean.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function showSuccess(cleanedSize) {
    els.beforeSize.textContent = formatSize(state.originalSize);
    els.beforeMetadata.textContent = state.metadataCount;
    els.afterSize.textContent = formatSize(cleanedSize);
    els.analysisSection.classList.add("hidden");
    els.successSection.classList.remove("hidden");
  }

  function formatSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function resetUI() {
    if (els.fileThumb.src) URL.revokeObjectURL(els.fileThumb.src);
    state.file = null;
    state.exifData = null;
    state.metadataCount = 0;
    state.originalSize = 0;
    els.fileInput.value = "";
    els.uploadZone.classList.remove("hidden");
    els.analysisSection.classList.add("hidden");
    els.successSection.classList.add("hidden");
    els.metadataGrid.innerHTML = "";
    els.alertContainer.innerHTML = "";
    els.btnClean.innerHTML = "🧹 Strip All Metadata & Download";
    els.btnClean.disabled = false;
  }
});

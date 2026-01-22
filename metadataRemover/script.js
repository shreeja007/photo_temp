document.addEventListener("DOMContentLoaded", () => {
  const state = {
    file: null,
    exifData: null,
    metadataCount: 0,
    originalSize: 0,
    map: null, // Store map instance
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

    // GPS & Map Elements
    gpsMapSection: document.getElementById("gps-map-section"),
    gpsCoords: document.getElementById("gps-coords"),
    gpsAddress: document.getElementById("gps-address"),
    btnShareTool: document.getElementById("btn-share-tool"),

    alertContainer: document.getElementById("alert-container"),
    metadataGrid: document.getElementById("metadata-grid"),
    beforeSize: document.getElementById("before-size"),
    beforeMetadata: document.getElementById("before-metadata"),
    afterSize: document.getElementById("after-size"),
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
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  els.btnRemove.addEventListener("click", resetUI);
  els.btnRestart.addEventListener("click", resetUI);
  els.btnClean.addEventListener("click", cleanMetadata);
  els.btnShareTool.addEventListener("click", shareDataDiet);

  async function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    state.file = file;
    state.originalSize = file.size;

    // Preview
    const url = URL.createObjectURL(file);
    els.fileThumb.src = url;
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatSize(file.size);

    // Show Analysis
    els.uploadZone.classList.add("hidden");
    els.analysisSection.classList.remove("hidden");
    els.successSection.classList.add("hidden");

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

    // 1. Check for Sensitive Data
    const hasGPS = data.GPSLatitude && data.GPSLongitude;

    // 2. Handle GPS / Map Logic
    if (hasGPS) {
      const coords = parseGPSCoordinates(data);
      if (coords) {
        showGPSMap(coords.lat, coords.lng);
        showAlert(
          "danger",
          "⚠️ Location Data Exposed!",
          `This image contains GPS coordinates that reveal exactly where it was taken.`,
        );
      }
    } else {
      els.gpsMapSection.classList.add("hidden");

      if (keys.length > 0) {
        showAlert(
          "warning",
          "Metadata Detected",
          `Found ${keys.length} hidden data items (Camera model, Software, etc).`,
        );
      } else {
        showAlert(
          "success",
          "No Metadata Found",
          "This image appears to be clean already.",
        );
      }
    }

    // 3. Render Grid
    els.metadataGrid.innerHTML = "";
    if (keys.length === 0) {
      els.metadataGrid.innerHTML =
        '<p style="color: var(--text-secondary); grid-column: 1/-1;">No EXIF metadata detected.</p>';
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
      "Software",
      "Artist",
      "Copyright",
    ];

    const priorityFields = [...sensitiveFields, ...importantFields];
    const displayFields = keys.filter((k) => priorityFields.includes(k));
    const otherFields = keys.filter((k) => !priorityFields.includes(k));

    displayFields.forEach((key) => {
      addMetadataItem(key, data[key], sensitiveFields.includes(key));
    });

    if (otherFields.length > 0) {
      const item = document.createElement("div");
      item.className = "metadata-item";
      item.innerHTML = `<span class="metadata-label">Other Fields</span><span class="metadata-value">${otherFields.length} hidden items</span>`;
      els.metadataGrid.appendChild(item);
    }
  }

  // --- MAP & GPS LOGIC ---

  function parseGPSCoordinates(data) {
    if (!data.GPSLatitude || !data.GPSLongitude) return null;

    const lat = convertDMSToDD(
      data.GPSLatitude[0],
      data.GPSLatitude[1],
      data.GPSLatitude[2],
      data.GPSLatitudeRef,
    );
    const lng = convertDMSToDD(
      data.GPSLongitude[0],
      data.GPSLongitude[1],
      data.GPSLongitude[2],
      data.GPSLongitudeRef,
    );

    return { lat, lng };
  }

  function convertDMSToDD(degrees, minutes, seconds, direction) {
    let dd = degrees + minutes / 60 + seconds / 3600;
    if (direction === "S" || direction === "W") {
      dd = dd * -1;
    }
    return dd;
  }

  function showGPSMap(lat, lng) {
    els.gpsMapSection.classList.remove("hidden");

    els.gpsCoords.innerHTML = `
            <strong>Latitude:</strong> ${lat.toFixed(6)}°<br>
            <strong>Longitude:</strong> ${lng.toFixed(6)}°<br>
            <small style="color: #7f1d1d; margin-top: 0.5rem; display: block;">
              ⚠️ Anyone with this image can pinpoint this exact location
            </small>
        `;

    reverseGeocode(lat, lng);

    // Map Init
    if (state.map) state.map.remove(); // Reset existing map

    setTimeout(() => {
      state.map = L.map("map").setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(state.map);

      const marker = L.marker([lat, lng]).addTo(state.map);
      marker.bindPopup(`<strong>📍 Photo Location</strong>`).openPopup();

      L.circle([lat, lng], {
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.2,
        radius: 50,
      }).addTo(state.map);
    }, 100);
  }

  async function reverseGeocode(lat, lng) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "DataDiet-Privacy-Tool" } },
      );
      const data = await response.json();

      if (data && data.display_name) {
        // Simplified Address logic
        const addr = data.address;
        let display = addr.road || "";
        if (addr.suburb) display += (display ? ", " : "") + addr.suburb;
        if (addr.city || addr.town)
          display += (display ? ", " : "") + (addr.city || addr.town);
        if (!display) display = data.display_name; // Fallback

        els.gpsAddress.querySelector(".gps-address-text").innerHTML = `
                    📍 ${display}
                    <br><small style="color: #7f1d1d; font-weight: normal; margin-top:0.5rem; display:block;">This address is visible to anyone who has your photo.</small>
                `;
      }
    } catch (error) {
      console.error(error);
      els.gpsAddress.querySelector(".gps-address-text").textContent =
        "Address lookup failed, but coordinates are exposed.";
    }
  }

  function shareDataDiet() {
    const shareData = {
      title: "DataDiet - Protect Your Privacy",
      text: "I just discovered my photos were leaking my exact location! Check your photos with DataDiet 🛡️",
      url: window.location.href,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        alert("Link copied to clipboard!");
      });
    }
  }

  // --- HELPER FUNCTIONS ---

  function addMetadataItem(key, value, isSensitive = false) {
    const item = document.createElement("div");
    item.className = "metadata-item" + (isSensitive ? " sensitive" : "");

    let displayVal = typeof value === "object" ? JSON.stringify(value) : value;
    if (String(displayVal).length > 50)
      displayVal = String(displayVal).substring(0, 50) + "...";

    item.innerHTML = `
            <span class="metadata-label">${key.replace(/([A-Z])/g, " $1").trim()} ${isSensitive ? '<span class="sensitive-badge">SENSITIVE</span>' : ""}</span>
            <span class="metadata-value">${displayVal}</span>
        `;
    els.metadataGrid.appendChild(item);
  }

  function showAlert(type, title, message) {
    els.alertContainer.innerHTML = `
            <div class="alert-box ${type}">
                <div class="alert-icon">${type === "danger" ? "🚨" : type === "warning" ? "⚠️" : "✅"}</div>
                <div class="alert-content"><div class="alert-title">${title}</div><div>${message}</div></div>
            </div>
        `;
  }

  function formatSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // --- CLEANING LOGIC ---
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

      // Re-encode (strips metadata)
      canvas.toBlob(
        (blob) => {
          downloadFile(blob);
          showSuccess(blob.size);
        },
        state.file.type,
        state.file.type === "image/jpeg" ? 0.95 : 1.0,
      );
    } catch (err) {
      console.error(err);
      alert("Error processing image");
      els.btnClean.textContent = "Try Again";
      els.btnClean.disabled = false;
    }
  }

  function downloadFile(blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const nameParts = state.file.name.split(".");
    const ext = nameParts.pop();
    link.download = `${nameParts.join(".")}-clean.${ext}`;
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

  function resetUI() {
    if (els.fileThumb.src) URL.revokeObjectURL(els.fileThumb.src);
    if (state.map) {
      state.map.remove();
      state.map = null;
    }

    state.file = null;
    state.exifData = null;
    state.metadataCount = 0;
    state.originalSize = 0;

    els.fileInput.value = "";
    els.uploadZone.classList.remove("hidden");
    els.analysisSection.classList.add("hidden");
    els.successSection.classList.add("hidden");
    els.gpsMapSection.classList.add("hidden");
    els.metadataGrid.innerHTML = "";
    els.alertContainer.innerHTML = "";
    els.btnClean.innerHTML = "🧹 Strip All Metadata & Download";
    els.btnClean.disabled = false;
  }
});

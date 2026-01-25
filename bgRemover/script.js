// We use the ESM version which is reliable and works with type="module"
import removeBackground from "https://esm.sh/@imgly/background-removal@1.4.5";

// ELEMENTS
const els = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  editorContainer: document.getElementById("editorContainer"),
  canvas: document.getElementById("mainCanvas"),
  loader: document.getElementById("loader"),
  statusText: document.getElementById("statusText"),
  progressFill: document.getElementById("progressFill"),
  brushPreview: document.getElementById("brushPreview"),
  canvasWrapper: document.getElementById("canvasWrapper"),
  autoBtn: document.getElementById("autoBtn"),
  eraseMode: document.getElementById("eraseMode"),
  restoreMode: document.getElementById("restoreMode"),
  resetBtn: document.getElementById("resetBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  fitBtn: document.getElementById("fitBtn"),
  brushSize: document.getElementById("brushSize"),
  brushSizeVal: document.getElementById("brushSizeVal"),
  hardness: document.getElementById("hardness"),
  hardnessVal: document.getElementById("hardnessVal"),
  opacity: document.getElementById("opacity"),
  opacityVal: document.getElementById("opacityVal"),
  widthStat: document.getElementById("widthStat"),
  heightStat: document.getElementById("heightStat"),
  sizeStat: document.getElementById("sizeStat"),
  undoCount: document.getElementById("undoCount"),
  toast: document.getElementById("toast"),
  toastIcon: document.getElementById("toastIcon"),
  toastMessage: document.getElementById("toastMessage"),
};

const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

let state = {
  originalImage: null,
  history: [],
  historyIndex: -1,
  isDrawing: false,
  currentMode: "erase",
  scale: 1,
};

// --- HELPERS ---
function showToast(msg, type = "success") {
  els.toastIcon.textContent = type === "success" ? "✓" : "⚠";
  els.toastMessage.textContent = msg;
  els.toast.className = `toast ${type}`;
  els.toast.style.display = "flex";
  setTimeout(() => (els.toast.style.display = "none"), 3000);
}

function updateStats() {
  if (!state.originalImage) return;
  els.widthStat.textContent = state.originalImage.width + "px";
  els.heightStat.textContent = state.originalImage.height + "px";

  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const kb = (blob.size / 1024).toFixed(1);
    els.sizeStat.textContent =
      kb < 1024 ? kb + "KB" : (kb / 1024).toFixed(1) + "MB";
  });

  els.undoCount.textContent = state.historyIndex + 1;
  els.undoBtn.disabled = state.historyIndex <= 0;
  els.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// --- EXIF ORIENTATION FIX ---
function getOrientation(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target.result);
      if (view.getUint16(0, false) !== 0xffd8) {
        return resolve(1); // Not a JPEG
      }
      const length = view.byteLength;
      let offset = 2;
      while (offset < length) {
        if (view.getUint16(offset + 2, false) <= 8) return resolve(1);
        const marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xffe1) {
          const little = view.getUint16(offset + 8, false) === 0x4949;
          offset += view.getUint16(offset, false);
          const tags = view.getUint16(offset, little);
          offset += 2;
          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + i * 12, little) === 0x0112) {
              return resolve(view.getUint16(offset + i * 12 + 8, little));
            }
          }
        } else if ((marker & 0xff00) !== 0xff00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
      return resolve(1);
    };
    reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
  });
}

function resetOrientation(img, orientation) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let width = img.width;
  let height = img.height;

  // Set proper canvas dimensions before transform
  if (orientation > 4 && orientation < 9) {
    canvas.width = height;
    canvas.height = width;
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  // Transform context before drawing image
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break;
  }

  ctx.drawImage(img, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(URL.createObjectURL(blob));
    });
  });
}

// --- FILE HANDLING ---
els.dropZone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

els.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropZone.classList.add("dragover");
});
els.dropZone.addEventListener("dragleave", () =>
  els.dropZone.classList.remove("dragover"),
);
els.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

async function handleFile(file) {
  if (!file) return;
  if (!file.type.match("image.*"))
    return showToast("Please upload an image", "error");

  if (file.size > 10 * 1024 * 1024) {
    return showToast("File too large. Max 10MB", "error");
  }

  // Get EXIF orientation
  const orientation = await getOrientation(file);

  const reader = new FileReader();
  reader.onload = async (e) => {
    const img = new Image();
    img.onload = async () => {
      // Fix orientation if needed
      let imageSrc = e.target.result;
      if (orientation !== 1) {
        imageSrc = await resetOrientation(img, orientation);
      }

      // Load corrected image
      const correctedImg = new Image();
      correctedImg.onload = () => {
        state.originalImage = correctedImg;
        initCanvas(correctedImg);
        els.dropZone.style.display = "none";
        els.editorContainer.style.display = "flex";

        // Wait for layout to settle before fitting
        requestAnimationFrame(() => {
          setTimeout(() => {
            fitToView();
            updateStats();
            showToast("Image loaded");
          }, 100);
        });
      };
      correctedImg.src = imageSrc;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// --- CANVAS LOGIC ---
function initCanvas(img) {
  els.canvas.width = img.width;
  els.canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  state.history = [];
  state.historyIndex = -1;
  saveState();
}

function saveState() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  if (state.history.length > 20) state.history.shift();
  else state.historyIndex++;

  state.history.push(els.canvas.toDataURL());
  updateStats();
}

function restoreState(index) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(img, 0, 0);
    state.historyIndex = index;
    updateStats();
  };
  img.src = state.history[index];
}

// --- DRAWING ---
function getMousePos(evt) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (els.canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (els.canvas.height / rect.height),
  };
}

function draw(e) {
  if (!state.isDrawing) return;

  const pos = getMousePos(e);
  const size = parseInt(els.brushSize.value);
  const hardness = parseInt(els.hardness.value) / 100;
  const opacity = parseInt(els.opacity.value) / 100;

  if (state.currentMode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = opacity;

    if (hardness < 1) {
      const rad = size / 2;
      const grad = ctx.createRadialGradient(
        pos.x,
        pos.y,
        rad * hardness,
        pos.x,
        pos.y,
        rad,
      );
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = opacity;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(state.originalImage, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// Mouse Events
els.canvas.addEventListener("mousedown", (e) => {
  state.isDrawing = true;
  draw(e);
});
els.canvas.addEventListener("mouseup", () => {
  if (state.isDrawing) {
    state.isDrawing = false;
    saveState();
  }
});
els.canvas.addEventListener("mouseout", () => {
  state.isDrawing = false;
  els.brushPreview.style.display = "none";
});
els.canvas.addEventListener("mousemove", (e) => {
  const rect = els.canvas.getBoundingClientRect();
  const size = parseInt(els.brushSize.value);
  const displaySize = size * (rect.width / els.canvas.width);

  els.brushPreview.style.display = "block";
  els.brushPreview.style.width = displaySize + "px";
  els.brushPreview.style.height = displaySize + "px";
  els.brushPreview.style.left = e.clientX - displaySize / 2 + "px";
  els.brushPreview.style.top = e.clientY - displaySize / 2 + "px";

  draw(e);
});

// Touch Events
els.canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    state.isDrawing = true;
    draw(e.touches[0]);
  },
  { passive: false },
);

els.canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (state.isDrawing) draw(e.touches[0]);
  },
  { passive: false },
);

els.canvas.addEventListener("touchend", () => {
  if (state.isDrawing) {
    state.isDrawing = false;
    saveState();
  }
});

// --- TOOLS ---
els.eraseMode.addEventListener("click", () => {
  state.currentMode = "erase";
  els.eraseMode.classList.add("active");
  els.restoreMode.classList.remove("active");
  els.brushPreview.style.borderColor = "var(--accent-color)";
});

els.restoreMode.addEventListener("click", () => {
  state.currentMode = "restore";
  els.restoreMode.classList.add("active");
  els.eraseMode.classList.remove("active");
  els.brushPreview.style.borderColor = "var(--success-color)";
});

// AI AUTO REMOVE
els.autoBtn.addEventListener("click", async () => {
  if (!state.originalImage) return;

  els.loader.style.display = "flex";
  els.statusText.innerText = "Downloading Model & Processing...";
  els.progressFill.style.width = "10%";

  try {
    const blob = await removeBackground(state.originalImage.src, {
      progress: (key, current, total) => {
        const percent = Math.round((current / total) * 100);
        els.progressFill.style.width = percent + "%";
        els.statusText.innerText = `AI Processing... ${percent}%`;
      },
    });

    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      ctx.drawImage(img, 0, 0);
      saveState();
      els.loader.style.display = "none";
      showToast("Background Removed!");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } catch (err) {
    console.error(err);
    els.loader.style.display = "none";
    showToast("AI Error: " + err.message, "error");
  }
});

// Zoom & View
function fitToView() {
  const wrapper = els.canvasWrapper;
  const wrapperW = wrapper.clientWidth - 80;
  const wrapperH = wrapper.clientHeight - 80;

  const scaleX = wrapperW / els.canvas.width;
  const scaleY = wrapperH / els.canvas.height;

  // Fill the view instead of limiting to 1
  state.scale = Math.min(scaleX, scaleY);
  applyScale();
}

function applyScale() {
  els.canvas.style.transform = `scale(${state.scale})`;
}

els.zoomInBtn.addEventListener("click", () => {
  state.scale = Math.min(state.scale * 1.2, 3);
  applyScale();
});
els.zoomOutBtn.addEventListener("click", () => {
  state.scale = Math.max(state.scale / 1.2, 0.1);
  applyScale();
});
els.fitBtn.addEventListener("click", fitToView);

// Actions
els.undoBtn.addEventListener("click", () => {
  if (state.historyIndex > 0) restoreState(state.historyIndex - 1);
});
els.redoBtn.addEventListener("click", () => {
  if (state.historyIndex < state.history.length - 1)
    restoreState(state.historyIndex + 1);
});

els.resetBtn.addEventListener("click", () => {
  if (confirm("Discard all changes?")) {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(state.originalImage, 0, 0);
    saveState();
  }
});

els.downloadBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `photodiet-${Date.now()}.png`;
  a.href = els.canvas.toDataURL("image/png");
  a.click();
  showToast("Image downloaded");
});

// Sliders UI
els.brushSize.addEventListener(
  "input",
  (e) => (els.brushSizeVal.innerText = e.target.value + "px"),
);
els.hardness.addEventListener(
  "input",
  (e) => (els.hardnessVal.innerText = e.target.value + "%"),
);
els.opacity.addEventListener(
  "input",
  (e) => (els.opacityVal.innerText = e.target.value + "%"),
);

// Keyboard Shortcuts
document.addEventListener("keydown", (e) => {
  if ((e.key === "[" || e.key === "]") && !e.ctrlKey) {
    if (e.key === "[") {
      els.brushSize.value = Math.max(5, parseInt(els.brushSize.value) - 5);
    }
    if (e.key === "]") {
      els.brushSize.value = Math.min(150, parseInt(els.brushSize.value) + 5);
    }
    els.brushSizeVal.innerText = els.brushSize.value + "px";
  }

  if (e.key.toLowerCase() === "e") els.eraseMode.click();
  if (e.key.toLowerCase() === "r") els.restoreMode.click();
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    els.undoBtn.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "y") {
    e.preventDefault();
    els.redoBtn.click();
  }
});

window.addEventListener("resize", () => {
  if (state.originalImage) {
    fitToView();
  }
});

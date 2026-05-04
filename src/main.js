import "./styles.css";

const MM_PER_INCH = 25.4;
const EXPORT_DPI = 300;
const A4_MM = { width: 210, height: 297 };
const DEFAULT_PREVIEW_WIDTH = 1600;

const state = {
  orientation: "landscape",
  frontByOrientation: {
    landscape: "right",
    portrait: "bottom",
  },
  layoutMode: "auto",
  gapMm: 3,
  marginMm: 4,
  photos: [],
  slots: [],
  placements: new Map(),
  dragPhotoId: null,
  dragSlotIndex: null,
};

const aspectPattern = [1, 1.5, 0.75, 1.333, 0.667, 1.778, 1.25, 0.8];
const commonRatios = [1, 4 / 3, 3 / 2, 16 / 9, 5 / 4, 3 / 4, 2 / 3, 9 / 16, 4 / 5];

const app = document.querySelector("#app");
app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <h1>Collage Maker</h1>
      <span>A4 fold card</span>
    </div>

    <div class="control-strip" aria-label="Card controls">
      <div class="control-group">
        <span class="label">Orientation</span>
        <div class="segmented" data-control="orientation">
          <button type="button" data-value="landscape" aria-pressed="true">Landscape</button>
          <button type="button" data-value="portrait" aria-pressed="false">Portrait</button>
        </div>
      </div>

      <div class="control-group">
        <span class="label">Front</span>
        <div class="segmented" data-control="front">
          <button type="button" data-value="left" aria-pressed="false">Left</button>
          <button type="button" data-value="right" aria-pressed="true">Right</button>
          <button type="button" data-value="top" aria-pressed="false">Top</button>
          <button type="button" data-value="bottom" aria-pressed="false">Bottom</button>
        </div>
      </div>

      <div class="control-group">
        <span class="label">Layout</span>
        <div class="segmented layout-segment" data-control="layout">
          <button type="button" data-value="auto" aria-pressed="true">Mosaic</button>
          <button type="button" data-value="feature" aria-pressed="false">Feature</button>
          <button type="button" data-value="grid" aria-pressed="false">Grid</button>
          <button type="button" data-value="ribbon" aria-pressed="false">Ribbon</button>
        </div>
      </div>

      <div class="range-control">
        <label for="gapRange">Gap <output id="gapValue">3 mm</output></label>
        <input id="gapRange" type="range" min="0" max="8" step="0.5" value="3" />
      </div>

      <div class="range-control">
        <label for="marginRange">Border <output id="marginValue">4 mm</output></label>
        <input id="marginRange" type="range" min="0" max="12" step="0.5" value="4" />
      </div>

      <button type="button" class="export-button" id="exportButton">
        Export PNG
      </button>
    </div>
  </header>

  <main class="workspace">
    <aside class="sidebar" aria-label="Photo tray">
      <section class="panel photo-panel">
        <div class="panel-head">
          <h2>Photos</h2>
          <button type="button" class="secondary-button" id="chooseFilesButton">Add</button>
          <input id="fileInput" type="file" accept="image/*" multiple hidden />
        </div>
        <div id="dropzone" class="dropzone" tabindex="0">
          <strong>Drop photos</strong>
          <span>JPEG, PNG, WebP</span>
        </div>
        <div id="photoList" class="photo-list" aria-live="polite"></div>
      </section>
    </aside>

    <section class="stage" aria-label="A4 sheet preview">
      <div class="sheet-shell">
        <div id="sheet" class="sheet landscape">
          <div id="blankHalf" class="blank-half"></div>
          <div id="frontPanel" class="front-panel"></div>
          <div id="foldLine" class="fold-line" aria-hidden="true"></div>
        </div>
      </div>
    </section>
  </main>
`;

const els = {
  sheet: document.querySelector("#sheet"),
  frontPanel: document.querySelector("#frontPanel"),
  blankHalf: document.querySelector("#blankHalf"),
  foldLine: document.querySelector("#foldLine"),
  fileInput: document.querySelector("#fileInput"),
  chooseFilesButton: document.querySelector("#chooseFilesButton"),
  dropzone: document.querySelector("#dropzone"),
  photoList: document.querySelector("#photoList"),
  exportButton: document.querySelector("#exportButton"),
  gapRange: document.querySelector("#gapRange"),
  gapValue: document.querySelector("#gapValue"),
  marginRange: document.querySelector("#marginRange"),
  marginValue: document.querySelector("#marginValue"),
};

function getPhoto(id) {
  return state.photos.find((photo) => photo.id === id) ?? null;
}

function getFrontSide() {
  return state.frontByOrientation[state.orientation];
}

function getSheetMetrics(width = DEFAULT_PREVIEW_WIDTH) {
  const landscape = state.orientation === "landscape";
  const aspect = landscape ? A4_MM.height / A4_MM.width : A4_MM.width / A4_MM.height;
  const sheetWidth = width;
  const sheetHeight = Math.round(sheetWidth / aspect);

  if (landscape) {
    return {
      sheetWidth,
      sheetHeight,
      front: {
        x: getFrontSide() === "right" ? sheetWidth / 2 : 0,
        y: 0,
        width: sheetWidth / 2,
        height: sheetHeight,
      },
    };
  }

  return {
    sheetWidth,
    sheetHeight,
    front: {
      x: 0,
      y: getFrontSide() === "bottom" ? sheetHeight / 2 : 0,
      width: sheetWidth,
      height: sheetHeight / 2,
    },
  };
}

function mmToPreviewPx(mm) {
  const landscape = state.orientation === "landscape";
  const sheetWidthMm = landscape ? A4_MM.height : A4_MM.width;
  return (mm / sheetWidthMm) * DEFAULT_PREVIEW_WIDTH;
}

function mmToExportPx(mm) {
  return Math.round((mm / MM_PER_INCH) * EXPORT_DPI);
}

function getExportSize() {
  const widthMm = state.orientation === "landscape" ? A4_MM.height : A4_MM.width;
  const heightMm = state.orientation === "landscape" ? A4_MM.width : A4_MM.height;
  return {
    width: Math.round((widthMm / MM_PER_INCH) * EXPORT_DPI),
    height: Math.round((heightMm / MM_PER_INCH) * EXPORT_DPI),
  };
}

function getExportFrontRect(width, height) {
  if (state.orientation === "landscape") {
    return {
      x: getFrontSide() === "right" ? width / 2 : 0,
      y: 0,
      width: width / 2,
      height,
    };
  }

  return {
    x: 0,
    y: getFrontSide() === "bottom" ? height / 2 : 0,
    width,
    height: height / 2,
  };
}

function getSlotCount() {
  return Math.max(state.photos.length, 5);
}

function syncSlots() {
  const validIds = new Set(state.photos.map((photo) => photo.id));
  state.slots = state.slots.filter((id) => id === null || validIds.has(id));

  for (const photo of state.photos) {
    if (!state.slots.includes(photo.id)) {
      const emptyIndex = state.slots.indexOf(null);
      if (emptyIndex >= 0) {
        state.slots[emptyIndex] = photo.id;
      } else {
        state.slots.push(photo.id);
      }
    }
  }

  const slotCount = getSlotCount();
  while (state.slots.length < slotCount) {
    state.slots.push(null);
  }
  if (state.slots.length > slotCount) {
    state.slots.length = slotCount;
  }
}

function preferredAspect(photo, index) {
  if (!photo) {
    return aspectPattern[index % aspectPattern.length];
  }

  const native = clamp(photo.width / photo.height, 0.55, 2.15);
  const nearest = commonRatios.reduce((best, ratio) => {
    const score = Math.abs(Math.log(native / ratio));
    return score < best.score ? { ratio, score } : best;
  }, { ratio: 1, score: Infinity }).ratio;

  return clamp(native * 0.7 + nearest * 0.3, 0.55, 2.15);
}

function getSlotAspects(slotCount) {
  return Array.from({ length: slotCount }, (_, index) => {
    const photo = getPhoto(state.slots[index]);
    return preferredAspect(photo, index);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildCells(panelWidth, panelHeight, gap, margin) {
  syncSlots();
  const slotCount = getSlotCount();
  const aspects = getSlotAspects(slotCount);

  if (state.layoutMode === "feature") {
    return layoutFeature(slotCount, panelWidth, panelHeight, gap, margin);
  }
  if (state.layoutMode === "grid") {
    return layoutGrid(slotCount, panelWidth, panelHeight, gap, margin);
  }
  if (state.layoutMode === "ribbon") {
    return layoutRibbon(slotCount, panelWidth, panelHeight, gap, margin);
  }
  return layoutAuto(slotCount, panelWidth, panelHeight, gap, margin, aspects);
}

function layoutAuto(count, panelWidth, panelHeight, gap, margin, aspects, forcedRows = null) {
  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  if (count === 0) {
    return [];
  }

  const rowCandidates = forcedRows ? [forcedRows] : getRowCandidates(count, panelWidth, panelHeight);
  let best = null;

  for (const rowCount of rowCandidates) {
    const layout = solveRows(count, rowCount, innerWidth, innerHeight, gap, aspects);
    if (!layout) continue;

    if (!best || layout.score < best.score) {
      best = layout;
    }
  }

  if (!best) {
    best = solveRows(count, Math.min(count, 2), innerWidth, innerHeight, gap, aspects);
  }

  const totalIdeal = best.rows.reduce((sum, row) => sum + row.idealHeight, 0);
  const availableRowHeight = innerHeight - gap * (best.rows.length - 1);
  const scale = availableRowHeight / totalIdeal;
  const cells = [];
  let y = margin;

  for (const row of best.rows) {
    const rowHeight = row.idealHeight * scale;
    const rowWidth = innerWidth - gap * (row.end - row.start - 1);
    const ratioTotal = row.aspects.reduce((sum, aspect) => sum + aspect, 0);
    let x = margin;

    row.aspects.forEach((aspect, offset) => {
      const isLast = offset === row.aspects.length - 1;
      const width = isLast ? margin + innerWidth - x : (aspect / ratioTotal) * rowWidth;
      cells.push({ index: row.start + offset, x, y, width, height: rowHeight });
      x += width + gap;
    });

    y += rowHeight + gap;
  }

  return cells.sort((a, b) => a.index - b.index);
}

function getRowCandidates(count, panelWidth, panelHeight) {
  const panelAspect = panelWidth / panelHeight;
  const idealRows = Math.sqrt(count / Math.max(panelAspect, 0.2));
  const minRows = Math.max(1, Math.floor(idealRows) - 2);
  const maxRows = Math.min(count, Math.ceil(idealRows) + 3, 8);
  const rows = [];
  for (let row = minRows; row <= maxRows; row += 1) {
    rows.push(row);
  }
  return rows;
}

function solveRows(count, rowCount, innerWidth, innerHeight, gap, aspects) {
  if (rowCount < 1 || rowCount > count) {
    return null;
  }

  const availableRowHeight = innerHeight - gap * (rowCount - 1);
  if (availableRowHeight <= 0) {
    return null;
  }

  const targetHeight = availableRowHeight / rowCount;
  const maxGroup = Math.max(2, Math.ceil(count / rowCount) + 3);
  const dp = Array.from({ length: rowCount + 1 }, () => Array(count + 1).fill(null));
  dp[0][0] = { cost: 0, rows: [] };

  for (let row = 1; row <= rowCount; row += 1) {
    for (let end = row; end <= count; end += 1) {
      let ratioSum = 0;
      for (let start = end - 1; start >= row - 1 && end - start <= maxGroup; start -= 1) {
        ratioSum += aspects[start];
        const itemCount = end - start;
        const widthForImages = innerWidth - gap * (itemCount - 1);
        const idealHeight = widthForImages / ratioSum;
        const shapeCost = Math.pow((idealHeight - targetHeight) / targetHeight, 2);
        const crowdCost = itemCount > 4 ? Math.pow(itemCount - 4, 2) * 0.04 : 0;
        const previous = dp[row - 1][start];
        if (!previous) continue;

        const candidate = {
          cost: previous.cost + shapeCost + crowdCost,
          rows: [
            ...previous.rows,
            {
              start,
              end,
              idealHeight,
              aspects: aspects.slice(start, end),
            },
          ],
        };

        if (!dp[row][end] || candidate.cost < dp[row][end].cost) {
          dp[row][end] = candidate;
        }
      }
    }
  }

  const result = dp[rowCount][count];
  if (!result) {
    return null;
  }

  const totalIdeal = result.rows.reduce((sum, row) => sum + row.idealHeight, 0);
  const fitCost = Math.pow((totalIdeal - availableRowHeight) / availableRowHeight, 2) * 7;
  return {
    rows: result.rows,
    score: result.cost + fitCost,
  };
}

function layoutGrid(count, panelWidth, panelHeight, gap, margin) {
  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * (panelWidth / panelHeight))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const rowHeight = (innerHeight - gap * (rows - 1)) / rows;
  const cells = [];
  let placed = 0;

  for (let row = 0; row < rows; row += 1) {
    const remaining = count - placed;
    const rowsLeft = rows - row;
    const itemsInRow = Math.ceil(remaining / rowsLeft);
    const cellWidth = (innerWidth - gap * (itemsInRow - 1)) / itemsInRow;
    const y = margin + row * (rowHeight + gap);

    for (let col = 0; col < itemsInRow; col += 1) {
      cells.push({
        index: placed,
        x: margin + col * (cellWidth + gap),
        y,
        width: cellWidth,
        height: rowHeight,
      });
      placed += 1;
    }
  }

  return cells;
}

function layoutFeature(count, panelWidth, panelHeight, gap, margin) {
  if (count <= 2) {
    return layoutGrid(count, panelWidth, panelHeight, gap, margin);
  }

  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  const cells = [];
  const landscapePanel = innerWidth >= innerHeight;
  const sideCount = count - 1;

  if (landscapePanel) {
    const leftCount = Math.ceil(sideCount / 2);
    const rightCount = sideCount - leftCount;
    const featureWidth = innerWidth * (count >= 5 ? 0.52 : 0.58);
    const sideWidth = (innerWidth - featureWidth - gap * 2) / 2;

    cells.push({
      index: 0,
      x: margin + sideWidth + gap,
      y: margin,
      width: featureWidth,
      height: innerHeight,
    });

    addStackedColumn(cells, 1, leftCount, margin, margin, sideWidth, innerHeight, gap);
    addStackedColumn(cells, 1 + leftCount, rightCount, margin + sideWidth + gap + featureWidth + gap, margin, sideWidth, innerHeight, gap);
  } else {
    const topCount = Math.ceil(sideCount / 2);
    const bottomCount = sideCount - topCount;
    const featureHeight = innerHeight * (count >= 5 ? 0.52 : 0.58);
    const sideHeight = (innerHeight - featureHeight - gap * 2) / 2;

    cells.push({
      index: 0,
      x: margin,
      y: margin + sideHeight + gap,
      width: innerWidth,
      height: featureHeight,
    });

    addSplitRow(cells, 1, topCount, margin, margin, innerWidth, sideHeight, gap);
    addSplitRow(cells, 1 + topCount, bottomCount, margin, margin + sideHeight + gap + featureHeight + gap, innerWidth, sideHeight, gap);
  }

  return cells.filter((cell) => cell.width > 0 && cell.height > 0).sort((a, b) => a.index - b.index);
}

function layoutRibbon(count, panelWidth, panelHeight, gap, margin) {
  if (count <= 2) {
    return layoutGrid(count, panelWidth, panelHeight, gap, margin);
  }

  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  const landscapePanel = innerWidth >= innerHeight;
  const cells = [];

  if (landscapePanel) {
    const featureHeight = innerHeight * 0.62;
    const stripHeight = innerHeight - featureHeight - gap;
    cells.push({ index: 0, x: margin, y: margin, width: innerWidth, height: featureHeight });
    addSplitRow(cells, 1, count - 1, margin, margin + featureHeight + gap, innerWidth, stripHeight, gap);
  } else {
    const featureWidth = innerWidth * 0.62;
    const stripWidth = innerWidth - featureWidth - gap;
    cells.push({ index: 0, x: margin, y: margin, width: featureWidth, height: innerHeight });
    addStackedColumn(cells, 1, count - 1, margin + featureWidth + gap, margin, stripWidth, innerHeight, gap);
  }

  return cells;
}

function addStackedColumn(cells, startIndex, count, x, y, width, height, gap) {
  if (count <= 0) return;
  const cellHeight = (height - gap * (count - 1)) / count;
  for (let i = 0; i < count; i += 1) {
    cells.push({
      index: startIndex + i,
      x,
      y: y + i * (cellHeight + gap),
      width,
      height: cellHeight,
    });
  }
}

function addSplitRow(cells, startIndex, count, x, y, width, height, gap) {
  if (count <= 0) return;
  const cellWidth = (width - gap * (count - 1)) / count;
  for (let i = 0; i < count; i += 1) {
    cells.push({
      index: startIndex + i,
      x: x + i * (cellWidth + gap),
      y,
      width: cellWidth,
      height,
    });
  }
}

async function addFiles(fileList, targetSlot = null) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  const loaded = await Promise.all(files.map(loadPhoto));
  state.photos.push(...loaded);
  loaded.forEach((photo) => {
    state.placements.set(photo.id, { zoom: 1, focusX: 0.5, focusY: 0.5 });
  });
  syncSlots();

  if (targetSlot !== null && loaded[0]) {
    assignPhotoToSlot(loaded[0].id, targetSlot, false);
    loaded.slice(1).forEach((photo) => {
      const emptyIndex = state.slots.findIndex((id) => id === null);
      if (emptyIndex >= 0) {
        assignPhotoToSlot(photo.id, emptyIndex, false);
      }
    });
    return;
  }

  render();
}

function loadPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        url,
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load ${file.name}`));
    };
    image.src = url;
  });
}

function assignPhotoToSlot(photoId, slotIndex, rerender = true) {
  syncSlots();
  const existingIndex = state.slots.indexOf(photoId);
  const targetPhotoId = state.slots[slotIndex] ?? null;

  if (existingIndex >= 0 && existingIndex !== slotIndex) {
    state.slots[existingIndex] = targetPhotoId;
  }

  state.slots[slotIndex] = photoId;

  if (rerender) {
    render();
  }
}

function removePhoto(photoId) {
  const photo = getPhoto(photoId);
  if (!photo) return;

  URL.revokeObjectURL(photo.url);
  state.photos = state.photos.filter((item) => item.id !== photoId);
  state.slots = state.slots.map((id) => (id === photoId ? null : id));
  state.placements.delete(photoId);
  syncSlots();
  render();
}

function render() {
  syncSlots();
  renderControls();
  renderPhotoList();
  renderSheet();
}

function renderControls() {
  document.querySelectorAll("[data-control='orientation'] button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.value === state.orientation));
  });

  document.querySelectorAll("[data-control='layout'] button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.value === state.layoutMode));
  });

  document.querySelectorAll("[data-control='front'] button").forEach((button) => {
    const value = button.dataset.value;
    const enabled = state.orientation === "landscape" ? value === "left" || value === "right" : value === "top" || value === "bottom";
    button.hidden = !enabled;
    button.setAttribute("aria-pressed", String(enabled && value === getFrontSide()));
  });

  els.gapValue.textContent = `${formatMm(state.gapMm)} mm`;
  els.marginValue.textContent = `${formatMm(state.marginMm)} mm`;
}

function formatMm(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderPhotoList() {
  els.photoList.replaceChildren();

  if (!state.photos.length) {
    const empty = document.createElement("p");
    empty.className = "empty-tray";
    empty.textContent = "No photos yet";
    els.photoList.append(empty);
    return;
  }

  for (const photo of state.photos) {
    const item = document.createElement("div");
    item.className = "photo-item";
    item.draggable = true;
    item.dataset.photoId = photo.id;
    item.innerHTML = `
      <img src="${photo.url}" alt="" />
      <div class="photo-meta">
        <strong>${escapeHtml(photo.name)}</strong>
        <span>${photo.width} x ${photo.height}</span>
      </div>
      <button type="button" class="icon-button remove-photo" aria-label="Remove ${escapeHtml(photo.name)}">&times;</button>
    `;

    item.addEventListener("dragstart", (event) => {
      state.dragPhotoId = photo.id;
      state.dragSlotIndex = null;
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("application/x-photo-id", photo.id);
      event.dataTransfer.setData("text/plain", photo.id);
    });

    item.querySelector(".remove-photo").addEventListener("click", () => removePhoto(photo.id));
    els.photoList.append(item);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function renderSheet() {
  const metrics = getSheetMetrics();
  const front = metrics.front;
  const gap = mmToPreviewPx(state.gapMm);
  const margin = mmToPreviewPx(state.marginMm);
  const cells = buildCells(front.width, front.height, gap, margin);

  els.sheet.className = `sheet ${state.orientation} front-${getFrontSide()}`;
  els.frontPanel.style.left = `${(front.x / metrics.sheetWidth) * 100}%`;
  els.frontPanel.style.top = `${(front.y / metrics.sheetHeight) * 100}%`;
  els.frontPanel.style.width = `${(front.width / metrics.sheetWidth) * 100}%`;
  els.frontPanel.style.height = `${(front.height / metrics.sheetHeight) * 100}%`;

  els.frontPanel.replaceChildren();

  for (const cell of cells) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.slotIndex = String(cell.index);
    slot.style.left = `${(cell.x / front.width) * 100}%`;
    slot.style.top = `${(cell.y / front.height) * 100}%`;
    slot.style.width = `${(cell.width / front.width) * 100}%`;
    slot.style.height = `${(cell.height / front.height) * 100}%`;

    const photo = getPhoto(state.slots[cell.index]);
    if (photo) {
      const image = document.createElement("img");
      image.src = photo.url;
      image.alt = "";
      image.dataset.photoId = photo.id;
      slot.classList.add("is-filled");
      slot.append(image);
      attachImageEditing(slot, photo);
    } else {
      slot.classList.add("is-empty");
      const mark = document.createElement("span");
      mark.textContent = "+";
      slot.append(mark);
    }

    attachSlotDrop(slot);
    els.frontPanel.append(slot);
  }

  requestAnimationFrame(positionImages);
}

function attachSlotDrop(slot) {
  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    slot.classList.add("is-drop-target");
    event.dataTransfer.dropEffect = "copy";
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("is-drop-target");
  });

  slot.addEventListener("drop", async (event) => {
    event.preventDefault();
    slot.classList.remove("is-drop-target");
    const slotIndex = Number(slot.dataset.slotIndex);

    if (event.dataTransfer.files?.length) {
      await addFiles(event.dataTransfer.files, slotIndex);
      return;
    }

    const photoId = event.dataTransfer.getData("application/x-photo-id") || state.dragPhotoId;
    if (photoId) {
      assignPhotoToSlot(photoId, slotIndex);
    }
  });
}

function attachImageEditing(slot, photo) {
  slot.addEventListener("wheel", (event) => {
    event.preventDefault();
    const placement = getPlacement(photo.id);
    const direction = event.deltaY < 0 ? 1.08 : 0.925;
    placement.zoom = clamp(placement.zoom * direction, 1, 5);
    positionSlotImage(slot, photo);
  }, { passive: false });

  slot.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const placement = getPlacement(photo.id);
    const metrics = getImageMetrics(slot, photo, placement);
    slot.setPointerCapture(event.pointerId);
    slot.classList.add("is-panning");
    slot.dataset.panStart = JSON.stringify({
      x: event.clientX,
      y: event.clientY,
      focusX: placement.focusX,
      focusY: placement.focusY,
      displayWidth: metrics.displayWidth,
      displayHeight: metrics.displayHeight,
    });
  });

  slot.addEventListener("pointermove", (event) => {
    if (!slot.hasPointerCapture(event.pointerId)) return;
    const start = JSON.parse(slot.dataset.panStart);
    const placement = getPlacement(photo.id);
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    placement.focusX = start.focusX - dx / start.displayWidth;
    placement.focusY = start.focusY - dy / start.displayHeight;
    positionSlotImage(slot, photo);
  });

  const endPan = (event) => {
    if (slot.hasPointerCapture(event.pointerId)) {
      slot.releasePointerCapture(event.pointerId);
    }
    slot.classList.remove("is-panning");
    delete slot.dataset.panStart;
  };

  slot.addEventListener("pointerup", endPan);
  slot.addEventListener("pointercancel", endPan);
}

function getPlacement(photoId) {
  if (!state.placements.has(photoId)) {
    state.placements.set(photoId, { zoom: 1, focusX: 0.5, focusY: 0.5 });
  }
  return state.placements.get(photoId);
}

function positionImages() {
  document.querySelectorAll(".slot.is-filled").forEach((slot) => {
    const photoId = slot.querySelector("img")?.dataset.photoId;
    const photo = getPhoto(photoId);
    if (photo) {
      positionSlotImage(slot, photo);
    }
  });
}

function getImageMetrics(slot, photo, placement) {
  const rect = slot.getBoundingClientRect();
  const cellWidth = Math.max(1, rect.width);
  const cellHeight = Math.max(1, rect.height);
  const baseScale = Math.max(cellWidth / photo.width, cellHeight / photo.height);
  const scale = baseScale * placement.zoom;
  const displayWidth = photo.width * scale;
  const displayHeight = photo.height * scale;
  return { cellWidth, cellHeight, displayWidth, displayHeight };
}

function positionSlotImage(slot, photo) {
  const image = slot.querySelector("img");
  if (!image) return;

  const placement = getPlacement(photo.id);
  const metrics = getImageMetrics(slot, photo, placement);
  clampFocus(placement, metrics);

  const left = metrics.cellWidth / 2 - placement.focusX * metrics.displayWidth;
  const top = metrics.cellHeight / 2 - placement.focusY * metrics.displayHeight;

  image.style.width = `${metrics.displayWidth}px`;
  image.style.height = `${metrics.displayHeight}px`;
  image.style.left = `${left}px`;
  image.style.top = `${top}px`;
}

function clampFocus(placement, metrics) {
  if (metrics.displayWidth <= metrics.cellWidth + 0.5) {
    placement.focusX = 0.5;
  } else {
    const minX = metrics.cellWidth / 2 / metrics.displayWidth;
    placement.focusX = clamp(placement.focusX, minX, 1 - minX);
  }

  if (metrics.displayHeight <= metrics.cellHeight + 0.5) {
    placement.focusY = 0.5;
  } else {
    const minY = metrics.cellHeight / 2 / metrics.displayHeight;
    placement.focusY = clamp(placement.focusY, minY, 1 - minY);
  }
}

function exportPng() {
  syncSlots();

  const { width, height } = getExportSize();
  const front = getExportFrontRect(width, height);
  const gap = mmToExportPx(state.gapMm);
  const margin = mmToExportPx(state.marginMm);
  const cells = buildCells(front.width, front.height, gap, margin);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  for (const cell of cells) {
    const photo = getPhoto(state.slots[cell.index]);
    if (!photo) continue;

    const x = front.x + cell.x;
    const y = front.y + cell.y;
    drawPhoto(ctx, photo, x, y, cell.width, cell.height);
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `a4-collage-card-${state.orientation}-${getFrontSide()}-${width}x${height}.png`;
  link.click();
}

function drawPhoto(ctx, photo, x, y, width, height) {
  const placement = getPlacement(photo.id);
  const baseScale = Math.max(width / photo.width, height / photo.height);
  const scale = baseScale * placement.zoom;
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const minSourceX = sourceWidth / 2;
  const minSourceY = sourceHeight / 2;
  const focusX = clamp(placement.focusX, minSourceX / photo.width, 1 - minSourceX / photo.width);
  const focusY = clamp(placement.focusY, minSourceY / photo.height, 1 - minSourceY / photo.height);
  const sourceX = clamp(focusX * photo.width - sourceWidth / 2, 0, photo.width - sourceWidth);
  const sourceY = clamp(focusY * photo.height - sourceHeight / 2, 0, photo.height - sourceHeight);

  ctx.drawImage(photo.image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function setOrientation(value) {
  state.orientation = value;
  render();
}

function setFrontSide(value) {
  state.frontByOrientation[state.orientation] = value;
  render();
}

function setLayoutMode(value) {
  state.layoutMode = value;
  render();
}

document.querySelector("[data-control='orientation']").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  setOrientation(button.dataset.value);
});

document.querySelector("[data-control='front']").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  setFrontSide(button.dataset.value);
});

document.querySelector("[data-control='layout']").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  setLayoutMode(button.dataset.value);
});

els.gapRange.addEventListener("input", () => {
  state.gapMm = Number(els.gapRange.value);
  render();
});

els.marginRange.addEventListener("input", () => {
  state.marginMm = Number(els.marginRange.value);
  render();
});

els.chooseFilesButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", async () => {
  await addFiles(els.fileInput.files);
  els.fileInput.value = "";
});

els.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropzone.classList.add("is-dragging");
});

els.dropzone.addEventListener("dragleave", () => {
  els.dropzone.classList.remove("is-dragging");
});

els.dropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  els.dropzone.classList.remove("is-dragging");
  await addFiles(event.dataTransfer.files);
});

els.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.fileInput.click();
  }
});

els.exportButton.addEventListener("click", exportPng);

window.addEventListener("resize", positionImages);

render();

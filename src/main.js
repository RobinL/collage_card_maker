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
  packSeed: 1,
  activeResize: null,
  recursiveTree: { type: "leaf", id: "pane-1" },
  activeRecursiveId: "pane-1",
  nextRecursivePaneId: 2,
  nextRecursiveSplitId: 1,
  gapMm: 3,
  marginMm: 4,
  manualLayouts: new Map(),
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
          <button type="button" data-value="full" aria-pressed="false">Full page</button>
        </div>
      </div>

      <div class="control-group">
        <span class="label">Layout</span>
        <div class="segmented layout-segment" data-control="layout">
          <button type="button" data-value="auto" aria-pressed="true">Mosaic</button>
          <button type="button" data-value="feature" aria-pressed="false">Feature</button>
          <button type="button" data-value="grid" aria-pressed="false">Grid</button>
          <button type="button" data-value="ribbon" aria-pressed="false">Ribbon</button>
          <button type="button" data-value="tall" aria-pressed="false">Tall</button>
          <button type="button" data-value="wide" aria-pressed="false">Wide</button>
          <button type="button" data-value="quilt" aria-pressed="false">Quilt</button>
          <button type="button" data-value="pack" aria-pressed="false">Pack</button>
          <button type="button" data-value="recursive" aria-pressed="false">Recursive</button>
        </div>
      </div>

      <button type="button" class="secondary-button tool-button" id="mixButton" hidden>
        Mix it up
      </button>

      <button type="button" class="secondary-button tool-button" id="randomiseButton">
        Randomise
      </button>

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
        <p class="editing-hint">Drag gaps to resize · Drag photos to pan · Scroll or pinch to zoom · Shift-drag to move</p>
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
  mixButton: document.querySelector("#mixButton"),
  randomiseButton: document.querySelector("#randomiseButton"),
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

function isFullPage() {
  return getFrontSide() === "full";
}

function getSheetMetrics(width = DEFAULT_PREVIEW_WIDTH) {
  const landscape = state.orientation === "landscape";
  const aspect = landscape ? A4_MM.height / A4_MM.width : A4_MM.width / A4_MM.height;
  const sheetWidth = width;
  const sheetHeight = Math.round(sheetWidth / aspect);

  if (isFullPage()) {
    return {
      sheetWidth,
      sheetHeight,
      front: {
        x: 0,
        y: 0,
        width: sheetWidth,
        height: sheetHeight,
      },
    };
  }

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
  if (isFullPage()) {
    return {
      x: 0,
      y: 0,
      width,
      height,
    };
  }

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
  if (state.layoutMode === "recursive") {
    return getRecursiveLeaves().length;
  }
  return Math.max(state.photos.length, 5);
}

function syncSlots() {
  const slotCount = getSlotCount();
  const validIds = new Set(state.photos.map((photo) => photo.id));
  state.slots = state.slots.filter((id) => id === null || validIds.has(id)).slice(0, slotCount);

  while (state.slots.length < slotCount) {
    state.slots.push(null);
  }

  if (state.layoutMode === "recursive") {
    return;
  }

  for (const photo of state.photos) {
    if (!state.slots.includes(photo.id)) {
      const emptyIndex = state.slots.indexOf(null);
      if (emptyIndex >= 0) {
        state.slots[emptyIndex] = photo.id;
      } else if (state.layoutMode !== "recursive") {
        state.slots.push(photo.id);
      }
    }
  }

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

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray(items, random = Math.random) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createRecursiveLeaf() {
  const leaf = { type: "leaf", id: `pane-${state.nextRecursivePaneId}` };
  state.nextRecursivePaneId += 1;
  return leaf;
}

function createRecursiveSplit(orientation, first, second) {
  const split = {
    type: "split",
    id: `split-${state.nextRecursiveSplitId}`,
    orientation,
    ratio: 0.5,
    first,
    second,
  };
  state.nextRecursiveSplitId += 1;
  return split;
}

function getRecursiveLeaves(node = state.recursiveTree, leaves = []) {
  if (node.type === "leaf") {
    leaves.push(node);
    return leaves;
  }

  getRecursiveLeaves(node.first, leaves);
  getRecursiveLeaves(node.second, leaves);
  return leaves;
}

function getRecursiveLeafIndex(leafId) {
  return getRecursiveLeaves().findIndex((leaf) => leaf.id === leafId);
}

function getFirstRecursiveLeaf(node) {
  return node.type === "leaf" ? node : getFirstRecursiveLeaf(node.first);
}

function findRecursiveLeaf(leafId, node = state.recursiveTree, parent = null, side = null) {
  if (node.type === "leaf") {
    return node.id === leafId ? { node, parent, side } : null;
  }

  return findRecursiveLeaf(leafId, node.first, node, "first")
    ?? findRecursiveLeaf(leafId, node.second, node, "second");
}

function findRecursiveSplit(splitId, node = state.recursiveTree) {
  return findRecursiveSplitTarget(splitId, node)?.node ?? null;
}

function findRecursiveSplitTarget(splitId, node = state.recursiveTree, parent = null, side = null) {
  if (node.type === "leaf") {
    return null;
  }
  if (node.id === splitId) {
    return { node, parent, side };
  }
  return findRecursiveSplitTarget(splitId, node.first, node, "first")
    ?? findRecursiveSplitTarget(splitId, node.second, node, "second");
}

function replaceRecursiveNode(target, replacement) {
  if (!target.parent) {
    state.recursiveTree = replacement;
    return;
  }
  target.parent[target.side] = replacement;
}

function splitRecursivePane(direction) {
  const target = findRecursiveLeaf(state.activeRecursiveId);
  if (!target) return;

  const currentIndex = getRecursiveLeafIndex(state.activeRecursiveId);
  const newLeaf = createRecursiveLeaf();
  const orientation = direction === "left" || direction === "right" ? "vertical" : "horizontal";
  const originalFirst = direction === "right" || direction === "down";
  const split = originalFirst
    ? createRecursiveSplit(orientation, target.node, newLeaf)
    : createRecursiveSplit(orientation, newLeaf, target.node);

  replaceRecursiveNode(target, split);
  state.slots.splice(originalFirst ? currentIndex + 1 : currentIndex, 0, null);
  state.activeRecursiveId = newLeaf.id;
  render();
}

function closeRecursivePane() {
  const target = findRecursiveLeaf(state.activeRecursiveId);
  if (!target?.parent) return;

  const closingIndex = getRecursiveLeafIndex(state.activeRecursiveId);
  const sibling = target.side === "first" ? target.parent.second : target.parent.first;
  replaceRecursiveNode(findRecursiveSplitTarget(target.parent.id), sibling);
  state.slots.splice(closingIndex, 1);
  state.activeRecursiveId = getFirstRecursiveLeaf(sibling).id;
  render();
}

function buildCells(panelWidth, panelHeight, gap, margin) {
  syncSlots();
  const slotCount = getSlotCount();
  const aspects = getSlotAspects(slotCount);

  if (state.layoutMode === "recursive") {
    return layoutRecursive(panelWidth, panelHeight, gap, margin).cells;
  }

  const manualLayout = state.manualLayouts.get(getManualLayoutKey(slotCount));
  if (manualLayout) {
    return denormalizeCells(manualLayout, panelWidth, panelHeight);
  }

  if (state.layoutMode === "feature") {
    return layoutFeature(slotCount, panelWidth, panelHeight, gap, margin);
  }
  if (state.layoutMode === "grid") {
    return layoutGrid(slotCount, panelWidth, panelHeight, gap, margin);
  }
  if (state.layoutMode === "ribbon") {
    return layoutRibbon(slotCount, panelWidth, panelHeight, gap, margin);
  }
  if (state.layoutMode === "tall") {
    return layoutTallMix(slotCount, panelWidth, panelHeight, gap, margin, aspects);
  }
  if (state.layoutMode === "wide") {
    return layoutWideMix(slotCount, panelWidth, panelHeight, gap, margin, aspects);
  }
  if (state.layoutMode === "quilt") {
    return layoutQuilt(slotCount, panelWidth, panelHeight, gap, margin, aspects);
  }
  if (state.layoutMode === "pack") {
    return layoutPacked(slotCount, panelWidth, panelHeight, gap, margin, aspects);
  }
  return layoutAuto(slotCount, panelWidth, panelHeight, gap, margin, aspects);
}

function getManualLayoutKey(slotCount = getSlotCount()) {
  const pageArea = isFullPage() ? "full" : "half";
  const packVersion = state.layoutMode === "pack" ? state.packSeed : 0;
  return [
    state.layoutMode,
    state.orientation,
    pageArea,
    slotCount,
    state.gapMm,
    state.marginMm,
    packVersion,
  ].join("|");
}

function normalizeCells(cells, panelWidth, panelHeight) {
  return cells.map((cell) => ({
    index: cell.index,
    x: cell.x / panelWidth,
    y: cell.y / panelHeight,
    width: cell.width / panelWidth,
    height: cell.height / panelHeight,
  }));
}

function denormalizeCells(cells, panelWidth, panelHeight) {
  return cells.map((cell) => ({
    index: cell.index,
    x: cell.x * panelWidth,
    y: cell.y * panelHeight,
    width: cell.width * panelWidth,
    height: cell.height * panelHeight,
  }));
}

function layoutRecursive(panelWidth, panelHeight, gap, margin) {
  const cells = [];
  const dividers = [];
  const root = {
    x: margin,
    y: margin,
    width: Math.max(1, panelWidth - margin * 2),
    height: Math.max(1, panelHeight - margin * 2),
  };
  let leafIndex = 0;

  function walk(node, rect) {
    if (node.type === "leaf") {
      cells.push({ index: leafIndex, nodeId: node.id, ...rect });
      leafIndex += 1;
      return;
    }

    const ratio = clamp(node.ratio, 0.05, 0.95);
    node.ratio = ratio;

    if (node.orientation === "vertical") {
      const usableWidth = Math.max(1, rect.width - gap);
      const firstWidth = usableWidth * ratio;
      const secondWidth = usableWidth - firstWidth;
      const firstRect = { x: rect.x, y: rect.y, width: firstWidth, height: rect.height };
      const secondRect = { x: rect.x + firstWidth + gap, y: rect.y, width: secondWidth, height: rect.height };
      dividers.push({
        id: node.id,
        orientation: node.orientation,
        x: rect.x + firstWidth + gap / 2,
        y: rect.y,
        width: 0,
        height: rect.height,
        usableSize: usableWidth,
      });
      walk(node.first, firstRect);
      walk(node.second, secondRect);
      return;
    }

    const usableHeight = Math.max(1, rect.height - gap);
    const firstHeight = usableHeight * ratio;
    const secondHeight = usableHeight - firstHeight;
    const firstRect = { x: rect.x, y: rect.y, width: rect.width, height: firstHeight };
    const secondRect = { x: rect.x, y: rect.y + firstHeight + gap, width: rect.width, height: secondHeight };
    dividers.push({
      id: node.id,
      orientation: node.orientation,
      x: rect.x,
      y: rect.y + firstHeight + gap / 2,
      width: rect.width,
      height: 0,
      usableSize: usableHeight,
    });
    walk(node.first, firstRect);
    walk(node.second, secondRect);
  }

  walk(state.recursiveTree, root);
  return { cells, dividers };
}

function buildCellDividers(cells, gap) {
  const candidates = [];
  const edgeTolerance = 1.5;
  const minimumOverlap = 2;

  function addCandidate(orientation, position, start, end, beforeIndex, afterIndex) {
    if (end - start < minimumOverlap) return;
    candidates.push({
      orientation,
      position,
      start,
      end,
      before: new Set([beforeIndex]),
      after: new Set([afterIndex]),
    });
  }

  for (let firstIndex = 0; firstIndex < cells.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < cells.length; secondIndex += 1) {
      const first = cells[firstIndex];
      const second = cells[secondIndex];
      const firstRight = first.x + first.width;
      const secondRight = second.x + second.width;
      const firstBottom = first.y + first.height;
      const secondBottom = second.y + second.height;

      if (Math.abs(firstRight + gap - second.x) <= edgeTolerance) {
        addCandidate(
          "vertical",
          (firstRight + second.x) / 2,
          Math.max(first.y, second.y),
          Math.min(firstBottom, secondBottom),
          first.index,
          second.index,
        );
      } else if (Math.abs(secondRight + gap - first.x) <= edgeTolerance) {
        addCandidate(
          "vertical",
          (secondRight + first.x) / 2,
          Math.max(first.y, second.y),
          Math.min(firstBottom, secondBottom),
          second.index,
          first.index,
        );
      }

      if (Math.abs(firstBottom + gap - second.y) <= edgeTolerance) {
        addCandidate(
          "horizontal",
          (firstBottom + second.y) / 2,
          Math.max(first.x, second.x),
          Math.min(firstRight, secondRight),
          first.index,
          second.index,
        );
      } else if (Math.abs(secondBottom + gap - first.y) <= edgeTolerance) {
        addCandidate(
          "horizontal",
          (secondBottom + first.y) / 2,
          Math.max(first.x, second.x),
          Math.min(firstRight, secondRight),
          second.index,
          first.index,
        );
      }
    }
  }

  const joinTolerance = Math.max(edgeTolerance, gap + edgeTolerance);
  const groups = [];

  candidates
    .sort((a, b) => a.orientation.localeCompare(b.orientation)
      || a.position - b.position
      || a.start - b.start)
    .forEach((candidate) => {
      const group = groups.find((item) => (
        item.orientation === candidate.orientation
        && Math.abs(item.position - candidate.position) <= edgeTolerance
        && candidate.start <= item.end + joinTolerance
        && candidate.end >= item.start - joinTolerance
      ));

      if (!group) {
        groups.push(candidate);
        return;
      }

      group.start = Math.min(group.start, candidate.start);
      group.end = Math.max(group.end, candidate.end);
      candidate.before.forEach((index) => group.before.add(index));
      candidate.after.forEach((index) => group.after.add(index));
    });

  return groups.map((group, index) => ({
    id: `layout-divider-${index}`,
    orientation: group.orientation,
    x: group.orientation === "vertical" ? group.position : group.start,
    y: group.orientation === "vertical" ? group.start : group.position,
    width: group.orientation === "vertical" ? 0 : group.end - group.start,
    height: group.orientation === "vertical" ? group.end - group.start : 0,
    before: [...group.before],
    after: [...group.after],
  }));
}

function layoutPacked(count, panelWidth, panelHeight, gap, margin, aspects) {
  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  if (count <= 1) {
    return [{ index: 0, x: margin, y: margin, width: innerWidth, height: innerHeight }];
  }

  const random = createRandom(state.packSeed + count * 97 + (state.orientation === "portrait" ? 17 : 0));
  const items = aspects.map((aspect, index) => ({
    index,
    ...getPackedItemShape(aspect, random),
  }));

  shuffleArray(items, random);

  return packItemsIntoRect(items, {
    x: margin,
    y: margin,
    width: innerWidth,
    height: innerHeight,
  }, gap, random)
    .filter((cell) => cell.width > 1 && cell.height > 1)
    .sort((a, b) => a.index - b.index);
}

function getPackedItemShape(aspect, random) {
  return {
    aspect: clamp(aspect * (0.82 + random() * 0.36), 0.45, 2.4),
    weight: 1,
  };
}

function packItemsIntoRect(items, rect, gap, random) {
  if (items.length === 1) {
    return [{ index: items[0].index, ...rect }];
  }

  const split = findBestGroupSplit(items, rect, random);
  const firstItems = items.slice(0, split.count);
  const secondItems = items.slice(split.count);
  const [firstRect, secondRect] = splitGroupRect(rect, firstItems, secondItems, split.orientation, gap);

  return [
    ...packItemsIntoRect(firstItems, firstRect, gap, random),
    ...packItemsIntoRect(secondItems, secondRect, gap, random),
  ];
}

function findBestGroupSplit(items, rect, random) {
  let best = null;

  for (let count = 1; count < items.length; count += 1) {
    const firstItems = items.slice(0, count);
    const secondItems = items.slice(count);
    for (const orientation of ["vertical", "horizontal"]) {
      const [firstRect, secondRect] = splitGroupRect(rect, firstItems, secondItems, orientation, 0);
      const balancePenalty = Math.abs(firstItems.length - secondItems.length) / items.length;
      const shapeScore = scoreGroupRect(firstItems, firstRect) + scoreGroupRect(secondItems, secondRect);
      const orientationNudge = rect.width >= rect.height === (orientation === "vertical") ? -0.18 : 0.1;
      const score = shapeScore + balancePenalty * 0.35 + orientationNudge + random() * 0.08;

      if (!best || score < best.score) {
        best = { count, orientation, score };
      }
    }
  }

  return best;
}

function scoreGroupRect(items, rect) {
  const desired = groupAspect(items);
  const aspect = rect.width / rect.height;
  const extremePenalty = Math.abs(Math.log(aspect / clamp(aspect, 0.42, 2.45))) * 2.2;
  return Math.abs(Math.log(aspect / desired)) + extremePenalty;
}

function groupAspect(items) {
  if (items.length === 1) {
    return items[0].aspect;
  }
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const average = items.reduce((sum, item) => sum + item.aspect * item.weight, 0) / totalWeight;
  return clamp(average, 0.62, 1.8);
}

function splitGroupRect(rect, firstItems, secondItems, orientation, gap) {
  const firstWeight = orientation === "vertical" ? groupWidthWeight(firstItems) : groupHeightWeight(firstItems);
  const secondWeight = orientation === "vertical" ? groupWidthWeight(secondItems) : groupHeightWeight(secondItems);

  if (orientation === "vertical") {
    const usableWidth = Math.max(1, rect.width - gap);
    const firstWidth = usableWidth * (firstWeight / (firstWeight + secondWeight));
    return [
      { x: rect.x, y: rect.y, width: firstWidth, height: rect.height },
      { x: rect.x + firstWidth + gap, y: rect.y, width: usableWidth - firstWidth, height: rect.height },
    ];
  }

  const usableHeight = Math.max(1, rect.height - gap);
  const firstHeight = usableHeight * (firstWeight / (firstWeight + secondWeight));
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: firstHeight },
    { x: rect.x, y: rect.y + firstHeight + gap, width: rect.width, height: usableHeight - firstHeight },
  ];
}

function groupWidthWeight(items) {
  return items.reduce((sum, item) => sum + Math.sqrt(item.aspect) * item.weight, 0);
}

function groupHeightWeight(items) {
  return items.reduce((sum, item) => sum + (1 / Math.sqrt(item.aspect)) * item.weight, 0);
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

function layoutTallMix(count, panelWidth, panelHeight, gap, margin, aspects) {
  if (count <= 2) {
    return layoutGrid(count, panelWidth, panelHeight, gap, margin);
  }

  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  const cells = [];
  const sideCount = Math.min(count - 1, state.orientation === "landscape" ? 2 : 3);
  const sideWidth = innerWidth * (state.orientation === "landscape" ? 0.42 : 0.28);
  const mainWidth = innerWidth - sideWidth - gap;

  addStackedColumn(cells, 0, sideCount, margin, margin, sideWidth, innerHeight, gap);
  addAutoRegion(
    cells,
    sideCount,
    count - sideCount,
    margin + sideWidth + gap,
    margin,
    mainWidth,
    innerHeight,
    gap,
    aspects,
  );

  return cleanCells(cells);
}

function layoutWideMix(count, panelWidth, panelHeight, gap, margin, aspects) {
  if (count <= 2) {
    return layoutGrid(count, panelWidth, panelHeight, gap, margin);
  }

  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  const cells = [];
  const bandCount = Math.min(count - 1, state.orientation === "portrait" ? 2 : 1);
  const bandHeight = innerHeight * (state.orientation === "portrait" ? 0.34 : 0.28);
  const mainHeight = innerHeight - bandHeight - gap;

  addSplitRow(cells, 0, bandCount, margin, margin, innerWidth, bandHeight, gap);
  addAutoRegion(
    cells,
    bandCount,
    count - bandCount,
    margin,
    margin + bandHeight + gap,
    innerWidth,
    mainHeight,
    gap,
    aspects,
  );

  return cleanCells(cells);
}

function layoutQuilt(count, panelWidth, panelHeight, gap, margin, aspects) {
  if (count <= 4) {
    return layoutFeature(count, panelWidth, panelHeight, gap, margin);
  }

  const innerWidth = Math.max(1, panelWidth - margin * 2);
  const innerHeight = Math.max(1, panelHeight - margin * 2);
  const cells = [];

  if (state.orientation === "landscape") {
    const topHeight = innerHeight * 0.24;
    const centerHeight = innerHeight * 0.42;
    const bottomHeight = innerHeight - topHeight - centerHeight - gap * 2;
    const tallWidth = innerWidth * 0.38;
    const centerRightWidth = innerWidth - tallWidth - gap;

    addSplitRow(cells, 0, 2, margin, margin, innerWidth, topHeight, gap);
    cells.push({
      index: 2,
      x: margin,
      y: margin + topHeight + gap,
      width: tallWidth,
      height: centerHeight,
    });
    addStackedColumn(
      cells,
      3,
      Math.min(2, count - 3),
      margin + tallWidth + gap,
      margin + topHeight + gap,
      centerRightWidth,
      centerHeight,
      gap,
    );
    addAutoRegion(
      cells,
      Math.min(5, count),
      count - Math.min(5, count),
      margin,
      margin + topHeight + gap + centerHeight + gap,
      innerWidth,
      bottomHeight,
      gap,
      aspects,
    );
  } else {
    const leftWidth = innerWidth * 0.34;
    const rightWidth = innerWidth - leftWidth - gap;
    const topHeight = innerHeight * 0.34;
    const lowerHeight = innerHeight - topHeight - gap;

    addStackedColumn(cells, 0, 2, margin, margin, leftWidth, innerHeight, gap);
    addSplitRow(cells, 2, Math.min(2, count - 2), margin + leftWidth + gap, margin, rightWidth, topHeight, gap);
    addAutoRegion(
      cells,
      Math.min(4, count),
      count - Math.min(4, count),
      margin + leftWidth + gap,
      margin + topHeight + gap,
      rightWidth,
      lowerHeight,
      gap,
      aspects,
    );
  }

  return cleanCells(cells);
}

function addAutoRegion(cells, startIndex, count, x, y, width, height, gap, aspects) {
  if (count <= 0 || width <= 0 || height <= 0) return;

  const generated = layoutAuto(count, width, height, gap, 0, aspects.slice(startIndex, startIndex + count));
  for (const cell of generated) {
    cells.push({
      ...cell,
      index: startIndex + cell.index,
      x: x + cell.x,
      y: y + cell.y,
    });
  }
}

function cleanCells(cells) {
  return cells
    .filter((cell) => cell.width > 0 && cell.height > 0)
    .sort((a, b) => a.index - b.index);
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

  if (state.layoutMode === "recursive") {
    syncSlots();
    if (targetSlot !== null) {
      placePhotoInSlot(loaded[0].id, targetSlot);
      for (const photo of loaded.slice(1)) {
        const emptyIndex = state.slots.indexOf(null);
        if (emptyIndex < 0) break;
        placePhotoInSlot(photo.id, emptyIndex);
      }
    } else {
      for (const photo of loaded) {
        const emptyIndex = state.slots.indexOf(null);
        if (emptyIndex < 0) break;
        placePhotoInSlot(photo.id, emptyIndex);
      }
    }
    render();
    return;
  }

  if (targetSlot !== null && loaded[0]) {
    while (state.slots.length < getSlotCount()) {
      state.slots.push(null);
    }

    placePhotoInSlot(loaded[0].id, targetSlot);
    loaded.slice(1).forEach((photo) => {
      const emptyIndex = state.slots.findIndex((id) => id === null);
      if (emptyIndex >= 0) {
        placePhotoInSlot(photo.id, emptyIndex);
      }
    });
    syncSlots();
    render();
    return;
  }

  syncSlots();
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
  placePhotoInSlot(photoId, slotIndex);

  if (rerender) {
    render();
  }
}

function placePhotoInSlot(photoId, slotIndex) {
  const existingIndex = state.slots.indexOf(photoId);
  const targetPhotoId = state.slots[slotIndex] ?? null;

  if (existingIndex >= 0 && existingIndex !== slotIndex) {
    state.slots[existingIndex] = targetPhotoId;
  }

  state.slots[slotIndex] = photoId;
}

function swapSlots(sourceIndex, targetIndex) {
  syncSlots();
  if (sourceIndex === targetIndex) return;
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return;
  if (sourceIndex < 0 || targetIndex < 0) return;
  if (sourceIndex >= state.slots.length || targetIndex >= state.slots.length) return;

  [state.slots[sourceIndex], state.slots[targetIndex]] = [state.slots[targetIndex], state.slots[sourceIndex]];
  render();
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
    const enabled = value === "full"
      || (state.orientation === "landscape" ? value === "left" || value === "right" : value === "top" || value === "bottom");
    button.hidden = !enabled;
    button.setAttribute("aria-pressed", String(enabled && value === getFrontSide()));
  });

  els.mixButton.hidden = state.layoutMode !== "pack";
  els.randomiseButton.disabled = state.photos.length < 2;
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
    item.addEventListener("dragend", () => {
      state.dragPhotoId = null;
      state.dragSlotIndex = null;
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
  const layout = state.layoutMode === "recursive"
    ? layoutRecursive(front.width, front.height, gap, margin)
    : null;
  const cells = layout?.cells ?? buildCells(front.width, front.height, gap, margin);
  const layoutDividers = layout?.dividers ?? buildCellDividers(cells, gap);

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
    if (cell.nodeId) {
      slot.dataset.nodeId = cell.nodeId;
    }
    slot.style.left = `${(cell.x / front.width) * 100}%`;
    slot.style.top = `${(cell.y / front.height) * 100}%`;
    slot.style.width = `${(cell.width / front.width) * 100}%`;
    slot.style.height = `${(cell.height / front.height) * 100}%`;

    if (state.layoutMode === "recursive") {
      slot.classList.add("is-recursive");
      if (cell.nodeId === state.activeRecursiveId) {
        slot.classList.add("is-active-recursive");
        renderRecursivePaneControls(slot, cell.nodeId);
      }
      slot.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".recursive-pane-controls")) return;
        if (state.activeRecursiveId === cell.nodeId) return;

        state.activeRecursiveId = cell.nodeId;
        els.frontPanel.querySelector(".slot.is-active-recursive")
          ?.classList.remove("is-active-recursive");
        els.frontPanel.querySelector(".recursive-pane-controls")?.remove();
        slot.classList.add("is-active-recursive");
        renderRecursivePaneControls(slot, cell.nodeId);
      }, { capture: true });
    }

    const photo = getPhoto(state.slots[cell.index]);
    if (photo) {
      const image = document.createElement("img");
      image.src = photo.url;
      image.alt = "";
      image.dataset.photoId = photo.id;
      slot.classList.add("is-filled");
      slot.append(image);
      attachImageEditing(slot, photo);
      attachSlotDrag(slot, photo);
    } else {
      slot.classList.add("is-empty");
      const mark = document.createElement("span");
      mark.textContent = "+";
      slot.append(mark);
    }

    attachSlotDrop(slot);
    els.frontPanel.append(slot);
  }

  if (state.layoutMode === "recursive") {
    renderRecursiveDividers(layoutDividers, front);
  } else {
    renderCellDividers(layoutDividers, front);
  }

  requestAnimationFrame(positionImages);
}

function renderRecursivePaneControls(slot, nodeId) {
  const controls = document.createElement("div");
  controls.className = "recursive-pane-controls";
  controls.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  controls.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const splitPad = document.createElement("div");
  splitPad.className = "recursive-split-pad";
  const splitControls = [
    ["up", "Split pane up", "&uarr;"],
    ["left", "Split pane left", "&larr;"],
    ["right", "Split pane right", "&rarr;"],
    ["down", "Split pane down", "&darr;"],
  ];

  for (const [direction, label, symbol] of splitControls) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `recursive-pane-button split-${direction}`;
    button.dataset.recursiveSplit = direction;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = symbol;
    button.addEventListener("click", () => {
      state.activeRecursiveId = nodeId;
      splitRecursivePane(direction);
    });
    splitPad.append(button);
  }

  controls.append(splitPad);

  if (getRecursiveLeaves().length > 1) {
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "recursive-pane-button recursive-close-button destructive-icon";
    closeButton.setAttribute("aria-label", "Close pane");
    closeButton.title = "Close pane";
    closeButton.innerHTML = "&times;";
    closeButton.addEventListener("click", () => {
      state.activeRecursiveId = nodeId;
      closeRecursivePane();
    });
    controls.append(closeButton);
  }

  slot.append(controls);
}

function renderRecursiveDividers(dividers, front) {
  for (const divider of dividers) {
    const control = document.createElement("button");
    control.type = "button";
    control.className = `recursive-divider recursive-divider-${divider.orientation}`;
    control.dataset.splitId = divider.id;
    control.dataset.usableSize = String(divider.usableSize);
    control.setAttribute("aria-label", "Resize split");
    control.addEventListener("pointerdown", startRecursiveResize);

    if (divider.orientation === "vertical") {
      control.style.left = `${(divider.x / front.width) * 100}%`;
      control.style.top = `${(divider.y / front.height) * 100}%`;
      control.style.height = `${(divider.height / front.height) * 100}%`;
    } else {
      control.style.left = `${(divider.x / front.width) * 100}%`;
      control.style.top = `${(divider.y / front.height) * 100}%`;
      control.style.width = `${(divider.width / front.width) * 100}%`;
    }

    els.frontPanel.append(control);
  }
}

function renderCellDividers(dividers, front) {
  for (const divider of dividers) {
    const control = document.createElement("button");
    control.type = "button";
    control.className = `recursive-divider recursive-divider-${divider.orientation}`;
    control.dataset.dividerId = divider.id;
    control.dataset.orientation = divider.orientation;
    control.dataset.before = divider.before.join(",");
    control.dataset.after = divider.after.join(",");
    control.setAttribute("aria-label", "Resize panels");
    control.addEventListener("pointerdown", startCellResize);

    if (divider.orientation === "vertical") {
      control.style.left = `${(divider.x / front.width) * 100}%`;
      control.style.top = `${(divider.y / front.height) * 100}%`;
      control.style.height = `${(divider.height / front.height) * 100}%`;
    } else {
      control.style.left = `${(divider.x / front.width) * 100}%`;
      control.style.top = `${(divider.y / front.height) * 100}%`;
      control.style.width = `${(divider.width / front.width) * 100}%`;
    }

    els.frontPanel.append(control);
  }
}

function attachSlotDrop(slot) {
  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    slot.classList.add("is-drop-target");
    event.dataTransfer.dropEffect = state.dragSlotIndex !== null ? "move" : "copy";
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

    const sourceSlotValue = event.dataTransfer.getData("application/x-slot-index");
    const sourceSlotIndex = sourceSlotValue === "" ? NaN : Number(sourceSlotValue);
    if (Number.isInteger(sourceSlotIndex)) {
      swapSlots(sourceSlotIndex, slotIndex);
      state.dragPhotoId = null;
      state.dragSlotIndex = null;
      return;
    }

    const photoId = event.dataTransfer.getData("application/x-photo-id") || state.dragPhotoId;
    if (photoId) {
      assignPhotoToSlot(photoId, slotIndex);
    }
  });
}

function attachSlotDrag(slot, photo) {
  slot.draggable = false;

  slot.addEventListener("pointerdown", (event) => {
    slot.draggable = event.button === 0 && event.shiftKey;
  });

  slot.addEventListener("pointerup", () => {
    slot.draggable = false;
  });

  slot.addEventListener("pointercancel", () => {
    slot.draggable = false;
  });

  slot.addEventListener("dragstart", (event) => {
    if (!event.shiftKey) {
      event.preventDefault();
      slot.draggable = false;
      return;
    }

    const slotIndex = Number(slot.dataset.slotIndex);
    state.dragPhotoId = photo.id;
    state.dragSlotIndex = slotIndex;
    slot.classList.add("is-drag-source");
    slot.classList.remove("is-panning");
    delete slot.dataset.panStart;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-photo-id", photo.id);
    event.dataTransfer.setData("application/x-slot-index", String(slotIndex));
    event.dataTransfer.setData("text/plain", photo.id);
  });

  slot.addEventListener("dragend", () => {
    slot.draggable = false;
    slot.classList.remove("is-drag-source");
    state.dragPhotoId = null;
    state.dragSlotIndex = null;
    document.querySelectorAll(".slot.is-drop-target").forEach((target) => {
      target.classList.remove("is-drop-target");
    });
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
    if (event.button !== 0 || event.shiftKey) return;
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

function startRecursiveResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const split = findRecursiveSplit(event.currentTarget.dataset.splitId);
  if (!split) return;

  const metrics = getSheetMetrics();
  const panelRect = els.frontPanel.getBoundingClientRect();
  const front = metrics.front;
  const scale = split.orientation === "vertical"
    ? panelRect.width / front.width
    : panelRect.height / front.height;
  const usableSize = Number(event.currentTarget.dataset.usableSize) * scale;

  state.activeResize = {
    type: "recursive",
    splitId: split.id,
    orientation: split.orientation,
    startX: event.clientX,
    startY: event.clientY,
    startRatio: split.ratio,
    usableSize,
  };

  document.body.classList.add("is-resizing-recursive");
}

function updateRecursiveResize(event) {
  if (state.activeResize?.type !== "recursive") return;

  const resize = state.activeResize;
  const split = findRecursiveSplit(resize.splitId);
  if (!split) return;

  const delta = resize.orientation === "vertical"
    ? event.clientX - resize.startX
    : event.clientY - resize.startY;
  const minRatio = clamp(48 / Math.max(1, resize.usableSize), 0.05, 0.45);
  split.ratio = clamp(resize.startRatio + delta / Math.max(1, resize.usableSize), minRatio, 1 - minRatio);
  renderSheet();
}

function endRecursiveResize() {
  if (state.activeResize?.type !== "recursive") return;
  state.activeResize = null;
  document.body.classList.remove("is-resizing-recursive");
}

function startCellResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const metrics = getSheetMetrics();
  const front = metrics.front;
  const gap = mmToPreviewPx(state.gapMm);
  const margin = mmToPreviewPx(state.marginMm);
  const panelRect = els.frontPanel.getBoundingClientRect();
  const orientation = event.currentTarget.dataset.orientation;
  const scale = orientation === "vertical"
    ? panelRect.width / front.width
    : panelRect.height / front.height;
  const cells = buildCells(front.width, front.height, gap, margin);
  const before = new Set(event.currentTarget.dataset.before.split(",").map(Number));
  const after = new Set(event.currentTarget.dataset.after.split(",").map(Number));
  const beforeCells = cells.filter((cell) => before.has(cell.index));
  const afterCells = cells.filter((cell) => after.has(cell.index));

  if (!beforeCells.length || !afterCells.length) return;

  const minimumSize = 48 / Math.max(scale, 0.001);
  const minimumDelta = Math.max(...beforeCells.map((cell) => (
    orientation === "vertical"
      ? Math.min(cell.width, minimumSize) - cell.width
      : Math.min(cell.height, minimumSize) - cell.height
  )));
  const maximumDelta = Math.min(...afterCells.map((cell) => (
    orientation === "vertical"
      ? cell.width - Math.min(cell.width, minimumSize)
      : cell.height - Math.min(cell.height, minimumSize)
  )));
  const layoutKey = getManualLayoutKey();

  if (!state.manualLayouts.has(layoutKey)) {
    state.manualLayouts.set(layoutKey, normalizeCells(cells, front.width, front.height));
  }

  state.activeResize = {
    type: "cells",
    orientation,
    layoutKey,
    startX: event.clientX,
    startY: event.clientY,
    scale,
    minimumDelta,
    maximumDelta,
    before,
    after,
    baseCells: cells.map((cell) => ({ ...cell })),
    panelWidth: front.width,
    panelHeight: front.height,
  };

  document.body.classList.add("is-resizing-recursive");
}

function updateCellResize(event) {
  if (state.activeResize?.type !== "cells") return;

  const resize = state.activeResize;
  const pointerDelta = resize.orientation === "vertical"
    ? event.clientX - resize.startX
    : event.clientY - resize.startY;
  const delta = clamp(
    pointerDelta / Math.max(resize.scale, 0.001),
    resize.minimumDelta,
    resize.maximumDelta,
  );
  const cells = resize.baseCells.map((cell) => {
    const next = { ...cell };

    if (resize.before.has(cell.index)) {
      if (resize.orientation === "vertical") {
        next.width += delta;
      } else {
        next.height += delta;
      }
    }

    if (resize.after.has(cell.index)) {
      if (resize.orientation === "vertical") {
        next.x += delta;
        next.width -= delta;
      } else {
        next.y += delta;
        next.height -= delta;
      }
    }

    return next;
  });

  state.manualLayouts.set(
    resize.layoutKey,
    normalizeCells(cells, resize.panelWidth, resize.panelHeight),
  );
  renderSheet();
}

function endCellResize() {
  if (state.activeResize?.type !== "cells") return;
  state.activeResize = null;
  document.body.classList.remove("is-resizing-recursive");
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
  const previousFrontSide = getFrontSide();
  state.orientation = value;
  const frontSide = getFrontSide();
  if (previousFrontSide === "full") {
    state.frontByOrientation[value] = "full";
  } else if (value === "landscape" && (frontSide === "top" || frontSide === "bottom")) {
    state.frontByOrientation.landscape = "right";
  } else if (value === "portrait" && (frontSide === "left" || frontSide === "right")) {
    state.frontByOrientation.portrait = "bottom";
  }
  render();
}

function setFrontSide(value) {
  state.frontByOrientation[state.orientation] = value;
  render();
}

function setLayoutMode(value) {
  state.layoutMode = value;
  if (value === "recursive" && getRecursiveLeafIndex(state.activeRecursiveId) < 0) {
    state.activeRecursiveId = getFirstRecursiveLeaf(state.recursiveTree).id;
  }
  render();
}

function mixPackedLayout() {
  state.layoutMode = "pack";
  state.packSeed += 1;
  render();
}

function randomisePhotos() {
  syncSlots();
  const filledSlots = state.slots
    .map((photoId, index) => ({ photoId, index }))
    .filter((slot) => slot.photoId !== null);

  if (filledSlots.length < 2) {
    return;
  }

  const random = createRandom(Date.now() + filledSlots.length * 131);
  const shuffledPhotoIds = shuffleArray(filledSlots.map((slot) => slot.photoId), random);
  filledSlots.forEach((slot, index) => {
    state.slots[slot.index] = shuffledPhotoIds[index];
  });
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

els.mixButton.addEventListener("click", mixPackedLayout);
els.randomiseButton.addEventListener("click", randomisePhotos);
window.addEventListener("pointermove", (event) => {
  updateRecursiveResize(event);
  updateCellResize(event);
});
window.addEventListener("pointerup", () => {
  endRecursiveResize();
  endCellResize();
});
window.addEventListener("pointercancel", () => {
  endRecursiveResize();
  endCellResize();
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

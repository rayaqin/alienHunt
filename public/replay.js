const AUTOPLAY_DELAY_MS = 5;
const CELL_COLORS = {
  "#": "#6f7782",
  ".": "#1d2229",
  P: "#55aaff",
  A: "#e05252",
};
const DIRECTION_DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const MOTION_TRACKER_COLOR = "rgb(62 210 91 / 0.35)";
const SHOT_COLOR = "#ffd84d";

const setupView = document.querySelector("#setupView");
const replayView = document.querySelector("#replayView");
const replayForm = document.querySelector("#replayForm");
const huntIdInput = document.querySelector("#huntIdInput");
const loadReplayButton = document.querySelector("#loadReplayButton");
const setupMessage = document.querySelector("#setupMessage");
const replayMeta = document.querySelector("#replayMeta");
const snapshotLabel = document.querySelector("#snapshotLabel");
const canvas = document.querySelector("#replayCanvas");
const context = canvas.getContext("2d");
const previousButton = document.querySelector("#previousButton");
const pauseButton = document.querySelector("#pauseButton");
const nextButton = document.querySelector("#nextButton");
const replayButton = document.querySelector("#replayButton");
const cancelButton = document.querySelector("#cancelButton");

let snapshots = [];
let currentIndex = 0;
let autoplayTimer = null;
let isPlaying = false;

replayForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const huntId = huntIdInput.value.trim();

  if (!huntId) {
    showSetupMessage("Enter a huntId first.");
    return;
  }

  await loadReplay(huntId);
});

previousButton.addEventListener("click", () => {
  pause();
  drawSnapshot(Math.max(currentIndex - 1, 0));
});

nextButton.addEventListener("click", () => {
  pause();
  drawSnapshot(Math.min(currentIndex + 1, snapshots.length - 1));
});

pauseButton.addEventListener("click", () => {
  if (isPlaying) {
    pause();
  } else {
    play();
  }
});

replayButton.addEventListener("click", () => {
  pause();
  drawSnapshot(0);
  play();
});

cancelButton.addEventListener("click", () => {
  pause();
  snapshots = [];
  currentIndex = 0;
  setupMessage.textContent = "";
  replayView.classList.add("hidden");
  setupView.classList.remove("hidden");
  huntIdInput.focus();
});

const initialHuntId = new URLSearchParams(window.location.search).get("huntId");

if (initialHuntId) {
  huntIdInput.value = initialHuntId;
  loadReplay(initialHuntId);
}

async function loadReplay(huntId) {
  showSetupMessage("");
  setFormEnabled(false);

  try {
    const response = await fetch(
      `/snapshots?huntId=${encodeURIComponent(huntId)}`,
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();

    if (result.snapshots.length === 0) {
      showSetupMessage("No snapshots found for that hunt.");
      return;
    }

    snapshots = result.snapshots;
    currentIndex = 0;
    replayMeta.textContent = `Hunt ${result.huntId} · ${snapshots.length} snapshots`;
    setupView.classList.add("hidden");
    replayView.classList.remove("hidden");
    drawSnapshot(0);
    play();
  } catch (error) {
    showSetupMessage(`Could not load replay: ${error.message}`);
  } finally {
    setFormEnabled(true);
  }
}

function play() {
  if (snapshots.length === 0 || currentIndex >= snapshots.length - 1) {
    updateControls();
    return;
  }

  isPlaying = true;
  pauseButton.textContent = "pause";
  updateControls();
  clearTimeout(autoplayTimer);

  autoplayTimer = setTimeout(drawNextFrame, AUTOPLAY_DELAY_MS);
}

function pause() {
  isPlaying = false;
  pauseButton.textContent = "play";
  clearTimeout(autoplayTimer);
  autoplayTimer = null;
  updateControls();
}

function drawNextFrame() {
  if (!isPlaying) {
    return;
  }

  if (currentIndex >= snapshots.length - 1) {
    pause();
    return;
  }

  drawSnapshot(currentIndex + 1);
  autoplayTimer = setTimeout(drawNextFrame, AUTOPLAY_DELAY_MS);
}

function drawSnapshot(index) {
  currentIndex = index;
  const snapshot = snapshots[currentIndex];
  const grid = snapshot.grid;
  const cellSize = canvas.width / grid.length;

  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];

    for (let x = 0; x < row.length; x += 1) {
      context.fillStyle = CELL_COLORS[row[x]] ?? CELL_COLORS["."];
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  drawActionOverlay(snapshot, cellSize);
  snapshotLabel.textContent = `Snapshot ${currentIndex + 1} / ${snapshots.length} · ${snapshot.action} ${snapshot.direction} · state: ${snapshot.state}`;
  updateControls();
}

function drawActionOverlay(snapshot, cellSize) {
  if (snapshot.action === "motion-tracker") {
    drawMotionTrackerOverlay(snapshot.grid, snapshot.direction, cellSize);
    return;
  }

  if (snapshot.action === "shoot") {
    drawShotOverlay(snapshot.grid, snapshot.direction, cellSize);
  }
}

function drawMotionTrackerOverlay(grid, direction, cellSize) {
  const playerPosition = findPlayerPosition(grid);
  const delta = DIRECTION_DELTAS[direction];

  if (!playerPosition || !delta) {
    return;
  }

  context.fillStyle = MOTION_TRACKER_COLOR;

  for (
    let position = addPositions(playerPosition, delta);
    isInBounds(grid, position);
    position = addPositions(position, delta)
  ) {
    if (grid[position.y][position.x] === ".") {
      drawCell(position, cellSize);
    }
  }
}

function drawShotOverlay(grid, direction, cellSize) {
  const playerPosition = findPlayerPosition(grid);
  const delta = DIRECTION_DELTAS[direction];

  if (!playerPosition || !delta) {
    return;
  }

  context.fillStyle = SHOT_COLOR;

  for (
    let position = addPositions(playerPosition, delta);
    isInBounds(grid, position);
    position = addPositions(position, delta)
  ) {
    const cell = grid[position.y][position.x];

    if (cell === "#") {
      return;
    }

    if (cell === ".") {
      drawCell(position, cellSize);
    }
  }
}

function findPlayerPosition(grid) {
  for (let y = 0; y < grid.length; y += 1) {
    const x = grid[y].indexOf("P");

    if (x !== -1) {
      return { x, y };
    }
  }

  return null;
}

function addPositions(position, delta) {
  return {
    x: position.x + delta.x,
    y: position.y + delta.y,
  };
}

function isInBounds(grid, position) {
  return (
    position.y >= 0 &&
    position.y < grid.length &&
    position.x >= 0 &&
    position.x < grid[position.y].length
  );
}

function drawCell(position, cellSize) {
  context.fillRect(
    position.x * cellSize,
    position.y * cellSize,
    cellSize,
    cellSize,
  );
}

function updateControls() {
  const hasSnapshots = snapshots.length > 0;
  const isAtStart = currentIndex === 0;
  const isAtEnd = hasSnapshots && currentIndex === snapshots.length - 1;

  previousButton.disabled = !hasSnapshots || isAtStart;
  nextButton.disabled = !hasSnapshots || isAtEnd;
  pauseButton.disabled = !hasSnapshots || (!isPlaying && isAtEnd);
  replayButton.disabled = !hasSnapshots || isPlaying || isAtStart;
}

function showSetupMessage(message) {
  setupMessage.textContent = message;
}

function setFormEnabled(enabled) {
  huntIdInput.disabled = !enabled;
  loadReplayButton.disabled = !enabled;
  loadReplayButton.textContent = enabled ? "replay" : "preparing...";
}

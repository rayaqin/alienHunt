const BASE_URL = process.env.ALIEN_HUNT_URL ?? "http://localhost:2014";
const DIRECTIONS = ["right", "down", "left", "up"];
const DELTAS = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};

// Starts a new hunt. Params: optional difficulty. Returns: { huntId, boxes, difficulty, grid, state }.
async function startHunt(difficulty) {
  return post(
    "/start-hunt",
    difficulty === undefined ? undefined : { difficulty },
  );
}

// Checks one direction with the motion tracker. Params: huntId, direction. Returns: { detected, state }.
async function useMotionTracker(huntId, direction) {
  return post("/motion-tracker", { huntId, direction });
}

// Moves the player one step if possible. Params: huntId, direction. Returns: { playerPosition, state }.
async function movePlayer(huntId, direction) {
  return post("/move-player", { huntId, direction });
}

// Shoots in one direction. Params: huntId, direction. Returns: { hit, state }.
async function shoot(huntId, direction) {
  return post("/shoot", { huntId, direction });
}

// Finds a shortest path from A to B. Params: huntId, aX, aY, bX, bY. Returns: { path, state }.
async function getShortestRoute(huntId, aX, aY, bX, bY) {
  return get("/shortest-route", { huntId, aX, aY, bX, bY });
}

// Checks whether A can see B. Params: huntId, aX, aY, bX, bY. Returns: { lineOfSightClear, state }.
async function getLineOfSight(huntId, aX, aY, bX, bY) {
  return get("/line-of-sight", { huntId, aX, aY, bX, bY });
}

// Lists persisted hunt stats. Params: none. Returns: { stats }.
async function getStats() {
  return get("/stats");
}

// Lists grid snapshots for a hunt. Params: huntId. Returns: { huntId, snapshots }.
async function getSnapshots(huntId) {
  return get("/snapshots", { huntId });
}

async function post(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `${path} failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

async function get(path, params = {}) {
  const query = new URLSearchParams(params);
  const url =
    query.size > 0 ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${path} failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

function wait(ms = DELAY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function writeGridToConsole(grid) {
  for (const row of grid) {
    console.log(row.join(""));
  }
}

module.exports = {
  DIRECTIONS,
  DELTAS,
  getLineOfSight,
  getSnapshots,
  getShortestRoute,
  getStats,
  movePlayer,
  shoot,
  startHunt,
  useMotionTracker,
  wait,
  writeGridToConsole,
};

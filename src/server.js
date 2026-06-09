const path = require("node:path");
const express = require("express");
const {
  createStats,
  getHuntStats,
  listSnapshots,
  listStats,
  recordFinishedHunt,
  recordMotionTrackerUse,
  recordMove,
  recordShot,
  recordSnapshot,
} = require("./db");
const {
  createGridSnapshot,
  createHunt,
  getMotionTrackerResult,
  getShortestRoute,
  hasLineOfSight,
  isDirection,
  movePlayer,
  shoot,
} = require("./game");

const PORT = process.env.PORT ?? 2014;
const app = express();
const hunts = new Map();
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicPath));

app.get("/", (request, response) => {
  response.sendFile(path.join(publicPath, "index.html"));
});

app.get("/replay", (request, response) => {
  response.sendFile(path.join(publicPath, "replay.html"));
});

app.get("/hunt-history", (request, response) => {
  response.sendFile(path.join(publicPath, "hunt-history.html"));
});

app.get("/health", (request, response) => {
  response.json({ ok: true });
});

app.post("/start-hunt", (request, response) => {
  const hunt = createHunt();

  hunts.set(hunt.huntId, hunt);
  createStats(hunt.huntId, hunt.alienSearchStrategy);
  console.log(
    `Hunt started: huntId=${hunt.huntId} searchStrategy=${hunt.alienSearchStrategy}`,
  );

  response.status(201).json({
    huntId: hunt.huntId,
    boxes: hunt.boxes,
    grid: hunt.grid,
    state: hunt.state,
  });
});

app.post("/motion-tracker", (request, response) => {
  const { hunt, error } = getHuntFromBody(request.body);

  if (error) {
    return response.status(error.status).json({ error: error.message });
  }

  const directionError = validateDirection(request.body.direction);

  if (directionError) {
    return response.status(400).json({ error: directionError });
  }

  const detected =
    hunt.state === "active"
      ? getMotionTrackerResult(hunt, request.body.direction)
      : false;

  if (hunt.state === "active") {
    recordMotionTrackerUse(hunt.huntId);
    recordSnapshot(
      hunt.huntId,
      "motion-tracker",
      request.body.direction,
      hunt.state,
      createGridSnapshot(hunt),
    );
  }

  return response.json({
    detected,
    state: hunt.state,
  });
});

app.post("/move-player", (request, response) => {
  const { hunt, error } = getHuntFromBody(request.body);

  if (error) {
    return response.status(error.status).json({ error: error.message });
  }

  const directionError = validateDirection(request.body.direction);

  if (directionError) {
    return response.status(400).json({ error: directionError });
  }

  if (hunt.state !== "active") {
    return response.json({
      playerPosition: hunt.playerPosition,
      state: hunt.state,
    });
  }

  const previousState = hunt.state;
  recordMove(hunt.huntId);
  const playerPosition = movePlayer(hunt, request.body.direction);
  recordSnapshot(
    hunt.huntId,
    "move",
    request.body.direction,
    hunt.state,
    createGridSnapshot(hunt),
  );
  recordFinishedIfNeeded(hunt, previousState);

  return response.json({
    playerPosition,
    state: hunt.state,
  });
});

app.post("/shoot", (request, response) => {
  const { hunt, error } = getHuntFromBody(request.body);

  if (error) {
    return response.status(error.status).json({ error: error.message });
  }

  const directionError = validateDirection(request.body.direction);

  if (directionError) {
    return response.status(400).json({ error: directionError });
  }

  if (hunt.state !== "active") {
    return response.json({
      hit: false,
      state: hunt.state,
    });
  }

  const previousState = hunt.state;
  recordShot(hunt.huntId);
  const hit = shoot(hunt, request.body.direction);
  recordSnapshot(
    hunt.huntId,
    "shoot",
    request.body.direction,
    hunt.state,
    createGridSnapshot(hunt),
  );
  recordFinishedIfNeeded(hunt, previousState);

  return response.json({
    hit,
    state: hunt.state,
  });
});

app.get("/shortest-route", (request, response) => {
  const { hunt, error } = getHuntFromQuery(request.query);

  if (error) {
    return response.status(error.status).json({ error: error.message });
  }

  const points = parsePointQuery(request.query);

  if (points.error) {
    return response.status(400).json({ error: points.error });
  }

  return response.json({
    path: getShortestRoute(hunt, points.start, points.target),
    state: hunt.state,
  });
});

app.get("/line-of-sight", (request, response) => {
  const { hunt, error } = getHuntFromQuery(request.query);

  if (error) {
    return response.status(error.status).json({ error: error.message });
  }

  const points = parsePointQuery(request.query);

  if (points.error) {
    return response.status(400).json({ error: points.error });
  }

  return response.json({
    lineOfSightClear: hasLineOfSight(hunt, points.start, points.target),
    state: hunt.state,
  });
});

app.get("/stats", (request, response) => {
  response.json({
    stats: listStats(),
  });
});

app.get("/snapshots", (request, response) => {
  if (typeof request.query.huntId !== "string") {
    return response.status(404).json({ error: "Valid huntId is required." });
  }

  const stats = getHuntStats(request.query.huntId);

  if (!stats) {
    return response.status(404).json({ error: "Hunt not found." });
  }

  const revealAlien = stats.outcome !== null;

  return response.json({
    huntId: request.query.huntId,
    snapshots: listSnapshots(request.query.huntId, { revealAlien }),
  });
});

function getHuntFromBody(body) {
  if (!body || typeof body.huntId !== "string") {
    return { error: { status: 404, message: "Valid huntId is required." } };
  }

  return getHunt(body.huntId);
}

function getHuntFromQuery(query) {
  if (typeof query.huntId !== "string") {
    return { error: { status: 404, message: "Valid huntId is required." } };
  }

  return getHunt(query.huntId);
}

function getHunt(huntId) {
  const hunt = hunts.get(huntId);

  if (!hunt) {
    return { error: { status: 404, message: "Hunt not found." } };
  }

  return { hunt };
}

function validateDirection(direction) {
  if (!isDirection(direction)) {
    return "direction must be one of: up, down, left, right.";
  }

  return null;
}

function parsePointQuery(query) {
  const aX = parseCoordinate(query.aX, "aX");
  const aY = parseCoordinate(query.aY, "aY");
  const bX = parseCoordinate(query.bX, "bX");
  const bY = parseCoordinate(query.bY, "bY");
  const invalid = [aX, aY, bX, bY].find((value) => value.error);

  if (invalid) {
    return { error: invalid.error };
  }

  return {
    start: { x: aX.value, y: aY.value },
    target: { x: bX.value, y: bY.value },
  };
}

function parseCoordinate(value, name) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue >= 100) {
    return { error: `${name} must be an integer between 0 and 99.` };
  }

  return { value: numberValue };
}

function recordFinishedIfNeeded(hunt, previousState) {
  if (previousState === "active" && hunt.state !== "active") {
    recordFinishedHunt(hunt.huntId, hunt.state);
    console.log(`Hunt completed: huntId=${hunt.huntId} outcome=${hunt.state}`);
  }
}

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Alien hunt API listening on http://localhost:${PORT}`);
  });

  server.on("error", (error) => {
    console.error("Failed to start Alien Hunt API:", error);
    process.exit(1);
  });
}

module.exports = app;

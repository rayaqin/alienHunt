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
  isDifficulty,
  isDirection,
  movePlayer,
  shoot,
  triggerAlienMovement,
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
  const difficulty = request.body?.difficulty ?? "easy";

  if (!isDifficulty(difficulty)) {
    return response.status(400).json({
      error: "difficulty must be one of: easy, medium, hard.",
    });
  }

  const hunt = createHunt({ difficulty });

  hunts.set(hunt.huntId, hunt);
  createStats(hunt.huntId, hunt.alienSearchStrategy, hunt.difficulty);
  console.log(
    `Hunt started: huntId=${hunt.huntId} difficulty=${hunt.difficulty} searchStrategy=${hunt.alienSearchStrategy}`,
  );

  response.status(201).json({
    huntId: hunt.huntId,
    boxes: hunt.boxes,
    difficulty: hunt.difficulty,
    grid: hunt.grid,
    state: hunt.state,
  });
});

app.post("/hunt/:huntId/use-motion-tracker", (request, response) => {
  const { hunt, error } = getHuntFromParams(request.params);

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
    const previousState = hunt.state;
    recordMotionTrackerUse(hunt.huntId);
    triggerAlienMovement(hunt, getMotionTrackerAlienMoveCount(hunt));
    recordSnapshot(
      hunt.huntId,
      "use-motion-tracker",
      request.body.direction,
      hunt.state,
      createGridSnapshot(hunt),
    );
    recordFinishedIfNeeded(hunt, previousState);
  }

  return response.json({
    detected,
    state: hunt.state,
  });
});

app.post("/hunt/:huntId/move-player", (request, response) => {
  const { hunt, error } = getHuntFromParams(request.params);

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
  const playerPosition = movePlayer(hunt, request.body.direction, {
    alienMoveCount: getAlienMoveCount(hunt),
  });
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

app.post("/hunt/:huntId/shoot", (request, response) => {
  const { hunt, error } = getHuntFromParams(request.params);

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
  const hit = shoot(hunt, request.body.direction, {
    alienMoveCount: getAlienMoveCount(hunt),
  });
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

app.get("/hunt/:huntId/shortest-route", (request, response) => {
  const { hunt, error } = getHuntFromParams(request.params);

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

app.get("/hunt/:huntId/line-of-sight", (request, response) => {
  const { hunt, error } = getHuntFromParams(request.params);

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

app.get("/hunt/:huntId/snapshots", (request, response) => {
  const { huntId } = request.params;
  const stats = getHuntStats(huntId);

  if (!stats) {
    return response.status(404).json({ error: "Hunt not found." });
  }

  const revealAlien = stats.outcome !== null;

  return response.json({
    huntId,
    snapshots: listSnapshots(huntId, { revealAlien }),
  });
});

function getHuntFromParams(params) {
  if (typeof params.huntId !== "string") {
    return { error: { status: 404, message: "Valid huntId is required." } };
  }

  return getHunt(params.huntId);
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

function getAlienMoveCount(hunt) {
  return hunt.difficulty === "hard" ? 2 : 1;
}

function getMotionTrackerAlienMoveCount(hunt) {
  if (hunt.difficulty === "easy") {
    return 0;
  }

  return getAlienMoveCount(hunt);
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

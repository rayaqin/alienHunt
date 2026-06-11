const { randomUUID } = require("node:crypto");

const GRID_SIZE = 100;
const PLAYER_START = { x: 50, y: 50 };
const DEFAULT_BOX_COUNT = 500;
const ALIEN_MOVE_VICTORY_THRESHOLD = 10000;
const SWEEP_LINE_STEP = 2;
const DIRECTIONS = ["up", "down", "left", "right"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const SEARCH_STRATEGIES = [
  "corner-search",
  "horizontal-sweep",
  "vertical-sweep",
];
const CORNER_SEARCH_CORNERS = [
  { x: 0, y: 0 },
  { x: GRID_SIZE - 1, y: 0 },
  { x: GRID_SIZE - 1, y: GRID_SIZE - 1 },
  { x: 0, y: GRID_SIZE - 1 },
];
const RESERVED_BOX_POSITIONS = [PLAYER_START, ...CORNER_SEARCH_CORNERS];

const DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function isDirection(value) {
  return DIRECTIONS.includes(value);
}

function isDifficulty(value) {
  return DIFFICULTIES.includes(value);
}

function createHunt(options = {}) {
  const boxCount = options.boxCount ?? DEFAULT_BOX_COUNT;
  const difficulty = options.difficulty ?? "easy";
  const boxes = generateBoxes(boxCount);
  const boxSet = toPositionSet(boxes);
  const alienPosition = getRandomOpenPosition(boxSet);
  const alienSearchStrategy = getRandomSearchStrategy();
  const grid = createGridMatrix(boxSet, PLAYER_START);

  return {
    huntId: randomUUID(),
    boxes,
    grid,
    boxSet,
    playerPosition: { ...PLAYER_START },
    alienPosition,
    alienTarget: { ...PLAYER_START },
    alienMoves: 0,
    difficulty,
    alienSearchStrategy,
    alienSearchTarget: null,
    alienCornerSearchNextCornerIndex: 0,
    alienCornerSearchReturningToCenter: false,
    alienSweepLineIndex: 0,
    alienSweepForward: true,
    alienSweepTargetPhase: "line-start",
    state: "active",
  };
}

function getMotionTrackerResult(hunt, direction) {
  const { playerPosition, alienPosition } = hunt;

  if (direction === "up") {
    return (
      alienPosition.x === playerPosition.x && alienPosition.y < playerPosition.y
    );
  }

  if (direction === "down") {
    return (
      alienPosition.x === playerPosition.x && alienPosition.y > playerPosition.y
    );
  }

  if (direction === "left") {
    return (
      alienPosition.y === playerPosition.y && alienPosition.x < playerPosition.x
    );
  }

  return (
    alienPosition.y === playerPosition.y && alienPosition.x > playerPosition.x
  );
}

function movePlayer(hunt, direction, options = {}) {
  if (hunt.state !== "active") {
    return hunt.playerPosition;
  }

  const attemptedPosition = getNextPosition(hunt.playerPosition, direction);

  if (isAvailable(attemptedPosition, hunt.boxSet)) {
    hunt.playerPosition = attemptedPosition;
  }

  if (samePosition(hunt.playerPosition, hunt.alienPosition)) {
    endHunt(hunt, "death");
    return hunt.playerPosition;
  }

  triggerAlienMovement(hunt, options.alienMoveCount ?? 1);

  return hunt.playerPosition;
}

function shoot(hunt, direction, options = {}) {
  if (hunt.state !== "active") {
    return false;
  }

  const hit = isAlienInShotLine(hunt, direction);

  if (hit) {
    endHunt(hunt, "victory");
    return true;
  }

  hunt.alienTarget = { ...hunt.playerPosition };
  triggerAlienMovement(hunt, options.alienMoveCount ?? 1);

  return false;
}

function getShortestRoute(hunt, start, target, allowUnavailableTarget = false) {
  if (
    !isAvailable(start, hunt.boxSet) ||
    (!allowUnavailableTarget && !isAvailable(target, hunt.boxSet))
  ) {
    return [];
  }

  if (samePosition(start, target)) {
    return [];
  }

  const startKey = toKey(start);
  const targetKey = toKey(target);
  const queue = [start];
  const visited = new Set([startKey]);
  const previous = new Map();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    for (const direction of DIRECTIONS) {
      const next = getNextPosition(current, direction);
      const nextKey = toKey(next);

      if (!isAvailable(next, hunt.boxSet) || visited.has(nextKey)) {
        continue;
      }

      visited.add(nextKey);
      previous.set(nextKey, { previousKey: toKey(current), direction });

      if (nextKey === targetKey) {
        return reconstructRoute(previous, startKey, targetKey);
      }

      queue.push(next);
    }
  }

  return [];
}

function hasLineOfSight(hunt, start, target) {
  if (!isInBounds(start) || !isInBounds(target)) {
    return false;
  }

  if (start.x !== target.x && start.y !== target.y) {
    return false;
  }

  const direction = getDirectionBetweenAlignedPositions(start, target);

  if (!direction) {
    return true;
  }

  let current = getNextPosition(start, direction);

  while (!samePosition(current, target)) {
    if (hunt.boxSet.has(toKey(current))) {
      return false;
    }

    current = getNextPosition(current, direction);
  }

  return true;
}

function createGridSnapshot(hunt) {
  return createGridMatrix(hunt.boxSet, hunt.playerPosition, hunt.alienPosition);
}

function endHunt(hunt, state) {
  hunt.state = state;
  hunt.alienTarget = null;
}

function moveAlien(hunt) {
  hunt.alienMoves += 1;

  if (hasLineOfSight(hunt, hunt.alienPosition, hunt.playerPosition)) {
    hunt.alienTarget = { ...hunt.playerPosition };
    moveAlienToward(hunt, hunt.playerPosition);
    return;
  }

  if (hunt.alienTarget) {
    moveAlienToward(hunt, hunt.alienTarget);

    if (samePosition(hunt.alienPosition, hunt.alienTarget)) {
      hunt.alienTarget = null;
    }

    return;
  }

  searchForPlayer(hunt);
}

function triggerAlienMovement(hunt, moveCount = 1) {
  for (
    let index = 0;
    index < moveCount && hunt.state === "active";
    index += 1
  ) {
    moveAlien(hunt);

    if (samePosition(hunt.playerPosition, hunt.alienPosition)) {
      endHunt(hunt, "death");
    } else {
      endHuntIfAlienMoveLimitReached(hunt);
    }
  }
}

function endHuntIfAlienMoveLimitReached(hunt) {
  if (
    hunt.state === "active" &&
    hunt.alienMoves >= ALIEN_MOVE_VICTORY_THRESHOLD
  ) {
    endHunt(hunt, "victory");
  }
}

function moveAlienToward(hunt, target) {
  const route = getShortestRoute(hunt, hunt.alienPosition, target);

  if (route.length === 0) {
    return;
  }

  moveAlienOneStep(hunt, route[0]);
}

function moveAlienRandomly(hunt) {
  const availableDirections = DIRECTIONS.filter((direction) =>
    isAvailable(getNextPosition(hunt.alienPosition, direction), hunt.boxSet),
  );

  if (availableDirections.length === 0) {
    return;
  }

  const direction =
    availableDirections[Math.floor(Math.random() * availableDirections.length)];
  moveAlienOneStep(hunt, direction);
}

function moveAlienOneStep(hunt, direction) {
  hunt.alienPosition = getNextPosition(hunt.alienPosition, direction);

  if (hasLineOfSight(hunt, hunt.alienPosition, hunt.playerPosition)) {
    hunt.alienTarget = { ...hunt.playerPosition };
  }
}

function searchForPlayer(hunt) {
  if (hunt.alienSearchStrategy === "corner-search") {
    moveAlienWithCornerSearch(hunt);
    return;
  }

  if (hunt.alienSearchStrategy === "horizontal-sweep") {
    moveAlienWithSweep(hunt, "horizontal");
    return;
  }

  if (hunt.alienSearchStrategy === "vertical-sweep") {
    moveAlienWithSweep(hunt, "vertical");
    return;
  }

  moveAlienRandomly(hunt);
}

function moveAlienWithCornerSearch(hunt) {
  if (
    !hunt.alienSearchTarget ||
    samePosition(hunt.alienPosition, hunt.alienSearchTarget)
  ) {
    hunt.alienSearchTarget = getNextCornerSearchTarget(hunt);
  }

  const route = getShortestRoute(
    hunt,
    hunt.alienPosition,
    hunt.alienSearchTarget,
  );

  if (route.length === 0) {
    moveAlienRandomly(hunt);
    return;
  }

  moveAlienOneStep(hunt, route[0]);
}

function getNextCornerSearchTarget(hunt) {
  if (hunt.alienCornerSearchReturningToCenter) {
    hunt.alienCornerSearchReturningToCenter = false;
    return { ...PLAYER_START };
  }

  const target = CORNER_SEARCH_CORNERS[hunt.alienCornerSearchNextCornerIndex];
  hunt.alienCornerSearchNextCornerIndex =
    (hunt.alienCornerSearchNextCornerIndex + 1) % CORNER_SEARCH_CORNERS.length;
  hunt.alienCornerSearchReturningToCenter = true;

  return { ...target };
}

function moveAlienWithSweep(hunt, orientation) {
  if (!ensureSweepTarget(hunt, orientation)) {
    moveAlienRandomly(hunt);
    return;
  }

  const route = getShortestRoute(
    hunt,
    hunt.alienPosition,
    hunt.alienSearchTarget,
  );

  if (route.length > 0) {
    moveAlienOneStep(hunt, route[0]);
    return;
  }

  moveAlienRandomly(hunt);
}

function ensureSweepTarget(hunt, orientation) {
  for (let attempts = 0; attempts < GRID_SIZE * 2; attempts += 1) {
    if (
      hunt.alienSearchTarget &&
      !samePosition(hunt.alienPosition, hunt.alienSearchTarget)
    ) {
      return true;
    }

    hunt.alienSearchTarget = getNextSweepTarget(hunt, orientation);
  }

  return false;
}

function getNextSweepTarget(hunt, orientation) {
  if (hunt.alienSweepLineIndex >= GRID_SIZE) {
    hunt.alienSweepLineIndex = 0;
    hunt.alienSweepForward = true;
    hunt.alienSweepTargetPhase = "line-start";
  }

  while (hunt.alienSweepLineIndex < GRID_SIZE) {
    const target = getSweepTargetForCurrentLine(hunt, orientation);

    if (target) {
      return target;
    }

    advanceSweepLine(hunt);
  }

  return null;
}

function getSweepTargetForCurrentLine(hunt, orientation) {
  const isLineStart = hunt.alienSweepTargetPhase === "line-start";
  const side = isLineStart === hunt.alienSweepForward ? "low" : "high";
  const target = getSweepLineEndpoint(
    hunt,
    orientation,
    hunt.alienSweepLineIndex,
    side,
  );

  if (hunt.alienSweepTargetPhase === "line-start") {
    hunt.alienSweepTargetPhase = "line-end";
  } else {
    advanceSweepLine(hunt);
  }

  return target;
}

function advanceSweepLine(hunt) {
  hunt.alienSweepLineIndex += SWEEP_LINE_STEP;
  hunt.alienSweepForward = !hunt.alienSweepForward;
  hunt.alienSweepTargetPhase = "line-start";
}

function getSweepLineEndpoint(hunt, orientation, lineIndex, side) {
  for (let offset = 0; offset < GRID_SIZE; offset += 1) {
    const crossAxis = side === "low" ? offset : GRID_SIZE - 1 - offset;
    const position =
      orientation === "horizontal"
        ? { x: crossAxis, y: lineIndex }
        : { x: lineIndex, y: crossAxis };

    if (isAvailable(position, hunt.boxSet)) {
      return position;
    }
  }

  return null;
}

function isAlienInShotLine(hunt, direction) {
  const { playerPosition, alienPosition } = hunt;

  if (
    direction === "up" &&
    alienPosition.x === playerPosition.x &&
    alienPosition.y < playerPosition.y
  ) {
    return hasLineOfSight(hunt, playerPosition, alienPosition);
  }

  if (
    direction === "down" &&
    alienPosition.x === playerPosition.x &&
    alienPosition.y > playerPosition.y
  ) {
    return hasLineOfSight(hunt, playerPosition, alienPosition);
  }

  if (
    direction === "left" &&
    alienPosition.y === playerPosition.y &&
    alienPosition.x < playerPosition.x
  ) {
    return hasLineOfSight(hunt, playerPosition, alienPosition);
  }

  if (
    direction === "right" &&
    alienPosition.y === playerPosition.y &&
    alienPosition.x > playerPosition.x
  ) {
    return hasLineOfSight(hunt, playerPosition, alienPosition);
  }

  return false;
}

function generateBoxes(targetCount) {
  const boxes = [];
  const boxSet = new Set();
  const maxAttempts = targetCount * 100;

  for (
    let attempts = 0;
    boxes.length < targetCount && attempts < maxAttempts;
    attempts += 1
  ) {
    const candidate = getRandomPosition();
    const candidateKey = toKey(candidate);

    if (
      RESERVED_BOX_POSITIONS.some((position) =>
        samePosition(candidate, position),
      ) ||
      boxSet.has(candidateKey)
    ) {
      continue;
    }

    boxSet.add(candidateKey);

    if (isGridConnected(boxSet)) {
      boxes.push(candidate);
    } else {
      boxSet.delete(candidateKey);
    }
  }

  return boxes;
}

function createGridMatrix(boxSet, playerPosition, alienPosition = null) {
  return Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => {
      const position = { x, y };

      if (boxSet.has(toKey(position))) {
        return "#";
      }

      if (alienPosition && samePosition(position, alienPosition)) {
        return "A";
      }

      if (samePosition(position, playerPosition)) {
        return "P";
      }

      return ".";
    }),
  );
}

function isGridConnected(boxSet) {
  const totalOpenCells = GRID_SIZE * GRID_SIZE - boxSet.size;
  const startKey = toKey(PLAYER_START);

  if (boxSet.has(startKey)) {
    return false;
  }

  const queue = [PLAYER_START];
  const visited = new Set([startKey]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    for (const direction of DIRECTIONS) {
      const next = getNextPosition(current, direction);
      const nextKey = toKey(next);

      if (!isAvailable(next, boxSet) || visited.has(nextKey)) {
        continue;
      }

      visited.add(nextKey);
      queue.push(next);
    }
  }

  return visited.size === totalOpenCells;
}

function getRandomOpenPosition(boxSet) {
  while (true) {
    const position = getRandomPosition();

    if (
      isAvailable(position, boxSet) &&
      getDistance(position, PLAYER_START) >= 2
    ) {
      return position;
    }
  }
}

function getRandomPosition() {
  return {
    x: Math.floor(Math.random() * GRID_SIZE),
    y: Math.floor(Math.random() * GRID_SIZE),
  };
}

function getRandomSearchStrategy() {
  return getRandomItem(SEARCH_STRATEGIES);
}

function getInitialSearchDirection(searchStrategy) {
  if (searchStrategy === "horizontal-sweep") {
    return getRandomItem(["left", "right"]);
  }

  if (searchStrategy === "vertical-sweep") {
    return getRandomItem(["up", "down"]);
  }

  return null;
}

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getNextPosition(position, direction) {
  const delta = DELTAS[direction];

  return {
    x: position.x + delta.x,
    y: position.y + delta.y,
  };
}

function getDirectionBetweenAlignedPositions(start, target) {
  if (start.x === target.x && start.y > target.y) {
    return "up";
  }

  if (start.x === target.x && start.y < target.y) {
    return "down";
  }

  if (start.y === target.y && start.x > target.x) {
    return "left";
  }

  if (start.y === target.y && start.x < target.x) {
    return "right";
  }

  return null;
}

function reconstructRoute(previous, startKey, targetKey) {
  const route = [];
  let currentKey = targetKey;

  while (currentKey !== startKey) {
    const step = previous.get(currentKey);

    if (!step) {
      return [];
    }

    route.unshift(step.direction);
    currentKey = step.previousKey;
  }

  return route;
}

function isAvailable(position, boxSet) {
  return isInBounds(position) && !boxSet.has(toKey(position));
}

function isInBounds(position) {
  return (
    position.x >= 0 &&
    position.x < GRID_SIZE &&
    position.y >= 0 &&
    position.y < GRID_SIZE
  );
}

function samePosition(a, b) {
  return a.x === b.x && a.y === b.y;
}

function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function toPositionSet(positions) {
  return new Set(positions.map(toKey));
}

function toKey(position) {
  return `${position.x},${position.y}`;
}

module.exports = {
  createHunt,
  createGridSnapshot,
  getMotionTrackerResult,
  getShortestRoute,
  hasLineOfSight,
  isDifficulty,
  isDirection,
  movePlayer,
  shoot,
  triggerAlienMovement,
};

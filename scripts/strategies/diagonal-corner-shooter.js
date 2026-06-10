const {
  shoot,
  startHunt,
  useMotionTracker,
  movePlayer,
  getShortestRoute,
} = require("../alien-hunt-client");

const PLAYER_START = { x: 50, y: 50 };
const MIN_OPEN_BLOCKS_PER_DIRECTION = 6;

async function main() {
  const hunt = await startHunt("hard");
  const { huntId } = hunt;

  console.log(`Started hunt ${huntId}`);
  console.log(`Received info on ${hunt.boxes.length} boxes`);

  let step = 0;
  let state = hunt.state;
  const logWithStep = (message) => {
    step++;
    console.log(`Step ${step}: ${message}`);
  };

  const diagonalCornerPair = findDiagonalCornerPair(hunt.grid);

  if (!diagonalCornerPair) {
    console.log("No usable diagonal corner pair found.");
    return;
  }

  console.log(
    `Diagonal corner: (${diagonalCornerPair.firstCorner.x}, ${diagonalCornerPair.firstCorner.y}), directions: ${diagonalCornerPair.firstCorner.openDirections.join(", ")}, pair score: ${diagonalCornerPair.score}`,
  );

  state = await moveToPositionWithTrackerChecks(
    huntId,
    { ...PLAYER_START },
    diagonalCornerPair.firstCorner,
    state,
    logWithStep,
  );

  while (state === "active") {
    const trackerResult = await checkCornerDirectionsAndShoot(
      huntId,
      diagonalCornerPair.firstCorner.openDirections,
      state,
      logWithStep,
    );
    state = trackerResult.state;
  }

  console.log("Hunt ended with: ", state);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});

const findDiagonalCornerPair = (grid) => {
  const isAvailable = (x, y) => grid[y]?.[x] === "." || grid[y]?.[x] === "P";
  const isBox = (x, y) => grid[y]?.[x] === "#";
  const countAvailableBlocks = (x, y, direction) => {
    const { x: dx, y: dy } = DELTAS[direction];
    let count = 0;
    let currentX = x + dx;
    let currentY = y + dy;

    while (isAvailable(currentX, currentY)) {
      count++;
      currentX += dx;
      currentY += dy;
    }

    return count;
  };
  const createCorner = (x, y, openDirections) => {
    const openCounts = openDirections.map((direction) =>
      countAvailableBlocks(x, y, direction),
    );

    return {
      x,
      y,
      openDirections,
      minOpenBlocks: Math.min(...openCounts),
      totalOpenBlocks: openCounts.reduce((sum, count) => sum + count, 0),
    };
  };

  let bestPair = null;

  for (let y = 0; y < grid.length - 1; y++) {
    for (let x = 0; x < grid[y].length - 1; x++) {
      const candidates = [];

      if (
        isAvailable(x, y) &&
        isBox(x + 1, y) &&
        isBox(x, y + 1) &&
        isAvailable(x + 1, y + 1)
      ) {
        candidates.push({
          firstCorner: createCorner(x, y, ["up", "left"]),
          secondCorner: createCorner(x + 1, y + 1, ["right", "down"]),
        });
      }

      if (
        isBox(x, y) &&
        isAvailable(x + 1, y) &&
        isAvailable(x, y + 1) &&
        isBox(x + 1, y + 1)
      ) {
        candidates.push({
          firstCorner: createCorner(x + 1, y, ["up", "right"]),
          secondCorner: createCorner(x, y + 1, ["left", "down"]),
        });
      }

      for (const candidate of candidates) {
        const minOpenBlocks = Math.min(
          candidate.firstCorner.minOpenBlocks,
          candidate.secondCorner.minOpenBlocks,
        );

        if (minOpenBlocks < MIN_OPEN_BLOCKS_PER_DIRECTION) {
          continue;
        }

        const score =
          candidate.firstCorner.totalOpenBlocks +
          candidate.secondCorner.totalOpenBlocks;

        if (!bestPair || score > bestPair.score) {
          bestPair = {
            ...candidate,
            score,
          };
        }
      }
    }
  }

  return bestPair;
};

const moveToPositionWithTrackerChecks = async (
  huntId,
  playerPosition,
  targetPosition,
  state,
  logWithStep,
) => {
  const pathToTargetPosition = await getShortestRoute(
    huntId,
    playerPosition.x,
    playerPosition.y,
    targetPosition.x,
    targetPosition.y,
  ).then((result) => result.path);

  console.log(
    "Path to target position:",
    pathToTargetPosition,
    " start moving there carefully...",
  );

  let lastMoveDirection = undefined;
  let sameDirectionMoves = 0;

  while (state === "active" && !isSameBlock(playerPosition, targetPosition)) {
    const direction = pathToTargetPosition.shift();
    if (!direction) {
      console.log("No direction to move to. The path is empty.");
      break;
    }

    const result = await movePlayer(huntId, direction);
    state = result.state;
    playerPosition.x = result.playerPosition.x;
    playerPosition.y = result.playerPosition.y;
    logWithStep(`moved ${direction}; state is ${state}`);

    if (direction === lastMoveDirection) {
      sameDirectionMoves++;
    } else {
      lastMoveDirection = direction;
      sameDirectionMoves = 1;
    }

    const shouldCheckBackwards = sameDirectionMoves % 2 === 0;
    const shouldCheckForward = sameDirectionMoves % 6 === 0;

    if (state !== "active" || (!shouldCheckBackwards && !shouldCheckForward)) {
      continue;
    }

    if (shouldCheckBackwards) {
      const backwardsDirection = getOppositeDirection(direction);
      const trackerBehindPlayerResult = await useMotionTracker(
        huntId,
        backwardsDirection,
      );
      state = trackerBehindPlayerResult.state;
      logWithStep(
        `used motion tracker ${backwardsDirection}; detected ${trackerBehindPlayerResult.detected}; state is ${state}`,
      );

      if (state === "active" && trackerBehindPlayerResult.detected) {
        const shootResult = await shoot(huntId, backwardsDirection);
        state = shootResult.state;
        logWithStep(
          `shot ${backwardsDirection}; hit ${shootResult.hit}; state is ${state}`,
        );
      }
    }

    if (state !== "active" || !shouldCheckForward) {
      continue;
    }

    const trackerInFrontOfPlayerResult = await useMotionTracker(
      huntId,
      direction,
    );
    state = trackerInFrontOfPlayerResult.state;
    logWithStep(
      `used motion tracker ${direction}; detected ${trackerInFrontOfPlayerResult.detected}; state is ${state}`,
    );

    if (state === "active" && trackerInFrontOfPlayerResult.detected) {
      const shootResult = await shoot(huntId, direction);
      state = shootResult.state;
      logWithStep(
        `shot ${direction}; hit ${shootResult.hit}; state is ${state}`,
      );
    }
  }

  return state;
};

const checkCornerDirectionsAndShoot = async (
  huntId,
  directions,
  state,
  logWithStep,
) => {
  for (const direction of directions) {
    if (state !== "active") {
      break;
    }

    const trackerResult = await useMotionTracker(huntId, direction);
    state = trackerResult.state;
    logWithStep(
      `used motion tracker ${direction}; detected ${trackerResult.detected}; state is ${state}`,
    );

    if (state === "active" && trackerResult.detected) {
      const shootResult = await shoot(huntId, direction);
      state = shootResult.state;
      logWithStep(
        `shot ${direction}; hit ${shootResult.hit}; state is ${state}`,
      );
    }
  }

  return { state };
};

const DELTAS = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};

const isSameBlock = (a, b) => a.x === b.x && a.y === b.y;

const getOppositeDirection = (direction) => {
  if (direction === "up") {
    return "down";
  }
  if (direction === "down") {
    return "up";
  }
  if (direction === "left") {
    return "right";
  }
  return "left";
};

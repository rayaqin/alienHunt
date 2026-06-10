const {
  DIRECTIONS,
  DELTAS,
  shoot,
  startHunt,
  useMotionTracker,
  movePlayer,
  getShortestRoute,
} = require("../../alien-hunt-client");

async function main() {
  const difficulty = "hard";
  const hunt = await startHunt(difficulty);
  const { huntId } = hunt;

  console.log(`Started hunt ${huntId}`);
  console.log(`Received info on ${hunt.boxes.length} boxes`);

  let step = 0;
  let state = hunt.state;
  const logWithStep = (message) => {
    step++;
    console.log(`Step ${step}: ${message}`);
  };

  const hidingPlaceResult = findHidingPlace(hunt);

  if (!hidingPlaceResult) {
    await shootingStratFallback(hunt);
    return;
  }

  const { hidingPlace, freeBlocksDirection, lurePosition } = hidingPlaceResult;
  const playerPosition = { x: 50, y: 50 };

  console.log("Hiding place: x: " + hidingPlace.x + " y: " + hidingPlace.y);
  console.log("Free blocks direction:", freeBlocksDirection);
  console.log("Lure position: x: " + lurePosition.x + " y: " + lurePosition.y);

  state = await moveToPositionWithTrackerChecks(
    huntId,
    playerPosition,
    lurePosition,
    state,
    logWithStep,
  );

  if (state !== "active") {
    return;
  }

  playerPosition.x = lurePosition.x;
  playerPosition.y = lurePosition.y;

  const hidingPlaceDirectionFromLurePosition =
    getOppositeDirection(freeBlocksDirection);

  const shootResult = await shoot(huntId, hidingPlaceDirectionFromLurePosition);
  state = shootResult.state;
  logWithStep(
    `shot ${hidingPlaceDirectionFromLurePosition}, towards the hiding place; hit ${shootResult.hit}; state is ${state}`,
  );
  if (state !== "active") {
    return;
  }

  state = await moveToPositionWithTrackerChecks(
    huntId,
    playerPosition,
    hidingPlace,
    state,
    logWithStep,
  );

  if (state !== "active") {
    return;
  }

  console.log(
    "moved to hiding place, waiting for alien to reach lure position",
  );

  while (state === "active") {
    const trackerToLurePositionResult = await useMotionTracker(
      huntId,
      freeBlocksDirection,
    );
    state = trackerToLurePositionResult.state;
    logWithStep(
      `used motion tracker ${freeBlocksDirection}; detected ${trackerToLurePositionResult.detected}; state is ${state}`,
    );

    if (state === "active" && trackerToLurePositionResult.detected) {
      const shootResult = await shoot(huntId, freeBlocksDirection);
      state = shootResult.state;
      logWithStep(
        `shot ${freeBlocksDirection}; hit ${shootResult.hit}; state is ${state}`,
      );
    }

    if (difficulty === "easy") {
      await movePlayer(huntId, getOppositeDirection(freeBlocksDirection));
    }
  }

  console.log("Hunt ended with: ", state);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});

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

    if (state !== "active" || sameDirectionMoves < 4) {
      continue;
    }

    sameDirectionMoves = 0;

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

const findHidingPlace = (hunt) => {
  const { grid } = hunt;

  const isAvailable = (x, y) => grid[y]?.[x] === "." || grid[y]?.[x] === "P";
  const countFreeBlocks = (x, y, direction) => {
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
  const getFurthestFreeBlockButAtMost12 = (x, y, direction, count) => {
    const { x: dx, y: dy } = DELTAS[direction];
    return {
      x: x + dx * Math.min(count, 12),
      y: y + dy * Math.min(count, 12),
    };
  };

  let bestHidingPlace = null;
  let bestAvailableNeighbours = Infinity;
  let bestFreeBlocksCount = 0;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (!isAvailable(x, y)) {
        continue;
      }

      const freeBlocksByDirection = DIRECTIONS.map((direction) => ({
        direction,
        count: Math.min(countFreeBlocks(x, y, direction), 12),
      }));
      const availableNeighbours = freeBlocksByDirection.filter(
        ({ count }) => count > 0,
      ).length;

      if (availableNeighbours < 1 || availableNeighbours > 2) {
        continue;
      }

      const { direction: freeBlocksDirection, count: freeBlocksCount } =
        freeBlocksByDirection.reduce((best, current) =>
          current.count > best.count ? current : best,
        );

      if (freeBlocksCount < 2) {
        continue;
      }

      const hasFewerNeighbours = availableNeighbours < bestAvailableNeighbours;
      const hasLongerLine =
        availableNeighbours === bestAvailableNeighbours &&
        freeBlocksCount > bestFreeBlocksCount;

      if (hasFewerNeighbours || hasLongerLine) {
        bestHidingPlace = {
          hidingPlace: { x, y },
          freeBlocksDirection,
          lurePosition: getFurthestFreeBlockButAtMost12(
            x,
            y,
            freeBlocksDirection,
            freeBlocksCount,
          ),
        };
        bestAvailableNeighbours = availableNeighbours;
        bestFreeBlocksCount = freeBlocksCount;
      }
    }
  }

  return bestHidingPlace;
};

const shootingStratFallback = async (hunt) => {
  // shoot around the clock
  while (hunt.state === "active") {
    for (const direction of DIRECTIONS) {
      const result = await shoot(hunt.huntId, direction);
      if (result.hit) {
        return direction;
      }
    }
  }
  return null;
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

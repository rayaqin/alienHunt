const {
  shoot,
  startHunt,
  useMotionTracker,
  movePlayer,
  getShortestRoute,
} = require("../alien-hunt-client");

const CLOCKWISE_DIRECTIONS = ["up", "right", "down", "left"];
const PLAYER_START = { x: 50, y: 50 };

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

  const crossCenter = findLargestOpenCrossCenter(hunt.grid);
  console.log(
    `Largest open cross center: x: ${crossCenter.x} y: ${crossCenter.y}; horizontal: ${crossCenter.horizontalLength}; vertical: ${crossCenter.verticalLength}; average: ${crossCenter.averageLength}`,
  );

  state = await moveToPositionWithTrackerChecks(
    huntId,
    { ...PLAYER_START },
    crossCenter,
    state,
    logWithStep,
  );

  let shotStep = 0;
  while (state === "active") {
    const direction =
      CLOCKWISE_DIRECTIONS[shotStep % CLOCKWISE_DIRECTIONS.length];
    const result = await shoot(huntId, direction);
    state = result.state;
    shotStep++;

    logWithStep(`shot ${direction}; hit ${result.hit}; state is ${state}`);
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

const findLargestOpenCrossCenter = (grid) => {
  const minArmLength = 6;
  const isAvailable = (x, y) => grid[y]?.[x] === "." || grid[y]?.[x] === "P";
  const countAvailableBlocks = (x, y, dx, dy) => {
    let count = 0;
    let currentX = x;
    let currentY = y;

    while (isAvailable(currentX, currentY)) {
      count++;
      currentX += dx;
      currentY += dy;
    }

    return count;
  };
  const getLineLengths = (x, y) => {
    const leftArmLength = countAvailableBlocks(x - 1, y, -1, 0);
    const rightArmLength = countAvailableBlocks(x + 1, y, 1, 0);
    const upArmLength = countAvailableBlocks(x, y - 1, 0, -1);
    const downArmLength = countAvailableBlocks(x, y + 1, 0, 1);
    const horizontalLength = leftArmLength + 1 + rightArmLength;
    const verticalLength = upArmLength + 1 + downArmLength;

    return {
      horizontalLength,
      verticalLength,
      leftArmLength,
      rightArmLength,
      upArmLength,
      downArmLength,
    };
  };
  const hasLongEnoughArms = ({
    leftArmLength,
    rightArmLength,
    upArmLength,
    downArmLength,
  }) => {
    return (
      leftArmLength >= minArmLength &&
      rightArmLength >= minArmLength &&
      upArmLength >= minArmLength &&
      downArmLength >= minArmLength
    );
  };
  const getDistanceFromPlayerStart = (x, y) =>
    Math.abs(PLAYER_START.x - x) + Math.abs(PLAYER_START.y - y);

  let bestCrossCenter = null;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (!isAvailable(x, y)) {
        continue;
      }

      const lineLengths = getLineLengths(x, y);
      if (!hasLongEnoughArms(lineLengths)) {
        continue;
      }

      const { horizontalLength, verticalLength } = lineLengths;
      const averageLength = (horizontalLength + verticalLength) / 2;
      const smallerLineLength = Math.min(horizontalLength, verticalLength);
      const distanceFromPlayerStart = getDistanceFromPlayerStart(x, y);

      if (
        !bestCrossCenter ||
        averageLength > bestCrossCenter.averageLength ||
        (averageLength === bestCrossCenter.averageLength &&
          smallerLineLength > bestCrossCenter.smallerLineLength) ||
        (averageLength === bestCrossCenter.averageLength &&
          smallerLineLength === bestCrossCenter.smallerLineLength &&
          distanceFromPlayerStart < bestCrossCenter.distanceFromPlayerStart)
      ) {
        bestCrossCenter = {
          x,
          y,
          horizontalLength,
          verticalLength,
          averageLength,
          smallerLineLength,
          distanceFromPlayerStart,
        };
      }
    }
  }

  return bestCrossCenter;
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

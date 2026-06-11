const {
  DELTAS,
  shoot,
  startHunt,
  useMotionTracker,
  movePlayer,
} = require("../alien-hunt-client");

const PLAYER_START = { x: 50, y: 50 };
const ESCAPE_DISTANCE = 10;
const CROSS_MIN_DISTANCE = 10;
const CROSS_MAX_DISTANCE = 14;
const CROSS_ARM_LENGTH = 10;
const TRACK_AFTER_STEPS = 2;
const FLANK_TRACK_INTERVAL = 4;
const ESCAPE_DIRECTIONS = ["up", "right", "down", "left"];

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

  const escapeCorridor = findEscapeCorridor(hunt.grid);

  if (!escapeCorridor) {
    console.log("No open escape corridor found; falling back to shooting.");
    await shootAroundTheClock(huntId, state, logWithStep);
    return;
  }

  console.log(
    `Escape corridor: ${escapeCorridor.direction}; reason: ${escapeCorridor.reason}; distance: ${escapeCorridor.distance}; nearby boxes: ${escapeCorridor.boxCount}`,
  );

  state = await moveIntoEscapeCorridor(
    huntId,
    escapeCorridor.direction,
    escapeCorridor.distance,
    state,
    logWithStep,
  );

  state = await trackAllDirectionsAndShoot(huntId, state, logWithStep);

  console.log("Hunt ended with: ", state);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});

const findEscapeCorridor = (grid) => {
  const isAvailable = (x, y) => grid[y]?.[x] === "." || grid[y]?.[x] === "P";
  const isBox = (x, y) => grid[y]?.[x] === "#";

  const canMoveStraightIntoCorridor = (direction, distance) => {
    const { x: dx, y: dy } = DELTAS[direction];

    for (let step = 1; step <= distance; step++) {
      if (
        !isAvailable(PLAYER_START.x + dx * step, PLAYER_START.y + dy * step)
      ) {
        return false;
      }
    }

    return true;
  };

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

  const hasOpenCross = (x, y) => {
    return ESCAPE_DIRECTIONS.every(
      (direction) => countAvailableBlocks(x, y, direction) >= CROSS_ARM_LENGTH,
    );
  };

  const findOpenCrossCorridor = () => {
    for (const direction of ESCAPE_DIRECTIONS) {
      const { x: dx, y: dy } = DELTAS[direction];

      for (
        let distance = CROSS_MIN_DISTANCE;
        distance <= CROSS_MAX_DISTANCE;
        distance++
      ) {
        const x = PLAYER_START.x + dx * distance;
        const y = PLAYER_START.y + dy * distance;

        if (
          canMoveStraightIntoCorridor(direction, distance) &&
          hasOpenCross(x, y)
        ) {
          return {
            direction,
            distance,
            boxCount: 0,
            reason: "open-cross",
          };
        }
      }
    }

    return null;
  };

  const getForwardAndLateralDistance = (x, y, direction) => {
    const offsetX = x - PLAYER_START.x;
    const offsetY = y - PLAYER_START.y;

    if (direction === "up") {
      return { forward: -offsetY, lateral: Math.abs(offsetX) };
    }
    if (direction === "right") {
      return { forward: offsetX, lateral: Math.abs(offsetY) };
    }
    if (direction === "down") {
      return { forward: offsetY, lateral: Math.abs(offsetX) };
    }
    return { forward: -offsetX, lateral: Math.abs(offsetY) };
  };

  const countNearbyBoxes = (direction) => {
    let boxCount = 0;

    for (
      let y = PLAYER_START.y - ESCAPE_DISTANCE;
      y <= PLAYER_START.y + ESCAPE_DISTANCE;
      y++
    ) {
      for (
        let x = PLAYER_START.x - ESCAPE_DISTANCE;
        x <= PLAYER_START.x + ESCAPE_DISTANCE;
        x++
      ) {
        const { forward, lateral } = getForwardAndLateralDistance(
          x,
          y,
          direction,
        );

        if (
          forward < 1 ||
          forward > ESCAPE_DISTANCE ||
          lateral > ESCAPE_DISTANCE
        ) {
          continue;
        }

        if (isBox(x, y)) {
          boxCount++;
        }
      }
    }

    return boxCount;
  };

  const openCrossCorridor = findOpenCrossCorridor();

  if (openCrossCorridor) {
    return openCrossCorridor;
  }

  return ESCAPE_DIRECTIONS.map((direction) => ({
    direction,
    distance: ESCAPE_DISTANCE,
    boxCount: countNearbyBoxes(direction),
    isOpen: canMoveStraightIntoCorridor(direction, ESCAPE_DISTANCE),
    reason: "crowded-corridor",
  }))
    .filter(({ isOpen }) => isOpen)
    .reduce((best, current) => {
      if (!best || current.boxCount > best.boxCount) {
        return current;
      }

      return best;
    }, null);
};

const moveIntoEscapeCorridor = async (
  huntId,
  direction,
  escapeDistance,
  state,
  logWithStep,
) => {
  const backwardsDirection = getOppositeDirection(direction);

  for (
    let distance = 1;
    state === "active" && distance <= escapeDistance;
    distance++
  ) {
    const moveResult = await movePlayer(huntId, direction);
    state = moveResult.state;
    logWithStep(`moved ${direction}; state is ${state}`);

    if (state !== "active") {
      continue;
    }

    if (distance >= TRACK_AFTER_STEPS && distance < escapeDistance - 1) {
      state = await trackDirectionAndShoot(
        huntId,
        backwardsDirection,
        state,
        logWithStep,
      );
    }

    if (
      state === "active" &&
      distance % FLANK_TRACK_INTERVAL === 0 &&
      distance < escapeDistance - 1
    ) {
      state = await trackDirectionAndShoot(
        huntId,
        direction,
        state,
        logWithStep,
      );
    }
  }

  return state;
};

const shootAroundTheClock = async (huntId, state, logWithStep) => {
  let shotStep = 0;

  while (state === "active") {
    const direction = ESCAPE_DIRECTIONS[shotStep % ESCAPE_DIRECTIONS.length];
    const shootResult = await shoot(huntId, direction);
    state = shootResult.state;
    shotStep++;

    logWithStep(`shot ${direction}; hit ${shootResult.hit}; state is ${state}`);
  }
};

const trackAllDirectionsAndShoot = async (huntId, state, logWithStep) => {
  let trackerStep = 0;

  while (state === "active") {
    const direction = ESCAPE_DIRECTIONS[trackerStep % ESCAPE_DIRECTIONS.length];
    const trackerResult = await useMotionTracker(huntId, direction);
    state = trackerResult.state;
    trackerStep++;
    logWithStep(
      `used motion tracker ${direction}; detected ${trackerResult.detected}; state is ${state}`,
    );

    if (state === "active" && trackerResult.detected) {
      const shootResult = await shoot(huntId, direction);
      state = shootResult.state;
      logWithStep(
        `shot ${direction}; hit ${shootResult.hit}; state is ${state}`,
      );

      if (state === "active" && !shootResult.hit) {
        return shootDirectionUntilHuntEnds(
          huntId,
          direction,
          state,
          logWithStep,
        );
      }
    }
  }

  return state;
};

const trackDirectionAndShoot = async (
  huntId,
  direction,
  state,
  logWithStep,
) => {
  const trackerResult = await useMotionTracker(huntId, direction);
  state = trackerResult.state;
  logWithStep(
    `used motion tracker ${direction}; detected ${trackerResult.detected}; state is ${state}`,
  );

  if (state === "active" && trackerResult.detected) {
    const shootResult = await shoot(huntId, direction);
    state = shootResult.state;
    logWithStep(`shot ${direction}; hit ${shootResult.hit}; state is ${state}`);
  }

  return state;
};

const shootDirectionUntilHuntEnds = async (
  huntId,
  direction,
  state,
  logWithStep,
) => {
  while (state === "active") {
    const shootResult = await shoot(huntId, direction);
    state = shootResult.state;
    logWithStep(`shot ${direction}; hit ${shootResult.hit}; state is ${state}`);
  }

  return state;
};

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

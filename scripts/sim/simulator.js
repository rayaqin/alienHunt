// Local simulator that reuses the REAL game.js logic and replicates the
// server's hard-difficulty alien-move counts (see src/server.js getAlienMoveCount /
// getMotionTrackerAlienMoveCount). This lets us benchmark strategies over many
// games in milliseconds, with the alien behaving exactly as the live server.
//
// IMPORTANT: the simulator is only a TEST HARNESS standing in for the live
// server. Strategies must NOT read alien internals (position, search strategy);
// they only get what the real API returns.
const game = require("../../src/game");

const HARD_ALIEN_MOVE_COUNT = 2; // getAlienMoveCount(hard)
const HARD_TRACKER_MOVE_COUNT = 2; // getMotionTrackerAlienMoveCount(hard)
const SIZE = 100;
const SEARCH_STRATEGIES = ["corner-search", "horizontal-sweep", "vertical-sweep"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGrid(boxSet, player) {
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      if (boxSet.has(`${x},${y}`)) return "#";
      if (x === player.x && y === player.y) return "P";
      return ".";
    }),
  );
}

// Build a hard hunt from a cached map (array of "x,y" box strings). Random alien
// start (>=4 from center, open) and random search strategy via the seeded RNG —
// mirroring createHunt/getRandomOpenPosition/getRandomSearchStrategy.
function buildHuntFromBoxes(boxKeys, rng) {
  const boxSet = new Set(boxKeys);
  const player = { x: 50, y: 50 };
  let alien;
  for (;;) {
    const x = Math.floor(rng() * SIZE);
    const y = Math.floor(rng() * SIZE);
    if (boxSet.has(`${x},${y}`)) continue;
    if (Math.abs(x - 50) + Math.abs(y - 50) < 4) continue;
    alien = { x, y };
    break;
  }
  const strat = SEARCH_STRATEGIES[Math.floor(rng() * SEARCH_STRATEGIES.length)];
  return {
    huntId: "sim",
    boxes: boxKeys.map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    }),
    grid: buildGrid(boxSet, player),
    boxSet,
    playerPosition: { ...player },
    alienPosition: alien,
    alienTarget: { ...player },
    alienMoves: 0,
    difficulty: "hard",
    alienSearchStrategy: strat,
    alienSearchTarget: null,
    alienCornerSearchNextCornerIndex: 0,
    alienCornerSearchReturningToCenter: false,
    alienSweepLineIndex: 0,
    alienSweepForward: true,
    alienSweepTargetPhase: "line-start",
    state: "active",
  };
}

function makeClient(hunt) {
  return {
    huntId: hunt.huntId,
    grid: hunt.grid,
    boxes: hunt.boxes,
    get state() {
      return hunt.state;
    },
    get playerPosition() {
      return { ...hunt.playerPosition };
    },
    get alienMoves() {
      return hunt.alienMoves;
    },
    useMotionTracker(direction) {
      if (hunt.state !== "active") return { detected: false, state: hunt.state };
      const detected = game.getMotionTrackerResult(hunt, direction);
      game.triggerAlienMovement(hunt, HARD_TRACKER_MOVE_COUNT);
      return { detected, state: hunt.state };
    },
    movePlayer(direction) {
      if (hunt.state !== "active")
        return { playerPosition: { ...hunt.playerPosition }, state: hunt.state };
      const playerPosition = game.movePlayer(hunt, direction, {
        alienMoveCount: HARD_ALIEN_MOVE_COUNT,
      });
      return { playerPosition: { ...playerPosition }, state: hunt.state };
    },
    shoot(direction) {
      if (hunt.state !== "active") return { hit: false, state: hunt.state };
      const hit = game.shoot(hunt, direction, {
        alienMoveCount: HARD_ALIEN_MOVE_COUNT,
      });
      return { hit, state: hunt.state };
    },
    _peekAlien: () => ({ ...hunt.alienPosition }),
    _hunt: hunt,
  };
}

function createHardGame() {
  const hunt = game.createHunt({ difficulty: "hard" });
  return { hunt, client: makeClient(hunt) };
}

function createHardGameFromBoxes(boxKeys, rng) {
  const hunt = buildHuntFromBoxes(boxKeys, rng);
  return { hunt, client: makeClient(hunt) };
}

module.exports = {
  createHardGame,
  createHardGameFromBoxes,
  mulberry32,
  HARD_ALIEN_MOVE_COUNT,
};

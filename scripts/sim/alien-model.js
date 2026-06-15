// Faithful, fast replication of the server's alien movement (src/game.js),
// operating on lightweight per-hypothesis state. Uses target-rooted BFS distance
// fields (verified to match getShortestRoute's first step exactly) cached per
// game, so stepping thousands of hypotheses is cheap.
const DIRECTIONS = ["up", "down", "left", "right"];
const DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const SIZE = 100;
const CENTER = { x: 50, y: 50 };
const CORNERS = [
  { x: 0, y: 0 },
  { x: 99, y: 0 },
  { x: 99, y: 99 },
  { x: 0, y: 99 },
];
const SWEEP_LINE_STEP = 2;

function k(x, y) {
  return x * 100 + y;
}

// Context shared across all hypotheses in one game.
function createContext(boxSet) {
  return { boxSet, fieldCache: new Map() };
}

function isOpen(ctx, x, y) {
  return (
    x >= 0 && x < SIZE && y >= 0 && y < SIZE && !ctx.boxSet.has(`${x},${y}`)
  );
}

// BFS distance field rooted at target, over open cells. Cached.
function getField(ctx, target) {
  const key = k(target.x, target.y);
  let field = ctx.fieldCache.get(key);
  if (field) return field;
  field = new Int32Array(SIZE * SIZE).fill(-1);
  field[k(target.x, target.y)] = 0;
  const q = [target];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const cd = field[k(c.x, c.y)];
    for (const d of DIRECTIONS) {
      const nx = c.x + DELTAS[d].x;
      const ny = c.y + DELTAS[d].y;
      if (!isOpen(ctx, nx, ny)) continue;
      const nk = k(nx, ny);
      if (field[nk] !== -1) continue;
      field[nk] = cd + 1;
      q.push({ x: nx, y: ny });
    }
  }
  ctx.fieldCache.set(key, field);
  return field;
}

// First step from (x,y) toward target per the server's tie-break (first dir in
// up,down,left,right whose neighbor is one step closer). Returns dir or null.
function firstStepToward(ctx, target, x, y) {
  const field = getField(ctx, target);
  const cd = field[k(x, y)];
  if (cd <= 0) return null; // at target or unreachable
  for (const d of DIRECTIONS) {
    const nx = x + DELTAS[d].x;
    const ny = y + DELTAS[d].y;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
    if (field[k(nx, ny)] === cd - 1) return d;
  }
  return null;
}

// Aligned + clear line of sight between (ax,ay) and player.
function hasLOS(ctx, ax, ay, px, py) {
  if (ax !== px && ay !== py) return false;
  if (ax === px && ay === py) return true;
  const dx = Math.sign(px - ax);
  const dy = Math.sign(py - ay);
  let cx = ax + dx;
  let cy = ay + dy;
  while (cx !== px || cy !== py) {
    if (!isOpen(ctx, cx, cy)) return false;
    cx += dx;
    cy += dy;
  }
  return true;
}

function createHypothesis(x, y, strat) {
  return {
    x,
    y,
    target: { x: CENTER.x, y: CENTER.y }, // createHunt sets alienTarget = player start
    strat, // "corner" | "hsweep" | "vsweep"
    cornerIndex: 0,
    returningToCenter: false,
    sweepLineIndex: 0,
    sweepForward: true,
    sweepPhase: "line-start",
    searchTarget: null,
    dead: false,
  };
}

function moveOneStep(ctx, h, dir, px, py) {
  h.x += DELTAS[dir].x;
  h.y += DELTAS[dir].y;
  if (hasLOS(ctx, h.x, h.y, px, py)) {
    h.target = { x: px, y: py };
  }
}

function moveToward(ctx, h, target, px, py) {
  if (h.x === target.x && h.y === target.y) return;
  const dir = firstStepToward(ctx, target, h.x, h.y);
  if (!dir) return;
  moveOneStep(ctx, h, dir, px, py);
}

function nextCornerTarget(h) {
  if (h.returningToCenter) {
    h.returningToCenter = false;
    return { x: CENTER.x, y: CENTER.y };
  }
  const t = CORNERS[h.cornerIndex];
  h.cornerIndex = (h.cornerIndex + 1) % CORNERS.length;
  h.returningToCenter = true;
  return { x: t.x, y: t.y };
}

function sweepLineEndpoint(ctx, orientation, lineIndex, side) {
  for (let offset = 0; offset < SIZE; offset++) {
    const cross = side === "low" ? offset : SIZE - 1 - offset;
    const x = orientation === "horizontal" ? cross : lineIndex;
    const y = orientation === "horizontal" ? lineIndex : cross;
    if (isOpen(ctx, x, y)) return { x, y };
  }
  return null;
}

function advanceSweepLine(h) {
  h.sweepLineIndex += SWEEP_LINE_STEP;
  h.sweepForward = !h.sweepForward;
  h.sweepPhase = "line-start";
}

function sweepTargetForCurrentLine(ctx, h, orientation) {
  const isLineStart = h.sweepPhase === "line-start";
  const side = isLineStart === h.sweepForward ? "low" : "high";
  const target = sweepLineEndpoint(ctx, orientation, h.sweepLineIndex, side);
  if (h.sweepPhase === "line-start") {
    h.sweepPhase = "line-end";
  } else {
    advanceSweepLine(h);
  }
  return target;
}

function nextSweepTarget(ctx, h, orientation) {
  if (h.sweepLineIndex >= SIZE) {
    h.sweepLineIndex = 0;
    h.sweepForward = true;
    h.sweepPhase = "line-start";
  }
  while (h.sweepLineIndex < SIZE) {
    const target = sweepTargetForCurrentLine(ctx, h, orientation);
    if (target) return target;
    advanceSweepLine(h);
  }
  return null;
}

function ensureSweepTarget(ctx, h, orientation) {
  for (let attempts = 0; attempts < SIZE * 2; attempts++) {
    if (
      h.searchTarget &&
      !(h.x === h.searchTarget.x && h.y === h.searchTarget.y)
    ) {
      return true;
    }
    h.searchTarget = nextSweepTarget(ctx, h, orientation);
  }
  return false;
}

function search(ctx, h, px, py) {
  if (h.strat === "corner") {
    if (
      !h.searchTarget ||
      (h.x === h.searchTarget.x && h.y === h.searchTarget.y)
    ) {
      h.searchTarget = nextCornerTarget(h);
    }
    const dir = firstStepToward(ctx, h.searchTarget, h.x, h.y);
    if (dir) moveOneStep(ctx, h, dir, px, py);
    return;
  }
  const orientation = h.strat === "hsweep" ? "horizontal" : "vertical";
  if (!ensureSweepTarget(ctx, h, orientation)) return;
  const dir = firstStepToward(ctx, h.searchTarget, h.x, h.y);
  if (dir) moveOneStep(ctx, h, dir, px, py);
}

// One alien move against player at (px,py). Mirrors game.js moveAlien.
function moveAlien(ctx, h, px, py) {
  if (hasLOS(ctx, h.x, h.y, px, py)) {
    h.target = { x: px, y: py };
    moveToward(ctx, h, { x: px, y: py }, px, py);
    return;
  }
  if (h.target) {
    const snap = { x: h.target.x, y: h.target.y };
    moveToward(ctx, h, snap, px, py);
    if (h.target && h.x === h.target.x && h.y === h.target.y) {
      h.target = null;
    }
    return;
  }
  search(ctx, h, px, py);
}

// Advance a hypothesis `count` alien moves against player at (px,py). Marks the
// hypothesis dead if the alien lands on the player (impossible if we survived).
function advanceHyp(ctx, h, px, py, count) {
  for (let i = 0; i < count; i++) {
    moveAlien(ctx, h, px, py);
    if (h.x === px && h.y === py) {
      h.dead = true;
      return;
    }
  }
}

module.exports = {
  DIRECTIONS,
  DELTAS,
  SIZE,
  CENTER,
  createContext,
  isOpen,
  hasLOS,
  createHypothesis,
  advanceHyp,
  getField,
  firstStepToward,
};

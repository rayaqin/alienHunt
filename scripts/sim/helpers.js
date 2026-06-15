// Shared, side-effect-free helpers for strategies. Pure map/grid reasoning.
const DIRECTIONS = ["up", "down", "left", "right"];
const DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const GRID_SIZE = 100;
const PLAYER_START = { x: 50, y: 50 };

function opposite(direction) {
  if (direction === "up") return "down";
  if (direction === "down") return "up";
  if (direction === "left") return "right";
  return "left";
}

function key(x, y) {
  return `${x},${y}`;
}

// Build a fast boxSet + isOpen predicate from the grid the contestant receives.
function buildMap(grid) {
  const boxSet = new Set();
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === "#") boxSet.add(key(x, y));
    }
  }
  const isOpen = (x, y) =>
    x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && !boxSet.has(key(x, y));
  return { boxSet, isOpen };
}

// BFS shortest path of directions from a->b over open cells. Mirrors the
// server's getShortestRoute direction order (up,down,left,right) so our route
// predictions match the alien's actual routing.
function shortestRoute(isOpen, start, target) {
  if (start.x === target.x && start.y === target.y) return [];
  const startKey = key(start.x, start.y);
  const targetKey = key(target.x, target.y);
  const queue = [start];
  const visited = new Set([startKey]);
  const prev = new Map();
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const d of DIRECTIONS) {
      const nx = cur.x + DELTAS[d].x;
      const ny = cur.y + DELTAS[d].y;
      const nk = key(nx, ny);
      if (!isOpen(nx, ny) || visited.has(nk)) continue;
      visited.add(nk);
      prev.set(nk, { pk: key(cur.x, cur.y), d });
      if (nk === targetKey) {
        const route = [];
        let ck = targetKey;
        while (ck !== startKey) {
          const step = prev.get(ck);
          route.unshift(step.d);
          ck = step.pk;
        }
        return route;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return [];
}

// Clear line of sight between aligned cells (no boxes between). Returns false if
// not aligned.
function hasLineOfSight(isOpen, a, b) {
  if (a.x !== b.x && a.y !== b.y) return false;
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let cx = a.x + dx;
  let cy = a.y + dy;
  while (cx !== b.x || cy !== b.y) {
    if (!isOpen(cx, cy)) return false;
    cx += dx;
    cy += dy;
  }
  return true;
}

// Count consecutive open cells from (x,y) going in `direction` (not counting the
// origin cell).
function openArm(isOpen, x, y, direction) {
  const d = DELTAS[direction];
  let count = 0;
  let cx = x + d.x;
  let cy = y + d.y;
  while (isOpen(cx, cy)) {
    count++;
    cx += d.x;
    cy += d.y;
  }
  return count;
}

module.exports = {
  DIRECTIONS,
  DELTAS,
  GRID_SIZE,
  PLAYER_START,
  opposite,
  key,
  buildMap,
  shortestRoute,
  hasLineOfSight,
  openArm,
};

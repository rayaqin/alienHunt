// Verify a fast target-rooted distance-field first-step matches the server's
// exact getShortestRoute first direction, across many random maps/queries.
const game = require("../../src/game");

const DIRECTIONS = ["up", "down", "left", "right"];
const DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function k(x, y) {
  return `${x},${y}`;
}

// BFS distance field from target over open cells.
function distField(boxSet, target, size) {
  const dist = new Map();
  dist.set(k(target.x, target.y), 0);
  const q = [target];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const cd = dist.get(k(c.x, c.y));
    for (const d of DIRECTIONS) {
      const nx = c.x + DELTAS[d].x;
      const ny = c.y + DELTAS[d].y;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      if (boxSet.has(k(nx, ny))) continue;
      if (dist.has(k(nx, ny))) continue;
      dist.set(k(nx, ny), cd + 1);
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

// Candidate first-step from `start` toward `target` using target distances,
// picking the first direction (in up,down,left,right order) whose neighbor is
// one step closer.
function firstStep(dist, start) {
  const cd = dist.get(k(start.x, start.y));
  if (cd === undefined || cd === 0) return null;
  for (const d of DIRECTIONS) {
    const nx = start.x + DELTAS[d].x;
    const ny = start.y + DELTAS[d].y;
    const nd = dist.get(k(nx, ny));
    if (nd === cd - 1) return d;
  }
  return null;
}

function main() {
  const size = 100;
  let total = 0;
  let mismatch = 0;
  const trials = 30;
  for (let t = 0; t < trials; t++) {
    const hunt = game.createHunt({ difficulty: "hard" });
    const boxSet = hunt.boxSet;
    // sample random open cells
    const open = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!boxSet.has(k(x, y))) open.push({ x, y });
    for (let s = 0; s < 400; s++) {
      const start = open[Math.floor(Math.random() * open.length)];
      const target = open[Math.floor(Math.random() * open.length)];
      if (start.x === target.x && start.y === target.y) continue;
      const real = game.getShortestRoute(hunt, start, target)[0] ?? null;
      const dist = distField(boxSet, target, size);
      const mine = firstStep(dist, start);
      total++;
      if (real !== mine) {
        mismatch++;
        if (mismatch <= 5)
          console.log(
            `MISMATCH start=${k(start.x, start.y)} target=${k(target.x, target.y)} real=${real} mine=${mine}`,
          );
      }
    }
  }
  console.log(`Total ${total}, mismatches ${mismatch} (${((mismatch / total) * 100).toFixed(3)}%)`);
}

main();

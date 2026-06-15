// Measure availability of "guaranteed camp" cells using ONLY map geometry
// (no knowledge of alien internals). A camp cell C must satisfy:
//   - C has exactly one open orthogonal neighbour N1 (dead end), in direction d
//   - N1 has exactly two open neighbours: C and N2 = N1 + d (straight, 1-wide)
// Then firing direction d from C every turn is a provable win: every open cell
// within graph-distance 2 of C lies on the clear straight line in direction d.
const game = require("../../src/game");

const SIZE = 100;
const START = { x: 50, y: 50 };
const DIRS = ["up", "down", "left", "right"];
const D = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function findCamps(boxSet) {
  const isOpen = (x, y) =>
    x >= 0 && x < SIZE && y >= 0 && y < SIZE && !boxSet.has(`${x},${y}`);
  const camps = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!isOpen(x, y)) continue;
      const openDirs = DIRS.filter((d) => isOpen(x + D[d].x, y + D[d].y));
      if (openDirs.length !== 1) continue;
      const d = openDirs[0];
      const n1 = { x: x + D[d].x, y: y + D[d].y };
      const n1Open = DIRS.filter((dd) =>
        isOpen(n1.x + D[dd].x, n1.y + D[dd].y),
      );
      // N1 must connect only to C and the straight continuation N2.
      const n2 = { x: n1.x + D[d].x, y: n1.y + D[d].y };
      if (n1Open.length !== 2) continue;
      const connectsStraight =
        n1Open.includes(d) &&
        // the other open neighbour is C (opposite direction)
        n1Open.length === 2;
      if (!connectsStraight) continue;
      // measure clear straight arm length in direction d from C
      let arm = 0;
      let cx = x + D[d].x;
      let cy = y + D[d].y;
      while (isOpen(cx, cy)) {
        arm++;
        cx += D[d].x;
        cy += D[d].y;
      }
      camps.push({ x, y, d, arm });
    }
  }
  return camps;
}

function bfsDist(boxSet, start) {
  const isOpen = (x, y) =>
    x >= 0 && x < SIZE && y >= 0 && y < SIZE && !boxSet.has(`${x},${y}`);
  const dist = new Map([[`${start.x},${start.y}`, 0]]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const cd = dist.get(`${c.x},${c.y}`);
    for (const d of DIRS) {
      const nx = c.x + D[d].x;
      const ny = c.y + D[d].y;
      const kk = `${nx},${ny}`;
      if (!isOpen(nx, ny) || dist.has(kk)) continue;
      dist.set(kk, cd + 1);
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

function main() {
  const trials = 300;
  let noCamp = 0;
  const nearestDists = [];
  const campCounts = [];
  for (let t = 0; t < trials; t++) {
    const hunt = game.createHunt({ difficulty: "hard" });
    const camps = findCamps(hunt.boxSet);
    campCounts.push(camps.length);
    if (camps.length === 0) {
      noCamp++;
      continue;
    }
    const dist = bfsDist(hunt.boxSet, START);
    let nearest = Infinity;
    for (const c of camps) {
      const d = dist.get(`${c.x},${c.y}`) ?? Infinity;
      if (d < nearest) nearest = d;
    }
    nearestDists.push(nearest);
  }
  nearestDists.sort((a, b) => a - b);
  const avg = (arr) => (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
  console.log(`Trials: ${trials}`);
  console.log(`Maps with no camp cell: ${noCamp}`);
  console.log(`Avg camps per map: ${avg(campCounts)}`);
  console.log(
    `Nearest-camp dist: min=${nearestDists[0]} median=${nearestDists[Math.floor(nearestDists.length / 2)]} avg=${avg(nearestDists)} max=${nearestDists[nearestDists.length - 1]}`,
  );
  const within = (n) => nearestDists.filter((d) => d <= n).length;
  console.log(
    `Maps with a camp within dist 10: ${within(10)}, 20: ${within(20)}, 30: ${within(30)}, 40: ${within(40)}`,
  );
}

main();

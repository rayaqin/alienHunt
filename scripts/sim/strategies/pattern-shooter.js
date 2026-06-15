// Configurable shooter for experimentation. Uses only documented info.
//   POS=start | cross | hrow | vcol
//     start: camp at 50,50
//     cross: move to best open cross center
//     hrow : move (<=BUDGET) to the cell with the longest clear horizontal LOS
//     vcol : longest clear vertical LOS
//   PATTERN=LR etc. (firing order from {U,R,D,L})
//   BUDGET=n travel budget for hrow/vcol (default 8)
const { PLAYER_START, buildMap, shortestRoute, openArm } = require("../helpers");

const LETTER = { U: "up", R: "right", D: "down", L: "left" };

function bestBy(isOpen, score, budget) {
  // BFS distances from start, limited to budget.
  const startKey = `${PLAYER_START.x},${PLAYER_START.y}`;
  const dist = new Map([[startKey, 0]]);
  const q = [{ ...PLAYER_START }];
  const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const cd = dist.get(`${c.x},${c.y}`);
    if (cd >= budget) continue;
    for (const d of Object.keys(D)) {
      const nx = c.x + D[d][0];
      const ny = c.y + D[d][1];
      if (!isOpen(nx, ny) || dist.has(`${nx},${ny}`)) continue;
      dist.set(`${nx},${ny}`, cd + 1);
      q.push({ x: nx, y: ny });
    }
  }
  let best = null;
  for (const [k, d] of dist) {
    const [x, y] = k.split(",").map(Number);
    const s = score(x, y);
    if (!best || s > best.s || (s === best.s && d < best.d))
      best = { x, y, s, d };
  }
  return best;
}

module.exports = async function patternShooter(client) {
  const pos = process.env.POS ?? "start";
  const budget = Number(process.env.BUDGET ?? 8);
  const cap = Number(process.env.SCORECAP ?? 999);
  const pattern = (process.env.PATTERN ?? "LR").split("").map((c) => LETTER[c]);
  const { isOpen } = buildMap(client.grid);
  const capped = (v) => Math.min(v, cap);

  let target = null;
  if (pos === "hrow") {
    target = bestBy(
      isOpen,
      (x, y) =>
        capped(
          Math.min(
            openArm(isOpen, x, y, "left"),
            openArm(isOpen, x, y, "right"),
          ),
        ),
      budget,
    );
  } else if (pos === "vcol") {
    target = bestBy(
      isOpen,
      (x, y) =>
        Math.min(openArm(isOpen, x, y, "up"), openArm(isOpen, x, y, "down")),
      budget,
    );
  } else if (pos === "cross") {
    target = bestBy(
      isOpen,
      (x, y) =>
        Math.min(openArm(isOpen, x, y, "left"), openArm(isOpen, x, y, "right")) +
        Math.min(openArm(isOpen, x, y, "up"), openArm(isOpen, x, y, "down")),
      budget,
    );
  }

  if (target) {
    let route = shortestRoute(isOpen, client.playerPosition, target);
    while (client.state === "active" && route.length > 0)
      client.movePlayer(route.shift());
  }

  let step = 0;
  while (client.state === "active") {
    client.shoot(pattern[step % pattern.length]);
    step++;
  }
};

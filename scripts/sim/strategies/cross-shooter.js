// Port of the existing open-cross-shooter (the ~80% baseline) to the simulator
// client interface, so we can measure it under identical conditions.
const {
  DIRECTIONS,
  PLAYER_START,
  opposite,
  buildMap,
  shortestRoute,
  openArm,
} = require("../helpers");

const CLOCKWISE = ["up", "right", "down", "left"];

function findLargestOpenCrossCenter(isOpen) {
  const minArm = 6;
  let best = null;
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      if (!isOpen(x, y)) continue;
      const left = openArm(isOpen, x, y, "left");
      const right = openArm(isOpen, x, y, "right");
      const up = openArm(isOpen, x, y, "up");
      const down = openArm(isOpen, x, y, "down");
      if (left < minArm || right < minArm || up < minArm || down < minArm)
        continue;
      const h = left + 1 + right;
      const v = up + 1 + down;
      const avg = (h + v) / 2;
      const smaller = Math.min(h, v);
      const dist = Math.abs(PLAYER_START.x - x) + Math.abs(PLAYER_START.y - y);
      if (
        !best ||
        avg > best.avg ||
        (avg === best.avg && smaller > best.smaller) ||
        (avg === best.avg && smaller === best.smaller && dist < best.dist)
      ) {
        best = { x, y, avg, smaller, dist };
      }
    }
  }
  return best;
}

module.exports = async function crossShooter(client) {
  const { isOpen } = buildMap(client.grid);
  const center = findLargestOpenCrossCenter(isOpen) || { ...PLAYER_START };

  // Move to the cross center with periodic tracker checks behind/forward.
  let pos = client.playerPosition;
  let route = shortestRoute(isOpen, pos, center);
  let lastDir;
  let sameCount = 0;
  while (client.state === "active" && route.length > 0) {
    const dir = route.shift();
    const r = client.movePlayer(dir);
    pos = r.playerPosition;
    if (client.state !== "active") return;
    if (dir === lastDir) sameCount++;
    else {
      lastDir = dir;
      sameCount = 1;
    }
    const checkBack = sameCount % 2 === 0;
    const checkFwd = sameCount % 6 === 0;
    if (checkBack) {
      const back = opposite(dir);
      const t = client.useMotionTracker(back);
      if (client.state !== "active") return;
      if (t.detected) {
        client.shoot(back);
        if (client.state !== "active") return;
      }
    }
    if (checkFwd) {
      const t = client.useMotionTracker(dir);
      if (client.state !== "active") return;
      if (t.detected) {
        client.shoot(dir);
        if (client.state !== "active") return;
      }
    }
  }

  // Shoot clockwise forever.
  let step = 0;
  while (client.state === "active") {
    client.shoot(CLOCKWISE[step % 4]);
    step++;
  }
};

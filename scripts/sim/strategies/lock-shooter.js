// Tracker-lock shooter: stay put, scan with the motion tracker; the moment the
// alien is detected on an axis, lock that direction and hammer it until the
// alien is gone, then resume scanning. Uses only documented info.
//   POS=start|cross
//   SCAN=URDL    (tracker rotation order)
//   LOCKMISS=n   (max consecutive locked misses before re-scanning)
const { PLAYER_START, buildMap, shortestRoute, openArm } = require("../helpers");

const LETTER = { U: "up", R: "right", D: "down", L: "left" };

function bestCross(isOpen) {
  let best = null;
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      if (!isOpen(x, y)) continue;
      const l = openArm(isOpen, x, y, "left");
      const r = openArm(isOpen, x, y, "right");
      const u = openArm(isOpen, x, y, "up");
      const d = openArm(isOpen, x, y, "down");
      if (l < 6 || r < 6 || u < 6 || d < 6) continue;
      const avg = (l + r + u + d) / 2;
      const dist = Math.abs(PLAYER_START.x - x) + Math.abs(PLAYER_START.y - y);
      if (!best || avg > best.avg || (avg === best.avg && dist < best.dist))
        best = { x, y, avg, dist };
    }
  }
  return best;
}

module.exports = async function lockShooter(client) {
  const pos = process.env.POS ?? "start";
  const scan = (process.env.SCAN ?? "URDL").split("").map((c) => LETTER[c]);
  const lockMiss = Number(process.env.LOCKMISS ?? 6);
  const { isOpen } = buildMap(client.grid);

  if (pos === "cross") {
    const center = bestCross(isOpen) || { ...PLAYER_START };
    let route = shortestRoute(isOpen, client.playerPosition, center);
    while (client.state === "active" && route.length > 0)
      client.movePlayer(route.shift());
  }

  let scanIdx = 0;
  while (client.state === "active") {
    const dir = scan[scanIdx % scan.length];
    scanIdx++;
    const t = client.useMotionTracker(dir);
    if (client.state !== "active") break;
    if (!t.detected) continue;
    // locked: hammer this direction
    let misses = 0;
    while (client.state === "active" && misses < lockMiss) {
      const r = client.shoot(dir);
      if (client.state !== "active") break;
      if (r.hit) break;
      misses++;
    }
  }
};

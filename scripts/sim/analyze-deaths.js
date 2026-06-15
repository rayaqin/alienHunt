// Analysis tool (peeks at alien — for understanding only, not a strategy).
// Runs a blind pattern shooter from start and, on death, records the alien's
// approach geometry: its position relative to the player over the final turns,
// and the shot directions fired. Aggregates which relative directions the alien
// came from at the killing moment.
const fs = require("node:fs");
const path = require("node:path");
const game = require("../../src/game");
const { createHardGameFromBoxes, mulberry32 } = require("./simulator");

const mapsFile = process.env.MAPS
  ? path.resolve(process.cwd(), process.env.MAPS)
  : path.resolve(__dirname, "maps.json");
const maps = JSON.parse(fs.readFileSync(mapsFile, "utf8"));
const runs = Number(process.argv[2] ?? 250);
const patternStr = process.env.PATTERN ?? "URDL";
const LETTER = { U: "up", R: "right", D: "down", L: "left" };
const pattern = patternStr.split("").map((c) => LETTER[c]);

const approachDir = { up: 0, down: 0, left: 0, right: 0, diagonal: 0, onaxis2: 0 };
let deaths = 0;
let aligned1 = 0; // alien aligned at dist 1 at death-turn start (we could've shot it)
let aligned2 = 0;

for (let i = 0; i < runs; i++) {
  const rng = mulberry32(1000 + i);
  const { hunt, client } = createHardGameFromBoxes(maps[i % maps.length], rng);
  let step = 0;
  let prevAlien = null;
  while (hunt.state === "active") {
    const a = { ...hunt.alienPosition };
    const p = { ...hunt.playerPosition };
    prevAlien = { a, p, shot: pattern[step % pattern.length] };
    client.shoot(pattern[step % pattern.length]);
    step++;
    if (step > 60000) break;
  }
  if (hunt.state === "death" && prevAlien) {
    deaths++;
    const { a, p } = prevAlien;
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dx === 0 && dy !== 0) {
      approachDir[dy < 0 ? "up" : "down"]++;
      if (dist === 1) aligned1++;
      else if (dist === 2) aligned2++;
    } else if (dy === 0 && dx !== 0) {
      approachDir[dx < 0 ? "left" : "right"]++;
      if (dist === 1) aligned1++;
      else if (dist === 2) aligned2++;
    } else {
      approachDir.diagonal++;
    }
  }
}

console.log(`Runs ${runs}, deaths ${deaths}`);
console.log(
  `At death-turn start, alien relative position:`,
  JSON.stringify(approachDir),
);
console.log(
  `aligned@dist1=${aligned1} aligned@dist2=${aligned2} (we had a shot available those turns)`,
);

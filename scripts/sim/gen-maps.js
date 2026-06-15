// Generate a pool of maps ONCE and cache to disk. Map generation (connectivity
// check per box) is the bottleneck; caching lets strategy iteration be fast and
// keeps comparisons fair (same maps for every strategy).
const fs = require("node:fs");
const path = require("node:path");
const game = require("../../src/game");

const count = Number(process.argv[2] ?? 1000);
const outPath = path.resolve(__dirname, process.argv[3] ?? "maps.json");

const maps = [];
const start = Date.now();
for (let i = 0; i < count; i++) {
  const hunt = game.createHunt({ difficulty: "hard" });
  // store boxes as compact "x,y" strings
  maps.push(hunt.boxes.map((b) => `${b.x},${b.y}`));
  if ((i + 1) % 50 === 0) {
    process.stdout.write(
      `\rGenerated ${i + 1}/${count} (${((Date.now() - start) / 1000).toFixed(0)}s)`,
    );
  }
}
process.stdout.write("\n");
fs.writeFileSync(outPath, JSON.stringify(maps));
console.log(`Wrote ${maps.length} maps to ${outPath}`);

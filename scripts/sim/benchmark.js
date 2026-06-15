// Benchmark a strategy over N simulated hard games using the real game.js logic
// and a cached map pool. Every strategy sees identical (map, alien-start) games
// for a given run count, so comparisons are fair.
// Usage: node scripts/sim/benchmark.js <strategy-file> [runs]
const fs = require("node:fs");
const path = require("node:path");
const { createHardGameFromBoxes, mulberry32 } = require("./simulator");

const MAX_ACTIONS = 60000;
const mapsFile = process.env.MAPS
  ? path.resolve(process.cwd(), process.env.MAPS)
  : path.resolve(__dirname, "maps.json");
const maps = JSON.parse(fs.readFileSync(mapsFile, "utf8"));

async function runOne(strategyFn, boxKeys, seed) {
  const rng = mulberry32(seed);
  const { client } = createHardGameFromBoxes(boxKeys, rng);
  let actions = 0;
  const guarded = wrapWithCap(client, () => {
    actions++;
    if (actions > MAX_ACTIONS) throw new Error("action-cap-exceeded");
  });
  try {
    await strategyFn(guarded);
  } catch (err) {
    if (err.message !== "action-cap-exceeded") throw err;
  }
  return { outcome: client.state, actions };
}

function wrapWithCap(client, tick) {
  return {
    get state() {
      return client.state;
    },
    get playerPosition() {
      return client.playerPosition;
    },
    get alienMoves() {
      return client.alienMoves;
    },
    grid: client.grid,
    boxes: client.boxes,
    huntId: client.huntId,
    useMotionTracker(d) {
      tick();
      return client.useMotionTracker(d);
    },
    movePlayer(d) {
      tick();
      return client.movePlayer(d);
    },
    shoot(d) {
      tick();
      return client.shoot(d);
    },
    _peekAlien: () => client._peekAlien(),
    _hunt: client._hunt,
  };
}

async function main() {
  const [strategyArg, runsArg] = process.argv.slice(2);
  if (!strategyArg) {
    console.error("Usage: node scripts/sim/benchmark.js <strategy-file> [runs]");
    process.exit(1);
  }
  const runs = runsArg ? Number(runsArg) : 1000;
  const strategyFn = require(path.resolve(process.cwd(), strategyArg));

  let victories = 0;
  let timeouts = 0;
  let totalActions = 0;
  const start = Date.now();

  for (let i = 0; i < runs; i++) {
    const boxKeys = maps[i % maps.length];
    const seed = 1000 + i; // fixed per index => same games for every strategy
    const { outcome, actions } = await runOne(strategyFn, boxKeys, seed);
    totalActions += actions;
    if (outcome === "victory") {
      victories++;
      if (actions >= 4990) timeouts++;
    }
    if ((i + 1) % Math.max(1, Math.floor(runs / 20)) === 0 || i + 1 === runs) {
      const pct = (((i + 1) / runs) * 100).toFixed(0).padStart(3);
      process.stdout.write(
        `\r[${pct}%] ${i + 1}/${runs}  wins=${victories} (${((victories / (i + 1)) * 100).toFixed(1)}%)`,
      );
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write("\n");
  console.log(`Runs:        ${runs}`);
  console.log(
    `Victories:   ${victories} (${((victories / runs) * 100).toFixed(2)}%)`,
  );
  console.log(`  by timeout: ${timeouts}`);
  console.log(`Deaths:      ${runs - victories}`);
  console.log(`Avg actions: ${(totalActions / runs).toFixed(1)}`);
  console.log(`Elapsed:     ${elapsed}s`);
}

main().catch((e) => {
  console.error(e.stack ?? e);
  process.exit(1);
});

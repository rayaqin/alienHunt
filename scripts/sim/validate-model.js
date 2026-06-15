// Validate alien-model.js against the real game.js: seed a hypothesis with the
// true initial alien state, then drive a random sequence of player actions and
// confirm the model's predicted alien position matches the server's exactly.
const game = require("../../src/game");
const model = require("./alien-model");

const HARD = 2;
const STRAT_MAP = {
  "corner-search": "corner",
  "horizontal-sweep": "hsweep",
  "vertical-sweep": "vsweep",
};
const DIRS = ["up", "down", "left", "right"];

function run() {
  let games = 0;
  let mismatches = 0;
  let totalSteps = 0;
  for (let g = 0; g < 300; g++) {
    const hunt = game.createHunt({ difficulty: "hard" });
    const ctx = model.createContext(hunt.boxSet);
    const h = model.createHypothesis(
      hunt.alienPosition.x,
      hunt.alienPosition.y,
      STRAT_MAP[hunt.alienSearchStrategy],
    );
    games++;
    let steps = 0;
    while (hunt.state === "active" && steps < 400) {
      const action = Math.floor(Math.random() * 3);
      const dir = DIRS[Math.floor(Math.random() * 4)];
      const px = hunt.playerPosition.x;
      const py = hunt.playerPosition.y;

      if (action === 0) {
        // tracker: player stationary, alien moves HARD
        game.triggerAlienMovement(hunt, HARD);
        model.advanceHyp(ctx, h, px, py, HARD);
      } else if (action === 1) {
        // move
        game.movePlayer(hunt, dir, { alienMoveCount: HARD });
        const npx = hunt.playerPosition.x;
        const npy = hunt.playerPosition.y;
        // player moved first; if alien was on the new cell, game ended in death
        model.advanceHyp(ctx, h, npx, npy, HARD);
      } else {
        // shoot
        const before = hunt.state;
        const hit = game.shoot(hunt, dir, { alienMoveCount: HARD });
        if (hit) break;
        // miss: alien target becomes player pos, then moves HARD
        h.target = { x: px, y: py };
        model.advanceHyp(ctx, h, px, py, HARD);
      }
      steps++;
      totalSteps++;

      if (hunt.state === "death") {
        // alien reached player; our model should have marked dead OR be on player
        break;
      }
      if (hunt.state !== "active") break;

      if (h.x !== hunt.alienPosition.x || h.y !== hunt.alienPosition.y) {
        mismatches++;
        if (mismatches <= 10) {
          console.log(
            `MISMATCH game=${g} step=${steps} strat=${hunt.alienSearchStrategy} real=(${hunt.alienPosition.x},${hunt.alienPosition.y}) model=(${h.x},${h.y}) player=(${hunt.playerPosition.x},${hunt.playerPosition.y})`,
          );
        }
        break; // diverged; stop this game
      }
    }
  }
  console.log(
    `Games ${games}, steps ${totalSteps}, mismatches ${mismatches}`,
  );
}

run();

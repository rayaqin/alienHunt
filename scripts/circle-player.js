const {
  DELAY_MS,
  DIRECTIONS,
  movePlayer,
  shoot,
  startHunt,
  wait,
} = require("./alien-hunt-client");

async function main() {
  const hunt = await startHunt();
  const { huntId } = hunt;

  console.log(`Started hunt ${huntId}`);
  console.log(`Received ${hunt.boxes.length} boxes`);

  let step = 0;
  let state = hunt.state;

  const shootResult = await shoot(huntId, "up");
  if (shootResult.hit) {
    console.log("Somehow that worked. The alien is dead.");
    return;
  }
  console.log("Shoot missed. The alien heard you.");

  while (state !== "death") {
    const direction = DIRECTIONS[step % DIRECTIONS.length];

    await wait(DELAY_MS);

    const result = await movePlayer(huntId, direction);
    step += 1;
    state = result.state;

    console.log(
      `Step ${step}: moved ${direction}; player is at (${result.playerPosition.x}, ${result.playerPosition.y}); state is ${state}`,
    );

    if (state === "victory") {
      console.log("Unexpected victory. The circle runner is done.");
      return;
    }
  }

  console.log(`The alien caught the player after ${step} moves.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

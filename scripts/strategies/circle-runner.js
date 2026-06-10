const { DIRECTIONS, movePlayer, startHunt } = require("../alien-hunt-client");

async function main() {
  const hunt = await startHunt();
  const { huntId } = hunt;

  console.log(`Started hunt ${huntId}`);
  console.log(`Received ${hunt.boxes.length} boxes`);

  let step = 0;
  let state = hunt.state;

  while (state !== "death") {
    const direction = DIRECTIONS[step % DIRECTIONS.length];

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

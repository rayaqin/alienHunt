const { DIRECTIONS, shoot, startHunt } = require("./alien-hunt-client");

async function main() {
  const hunt = await startHunt("medium");
  const { huntId } = hunt;

  console.log(`Started hunt ${huntId}`);
  console.log(`Received ${hunt.boxes.length} boxes`);

  let step = 0;
  let state = hunt.state;

  while (state === "active") {
    const direction = DIRECTIONS[step % DIRECTIONS.length];
    const result = await shoot(huntId, direction);

    step += 1;
    state = result.state;

    console.log(
      `Step ${step}: shot ${direction}; hit is ${result.hit}; state is ${state}`,
    );
  }

  console.log(
    `Game ended after ${step} shots. The resulting state is ${state}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

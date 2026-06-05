const {
  DELAY_MS,
  DIRECTIONS,
  DELTAS,
  shoot,
  startHunt,
  wait,
  useMotionTracker,
} = require("./alien-hunt-client");

async function main() {
  const hunt = await startHunt();
  const { huntId } = hunt;

  console.log(`Started hunt ${huntId}`);
  console.log(`Received ${hunt.boxes.length} boxes`);

  let step = 0;
  let state = hunt.state;

  let shootDirection = "up";

  while (state === "active") {
    await wait(DELAY_MS);

    const result = await shoot(huntId, shootDirection);
    step++;
    state = result.state;

    console.log(`Step ${step}: shot ${shootDirection}; state is ${state}`);

    if (state === "victory") {
      console.log("Get rekt");
      return;
    }

    for (const direction of DIRECTIONS) {
      const result = await useMotionTracker(huntId, direction);
      console.log(`Motion tracker result for ${direction}: ${result.detected}`);
      if (result.detected) {
        shootDirection = direction;
        break;
      }
    }
  }
  console.log("State after loop:", state);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

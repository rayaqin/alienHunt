const {
  movePlayer,
  startHunt,
  getShortestRoute,
} = require("../alien-hunt-client");

async function main() {
  const hunt = await startHunt();
  const { huntId } = hunt;

  let step = 0;
  let state = hunt.state;

  const pathToTopLeftCornerResponse = await getShortestRoute(
    huntId,
    50,
    50,
    99,
    99,
    true,
  );

  const pathToTopLeftCorner = pathToTopLeftCornerResponse.path;

  while (pathToTopLeftCorner.length > 0) {
    const direction = pathToTopLeftCorner.shift();
    const result = await movePlayer(huntId, direction);
    state = result.state;
    step += 1;

    console.log(
      `Step ${step}: moved toward top left corner: ${direction}; player is at (${result.playerPosition.x}, ${result.playerPosition.y}); state is ${state}`,
    );
  }

  while (state === "active") {
    const runIntoBottomWallResponse = await movePlayer(huntId, "down");
    state = runIntoBottomWallResponse.state;
    step += 1;
    console.log(
      `Step ${step}: ran into top wall; player is at (${runIntoBottomWallResponse.playerPosition.x}, ${runIntoBottomWallResponse.playerPosition.y}); state is ${state}`,
    );
  }

  console.log(
    `Game ended after ${step} steps. The resulting state is ${state}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

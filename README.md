# alienHunt

A programming task that involves finding the right moment to shoot an alien predator.

A locally running backend exposes the alien hunt API at `http://localhost:2014`. A 100x100 grid with a hidden alien and randomly positioned single-block boxes is generated when the user calls the `POST /start-hunt` endpoint. All actions (vision, movement, shooting) happen either horizontally or vertically, no diagonals, so the possible directions are `'up' | 'down' | 'left' | 'right'`. The player starts on the `50, 50` block. The grid is generated in such a way that there is always a walkable path between two available blocks, so boxes don't form closed loops.

Each hunt has its own `huntId`. The `POST /start-hunt` endpoint creates a new hunt and returns the `huntId`. Every other endpoint requires that `huntId`, either in the JSON request body for `POST` endpoints or as a query parameter for `GET` endpoints.

Run the backend with `npm install` and `npm start`. Active hunts are stored in memory. Hunt stats are persisted locally in `alien-hunt.sqlite`.

Example players are available with `npm run play:circle:js` and `npm run play:circle:py`. Both start a hunt, move the player in a circle, log each action, and keep going until the alien catches the player.

Completed hunts can be replayed at `http://localhost:2014/replay` by entering a `huntId`.

## API reference

The following endpoints are available to contestants.

### `POST /start-hunt`

Starts a new hunt. This endpoint does not require a request body.

Response:

```ts
{
  huntId: string;
  boxes: Array<{ x: number; y: number }>;
  grid: Array<Array<"#" | "." | "P" | "A">>;
  state: "active" | "victory" | "death";
}
```

The `grid` matrix contains all blocks on the map. Boxes are marked with `"#"`, empty blocks are marked with `"."`, the player's starting block is marked with `"P"`, and the alien is marked with `"A"`. The alien is hidden at the start of the hunt, so `"A"` is part of the grid type but will not appear in the actual `POST /start-hunt` response.

### `POST /motion-tracker`

It accepts a JSON request body in the form `{ "huntId": string, "direction": "up" | "down" | "left" | "right" }`, and its response indicates whether the alien has been detected in that direction from the player's perspective. The motion tracker ignores boxes in the way.

Response:

```ts
{
  detected: boolean;
  state: "active" | "victory" | "death";
}
```

### `POST /move-player`

It allows the player to move to an available adjacent block. It accepts a JSON request body in the form `{ "huntId": string, "direction": "up" | "down" | "left" | "right" }`. If the player tries to move to an unavailable block (wall or box), the endpoint returns the player's existing position.

Calling `POST /move-player` also always makes the alien move to a random available adjacent block. If there is a clear line of sight between the player and the alien, the alien will move towards the player instead. Upon losing line of sight, it will keep moving (once per move call) towards the block it saw the player last. If the player shoots and misses, the alien will calculate the shortest path to the place the player shot from, and (unless it sees the player) it will keep moving on that path. After reaching its destination it will start moving randomly again.

Response:

```ts
{
  playerPosition: {
    x: number;
    y: number;
  }
  state: "active" | "victory" | "death";
}
```

### `POST /shoot`

The `POST /shoot` endpoint accepts a JSON request body in the form `{ "huntId": string, "direction": "up" | "down" | "left" | "right" }` and returns whether the alien was hit. If the endpoint returns `hit: true`, the game ends with a victory. If the shot misses, the alien hears the shot and moves one step.

Response:

```ts
{
  hit: boolean;
  state: "active" | "victory" | "death";
}
```

### `GET /shortest-route`

The `GET /shortest-route` endpoint accepts `huntId`, `aX`, `aY`, `bX`, and `bY` as query parameters, for example `/shortest-route?huntId=abc123&aX=10&aY=20&bX=30&bY=40`, and returns an array of direction strings. This is what the alien uses when it hears a missed shot.

Response:

```ts
{
  path: Array<"up" | "down" | "left" | "right">;
  state: "active" | "victory" | "death";
}
```

### `GET /line-of-sight`

The `GET /line-of-sight` endpoint accepts `huntId`, `aX`, `aY`, `bX`, and `bY` as query parameters, for example `/line-of-sight?huntId=abc123&aX=10&aY=20&bX=30&bY=40`, and its response indicates whether there is a clear line of sight from A to B, meaning there are no boxes in the way.

Response:

```ts
{
  lineOfSightClear: boolean;
  state: "active" | "victory" | "death";
}
```

### `GET /snapshots`

The `GET /snapshots` endpoint accepts `huntId` as a query parameter, for example `/snapshots?huntId=abc123`, and returns the persisted grid snapshots for that hunt. The backend creates one snapshot after each successful `POST /motion-tracker`, `POST /move-player`, or `POST /shoot` action. If the hunt has concluded, the snapshot grids reveal the alien with `"A"` on each snapshot. While the hunt is still active, the alien remains hidden.

Response:

```ts
{
  huntId: string;
  snapshots: Array<{
    sequence: number;
    action: "motion-tracker" | "move" | "shoot";
    direction: "up" | "down" | "left" | "right";
    state: "active" | "victory" | "death";
    grid: Array<Array<"#" | "." | "P" | "A">>;
    createdAt: string;
  }>;
}
```

The replay UI highlights `motion-tracker` snapshots with a green line and `shoot` snapshots with a yellow line.

## End of the game

If the alien and the player ever end up on the same block, the player character dies, and the game ends.

After a hunt ends, action endpoints for that `huntId` should return the final game state without changing the hunt further.

Calling any endpoint other than `POST /start-hunt` without a valid `huntId` should return a `404` response.

## Stats

The backend records the number of moves, shots, and motion tracker uses for each hunt. It also persists a grid snapshot after each move or shot. When a hunt ends, the final outcome is saved as either `victory` or `death`.

The `GET /stats` endpoint returns the persisted hunt stats.

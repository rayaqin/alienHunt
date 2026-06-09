# Alien Hunt

- You fell down a vertical ventilation shaft, into a completely dark storage room with locked doors.

- A Xenomorph _(a deadly alien predator)_ heard your fall and is now coming to investigate the source of the sound.

- The map is a `100x100` grid with 500 boxes that block both movement, vision and gunfire. You are at the `50,50` position, and you have the map of the area _(so you know where all the boxes are)_.

- If the alien and you are ever on the same block _(square/space)_, the alien kills you instantly, and your hunt _(game session)_ ends with **defeat**.

- You can move to 1 adjacent block at a time. Every time you move, the alien moves as well.

- You have a powerful blaster gun that disintegrates any creature it hits, but it's rays are blocked by boxes. If you manage to **shoot the alien**, it dies, and your hunt ends with **victory**. Whenever you **miss a shot**, the alien selects the block **you shot from** as it's new destination _(unless your are in it's line of sight)_, and moves **1 block closer**.

- If you survive after the **alien** has **moved** 10000 times, it loses interest and leaves through a vent, and your hunt ends with **victory**.

- All actions _(vision, movement, shooting)_ happen either horizontally or vertically, **no diagonals**. So the possible directions are always `'up'|'down'|'left'|'right'`.

- The alien has darkvision, you do not. You have a motion tracker though that shows whether the alien is present in a certain direction, even if it is behind several boxes.

<br/>

<hr>

To make the start easier, example strategies are available in the scripts folder in both JS and Python.

You can try them from the root folder by using the following commands:

- `node scripts/circle-runner.js`
- `python3 scripts/circle_runner.py`
- `node scripts/corner-runner.js`
- `python3 scripts/corner_runner.py`
- `node scripts/mindless-shooter.js`
- `python3 scripts/mindless_shooter.py`

**Circle runner** moves the player in a circle _(square, actually)_, and keeps going until the alien catches and brutally murders the player.

**Corner runner** finds the shortest path to the bottom right corner, and awaits certain death there.

**Mindless shooter** stands still and shoots clockwise until the hunt ends.

<hr>

## The API

To play a hunt, you'll need to **call** certain **endpoints**.

A locally running backend exposes the alien hunt API at `http://localhost:2014` _(if it is not running already, run the backend with `npm install` and `npm start`)_.

Each hunt has its own `huntId`. The `POST /start-hunt` endpoint creates a new hunt and returns the `huntId`, as well as the map _(grid)_. Every other endpoint requires this `huntId`, either in the JSON request body for `POST` endpoints or as a query parameter for `GET` endpoints.

Hunt stats are persisted locally in `alien-hunt.sqlite`.

Completed hunts can be replayed at `http://localhost:2014/replay` by entering the `huntId`.

**The following endpoints are available to contestants:**

### `POST /start-hunt`

Starts a new hunt, spawns the alien at a random available block, and sets the player's starting position as the alien's target destination. This endpoint accepts an optional JSON request body in the form `{ "difficulty": "easy" | "medium" | "hard" }`. If no difficulty is provided, the hunt starts on `easy`. **The docs describe the alien's behaviour on `easy` difficulty.**

- `easy`: the alien is at a big disadvantage
- `medium`: a clever strategy is needed
- `hard`: survival without luck is a truly impressive feat

Response:

```ts
{
  huntId: string;
  boxes: Array<{ x: number; y: number }>;
  difficulty: "easy" | "medium" | "hard";
  grid: Array<Array<"#" | "." | "P" | "A">>;
  state: "active" | "victory" | "death";
}
```

The `grid` matrix contains all blocks on the map. Boxes are marked with `"#"`, empty blocks are marked with `"."`, the player's starting block is marked with `"P"`, and the alien would be marked with `"A"`. The alien is hidden at the start of the hunt, so `"A"` is part of the grid type but will not appear in the actual `POST /start-hunt` response.

<hr>

### `POST /motion-tracker`

It accepts a JSON request body in the form `{ "huntId": string, "direction": "up" | "down" | "left" | "right" }`, and its response indicates whether the alien has been detected in that direction from the player's perspective. **The motion tracker ignores boxes in the way.**

Response:

```ts
{
  detected: boolean;
  state: "active" | "victory" | "death";
}
```

<hr>

### `POST /move-player`

It allows the player to move to an available adjacent block. It accepts a JSON request body in the form `{ "huntId": string, "direction": "up" | "down" | "left" | "right" }`, and returns the player's new position. If the player tries to move to an unavailable block _(wall or box)_, the endpoint returns the player's existing position.

Calling `POST /move-player` also **always makes the alien move**.

- If it has no information about the player, it will search according to one of its randomly selected hunt strategies.
- If there is a clear line of sight between the player and the alien, the alien will move towards the player instead. Upon losing line of sight, it will keep moving (once per move call) towards the block it saw the player last.
- If the player **shoots** and misses, the alien will calculate the shortest path from it's own position to the place the player **shot from**, and _(unless it sees the player or hears another shot)_ it will **keep moving** on that path. After reaching its destination it will start using its selected search strategy again. **This same mechanism is also triggered at the start of the hunt, when the player falls down.**

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

<hr>

### `POST /shoot`

The `POST /shoot` endpoint accepts a JSON request body in the form `{ "huntId": string, "direction": "up" | "down" | "left" | "right" }` and returns whether the alien was hit. If the endpoint returns `hit: true`, the game ends with a victory. If the shot misses, the alien hears the shot and moves one step.

Response:

```ts
{
  hit: boolean;
  state: "active" | "victory" | "death";
}
```

<hr>

### `GET /shortest-route`

The `GET /shortest-route` endpoint accepts `huntId`, `aX`, `aY`, `bX`, and `bY` as query parameters, for example `/shortest-route?huntId=abc123&aX=10&aY=20&bX=30&bY=40`, and returns an array of direction strings. This is what the alien uses when it hears a missed shot.

Response:

```ts
{
  path: Array<"up" | "down" | "left" | "right">;
  state: "active" | "victory" | "death";
}
```

<hr>

### `GET /line-of-sight`

The `GET /line-of-sight` endpoint accepts `huntId`, `aX`, `aY`, `bX`, and `bY` as query parameters, for example `/line-of-sight?huntId=abc123&aX=10&aY=20&bX=30&bY=40`, and its response indicates whether there is a clear line of sight from A to B, meaning there are no boxes in the way.

Response:

```ts
{
  lineOfSightClear: boolean;
  state: "active" | "victory" | "death";
}
```

<hr>

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

## End of a hunt

After a hunt ends, endpoints for that `huntId` should return the final game state without changing the hunt further.

Calling any endpoint other than `POST /start-hunt` without a valid `huntId` should return a `404` response.

## Stats

The backend records the selected difficulty, alien search strategy, number of moves, shots, and motion tracker uses for each hunt. It also persists a grid snapshot after each move or shot. When a hunt ends, the final outcome is saved as either `victory` or `death`.

The `GET /stats` endpoint returns the persisted hunt stats.

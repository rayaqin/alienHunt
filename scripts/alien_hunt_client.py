import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = os.environ.get("ALIEN_HUNT_URL", "http://localhost:2014")
DIRECTIONS = ["right", "down", "left", "up"]
DELTAS = {
    "right": {"x": 1, "y": 0},
    "down": {"x": 0, "y": 1},
    "left": {"x": -1, "y": 0},
    "up": {"x": 0, "y": -1},
}
DELAY_SECONDS = 0.1


def start_hunt():
    """Starts a new hunt. Params: none. Returns: { huntId, boxes, grid, state }."""
    return post("/start-hunt")


def use_motion_tracker(hunt_id, direction):
    """Checks one direction with the motion tracker. Params: hunt_id, direction. Returns: { detected, state }."""
    return post("/motion-tracker", {"huntId": hunt_id, "direction": direction})


def move_player(hunt_id, direction):
    """Moves the player one step if possible. Params: hunt_id, direction. Returns: { playerPosition, state }."""
    return post("/move-player", {"huntId": hunt_id, "direction": direction})


def shoot(hunt_id, direction):
    """Shoots in one direction. Params: hunt_id, direction. Returns: { hit, state }."""
    return post("/shoot", {"huntId": hunt_id, "direction": direction})


def get_shortest_route(hunt_id, a_x, a_y, b_x, b_y):
    """Finds a shortest path from A to B. Params: hunt_id, a_x, a_y, b_x, b_y. Returns: { path, state }."""
    return get(
        "/shortest-route",
        {"huntId": hunt_id, "aX": a_x, "aY": a_y, "bX": b_x, "bY": b_y},
    )


def get_line_of_sight(hunt_id, a_x, a_y, b_x, b_y):
    """Checks whether A can see B. Params: hunt_id, a_x, a_y, b_x, b_y. Returns: { lineOfSightClear, state }."""
    return get(
        "/line-of-sight",
        {"huntId": hunt_id, "aX": a_x, "aY": a_y, "bX": b_x, "bY": b_y},
    )


def get_stats():
    """Lists persisted hunt stats. Params: none. Returns: { stats }."""
    return get("/stats")


def get_snapshots(hunt_id):
    """Lists grid snapshots for a hunt. Params: hunt_id. Returns: { huntId, snapshots }."""
    return get("/snapshots", {"huntId": hunt_id})


def post(path, body=None):
    data = None
    headers = {}

    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"

    request = Request(f"{BASE_URL}{path}", data=data, headers=headers, method="POST")

    try:
        with urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        message = error.read().decode("utf-8")
        raise RuntimeError(f"{path} failed with {error.code}: {message}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach {BASE_URL}: {error.reason}") from error


def get(path, params=None):
    query = urlencode(params or {})
    url = f"{BASE_URL}{path}?{query}" if query else f"{BASE_URL}{path}"

    try:
        with urlopen(url) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        message = error.read().decode("utf-8")
        raise RuntimeError(f"{path} failed with {error.code}: {message}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach {BASE_URL}: {error.reason}") from error


def wait(seconds=DELAY_SECONDS):
    time.sleep(seconds)


def write_grid_to_console(grid):
    for row in grid:
        print("".join(row))

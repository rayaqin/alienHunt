import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alien_hunt_client import get_shortest_route, move_player, start_hunt


def main():
    hunt = start_hunt()
    hunt_id = hunt["huntId"]

    step = 0
    state = hunt["state"]

    path_to_top_left_corner_response = get_shortest_route(
        hunt_id,
        50,
        50,
        99,
        99,
    )
    path_to_top_left_corner = path_to_top_left_corner_response["path"]

    while path_to_top_left_corner:
        direction = path_to_top_left_corner.pop(0)
        result = move_player(hunt_id, direction)
        state = result["state"]
        step += 1
        player_position = result["playerPosition"]

        print(
            f"Step {step}: moved toward top left corner: {direction}; "
            f"player is at ({player_position['x']}, {player_position['y']}); "
            f"state is {state}"
        )

    while state == "active":
        run_into_bottom_wall_response = move_player(hunt_id, "down")
        state = run_into_bottom_wall_response["state"]
        step += 1
        player_position = run_into_bottom_wall_response["playerPosition"]

        print(
            f"Step {step}: ran into top wall; "
            f"player is at ({player_position['x']}, {player_position['y']}); "
            f"state is {state}"
        )

    print(f"Game ended after {step} steps. The resulting state is {state}.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        sys.exit(1)

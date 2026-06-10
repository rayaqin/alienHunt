import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alien_hunt_client import DIRECTIONS, move_player, start_hunt


def main():
    hunt = start_hunt()
    hunt_id = hunt["huntId"]

    print(f"Started hunt {hunt_id}")
    print(f"Received {len(hunt['boxes'])} boxes")

    step = 0
    state = hunt["state"]

    while state != "death":
        direction = DIRECTIONS[step % len(DIRECTIONS)]

        result = move_player(hunt_id, direction)
        step += 1
        state = result["state"]
        player_position = result["playerPosition"]

        print(
            f"Step {step}: moved {direction}; "
            f"player is at ({player_position['x']}, {player_position['y']}); "
            f"state is {state}"
        )

        if state == "victory":
            print("Unexpected victory. The circle runner is done.")
            return

    print(f"The alien caught the player after {step} moves.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        sys.exit(1)

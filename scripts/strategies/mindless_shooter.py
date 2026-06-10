import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alien_hunt_client import DIRECTIONS, shoot, start_hunt


def main():
    hunt = start_hunt()
    hunt_id = hunt["huntId"]

    print(f"Started hunt {hunt_id}")
    print(f"Received {len(hunt['boxes'])} boxes")

    step = 0
    state = hunt["state"]

    while state == "active":
        direction = DIRECTIONS[step % len(DIRECTIONS)]
        result = shoot(hunt_id, direction)

        step += 1
        state = result["state"]

        print(
            f"Step {step}: shot {direction}; "
            f"hit is {result['hit']}; "
            f"state is {state}"
        )

    print(f"Game ended after {step} shots. The resulting state is {state}.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        sys.exit(1)

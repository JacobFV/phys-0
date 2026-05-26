#!/usr/bin/env python3
"""Assign one connected Feetech STS3215 servo to a target ID.

This is intentionally a one-servo recovery tool. If multiple servos share the
same current ID, they cannot be addressed independently while connected to the
same bus. Disconnect all but the one physical servo you want to program.
"""

from __future__ import annotations

import argparse
import sys

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus
from lerobot.motors.feetech.tables import SCAN_BAUDRATES


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--target-id", type=int, required=True)
    parser.add_argument("--initial-id", type=int)
    parser.add_argument("--initial-baud", type=int)
    parser.add_argument("--max-id", type=int, default=12)
    parser.add_argument("--yes", action="store_true")
    return parser.parse_args()


def scan(bus: FeetechMotorsBus, max_id: int) -> list[tuple[int, int, int]]:
    hits: list[tuple[int, int, int]] = []
    for baud in SCAN_BAUDRATES:
        bus.set_baudrate(baud)
        for servo_id in range(max_id + 1):
            model = bus.ping(servo_id, num_retry=1, raise_on_error=False)
            if model is not None:
                hits.append((baud, servo_id, int(model)))
    return hits


def main() -> int:
    args = parse_args()
    if not 0 <= args.target_id <= 253:
        raise SystemExit("--target-id must be in 0..253")

    motor = Motor(args.target_id, "sts3215", MotorNormMode.DEGREES)
    bus = FeetechMotorsBus(port=args.port, motors={"servo": motor})
    try:
        bus.connect(handshake=False)
        before = scan(bus, args.max_id)
        print(f"Before: {before}")

        visible_ids = {(baud, servo_id, model) for baud, servo_id, model in before}
        if args.initial_id is None or args.initial_baud is None:
            if len(visible_ids) != 1:
                print(
                    "Expected exactly one visible servo. Disconnect all but one, "
                    "or pass --initial-id and --initial-baud if you are certain.",
                    file=sys.stderr,
                )
                return 2
            initial_baud, initial_id, _ = next(iter(visible_ids))
        else:
            initial_baud = args.initial_baud
            initial_id = args.initial_id

        print(f"Will set servo at baud {initial_baud}, id {initial_id} -> id {args.target_id}")
        if initial_baud == 1_000_000 and initial_id == args.target_id:
            print("Already at target ID and baud; no write needed.")
            return 0

        if not args.yes:
            reply = input("Continue? Type 'yes': ").strip().lower()
            if reply != "yes":
                print("Canceled.")
                return 1

        bus.setup_motor("servo", initial_baudrate=initial_baud, initial_id=initial_id)
        after = scan(bus, args.max_id)
        print(f"After: {after}")
        if (1_000_000, args.target_id, 777) not in after:
            print("Target ID was not verified after write.", file=sys.stderr)
            return 3
        return 0
    finally:
        if bus.is_connected:
            bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    raise SystemExit(main())

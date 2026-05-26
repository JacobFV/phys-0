#!/usr/bin/env python3
"""Line-delimited JSON bridge from Node to the Python LeRobot/OpenCV core."""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from phys0.core import HANDLERS, RESOURCES, TOOLS, STATE, read_resource  # noqa: E402


def format_error(exc: Exception) -> str:
    if isinstance(exc, ModuleNotFoundError) and exc.name == "lerobot":
        return (
            "Python dependency 'lerobot' is not installed in the interpreter used by phys-0. "
            "Create the repo virtualenv and install dependencies with: "
            "python -m venv .venv && .venv/bin/python -m pip install --upgrade pip && "
            ".venv/bin/python -m pip install -r requirements.txt\n"
            f"{traceback.format_exc(limit=8)}"
        )
    return f"{exc}\n{traceback.format_exc(limit=8)}"


def respond(message_id: Any, result: Any = None, error: str | None = None) -> None:
    payload: dict[str, Any] = {"id": message_id}
    if error is None:
        payload["result"] = result
    else:
        payload["error"] = error
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def handle(message: dict[str, Any]) -> Any:
    method = message.get("method")
    params = message.get("params") or {}

    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "resources/list":
        return {"resources": RESOURCES}
    if method == "resources/read":
        return read_resource(str(params.get("uri", "")))
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if name not in HANDLERS:
            raise ValueError(f"Unknown tool: {name}")
        return HANDLERS[name](args)
    raise ValueError(f"Unknown bridge method: {method}")


def main() -> int:
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            message = json.loads(line)
            try:
                respond(message.get("id"), handle(message))
            except Exception as exc:
                respond(message.get("id"), error=format_error(exc))
    finally:
        if STATE.connected:
            STATE.robot.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

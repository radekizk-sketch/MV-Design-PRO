#!/usr/bin/env python3
"""
Backend dead-code guard powered by vulture.

Scans only backend source code to keep the signal focused and the workflow safe.
Install the backend dev dependencies first:
    poetry install --with dev
Run from the repository root:
    python scripts/vulture_guard.py
"""

from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
BACKEND_DIR = PROJECT_ROOT / "backend"


def _run_vulture(command: list[str], cwd: Path) -> int:
    result = subprocess.run(command, cwd=cwd, check=False)
    if result.returncode == 0:
        print("vulture-guard: OK (backend/src clean)")
    return result.returncode


def main() -> int:
    if importlib.util.find_spec("vulture") is None:
        poetry = shutil.which("poetry")
        if poetry is None:
            print(
                "vulture-guard: missing dependency. Install backend dev dependencies with "
                "`poetry install --with dev`.",
                file=sys.stderr,
            )
            return 2
        return _run_vulture(
            [
                poetry,
                "run",
                "python",
                "-m",
                "vulture",
                str(BACKEND_SRC),
                "--min-confidence",
                "80",
            ],
            cwd=BACKEND_DIR,
        )

    return _run_vulture(
        [
            sys.executable,
            "-m",
            "vulture",
            str(BACKEND_SRC),
            "--min-confidence",
            "80",
        ],
        cwd=PROJECT_ROOT,
    )


if __name__ == "__main__":
    raise SystemExit(main())

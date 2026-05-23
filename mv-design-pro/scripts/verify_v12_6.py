from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
BACKEND_DIR = ROOT / "backend"


@dataclass(frozen=True)
class Step:
    name: str
    cwd: Path
    command: list[str]
    timeout_seconds: int = 1200


def _run(step: Step) -> int:
    started = perf_counter()
    command = step.command
    if sys.platform.startswith("win"):
        command = ["cmd", "/d", "/s", "/c", subprocess.list2cmdline(step.command)]
    print(f"==> {step.name}")
    completed = subprocess.run(
        command,
        cwd=step.cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=step.timeout_seconds,
    )
    duration = perf_counter() - started
    print(f"<== {step.name}: exit={completed.returncode} duration={duration:.1f}s")
    return completed.returncode


def main() -> int:
    steps = [
        Step("Mojibake guard", ROOT, [sys.executable, str(ROOT / "scripts/utf8_mojibake_guard.py")]),
        Step("Docs archive guard", ROOT, [sys.executable, str(ROOT / "scripts/docs_archive_guard.py")]),
        Step("V12.xx canon guard", ROOT, [sys.executable, str(ROOT / "scripts/v12xx_canon_guard.py")]),
        Step("API lifecycle guard", ROOT, [sys.executable, str(ROOT / "scripts/api_lifecycle_guard.py")]),
        Step("Legacy public path guard", ROOT, [sys.executable, str(ROOT / "scripts/legacy_public_path_guard.py")]),
        Step(
            "Backend V12.6 tests",
            BACKEND_DIR,
            ["poetry", "run", "pytest", "tests/test_v126_academic_solver.py"],
        ),
        Step(
            "Frontend V12.6 registry tests",
            FRONTEND_DIR,
            [
                "npm",
                "run",
                "test",
                "--",
                "--run",
                "src/ui/workspace/__tests__/screen-canon-registry.test.ts",
                "src/ui/workspace/__tests__/screen-registry-coverage.test.ts",
            ],
        ),
        Step("Frontend type-check", FRONTEND_DIR, ["npm", "run", "type-check"]),
        Step("Frontend lint", FRONTEND_DIR, ["npm", "run", "lint"]),
        Step(
            "Backend V12.6 ruff",
            BACKEND_DIR,
            [
                "poetry",
                "run",
                "ruff",
                "check",
                "src/api/v126_academic.py",
                "src/solver_input/v126_contracts.py",
                "src/network_model/solvers/v126_academic.py",
                "tests/test_v126_academic_solver.py",
            ],
        ),
    ]
    for step in steps:
        code = _run(step)
        if code != 0:
            return code
    print("verify:v12.6: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

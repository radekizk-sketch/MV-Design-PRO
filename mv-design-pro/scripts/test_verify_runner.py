from __future__ import annotations

import sys
from pathlib import Path

import verify_v12_5 as verifier


def test_run_step_reports_timeout() -> None:
    step = verifier.Step(
        name="timeout smoke",
        cwd=Path.cwd(),
        command=[
            sys.executable,
            "-c",
            "__import__('time').sleep(2)",
        ],
        timeout_seconds=1,
    )

    result = verifier.run_step(step)

    assert result.exit_code == 124
    assert "timeout of 1 seconds" in result.stderr_tail


def test_run_step_keeps_success_contract() -> None:
    step = verifier.Step(
        name="success smoke",
        cwd=Path.cwd(),
        command=[sys.executable, "-c", "print(123)"],
        timeout_seconds=10,
    )

    result = verifier.run_step(step)

    assert result.ok
    assert result.stdout_tail == "123"

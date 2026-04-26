from __future__ import annotations

from pathlib import Path

import severity_contract_guard as guard


def write_py(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_guard_rejects_inline_validation_status(tmp_path, monkeypatch) -> None:
    boundary = write_py(
        tmp_path,
        "boundary.py",
        """
def failed(validation):
    return validation.status == "FAIL"
""",
    )
    monkeypatch.setattr(guard, "VALIDATION_BOUNDARY_FILES", (boundary,))
    monkeypatch.setattr(guard, "SEVERITY_CONTRACT_PATH", Path(__file__).resolve())

    violations = guard.check_no_inline_validation_severity()

    assert any("[severity-inline-literal]" in violation for violation in violations)
    assert any("'FAIL'" in violation for violation in violations)


def test_guard_accepts_contract_helper_usage(tmp_path, monkeypatch) -> None:
    boundary = write_py(
        tmp_path,
        "boundary.py",
        """
from enm.severity import is_failed_status

def failed(validation):
    return is_failed_status(validation.status)
""",
    )
    monkeypatch.setattr(guard, "VALIDATION_BOUNDARY_FILES", (boundary,))

    assert guard.check_no_inline_validation_severity() == []


def test_guard_requires_public_contract_symbols(tmp_path, monkeypatch) -> None:
    contract = write_py(
        tmp_path,
        "severity.py",
        """
SEVERITY_BLOCKER = "BLOCKER"
""",
    )
    monkeypatch.setattr(guard, "SEVERITY_CONTRACT_PATH", contract)

    violations = guard.check_contract_exports()

    assert any("[severity-contract-symbol]" in violation for violation in violations)
    assert any("empty_severity_counts" in violation for violation in violations)

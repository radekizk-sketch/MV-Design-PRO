from __future__ import annotations

from pathlib import Path

import reference_networks_guard as guard


def write_doc(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_guard_reports_missing_reference_network_row(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_TESTOW_V12_XX.md",
        """
| Kod | Nazwa | Zakres |
|---|---|---|
| V12-GN-001 | Siec zwarciowa pelna | Zwarcia asymetryczne |
""",
    )
    monkeypatch.setattr(guard, "TEST_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(
        guard,
        "REQUIRED_REFERENCE_CODES",
        {
            "V12-GN-001": (tmp_path / "gn01.py",),
            "V12-GN-002": (tmp_path / "gn02.py",),
        },
    )
    (tmp_path / "gn01.py").write_text("pass\n", encoding="utf-8")

    violations = guard.check_reference_networks_matrix()

    assert any("[reference-matrix-code]" in violation for violation in violations)
    assert any("V12-GN-002" in violation for violation in violations)


def test_guard_accepts_complete_reference_matrix(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_TESTOW_V12_XX.md",
        """
| Kod | Nazwa | Zakres |
|---|---|---|
| V12-GN-001 | Siec zwarciowa pelna | Zwarcia asymetryczne |
| V12-GN-002 | Siec z izolowanym punktem neutralnym | Petersena i uziemienie |
""",
    )
    monkeypatch.setattr(guard, "TEST_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(
        guard,
        "REQUIRED_REFERENCE_CODES",
        {
            "V12-GN-001": (tmp_path / "gn01.py",),
            "V12-GN-002": (tmp_path / "gn02.py",),
        },
    )
    (tmp_path / "gn01.py").write_text("pass\n", encoding="utf-8")
    (tmp_path / "gn02.py").write_text("pass\n", encoding="utf-8")

    assert guard.check_reference_networks_matrix() == []

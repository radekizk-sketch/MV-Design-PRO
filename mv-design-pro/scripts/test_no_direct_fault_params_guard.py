"""Testy bramki `no_direct_fault_params_guard` (audyt 2026-08-01, defekt D3).

Intencja: bramka od narodzin skanowała 0 plików (zdublowany segment `mv-design-pro`
w BACKEND_SRC) i kończyła się kodem 0 — fałszywa zieleń przez całe życie repo.
Te testy pilnują trzech rzeczy naraz:
  1. bramka GRYZIE na naruszeniu (RC=1),
  2. bramka PRZEPUSZCZA czysty katalog (RC=0),
  3. PUSTY SKAN (brak korzenia / 0 plików) to RC=1, nigdy RC=0,
  4. korzeń skanowania w repo istnieje i zawiera pliki (regresja samej ścieżki).

Kod wyjścia jest zawsze odbierany bezpośrednio (`main()` / `returncode`),
nigdy przez potok.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import no_direct_fault_params_guard as guard

VIOLATING_SOURCE = """\
from application.solvers.short_circuit_binding import execute_short_circuit


def compute(graph, node):
    fault_node_id = node
    return execute_short_circuit(graph, fault_node_id=fault_node_id)
"""

CLEAN_SOURCE = """\
from domain.fault_scenario import FaultScenario


def compute(graph, scenario: FaultScenario):
    return scenario.to_dict()
"""


def _make_src_tree(tmp_path: Path, files: dict[str, str]) -> Path:
    root = tmp_path / "src"
    for relative, content in files.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    root.mkdir(parents=True, exist_ok=True)
    return root


def test_guard_fails_on_violating_file(tmp_path, monkeypatch, capsys) -> None:
    root = _make_src_tree(tmp_path, {"api/evil_endpoint.py": VIOLATING_SOURCE})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "evil_endpoint.py" in out
    assert "fault_node_id" in out
    assert "execute_short_circuit" in out


def test_guard_passes_on_clean_tree_and_reports_scanned_count(
    tmp_path, monkeypatch, capsys
) -> None:
    root = _make_src_tree(tmp_path, {"api/clean_endpoint.py": CLEAN_SOURCE})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 0
    assert "Scanned 1 Python file(s)" in out


def test_whitelisted_file_is_allowed(tmp_path, monkeypatch) -> None:
    root = _make_src_tree(
        tmp_path,
        {"application/solvers/short_circuit_binding.py": VIOLATING_SOURCE},
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.main() == 0


def test_file_outside_scan_root_is_not_silently_whitelisted(tmp_path, monkeypatch) -> None:
    """Regresja drugiej warstwy pustki: ValueError z relative_to zwracał True."""
    root = _make_src_tree(tmp_path, {"api/clean_endpoint.py": CLEAN_SOURCE})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    outsider = tmp_path / "poza_korzeniem" / "evil.py"
    outsider.parent.mkdir(parents=True, exist_ok=True)
    outsider.write_text(VIOLATING_SOURCE, encoding="utf-8")

    assert guard.is_whitelisted(outsider) is False
    assert guard.check_file(outsider) != []


def test_empty_scan_is_a_failure(tmp_path, monkeypatch, capsys) -> None:
    """Katalog istnieje, ale nie ma w nim ani jednego pliku .py — to RC=1."""
    root = tmp_path / "src"
    root.mkdir()
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "Scanned 0 Python file(s)" in out
    assert "Empty scan" in out


def test_missing_scan_root_is_a_failure(tmp_path, monkeypatch, capsys) -> None:
    """Zepsuta ścieżka (dokładnie defekt D3) musi zapalić bramkę, nie ją wyciszyć."""
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "nie" / "ma" / "takiego")

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "Backend source directory not found" in out


def test_repo_scan_root_exists_and_is_not_empty() -> None:
    """Sama ścieżka w repo: korzeń musi istnieć i zawierać pliki źródłowe."""
    assert guard.BACKEND_SRC.is_dir(), f"brak korzenia skanowania: {guard.BACKEND_SRC}"
    assert guard.BACKEND_TESTS.is_dir(), f"brak korzenia testów: {guard.BACKEND_TESTS}"
    assert len(list(guard.BACKEND_SRC.rglob("*.py"))) > 0


def test_guard_process_reports_nonzero_scan_on_repo() -> None:
    """Uruchomienie realnym procesem — kod wyjścia i licznik brane bezpośrednio."""
    script = Path(guard.__file__).resolve()
    completed = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        text=True,
        cwd=str(script.parent.parent),
        check=False,
    )

    assert completed.returncode in (0, 1), completed.stdout + completed.stderr
    assert "skipping guard" not in completed.stdout
    match = re.search(r"Scanned (\d+) Python file\(s\)", completed.stdout)
    assert match is not None, f"bramka nie zaraportowała liczby plików:\n{completed.stdout}"
    assert int(match.group(1)) > 0, "pusty skan — bramka niczego nie ogląda"


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

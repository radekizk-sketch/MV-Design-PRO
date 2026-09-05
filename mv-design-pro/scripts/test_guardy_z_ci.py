"""Testy wlasne `guardy_z_ci.py` (bramka odbioru = to, co robi CI).

Regula KLASA par. 4: deklaracja "uruchamia lint dokladnie tak, jak CI" ma
przypiety test — po czerwonych runach 4879/4881 (black na dwoch skryptach
guardow, bramka meldowala komplet zielony) narzedzie dostalo trzecia czesc
kroku CI i ta czesc musi byc sprawdzalna bez uruchamiania calego zestawu.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import guardy_z_ci as runner

WORKFLOW_PYTHON_TESTS = runner.WORKFLOWS_DIR / "python-tests.yml"


def test_lint_jak_ci_odwzorowuje_krok_workflowa_co_do_polecen() -> None:
    """Cztery wywolania z `python-tests.yml` (black/ruff dla src tests i ../scripts)."""
    tekst = WORKFLOW_PYTHON_TESTS.read_text(encoding="utf-8")
    for _nazwa, polecenie in runner.LINT_JAK_CI:
        wzorzec = r"poetry run " + re.escape(" ".join(polecenie))
        assert re.search(wzorzec, tekst), f"workflow nie wola: {' '.join(polecenie)}"
    assert len(runner.LINT_JAK_CI) == 4


def test_lint_jak_ci_melduje_czerwone_wywolanie_po_nazwie(monkeypatch) -> None:
    wywolane: list[list[str]] = []

    def _run(polecenie, **_kwargs):
        wywolane.append(list(polecenie))
        czerwone = "--config" in polecenie  # black ../scripts
        return subprocess.CompletedProcess(polecenie, 1 if czerwone else 0, "", "would reformat x")

    monkeypatch.setattr(runner.subprocess, "run", _run)

    assert runner._lint_jak_ci() == ["black ../scripts"]
    assert len(wywolane) == len(runner.LINT_JAK_CI)
    assert all(p[:2] == [runner.sys.executable, "-m"] for p in wywolane)


def test_lint_jak_ci_uruchamia_z_katalogu_backendu(monkeypatch) -> None:
    katalogi: list[Path] = []

    def _run(polecenie, **kwargs):
        katalogi.append(Path(kwargs["cwd"]))
        return subprocess.CompletedProcess(polecenie, 0, "", "")

    monkeypatch.setattr(runner.subprocess, "run", _run)

    assert runner._lint_jak_ci() == []
    assert set(katalogi) == {runner.PROJECT_ROOT / "backend"}

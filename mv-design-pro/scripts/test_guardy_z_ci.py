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


def test_wywolania_z_workflowow_niosa_argumenty_kroku(monkeypatch, tmp_path) -> None:
    """Regresja odbioru K2 (2026-09-09): `port_binding_guard.py --strict` na CI
    zwraca 1 przy brakujacych portach, bez `--strict` zwraca 0 — bramka odbioru
    swiecila na zielono, P0 Extended na CI byl czerwony. Argumenty z linii `run:`
    sa czescia wywolania; rozne zestawy argumentow = rozne wywolania."""
    (tmp_path / "a.yml").write_text(
        "steps:\n"
        "  - run: $GUARD_PY scripts/port_binding_guard.py --strict\n"
        "  - run: python scripts/port_binding_guard.py\n"
        "  - run: python3 mv-design-pro/scripts/docs_guard.py  # komentarz\n"
        "  - run: python scripts/x_guard.py --a 1 && echo ok\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(runner, "WORKFLOWS_DIR", tmp_path)

    assert runner.wywolania_z_workflowow() == [
        ("docs_guard", ()),
        ("port_binding_guard", ()),
        ("port_binding_guard", ("--strict",)),
        ("x_guard", ("--a", "1")),
    ]
    assert runner.guardy_z_workflowow() == ["docs_guard", "port_binding_guard", "x_guard"]


def test_npm_jak_ci_odwzorowuje_kroki_workflowa_frontendu() -> None:
    """Kazdy krok `NPM_JAK_CI` jest krokiem `run:` w `frontend-checks.yml` i
    odwrotnie: kazdy `npm run <skrypt>` workflowu poza `npm ci`/testami jest na
    liscie (2026-09-10: eslint z `--report-unused-disable-directives` czerwony
    na CI, bramka odbioru bez tego kroku meldowala komplet zielony)."""
    tekst = runner.WORKFLOW_FRONTEND.read_text(encoding="utf-8")
    for skrypt in runner.NPM_JAK_CI:
        assert f"run: npm run {skrypt}" in tekst, f"workflow nie wola: npm run {skrypt}"
    wolane = set(re.findall(r"run: npm run ([a-z:-]+)", tekst))
    # Testy jednostkowe (vitest) sa osobna, ciezka czescia lancucha odbioru —
    # poza ta bramka, tak jak pelny pytest jest poza nia po stronie backendu.
    assert wolane - {"test:ci", "test"} == set(runner.NPM_JAK_CI)


def test_npm_jak_ci_melduje_czerwony_krok_po_nazwie(monkeypatch, tmp_path) -> None:
    (tmp_path / "node_modules").mkdir()
    monkeypatch.setattr(runner, "PROJECT_ROOT", tmp_path.parent)
    (tmp_path.parent / "frontend").mkdir(exist_ok=True)
    (tmp_path.parent / "frontend" / "node_modules").mkdir(exist_ok=True)
    wywolane: list[list[str]] = []

    def _run(polecenie, **_kwargs):
        wywolane.append(list(polecenie))
        czerwone = polecenie[-1] == "lint"
        return subprocess.CompletedProcess(polecenie, 1 if czerwone else 0, "", "1 problem")

    monkeypatch.setattr(runner.subprocess, "run", _run)

    assert runner._npm_jak_ci() == ["npm run lint"]
    assert [p[:2] for p in wywolane] == [["npm", "run"]] * len(runner.NPM_JAK_CI)


def test_npm_jak_ci_bez_node_modules_jest_czerwone_nie_pominiete(monkeypatch, tmp_path) -> None:
    """Brak `node_modules` = kroki CI niewykonane = bramka czerwona (zero cichego
    pominiecia: CI te kroki wykonuje zawsze)."""
    monkeypatch.setattr(runner, "PROJECT_ROOT", tmp_path)
    (tmp_path / "frontend").mkdir()

    def _run(polecenie, **_kwargs):
        raise AssertionError("bez node_modules nic nie powinno sie uruchomic")

    monkeypatch.setattr(runner.subprocess, "run", _run)

    assert runner._npm_jak_ci() == ["npm run type-check", "npm run lint"]


def test_realne_workflowy_wolaja_port_binding_guard_ze_strict() -> None:
    """Pin stanu repozytorium: P0 Extended wola `port_binding_guard.py --strict`
    — jesli ten wpis zniknie, zmienil sie workflow, nie ten test."""
    assert ("port_binding_guard", ("--strict",)) in runner.wywolania_z_workflowow()

"""Regresja defektu CI: guardy delta-owe padaly TRACEBACKIEM w klonie glebokosci 1.

Znalezisko z logow CI (2026-07-25, workflow „P0 Extended Guards", commit 0cd8e92f):
``solver_boundary_guard`` i ``resultset_v1_schema_guard`` wolaly
``git diff origin/main...HEAD`` z ``check=True``, a w bloku ``except`` wolaly
``git diff HEAD~1`` — TEZ z ``check=True``. Na runnerze z domyslnym
``actions/checkout`` (glebokosc 1) nie ma ani ``origin/main``, ani ``HEAD~1``,
wiec oba wywolania konczyly sie kodem 128 i skrypt padal wyjatkiem.

Skutek byl grozniejszy niz czerwony krok: workflow przerywal sie na TRZECIM z
pietnastu krokow, wiec 12 kolejnych guardow (overlay no-physics, determinizm
trace i scenariuszy, terminologia UI, mojibake, kanon V12.xx, kontrakt severity,
schemat ResultSet, port binding) NIGDY sie nie wykonalo.

Ten test odtwarza DOKLADNIE te sytuacje (repozytorium z jednym commitem, bez
zdalnej galezi bazowej) i pilnuje dwoch rzeczy:
1. guard konczy sie WERDYKTEM, nie tracebackiem,
2. werdykt jest fail-closed: brak bazy nie moze znaczyc „nic sie nie zmienilo".
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

GUARDY_DELTA_OWE = ("solver_boundary_guard", "resultset_v1_schema_guard")


def _git(cwd: Path, *argumenty: str) -> None:
    subprocess.run(["git", *argumenty], cwd=cwd, check=True, capture_output=True)


def _repo_bez_bazy(katalog: Path) -> Path:
    """Repozytorium jak klon glebokosci 1: jeden commit, brak origin/main."""
    katalog.mkdir(parents=True, exist_ok=True)
    _git(katalog, "init", "-q", "-b", "robocza")
    _git(katalog, "config", "user.email", "ci@example.test")
    _git(katalog, "config", "user.name", "CI")
    (katalog / "plik.txt").write_text("pierwsza wersja\n", encoding="utf-8")
    _git(katalog, "add", "plik.txt")
    _git(katalog, "commit", "-q", "-m", "pierwszy commit")
    return katalog


def _uruchom_helper(cwd: Path) -> subprocess.CompletedProcess[str]:
    kod = (
        f"import sys; sys.path.insert(0, r'{SCRIPTS_DIR}');"
        "from guard_diff_base import zmienione_pliki;"
        "w = zmienione_pliki();"
        "print('OK' if w.ok else 'BRAK_BAZY');"
        "print(w.baza);"
        "print(len(w.pliki) if w.pliki is not None else -1)"
    )
    return subprocess.run(
        [sys.executable, "-c", kod],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


def test_helper_bez_bazy_zwraca_werdykt_a_nie_wyjatek(tmp_path) -> None:
    wynik = _uruchom_helper(_repo_bez_bazy(tmp_path / "shallow"))

    assert wynik.returncode == 0, wynik.stderr
    assert "Traceback" not in wynik.stderr
    assert wynik.stdout.splitlines()[0] == "BRAK_BAZY"


def test_helper_uzywa_poprzedniego_commitu_gdy_brak_galezi_bazowej(tmp_path) -> None:
    """Drugi commit daje baze ``HEAD~1`` — helper ma ja wykorzystac, nie porzucic."""
    repo = _repo_bez_bazy(tmp_path / "dwa-commity")
    (repo / "plik.txt").write_text("druga wersja\n", encoding="utf-8")
    _git(repo, "commit", "-q", "-am", "drugi commit")

    wynik = _uruchom_helper(repo)

    assert wynik.returncode == 0, wynik.stderr
    linie = wynik.stdout.splitlines()
    assert linie[0] == "OK"
    assert linie[1] == "HEAD~1"
    assert linie[2] == "1"


def test_guardy_delta_owe_bez_bazy_daja_blad_z_przyczyna_nie_traceback(
    tmp_path,
) -> None:
    """Fail-closed z diagnozowalnym komunikatem — to jest naprawa defektu CI."""
    repo = _repo_bez_bazy(tmp_path / "guardy")

    for nazwa in GUARDY_DELTA_OWE:
        wynik = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / f"{nazwa}.py")],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
            env={"PYTHONUTF8": "1", "PATH": "/usr/bin:/bin:/usr/local/bin"},
        )

        assert "Traceback" not in wynik.stderr, f"{nazwa} nadal pada wyjatkiem: {wynik.stderr}"
        assert wynik.returncode == 1, f"{nazwa} musi byc fail-closed bez bazy porownania"
        assert "GuardDiffBase" in wynik.stdout
        # Komunikat musi wskazywac PRZYCZYNE, zeby dalo sie naprawic konfiguracje CI.
        assert "fetch-depth" in wynik.stdout


def test_guardy_delta_owe_na_repozytorium_projektu_daja_werdykt() -> None:
    """Sciezka produkcyjna: pelna historia => guard ocenia zmiany, nie pada."""
    for nazwa in GUARDY_DELTA_OWE:
        wynik = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / f"{nazwa}.py")],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        assert "Traceback" not in wynik.stderr, wynik.stderr
        assert "GuardDiffBase" not in wynik.stdout, f"{nazwa}: baza porownania musi byc dostepna"
        assert wynik.returncode in (0, 1)


# ---------------------------------------------------------------------------
# V12K-205: kontrakt KONFIGURACJI CI, nie tylko kodu guarda.
#
# Test powyzej („sciezka produkcyjna") wymaga bazy porownania, wiec zaklada pelna
# historie klonu. To zalozenie bylo NIEWYPOWIEDZIANE: `python-tests.yml` robil
# `actions/checkout` bez `fetch-depth: 0`, wiec workflow byl czerwony na tym jednym
# tescie od V12K-199 — dwa commity raportowano jako „CI zielone”, bo czerwony byl
# tylko jeden krok w jednym z osmiu workflowow. Ponizszy test zamienia zalozenie w
# sprawdzalny kontrakt: workflow, ktory uruchamia guard delta-owy ALBO pytest, musi
# jawnie zadac pelnej historii.
# ---------------------------------------------------------------------------

WORKFLOWS_DIR = PROJECT_ROOT.parent / ".github" / "workflows"


def _workflowy_wymagajace_pelnej_historii() -> list[Path]:
    """Workflowy, ktore wolaja guard delta-owy albo pytest (czyli testy CI)."""
    wybrane: list[Path] = []
    for plik in sorted(WORKFLOWS_DIR.glob("*.yml")):
        tresc = plik.read_text(encoding="utf-8")
        wola_guard = any(f"{nazwa}.py" in tresc for nazwa in GUARDY_DELTA_OWE)
        wola_pytest = "pytest" in tresc
        if wola_guard or wola_pytest:
            wybrane.append(plik)
    return wybrane


def test_workflowy_z_guardami_delta_owymi_maja_pelna_historie() -> None:
    """`fetch-depth: 0` przy kazdym checkoucie w tych workflowach.

    Brak pelnej historii nie daje falszywego PASS (guard jest fail-closed), ale daje
    czerwony krok o mylacej przyczynie — i tak wlasnie utracono dwa biegi CI.
    """
    assert WORKFLOWS_DIR.is_dir(), f"brak katalogu workflowow: {WORKFLOWS_DIR}"
    wymagajace = _workflowy_wymagajace_pelnej_historii()
    assert wymagajace, "spodziewamy sie co najmniej workflowu pytest i guardow P0"

    braki: list[str] = []
    for plik in wymagajace:
        tresc = plik.read_text(encoding="utf-8")
        liczba_checkoutow = tresc.count("actions/checkout")
        liczba_pelnych = tresc.count("fetch-depth: 0")
        if liczba_pelnych < liczba_checkoutow:
            braki.append(
                f"{plik.name}: checkoutow {liczba_checkoutow}, fetch-depth: 0 -> {liczba_pelnych}"
            )

    assert not braki, "workflowy bez pelnej historii dla guardow delta-owych: " + "; ".join(braki)

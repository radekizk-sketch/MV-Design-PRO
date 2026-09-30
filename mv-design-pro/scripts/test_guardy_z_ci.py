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


def _lint_z_workflowa() -> set[str]:
    """Wywolania black/ruff, ktore `python-tests.yml` NAPRAWDE uruchamia."""
    tekst = WORKFLOW_PYTHON_TESTS.read_text(encoding="utf-8")
    znalezione: set[str] = set()
    for linia in tekst.splitlines():
        obciete = linia.strip()
        if obciete.startswith("#"):
            continue
        dopasowanie = re.match(r"poetry run ((?:black|ruff)\b.*)$", obciete)
        if dopasowanie:
            znalezione.add(" ".join(dopasowanie.group(1).split()))
    return znalezione


def test_lista_lintu_pokrywa_workflow() -> None:
    """Odbicie lintu = zbior wywolan workflowa, W OBIE STRONY.

    DEFEKT, KTORY TO USUWA (pomiar 2026-09-18, CI run 35309735634): poprzednia
    wersja sprawdzala TYLKO jeden kierunek — ze kazdy wpis odbicia wystepuje w
    workflowie — i przypinala liczbe recznie (`== 4`). Zaden z tych warunkow nie
    wykrywa wywolania DOPISANEGO DO CI i pominietego w odbiciu: karta
    KATALOG-NIEZMIENNIKI dodala `black`/`ruff` dla `backend/scripts`, odbicie
    zostalo z czterema wpisami, lokalny lancuch meldowal "KOMPLET ZIELONY", a CI
    zapalalo `black --check` na `eksport_fixtur_harnessu.py`. Dwa niezalezne
    warunki, ktore "dzis sie zgadzaja", to defekt czekajacy na dane brzegowe —
    dlatego warunek WEJSCIA i WYJSCIA pochodzi teraz z JEDNEGO zrodla: workflowa.
    """
    z_workflowa = _lint_z_workflowa()
    z_odbicia = {" ".join(polecenie) for _nazwa, polecenie in runner.LINT_JAK_CI}
    assert z_odbicia == z_workflowa, (
        "odbicie lintu rozjechalo sie z workflowem — "
        f"brakuje w odbiciu: {sorted(z_workflowa - z_odbicia)}; "
        f"nadmiarowe w odbiciu: {sorted(z_odbicia - z_workflowa)}"
    )
    # Nazwy w odbiciu musza byc unikalne — inaczej meldunek o czerwonym wywolaniu
    # wskazywalby dwa rozne polecenia tym samym napisem.
    nazwy = [nazwa for nazwa, _polecenie in runner.LINT_JAK_CI]
    assert len(nazwy) == len(set(nazwy))


def test_lint_jak_ci_melduje_czerwone_wywolanie_po_nazwie(monkeypatch) -> None:
    wywolane: list[list[str]] = []

    # Czerwone wskazujemy PO DOKLADNYM poleceniu, nie po obecnosci flagi: po
    # dopisaniu `scripts` do odbicia `--config` niesie WIECEJ niz jedno wywolanie
    # i test pilnowalby czegos innego, niz deklaruje (pomiar 2026-09-18).
    czerwone_polecenie = ["black", "--check", "--config", "pyproject.toml", "../scripts"]

    def _run(polecenie, **_kwargs):
        wywolane.append(list(polecenie))
        czerwone = list(polecenie[2:]) == czerwone_polecenie
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


# --- Rownoleglosc (karta SZYBKIE-TESTY, 2026-09-30) -----------------------------------------
# Deklaracje z docstringu runnera — "meldunek w stalej kolejnosci wywolan niezaleznie od
# tego, ktore zadanie skonczylo sie pierwsze" i "co najwyzej `--rownoleglosc` procesow
# naraz" — maja przypiete testy (regula KLASA pkt 4). Iloczyn cech: {kolejnosc konczenia:
# odwrotna do kolejnosci zadan} x {rownoleglosc: 1, 2, 4} x {czesc kroku: lint, npm}.


def _zadania_testowe(liczba: int) -> list[runner.Zadanie]:
    return [runner.Zadanie(f"z{indeks}", ("x", str(indeks)), Path("/")) for indeks in range(liczba)]


def test_wykonaj_zwraca_wyniki_w_kolejnosci_zadan_przy_odwrotnej_kolejnosci_konczenia(
    monkeypatch,
) -> None:
    import threading
    import time

    liczba = 6
    zakonczone: list[int] = []
    blokada = threading.Lock()

    def _run(polecenie, **_kwargs):
        indeks = int(polecenie[1])
        # Pierwsze zadanie konczy sie ostatnie: czas odwrotny do pozycji.
        time.sleep(0.02 * (liczba - indeks))
        with blokada:
            zakonczone.append(indeks)
        return subprocess.CompletedProcess(polecenie, indeks, f"wyjscie {indeks}", "")

    monkeypatch.setattr(runner.subprocess, "run", _run)
    for rownoleglosc in (1, 2, 4):
        zakonczone.clear()
        wyniki = runner._wykonaj(_zadania_testowe(liczba), rownoleglosc)
        assert [w.returncode for w in wyniki] == list(range(liczba))
        assert [w.stdout for w in wyniki] == [f"wyjscie {i}" for i in range(liczba)]
    # Kontrola, ze przypadek jest nietrywialny: przy puli kolejnosc konczenia rozni sie
    # od kolejnosci zadan (inaczej test nie sprawdzalby porzadkowania).
    assert zakonczone != sorted(zakonczone)


def test_wykonaj_nie_przekracza_rownoleglosci(monkeypatch) -> None:
    import threading
    import time

    aktywne = 0
    maksimum = 0
    blokada = threading.Lock()

    def _run(polecenie, **_kwargs):
        nonlocal aktywne, maksimum
        with blokada:
            aktywne += 1
            maksimum = max(maksimum, aktywne)
        time.sleep(0.02)
        with blokada:
            aktywne -= 1
        return subprocess.CompletedProcess(polecenie, 0, "", "")

    monkeypatch.setattr(runner.subprocess, "run", _run)
    for rownoleglosc in (1, 2, 3):
        maksimum = 0
        runner._wykonaj(_zadania_testowe(9), rownoleglosc)
        assert maksimum == rownoleglosc


def test_lint_i_npm_rownolegle_melduja_czerwone_w_kolejnosci_listy(monkeypatch, tmp_path) -> None:
    import time

    (tmp_path / "frontend" / "node_modules").mkdir(parents=True)
    monkeypatch.setattr(runner, "PROJECT_ROOT", tmp_path)

    def _run(polecenie, **_kwargs):
        # Wczesniejsze pozycje koncza sie pozniej; wszystkie czerwone.
        time.sleep(0.01 * (10 - len(polecenie)))
        return subprocess.CompletedProcess(polecenie, 1, "", "blad")

    monkeypatch.setattr(runner.subprocess, "run", _run)
    assert runner._lint_jak_ci(rownoleglosc=4) == [n for n, _p in runner.LINT_JAK_CI]
    assert runner._npm_jak_ci(rownoleglosc=4) == [f"npm run {s}" for s in runner.NPM_JAK_CI]


def test_samotesty_przez_xdist_tylko_przy_rownoleglosci() -> None:
    sekwencyjnie = runner._polecenie_samotestow(1)
    rownolegle = runner._polecenie_samotestow(4)
    assert "-n" not in sekwencyjnie
    assert rownolegle[-2:] == ["-n", "4"]
    assert rownolegle[:-2] == sekwencyjnie

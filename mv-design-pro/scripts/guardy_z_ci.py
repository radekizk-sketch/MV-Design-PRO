#!/usr/bin/env python3
"""BRAMKI ODBIORU — uruchom DOKŁADNIE te guardy, które uruchamia CI.

PO CO (pomiar 2026-08-07). CI było czerwone przez CZTERY kolejne szczyty
(`a346c3de` … `a4dbe37a`), a nadzorca tego nie widział, bo jego klaster odbioru
liczył dziesięć guardów wybranych ręcznie — same UI/SLD. Naruszenie siedziało w
`no_direct_fault_params_guard`, którego ani ten klaster, ani pełny `pytest` nie
uruchamiają. Ręcznie utrzymywana lista bramek ZAWSZE odjedzie od tego, co robi
CI; jedyna lista, która nie kłamie, to sama definicja workflowów.

Ten skrypt CZYTA `.github/workflows/*.yml`, wyciąga z nich każde wywołanie
`python scripts/<nazwa>.py` i uruchamia komplet bieżącym interpreterem. Nowy
guard dopisany do workflowa wchodzi tu SAM — nie ma drugiej listy do pilnowania.

DRUGA POŁOWA, DOPISANA 2026-08-07 PO WŁASNEJ WPADCE. Pierwsza wersja uruchamiała
wyłącznie SKRYPTY guardów i meldowała „komplet zielony", podczas gdy CI ma w tym
samym kroku jeszcze `poetry run python -m pytest -q ../scripts` — czyli WŁASNE
TESTY guardów, leżące poza `testpaths` backendu. Skutek zmierzony: nadzorca zdjął
martwy moduł `variantStore.ts`, zapadka `FRONTEND_DEAD_CLIENT_DEBT` zażądała
obniżenia (działa w obie strony), a bramka odbioru tego nie zobaczyła — CI było
czerwone przez TRZY szczyty. Narzędzie obiecywało „to, co robi CI", i była to
obietnica szersza od tego, co sprawdzało. Teraz uruchamia OBIE połowy.

Uruchamiaj interpreterem z venv backendu: część guardów (np. `catalog_enforcement`)
importuje `networkx`, którego systemowy Python nie ma, i bez venv zgłasza fałszywą
czerwień.

    poetry run python ../scripts/guardy_z_ci.py     # z katalogu backend/

Kod wyjścia: 0 = komplet zielony, 1 = co najmniej jeden guard czerwony.
PUSTY SKAN (zero znalezionych guardów) to BŁĄD, nie sukces — skrypt, który nic
nie uruchomił, nie ma prawa meldować zieleni.

RÓWNOLEGŁOŚĆ (karta SZYBKIE-TESTY, 2026-09-30). Guardy, lint i kroki npm są od siebie
niezależne (czytają drzewo; zapisują wyłącznie z flagami `--init`/`--zapisz`, których CI
nie podaje; żaden guard nie jest wołany dwa razy), więc biegną w puli
`--rownoleglosc` procesów naraz (domyślnie liczba rdzeni), a własne testy guardów —
w `pytest -n` (pytest-xdist). Meldunek jest drukowany PO zakończeniu puli, w stałej
kolejności wywołań — ten sam stan drzewa daje ten sam meldunek niezależnie od tego,
które zadanie skończyło się pierwsze. `--rownoleglosc 1` odtwarza bieg sekwencyjny.
Pomiar przed zmianą (łańcuch p5, 2026-09-25): same samotesty 7 min 08 s; guardy, lint
i npm sekwencyjnie drugie tyle i więcej przy obciążonej maszynie.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_ROOT.parent
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

#: Wywołanie guarda w kroku workflowa: `python scripts/nazwa.py`, także z
#: przedrostkiem katalogu (`python mv-design-pro/scripts/nazwa.py`).
#: Workflow P0 wskazuje interpreter srodowiska poetry przez zmienna `$GUARD_PY`
#: (jedno srodowisko guardow = srodowisko testow); skan musi widziec obie formy.
#: Grupa 2 = argumenty wywolania z tej samej linii `run:` (np. `--strict`), do
#: konca linii albo do operatora powloki. Guard uruchomiony BEZ argumentow
#: workflowa jest innym programem niz na CI: `port_binding_guard.py --strict`
#: zwraca 1 przy brakujacych portach, bez `--strict` melduje je i zwraca 0 —
#: bramka odbioru K2 (2026-09-09) swiecila na zielono, a P0 Extended na CI
#: (run 34417626793) byl czerwony. Argumenty sa czescia wywolania 1:1.
WYWOLANIE_GUARDA = re.compile(
    r"(?:python3?|\$\{?GUARD_PY\}?)\s+(?:\S*/)?scripts/([a-z0-9_]+)\.py([^\n&|;#]*)"
)

#: Zapadka na pusty skan — repozytorium ma osiem workflowów i kilkadziesiąt
#: guardów. Mniej niż tyle znaczy, że zmienił się układ katalogów albo składnia
#: kroków, a nie że bramek ubyło.
MIN_GUARDOW = 30


#: Skrypty wołane przez workflowy, które NIE są strażnikami, tylko narzędziami kroku CI
#: (wynik jest wejściem kolejnego polecenia, a argumenty pochodzą z macierzy joba, np.
#: `${{ matrix.shard }}`, więc lokalnie nie da się ich odtworzyć 1:1). Lista ZAMKNIĘTA:
#: każdy wpis musi być wołany przez workflow i mieć własny samotest w `scripts/`
#: (pilnuje `test_guardy_z_ci.py::test_narzedzia_ci_sa_wolane_i_maja_samotest`) — samotesty
#: biegną w czwartej części tego runnera, więc kontrakt narzędzia nie wypada z odbioru.
#: * `e2e_shardy` — lista plików speców sharda pełnego e2e (`frontend-e2e-full.yml`).
NARZEDZIA_CI: frozenset[str] = frozenset({"e2e_shardy"})


def _wszystkie_wywolania() -> list[tuple[str, tuple[str, ...]]]:
    """Każde `python …scripts/<nazwa>.py` z workflowów: (nazwa, argumenty), posortowane."""
    wywolania: set[tuple[str, tuple[str, ...]]] = set()
    for plik in sorted(WORKFLOWS_DIR.glob("*.y*ml")):
        for dopasowanie in WYWOLANIE_GUARDA.finditer(plik.read_text(encoding="utf-8")):
            argumenty = tuple(dopasowanie.group(2).split())
            wywolania.add((dopasowanie.group(1), argumenty))
    return sorted(wywolania)


def wywolania_z_workflowow() -> list[tuple[str, tuple[str, ...]]]:
    """Wywołania guardów z workflowów CI: (nazwa, argumenty), bez powtórzeń,
    posortowane, bez narzędzi kroku (`NARZEDZIA_CI`). Ten sam guard wołany z różnymi
    argumentami (np. z `--strict` i bez) to dwa wywołania — oba muszą być zielone, jak na CI."""
    return [w for w in _wszystkie_wywolania() if w[0] not in NARZEDZIA_CI]


def guardy_z_workflowow() -> list[str]:
    """Nazwy guardów wywoływanych przez workflowy CI, bez powtórzeń."""
    return sorted({nazwa for nazwa, _argumenty in wywolania_z_workflowow()})


#: Wywolania lintu z `python-tests.yml` (krok "black/ruff"), 1:1 co do sciezek i konfiguracji.
#: KOMPLETNOSC TEJ KROTKI JEST CZESCIA KONTRAKTU, nie wygoda — pilnuje jej
#: `test_guardy_z_ci.py::test_lista_lintu_pokrywa_workflow`. POWOD Z POMIARU
#: (2026-09-18, CI run 35309735634): lista niosla CZTERY wywolania, a workflow
#: uruchamia SZESC — `backend/scripts` dopisano do CI kartą KATALOG-NIEZMIENNIKI i
#: NIE dopisano do tego odbicia. Skutek: lokalny lancuch meldowal zielen, a CI
#: zapalalo `black --check` na `backend/scripts/eksport_fixtur_harnessu.py`. To ta
#: sama choroba co klaster testowy na `trust`: przyrzad, ktory nie odtwarza warunku
#: produkcyjnego, produkuje zielen NIEZALEZNA od stanu kodu.
LINT_JAK_CI: tuple[tuple[str, list[str]], ...] = (
    ("black src tests", ["black", "--check", "src", "tests"]),
    ("ruff src tests", ["ruff", "check", "src", "tests"]),
    (
        "black ../scripts",
        ["black", "--check", "--config", "pyproject.toml", "../scripts"],
    ),
    ("ruff ../scripts", ["ruff", "check", "../scripts"]),
    (
        "black scripts",
        ["black", "--check", "--config", "pyproject.toml", "scripts"],
    ),
    ("ruff scripts", ["ruff", "check", "scripts"]),
)


@dataclass(frozen=True)
class Zadanie:
    """Jedno wywołanie kroku CI: etykieta meldunku, polecenie, katalog roboczy."""

    etykieta: str
    polecenie: tuple[str, ...]
    katalog: Path


def _uruchom(zadanie: Zadanie) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(zadanie.polecenie),
        cwd=zadanie.katalog,
        capture_output=True,
        text=True,
    )


def _wykonaj(
    zadania: Sequence[Zadanie], rownoleglosc: int
) -> list[subprocess.CompletedProcess[str]]:
    """Wyniki zadań w KOLEJNOŚCI ZADAŃ; co najwyżej `rownoleglosc` procesów naraz."""
    if rownoleglosc <= 1 or len(zadania) <= 1:
        return [_uruchom(zadanie) for zadanie in zadania]
    with ThreadPoolExecutor(max_workers=rownoleglosc) as pula:
        return list(pula.map(_uruchom, zadania))


def _zamelduj(
    zadania: Sequence[Zadanie], wyniki: Sequence[subprocess.CompletedProcess[str]]
) -> list[str]:
    """Wydruk wyników w kolejności zadań; zwraca etykiety czerwonych wywołań."""
    czerwone: list[str] = []
    for zadanie, wynik in zip(zadania, wyniki, strict=True):
        if wynik.returncode != 0:
            czerwone.append(zadanie.etykieta)
            print(f"[CZERWONY] {zadanie.etykieta} RC={wynik.returncode}", file=sys.stderr)
            for linia in (wynik.stdout + wynik.stderr).splitlines()[-12:]:
                print(f"    {linia}", file=sys.stderr)
        else:
            print(f"[zielony ] {zadanie.etykieta}")
    return czerwone


def _zadania_lintu() -> list[Zadanie]:
    return [
        Zadanie(nazwa, (sys.executable, "-m", *polecenie), PROJECT_ROOT / "backend")
        for nazwa, polecenie in LINT_JAK_CI
    ]


def _lint_jak_ci(rownoleglosc: int = 1) -> list[str]:
    """Uruchom lint dokladnie tak, jak CI; zwroc nazwy czerwonych wywolan."""
    zadania = _zadania_lintu()
    return _zamelduj(zadania, _wykonaj(zadania, rownoleglosc))


#: Kroki `npm run <skrypt>` z `frontend-checks.yml`, ktore CI uruchamia w TYM
#: SAMYM workflowie co guardy frontendu (type-check, eslint). Czwarta czesc
#: bramki, dopisana 2026-09-10 po czerwonych runach 34449933541/34449937286:
#: `eslint --report-unused-disable-directives` zapalil sie na dyrektywie
#: zostawionej przy przepisaniu `SekcjaNastaw.tsx`, a lancuch odbioru fali 2
#: uruchamial vitest i guardy Pythona, wiec meldowal komplet zielony. Lista jest
#: sprawdzana wobec workflowu (test wlasny + kontrola w biegu): krok, ktorego
#: workflow nie wola, to blad, nie cicha nadwyzka.
NPM_JAK_CI: tuple[str, ...] = ("type-check", "lint")
WORKFLOW_FRONTEND = WORKFLOWS_DIR / "frontend-checks.yml"


def _zadania_npm() -> tuple[list[Zadanie], list[str]]:
    """Zadania krokow npm z `frontend-checks.yml` i kroki czerwone bez uruchamiania.

    Brak `node_modules` jest czerwony, nie pominiety: CI te kroki wykonuje zawsze,
    wiec bramka bez nich nie ma prawa meldowac zieleni (`npm ci` albo dowiazanie
    katalogu z innego drzewa roboczego). Krok, ktorego workflow nie wola, to blad."""
    frontend = PROJECT_ROOT / "frontend"
    tekst_workflowu = WORKFLOW_FRONTEND.read_text(encoding="utf-8")
    if not (frontend / "node_modules").is_dir():
        print(
            "[CZERWONY] frontend/node_modules nieobecne — kroki npm z frontend-checks.yml "
            "nie moga sie wykonac (npm ci albo dowiazanie katalogu).",
            file=sys.stderr,
        )
        return [], [f"npm run {skrypt}" for skrypt in NPM_JAK_CI]
    zadania: list[Zadanie] = []
    czerwone: list[str] = []
    for skrypt in NPM_JAK_CI:
        nazwa = f"npm run {skrypt}"
        if nazwa not in tekst_workflowu:
            czerwone.append(nazwa)
            print(f"[CZERWONY] {nazwa}: frontend-checks.yml nie wola tego kroku", file=sys.stderr)
            continue
        zadania.append(Zadanie(nazwa, ("npm", "run", skrypt), frontend))
    return zadania, czerwone


def _npm_jak_ci(rownoleglosc: int = 1) -> list[str]:
    """Uruchom kroki npm dokladnie tak, jak CI (`frontend-checks.yml`); zwroc
    nazwy czerwonych wywolan (w kolejnosci `NPM_JAK_CI`)."""
    zadania, czerwone = _zadania_npm()
    czerwone_biegu = set(_zamelduj(zadania, _wykonaj(zadania, rownoleglosc)))
    return [
        f"npm run {skrypt}"
        for skrypt in NPM_JAK_CI
        if f"npm run {skrypt}" in czerwone or f"npm run {skrypt}" in czerwone_biegu
    ]


def _zadania_guardow() -> tuple[list[Zadanie], list[str]]:
    """Zadania wywolan guardow z workflowow i nazwy guardow nieobecnych w repo."""
    zadania: list[Zadanie] = []
    brakujace: list[str] = []
    for nazwa, argumenty in wywolania_z_workflowow():
        sciezka = SCRIPTS_DIR / f"{nazwa}.py"
        if not sciezka.exists():
            if nazwa not in brakujace:
                brakujace.append(nazwa)
            continue
        zadania.append(
            Zadanie(
                " ".join((nazwa, *argumenty)),
                (sys.executable, str(sciezka), *argumenty),
                PROJECT_ROOT,
            )
        )
    return zadania, brakujace


def _polecenie_samotestow(rownoleglosc: int) -> list[str]:
    """`pytest ../scripts` jak w CI; przy rownoleglosci > 1 — rozdzielony przez xdist.

    Brak pytest-xdist przy rownoleglosci > 1 to czerwien biegu (pytest odrzuci `-n`),
    a nie cichy powrot do biegu sekwencyjnego: xdist jest zaleznoscia dev backendu."""
    polecenie = [sys.executable, "-m", "pytest", "-q", str(SCRIPTS_DIR)]
    if rownoleglosc > 1:
        polecenie += ["-n", str(rownoleglosc)]
    return polecenie


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--rownoleglosc",
        type=int,
        default=os.cpu_count() or 1,
        help="ile procesow naraz (guardy, lint, npm; xdist dla samotestow); 1 = sekwencyjnie",
    )
    argumenty = parser.parse_args(argv)
    rownoleglosc = max(1, argumenty.rownoleglosc)

    if not WORKFLOWS_DIR.is_dir():
        print(f"BLAD: brak katalogu workflowow: {WORKFLOWS_DIR}", file=sys.stderr)
        return 1

    nazwy = guardy_z_workflowow()
    if len(nazwy) < MIN_GUARDOW:
        print(
            f"BLAD: znaleziono {len(nazwy)} guardow (oczekiwane co najmniej "
            f"{MIN_GUARDOW}) — skan workflowow przestal dzialac, a nie bramek ubylo.",
            file=sys.stderr,
        )
        return 1

    zadania_guardow, brakujace = _zadania_guardow()
    zadania_lintu = _zadania_lintu()
    zadania_npm, npm_czerwone_bez_biegu = _zadania_npm()

    # Jedna pula dla trzech czesci kroku CI; najdluzsze zadania (tsc, eslint) na
    # poczatku kolejki, zeby nie wydluzaly ogona biegu. Meldunek — w kolejnosci czesci.
    kolejka = [*zadania_npm, *zadania_lintu, *zadania_guardow]
    print(f"Uruchamiam {len(kolejka)} zadan, do {rownoleglosc} naraz.")
    wyniki = dict(zip(kolejka, _wykonaj(kolejka, rownoleglosc), strict=True))

    czerwone = _zamelduj(zadania_guardow, [wyniki[z] for z in zadania_guardow])

    if brakujace:
        print(
            "\nBLAD: workflow wola guardy, ktorych nie ma w repozytorium: " + ", ".join(brakujace),
            file=sys.stderr,
        )

    print(f"\nUruchomiono {len(nazwy) - len(brakujace)} guardow z {len(nazwy)} wolanych przez CI.")

    # Trzecia czesc kroku CI (dopisana 2026-09-05 po CZERWONYCH runach 4879/4881:
    # `black --check --config pyproject.toml ../scripts` zapalil sie na dwoch
    # skryptach guardow, a bramka odbioru meldowala "KOMPLET ZIELONY" — bo nie
    # uruchamiala lintu, ktory CI uruchamia w TYM SAMYM kroku co pytest). SZESC
    # wywolan z `python-tests.yml`: black/ruff dla `src tests` oraz — OSOBNO, z jawna
    # konfiguracja — dla `../scripts` i dla `scripts` (black bez `--config` szuka
    # pyproject w gore od pliku i trafia poza projekt backendu). Komplet tej listy
    # pilnuje `test_guardy_z_ci.py::test_lista_lintu_pokrywa_workflow`: 2026-09-18
    # brakowalo w niej dwoch ostatnich wywolan, wiec lokalny lancuch byl slepy na
    # format `backend/scripts` (CI run 35309735634).
    print("\n--- lint jak CI (black/ruff: src tests, ../scripts, scripts) ---")
    lint_czerwone = _zamelduj(zadania_lintu, [wyniki[z] for z in zadania_lintu])

    # Czwarta czesc: kroki npm z `frontend-checks.yml` (type-check, eslint).
    print("\n--- kroki npm jak CI (frontend-checks.yml: type-check, lint) ---")
    npm_czerwone = npm_czerwone_bez_biegu + _zamelduj(zadania_npm, [wyniki[z] for z in zadania_npm])

    # Druga polowa kroku CI: wlasne testy guardow (poza `testpaths` backendu).
    print("\n--- testy wlasne guardow (`python -m pytest ../scripts`) ---")
    testy = subprocess.run(
        _polecenie_samotestow(rownoleglosc),
        cwd=PROJECT_ROOT / "backend",
        capture_output=True,
        text=True,
    )
    print(
        (testy.stdout or testy.stderr).strip().splitlines()[-1]
        if (testy.stdout or testy.stderr).strip()
        else ""
    )
    if testy.returncode != 0:
        for linia in (testy.stdout + testy.stderr).splitlines()[-25:]:
            print(f"    {linia}", file=sys.stderr)
        print("CZERWONE: testy wlasne guardow", file=sys.stderr)

    if czerwone or brakujace or testy.returncode != 0 or lint_czerwone or npm_czerwone:
        if czerwone:
            print(
                "CZERWONE: "
                + ", ".join(
                    f"{z.etykieta} (RC={wyniki[z].returncode})"
                    for z in zadania_guardow
                    if wyniki[z].returncode != 0
                ),
                file=sys.stderr,
            )
        if lint_czerwone:
            print("CZERWONE: lint jak CI: " + ", ".join(lint_czerwone), file=sys.stderr)
        if npm_czerwone:
            print("CZERWONE: kroki npm jak CI: " + ", ".join(npm_czerwone), file=sys.stderr)
        return 1
    print("KOMPLET ZIELONY.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

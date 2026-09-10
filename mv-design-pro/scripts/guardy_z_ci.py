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

Uruchamiaj interpreterem z venv backendu: część guardów (`trace_determinism`,
`catalog_enforcement`) importuje `networkx`, którego systemowy Python nie ma, i
bez venv zgłasza fałszywą czerwień.

    poetry run python ../scripts/guardy_z_ci.py     # z katalogu backend/

Kod wyjścia: 0 = komplet zielony, 1 = co najmniej jeden guard czerwony.
PUSTY SKAN (zero znalezionych guardów) to BŁĄD, nie sukces — skrypt, który nic
nie uruchomił, nie ma prawa meldować zieleni.
"""

from __future__ import annotations

import re
import subprocess
import sys
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


def wywolania_z_workflowow() -> list[tuple[str, tuple[str, ...]]]:
    """Wywołania guardów z workflowów CI: (nazwa, argumenty), bez powtórzeń,
    posortowane. Ten sam guard wołany z różnymi argumentami (np. z `--strict`
    i bez) to dwa wywołania — oba muszą być zielone, jak na CI."""
    wywolania: set[tuple[str, tuple[str, ...]]] = set()
    for plik in sorted(WORKFLOWS_DIR.glob("*.y*ml")):
        for dopasowanie in WYWOLANIE_GUARDA.finditer(plik.read_text(encoding="utf-8")):
            argumenty = tuple(dopasowanie.group(2).split())
            wywolania.add((dopasowanie.group(1), argumenty))
    return sorted(wywolania)


def guardy_z_workflowow() -> list[str]:
    """Nazwy guardów wywoływanych przez workflowy CI, bez powtórzeń."""
    return sorted({nazwa for nazwa, _argumenty in wywolania_z_workflowow()})


#: Wywolania lintu z `python-tests.yml` (krok "black/ruff"), 1:1 co do sciezek i konfiguracji.
LINT_JAK_CI: tuple[tuple[str, list[str]], ...] = (
    ("black src tests", ["black", "--check", "src", "tests"]),
    ("ruff src tests", ["ruff", "check", "src", "tests"]),
    (
        "black ../scripts",
        ["black", "--check", "--config", "pyproject.toml", "../scripts"],
    ),
    ("ruff ../scripts", ["ruff", "check", "../scripts"]),
)


def _lint_jak_ci() -> list[str]:
    """Uruchom lint dokladnie tak, jak CI; zwroc nazwy czerwonych wywolan."""
    czerwone: list[str] = []
    for nazwa, polecenie in LINT_JAK_CI:
        wynik = subprocess.run(
            [sys.executable, "-m", *polecenie],
            cwd=PROJECT_ROOT / "backend",
            capture_output=True,
            text=True,
        )
        if wynik.returncode != 0:
            czerwone.append(nazwa)
            print(f"[CZERWONY] {nazwa} RC={wynik.returncode}", file=sys.stderr)
            for linia in (wynik.stdout + wynik.stderr).splitlines()[-12:]:
                print(f"    {linia}", file=sys.stderr)
        else:
            print(f"[zielony ] {nazwa}")
    return czerwone


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


def _npm_jak_ci() -> list[str]:
    """Uruchom kroki npm dokladnie tak, jak CI (`frontend-checks.yml`); zwroc
    nazwy czerwonych wywolan. Brak `node_modules` jest czerwony, nie pominiety:
    CI te kroki wykonuje zawsze, wiec bramka bez nich nie ma prawa meldowac
    zieleni (`npm ci` albo dowiazanie katalogu z innego drzewa roboczego)."""
    frontend = PROJECT_ROOT / "frontend"
    tekst_workflowu = WORKFLOW_FRONTEND.read_text(encoding="utf-8")
    czerwone: list[str] = []
    if not (frontend / "node_modules").is_dir():
        print(
            "[CZERWONY] frontend/node_modules nieobecne — kroki npm z frontend-checks.yml "
            "nie moga sie wykonac (npm ci albo dowiazanie katalogu).",
            file=sys.stderr,
        )
        return [f"npm run {skrypt}" for skrypt in NPM_JAK_CI]
    for skrypt in NPM_JAK_CI:
        nazwa = f"npm run {skrypt}"
        if nazwa not in tekst_workflowu:
            czerwone.append(nazwa)
            print(f"[CZERWONY] {nazwa}: frontend-checks.yml nie wola tego kroku", file=sys.stderr)
            continue
        wynik = subprocess.run(
            ["npm", "run", skrypt],
            cwd=frontend,
            capture_output=True,
            text=True,
        )
        if wynik.returncode != 0:
            czerwone.append(nazwa)
            print(f"[CZERWONY] {nazwa} RC={wynik.returncode}", file=sys.stderr)
            for linia in (wynik.stdout + wynik.stderr).splitlines()[-12:]:
                print(f"    {linia}", file=sys.stderr)
        else:
            print(f"[zielony ] {nazwa}")
    return czerwone


def main() -> int:
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

    czerwone: list[tuple[str, int]] = []
    brakujace: list[str] = []

    for nazwa, argumenty in wywolania_z_workflowow():
        sciezka = SCRIPTS_DIR / f"{nazwa}.py"
        if not sciezka.exists():
            if nazwa not in brakujace:
                brakujace.append(nazwa)
            continue
        etykieta = " ".join((nazwa, *argumenty))
        wynik = subprocess.run(
            [sys.executable, str(sciezka), *argumenty],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
        )
        if wynik.returncode != 0:
            czerwone.append((etykieta, wynik.returncode))
            print(f"[CZERWONY] {etykieta} RC={wynik.returncode}", file=sys.stderr)
            for linia in (wynik.stdout + wynik.stderr).splitlines()[-12:]:
                print(f"    {linia}", file=sys.stderr)
        else:
            print(f"[zielony ] {etykieta}")

    if brakujace:
        print(
            "\nBLAD: workflow wola guardy, ktorych nie ma w repozytorium: " + ", ".join(brakujace),
            file=sys.stderr,
        )

    print(f"\nUruchomiono {len(nazwy) - len(brakujace)} guardow z {len(nazwy)} wolanych przez CI.")

    # Trzecia czesc kroku CI (dopisana 2026-09-05 po CZERWONYCH runach 4879/4881:
    # `black --check --config pyproject.toml ../scripts` zapalil sie na dwoch
    # skryptach guardow, a bramka odbioru meldowala "KOMPLET ZIELONY" — bo nie
    # uruchamiala lintu, ktory CI uruchamia w TYM SAMYM kroku co pytest). Dokladnie
    # cztery wywolania z `python-tests.yml`: black/ruff dla `src tests` oraz — OSOBNO,
    # z jawna konfiguracja — dla `../scripts` (black bez `--config` szuka pyproject
    # w gore od pliku i trafia poza projekt backendu).
    print("\n--- lint jak CI (black/ruff: src tests, ../scripts) ---")
    lint_czerwone = _lint_jak_ci()

    # Czwarta czesc: kroki npm z `frontend-checks.yml` (type-check, eslint).
    print("\n--- kroki npm jak CI (frontend-checks.yml: type-check, lint) ---")
    npm_czerwone = _npm_jak_ci()

    # Druga polowa kroku CI: wlasne testy guardow (poza `testpaths` backendu).
    print("\n--- testy wlasne guardow (`python -m pytest ../scripts`) ---")
    testy = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", str(SCRIPTS_DIR)],
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
                "CZERWONE: " + ", ".join(f"{n} (RC={rc})" for n, rc in czerwone),
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

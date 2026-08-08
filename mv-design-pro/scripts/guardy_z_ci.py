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
WYWOLANIE_GUARDA = re.compile(r"python3?\s+(?:\S*/)?scripts/([a-z0-9_]+)\.py")

#: Zapadka na pusty skan — repozytorium ma osiem workflowów i kilkadziesiąt
#: guardów. Mniej niż tyle znaczy, że zmienił się układ katalogów albo składnia
#: kroków, a nie że bramek ubyło.
MIN_GUARDOW = 30


def guardy_z_workflowow() -> list[str]:
    """Nazwy guardów wywoływanych przez workflowy CI, bez powtórzeń."""
    nazwy: set[str] = set()
    for plik in sorted(WORKFLOWS_DIR.glob("*.y*ml")):
        for dopasowanie in WYWOLANIE_GUARDA.finditer(plik.read_text(encoding="utf-8")):
            nazwy.add(dopasowanie.group(1))
    return sorted(nazwy)


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

    for nazwa in nazwy:
        sciezka = SCRIPTS_DIR / f"{nazwa}.py"
        if not sciezka.exists():
            brakujace.append(nazwa)
            continue
        wynik = subprocess.run(
            [sys.executable, str(sciezka)],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
        )
        if wynik.returncode != 0:
            czerwone.append((nazwa, wynik.returncode))
            print(f"[CZERWONY] {nazwa} RC={wynik.returncode}", file=sys.stderr)
            for linia in (wynik.stdout + wynik.stderr).splitlines()[-12:]:
                print(f"    {linia}", file=sys.stderr)
        else:
            print(f"[zielony ] {nazwa}")

    if brakujace:
        print(
            "\nBLAD: workflow wola guardy, ktorych nie ma w repozytorium: " + ", ".join(brakujace),
            file=sys.stderr,
        )

    print(f"\nUruchomiono {len(nazwy) - len(brakujace)} guardow z {len(nazwy)} wolanych przez CI.")

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

    if czerwone or brakujace or testy.returncode != 0:
        if czerwone:
            print(
                "CZERWONE: " + ", ".join(f"{n} (RC={rc})" for n, rc in czerwone),
                file=sys.stderr,
            )
        return 1
    print("KOMPLET ZIELONY.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

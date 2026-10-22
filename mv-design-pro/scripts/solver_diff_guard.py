#!/usr/bin/env python3
"""
Solver Diff Guard — odcisk SHA-256 rdzeni zamrożonych B-01.

Blokuje scalenie, jeśli którykolwiek plik rdzenia B-01 zmienił się względem zapisanego
odcisku. Zmiana rdzenia wymaga decyzji właściciela (B-01) nazwanej w karcie; karta z taką
decyzją odświeża odcisk (`--init`) w tym samym commicie, a sankcję zapisuje
w `solver_boundary_guard.SANCTIONED_CHANGES`.

ZBIÓR PILNOWANYCH PLIKÓW = lista B-01 (`scripts/rdzenie_b01.py`, JEDNO źródło). Wpis-plik
to jeden plik; wpis-katalog (zakończony `/`) to każdy plik w nim (rekurencyjnie, bez
`__pycache__` i `*.pyc`). Do decyzji B-01 partii integracji 9 (delegacja O-59) odcisk
obejmował ręczną listę ośmiu plików (zwarcia IEC 60909, rozpływ NR/GS/FD, zabezpieczenia
IEC 60255), a grupy NC RfG z profilami, FRT/HVRT, estymacja WLS, stan fazowy SN i V12.6
nie miały odcisku wcale. Od tej decyzji lista jest wyprowadzana z `rdzenie_b01.py`, więc
nowa grupa albo nowy plik w katalogu rdzenia wchodzi pod odcisk bez drugiej listy.

ALGORYTM:
  1. Rozwiń listę B-01 do zbioru plików (ścieżki względem `backend/src`).
  2. Policz SHA-256 każdego pliku.
  3. Porównaj z odciskiem zapisanym w `guard_references/solver_hashes.json` — w obie strony:
     plik zmieniony, plik usunięty ORAZ plik nowy (jest w rdzeniu, nie ma go w odcisku) to
     naruszenie. Predykat parami: zbiór odcisku = zbiór rdzenia.

KODY WYJŚCIA:
  0 = czysto
  1 = naruszenie (plik rdzenia zmieniony, usunięty albo dodany bez odświeżenia odcisku)
  2 = brak pliku odcisku (pierwsze uruchomienie: `--init`)
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from rdzenie_b01 import sciezki_b01  # noqa: E402

REPO_ROOT = SCRIPTS_DIR.parent
BACKEND_ROOT = REPO_ROOT / "backend" / "src"
REFERENCE_FILE = REPO_ROOT / "scripts" / "guard_references" / "solver_hashes.json"


def pliki_rdzeni(src: Path = BACKEND_ROOT) -> list[str]:
    """Pliki rdzeni B-01 (ścieżki względem `src`, posortowane) rozwinięte z listy B-01.

    Wpis-plik wchodzi zawsze (brak pliku na dysku zgłasza porównanie jako „usunięty");
    wpis-katalog rozwija się do plików w nim, bez artefaktów interpretera.
    """
    pliki: set[str] = set()
    for wpis in sciezki_b01():
        if not wpis.endswith("/"):
            pliki.add(wpis)
            continue
        katalog = src / wpis
        for sciezka in katalog.rglob("*"):
            if not sciezka.is_file():
                continue
            if "__pycache__" in sciezka.parts or sciezka.suffix == ".pyc":
                continue
            pliki.add(sciezka.relative_to(src).as_posix())
    return sorted(pliki)


#: Zbiór pilnowany w bieżącym drzewie (samotest `test_rdzenie_b01.py` sprawdza, że jest
#: podzbiorem listy B-01; samotest `test_solver_diff_guard.py` — że jest jej rozwinięciem).
PROTECTED_FILES = pliki_rdzeni()


def _compute_file_hash(path: Path) -> str | None:
    """SHA-256 pliku albo `None`, gdy pliku nie ma."""
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def odciski_biezace(src: Path = BACKEND_ROOT) -> dict[str, str | None]:
    """Odcisk każdego pliku rdzenia w drzewie `src`."""
    return {rel: _compute_file_hash(src / rel) for rel in pliki_rdzeni(src)}


def zapisz_odcisk(odciski: dict[str, str | None], plik: Path = REFERENCE_FILE) -> int:
    """Zapisz odcisk (bez plików nieistniejących); zwróć liczbę zapisanych wpisów."""
    plik.parent.mkdir(parents=True, exist_ok=True)
    czyste = {k: v for k, v in odciski.items() if v is not None}
    plik.write_text(json.dumps(czyste, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return len(czyste)


def naruszenia(odcisk: dict[str, str], biezace: dict[str, str | None]) -> list[str]:
    """Różnice odcisku i drzewa w obie strony (zmieniony, usunięty, nowy)."""
    wynik: list[str] = []
    for rel, ref_hash in sorted(odcisk.items()):
        cur_hash = biezace.get(rel)
        if cur_hash is None:
            wynik.append(f"  {rel}: FILE DELETED (was {ref_hash[:16]}...)")
        elif cur_hash != ref_hash:
            wynik.append(
                f"  {rel}: MODIFIED\n"
                f"    reference: {ref_hash[:16]}...\n"
                f"    current:   {cur_hash[:16]}..."
            )
    for rel in sorted(set(biezace) - set(odcisk)):
        if biezace[rel] is not None:
            wynik.append(f"  {rel}: NEW FILE (brak w odcisku)")
    return wynik


def sprawdz(src: Path = BACKEND_ROOT, plik_odcisku: Path = REFERENCE_FILE) -> int:
    """Kod wyjścia guarda dla drzewa `src` i pliku odcisku (parametry dla samotestu)."""
    if not plik_odcisku.exists():
        print(
            "solver-diff-guard: reference file missing. "
            f"Run: python {Path(__file__).name} --init",
            file=sys.stderr,
        )
        return 2
    odcisk: dict[str, str] = json.loads(plik_odcisku.read_text(encoding="utf-8"))
    lista = naruszenia(odcisk, odciski_biezace(src))
    if lista:
        print("SOLVER-DIFF-GUARD VIOLATIONS:", file=sys.stderr)
        for v in lista:
            print(v, file=sys.stderr)
        print(
            f"\n{len(lista)} violation(s). Rdzenie B-01 (`scripts/rdzenie_b01.py`) zmieniają "
            "się wyłącznie decyzją właściciela nazwaną w karcie; karta odświeża odcisk "
            "(`--init`) i sankcję w `solver_boundary_guard`.",
            file=sys.stderr,
        )
        return 1
    print(f"solver-diff-guard: PASS ({len(odcisk)} files verified)")
    return 0


def main() -> int:
    if "--init" in sys.argv:
        liczba = zapisz_odcisk(odciski_biezace())
        print(f"solver-diff-guard: initialized {liczba} reference hashes")
        return 0
    return sprawdz()


if __name__ == "__main__":
    sys.exit(main())

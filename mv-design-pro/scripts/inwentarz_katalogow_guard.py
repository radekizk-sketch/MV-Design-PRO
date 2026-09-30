#!/usr/bin/env python3
"""Straznik aktualnosci tabeli gotowosci katalogow.

Pilnuje, zeby zalacznik „Gotowosc katalogow — POMIAR, nie deklaracja" w
`docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` (dokument WIAZACY,
priorytet 2 hierarchii dokumentow) zgadzal sie z tym, co mierzy
`backend/scripts/inwentarz_katalogow.py` na rejestrach repozytorium katalogu.

DLACZEGO OSOBNY PLIK, A NIE ROZSZERZENIE MIERNIKA. Wzorzec przejety z
`readiness_dictionary_guard.py`: miernik LICZY i zapisuje, guard SPRAWDZA
ZGODNOSC DRUGIEGO PLIKU. Guard nie ma wlasnej kopii logiki renderowania — wola
`wygeneruj_dokument()` wprost z miernika, wiec istnieje dokladnie JEDNA funkcja,
ktora wie, jak wyglada poprawny dokument. Tabela pisana recznie ZAWSZE odjedzie
od katalogu; tu rozjazd jest czerwienia CI w tym samym biegu, w ktorym powstal.

SCAN: `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md`
      vs rejestry `network_model/catalog/repository.py`

Uruchomienie (z katalogu `mv-design-pro`, interpreterem venv backendu —
miernik importuje repozytorium katalogu):
    python scripts/inwentarz_katalogow_guard.py

EXIT CODES:
  0 = tabela zgodna z pomiarem
  1 = rozjazd / brak znacznikow / brak dokumentu
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend" / "scripts"))

from inwentarz_katalogow import (  # noqa: E402
    DOKUMENT,
    wygeneruj_dokument,
    zmierz_katalog,
)


def main() -> int:
    if not DOKUMENT.exists():
        print(f"VIOLATION: brak dokumentu: {DOKUMENT}")
        return 1
    try:
        oczekiwana = wygeneruj_dokument()
    except ValueError as blad:
        print(f"VIOLATION: {blad}")
        return 1
    obecna = DOKUMENT.read_text(encoding="utf-8")
    if obecna != oczekiwana:
        pomiary = zmierz_katalog()
        print(f"\n{'=' * 60}")
        print("INWENTARZ KATALOGOW: tabela gotowosci rozjechala sie z katalogiem")
        print(f"{'=' * 60}\n")
        print(f"  VIOLATION: {DOKUMENT}")
        print(
            f"  Pomiar niesie dzis {len(pomiary)} rodzin, "
            f"{sum(p.liczba_pozycji for p in pomiary)} pozycji."
        )
        print("  Napraw: python backend/scripts/inwentarz_katalogow.py")
        print()
        return 1
    pomiary = zmierz_katalog()
    print(
        f"Inwentarz katalogow: OK ({len(pomiary)} rodzin, "
        f"{sum(p.liczba_pozycji for p in pomiary)} pozycji, tabela zgodna z pomiarem)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

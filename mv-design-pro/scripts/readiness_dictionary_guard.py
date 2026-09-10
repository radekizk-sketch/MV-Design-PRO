#!/usr/bin/env python3
"""Readiness Dictionary Sync Guard.

Pilnuje, żeby `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` (dokument WIĄŻĄCY,
priorytet 3 hierarchii dokumentów) był ZGODNY z rejestrem
`backend/src/domain/canonical_operations.py::READINESS_CODES` — dokładnie ta sama
treść, jaką wypisuje `scripts/generuj_slownik_kodow_gotowosci.py`.

DLACZEGO OSOBNY PLIK, NIE ROZSZERZENIE `readiness_codes_guard.py` (karta READINESS-DOC,
2026-09-09 — uzasadnienie wyboru z §0 karty, patrz też commit).
`readiness_codes_guard.py` sprawdza wewnętrzną spójność SAMEGO REJESTRU (długość
komunikatu, zakres priorytetu, kształt nawigacji, duplikaty kluczy literału) — zero
operacji na plikach poza odczytem źródła Pythona. Ten guard sprawdza zupełnie inną
rzecz: czy DRUGI PLIK (dokument Markdown) zgadza się z tym, co rejestr generuje.
Scalenie obu w jeden skrypt rozmyłoby dokładnie to, przed czym ostrzega naglówek
`readiness_codes_guard.py` (karta X4): straznik z opisem szerszym niz kod jest gorszy
niz brak straznika. JEDNO ŹRÓDŁO PRAWDY jest zachowane inaczej: ten guard NIE ma
własnej kopii logiki renderowania/porównania — woła `--check`-owy odpowiednik wprost z
`generuj_slownik_kodow_gotowosci.py` (import, nie subprocess), więc istnieje dokładnie
JEDNA funkcja, która wie, jak wygląda poprawny dokument.

SCAN: `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` vs
      `backend/src/domain/canonical_operations.py::READINESS_CODES`

Uruchomienie (jak `readiness_codes_guard.py` w CI — goły `python3`, bez `poetry run`):
    python scripts/readiness_dictionary_guard.py

EXIT CODES:
  0 = dokument zgodny z rejestrem
  1 = rozjazd / brak znaczników / brak rejestru / brak dokumentu
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generuj_slownik_kodow_gotowosci import (  # noqa: E402
    DOKUMENT,
    REGISTRY_FILE,
    modul_rejestru,
    wygeneruj_dokument,
)


def main() -> int:
    if not REGISTRY_FILE.exists():
        print(f"VIOLATION: brak rejestru: {REGISTRY_FILE}")
        return 1
    if not DOKUMENT.exists():
        print(f"VIOLATION: brak dokumentu: {DOKUMENT}")
        return 1

    oczekiwana_tresc = wygeneruj_dokument()
    obecna_tresc = DOKUMENT.read_text(encoding="utf-8")

    if obecna_tresc != oczekiwana_tresc:
        liczba_kodow = len(modul_rejestru().READINESS_CODES)
        print(f"\n{'=' * 60}")
        print("READINESS DICTIONARY GUARD: dokument nie zgadza się z rejestrem")
        print(f"{'=' * 60}\n")
        print(f"  VIOLATION: {DOKUMENT} rozjechal sie z {REGISTRY_FILE}")
        print(f"  Rejestr niesie dzis {liczba_kodow} kodow.")
        print("  Napraw: python scripts/generuj_slownik_kodow_gotowosci.py")
        print()
        return 1

    print(
        f"Readiness Dictionary Guard: OK "
        f"({len(modul_rejestru().READINESS_CODES)} kodow, dokument zgodny z rejestrem)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

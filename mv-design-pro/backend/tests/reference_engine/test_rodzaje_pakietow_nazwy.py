"""Rodzaj pakietu referencyjnego słowami w komunikatach spójności pakietów.

Słownik nazw RÓWNY ``PackKind`` (węższy kończyłby się ``KeyError`` w chwili odmowy spójności
pakietu, szerszy byłby fantomem); nazwa nie jest kodem pola ``kind`` pliku ``pack.json``.
"""

from __future__ import annotations

from typing import get_args

from reference_engine.models import NAZWY_RODZAJOW_PAKIETU_PL, PackKind


def test_nazwy_rodzajow_pakietu_rowne_wyliczeniu() -> None:
    assert set(NAZWY_RODZAJOW_PAKIETU_PL) == set(get_args(PackKind))
    for kod, nazwa in NAZWY_RODZAJOW_PAKIETU_PL.items():
        assert nazwa != kod and nazwa.startswith("pakiet ")

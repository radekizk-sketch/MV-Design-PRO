"""Parytet fixtur rekordów „ocena niewykonana" frontu z backendem.

Testy ekranów frontu czytają rekordy kontraktu werdyktu z ``__tests__/rekordyOceny.json``;
pola wyprowadzane regułą (status, etykieta, zdanie, braki, zastrzeżenia) muszą być
DOKŁADNIE tym, co buduje backend. Rozjazd = fixtura wygenerowana na starym backendzie —
przegeneruj: ``PYTHONPATH=src:. python tests/uczciwosc/generuj_fixtury_ocen_fe.py``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.uczciwosc.generuj_fixtury_ocen_fe import FIXTURY, tresc


@pytest.mark.parametrize("plik", sorted(FIXTURY), ids=lambda p: f"{p.parent.parent.name}/{p.name}")
def test_fixtura_frontu_rowna_rekordom_backendu(plik: Path) -> None:
    assert plik.is_file(), f"brak fixtury {plik} — uruchom generator"
    assert plik.read_text(encoding="utf-8") == tresc(plik)

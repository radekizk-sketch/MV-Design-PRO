"""Klasa transformatora dla przelacznika zaczepow — jedna regula z frontem (karta PROOFPACK-KONTRAKT).

Oferta przelacznikow w konfiguratorze stacji (front) i dowod planu zaczepow (backend) klasyfikuja
transformator ta sama regula. Obie strony czytaja JEDNA tabele przypadkow z drzewa frontu —
rozjazd reguly zapala test po tej stronie, ktora sie zmienila.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from network_model.catalog.audit2_catalogs import (
    ETYKIETY_KLAS_TRANSFORMATORA,
    TAP_CHANGER_CATALOG,
    klasa_transformatora_przelacznika,
)

_TABELA = (
    Path(__file__).resolve().parents[3]
    / "frontend/src/ui/network-build/station-der/__tests__/klasy_transformatora_przelacznika.json"
)
_PRZYPADKI = json.loads(_TABELA.read_text(encoding="utf-8"))["przypadki"]


@pytest.mark.parametrize(
    "przypadek", _PRZYPADKI, ids=[f"{p['uhv_kv']}/{p['ulv_kv']}" for p in _PRZYPADKI]
)
def test_klasa_z_tabeli_wspolnej_z_frontem(przypadek: dict) -> None:
    assert (
        klasa_transformatora_przelacznika(przypadek["uhv_kv"], przypadek["ulv_kv"])
        == przypadek["klasa"]
    )


def test_kazda_klasa_katalogu_ma_polska_etykiete() -> None:
    klasy = {klasa for tc in TAP_CHANGER_CATALOG for klasa in tc.applicable_to}
    assert klasy <= set(ETYKIETY_KLAS_TRANSFORMATORA)

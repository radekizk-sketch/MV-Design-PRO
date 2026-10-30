"""Sprawdzamy globalny audyt katalogów i inwarianty ENEA 03.2026.

Test nie ukrywa wczesniej znanych brakow i0 transformatorow (osobny PR #507).
Raport zawsze wymienia wszystkie rodziny, a --strict bedzie uruchamiany jako
bramka dopiero po usunieciu kazdego braku minimum.
"""
from __future__ import annotations

from dataclasses import fields

from network_model.catalog.completeness_report import MINIMUM, zbuduj_raport_kompletnosci
from network_model.catalog.repository import CatalogRepository


def test_raport_kontroluje_kazda_rodzine_glownego_katalogu() -> None:
    rodziny = {f.name for f in fields(CatalogRepository)}
    assert rodziny == set(MINIMUM), (
        "Nowa rodzina katalogu wymaga minimum i jest automatycznie widoczna w audycie",
        sorted(rodziny - MINIMUM.keys()),
        sorted(MINIMUM.keys() - rodziny),
    )


def test_raport_globalny_jest_deterministyczny_i_nic_nie_chowa() -> None:
    raport = zbuduj_raport_kompletnosci()
    assert raport == zbuduj_raport_kompletnosci()
    assert raport["razem"] == sum(v["rekordy"] for v in raport["rodziny"].values())
    assert raport["suma_brakow_minimum"] == len(raport["braki_wymagane"])
    assert raport["rodziny"]["cable_types"]["rekordy"] == 66
    for rodzina, dane in raport["rodziny"].items():
        assert dane["minimum"], rodzina
        assert "pola_opcjonalne_niewypelnione" in dane, rodzina
        assert dane["braki_minimum"] >= 0, rodzina


def test_nie_uznajemy_pol_niedotyczacych_za_bledy_minimum() -> None:
    # Brak Icu rozlacznika, I2t bez wskazanej wkladki NH czy liczby biegunow
    # referencyjnego MCB nie uprawnia do wpisywania fikcyjnych wartosci.
    assert "i_cu_ka" not in MINIMUM["switch_equipment_types"]
    assert "i2t_prearc_a2s" not in MINIMUM["lv_fuse_link_types"]
    assert "poles" not in MINIMUM["lv_breaker_mcb_types"]
    assert "sk3_min_mva" not in MINIMUM["source_system_types"]

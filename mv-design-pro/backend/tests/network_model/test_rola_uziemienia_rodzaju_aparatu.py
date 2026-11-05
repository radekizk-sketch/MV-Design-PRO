"""Rola uziemienia aparatu pola z jego RODZAJU — jedno źródło dla każdej drogi budowy pola.

Karta POLA-GPZ-SZABLONY: droga szablonu (`template_primary_devices`) nadawała
`earthing_role` wyłącznie uziemnikowi, więc ogranicznik przepięć pól Z.7 (s.86) i Z.16 (s.96)
ENEA Zeszyt 1 powstawał bez roli „gałąź uziemiająca ogranicznika", podczas gdy katalog
rozdzielnicy (`enm.pole_katalogowe`), enumeracja konfiguracji pól i plan pola źródłowego
nadawały ją obu rodzajom. Klasa defektu: ten sam rodzaj aparatu, różne drogi budowy pola —
cztery niezależne warunki „dziś zgodne". Naprawa: `ROLA_UZIEMIENIA_RODZAJU_APARATU`
(`network_model.core.uziemienie`), czytana przez wszystkie drogi.

Iloczyn cech: rodzaj aparatu z rolą (uziemnik, ogranicznik) × droga budowy pola (szablon
każdego wpisu rejestru, katalog rozdzielnicy, enumeracja konfiguracji pól, plan pola
źródłowego SN z kreatora, model odczytu pola). Aparat innego rodzaju roli nie dostaje.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from enm.pole_katalogowe import _aparat_pierwotny
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    mv_source_field_primary_devices,
    template_primary_devices,
)
from network_model.core.uziemienie import ROLA_UZIEMIENIA_RODZAJU_APARATU
from reference_engine.field_configuration_catalog import enumerate_field_configurations

RODZAJE_Z_ROLA = sorted(ROLA_UZIEMIENIA_RODZAJU_APARATU)


def _sprawdz(aparaty: list[dict[str, Any]], kontekst: str) -> set[str]:
    widziane: set[str] = set()
    for a in aparaty:
        rodzaj = a["kind"]
        if rodzaj in ROLA_UZIEMIENIA_RODZAJU_APARATU:
            assert a.get("earthing_role") == ROLA_UZIEMIENIA_RODZAJU_APARATU[rodzaj], (
                kontekst,
                a.get("designation"),
            )
            widziane.add(rodzaj)
        else:
            assert "earthing_role" not in a, (kontekst, rodzaj)
    return widziane


def test_mapa_rol_pokrywa_uziemnik_i_ogranicznik() -> None:
    assert ROLA_UZIEMIENIA_RODZAJU_APARATU == {
        "ES": "field_earth",
        "SURGE_ARRESTER": "surge_ground",
    }


def test_droga_szablonu_kazdy_wpis_rejestru() -> None:
    widziane: set[str] = set()
    for template_id in sorted(BAY_TEMPLATE_REGISTRY):
        aparaty = template_primary_devices(template_id, field_ref=f"pole/{template_id}")
        widziane |= _sprawdz(aparaty, template_id)
    # Rejestr zawiera oba rodzaje (ogranicznik: pola GPZ Z.7, Z.16) — test nie jest pusty.
    assert widziane == set(RODZAJE_Z_ROLA)


@pytest.mark.parametrize("grupa", ["canonical", "producer"])
def test_droga_enumeracji_konfiguracji_pol(grupa: str) -> None:
    widziane: set[str] = set()
    for konfiguracja in enumerate_field_configurations()[grupa]:
        widziane |= _sprawdz(konfiguracja["primary_devices"], konfiguracja["config_ref"])
    assert widziane == set(RODZAJE_Z_ROLA)


@pytest.mark.parametrize(
    "uziemnik,ogranicznik", list(itertools.product((False, True), (False, True)))
)
def test_droga_planu_pola_zrodlowego(uziemnik: bool, ogranicznik: bool) -> None:
    aparaty = mv_source_field_primary_devices(
        "pole/zrodlo", earthing_switch=uziemnik, surge_arrester=ogranicznik
    )
    widziane = _sprawdz(aparaty, "plan pola źródłowego")
    assert widziane == {
        r for r, jest in (("ES", uziemnik), ("SURGE_ARRESTER", ogranicznik)) if jest
    }


@pytest.mark.parametrize("rodzaj", ["ES", "SURGE_ARRESTER", "CB", "CT"])
def test_droga_katalogu_rozdzielnicy(rodzaj: str) -> None:
    aparat = _aparat_pierwotny(
        field_ref="pole/k",
        pozycja=0,
        rodzaj_enm=rodzaj,
        oznaczenie="X1",
        placement="OFF_PATH",
        catalog_ref="pozycja",
    )
    _sprawdz([aparat], f"katalog rozdzielnicy {rodzaj}")

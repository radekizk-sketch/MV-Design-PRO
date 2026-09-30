"""Projekcje PV/BESS niosą pola karty przekształtnika (karta AB-H0 §0.8).

Iloczyn cech: klasa projekcji (PV, BESS) × pole karty (każde z ``POLA_KARTY_PROJEKCJI``
i ``k_sc``) × obecność (pozycja z kartą / bez karty) × ścieżka (budowa katalogu,
``to_dict``/``from_dict``, materializacja wiązania). Przypina:

* projekcja NIE gubi pola karty: każde pole obecne w rekordzie przekształtnika ma w
  projekcji tę samą wartość (predykat parami z ``_pola_karty_projekcji``);
* pozycja bez danych karty ma ``to_dict`` BAJTOWO identyczny z postacią sprzed karty (brak
  kluczy pól karty) — round-trip przeniesiony z dawnego testu widma na nowe pola;
* walidacja pól karty w projekcji = walidacja typu źródłowego (jedno ciało reguł);
* materializacja: pola karty trafiają do parametrów elementu WYŁĄCZNIE, gdy obecne —
  pomiar 2026-09-23: 6 pozycji z nowymi kluczami (3 karty referencyjne + 3 profile
  dynamiczne), pozostałe bajtowo jak przed kartą.
"""

from __future__ import annotations

import dataclasses
import json
import math
from typing import Any

import pytest
from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.niezmienniki_katalogu import OdmowaKatalogu
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import (
    MATERIALIZATION_CONTRACTS,
    POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE,
    POLA_KARTY_PROJEKCJI,
    BESSInverterType,
    CatalogBinding,
    PVInverterType,
    pola_karty_obecne,
)

PROJEKCJE: dict[str, tuple[type[Any], str]] = {
    "ZRODLO_NN_PV": (PVInverterType, "pv_inverter_types"),
    "ZRODLO_NN_BESS": (BESSInverterType, "bess_inverter_types"),
}
POLA_Z_K_SC = ("k_sc", *POLA_KARTY_PROJEKCJI)


@pytest.fixture(scope="module")
def katalog() -> CatalogRepository:
    return get_default_mv_catalog()


def _json(obiekt: Any) -> str:
    return json.dumps(obiekt.to_dict(), sort_keys=True, ensure_ascii=False)


@pytest.mark.parametrize("przestrzen", sorted(PROJEKCJE))
def test_projekcja_nie_gubi_pola_karty(katalog: CatalogRepository, przestrzen: str) -> None:
    _, pole_repozytorium = PROJEKCJE[przestrzen]
    for typ_id, projekcja in sorted(getattr(katalog, pole_repozytorium).items()):
        zrodlo = katalog.converter_types[typ_id]
        for nazwa in POLA_Z_K_SC:
            assert getattr(projekcja, nazwa) == getattr(zrodlo, nazwa), (typ_id, nazwa)


@pytest.mark.parametrize("przestrzen", sorted(PROJEKCJE))
def test_to_dict_pozycji_bez_danych_karty_bez_kluczy_i_round_trip(
    katalog: CatalogRepository, przestrzen: str
) -> None:
    klasa, pole_repozytorium = PROJEKCJE[przestrzen]
    z_karta = bez_karty = 0
    for typ_id, projekcja in sorted(getattr(katalog, pole_repozytorium).items()):
        slownik = projekcja.to_dict()
        obecne = {n for n in POLA_KARTY_PROJEKCJI if getattr(projekcja, n) is not None}
        assert set(slownik) & set(POLA_KARTY_PROJEKCJI) == obecne, typ_id
        odtworzona = klasa.from_dict(slownik)
        assert odtworzona == projekcja, typ_id
        assert _json(odtworzona) == _json(projekcja), typ_id
        if obecne:
            z_karta += 1
        else:
            bez_karty += 1
    assert z_karta >= 1 and bez_karty >= 1, "iloczyn cech: obie klasy pozycji muszą wystąpić"


@pytest.mark.parametrize("przestrzen", sorted(PROJEKCJE))
@pytest.mark.parametrize(
    ("pole", "wartosc", "kod"),
    [
        ("flicker_c", 0.0, "KAT-T-011"),
        ("k_sc", math.nan, "KAT-T-003"),
        ("pq_curve", (), "KAT-T-004"),
        ("pq_curve", ((0.5, 0.3, -0.3),), "KAT-T-007"),
        ("droop_p_f_percent", 0.0, "KAT-T-012"),
        ("droop_q_u_percent", -1.0, "KAT-T-013"),
    ],
)
def test_projekcja_waliduje_pola_karty_jak_typ(
    katalog: CatalogRepository, przestrzen: str, pole: str, wartosc: Any, kod: str
) -> None:
    klasa, pole_repozytorium = PROJEKCJE[przestrzen]
    wzorzec = sorted(getattr(katalog, pole_repozytorium).values(), key=lambda t: t.id)[0]
    slownik = {**wzorzec.to_dict(), pole: wartosc}
    with pytest.raises(OdmowaKatalogu) as wyjatek:
        klasa(**{**_pola_konstruktora(klasa, wzorzec), pole: wartosc})
    assert wyjatek.value.kod == kod
    if pole != "k_sc":
        with pytest.raises(OdmowaKatalogu):
            klasa.from_dict(slownik)


def _pola_konstruktora(klasa: type[Any], obiekt: Any) -> dict[str, Any]:
    return {pole.name: getattr(obiekt, pole.name) for pole in dataclasses.fields(klasa)}


def test_materializacja_kopiuje_pola_karty_wylacznie_obecne(katalog: CatalogRepository) -> None:
    zmienione: set[str] = set()
    for przestrzen, pole_repozytorium in (
        ("CONVERTER", "converter_types"),
        ("ZRODLO_NN_PV", "pv_inverter_types"),
        ("ZRODLO_NN_BESS", "bess_inverter_types"),
    ):
        kontrakt = MATERIALIZATION_CONTRACTS[przestrzen]
        assert set(kontrakt.pola_opcjonalne) <= set(POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE)
        for typ_id, typ in sorted(getattr(katalog, pole_repozytorium).items()):
            wynik = materialize_catalog_binding(CatalogBinding(przestrzen, typ_id, "1"), katalog)
            assert wynik.success, (przestrzen, typ_id, wynik.error_message_pl)
            obecne = pola_karty_obecne(typ)
            for nazwa in kontrakt.pola_opcjonalne:
                # Predykat parami: klucz w migawce ⇔ wartość obecna w typie.
                assert (nazwa in wynik.solver_fields) == (nazwa in obecne), (typ_id, nazwa)
                if nazwa in obecne:
                    zmienione.add(typ_id)
    assert sorted(zmienione) == [
        "conv-bess-card-sungrow-sc2000ud-mv",
        "conv-bess-tesla-megapack-3p9mw-15kv",
        "conv-bess-wartsila-gridforming-50mw-30kv",
        "conv-pv-card-huawei-sun2000-215ktl",
        "conv-pv-card-sungrow-sg3150u-mv",
        "conv-pv-gfm-2mw-15kv",
    ]


def test_pola_karty_obecne_z_mapy_i_z_obiektu_sa_zgodne(katalog: CatalogRepository) -> None:
    for typ in katalog.converter_types.values():
        z_obiektu = pola_karty_obecne(typ)
        z_mapy = pola_karty_obecne(
            {n: getattr(typ, n) for n in POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE}
        )
        assert z_obiektu == z_mapy
        assert all(wartosc is not None for wartosc in z_obiektu.values())

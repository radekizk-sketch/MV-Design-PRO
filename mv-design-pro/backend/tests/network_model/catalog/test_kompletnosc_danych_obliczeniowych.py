"""Kompletnosc danych OBLICZENIOWYCH przewodow — podstawa oceny cieplnej.

CO SPRAWDZAMY. Kazdy przewod SN/nN, ktory katalog serwuje do doboru, musi miec
PODSTAWE oceny cieplnej: albo dane wprost z karty producenta (`jth_1s_a_per_mm2`
/ `ith_1s_a`), albo komplet do WYPROWADZENIA wspolczynnika k wg IEC 60949
(material zyly + para temperatur, theta_k > theta_b). Bez ktorejkolwiek z tych
podstaw kryterium wytrzymalosci cieplnej konczy sie brakiem danej, a projektant
nie dowiaduje sie, czy przekroj jest dobrany — i wlasnie to ma tu byc widoczne.

CZEGO NIE ROBIMY. Nie wpisujemy tablicowego `Jth` do rekordow, ktore go nie
niosa. Kanon rozroznia DANE_WPROST_OD_PRODUCENTA od WYPROWADZONYCH: wartosc
tablicowa wpisana do pola katalogowego udaje dana producenta i psuje
proweniencje dowodu. Wyprowadzenie normowe ma wlasne zrodlo
(`K_SOURCE_DERIVED_IEC60949`) i tak ma zostac.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import pytest
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.solvers.conductor_thermal_withstand import derive_k_iec60949

#: Statusy katalogu, dla ktorych brak podstawy cieplnej jest DEFEKTEM. Pozycja
#: referencyjna/analityczna/testowa moze byc niekompletna — produkcyjna nie.
STATUSY_DO_DOBORU: frozenset[str] = frozenset({"PRODUKCYJNY_V1"})


@pytest.fixture(scope="module")
def katalog() -> CatalogRepository:
    return get_default_mv_catalog()


def _przewody(katalog: CatalogRepository) -> dict[str, Sequence[Any]]:
    return {
        "linie SN": list(katalog.line_types.values()),
        "kable SN": list(katalog.cable_types.values()),
        "kable nN": list(katalog.lv_cable_types.values()),
    }


def _ma_dane_wprost(pozycja: Any) -> bool:
    return (
        getattr(pozycja, "jth_1s_a_per_mm2", None) is not None
        or getattr(pozycja, "ith_1s_a", None) is not None
    )


def _wyprowadzenie(pozycja: Any) -> Any:
    return derive_k_iec60949(
        conductor_material=getattr(pozycja, "conductor_material", None),
        temp_operating_c=getattr(pozycja, "max_temperature_c", None),
        temp_short_circuit_c=getattr(pozycja, "short_circuit_temperature_c", None),
    )


@pytest.mark.parametrize("rodzina", ["linie SN", "kable SN", "kable nN"])
def test_kazdy_przewod_do_doboru_ma_podstawe_oceny_cieplnej(
    katalog: CatalogRepository, rodzina: str
) -> None:
    pozycje = [p for p in _przewody(katalog)[rodzina] if p.catalog_status in STATUSY_DO_DOBORU]
    bez_podstawy = [p.id for p in pozycje if not _ma_dane_wprost(p) and _wyprowadzenie(p) is None]
    assert not bez_podstawy, (
        f"{rodzina}: przewody do doboru bez podstawy oceny cieplnej "
        f"(ani Jth/Ith z katalogu, ani material + para temperatur do wyprowadzenia "
        f"IEC 60949): {sorted(bez_podstawy)}"
    )


def test_produkcyjne_przewody_sn_istnieja(katalog: CatalogRepository) -> None:
    """Kontrola DODATNIA: test kompletnosci na pustym zbiorze jest zielony i pusty.

    POMIAR 2026-09-17 (karta KATALOG-NIEZMIENNIKI): linie SN 25 pozycji
    produkcyjnych, kable SN 62. Kable nN maja dzis ZERO pozycji produkcyjnych
    (wszystkie 17 to REFERENCYJNY_V1), wiec dla tej rodziny asercja liczebnosci
    byla by fikcja — jej podstawe cieplna sprawdza osobny test nizej, na CALYM
    zbiorze, bo wszystkie 17 komplet niesie.
    """
    przewody = _przewody(katalog)
    for rodzina in ("linie SN", "kable SN"):
        produkcyjne = [p for p in przewody[rodzina] if p.catalog_status in STATUSY_DO_DOBORU]
        assert len(produkcyjne) > 0, rodzina


def test_kazdy_kabel_nn_ma_podstawe_oceny_cieplnej(katalog: CatalogRepository) -> None:
    """Kable nN: zbior jest dzis w calosci referencyjny, ale komplet niesie podstawe."""
    bez_podstawy = [
        p.id
        for p in _przewody(katalog)["kable nN"]
        if not _ma_dane_wprost(p) and _wyprowadzenie(p) is None
    ]
    assert not bez_podstawy, sorted(bez_podstawy)


@pytest.mark.parametrize("rodzina", ["linie SN", "kable SN", "kable nN"])
def test_katalogowe_k_zgadza_sie_z_wyprowadzeniem_normatywnym(
    katalog: CatalogRepository, rodzina: str
) -> None:
    """Pozycje majace OBA: `Jth` z karty i komplet do wyprowadzenia IEC 60949.

    TOLERANCJA Z POMIARU, NIE Z WYGODY (2026-09-17): najwieksze odchylenie na
    zywym katalogu to 0,60 % (`Jth = 94` dla aluminium 90/250 °C wobec 94,57
    wyprowadzonego) — karty producenckie podaja k zaokraglone do pelnych jednostek.
    Prog 2 % lapie pomylke materialu (Al kontra Cu to ~52 % roznicy) i pomylke pary
    temperatur (70/160 kontra 90/250 to ~25 %), a nie czepia sie zaokraglenia.
    Zapadka tylko w dol: zawezenie progu wymaga nowego pomiaru, nie odwrotnie.
    """
    tolerancja = 0.02
    sprawdzone = 0
    for pozycja in _przewody(katalog)[rodzina]:
        jth = getattr(pozycja, "jth_1s_a_per_mm2", None)
        if jth is None:
            continue
        wyprowadzone = _wyprowadzenie(pozycja)
        if wyprowadzone is None:
            continue
        sprawdzone += 1
        odchylenie = abs(jth - wyprowadzone.k_a_s05_per_mm2) / wyprowadzone.k_a_s05_per_mm2
        assert odchylenie <= tolerancja, (
            f"{pozycja.id}: Jth z karty = {jth} A·√s/mm², wyprowadzenie IEC 60949 = "
            f"{wyprowadzone.k_a_s05_per_mm2:.2f} (material {wyprowadzone.material_key}, "
            f"{wyprowadzone.temp_initial_c} → {wyprowadzone.temp_final_c} °C), "
            f"odchylenie {odchylenie:.2%} > {tolerancja:.0%}"
        )
    assert (
        sprawdzone > 0
    ), f"{rodzina}: zero pozycji z obydwoma podstawami — test nie sprawdzil niczego"


def test_wyprowadzenie_odmawia_bez_kompletu_danych() -> None:
    """Kontrola UJEMNA wyprowadzenia: brak danej daje `None`, nie wartosc zastepcza."""
    assert (
        derive_k_iec60949(
            conductor_material=None, temp_operating_c=70.0, temp_short_circuit_c=160.0
        )
        is None
    )
    assert (
        derive_k_iec60949(
            conductor_material="AL", temp_operating_c=None, temp_short_circuit_c=160.0
        )
        is None
    )
    assert (
        derive_k_iec60949(conductor_material="AL", temp_operating_c=70.0, temp_short_circuit_c=None)
        is None
    )
    # theta_k <= theta_b: zyla bez zapasu cieplnego — rachunek adiabatyczny bez sensu.
    assert (
        derive_k_iec60949(
            conductor_material="AL", temp_operating_c=160.0, temp_short_circuit_c=160.0
        )
        is None
    )
    assert (
        derive_k_iec60949(
            conductor_material="NIEZNANY", temp_operating_c=70.0, temp_short_circuit_c=160.0
        )
        is None
    )

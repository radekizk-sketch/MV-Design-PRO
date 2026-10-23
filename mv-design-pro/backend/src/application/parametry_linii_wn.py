"""Widok parametrów linii 110 kV z geometrii: podgląd przed przypisaniem i ślad linii modelu.

Karta LINIA-110. Warstwa aplikacji: NIE liczy fizyki — woła solver przez JEDNO miejsce
spotkania modelu z solverem (``enm.parametry_linii_wn.oblicz_linie``) i składa odpowiedź:
parametry, ślad White Box (wzór, podstawienie, wynik, jednostka, podstawa), dane przyjęte
(``ESTIMATED``), kompletność dowodu, rozstrzygnięcie każdej składowej danych (projekt albo
wartość robocza z uzasadnieniem i wpływem) i pasma wiarygodności (warstwa interpretacji).

Trzech konsumentów, jeden odczyt linii modelu (``_linia_modelu``):

* ``podglad_parametrow_linii`` — przewód z katalogu + geometria podana w formularzu, bez
  zapisu w modelu (``POST /api/catalog/overhead-conductor-types/{id}/parametry-linii``);
* ``parametry_linii_modelu`` — linia modelu: ślad liczony z jej tabliczki i geometrii; pole
  ``zgodny_z_modelem`` porównuje odcisk wejścia z proweniencją zapisaną w linii
  (``GET /api/cases/{case}/enm/parametry-linii``);
* ``linie_wn_migawki`` — wszystkie linie 110 kV z geometrii w migawce przebiegu: pakiet
  dowodowy przebiegu (``proof_engine/pakiet_biegu.py``) i raport przebiegu
  (``api/analysis_run_exports.py``, sekcja wywodu) — ślad parametrów linii, z którymi liczył
  przebieg.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from analysis.sanity_bounds.parametry_linii_bounds import ocen_parametry_linii_110kv
from enm.katalog_projektu import katalog_dla_modelu
from enm.models import EnergyNetworkModel, GeometriaSlupaLinii, OverheadLine
from enm.nazwy_elementow import nazwa_elementu
from enm.parametry_linii_wn import (
    KOD_GEOMETRIA_BEZ_PRZEWODU_WN,
    BladParametrowLiniiWN,
    linia_z_geometrii,
    linie_modelu_z_geometrii,
    oblicz_linie,
)
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.wartosci_robocze import DaneLiniiRozstrzygniete
from network_model.solvers.parametry_linii_napowietrznej import ParametryLiniiNapowietrznej

#: Kod odmowy: przewodu nie ma w katalogu przewodów linii 110 kV.
KOD_PRZEWOD_NIEZNANY = "line.przewod_wn_nieznany"
#: Kod odmowy: wskazanej gałęzi nie ma w modelu.
KOD_LINIA_NIEZNANA = "line.galaz_nieznana"


def _odpowiedz(
    wynik: ParametryLiniiNapowietrznej, dane: DaneLiniiRozstrzygniete, tabliczka: dict[str, Any]
) -> dict[str, Any]:
    return {
        "przewod": {
            "oznaczenie": tabliczka.get("oznaczenie"),
            "przekroj_mm2": tabliczka.get("cross_section_mm2"),
            "srednica_mm": tabliczka.get("srednica_mm"),
            "r20_dc_ohm_per_km": tabliczka.get("r20_dc_ohm_per_km"),
            "zrodlo": tabliczka.get("source_reference"),
        },
        # Para kontraktu werdyktu §3: wynik solvera niesie listę danych przyjętych, stan danych
        # stoi obok niej wyłącznie przy liście niepustej (pole addytywne).
        "parametry": {
            **wynik.to_dict(),
            **({"status_danych": "UNVALIDATED_INPUT"} if wynik.dane_przyjete else {}),
        },
        "dane_linii": dane.to_dict(),
        "pasma_wiarygodnosci": [
            ocena.to_dict()
            for ocena in ocen_parametry_linii_110kv(
                r1_ohm_per_km=wynik.r1_ohm_per_km,
                x1_ohm_per_km=wynik.x1_ohm_per_km,
                b1_s_per_km=wynik.b1_s_per_km,
                r0_ohm_per_km=wynik.r0_ohm_per_km,
                x0_ohm_per_km=wynik.x0_ohm_per_km,
                b0_s_per_km=wynik.b0_s_per_km,
            )
        ],
    }


def podglad_parametrow_linii(
    przewod_ref: str,
    geometria: GeometriaSlupaLinii | None,
    czestotliwosc_hz: float,
    katalog: CatalogRepository | None = None,
) -> dict[str, Any]:
    """Parametry linii z przewodu katalogu i geometrii z formularza — bez zapisu w modelu."""
    repozytorium = katalog if katalog is not None else get_default_mv_catalog()
    typ = repozytorium.get_overhead_conductor_type(przewod_ref)
    if typ is None:
        raise BladParametrowLiniiWN(
            "Wskazanego przewodu nie ma w katalogu przewodów linii 110 kV — wybierz pozycję "
            "z listy katalogu.",
            kod=KOD_PRZEWOD_NIEZNANY,
            dane={"przewod_ref": przewod_ref},
        )
    tabliczka = typ.to_dict()
    element: dict[str, Any] = {
        "type": "line_overhead",
        "source_mode": "KATALOG",
        "name": typ.name,
        "materialized_params": tabliczka,
        "geometria_slupa": (geometria.model_dump(mode="json") if geometria is not None else None),
    }
    wynik, dane = oblicz_linie(element, repozytorium, czestotliwosc_hz)
    return _odpowiedz(wynik, dane, tabliczka)


@dataclass(frozen=True)
class LiniaWNModelu:
    """Linia 110 kV modelu z wynikiem solvera i zgodnością z proweniencją zapisaną w linii."""

    branch_ref: str
    nazwa: str
    wynik: ParametryLiniiNapowietrznej
    dane: DaneLiniiRozstrzygniete
    tabliczka: dict[str, Any]
    zgodny_z_modelem: bool


def _linia_modelu(enm: EnergyNetworkModel, galaz: OverheadLine) -> LiniaWNModelu:
    """Ślad linii z jej tabliczki i geometrii; ``zgodny_z_modelem`` porównuje odcisk wejścia
    z proweniencją zapisaną w linii (czy R′/X′/B′/Z′0 modelu pochodzą z TEGO wyliczenia).
    """
    element = galaz.model_dump(mode="json")
    wynik, dane = oblicz_linie(element, katalog_dla_modelu(enm), enm.header.defaults.frequency_hz)
    proweniencja = galaz.parametry_z_geometrii
    return LiniaWNModelu(
        branch_ref=galaz.ref_id,
        nazwa=nazwa_elementu(galaz, "branches"),
        wynik=wynik,
        dane=dane,
        tabliczka=dict(element["materialized_params"]),
        zgodny_z_modelem=(
            proweniencja is not None and proweniencja.odcisk_wejscia == wynik.odcisk_wejscia
        ),
    )


def parametry_linii_modelu(enm: EnergyNetworkModel, branch_ref: str) -> dict[str, Any]:
    """Ślad parametrów linii modelu (przewód z katalogu 110 kV + geometria słupa)."""
    galaz = next((g for g in enm.branches if g.ref_id == branch_ref), None)
    if galaz is None:
        raise BladParametrowLiniiWN(
            "Wskazanej gałęzi nie ma w modelu sieci.",
            kod=KOD_LINIA_NIEZNANA,
            dane={"branch_ref": branch_ref},
        )
    if not isinstance(galaz, OverheadLine) or not linia_z_geometrii(galaz.model_dump(mode="json")):
        raise BladParametrowLiniiWN(
            f"Gałąź {nazwa_elementu(galaz, 'branches')} nie jest linią z przewodem z katalogu "
            "linii 110 kV — jej parametry nie wynikają z geometrii słupa.",
            kod=KOD_GEOMETRIA_BEZ_PRZEWODU_WN,
            dane={"branch_ref": branch_ref},
        )
    linia = _linia_modelu(enm, galaz)
    return {
        "branch_ref": branch_ref,
        "nazwa": linia.nazwa,
        "zgodny_z_modelem": linia.zgodny_z_modelem,
        **_odpowiedz(linia.wynik, linia.dane, linia.tabliczka),
    }


def linie_wn_migawki(migawka: Mapping[str, Any]) -> list[LiniaWNModelu]:
    """Linie 110 kV z geometrii w migawce przebiegu (kolejność gałęzi — deterministycznie).

    Migawka bez żadnej linii z przewodem z katalogu 110 kV daje pustą listę BEZ walidacji
    całego modelu — pakiety i raporty istniejących sieci nie zmieniają się ani o bajt.
    Predykat linii jest TEN SAM co w modelu (``linia_z_geometrii``) — obie strony czytają
    jedno źródło prawdy.
    """
    galezie = migawka.get("branches") or []
    if not any(isinstance(g, Mapping) and linia_z_geometrii(g) for g in galezie):
        return []
    enm = EnergyNetworkModel.model_validate(dict(migawka))
    return [_linia_modelu(enm, linia) for linia in linie_modelu_z_geometrii(enm)]


def slad_linii_do_raportu(linia: LiniaWNModelu) -> dict[str, Any]:
    """Wpis sekcji wywodu raportu przebiegu: kroki w kształcie kroków wywodu biegu."""
    return {
        "branch_ref": linia.branch_ref,
        "nazwa": linia.nazwa,
        "zgodny_z_modelem": linia.zgodny_z_modelem,
        "kompletnosc_dowodu": linia.wynik.kompletnosc_dowodu,
        "metoda": linia.wynik.metoda,
        "wersja_metody": linia.wynik.wersja_metody,
        "dane_przyjete": [d.model_dump(mode="json") for d in linia.wynik.dane_przyjete],
        "kroki": [
            {
                "key": krok.kod,
                "title": krok.opis_pl,
                "formula_latex": krok.wzor_latex,
                "substitution_latex": krok.podstawienie_latex,
                "result": krok.wynik.to_dict(),
                "notes": krok.podstawa_pl,
            }
            for krok in linia.wynik.slad
        ],
    }

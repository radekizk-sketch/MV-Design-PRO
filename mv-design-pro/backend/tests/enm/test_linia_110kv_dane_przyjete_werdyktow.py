"""Werdykty liczone na linii 110 kV z wartością roboczą geometrii mają dowód NIEPEŁNY.

DLACZEGO. Karta LINIA-110 (rozstrzygnięcie architekta, pkt 1; kontrakt werdyktu §3, zasada nr 4
pkt 5): linia 110 kV bez geometrii słupa projektu liczy R′, X′, B′ i Z′0 z wartości roboczej
geometrii. Każdy werdykt, do którego liczby wchodzi impedancja takiej linii (zwarcia w wyspie
linii, rozpływ całej sieci), stoi na DANEJ PRZYJĘTEJ — ``dane_przyjete`` (jakość ``ESTIMATED``),
stan danych ``UNVALIDATED_INPUT``, kompletność ``NIEPELNY``. Linia z geometrią projektu nie może
dać danej przyjętej (słowniki widoków bit w bit jak przed kartą).

KONSUMENCI (inwentarz klasy, jedno źródło — założenia biegu):
* bieg zwarciowy: wiersz punktu (``dane_przyjete_galezi``), wytrzymałość cieplna przewodów,
  pasma wiarygodności Ik″, siła sieci, migotanie, pozycje werdyktu projektowego ze źródła
  zwarciowego;
* bieg rozpływu: bilans energii, warunki przyłączenia, pasma wiarygodności rozpływu, profil
  napięć, wystarczalność mocy biernej, wrażliwość rozpływu, kontyngencje N-1, dobór
  kompensacji, pozycje werdyktu projektowego ze źródła rozpływu.

ILOCZYN CECH: {geometria projektu, wartość robocza} × {punkt zwarcia przy źródle, na końcu
linii} × konsument; dodatkowo linia otwarta (nie wchodzi do sieci — bez danej przyjętej).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from api.generators import _prady_zwarciowe_szyny
from application.analyses.dobor_kompensacji import build_compensation_sizing_view
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.grid_strength import build_grid_strength_view
from application.analyses.kontyngencje_n1 import build_kontyngencje_n1_view
from application.analyses.migotanie import build_migotanie_view
from application.analyses.reactive_adequacy import build_reactive_adequacy_view
from application.analyses.sanity_bounds import (
    build_power_flow_sanity_bounds_view,
    build_sanity_bounds_view,
)
from application.analyses.voltage_profile_view import build_voltage_profile_view
from application.analyses.warunki_przylaczenia import build_warunki_przylaczenia_view
from application.analyses.werdykt_projektowy import zbuduj_werdykt_projektowy
from application.analyses.wniosek_osd import _zwarcia_sekcja
from application.analyses.wrazliwosc_rozplywu import build_wrazliwosc_view
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from application.protection_settings.batch_run import _dane_przyjete_punktow
from enm.dane_przyjete_galezi import KLUCZ_WIERSZA_DANE_GALEZI
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.parametry_linii_wn import KOD_GEOMETRIA_ROBOCZA
from enm.topology_ops import create_branch

from tests.enm.test_linia_110kv_wpiecie import (
    GEOMETRIA_PELNA,
    _bieg,
    _czysty_magazyn,  # noqa: F401 — fikstura autouse: czysty magazyn biegów i modeli
    _model,
    _ok,
    _opcje_zwarcia,
    _przypisz,
)
from tests.reference_networks.budowa_przez_api import SLUP_ROZGALEZNY, wiazanie

#: Iloczyn: (opis, geometria słupa, czy wynik stoi na danej przyjętej).
GEOMETRIE = [("projekt", GEOMETRIA_PELNA, False), ("robocza", None, True)]

#: Kryteria werdyktu projektowego liczone z biegu zwarciowego i z biegu rozpływu.
KRYTERIA_SC = ("przewod.wytrzymalosc_zwarciowa", "wynik.wiarygodnosc_zwarciowa")
KRYTERIA_PF = (
    "napiecie.odchylenie",
    "galaz.obciazenie_dlugotrwale",
    "straty.budzet",
    "moc_bierna.bilans",
)


def _migawka(geometria: dict[str, Any] | None) -> dict:
    return _ok(_przypisz(_model(geometria)))


def _bieg_sc(geometria: dict[str, Any] | None) -> Any:
    bieg = _bieg(_migawka(geometria), "short_circuit_sn", _opcje_zwarcia("B"))
    assert bieg.status == "FINISHED", bieg.error_message
    return bieg


def _bieg_sc_z_oze(geometria: dict[str, Any] | None) -> Any:
    """Bieg zwarciowy liczony solverem + moduł przekształtnikowy 10 MVA w węźle B migawki biegu.

    Siła sieci i migotanie oceniają WYŁĄCZNIE węzły z generacją przekształtnikową (bez niej lista
    pozycji jest pusta i test nie sprawdzałby niczego). Gotowość modelu odmawia falownika
    wprost na szynie 110 kV (wymaga toru przyłączenia przez transformator), a wiersze zwarciowe
    tych widoków pochodzą z rozwiązania sieci, nie z modułu — moduł dopisujemy więc do migawki
    TEGO biegu (widoki czytają moduły z ``run.snapshot``); wiersz z daną przyjętą liczy solver.
    """
    bieg = _bieg_sc(geometria)
    modul = {
        "ref_id": "PV",
        "name": "Farma PV",
        "bus_ref": "B",
        "gen_type": "pv_inverter",
        "p_mw": 10.0,
        "q_mvar": 0.0,
        "materialized_params": {"sn_mva": 10.0, "flicker_c": 2.0},
    }
    bieg.snapshot = {**(bieg.snapshot or {}), "generators": [modul]}
    return bieg


def _dane_widoku(widok: dict[str, Any]) -> list[dict[str, Any]]:
    """Dane przyjęte widoku w kształcie wspólnym (``status_danych`` + ``dane_przyjete``)."""
    dane = list(widok.get("dane_przyjete") or [])
    if dane:
        assert widok["status_danych"] == "UNVALIDATED_INPUT"
    else:
        assert "status_danych" not in widok
    return dane


def _sprawdz_dane(dane: list[dict[str, Any]], na_danej_przyjetej: bool) -> None:
    if not na_danej_przyjetej:
        assert dane == []
        return
    assert dane, "werdykt na linii z wartością roboczą geometrii bez danej przyjętej"
    assert {d["jakosc"] for d in dane} == {"ESTIMATED"}
    assert all("Linia 110 kV A–B" in d["nazwa_pl"] + d["powod_pl"] for d in dane), dane


def _niepuste(pozycje: list[dict[str, Any]]) -> list[dict[str, Any]]:
    assert pozycje, "konsument bez pozycji — test nie sprawdzałby niczego"
    return pozycje


# ---------------------------------------------------------------------------
# Bieg zwarciowy: wiersz punktu i konsumenci
# ---------------------------------------------------------------------------


_KONSUMENCI_SC: dict[str, Callable[[Any], list[dict[str, Any]]]] = {
    "wytrzymalosc_cieplna": lambda geometria: _dane_widoku(
        build_wytrzymalosc_cieplna_view(_bieg_sc(geometria))
    ),
    "pasma_wiarygodnosci": lambda geometria: [
        d
        for pozycja in _niepuste(build_sanity_bounds_view(_bieg_sc(geometria))["items"])
        for d in _dane_widoku(pozycja)
    ],
    "sila_sieci": lambda geometria: [
        d
        for pozycja in _niepuste(build_grid_strength_view(_bieg_sc_z_oze(geometria))["entries"])
        for d in _dane_widoku(pozycja)
    ],
    "migotanie": lambda geometria: [
        d
        for pozycja in _niepuste(build_migotanie_view(_bieg_sc_z_oze(geometria))["buses"])
        for d in _dane_widoku(pozycja)
    ],
}


@pytest.mark.parametrize("szyna", ["A", "B"])
@pytest.mark.parametrize(("opis", "geometria", "przyjeta"), GEOMETRIE)
def test_wiersz_biegu_zwarciowego_niesie_dane_przyjete_linii_wyspy(
    opis: str, geometria: dict | None, przyjeta: bool, szyna: str
) -> None:
    bieg = _bieg(_migawka(geometria), "short_circuit_sn", _opcje_zwarcia(szyna))
    assert bieg.status == "FINISHED", bieg.error_message
    [wiersz] = (bieg.raw_result or {})["results"]
    _sprawdz_dane(list(wiersz.get(KLUCZ_WIERSZA_DANE_GALEZI) or []), przyjeta)
    if not przyjeta:
        assert KLUCZ_WIERSZA_DANE_GALEZI not in wiersz


@pytest.mark.parametrize("konsument", sorted(_KONSUMENCI_SC))
@pytest.mark.parametrize(("opis", "geometria", "przyjeta"), GEOMETRIE)
def test_werdykty_zwarciowe_na_danej_przyjetej_linii(
    opis: str, geometria: dict | None, przyjeta: bool, konsument: str
) -> None:
    _sprawdz_dane(_KONSUMENCI_SC[konsument](geometria), przyjeta)


# ---------------------------------------------------------------------------
# Bieg rozpływu: konsumenci liczeni z rozwiązania całej sieci
# ---------------------------------------------------------------------------


_KONSUMENCI_PF: dict[str, Callable[[Any], dict[str, Any]]] = {
    "bilans_energii": build_energy_validation_view,
    "warunki_przylaczenia": build_warunki_przylaczenia_view,
    "pasma_wiarygodnosci_rozplywu": build_power_flow_sanity_bounds_view,
    "profil_napiec": build_voltage_profile_view,
    "moc_bierna": build_reactive_adequacy_view,
    "wrazliwosc": lambda bieg: build_wrazliwosc_view(bieg, nazwa_przypadku="Linia 110 kV"),
    "kontyngencje_n1": build_kontyngencje_n1_view,
    "dobor_kompensacji": lambda bieg: build_compensation_sizing_view(
        bieg, bus_ref="B", cos_phi_min=0.95
    ),
}


@pytest.mark.parametrize("konsument", sorted(_KONSUMENCI_PF))
@pytest.mark.parametrize(("opis", "geometria", "przyjeta"), GEOMETRIE)
def test_werdykty_rozplywu_na_danej_przyjetej_linii(
    opis: str, geometria: dict | None, przyjeta: bool, konsument: str
) -> None:
    bieg = _bieg(_migawka(geometria), "PF", {})
    assert bieg.status == "FINISHED", bieg.error_message
    _sprawdz_dane(_dane_widoku(_KONSUMENCI_PF[konsument](bieg)), przyjeta)


# ---------------------------------------------------------------------------
# Agregat: werdykt projektowy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("opis", "geometria", "przyjeta"), GEOMETRIE)
def test_werdykt_projektowy_kompletnosc_dowodu_z_obu_zrodel(
    opis: str, geometria: dict | None, przyjeta: bool
) -> None:
    """Agregat nie zastępuje składowych (§2.3): pozycja z elementem na danej przyjętej ma
    kompletność ``NIEPELNY`` — dla kryteriów z biegu zwarciowego I z biegu rozpływu."""
    migawka = _migawka(geometria)
    bieg_sc = _bieg(migawka, "short_circuit_sn", _opcje_zwarcia("B"))
    bieg_pf = _bieg(migawka, "PF", {})
    werdykt = zbuduj_werdykt_projektowy(
        case_id="linia-110",
        model_hash=compute_enm_hash(EnergyNetworkModel.model_validate(migawka)),
        bieg_pf=bieg_pf,
        bieg_sc=bieg_sc,
        enm_snapshot=migawka,
    ).to_dict()
    pozycje = {p["kryterium_id"]: p for p in werdykt["pozycje"]}
    for kryterium in KRYTERIA_SC + KRYTERIA_PF:
        pozycja = pozycje[kryterium]
        assert pozycja["stan"] == "SPELNIONE", (kryterium, pozycja["stan"], pozycja["powod_pl"])
        assert pozycja["elementy"]
        if przyjeta:
            assert pozycja["kompletnosc_dowodu"] == "NIEPELNY", kryterium
            for element in pozycja["elementy"]:
                assert element["kompletnosc_dowodu"] == "NIEPELNY"
                _sprawdz_dane(element["dane_przyjete"], True)
        else:
            assert "kompletnosc_dowodu" not in pozycja, kryterium
            assert all("dane_przyjete" not in e for e in pozycja["elementy"])
    if przyjeta:
        assert werdykt["kompletnosc_dowodu"] == "NIEPELNY"
    else:
        assert "kompletnosc_dowodu" not in werdykt


# ---------------------------------------------------------------------------
# Predykat zbioru: linia otwarta nie wchodzi do sieci
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["closed", "open"])
def test_linia_robocza_rownolegla_tylko_zalaczona_daje_dana_przyjeta(status: str) -> None:
    """Dwie linie równoległe A–B: L1 z geometrią projektu, L2 z wartością roboczą. L2
    otwarta nie wchodzi do sieci zwarciowej ani rozpływu — bez założenia i danej przyjętej."""
    migawka = _migawka(GEOMETRIA_PELNA)
    robocza = next(b for b in _migawka(None)["branches"] if b["ref_id"] == "L1")
    migawka["branches"].append(
        {
            **robocza,
            "id": str(uuid.uuid4()),
            "ref_id": "L2",
            "name": "Linia 110 kV A–B tor 2",
            "status": status,
        }
    )
    zalaczona = status == "closed"
    bieg = _bieg(migawka, "short_circuit_sn", _opcje_zwarcia("B"))
    assert bieg.status == "FINISHED", bieg.error_message
    zalozenia = [
        z
        for z in (bieg.raw_result or {}).get("zalozenia") or []
        if z.get("code") == KOD_GEOMETRIA_ROBOCZA
    ]
    assert [z["element_ref"] for z in zalozenia] == (["L2"] if zalaczona else [])
    [wiersz] = (bieg.raw_result or {})["results"]
    dane = list(wiersz.get(KLUCZ_WIERSZA_DANE_GALEZI) or [])
    assert bool(dane) is zalaczona
    assert all("tor 2" in d["nazwa_pl"] + d["powod_pl"] for d in dane)
    bieg_pf = _bieg(migawka, "PF", {})
    assert bool(_dane_widoku(build_energy_validation_view(bieg_pf))) is zalaczona


# ---------------------------------------------------------------------------
# Budowa odcinka operacją topologii zachowuje geometrię i proweniencję
# ---------------------------------------------------------------------------


def test_budowa_odcinka_zachowuje_geometrie_i_proweniencje() -> None:
    """Biała lista ``create_branch`` gubiła ``geometria_slupa`` i ``parametry_z_geometrii``,
    gdy operacja buduje odcinek z danych istniejącej linii (podział odcinka kopiuje je
    ``_copy_split_segment_fields`` i woła ``create_branch``) — połówki linii z geometrią
    projektu wracały z uzupełnienia katalogu policzone z wartości roboczej."""
    zrodlo = next(b for b in _migawka(GEOMETRIA_PELNA)["branches"] if b["ref_id"] == "L1")
    migawka = _model(None)
    migawka["branches"] = []
    dane = {k: v for k, v in zrodlo.items() if k not in {"id"}}
    dane["ref_id"] = "L2"
    wynik = create_branch(migawka, dane)
    assert wynik.success, wynik.issues
    [linia] = [b for b in wynik.enm["branches"] if b["ref_id"] == "L2"]
    assert linia["geometria_slupa"] == zrodlo["geometria_slupa"]
    assert linia["parametry_z_geometrii"] == zrodlo["parametry_z_geometrii"]


def test_podzial_linii_slupem_zachowuje_geometrie_projektu_polowek() -> None:
    """Ścieżka użytkownika: wstawienie słupa w linię z geometrią projektu dzieli odcinek
    (``_copy_split_segment_fields`` → ``create_branch``). Obie połówki zostają liczone z
    geometrii projektu (kompletność ``PELNY``) — bez fałszywej danej przyjętej."""
    migawka = _migawka(GEOMETRIA_PELNA)
    wynik = execute_domain_operation(
        migawka,
        "insert_branch_pole_on_segment_sn",
        {
            "segment_id": "L1",
            "catalog_binding": wiazanie("mv_branch_points", SLUP_ROZGALEZNY),
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "switch_state": "closed",
            "name": "Słup odgałęźny",
        },
    )
    polowki = [b for b in _ok(wynik)["branches"] if b["type"] == "line_overhead"]
    assert len(polowki) == 2
    for polowka in polowki:
        assert polowka["geometria_slupa"] == GEOMETRIA_PELNA
        assert polowka["parametry_z_geometrii"]["kompletnosc_dowodu"] == "PELNY"
        assert polowka["parametry_z_geometrii"]["wartosci_robocze"] == []


@pytest.mark.parametrize(("opis", "geometria", "przyjeta"), GEOMETRIE)
def test_konsumenci_pradow_punktu_wniosek_osd_generatory_nastawy(
    opis: str, geometria: dict | None, przyjeta: bool
) -> None:
    """Wniosek do OSD (sekcja zwarć), reguły generatorów pola (wiersz 3F) i nastawy z biegów
    czytają dane przyjęte z TEGO SAMEGO wiersza co prąd punktu."""
    migawka = _migawka(geometria)
    bieg = _bieg(migawka, "short_circuit_sn", _opcje_zwarcia("B"))
    assert bieg.status == "FINISHED", bieg.error_message
    _sprawdz_dane(list(_zwarcia_sekcja(bieg, "B").get("dane_przyjete") or []), przyjeta)
    ik, _ip, run_id, _tolerancja, dane_galezi = _prady_zwarciowe_szyny("linia-110", "B")
    assert ik is not None and run_id == str(bieg.id)
    _sprawdz_dane([d.model_dump(mode="json") for d in dane_galezi], przyjeta)
    dane_nastaw = _dane_przyjete_punktow(
        EnergyNetworkModel.model_validate(migawka),
        [(bieg.raw_result, ref_to_graph_id("B"), "B")],
    )
    _sprawdz_dane([d.model_dump(mode="json") for d in dane_nastaw], przyjeta)

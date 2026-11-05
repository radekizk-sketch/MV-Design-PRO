"""Dane materiałowe i cieplne gałęzi: dwie drogi materializacji, JEDEN zapis.

DLACZEGO. Karta EWALUATORY-ZIEMNOZWARCIOWE wykryła, że połówki odcinka po wstawieniu łącznika
sekcyjnego dostawały tabliczkę z UZUPEŁNIENIA na granicy ENM
(``catalog_completion.complete_branch_catalog_materialization``), które przepisywało tylko część
pól operacji domenowych (``domain_operations._apply_materialized_branch_fields``): kabel tracił
parę temperatur, izolację i odniesienie danych cieplnych, linia napowietrzna — także przekrój,
materiał i Jth żyły. Skutek fizyczny: zwarcie minimalne liczyło rezystancję takiej połówki w innej
temperaturze niż identyczny kabel obok (pomiar na scenie koordynacji: R_k szyny nN
3,3177 → 3,4294 mΩ po naprawie), a kryterium cieplne nie miało pary temperatur.

ILOCZYN CECH: rodzaj gałęzi {kabel SN, linia napowietrzna SN} × droga {operacja domenowa,
uzupełnienie gałęzi bez tabliczki, uzupełnienie gałęzi z tabliczką bez danych cieplnych} ×
wartość projektanta {brak, temperatura robocza projektanta}. Predykat wejścia uzupełnienia
i zapis tworzą parę — drugie uzupełnienie nie ma nic do zmiany (idempotencja).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.catalog_completion import (
    complete_branch_catalog_materialization,
    pola_tabliczki_galezi,
)
from enm.domain_operations import execute_domain_operation
from enm.models import Cable, EnergyNetworkModel, OverheadLine

from tests.enm.test_canonical_sc_c_per_pasmo import _build_mv_lv_enm

KABEL_SN = "cable-tfk-yakxs-3x120"
LINIA_SN = "line-base-al-150"

#: Pola zapisywane z tabliczki (pomiar: kabel 15 pól, linia 7 pól na pozycjach wyżej).
_POLA_CIEPLNE = ("operating_temperature_c", "short_circuit_temperature_c", "thermal_source_ref")


def _ok(wynik: dict[str, Any]) -> dict[str, Any]:
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"]


def _migawka_operacji(rodzaj: str) -> dict[str, Any]:
    """Gałąź C_SN zmaterializowana OPERACJĄ (przypisanie pozycji katalogu — ścieżka użytkownika)."""
    migawka = _build_mv_lv_enm(f"tabliczka-{rodzaj}").model_dump(mode="json")
    if rodzaj == "linia":
        galaz = next(b for b in migawka["branches"] if b["ref_id"] == "C_SN")
        zachowane = {
            k: galaz[k]
            for k in ("id", "ref_id", "name", "from_bus_ref", "to_bus_ref", "status", "length_km")
        }
        galaz.clear()
        galaz.update(
            {
                **zachowane,
                "type": "line_overhead",
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.35,
                "tags": [],
                "meta": {},
            }
        )
    return _ok(
        execute_domain_operation(
            migawka,
            "assign_catalog_to_element",
            {
                "element_ref": "C_SN",
                "catalog_binding": {
                    "catalog_namespace": "LINIA_SN" if rodzaj == "linia" else "KABEL_SN",
                    "catalog_item_id": LINIA_SN if rodzaj == "linia" else KABEL_SN,
                    "catalog_item_version": "2024.1",
                },
            },
        )
    )


def _galaz(migawka: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in migawka["branches"] if b["ref_id"] == "C_SN")


def _oczekiwane(rodzaj: str, migawka: dict[str, Any]) -> dict[str, Any]:
    return pola_tabliczki_galezi(
        _galaz(migawka)["materialized_params"], pola_kabla=rodzaj == "kabel"
    )


def _zubozona(migawka: dict[str, Any], droga: str, rodzaj: str) -> dict[str, Any]:
    """Gałąź, jaką dostaje uzupełnienie: bez tabliczki (sam ``catalog_ref``) albo z tabliczką,
    ale bez danych materiałowych i cieplnych (migawka zapisana przed naprawą)."""
    galaz = _galaz(migawka)
    for pole in _oczekiwane(rodzaj, migawka):
        galaz[pole] = None
    if droga == "bez_tabliczki":
        galaz["materialized_params"] = None
    return migawka


@pytest.mark.parametrize("rodzaj", ["kabel", "linia"])
def test_operacja_domenowa_zapisuje_komplet_pol_tabliczki(rodzaj: str) -> None:
    migawka = _migawka_operacji(rodzaj)
    oczekiwane = _oczekiwane(rodzaj, migawka)
    assert set(_POLA_CIEPLNE) <= set(oczekiwane), oczekiwane
    if rodzaj == "kabel":
        assert oczekiwane["insulation"] == "XLPE"
    else:
        assert "insulation" not in oczekiwane
        assert {"cross_section_mm2", "conductor_material", "jth_1s_a_per_mm2"} <= set(oczekiwane)
    galaz = _galaz(migawka)
    for pole, wartosc in oczekiwane.items():
        assert galaz[pole] == wartosc, pole
    # Gałąź zmaterializowana operacją jest kompletna — uzupełnienie nie ma czego zmieniać.
    _, zmiana = complete_branch_catalog_materialization(EnergyNetworkModel.model_validate(migawka))
    assert zmiana is False


@pytest.mark.parametrize("droga", ["bez_tabliczki", "tabliczka_bez_pol_cieplnych"])
@pytest.mark.parametrize("rodzaj", ["kabel", "linia"])
def test_uzupelnienie_daje_te_same_pola_co_operacja(rodzaj: str, droga: str) -> None:
    wzorzec = _migawka_operacji(rodzaj)
    oczekiwane = _oczekiwane(rodzaj, wzorzec)
    migawka = _zubozona(_migawka_operacji(rodzaj), droga, rodzaj)

    enm, zmiana = complete_branch_catalog_materialization(
        EnergyNetworkModel.model_validate(migawka)
    )
    assert zmiana is True
    galaz = next(b for b in enm.branches if b.ref_id == "C_SN")
    assert isinstance(galaz, Cable if rodzaj == "kabel" else OverheadLine)
    for pole, wartosc in oczekiwane.items():
        assert getattr(galaz, pole) == wartosc, pole

    # Predykaty parami: wejście uzupełnienia uznaje wynik zapisu za kompletny.
    _, druga = complete_branch_catalog_materialization(enm)
    assert druga is False


@pytest.mark.parametrize("rodzaj", ["kabel", "linia"])
def test_temperatura_projektanta_przezywa_uzupelnienie(rodzaj: str) -> None:
    migawka = _migawka_operacji(rodzaj)
    tabliczkowa = _oczekiwane(rodzaj, migawka)["operating_temperature_c"]
    galaz = _galaz(migawka)
    galaz["operating_temperature_c"] = tabliczkowa - 20.0
    galaz["thermal_source_ref"] = None  # brak pola z tabliczki — uzupełnienie je dopisze

    enm, zmiana = complete_branch_catalog_materialization(
        EnergyNetworkModel.model_validate(migawka)
    )
    assert zmiana is True
    po = next(b for b in enm.branches if b.ref_id == "C_SN")
    assert po.operating_temperature_c == tabliczkowa - 20.0
    assert po.thermal_source_ref == _oczekiwane(rodzaj, migawka)["thermal_source_ref"]
    _, druga = complete_branch_catalog_materialization(enm)
    assert druga is False

"""Aparat pola SN opisany W MODELU tak, jak wskazano w katalogu.

Karta KOMPLETNOSC-POLA-TR §0 pkt 1 (zakaz fabrykacji). Kreator ma prowadzić
projektanta przez WARIANTY wyposażenia pola (dla pola transformatorowego:
rozłącznik bezpiecznikowy albo wyłącznik). Wariant, którego backend nie
odwzorowuje w modelu, byłby kontrolką bez pokrycia — dlatego obie operacje
stacyjne muszą zapisywać gałąź aparatu Z RODZAJU wskazanej pozycji katalogu, a
nie zawsze jako wyłącznik.

ILOCZYN CECH (reguła KLASA §2): {wyłącznik, rozłącznik bezpiecznikowy,
odłącznik} × {wstawienie w odcinek, dołożenie na końcu ciągu} × {pole liniowe,
pole transformatorowe, sprzęgło}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import append_station_on_endpoint, insert_station_on_segment_sn
from network_model.catalog.bay_templates import (
    BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE,
    primary_apparatus_kinds_for_bay_role,
)
from network_model.catalog.repository import get_default_mv_catalog

WYLACZNIK = "sw-cb-abb-vd4-17kv-630a"
ROZLACZNIK_BEZPIECZNIKOWY = "sw-fuse-eti-vv-17kv-63a"
ODLACZNIK = "sw-ds-abb-ojs-17kv-630a"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"


def _enm_z_odcinkiem() -> dict[str, Any]:
    return {
        "header": {"name": "aparat-pola"},
        "buses": [
            {"ref_id": "bus-a", "name": "A", "voltage_kv": 15.0},
            {"ref_id": "bus-b", "name": "B", "voltage_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "seg-1",
                "name": "Odcinek",
                "type": "cable",
                "from_bus_ref": "bus-a",
                "to_bus_ref": "bus-b",
                "length_km": 1.0,
                "r_ohm": 0.2,
                "x_ohm": 0.1,
            }
        ],
        "transformers": [],
        "substations": [],
        "corridors": [],
    }


def _wstaw_stacje(apparatus_ref: str, role: list[str]) -> dict[str, Any]:
    return insert_station_on_segment_sn(
        _enm_z_odcinkiem(),
        {
            "segment_id": "seg-1",
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": role,
            "field_apparatus_catalog_ref": apparatus_ref,
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
        },
    )


def _aparaty_pol(odpowiedz: dict[str, Any]) -> list[dict[str, Any]]:
    snapshot = odpowiedz.get("snapshot") or {}
    return [
        branch
        for branch in snapshot.get("branches", [])
        if "station_field_device" in (branch.get("tags") or [])
    ]


@pytest.mark.parametrize(
    ("apparatus_ref", "oczekiwany_typ", "oczekiwana_nazwa"),
    [
        (WYLACZNIK, "breaker", "Wyłącznik pola SN"),
        (ROZLACZNIK_BEZPIECZNIKOWY, "switch", "Rozłącznik bezpiecznikowy pola SN"),
        (ODLACZNIK, "disconnector", "Odłącznik pola SN"),
    ],
)
def test_wstawienie_stacji_zapisuje_rodzaj_aparatu_z_katalogu(
    apparatus_ref: str, oczekiwany_typ: str, oczekiwana_nazwa: str
) -> None:
    odpowiedz = _wstaw_stacje(apparatus_ref, ["IN", "OUT", "TR"])
    assert odpowiedz.get("error") is None, odpowiedz

    aparaty = _aparaty_pol(odpowiedz)
    assert len(aparaty) == 3
    assert {a["type"] for a in aparaty} == {oczekiwany_typ}
    assert all(a["name"].startswith(oczekiwana_nazwa) for a in aparaty), [
        a["name"] for a in aparaty
    ]
    assert {a["catalog_ref"] for a in aparaty} == {apparatus_ref}


def test_sprzeglo_zachowuje_typ_lacznika_sekcji_niezaleznie_od_rodzaju_aparatu() -> None:
    """Rola elementu w topologii (sprzęgło) i rodzaj wyrobu to DWIE różne osie."""
    odpowiedz = _wstaw_stacje(ROZLACZNIK_BEZPIECZNIKOWY, ["IN", "OUT", "SPRZEGLO", "TR"])
    assert odpowiedz.get("error") is None, odpowiedz

    aparaty = _aparaty_pol(odpowiedz)
    typy = {(a.get("meta") or {}).get("bay_role"): a["type"] for a in aparaty}
    assert typy["COUPLER"] == "bus_coupler"
    assert typy["TR"] == "switch"


def test_dolozenie_stacji_na_koncu_ciagu_uzywa_TEJ_SAMEJ_reguly() -> None:
    """Parytet dróg: obie operacje stacyjne opisują aparat tak samo."""
    enm = _enm_z_odcinkiem()
    odpowiedz = append_station_on_endpoint(
        enm,
        {
            "endpoint_bus_ref": "bus-b",
            "station_type": "B",
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "TR"],
            "field_apparatus_catalog_ref": ROZLACZNIK_BEZPIECZNIKOWY,
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
        },
    )
    assert odpowiedz.get("error") is None, odpowiedz

    aparaty = _aparaty_pol(odpowiedz)
    assert aparaty, "operacja musi utworzyć aparaty pól"
    assert {a["type"] for a in aparaty} == {"switch"}
    assert all(a["name"].startswith("Rozłącznik bezpiecznikowy pola SN") for a in aparaty)


def test_zawezenie_rodzajow_aparatu_opisuje_realne_pozycje_katalogu() -> None:
    """Tablica ról → rodzajów nie może wskazywać rodzajów, których katalog nie ma.

    Deklaracja bez pokrycia w danych zamieniłaby picker kreatora w listę pustą
    (zawężenie do rodzaju, którego nie ma) — czyli zdolność opisaną i niedziałającą.
    """
    rodzaje_w_katalogu = {
        item.to_dict()["device_kind"] for item in get_default_mv_catalog().list_mv_apparatus_types()
    }
    for rola, rodzaje in BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE.items():
        assert rodzaje, f"rola {rola} deklaruje pustą listę rodzajów"
        brakujace = set(rodzaje) - rodzaje_w_katalogu
        assert not brakujace, f"rola {rola}: rodzaje spoza katalogu {sorted(brakujace)}"


def test_pole_transformatorowe_ma_dwa_realne_rozwiazania() -> None:
    """Rdzeń karty: pole TR to rozłącznik bezpiecznikowy ALBO wyłącznik."""
    assert primary_apparatus_kinds_for_bay_role("TR") == [
        "ROZLACZNIK_BEZPIECZNIKOWY",
        "WYLACZNIK",
    ]
    # Rola spoza tablicy nie dostaje zgadywanego zawężenia.
    assert primary_apparatus_kinds_for_bay_role("NIEZNANA") == []

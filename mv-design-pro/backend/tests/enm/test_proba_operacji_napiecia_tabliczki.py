"""Próba operacji (`dry_run`) dla elementów z regułą napięcia tabliczki wobec szyny.

Klasa defektu (scalenie gałęzi UI/UX z gałęzią programu, 2026-10-28): kreatory ui2 liczyły
we froncie WŁASNĄ kopię reguły napięcia — generator synchroniczny |U_r − U_n| > 1,0 kV,
bateria kondensatorów |U_r − U_n| > 0,5 kV, ogranicznik przepięć U_m < U_n — a backend miał
(albo nie miał) własną. Dwa niezależne predykaty, które „dziś się zgadzają”, to defekt
oczekujący na dane brzegowe; ogranicznik nie miał reguły w backendzie wcale. Teraz reguła
jest WYŁĄCZNIE w operacji, a kreator pyta o werdykt próbą TEJ SAMEJ operacji.

Iloczyn cech: operacja {generator SN, bateria kondensatorów SN, ogranicznik przepięć SN} ×
napięcie tabliczki {zgodne, niezgodne} × tryb {zapis, próba} (+ granica U_m = U_n
ogranicznika) × droga {funkcja domenowa, końcówka HTTP z utrwaleniem}. Na każdej kombinacji:
próba i zapis dają TĘ SAMĄ odmowę (kod i komunikat), próba zgodna nie niesie migawki i nie
zmienia modelu, a jej `preview.created_refs` to identyfikatory, które nada zapis.
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from fastapi.testclient import TestClient

from tests.api.test_pole_katalogowe_api import (  # noqa: F401 — fikstura `klient`
    _ciag_sn,
    _nowy_przypadek,
    _odcisk,
    _operacja,
    _szyna_sn,
    klient,
)
from tests.enm.model_minimalny import model_minimalny
from tests.enm.test_brama_katalogowa_operacji_v2 import _siec_ze_stacja, _szyna_sn_ref


def _szyna_z_polem(napiecie_kv: float) -> dict[str, Any]:
    return model_minimalny(
        buses=[{"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": napiecie_kv}],
        substations=[
            {"ref_id": "ST1", "name": "Stacja 1", "station_type": "mv_lv", "bus_refs": ["BUS_SN"]}
        ],
        bays=[
            {
                "ref_id": "POLE-IN",
                "name": "Pole liniowe",
                "bay_role": "IN",
                "substation_ref": "ST1",
                "bus_ref": "BUS_SN",
                "equipment_refs": [],
            }
        ],
    )


def _wiazanie(przestrzen: str, pozycja: str) -> dict[str, Any]:
    return {
        "catalog_binding": {
            "catalog_namespace": przestrzen,
            "catalog_item_id": pozycja,
            "catalog_item_version": "2024.1",
            "materialize": True,
        }
    }


def _generator(rated_kv_wzgledem_szyny: float) -> Callable[[], tuple[dict[str, Any], dict]]:
    def zbuduj() -> tuple[dict[str, Any], dict[str, Any]]:
        siec = copy.deepcopy(_siec_ze_stacja())
        szyna = _szyna_sn_ref(siec)
        napiecie = float(next(b for b in siec["buses"] if b["ref_id"] == szyna)["voltage_kv"])
        ladunek = {
            "bus_ref": szyna,
            "p_mw": 0.5,
            "q_mvar": 0.1,
            "manual_params": {"rated_mva": 2.0, "rated_kv": napiecie + rated_kv_wzgledem_szyny},
        }
        return siec, ladunek

    return zbuduj


def _bateria(pozycja: str) -> Callable[[], tuple[dict[str, Any], dict[str, Any]]]:
    def zbuduj() -> tuple[dict[str, Any], dict[str, Any]]:
        siec = model_minimalny(
            buses=[{"ref_id": "bus-sn-1", "name": "Szyna SN", "voltage_kv": 15.0}]
        )
        return siec, {"bus_ref": "bus-sn-1", **_wiazanie("KOMPENSATOR_SN", pozycja)}

    return zbuduj


def _ogranicznik(
    napiecie_szyny_kv: float, pozycja: str
) -> Callable[[], tuple[dict[str, Any], dict[str, Any]]]:
    def zbuduj() -> tuple[dict[str, Any], dict[str, Any]]:
        return _szyna_z_polem(napiecie_szyny_kv), {
            "field_ref": "POLE-IN",
            **_wiazanie("OGRANICZNIK_SN", pozycja),
        }

    return zbuduj


#: (operacja, budowa zgodna, budowa niezgodna, kod odmowy niezgodnej)
PRZYPADKI = {
    "generator_sn": (
        "add_generator_sn",
        _generator(0.0),
        _generator(5.0),
        "generator.voltage_mismatch",
    ),
    "bateria_sn": (
        "add_shunt_compensator_sn",
        _bateria("KOMP_SN_1V2_15KV"),
        _bateria("KOMP_SN_1V8_20KV"),
        "shunt.voltage_mismatch",
    ),
    "ogranicznik_sn": (
        "add_surge_arrester_sn",
        _ogranicznik(20.0, "arrester-abb-polim-d-24kv-10ka"),
        _ogranicznik(20.0, "arrester-abb-polim-d-12kv-10ka"),
        "spd.voltage_mismatch",
    ),
}


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_odmowa_napiecia_identyczna_w_zapisie_i_w_probie(nazwa: str) -> None:
    operacja, _, niezgodna, kod = PRZYPADKI[nazwa]
    siec, ladunek = niezgodna()
    zapis = execute_domain_operation(copy.deepcopy(siec), operacja, ladunek)
    proba = execute_domain_operation(copy.deepcopy(siec), operacja, {**ladunek, "dry_run": True})
    assert zapis.get("error_code") == kod, zapis
    assert proba.get("error_code") == kod, proba
    assert proba["error"] == zapis["error"]
    assert not proba.get("snapshot")


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_proba_zgodna_bez_migawki_z_identyfikatorami_zapisu(nazwa: str) -> None:
    operacja, zgodna, _, _ = PRZYPADKI[nazwa]
    siec, ladunek = zgodna()
    przed = copy.deepcopy(siec)
    zapis = execute_domain_operation(copy.deepcopy(siec), operacja, ladunek)
    assert not zapis.get("error"), zapis
    assert zapis.get("snapshot")
    assert "dry_run" not in zapis

    proba = execute_domain_operation(siec, operacja, {**ladunek, "dry_run": True})
    assert not proba.get("error"), proba
    assert proba["dry_run"] is True
    assert "snapshot" not in proba
    assert proba["preview"]["created_refs"] == zapis["changes"]["created_element_ids"]
    assert proba["preview"]["created_refs"]
    # Wejście próby nietknięte (operacja pracuje na kopii granicznej).
    assert siec == przed


@pytest.mark.parametrize(
    ("napiecie_szyny_kv", "pozycja", "odmowa"),
    [
        (24.0, "arrester-abb-polim-d-24kv-10ka", False),  # U_m = U_n — granica dopuszczona
        (20.0, "arrester-abb-polim-d-24kv-10ka", False),
        (17.5, "arrester-abb-polim-d-12kv-10ka", True),
        (30.0, "arrester-abb-polim-d-24kv-10ka", True),
        (30.0, "arrester-tridelta-sb36-36kv-10ka", False),
    ],
)
def test_regula_ogranicznika_u_m_pokrywa_u_n(
    napiecie_szyny_kv: float, pozycja: str, odmowa: bool
) -> None:
    siec, ladunek = _ogranicznik(napiecie_szyny_kv, pozycja)()
    wynik = execute_domain_operation(siec, "add_surge_arrester_sn", ladunek)
    if odmowa:
        assert wynik.get("error_code") == "spd.voltage_mismatch", wynik
        assert f"{napiecie_szyny_kv:g} kV" in wynik["error"]
    else:
        assert not wynik.get("error"), wynik


def _ladunek_na_szynie_api(nazwa: str, szyna: str, zgodny: bool) -> tuple[str, dict[str, Any]]:
    if nazwa == "generator_sn":
        return "add_generator_sn", {
            "bus_ref": szyna,
            "p_mw": 0.5,
            "q_mvar": 0.1,
            "manual_params": {"rated_mva": 2.0, "rated_kv": 15.0 if zgodny else 20.0},
        }
    if nazwa == "bateria_sn":
        pozycja = "KOMP_SN_1V2_15KV" if zgodny else "KOMP_SN_1V8_20KV"
        return "add_shunt_compensator_sn", {
            "bus_ref": szyna,
            **_wiazanie("KOMPENSATOR_SN", pozycja),
        }
    pozycja = "arrester-abb-polim-d-24kv-10ka" if zgodny else "arrester-abb-polim-d-12kv-10ka"
    return "add_surge_arrester_sn", {"bus_ref": szyna, **_wiazanie("OGRANICZNIK_SN", pozycja)}


@pytest.mark.parametrize("zgodny", [True, False], ids=["zgodne", "niezgodne"])
@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_proba_przez_koncowke_nie_zmienia_modelu(
    klient: TestClient,  # noqa: F811 — fikstura z modułu testów pola katalogowego
    nazwa: str,
    zgodny: bool,
) -> None:
    case_id = _nowy_przypadek(klient)
    szyna = _szyna_sn(_ciag_sn(klient, case_id))
    operacja, ladunek = _ladunek_na_szynie_api(nazwa, szyna, zgodny)
    odcisk_przed = _odcisk(klient, case_id)

    proba = _operacja(klient, case_id, operacja, {**ladunek, "dry_run": True})
    assert "snapshot" not in proba or not proba["snapshot"]
    assert _odcisk(klient, case_id) == odcisk_przed
    if not zgodny:
        assert proba.get("error_code") == PRZYPADKI[nazwa][3], proba
        return
    assert proba["dry_run"] is True, proba
    zapis = _operacja(klient, case_id, operacja, ladunek)
    assert not zapis.get("error"), zapis
    assert proba["preview"]["created_refs"] == zapis["changes"]["created_element_ids"]
    assert _odcisk(klient, case_id) != odcisk_przed

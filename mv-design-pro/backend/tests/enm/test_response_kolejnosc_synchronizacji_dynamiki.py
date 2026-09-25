"""Kolejność kroków odpowiedzi operacji domenowej (`enm/domain_operations.py::_response`).

Partia integracji 5 złożyła w `_response` dwa kroki z dwóch kart:
- karta AB-P1: synchronizacja kopii `Generator.dynamika` z wiązań katalogowych
  (`synchronizuj_dynamike_z_wiazan`);
- karta #151: walidacja migawki kontraktem ENM z nazwaną odmową
  `operation.model_contract_violated`.

Rozstrzygnięcie scalenia brzmi: najpierw synchronizacja, potem kontrakt i gotowość.
Operacja oddaje migawkę PO synchronizacji, więc tylko w tej kolejności kontrakt i gotowość
widzą dokładnie ten model, który trafia do magazynu i do projektanta. W odwrotnej kolejności
kopia dynamiki niezgodna z kontraktem przeszłaby bez odmowy, a gotowość liczyłaby się na
modelu sprzed synchronizacji. Te testy przypinają kolejność (reguła KLASA pkt 4: rozstrzygnięcie
bez testu to deklaracja).

Synchronizacja jest tu podmieniana, bo testowana jest kolejność kroków orkiestracji,
a nie materializacja katalogu (tę pokrywają testy `enm/dynamika_z_katalogu.py`).
"""

from __future__ import annotations

import copy
from typing import Any

import enm.domain_operations as operacje
import pytest
from enm.domain_operations import execute_domain_operation


def _dynamika_synchroniczna(**zmiany: object) -> dict[str, Any]:
    dane: dict[str, Any] = {
        "rodzina": "synchroniczna",
        "proweniencja": {
            "zrodlo": "karta_producenta",
            "odniesienie": "DS-0001",
            "data": "2026-01-01",
        },
        "s_n_mva": 10.0,
        "h_s": 3.0,
        "d_pu": 1.0,
        "xd_pu": 1.8,
        "xq_pu": 1.7,
        "xd_prim_pu": 0.3,
        "xq_prim_pu": 0.4,
        "xd_bis_pu": 0.2,
        "xq_bis_pu": 0.25,
        "td0_prim_s": 6.0,
        "tq0_prim_s": 0.5,
        "td0_bis_s": 0.03,
        "tq0_bis_s": 0.05,
        "xl_pu": 0.15,
        "nasycenie_s10": 0.1,
        "nasycenie_s12": 0.3,
        "ra_pu": 0.003,
    }
    dane.update(zmiany)
    return dane


def _model_z_wytworca() -> dict[str, Any]:
    return {
        "header": {"name": "Kolejność odpowiedzi operacji", "revision": 1, "defaults": {}},
        "buses": [
            {"ref_id": "bus/sn", "name": "Szyna SN", "tags": [], "meta": {}, "voltage_kv": 15.0}
        ],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [
            {
                "ref_id": "gen-1",
                "name": "Generator SN",
                "tags": [],
                "meta": {},
                "bus_ref": "bus/sn",
                "p_mw": 5.0,
                "gen_type": "synchronous",
            }
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _synchronizacja_wpisujaca(dynamika: dict[str, Any]) -> Any:
    """Podmiana synchronizacji: wpisuje wytwórcy `gen-1` wskazaną kopię dynamiki."""

    def _synchronizuj(enm: dict[str, Any]) -> dict[str, Any]:
        generatory = []
        for generator in enm["generators"]:
            if generator.get("ref_id") == "gen-1":
                generator = {**generator, "dynamika": copy.deepcopy(dynamika)}
            generatory.append(generator)
        return {**enm, "generators": generatory}

    return _synchronizuj


def _zmiana_mocy() -> dict[str, Any]:
    return {"element_ref": "gen-1", "parameters": {"p_mw": 5.5}}


def test_kontrakt_waliduje_migawke_po_synchronizacji_dynamiki(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Kopia dynamiki niezgodna z kontraktem (xd″ > xd′), wpisana przez synchronizację,
    daje nazwaną odmowę — walidacja widzi migawkę PO synchronizacji."""
    monkeypatch.setattr(
        operacje,
        "synchronizuj_dynamike_z_wiazan",
        _synchronizacja_wpisujaca(
            _dynamika_synchroniczna(xd_bis_pu=0.35, xd_prim_pu=0.30, xd_pu=1.8)
        ),
    )

    wynik = execute_domain_operation(
        enm_dict=_model_z_wytworca(), op_name="update_element_parameters", payload=_zmiana_mocy()
    )

    assert wynik.get("error_code") == "operation.model_contract_violated", wynik
    assert wynik.get("snapshot") is None


def test_gotowosc_i_migawka_pochodza_z_modelu_po_synchronizacji(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Gotowość liczy się na tym samym modelu, który operacja oddaje — po synchronizacji."""
    dynamika = _dynamika_synchroniczna()
    monkeypatch.setattr(
        operacje, "synchronizuj_dynamike_z_wiazan", _synchronizacja_wpisujaca(dynamika)
    )
    modele_gotowosci: list[dict[str, Any]] = []
    oryginalna_gotowosc = operacje._build_readiness

    def _gotowosc_z_podgladem(enm: dict[str, Any], enm_model: Any) -> Any:
        modele_gotowosci.append(enm)
        return oryginalna_gotowosc(enm, enm_model)

    monkeypatch.setattr(operacje, "_build_readiness", _gotowosc_z_podgladem)

    wynik = execute_domain_operation(
        enm_dict=_model_z_wytworca(), op_name="update_element_parameters", payload=_zmiana_mocy()
    )

    assert wynik.get("error_code") is None, wynik
    assert len(modele_gotowosci) == 1
    generator_gotowosci = next(
        g for g in modele_gotowosci[0]["generators"] if g["ref_id"] == "gen-1"
    )
    generator_migawki = next(g for g in wynik["snapshot"]["generators"] if g["ref_id"] == "gen-1")
    assert generator_gotowosci["dynamika"] == dynamika
    assert generator_migawki["dynamika"] == dynamika
    assert generator_migawki["p_mw"] == 5.5

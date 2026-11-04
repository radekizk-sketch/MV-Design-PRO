"""Edycja danych zwarciowych źródła GPZ (`update_element_parameters`) — karta KATALOG-PRZEJECIE-PR.

Konfigurator GPZ zmienia S″k, R/X i S″k,min sieci zasilającej tą operacją. Reguły są te same
co przy tworzeniu równoważnika (`add_grid_source_sn`): liczby dodatnie, jedna moc zwarciowa
szyny 110 kV w dwóch polach źródła po stronie WN, S″k,min ≤ S″k, rekord
`materialized_params` równoważnika zgodny z polami. Iloczyn cech: strona źródła (WN / SN) ×
pole w ładunku (`sk3_mva` / `sk3_hv_mva` / oba równe / oba różne) × znak R/X × para MIN/MAX;
skutek sprawdzany w modelu i w wyniku zwarcia (Ik″ szyny SN).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMHeader

_TR = {
    "catalog_namespace": "TRAFO_SN_NN",
    "catalog_item_id": "tr-wn-sn-110-15-25mva-yd11",
    "catalog_item_version": "2024.1",
    "materialize": True,
}


def _gpz(strona: str) -> dict[str, Any]:
    enm = EnergyNetworkModel(header=ENMHeader(name="edycja zrodla")).model_dump(mode="json")
    if strona == "HV_110":
        payload: dict[str, Any] = {
            "voltage_kv": 15.0,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": 1,
            "transformer_catalog_binding": _TR,
            "sections_count": 1,
            "line_fields_per_section": 1,
        }
    else:
        payload = {
            "voltage_kv": 15.0,
            "manual_equivalent": {"sk3_mva": 300.0, "rx_ratio": 0.1},
            "sections_count": 1,
            "line_fields_per_section": 1,
        }
    wynik = execute_domain_operation(enm, "add_grid_source_sn", payload)
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"]


def _zmien(enm: dict[str, Any], parametry: dict[str, Any]) -> dict[str, Any]:
    zrodlo = enm["sources"][0]["ref_id"]
    return execute_domain_operation(
        enm, "update_element_parameters", {"element_ref": zrodlo, "parameters": parametry}
    )


@pytest.mark.parametrize("klucz", ["sk3_mva", "sk3_hv_mva"])
def test_zrodlo_wn_jedna_moc_zwarciowa_w_obu_polach_i_w_rekordzie(klucz: str) -> None:
    wynik = _zmien(_gpz("HV_110"), {klucz: 1000.0})
    assert wynik.get("error") is None, wynik.get("error")
    zrodlo = wynik["snapshot"]["sources"][0]
    assert zrodlo["sk3_mva"] == zrodlo["sk3_hv_mva"] == 1000.0
    assert zrodlo["materialized_params"]["sk3_mva"] == 1000.0
    assert zrodlo["materialized_params"]["sk3_hv_mva"] == 1000.0


def test_zrodlo_wn_rozne_wartosci_obu_pol_sa_odmowa() -> None:
    wynik = _zmien(_gpz("HV_110"), {"sk3_mva": 1000.0, "sk3_hv_mva": 1200.0})
    assert wynik["error_code"] == "source.manual_equivalent_invalid"


def test_zrodlo_wn_rowne_wartosci_obu_pol_sa_przyjete() -> None:
    wynik = _zmien(_gpz("HV_110"), {"sk3_mva": 1200.0, "sk3_hv_mva": 1200.0})
    assert wynik.get("error") is None, wynik.get("error")


def test_zrodlo_sn_nie_ma_mocy_zwarciowej_110_kv() -> None:
    wynik = _zmien(_gpz("SN"), {"sk3_hv_mva": 1000.0})
    assert wynik["error_code"] == "source.manual_equivalent_invalid"


def test_zrodlo_sn_zmiana_sk3_bez_pola_110_kv() -> None:
    wynik = _zmien(_gpz("SN"), {"sk3_mva": 250.0})
    assert wynik.get("error") is None, wynik.get("error")
    zrodlo = wynik["snapshot"]["sources"][0]
    assert zrodlo["sk3_mva"] == 250.0
    assert zrodlo.get("sk3_hv_mva") is None
    assert zrodlo["materialized_params"]["sk3_mva"] == 250.0


@pytest.mark.parametrize("strona", ["HV_110", "SN"])
@pytest.mark.parametrize("klucz", ["rx_ratio", "rx_ratio_min", "sk3_mva", "sk3_min_mva"])
@pytest.mark.parametrize("wartosc", [0.0, -0.1])
def test_dane_zwarciowe_niedodatnie_sa_odmowa(strona: str, klucz: str, wartosc: float) -> None:
    wynik = _zmien(_gpz(strona), {klucz: wartosc})
    assert wynik["error_code"] == "source.manual_equivalent_invalid"


@pytest.mark.parametrize("strona", ["HV_110", "SN"])
def test_rx_bez_gornej_granicy(strona: str) -> None:
    """R/X powyżej 1 (równoważnik SN z siecią kablową) jest daną dopuszczalną."""
    wynik = _zmien(_gpz(strona), {"rx_ratio": 1.5})
    assert wynik.get("error") is None, wynik.get("error")
    assert wynik["snapshot"]["sources"][0]["materialized_params"]["rx_ratio"] == 1.5


@pytest.mark.parametrize("strona", ["HV_110", "SN"])
def test_sk_min_powyzej_sk_max_jest_odmowa_w_obu_kolejnosciach(strona: str) -> None:
    enm = _gpz(strona)
    sk_max = enm["sources"][0]["sk3_mva"]
    assert _zmien(enm, {"sk3_min_mva": sk_max * 1.1})["error_code"] == (
        "source.manual_equivalent_invalid"
    )
    po_min = _zmien(enm, {"sk3_min_mva": sk_max * 0.5})
    assert po_min.get("error") is None, po_min.get("error")
    klucz = "sk3_hv_mva" if strona == "HV_110" else "sk3_mva"
    assert _zmien(po_min["snapshot"], {klucz: sk_max * 0.4})["error_code"] == (
        "source.manual_equivalent_invalid"
    )


def _ik_szyny_sn(enm: dict[str, Any]) -> float:
    """Ik″ zwarcia trójfazowego (A) z biegu kanonicznego `short_circuit_sn` (węzeł domyślny)."""
    from enm.canonical_analysis import create_run, execute_run
    from enm.store import set_enm

    set_enm("edycja-zrodla", EnergyNetworkModel.model_validate(enm))
    wynik = execute_run(
        create_run(
            case_id="edycja-zrodla", klucz_twin="edycja-zrodla", analysis_type="short_circuit_sn"
        ).id
    )
    assert wynik.status == "FINISHED", wynik.error_message
    return float((wynik.raw_result or {})["results"][0]["ikss_a"])


@pytest.mark.parametrize("strona", ["HV_110", "SN"])
def test_zmiana_sk_zmienia_ik_szyny_sn(strona: str) -> None:
    enm = _gpz(strona)
    klucz = "sk3_hv_mva" if strona == "HV_110" else "sk3_mva"
    przed = _ik_szyny_sn(enm)
    po = _ik_szyny_sn(_zmien(enm, {klucz: enm["sources"][0]["sk3_mva"] / 3})["snapshot"])
    assert po < przed * 0.97

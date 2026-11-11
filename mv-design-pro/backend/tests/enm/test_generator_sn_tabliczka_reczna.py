"""Generator synchroniczny SN bez typu katalogowego — tabliczka podana ręcznie (ZASADA NR 4).

Katalog GENERATOR_SN ma dziś wyłącznie pozycje benchmarków, które lista projektanta
(`list_synchronous_generator_types`) świadomie pomija — bez trybu ręcznego operacja
`add_generator_sn` była dla projektanta nieosiągalna. Tryb rozstrzyga OBECNOŚĆ referencji
katalogowej (ten sam predykat co `add_load_sn`/`add_nn_load`): referencja podana = pełna
walidacja katalogowa, deklaracja ręczna jej nie omija.

ILOCZYN CECH: źródło tabliczki (katalog / ręczna z napięciem / ręczna bez napięcia /
ręczna z S_n <= 0 / brak obu / ręczna + zepsuta referencja) × tryb pracy (PQ / regulacja
napięcia z granicami Q / regulacja napięcia bez granic Q).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from network_model.catalog.repository import get_default_mv_catalog

from tests.enm.test_brama_katalogowa_operacji_v2 import _siec_ze_stacja, _szyna_sn_ref


def _siec() -> dict[str, Any]:
    return copy.deepcopy(_siec_ze_stacja())


def _napiecie_szyny(snapshot: dict[str, Any]) -> float:
    ref = _szyna_sn_ref(snapshot)
    return float(next(b for b in snapshot["buses"] if b["ref_id"] == ref)["voltage_kv"])


ZRODLA: dict[str, dict[str, Any]] = {
    "katalog": {"catalog_ref": "bench_ozepvbess_pv2"},
    "reczna_z_napieciem": {
        "manual_params": {"rated_mva": 2.0, "rated_kv": 15.0, "q_min_mvar": -1.0, "q_max_mvar": 1.2}
    },
    "reczna_bez_napiecia": {"manual_params": {"rated_mva": 2.0}},
}

TRYBY: dict[str, dict[str, Any]] = {
    "pq": {"q_mvar": 0.1},
    "regulacja_z_granicami": {
        "control_mode": "REGULACJA_NAPIECIA",
        "u_set_pu": 1.01,
        "q_min_mvar": -0.8,
        "q_max_mvar": 0.9,
    },
    "regulacja_bez_granic": {"control_mode": "REGULACJA_NAPIECIA", "u_set_pu": 1.01},
}


def _wykonaj(zrodlo: str, tryb: str) -> tuple[dict[str, Any], dict[str, Any]]:
    snapshot = _siec()
    payload = {"bus_ref": _szyna_sn_ref(snapshot), "p_mw": 0.5, **ZRODLA[zrodlo], **TRYBY[tryb]}
    return snapshot, execute_domain_operation(snapshot, "add_generator_sn", payload)


def _oczekiwany_sukces(zrodlo: str, tryb: str) -> bool:
    if tryb != "regulacja_bez_granic":
        return True
    # Regulacja napięcia bez granic Q w formularzu: granice z tabliczki — katalog i ręczna
    # pełna je mają, ręczna z samą mocą pozorną nie (brak = brak, nie 0 Mvar).
    return zrodlo != "reczna_bez_napiecia"


@pytest.mark.parametrize("tryb", sorted(TRYBY))
@pytest.mark.parametrize("zrodlo", sorted(ZRODLA))
def test_zrodlo_tabliczki_x_tryb_pracy(zrodlo: str, tryb: str) -> None:
    snapshot, wynik = _wykonaj(zrodlo, tryb)
    if not _oczekiwany_sukces(zrodlo, tryb):
        assert wynik.get("error_code") == "generator.q_limits_invalid", wynik
        assert not wynik.get("snapshot")
        return
    assert not wynik.get("error"), (wynik.get("error"), wynik.get("error_code"))
    generator = wynik["snapshot"]["generators"][-1]
    if zrodlo == "katalog":
        typ = get_default_mv_catalog().get_synchronous_generator_type("bench_ozepvbess_pv2")
        assert typ is not None
        assert generator["source_mode"] == "KATALOG"
        assert generator["parameter_source"] == "CATALOG"
        assert generator["catalog_namespace"] == "GENERATOR_SN"
        assert generator["materialized_params"]["rated_mva"] == typ.rated_mva
        assert "dane_przyjete" not in generator["meta"]
        return
    assert generator["source_mode"] == "EKSPERCKI_RECZNY"
    assert generator["parameter_source"] == "OVERRIDE"
    assert generator["catalog_ref"] is None
    assert generator["catalog_namespace"] is None
    assert generator["materialized_params"]["rated_mva"] == 2.0
    if zrodlo == "reczna_z_napieciem":
        assert generator["materialized_params"]["rated_kv"] == 15.0
        assert generator["materialized_params"]["q_max_mvar"] == 1.2
        assert "dane_przyjete" not in generator["meta"]
    else:
        # Napięcie znamionowe przyjęte z szyny — wartość robocza jawnie w `dane_przyjete`.
        assert generator["materialized_params"]["rated_kv"] == _napiecie_szyny(snapshot)
        assert generator["materialized_params"]["q_max_mvar"] is None
        assert len(generator["meta"]["dane_przyjete"]) == 1
        assert "napięciu szyny" in generator["meta"]["dane_przyjete"][0]


@pytest.mark.parametrize("rated_mva", [None, 0.0, -1.0, "abc"])
def test_brak_katalogu_i_brak_mocy_pozornej_odmawia(rated_mva: Any) -> None:
    snapshot = _siec()
    payload: dict[str, Any] = {"bus_ref": _szyna_sn_ref(snapshot), "p_mw": 0.5}
    if rated_mva is not None:
        payload["manual_params"] = {"rated_mva": rated_mva}
    wynik = execute_domain_operation(snapshot, "add_generator_sn", payload)
    assert wynik.get("error_code") == "generator.catalog_required"
    assert "moc pozorna" in str(wynik.get("error"))
    assert not wynik.get("snapshot")


def test_referencja_katalogowa_wygrywa_z_deklaracja_reczna() -> None:
    """Predykat parami: zepsuta referencja + tabliczka ręczna NIE przechodzi trybem ręcznym."""
    snapshot = _siec()
    wynik = execute_domain_operation(
        snapshot,
        "add_generator_sn",
        {
            "bus_ref": _szyna_sn_ref(snapshot),
            "p_mw": 0.5,
            "catalog_ref": "nie-ma-takiego-typu",
            "manual_params": {"rated_mva": 2.0},
        },
    )
    assert wynik.get("error")
    assert not wynik.get("snapshot")


def test_reczna_tabliczka_z_napieciem_innym_niz_szyna_odmawia() -> None:
    """Ta sama kontrola napięcia co dla tabliczki katalogowej (jedna reguła, dwa źródła)."""
    snapshot = _siec()
    wynik = execute_domain_operation(
        snapshot,
        "add_generator_sn",
        {
            "bus_ref": _szyna_sn_ref(snapshot),
            "p_mw": 0.5,
            "manual_params": {"rated_mva": 2.0, "rated_kv": 110.0},
        },
    )
    assert wynik.get("error_code") == "generator.voltage_mismatch"

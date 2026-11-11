"""Przekształtniki katalogu — jedna ścieżka do frontu (`GET /api/catalog/converter-types`).

Front składał dawniej listę przekształtników z końcówek `pv-inverter-types`,
`bess-inverter-types` i `wind-inverter-types`, przeliczając tabliczkę projekcji z powrotem na
`ConverterType` (kVA→MVA, kW→MW). Tę kopię skasowano: front czyta `converter-types`. Ten test
przypina, że nic nie zginęło — każda pozycja projekcji PV i magazynu ma w `converter-types`
rekord o tym samym identyfikatorze, rodzaju, napięciu, tabliczce i certyfikacie PTPiREE, a rekordy
z certyfikatem w ogóle istnieją (regresja: link certyfikatu ginął w kreatorze OZE).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.catalog import (
    list_bess_inverter_types,
    list_converter_types,
    list_pv_inverter_types,
    list_wind_inverter_types,
)

POLA_CERTYFIKATU = (
    "ptpiree_status",
    "ptpiree_certificate_ref",
    "ptpiree_document_number",
    "ptpiree_document_acceptance_date",
    "ptpiree_wos_version",
    "ptpiree_wipwc_version",
    "ptpiree_ppm_scope",
    "ptpiree_source_url",
    "ptpiree_publication_date",
)


def _wg_id() -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in list_converter_types(None)}


def _tabliczka_pv(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "PV",
        "un_kv": r["un_kv"],
        "sn_mva": r["s_n_kva"] / 1000,
        "pmax_mw": r["p_max_kw"] / 1000,
        "cosphi_min": r.get("cos_phi_min"),
        "cosphi_max": r.get("cos_phi_max"),
        "k_sc": r.get("k_sc"),
        "control_mode": r.get("control_mode"),
        "grid_code": r.get("grid_code"),
    }


def _tabliczka_magazynu(r: dict[str, Any]) -> dict[str, Any]:
    s_n_kva = r.get("s_n_kva") or max(r["p_charge_kw"], r["p_discharge_kw"])
    return {
        "kind": "BESS",
        "un_kv": r["un_kv"],
        "sn_mva": s_n_kva / 1000,
        "pmax_mw": r["p_discharge_kw"] / 1000,
        "e_kwh": r["e_kwh"],
        "k_sc": r.get("k_sc"),
    }


@pytest.mark.parametrize(
    ("lista", "tabliczka"),
    [(list_pv_inverter_types, _tabliczka_pv), (list_bess_inverter_types, _tabliczka_magazynu)],
    ids=["PV", "magazyn"],
)
def test_projekcja_rowna_rekordowi_converter_types(lista: Any, tabliczka: Any) -> None:
    wg_id = _wg_id()
    projekcje = lista()
    assert projekcje, "pusta projekcja — test nic by nie mierzył"
    for r in projekcje:
        rekord = wg_id.get(r["id"])
        assert rekord is not None, f"{r['id']}: brak w converter-types"
        for pole, oczekiwana in tabliczka(r).items():
            assert rekord.get(pole) == pytest.approx(oczekiwana), (r["id"], pole)
        for pole in POLA_CERTYFIKATU:
            assert rekord.get(pole) == r.get(pole), (r["id"], pole)
        for pole in ("verification_status", "source_reference", "catalog_status"):
            assert rekord.get(pole) == r.get(pole), (r["id"], pole)


def test_wiatr_to_podzbior_converter_types() -> None:
    wg_id = _wg_id()
    wiatr = list_wind_inverter_types()
    assert wiatr
    assert all(wg_id[r["id"]] == r for r in wiatr)


def test_converter_types_niesie_certyfikaty_ptpiree() -> None:
    rekordy = list_converter_types(None)
    powiazane = [r for r in rekordy if r.get("ptpiree_status") == "POWIAZANY"]
    assert powiazane, "żaden przekształtnik nie niesie certyfikatu PTPiREE"
    assert all(r.get("ptpiree_certificate_ref") for r in powiazane)
    assert {r["kind"] for r in powiazane} >= {"PV"}


@pytest.mark.parametrize("rodzaj", ["PV", "BESS", "WIND"])
def test_zawezenie_rodzajem(rodzaj: str) -> None:
    rekordy = list_converter_types(rodzaj)
    assert rekordy
    assert {r["kind"] for r in rekordy} == {rodzaj}

"""`add_transformer_sn_nn` z NOWĄ szyną HV nad istniejącą szyną LV (`hv_voltage_kv`).

Lustro trybu `lv_voltage_kv` (CV-4.3 K1). Powód: zaczep pozanominalny MATPOWER leży po
stronie „from" gałęzi; gdy budowa sieci dochodzi do transformatora od strony „to" (IEEE
case39: szyna bilansująca 31 istnieje pierwsza, zaczep τ=1,07 przy szynie 6), zamiana stron
z odwróconym τ nie odtwarza macierzy admitancji (tor FROZEN odnosi zaczep do strony HV) —
bliźniak odbiegał od pandapower o 0,05 p.u. Iloczyn cech: {hv_bus_ref, hv_voltage_kv} ×
{lv_bus_ref, lv_voltage_kv} × {zaczep, bez zaczepu}.
"""

from __future__ import annotations

import pytest
from enm.kompilator_grafu import (
    BenchmarkBuildError,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    pusty_enm,
)
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel

_KATALOG = "bench_ieee39bus_br36"  # 345/345 kV, uk 2,5 %, literatura: zaczep 1,07 przy HV


def _siec_ze_slackiem() -> tuple[dict, str]:
    enm = pusty_enm(name="hv-auto", sn_nominal_kv=345.0)
    return dodaj_zrodlo_slack(
        enm, voltage_kv=345.0, sk3_mva=20000.0, rx_ratio=0.1, line_fields_count=1, source_name="S"
    )


def test_nowa_szyna_hv_nad_istniejaca_lv_z_zaczepem_po_stronie_hv() -> None:
    enm, bus_slack = _siec_ze_slackiem()
    enm, bus_hv = dodaj_transformator(
        enm, hv_voltage_kv=345.0, lv_bus_ref=bus_slack, catalog_ref=_KATALOG, off_nominal_ratio=1.07
    )
    model = EnergyNetworkModel.model_validate(enm)
    (tr,) = model.transformers
    assert tr.hv_bus_ref == bus_hv and tr.lv_bus_ref == bus_slack
    assert bus_hv.endswith("/hv_auto")
    szyna = next(b for b in model.buses if b.ref_id == bus_hv)
    assert szyna.voltage_kv == pytest.approx(345.0)
    assert (szyna.meta or {}).get("visual_role") == "TRANSFORMER_HV_BUS"
    zaczep = tr.tap_changer
    assert zaczep is not None and zaczep.regulated_winding == "HV"
    assert zaczep.current_position == 1 and zaczep.step_percent == pytest.approx(7.0)


def test_nowa_szyna_hv_bez_zaczepu() -> None:
    enm, bus_slack = _siec_ze_slackiem()
    enm, bus_hv = dodaj_transformator(
        enm, hv_voltage_kv=345.0, lv_bus_ref=bus_slack, catalog_ref=_KATALOG
    )
    model = EnergyNetworkModel.model_validate(enm)
    (tr,) = model.transformers
    assert tr.hv_bus_ref == bus_hv and tr.tap_changer is None


def test_hv_bus_ref_i_hv_voltage_kv_naraz_odrzucone() -> None:
    enm, bus_slack = _siec_ze_slackiem()
    wynik = execute_domain_operation(
        enm,
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": bus_slack,
            "hv_voltage_kv": 345.0,
            "lv_voltage_kv": 345.0,
            "transformer_catalog_ref": _KATALOG,
        },
    )
    assert wynik.get("error_code") == "transformer.hv_bus_ambiguous", wynik


def test_dwie_nowe_szyny_naraz_odrzucone() -> None:
    enm, _bus_slack = _siec_ze_slackiem()
    wynik = execute_domain_operation(
        enm,
        "add_transformer_sn_nn",
        {"hv_voltage_kv": 345.0, "lv_voltage_kv": 345.0, "transformer_catalog_ref": _KATALOG},
    )
    assert wynik.get("error_code") == "transformer.buses_missing", wynik


def test_kernel_wymaga_jednej_ze_stron() -> None:
    enm, _bus_slack = _siec_ze_slackiem()
    with pytest.raises(BenchmarkBuildError):
        dodaj_transformator(enm, catalog_ref=_KATALOG, lv_voltage_kv=345.0)

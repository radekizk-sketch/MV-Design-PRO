"""Testy końcówki API weryfikacji ochrony przed pracą wyspową (LoM, D10)."""

from __future__ import annotations

import pytest
from api.oze_analysis_runs import get_lom_protection
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    ProtectionAssignment,
    ProtectionSetting,
)
from enm.store import reset_enm_store, set_enm
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_enm_store()
    yield
    reset_enm_store()


def _seed_case(case_id: str) -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="LoM API test"),
        buses=[Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15.0)],
        generators=[
            Generator(
                ref_id="gen_pv", name="PV", bus_ref="bus_oze", p_mw=2.0, gen_type="pv_inverter"
            )
        ],
        bays=[
            Bay(
                ref_id="bay_oze",
                name="Pole OZE",
                bay_role="OZE",
                substation_ref="stac_1",
                bus_ref="bus_oze",
                protection_ref="prot_lom",
            )
        ],
        protection_assignments=[
            ProtectionAssignment(
                ref_id="prot_lom",
                name="Zabezpieczenie LoM",
                breaker_ref="cb_1",
                device_type="custom",
                settings=[ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5)],
            )
        ],
    )
    set_enm(case_id, enm)


def test_unknown_case_returns_404() -> None:
    with pytest.raises(HTTPException) as exc:
        get_lom_protection(case_id="brak-przypadku")
    assert exc.value.status_code == 404
    assert "ENM" in exc.value.detail


def test_known_case_returns_view() -> None:
    _seed_case("case-lom-1")
    view = get_lom_protection(case_id="case-lom-1")
    assert view["analysis"] == "ochrona_lom"
    assert view["summary"]["fields_total"] == 1
    rocof = [c for field in view["fields"] for c in field["checks"] if c["function_ansi"] == "81R"]
    assert rocof and rocof[0]["severity"] == "OK"
    assert view["input_hash"]

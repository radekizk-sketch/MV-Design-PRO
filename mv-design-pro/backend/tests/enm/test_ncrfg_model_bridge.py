"""G-OZE-B2: most model → zgodność NC RfG (V12K-087).

Weryfikuje, że flagi zdolności NC RfG konfigurowane przy źródle
przekształtnikowym stają się danymi modelu i zasilają checker zgodności
(dotąd bez producenta z modelu). Zero fabrykacji: FRT z jawnej deklaracji,
P(f)/Q(U) wyprowadzone z wartości rządzących (G-OZE-B/B3/B4).
"""

from __future__ import annotations

from application.ncrfg_compliance import (
    NcRfgComplianceChecker,
    build_der_compliance_from_generator,
    build_der_compliance_list_from_enm,
)
from catalog.profiles.nc_rfg import list_available_operators
from enm.domain_ops_models import AddConverterSourcePayload
from enm.models import EnergyNetworkModel, ENMHeader, Generator


def _generator(meta: dict, *, p_mw: float = 1.0, gen_type: str = "pv_inverter") -> Generator:
    return Generator.model_validate(
        {
            "ref_id": "DER1",
            "name": "Blok PV",
            "bus_ref": "BUS_SN",
            "p_mw": p_mw,
            "gen_type": gen_type,
            "meta": meta,
        }
    )


def test_payload_carries_frt_capability_flags() -> None:
    payload = AddConverterSourcePayload(
        source_technology="PV",
        connection_variant="nn_side",
        station_ref="ST1",
        bus_nn_ref="BUS_NN",
        has_lvrt_curve=True,
        has_hvrt_curve=False,
    )
    assert payload.has_lvrt_curve is True
    assert payload.has_hvrt_curve is False


def test_bridge_reads_explicit_frt_flags() -> None:
    der = build_der_compliance_from_generator(
        _generator({"has_lvrt_curve": True, "has_hvrt_curve": True}),
        voltage_kv=15.0,
    )
    assert der.has_lvrt_curve is True
    assert der.has_hvrt_curve is True
    assert der.der_ref == "DER1"
    assert der.p_max_kw == 1000.0
    assert der.voltage_kv == 15.0


def test_bridge_derives_pf_droop_from_frequency_droop() -> None:
    with_droop = build_der_compliance_from_generator(
        _generator({"frequency_droop_percent": 4.0}), voltage_kv=15.0
    )
    without = build_der_compliance_from_generator(
        _generator({"frequency_droop_percent": None}), voltage_kv=15.0
    )
    assert with_droop.has_pf_droop is True
    assert without.has_pf_droop is False


def test_bridge_derives_qu_curve_from_slope_or_mode() -> None:
    by_slope = build_der_compliance_from_generator(
        _generator({"qu_slope_pu_per_pu": 2.0}), voltage_kv=15.0
    )
    by_mode = build_der_compliance_from_generator(
        _generator({"control_mode": "Q_OD_U"}), voltage_kv=15.0
    )
    none = build_der_compliance_from_generator(
        _generator({"control_mode": "STALY_COS_PHI"}), voltage_kv=15.0
    )
    assert by_slope.has_qu_curve is True
    assert by_mode.has_qu_curve is True
    assert none.has_qu_curve is False


def test_bridge_reads_cos_phi_min() -> None:
    der = build_der_compliance_from_generator(_generator({"cos_phi": 0.95}), voltage_kv=15.0)
    assert der.cos_phi_min == 0.95
    der_none = build_der_compliance_from_generator(_generator({}), voltage_kv=15.0)
    assert der_none.cos_phi_min is None


def test_list_from_enm_skips_non_inverter_and_missing_bus() -> None:
    enm = EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="ncrfg").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna", "voltage_kv": 15.0}],
            "generators": [
                {
                    "ref_id": "DER1",
                    "name": "PV",
                    "bus_ref": "BUS_SN",
                    "p_mw": 1.0,
                    "gen_type": "pv_inverter",
                    "meta": {"has_hvrt_curve": True},
                },
                {
                    "ref_id": "SYN1",
                    "name": "Synchroniczny",
                    "bus_ref": "BUS_SN",
                    "p_mw": 2.0,
                    "gen_type": "synchronous",
                    "meta": {},
                },
                {
                    "ref_id": "DER_ORPHAN",
                    "name": "PV bez szyny",
                    "bus_ref": "BRAK",
                    "p_mw": 1.0,
                    "gen_type": "pv_inverter",
                    "meta": {},
                },
            ],
        }
    )
    rows = build_der_compliance_list_from_enm(enm)
    assert [r.der_ref for r in rows] == ["DER1"]
    assert rows[0].has_hvrt_curve is True


def test_checker_runs_on_model_derived_data() -> None:
    operator_id = list_available_operators()[0]
    der = build_der_compliance_from_generator(
        _generator({"has_lvrt_curve": True, "frequency_droop_percent": 4.0}),
        voltage_kv=15.0,
    )
    report = NcRfgComplianceChecker().check(operator_id, der)
    assert report.der_ref == "DER1"
    assert report.total_tests >= 1


def test_bridge_is_deterministic() -> None:
    gen = _generator({"has_lvrt_curve": True, "qu_slope_pu_per_pu": 2.0})
    first = build_der_compliance_from_generator(gen, voltage_kv=15.0)
    second = build_der_compliance_from_generator(gen, voltage_kv=15.0)
    assert first.model_dump() == second.model_dump()


def _model_with_der() -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="ncrfg-api").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna", "voltage_kv": 15.0}],
            "generators": [
                {
                    "ref_id": "DER1",
                    "name": "PV",
                    "bus_ref": "BUS_SN",
                    "p_mw": 1.0,
                    "gen_type": "pv_inverter",
                    "meta": {"has_lvrt_curve": True, "frequency_droop_percent": 4.0},
                }
            ],
        }
    )


def test_compliance_endpoint_runs_from_model() -> None:
    from uuid import UUID

    from api.main import app
    from catalog.profiles.nc_rfg import list_available_operators
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    case_id = UUID("33333333-3333-3333-3333-333333333333")
    set_enm(str(case_id), _model_with_der())
    operator_id = list_available_operators()[0]

    client = TestClient(app)
    resp = client.get(
        f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": operator_id}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["der_count"] == 1
    assert body["reports"][0]["der_ref"] == "DER1"
    assert "overall_pass" in body["reports"][0]


def test_compliance_endpoint_rejects_unknown_operator() -> None:
    from uuid import UUID

    from api.main import app
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    case_id = UUID("44444444-4444-4444-4444-444444444444")
    set_enm(str(case_id), _model_with_der())

    client = TestClient(app)
    resp = client.get(
        f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": "nieistnieje"}
    )
    assert resp.status_code == 404

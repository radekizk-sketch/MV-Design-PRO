import sys
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.catalog import CatalogRepository
from network_model.catalog.types import (
    ConverterKind,
    ConverterType,
    InverterType,
    LineType,
    TransformerType,
)
from network_model.core.branch import (
    BranchType,
    LineBranch,
    LineImpedanceOverride,
    TransformerBranch,
)
from network_model.core.switch import Switch, SwitchState


def test_catalog_types_are_frozen() -> None:
    line = LineType(
        id="line-1",
        name="Line A",
        r_ohm_per_km=0.1,
        x_ohm_per_km=0.2,
        rated_current_a=100.0,
    )
    with pytest.raises(FrozenInstanceError):
        line.name = "Line B"

    transformer = TransformerType(
        id="tr-1",
        name="T1",
        rated_power_mva=10.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=6.0,
    )
    with pytest.raises(FrozenInstanceError):
        transformer.uk_percent = 5.5

    inverter = InverterType(
        id="inv-1",
        name="INV 1",
        un_kv=15.0,
        sn_mva=5.0,
        pmax_mw=4.0,
    )
    with pytest.raises(FrozenInstanceError):
        inverter.name = "INV 2"

    converter = ConverterType(
        id="conv-1",
        name="PV 1",
        kind=ConverterKind.PV,
        un_kv=15.0,
        sn_mva=5.0,
        pmax_mw=4.0,
    )
    with pytest.raises(FrozenInstanceError):
        converter.name = "PV 2"


def test_catalog_repository_lists_deterministically() -> None:
    repo = CatalogRepository.from_records(
        line_types=[
            {"id": "b", "name": "Zeta", "params": {"r_ohm_per_km": 0.2, "x_ohm_per_km": 0.3}},
            {"id": "a", "name": "Alpha", "params": {"r_ohm_per_km": 0.1, "x_ohm_per_km": 0.2}},
        ],
        cable_types=[
            {"id": "2", "name": "Cable B", "params": {"r_ohm_per_km": 0.2, "x_ohm_per_km": 0.3}},
            {"id": "1", "name": "Cable A", "params": {"r_ohm_per_km": 0.1, "x_ohm_per_km": 0.2}},
        ],
        transformer_types=[
            {
                "id": "t2",
                "name": "Trafo B",
                "params": {
                    "rated_power_mva": 20.0,
                    "voltage_hv_kv": 110.0,
                    "voltage_lv_kv": 20.0,
                    "uk_percent": 6.0,
                },
            },
            {
                "id": "t1",
                "name": "Trafo A",
                "params": {
                    "rated_power_mva": 10.0,
                    "voltage_hv_kv": 110.0,
                    "voltage_lv_kv": 20.0,
                    "uk_percent": 6.0,
                },
            },
        ],
        switch_equipment_types=[
            {"id": "s2", "name": "Switch B", "params": {"equipment_kind": "DISCONNECTOR"}},
            {"id": "s1", "name": "Switch A", "params": {"equipment_kind": "CIRCUIT_BREAKER"}},
        ],
        converter_types=[
            {
                "id": "c2",
                "name": "BESS B",
                "params": {"kind": "BESS", "un_kv": 15.0, "sn_mva": 2.0, "pmax_mw": 1.5},
            },
            {
                "id": "c1",
                "name": "PV A",
                "params": {"kind": "PV", "un_kv": 15.0, "sn_mva": 1.0, "pmax_mw": 0.8},
            },
        ],
        inverter_types=[
            {"id": "i2", "name": "INV B", "params": {"un_kv": 15.0, "sn_mva": 2.0, "pmax_mw": 1.5}},
            {"id": "i1", "name": "INV A", "params": {"un_kv": 15.0, "sn_mva": 1.0, "pmax_mw": 0.8}},
        ],
    )

    assert [item.id for item in repo.list_line_types()] == ["a", "b"]
    assert [item.id for item in repo.list_cable_types()] == ["1", "2"]
    assert [item.id for item in repo.list_transformer_types()] == ["t1", "t2"]
    assert [item.id for item in repo.list_switch_equipment_types()] == ["s1", "s2"]
    assert [item.id for item in repo.list_converter_types()] == ["c1", "c2"]
    assert [item.id for item in repo.list_converter_types(kind=ConverterKind.PV)] == ["c1"]
    assert [item.id for item in repo.list_inverter_types()] == ["i1", "i2"]


def test_line_branch_resolve_precedence() -> None:
    catalog = CatalogRepository.from_records(
        line_types=[
            {
                "id": "type-1",
                "name": "Type 1",
                "params": {"r_ohm_per_km": 1.0, "x_ohm_per_km": 2.0, "b_us_per_km": 3.0},
            }
        ],
        cable_types=[],
        transformer_types=[],
    )

    branch = LineBranch(
        id="line-1",
        name="Line",
        branch_type=BranchType.LINE,
        from_node_id="A",
        to_node_id="B",
        r_ohm_per_km=9.0,
        x_ohm_per_km=9.0,
        b_us_per_km=9.0,
        length_km=10.0,
        rated_current_a=100.0,
        type_ref="type-1",
        impedance_override=LineImpedanceOverride(
            r_total_ohm=50.0, x_total_ohm=60.0, b_total_us=70.0
        ),
    )

    resolved = branch.resolve_electrical_params(catalog)
    assert resolved.r_ohm_per_km == pytest.approx(5.0)
    assert resolved.x_ohm_per_km == pytest.approx(6.0)
    assert resolved.b_us_per_km == pytest.approx(7.0)

    branch_no_override = branch.with_resolved_params(catalog)
    assert branch_no_override.r_ohm_per_km == pytest.approx(5.0)

    branch_type_only = LineBranch(
        id="line-2",
        name="Line 2",
        branch_type=BranchType.LINE,
        from_node_id="A",
        to_node_id="B",
        r_ohm_per_km=9.0,
        x_ohm_per_km=9.0,
        b_us_per_km=9.0,
        length_km=10.0,
        rated_current_a=100.0,
        type_ref="type-1",
    )
    resolved_type = branch_type_only.resolve_electrical_params(catalog)
    assert resolved_type.r_ohm_per_km == pytest.approx(1.0)
    assert resolved_type.x_ohm_per_km == pytest.approx(2.0)
    assert resolved_type.b_us_per_km == pytest.approx(3.0)

    branch_inline = LineBranch(
        id="line-3",
        name="Line 3",
        branch_type=BranchType.LINE,
        from_node_id="A",
        to_node_id="B",
        r_ohm_per_km=9.0,
        x_ohm_per_km=8.0,
        b_us_per_km=7.0,
        length_km=10.0,
        rated_current_a=100.0,
    )
    resolved_inline = branch_inline.resolve_electrical_params(catalog)
    assert resolved_inline.r_ohm_per_km == pytest.approx(9.0)
    assert resolved_inline.x_ohm_per_km == pytest.approx(8.0)
    assert resolved_inline.b_us_per_km == pytest.approx(7.0)


def test_transformer_equivalent_from_catalog() -> None:
    catalog = CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[
            {
                "id": "tr-type",
                "name": "T1",
                "params": {
                    "rated_power_mva": 10.0,
                    "voltage_hv_kv": 110.0,
                    "voltage_lv_kv": 20.0,
                    "uk_percent": 6.0,
                    "pk_kw": 60.0,
                },
            }
        ],
    )
    transformer = TransformerBranch(
        id="tr-1",
        name="Transformer",
        branch_type=BranchType.TRANSFORMER,
        from_node_id="HV",
        to_node_id="LV",
        rated_power_mva=5.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=4.0,
        pk_kw=20.0,
        type_ref="tr-type",
    )

    z_pu = transformer.computed_equivalent_pu(catalog)
    assert z_pu.real == pytest.approx(0.006)
    assert z_pu.imag == pytest.approx((0.06**2 - 0.006**2) ** 0.5)


def test_switch_equipment_type_ref_does_not_affect_state() -> None:
    switch = Switch(
        id="sw-1",
        name="Switch",
        from_node_id="A",
        to_node_id="B",
        state=SwitchState.CLOSED,
        equipment_type_ref="eq-1",
    )
    assert switch.is_closed is True
    assert switch.is_open is False

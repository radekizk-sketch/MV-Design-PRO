"""Tests for ENM Pydantic v2 models — schema validation, discriminated union, required fields."""

import pytest
from enm.models import (
    BayPrimaryDevice,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    FuseBranch,
    GroundingConfig,
    OverheadLine,
    Source,
    SwitchBranch,
    Transformer,
)
from pydantic import ValidationError


class TestBus:
    def test_minimal_bus(self):
        bus = Bus(ref_id="bus_1", name="Szyna 1", voltage_kv=15.0)
        assert bus.voltage_kv == 15.0
        assert bus.phase_system == "3ph"
        assert bus.zone is None

    def test_bus_with_grounding(self):
        bus = Bus(
            ref_id="bus_1",
            name="Szyna 1",
            voltage_kv=15.0,
            grounding=GroundingConfig(type="petersen_coil", x_ohm=100.0),
        )
        assert bus.grounding is not None
        assert bus.grounding.type == "petersen_coil"


class TestBranches:
    def test_overhead_line(self):
        line = OverheadLine(
            ref_id="line_1",
            name="Linia L1",
            from_bus_ref="bus_1",
            to_bus_ref="bus_2",
            length_km=10.0,
            r_ohm_per_km=0.443,
            x_ohm_per_km=0.340,
        )
        assert line.type == "line_overhead"
        assert line.length_km == 10.0

    def test_cable(self):
        cable = Cable(
            ref_id="cable_1",
            name="Kabel K1",
            from_bus_ref="bus_1",
            to_bus_ref="bus_2",
            length_km=2.0,
            r_ohm_per_km=0.206,
            x_ohm_per_km=0.073,
            insulation="XLPE",
        )
        assert cable.type == "cable"
        assert cable.insulation == "XLPE"

    def test_switch_branch(self):
        sw = SwitchBranch(
            ref_id="sw_1",
            name="Wyłącznik Q1",
            from_bus_ref="bus_1",
            to_bus_ref="bus_2",
            type="breaker",
        )
        assert sw.type == "breaker"
        assert sw.status == "closed"

    def test_fuse_branch(self):
        fuse = FuseBranch(
            ref_id="fuse_1",
            name="Bezpiecznik F1",
            from_bus_ref="bus_1",
            to_bus_ref="bus_2",
            rated_current_a=100.0,
        )
        assert fuse.type == "fuse"

    def test_discriminated_union_serialization(self):
        enm = EnergyNetworkModel(
            header=ENMHeader(name="test"),
            branches=[
                OverheadLine(
                    ref_id="line_1",
                    name="L1",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    length_km=5,
                    r_ohm_per_km=0.4,
                    x_ohm_per_km=0.3,
                ),
                SwitchBranch(
                    ref_id="sw_1",
                    name="Q1",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    type="breaker",
                ),
            ],
        )
        data = enm.model_dump(mode="json")
        assert data["branches"][0]["type"] == "line_overhead"
        assert data["branches"][1]["type"] == "breaker"

        # Roundtrip
        restored = EnergyNetworkModel.model_validate(data)
        assert len(restored.branches) == 2


class TestTransformer:
    def test_minimal_transformer(self):
        trafo = Transformer(
            ref_id="trafo_1",
            name="T1",
            hv_bus_ref="bus_hv",
            lv_bus_ref="bus_lv",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=15.0,
            uk_percent=12.0,
            pk_kw=120.0,
        )
        assert trafo.sn_mva == 25.0
        assert trafo.vector_group is None


class TestSource:
    def test_source_short_circuit_power(self):
        src = Source(
            ref_id="src_1",
            name="Grid",
            bus_ref="bus_1",
            model="short_circuit_power",
            sk3_mva=220.0,
            rx_ratio=0.1,
        )
        assert src.model == "short_circuit_power"
        assert src.sk3_mva == 220.0


class TestBayPrimaryDevice:
    """F9.6 (SLD_CAD_SPEC_V3 §12.5, V12K-028): SURGE_ARRESTER kind."""

    def test_surge_arrester_kind_accepted(self):
        device = BayPrimaryDevice(
            device_ref="sa_1",
            symbol_ref="surge_arrester_1",
            kind="SURGE_ARRESTER",
            placement="DOWNSTREAM",
        )
        assert device.kind == "SURGE_ARRESTER"

    def test_surge_arrester_kind_json_roundtrip(self):
        device = BayPrimaryDevice(
            device_ref="sa_1",
            symbol_ref="surge_arrester_1",
            kind="SURGE_ARRESTER",
            placement="DOWNSTREAM",
        )
        data = device.model_dump(mode="json")
        restored = BayPrimaryDevice.model_validate(data)
        assert restored.kind == "SURGE_ARRESTER"

    def test_unknown_kind_rejected(self):
        with pytest.raises(ValidationError):
            BayPrimaryDevice(
                device_ref="x_1",
                symbol_ref="x",
                kind="NOT_A_REAL_KIND",
                placement="DOWNSTREAM",
            )


class TestENM:
    def test_empty_enm(self):
        enm = EnergyNetworkModel(header=ENMHeader(name="test"))
        assert enm.buses == []
        assert enm.branches == []
        assert enm.header.enm_version == "1.0"

    def test_enm_json_roundtrip(self):
        enm = EnergyNetworkModel(
            header=ENMHeader(name="Test"),
            buses=[Bus(ref_id="b1", name="Bus 1", voltage_kv=15)],
            sources=[
                Source(
                    ref_id="s1", name="Src", bus_ref="b1", model="short_circuit_power", sk3_mva=200
                )
            ],
        )
        data = enm.model_dump(mode="json")
        restored = EnergyNetworkModel.model_validate(data)
        assert restored.buses[0].voltage_kv == 15.0
        assert restored.sources[0].sk3_mva == 200.0

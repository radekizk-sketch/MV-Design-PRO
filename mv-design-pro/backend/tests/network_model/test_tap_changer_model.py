"""Canonical TapChanger model tests (V12K-045, OLTC F1).

Covers the single-source-of-truth tap-changer state on the transformer:
- effective ratio honouring the regulated winding,
- backward compatibility (no tap changer -> legacy behaviour, byte-identical
  serialization),
- catalog factory (reuse of TapChangerItem),
- ENM -> domain projection (mapping) including controlled-bus resolution.
"""

from __future__ import annotations

import pytest
from enm.mapping import map_enm_to_network_graph
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Transformer,
)
from enm.models import LineDropCompensation as EnmLdc
from enm.models import TapChanger as EnmTapChanger
from network_model.catalog.audit2_catalogs import (
    get_tap_changer,
    tap_changer_fields_from_catalog,
)
from network_model.core.branch import (
    BranchType,
    LineDropCompensation,
    TapChanger,
    TransformerBranch,
)


def _transformer(**overrides) -> TransformerBranch:
    base = {
        "id": "t1",
        "name": "TR1",
        "branch_type": BranchType.TRANSFORMER,
        "from_node_id": "hv",
        "to_node_id": "lv",
        "rated_power_mva": 25.0,
        "voltage_hv_kv": 110.0,
        "voltage_lv_kv": 15.0,
        "uk_percent": 12.0,
        "pk_kw": 120.0,
    }
    base.update(overrides)
    return TransformerBranch(**base)


class TestBackwardCompatibility:
    def test_no_tap_changer_keeps_legacy_tap_ratio(self):
        tb = _transformer(tap_position=2, tap_step_percent=2.5)
        assert tb.tap_changer is None
        # Legacy: 1 + 2 * 2.5 / 100 = 1.05
        assert tb.get_tap_ratio() == pytest.approx(1.05)

    def test_no_tap_changer_omitted_from_serialization(self):
        tb = _transformer()
        assert "tap_changer" not in tb.to_dict()

    def test_effective_ratio_at_neutral_equals_turns_ratio(self):
        tb = _transformer()
        assert tb.effective_ratio() == pytest.approx(110.0 / 15.0)


class TestEffectiveRatio:
    def test_hv_regulation_raises_ratio(self):
        tc = TapChanger(
            regulation_type="OLTC",
            regulated_winding="HV",
            neutral_position=0,
            current_position=2,
            min_position=-9,
            max_position=9,
            step_percent=1.25,
        )
        tb = _transformer(tap_changer=tc)
        assert tb.get_tap_ratio() == pytest.approx(1.025)
        assert tb.effective_ratio() == pytest.approx((110.0 / 15.0) * 1.025)

    def test_lv_regulation_inverts_factor(self):
        tc = TapChanger(
            regulation_type="OLTC",
            regulated_winding="LV",
            neutral_position=0,
            current_position=2,
            step_percent=1.25,
        )
        tb = _transformer(tap_changer=tc)
        assert tb.get_tap_ratio() == pytest.approx(1.0 / 1.025)

    def test_neutral_offset_is_honoured(self):
        # current == neutral -> factor 1.0 regardless of neutral value.
        tc = TapChanger(
            regulation_type="OLTC",
            neutral_position=9,
            current_position=9,
            min_position=0,
            max_position=18,
            step_percent=1.25,
        )
        tb = _transformer(tap_changer=tc)
        assert tb.get_tap_ratio() == pytest.approx(1.0)

    def test_regulation_type_none_falls_back_to_legacy(self):
        tc = TapChanger(regulation_type="NONE", current_position=5, step_percent=2.5)
        tb = _transformer(tap_position=1, tap_step_percent=2.5, tap_changer=tc)
        # NONE is inactive -> legacy tap_position drives the ratio.
        assert tb.get_tap_ratio() == pytest.approx(1.025)


class TestTapChangerHelpers:
    def test_clamp_position(self):
        tc = TapChanger(min_position=-9, max_position=9)
        assert tc.clamp_position(15) == 9
        assert tc.clamp_position(-15) == -9
        assert tc.clamp_position(3) == 3

    def test_with_position_clamps(self):
        tc = TapChanger(min_position=-5, max_position=5, current_position=0)
        assert tc.with_position(7).current_position == 5

    def test_is_active_and_is_automatic(self):
        assert TapChanger(regulation_type="OLTC", control_mode="AUTOMATIC").is_automatic()
        assert not TapChanger(regulation_type="OLTC", control_mode="MANUAL").is_automatic()
        assert not TapChanger(regulation_type="DETC", control_mode="AUTOMATIC").is_automatic()
        assert TapChanger(regulation_type="DETC").is_active()
        assert not TapChanger(regulation_type="NONE").is_active()


class TestSerializationRoundTrip:
    def test_full_roundtrip_preserves_ratio(self):
        tc = TapChanger(
            regulation_type="OLTC",
            regulated_winding="HV",
            neutral_position=0,
            current_position=-3,
            min_position=-9,
            max_position=9,
            step_percent=1.25,
            control_mode="AUTOMATIC",
            voltage_setpoint_kv=15.5,
            deadband_kv=0.3,
            delay_seconds=30.0,
            controlled_bus_id="lv",
            line_drop_compensation=LineDropCompensation(enabled=True, r_ohm=0.5, x_ohm=1.2),
        )
        tb = _transformer(tap_changer=tc)
        restored = TransformerBranch.from_dict(tb.to_dict())
        assert restored.tap_changer == tc
        assert restored.get_tap_ratio() == pytest.approx(tb.get_tap_ratio())

    def test_optional_fields_excluded_when_none(self):
        tc = TapChanger(regulation_type="DETC", step_percent=2.5)
        d = tc.to_dict()
        assert "voltage_setpoint_kv" not in d
        assert "line_drop_compensation" not in d
        assert d["regulation_type"] == "DETC"


class TestCatalogFactory:
    def test_oltc_catalog_maps_to_symmetric_range(self):
        item = get_tap_changer("tc_oltc_110sn_19_125")
        assert item is not None
        fields = tap_changer_fields_from_catalog(item)
        assert fields["regulation_type"] == "OLTC"
        assert fields["regulated_winding"] == "HV"
        assert fields["min_position"] == -9
        assert fields["max_position"] == 9
        assert fields["step_percent"] == pytest.approx(1.25)
        assert fields["control_mode"] == "AUTOMATIC"
        # Round-trips into both model layers.
        assert EnmTapChanger(**fields).max_position == 9
        assert TapChanger(**fields).max_position == 9

    def test_detc_catalog_is_manual(self):
        item = get_tap_changer("tc_detc_snnn_5_25")
        fields = tap_changer_fields_from_catalog(item)
        assert fields["regulation_type"] == "DETC"
        assert fields["control_mode"] == "MANUAL"
        assert fields["min_position"] == -2
        assert fields["max_position"] == 2

    def test_catalog_range_matches_range_percent(self):
        for item in (
            get_tap_changer("tc_oltc_110sn_19_125"),
            get_tap_changer("tc_oltc_110sn_17_125"),
            get_tap_changer("tc_detc_snnn_5_25"),
            get_tap_changer("tc_oltc_snnn_9_15"),
        ):
            fields = tap_changer_fields_from_catalog(item)
            span = fields["max_position"] * fields["step_percent"]
            assert span == pytest.approx(item.range_percent)


class TestEnmProjection:
    def _model_with_tap_changer(self, tap_changer: EnmTapChanger | None) -> EnergyNetworkModel:
        return EnergyNetworkModel(
            header=ENMHeader(name="tc-test"),
            buses=[
                Bus(ref_id="B_HV", name="HV", voltage_kv=110.0),
                Bus(ref_id="B_LV", name="LV", voltage_kv=15.0),
            ],
            transformers=[
                Transformer(
                    ref_id="TR1",
                    name="TR1",
                    hv_bus_ref="B_HV",
                    lv_bus_ref="B_LV",
                    sn_mva=25.0,
                    uhv_kv=110.0,
                    ulv_kv=15.0,
                    uk_percent=12.0,
                    pk_kw=120.0,
                    tap_changer=tap_changer,
                )
            ],
        )

    def test_projection_resolves_controlled_bus_to_node_id(self):
        enm = self._model_with_tap_changer(
            EnmTapChanger(
                regulation_type="OLTC",
                regulated_winding="HV",
                current_position=2,
                min_position=-9,
                max_position=9,
                step_percent=1.25,
                control_mode="AUTOMATIC",
                voltage_setpoint_kv=15.5,
                deadband_kv=0.3,
                controlled_bus_ref="B_LV",
                line_drop_compensation=EnmLdc(enabled=True, r_ohm=0.4, x_ohm=1.0),
            )
        )
        graph = map_enm_to_network_graph(enm)
        trafo = next(b for b in graph.branches.values() if isinstance(b, TransformerBranch))
        assert trafo.tap_changer is not None
        assert trafo.tap_changer.regulation_type == "OLTC"
        assert trafo.tap_changer.current_position == 2
        assert trafo.get_tap_ratio() == pytest.approx(1.025)
        # controlled_bus_ref resolved to the LV node id (not the raw ref).
        lv_node = next(n for n in graph.nodes.values() if n.name == "LV")
        assert trafo.tap_changer.controlled_bus_id == lv_node.id
        assert trafo.tap_changer.line_drop_compensation.enabled is True

    def test_projection_absent_tap_changer_keeps_legacy(self):
        enm = self._model_with_tap_changer(None)
        graph = map_enm_to_network_graph(enm)
        trafo = next(b for b in graph.branches.values() if isinstance(b, TransformerBranch))
        assert trafo.tap_changer is None
        assert trafo.get_tap_ratio() == pytest.approx(1.0)

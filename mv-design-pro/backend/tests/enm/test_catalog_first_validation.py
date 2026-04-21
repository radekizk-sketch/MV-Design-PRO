"""
Catalog-First Validation Tests — PR-10

Verifies:
1. parameter_source / overrides consistency
2. Transformer without catalog_ref is a BLOCKER
3. Overrides without OVERRIDE parameter_source is a BLOCKER
4. Deterministic serialization with overrides
"""

from src.enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    Measurement,
    MeasurementRating,
    OverheadLine,
    ParameterOverride,
    Source,
    Transformer,
)
from src.enm.validator import ENMValidator


def _make_minimal_enm(**kwargs) -> EnergyNetworkModel:
    """Minimal valid ENM for testing catalog-first checks."""
    return EnergyNetworkModel(
        header=ENMHeader(name="test"),
        buses=[
            Bus(ref_id="bus_hv", name="HV", voltage_kv=15.0),
            Bus(ref_id="bus_lv", name="LV", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Zasilanie",
                bus_ref="bus_hv",
                model="short_circuit_power",
                sk3_mva=500.0,
                r_ohm=0.01,
                x_ohm=0.1,
                catalog_ref="SRC_TEST",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
        ],
        branches=[
            OverheadLine(
                ref_id="line_1",
                name="L1",
                from_bus_ref="bus_hv",
                to_bus_ref="bus_lv",
                length_km=5.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.4,
                catalog_ref="cat_line_1",
            ),
        ],
        **kwargs,
    )


class TestCatalogFirstValidation:
    """Tests for catalog-first validation rules."""

    def test_transformer_without_catalog_ref_is_blocker(self):
        """E009: Transformer without catalog_ref triggers BLOCKER."""
        enm = _make_minimal_enm(
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="T1",
                    hv_bus_ref="bus_hv",
                    lv_bus_ref="bus_lv",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=7.0,
                    catalog_ref=None,  # Missing!
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e009 = [i for i in result.issues if i.code == "E009"]
        assert len(e009) == 1
        assert e009[0].severity == "BLOCKER"
        assert "tr_1" in e009[0].element_refs

    def test_transformer_with_catalog_ref_no_e009(self):
        """Transformer with catalog_ref does NOT trigger E009."""
        enm = _make_minimal_enm(
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="T1",
                    hv_bus_ref="bus_hv",
                    lv_bus_ref="bus_lv",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=7.0,
                    catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e009 = [i for i in result.issues if i.code == "E009"]
        assert len(e009) == 0

    def test_overrides_without_override_source_is_blocker(self):
        """E010: overrides[] non-empty but parameter_source != OVERRIDE."""
        enm = _make_minimal_enm(
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="T1",
                    hv_bus_ref="bus_hv",
                    lv_bus_ref="bus_lv",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=7.0,
                    catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
                    parameter_source="CATALOG",
                    overrides=[
                        ParameterOverride(key="uk_percent", value=5.5, reason="test"),
                    ],
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e010 = [i for i in result.issues if i.code == "E010"]
        assert len(e010) == 1
        assert e010[0].severity == "BLOCKER"

    def test_overrides_with_override_source_no_e010(self):
        """overrides[] with parameter_source=OVERRIDE does NOT trigger E010."""
        enm = _make_minimal_enm(
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="T1",
                    hv_bus_ref="bus_hv",
                    lv_bus_ref="bus_lv",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=7.0,
                    catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
                    parameter_source="OVERRIDE",
                    overrides=[
                        ParameterOverride(key="uk_percent", value=5.5, reason="pomiar fabryczny"),
                    ],
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e010 = [i for i in result.issues if i.code == "E010"]
        assert len(e010) == 0

    def test_empty_overrides_no_e010(self):
        """Empty overrides[] never triggers E010 regardless of source."""
        enm = _make_minimal_enm(
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="T1",
                    hv_bus_ref="bus_hv",
                    lv_bus_ref="bus_lv",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=7.0,
                    catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
                    parameter_source="CATALOG",
                    overrides=[],
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e010 = [i for i in result.issues if i.code == "E010"]
        assert len(e010) == 0


class TestParameterOverrideSerialization:
    """Deterministic serialization of parameter overrides."""

    def test_override_roundtrip(self):
        """ParameterOverride serializes and deserializes deterministically."""
        override = ParameterOverride(key="r_ohm_per_km", value=0.21, reason="adjusted")
        data = override.model_dump()
        restored = ParameterOverride(**data)
        assert restored.key == "r_ohm_per_km"
        assert restored.value == 0.21
        assert restored.reason == "adjusted"

    def test_generator_with_quantity_and_catalog(self):
        """Generator with catalog_ref and quantity serializes correctly."""
        gen = Generator(
            ref_id="pv_farm_1",
            name="Farma PV",
            bus_ref="bus_hv",
            p_mw=2.0,
            gen_type="pv_inverter",
            catalog_ref="cat_pv_inv_100",
            quantity=20,
            n_parallel=4,
            parameter_source="CATALOG",
        )
        data = gen.model_dump()
        assert data["catalog_ref"] == "cat_pv_inv_100"
        assert data["quantity"] == 20
        assert data["n_parallel"] == 4
        assert data["parameter_source"] == "CATALOG"
        assert data["overrides"] == []

    def test_load_with_catalog_and_quantity(self):
        """Load with catalog_ref and quantity serializes correctly."""
        load = Load(
            ref_id="load_1",
            name="Odbiór",
            bus_ref="bus_lv",
            p_mw=0.5,
            q_mvar=0.1,
            catalog_ref="cat_load_industrial",
            quantity=3,
        )
        data = load.model_dump()
        assert data["catalog_ref"] == "cat_load_industrial"
        assert data["quantity"] == 3

    def test_measurement_with_catalog(self):
        """Measurement with catalog_ref serializes correctly."""
        ct = Measurement(
            ref_id="ct_1",
            name="CT1",
            measurement_type="CT",
            bus_ref="bus_hv",
            rating=MeasurementRating(ratio_primary=200, ratio_secondary=5),
            catalog_ref="cat_ct_200_5",
        )
        data = ct.model_dump()
        assert data["catalog_ref"] == "cat_ct_200_5"

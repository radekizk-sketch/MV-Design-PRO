"""Tests for V12S-007: voltage band consistency on branch endpoints.

Domena egzekwuje, ze galaz (OverheadLine, Cable, SwitchBranch, FuseBranch)
nie moze laczyc szyn w roznych pasmach napieciowych. Jedynym dozwolonym
elementem cross-band jest Transformer.
"""

from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    OverheadLine,
    Source,
    SwitchBranch,
    Transformer,
)
from enm.validator import ENMValidator, _voltage_band


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


def _source(bus_ref: str = "bus_sn") -> Source:
    return Source(
        ref_id="src_1",
        name="Sieć",
        bus_ref=bus_ref,
        model="short_circuit_power",
        sk3_mva=250,
        catalog_ref="SRC_TEST",
        catalog_namespace="ZRODLO_SN",
        parameter_source="CATALOG",
        source_mode="KATALOG",
    )


class TestVoltageBandClassification:
    def test_band_nn(self) -> None:
        assert _voltage_band(0.4) == "nN"
        assert _voltage_band(0.23) == "nN"
        assert _voltage_band(0.999) == "nN"

    def test_band_sn(self) -> None:
        assert _voltage_band(1.0) == "SN"
        assert _voltage_band(15.0) == "SN"
        assert _voltage_band(60.0) == "SN"

    def test_band_wn(self) -> None:
        assert _voltage_band(60.001) == "WN"
        assert _voltage_band(110.0) == "WN"
        assert _voltage_band(400.0) == "WN"


class TestBranchEndpointVoltageBand:
    def test_overhead_line_sn_to_nn_is_blocker(self) -> None:
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn", name="SN", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="nN", voltage_kv=0.4),
            ],
            sources=[_source()],
            branches=[
                OverheadLine(
                    ref_id="ln_invalid",
                    name="Linia SN→nN",
                    from_bus_ref="bus_sn",
                    to_bus_ref="bus_nn",
                    length_km=1.0,
                    r_ohm_per_km=0.4,
                    x_ohm_per_km=0.3,
                    catalog_ref="CAT-LN-1",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e020 = [i for i in result.issues if i.code == "E020"]
        assert len(e020) == 1
        assert e020[0].severity == "BLOCKER"
        assert "ln_invalid" in e020[0].element_refs
        assert "bus_sn" in e020[0].element_refs
        assert "bus_nn" in e020[0].element_refs

    def test_cable_wn_to_sn_is_blocker(self) -> None:
        enm = _enm(
            buses=[
                Bus(ref_id="bus_wn", name="WN", voltage_kv=110.0),
                Bus(ref_id="bus_sn", name="SN", voltage_kv=15.0),
            ],
            sources=[_source(bus_ref="bus_wn")],
            branches=[
                Cable(
                    ref_id="cab_invalid",
                    name="Kabel WN→SN",
                    from_bus_ref="bus_wn",
                    to_bus_ref="bus_sn",
                    length_km=0.5,
                    r_ohm_per_km=0.2,
                    x_ohm_per_km=0.1,
                    catalog_ref="CAT-CAB-1",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e020 = [i for i in result.issues if i.code == "E020"]
        assert len(e020) == 1

    def test_switch_branch_cross_band_is_blocker(self) -> None:
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn", name="SN", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="nN", voltage_kv=0.4),
            ],
            sources=[_source()],
            branches=[
                SwitchBranch(
                    ref_id="sw_invalid",
                    name="Lacznik SN/nN",
                    from_bus_ref="bus_sn",
                    to_bus_ref="bus_nn",
                    type="switch",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e020 = [i for i in result.issues if i.code == "E020"]
        assert len(e020) == 1

    def test_transformer_cross_band_is_legitimate(self) -> None:
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn", name="SN", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="nN", voltage_kv=0.4),
            ],
            sources=[_source()],
            transformers=[
                Transformer(
                    ref_id="tr_legit",
                    name="TR 15/0,4",
                    hv_bus_ref="bus_sn",
                    lv_bus_ref="bus_nn",
                    sn_mva=0.63,
                    uhv_kv=15,
                    ulv_kv=0.4,
                    uk_percent=6,
                    pk_kw=7.6,
                    vector_group="Dyn11",
                    catalog_ref="CAT-TR-1",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e020 = [i for i in result.issues if i.code == "E020"]
        assert len(e020) == 0

    def test_same_band_branch_is_valid(self) -> None:
        enm = _enm(
            buses=[
                Bus(ref_id="bus_a", name="A", voltage_kv=15.0),
                Bus(ref_id="bus_b", name="B", voltage_kv=15.0),
            ],
            sources=[_source(bus_ref="bus_a")],
            branches=[
                Cable(
                    ref_id="cab_ok",
                    name="Kabel SN→SN",
                    from_bus_ref="bus_a",
                    to_bus_ref="bus_b",
                    length_km=1.0,
                    r_ohm_per_km=0.2,
                    x_ohm_per_km=0.1,
                    catalog_ref="CAT-CAB-1",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e020 = [i for i in result.issues if i.code == "E020"]
        assert len(e020) == 0

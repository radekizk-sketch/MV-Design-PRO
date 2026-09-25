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
from enm.validator import ENMValidator
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe


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
    """Granice pasm (karta PASMO-1KV): nN ⇔ 0 < U ≤ 1 kV (IEC 60038 tab. 1),
    SN ⇔ 1 kV < U < 110 kV, WN ⇔ U ≥ 110 kV (rozporządzenie, zał. 1 cz. I pkt 2.2/3.2)."""

    def test_band_nn(self) -> None:
        assert pasmo_napieciowe(0.4) == "nN"
        assert pasmo_napieciowe(0.23) == "nN"
        assert pasmo_napieciowe(0.999) == "nN"
        assert pasmo_napieciowe(1.0) == "nN"

    def test_band_sn(self) -> None:
        assert pasmo_napieciowe(1.001) == "SN"
        assert pasmo_napieciowe(15.0) == "SN"
        assert pasmo_napieciowe(60.0) == "SN"
        assert pasmo_napieciowe(66.0) == "SN"
        assert pasmo_napieciowe(109.999) == "SN"

    def test_band_wn(self) -> None:
        assert pasmo_napieciowe(110.0) == "WN"
        assert pasmo_napieciowe(220.0) == "WN"
        assert pasmo_napieciowe(400.0) == "WN"

    def test_brak_pasma_dla_napiecia_niefizycznego(self) -> None:
        assert pasmo_napieciowe(None) is None
        assert pasmo_napieciowe(0.0) is None
        assert pasmo_napieciowe(-0.4) is None
        assert pasmo_napieciowe(float("nan")) is None
        assert pasmo_napieciowe(float("inf")) is None


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

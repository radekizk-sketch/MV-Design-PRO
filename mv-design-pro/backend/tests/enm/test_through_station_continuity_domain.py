"""Tests for V12S-007: ciaglosc SN przez stacje przelotowa.

Domena egzekwuje, ze stacja przelotowa (substation z polem IN i polem OUT)
musi miec oba pola podpiete do tej samej szyny SN. Ciaglosc realizowana
jest WYLACZNIE przez wspolna magistrala SN, nigdy przez strone nN ani
transformator.
"""

from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)
from enm.validator import ENMValidator


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


def _source(bus_ref: str = "bus_sn_in") -> Source:
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


class TestThroughStationContinuity:
    def test_through_station_same_mv_bus_is_valid(self) -> None:
        """Stacja przelotowa z IN i OUT na tej samej szynie SN — bez bloker."""
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn", name="Szyna SN stacji", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4),
            ],
            sources=[_source(bus_ref="bus_sn")],
            substations=[
                Substation(
                    ref_id="sub_thru",
                    name="Stacja przelotowa",
                    station_type="inline",
                    bus_refs=["bus_sn", "bus_nn"],
                ),
            ],
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="TR",
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
            bays=[
                Bay(
                    ref_id="bay_in",
                    name="Pole zasilajace",
                    bay_role="IN",
                    substation_ref="sub_thru",
                    bus_ref="bus_sn",
                ),
                Bay(
                    ref_id="bay_out",
                    name="Pole odplywowe",
                    bay_role="OUT",
                    substation_ref="sub_thru",
                    bus_ref="bus_sn",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e021 = [i for i in result.issues if i.code == "E021"]
        assert len(e021) == 0

    def test_through_station_in_on_lv_is_blocker(self) -> None:
        """Pole IN podlaczone do szyny nN — naruszenie ciaglosci SN."""
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn", name="SN", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="nN", voltage_kv=0.4),
            ],
            sources=[_source(bus_ref="bus_sn")],
            substations=[
                Substation(
                    ref_id="sub_bad",
                    name="Stacja",
                    station_type="inline",
                    bus_refs=["bus_sn", "bus_nn"],
                ),
            ],
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="TR",
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
            bays=[
                Bay(
                    ref_id="bay_in_lv",
                    name="Pole zasilajace na nN",
                    bay_role="IN",
                    substation_ref="sub_bad",
                    bus_ref="bus_nn",  # NIELEGALNE — ciaglosc SN przez nN
                ),
                Bay(
                    ref_id="bay_out_sn",
                    name="Pole odplywowe SN",
                    bay_role="OUT",
                    substation_ref="sub_bad",
                    bus_ref="bus_sn",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e021 = [i for i in result.issues if i.code == "E021"]
        assert len(e021) == 1
        assert e021[0].severity == "BLOCKER"
        assert "sub_bad" in e021[0].element_refs

    def test_through_station_in_out_on_different_mv_buses_is_blocker(self) -> None:
        """IN i OUT na roznych szynach SN — brak ciaglosci wspolnej magistrali."""
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn_a", name="SN A", voltage_kv=15.0),
                Bus(ref_id="bus_sn_b", name="SN B", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="nN", voltage_kv=0.4),
            ],
            sources=[_source(bus_ref="bus_sn_a")],
            substations=[
                Substation(
                    ref_id="sub_split",
                    name="Stacja rozdzielona",
                    station_type="inline",
                    bus_refs=["bus_sn_a", "bus_sn_b", "bus_nn"],
                ),
            ],
            transformers=[
                Transformer(
                    ref_id="tr_a",
                    name="TR A",
                    hv_bus_ref="bus_sn_a",
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
            bays=[
                Bay(
                    ref_id="bay_in_a",
                    name="IN na SN A",
                    bay_role="IN",
                    substation_ref="sub_split",
                    bus_ref="bus_sn_a",
                ),
                Bay(
                    ref_id="bay_out_b",
                    name="OUT na SN B",
                    bay_role="OUT",
                    substation_ref="sub_split",
                    bus_ref="bus_sn_b",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e021 = [i for i in result.issues if i.code == "E021"]
        assert len(e021) == 1

    def test_terminal_station_only_in_no_continuity_check(self) -> None:
        """Stacja koncowa (tylko IN, brak OUT) nie wymaga sprawdzenia ciaglosci."""
        enm = _enm(
            buses=[
                Bus(ref_id="bus_sn", name="SN", voltage_kv=15.0),
                Bus(ref_id="bus_nn", name="nN", voltage_kv=0.4),
            ],
            sources=[_source(bus_ref="bus_sn")],
            substations=[
                Substation(
                    ref_id="sub_terminal",
                    name="Stacja koncowa",
                    station_type="terminal",
                    bus_refs=["bus_sn", "bus_nn"],
                ),
            ],
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="TR",
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
            bays=[
                Bay(
                    ref_id="bay_in",
                    name="Pole zasilajace",
                    bay_role="IN",
                    substation_ref="sub_terminal",
                    bus_ref="bus_sn",
                ),
                Bay(
                    ref_id="bay_tr",
                    name="Pole transformatorowe",
                    bay_role="TR",
                    substation_ref="sub_terminal",
                    bus_ref="bus_sn",
                ),
            ],
        )
        result = ENMValidator().validate(enm)
        e021 = [i for i in result.issues if i.code == "E021"]
        assert len(e021) == 0

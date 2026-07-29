"""Testy PR-6: topology_classifier + internal_layout (wewnętrzny SLD stacji)."""

from __future__ import annotations

from src.application.sld.internal_layout import build_internal_sld
from src.application.sld.topology_classifier import (
    classify_station_topology,
    infer_topological_type_for_substation,
)
from src.enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Port,
    Substation,
    Transformer,
)


def _header() -> ENMHeader:
    return ENMHeader(name="test")


def _make_port(
    kind: str, sub_ref: str = "sub_1", bay_ref: str = "bay_1", suffix: str = "p"
) -> Port:
    return Port(
        id=f"{sub_ref}:{bay_ref}:{suffix}",
        kind=kind,  # type: ignore[arg-type]
        nominal_voltage_kv=15.0,
        bay_ref=bay_ref,
        substation_ref=sub_ref,
    )


# ---------------------------------------------------------------------------
# topology_classifier
# ---------------------------------------------------------------------------


class TestClassifyStationTopology:
    def test_terminal_only_input(self) -> None:
        ports = [_make_port("sn_input")]
        assert classify_station_topology(ports) == "końcowa"

    def test_inline_input_output(self) -> None:
        ports = [
            _make_port("sn_input", suffix="in"),
            _make_port("sn_output", suffix="out"),
        ]
        assert classify_station_topology(ports) == "przelotowa"

    def test_branch_with_input_output_and_branch(self) -> None:
        ports = [
            _make_port("sn_input", suffix="in"),
            _make_port("sn_output", suffix="out"),
            _make_port("sn_branch", suffix="br1"),
        ]
        assert classify_station_topology(ports) == "odgałęźna"

    def test_sectional_with_two_inputs_and_coupler(self) -> None:
        ports = [
            _make_port("sn_input", suffix="in1"),
            _make_port("sn_input", suffix="in2"),
            _make_port("sn_coupler", suffix="cpl"),
        ]
        assert classify_station_topology(ports) == "sekcyjna"

    def test_station_with_pv_only_is_terminal(self) -> None:
        ports = [
            _make_port("sn_input", suffix="in"),
            _make_port("sn_der_pv", suffix="pv"),
        ]
        # DER nie tworzy wyjścia ciągu — stacja końcowa
        assert classify_station_topology(ports) == "końcowa"

    def test_empty_ports_default_terminal(self) -> None:
        assert classify_station_topology([]) == "końcowa"


class TestInferTopologicalTypeForSubstation:
    def test_uses_external_ports_when_present(self) -> None:
        sub = Substation(
            ref_id="sub_1",
            name="ST-01",
            station_type="customer",
            external_ports=[
                _make_port("sn_input", "sub_1"),
                _make_port("sn_output", "sub_1"),
                _make_port("sn_branch", "sub_1"),
            ],
        )
        assert infer_topological_type_for_substation(sub) == "odgałęźna"

    def test_falls_back_to_station_type_inline(self) -> None:
        sub = Substation(ref_id="sub_1", name="ST-01", station_type="inline")
        assert infer_topological_type_for_substation(sub) == "przelotowa"

    def test_falls_back_to_station_type_terminal(self) -> None:
        sub = Substation(ref_id="sub_1", name="ST-01", station_type="terminal")
        assert infer_topological_type_for_substation(sub) == "końcowa"

    def test_gpz_defaults_to_sectional(self) -> None:
        sub = Substation(ref_id="gpz_main", name="GPZ", station_type="gpz")
        assert infer_topological_type_for_substation(sub) == "sekcyjna"


# ---------------------------------------------------------------------------
# build_internal_sld
# ---------------------------------------------------------------------------


class TestBuildInternalSld:
    def test_returns_none_for_unknown_substation(self) -> None:
        enm = EnergyNetworkModel(header=_header())
        result = build_internal_sld("nonexistent", enm)
        assert result is None

    def test_minimal_terminal_station(self) -> None:
        sub = Substation(
            ref_id="sub_term",
            name="ST-Końcowa",
            station_type="terminal",
            bus_refs=["bus_sn_1"],
            nn_voltage_levels=[0.4],
            construction_type="kontenerowa",
        )
        enm = EnergyNetworkModel(
            header=_header(),
            buses=[Bus(ref_id="bus_sn_1", name="Szyna SN", voltage_kv=15.0)],
            substations=[sub],
            bays=[
                Bay(
                    ref_id="bay_in",
                    name="Pole wejściowe",
                    bay_role="IN",
                    substation_ref="sub_term",
                    bus_ref="bus_sn_1",
                    bay_template_ref="bay_template_line_in",
                ),
                Bay(
                    ref_id="bay_tr",
                    name="Pole transformatorowe",
                    bay_role="TR",
                    substation_ref="sub_term",
                    bus_ref="bus_sn_1",
                ),
            ],
        )

        result = build_internal_sld("sub_term", enm)
        assert result is not None
        assert result.substation_id == "sub_term"
        assert result.name == "ST-Końcowa"
        assert result.topological_type == "końcowa"
        assert result.construction_type == "kontenerowa"
        assert result.sn_voltage_kv == 15.0
        assert result.nn_voltage_levels == [0.4]
        assert len(result.bays) == 2
        assert result.bays[0].bay_role == "IN"
        assert result.bays[0].template_id == "bay_template_line_in"
        assert len(result.nn_switchgears) == 1
        assert result.nn_switchgears[0].nn_voltage_kv == 0.4

    def test_industrial_station_with_multi_voltage_nn(self) -> None:
        sub = Substation(
            ref_id="sub_ind",
            name="Stacja przemysłowa",
            station_type="customer",
            bus_refs=["bus_sn", "bus_nn_400", "bus_nn_690", "bus_nn_6000"],
            nn_voltage_levels=[0.4, 0.69, 6.0],
            construction_type="wnetrzowa",
        )
        enm = EnergyNetworkModel(
            header=_header(),
            buses=[
                Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0),
                Bus(ref_id="bus_nn_400", name="Szyna 0,4 kV", voltage_kv=0.4),
                Bus(ref_id="bus_nn_690", name="Szyna 0,69 kV", voltage_kv=0.69),
                Bus(ref_id="bus_nn_6000", name="Szyna 6 kV", voltage_kv=6.0),
            ],
            substations=[sub],
            bays=[],
            transformers=[
                Transformer(
                    ref_id="tr1",
                    name="TR1",
                    hv_bus_ref="bus_sn",
                    lv_bus_ref="bus_nn_6000",
                    sn_mva=10.0,
                    uhv_kv=15.0,
                    ulv_kv=6.0,
                    uk_percent=8.0,
                    pk_kw=80.0,
                ),
                Transformer(
                    ref_id="tr2",
                    name="TR2",
                    hv_bus_ref="bus_sn",
                    lv_bus_ref="bus_nn_400",
                    sn_mva=1.6,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=20.0,
                ),
            ],
        )

        result = build_internal_sld("sub_ind", enm)
        assert result is not None
        assert result.nn_voltage_levels == [0.4, 0.69, 6.0]
        assert len(result.nn_switchgears) == 3
        assert {sw.nn_voltage_kv for sw in result.nn_switchgears} == {0.4, 0.69, 6.0}
        assert len(result.transformers) == 2
        assert {t.ulv_kv for t in result.transformers} == {6.0, 0.4}

    def test_station_with_external_ports_classifies_via_classifier(self) -> None:
        sub = Substation(
            ref_id="sub_branch",
            name="Stacja odgałęźna ST-05",
            station_type="branch",
            external_ports=[
                _make_port("sn_input", "sub_branch", suffix="in"),
                _make_port("sn_output", "sub_branch", suffix="out"),
                _make_port("sn_branch", "sub_branch", suffix="br1"),
            ],
        )
        enm = EnergyNetworkModel(
            header=_header(),
            substations=[sub],
        )
        result = build_internal_sld("sub_branch", enm)
        assert result is not None
        assert result.topological_type == "odgałęźna"
        assert len(result.external_ports) == 3

"""Testy grafu domeny nN (karta T5b, §0 rozstrzygnięcie 2/4).

Fixtura wieloźródłowa (2×TR + sprzęgło + PV) DOWODZI, że domena jest
wyprowadzona z GRAFU (nie z szablonu TR→RGnN→odpływy) i że WSZYSTKIE źródła
domeny trafiają do wyniku. Osobna fixtura z `boundary_link` dowodzi, że
połączenie do INNEJ stacji (z WŁASNYM transformatorem) zatrzymuje spacer
zamiast wciągać jej elementy.
"""

from __future__ import annotations

from application.analyses.lv_domain.graph_view import (
    build_lv_domain_view,
    voltage_level_id,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Generator,
    Load,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)


def _cable(ref_id: str, from_bus: str, to_bus: str) -> Cable:
    return Cable(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        length_km=0.05,
        r_ohm_per_km=0.32,
        x_ohm_per_km=0.08,
    )


def _switch(ref_id: str, from_bus: str, to_bus: str, *, kind: str, status: str) -> SwitchBranch:
    return SwitchBranch(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        type=kind,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
    )


def _multi_source_with_boundary_fixture() -> EnergyNetworkModel:
    """Stacja ROOT: 2×TR (tr1/tr2) + sprzęgło sekcji (nn_a<->nn_b) + PV na
    nn_a + podrozdzielnica (sub_station, rozdzielnica_nn, BEZ transformatora)
    doczepiona kablem do nn_b + wiązanie awaryjne (otwarte) do OBCEJ stacji
    (other_station, WŁASNY transformator tr_other) — boundary_link.
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="t5b", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn_a", name="RGnN-A", voltage_kv=0.4),
            Bus(ref_id="nn_b", name="RGnN-B", voltage_kv=0.4),
            Bus(ref_id="sub_bus", name="Podrozdzielnica", voltage_kv=0.4),
            Bus(ref_id="nn_other", name="RGnN obcej stacji", voltage_kv=0.4),
        ],
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=[
            Transformer(
                ref_id="tr1",
                name="TR1",
                hv_bus_ref="sn",
                lv_bus_ref="nn_a",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
            ),
            Transformer(
                ref_id="tr2",
                name="TR2",
                hv_bus_ref="sn",
                lv_bus_ref="nn_b",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
            ),
            Transformer(
                ref_id="tr_other",
                name="TR obcej stacji",
                hv_bus_ref="sn",
                lv_bus_ref="nn_other",
                sn_mva=0.4,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=4.5,
                vector_group="Dyn11",
            ),
        ],
        generators=[
            Generator(
                ref_id="pv1",
                name="PV1",
                bus_ref="nn_a",
                p_mw=0.1,
                gen_type="pv_inverter",
                connection_variant="nn_side",
                station_ref="root",
            )
        ],
        loads=[
            Load(ref_id="load_a", name="Odbiór A", bus_ref="nn_a", p_mw=0.05, q_mvar=0.01),
            Load(
                ref_id="load_sub",
                name="Odbiór podrozdzielnicy",
                bus_ref="sub_bus",
                p_mw=0.02,
                q_mvar=0.005,
            ),
        ],
        branches=[
            _switch("coupler", "nn_a", "nn_b", kind="bus_coupler", status="closed"),
            _cable("cable_sub", "nn_b", "sub_bus"),
            _switch("tie_to_other", "nn_b", "nn_other", kind="disconnector", status="open"),
        ],
        substations=[
            Substation(
                ref_id="root",
                name="Stacja ROOT",
                station_type="mv_lv",
                bus_refs=["nn_a", "nn_b"],
                transformer_refs=["tr1", "tr2"],
            ),
            Substation(
                ref_id="sub_station",
                name="Podrozdzielnica",
                station_type="rozdzielnica_nn",
                bus_refs=["sub_bus"],
                transformer_refs=[],
            ),
            Substation(
                ref_id="other_station",
                name="Stacja OBCA",
                station_type="mv_lv",
                bus_refs=["nn_other"],
                transformer_refs=["tr_other"],
            ),
        ],
    )


class TestMultiSourceDomain:
    def test_status_ok(self) -> None:
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "root")
        assert view["status"] == "OK"

    def test_both_transformers_are_domain_sources(self) -> None:
        """2×TR w JEDNEJ stacji, połączone sprzęgłem sekcji — OBA transformatory
        muszą trafić do domeny (WIELOŹRÓDŁOWOŚĆ, żadnego szablonu TR→RGnN)."""
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "root")
        transformer_refs = {t["ref_id"] for t in view["transformers"]}
        assert transformer_refs == {"tr1", "tr2"}

    def test_pv_generator_is_domain_source(self) -> None:
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "root")
        generator_refs = {g["ref_id"] for g in view["generators"]}
        assert generator_refs == {"pv1"}

    def test_coupler_and_both_sections_in_domain(self) -> None:
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "root")
        bus_refs = {b["ref_id"] for b in view["buses"]}
        assert {"nn_a", "nn_b"} <= bus_refs
        branch_refs = {b["ref_id"] for b in view["branches"]}
        assert "coupler" in branch_refs

    def test_sub_switchboard_without_own_transformer_is_absorbed(self) -> None:
        """Podrozdzielnica BEZ własnego transformatora — wchłonięta (jej szyna
        i odbiór wchodzą do domeny), NIE boundary_link."""
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "root")
        bus_refs = {b["ref_id"] for b in view["buses"]}
        assert "sub_bus" in bus_refs
        sub_switchboard_refs = {s["ref_id"] for s in view["sub_switchboards"]}
        assert sub_switchboard_refs == {"sub_station"}
        load_refs = {ld["ref_id"] for ld in view["loads"]}
        assert "load_sub" in load_refs

    def test_boundary_link_to_other_station_with_own_transformer(self) -> None:
        """Wiązanie do OBCEJ stacji Z WŁASNYM transformatorem — boundary_link,
        jej szyna/transformator NIE wchodzą do domeny (nawet gdy łącznik jest
        OTWARTY — topologia domeny nie zależy od stanu łączeniowego)."""
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "root")

        bus_refs = {b["ref_id"] for b in view["buses"]}
        assert "nn_other" not in bus_refs
        transformer_refs = {t["ref_id"] for t in view["transformers"]}
        assert "tr_other" not in transformer_refs

        boundary_links = view["boundary_links"]
        assert len(boundary_links) == 1
        link = boundary_links[0]
        assert link["branch_ref"] == "tie_to_other"
        assert link["from_bus_ref"] == "nn_b"
        assert link["to_bus_ref"] == "nn_other"
        assert link["target_station_ref"] == "other_station"
        assert link["target_station_name"] == "Stacja OBCA"

    def test_other_station_domain_does_not_leak_root_elements(self) -> None:
        """Symetria: patrząc z OBCEJ stacji, ROOT jest boundary_link, nie
        wchłonięciem — dowód, że reguła jest symetryczna, nie jednostronna."""
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "other_station")
        assert view["status"] == "OK"
        bus_refs = {b["ref_id"] for b in view["buses"]}
        assert bus_refs == {"nn_other"}
        boundary_links = view["boundary_links"]
        assert len(boundary_links) == 1
        assert boundary_links[0]["target_station_ref"] == "root"


class TestUnknownStation:
    def test_unknown_station_is_honest(self) -> None:
        enm = _multi_source_with_boundary_fixture()
        view = build_lv_domain_view(enm, "does-not-exist")
        assert view["status"] == "brak danych"
        assert "station" in view["missing_data"]


class TestVoltageLevelId:
    """Mirror frontendu `voltageLevelIdForKv` (`sld/v3/electrical/
    terminalGraph.ts`) — te same pary wartość→string po obu stronach."""

    def test_matches_frontend_format_for_typical_voltages(self) -> None:
        assert voltage_level_id(0.4) == "kv:0.4"
        assert voltage_level_id(15.0) == "kv:15"
        assert voltage_level_id(15.75) == "kv:15.75"
        assert voltage_level_id(6.0) == "kv:6"

    def test_invalid_voltage_is_honest(self) -> None:
        assert voltage_level_id(float("nan")) == "kv:invalid"

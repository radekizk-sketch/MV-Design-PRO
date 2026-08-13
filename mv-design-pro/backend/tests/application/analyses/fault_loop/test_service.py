"""Testy widoku pętli zwarcia nN — dowolny punkt + najdalszy punkt per odpływ
(karta P0.6, G-05)."""

from __future__ import annotations

from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_feeder_fault_loop_view,
    build_station_fault_loop_view,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)


def _base_enm(branches: list, extra_buses: list[str]) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            *[Bus(ref_id=b, name=b, voltage_kv=0.4) for b in extra_buses],
        ],
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
            )
        ],
        branches=branches,
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


def _cable(ref_id: str, from_bus: str, to_bus: str, *, return_r: float, return_x: float) -> Cable:
    return Cable(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        length_km=0.05,
        r_ohm_per_km=0.32,
        x_ohm_per_km=0.08,
        return_conductor_r_ohm_per_km_20c=return_r,
        return_conductor_x_ohm_per_km=return_x,
    )


class TestBuildFaultLoopViewAtPoint:
    def test_point_at_source_matches_station_view(self) -> None:
        """Trasa zerodługościowa (bus_ref = szyna TR) daje TEN SAM wynik co
        widok „u źródła" — jedna ścieżka fizyki, zero duplikacji."""
        enm = _base_enm([], [])
        at_point = build_fault_loop_view_at_point(enm, "stn", "nn")
        at_source = build_station_fault_loop_view(enm, "stn")
        assert at_point["fault_loop"]["z_loop_ohm"] == at_source["fault_loop"]["z_loop_ohm"]

    def test_point_further_down_route_has_larger_impedance(self) -> None:
        enm = _base_enm(
            [_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)],
            ["b1"],
        )
        at_source = build_station_fault_loop_view(enm, "stn")
        at_b1 = build_fault_loop_view_at_point(enm, "stn", "b1")
        assert at_b1["status"] == "OK"
        assert (
            at_b1["fault_loop"]["z_loop_ohm"]["magnitude"]
            > at_source["fault_loop"]["z_loop_ohm"]["magnitude"]
        )
        assert at_b1["hop_count"] == 1
        assert at_b1["route_branch_refs"] == ["c1"]

    def test_unreachable_point_is_honest(self) -> None:
        """Bus istnieje w modelu (LV-INV wymaga ciągłej ścieżki dla aktywnych
        odbiorów, ale sam bus bez odbioru/gałęzi jest dopuszczalny) — brak
        gałęzi kablowej/łącznikowej do niego = uczciwy brak trasy."""
        enm = _base_enm([], ["izolowana"])
        view = build_fault_loop_view_at_point(enm, "stn", "izolowana")
        assert view["status"] == "brak danych"
        # Bus bez ŻADNEGO uziemienia w sieci robi Y-bus osobliwym GLOBALNIE
        # (macierz jednej sieci, nie per-węzeł) — upstream Thevenina zawodzi
        # PIERWSZY, zanim dojdzie do sprawdzenia trasy. To wciąż uczciwy brak
        # (nigdy 500, nigdy fabrykacja) — zob. test_upstream_map_error_is_honest_not_a_crash
        # dla przypadku, gdzie sam graf jest topologicznie niepoprawny.
        assert "upstream_network_singular" in view["missing_data"]

    def test_upstream_map_error_is_honest_not_a_crash(self) -> None:
        """Model topologicznie niepoprawny (dwa węzły SLACK) → uczciwy brak
        danych, NIGDY wyjątek/500 (napotkany defekt karty P0.6: budowa grafu
        rzucała ValueError poza obsługą błędów)."""
        enm = _base_enm([], ["druga_szyna_zrodlowa"])
        enm.sources.append(
            Source(
                ref_id="src2",
                name="Drugie zasilanie",
                bus_ref="druga_szyna_zrodlowa",
                model="thevenin",
                r_ohm=1.0,
                x_ohm=1.0,
            )
        )
        view = build_fault_loop_view_at_point(enm, "stn", "nn")
        assert view["status"] == "brak danych"
        assert "upstream_network_topology_invalid" in view["missing_data"]


class TestTnCVsTnS:
    """Ten sam kabel, różne dane żyły powrotnej → różne Z_loop (§0 test #2)."""

    def test_tn_c_pen_vs_tn_s_pe_give_different_z_loop(self) -> None:
        # TN-C-S/PEN: żyła powrotna = ten sam przekrój co fazowa (typowe PEN).
        enm_pen = _base_enm([_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)], ["b1"])
        # TN-S/PE: żyła powrotna cieńsza (typowe PE, wyższa R).
        enm_pe = _base_enm([_cable("c1", "nn", "b1", return_r=0.64, return_x=0.16)], ["b1"])
        view_pen = build_fault_loop_view_at_point(enm_pen, "stn", "b1")
        view_pe = build_fault_loop_view_at_point(enm_pe, "stn", "b1")
        assert view_pen["status"] == "OK"
        assert view_pe["status"] == "OK"
        assert (
            view_pe["fault_loop"]["z_loop_ohm"]["magnitude"]
            > view_pen["fault_loop"]["z_loop_ohm"]["magnitude"]
        )

    def test_missing_return_conductor_data_fails_closed_not_default(self) -> None:
        enm = _base_enm(
            [
                Cable(
                    ref_id="c1",
                    name="c1",
                    from_bus_ref="nn",
                    to_bus_ref="b1",
                    length_km=0.05,
                    r_ohm_per_km=0.32,
                    x_ohm_per_km=0.08,
                    return_conductor_r_ohm_per_km_20c=None,
                    return_conductor_x_ohm_per_km=None,
                )
            ],
            ["b1"],
        )
        view = build_fault_loop_view_at_point(enm, "stn", "b1")
        assert view["status"] == "brak danych"
        assert "route" in view["missing_data"]
        assert "żyły powrotnej" in view["reason_pl"]


class TestFarthestPointPerFeeder:
    def test_worst_point_is_by_actual_impedance_not_hop_count(self) -> None:
        """Rozgałęzienie: leafA (1 hop, DUŻA impedancja) vs leafB (2 hopy,
        MAŁA impedancja łączna) — wygrywa leafA mimo mniejszej liczby hopów
        (dowód, że ranking liczy Z, nie topologiczną „długość" po hopach)."""
        branches = [
            _cable("c1", "nn", "f", return_r=0.32, return_x=0.08),  # korzeń odpływu
            Cable(
                ref_id="c2a",
                name="c2a",
                from_bus_ref="f",
                to_bus_ref="leafA",
                length_km=0.1,
                r_ohm_per_km=2.0,
                x_ohm_per_km=0.5,
                return_conductor_r_ohm_per_km_20c=2.0,
                return_conductor_x_ohm_per_km=0.5,
            ),
            Cable(
                ref_id="c2b",
                name="c2b",
                from_bus_ref="f",
                to_bus_ref="mid",
                length_km=0.02,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.05,
                return_conductor_r_ohm_per_km_20c=0.1,
                return_conductor_x_ohm_per_km=0.05,
            ),
            Cable(
                ref_id="c3b",
                name="c3b",
                from_bus_ref="mid",
                to_bus_ref="leafB",
                length_km=0.02,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.05,
                return_conductor_r_ohm_per_km_20c=0.1,
                return_conductor_x_ohm_per_km=0.05,
            ),
        ]
        enm = _base_enm(branches, ["f", "leafA", "mid", "leafB"])
        view = build_feeder_fault_loop_view(enm, "stn")
        assert view["status"] == "OK"
        assert len(view["feeders"]) == 1
        feeder = view["feeders"][0]
        assert feeder["feeder_root_branch_ref"] == "c1"
        assert feeder["worst_point_bus_ref"] == "leafA"
        bus_refs = {p["bus_ref"] for p in feeder["points"]}
        assert bus_refs == {"f", "leafA", "mid", "leafB"}

    def test_two_independent_feeders_from_same_station(self) -> None:
        branches = [
            _cable("c1", "nn", "b1", return_r=0.32, return_x=0.08),
            _cable("c2", "nn", "b2", return_r=0.32, return_x=0.08),
        ]
        enm = _base_enm(branches, ["b1", "b2"])
        view = build_feeder_fault_loop_view(enm, "stn")
        assert view["status"] == "OK"
        roots = {f["feeder_root_branch_ref"] for f in view["feeders"]}
        assert roots == {"c1", "c2"}
        for feeder in view["feeders"]:
            assert feeder["worst_point_bus_ref"] is not None
            assert all(p["status"] == "OK" for p in feeder["points"])

    def test_missing_data_on_one_point_does_not_hide_others(self) -> None:
        branches = [
            _cable("c1", "nn", "f", return_r=0.32, return_x=0.08),
            Cable(
                ref_id="c2a",
                name="c2a",
                from_bus_ref="f",
                to_bus_ref="leafA",
                length_km=0.1,
                r_ohm_per_km=0.5,
                x_ohm_per_km=0.2,
                return_conductor_r_ohm_per_km_20c=None,  # brak danych
                return_conductor_x_ohm_per_km=None,
            ),
            Cable(
                ref_id="c2b",
                name="c2b",
                from_bus_ref="f",
                to_bus_ref="leafB",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
            ),
        ]
        enm = _base_enm(branches, ["f", "leafA", "leafB"])
        view = build_feeder_fault_loop_view(enm, "stn")
        feeder = view["feeders"][0]
        by_bus = {p["bus_ref"]: p for p in feeder["points"]}
        assert by_bus["leafA"]["status"] == "brak danych"
        assert by_bus["leafB"]["status"] == "OK"
        assert by_bus["f"]["status"] == "OK"
        # najgorszy punkt liczy się TYLKO spośród policzalnych
        assert feeder["worst_point_bus_ref"] in {"f", "leafB"}


class TestDeterminism:
    def test_two_runs_identical_point_view(self) -> None:
        enm = _base_enm([_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)], ["b1"])
        a = build_fault_loop_view_at_point(enm, "stn", "b1")
        b = build_fault_loop_view_at_point(enm, "stn", "b1")
        assert a == b

    def test_two_runs_identical_feeder_view(self) -> None:
        enm = _base_enm([_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)], ["b1"])
        a = build_feeder_fault_loop_view(enm, "stn")
        b = build_feeder_fault_loop_view(enm, "stn")
        assert a == b

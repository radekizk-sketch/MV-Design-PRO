"""Testy BFS trasy z grafu ENM dla pętli zwarcia nN (karta P0.6, G-05)."""

from __future__ import annotations

import pytest
from application.analyses.fault_loop.route import (
    RouteExtractionError,
    bfs_paths_from,
    feeder_root_branch_ref,
    path_to_bus,
    route_segments,
    route_segments_min_scenario,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    FuseBranch,
    OverheadLine,
    SwitchBranch,
)


def _bus(ref_id: str, voltage_kv: float = 0.4) -> Bus:
    return Bus(ref_id=ref_id, name=ref_id, voltage_kv=voltage_kv)


def _cable(
    ref_id: str,
    from_bus: str,
    to_bus: str,
    *,
    length_km: float = 0.05,
    r_ohm_per_km: float = 0.32,
    x_ohm_per_km: float = 0.08,
    return_r: float | None = 0.32,
    return_x: float | None = 0.08,
    n_parallel: int | None = None,
    status: str = "closed",
    short_circuit_temperature_c: float | None = None,
) -> Cable:
    return Cable(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        length_km=length_km,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        return_conductor_r_ohm_per_km_20c=return_r,
        return_conductor_x_ohm_per_km=return_x,
        n_parallel=n_parallel,
        status=status,
        short_circuit_temperature_c=short_circuit_temperature_c,
    )


def _enm(branches: list, buses: list[str]) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[_bus(b) for b in buses],
        branches=branches,
    )


class TestBfsPathsFrom:
    def test_three_segment_radial_route(self) -> None:
        """Trasa 3-odcinkowa: nn -> b1 -> b2 -> b3, kolejność gałęzi zachowana."""
        enm = _enm(
            [
                _cable("c1", "nn", "b1"),
                _cable("c2", "b1", "b2"),
                _cable("c3", "b2", "b3"),
            ],
            ["nn", "b1", "b2", "b3"],
        )
        paths = bfs_paths_from(enm, "nn")
        assert paths["b3"].hop_count == 3
        assert [b.ref_id for b in paths["b3"].branches] == ["c1", "c2", "c3"]

    def test_open_switch_breaks_path(self) -> None:
        enm = _enm(
            [
                _cable("c1", "nn", "b1"),
                SwitchBranch(
                    ref_id="sw1",
                    name="SW1",
                    type="breaker",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    status="open",
                ),
            ],
            ["nn", "b1", "b2"],
        )
        paths = bfs_paths_from(enm, "nn")
        assert "b2" not in paths

    def test_unknown_root_bus_raises(self) -> None:
        enm = _enm([], ["nn"])
        with pytest.raises(RouteExtractionError):
            bfs_paths_from(enm, "nieznana")


class TestPathToBus:
    def test_unreachable_target_raises(self) -> None:
        enm = _enm([_cable("c1", "nn", "b1")], ["nn", "b1", "izolowana"])
        with pytest.raises(RouteExtractionError):
            path_to_bus(enm, "nn", "izolowana")


class TestRouteSegments:
    def test_missing_return_conductor_r_fails_closed(self) -> None:
        enm = _enm([_cable("c1", "nn", "b1", return_r=None)], ["nn", "b1"])
        path = path_to_bus(enm, "nn", "b1")
        with pytest.raises(RouteExtractionError, match="żyły powrotnej"):
            route_segments(path)

    def test_missing_return_conductor_x_fails_closed(self) -> None:
        enm = _enm([_cable("c1", "nn", "b1", return_x=None)], ["nn", "b1"])
        path = path_to_bus(enm, "nn", "b1")
        with pytest.raises(RouteExtractionError, match="żyły powrotnej"):
            route_segments(path)

    def test_overhead_line_on_route_fails_closed(self) -> None:
        enm = _enm(
            [
                OverheadLine(
                    ref_id="ol1",
                    name="OL1",
                    from_bus_ref="nn",
                    to_bus_ref="b1",
                    length_km=0.1,
                    r_ohm_per_km=0.5,
                    x_ohm_per_km=0.3,
                )
            ],
            ["nn", "b1"],
        )
        path = path_to_bus(enm, "nn", "b1")
        with pytest.raises(RouteExtractionError, match="[Ll]inia napowietrzna"):
            route_segments(path)

    def test_fuse_contributes_zero_impedance(self) -> None:
        enm = _enm(
            [
                _cable("c1", "nn", "b1"),
                FuseBranch(ref_id="f1", name="F1", from_bus_ref="b1", to_bus_ref="b2"),
            ],
            ["nn", "b1", "b2"],
        )
        path = path_to_bus(enm, "nn", "b2")
        segments = route_segments(path)
        assert [s.branch_ref for s in segments] == ["c1"]

    def test_switch_with_explicit_impedance_contributes_phase_only(self) -> None:
        enm = _enm(
            [
                _cable("c1", "nn", "b1"),
                SwitchBranch(
                    ref_id="sw1",
                    name="SW1",
                    type="breaker",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    r_ohm=0.001,
                    x_ohm=0.002,
                ),
            ],
            ["nn", "b1", "b2"],
        )
        path = path_to_bus(enm, "nn", "b2")
        segments = route_segments(path)
        sw_segment = next(s for s in segments if s.branch_ref == "sw1")
        assert sw_segment.phase_total_r_ohm == 0.001
        assert sw_segment.phase_total_x_ohm == 0.002
        assert sw_segment.return_total_r_ohm == 0.0
        assert sw_segment.return_total_x_ohm == 0.0

    def test_n_parallel_carried_through(self) -> None:
        enm = _enm([_cable("c1", "nn", "b1", n_parallel=3)], ["nn", "b1"])
        path = path_to_bus(enm, "nn", "b1")
        segments = route_segments(path)
        assert segments[0].n_parallel == 3

    def test_n_parallel_absent_rowny_jawnemu_1(self) -> None:
        """Karta CI-A (2026-09-04): brak `n_parallel` (None) daje ten sam
        wynik co jawne `n_parallel=1` — odczyt przez `enm.models.liczba_torow`
        (JEDYNA definicja, KLASA NIE INSTANCJA), nie już własne
        `branch.n_parallel or 1` tego modułu."""
        brak = route_segments(
            path_to_bus(_enm([_cable("c1", "nn", "b1")], ["nn", "b1"]), "nn", "b1")
        )
        jawne = route_segments(
            path_to_bus(_enm([_cable("c1", "nn", "b1", n_parallel=1)], ["nn", "b1"]), "nn", "b1")
        )
        assert brak[0].n_parallel == 1
        assert brak[0].n_parallel == jawne[0].n_parallel


class TestRouteSegmentsMinScenario:
    def test_applies_temperature_correction_when_theta_k_known(self) -> None:
        enm = _enm(
            [_cable("c1", "nn", "b1", short_circuit_temperature_c=160.0)],
            ["nn", "b1"],
        )
        path = path_to_bus(enm, "nn", "b1")
        cold = route_segments(path)[0]
        hot = route_segments_min_scenario(path)[0]
        # R_theta = R20*[1+0.004*(160-20)] = R20*1.56 > R20
        assert hot.phase_total_r_ohm == pytest.approx(cold.phase_total_r_ohm * 1.56, rel=1e-9)
        assert hot.return_total_r_ohm == pytest.approx(cold.return_total_r_ohm * 1.56, rel=1e-9)
        # X niezmienione przez korektę temperaturową
        assert hot.phase_total_x_ohm == cold.phase_total_x_ohm
        assert hot.return_total_x_ohm == cold.return_total_x_ohm

    def test_no_correction_without_theta_k(self) -> None:
        enm = _enm(
            [_cable("c1", "nn", "b1", short_circuit_temperature_c=None)],
            ["nn", "b1"],
        )
        path = path_to_bus(enm, "nn", "b1")
        cold = route_segments(path)[0]
        uncorrected = route_segments_min_scenario(path)[0]
        assert uncorrected.phase_total_r_ohm == cold.phase_total_r_ohm
        assert uncorrected.return_total_r_ohm == cold.return_total_r_ohm


class TestFeederRootBranchRef:
    def test_root_itself_has_no_feeder(self) -> None:
        enm = _enm([_cable("c1", "nn", "b1")], ["nn", "b1"])
        paths = bfs_paths_from(enm, "nn")
        assert feeder_root_branch_ref(paths["nn"]) is None

    def test_first_hop_identifies_feeder(self) -> None:
        enm = _enm(
            [
                _cable("c1", "nn", "b1"),
                _cable("c2", "b1", "b2"),
                _cable("c3", "nn", "b3"),
            ],
            ["nn", "b1", "b2", "b3"],
        )
        paths = bfs_paths_from(enm, "nn")
        assert feeder_root_branch_ref(paths["b2"]) == "c1"
        assert feeder_root_branch_ref(paths["b3"]) == "c3"

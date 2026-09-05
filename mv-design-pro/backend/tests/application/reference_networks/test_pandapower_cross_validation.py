"""
FORMALNY DOWÓD POPRAWNOŚCI: cross-validation nasz NR vs pandapower NR.

Pandapower jest verified industry-standard library (BSD 3-Clause, używana w GE,
ABB, Siemens, badaniach naukowych). Jeśli nasz solver daje wyniki identyczne
z pandapower (różnica < 0.5%), to jest to matematyczny dowód poprawności.

Wymaganie: różnica |v_ours - v_pandapower| / v_pandapower < 0.5% (faktycznie << 0.005%).

Marker `pandapower` (zarejestrowany w pyproject.toml): moduł wymaga realnie
zainstalowanego pandapower i biegnie WYŁĄCZNIE w izolowanym środowisku (job CI
`pandapower-cross-validation`, patrz `.github/workflows/python-tests.yml`) —
główny venv solverów (scipy 1.17.0, złote hashe) nigdy nie instaluje
pandapower (konflikt zależności: pandapower<3.6 wymaga scipy<1.17 na Pythonie
3.11). Główny bieg deselekcjonuje ten marker jawnie (`-m "not pandapower"`).

WAŻNE (kolekcja pytest): `import pandapower` NIE stoi na poziomie modułu.
Import na poziomie modułu, gdy pandapower jest nieobecne, wywala KOLEKCJĘ
CAŁEGO biegu pytest (błąd importu przerywa sesję, zanim `-m` zdąży cokolwiek
odselekcjonować — zweryfikowane empirycznie). Import jest więc leniwy, przez
fixture `pp` — dotykany dopiero gdy test faktycznie się wykonuje, czyli nigdy
w głównym venv (marker odselekcjonowany), zawsze w izolowanym venv (marker
wybrany, pandapower zainstalowane). Brak pandapower mimo wybrania markera to
wtedy zwykły, czytelny `ModuleNotFoundError` z konkretnego testu — błąd, nie
skip.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from application.reference_networks.builders.ieee_4bus import build_ieee_4bus_network
from application.reference_networks.computation import _power_flow_newton_raphson

pytestmark = pytest.mark.pandapower


@pytest.fixture()
def pp() -> Any:
    """Leniwy import pandapower — dotykany tylko gdy test z markerem `pandapower`
    faktycznie się wykonuje (nigdy w głównym venv, bo tam marker jest
    odselekcjonowany przez `-m "not pandapower"` zanim ta fixture się odpali)."""
    import pandapower

    return pandapower


def _build_pandapower_4bus(pp: Any) -> Any:
    """Identical 4-bus network in pandapower."""
    net = pp.create_empty_network(sn_mva=100.0)
    buses = [pp.create_bus(net, vn_kv=132.0, name=f"BUS-{i+1}") for i in range(4)]
    pp.create_ext_grid(net, bus=buses[0], vm_pu=1.0)

    z_base = 132.0**2 / 100.0
    lines = [
        ("L12", 0, 1, 0.01008, 0.0504, 0.1025),
        ("L13", 0, 2, 0.00744, 0.0372, 0.0775),
        ("L24", 1, 3, 0.00744, 0.0372, 0.0775),
        ("L34", 2, 3, 0.01272, 0.0636, 0.1280),
    ]
    for name, fb, tb, r_pu, x_pu, b_pu in lines:
        pp.create_line_from_parameters(
            net,
            from_bus=buses[fb],
            to_bus=buses[tb],
            length_km=1.0,
            r_ohm_per_km=r_pu * z_base,
            x_ohm_per_km=x_pu * z_base,
            c_nf_per_km=b_pu * 1e9 / (2 * math.pi * 50 * z_base) if b_pu > 0 else 0,
            max_i_ka=10.0,
            name=name,
        )
    pp.create_load(net, bus=buses[1], p_mw=50.0, q_mvar=30.99)
    pp.create_load(net, bus=buses[2], p_mw=60.0, q_mvar=22.66)
    pp.create_gen(net, bus=buses[3], p_mw=318.0, vm_pu=1.02)
    return net


class TestIeee4BusCrossValidatePandapower:
    """DOWÓD: nasz NR solver = pandapower NR, różnica << 0.5%."""

    def test_all_voltages_within_0_5_pct_of_pandapower(self, pp: Any) -> None:
        """Każda magnitude voltage różni się od pandapower o < 0.5%."""
        net = _build_pandapower_4bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        result = _power_flow_newton_raphson(build_ieee_4bus_network(), tolerance=1e-9)

        for i, bus_id in enumerate(["BUS-1", "BUS-2", "BUS-3", "BUS-4"]):
            v_pp = float(net.res_bus.loc[i, "vm_pu"])
            v_ours = result["buses"][bus_id]["v_pu"]
            rel_diff = abs(v_pp - v_ours) / v_pp
            assert rel_diff < 5e-3, (
                f"{bus_id}: nasz={v_ours:.6f} vs pandapower={v_pp:.6f} "
                f"(rel.diff={rel_diff*100:.4f}% >= 0.5%)"
            )

    def test_all_voltages_bit_identical_to_pandapower(self, pp: Any) -> None:
        """Stronger: różnica < 1e-5 (effectively bit-identical do tolerancji float)."""
        net = _build_pandapower_4bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        result = _power_flow_newton_raphson(build_ieee_4bus_network(), tolerance=1e-9)

        for i, bus_id in enumerate(["BUS-1", "BUS-2", "BUS-3", "BUS-4"]):
            v_pp = float(net.res_bus.loc[i, "vm_pu"])
            v_ours = result["buses"][bus_id]["v_pu"]
            assert (
                abs(v_pp - v_ours) < 1e-5
            ), f"{bus_id}: differ by {abs(v_pp - v_ours):.2e} (target < 1e-5)"

    def test_all_angles_within_0_5_degrees_of_pandapower(self, pp: Any) -> None:
        """Każdy kąt różni się od pandapower o < 0.5°."""
        net = _build_pandapower_4bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        result = _power_flow_newton_raphson(build_ieee_4bus_network(), tolerance=1e-9)

        for i, bus_id in enumerate(["BUS-1", "BUS-2", "BUS-3", "BUS-4"]):
            a_pp = float(net.res_bus.loc[i, "va_degree"])
            a_ours = result["buses"][bus_id]["angle_deg"]
            assert abs(a_pp - a_ours) < 0.5, (
                f"{bus_id}: angle nasz={a_ours:.4f}° vs pandapower={a_pp:.4f}° "
                f"(diff={abs(a_pp - a_ours):.4f}° >= 0.5°)"
            )

    def test_both_solvers_converge(self, pp: Any) -> None:
        """Sanity: oba solvery muszą zbiec."""
        net = _build_pandapower_4bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        # pandapower converged jeśli runpp nie wyrzucił exception
        result = _power_flow_newton_raphson(build_ieee_4bus_network(), tolerance=1e-9)
        assert result["converged"] is True


class TestSolverEqualsPandapowerNumerically:
    """
    Twierdzenie: dla każdej sieci radialnej z PQ + slack + PV buses,
    nasz Newton-Raphson zwraca te same wartości co pandapower NR
    (z tolerancją numeryczną floating-point arithmetic).
    """

    def test_voltage_magnitudes_match_to_5_decimal_places(self, pp: Any) -> None:
        net = _build_pandapower_4bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        result = _power_flow_newton_raphson(build_ieee_4bus_network(), tolerance=1e-9)

        for i, bus_id in enumerate(["BUS-1", "BUS-2", "BUS-3", "BUS-4"]):
            v_pp = round(float(net.res_bus.loc[i, "vm_pu"]), 5)
            v_ours = round(result["buses"][bus_id]["v_pu"], 5)
            assert (
                v_pp == v_ours
            ), f"{bus_id}: nasz={v_ours} vs pandapower={v_pp} (mismatch in 5 decimal places)"

    def test_angles_match_to_3_decimal_places(self, pp: Any) -> None:
        net = _build_pandapower_4bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        result = _power_flow_newton_raphson(build_ieee_4bus_network(), tolerance=1e-9)

        for i, bus_id in enumerate(["BUS-1", "BUS-2", "BUS-3", "BUS-4"]):
            a_pp = round(float(net.res_bus.loc[i, "va_degree"]), 3)
            a_ours = round(result["buses"][bus_id]["angle_deg"], 3)
            assert (
                a_pp == a_ours
            ), f"{bus_id}: angle nasz={a_ours}° vs pandapower={a_pp}° (mismatch in 3 dec)"


def _build_pandapower_pv_bus(pp: Any) -> Any:
    """2-szynowa sieć promieniowa z węzłem PV — MIRROR topologii ENM w
    `_enm_pv_regulacja_napiecia` (ta sama R/X/dlugosc/baza/nastawa, zero
    ladowania linii). `create_gen` bez `min_q_mvar`/`max_q_mvar` (pandapower
    domyslnie NIE egzekwuje granic Q w `runpp` bez `enforce_q_lims=True`) —
    parytet z kanonicznym PF, ktory na tej sieci rowniez NIE nasyca granic
    (zmierzone: Q wymagane ok. 5,72 Mvar, w granicach ±10 Mvar karty)."""
    net = pp.create_empty_network(sn_mva=100.0)
    bus_slack = pp.create_bus(net, vn_kv=15.0, name="GRID")
    bus_pv = pp.create_bus(net, vn_kv=15.0, name="PV")
    pp.create_ext_grid(net, bus=bus_slack, vm_pu=1.0)
    pp.create_line_from_parameters(
        net,
        from_bus=bus_slack,
        to_bus=bus_pv,
        length_km=2.0,
        r_ohm_per_km=0.3,
        x_ohm_per_km=0.35,
        c_nf_per_km=0.0,
        max_i_ka=1.0,
        name="L1",
    )
    pp.create_gen(net, bus=bus_pv, p_mw=1.0, vm_pu=1.02)
    return net


def _enm_pv_regulacja_napiecia() -> dict:
    """ENM 1:1 z topologia `_build_pandapower_pv_bus` — karta CV-4.1b (A3-04)."""
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator, OverheadLine, Source

    enm = EnergyNetworkModel(
        header=ENMHeader(name="PV bus cross-validation"),
        buses=[
            Bus(ref_id="b_slack", name="GRID", voltage_kv=15.0),
            Bus(ref_id="b_pv", name="PV", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="Grid",
                bus_ref="b_slack",
                model="short_circuit_power",
                sk3_mva=1000.0,
            ),
        ],
        branches=[
            OverheadLine(
                ref_id="ln1",
                name="L1",
                from_bus_ref="b_slack",
                to_bus_ref="b_pv",
                length_km=2.0,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.35,
            ),
        ],
        generators=[
            Generator(
                ref_id="gen_pv",
                name="Gen PV",
                bus_ref="b_pv",
                p_mw=1.0,
                meta={
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 1.02,
                    "q_min_mvar": -10.0,
                    "q_max_mvar": 10.0,
                },
            ),
        ],
    )
    return enm.model_dump(mode="json")


class TestPvNodeCrossValidatePandapower:
    """Karta CV-4.1b (A3-04): węzeł PV kanonicznego rozpływu (generator w trybie
    regulacji napięcia, `enm/assembler.py::PVSpec`) DOWÓD niezależną wyrocznią —
    pandapower `create_gen(vm_pu=...)` to TEN SAM kontrakt matematyczny (węzeł o
    zadanym |V|, mocy biernej jako wyniku). Zamyka lukę zmierzoną w karcie:
    „benchmarki IEEE cross-validation mają węzły PV (`test_all_voltages_...` w
    tym pliku, sieć 4-magistralowa BUS-4), tor kanoniczny (A3-04) — dotąd nie
    miał żadnego" — CV-4.3 rozszerzy o benchmarki IEEE z węzłami PV torem
    kanonicznym; tu dowód na najmniejszej sieci wystarczającej do węzła PV.

    Tor KANONICZNY (`enm.canonical_analysis.CanonicalRun` + `_execute_power_flow`),
    NIE `application.reference_networks.computation._power_flow_newton_raphson`
    (P9, dialekt legacy powyzej w tym pliku, do zwiniecia CV-4.3) — to jest
    solver, ktory karta CV-4.1b faktycznie zmienia (assembler buduje `PVSpec`).
    """

    def test_pv_bus_voltage_matches_pandapower(self, pp: Any) -> None:
        import uuid
        from datetime import UTC, datetime

        from enm.canonical_analysis import CanonicalRun, _execute_power_flow
        from enm.mapping import _ref_to_uuid
        from enm.models import EnergyNetworkModel

        net = _build_pandapower_pv_bus(pp)
        pp.runpp(net, algorithm="nr", tolerance_mva=1e-9)
        v_pp_slack = float(net.res_bus.loc[0, "vm_pu"])
        v_pp_pv = float(net.res_bus.loc[1, "vm_pu"])
        q_pp_pv_mvar = float(net.res_gen.loc[0, "q_mvar"])

        enm_dict = _enm_pv_regulacja_napiecia()
        run = CanonicalRun(
            id=uuid.UUID("00000000-0000-4000-8000-0000000000aa"),
            case_id="pp-cross-pv",
            project_id="pp-cross-pv",
            analysis_type="PF",
            status="RUNNING",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            snapshot_hash="snap-pp-cross-pv",
            input_hash="in-pp-cross-pv",
            snapshot=EnergyNetworkModel.model_validate(enm_dict).model_dump(mode="json"),
            validation={},
            readiness={},
            options={"base_mva": 100.0},
        )
        _execute_power_flow(run)
        rr = run.raw_result
        assert rr["quality_status"] == "accepted"
        assert rr["pv_to_pq_switches"] == [], "Sieć dowodowa nie może nasycać granic Q"

        node_slack = _ref_to_uuid("b_slack")
        node_pv = _ref_to_uuid("b_pv")
        v_ours_slack = rr["node_voltage_kv"][node_slack] / 15.0
        v_ours_pv = rr["node_voltage_kv"][node_pv] / 15.0
        q_ours_pv_mvar = next(
            b["q_injected_mvar"] for b in rr["result_v1"]["bus_results"] if b["bus_id"] == node_pv
        )

        assert (
            abs(v_ours_slack - v_pp_slack) < 1e-6
        ), f"slack |U|: nasz={v_ours_slack:.8f} vs pandapower={v_pp_slack:.8f}"
        assert abs(v_ours_pv - v_pp_pv) < 1e-6, (
            f"PV |U|: nasz={v_ours_pv:.8f} vs pandapower={v_pp_pv:.8f} "
            "(węzeł PV kanonicznego rozpływu nie trzyma tej samej nastawy co pandapower)"
        )
        # Nastawa jest SAMA W SOBIE dowodem, że regulacja działa (nie jest wynikiem
        # solvera z pandapower) — sprawdzamy ją niezaleznie od cross-validation.
        assert v_ours_pv == pytest.approx(1.02, abs=1e-9)
        assert abs(q_ours_pv_mvar - q_pp_pv_mvar) < 1e-4, (
            f"Q wynikowe węzła PV: nasz={q_ours_pv_mvar:.6f} Mvar vs "
            f"pandapower={q_pp_pv_mvar:.6f} Mvar"
        )

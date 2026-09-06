"""Tests for the SLD substrate power-flow companion (P-A).

Verifies the FROZEN-solver companion that the SLD render path reads as the ONE
TRUTH for power-flow direction + energization:

  - the production load-flow path runs on the committed substrate ENM and converges;
  - the companion correctly separates an energized set (solver slack-island)
    from a de-energized set (solver not_solved) when one genuinely exists —
    verified on a small dedicated fixture, since the committed substrate's own
    NOP is ring-tied (SUB-52s, 2026-09-04: a topologically stranded stub is
    ENMValidator E003, a defect — the substrate now has ZERO de-energized buses
    by design; see ``sld_substrate_52s.py`` step 5d);
  - per-branch ``flow_direction`` equals ``sign(Re(branch_s_from))`` of the solver;
  - the substrate is genuinely BIDIRECTIONAL (some segments forward, some reverse
    where DER backfeeds upstream);
  - determinism: same ENM -> identical companion;
  - the SECOND (maintenance) companion (E2E-FIX, 2026-09-05): a deterministically
    picked station taken out of service via ``OperatingScenario(kind=MAINTENANCE)``
    (``enm.scenariusze.apply_scenario`` — the one snapshot-with-overrides factory)
    genuinely de-energises that station (and only the stations its
    ``out_of_service`` branches strand); same frozen solver, same schema,
    determinism holds for this second companion too.
"""

from __future__ import annotations

import uuid

import pytest
from application.reference_networks.sld_substrate_power_flow import (
    _build_power_flow_input,
    compute_substrate_power_flow,
    compute_substrate_power_flow_maintenance,
    select_ring_maintenance_scenario,
)
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, Load, Source
from enm.scenariusze import OperatingScenario
from network_model.solvers.power_flow_newton import solve_power_flow_physics

from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

_CASE_REF = "case/test-radial"
_CASE_LABEL = "Test radialny"
_CASE_REF_MAINT = "case/sld-substrate-maintenance-isolated-station"
_CASE_LABEL_MAINT = "Test konserwacji"


@pytest.fixture(scope="module")
def substrate() -> dict:
    return build_sld_substrate_52s()


@pytest.fixture(scope="module")
def companion(substrate: dict) -> dict:
    enm = EnergyNetworkModel.model_validate(substrate["enm"])
    return compute_substrate_power_flow(
        enm,
        case_ref=_CASE_REF,
        case_label=_CASE_LABEL,
        enm_hash=substrate["snapshot_hash"],
    )


@pytest.fixture(scope="module")
def companion_maintenance(substrate: dict) -> dict:
    enm = EnergyNetworkModel.model_validate(substrate["enm"])
    return compute_substrate_power_flow_maintenance(
        enm, case_ref=_CASE_REF_MAINT, case_label=_CASE_LABEL_MAINT
    )


def test_schema_and_case_ref(companion: dict) -> None:
    assert companion["schema"] == "sld_power_flow_companion_v1"
    assert companion["case_ref"] == _CASE_REF
    assert companion["case_label"] == _CASE_LABEL


def test_enm_hash_binds_to_builder(companion: dict, substrate: dict) -> None:
    """The companion carries the builder snapshot hash so the SLD can assert the
    companion belongs to the ENM it renders (one truth, not a stale pairing)."""
    assert companion["enm_hash"] == substrate["snapshot_hash"]


def test_converged(companion: dict) -> None:
    assert companion["converged"] is True
    assert companion["iterations"] > 0


def test_energized_and_de_energized_partition() -> None:
    """The companion must correctly partition energized vs de-energized buses.

    ZMIANA KANONU (SUB-52s, 2026-09-04): this used to read the shared 53-station
    ``companion`` fixture, whose NOP left a downstream stub with NO OTHER path to
    source — that stub was ENMValidator E003 (island, BLOCKER): a defect, not a
    fixture feature (see ``sld_substrate_52s.py`` step 5d — the NOP's lateral is
    now ring-tied to an adjacent feeder, so the substrate has zero de-energized
    buses by design). INTENCJA PRESERVED: verify ``compute_substrate_power_flow``
    still correctly separates energized from de-energized buses when a
    de-energized set genuinely exists (e.g. a switch left open with no ring on
    the far side) — exercised here on a small, dedicated 3-bus ENM built for
    exactly that purpose, decoupled from the substrate's own topology contract.
    """
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Partycja energizacji — test dedykowany"),
        buses=[
            Bus(ref_id="b1", name="GPZ", voltage_kv=15.0),
            Bus(ref_id="b2", name="Stacja zasilana", voltage_kv=15.0),
            Bus(ref_id="b3", name="Stacja za otwartym NO", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src1",
                name="Zrodlo",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
            ),
        ],
        branches=[
            Cable(
                ref_id="cbl-b1-b2",
                name="b1-b2",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=0.2,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                status="closed",
            ),
            Cable(
                ref_id="cbl-b2-b3",
                name="b2-b3 (NO)",
                from_bus_ref="b2",
                to_bus_ref="b3",
                length_km=0.2,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                status="open",
            ),
        ],
        loads=[
            Load(ref_id="ld-b2", name="Odbior b2", bus_ref="b2", p_mw=0.5, q_mvar=0.15),
            Load(ref_id="ld-b3", name="Odbior b3", bus_ref="b3", p_mw=0.3, q_mvar=0.1),
        ],
    )
    companion = compute_substrate_power_flow(
        enm, case_ref="case/test-island", case_label="Test wyspy"
    )
    energized = set(companion["energized_bus_refs"])
    de_energized = set(companion["de_energized_bus_refs"])
    assert energized == {"b1", "b2"}
    assert de_energized == {"b3"}
    assert energized.isdisjoint(de_energized), "a bus cannot be both energized and not"
    assert companion["branch_flow"]["cbl-b2-b3"]["direction"] == "none"


def test_committed_substrate_has_zero_de_energized_buses(companion: dict) -> None:
    """Pin of the SUB-52s fix (2026-09-04): the committed substrate's NOP is
    ring-tied (``sld_substrate_52s.py`` step 5d), so the STATE-NORMAL companion
    has ZERO de-energized buses — a topologically stranded stub would be
    ENMValidator E003, a defect. E2E-FIX (2026-09-05) added a SECOND
    (maintenance) companion precisely because this invariant means the
    normal-state render has no genuine de-energized station to point at
    (``companion_maintenance`` fixture, below, covers that case)."""
    assert companion["de_energized_bus_refs"] == []


def test_open_point_present(companion: dict) -> None:
    """The substrate carries exactly one normally-open point (the NOP)."""
    assert len(companion["open_point_branch_refs"]) >= 1


def test_bidirectional_flow(companion: dict) -> None:
    """The tor is genuinely bidirectional: forward AND reverse segments exist."""
    directions = {ref: entry["direction"] for ref, entry in companion["branch_flow"].items()}
    forward = [ref for ref, d in directions.items() if d == "forward"]
    reverse = [ref for ref, d in directions.items() if d == "reverse"]
    assert forward, "expected forward-flowing branches (GPZ -> stacja)"
    assert reverse, "expected reverse-flowing branches (OZE backfeed upstream)"


def test_direction_matches_solver_sign(companion: dict, substrate: dict) -> None:
    """``flow_direction`` per branch EQUALS sign(Re(branch_s_from)) of the solver.

    Re-runs the frozen solver here and checks the companion did not invent or flip
    any direction — the companion is a faithful projection of the solver result.

    F9.8 note: this used to hand-duplicate the ``PQSpec`` construction inline
    (map ENM -> graph -> PQSpec by hand), which silently carried the SAME
    reversed-sign bug as production (`p_mw=float(node.active_power or 0.0)`
    without the gen->load conversion) — so the test was self-consistent WITH
    the bug and blind to it (both sides negated twice, cancelling out). It now
    reuses the single production input builder (`_build_power_flow_input`,
    already fixed at the PQSpec construction boundary in F9.8) instead of a
    second hand-rolled copy of the sign convention, so this test verifies
    wiring fidelity (does `compute_substrate_power_flow`'s direction/threshold
    logic match a raw re-solve of the SAME correct input) rather than
    re-deriving — and risking re-breaking — the sign convention itself.
    Independent, topology-derived physical proof of the correct sign (not
    dependent on any internal PQSpec convention) lives in
    ``test_shunt_capacitor_d06c.py::test_power_flow_capacitor_raises_bus_voltage``
    (absolute v_pu<1.0 behind an inductive load) and
    ``test_canonical_analysis_api.py::test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct``
    (p_from_mw>0 source->load and v_pu(load)<v_pu(slack) on a minimal,
    hand-verified 2-bus network).

    INTENCJA (DET-9): przedmiotem testu jest PONOWNY BIEG SOLVERA na tym samym
    wejsciu, co towarzysz — nie ponowna budowa substratu. Bierzemy wiec ENM z
    fixture modulu (ten sam, z ktorego policzono `companion`), zamiast budowac
    identyczna siec 53 stacji drugi raz; porownanie kierunkow jest tym samym
    porownaniem, a nawet scislejszym, bo oba boki startuja z DOKLADNIE tego
    samego ENM zamiast z dwoch osobnych, "powinny byc rowne" kopii.
    """
    enm = EnergyNetworkModel.model_validate(substrate["enm"])
    pf_input, _slack = _build_power_flow_input(enm)
    solution = solve_power_flow_physics(pf_input)
    eps = 1.0e-3
    for branch in enm.branches:
        graph_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, branch.ref_id))
        s_from = solution.branch_s_from.get(graph_id)
        expected: str
        if s_from is None:
            expected = "none"
        else:
            p = float(s_from.real) * 100.0
            expected = "forward" if p > eps else "reverse" if p < -eps else "none"
        assert companion["branch_flow"][branch.ref_id]["direction"] == expected, (
            f"direction mismatch on {branch.ref_id}: companion="
            f"{companion['branch_flow'][branch.ref_id]['direction']} solver={expected}"
        )


def test_determinism(companion: dict) -> None:
    """INTENCJA: DWA niezalezne przebiegi (budowa substratu + towarzysz rozplywu)
    daja identycznego towarzysza.

    Bieg A to `companion` z fixture modulu — osobne wywolanie `build_sld_substrate_52s()`
    i osobne `compute_substrate_power_flow()`. Bieg B liczymy tu od zera. Oba boki
    porownania nadal pochodza z rozlacznych wywolan budowniczego i solvera (determinizm
    jest realnie sprawdzany), ale nie liczymy strony A po raz drugi w tym samym module.
    """
    s2 = build_sld_substrate_52s()
    enm2 = EnergyNetworkModel.model_validate(s2["enm"])
    c2 = compute_substrate_power_flow(
        enm2, case_ref=_CASE_REF, case_label=_CASE_LABEL, enm_hash=s2["snapshot_hash"]
    )
    assert companion == c2


# ---- defekt A1: blizniaczy budowniczy nie moze zgubic generacji --------------


def test_zip_split_is_carried_by_the_twin_builder() -> None:
    """Ten budowniczy jest BLIZNIAKIEM `enm.canonical_analysis._execute_power_flow`.

    Rozdzielenie ZIP (baza odbiorowa + czesc stala) musi przechodzic tak samo w
    obu, inaczej ten sam model policzy sie inaczej w rozplywie kanonicznym i w
    towarzyszu SLD. Defekt A1 (przeglad fali 2026-08-01) gubil CALA generacje na
    szynie z odbiorem zaleznym wylacznie od czestotliwosci; kontrakt jest tu
    przypiety na PQSpec, zeby blizniak nie mogl sie cicho rozjechac.
    """
    from tests.enm.test_zip_generation_split import _payload_freq_only

    enm = EnergyNetworkModel.model_validate(_payload_freq_only("Blizniak SLD", p_gen_mw=2.0))
    pf_input, _slack = _build_power_flow_input(enm)
    zip_specs = [s for s in pf_input.pq if s.zip_coeffs is not None]
    assert zip_specs, "szyna ZIP musi trafic do wejscia rozplywu"
    spec = zip_specs[0]
    # Baza ODBIOROWA (3,0 MW) obok mocy WYPADKOWEJ szyny (3,0 - 2,0 = 1,0 MW):
    # bez tego pola solver przemnozylby wielomianem cala moc szyny.
    assert spec.zip_base_p_mw == pytest.approx(3.0)
    assert spec.p_mw == pytest.approx(1.0)

    solution = solve_power_flow_physics(pf_input)
    assert solution.converged
    # Przy f = f0 mnoznik czestotliwosciowy = 1,0 i wielomian napieciowy jest
    # trywialny, wiec moc wstrzyknieta szyny to dokladnie -3,0 + 2,0 = -1,0 MW.
    assert solution.node_p_spec_effective_pu[spec.node_id] * pf_input.base_mva == pytest.approx(
        -1.0, abs=1e-9
    )


# ---- E2E-FIX: druga (konserwacyjna) migawka towarzysza rozplywu -------------


def test_maintenance_schema_and_case_ref(companion_maintenance: dict) -> None:
    assert companion_maintenance["schema"] == "sld_power_flow_companion_v1"
    assert companion_maintenance["case_ref"] == _CASE_REF_MAINT
    assert companion_maintenance["case_label"] == _CASE_LABEL_MAINT


def test_maintenance_converged(companion_maintenance: dict) -> None:
    assert companion_maintenance["converged"] is True
    assert companion_maintenance["iterations"] > 0


def test_maintenance_scenario_field_documents_what_was_taken_out(
    companion_maintenance: dict,
) -> None:
    """WHITE BOX: a de-energised station on this companion must be traceable to
    a NAMED scenario (id + disabled branches + content hash), not left as an
    unexplained topology defect."""
    scenario = companion_maintenance["scenario"]
    assert scenario["scenario_id"].startswith("__maintenance__")
    assert isinstance(scenario["out_of_service"], list)
    assert scenario["out_of_service"], "scenario must disable at least one branch"
    assert len(scenario["out_of_service"]) == len(
        set(scenario["out_of_service"])
    ), "out_of_service must not repeat a branch ref_id"
    assert isinstance(scenario["scenario_hash"], str) and len(scenario["scenario_hash"]) == 64


def test_maintenance_de_energized_is_non_empty(companion_maintenance: dict) -> None:
    """The whole point of the second companion: unlike the state-normal one
    (``test_committed_substrate_has_zero_de_energized_buses``), it MUST carry
    a genuine de-energized set for the render path to point at."""
    assert companion_maintenance[
        "de_energized_bus_refs"
    ], "maintenance companion must de-energise at least one bus"


def test_maintenance_isolated_station_matches_out_of_service(
    substrate: dict, companion_maintenance: dict
) -> None:
    """The station(s) actually de-energized are EXACTLY the ones reachable
    (in the substrate's own topology) only through the scenario's
    ``out_of_service`` branches — proving the picker's own prediction
    (``select_ring_maintenance_scenario``) against the REAL frozen-solver
    result, not just against itself."""
    substations = substrate["enm"]["substations"]
    bus_to_station: dict[str, str] = {}
    for station in substations:
        if "/station" not in station.get("ref_id", ""):
            continue
        for bus_ref in station.get("bus_refs", []):
            bus_to_station[bus_ref] = station["ref_id"]

    de_energized_stations = {
        bus_to_station[ref]
        for ref in companion_maintenance["de_energized_bus_refs"]
        if ref in bus_to_station
    }
    assert de_energized_stations, "de-energized buses must belong to at least one real station"

    disabled_refs = set(companion_maintenance["scenario"]["out_of_service"])
    branches = substrate["enm"]["branches"]
    disabled_endpoint_stations: set[str] = set()
    for branch in branches:
        if branch["ref_id"] not in disabled_refs:
            continue
        for endpoint in (branch.get("from_bus_ref"), branch.get("to_bus_ref")):
            station_ref = bus_to_station.get(endpoint)
            if station_ref:
                disabled_endpoint_stations.add(station_ref)
    # Every station touched by a disabled branch is actually de-energized —
    # the solver's own result confirms the picker's topology-only prediction.
    assert disabled_endpoint_stations, "disabled branches must touch a real station"
    assert disabled_endpoint_stations <= de_energized_stations


def test_maintenance_normal_companion_unaffected(
    companion: dict, companion_maintenance: dict
) -> None:
    """The maintenance companion is a SEPARATE snapshot (``apply_scenario`` on a
    FRESH ``model_dump`` — never a mutation of the committed ENM): computing it
    must not perturb the already-built normal-state companion (module-scoped
    fixture, built once)."""
    assert companion["de_energized_bus_refs"] == []
    assert "scenario" not in companion
    assert companion["case_ref"] == _CASE_REF
    assert companion_maintenance["case_ref"] == _CASE_REF_MAINT


def test_maintenance_determinism() -> None:
    """DET-9 intention (mirrors ``test_determinism`` above): TWO independent
    full builds (substrate + scenario pick + scenario apply + solver) give an
    IDENTICAL maintenance companion, including the picked station/branches."""
    s1 = build_sld_substrate_52s()
    enm1 = EnergyNetworkModel.model_validate(s1["enm"])
    c1 = compute_substrate_power_flow_maintenance(
        enm1, case_ref=_CASE_REF_MAINT, case_label=_CASE_LABEL_MAINT
    )
    s2 = build_sld_substrate_52s()
    enm2 = EnergyNetworkModel.model_validate(s2["enm"])
    c2 = compute_substrate_power_flow_maintenance(
        enm2, case_ref=_CASE_REF_MAINT, case_label=_CASE_LABEL_MAINT
    )
    assert c1 == c2


def test_maintenance_scenario_picker_is_a_pure_function_of_the_enm(substrate: dict) -> None:
    """``select_ring_maintenance_scenario`` on its own (no solver run) is
    deterministic given the same ENM — pinned separately from the full
    companion so a future regression localises to the picker or the solver
    path, not just "something in maintenance changed"."""
    enm = EnergyNetworkModel.model_validate(substrate["enm"])
    scenario_a = select_ring_maintenance_scenario(enm)
    scenario_b = select_ring_maintenance_scenario(enm)
    assert scenario_a.scenario_id == scenario_b.scenario_id
    assert scenario_a.out_of_service == scenario_b.out_of_service
    assert scenario_a.hash == scenario_b.hash


@pytest.mark.parametrize("wariant", ["bez_nadpisan", "tylko_wylaczniki_pol"])
def test_maintenance_refuses_scenario_that_leaves_the_station_energized(
    substrate: dict, monkeypatch: pytest.MonkeyPatch, wariant: str
) -> None:
    """Predykaty parami: wybór stacji (prognoza z grafu gałęzi) i prawda solvera
    (wyspy bez źródła) muszą się zgadzać — rozjazd jest jawnym błędem generatora,
    nie cichym companionem bez przyciemnionej stacji. Dwa warianty rozjazdu:
    scenariusz bez nadpisań (nic nie odłączone — złapałby to sam warunek
    „de_energized niepuste") oraz scenariusz wyłączający WYŁĄCZNIE wyłączniki pól
    tej stacji (odłącza terminale pól, więc `de_energized` jest NIEPUSTE, a szyna
    SN stacji pozostaje zasilona — warunek „niepuste" by to przepuścił)."""
    import application.reference_networks.sld_substrate_power_flow as modul

    enm = EnergyNetworkModel.model_validate(substrate["enm"])
    pelny = select_ring_maintenance_scenario(enm)
    if wariant == "bez_nadpisan":
        nadpisania: tuple[str, ...] = ()
    else:
        nadpisania = tuple(ref for ref in pelny.out_of_service if "/sn_field_breaker/" in ref)
        assert nadpisania, "wybrana stacja substratu ma wyłączniki pól SN"
    rozjechany = OperatingScenario(
        scenario_id=pelny.scenario_id,
        name=pelny.name,
        kind=pelny.kind,
        out_of_service=nadpisania,
    )
    monkeypatch.setattr(modul, "select_ring_maintenance_scenario", lambda _enm: rozjechany)
    with pytest.raises(ValueError, match="nie odlaczyl wybranej stacji"):
        compute_substrate_power_flow_maintenance(
            enm, case_ref=_CASE_REF_MAINT, case_label=_CASE_LABEL_MAINT
        )

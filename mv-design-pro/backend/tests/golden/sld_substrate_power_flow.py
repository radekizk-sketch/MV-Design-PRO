"""Run the FROZEN power-flow solver on the SLD substrate and emit a deterministic
per-branch direction + energization companion for the SLD render path (P-A).

GOVERNING PRINCIPLE (P-A): the SLD is a PROJECTION of the math model — what it
shows MUST equal what the frozen solver computes. This module is the ONE TRUTH
producer: it runs the production load-flow path on the committed substrate ENM and
serialises, per ENM branch ``ref_id``:

  - ``flow_direction``  ∈ {"forward", "reverse", "none"} — sign of the solver's
    active power at the branch "from" end (``Re(branch_s_from)``). "forward" =
    power flows from→to (the ENM branch orientation); "reverse" = power flows
    to→from (e.g. where an OZE source backfeeds upstream); "none" = the branch is
    de-energised (the solver computed no flow because an endpoint is outside the
    slack island).
  - the ENERGIZED SET — buses/branches the solver actually solved (reachable from
    the slack through closed switches). De-energised buses are the solver's
    ``not_solved_nodes`` (e.g. the stub beyond a normally-open point).

READ-ONLY w.r.t. the frozen core (B-01): this only constructs the production
``PowerFlowInput`` (exactly as ``application.canonical_analysis._execute_power_flow``
does) and reads the result. It never modifies ``power_flow_newton*.py`` /
``power_flow_types.py`` / the solver.

Determinism (ZASADA NR 7): same substrate ENM → identical companion (the solver is
deterministic and all outputs are sorted / rounded to a fixed scale). The companion
carries the solver-input hash so the render path can assert it matches the ENM it
renders.

NOT a second truth: the SLD must NOT recompute direction/energization. It reads
THIS companion. ``SupplyPathHighlighter`` (frontend BFS) is a topology-only
approximation with no direction — the companion supersedes it for the substrate.

SECOND (maintenance) companion (E2E-FIX, 2026-09-05): SUB-52s ring-closed the
substrate's only NOP island (``de_energized_bus_refs: []`` in the state-normal
companion above), which left the render-based e2e assert for a de-energised
(dimmed) station with nothing genuine to point at. ``select_ring_maintenance_scenario``
+ ``compute_substrate_power_flow_maintenance`` build a SECOND, companion-shaped
snapshot on an ``OperatingScenario(kind=MAINTENANCE)`` — a station taken out of
service via the closed branches on its BOUNDARY (one end on the station's buses,
``enm.tor_pola.szyny_stacji`` — the same membership the render dims by), through ``enm.scenariusze.apply_scenario``
(the ONE snapshot-with-overrides factory; B-01 — no parallel copy path here,
enforced by ``scripts/scenario_copy_guard.py``). Same frozen solver, same
schema; the ``scenario`` key on the returned dict documents WHAT was taken out
and WHY (WHITE BOX), so a de-energised station on this companion is traceable
to a named scenario, not an accidental topology defect.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any, Literal

import networkx as nx
from enm.assembler import WejscieRozplywu, zloz_wejscie_rozplywu
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu
from enm.pola import poziom_pol
from enm.rozplyw_wysp import scal_rozwiazania_wysp
from enm.scenariusze import OperatingScenario, RodzajScenariusza, apply_scenario
from enm.tor_pola import szyny_stacji
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)

# Production load-flow defaults — identical to canonical_analysis._execute_power_flow.
_BASE_MVA = 100.0
_TOLERANCE = 1e-8
_MAX_ITER = 30
# Active-power magnitude (MVA) below which a branch flow is treated as numerically
# zero (no meaningful direction). 1e-3 MVA = 1 kW — well above solver round-off
# (~1e-12) and well below the smallest real station load (250 kW).
_FLOW_EPS_MVA = 1.0e-3

FlowDirection = Literal["forward", "reverse", "none"]


def _ref_to_graph_id(ref_id: str) -> str:
    """Mirror of ``enm.mapping._ref_to_uuid`` (deterministic, invertible)."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, ref_id))


def rozwiaz_rozplyw(enm: EnergyNetworkModel) -> tuple[WejscieRozplywu, PowerFlowNewtonSolution]:
    """Rozpływ substratu TORem produktu: wejście z assemblera (``zloz_wejscie_rozplywu`` —
    jedna szyna bilansująca na wyspę zasiloną), solver FROZEN na każdej wyspie, scalenie
    ``scal_rozwiazania_wysp`` — to samo, co ``canonical_analysis._execute_power_flow``.

    Karta GPZ-H5-APARATURA: dawny bliźniaczy budowniczy wejścia (jeden SLACK całej sieci,
    własna kopia konwersji PQSpec) był drugą ścieżką tej samej fizyki; przy GPZ H5 z dwoma
    torami 110 kV (§11.1) oznaczał sekcję 110 kV z własnym źródłem jako „bez napięcia”,
    bo liczył wyłącznie pierwszą wyspę. Towarzysz liczy dziś każdą wyspę zasiloną.
    """
    wejscie = zloz_wejscie_rozplywu(
        enm.model_dump(mode="json"),
        {
            "base_mva": _BASE_MVA,
            "tolerance": _TOLERANCE,
            "max_iter": _MAX_ITER,
            "trace_level": "basic",
        },
    )
    rozwiazania = [(wyspa, solve_power_flow_physics(wyspa.pf_input)) for wyspa in wejscie.wyspy]
    return wejscie, scal_rozwiazania_wysp(rozwiazania, wejscie.graph)


def _flow_direction(p_from_mva: float) -> FlowDirection:
    if p_from_mva > _FLOW_EPS_MVA:
        return "forward"
    if p_from_mva < -_FLOW_EPS_MVA:
        return "reverse"
    return "none"


# Fields that ``model_validate`` populates non-deterministically (wall-clock
# timestamps in the header; per-element ``id`` UUID4s). These are NOT part of the
# ENM identity (``ref_id`` is) and are stripped before hashing.
_VOLATILE_HEADER_FIELDS = ("created_at", "updated_at")


def _strip_volatile(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _strip_volatile(v) for k, v in value.items() if k != "id"}
    if isinstance(value, list):
        return [_strip_volatile(item) for item in value]
    return value


def _stable_enm_hash(enm: EnergyNetworkModel) -> str:
    """Deterministic SHA-256 of the ENM topology/physics (fallback identity).

    Used only when the caller does not supply the builder snapshot hash. Strips
    volatile header timestamps and per-element ``id`` UUIDs so the same content
    always hashes identically.
    """
    dumped = enm.model_dump(mode="json")
    header = dumped.get("header")
    if isinstance(header, dict):
        for field in _VOLATILE_HEADER_FIELDS:
            header.pop(field, None)
    canonical = _strip_volatile(dumped)
    raw = json.dumps(canonical, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def compute_substrate_power_flow(
    enm: EnergyNetworkModel,
    *,
    case_ref: str,
    case_label: str,
    enm_hash: str | None = None,
) -> dict[str, Any]:
    """Run the frozen PF solver on the substrate ENM and build the SLD companion.

    Returns a JSON-serialisable dict (the SLD reads this verbatim):

    .. code-block:: text

        {
          "schema": "sld_power_flow_companion_v1",
          "case_ref": "...",            # active state declaration shown on canvas
          "case_label": "...",
          "solver_method": "newton-raphson",
          "converged": true,
          "iterations": 4,
          "base_mva": 100.0,
          "enm_hash": "<builder snapshot hash — binds companion to its ENM>",
          "branch_flow": { "<branch ref_id>": {"direction": "forward|reverse|none",
                                                 "p_from_mw": <float>} },
          "energized_branch_refs": [ ... ],     # solver-solved branches (sorted)
          "energized_bus_refs":    [ ... ],     # slack-island buses (sorted)
          "de_energized_bus_refs": [ ... ],     # not_solved buses (sorted)
          "open_point_branch_refs":[ ... ],     # ENM switch branches with status=open
        }
    """
    _wejscie, solution = rozwiaz_rozplyw(enm)

    # Invert the deterministic ref → graph-id map for buses and branches.
    bus_uuid_to_ref = {_ref_to_graph_id(b.ref_id): b.ref_id for b in enm.buses}
    island = set(solution.slack_island_nodes)
    energized_bus_refs = sorted(
        ref for graph_id, ref in bus_uuid_to_ref.items() if graph_id in island
    )
    de_energized_bus_refs = sorted(
        ref for graph_id, ref in bus_uuid_to_ref.items() if graph_id not in island
    )

    branch_flow: dict[str, dict[str, Any]] = {}
    energized_branch_refs: list[str] = []
    for branch in enm.branches:
        graph_id = _ref_to_graph_id(branch.ref_id)
        s_from = solution.branch_s_from.get(graph_id)
        if s_from is None:
            # Branch is de-energised: the solver omitted it because an endpoint is
            # outside the slack island (e.g. beyond the open NOP). One truth: no
            # flow → no direction.
            branch_flow[branch.ref_id] = {"direction": "none", "p_from_mw": 0.0}
            continue
        p_from_mw = round(float(s_from.real) * _BASE_MVA, 6)
        branch_flow[branch.ref_id] = {
            "direction": _flow_direction(p_from_mw),
            "p_from_mw": p_from_mw,
        }
        energized_branch_refs.append(branch.ref_id)

    open_point_branch_refs = sorted(
        branch.ref_id for branch in enm.branches if getattr(branch, "status", "closed") == "open"
    )

    return {
        "schema": "sld_power_flow_companion_v1",
        "case_ref": case_ref,
        "case_label": case_label,
        "solver_method": str(getattr(solution, "solver_method", "newton-raphson")),
        "converged": bool(solution.converged),
        "iterations": int(solution.iterations),
        "base_mva": _BASE_MVA,
        # Binds the companion to its ENM. The generator passes the builder snapshot
        # hash (== the ENM fixture's header.hash_sha256 / _meta.builder_snapshot_hash)
        # so the SLD can assert the companion belongs to the model it renders. This
        # is the single, deterministic identity (the per-element ``id`` UUIDs that
        # ``model_validate`` mints are volatile and intentionally NOT hashed).
        "enm_hash": enm_hash if enm_hash is not None else _stable_enm_hash(enm),
        "branch_flow": dict(sorted(branch_flow.items())),
        "energized_branch_refs": sorted(energized_branch_refs),
        "energized_bus_refs": energized_bus_refs,
        "de_energized_bus_refs": de_energized_bus_refs,
        "open_point_branch_refs": open_point_branch_refs,
    }


# ---------------------------------------------------------------------------
# Maintenance companion (E2E-FIX): a SECOND, scenario-driven companion so the
# SLD render path has a genuine de-energised station to point at (SUB-52s
# ring-closed the substrate's only NOP island — see module docstring).
# ---------------------------------------------------------------------------


def _energization_graph(dumped_enm: dict[str, Any]) -> nx.MultiGraph:
    """Bus reachability graph mirroring the frozen solver's own slack-island
    definition (``solve_power_flow_physics``'s ``slack_island_nodes``): CLOSED
    branches (cable/line/switch/breaker — anything in the ``branches``
    collection) PLUS transformers (a station's own SN<->LV link, always
    present — this picker never disables a transformer). Used ONLY to PREDICT
    which stations a candidate branch removal would strand; the removal
    itself only ever targets ``branches`` entries (``out_of_service`` — the
    card's "galezie", never a transformer).
    """
    graph = nx.MultiGraph()  # galezie rownolegle licza sie OSOBNO, jak w solverze
    bus_refs = {bus["ref_id"] for bus in dumped_enm.get("buses", [])}
    graph.add_nodes_from(bus_refs)
    for branch in dumped_enm.get("branches", []):
        if branch.get("status") != "closed":
            continue
        from_ref, to_ref = branch.get("from_bus_ref"), branch.get("to_bus_ref")
        if from_ref in bus_refs and to_ref in bus_refs:
            graph.add_edge(from_ref, to_ref, ref_id=branch["ref_id"], kind="branch")
    for transformer in dumped_enm.get("transformers", []):
        hv_ref, lv_ref = transformer.get("hv_bus_ref"), transformer.get("lv_bus_ref")
        if hv_ref in bus_refs and lv_ref in bus_refs:
            graph.add_edge(hv_ref, lv_ref, ref_id=transformer.get("ref_id"), kind="transformer")
    return graph


def _boundary_branch_refs(graph: nx.MultiGraph, station_buses: frozenset[str]) -> tuple[str, ...]:
    """Sorted ref_ids of CLOSED branches (never transformers) CROSSING the station
    boundary — exactly one end among the station's buses (``szyny_stacji``: main
    buses + the station's OWN SN-field terminals + both ends of its nN-field
    apparatus). These are the feeders that bring supply INTO the station (ring /
    lateral cables and lines landing on the field terminals, card POLA-W-TORZE);
    taking all of them out of service takes the WHOLE station out — every bus the
    render counts as the station's (``szynyStacji``) loses supply, not just the
    main SN bus behind opened field breakers."""
    return tuple(
        sorted(
            {
                data["ref_id"]
                for u, v, data in graph.edges(station_buses & set(graph.nodes), data=True)
                if data["kind"] == "branch" and ((u in station_buses) != (v in station_buses))
            }
        )
    )


#: Prefiks identyfikatora (przejsciowego, `__`) scenariusza konserwacji — po nim
#: `compute_substrate_power_flow_maintenance` odczytuje, KTORA stacje wybrano.
_PREFIKS_SCENARIUSZA_KONSERWACJI = "__maintenance__"


def _sprawdz_odlaczenie_stacji(
    enm: EnergyNetworkModel,
    scenario: OperatingScenario,
    de_energized_bus_refs: list[str],
) -> None:
    """Predykaty parami (KLASA NIE INSTANCJA): wybor stacji jest PROGNOZA z grafu
    galezi (`select_ring_maintenance_scenario`), a prawda o zasilaniu nalezy do
    solvera (wyspa bez zrodla -> szyna `not_solved` -> `de_energized_bus_refs`).
    Wybor i ta weryfikacja licza szyny stacji JEDNA regula — `enm.tor_pola.szyny_stacji`,
    ta sama, ktora render (`szynyStacji`, `overlayFromCompanion`) rozstrzyga, czy stacja
    jest przyciemniona. Companion konserwacyjny, w ktorym KTORAKOLWIEK szyna wybranej
    stacji (takze wlasny zacisk pola SN) POZOSTALA zasilona, nie jest „druga migawka z
    odlaczona stacja" — to rozjazd prognozy z solverem (galaz rownolegla, ktorej prognoza
    nie policzyla, albo scenariusz otwierajacy tylko wylaczniki pol, za ktorymi zacisk
    pola liniowego zostaje pod napieciem od kabla). Taki rozjazd ma byc JAWNYM bledem
    generatora, nie cichym companionem bez przyciemnionej stacji (sam warunek
    „de_energized niepuste" tego nie lapie, ani warunek „szyna SN odlaczona": zacisk pola
    zasilony od kabla trzyma stacje w renderze pod napieciem).
    """
    station_ref = scenario.scenario_id.removeprefix(_PREFIKS_SCENARIUSZA_KONSERWACJI)
    if station_ref == scenario.scenario_id:
        raise ValueError(
            "Scenariusz konserwacji bez prefiksu "
            f"{_PREFIKS_SCENARIUSZA_KONSERWACJI!r}: {scenario.scenario_id!r}"
        )
    station = next((s for s in enm.substations if s.ref_id == station_ref), None)
    if station is None:
        raise ValueError(f"Scenariusz konserwacji wskazuje nieznana stacje {station_ref!r}")
    station_buses = szyny_stacji(enm, station)
    if not station_buses:
        raise ValueError(f"Stacja {station_ref!r} scenariusza konserwacji nie ma szyn")
    zasilone = sorted(station_buses - set(de_energized_bus_refs))
    if zasilone:
        raise ValueError(
            "Scenariusz konserwacji nie odlaczyl wybranej stacji od zasilania: szyny "
            f"{zasilone!r} stacji {station_ref!r} (z {len(station_buses)} szyn stacji wg "
            "szyny_stacji) pozostaly zasilone po biegu solvera (odlaczonych szyn: "
            f"{len(de_energized_bus_refs)}, wylaczone galezie: "
            f"{list(scenario.out_of_service)!r}) — prognoza wyboru z grafu galezi "
            "rozjechala sie z prawda solvera."
        )


def select_ring_maintenance_scenario(enm: EnergyNetworkModel) -> OperatingScenario:
    """Deterministically pick ONE ring station to take out of service (E2E-FIX §0.B/§0.C).

    The station's buses are the ONE membership rule ``enm.tor_pola.szyny_stacji``
    (main buses + the station's OWN SN-field terminals + both ends of its nN-field
    apparatus) — the SAME rule the render uses to dim a station and the SAME rule
    ``_sprawdz_odlaczenie_stacji`` verifies against the solver (predykaty parami).
    The branches taken out of service are the station's BOUNDARY branches
    (``_boundary_branch_refs``: closed branches with exactly one end on the
    station's buses — the feeders landing on its field terminals, card
    POLA-W-TORZE). Opening only the station's own field breakers is NOT a station
    outage: the incoming-field terminal stays live from the ring cable, so the
    render (correctly) keeps that station energised.

    Decision (card E2E-FIX, binding):

      (B, primary) The FIRST station (``ref_id`` lexical order — a content
      hash, so this is a property of the substrate's DATA, not its build
      order) whose boundary is exactly TWO branches (a ring station: IN and OUT
      feeder) and whose removal strands EXACTLY that one station's own buses,
      nothing else (no other station loses any bus).

      (C, fallback) No station qualifies for (B): take the SMALLEST-boundary
      station (ref_id tie-break) and disable ALL its boundary branches. This
      CAN strand more than that one station when it sits mid-lateral
      (documented, not hidden — the ``scenario`` field the caller attaches to
      the companion, and this docstring, both say so).

    KLASA NIE INSTANCJA: this walks the substrate's OWN graph structure (no
    hardcoded station/branch ref — a future rebuild of the fixture re-derives
    its own deterministic answer from the same rule).
    """
    dumped = enm.model_dump(mode="json")
    graph = _energization_graph(dumped)
    source_bus_refs = {
        source["bus_ref"] for source in dumped.get("sources", []) if source.get("bus_ref")
    }
    if not source_bus_refs:
        raise ValueError(
            "Substrat bez zrodla (sources) -- scenariusz konserwacji niemozliwy do wyznaczenia."
        )
    stations = sorted(
        (s for s in enm.substations if "/station" in s.ref_id),
        key=lambda s: s.ref_id,
    )
    if not stations:
        raise ValueError(
            "Substrat bez stacji ('/station') -- scenariusz konserwacji niemozliwy do wyznaczenia."
        )
    poziom = poziom_pol(enm)
    station_buses = {s.ref_id: szyny_stacji(enm, s, poziom) for s in stations}
    bus_to_stations: dict[str, set[str]] = {}
    for station_ref, buses in station_buses.items():
        for bus_ref in buses:
            bus_to_stations.setdefault(bus_ref, set()).add(station_ref)
    station_name_by_ref = {s.ref_id: nazwa_elementu(s, "substations") for s in stations}

    def stranded_buses_if_removed(branch_ref_ids: tuple[str, ...]) -> frozenset[str]:
        """Buses left with NO path to any source once ``branch_ref_ids`` are removed.
        Transformers are never removed."""
        removed = set(branch_ref_ids)
        probe = graph.copy()
        probe.remove_edges_from(
            [
                (u, v, key)
                for u, v, key, data in graph.edges(keys=True, data=True)
                if data["kind"] == "branch" and data["ref_id"] in removed
            ]
        )
        stranded: set[str] = set()
        for component in nx.connected_components(probe):
            if not component & source_bus_refs:
                stranded.update(component)
        return frozenset(stranded)

    def scenario_for(
        station_ref: str, branch_ref_ids: tuple[str, ...], *, reason: str
    ) -> OperatingScenario:
        return OperatingScenario(
            scenario_id=f"{_PREFIKS_SCENARIUSZA_KONSERWACJI}{station_ref}",
            name=f"Wylaczenie stacji {station_name_by_ref[station_ref]} do konserwacji ({reason})",
            kind=RodzajScenariusza.MAINTENANCE,
            out_of_service=branch_ref_ids,
        )

    boundaries = {ref: _boundary_branch_refs(graph, buses) for ref, buses in station_buses.items()}

    # (B) primary: exactly-two-branch, single-station isolation.
    for station in stations:
        boundary = boundaries[station.ref_id]
        if len(boundary) != 2:
            continue
        stranded = stranded_buses_if_removed(boundary)
        touched = set().union(*(bus_to_stations.get(b, set()) for b in stranded))
        if station_buses[station.ref_id] <= stranded and touched == {station.ref_id}:
            return scenario_for(
                station.ref_id, boundary, reason="2 galezie pierscienia na granicy stacji"
            )

    # (C) fallback: smallest-boundary station, ref_id tie-break, ALL its boundary branches.
    smallest: tuple[str, tuple[str, ...]] | None = None
    for station in stations:
        boundary = boundaries[station.ref_id]
        if not boundary:
            continue
        if smallest is None or len(boundary) < len(smallest[1]):
            smallest = (station.ref_id, boundary)
    if smallest is None:
        raise ValueError(
            "Substrat bez stacji z galezia SN na granicy -- fallback §0.C "
            "rowniez nie wyznaczyl scenariusza konserwacji."
        )
    station_ref, boundary = smallest
    return scenario_for(
        station_ref,
        boundary,
        reason=(
            f"wszystkie {len(boundary)} galezi na granicy stacji -- substrat nie ma stacji "
            "izolowalnej dwiema galeziami"
        ),
    )


def compute_substrate_power_flow_maintenance(
    enm: EnergyNetworkModel,
    *,
    case_ref: str,
    case_label: str,
) -> dict[str, Any]:
    """Build the SECOND (ring-maintenance) SLD companion (E2E-FIX).

    ONE TRUTH producer for the maintenance case the SLD reads
    (``?case=maintenance`` in the screenshot harness / render path): picks a
    station deterministically (``select_ring_maintenance_scenario``), applies
    it through ``enm.scenariusze.apply_scenario`` — the ONLY snapshot-with-
    overrides factory (B-01; ``scripts/scenario_copy_guard.py`` forbids a
    parallel copy path in ``application/**``) — and runs the SAME frozen
    solver path as the normal-state companion (``compute_substrate_power_flow``)
    on the resulting effective snapshot. The chosen station's scenario
    (id / disabled branches / content hash) is carried on the returned dict's
    ``scenario`` key: WHITE BOX — a de-energised station on this companion is
    traceable to a named scenario, never an unexplained topology defect.
    """
    scenario = select_ring_maintenance_scenario(enm)
    effective = apply_scenario(enm, scenario)
    enm_for_scenario = EnergyNetworkModel.model_validate(effective.snapshot)
    companion = compute_substrate_power_flow(
        enm_for_scenario,
        case_ref=case_ref,
        case_label=case_label,
        enm_hash=effective.snapshot_hash,
    )
    _sprawdz_odlaczenie_stacji(enm, scenario, companion["de_energized_bus_refs"])
    companion["scenario"] = {
        "scenario_id": scenario.scenario_id,
        "out_of_service": list(scenario.out_of_service),
        "scenario_hash": scenario.hash,
    }
    return companion

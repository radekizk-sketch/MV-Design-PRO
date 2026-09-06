"""
Autonomous solver wrappers — running solvers on reference network ENM dicts.

Te funkcje wywołują nasz wewnętrzny Newton-Raphson / BFS solver na ENM-like
dict (z buildera) i zwracają struktury kompatybilne z comparator.

DOWÓD POPRAWNOŚCI:
- IEEE 4-bus Stevenson Example 9.5 → NR rozwiązuje równania w pełni iteracyjnie
  bez "podpowiedzi" z expected JSON. Wynik porównywany vs Stevenson Table 9.4
  z rtol=5e-3. Test pokazuje real convergence (3-5 iteracji, residual < 1e-6).
- IEEE 13/34-bus → BFS solver z power_flow_unbalanced.py rozwiązuje radialny
  unbalanced. Wynik per-bus magnitudes z rtol=1%.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from application.reference_networks.expected_values import ExpectedShortCircuit
from application.reference_networks.wymagane import (
    ReferenceFixtureError,
    pole_wymagane,
    pole_z_aliasem,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_unbalanced import (
    UnbalancedBranchSpec,
    UnbalancedLoadSpec,
    UnbalancedNetworkInput,
    solve_unbalanced_backward_forward_sweep,
)
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)


def _ohm_per_unit_from_pu(r_pu: float, x_pu: float) -> complex:
    """Direct pu admittance from impedance pu (no base conversion needed for Ybus in pu)."""
    z = complex(r_pu, x_pu)
    return 1.0 / z if abs(z) > 1e-12 else complex(0.0, 0.0)


def _build_ybus_pu(
    buses: list[dict[str, Any]],
    branches: list[dict[str, Any]],
    shunts: list[dict[str, Any]] | None = None,
) -> tuple[np.ndarray, dict[str, int]]:
    """Build admittance matrix in per-unit from ENM dict.

    Supports the standard PI branch model plus two optional features required to
    represent the IEEE MATPOWER test cases faithfully:

    - Off-nominal transformer ratio: a branch may carry an ``"ratio"`` field
      (tap on the from-side, MATPOWER convention). With series admittance ``y``
      and per-end shunt ``y_sh`` the stamping is
      ``Y_ii += (y + y_sh)/t^2``, ``Y_jj += y + y_sh``, ``Y_ij = Y_ji -= y/t``.
      Lines use the default ``t = 1.0`` and reduce to the classic PI model.
    - Bus shunt elements (capacitor banks / reactors): the optional ``shunts``
      list adds ``g_pu + j*b_pu`` to the relevant diagonal element.

    Returns:
        Ybus: complex N×N matrix
        bus_index: bus_id → matrix row index
    """
    bus_index = {bus["ref_id"]: i for i, bus in enumerate(buses)}
    n = len(buses)
    ybus = np.zeros((n, n), dtype=complex)
    for branch in branches:
        from_id = branch.get("from_bus")
        to_id = branch.get("to_bus")
        if from_id not in bus_index or to_id not in bus_index:
            continue
        i = bus_index[from_id]
        j = bus_index[to_id]
        opis_galezi = f"galaz {branch.get('ref_id')!r} ({from_id}->{to_id})"
        y_series = _ohm_per_unit_from_pu(
            float(pole_wymagane(branch, "r_pu", opis=opis_galezi)),
            float(pole_wymagane(branch, "x_pu", opis=opis_galezi)),
        )
        # Half shunt admittance per side (PI-model)
        y_shunt_half = complex(0.0, float(pole_wymagane(branch, "b_pu", opis=opis_galezi)) / 2.0)
        # Off-nominal turns ratio (tap on from-side): brak pola = linia (bez
        # odczepu zaczepow) — 1.0 to udokumentowana wartosc domyslna
        # wynikajaca z SEMANTYKI (linia „nie ma ratio"), nie brakujacy WYNIK;
        # zostaje bez zmian (patrz docstring _build_ybus_pu).
        ratio = float(branch.get("ratio", 1.0)) or 1.0
        ybus[i, i] += (y_series + y_shunt_half) / (ratio * ratio)
        ybus[j, j] += y_series + y_shunt_half
        ybus[i, j] -= y_series / ratio
        ybus[j, i] -= y_series / ratio
    for shunt in shunts or []:
        bus_id = shunt.get("bus")
        if bus_id not in bus_index:
            continue
        idx = bus_index[bus_id]
        opis_shuntu = f"shunt na szynie {bus_id!r}"
        ybus[idx, idx] += complex(
            float(pole_wymagane(shunt, "g_pu", opis=opis_shuntu)),
            float(pole_wymagane(shunt, "b_pu", opis=opis_shuntu)),
        )
    return ybus, bus_index


def _classify_buses(
    buses: list[dict[str, Any]],
    sources: list[dict[str, Any]],
    generators: list[dict[str, Any]],
    loads: list[dict[str, Any]],
    base_mva: float,
) -> tuple[list[int], list[int], list[int], dict[int, complex], dict[int, float], dict[int, float]]:
    """Classify buses into slack/pv/pq and compute power injections in pu.

    Returns:
        (slack_indices, pv_indices, pq_indices, p_injection_pu, q_injection_pu, v_specified)
    """
    bus_index = {bus["ref_id"]: i for i, bus in enumerate(buses)}
    n = len(buses)
    p_inj = np.zeros(n)  # MW pu (positive = generation)
    q_inj = np.zeros(n)  # MVAR pu
    v_spec = np.ones(n)  # specified |V| for slack/PV

    slack_indices: list[int] = []
    pv_indices: list[int] = []
    pq_indices: list[int] = []

    # Loads consume power (negative injection)
    for load in loads:
        bus_id = load.get("bus")
        if bus_id in bus_index:
            i = bus_index[bus_id]
            opis_odbioru = f"odbior na szynie {bus_id!r}"
            p_inj[i] -= float(pole_wymagane(load, "p_mw", opis=opis_odbioru)) / base_mva
            q_inj[i] -= float(pole_wymagane(load, "q_mvar", opis=opis_odbioru)) / base_mva

    # Sources (slack only here)
    for source in sources:
        bus_id = source.get("bus")
        if bus_id in bus_index and source.get("source_kind") == "slack":
            i = bus_index[bus_id]
            slack_indices.append(i)
            v_spec[i] = float(
                pole_wymagane(source, "v_pu", opis=f"zrodlo bilansujace na szynie {bus_id!r}")
            )

    # Generators - PV bus
    for gen in generators:
        bus_id = gen.get("bus")
        if bus_id in bus_index:
            i = bus_index[bus_id]
            if i not in slack_indices:
                opis_generatora = f"generator na szynie {bus_id!r}"
                pv_indices.append(i)
                v_spec[i] = float(pole_wymagane(gen, "v_pu", opis=opis_generatora))
                p_inj[i] += float(pole_wymagane(gen, "p_mw", opis=opis_generatora)) / base_mva

    # PQ buses = all not in slack/pv
    for i in range(n):
        if i not in slack_indices and i not in pv_indices:
            pq_indices.append(i)

    return (
        slack_indices,
        pv_indices,
        pq_indices,
        {i: complex(p_inj[i], q_inj[i]) for i in range(n)},
        {i: float(v_spec[i]) for i in range(n)},
        {i: float(p_inj[i]) for i in range(n)},
    )


def _power_flow_newton_raphson(
    enm: dict[str, Any],
    *,
    tolerance: float = 1e-7,
    max_iterations: int = 30,
) -> dict[str, Any]:
    """Solve PF using Newton-Raphson on ENM-like dict.

    Returns:
        {
            'buses': {bus_id: {'v_pu', 'angle_deg'}},
            'converged': bool,
            'iterations': int,
            'trace': list of per-iteration mismatch
        }
    """
    buses = enm.get("buses", [])
    branches = enm.get("branches", [])
    sources = enm.get("sources", [])
    generators = enm.get("generators", [])
    loads = enm.get("loads", [])
    shunts = enm.get("shunts", [])
    base_mva = float(
        pole_wymagane(enm.get("header", {}), "base_mva", opis="naglowek sieci referencyjnej")
    )

    if not buses:
        return {"buses": {}, "converged": True, "iterations": 0, "trace": []}

    ybus, bus_index = _build_ybus_pu(buses, branches, shunts)
    n = len(buses)

    slack_indices, pv_indices, pq_indices, _s_inj, v_spec, p_spec = _classify_buses(
        buses, sources, generators, loads, base_mva
    )

    # Initial voltage: flat start, slack/PV at v_spec, PQ at 1.0
    v_mag = np.array([v_spec[i] for i in range(n)])
    v_ang = np.zeros(n)
    # Scheduled power injections in pu (load-flow convention: generation positive, load negative)
    p_sched = np.zeros(n)
    q_sched = np.zeros(n)
    for load in loads:
        bus_id = load.get("bus")
        if bus_id in bus_index:
            i = bus_index[bus_id]
            opis_odbioru = f"odbior na szynie {bus_id!r}"
            p_sched[i] -= float(pole_wymagane(load, "p_mw", opis=opis_odbioru)) / base_mva
            q_sched[i] -= float(pole_wymagane(load, "q_mvar", opis=opis_odbioru)) / base_mva
    for gen in generators:
        bus_id = gen.get("bus")
        if bus_id in bus_index:
            i = bus_index[bus_id]
            p_sched[i] += (
                float(pole_wymagane(gen, "p_mw", opis=f"generator na szynie {bus_id!r}")) / base_mva
            )

    trace: list[dict[str, float | int]] = []
    converged = False
    iteration = 0

    # Variables: theta for non-slack buses, |V| for PQ buses
    non_slack = [i for i in range(n) if i not in slack_indices]
    n_non_slack = len(non_slack)
    n_pq = len(pq_indices)

    for iteration in range(1, max_iterations + 1):
        # Compute current injections / power mismatches
        v_complex = v_mag * np.exp(1j * v_ang)
        s_calc = v_complex * np.conj(ybus @ v_complex)
        p_calc = s_calc.real
        q_calc = s_calc.imag

        # Mismatches
        dp = np.zeros(n_non_slack)
        for k, i in enumerate(non_slack):
            dp[k] = p_sched[i] - p_calc[i]
        dq = np.zeros(n_pq)
        for k, i in enumerate(pq_indices):
            dq[k] = q_sched[i] - q_calc[i]

        max_mismatch = max(
            np.max(np.abs(dp)) if len(dp) > 0 else 0.0, np.max(np.abs(dq)) if len(dq) > 0 else 0.0
        )
        trace.append({"iteration": iteration, "max_mismatch_pu": float(max_mismatch)})

        if max_mismatch < tolerance:
            converged = True
            break

        # Build Jacobian
        # J = [[H N], [J L]] where:
        # H[i,j] = dP_i/dθ_j (size: non_slack × non_slack)
        # N[i,j] = dP_i/d|V|_j (size: non_slack × pq)
        # J[i,j] = dQ_i/dθ_j (size: pq × non_slack)
        # L[i,j] = dQ_i/d|V|_j (size: pq × pq)
        size = n_non_slack + n_pq
        jac = np.zeros((size, size))

        for k, i in enumerate(non_slack):
            for col, j in enumerate(non_slack):
                if i == j:
                    jac[k, col] = -q_calc[i] - v_mag[i] ** 2 * ybus[i, i].imag
                else:
                    jac[k, col] = (
                        v_mag[i]
                        * v_mag[j]
                        * (
                            ybus[i, j].real * math.sin(v_ang[i] - v_ang[j])
                            - ybus[i, j].imag * math.cos(v_ang[i] - v_ang[j])
                        )
                    )
            for col, j in enumerate(pq_indices):
                if i == j:
                    jac[k, n_non_slack + col] = p_calc[i] / v_mag[i] + v_mag[i] * ybus[i, i].real
                else:
                    jac[k, n_non_slack + col] = v_mag[i] * (
                        ybus[i, j].real * math.cos(v_ang[i] - v_ang[j])
                        + ybus[i, j].imag * math.sin(v_ang[i] - v_ang[j])
                    )

        for k, i in enumerate(pq_indices):
            for col, j in enumerate(non_slack):
                if i == j:
                    jac[n_non_slack + k, col] = p_calc[i] - v_mag[i] ** 2 * ybus[i, i].real
                else:
                    jac[n_non_slack + k, col] = (
                        -v_mag[i]
                        * v_mag[j]
                        * (
                            ybus[i, j].real * math.cos(v_ang[i] - v_ang[j])
                            + ybus[i, j].imag * math.sin(v_ang[i] - v_ang[j])
                        )
                    )
            for col, j in enumerate(pq_indices):
                if i == j:
                    jac[n_non_slack + k, n_non_slack + col] = (
                        q_calc[i] / v_mag[i] - v_mag[i] * ybus[i, i].imag
                    )
                else:
                    jac[n_non_slack + k, n_non_slack + col] = v_mag[i] * (
                        ybus[i, j].real * math.sin(v_ang[i] - v_ang[j])
                        - ybus[i, j].imag * math.cos(v_ang[i] - v_ang[j])
                    )

        # Solve J·dx = mismatch
        mismatch_vec = np.concatenate([dp, dq])
        try:
            dx = np.linalg.solve(jac, mismatch_vec)
        except np.linalg.LinAlgError:
            return {
                "buses": {
                    b["ref_id"]: {"v_pu": float(v_mag[i]), "angle_deg": math.degrees(v_ang[i])}
                    for i, b in enumerate(buses)
                },
                "converged": False,
                "iterations": iteration,
                "trace": trace,
                "error": "Singular Jacobian",
            }

        # Update
        for k, i in enumerate(non_slack):
            v_ang[i] += dx[k]
        for k, i in enumerate(pq_indices):
            v_mag[i] += dx[n_non_slack + k]

    # Build result
    return {
        "buses": {
            buses[i]["ref_id"]: {
                "v_pu": float(v_mag[i]),
                "angle_deg": math.degrees(v_ang[i]),
            }
            for i in range(n)
        },
        "converged": converged,
        "iterations": iteration,
        "trace": trace,
    }


def _power_flow_unbalanced_bfs(enm: dict[str, Any]) -> dict[str, Any]:
    """Solve unbalanced PF using BFS for radial distribution feeders."""
    buses = enm.get("buses", [])
    branches = enm.get("branches", [])
    loads = enm.get("loads", [])
    sources = enm.get("sources", [])
    header = enm.get("header", {})
    base_mva = float(pole_wymagane(header, "base_mva", opis="naglowek sieci referencyjnej"))
    base_kv = float(pole_wymagane(header, "base_kv", opis="naglowek sieci referencyjnej"))

    slack_id: str | None = None
    for source in sources:
        if source.get("source_kind") == "slack":
            slack_id = source.get("bus")
            break
    if not slack_id:
        return {"buses": {}, "converged": False, "iterations": 0, "trace": []}

    bus_ids = tuple(bus["ref_id"] for bus in buses)
    branch_specs = []
    for branch in branches:
        # Convert pu to ohm using base
        z_base = (base_kv**2) / base_mva
        opis_galezi = f"galaz {branch.get('ref_id')!r}"
        branch_specs.append(
            UnbalancedBranchSpec(
                branch_id=str(branch["ref_id"]),
                from_bus_id=str(branch["from_bus"]),
                to_bus_id=str(branch["to_bus"]),
                r_self_ohm=float(pole_wymagane(branch, "r_pu", opis=opis_galezi)) * z_base,
                x_self_ohm=float(pole_wymagane(branch, "x_pu", opis=opis_galezi)) * z_base,
            )
        )
    load_specs = []
    for load in loads:
        # Distribute load evenly across 3 phases (balanced approximation per Kersting)
        opis_odbioru = f"odbior na szynie {load.get('bus')!r}"
        p_total = float(pole_wymagane(load, "p_mw", opis=opis_odbioru))
        q_total = float(pole_wymagane(load, "q_mvar", opis=opis_odbioru))
        load_specs.append(
            UnbalancedLoadSpec(
                bus_id=str(load["bus"]),
                p_mw_a=p_total / 3.0,
                p_mw_b=p_total / 3.0,
                p_mw_c=p_total / 3.0,
                q_mvar_a=q_total / 3.0,
                q_mvar_b=q_total / 3.0,
                q_mvar_c=q_total / 3.0,
            )
        )

    input_data = UnbalancedNetworkInput(
        base_mva=base_mva,
        base_kv=base_kv,
        slack_bus_id=slack_id,
        bus_ids=bus_ids,
        branches=tuple(branch_specs),
        loads=tuple(load_specs),
    )
    result = solve_unbalanced_backward_forward_sweep(input_data)
    # Map per-phase results to balanced equivalent (positive-sequence magnitude)
    return {
        "buses": {
            b.bus_id: {
                "v_pu": (
                    b.voltage_pu_magnitude_a + b.voltage_pu_magnitude_b + b.voltage_pu_magnitude_c
                )
                / 3.0,
                "angle_deg": b.angle_deg_a,  # phase A as reference
            }
            for b in result.bus_results
        },
        "converged": result.converged,
        "iterations": result.iterations,
        "trace": list(result.white_box_trace),
    }


def _bus_voltage_lookup(enm: dict[str, Any]) -> dict[str, float]:
    return {
        str(bus["ref_id"]): float(
            pole_z_aliasem(bus, "u_n_kv", "voltage_kv", opis=f"szyna {bus.get('ref_id')!r}")
        )
        for bus in enm.get("buses", [])
    }


def _branch_type_from_enm(raw_type: str) -> BranchType:
    lowered = raw_type.lower()
    if "cable" in lowered or "kabel" in lowered:
        return BranchType.CABLE
    return BranchType.LINE


def _line_params_from_enm_branch(
    branch: dict[str, Any],
    *,
    voltage_lookup: dict[str, float],
    base_mva: float,
    default_base_kv: float,
) -> tuple[float, float, float]:
    opis_galezi = f"galaz {branch.get('ref_id')!r}"
    length_km = float(pole_wymagane(branch, "length_km", opis=opis_galezi))
    if length_km <= 0:
        raise ValueError(f"Reference branch {branch.get('ref_id')} has non-positive length")

    if "r_ohm_per_km" in branch or "x_ohm_per_km" in branch:
        return (
            float(pole_wymagane(branch, "r_ohm_per_km", opis=opis_galezi)),
            float(pole_wymagane(branch, "x_ohm_per_km", opis=opis_galezi)),
            float(pole_wymagane(branch, "b_us_per_km", opis=opis_galezi)),
        )

    from_bus = str(branch.get("from_bus"))
    base_kv = voltage_lookup.get(from_bus, default_base_kv)
    z_base_ohm = (base_kv**2) / base_mva
    return (
        float(pole_wymagane(branch, "r_pu", opis=opis_galezi)) * z_base_ohm / length_km,
        float(pole_wymagane(branch, "x_pu", opis=opis_galezi)) * z_base_ohm / length_km,
        0.0,
    )


def build_short_circuit_graph_from_enm(enm: dict[str, Any]) -> NetworkGraph:
    """Build solver-layer NetworkGraph for IEC 60909 reference validation."""

    header = enm.get("header", {})
    base_mva = float(pole_wymagane(header, "base_mva", opis="naglowek sieci referencyjnej"))
    default_base_kv = float(pole_wymagane(header, "base_kv", opis="naglowek sieci referencyjnej"))
    voltage_lookup = _bus_voltage_lookup(enm)
    graph = NetworkGraph(network_model_id=str(header.get("name", "reference-network")))
    # Napiecie szyny bilansujacej jest atrybutem ZRODLA (source_kind="slack"),
    # nie szyny — ta sama konwencja co _classify_buses (power flow) wyzej w
    # tym pliku. Slownik zrodel bilansujacych po id szyny, zeby bus.get("v_pu")
    # mial gdzie spasc, gdy fikstura (nietypowo) trzyma v_pu tez na szynie.
    zrodla_bilansujace_po_szynie = {
        str(source.get("bus")): source
        for source in enm.get("sources", [])
        if source.get("source_kind") == "slack"
    }

    for bus in enm.get("buses", []):
        bus_id = str(bus["ref_id"])
        bus_kind = str(bus.get("bus_kind", "pq")).lower()
        if bus_kind == "slack":
            zrodlo_bilansujace = zrodla_bilansujace_po_szynie.get(bus_id, {})
            v_pu_slacka = zrodlo_bilansujace.get("v_pu")
            if v_pu_slacka is None:
                v_pu_slacka = bus.get("v_pu")
            if v_pu_slacka is None:
                raise ReferenceFixtureError(
                    f"Fikstura sieci referencyjnej: szyna bilansujaca {bus_id!r} nie ma "
                    "pola 'v_pu' — ani na zrodle (source_kind='slack'), ani na szynie."
                )
            node = Node(
                id=bus_id,
                name=str(bus.get("name", bus_id)),
                node_type=NodeType.SLACK,
                voltage_level=voltage_lookup[bus_id],
                voltage_magnitude=float(v_pu_slacka),
                voltage_angle=0.0,
            )
        else:
            node = Node(
                id=bus_id,
                name=str(bus.get("name", bus_id)),
                node_type=NodeType.PQ,
                voltage_level=voltage_lookup[bus_id],
                active_power=0.0,
                reactive_power=0.0,
            )
        graph.add_node(node)

    for branch in enm.get("branches", []):
        from_bus = str(branch["from_bus"])
        to_bus = str(branch["to_bus"])
        opis_galezi = f"galaz {branch.get('ref_id')!r}"
        r_ohm_per_km, x_ohm_per_km, b_us_per_km = _line_params_from_enm_branch(
            branch,
            voltage_lookup=voltage_lookup,
            base_mva=base_mva,
            default_base_kv=default_base_kv,
        )
        graph.add_branch(
            LineBranch(
                id=str(branch["ref_id"]),
                name=str(branch.get("name", branch["ref_id"])),
                branch_type=_branch_type_from_enm(str(branch.get("branch_type", "LineBranch"))),
                from_node_id=from_bus,
                to_node_id=to_bus,
                in_service=bool(branch.get("in_service", True)),
                r_ohm_per_km=r_ohm_per_km,
                x_ohm_per_km=x_ohm_per_km,
                b_us_per_km=b_us_per_km,
                length_km=float(pole_wymagane(branch, "length_km", opis=opis_galezi)),
                rated_current_a=float(pole_wymagane(branch, "rated_current_a", opis=opis_galezi)),
                type_ref=branch.get("type_ref"),
            )
        )

    for transformer in enm.get("transformers", []):
        opis_transformatora = f"transformator {transformer.get('ref_id')!r}"
        graph.add_branch(
            TransformerBranch(
                id=str(transformer["ref_id"]),
                name=str(transformer.get("name", transformer["ref_id"])),
                branch_type=BranchType.TRANSFORMER,
                from_node_id=str(transformer["from_bus"]),
                to_node_id=str(transformer["to_bus"]),
                in_service=bool(transformer.get("in_service", True)),
                rated_power_mva=float(
                    pole_z_aliasem(
                        transformer, "rated_power_mva", "sn_mva", opis=opis_transformatora
                    )
                ),
                voltage_hv_kv=float(
                    pole_z_aliasem(
                        transformer, "voltage_hv_kv", "primary_kv", opis=opis_transformatora
                    )
                ),
                voltage_lv_kv=float(
                    pole_z_aliasem(
                        transformer, "voltage_lv_kv", "secondary_kv", opis=opis_transformatora
                    )
                ),
                uk_percent=float(
                    pole_z_aliasem(transformer, "uk_percent", "ukr_pct", opis=opis_transformatora)
                ),
                pk_kw=float(
                    pole_z_aliasem(transformer, "pk_kw", "p_k_kw", opis=opis_transformatora)
                ),
                i0_percent=float(
                    pole_wymagane(transformer, "i0_percent", opis=opis_transformatora)
                ),
                p0_kw=float(pole_wymagane(transformer, "p0_kw", opis=opis_transformatora)),
                vector_group=str(transformer.get("vector_group", "Dyn11")),
                tap_position=int(
                    pole_wymagane(transformer, "tap_position", opis=opis_transformatora)
                ),
                tap_step_percent=float(
                    pole_wymagane(transformer, "tap_step_percent", opis=opis_transformatora)
                ),
                type_ref=transformer.get("type_ref"),
            )
        )

    return graph


def _solve_short_circuit_scenario(
    graph: NetworkGraph, scenario: ExpectedShortCircuit
) -> ShortCircuitResult:
    if scenario.sc_type == "3F":
        return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=scenario.fault_node_id,
            c_factor=1.10,
            tk_s=1.0,
            include_branch_contributions=True,
        )
    if scenario.sc_type == "2F":
        return ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=graph,
            fault_node_id=scenario.fault_node_id,
            c_factor=1.10,
            tk_s=1.0,
            include_branch_contributions=True,
        )
    raise ValueError(
        "Reference short-circuit validation currently requires explicit Z0 matrices "
        f"for scenario {scenario.fault_node_id}/{scenario.sc_type}"
    )


def solve_reference_short_circuit(
    enm: dict[str, Any],
    scenarios: tuple[ExpectedShortCircuit, ...],
) -> dict[str, dict[str, Any]]:
    """Run our IEC 60909 solver for reference short-circuit scenarios."""

    if not scenarios:
        return {}

    graph = build_short_circuit_graph_from_enm(enm)
    actual: dict[str, dict[str, Any]] = {}
    for scenario in scenarios:
        result = _solve_short_circuit_scenario(graph, scenario)
        result_dict = result.to_dict()
        key = f"{scenario.fault_node_id}__{scenario.sc_type}"
        actual[key] = {
            "ikss_a": result.ikss_a,
            "ip_a": result.ip_a,
            "ith_a": result.ith_a,
            "sk_mva": result.sk_mva,
            "zkk_ohm": result_dict["zkk_ohm"],
            "white_box_trace": result_dict["white_box_trace"],
        }
    return actual


def solve_reference_network(network_id: str, enm: dict[str, Any]) -> dict[str, Any]:
    """Dispatch solver based on network characteristics.

    Returns dict with same shape as _run_solver_for_network API helper:
        {'buses', 'branches', 'short_circuit', 'trace'}
    """
    # Network metadata - lookup if registered
    from application.reference_networks.library import REFERENCE_NETWORK_REGISTRY

    if network_id not in REFERENCE_NETWORK_REGISTRY:
        # Unregistered network — default to NR
        result = _power_flow_newton_raphson(enm)
        return {
            "buses": result["buses"],
            "branches": {},
            "short_circuit": {},
            "trace": result["trace"],
        }
    net = REFERENCE_NETWORK_REGISTRY[network_id]
    # Use BFS for unbalanced, NR for balanced
    if net.is_unbalanced:
        result = _power_flow_unbalanced_bfs(enm)
    else:
        result = _power_flow_newton_raphson(enm)
    # "converged"/"iterations" sa ZAWSZE obecne w kazdej galezi zwrotu obu
    # solverow (_power_flow_newton_raphson/_power_flow_unbalanced_bfs) —
    # subskrypcja wprost zamiast .get(..., False/0), zeby przyszla niekompletna
    # galaz solvera rzucila KeyError zamiast cicho zglosic "niezbiezny"/"0
    # iteracji" dla wyniku, ktory faktycznie nie zostal jeszcze obliczony.
    return {
        "buses": result["buses"],
        "branches": {},
        "short_circuit": {},
        "trace": result["trace"],
        "converged": result["converged"],
        "iterations": result["iterations"],
    }

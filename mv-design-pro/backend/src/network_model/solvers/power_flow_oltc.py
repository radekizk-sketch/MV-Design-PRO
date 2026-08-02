"""OLTC automatic voltage-regulation control loop (V12K-045, OLTC F2).

Wraps a single-shot power-flow solve with a deterministic tap-control loop:

    1. solve the load flow at the current tap positions,
    2. for each transformer whose canonical ``TapChanger`` is in an automatic
       mode, read the controlled-bus voltage (optionally line-drop compensated),
    3. if it is outside the setpoint dead band, step the tap by exactly ONE
       position toward the setpoint (respecting the position limits),
    4. re-solve and repeat until no tap moves or the iteration limit is hit.

A regulator whose decision inputs are incomplete (no controlled-bus voltage, no
setpoint, or no dead band in the model) is NOT regulated: the loop leaves its tap
alone and records the reason (``no_measurement`` / ``no_setpoint`` /
``no_deadband``). Missing data is never replaced by a default — a substituted
zero-wide dead band would turn every deviation into a violation and inflate the
switch count with moves the model never called for.

This module is solver-layer orchestration around the FROZEN physics solvers: it
does not compute any power-system quantities itself, it only reads solver output
and moves tap positions on the shared graph. Every regulator decision is
recorded (WHITE BOX). It is deterministic: regulators are processed in a stable
order (by branch id) and exactly one tap moves per regulator per iteration.

Direction convention (documented, not heuristic):
    The off-nominal factor referred to the HV/from side is ``t`` (see
    ``TransformerBranch.get_tap_ratio``). For a controlled bus on the LV/to side
    (the canonical GPZ case, busbar regulation), the downstream voltage falls as
    ``t`` rises. Since a tap-position increase raises ``t`` for HV-regulated and
    lowers it for LV-regulated windings:
        raise voltage: HV-regulated -> position -1 ; LV-regulated -> position +1
    For a controlled bus on the HV/from side the signs are flipped.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from typing import Any, Protocol

from network_model.core.branch import TapChanger, TransformerBranch
from network_model.solvers.power_flow_types import PowerFlowInput


class _Solution(Protocol):
    node_voltage_kv: dict[str, float]
    node_voltage: dict[str, complex]
    branch_current: dict[str, complex]


SolveOnce = Callable[[PowerFlowInput], Any]

DEFAULT_MAX_OLTC_ITERATIONS = 20


def _regulation_voltage_kv(
    solution: Any,
    reg: TransformerBranch,
    controlled_bus_id: str,
    base_mva: float,
) -> float | None:
    """Controlled-bus voltage seen by the regulator [kV], with LDC if enabled.

    Returns None when the controlled bus voltage is unavailable.
    """
    v_mag_kv = getattr(solution, "node_voltage_kv", {}).get(controlled_bus_id)
    if v_mag_kv is None:
        return None

    tc = reg.tap_changer
    ldc = tc.line_drop_compensation if tc is not None else None
    if ldc is None or not ldc.enabled:
        return float(v_mag_kv)

    # Line-drop compensation: estimate the voltage at the remote load centre as
    # V_bus - I * Z_ldc (first-order, phasor-consistent in per unit).
    node_voltage = getattr(solution, "node_voltage", {}) or {}
    branch_current = getattr(solution, "branch_current", {}) or {}
    v_pu = node_voltage.get(controlled_bus_id)
    i_pu = branch_current.get(reg.id)
    if v_pu is None or i_pu is None or abs(v_pu) == 0:
        return float(v_mag_kv)

    base_kv = v_mag_kv / abs(v_pu)
    if base_kv <= 0 or base_mva <= 0:
        return float(v_mag_kv)
    z_base = (base_kv**2) / base_mva
    z_ldc_pu = complex(ldc.r_ohm, ldc.x_ohm) / z_base
    v_reg_pu = v_pu - i_pu * z_ldc_pu
    return float(abs(v_reg_pu) * base_kv)


def _step_direction_to_raise(tc: TapChanger, reg: TransformerBranch, controlled_bus_id: str) -> int:
    """Tap-position delta (+1/-1) that raises the controlled-bus voltage."""
    controlled_on_hv = controlled_bus_id == reg.from_node_id
    # LV/to-side controlled bus (canonical): HV-regulated -> -1, LV-regulated -> +1.
    raise_dir = -1 if tc.regulated_winding == "HV" else 1
    return -raise_dir if controlled_on_hv else raise_dir


def _automatic_regulators(graph: Any) -> list[TransformerBranch]:
    regs = [
        b
        for b in graph.branches.values()
        if isinstance(b, TransformerBranch)
        and b.tap_changer is not None
        and b.tap_changer.is_automatic()
    ]
    return sorted(regs, key=lambda b: b.id)


def solve_with_oltc(
    pf_input: PowerFlowInput,
    solve_once: SolveOnce,
    *,
    max_iterations: int = DEFAULT_MAX_OLTC_ITERATIONS,
) -> tuple[Any, dict[str, Any] | None]:
    """Run the OLTC control loop around ``solve_once``.

    Returns ``(final_solution, oltc_trace)``. When no automatic OLTC regulators
    are present the input is solved once and ``oltc_trace`` is ``None`` (so
    networks without OLTC behave exactly as before — determinism preserved).
    """
    graph = pf_input.typed_graph()
    regulators = _automatic_regulators(graph)

    solution = solve_once(pf_input)
    if not regulators:
        return solution, None

    trace: dict[str, Any] = {
        "regulators": [
            {
                "branch_id": reg.id,
                "regulated_winding": reg.tap_changer.regulated_winding,
                "controlled_bus_id": reg.tap_changer.controlled_bus_id or reg.to_node_id,
                "setpoint_kv": reg.tap_changer.voltage_setpoint_kv,
                "deadband_kv": reg.tap_changer.deadband_kv,
                "initial_position": reg.tap_changer.current_position,
                "min_position": reg.tap_changer.min_position,
                "max_position": reg.tap_changer.max_position,
            }
            for reg in regulators
        ],
        "iterations": [],
        "converged": False,
    }

    # V12K-187 — blokada oscylacji (hunting) regulatora zaczepowego.
    # Regulator jest DYSKRETNY: jeden stopień zmienia napięcie skokowo. Gdy ten
    # skok jest większy niż strefa nieczułości, żadna pozycja nie mieści się w
    # paśmie i regulator w nieskończoność przerzuca się między dwoma sąsiednimi
    # zaczepami — dokładnie jak rzeczywisty regulator bez blokady antyhuntingowej.
    # Do V12K-187 nie było tego widać, bo Y-bus rozpływu zaniżała impedancje sieci
    # o (U/U_slack)², więc stopień zaczepu ledwo ruszał napięciem i pętla zawsze
    # „zbiegała". Po naprawie bazy napięciowej zjawisko się ujawniło.
    # Rozwiązanie (standard inżynierski): pamiętamy odwiedzone pozycje wraz z
    # odchyłką |U − U_zad|; próba powrotu na pozycję już odwiedzoną oznacza cykl —
    # regulator zatrzymuje się wtedy na zaczepie o NAJMNIEJSZEJ odchyłce spośród
    # odwiedzonych (deterministycznie: przy równej odchyłce niższy numer pozycji).
    visited: dict[str, dict[int, float]] = {reg.id: {} for reg in regulators}
    frozen: set[str] = set()

    for iteration in range(max_iterations):
        any_moved = False
        decisions: list[dict[str, Any]] = []

        for reg in regulators:
            tc = reg.tap_changer
            controlled_bus_id = tc.controlled_bus_id or reg.to_node_id
            u_ctrl_kv = getattr(solution, "node_voltage_kv", {}).get(controlled_bus_id)
            u_reg_kv = _regulation_voltage_kv(solution, reg, controlled_bus_id, pf_input.base_mva)

            decision: dict[str, Any] = {
                "branch_id": reg.id,
                "controlled_bus_id": controlled_bus_id,
                "position_before": tc.current_position,
                "u_controlled_kv": u_ctrl_kv,
                "u_regulation_kv": u_reg_kv,
                "setpoint_kv": tc.voltage_setpoint_kv,
                "deadband_kv": tc.deadband_kv,
            }

            setpoint = tc.voltage_setpoint_kv
            deadband = tc.deadband_kv
            # Pasmo nieczulosci jest DANA MODELU i jest tym, co regulator ZATRZYMUJE.
            # Podstawienie za brakujace pasmo wartosci 0 kV (dawne `or 0.0`) czynilo
            # KAZDA niezerowa odchylke naruszeniem: regulator krecil zaczepem az do
            # blokady oscylacji, a licznik laczen rosl (pomiar przegladu: 7 -> 9) na
            # pasmie, ktorego nikt nie zadeklarowal. Brak danej nie jest pasmem
            # zerowym — to brak podstawy do decyzji, wiec regulator nie rusza zaczepu
            # i mowi wprost, czego brakuje (WHITE BOX, zakaz heurystyk).
            if u_reg_kv is None or setpoint is None or deadband is None:
                decision["position_after"] = tc.current_position
                if u_reg_kv is None:
                    decision["reason"] = "no_measurement"
                elif setpoint is None:
                    decision["reason"] = "no_setpoint"
                else:
                    decision["reason"] = "no_deadband"
                decisions.append(decision)
                continue

            if reg.id in frozen:
                decision["position_after"] = tc.current_position
                decision["reason"] = "oscillation_stop"
                decisions.append(decision)
                continue

            # Odchyłka bieżącej pozycji trafia do pamięci odwiedzonych zaczepów.
            visited[reg.id][tc.current_position] = abs(u_reg_kv - setpoint)

            half_band = deadband / 2.0
            if abs(u_reg_kv - setpoint) <= half_band:
                decision["position_after"] = tc.current_position
                decision["reason"] = "within_deadband"
                decisions.append(decision)
                continue

            raise_dir = _step_direction_to_raise(tc, reg, controlled_bus_id)
            direction = raise_dir if u_reg_kv < setpoint else -raise_dir
            target = tc.current_position + direction
            clamped = tc.clamp_position(target)

            if clamped == tc.current_position:
                decision["position_after"] = tc.current_position
                decision["reason"] = "limit_reached"
                decisions.append(decision)
                continue

            if clamped in visited[reg.id]:
                # Cykl: ta pozycja była już badana. Regulator dyskretny nie trafi
                # w pasmo — wybieramy zaczep o najmniejszej odchyłce od zadanej.
                best = min(visited[reg.id].items(), key=lambda item: (item[1], item[0]))[0]
                frozen.add(reg.id)
                decision["position_after"] = best
                decision["reason"] = "oscillation_stop"
                decision["oscillation_candidates"] = {
                    str(pos): round(err, 9) for pos, err in sorted(visited[reg.id].items())
                }
                decisions.append(decision)
                if best != tc.current_position:
                    reg.tap_changer = replace(tc, current_position=best)
                    any_moved = True
                continue

            reg.tap_changer = replace(tc, current_position=clamped)
            decision["position_after"] = clamped
            decision["reason"] = "step_up" if direction > 0 else "step_down"
            decisions.append(decision)
            any_moved = True

        trace["iterations"].append({"iteration": iteration, "decisions": decisions})

        if not any_moved:
            trace["converged"] = True
            break

        solution = solve_once(pf_input)

    # Switch count per regulator = number of tap moves across the loop (owner §7/§8).
    # V12K-187: liczymy KAŻDĄ faktyczną zmianę pozycji, nie tylko kroki regulacyjne —
    # powrót na lepszy zaczep przy zatrzymaniu oscylacji też przestawia przełącznik i
    # też zużywa jego resurs. Licznik ma odpowiadać liczbie łączeń, nie liczbie decyzji
    # o kierunku (przy monotonicznym dojściu obie wielkości są równe, jak dotąd).
    switch_counts: dict[str, int] = {reg.id: 0 for reg in regulators}
    for it in trace["iterations"]:
        for decision in it["decisions"]:
            before = decision.get("position_before")
            after = decision.get("position_after")
            if before is None or after is None or before == after:
                continue
            switch_counts[decision["branch_id"]] = switch_counts.get(decision["branch_id"], 0) + 1

    trace["iterations_count"] = len(trace["iterations"])
    trace["switch_counts"] = switch_counts
    trace["total_switch_count"] = sum(switch_counts.values())
    trace["final_positions"] = {reg.id: reg.tap_changer.current_position for reg in regulators}
    trace["initial_positions"] = {
        entry["branch_id"]: entry["initial_position"] for entry in trace["regulators"]
    }
    return solution, trace

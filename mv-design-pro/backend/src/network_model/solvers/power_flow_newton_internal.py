from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
from network_model.core.branch import Branch, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.scalenie_lacznikow import lacznik_przewodzi
from network_model.odmowa_danych import (
    RODZAJ_GALAZ,
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    InverterShaping,
    apply_inverter_setpoint,
    build_inverter_table,
    inverter_effective_spec,
    inverter_q_seed,
    qu_dq_dv,
    qu_q,
)
from network_model.solvers.power_flow_scalenie import (
    PODSTAWA_PODZIALU_Q_PV,
    ScalenieWyspy,
    indeksy_typow,
    moc_bilansujaca,
    odmowy_napiec_lacznikow,
    odmowy_wezlow_napieciowych,
    przeplywy_lacznikow,
    q_pozostalych,
    slad_grup,
    wstrzykniecia_elementow,
    wstrzykniecia_pv,
    zbuduj_scalenie,
    zredukuj_pv,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
)
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    apply_zip_frequency,
    build_zip_table,
    split_zip_constant_part,
    zip_effective_spec,
    zip_factor,
    zip_factor_derivative,
)

# Kody odmów wejścia rozpływu (rekord strukturalny `RekordOdmowy`, decyzja O-59, plan A/B
# §12.2 (k)): identyfikatory węzłów i gałęzi stoją w odwołaniach rekordu, nie w treści.
KOD_MOC_BAZOWA_NIEDODATNIA = "rozplyw.moc_bazowa_niedodatnia"
KOD_WEZEL_BILANSUJACY_SPOZA_GRAFU = "rozplyw.wezel_bilansujacy_spoza_grafu"
KOD_ZADANIE_PQ_ZDUBLOWANE = "rozplyw.zadanie_pq_zdublowane"
KOD_ZADANIE_PV_ZDUBLOWANE = "rozplyw.zadanie_pv_zdublowane"
KOD_BOCZNIK_ZDUBLOWANY = "rozplyw.bocznik_zdublowany"
KOD_GRANICE_NAPIECIA_ZDUBLOWANE = "rozplyw.granice_napiecia_zdublowane"
KOD_PRZEKLADNIA_ZDUBLOWANA = "rozplyw.przekladnia_zdublowana"
KOD_GRANICE_GALEZI_ZDUBLOWANE = "rozplyw.granice_galezi_zdublowane"
KOD_WEZEL_BILANSUJACY_Z_ZADANIEM = "rozplyw.wezel_bilansujacy_z_zadaniem"
KOD_WEZEL_PQ_I_PV = "rozplyw.wezel_pq_i_pv"
KOD_GRANICE_Q_PV_ODWROCONE = "rozplyw.granice_q_pv_odwrocone"
KOD_GRANICE_NAPIECIA_ODWROCONE = "rozplyw.granice_napiecia_odwrocone"
KOD_GRANICA_GALEZI_BEZ_WARTOSCI = "rozplyw.granica_galezi_bez_wartosci"
KOD_PRZEKLADNIA_GALEZI_SPOZA_GRAFU = "rozplyw.przekladnia_galezi_spoza_grafu"
KOD_PRZEKLADNIA_NIE_TRANSFORMATORA = "rozplyw.przekladnia_nie_transformatora"
KOD_GRANICA_GALEZI_SPOZA_GRAFU = "rozplyw.granica_galezi_spoza_grafu"
KOD_PRZEKLADNIA_NIEDODATNIA = "rozplyw.przekladnia_niedodatnia"


def transformer_clock_number(vector_group: str | None) -> int | None:
    """Clock number k of an IEC vector group label (``'Dyn11'`` -> ``11``).

    The clock number is the trailing integer of the vector-group string, taken
    modulo 12. Returns ``None`` when no digits are present (e.g. a bare ``'Dyn'``
    or an empty string) so callers can treat the transformer as having no
    defined phase displacement.
    """
    if not vector_group:
        return None
    digits = "".join(c for c in vector_group if c.isdigit())
    if not digits:
        return None
    return int(digits) % 12


def transformer_phase_shift_rad(vector_group: str | None) -> float:
    """Phase displacement θ [rad] the vector group imposes on the LV (``to``)
    side relative to the HV (``from``) side, with positive = LV leads HV.

    SM-2 (V12K-180). IEC convention: the clock number k puts the LV phasor at
    ``k`` o'clock, i.e. lagging the HV phasor by ``k·30°``. Equivalently the LV
    leads the HV by ``−k·30°``, normalised to the principal range (−180°, 180°]:

        Dyn11 → +30°   Dyn1 → −30°   Dyn5 → −150°   Dyn7 → +150°   Yy0/Dyn0 → 0°

    Returns ``0.0`` when the clock number is undefined. This θ is the shift that
    appears on every node behind the transformer in a balanced power flow; the
    magnitudes |V| are unaffected (it is a rotation of the downstream reference).
    """
    k = transformer_clock_number(vector_group)
    if k is None:
        return 0.0
    deg = -(k * 30.0)
    # normalise to the principal range (-180, 180]
    deg = ((deg + 180.0) % 360.0) - 180.0
    return float(np.deg2rad(deg))


def _seed_phase_shift_angles(
    graph: NetworkGraph, node_list: list[str], slack_node_id: str
) -> dict[str, float]:
    """SM-2 (V12K-180): cumulative vector-group phase displacement [rad] of each
    bus relative to the slack, following the path through the network.

    A flat start seeded with these angles lands next to the physically shifted
    solution (Dyn11 → +30° behind each transformer, accumulating through cascaded
    transformers), which keeps Newton robust when large group shifts (e.g. Dyn5 →
    −150°) would otherwise pull a flat 0° start toward a spurious low-voltage
    root. Seeding only moves the starting point — the converged |V|/θ are the
    same solution. Traversal is deterministic (BFS from the slack, neighbours in
    sorted order); only conducting switches (`lacznik_przewodzi` — the predicate of the
    Y-bus merge) connect, with zero phase displacement.
    """
    node_set = set(node_list)
    seed = {node_id: 0.0 for node_id in node_list}
    if slack_node_id not in node_set:
        return seed

    adjacency: dict[str, list[tuple[str, float]]] = {node_id: [] for node_id in node_list}
    for branch in graph.branches.values():
        if not branch.in_service:
            continue
        u, v = branch.from_node_id, branch.to_node_id
        if u not in node_set or v not in node_set:
            continue
        theta = 0.0
        if isinstance(branch, TransformerBranch):
            # from = HV, to = LV: angle[to] = angle[from] + θ (LV leads HV).
            theta = transformer_phase_shift_rad(branch.vector_group)
        adjacency[u].append((v, theta))
        adjacency[v].append((u, -theta))
    for switch in graph.switches.values():
        if not lacznik_przewodzi(switch):
            continue
        u, v = switch.from_node_id, switch.to_node_id
        if u not in node_set or v not in node_set:
            continue
        adjacency[u].append((v, 0.0))
        adjacency[v].append((u, 0.0))

    visited = {slack_node_id}
    queue: deque[str] = deque([slack_node_id])
    while queue:
        current = queue.popleft()
        for neighbour, delta in sorted(adjacency[current]):
            if neighbour in visited:
                continue
            seed[neighbour] = seed[current] + delta
            visited.add(neighbour)
            queue.append(neighbour)
    return seed


def _apply_zip_jacobian_v2(
    jacobian: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    active_pq: list[int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    zip_table: dict[int, ZipCoeffs],
    mapa: np.ndarray | None = None,
) -> None:
    """ADR-011: ZIP correction for the v2 (PV/PQ-switching) Jacobian.

    Block layout: top=[j11(n_p x n_p), j12(n_p x n_q)], bottom=[j21, j22(n_q x n_q)].
    A ZIP bus is a PQ load, so it appears in non_slack_indices (P eq) and active_pq
    (Q eq). Same reduce-to-NR property: a=b=0 => derivative 0 => no change.

    Defect D1: p_spec/q_spec here are the ZIP BASE (the load part, after
    split_zip_constant_part), so the derivative is taken over the load alone —
    the constant part (generation) contributes zero, as physics requires.

    ``mapa`` (węzeł wyspy → węzeł elektryczny, `ScalenieWyspy.mapa`): odbiór ZIP węzła
    scalonego wnosi pochodną do wiersza/kolumny SWOJEGO węzła elektrycznego (pochodna sumy
    zadań = suma pochodnych). None = każdy węzeł jest swoim węzłem elektrycznym."""
    n_p = len(non_slack_indices)
    v_mag = np.abs(v)
    for z_idx, z_c in zip_table.items():
        e_idx = z_idx if mapa is None else int(mapa[z_idx])
        if e_idx not in active_pq or e_idx not in non_slack_indices:
            continue
        row_p = non_slack_indices.index(e_idx)
        col_q = active_pq.index(e_idx)
        dp_dv = p_spec[z_idx] * zip_factor_derivative(z_c.a_p, z_c.b_p, v_mag[e_idx], z_c.v0_pu)
        dq_dv = q_spec[z_idx] * zip_factor_derivative(z_c.a_q, z_c.b_q, v_mag[e_idx], z_c.v0_pu)
        jacobian[row_p, n_p + col_q] -= dp_dv
        jacobian[n_p + col_q, n_p + col_q] -= dq_dv


def pv_calculated_injections(
    pv_specs: Iterable[PVSpec],
    node_index_map: dict[str, int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> tuple[dict[str, float], dict[str, float]]:
    """What a voltage-controlled bus actually injected, at the converged state.

    On a PV bus the reactive power is NOT specified — it is the RESULT: it is the
    quantity that holds the requested voltage magnitude. The solver already knows
    it, because the very same nodal equation (S_i = V_i * conj(sum_k Y_ik V_k))
    yields the slack power a few lines above; up to this function it was published
    for the slack ONLY. Measured gap (debt W2-D1, V12K-318): the report showed
    0.000000 Mvar for a PV bus where an independent nodal balance gives
    0.405463 Mvar — the bus looked reactively idle while it was regulating.

    NO new physics: the same `p_calc`/`q_calc` arrays the slack is read from.
    INJECTION convention, pu on base_mva — identical to `effective_pq_injections`,
    so a consumer merging both dictionaries keeps ONE sign convention.

    P is published too. On a PV bus it equals the specification, but reading it
    from the same nodal equation keeps a single source of "what was injected" and
    makes the pair (P, Q) close the balance by construction.
    """
    p_out: dict[str, float] = {}
    q_out: dict[str, float] = {}
    for spec in pv_specs:
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        p_out[spec.node_id] = float(p_calc[idx])
        q_out[spec.node_id] = float(q_calc[idx])
    return p_out, q_out


def effective_pq_injections(
    pq_specs: Iterable[PQSpec],
    node_index_map: dict[str, int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    v: np.ndarray,
    zip_table: dict[int, ZipCoeffs] | None,
    inv_table: dict[int, InverterControl] | None,
    zip_const: tuple[np.ndarray, np.ndarray] | None,
) -> tuple[dict[str, float], dict[str, float]]:
    """Defect D1: the injection each PQ bus actually got, at the converged |V|.

    Same evaluation the solvers use for their final mismatch: the ZIP polynomial
    applied to the load base plus the constant part, and the volt-var Q(U) value
    at inverter buses. At a classic constant-power bus it returns the untouched
    p_spec/q_spec, so the reported value there is unchanged. Shared by NR/GS/FD
    (one truth about 'what was injected'); the result table reports THIS instead
    of the pre-polynomial request, otherwise the nodal balance does not close.
    Injection convention, pu on base_mva."""
    p_eff, q_eff = zip_effective_spec(p_spec, q_spec, v, zip_table, zip_const)
    q_eff = inverter_effective_spec(q_eff, v, inv_table)
    p_out: dict[str, float] = {}
    q_out: dict[str, float] = {}
    for spec in pq_specs:
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        p_out[spec.node_id] = float(p_eff[idx])
        q_out[spec.node_id] = float(q_eff[idx])
    return p_out, q_out


def _zip_loads_trace(
    zip_table: dict[int, ZipCoeffs],
    node_index_to_id: dict[int, str],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    p_spec_eff: np.ndarray,
    q_spec_eff: np.ndarray,
    zip_const: tuple[np.ndarray, np.ndarray] | None,
) -> dict[str, dict[str, float]]:
    """WHITE BOX (Rule #2) view of the ZIP buses for the trace.

    Reports the effective injection together with its two components, so an
    auditor reproduces the multiplier from the numbers alone:

        p_spec_pu = p_base_pu * f_ZIP(|V|) + p_const_pu

    ``*_base_pu`` is the load part the polynomial scales, ``*_const_pu`` the
    constant part of the bus (generation) — zero when the bus is load-only."""
    out: dict[str, dict[str, float]] = {}
    for z_idx in sorted(zip_table):
        node_id = node_index_to_id.get(z_idx, str(z_idx))
        out[node_id] = {
            "p_spec_pu": float(p_spec_eff[z_idx]),
            "q_spec_pu": float(q_spec_eff[z_idx]),
            "p_base_pu": float(p_spec[z_idx]),
            "q_base_pu": float(q_spec[z_idx]),
            "p_const_pu": float(zip_const[0][z_idx]) if zip_const is not None else 0.0,
            "q_const_pu": float(zip_const[1][z_idx]) if zip_const is not None else 0.0,
        }
    return out


def _inverter_sources_trace(
    inv_table: dict[int, InverterControl] | None,
    inv_shaping: dict[int, InverterShaping] | None,
    node_index_to_id: dict[int, str],
    v: np.ndarray,
    p_spec_eff: np.ndarray,
    q_spec_eff: np.ndarray,
) -> dict[str, dict[str, float | str]]:
    """WHITE BOX (Rule #2) view of the controlled sources for the trace (defect B).

    The audit that missed defect B could not have caught it from this trace: it
    reported only the BUS injection, so a cosφ source deriving its reactive power
    from the LOAD's active power looked exactly like a correct one. The record now
    carries the shaping INPUT and its RESULT, so the rachunek is reproducible from
    the numbers alone:

        p_shaped_pu   = p_source_pu * lfsm_factor
        q_shaped_pu   = q_over_p * |p_shaped_pu|      (cosφ modes)
        q_volt_var_pu = qu_q(|V|)                     (Q(U) mode, per iteration)
        q_spec_pu     = (bus power without this source) + q_shaped/q_volt_var

    Covers every shaped source, not only the voltage-dependent ones — a cosφ or
    P(f) source is shaped too and was invisible here before."""
    v_mag = np.abs(v)
    records = inv_shaping or {}
    controls = inv_table or {}
    out: dict[str, dict[str, float | str]] = {}
    for i_idx in sorted(set(records) | set(controls)):
        entry: dict[str, float | str] = {
            "p_spec_pu": float(p_spec_eff[i_idx]),
            "q_spec_pu": float(q_spec_eff[i_idx]),
        }
        sh = records.get(i_idx)
        if sh is not None:
            entry["p_source_pu"] = sh.p_source_pu
            entry["q_source_pu"] = sh.q_source_pu
            entry["p_shaped_pu"] = sh.p_shaped_pu
            entry["q_shaped_pu"] = sh.q_shaped_pu
            entry["lfsm_factor"] = sh.lfsm_factor
        c = controls.get(i_idx)
        if c is not None:
            entry["q_volt_var_pu"] = float(qu_q(c, v_mag[i_idx]))
        entry["mode"] = (c.mode if c is not None else sh.mode).value  # type: ignore[union-attr]
        out[node_index_to_id.get(i_idx, str(i_idx))] = entry
    return out


def _apply_inverter_jacobian_v2(
    jacobian: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    active_pq: list[int],
    inv_table: dict[int, InverterControl],
    mapa: np.ndarray | None = None,
) -> None:
    """ADR-011 §5b: inverter Q(U) correction for the v2 Jacobian.

    An inverter source is a PQ bus whose Q follows the volt-var droop Q(U); its
    only voltage derivative is ∂Q_spec/∂V (the droop slope), so it touches the
    J22 diagonal exactly like the ZIP ∂Q/∂V term. P is frequency- (not voltage-)
    dependent, so there is no J12 term. In the deadband or where Q is clamped the
    slope is 0 → no change (reduce-to-NR). ``mapa`` — jak w `_apply_zip_jacobian_v2`."""
    n_p = len(non_slack_indices)
    v_mag = np.abs(v)
    for idx, c in inv_table.items():
        e_idx = idx if mapa is None else int(mapa[idx])
        if e_idx not in active_pq or e_idx not in non_slack_indices:
            continue
        col_q = active_pq.index(e_idx)
        jacobian[n_p + col_q, n_p + col_q] -= qu_dq_dv(c, v_mag[e_idx])


def _odwolania(rodzaj: str, refs: Iterable[str]) -> tuple[OdwolanieElementu, ...]:
    return tuple(OdwolanieElementu(rodzaj, ref) for ref in sorted(refs))


def odmowy_wejscia(pf_input: PowerFlowInput) -> tuple[list[str], list[RekordOdmowy]]:
    """Walidacja wejścia rozpływu: ostrzeżenia i odmowy jako rekordy strukturalne.

    Te same predykaty i ta sama kolejność co w `validate_input` (który z niej korzysta);
    identyfikatory węzłów i gałęzi stoją w `RekordOdmowy.odwolania`, nie w treści (decyzja
    O-59, plan A/B §12.2 (k)). Zdanie z nazwami z modelu składa warstwa aplikacji.
    """
    warnings: list[str] = []
    errors: list[RekordOdmowy] = []

    if pf_input.base_mva <= 0:
        errors.append(
            RekordOdmowy(KOD_MOC_BAZOWA_NIEDODATNIA, "Moc bazowa rozpływu musi być dodatnia.")
        )

    graph = pf_input.typed_graph()
    if pf_input.slack.node_id not in graph.nodes:
        errors.append(
            RekordOdmowy(
                KOD_WEZEL_BILANSUJACY_SPOZA_GRAFU,
                "Wskazany węzeł bilansujący nie istnieje w grafie sieci.",
                _odwolania(RODZAJ_WEZEL, [pf_input.slack.node_id]),
            )
        )

    pq_ids = [pq_spec.node_id for pq_spec in pf_input.pq]
    pv_ids = [pv_spec.node_id for pv_spec in pf_input.pv]
    slack_id = pf_input.slack.node_id

    duplicate_pq = _find_duplicates(pq_ids)
    if duplicate_pq:
        errors.append(
            RekordOdmowy(
                KOD_ZADANIE_PQ_ZDUBLOWANE,
                "Węzeł ma więcej niż jedno zadanie mocy odbioru (PQ).",
                _odwolania(RODZAJ_WEZEL, duplicate_pq),
            )
        )

    duplicate_pv = _find_duplicates(pv_ids)
    if duplicate_pv:
        errors.append(
            RekordOdmowy(
                KOD_ZADANIE_PV_ZDUBLOWANE,
                "Węzeł ma więcej niż jedno zadanie węzła napięciowego (PV).",
                _odwolania(RODZAJ_WEZEL, duplicate_pv),
            )
        )

    duplicate_shunts = _find_duplicates([shunt.node_id for shunt in pf_input.shunts])
    if duplicate_shunts:
        errors.append(
            RekordOdmowy(
                KOD_BOCZNIK_ZDUBLOWANY,
                "Węzeł ma więcej niż jeden bocznik.",
                _odwolania(RODZAJ_WEZEL, duplicate_shunts),
            )
        )

    duplicate_bus_limits = _find_duplicates([limit.node_id for limit in pf_input.bus_limits])
    if duplicate_bus_limits:
        errors.append(
            RekordOdmowy(
                KOD_GRANICE_NAPIECIA_ZDUBLOWANE,
                "Węzeł ma więcej niż jedną parę granic napięcia.",
                _odwolania(RODZAJ_WEZEL, duplicate_bus_limits),
            )
        )

    duplicate_taps = _find_duplicates([tap.branch_id for tap in pf_input.taps])
    if duplicate_taps:
        errors.append(
            RekordOdmowy(
                KOD_PRZEKLADNIA_ZDUBLOWANA,
                "Transformator ma więcej niż jedną zadaną przekładnię.",
                _odwolania(RODZAJ_GALAZ, duplicate_taps),
            )
        )

    duplicate_branch_limits = _find_duplicates(
        [limit.branch_id for limit in pf_input.branch_limits]
    )
    if duplicate_branch_limits:
        errors.append(
            RekordOdmowy(
                KOD_GRANICE_GALEZI_ZDUBLOWANE,
                "Gałąź ma więcej niż jedną granicę obciążenia.",
                _odwolania(RODZAJ_GALAZ, duplicate_branch_limits),
            )
        )

    pq_set = set(pq_ids)
    pv_set = set(pv_ids)
    if slack_id in pq_set or slack_id in pv_set:
        errors.append(
            RekordOdmowy(
                KOD_WEZEL_BILANSUJACY_Z_ZADANIEM,
                "Węzeł bilansujący nie może mieć zadania mocy odbioru (PQ) ani węzła "
                "napięciowego (PV).",
                _odwolania(RODZAJ_WEZEL, [slack_id]),
            )
        )
    overlap = pq_set.intersection(pv_set)
    if overlap:
        errors.append(
            RekordOdmowy(
                KOD_WEZEL_PQ_I_PV,
                "Węzeł nie może mieć jednocześnie zadania mocy odbioru (PQ) i węzła "
                "napięciowego (PV).",
                _odwolania(RODZAJ_WEZEL, overlap),
            )
        )

    for pv_spec in pf_input.pv:
        if pv_spec.q_min_mvar > pv_spec.q_max_mvar:
            errors.append(
                RekordOdmowy(
                    KOD_GRANICE_Q_PV_ODWROCONE,
                    "Dolna granica mocy biernej węzła napięciowego (PV) przekracza górną.",
                    _odwolania(RODZAJ_WEZEL, [pv_spec.node_id]),
                )
            )

    for bus_limit in pf_input.bus_limits:
        if bus_limit.u_min_pu >= bus_limit.u_max_pu:
            errors.append(
                RekordOdmowy(
                    KOD_GRANICE_NAPIECIA_ODWROCONE,
                    "Dolna granica napięcia węzła musi być mniejsza od górnej.",
                    _odwolania(RODZAJ_WEZEL, [bus_limit.node_id]),
                )
            )

    for branch_limit in pf_input.branch_limits:
        if branch_limit.s_max_mva is None and branch_limit.i_max_ka is None:
            errors.append(
                RekordOdmowy(
                    KOD_GRANICA_GALEZI_BEZ_WARTOSCI,
                    "Granica obciążenia gałęzi wymaga mocy dopuszczalnej albo prądu "
                    "dopuszczalnego.",
                    _odwolania(RODZAJ_GALAZ, [branch_limit.branch_id]),
                )
            )

    for tap in pf_input.taps:
        if tap.branch_id not in graph.branches:
            errors.append(
                RekordOdmowy(
                    KOD_PRZEKLADNIA_GALEZI_SPOZA_GRAFU,
                    "Zadana przekładnia wskazuje gałąź, której nie ma w grafie sieci.",
                    _odwolania(RODZAJ_GALAZ, [tap.branch_id]),
                )
            )
            continue
        branch = graph.branches[tap.branch_id]
        if not isinstance(branch, TransformerBranch):
            errors.append(
                RekordOdmowy(
                    KOD_PRZEKLADNIA_NIE_TRANSFORMATORA,
                    "Zadana przekładnia wskazuje gałąź, która nie jest transformatorem.",
                    _odwolania(RODZAJ_GALAZ, [tap.branch_id]),
                )
            )

    for branch_limit in pf_input.branch_limits:
        if branch_limit.branch_id not in graph.branches:
            errors.append(
                RekordOdmowy(
                    KOD_GRANICA_GALEZI_SPOZA_GRAFU,
                    "Granica obciążenia wskazuje gałąź, której nie ma w grafie sieci.",
                    _odwolania(RODZAJ_GALAZ, [branch_limit.branch_id]),
                )
            )

    if pf_input.slack.node_id in graph.nodes:
        # Węzły elektryczne wyspy zasilanej (zamknięte łączniki scalają węzły): łącznik między
        # różnymi napięciami znamionowymi i sprzeczne nastawy napięcia w jednym węźle
        # elektrycznym — te same funkcje woła przygotowanie rozpływu (jedno źródło predykatu).
        wyspa, _poza = build_slack_island(graph, pf_input.slack.node_id)
        errors.extend(odmowy_napiec_lacznikow(graph, wyspa))
        errors.extend(
            odmowy_wezlow_napieciowych(
                graph, pf_input.pv, pf_input.slack.node_id, pf_input.slack.u_pu, wyspa
            )
        )

    if pf_input.slack.u_pu < 0.8 or pf_input.slack.u_pu > 1.2:
        warnings.append(
            f"Napięcie zadane węzła bilansującego {pf_input.slack.u_pu:.3f} j.w. jest poza "
            "typowym zakresem 0,8–1,2 j.w."
        )

    return warnings, errors


def validate_input(pf_input: PowerFlowInput) -> tuple[list[str], list[str]]:
    """Ostrzeżenia i treści odmów wejścia (zdania bez identyfikatorów) — `odmowy_wejscia`."""
    warnings, odmowy = odmowy_wejscia(pf_input)
    return warnings, [odmowa.tresc for odmowa in odmowy]


def build_slack_island(graph: NetworkGraph, slack_node_id: str) -> tuple[list[str], list[str]]:
    islands = graph.find_islands()
    slack_island: list[str] = []
    for island in islands:
        if slack_node_id in island:
            slack_island = island
            break
    if not slack_island:
        return [], sorted(graph.nodes.keys())

    slack_island_set = set(slack_island)
    not_solved = sorted([node_id for node_id in graph.nodes if node_id not in slack_island_set])
    return sorted(slack_island), not_solved


def build_ybus_pu(
    graph: NetworkGraph,
    slack_island_nodes: Iterable[str],
    base_mva: float,
    slack_node_id: str,
    shunts: Iterable[ShuntSpec],
    tap_ratios: dict[str, float],
) -> tuple[np.ndarray, dict[str, int], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Macierz admitancyjna [pu] WĘZŁÓW ELEKTRYCZNYCH wyspy (zamknięte łączniki scalone).

    Wiersz/kolumna = węzeł elektryczny (`power_flow_scalenie.zbuduj_scalenie`: grupa węzłów
    połączonych zamkniętymi łącznikami, reprezentant — najmniejszy identyfikator, ten sam
    co sieć zwarciowa `core/ybus.py`). Zwracana mapa przypisuje KAŻDEMU węzłowi wyspy indeks
    jego węzła elektrycznego (węzły grupy dzielą indeks). Łącznik nie wnosi admitancji —
    nie ma impedancji. Wyspa bez zamkniętego łącznika: macierz, mapa i ślad bit w bit jak
    przed scaleniem (każdy węzeł jest swoim węzłem elektrycznym).
    """
    island_nodes_sorted = sorted(slack_island_nodes)
    scalenie = zbuduj_scalenie(graph, island_nodes_sorted)
    node_id_to_index = dict(scalenie.indeks_wezla)

    slack_voltage_kv = graph.nodes[slack_node_id].voltage_level

    ybus_ohm, applied_taps, applied_phase_shifts = _build_ybus_ohm(
        graph,
        node_id_to_index,
        tap_ratios,
        slack_voltage_kv,
        size=len(scalenie.reprezentanci),
    )
    ybus_note = ""
    ybus_source = "network_model.solvers.power_flow_newton_internal.build_ybus_pu"

    if slack_voltage_kv and slack_voltage_kv > 0:
        z_base = (slack_voltage_kv**2) / base_mva
        ybus_pu = ybus_ohm * z_base
    else:
        ybus_note = "Slack node voltage_level missing or zero; Ybus treated as per-unit."
        ybus_pu = ybus_ohm

    applied_shunts = _apply_shunts_pu(ybus_pu, node_id_to_index, shunts)

    trace_info: dict[str, Any] = {
        "source": ybus_source,
        "n": int(len(scalenie.reprezentanci)),
        "node_index_map": node_id_to_index,
        "note": ybus_note,
        # SM-2 (V12K-180): white-box record of transformer vector-group phase
        # displacements applied to the Y-bus (empty when no group shifts angles).
        "applied_phase_shifts": applied_phase_shifts,
    }
    if not scalenie.trywialne:
        # WHITE BOX: węzły elektryczne (reprezentant + członkowie + łączniki); przepływy
        # łączników dopisuje `wyniki_rozplywu_wyspy` po zbieżności.
        trace_info["scalenie_lacznikow"] = slad_grup(scalenie)

    return ybus_pu, node_id_to_index, trace_info, applied_taps, applied_shunts


def build_power_spec(
    island_nodes: Iterable[str],
    base_mva: float,
    pq_specs: Iterable[PQSpec],
) -> tuple[np.ndarray, np.ndarray]:
    node_list = list(island_nodes)
    p_spec = np.zeros(len(node_list), dtype=float)
    q_spec = np.zeros(len(node_list), dtype=float)
    node_index_map = {node_id: idx for idx, node_id in enumerate(node_list)}

    for spec in pq_specs:
        if spec.node_id not in node_index_map:
            continue
        idx = node_index_map[spec.node_id]
        p_spec[idx] = -spec.p_mw / base_mva
        q_spec[idx] = -spec.q_mvar / base_mva

    return p_spec, q_spec


def build_power_spec_v2(
    island_nodes: Iterable[str],
    base_mva: float,
    pq_specs: Iterable[PQSpec],
    pv_specs: Iterable[PVSpec],
) -> tuple[np.ndarray, np.ndarray, dict[int, float], dict[int, tuple[float, float]]]:
    node_list = list(island_nodes)
    p_spec = np.zeros(len(node_list), dtype=float)
    q_spec = np.zeros(len(node_list), dtype=float)
    node_index_map = {node_id: idx for idx, node_id in enumerate(node_list)}

    pv_setpoints: dict[int, float] = {}
    pv_q_limits: dict[int, tuple[float, float]] = {}

    for spec in pq_specs:
        if spec.node_id not in node_index_map:
            continue
        idx = node_index_map[spec.node_id]
        p_spec[idx] = -spec.p_mw / base_mva
        q_spec[idx] = -spec.q_mvar / base_mva

    for pv_spec in pv_specs:
        if pv_spec.node_id not in node_index_map:
            continue
        idx = node_index_map[pv_spec.node_id]
        p_spec[idx] = -pv_spec.p_mw / base_mva
        pv_setpoints[idx] = float(pv_spec.u_pu)
        q_min_pu = pv_spec.q_min_mvar / base_mva
        q_max_pu = pv_spec.q_max_mvar / base_mva
        pv_q_limits[idx] = (q_min_pu, q_max_pu)

    return p_spec, q_spec, pv_setpoints, pv_q_limits


def build_initial_voltage(
    nodes: Iterable[str],
    slack_node_id: str,
    slack_u_pu: float,
    slack_angle_rad: float,
    options: PowerFlowOptions,
    graph: NetworkGraph,
) -> np.ndarray:
    node_list = list(nodes)
    size = len(node_list)
    v = np.ones(size, dtype=complex)
    node_index_map = {node_id: idx for idx, node_id in enumerate(node_list)}

    if not options.flat_start:
        for node_id, idx in node_index_map.items():
            node = graph.nodes[node_id]
            mag = node.voltage_magnitude if node.voltage_magnitude is not None else 1.0
            angle = node.voltage_angle if node.voltage_angle is not None else 0.0
            v[idx] = mag * np.exp(1j * angle)
    else:
        # SM-2 (V12K-180): seed flat-start angles with the cumulative vector-group
        # phase displacement from the slack, so the start sits near the physically
        # shifted solution. Converged values are unchanged; robustness improves.
        seed_angles = _seed_phase_shift_angles(graph, node_list, slack_node_id)
        for node_id, idx in node_index_map.items():
            v[idx] = np.exp(1j * (slack_angle_rad + seed_angles[node_id]))

    slack_idx = node_index_map[slack_node_id]
    v[slack_idx] = slack_u_pu * np.exp(1j * slack_angle_rad)
    return v


def compute_power_injections(ybus: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    i_inj = ybus @ v
    s_inj = v * np.conj(i_inj)
    return s_inj.real, s_inj.imag


def trig_bloku(va_w: np.ndarray, va_k: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Sinus i cosinus różnicy kątów bloku — JEDNO źródło dla produkcji i pinu składania.

    Wydzielone z ``build_jacobian_v2`` świadomie, po zderzeniu z runnerem CI
    (2026-08-14): pin składania porównuje TO SAMO wejście trygonometryczne, którego
    używa produkcja, więc równoważność postaci blokowej i skalarnej jest własnością
    KONSTRUKCJI, a nie założeniem o ścieżce SIMD biblioteki. Różnicę wektor-vs-skalar
    pilnuje osobny pin (``test_trig_wektorowy_vs_skalarny_najwyzej_1_ulp``).
    """
    theta = va_w[:, None] - va_k[None, :]
    return np.sin(theta), np.cos(theta)


def wyrazy_przekatne(
    g: np.ndarray,
    b: np.ndarray,
    vm_ns: np.ndarray,
    vm_pq: np.ndarray,
    p_calc: np.ndarray,
    q_calc: np.ndarray,
    ns: np.ndarray,
    pq: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Wyrazy przekątniowe czterech bloków — JEDNO źródło dla produkcji i pinu składania.

    Wydzielone z tego samego powodu, co ``trig_bloku`` (2026-08-14): po ujednoliceniu
    trygonometrii runner CI DALEJ meldował różnicę bitową, a jedynym miejscem, w którym
    produkcja liczyła WEKTOROWO, a pętla skalarnie, były wyrazy przekątniowe — w
    szczególności ``vm ** 2``, dla którego numpy może wybrać inną drogę dla tablicy
    (mnożenie) niż dla skalara (``pow`` z libm). To znowu własność biblioteki, a nie
    sposobu składania, więc pin składania nie może o nią zahaczać.
    """
    return (
        -q_calc[ns] - b[ns, ns] * vm_ns**2,
        p_calc[ns] / vm_ns + g[ns, ns] * vm_ns,
        p_calc[pq] - g[pq, pq] * vm_pq**2,
        q_calc[pq] / vm_pq - b[pq, pq] * vm_pq,
    )


def build_jacobian_v2(
    ybus: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    pq_indices: list[int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> np.ndarray:
    """Jakobian rozpływu Newtona-Raphsona — SKŁADANIE BLOKOWE (bez pętli skalarnej).

    FIZYKA NIETKNIĘTA. To jest wyłącznie zmiana SPOSOBU SKŁADANIA tej samej
    macierzy: każdy wyraz ``J[row, col]`` powstaje z DOKŁADNIE tego samego wyrażenia
    i w tej samej kolejności działań, co w pętli skalarnej — zmieniło się tylko to,
    że wyrażenie jest liczone dla całego bloku naraz zamiast wyraz po wyrazie.
    Żaden wyraz nie jest pomijany (również tam, gdzie ``g[i,k] == b[i,k] == 0``),
    więc nie powstają zera o innym znaku niż w pętli, i nie ma tu ŻADNEJ redukcji
    (sumowania po osi), która mogłaby zmienić kolejność dodawań.

    Kolejność działań przepisana wyraz w wyraz z postaci skalarnej:
      J11 poza przekątną  ``v_mag[i] * v_mag[k] * (g*sin - b*cos)``  → ``(vm_i*vm_k)*expr``
      J12 poza przekątną  ``v_mag[i] * (g*cos + b*sin)``
      J21 poza przekątną  ``-v_mag[i] * v_mag[k] * (g*cos + b*sin)`` → ``((-vm_i)*vm_k)*expr``
      J22 poza przekątną  ``v_mag[i] * (g*sin - b*cos)``
    Wyraz przekątniowy (warunek ``i == k`` na indeksach WĘZŁA, nie wiersza/kolumny —
    dla bloków mieszanych ns×pq przekątna nie leży na ``row == col``) wybiera maska
    ``np.equal.outer``, czyli ten sam predykat, który w pętli był instrukcją ``if``.

    KOREKTA ZAŁOŻENIA (2026-08-14, dyspozycja właściciela po pomiarze). Pierwotnie
    stało tu, że wektorowe ``np.sin``/``np.cos`` dają bit w bit to samo, co wywołania
    skalarne. To jest NIEPRAWDA na niektórych procesorach: na tej maszynie różnic nie
    ma (0 na 376 996 wyrazów jakobianu substratu 53 stacji), ale runner CI wybiera
    inną ścieżkę SIMD i ostatni bit sinusa bywa inny. Dlatego:

    * wejście trygonometryczne pochodzi z JEDNEJ funkcji (``trig_bloku``), której
      używa też pin składania — równoważność postaci blokowej i skalarnej jest więc
      własnością KONSTRUKCJI, sprawdzaną bitowo niezależnie od procesora;
    * różnicę wektor-vs-skalar pilnuje OSOBNY pin (``≤ 1 ULP``), bo to własność
      biblioteki, a nie tego kodu.

    Zmierzony wpływ najgorszego przypadku (1 ULP na sinusie, substrat 53 stacji,
    Y-bus 308×308): jakobian ``max |Δ| = 2,8e-17`` (względnie 2,2e-16), krok Newtona
    ``max |Δdx| = 7,0e-12`` — cztery rzędy PONIŻEJ tolerancji zbieżności 1e-8.
    Determinizm w obrębie jednego środowiska jest nietknięty (ten sam wynik przy
    powtórzeniu); bit-identyczność wyniku MIĘDZY maszynami nie była i nie jest
    gwarantowana — tak samo zachowuje się BLAS/LAPACK pod ``scipy``.

    Powód zmiany (karta N1-WYDAJNOSC): profil enumeracji N-1 na substracie 53 stacji
    wskazał tę funkcję jako 76 % czasu WŁASNEGO całej analizy — dla sieci 315 węzłów
    pętla wykonywała ~394 tys. skalarnych wywołań ufunc na jedno złożenie jakobianu.
    """
    g = ybus.real
    b = ybus.imag
    ns = np.asarray(non_slack_indices, dtype=np.intp)
    pq = np.asarray(pq_indices, dtype=np.intp)

    v_mag = np.abs(v)
    v_ang = np.angle(v)

    vm_ns = v_mag[ns]
    vm_pq = v_mag[pq]
    va_ns = v_ang[ns]
    va_pq = v_ang[pq]

    def _blok(
        wiersze: np.ndarray,
        kolumny: np.ndarray,
        vm_w: np.ndarray,
        va_w: np.ndarray,
        va_k: np.ndarray,
        poza_przekatna: Any,
        przekatna: np.ndarray,
    ) -> np.ndarray:
        """Złóż jeden blok: wyraz poza przekątną, wyraz przekątniowy wg maski ``i == k``."""
        sin_t, cos_t = trig_bloku(va_w, va_k)
        wybor = np.ix_(wiersze, kolumny)
        wartosci = poza_przekatna(g[wybor], b[wybor], sin_t, cos_t, vm_w)
        return np.where(np.equal.outer(wiersze, kolumny), przekatna[:, None], wartosci)

    przek_11, przek_12, przek_21, przek_22 = wyrazy_przekatne(
        g, b, vm_ns, vm_pq, p_calc, q_calc, ns, pq
    )

    j11 = _blok(
        ns,
        ns,
        vm_ns,
        va_ns,
        va_ns,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: vm_i[:, None]
        * vm_ns[None, :]
        * (g_ik * sin_t - b_ik * cos_t),
        przek_11,
    )
    j12 = _blok(
        ns,
        pq,
        vm_ns,
        va_ns,
        va_pq,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: vm_i[:, None] * (g_ik * cos_t + b_ik * sin_t),
        przek_12,
    )
    j21 = _blok(
        pq,
        ns,
        vm_pq,
        va_pq,
        va_ns,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: -vm_i[:, None]
        * vm_ns[None, :]
        * (g_ik * cos_t + b_ik * sin_t),
        przek_21,
    )
    j22 = _blok(
        pq,
        pq,
        vm_pq,
        va_pq,
        va_pq,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: vm_i[:, None] * (g_ik * sin_t - b_ik * cos_t),
        przek_22,
    )

    top = np.hstack([j11, j12])
    bottom = np.hstack([j21, j22])
    return np.vstack([top, bottom])


def _build_state_dict(
    v: np.ndarray, node_index_to_id: dict[int, str]
) -> dict[str, dict[str, float]]:
    """P20a: Build deterministic state dict from voltage vector."""
    state = {}
    for idx in sorted(node_index_to_id.keys()):
        if idx < len(v):
            node_id = node_index_to_id[idx]
            state[node_id] = {
                "v_pu": float(np.abs(v[idx])),
                "theta_rad": float(np.angle(v[idx])),
            }
    return state


def _zadania_efektywne_nr(
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    v: np.ndarray,
    zip_table: dict[int, ZipCoeffs] | None,
    inv_table: dict[int, InverterControl] | None,
    zip_const: tuple[np.ndarray, np.ndarray] | None,
) -> tuple[np.ndarray, np.ndarray]:
    """Zadane wstrzyknięcia węzłów przy napięciach ``v`` (ten sam indeks co ``p_spec``).

    ADR-011: ZIP loads scale their base with the polynomial at |V|; defect D1: generation
    on a ZIP bus is constant power — it is added AFTER the load polynomial, never scaled by
    it. ADR-011 §5b: Q(U) volt-var sources recompute Q from |V| each iteration (P is
    frequency-, not voltage-dependent → unchanged). Defect B: ADDED to the bus power, not
    assigned over it — the source's own declared Q was already taken out of the base by
    apply_inverter_setpoint, so what remains is the (ZIP-scaled) load of a prosumer bus.
    Assigning deleted that load's reactive demand. Source-only bus => base is exactly 0.0.
    """
    v_mag_now = np.abs(v)
    p_spec_eff = p_spec.copy()
    q_spec_eff = q_spec.copy()
    if zip_table:
        for z_idx, z_c in zip_table.items():
            p_spec_eff[z_idx] = p_spec[z_idx] * zip_factor(
                z_c.a_p, z_c.b_p, z_c.c_p, v_mag_now[z_idx], z_c.v0_pu
            )
            q_spec_eff[z_idx] = q_spec[z_idx] * zip_factor(
                z_c.a_q, z_c.b_q, z_c.c_q, v_mag_now[z_idx], z_c.v0_pu
            )
            if zip_const is not None:
                p_spec_eff[z_idx] += zip_const[0][z_idx]
                q_spec_eff[z_idx] += zip_const[1][z_idx]
    if inv_table:
        for i_idx, i_c in inv_table.items():
            q_spec_eff[i_idx] += qu_q(i_c, v_mag_now[i_idx])
    return p_spec_eff, q_spec_eff


def newton_raphson_solve_v2(
    ybus: np.ndarray,
    slack_index: int,
    pq_indices: list[int],
    pv_indices: list[int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    pv_setpoints: dict[int, float],
    pv_q_limits: dict[int, tuple[float, float]],
    v0: np.ndarray,
    options: PowerFlowOptions,
    base_mva: float,
    node_index_to_id: dict[int, str],
    zip_table: dict[int, ZipCoeffs] | None = None,
    inv_table: dict[int, InverterControl] | None = None,
    zip_const: tuple[np.ndarray, np.ndarray] | None = None,
    inv_shaping: dict[int, InverterShaping] | None = None,
    scalenie: ScalenieWyspy | None = None,
    pv_pelne: frozenset[int] = frozenset(),
) -> tuple[
    np.ndarray,
    bool,
    int,
    float,
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """Newton-Raphson power flow solver v2 (with PV buses) with optional white-box trace.

    P20a: When options.trace_level == "full", generates complete white-box trace
    including per-bus mismatch, Jacobian, delta_state, and state_next.

    Defect D1: with ``zip_const`` (from split_zip_constant_part) p_spec/q_spec are
    the ZIP BASE (load part) and the constant part (generation on the same bus) is
    added back after the polynomial. None => no split => historical path.

    Defect B: ``inv_shaping`` is the WHITE BOX record of the one-time source
    shaping (from ``apply_inverter_setpoint``) — trace-only, so the auditor can
    reproduce the source's Q from the source's own P.

    Węzły elektryczne (`scalenie`, zamknięte łączniki scalone): ``ybus``, ``v0``, indeksy
    typów, ``pv_setpoints``/``pv_q_limits`` są na indeksie WĘZŁA ELEKTRYCZNEGO; ``p_spec``,
    ``q_spec``, ``zip_table``, ``inv_table``, ``zip_const`` — na indeksie WĘZŁA WYSPY
    (każde zadanie liczone w napięciu swojego węzła elektrycznego, sumowane
    `ScalenieWyspy.zredukuj`). ``pv_pelne`` — indeksy węzłów wyspy ze źródłem PV: granica Q
    dotyczy mocy źródeł (moc węzła elektrycznego minus odbiory grupy), a zadanie Q po
    przełączeniu PV→PQ trafia do pierwszego źródła PV grupy. None albo wyspa bez łącznika —
    dawna ścieżka bit w bit.
    """
    mapa = None if scalenie is None or scalenie.trywialne else scalenie.mapa
    id_pelny = (
        node_index_to_id if scalenie is None or mapa is None else dict(enumerate(scalenie.wezly))
    )
    v = v0.copy()
    trace: list[dict[str, Any]] = []
    pv_to_pq_switches: list[dict[str, Any]] = []
    converged = False
    max_mismatch = 0.0
    full_trace = options.trace_level == "full"

    active_pq = sorted(pq_indices)
    active_pv = sorted(pv_indices)

    for iteration in range(1, options.max_iter + 1):
        if pv_setpoints:
            v_mag = np.abs(v)
            v_ang = np.angle(v)
            for idx in active_pv:
                v_mag[idx] = pv_setpoints[idx]
                v[idx] = v_mag[idx] * np.exp(1j * v_ang[idx])

        p_calc, q_calc = compute_power_injections(ybus, v)
        v_pelne = v if scalenie is None or mapa is None else scalenie.rozwin(v)

        # ADR-011: voltage-dependent (ZIP) injections and Q(U) sources from current |V|,
        # per node of the island (each spec at the voltage of its electrical node). Gated —
        # with no ZIP load and no Q(U) source the base p_spec/q_spec are used unchanged
        # (reduce-to-NR). Evaluated before the PV-limit check (the source-only Q of a merged
        # PV node needs the group's other injections); a PV→PQ switch rewrites only the PV
        # carrier, which has no ZIP/Q(U) term, so the copy is patched there.
        if zip_table or inv_table:
            p_eff_pelne, q_eff_pelne = _zadania_efektywne_nr(
                p_spec, q_spec, v_pelne, zip_table, inv_table, zip_const
            )
        else:
            p_eff_pelne = p_spec
            q_eff_pelne = q_spec

        switched_this_iter = []
        for idx in list(active_pv):
            if idx not in pv_q_limits:
                continue
            q_min_pu, q_max_pu = pv_q_limits[idx]
            q_zrodel = q_calc[idx]
            if scalenie is not None and mapa is not None:
                q_zrodel = q_calc[idx] - q_pozostalych(scalenie, idx, pv_pelne, q_eff_pelne)
            q_calc_consumption = -q_zrodel
            if q_calc_consumption < q_min_pu or q_calc_consumption > q_max_pu:
                limit_pu = q_min_pu if q_calc_consumption < q_min_pu else q_max_pu
                nosnik = idx
                if scalenie is not None and mapa is not None:
                    nosnik = scalenie.nosnik(idx, pv_pelne)
                q_spec[nosnik] = -limit_pu
                if q_eff_pelne is not q_spec:
                    q_eff_pelne[nosnik] = q_spec[nosnik]
                active_pv.remove(idx)
                active_pq.append(idx)
                active_pq.sort()
                node_id = id_pelny[nosnik]
                pv_to_pq_switches.append(
                    {
                        "iter": iteration,
                        "node_id": node_id,
                        "q_calc_mvar": float(q_calc_consumption * base_mva),
                        "limit_mvar": float(limit_pu * base_mva),
                        "direction": "under" if q_calc_consumption < q_min_pu else "over",
                    }
                )
                switched_this_iter.append(node_id)

        non_slack_indices = sorted([idx for idx in active_pq + active_pv if idx != slack_index])

        if scalenie is not None and mapa is not None:
            p_spec_eff = scalenie.zredukuj(p_eff_pelne)
            q_spec_eff = scalenie.zredukuj(q_eff_pelne)
        else:
            p_spec_eff = p_eff_pelne
            q_spec_eff = q_eff_pelne
        d_p = p_spec_eff[non_slack_indices] - p_calc[non_slack_indices]
        d_q = q_spec_eff[active_pq] - q_calc[active_pq]

        mismatch = np.concatenate([d_p, d_q])
        max_mismatch = float(np.max(np.abs(mismatch))) if mismatch.size else 0.0
        mismatch_norm = float(np.linalg.norm(mismatch)) if mismatch.size else 0.0

        # P20a: Build per-bus mismatch dict (deterministic order)
        mismatch_per_bus: dict[str, dict[str, float]] | None = None
        if full_trace:
            mismatch_per_bus = {}
            # P mismatch for all non-slack nodes
            for i, idx in enumerate(non_slack_indices):
                node_id = node_index_to_id.get(idx, str(idx))
                mismatch_per_bus[node_id] = {"delta_p_pu": float(d_p[i])}
            # Q mismatch for PQ nodes only
            for i, idx in enumerate(active_pq):
                node_id = node_index_to_id.get(idx, str(idx))
                if node_id in mismatch_per_bus:
                    mismatch_per_bus[node_id]["delta_q_pu"] = float(d_q[i])
                else:
                    mismatch_per_bus[node_id] = {"delta_p_pu": 0.0, "delta_q_pu": float(d_q[i])}

        if mismatch.size and (not np.isfinite(max_mismatch) or not np.isfinite(mismatch_norm)):
            trace_entry: dict[str, Any] = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "pv_to_pq_optional": switched_this_iter,
                "cause_if_failed_optional": "numerical_issue",
            }
            if full_trace and mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            trace.append(trace_entry)
            break

        if max_mismatch < options.tolerance:
            converged = True
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "pv_to_pq_optional": switched_this_iter,
            }
            if full_trace:
                if mismatch_per_bus:
                    trace_entry["mismatch_per_bus"] = mismatch_per_bus
                trace_entry["state_next"] = _build_state_dict(v, node_index_to_id)
                if zip_table:
                    trace_entry["zip_loads"] = _zip_loads_trace(
                        zip_table,
                        id_pelny,
                        p_spec,
                        q_spec,
                        p_eff_pelne,
                        q_eff_pelne,
                        zip_const,
                    )
                if inv_table or inv_shaping:
                    trace_entry["inverter_sources"] = _inverter_sources_trace(
                        inv_table, inv_shaping, id_pelny, v_pelne, p_eff_pelne, q_eff_pelne
                    )
            trace.append(trace_entry)
            break

        jacobian = build_jacobian_v2(ybus, v, non_slack_indices, active_pq, p_calc, q_calc)
        if zip_table:
            _apply_zip_jacobian_v2(
                jacobian, v, non_slack_indices, active_pq, p_spec, q_spec, zip_table, mapa
            )
        if inv_table:
            _apply_inverter_jacobian_v2(jacobian, v, non_slack_indices, active_pq, inv_table, mapa)
        try:
            step = np.linalg.solve(jacobian, mismatch)
        except np.linalg.LinAlgError:
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "pv_to_pq_optional": switched_this_iter,
                "cause_if_failed_optional": "singular_jacobian",
            }
            if full_trace and mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            trace.append(trace_entry)
            break

        step *= options.damping
        step_norm = float(np.linalg.norm(step)) if step.size else 0.0

        # P20a: Build delta_state before update
        delta_state: dict[str, dict[str, float]] | None = None
        if full_trace:
            delta_state = {}
            n_p = len(non_slack_indices)
            # Theta changes for all non-slack
            for i, idx in enumerate(non_slack_indices):
                node_id = node_index_to_id.get(idx, str(idx))
                delta_state[node_id] = {"delta_theta_rad": float(step[i])}
            # V magnitude changes for PQ only
            for i, idx in enumerate(active_pq):
                node_id = node_index_to_id.get(idx, str(idx))
                if node_id in delta_state:
                    delta_state[node_id]["delta_v_pu"] = float(step[n_p + i])
                else:
                    delta_state[node_id] = {
                        "delta_theta_rad": 0.0,
                        "delta_v_pu": float(step[n_p + i]),
                    }

        v_mag = np.abs(v)
        v_ang = np.angle(v)
        n_p = len(non_slack_indices)
        v_ang[non_slack_indices] += step[:n_p]
        if active_pq:
            v_mag[active_pq] += step[n_p:]

        for idx in non_slack_indices:
            v[idx] = v_mag[idx] * np.exp(1j * v_ang[idx])
        v[slack_index] = v0[slack_index]

        trace_entry = {
            "iter": iteration,
            "max_mismatch_pu": max_mismatch,
            "mismatch_norm": mismatch_norm,
            "step_norm": step_norm,
            "damping_used": float(options.damping),
            "pv_to_pq_optional": switched_this_iter,
        }

        # P20a: Add full trace data
        if full_trace:
            if mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            if delta_state:
                trace_entry["delta_state"] = delta_state
            trace_entry["state_next"] = _build_state_dict(v, node_index_to_id)
            # P20a: Jacobian blocks for v2 (different structure - n_p x n_p for J1, n_p x n_q for J2, etc.)
            n_q = len(active_pq)
            trace_entry["jacobian"] = _serialize_jacobian_blocks_v2(jacobian, n_p, n_q)
            if zip_table:
                trace_entry["zip_loads"] = _zip_loads_trace(
                    zip_table,
                    id_pelny,
                    p_spec,
                    q_spec,
                    p_eff_pelne,
                    q_eff_pelne,
                    zip_const,
                )
            if inv_table or inv_shaping:
                # Stan po kroku: napięcia węzłów wyspy z nowego wektora węzłów elektrycznych.
                trace_entry["inverter_sources"] = _inverter_sources_trace(
                    inv_table,
                    inv_shaping,
                    id_pelny,
                    v if scalenie is None or mapa is None else scalenie.rozwin(v),
                    p_eff_pelne,
                    q_eff_pelne,
                )

        trace.append(trace_entry)

    return v, converged, iteration, max_mismatch, trace, pv_to_pq_switches


def _serialize_jacobian_blocks_v2(
    jacobian: np.ndarray, n_p: int, n_q: int
) -> dict[str, list[list[float]]]:
    """P20a: Serialize Jacobian blocks for v2 solver (with PV buses).

    Structure: [[J1 (n_p x n_p), J2 (n_p x n_q)], [J3 (n_q x n_p), J4 (n_q x n_q)]]
    J1 = dP/dθ, J2 = dP/dV, J3 = dQ/dθ, J4 = dQ/dV
    """
    j1 = jacobian[:n_p, :n_p]
    j2 = jacobian[:n_p, n_p:] if n_q > 0 else np.array([]).reshape(n_p, 0)
    j3 = jacobian[n_p:, :n_p] if n_q > 0 else np.array([]).reshape(0, n_p)
    j4 = jacobian[n_p:, n_p:] if n_q > 0 else np.array([]).reshape(0, 0)
    return {
        "J1_dP_dTheta": [[float(x) for x in row] for row in j1],
        "J2_dP_dV": [[float(x) for x in row] for row in j2],
        "J3_dQ_dTheta": [[float(x) for x in row] for row in j3],
        "J4_dQ_dV": [[float(x) for x in row] for row in j4],
    }


def compute_branch_flows(
    graph: NetworkGraph,
    node_voltage: dict[str, complex],
    base_mva: float,
    slack_voltage_kv: float,
    tap_ratios: dict[str, float] | None = None,
) -> tuple[dict[str, complex], dict[str, complex], dict[str, complex], complex, str]:
    branch_current_pu: dict[str, complex] = {}
    branch_s_from_pu: dict[str, complex] = {}
    branch_s_to_pu: dict[str, complex] = {}
    losses_total_pu = 0.0 + 0.0j

    if not node_voltage:
        return branch_current_pu, branch_s_from_pu, branch_s_to_pu, losses_total_pu, ""

    if slack_voltage_kv <= 0:
        note = "Branch flow calculation skipped: slack voltage_level missing."
        return branch_current_pu, branch_s_from_pu, branch_s_to_pu, losses_total_pu, note

    z_base = (slack_voltage_kv**2) / base_mva

    for branch_id, branch in graph.branches.items():
        if not branch.in_service:
            continue
        if branch.from_node_id not in node_voltage:
            continue
        if branch.to_node_id not in node_voltage:
            continue

        # V12K-187: przekładnia i baza napięciowa TAK SAMO jak w Y-bus — inaczej
        # przepływy nie są spójne z rozwiązanymi napięciami (patrz
        # `_resolve_tap_ratio` i `_base_scale`).
        tap_ratio, _tap_source = _resolve_tap_ratio(graph, branch, tap_ratios or {})
        y_series, y_shunt = _branch_admittance_pu(
            branch, z_base * _base_scale(graph, branch.to_node_id, slack_voltage_kv)
        )
        if y_series is None:
            continue

        v_from = node_voltage[branch.from_node_id]
        v_to = node_voltage[branch.to_node_id]

        # SM-2 (V12K-180): same complex-tap model as the Y-bus so branch flows
        # stay power-balance-consistent with the solved (phase-shifted) voltages.
        theta_shift = 0.0
        if isinstance(branch, TransformerBranch):
            theta_shift = transformer_phase_shift_rad(branch.vector_group)

        if isinstance(branch, TransformerBranch) and (tap_ratio != 1.0 or theta_shift != 0.0):
            e_pos = np.exp(1j * theta_shift)
            e_neg = np.exp(-1j * theta_shift)
            i_from = (v_from / (tap_ratio**2)) * y_series - (v_to / tap_ratio) * e_neg * y_series
            i_to = -(v_from / tap_ratio) * e_pos * y_series + v_to * y_series
        else:
            y_shunt_val = y_shunt if y_shunt is not None else 0j
            i_from = (v_from - v_to) * y_series + v_from * y_shunt_val
            i_to = (v_to - v_from) * y_series + v_to * y_shunt_val

        s_from = v_from * np.conj(i_from)
        s_to = v_to * np.conj(i_to)

        branch_current_pu[branch_id] = i_from
        branch_s_from_pu[branch_id] = s_from
        branch_s_to_pu[branch_id] = s_to
        losses_total_pu += s_from + s_to

    return branch_current_pu, branch_s_from_pu, branch_s_to_pu, losses_total_pu, ""


def _branch_admittance_pu(branch: Branch, z_base: float) -> tuple[complex | None, complex | None]:
    if isinstance(branch, LineBranch):
        y_series = branch.get_series_admittance() * z_base
        y_shunt = branch.get_shunt_admittance_per_end() * z_base
        return y_series, y_shunt
    if isinstance(branch, TransformerBranch):
        impedance = branch.get_short_circuit_impedance_ohm_lv()
        if impedance == 0:
            return None, None
        y_series = (1.0 / impedance) * z_base
        return y_series, 0.0 + 0.0j
    return None, None


def options_to_trace(options: PowerFlowOptions) -> dict[str, Any]:
    return asdict(options)


def _find_duplicates(values: list[str]) -> set[str]:
    seen = set()
    duplicates = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def _base_scale(graph: NetworkGraph, node_id: str, reference_kv: float) -> float:
    """Iloraz baz impedancyjnych: z_base(węzeł) / z_base(odniesienie) = (U/U_ref)².

    V12K-187. ``_build_ybus_ohm`` składa admitancje w SIEMENSACH, każdą liczoną
    NA WŁASNYM poziomie napięcia gałęzi, a ``build_ybus_pu`` mnożyła całą macierz
    przez JEDNO ``z_base`` z napięcia slacka. Dla sieci jednonapięciowej to
    poprawne; przy wielu poziomach napięcia gałęzie spoza poziomu slacka
    dostawały impedancję zaniżoną o (U_gałęzi/U_slack)². Skalujemy więc każdą
    gałąź jej WŁASNYM ilorazem baz, zanim macierz przejdzie przez wspólne
    ``z_base`` — dla sieci o jednym napięciu iloraz wynosi dokładnie 1.0, więc
    Y-bus pozostaje BIT-IDENTYCZNA (mnożenie przez 1.0 jest w IEEE-754 dokładne).

    Baza mocy skraca się w ilorazie, więc funkcja jej nie potrzebuje.
    """
    if reference_kv is None or reference_kv <= 0.0:
        return 1.0
    node = graph.nodes.get(node_id)
    if node is None or node.voltage_level <= 0.0:
        return 1.0
    return (node.voltage_level / reference_kv) ** 2


def _off_nominal_tap(graph: NetworkGraph, branch: TransformerBranch) -> float:
    """Przekładnia POZA-ZNAMIONOWA transformatora: rzeczywista / bazowa.

    V12K-187 (spójnie z V12K-186 w sieci zwarciowej): gdy napięcia znamionowe
    szyn nie są w stosunku równym przekładni z tabliczki, model wymaga idealnego
    transformatora o przekładni a = (U_hv_TR/U_szyny_HV)/(U_lv_TR/U_szyny_LV).
    Szyny zgodne z tabliczką ⇒ a = 1.0 dokładnie ⇒ zero zmian w macierzy.
    """
    hv = graph.nodes.get(branch.from_node_id)
    lv = graph.nodes.get(branch.to_node_id)
    if hv is None or lv is None or hv.voltage_level <= 0.0 or lv.voltage_level <= 0.0:
        return 1.0
    return (branch.voltage_hv_kv / hv.voltage_level) / (branch.voltage_lv_kv / lv.voltage_level)


def _resolve_tap_ratio(
    graph: NetworkGraph, branch: Branch, tap_ratios: dict[str, float]
) -> tuple[float, str | None]:
    """Efektywna przekładnia gałęzi w modelu per-unit + źródło zaczepu.

    JEDNO miejsce rozstrzygania przekładni dla całego rozpływu — Y-bus i tor
    przepływów gałęziowych muszą widzieć TĘ SAMĄ wartość, inaczej przepływy
    przestają być spójne z rozwiązanymi napięciami. Do V12K-187 Y-bus czytała
    zaczep z modelu (``tap_changer`` / ``tap_position``), a przepływy WYŁĄCZNIE
    z nakładki ``tap_ratios``, więc bilans rozjeżdżał się przy pracującym OLTC.

    Kolejność źródeł zaczepu (bez zmian): kanoniczny ``tap_changer`` (to jego
    pozycją steruje pętla regulacji OLTC) → ``tap_position`` → nakładka →
    ``get_tap_ratio()``. Na końcu dochodzi przekładnia POZA-ZNAMIONOWA szyn.
    """
    tap_ratio = 1.0
    tap_source: str | None = None
    if isinstance(branch, TransformerBranch):
        tc = branch.tap_changer
        if tc is not None and tc.is_active():
            # V12K-045: canonical tap changer drives the ratio (its position
            # is what the OLTC control loop mutates). get_tap_ratio() honours
            # the regulated winding.
            tap_ratio = branch.get_tap_ratio()
            if tap_ratio != 1.0:
                tap_source = "core"
        elif branch.tap_position != 0:
            tap_ratio = branch.get_tap_ratio()
            tap_source = "core"
        elif branch.id in tap_ratios:
            tap_ratio = tap_ratios[branch.id]
            tap_source = "overlay"
        else:
            tap_ratio = branch.get_tap_ratio()
            if tap_ratio != 1.0:
                tap_source = "core"
        # V12K-187: do zaczepu dochodzi przekładnia POZA-ZNAMIONOWA wynikająca
        # z różnicy między tabliczką a napięciami znamionowymi szyn (spójnie z
        # siecią zwarciową, V12K-186). Szyny zgodne z tabliczką ⇒ czynnik 1.0.
        tap_ratio = tap_ratio * _off_nominal_tap(graph, branch)
    elif branch.id in tap_ratios:
        tap_ratio = tap_ratios[branch.id]
        tap_source = "overlay"
    return tap_ratio, tap_source


def _build_ybus_ohm(
    graph: NetworkGraph,
    node_id_to_index: dict[str, int],
    tap_ratios: dict[str, float],
    reference_kv: float = 0.0,
    *,
    size: int,
) -> tuple[np.ndarray, list[dict[str, Any]], list[dict[str, Any]]]:
    """Macierz admitancyjna [S] węzłów `node_id_to_index` (indeks = węzeł elektryczny).

    Zamknięty łącznik NIE jest tu stemplowany: nie ma impedancji, jego końce mają ten sam
    indeks (scalenie w `build_ybus_pu`). Dawna impedancja zastępcza 0,0001 + j0,0001 Ω
    (obejście osobliwego jakobianu, K30-14) usunięta — była drugą fizyką łącznika obok
    sieci zwarciowej. Gałąź spoza mapy (inna wyspa) nie jest stemplowana, ale jej zaczep
    i przesunięcie grupy trafiają do śladu jak dotąd (ślad obejmuje wszystkie gałęzie
    grafu). Gałąź o obu końcach w jednym węźle elektrycznym (równoległa do zamkniętego
    łącznika): suma czterech stempli w jednym wyrazie przekątnym — dla gałęzi bez
    przekładni człon podłużny znosi się DOKŁADNIE (to samo napięcie na obu końcach), zostaje
    admitancja poprzeczna obu końców.
    """
    y_bus = np.zeros((size, size), dtype=complex)
    applied_taps: list[dict[str, Any]] = []
    applied_phase_shifts: list[dict[str, Any]] = []

    for branch in graph.branches.values():
        if not branch.in_service:
            continue

        from_idx = node_id_to_index.get(branch.from_node_id)
        to_idx = node_id_to_index.get(branch.to_node_id)

        y_series, y_shunt = _get_branch_admittances_ohm(branch)
        # V12K-187: admitancja jest liczona na WŁASNYM poziomie napięcia gałęzi
        # (linia — napięcie szyn, transformator — strona LV, czyli węzeł `to`),
        # więc odnosimy ją do bazy tego węzła, zanim macierz przejdzie przez
        # wspólne z_base slacka. Sieć jednonapięciowa: iloraz = 1.0 (bez zmian).
        branch_scale = _base_scale(graph, branch.to_node_id, reference_kv)
        y_series = y_series * branch_scale
        y_shunt = y_shunt * branch_scale

        tap_ratio, tap_source = _resolve_tap_ratio(graph, branch, tap_ratios)

        if tap_ratio <= 0:
            raise OdmowaWejsciaRdzenia(
                [
                    RekordOdmowy(
                        KOD_PRZEKLADNIA_NIEDODATNIA,
                        "Przekładnia zaczepów transformatora musi być dodatnia.",
                        _odwolania(RODZAJ_GALAZ, [branch.id]),
                    )
                ]
            )

        if tap_source:
            applied_taps.append(
                {
                    "branch_id": branch.id,
                    "tap_ratio": float(tap_ratio),
                    "source": tap_source,
                }
            )

        # SM-2 (V12K-180): vector-group phase displacement θ (LV leads HV).
        # Consumed here — the phase-shifting-transformer complex-ratio model in
        # the LF Y-bus. θ = 0 (e.g. Yy0) reduces byte-for-byte to the previous
        # off-nominal-tap stamping. from = HV (tapped side), to = LV.
        theta_shift = 0.0
        if isinstance(branch, TransformerBranch):
            theta_shift = transformer_phase_shift_rad(branch.vector_group)

        if isinstance(branch, TransformerBranch) and (tap_ratio != 1.0 or theta_shift != 0.0):
            # Complex tap t = |t|·e^{-jθ} (MATPOWER convention; |t| = off-nominal
            # tap on the HV/from side). Phase-shifting-transformer stamping:
            #   Y_ff = y/|t|²          Y_ft = -y/|t|·e^{-jθ}
            #   Y_tf = -y/|t|·e^{+jθ}  Y_tt = y
            # gives, at no load, v_to = (1/|t|)·e^{+jθ}·v_from → the LV node
            # leads the HV node by θ (Dyn11 → +30°). The off-diagonal asymmetry
            # is physical for a phase shifter.
            e_pos = np.exp(1j * theta_shift)
            e_neg = np.exp(-1j * theta_shift)
            if from_idx is None or to_idx is None:
                pass
            elif from_idx == to_idx:
                y_bus[from_idx, from_idx] += (
                    y_series / (tap_ratio**2)
                    + (-y_series / tap_ratio * e_neg)
                    + (-y_series / tap_ratio * e_pos)
                    + y_series
                )
            else:
                y_bus[from_idx, from_idx] += y_series / (tap_ratio**2)
                y_bus[from_idx, to_idx] += -y_series / tap_ratio * e_neg
                y_bus[to_idx, from_idx] += -y_series / tap_ratio * e_pos
                y_bus[to_idx, to_idx] += y_series
            if theta_shift != 0.0:
                clock = transformer_clock_number(branch.vector_group)
                t_complex = tap_ratio * e_neg
                applied_phase_shifts.append(
                    {
                        "branch_id": branch.id,
                        "vector_group": branch.vector_group,
                        "clock_number": clock,
                        "phase_shift_deg": float(np.rad2deg(theta_shift)),
                        "phase_shift_rad": float(theta_shift),
                        "tap_abs": float(tap_ratio),
                        "tap_complex_real": float(t_complex.real),
                        "tap_complex_imag": float(t_complex.imag),
                    }
                )
        elif from_idx is None or to_idx is None:
            pass
        elif from_idx == to_idx:
            y_bus[from_idx, from_idx] += y_shunt + y_shunt
        else:
            y_bus[from_idx, to_idx] -= y_series
            y_bus[to_idx, from_idx] -= y_series

            y_bus[from_idx, from_idx] += y_series + y_shunt
            y_bus[to_idx, to_idx] += y_series + y_shunt

    return y_bus, applied_taps, applied_phase_shifts


def _get_branch_admittances_ohm(branch: Branch) -> tuple[complex, complex]:
    if isinstance(branch, LineBranch):
        return branch.get_series_admittance(), branch.get_shunt_admittance_per_end()
    if isinstance(branch, TransformerBranch):
        impedance = branch.get_short_circuit_impedance_ohm_lv()
        if impedance == 0:
            raise ZeroDivisionError(
                "Impedancja zwarciowa transformatora jest zerowa — admitancji gałęzi "
                "transformatora nie da się wyznaczyć."
            )
        return 1.0 / impedance, 0.0 + 0.0j
    raise ValueError(
        "Gałąź spoza klas linii i transformatora nie ma modelu admitancji w rozpływie — błąd "
        "programu (komplet klas gałęzi przypina test zamkniętości rodzajów gałęzi)."
    )


def _apply_shunts_pu(
    ybus_pu: np.ndarray,
    node_index_map: dict[str, int],
    shunts: Iterable[ShuntSpec],
) -> list[dict[str, Any]]:
    applied: list[dict[str, Any]] = []
    for shunt in shunts:
        if shunt.node_id not in node_index_map:
            continue
        idx = node_index_map[shunt.node_id]
        ybus_pu[idx, idx] += complex(shunt.g_pu, shunt.b_pu)
        applied.append(
            {
                "node_id": shunt.node_id,
                "g_pu": float(shunt.g_pu),
                "b_pu": float(shunt.b_pu),
                "source": "overlay",
            }
        )
    return applied


@dataclass
class ZadanieRozplywuWyspy:
    """Zadanie rozpływu wyspy zasilanej — JEDNO przygotowanie dla NR, GS i FD.

    Indeksy: ``ybus_pu``, ``v0``, ``slack_index``, ``pq_indices``, ``pv_indices``,
    ``pv_setpoints``, ``pv_q_limits``, ``node_index_to_id`` — węzły ELEKTRYCZNE (zamknięte
    łączniki scalone, `ScalenieWyspy`); ``p_spec``, ``q_spec``, ``zip_table``,
    ``inv_table``, ``zip_const``, ``inv_shaping``, ``q_inv_seed``, ``pv_pelne`` — węzły
    WYSPY (`ScalenieWyspy.indeks_pelny`). ``node_index_map`` przypisuje każdemu węzłowi
    wyspy indeks jego węzła elektrycznego. Wyspa bez zamkniętego łącznika: oba indeksy są
    tym samym (dawna ścieżka bit w bit).
    """

    scalenie: ScalenieWyspy
    ybus_pu: np.ndarray
    node_index_map: dict[str, int]
    node_index_to_id: dict[int, str]
    ybus_trace: dict[str, Any]
    applied_taps: list[dict[str, Any]]
    applied_shunts: list[dict[str, Any]]
    slack_index: int
    pq_indices: list[int]
    pv_indices: list[int]
    v0: np.ndarray
    init_state: dict[str, dict[str, float]] | None
    p_spec: np.ndarray
    q_spec: np.ndarray
    pv_setpoints: dict[int, float]
    pv_q_limits: dict[int, tuple[float, float]]
    pv_pelne: frozenset[int]
    zip_table: dict[int, ZipCoeffs]
    inv_table: dict[int, InverterControl]
    zip_const: tuple[np.ndarray, np.ndarray] | None
    inv_shaping: dict[int, InverterShaping]
    q_inv_seed: dict[int, float]


def _napiecie_poczatkowe_wezlow_elektrycznych(
    scalenie: ScalenieWyspy, v0_pelne: np.ndarray, slack_node_id: str
) -> np.ndarray:
    """Punkt startowy węzłów elektrycznych: wartość reprezentanta, węzeł bilansujący — zadana.

    Punkt startowy nie zmienia rozwiązania (zbieżny stan jest ten sam), więc wybór wartości
    członka grupy dotyczy wyłącznie startu; napięcie zadane węzła bilansującego przechodzi
    na jego węzeł elektryczny dokładnie.
    """
    if scalenie.trywialne:
        return v0_pelne
    v0 = np.array([v0_pelne[scalenie.indeks_pelny[rep]] for rep in scalenie.reprezentanci])
    v0[scalenie.indeks_wezla[slack_node_id]] = v0_pelne[scalenie.indeks_pelny[slack_node_id]]
    return v0


def przygotuj_rozplyw_wyspy(
    pf_input: PowerFlowInput,
    graph: NetworkGraph,
    slack_island_nodes: list[str],
    full_trace: bool,
) -> ZadanieRozplywuWyspy:
    """Macierz, typy węzłów, punkt startowy i zadania mocy wyspy zasilanej (NR/GS/FD).

    Kolejność kroków przygotowania zadań — rozdział ZIP (defekt D1) przed skalowaniem
    częstotliwościowym, kształtowanie źródeł falownikowych (defekt B) po nim — jest tą
    samą, którą solvery wykonywały osobno; tu jest jedna.
    """
    tap_ratios = {spec.branch_id: spec.tap_ratio for spec in pf_input.taps}
    ybus_pu, node_index_map, ybus_trace, applied_taps, applied_shunts = build_ybus_pu(
        graph,
        slack_island_nodes,
        pf_input.base_mva,
        pf_input.slack.node_id,
        pf_input.shunts,
        tap_ratios,
    )
    scalenie = zbuduj_scalenie(graph, slack_island_nodes)
    odmowy = odmowy_wezlow_napieciowych(
        graph, pf_input.pv, pf_input.slack.node_id, pf_input.slack.u_pu, slack_island_nodes
    )
    if odmowy:
        raise OdmowaWejsciaRdzenia(odmowy)
    indeks_pelny = scalenie.indeks_pelny

    pq_node_ids = [spec.node_id for spec in pf_input.pq if spec.node_id in node_index_map]
    pv_node_ids = [spec.node_id for spec in pf_input.pv if spec.node_id in node_index_map]
    if scalenie.trywialne:
        slack_index = node_index_map[pf_input.slack.node_id]
        pq_indices = sorted([node_index_map[node_id] for node_id in pq_node_ids])
        pv_indices = sorted([node_index_map[node_id] for node_id in pv_node_ids])
        node_index_to_id = {idx: node_id for node_id, idx in node_index_map.items()}
    else:
        slack_index, pq_indices, pv_indices = indeksy_typow(
            scalenie, pf_input.slack.node_id, pq_node_ids, pv_node_ids
        )
        node_index_to_id = scalenie.reprezentant_indeksu

    v0_pelne = build_initial_voltage(
        slack_island_nodes,
        pf_input.slack.node_id,
        pf_input.slack.u_pu,
        pf_input.slack.angle_rad,
        pf_input.options,
        graph,
    )
    v0 = _napiecie_poczatkowe_wezlow_elektrycznych(scalenie, v0_pelne, pf_input.slack.node_id)

    # P20a: init_state for the white-box trace (before the PV setpoints and the solver).
    init_state: dict[str, dict[str, float]] | None = None
    if full_trace:
        init_state = {}
        for node_id in sorted(slack_island_nodes):
            idx = node_index_map[node_id]
            init_state[node_id] = {
                "v_pu": float(np.abs(v0[idx])),
                "theta_rad": float(np.angle(v0[idx])),
            }

    p_spec, q_spec, pv_setpoints_pelne, pv_q_limits_pelne = build_power_spec_v2(
        slack_island_nodes, pf_input.base_mva, pf_input.pq, pf_input.pv
    )
    # Defect D1 (audit 2026-08-01): rebase ZIP buses onto their LOAD part and keep the
    # rest (generation) as a constant term. BEFORE the frequency scaling, so P(f) scales
    # the load only. None => nothing to split.
    zip_const = split_zip_constant_part(
        p_spec, q_spec, pf_input.pq, indeks_pelny, pf_input.base_mva
    )
    # ADR-011 ZIP: one-time frequency base scaling (constant w.r.t. V) and the
    # voltage-dependent ZIP table (per-iteration recompute). Empty table => classic
    # constant-power path (reduce-to-NR).
    apply_zip_frequency(p_spec, q_spec, pf_input.pq, indeks_pelny, pf_input.base_frequency_hz)
    zip_table = build_zip_table(pf_input.pq, indeks_pelny)
    # ADR-011 §5b: one-time inverter shaping (LFSM P(f) + cosφ/Q modes); Q(U) sources are
    # recomputed per iteration via inv_table. Defect B: the shaping reads the SOURCE's own
    # power and enters as a component of the bus — on a ZIP bus into the constant part, so
    # the load polynomial never scales it (hence zip_table/zip_const are handed over).
    inv_shaping = apply_inverter_setpoint(
        p_spec,
        q_spec,
        pf_input.pq,
        indeks_pelny,
        pf_input.base_frequency_hz,
        pf_input.base_mva,
        zip_table,
        zip_const,
    )
    inv_table = build_inverter_table(pf_input.pq, indeks_pelny)
    q_inv_seed = inverter_q_seed(inv_table, inv_shaping)

    pv_setpoints, pv_q_limits = zredukuj_pv(scalenie, pv_setpoints_pelne, pv_q_limits_pelne)
    for idx, u_pu in pv_setpoints.items():
        v0[idx] = u_pu * np.exp(1j * np.angle(v0[idx]))

    return ZadanieRozplywuWyspy(
        scalenie=scalenie,
        ybus_pu=ybus_pu,
        node_index_map=node_index_map,
        node_index_to_id=node_index_to_id,
        ybus_trace=ybus_trace,
        applied_taps=applied_taps,
        applied_shunts=applied_shunts,
        slack_index=slack_index,
        pq_indices=pq_indices,
        pv_indices=pv_indices,
        v0=v0,
        init_state=init_state,
        p_spec=p_spec,
        q_spec=q_spec,
        pv_setpoints=pv_setpoints,
        pv_q_limits=pv_q_limits,
        pv_pelne=frozenset(pv_setpoints_pelne),
        zip_table=zip_table,
        inv_table=inv_table,
        zip_const=zip_const,
        inv_shaping=inv_shaping,
        q_inv_seed=q_inv_seed,
    )


def wyniki_rozplywu_wyspy(
    pf_input: PowerFlowInput,
    graph: NetworkGraph,
    zadanie: ZadanieRozplywuWyspy,
    v: np.ndarray,
    slack_island_nodes: list[str],
    not_solved_nodes: list[str],
) -> dict[str, Any]:
    """Wielkości wynikowe wyspy z napięć węzłów elektrycznych — JEDNO miejsce dla NR/GS/FD.

    Węzły grupy scalonej mają napięcie swojego węzła elektrycznego. Moc źródła
    bilansującego i źródeł PV w grupie: moc węzła elektrycznego minus moc pozostałych
    węzłów grupy (`moc_bilansujaca`, `wstrzykniecia_pv`). Przepływ każdego zamkniętego
    łącznika — z bilansu mocy węzłów grupy (`przeplywy_lacznikow`), w śladzie
    ``ybus_trace["scalenie_lacznikow"]``.
    """
    scalenie = zadanie.scalenie
    node_index_map = zadanie.node_index_map
    node_voltage = {node_id: v[node_index_map[node_id]] for node_id in slack_island_nodes}
    node_u_mag = {node_id: float(abs(voltage)) for node_id, voltage in node_voltage.items()}
    node_angle = {node_id: float(np.angle(voltage)) for node_id, voltage in node_voltage.items()}

    # K30-14 NO-GO #10 fix: include not_solved_nodes z NaN marker — bez tego
    # frontend overlay payload pomijał te bus refs, fallbackując do nominal
    # voltage co user widział jako 'flat 15.0 kV everywhere'. NaN signals
    # 'solver did not compute' (vs. 1.0 pu signaling 'solved at nominal').
    # JSON serialization converts NaN → null (via float_nan_to_none helper).
    for not_solved_id in not_solved_nodes:
        node_u_mag[not_solved_id] = float("nan")
        node_angle[not_solved_id] = float("nan")

    slack_voltage_kv = graph.nodes[pf_input.slack.node_id].voltage_level
    (
        branch_current,
        branch_s_from,
        branch_s_to,
        losses_total,
        branch_flow_note,
    ) = compute_branch_flows(
        graph,
        node_voltage,
        pf_input.base_mva,
        slack_voltage_kv,
        {entry["branch_id"]: entry["tap_ratio"] for entry in zadanie.applied_taps},
    )

    node_voltage_kv: dict[str, float] = {}
    missing_voltage_base_nodes: list[str] = []
    for node_id, voltage in node_voltage.items():
        voltage_level = graph.nodes[node_id].voltage_level
        if voltage_level and voltage_level > 0:
            node_voltage_kv[node_id] = float(abs(voltage) * voltage_level)
        else:
            missing_voltage_base_nodes.append(node_id)

    # K30-14 NO-GO #10 fix: not_solved_nodes z NaN kV (signals 'no solver
    # result' — frontend distinguishes from actual computed nominal).
    for not_solved_id in not_solved_nodes:
        if not_solved_id in node_voltage_kv:
            continue
        node_voltage_kv[not_solved_id] = float("nan")

    branch_current_ka: dict[str, float] = {}
    for branch_id, current_pu in branch_current.items():
        branch = graph.branches[branch_id]
        voltage_level = graph.nodes[branch.from_node_id].voltage_level
        if voltage_level and voltage_level > 0:
            i_base_ka = pf_input.base_mva / (np.sqrt(3) * voltage_level)
            branch_current_ka[branch_id] = float(abs(current_pu) * i_base_ka)

    branch_s_from_mva = {
        branch_id: value * pf_input.base_mva for branch_id, value in branch_s_from.items()
    }
    branch_s_to_mva = {
        branch_id: value * pf_input.base_mva for branch_id, value in branch_s_to.items()
    }

    p_calc, q_calc = compute_power_injections(zadanie.ybus_pu, v)
    slack_power = complex(p_calc[zadanie.slack_index], q_calc[zadanie.slack_index])
    # Defect D1: after the split p_spec/q_spec hold only the ZIP base, so the
    # constant part is added back here — this diagnostic keeps its historical
    # meaning (sum of the SPECIFIED PQ powers) and its historical value.
    sum_pq_spec = complex(float(np.sum(zadanie.p_spec)), float(np.sum(zadanie.q_spec)))
    if zadanie.zip_const is not None:
        sum_pq_spec += complex(
            float(np.sum(zadanie.zip_const[0])), float(np.sum(zadanie.zip_const[1]))
        )
    node_p_spec_effective_pu, node_q_spec_effective_pu = effective_pq_injections(
        pf_input.pq,
        scalenie.indeks_pelny,
        zadanie.p_spec,
        zadanie.q_spec,
        scalenie.rozwin(v),
        zadanie.zip_table,
        zadanie.inv_table,
        zadanie.zip_const,
    )
    p_pq = dict(node_p_spec_effective_pu)
    q_pq = dict(node_q_spec_effective_pu)
    slack_power = moc_bilansujaca(scalenie, pf_input.slack.node_id, slack_power, p_pq, q_pq)
    # DLUG W2-D1 (V12K-318) ZAMKNIETY: szyna PV tez wstrzykuje moc — jej moc
    # bierna jest WYNIKIEM zbieznosci, nie zadaniem. Te same slowniki niosa
    # teraz odpowiedz „ile faktycznie wstrzyknela kazda szyna niebilansujaca":
    # dla szyny PQ z wielomianu/regulacji, dla szyny PV z rownania wezlowego.
    # (Nazwa pola pochodzi sprzed rozszerzenia — patrz dlug X1-D1.)
    if scalenie.trywialne:
        node_p_pv_pu, node_q_pv_pu = pv_calculated_injections(
            pf_input.pv, node_index_map, p_calc, q_calc
        )
    else:
        node_p_pv_pu, node_q_pv_pu = wstrzykniecia_pv(
            scalenie, pf_input.pv, p_calc, q_calc, p_pq, q_pq, pf_input.base_mva
        )
    node_p_spec_effective_pu.update(node_p_pv_pu)
    node_q_spec_effective_pu.update(node_q_pv_pu)

    if not scalenie.trywialne:
        zadanie.ybus_trace["scalenie_lacznikow"] = _slad_przeplywow_lacznikow(
            pf_input,
            graph,
            zadanie,
            node_voltage,
            p_pq,
            q_pq,
            node_p_pv_pu,
            node_q_pv_pu,
            slack_power,
            branch_s_from,
            branch_s_to,
            branch_flow_note,
        )

    if branch_flow_note:
        losses_total = 0.0 + 0.0j

    return {
        "node_voltage": node_voltage,
        "node_u_mag": node_u_mag,
        "node_angle": node_angle,
        "node_voltage_kv": node_voltage_kv,
        "branch_current": branch_current,
        "branch_s_from": branch_s_from,
        "branch_s_to": branch_s_to,
        "branch_current_ka": branch_current_ka,
        "branch_s_from_mva": branch_s_from_mva,
        "branch_s_to_mva": branch_s_to_mva,
        "losses_total": losses_total,
        "slack_power": slack_power,
        "sum_pq_spec": sum_pq_spec,
        "branch_flow_note": branch_flow_note,
        "missing_voltage_base_nodes": missing_voltage_base_nodes,
        "node_p_spec_effective_pu": node_p_spec_effective_pu,
        "node_q_spec_effective_pu": node_q_spec_effective_pu,
    }


def _slad_przeplywow_lacznikow(
    pf_input: PowerFlowInput,
    graph: NetworkGraph,
    zadanie: ZadanieRozplywuWyspy,
    node_voltage: dict[str, complex],
    p_pq: dict[str, float],
    q_pq: dict[str, float],
    p_pv: dict[str, float],
    q_pv: dict[str, float],
    slack_power: complex,
    branch_s_from: dict[str, complex],
    branch_s_to: dict[str, complex],
    branch_flow_note: str,
) -> dict[str, Any]:
    """Ślad WHITE BOX węzłów elektrycznych z przepływem mocy i prądem każdego łącznika."""
    scalenie = zadanie.scalenie
    if branch_flow_note:
        slad = slad_grup(scalenie)
        slad["laczniki"] = []
        slad["uwaga"] = (
            "Przepływów łączników nie wyznaczono: brak przepływów gałęzi (" + branch_flow_note + ")"
        )
        return slad
    wstrzykniecia = wstrzykniecia_elementow(
        scalenie,
        pf_input.pq,
        p_pq,
        q_pq,
        p_pv,
        q_pv,
        pf_input.slack.node_id,
        slack_power,
    )
    boczniki = {
        shunt.node_id: complex(shunt.g_pu, shunt.b_pu)
        for shunt in pf_input.shunts
        if shunt.node_id in scalenie.indeks_pelny
    }
    slad = przeplywy_lacznikow(
        scalenie,
        graph,
        node_voltage,
        wstrzykniecia,
        branch_s_from,
        branch_s_to,
        boczniki,
        pf_input.base_mva,
    )
    if any(len(spec_grupy) > 1 for spec_grupy in _zrodla_pv_grup(zadanie)):
        slad["podzial_q_pv"] = PODSTAWA_PODZIALU_Q_PV
    return slad


def _zrodla_pv_grup(zadanie: ZadanieRozplywuWyspy) -> list[list[int]]:
    """Źródła PV (indeksy węzłów wyspy) każdego węzła elektrycznego ze źródłem PV."""
    po_grupach: dict[int, list[int]] = {}
    for pelny in sorted(zadanie.pv_pelne):
        po_grupach.setdefault(int(zadanie.scalenie.mapa[pelny]), []).append(pelny)
    return [po_grupach[k] for k in sorted(po_grupach)]

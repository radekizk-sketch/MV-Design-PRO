"""Serwis aplikacyjny: estymacja stanu WLS na bazie gotowego przebiegu rozpływu.

Warstwa APPLICATION (mapowanie i serializacja, ZERO fizyki). Buduje macierz Y-bus
[pu] z grafu sieci gotowego przebiegu rozpływu (``PF``) przy użyciu ZAMROŻONEGO
buildera (read-only), a następnie deleguje CAŁE obliczenie do solvera estymacji
stanu WLS (``network_model.solvers.state_estimation_wls.estimate_wls``). Estymowany
stan (moduły |V|, kąty θ), rezydua, funkcja celu χ² oraz detekcja złych danych
pochodzą WYŁĄCZNIE z solvera — tu następuje tylko odwzorowanie węzeł↔indeks i
serializacja wyniku.

Domyka wyspę z inwentarza (``docs/uiux/INWENTARZ_FUNKCJI_2026-07.md``): solver WLS
istniał bez punktu wejścia (dispatch/API/UI). Faza 1 = ekspozycja BACKENDOWA.

WEJŚCIA WYMAGANE (No-Heuristics — bez fabrykacji):
- gotowy przebieg rozpływu ``PF`` (status FINISHED) — dostarcza topologię sieci,
  z której budowana jest Y-bus (napięcia/admitancje gałęzi),
- zestaw pomiarów telemetrycznych (SCADA/PMU) w jednostkach względnych (pu) na tej
  samej bazie ``base_mva`` co Y-bus. Bez pomiarów estymacja jest NIEMOŻLIWA — nie
  zmyślamy pseudo-pomiarów z rozwiązania rozpływu (to byłaby fabrykacja).

Mapa węzeł→indeks (``build_state_estimation_requirements``) publikuje identyfikatory
węzłów grafu, którymi pomiary muszą się posługiwać (pole ``bus_ref``/``bus_j_ref``).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from enm.canonical_analysis import CanonicalRun
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.graph import NetworkGraph
from network_model.core.node import NodeType
from network_model.solvers.state_estimation_wls import (
    Measurement,
    MeasurementSet,
    MeasurementType,
    StateEstimationResult,
    estimate_wls,
    ybus_from_network_graph,
)

# Metadane typów pomiarów obsługiwanych przez estymator (do publikacji w widoku
# wymagań — projektant wie, jakie pomiary może dostarczyć i które wymagają węzła
# "do" gałęzi ``bus_j``).
MEASUREMENT_TYPES: tuple[dict[str, Any], ...] = (
    {
        "code": MeasurementType.V_MAGNITUDE.value,
        "label_pl": "Moduł napięcia węzła |V| [pu]",
        "requires_bus_j": False,
    },
    {
        "code": MeasurementType.P_INJECTION.value,
        "label_pl": "Iniekcja mocy czynnej w węźle P [pu]",
        "requires_bus_j": False,
    },
    {
        "code": MeasurementType.Q_INJECTION.value,
        "label_pl": "Iniekcja mocy biernej w węźle Q [pu]",
        "requires_bus_j": False,
    },
    {
        "code": MeasurementType.P_FLOW.value,
        "label_pl": "Przepływ mocy czynnej w gałęzi P_ij [pu]",
        "requires_bus_j": True,
    },
    {
        "code": MeasurementType.Q_FLOW.value,
        "label_pl": "Przepływ mocy biernej w gałęzi Q_ij [pu]",
        "requires_bus_j": True,
    },
)

_UNITS_NOTE_PL = (
    "Pomiary muszą być w jednostkach względnych (pu) na tej samej bazie mocy "
    "(base_mva) co macierz Y-bus. Pomiary przepływu (P_FLOW/Q_FLOW) wymagają węzła "
    "'do' gałęzi (bus_j_ref)."
)


def _require_power_flow_run(run: CanonicalRun) -> None:
    """Estymacja stanu wymaga gotowego przebiegu rozpływu (topologia + Y-bus)."""
    if run.analysis_type != "PF":
        raise ValueError(
            "Estymacja stanu WLS wymaga przebiegu rozpływu mocy (PF); "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "topologia sieci do budowy Y-bus nie jest dostępna."
        )


def _load_graph(run: CanonicalRun) -> NetworkGraph:
    enm = EnergyNetworkModel.model_validate(run.snapshot)
    return map_enm_to_network_graph(enm)


def _base_mva(run: CanonicalRun) -> float:
    try:
        return float(run.options.get("base_mva", 100.0))
    except (TypeError, ValueError):
        return 100.0


def _slack_node_id(graph: NetworkGraph) -> str:
    slack_nodes = sorted(
        node_id for node_id, node in graph.nodes.items() if node.node_type == NodeType.SLACK
    )
    if not slack_nodes:
        raise ValueError("Brak węzła bilansującego SLACK w snapshotcie ENM przebiegu.")
    return slack_nodes[0]


def _voltage_kv_by_node(run: CanonicalRun) -> dict[str, float | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _name_by_node(run: CanonicalRun) -> dict[str, str | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, str | None] = {}
    for node_id, node in graph_nodes.items():
        if isinstance(node, dict):
            name = node.get("name")
            out[str(node_id)] = str(name) if name is not None else None
    return out


def _context(run: CanonicalRun) -> dict[str, Any]:
    header = (run.snapshot or {}).get("header") or {}
    return {
        "project_name": str(header.get("name")) if header.get("name") else None,
        "case_name": str(run.case_id) if run.case_id else None,
        "run_timestamp": run.created_at.isoformat() if run.created_at else None,
        "snapshot_id": run.snapshot_hash,
        "trace_id": str(run.id),
    }


def _prepare(
    run: CanonicalRun,
) -> tuple[NetworkGraph, float, str, np.ndarray, dict[str, int], dict[int, str]]:
    """Wspólny fundament: waliduj przebieg, zbuduj Y-bus i mapę węzeł↔indeks."""
    _require_power_flow_run(run)
    graph = _load_graph(run)
    base_mva = _base_mva(run)
    slack_node_id = _slack_node_id(graph)
    ybus_pu, node_id_to_index = ybus_from_network_graph(graph, base_mva, slack_node_id)
    index_to_node = {index: node_id for node_id, index in node_id_to_index.items()}
    return graph, base_mva, slack_node_id, ybus_pu, node_id_to_index, index_to_node


def build_state_estimation_requirements(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok WYMAGANYCH wejść estymacji stanu (mapa węzeł→indeks, slack).

    Publikuje identyfikatory węzłów grafu (``bus_ref``) i ich indeksy w Y-bus, aby
    projektant wiedział, jakie pomiary telemetryczne dostarczyć. ZERO fizyki.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (PF) lub nie jest zakończony.
    """
    graph, base_mva, slack_node_id, ybus_pu, node_id_to_index, _index_to_node = _prepare(run)
    n_buses = ybus_pu.shape[0]
    n_angles = n_buses - 1  # slack bez kąta
    n_states = n_angles + n_buses
    voltage_kv = _voltage_kv_by_node(run)
    name = _name_by_node(run)

    buses = [
        {
            "bus_ref": node_id,
            "index": index,
            "name": name.get(node_id),
            "voltage_kv": voltage_kv.get(node_id),
            "is_slack": node_id == slack_node_id,
        }
        for node_id, index in sorted(node_id_to_index.items(), key=lambda kv: kv[1])
    ]

    return {
        "analysis_id": str(run.id),
        "context": _context(run),
        "base_mva": base_mva,
        "slack_bus_ref": slack_node_id,
        "slack_index": node_id_to_index[slack_node_id],
        "n_buses": n_buses,
        "n_states": n_states,
        "min_measurements": n_states,
        "buses": buses,
        "measurement_types": [dict(entry) for entry in MEASUREMENT_TYPES],
        "note_pl": _UNITS_NOTE_PL,
    }


def _parse_measurements(
    measurements_in: list[dict[str, Any]],
    node_id_to_index: dict[str, int],
) -> tuple[MeasurementSet, list[dict[str, Any]]]:
    """Odwzoruj pomiary wejściowe (bus_ref → indeks) na ``MeasurementSet``.

    Zwraca zestaw pomiarów oraz listę deskryptorów (do serializacji rezyduów per
    pomiar). Nieznany węzeł / zły typ / brak bus_j → ``ValueError`` (→ 422).
    """
    if not measurements_in:
        raise ValueError(
            "Brak pomiarów: estymacja stanu WLS wymaga zestawu pomiarów telemetrycznych "
            "(SCADA/PMU). Skorzystaj z /api/quality/state-estimation/requirements, aby "
            "poznać wymagane węzły i minimalną liczbę pomiarów."
        )

    measurements: list[Measurement] = []
    descriptors: list[dict[str, Any]] = []
    for raw in measurements_in:
        raw_type = str(raw.get("meas_type") or "").strip()
        try:
            meas_type = MeasurementType(raw_type)
        except ValueError as exc:
            allowed = ", ".join(entry["code"] for entry in MEASUREMENT_TYPES)
            raise ValueError(f"Nieznany typ pomiaru: {raw_type!r} (dozwolone: {allowed}).") from exc

        bus_i_ref = str(raw.get("bus_ref") or raw.get("bus_i_ref") or "")
        if bus_i_ref not in node_id_to_index:
            raise ValueError(f"Pomiar odnosi się do nieistniejącego węzła bus_ref={bus_i_ref!r}.")
        bus_i = node_id_to_index[bus_i_ref]

        bus_j_ref_raw = raw.get("bus_j_ref") or raw.get("bus_j")
        bus_j: int | None = None
        bus_j_ref: str | None = None
        if bus_j_ref_raw is not None and str(bus_j_ref_raw) != "":
            bus_j_ref = str(bus_j_ref_raw)
            if bus_j_ref not in node_id_to_index:
                raise ValueError(
                    f"Pomiar odnosi się do nieistniejącego węzła bus_j_ref={bus_j_ref!r}."
                )
            bus_j = node_id_to_index[bus_j_ref]

        raw_value = raw.get("value")
        raw_sigma = raw.get("sigma")
        if raw_value is None or raw_sigma is None:
            raise ValueError("Pomiar wymaga pól 'value' oraz 'sigma'.")
        value = float(raw_value)
        sigma = float(raw_sigma)
        label = raw.get("label")
        label = str(label) if label is not None else None

        # Measurement.__post_init__ waliduje sigma>0 i spójność bus_j z typem.
        measurements.append(
            Measurement(
                meas_type=meas_type,
                bus_i=bus_i,
                value=value,
                sigma=sigma,
                bus_j=bus_j,
                label=label,
            )
        )
        descriptors.append(
            {
                "meas_type": meas_type.value,
                "bus_ref": bus_i_ref,
                "bus_j_ref": bus_j_ref,
                "value": value,
                "sigma": sigma,
                "label": label,
            }
        )

    return MeasurementSet(tuple(measurements)), descriptors


def _serialize_result(
    result: StateEstimationResult,
    *,
    run: CanonicalRun,
    base_mva: float,
    slack_node_id: str,
    slack_index: int,
    node_id_to_index: dict[str, int],
    index_to_node: dict[int, str],
    descriptors: list[dict[str, Any]],
    include_trace: bool,
) -> dict[str, Any]:
    voltage_kv = _voltage_kv_by_node(run)
    name = _name_by_node(run)

    buses = [
        {
            "bus_ref": index_to_node[index],
            "index": index,
            "name": name.get(index_to_node[index]),
            "voltage_kv": voltage_kv.get(index_to_node[index]),
            "is_slack": index_to_node[index] == slack_node_id,
            "v_magnitude_pu": result.v_magnitudes[index],
            "v_angle_rad": result.v_angles_rad[index],
            "v_angle_deg": math.degrees(result.v_angles_rad[index]),
        }
        for index in range(len(result.v_magnitudes))
    ]

    bad_data = result.bad_data
    normalized = bad_data.normalized_residuals
    measurements: list[dict[str, Any]] = []
    # Rezydua końcowe z solvera: r = z − h(x̂). Bierzemy z ostatniej iteracji śladu
    # (jeśli jest); w innym razie rezydua nie są per-pomiar dostępne poza znormaliz.
    final_residuals: list[float] | None = None
    if result.white_box:
        final_residuals = list(result.white_box[-1].residual_r)
    for idx, descriptor in enumerate(descriptors):
        row = dict(descriptor)
        row["index"] = idx
        row["normalized_residual"] = normalized[idx] if idx < len(normalized) else None
        if final_residuals is not None and idx < len(final_residuals):
            row["residual"] = final_residuals[idx]
        else:
            row["residual"] = None
        row["suspect"] = bool(idx == bad_data.lnr_measurement_index and bad_data.lnr_flag)
        measurements.append(row)

    bad_data_dict = bad_data.to_dict()
    if bad_data.lnr_measurement_index is not None and bad_data.lnr_measurement_index < len(
        descriptors
    ):
        suspect_descriptor = descriptors[bad_data.lnr_measurement_index]
        bad_data_dict["lnr_measurement"] = {
            "index": bad_data.lnr_measurement_index,
            "meas_type": suspect_descriptor["meas_type"],
            "bus_ref": suspect_descriptor["bus_ref"],
            "bus_j_ref": suspect_descriptor["bus_j_ref"],
            "label": suspect_descriptor["label"],
        }
    else:
        bad_data_dict["lnr_measurement"] = None

    # Uczciwe missing_data: węzły grafu, których żaden pomiar nie dotyka (ani jako
    # bus_i, ani bus_j). Jeśli układ jest mimo to nieobserwowalny, solver zgłasza
    # ObservabilityError wcześniej (→ 422) — tu raportujemy tylko pokrycie.
    touched: set[str] = set()
    for descriptor in descriptors:
        touched.add(str(descriptor["bus_ref"]))
        if descriptor["bus_j_ref"] is not None:
            touched.add(str(descriptor["bus_j_ref"]))
    unmeasured = sorted(node for node in node_id_to_index if node not in touched)
    missing_data = [{"code": "wezly_bez_pomiaru", "bus_refs": unmeasured}] if unmeasured else []

    view: dict[str, Any] = {
        "analysis_id": str(run.id),
        "context": _context(run),
        "status": "OK" if result.converged else "BRAK_ZBIEZNOSCI",
        "status_pl": "zbieżny" if result.converged else "brak zbieżności",
        "missing_data": missing_data,
        "solver_version": result.solver_version,
        "validation_status": result.validation_status,
        "estimate_id": result.estimate_id,
        "base_mva": base_mva,
        "slack_bus_ref": slack_node_id,
        "slack_index": slack_index,
        "converged": result.converged,
        "iterations": result.iterations,
        "n_states": result.n_states,
        "m_measurements": result.m_measurements,
        "degrees_of_freedom": result.bad_data.degrees_of_freedom,
        "objective_j": result.objective_j,
        "note": result.note,
        "buses": buses,
        "measurements": measurements,
        "bad_data": bad_data_dict,
    }
    if include_trace:
        view["white_box"] = [
            {
                "iteration": it.iteration,
                "objective_j": it.objective_j,
                "max_abs_residual": it.max_abs_residual,
                "step_norm": it.step_norm,
                "h_jacobian": it.h_jacobian,
                "gain_matrix_g": it.gain_matrix_g,
                "residual_r": it.residual_r,
                "delta_x": it.delta_x,
                "state_x": it.state_x,
            }
            for it in result.white_box
        ]
    return view


def build_state_estimation_view(
    run: CanonicalRun,
    measurements_in: list[dict[str, Any]],
    *,
    alpha: float = 0.01,
    lnr_threshold: float = 3.0,
    include_trace: bool = True,
) -> dict[str, Any]:
    """Zbuduj widok estymacji stanu WLS dla gotowego przebiegu rozpływu.

    Args:
        run: kanoniczny przebieg rozpływu (PF, FINISHED) — źródło topologii/Y-bus.
        measurements_in: lista pomiarów telemetrycznych (dict: meas_type, bus_ref,
            value, sigma, opcjonalnie bus_j_ref/label). Wartości w pu na base_mva.
        alpha: poziom istotności testu chi-kwadrat (detekcja złych danych).
        lnr_threshold: próg odrzucenia znormalizowanej rezyduy (LNR).
        include_trace: czy dołączyć ślad WHITE BOX każdej iteracji (audytowalność).

    Returns:
        Zserializowany widok: estymowany stan per węzeł (|V|, kąt), rezydua per
        pomiar, χ²/LNR, ślad WHITE BOX. Deterministyczny (``estimate_id``).

    Raises:
        ValueError: przebieg nie jest rozpływem / niezakończony / brak pomiarów /
            nieznany węzeł lub typ pomiaru / układ nieobserwowalny (m<n lub G
            osobliwa — ``ObservabilityError`` jest podklasą ``ValueError``).
    """
    (
        _graph,
        base_mva,
        slack_node_id,
        ybus_pu,
        node_id_to_index,
        index_to_node,
    ) = _prepare(run)

    measurement_set, descriptors = _parse_measurements(measurements_in, node_id_to_index)
    slack_index = node_id_to_index[slack_node_id]

    result = estimate_wls(
        ybus_pu,
        measurement_set,
        slack_index,
        alpha=alpha,
        lnr_threshold=lnr_threshold,
        trace=include_trace,
    )

    return _serialize_result(
        result,
        run=run,
        base_mva=base_mva,
        slack_node_id=slack_node_id,
        slack_index=slack_index,
        node_id_to_index=node_id_to_index,
        index_to_node=index_to_node,
        descriptors=descriptors,
        include_trace=include_trace,
    )

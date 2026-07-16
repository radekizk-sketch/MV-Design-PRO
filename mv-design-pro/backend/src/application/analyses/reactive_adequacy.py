"""Serwis aplikacyjny: adekwatność mocy biernej (rezerwy Q, naruszenia napięć).

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
rozpływu (``PF``) — napięcia |V| węzłów oraz punkt pracy Q źródeł — a także
granice mocy biernej źródeł (regulator/karta katalogowa) i buduje wejścia dla
gotowego buildera interpretacji ``analysis.reactive_adequacy``. ZERO obliczeń
fizycznych — napięcia pochodzą z solvera power-flow, granice Q z katalogu.

Odwzorowania (plik:linia w kodzie źródłowym):
- ``v_pu`` ← ``build_bus_results(run)`` → wiersz ``u_pu`` per węzeł
  (``enm.canonical_analysis.build_bus_results``),
- ``u_min_pu`` / ``u_max_pu`` ← ``Bus.nominal_limits`` ze snapshotu,
- ``q_actual_mvar`` ← ``Generator.q_mvar`` (punkt pracy PQ ze snapshotu),
- ``q_min_mvar`` / ``q_max_mvar`` ← ``GenLimits`` lub ``ConverterType.qmin/qmax``,
- ``limits_field_quality`` ← ``resolve_card_field_quality_map`` (najgorsza jakość
  pól Q-granic karty przekształtnika), jak w SSCI.
"""

from __future__ import annotations

from typing import Any

from analysis.reactive_adequacy.builder import ReactiveAdequacyBuilder
from analysis.reactive_adequacy.models import (
    BusVoltageInput,
    LoadReactiveInput,
    ReactiveAdequacyContext,
    SourceReactiveInput,
    worst_field_quality,
)
from enm.canonical_analysis import CanonicalRun, build_bus_results

# Pola Q-granic karty przekształtnika (proweniencja werdyktu).
_Q_LIMIT_CARD_FIELDS = ("qmin_mvar", "qmax_mvar")


def _resolve_converter(catalog_ref: str | None) -> Any | None:
    if not catalog_ref:
        return None
    from network_model.catalog.repository import get_default_mv_catalog

    return get_default_mv_catalog().get_converter_type(str(catalog_ref))


def _q_limits_field_quality(converter: Any | None) -> Any | None:
    """Najgorsza jakość pól Q-granic karty przekształtnika (``FieldQuality``).

    Kompozycja jak w SSCI: mapa jakości pól z ``resolve_card_field_quality_map``,
    najgorsza spośród ``qmin_mvar`` / ``qmax_mvar``. Brak przekształtnika → None.
    """
    if converter is None:
        return None
    from solver_input.provenance import resolve_card_field_quality_map

    quality_map = resolve_card_field_quality_map(converter)
    qualities = [quality_map[name].quality for name in _Q_LIMIT_CARD_FIELDS if name in quality_map]
    if not qualities:
        return None
    return worst_field_quality(qualities)


def _source_reactive_input(gen: dict[str, Any]) -> SourceReactiveInput:
    """Odwzoruj generator (źródło Q) na wejście buildera adekwatności."""
    limits = gen.get("limits") or {}
    q_min = limits.get("q_min_mvar")
    q_max = limits.get("q_max_mvar")

    converter = _resolve_converter(gen.get("catalog_ref"))
    if q_min is None and converter is not None:
        q_min = getattr(converter, "qmin_mvar", None)
    if q_max is None and converter is not None:
        q_max = getattr(converter, "qmax_mvar", None)

    return SourceReactiveInput(
        ref=str(gen.get("ref_id")),
        bus_ref=(str(gen["bus_ref"]) if isinstance(gen.get("bus_ref"), str) else None),
        q_actual_mvar=(float(gen["q_mvar"]) if gen.get("q_mvar") is not None else None),
        q_min_mvar=(float(q_min) if q_min is not None else None),
        q_max_mvar=(float(q_max) if q_max is not None else None),
        limits_field_quality=_q_limits_field_quality(converter),
    )


def _bus_voltage_inputs(run: CanonicalRun) -> list[BusVoltageInput]:
    limits_by_bus: dict[str, dict[str, Any]] = {}
    for bus in (run.snapshot or {}).get("buses") or []:
        if isinstance(bus, dict) and isinstance(bus.get("ref_id"), str):
            limits_by_bus[bus["ref_id"]] = bus.get("nominal_limits") or {}

    out: list[BusVoltageInput] = []
    for row in build_bus_results(run).get("rows", []):
        bus_ref = row.get("element_id")
        if not isinstance(bus_ref, str):
            continue
        limits = limits_by_bus.get(bus_ref, {})
        v_pu = row.get("u_pu")
        out.append(
            BusVoltageInput(
                bus_ref=bus_ref,
                v_pu=(float(v_pu) if v_pu is not None else None),
                u_min_pu=(
                    float(limits["u_min_pu"]) if limits.get("u_min_pu") is not None else None
                ),
                u_max_pu=(
                    float(limits["u_max_pu"]) if limits.get("u_max_pu") is not None else None
                ),
            )
        )
    return out


def _source_inputs(snapshot: dict[str, Any]) -> list[SourceReactiveInput]:
    return [
        _source_reactive_input(gen)
        for gen in snapshot.get("generators") or []
        if isinstance(gen, dict) and isinstance(gen.get("ref_id"), str)
    ]


def _load_inputs(snapshot: dict[str, Any]) -> list[LoadReactiveInput]:
    out: list[LoadReactiveInput] = []
    for load in snapshot.get("loads") or []:
        if not isinstance(load, dict) or not isinstance(load.get("ref_id"), str):
            continue
        q = load.get("q_mvar")
        out.append(
            LoadReactiveInput(ref=load["ref_id"], q_mvar=(float(q) if q is not None else None))
        )
    return out


def _context(run: CanonicalRun) -> ReactiveAdequacyContext:
    header = (run.snapshot or {}).get("header") or {}
    return ReactiveAdequacyContext(
        project_name=str(header.get("name")) if header.get("name") else None,
        case_name=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_id=run.snapshot_hash,
        trace_id=str(run.id),
    )


def build_reactive_adequacy_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok adekwatności mocy biernej dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Adekwatność mocy biernej wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )

    snapshot = run.snapshot or {}
    result_v1 = (run.raw_result or {}).get("result_v1") or {}
    converged = bool(result_v1.get("converged", False))

    view = ReactiveAdequacyBuilder().build(
        buses=_bus_voltage_inputs(run),
        sources=_source_inputs(snapshot),
        loads=_load_inputs(snapshot),
        context=_context(run),
        power_flow_converged=converged,
    )
    return view.to_dict()

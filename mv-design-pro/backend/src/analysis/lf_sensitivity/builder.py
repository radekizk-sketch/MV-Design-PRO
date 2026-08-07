from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from analysis.koperta_kontekstu import pola_koperty
from analysis.lf_sensitivity.models import (
    LFSensitivityContext,
    LFSensitivityDriver,
    LFSensitivityEntry,
    LFSensitivitySummary,
    LFSensitivityView,
    compute_lf_sensitivity_id,
)
from analysis.normative.models import NormativeReport
from analysis.voltage_profile.models import VoltageProfileView
from application.proof_engine.types import ProofDocument, ProofType

DEFAULT_DELTA_PCT = 5.0
DEFAULT_TOP_N = 5


@dataclass(frozen=True)
class _ElementModel:
    element_id: str
    to_bus_id: str | None
    r_ohm: float | None
    x_ohm: float | None
    p_mw: float | None
    q_mvar: float | None
    u_nom_kv: float | None
    delta_u_r_kv: float | None
    delta_u_x_kv: float | None
    delta_u_kv: float | None


class LFSensitivityBuilder:
    def __init__(self, delta_pct: float = DEFAULT_DELTA_PCT, top_n: int = DEFAULT_TOP_N) -> None:
        self._delta_pct = float(delta_pct)
        self._top_n = int(top_n)

    def build(
        self,
        proof_p32: ProofDocument | None,
        voltage_profile: VoltageProfileView | None,
        normative_report: NormativeReport | None,
    ) -> LFSensitivityView:
        context = _resolve_context(proof_p32, voltage_profile, normative_report)
        element_data = _extract_element_data(proof_p32) if proof_p32 else []

        entries: list[LFSensitivityEntry] = []
        if voltage_profile is not None:
            for row in sorted(voltage_profile.rows, key=lambda item: item.bus_id):
                entry = _build_entry_for_bus(
                    row_bus_id=row.bus_id,
                    base_delta_pct=row.delta_pct,
                    u_nom_kv=row.u_nom_kv,
                    thresholds=voltage_profile.thresholds,
                    delta_pct=self._delta_pct,
                    elements=element_data,
                    proof_available=proof_p32 is not None
                    and proof_p32.proof_type == ProofType.LOAD_FLOW_VOLTAGE,
                )
                entries.append(entry)

        entries_sorted = tuple(entries)
        summary = LFSensitivitySummary(
            total_entries=len(entries_sorted),
            not_computed_count=sum(1 for entry in entries_sorted if entry.missing_data),
        )
        top_drivers = _rank_drivers(entries_sorted, self._top_n)
        analysis_id = compute_lf_sensitivity_id(context, self._delta_pct, entries_sorted)

        return LFSensitivityView(
            analysis_id=analysis_id,
            context=context,
            delta_pct=self._delta_pct,
            entries=entries_sorted,
            summary=summary,
            top_drivers=top_drivers,
        )


def _resolve_context(
    proof_p32: ProofDocument | None,
    voltage_profile: VoltageProfileView | None,
    normative_report: NormativeReport | None,
) -> LFSensitivityContext | None:
    for ctx in (
        voltage_profile.context if voltage_profile else None,
        normative_report.context if normative_report else None,
    ):
        if ctx is not None:
            return LFSensitivityContext(**pola_koperty(ctx))
    if proof_p32 is not None:
        header = proof_p32.header
        return LFSensitivityContext(
            project_name=header.project_name,
            case_name=header.case_name,
            run_timestamp=header.run_timestamp,
            snapshot_id=None,
            trace_id=str(proof_p32.artifact_id),
        )
    return None


def _extract_element_data(proof_p32: ProofDocument | None) -> list[_ElementModel]:
    if proof_p32 is None or proof_p32.proof_type != ProofType.LOAD_FLOW_VOLTAGE:
        return []

    elements: dict[str, dict[str, float | str | None]] = {}

    for step in proof_p32.steps:
        element_id = step.source_keys.get("element_id")
        if not element_id:
            continue
        entry = elements.setdefault(element_id, {})
        entry["to_bus_id"] = step.source_keys.get("to_bus_id")
        values = {val.symbol: val.value for val in step.input_values}
        eq_id = step.equation.equation_id

        if eq_id == "EQ_LF_003":
            entry["r_ohm"] = values.get("R")
            entry["p_mw"] = values.get("P")
            entry["u_nom_kv"] = values.get("U_{n}")
            entry["delta_u_r_kv"] = step.result.value
        elif eq_id == "EQ_LF_004":
            entry["x_ohm"] = values.get("X")
            entry["q_mvar"] = values.get("Q")
            entry["u_nom_kv"] = values.get("U_{n}")
            entry["delta_u_x_kv"] = step.result.value
        elif eq_id == "EQ_LF_005":
            entry["delta_u_kv"] = step.result.value

    models: list[_ElementModel] = []
    for element_id, entry in sorted(elements.items()):
        models.append(
            _ElementModel(
                element_id=element_id,
                to_bus_id=_string_or_none(entry.get("to_bus_id")),
                r_ohm=_numeric_or_none(entry.get("r_ohm")),
                x_ohm=_numeric_or_none(entry.get("x_ohm")),
                p_mw=_numeric_or_none(entry.get("p_mw")),
                q_mvar=_numeric_or_none(entry.get("q_mvar")),
                u_nom_kv=_numeric_or_none(entry.get("u_nom_kv")),
                delta_u_r_kv=_numeric_or_none(entry.get("delta_u_r_kv")),
                delta_u_x_kv=_numeric_or_none(entry.get("delta_u_x_kv")),
                delta_u_kv=_numeric_or_none(entry.get("delta_u_kv")),
            )
        )
    return models


def _numeric_or_none(value: float | str | None) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None


def _string_or_none(value: float | str | None) -> str | None:
    if isinstance(value, str):
        return value
    return None


def _build_entry_for_bus(
    *,
    row_bus_id: str,
    base_delta_pct: float | None,
    u_nom_kv: float | None,
    thresholds: dict[str, float],
    delta_pct: float,
    elements: Iterable[_ElementModel],
    proof_available: bool,
) -> LFSensitivityEntry:
    missing: list[str] = []

    warn = thresholds.get("voltage_warn_pct")
    fail = thresholds.get("voltage_fail_pct")
    if warn is None:
        missing.append("threshold_warn_pct")
    if fail is None:
        missing.append("threshold_fail_pct")
    if base_delta_pct is None:
        missing.append("base_delta_pct")
    if u_nom_kv is None or u_nom_kv == 0:
        missing.append("u_nom_kv")
    if not proof_available:
        missing.append("proof_p32")

    element_list = [item for item in elements if item.to_bus_id == row_bus_id]
    if not element_list:
        missing.append("element_data")

    if missing or warn is None or fail is None or u_nom_kv is None:
        return LFSensitivityEntry(
            bus_id=row_bus_id,
            base_delta_pct=base_delta_pct,
            threshold_warn_pct=warn,
            threshold_fail_pct=fail,
            drivers=(),
            missing_data=tuple(sorted(set(missing))),
        )

    drivers: list[LFSensitivityDriver] = []
    total_delta_u_r = 0.0
    total_delta_u_x = 0.0
    total_delta_u = 0.0

    for element in element_list:
        if (
            element.r_ohm is None
            or element.x_ohm is None
            or element.p_mw is None
            or element.q_mvar is None
            or element.delta_u_r_kv is None
            or element.delta_u_x_kv is None
        ):
            continue
        total_delta_u_r += float(element.delta_u_r_kv)
        total_delta_u_x += float(element.delta_u_x_kv)
        if element.delta_u_kv is not None:
            total_delta_u += float(element.delta_u_kv)
        else:
            total_delta_u += float(element.delta_u_r_kv) + float(element.delta_u_x_kv)

        drivers.extend(
            _drivers_for_element(
                bus_id=row_bus_id,
                element=element,
                u_nom_kv=float(u_nom_kv),
                base_delta_pct=base_delta_pct,
                warn=float(warn),
                fail=float(fail),
                delta_pct=delta_pct,
            )
        )

    if not drivers:
        return LFSensitivityEntry(
            bus_id=row_bus_id,
            base_delta_pct=base_delta_pct,
            threshold_warn_pct=warn,
            threshold_fail_pct=fail,
            drivers=(),
            missing_data=("element_inputs",),
        )

    drivers.extend(
        _drivers_for_u_nom(
            bus_id=row_bus_id,
            base_delta_pct=base_delta_pct,
            warn=float(warn),
            fail=float(fail),
            delta_pct=delta_pct,
            u_nom_kv=float(u_nom_kv),
            total_delta_u=total_delta_u,
        )
    )

    drivers_sorted = tuple(sorted(drivers, key=_driver_sort_key))

    return LFSensitivityEntry(
        bus_id=row_bus_id,
        base_delta_pct=base_delta_pct,
        threshold_warn_pct=warn,
        threshold_fail_pct=fail,
        drivers=drivers_sorted,
        missing_data=(),
    )


def _drivers_for_element(
    *,
    bus_id: str,
    element: _ElementModel,
    u_nom_kv: float,
    base_delta_pct: float | None,
    warn: float,
    fail: float,
    delta_pct: float,
) -> list[LFSensitivityDriver]:
    drivers: list[LFSensitivityDriver] = []
    base_delta = base_delta_pct if base_delta_pct is not None else 0.0

    delta_u_r = float(element.delta_u_r_kv or 0.0)
    delta_u_x = float(element.delta_u_x_kv or 0.0)

    for parameter, delta_u in (
        (f"P_{element.element_id}", delta_u_r),
        (f"R_{element.element_id}", delta_u_r),
        (f"Q_{element.element_id}", delta_u_x),
        (f"X_{element.element_id}", delta_u_x),
    ):
        if u_nom_kv == 0:
            continue
        for sign in (-1.0, 1.0):
            delta_delta_pct = (delta_u / u_nom_kv) * delta_pct * sign
            perturbation = _format_perturbation(delta_pct * sign)
            delta_margin, margin_ref = _delta_margin_delta(
                base_delta=base_delta,
                delta_delta_pct=delta_delta_pct,
                warn=warn,
                fail=fail,
            )
            # PL bez kodenamów (CLAUDE.md §8): why_pl trafia wprost do interfejsu
            # (zakładka „Wrażliwość"), więc nazwa progu i źródło danych po polsku.
            why = (
                "Wpływ parametru z dowodu spadków napięć rozpływu; "
                f"margines względem progu: {_etykieta_progu(margin_ref)}."
            )
            drivers.append(
                LFSensitivityDriver(
                    bus_id=bus_id,
                    parameter=parameter,
                    perturbation=perturbation,
                    delta_delta_pct=delta_delta_pct,
                    delta_margin_pct=delta_margin,
                    why_pl=why,
                )
            )

    return drivers


def _drivers_for_u_nom(
    *,
    bus_id: str,
    base_delta_pct: float | None,
    warn: float,
    fail: float,
    delta_pct: float,
    u_nom_kv: float,
    total_delta_u: float,
) -> list[LFSensitivityDriver]:
    drivers: list[LFSensitivityDriver] = []
    base_delta_model = 100.0 * total_delta_u / u_nom_kv if u_nom_kv else 0.0
    base_delta = base_delta_pct if base_delta_pct is not None else base_delta_model

    for sign in (-1.0, 1.0):
        u_nom_new = u_nom_kv * (1.0 + sign * delta_pct / 100.0)
        if u_nom_new == 0:
            continue
        delta_pct_new = base_delta_model * (u_nom_kv**2) / (u_nom_new**2)
        delta_delta_pct = delta_pct_new - base_delta_model
        perturbation = _format_perturbation(delta_pct * sign)
        delta_margin, margin_ref = _delta_margin_delta(
            base_delta=base_delta,
            delta_delta_pct=delta_delta_pct,
            warn=warn,
            fail=fail,
        )
        why = (
            "Wpływ napięcia znamionowego z dowodu spadków napięć rozpływu; "
            f"margines względem progu: {_etykieta_progu(margin_ref)}."
        )
        drivers.append(
            LFSensitivityDriver(
                bus_id=bus_id,
                parameter="U_n",
                perturbation=perturbation,
                delta_delta_pct=delta_delta_pct,
                delta_margin_pct=delta_margin,
                why_pl=why,
            )
        )

    return drivers


def _etykieta_progu(margin_ref: str) -> str:
    """Polska etykieta progu odniesienia marginesu (token wewnętrzny → PL)."""
    return "ostrzeżenie" if margin_ref == "warning" else "przekroczenie"


def _format_perturbation(delta_pct: float) -> str:
    sign = "+" if delta_pct > 0 else ""
    return f"{sign}{delta_pct:.1f}%"


def _delta_margin_delta(
    *,
    base_delta: float,
    delta_delta_pct: float,
    warn: float,
    fail: float,
) -> tuple[float, str]:
    base_margin, margin_ref = _margin_to_threshold(base_delta, warn, fail)
    new_margin, _ = _margin_to_threshold(base_delta + delta_delta_pct, warn, fail)
    return new_margin - base_margin, margin_ref


def _margin_to_threshold(
    delta_pct: float,
    warn: float,
    fail: float,
) -> tuple[float, str]:
    abs_delta = abs(delta_pct)
    margin_warn = warn - abs_delta
    margin_fail = fail - abs_delta
    if margin_warn <= margin_fail:
        return margin_warn, "warning"
    return margin_fail, "fail"


def _driver_sort_key(driver: LFSensitivityDriver) -> tuple[float, str, str, str]:
    return (-abs(driver.delta_delta_pct), driver.parameter, driver.perturbation, driver.bus_id)


def _rank_drivers(
    entries: Iterable[LFSensitivityEntry],
    top_n: int,
) -> tuple[LFSensitivityDriver, ...]:
    drivers: list[LFSensitivityDriver] = []
    for entry in entries:
        drivers.extend(entry.drivers)
    drivers_sorted = sorted(drivers, key=_driver_sort_key)
    return tuple(drivers_sorted[:top_n])

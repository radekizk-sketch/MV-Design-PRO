"""
Protection Sanity Checks — Rule Implementations.

BINDING RULE SET:
1. Napieciowe (27/59):
   - ERROR brak Un dla basis='UN'
   - ERROR jednoczesnie U< i U> oraz U< >= U> (p.u.)
   - WARN U< < 0.5×Un
   - WARN U> > 1.2×Un

2. Czestotliwosciowe (81U/81O):
   - ERROR f< >= f>
   - WARN f< < 45 Hz
   - WARN f> > 55 Hz

3. ROCOF (81R):
   - WARN df/dt <= 0
   - WARN df/dt > 10 Hz/s

4. Nadpradowe (50/51):
   - ERROR brak In dla basis='IN'
   - ERROR I> >= I>> (p.u.)
   - WARN I> < 1.0×In
   - WARN I>> < 1.5×In

5. SPZ (79):
   - WARN SPZ aktywne bez funkcji wyzwalajacych
   - INFO brak danych cyklu SPZ

6. Ogolne:
   - ERROR setpoint niefizyczny (ujemny)
   - INFO brak danych bazowych → analiza czesciowa

100% POLISH MESSAGES.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.protection.base_values.models import (
    BaseValues,
    ProtectionSetpoint,
    ProtectionSetpointBasis,
)
from application.analyses.protection.sanity_checks.models import (
    ProtectionSanityCheckResult,
    SanityCheckCode,
    SanityCheckSeverity,
)

# =============================================================================
# Function Summary Model (Backend equivalent of TypeScript interface)
# =============================================================================


@dataclass(frozen=True)
class ProtectionFunctionSummary:
    """
    Podsumowanie funkcji zabezpieczeniowej (backend equivalent).

    Attributes:
        code: kod funkcji wewnetrzny (UNDERVOLTAGE, OVERCURRENT_TIME, etc.)
        ansi: kody ANSI/IEEE C37.2 (np. ['27'], ['50', '51'])
        label_pl: etykieta polska
        setpoint: nastawa — ZRODLO PRAWDY
        time_delay_s: czas opoznienia [s] (opcjonalny)
        curve_type: charakterystyka czasowa (opcjonalny)
        notes_pl: notatki (opcjonalny)
    """

    code: str
    ansi: tuple[str, ...]
    label_pl: str
    setpoint: ProtectionSetpoint
    time_delay_s: float | None = None
    curve_type: str | None = None
    notes_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "code": self.code,
            "ansi": list(self.ansi),
            "label_pl": self.label_pl,
            "setpoint": self.setpoint.to_dict(),
            "time_delay_s": self.time_delay_s,
            "curve_type": self.curve_type,
            "notes_pl": self.notes_pl,
        }


# =============================================================================
# Element Context Model (for sanity checks)
# =============================================================================


@dataclass(frozen=True)
class ElementContext:
    """
    Kontekst elementu dla sanity checks.

    Attributes:
        element_id: identyfikator elementu
        element_type: typ elementu (LINE, TRANSFORMER, BUS, BoundaryNode, etc.)
    """

    element_id: str
    element_type: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "element_id": self.element_id,
            "element_type": self.element_type,
        }


# =============================================================================
# Helper Functions
# =============================================================================


def _get_multiplier(setpoint: ProtectionSetpoint) -> float | None:
    """Pobierz multiplier z setpoint (dla basis IN/UN)."""
    return setpoint.multiplier


def _get_abs_value(setpoint: ProtectionSetpoint) -> float | None:
    """Pobierz abs_value z setpoint (dla basis ABS)."""
    return setpoint.abs_value


def _find_function_by_codes(
    functions: list[ProtectionFunctionSummary],
    codes: tuple[str, ...],
) -> ProtectionFunctionSummary | None:
    """Znajdz funkcje po kodach wewnetrznych."""
    for fn in functions:
        if fn.code in codes:
            return fn
    return None


def _find_function_by_ansi(
    functions: list[ProtectionFunctionSummary],
    ansi_codes: tuple[str, ...],
) -> ProtectionFunctionSummary | None:
    """Znajdz funkcje po kodach ANSI."""
    for fn in functions:
        if any(ansi in fn.ansi for ansi in ansi_codes):
            return fn
    return None


def _has_tripping_function(functions: list[ProtectionFunctionSummary]) -> bool:
    """Sprawdz czy istnieje funkcja wyzwalajaca (overcurrent, earth fault, etc.)."""
    tripping_codes = (
        "OVERCURRENT_INST",
        "OVERCURRENT_TIME",
        "EARTH_FAULT_INST",
        "EARTH_FAULT_TIME",
        "UNDERVOLTAGE",
        "OVERVOLTAGE",
        "UNDERFREQUENCY",
        "OVERFREQUENCY",
        "DISTANCE",
        "DIFFERENTIAL",
    )
    return any(fn.code in tripping_codes for fn in functions)


# =============================================================================
# Rule: General — Negative Setpoint
# =============================================================================


def check_negative_setpoint(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    ERROR: setpoint niefizyczny (ujemny multiplier lub abs_value).
    """
    results: list[ProtectionSanityCheckResult] = []

    for fn in functions:
        sp = fn.setpoint
        value: float | None = None

        if sp.basis in (ProtectionSetpointBasis.IN, ProtectionSetpointBasis.UN):
            value = sp.multiplier
        elif sp.basis == ProtectionSetpointBasis.ABS:
            value = sp.abs_value

        if value is not None and value < 0:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.ERROR,
                    code=SanityCheckCode.GEN_NEGATIVE_SETPOINT,
                    message_pl=f"Nastawa {fn.label_pl} ({sp.display_pl}) jest ujemna — wartosc niefizyczna",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi=fn.ansi[0] if fn.ansi else None,
                    function_code=fn.code,
                    evidence={"setpoint_display": sp.display_pl, "value": value},
                )
            )

    return results


# =============================================================================
# Rule: General — Missing Base Values
# =============================================================================


def check_missing_base_values(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    INFO: brak danych bazowych (Un/In) → analiza czesciowa.
    """
    results: list[ProtectionSanityCheckResult] = []

    needs_un = any(fn.setpoint.basis == ProtectionSetpointBasis.UN for fn in functions)
    needs_in = any(fn.setpoint.basis == ProtectionSetpointBasis.IN for fn in functions)

    if needs_un and not base_values.has_un:
        results.append(
            ProtectionSanityCheckResult(
                severity=SanityCheckSeverity.INFO,
                code=SanityCheckCode.GEN_PARTIAL_ANALYSIS,
                message_pl="Brak wartosci Un — analiza napieciowa czesciowa",
                element_id=ctx.element_id,
                element_type=ctx.element_type,
                evidence={"missing": "Un", "source_un": base_values.source_un.value},
            )
        )

    if needs_in and not base_values.has_in:
        results.append(
            ProtectionSanityCheckResult(
                severity=SanityCheckSeverity.INFO,
                code=SanityCheckCode.GEN_PARTIAL_ANALYSIS,
                message_pl="Brak wartosci In — analiza pradowa czesciowa",
                element_id=ctx.element_id,
                element_type=ctx.element_type,
                evidence={"missing": "In", "source_in": base_values.source_in.value},
            )
        )

    return results


# =============================================================================
# Rule: Voltage (27/59)
# =============================================================================


def check_voltage_rules(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    Reguly napieciowe (27/59):
    - ERROR brak Un dla basis='UN'
    - ERROR jednoczesnie U< i U> oraz U< >= U> (p.u.)
    - WARN U< < 0.5×Un
    - WARN U> > 1.2×Un
    """
    results: list[ProtectionSanityCheckResult] = []

    # Znajdz funkcje napieciowe
    undervoltage_fn = _find_function_by_codes(functions, ("UNDERVOLTAGE",))
    overvoltage_fn = _find_function_by_codes(functions, ("OVERVOLTAGE",))

    voltage_functions = [fn for fn in [undervoltage_fn, overvoltage_fn] if fn is not None]

    # ERROR: Brak Un dla basis='UN'
    for fn in voltage_functions:
        if fn.setpoint.basis == ProtectionSetpointBasis.UN and not base_values.has_un:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.ERROR,
                    code=SanityCheckCode.VOLT_MISSING_UN,
                    message_pl=f"Brak wartosci Un dla nastawy {fn.label_pl} ({fn.setpoint.display_pl})",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi=fn.ansi[0] if fn.ansi else None,
                    function_code=fn.code,
                    evidence={"setpoint_basis": fn.setpoint.basis.value},
                )
            )

    # ERROR: U< >= U> (overlap)
    if undervoltage_fn and overvoltage_fn:
        u_lt = _get_multiplier(undervoltage_fn.setpoint)
        u_gt = _get_multiplier(overvoltage_fn.setpoint)

        if u_lt is not None and u_gt is not None and u_lt >= u_gt:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.ERROR,
                    code=SanityCheckCode.VOLT_OVERLAP,
                    message_pl=f"Prog U< ({undervoltage_fn.setpoint.display_pl}) jest wiekszy lub rowny progowi U> ({overvoltage_fn.setpoint.display_pl})",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="27/59",
                    function_code="UNDERVOLTAGE/OVERVOLTAGE",
                    evidence={"U<_pu": u_lt, "U>_pu": u_gt},
                )
            )

    # WARN: U< < 0.5×Un
    if undervoltage_fn:
        u_lt = _get_multiplier(undervoltage_fn.setpoint)
        if u_lt is not None and u_lt < 0.5:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.VOLT_U_LT_TOO_LOW,
                    message_pl=f"Prog U< ({undervoltage_fn.setpoint.display_pl}) jest zbyt niski (< 0,5×Un)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="27",
                    function_code="UNDERVOLTAGE",
                    evidence={"U<_pu": u_lt, "threshold_pu": 0.5},
                )
            )

    # WARN: U> > 1.2×Un
    if overvoltage_fn:
        u_gt = _get_multiplier(overvoltage_fn.setpoint)
        if u_gt is not None and u_gt > 1.2:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.VOLT_U_GT_TOO_HIGH,
                    message_pl=f"Prog U> ({overvoltage_fn.setpoint.display_pl}) jest zbyt wysoki (> 1,2×Un)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="59",
                    function_code="OVERVOLTAGE",
                    evidence={"U>_pu": u_gt, "threshold_pu": 1.2},
                )
            )

    return results


# =============================================================================
# Rule: Frequency (81U/81O)
# =============================================================================


def check_frequency_rules(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    Reguly czestotliwosciowe (81U/81O):
    - ERROR f< >= f>
    - WARN f< < 45 Hz
    - WARN f> > 55 Hz
    """
    results: list[ProtectionSanityCheckResult] = []

    # Znajdz funkcje czestotliwosciowe
    underfreq_fn = _find_function_by_codes(functions, ("UNDERFREQUENCY",))
    overfreq_fn = _find_function_by_codes(functions, ("OVERFREQUENCY",))

    # ERROR: f< >= f>
    if underfreq_fn and overfreq_fn:
        f_lt = _get_abs_value(underfreq_fn.setpoint)
        f_gt = _get_abs_value(overfreq_fn.setpoint)

        if f_lt is not None and f_gt is not None and f_lt >= f_gt:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.ERROR,
                    code=SanityCheckCode.FREQ_OVERLAP,
                    message_pl=f"Prog f< ({underfreq_fn.setpoint.display_pl}) jest wiekszy lub rowny progowi f> ({overfreq_fn.setpoint.display_pl})",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="81U/81O",
                    function_code="UNDERFREQUENCY/OVERFREQUENCY",
                    evidence={"f<_Hz": f_lt, "f>_Hz": f_gt},
                )
            )

    # WARN: f< < 45 Hz
    if underfreq_fn:
        f_lt = _get_abs_value(underfreq_fn.setpoint)
        if f_lt is not None and f_lt < 45.0:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.FREQ_F_LT_TOO_LOW,
                    message_pl=f"Prog f< ({underfreq_fn.setpoint.display_pl}) jest zbyt niski (< 45 Hz)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="81U",
                    function_code="UNDERFREQUENCY",
                    evidence={"f<_Hz": f_lt, "threshold_Hz": 45.0},
                )
            )

    # WARN: f> > 55 Hz
    if overfreq_fn:
        f_gt = _get_abs_value(overfreq_fn.setpoint)
        if f_gt is not None and f_gt > 55.0:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.FREQ_F_GT_TOO_HIGH,
                    message_pl=f"Prog f> ({overfreq_fn.setpoint.display_pl}) jest zbyt wysoki (> 55 Hz)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="81O",
                    function_code="OVERFREQUENCY",
                    evidence={"f>_Hz": f_gt, "threshold_Hz": 55.0},
                )
            )

    return results


# =============================================================================
# Rule: ROCOF (81R)
# =============================================================================


def check_rocof_rules(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    Reguly ROCOF (81R):
    - WARN df/dt <= 0
    - WARN df/dt > 10 Hz/s
    """
    results: list[ProtectionSanityCheckResult] = []

    rocof_fn = _find_function_by_codes(functions, ("ROCOF",))

    if rocof_fn:
        df_dt = _get_abs_value(rocof_fn.setpoint)

        # WARN: df/dt <= 0
        if df_dt is not None and df_dt <= 0:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.ROCOF_NON_POSITIVE,
                    message_pl=f"Nastawa df/dt ({rocof_fn.setpoint.display_pl}) jest nieadodatnia (<= 0)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="81R",
                    function_code="ROCOF",
                    evidence={"df/dt_Hz/s": df_dt},
                )
            )

        # WARN: df/dt > 10 Hz/s
        if df_dt is not None and df_dt > 10.0:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.ROCOF_TOO_HIGH,
                    message_pl=f"Nastawa df/dt ({rocof_fn.setpoint.display_pl}) jest zbyt wysoka (> 10 Hz/s)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="81R",
                    function_code="ROCOF",
                    evidence={"df/dt_Hz/s": df_dt, "threshold_Hz/s": 10.0},
                )
            )

    return results


# =============================================================================
# Rule: Overcurrent (50/51)
# =============================================================================


def check_overcurrent_rules(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    Reguly nadpradowe (50/51):
    - ERROR brak In dla basis='IN'
    - ERROR I> >= I>> (p.u.)
    - WARN I> < 1.0×In
    - WARN I>> < 1.5×In
    """
    results: list[ProtectionSanityCheckResult] = []

    # Znajdz funkcje nadpradowe
    oc_time_fn = _find_function_by_codes(functions, ("OVERCURRENT_TIME",))  # 51 I>
    oc_inst_fn = _find_function_by_codes(functions, ("OVERCURRENT_INST",))  # 50 I>>

    overcurrent_functions = [fn for fn in [oc_time_fn, oc_inst_fn] if fn is not None]

    # ERROR: Brak In dla basis='IN'
    for fn in overcurrent_functions:
        if fn.setpoint.basis == ProtectionSetpointBasis.IN and not base_values.has_in:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.ERROR,
                    code=SanityCheckCode.OC_MISSING_IN,
                    message_pl=f"Brak wartosci In dla nastawy {fn.label_pl} ({fn.setpoint.display_pl})",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi=fn.ansi[0] if fn.ansi else None,
                    function_code=fn.code,
                    evidence={"setpoint_basis": fn.setpoint.basis.value},
                )
            )

    # ERROR: I> >= I>> (overlap)
    if oc_time_fn and oc_inst_fn:
        i_gt = _get_multiplier(oc_time_fn.setpoint)
        i_inst = _get_multiplier(oc_inst_fn.setpoint)

        if i_gt is not None and i_inst is not None and i_gt >= i_inst:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.ERROR,
                    code=SanityCheckCode.OC_OVERLAP,
                    message_pl=f"Prog I> ({oc_time_fn.setpoint.display_pl}) jest wiekszy lub rowny progowi I>> ({oc_inst_fn.setpoint.display_pl})",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="50/51",
                    function_code="OVERCURRENT_TIME/OVERCURRENT_INST",
                    evidence={"I>_pu": i_gt, "I>>_pu": i_inst},
                )
            )

    # WARN: I> < 1.0×In
    if oc_time_fn:
        i_gt = _get_multiplier(oc_time_fn.setpoint)
        if i_gt is not None and i_gt < 1.0:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.OC_I_GT_TOO_LOW,
                    message_pl=f"Prog I> ({oc_time_fn.setpoint.display_pl}) jest zbyt niski (< 1,0×In)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="51",
                    function_code="OVERCURRENT_TIME",
                    evidence={"I>_pu": i_gt, "threshold_pu": 1.0},
                )
            )

    # WARN: I>> < 1.5×In
    if oc_inst_fn:
        i_inst = _get_multiplier(oc_inst_fn.setpoint)
        if i_inst is not None and i_inst < 1.5:
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.OC_I_INST_TOO_LOW,
                    message_pl=f"Prog I>> ({oc_inst_fn.setpoint.display_pl}) jest zbyt niski (< 1,5×In)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="50",
                    function_code="OVERCURRENT_INST",
                    evidence={"I>>_pu": i_inst, "threshold_pu": 1.5},
                )
            )

    return results


# =============================================================================
# Rule: SPZ (79)
# =============================================================================


def check_spz_rules(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    ctx: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    Reguly SPZ (79):
    - WARN SPZ aktywne bez funkcji wyzwalajacej
    - INFO brak danych cyklu SPZ
    """
    results: list[ProtectionSanityCheckResult] = []

    spz_fn = _find_function_by_codes(functions, ("RECLOSING",))

    if spz_fn:
        # WARN: SPZ aktywne bez funkcji wyzwalajacej
        if not _has_tripping_function(functions):
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.WARN,
                    code=SanityCheckCode.SPZ_NO_TRIP_FUNCTION,
                    message_pl="SPZ (Samoczynne Ponowne Zalaczenie) jest aktywne, ale brak funkcji wyzwalajacej",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="79",
                    function_code="RECLOSING",
                    evidence={"spz_active": True, "tripping_function": False},
                )
            )

        # INFO: Brak danych cyklu SPZ (notes_pl puste)
        if not spz_fn.notes_pl or spz_fn.notes_pl.strip() == "":
            results.append(
                ProtectionSanityCheckResult(
                    severity=SanityCheckSeverity.INFO,
                    code=SanityCheckCode.SPZ_MISSING_CYCLE_DATA,
                    message_pl="Brak danych cyklu SPZ (liczba prob, czasy przerw)",
                    element_id=ctx.element_id,
                    element_type=ctx.element_type,
                    function_ansi="79",
                    function_code="RECLOSING",
                    evidence={"notes_pl": spz_fn.notes_pl},
                )
            )

    return results


# =============================================================================
# Rule Registry
# =============================================================================


ALL_RULES = [
    check_negative_setpoint,
    check_missing_base_values,
    check_voltage_rules,
    check_frequency_rules,
    check_rocof_rules,
    check_overcurrent_rules,
    check_spz_rules,
]

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.protection.base_values.compute import compute_from_setpoint
from application.analyses.protection.base_values.models import (
    ProtectedElementContext,
    ProtectedElementType,
    ProtectionSetpoint,
    ProtectionSetpointBasis,
    ProtectionSetpointOperator,
    TransformerSide,
)
from application.analyses.protection.base_values.resolver import resolve_base_values
from application.analyses.protection.sanity_checks import (
    ElementContext,
    run_sanity_checks,
)
from application.analyses.protection.sanity_checks import (
    ProtectionFunctionSummary as SanityProtectionFunctionSummary,
)
from enm.models import (
    Bay,
    Branch,
    Bus,
    Cable,
    EnergyNetworkModel,
    Generator,
    Measurement,
    OverheadLine,
    ProtectionAssignment,
    ProtectionSetting,
    Source,
    SwitchBranch,
    Transformer,
)
from protection.curves.iec_curves import (
    IEC_CURVE_LABELS_PL,
    MIN_TRIPPING_TIME_S,
    IECCurveParams,
    IECCurveType,
    generate_iec_curve_points,
)

DEVICE_KIND_MAP = {
    "overcurrent": "RELAY_OVERCURRENT",
    "earth_fault": "RELAY_EARTH_FAULT",
    "directional_overcurrent": "RELAY_OVERCURRENT",
    "distance": "RELAY_DISTANCE",
    "differential": "RELAY_DIFFERENTIAL",
    "custom": "OTHER",
}

CURVE_TYPE_MAP = {
    "DT": "DT",
    "IEC_SI": "SI",
    "IEC_VI": "VI",
    "IEC_EI": "EI",
    "IEC_LI": "LTI",
}

# Próbkowanie krzywej I-t dla charakterystyki niezależnej (DT):
# charakterystyka jest płaska, więc dwa punkty krańcowe w pełni ją opisują.
_IT_CURVE_DEFINITE_NUM_POINTS = 2
# Charakterystyki odwrotne (SI/VI/EI/LTI) są krzywoliniowe — do wiernego
# odwzorowania w inspektorze potrzeba gęstego, logarytmicznego próbkowania.
_IT_CURVE_INVERSE_NUM_POINTS = 64
# Zakres prądu jako wielokrotność progu (In>) dla generatora punktów solvera.
_IT_CURVE_CURRENT_RANGE = (1.1, 20.0)

FUNCTION_META = {
    "overcurrent_50": {
        "code": "OVERCURRENT_INST",
        "ansi": ("50",),
        "label_pl": "Nadprądowa bezzwłoczna (I>>)",
    },
    "overcurrent_51": {
        "code": "OVERCURRENT_TIME",
        "ansi": ("51",),
        "label_pl": "Nadprądowa czasowa (I>)",
    },
    "earth_fault_50N": {
        "code": "EARTH_FAULT_INST",
        "ansi": ("50N",),
        "label_pl": "Ziemnozwarciowa bezzwłoczna (Io>>)",
    },
    "earth_fault_51N": {
        "code": "EARTH_FAULT_TIME",
        "ansi": ("51N",),
        "label_pl": "Ziemnozwarciowa czasowa (Io>)",
    },
    "directional_67": {
        "code": "DIRECTIONAL_OC",
        "ansi": ("67",),
        "label_pl": "Nadprądowa kierunkowa",
    },
    "directional_67N": {
        "code": "DIRECTIONAL_OC",
        "ansi": ("67N",),
        "label_pl": "Ziemnozwarciowa kierunkowa",
    },
    # D10 (addytywnie): funkcje ochrony od pracy wyspowej (LoM). Kody spójne z
    # sanity_checks (ROCOF, UNDERFREQUENCY, OVERFREQUENCY).
    "rocof_81R": {
        "code": "ROCOF",
        "ansi": ("81R",),
        "label_pl": "Szybkość zmian częstotliwości (df/dt)",
    },
    "vector_shift_78": {
        "code": "VECTOR_SHIFT",
        "ansi": ("78",),
        "label_pl": "Przesunięcie wektora napięcia",
    },
    "underfrequency_81U": {
        "code": "UNDERFREQUENCY",
        "ansi": ("81U",),
        "label_pl": "Podczęstotliwościowa (f<)",
    },
    "overfrequency_81O": {
        "code": "OVERFREQUENCY",
        "ansi": ("81O",),
        "label_pl": "Nadczęstotliwościowa (f>)",
    },
}


@dataclass(frozen=True)
class ProtectedTarget:
    element_id: str
    element_type: str
    element_name: str
    bus_ref: str | None = None
    line_rated_current_a: float | None = None
    breaker_rated_current_a: float | None = None
    transformer_ref: str | None = None


def build_protection_read_model(case_id: str, enm: EnergyNetworkModel) -> dict[str, Any]:
    buses = {bus.ref_id: bus for bus in enm.buses}
    branches = {branch.ref_id: branch for branch in enm.branches}
    transformers = {transformer.ref_id: transformer for transformer in enm.transformers}
    sources = {source.ref_id: source for source in enm.sources}
    generators = {generator.ref_id: generator for generator in enm.generators}
    bays = {bay.ref_id: bay for bay in enm.bays}
    measurements = {measurement.ref_id: measurement for measurement in enm.measurements}

    assignments_out: list[dict[str, Any]] = []
    diagnostics_out: list[dict[str, Any]] = []
    element_acc: dict[str, dict[str, Any]] = {}

    seen_assignment_keys: set[tuple[str, str, str]] = set()
    seen_diagnostic_keys: set[tuple[str, str, str | None, str]] = set()

    for assignment in sorted(enm.protection_assignments, key=lambda item: item.ref_id):
        bay = _resolve_assignment_bay(assignment, bays, measurements)
        ct = measurements.get(assignment.ct_ref) if assignment.ct_ref else None
        vt = measurements.get(assignment.vt_ref) if assignment.vt_ref else None
        breaker = branches.get(assignment.breaker_ref)
        targets = _resolve_targets(
            assignment=assignment,
            bay=bay,
            branches=branches,
            transformers=transformers,
            sources=sources,
            generators=generators,
        )

        if not targets:
            fallback_target = _build_switch_target(breaker)
            if fallback_target is not None:
                targets = [fallback_target]
            elif bay is not None:
                targets = [
                    ProtectedTarget(
                        element_id=bay.ref_id,
                        element_type="BaySN",
                        element_name=bay.name,
                        bus_ref=bay.bus_ref,
                    )
                ]

        for target in targets:
            base_context = _build_base_context(
                target=target,
                bay=bay,
                breaker=breaker,
                ct=ct,
                vt=vt,
                buses=buses,
                transformers=transformers,
            )
            base_values = resolve_base_values(base_context)
            frontend_functions, sanity_functions = _build_functions(
                assignment.settings,
                base_values,
            )

            assignment_key = (target.element_id, assignment.ref_id, target.element_type)
            if assignment_key not in seen_assignment_keys:
                assignments_out.append(
                    {
                        "element_id": target.element_id,
                        "element_type": target.element_type,
                        "device_id": assignment.ref_id,
                        "device_name_pl": _resolve_device_name(assignment),
                        "device_kind": DEVICE_KIND_MAP.get(assignment.device_type, "OTHER"),
                        "status": "ACTIVE" if assignment.is_enabled else "BLOCKED",
                        "settings_summary": {
                            "functions": frontend_functions,
                            "curve_type": _derive_curve_type(frontend_functions),
                            "base_values": _build_base_values_payload(base_values),
                        },
                    }
                )
                seen_assignment_keys.add(assignment_key)

            sanity_context = ElementContext(
                element_id=target.element_id,
                element_type=target.element_type,
            )
            diagnostics = (
                run_sanity_checks(sanity_functions, base_values, sanity_context)
                if sanity_functions
                else []
            )

            for diagnostic in diagnostics:
                diagnostic_key = (
                    diagnostic.element_id,
                    diagnostic.code.value,
                    diagnostic.function_ansi,
                    diagnostic.message_pl,
                )
                if diagnostic_key in seen_diagnostic_keys:
                    continue
                diagnostics_out.append(diagnostic.to_dict())
                seen_diagnostic_keys.add(diagnostic_key)

            element_entry = element_acc.setdefault(
                target.element_id,
                {
                    "element_id": target.element_id,
                    "element_type": target.element_type,
                    "element_name": target.element_name,
                    "functions": [],
                    "ct": _build_ct_payload(ct),
                    "diagnostics": [],
                    "base_values": [],
                },
            )
            element_entry["functions"].extend(frontend_functions)
            if element_entry["ct"] is None:
                element_entry["ct"] = _build_ct_payload(ct)
            element_entry["diagnostics"].extend(diagnostics)
            element_entry["base_values"].append(base_values)

    summaries_out = [
        _build_summary(entry) for _, entry in sorted(element_acc.items(), key=lambda item: item[0])
    ]

    assignments_out.sort(key=lambda item: (item["element_id"], item["device_id"]))
    diagnostics_out.sort(
        key=lambda item: (
            item["element_id"],
            {"ERROR": 0, "WARN": 1, "INFO": 2}.get(item["severity"], 9),
            item["code"],
        )
    )
    has_protection_data = bool(assignments_out or diagnostics_out or summaries_out)

    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "view_status": _build_read_model_view_status(
            has_protection_data=has_protection_data,
        ),
        "summary": _build_read_model_summary(
            assignments=assignments_out,
            diagnostics=diagnostics_out,
            summaries=summaries_out,
        ),
        "assignments": assignments_out,
        "diagnostics": diagnostics_out,
        "summaries": summaries_out,
    }


def _build_read_model_view_status(*, has_protection_data: bool) -> dict[str, Any]:
    return {
        "data_source": "ENM_PROTECTION_READ_MODEL",
        "result_state": "FRESH" if has_protection_data else "NONE",
        "has_protection_data": has_protection_data,
    }


def _build_read_model_summary(
    *,
    assignments: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    summaries: list[dict[str, Any]],
) -> dict[str, Any]:
    protected_elements = {
        item["element_id"]
        for item in assignments + diagnostics + summaries
        if item.get("element_id")
    }
    active_assignments = sum(1 for item in assignments if item.get("status") == "ACTIVE")
    blocked_assignments = sum(1 for item in assignments if item.get("status") == "BLOCKED")
    complete_count = sum(1 for item in summaries if item.get("has_complete_data"))
    incomplete_count = sum(1 for item in summaries if not item.get("has_complete_data"))
    verified_count = sum(1 for item in summaries if item.get("verification_status") == "SPELNIONE")
    failed_count = sum(1 for item in summaries if item.get("verification_status") == "NIESPELNIONE")
    no_data_count = sum(1 for item in summaries if item.get("verification_status") == "BRAK_DANYCH")
    error_count = sum(1 for item in diagnostics if item.get("severity") == "ERROR")
    warn_count = sum(1 for item in diagnostics if item.get("severity") == "WARN")
    info_count = sum(1 for item in diagnostics if item.get("severity") == "INFO")

    return {
        "total_elements": len(protected_elements),
        "total_assignments": len(assignments),
        "active_assignments": active_assignments,
        "blocked_assignments": blocked_assignments,
        "complete_count": complete_count,
        "incomplete_count": incomplete_count,
        "verified_count": verified_count,
        "failed_count": failed_count,
        "no_data_count": no_data_count,
        "error_count": error_count,
        "warn_count": warn_count,
        "info_count": info_count,
    }


def _resolve_assignment_bay(
    assignment: ProtectionAssignment,
    bays: dict[str, Bay],
    measurements: dict[str, Measurement],
) -> Bay | None:
    for bay in bays.values():
        if bay.protection_ref == assignment.ref_id:
            return bay
    for bay in bays.values():
        if assignment.breaker_ref in bay.equipment_refs:
            return bay
    if assignment.ct_ref:
        ct = measurements.get(assignment.ct_ref)
        if ct and ct.bay_ref:
            return bays.get(ct.bay_ref)
    return None


def _resolve_targets(
    assignment: ProtectionAssignment,
    bay: Bay | None,
    branches: dict[str, Branch],
    transformers: dict[str, Transformer],
    sources: dict[str, Source],
    generators: dict[str, Generator],
) -> list[ProtectedTarget]:
    targets: dict[str, ProtectedTarget] = {}

    breaker = branches.get(assignment.breaker_ref)
    if breaker is not None:
        switch_target = _build_switch_target(breaker)
        if switch_target is not None:
            targets[switch_target.element_id] = switch_target

    if bay is None:
        return list(targets.values())

    for equipment_ref in bay.equipment_refs:
        if equipment_ref == assignment.breaker_ref:
            continue
        branch = branches.get(equipment_ref)
        if isinstance(branch, OverheadLine | Cable):
            targets[branch.ref_id] = ProtectedTarget(
                element_id=branch.ref_id,
                element_type="LineBranch",
                element_name=branch.name,
                bus_ref=bay.bus_ref,
                line_rated_current_a=branch.rating.in_a if branch.rating else None,
            )
            continue

        transformer = transformers.get(equipment_ref)
        if transformer is not None:
            side_bus = (
                bay.bus_ref
                if bay.bus_ref in {transformer.hv_bus_ref, transformer.lv_bus_ref}
                else transformer.hv_bus_ref
            )
            targets[transformer.ref_id] = ProtectedTarget(
                element_id=transformer.ref_id,
                element_type="TransformerBranch",
                element_name=transformer.name,
                bus_ref=side_bus,
                transformer_ref=transformer.ref_id,
            )
            continue

        source = sources.get(equipment_ref)
        if source is not None:
            targets[source.ref_id] = ProtectedTarget(
                element_id=source.ref_id,
                element_type="Source",
                element_name=source.name,
                bus_ref=source.bus_ref,
            )
            continue

        generator = generators.get(equipment_ref)
        if generator is not None:
            targets[generator.ref_id] = ProtectedTarget(
                element_id=generator.ref_id,
                element_type="Generator",
                element_name=generator.name,
                bus_ref=generator.bus_ref,
            )

    return list(targets.values())


def _build_switch_target(branch: Branch | None) -> ProtectedTarget | None:
    if not isinstance(branch, SwitchBranch):
        return None
    return ProtectedTarget(
        element_id=branch.ref_id,
        element_type="Switch",
        element_name=branch.name,
        bus_ref=branch.to_bus_ref,
        breaker_rated_current_a=_resolve_branch_rated_current(branch),
    )


def _build_base_context(
    target: ProtectedTarget,
    bay: Bay | None,
    breaker: Branch | None,
    ct: Measurement | None,
    vt: Measurement | None,
    buses: dict[str, Bus],
    transformers: dict[str, Transformer],
) -> ProtectedElementContext:
    bus_ref = (target.bus_ref or bay.bus_ref) if bay is not None else target.bus_ref
    bus = buses.get(bus_ref) if bus_ref else None

    breaker_rated_current_a = target.breaker_rated_current_a
    if breaker_rated_current_a is None:
        breaker_rated_current_a = _resolve_branch_rated_current(breaker)

    transformer = transformers.get(target.transformer_ref) if target.transformer_ref else None
    transformer_side = None
    if transformer is not None and bay is not None:
        if bay.bus_ref == transformer.hv_bus_ref:
            transformer_side = TransformerSide.HV
        elif bay.bus_ref == transformer.lv_bus_ref:
            transformer_side = TransformerSide.LV

    protected_type = {
        "LineBranch": ProtectedElementType.LINE,
        "TransformerBranch": ProtectedElementType.TRANSFORMER,
        "Switch": ProtectedElementType.BREAKER,
        "Bus": ProtectedElementType.BUS,
        "Source": ProtectedElementType.BUS,
        "Generator": ProtectedElementType.BUS,
        "BaySN": ProtectedElementType.BUS,
    }.get(target.element_type, ProtectedElementType.UNKNOWN)

    return ProtectedElementContext(
        element_type=protected_type,
        element_id=target.element_id,
        bus_voltage_kv=bus.voltage_kv if bus is not None else None,
        vt_primary_kv=_resolve_measurement_primary(vt, "VT"),
        line_rated_current_a=target.line_rated_current_a,
        breaker_rated_current_a=breaker_rated_current_a,
        transformer_rated_power_mva=transformer.sn_mva if transformer is not None else None,
        transformer_voltage_hv_kv=transformer.uhv_kv if transformer is not None else None,
        transformer_voltage_lv_kv=transformer.ulv_kv if transformer is not None else None,
        transformer_side=transformer_side,
        connection_rated_current_a=(
            _resolve_measurement_primary(ct, "CT")
            if target.element_type in {"Source", "Generator"}
            else None
        ),
    )


def _build_functions(
    settings: list[ProtectionSetting],
    base_values: Any,
) -> tuple[list[dict[str, Any]], list[SanityProtectionFunctionSummary]]:
    frontend_functions: list[dict[str, Any]] = []
    sanity_functions: list[SanityProtectionFunctionSummary] = []

    for setting in settings:
        meta = FUNCTION_META.get(setting.function_type)
        if meta is None or setting.threshold_a is None:
            continue

        setpoint = _build_setpoint(setting, base_values)
        computed = compute_from_setpoint(setpoint, base_values)
        # Funkcje bezzwłoczne (I>>/Io>>) rozpoznajemy po kodzie meta — dla nich
        # brak zwłoki jest cechą, nie brakiem danych (S-1).
        instantaneous = meta["code"] in {"OVERCURRENT_INST", "EARTH_FAULT_INST"}
        it_curve, it_curve_missing = _build_it_curve(setting, instantaneous=instantaneous)
        function_payload: dict[str, Any] = {
            "code": meta["code"],
            "ansi": list(meta["ansi"]),
            "label_pl": meta["label_pl"],
            "setpoint": setpoint.to_dict(),
            "computed": computed.to_dict() if computed is not None else None,
            "time_delay_s": setting.time_delay_s,
            "curve_type": setting.curve_type,
            "it_curve": it_curve,
            "notes_pl": "Funkcja kierunkowa" if setting.is_directional else None,
        }
        if it_curve_missing:
            function_payload["it_curve_missing_data"] = it_curve_missing
        frontend_functions.append(function_payload)
        sanity_functions.append(
            SanityProtectionFunctionSummary(
                code=meta["code"],
                ansi=meta["ansi"],
                label_pl=meta["label_pl"],
                setpoint=setpoint,
                time_delay_s=setting.time_delay_s,
                curve_type=setting.curve_type,
                notes_pl="Funkcja kierunkowa" if setting.is_directional else None,
            )
        )

    return frontend_functions, sanity_functions


def _build_it_curve(
    setting: ProtectionSetting,
    *,
    instantaneous: bool = False,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Zbuduj krzywą czasowo-prądową (I-t) dla nastawy z solvera IEC 60255.

    Wartości czasu (t_s) pochodzą WYŁĄCZNIE z solvera
    (``protection.curves.iec_curves``) — read model niczego nie liczy sam.

    - Charakterystyka niezależna (DT) jest w pełni wyznaczona przez próg (In>)
      i zwłokę czasową → zwracamy płaską krzywą (TMS nie dotyczy).
    - Funkcja bezzwłoczna (I>>/Io>>, ANSI 50/50N) z natury NIE ma zwłoki
      zamierzonej: działa w minimalnym czasie własnym przekaźnika. Brak
      ``time_delay_s`` NIE jest wtedy „brakiem danych" — używamy podłogi
      czasowej solvera (``MIN_TRIPPING_TIME_S``), by krzywa była płaska przy
      t≈0, a nie przy literalnym t_s=0 (nieprzedstawialnym na osi log-log).
    - Charakterystyki odwrotne (SI/VI/EI/LTI) wymagają nastawy TMS
      (``ProtectionSetting.time_multiplier``): gdy jest podana → liczymy krzywą
      solverem z tym mnożnikiem; gdy jej brak → zwracamy brak danych
      (``time_multiplier``) zamiast fabrykować mnożnik czasowy.

    Zwraca krotkę ``(krzywa | None, lista_brakujących_danych)``.
    """
    missing: list[str] = []

    pickup_a = setting.threshold_a
    if pickup_a is None or pickup_a <= 0:
        missing.append("pickup_current")

    curve_type = setting.curve_type
    if curve_type:
        solver_code = CURVE_TYPE_MAP.get(str(curve_type), "DT")
    else:
        solver_code = "DT"

    time_multiplier: float | None = None
    # Zwłoka niezależna przekazywana do solvera (DT). Dla funkcji bezzwłocznej
    # bez skonfigurowanej zwłoki = minimalny czas własny (podłoga solvera).
    definite_time_s = setting.time_delay_s
    if solver_code == "DT":
        curve_kind = "DEFINITE"
        num_points = _IT_CURVE_DEFINITE_NUM_POINTS
        if setting.time_delay_s is None:
            if instantaneous:
                definite_time_s = MIN_TRIPPING_TIME_S
            else:
                missing.append("definite_time")
        elif instantaneous and setting.time_delay_s <= 0:
            # Bezzwłoczna z zerową zwłoką → podłoga (nie generujemy t_s=0).
            definite_time_s = MIN_TRIPPING_TIME_S
    else:
        curve_kind = "INVERSE"
        num_points = _IT_CURVE_INVERSE_NUM_POINTS
        tms = setting.time_multiplier
        if tms is None or tms <= 0:
            # TMS wymagany dla charakterystyki odwrotnej — brak danych, nie fabrykujemy.
            missing.append("time_multiplier")
        else:
            time_multiplier = tms

    if missing:
        return None, missing

    assert pickup_a is not None  # zapewnione przez powyższą walidację missing

    params = IECCurveParams.get_standard_params(IECCurveType(solver_code))
    raw_points = generate_iec_curve_points(
        curve_params=params,
        pickup_current_a=pickup_a,
        # TMS (mnożnik czasowy) tylko dla krzywych odwrotnych; DT ignoruje ten
        # parametr, więc przekazujemy neutralne 1.0 dla spójności wywołania.
        time_multiplier=time_multiplier if time_multiplier is not None else 1.0,
        current_range=_IT_CURVE_CURRENT_RANGE,
        num_points=num_points,
        definite_time_s=definite_time_s,
    )
    points = [{"i_a": point["current_a"], "t_s": point["time_s"]} for point in raw_points]
    if not points:
        return None, ["it_curve_points"]

    return (
        {
            "standard": "IEC_60255",
            "curve_kind": curve_kind,
            "curve_code": solver_code,
            "curve_label_pl": IEC_CURVE_LABELS_PL.get(solver_code, solver_code),
            "pickup_a": pickup_a,
            "time_multiplier": time_multiplier,
            "points": points,
        },
        [],
    )


def _build_setpoint(setting: ProtectionSetting, base_values: Any) -> ProtectionSetpoint:
    if base_values.has_in and setting.threshold_a is not None and base_values.in_a not in (None, 0):
        multiplier = setting.threshold_a / base_values.in_a
        return ProtectionSetpoint(
            basis=ProtectionSetpointBasis.IN,
            operator=ProtectionSetpointOperator.GT,
            multiplier=multiplier,
            unit="pu",
            display_pl=f"{_format_number(multiplier)}×In",
        )

    return ProtectionSetpoint(
        basis=ProtectionSetpointBasis.ABS,
        operator=ProtectionSetpointOperator.GT,
        abs_value=setting.threshold_a or 0.0,
        unit="A",
        display_pl=f"{_format_number(setting.threshold_a or 0.0)} A",
    )


def _build_base_values_payload(base_values: Any) -> dict[str, float] | None:
    payload: dict[str, float] = {}
    if base_values.in_a is not None:
        payload["i_rated_a"] = base_values.in_a
    if base_values.un_kv is not None:
        payload["u_rated_kv"] = base_values.un_kv
    payload["f_rated_hz"] = 50.0
    return payload or None


def _build_ct_payload(ct: Measurement | None) -> dict[str, Any] | None:
    if ct is None or ct.measurement_type != "CT":
        return None
    return {
        "primary_a": ct.rating.ratio_primary,
        "secondary_a": ct.rating.ratio_secondary,
        "label": f"{_format_number(ct.rating.ratio_primary)}/{_format_number(ct.rating.ratio_secondary)}",
    }


def _build_summary(entry: dict[str, Any]) -> dict[str, Any]:
    diagnostics = entry["diagnostics"]
    functions: list[dict[str, Any]] = entry["functions"]

    time_function = next((item for item in functions if item["code"] == "OVERCURRENT_TIME"), None)
    inst_function = next((item for item in functions if item["code"] == "OVERCURRENT_INST"), None)

    severity_set = {diagnostic.severity.value for diagnostic in diagnostics}
    has_only_info = severity_set == {"INFO"}
    has_warn_or_error = bool({"WARN", "ERROR"} & severity_set)
    has_complete_data = bool(functions) and not has_only_info

    if not functions:
        verification_status = "BRAK_DANYCH"
        verification_reason = "Brak skonfigurowanych funkcji zabezpieczeniowych"
    elif has_warn_or_error:
        verification_status = "NIESPELNIONE"
        verification_reason = (
            diagnostics[0].message_pl if diagnostics else "Wykryto niespełnione kryteria"
        )
    elif has_only_info:
        verification_status = "BRAK_DANYCH"
        verification_reason = diagnostics[0].message_pl if diagnostics else "Analiza częściowa"
    else:
        verification_status = "SPELNIONE"
        verification_reason = "Brak wykrytych konfliktów w logice zabezpieczeń"

    return {
        "element_id": entry["element_id"],
        "element_type": entry["element_type"],
        "element_name": entry["element_name"],
        "overcurrent": (
            {
                "time_overcurrent": _build_overcurrent_setting(time_function),
                "instant_overcurrent": _build_overcurrent_setting(
                    inst_function, instantaneous=True
                ),
            }
            if time_function or inst_function
            else None
        ),
        "ct": entry["ct"],
        "verification_status": verification_status,
        "verification_reason": verification_reason,
        "margin_pct": None,
        "has_complete_data": has_complete_data,
    }


def _build_overcurrent_setting(
    function: dict[str, Any] | None,
    *,
    instantaneous: bool = False,
) -> dict[str, Any] | None:
    if function is None:
        return None

    setpoint = function["setpoint"]
    computed = function.get("computed")
    pickup_a = None
    if isinstance(computed, dict) and computed.get("unit") == "A":
        pickup_a = computed.get("value")
    elif setpoint.get("basis") == "ABS" and setpoint.get("unit") == "A":
        pickup_a = setpoint.get("abs_value")

    curve_type = function.get("curve_type")
    characteristic = CURVE_TYPE_MAP.get(str(curve_type), "DT") if curve_type else "DT"

    return {
        "pickup_a": pickup_a,
        "pickup_in_multiplier": setpoint.get("basis") == "IN" and pickup_a is None,
        "trip_time_s": function.get("time_delay_s"),
        "characteristic": characteristic,
        # TMS spójny z krzywą I-t (E-3): realny mnożnik czasowy z it_curve dla
        # charakterystyk odwrotnych; None dla DT/braku (bez zgadywania).
        "tms": (function.get("it_curve") or {}).get("time_multiplier"),
        "instantaneous": instantaneous,
    }


def _resolve_device_name(assignment: ProtectionAssignment) -> str:
    name = assignment.name.strip()
    if name:
        return name
    label = {
        "overcurrent": "Przekaźnik nadprądowy",
        "earth_fault": "Przekaźnik ziemnozwarciowy",
        "directional_overcurrent": "Przekaźnik nadprądowy kierunkowy",
        "distance": "Przekaźnik odległościowy",
        "differential": "Przekaźnik różnicowy",
        "custom": "Zabezpieczenie niestandardowe",
    }.get(assignment.device_type, "Zabezpieczenie")
    return f"{label} ({assignment.ref_id})"


def _derive_curve_type(functions: list[dict[str, Any]]) -> str | None:
    for function in functions:
        curve = function.get("curve_type")
        if isinstance(curve, str):
            return curve
    return None


def _resolve_measurement_primary(
    measurement: Measurement | None, expected_type: str
) -> float | None:
    if measurement is None or measurement.measurement_type != expected_type:
        return None
    return measurement.rating.ratio_primary


def _resolve_branch_rated_current(branch: Branch | None) -> float | None:
    if branch is None:
        return None
    params = getattr(branch, "materialized_params", None)
    if isinstance(params, dict):
        for key in ("in_a", "rated_current_a", "nominal_current_a"):
            value = params.get(key)
            if isinstance(value, int | float):
                return float(value)
    if (
        isinstance(branch, OverheadLine | Cable)
        and branch.rating is not None
        and branch.rating.in_a is not None
    ):
        return branch.rating.in_a
    if hasattr(branch, "meta") and isinstance(branch.meta, dict):
        for key in ("in_a", "rated_current_a", "nominal_current_a"):
            value = branch.meta.get(key)
            if isinstance(value, int | float):
                return float(value)
    return None


def _format_number(value: float | int | None) -> str:
    if value is None:
        return "—"
    number = float(value)
    if number.is_integer():
        return f"{int(number)}"
    return f"{number:.2f}".rstrip("0").rstrip(".").replace(".", ",")

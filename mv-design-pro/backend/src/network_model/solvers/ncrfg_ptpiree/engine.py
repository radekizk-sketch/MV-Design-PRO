"""Deterministyczny solver testow zgodnosci NC RfG wedlug procedury PTPiREE.

Solver nie zastępuje badan terenowych. Generuje audytowalny pakiet symulacji i
kontroli zdolnosci technicznych na podstawie jawnie zadeklarowanych danych
katalogowych modulu wytwarzania energii.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from catalog.profiles.nc_rfg import load_nc_rfg_profile

from .contracts import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeModuleResult,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeTestDefinition,
    NcRfgPtpireeTestResult,
    NcRfgTraceStep,
    PtpireeVerdict,
)

NCRFG_PTPiREE_SOLVER_VERSION = "ncrfg-ptpiree-whitebox-1.0"


def _canonical_payload(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(payload: Any) -> str:
    return hashlib.sha256(_canonical_payload(payload).encode("utf-8")).hexdigest()


def _round(value: float, digits: int = 6) -> float:
    if not math.isfinite(value):
        return value
    return round(value, digits)


TEST_CATALOG: list[NcRfgPtpireeTestDefinition] = [
    NcRfgPtpireeTestDefinition(
        test_id="T01",
        ability_pl="LFSM-O - ograniczanie mocy przy nadczęstotliwości",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla PPM/SyPGM typu C i D; dla części A/B gdy brak certyfikatu.",
        default_for_modules=["C", "D"],
        conditional_pl="Dla typu A/B wymaganie zależy od certyfikatu i decyzji właściwego OS.",
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T02",
        ability_pl="LFSM-U - zwiększanie mocy przy podczęstotliwości",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla modułów typu C i D.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T03",
        ability_pl="FSM - regulacja częstotliwości w paśmie normalnym",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla modułów typu C i D.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T04",
        ability_pl="Regulacja odbudowy częstotliwości",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla modułów typu C i D.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T05",
        ability_pl="Możliwość regulacji mocy czynnej",
        procedure_basis_pl="Program ramowy testów PPM oraz sprawdzenia dodatkowe dla regulacji P.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T06",
        ability_pl="Tryb regulacji napięcia",
        procedure_basis_pl="Zakres testów zgodności PPM typu C i D.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T07",
        ability_pl="Tryb regulacji mocy biernej Q",
        procedure_basis_pl="Zakres testów zgodności PPM typu C i D.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T08",
        ability_pl="Tryb regulacji współczynnika mocy cosφ",
        procedure_basis_pl="Zakres testów zgodności PPM typu C i D.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T09",
        ability_pl="Zdolność do generacji mocy biernej",
        procedure_basis_pl="Zakres testów zgodności PPM typu B, C i D.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T10",
        ability_pl="Potwierdzenie mocy maksymalnej PMAX",
        procedure_basis_pl="Sprawdzenia dodatkowe procedury PTPiREE dla typu B, C i D.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T11",
        ability_pl="Potwierdzenie mocy minimalnej PMIN",
        procedure_basis_pl="Sprawdzenia dodatkowe procedury PTPiREE dla typu B, C i D.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T12",
        ability_pl="Zaprzestanie generacji mocy czynnej",
        procedure_basis_pl="Dodatkowy test zgodności, wymagany dla typu A/B przy braku certyfikatu.",
        default_for_modules=[],
        conditional_pl="Wymagany, gdy certyfikat nie pokrywa funkcji zdalnego zaprzestania generacji.",
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T13",
        ability_pl="Zmniejszenie generacji mocy czynnej",
        procedure_basis_pl="Dodatkowy test zgodności, wymagany dla typu B przy braku certyfikatu.",
        default_for_modules=[],
        conditional_pl="Wymagany, gdy certyfikat nie pokrywa funkcji zdalnego ograniczenia generacji.",
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T14",
        ability_pl="LVRT - pozostanie w pracy przy zapadzie napięcia",
        procedure_basis_pl="Test FRT dla modułów B/C/D oraz profili operatora.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T15",
        ability_pl="HVRT - pozostanie w pracy przy wzroście napięcia",
        procedure_basis_pl="Test HVRT dla modułów B/C/D oraz profili operatora.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T16",
        ability_pl="Odbudowa mocy czynnej po zakłóceniu",
        procedure_basis_pl="Wymaganie profilu operatora dla modułów B/C/D.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T17",
        ability_pl="Prąd bierny podczas FRT",
        procedure_basis_pl="Sprawdzenie wsparcia napięcia w czasie FRT.",
        default_for_modules=["B", "C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T18",
        ability_pl="Praca wyspowa, rozruch autonomiczny i tłumienie oscylacji",
        procedure_basis_pl="Sprawdzenia dodatkowe wykonywane, gdy zdolność jest wymagana przez właściwego OS/OSP.",
        default_for_modules=[],
        conditional_pl="Uruchamiane jako wymagane tylko po zaznaczeniu obowiązku w danych wejściowych.",
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T19",
        ability_pl="Rejestracja zakłóceń i komunikacja z operatorem",
        procedure_basis_pl="Dane pomocnicze wymagane do wiarygodnego programu szczegółowego testów.",
        default_for_modules=["C", "D"],
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T20",
        ability_pl="Jakość energii - THD_U źródła",
        procedure_basis_pl="Kontrola uzupełniająca dla przyłączenia PPM z falownikami.",
        default_for_modules=[],
        conditional_pl="Nie zastępuje pełnego modułu harmonicznych; raportuje, jeśli dane katalogowe są dostępne.",
    ),
]


class TraceBuilder:
    def __init__(self) -> None:
        self.steps: list[NcRfgTraceStep] = []

    def add(
        self,
        test_id: str,
        key: str,
        formula: str,
        data: dict[str, Any],
        substitution: str,
        result: dict[str, Any],
        unit_check: str,
    ) -> str:
        proof_ref = f"proof:ncrfg-ptpiree:{test_id}:{key}:{len(self.steps) + 1}"
        self.steps.append(
            NcRfgTraceStep(
                step=len(self.steps) + 1,
                test_id=test_id,
                key=key,
                formula=formula,
                data=data,
                substitution=substitution,
                result=result,
                unit_check=unit_check,
                proof_ref=proof_ref,
            )
        )
        return proof_ref


class NcRfgPtpireeSolver:
    """Pakiet symulacji i kontroli zdolnosci NC RfG dla PTPiREE."""

    def run(self, request: NcRfgPtpireeRunRequest) -> NcRfgPtpireeRunResult:
        trace = TraceBuilder()
        requested = {item.strip().upper() for item in request.requested_test_ids if item.strip()}
        modules = [self._run_module(module, trace, requested) for module in request.modules]
        report_pl = self._build_report(modules, request.procedure_version)
        envelope = {
            "contract": "NcRfgPtpireeTestResultV1",
            "procedure_version": request.procedure_version,
            "solver_version": NCRFG_PTPiREE_SOLVER_VERSION,
            "input_hash": _hash(request.model_dump(mode="json")),
            "modules": [module.model_dump(mode="json") for module in modules],
            "test_catalog": [definition.model_dump(mode="json") for definition in TEST_CATALOG],
            "white_box_trace": [step.model_dump(mode="json") for step in trace.steps],
            "report_pl": report_pl,
        }
        return NcRfgPtpireeRunResult(
            **envelope,
            deterministic_hash=_hash(envelope),
        )

    def _run_module(
        self,
        module: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        requested: set[str],
    ) -> NcRfgPtpireeModuleResult:
        profile = load_nc_rfg_profile(module.operator_id)
        module_type = profile.classify_module(module.p_max_kw, module.voltage_kv)
        module_type_id = module_type.id if module_type is not None else "?"
        tests = [
            self._run_test(definition, module, module_type_id, profile, trace, requested)
            for definition in TEST_CATALOG
        ]
        required_tests = [test for test in tests if test.required]
        pass_count = sum(1 for test in tests if test.verdict == "pass")
        fail_count = sum(1 for test in tests if test.required and test.verdict == "fail")
        no_data_count = sum(1 for test in tests if test.required and test.verdict == "no_data")
        not_required_count = sum(1 for test in tests if test.verdict == "not_required")
        if fail_count > 0:
            overall = "niezgodny"
        elif no_data_count > 0:
            overall = "brak_danych"
        else:
            overall = "zgodny"
        return NcRfgPtpireeModuleResult(
            der_ref=module.der_ref,
            der_name=module.der_name,
            operator_id=module.operator_id,
            operator_name_pl=profile.operator_name_pl,
            module_type=module_type_id,
            module_family=module.module_family,
            p_max_kw=_round(module.p_max_kw, 3),
            voltage_kv=_round(module.voltage_kv, 3),
            required_count=len(required_tests),
            pass_count=pass_count,
            fail_count=fail_count,
            no_data_count=no_data_count,
            not_required_count=not_required_count,
            overall_status=overall,
            tests=tests,
        )

    def _run_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        module_type: str,
        profile: Any,
        trace: TraceBuilder,
        requested: set[str],
    ) -> NcRfgPtpireeTestResult:
        required, reason = self._is_required(definition, module, module_type, requested)
        test_id = definition.test_id
        if test_id in {"T01", "T02", "T03", "T04"}:
            return self._frequency_test(definition, module, profile, trace, required, reason)
        if test_id == "T05":
            return self._active_power_control(definition, module, profile, trace, required, reason)
        if test_id in {"T06", "T07", "T08", "T09"}:
            return self._reactive_voltage_test(definition, module, profile, trace, required, reason)
        if test_id in {"T10", "T11"}:
            return self._pmax_pmin_test(definition, module, trace, required, reason)
        if test_id in {"T12", "T13"}:
            return self._remote_power_command(definition, module, profile, trace, required, reason)
        if test_id in {"T14", "T15"}:
            return self._ride_through_test(definition, module, profile, trace, required, reason)
        if test_id == "T16":
            return self._p_recovery_test(definition, module, profile, trace, required, reason)
        if test_id == "T17":
            return self._reactive_current_test(definition, module, trace, required, reason)
        if test_id == "T18":
            return self._extended_capability_test(definition, module, trace, required, reason)
        if test_id == "T19":
            return self._observability_test(definition, module, trace, required, reason)
        if test_id == "T20":
            return self._harmonics_test(definition, module, trace, required, reason)
        return self._result(
            definition,
            required,
            reason,
            "no_data" if required else "not_required",
            "Nie zdefiniowano algorytmu dla testu.",
            {},
            [],
            ["Uzupełnij kontrakt testu NC RfG."],
        )

    def _is_required(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        module_type: str,
        requested: set[str],
    ) -> tuple[bool, str]:
        if definition.test_id in requested:
            return True, "Test wymuszony w programie szczegółowym."
        if module_type in definition.default_for_modules:
            return True, f"Wymagany dla modułu typu {module_type}."
        if definition.test_id == "T01" and module.module_family == "SyPGM" and module.certificate_status != "ptpiree_verified":
            return True, "Wymagany dla SyPGM typu A/B przy braku certyfikatu."
        if definition.test_id == "T12" and module.certificate_status != "ptpiree_verified" and module_type in {"A", "B"}:
            return True, "Wymagany dla zaprzestania generacji przy braku certyfikatu."
        if definition.test_id == "T13" and module.certificate_status != "ptpiree_verified" and module_type == "B":
            return True, "Wymagany dla zmniejszenia generacji przy braku certyfikatu typu B."
        if definition.test_id == "T18" and (
            module.island_operation_required
            or module.black_start_required
            or module.power_oscillation_damping_required
        ):
            return True, "Wymagany, bo zaznaczono zdolność dodatkową w programie szczegółowym."
        if definition.test_id == "T20" and module.harmonic_thdu_percent is not None:
            return True, "Weryfikacja uzupełniająca aktywna, bo podano THD_U źródła."
        return False, "Nie jest wymagany dla tej klasy modułu bez dodatkowego żądania OS."

    def _frequency_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        profile: Any,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        if not module.has_pf_droop or module.droop_percent is None or module.dead_band_hz is None:
            return self._missing(definition, required, reason, "Brak droop P(f) albo martwej strefy częstotliwości.")
        droop_ref = profile.frequency_response.pf_droop_percent
        dead_ref = profile.frequency_response.dead_band_hz
        frequency_hz = 50.6 if definition.test_id in {"T01", "T03"} else 49.4
        delta_hz = max(abs(frequency_hz - 50.0) - module.dead_band_hz, 0.0)
        denominator = 50.0 * (module.droop_percent / 100.0)
        delta_p_kw = module.p_max_kw * min(1.0, delta_hz / max(denominator, 1e-9))
        ramp_limit_kw = module.p_max_kw * (profile.frequency_response.ramp_rate_pct_per_min / 100.0)
        droop_ok = abs(module.droop_percent - droop_ref) <= 1.0
        dead_ok = module.dead_band_hz <= dead_ref + 0.05
        recovery_ok = definition.test_id != "T04" or (
            module.ramp_rate_pct_per_min is not None
            and module.ramp_rate_pct_per_min >= 0.5 * profile.frequency_response.ramp_rate_pct_per_min
        )
        ok = droop_ok and dead_ok and recovery_ok and delta_p_kw >= 0
        ref = trace.add(
            definition.test_id,
            "frequency_response",
            "ΔP = Pmax * max(|f-50|-db,0) / (50 * s)",
            {
                "frequency_hz": frequency_hz,
                "p_max_kw": module.p_max_kw,
                "droop_percent": module.droop_percent,
                "dead_band_hz": module.dead_band_hz,
                "profile_droop_percent": droop_ref,
                "profile_dead_band_hz": dead_ref,
            },
            f"ΔP = {module.p_max_kw} * {delta_hz:.3f} / {denominator:.3f}",
            {
                "delta_p_kw": _round(delta_p_kw, 3),
                "ramp_limit_kw_per_min": _round(ramp_limit_kw, 3),
                "droop_ok": droop_ok,
                "dead_band_ok": dead_ok,
                "recovery_ok": recovery_ok,
            },
            "kW * Hz / Hz = kW.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"Symulacja odpowiedzi częstotliwościowej: ΔP={_round(delta_p_kw, 2)} kW.",
            {"delta_p_kw": _round(delta_p_kw, 3), "frequency_hz": frequency_hz},
            [ref],
            ["Uzupełnij profil P(f) zgodny z profilem operatora."] if not ok else [],
        )

    def _active_power_control(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        profile: Any,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        if not module.active_power_control_enabled or module.ramp_rate_pct_per_min is None:
            return self._missing(definition, required, reason, "Brak aktywnej regulacji mocy czynnej lub rampy.")
        target_kw = 0.5 * module.p_max_kw
        delta_kw = module.p_max_kw - target_kw
        ramp_kw_per_min = module.p_max_kw * module.ramp_rate_pct_per_min / 100.0
        settling_min = delta_kw / max(ramp_kw_per_min, 1e-9)
        limit_min = delta_kw / max(module.p_max_kw * profile.frequency_response.ramp_rate_pct_per_min / 100.0, 1e-9)
        ok = settling_min <= max(limit_min * 2.0, 0.1)
        ref = trace.add(
            definition.test_id,
            "active_power_ramp",
            "t_set = |P0-Pset| / (Pmax * r/100)",
            {"p0_kw": module.p_max_kw, "p_set_kw": target_kw, "ramp_pct_per_min": module.ramp_rate_pct_per_min},
            f"t = {delta_kw:.3f} / {ramp_kw_per_min:.3f}",
            {"settling_time_min": _round(settling_min, 4), "reference_time_min": _round(limit_min, 4)},
            "kW / (kW/min) = min.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"Regulacja P do 50% PMAX: czas ustalenia {_round(settling_min, 3)} min.",
            {"settling_time_min": _round(settling_min, 4)},
            [ref],
            ["Włącz regulację mocy czynnej i podaj rampę z katalogu/sterownika."] if not ok else [],
        )

    def _reactive_voltage_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        profile: Any,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        reactive = profile.reactive_power
        if definition.test_id == "T08":
            if module.cos_phi_min is None:
                return self._missing(definition, required, reason, "Brak minimalnego cosφ.")
            ok = module.cos_phi_min <= reactive.cos_phi_min + 1e-9
            ref = trace.add(
                definition.test_id,
                "power_factor_range",
                "cosφ_min,module <= cosφ_min,profile",
                {"cos_phi_min_module": module.cos_phi_min, "cos_phi_min_profile": reactive.cos_phi_min},
                f"{module.cos_phi_min:.3f} <= {reactive.cos_phi_min:.3f}",
                {"ok": ok},
                "cosφ jest bezwymiarowy.",
            )
            return self._ok_fail(definition, required, reason, ok, "Sprawdzono zakres cosφ.", {"cos_phi_min": module.cos_phi_min}, [ref])
        if definition.test_id in {"T06", "T07"} and not module.has_qu_curve:
            return self._missing(definition, required, reason, "Brak krzywej Q(U) albo trybu regulacji Q.")
        if module.q_range_pct_pn_min is None or module.q_range_pct_pn_max is None:
            return self._missing(definition, required, reason, "Brak zakresu Q/Pn modułu.")
        required_min = reactive.q_range_pct_pn_min
        required_max = reactive.q_range_pct_pn_max
        ok = module.q_range_pct_pn_min <= required_min and module.q_range_pct_pn_max >= required_max
        q_min_kvar = module.p_max_kw * module.q_range_pct_pn_min
        q_max_kvar = module.p_max_kw * module.q_range_pct_pn_max
        ref = trace.add(
            definition.test_id,
            "reactive_capability",
            "Qmin <= Qmin,wym oraz Qmax >= Qmax,wym",
            {
                "q_range_module": [module.q_range_pct_pn_min, module.q_range_pct_pn_max],
                "q_range_profile": [required_min, required_max],
                "p_max_kw": module.p_max_kw,
            },
            f"[{module.q_range_pct_pn_min:.3f}; {module.q_range_pct_pn_max:.3f}] vs [{required_min:.3f}; {required_max:.3f}]",
            {"q_min_kvar": _round(q_min_kvar, 3), "q_max_kvar": _round(q_max_kvar, 3), "ok": ok},
            "kW * p.u. = kvar przy bazie Pn.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"Zakres Q: {_round(q_min_kvar, 1)} do {_round(q_max_kvar, 1)} kvar.",
            {"q_min_kvar": _round(q_min_kvar, 3), "q_max_kvar": _round(q_max_kvar, 3)},
            [ref],
            ["Wybierz falownik/sterownik z pełnym zakresem Q i krzywą Q(U)."] if not ok else [],
        )

    def _pmax_pmin_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        if definition.test_id == "T10":
            measured_kw = module.p_max_kw
            ok = measured_kw > 0
            label = "PMAX"
        else:
            if module.p_min_kw is None:
                return self._missing(definition, required, reason, "Brak deklarowanej wartości PMIN.")
            measured_kw = module.p_min_kw
            ok = 0 <= measured_kw < module.p_max_kw
            label = "PMIN"
        ref = trace.add(
            definition.test_id,
            label.lower(),
            f"{label} = P deklarowane w programie szczegółowym",
            {"p_max_kw": module.p_max_kw, "p_min_kw": module.p_min_kw},
            f"{label} = {measured_kw:.3f} kW",
            {"value_kw": _round(measured_kw, 3), "ok": ok},
            "Moc czynna w kW.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"{label} potwierdzone z danych katalogowych/deklaracji: {_round(measured_kw, 2)} kW.",
            {f"{label.lower()}_kw": _round(measured_kw, 3)},
            [ref],
            [f"Uzupełnij deklarację {label} w danych modułu."] if not ok else [],
        )

    def _remote_power_command(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        profile: Any,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        enabled = module.stop_generation_enabled if definition.test_id == "T12" else module.reduction_generation_enabled
        if not enabled or module.ramp_rate_pct_per_min is None:
            return self._missing(definition, required, reason, "Brak funkcji zdalnej komendy P albo rampy wykonania.")
        target_kw = 0.0 if definition.test_id == "T12" else 0.2 * module.p_max_kw
        delta_kw = module.p_max_kw - target_kw
        ramp_kw_per_min = module.p_max_kw * module.ramp_rate_pct_per_min / 100.0
        execution_min = delta_kw / max(ramp_kw_per_min, 1e-9)
        reference_ramp = profile.frequency_response.ramp_rate_pct_per_min
        reference_min = delta_kw / max(module.p_max_kw * reference_ramp / 100.0, 1e-9)
        ok = execution_min <= max(2.0 * reference_min, 0.1)
        ref = trace.add(
            definition.test_id,
            "remote_power_command",
            "t_cmd = |P0-Pcmd| / (Pmax * r/100)",
            {"target_kw": target_kw, "ramp_pct_per_min": module.ramp_rate_pct_per_min},
            f"t = {delta_kw:.3f} / {ramp_kw_per_min:.3f}",
            {"execution_time_min": _round(execution_min, 4), "reference_time_min": _round(reference_min, 4), "ok": ok},
            "kW / (kW/min) = min.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"Komenda zdalna P: czas wykonania {_round(execution_min, 3)} min.",
            {"execution_time_min": _round(execution_min, 4), "target_kw": _round(target_kw, 3)},
            [ref],
            ["Uzupełnij funkcję zdalnego ograniczania generacji w sterowniku/SCADA."] if not ok else [],
        )

    def _ride_through_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        profile: Any,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        is_lvrt = definition.test_id == "T14"
        has_curve = module.has_lvrt_curve if is_lvrt else module.has_hvrt_curve
        curve = profile.voltage_levels.lvrt if is_lvrt else profile.voltage_levels.hvrt
        if not has_curve or not module.has_dynamic_model or not curve:
            return self._missing(
                definition,
                required,
                reason,
                "Brak krzywej FRT/HVRT, profilu operatora albo modelu dynamicznego.",
            )
        if is_lvrt:
            limiting = min(curve, key=lambda point: point.voltage_pu)
            simulated_voltage = limiting.voltage_pu
            margin = simulated_voltage - limiting.voltage_pu
            ok = margin >= -1e-9
            formula = "U_sim(t) >= U_LVRT,profile(t)"
        else:
            limiting = max(curve, key=lambda point: point.voltage_pu)
            simulated_voltage = limiting.voltage_pu
            margin = limiting.voltage_pu - simulated_voltage
            ok = margin >= -1e-9
            formula = "U_sim(t) <= U_HVRT,profile(t)"
        ref = trace.add(
            definition.test_id,
            "ride_through_envelope",
            formula,
            {"curve_points": [point.model_dump() for point in curve], "has_dynamic_model": module.has_dynamic_model},
            f"U_sim = {simulated_voltage:.3f} p.u., U_lim = {limiting.voltage_pu:.3f} p.u.",
            {"margin_pu": _round(margin, 6), "critical_time_s": limiting.time_s, "ok": ok},
            "p.u. - p.u. = p.u.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"{'LVRT' if is_lvrt else 'HVRT'}: margines {_round(margin, 4)} p.u. w punkcie {limiting.time_s}s.",
            {"margin_pu": _round(margin, 6), "critical_time_s": limiting.time_s},
            [ref],
            ["Wybierz profil FRT/HVRT i zwalidowany model dynamiczny urządzenia."] if not ok else [],
        )

    def _p_recovery_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        profile: Any,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        if module.p_recovery_time_s is None:
            return self._missing(definition, required, reason, "Brak czasu odbudowy mocy czynnej po FRT.")
        required_time = profile.p_recovery_after_fault.p_recovery_time_s
        ok = module.p_recovery_time_s <= required_time
        ref = trace.add(
            definition.test_id,
            "active_power_recovery",
            "t_recovery,module <= t_recovery,profile",
            {"module_s": module.p_recovery_time_s, "profile_s": required_time},
            f"{module.p_recovery_time_s:.3f} <= {required_time:.3f}",
            {"ok": ok, "margin_s": _round(required_time - module.p_recovery_time_s, 4)},
            "s - s = s.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"Odbudowa P po zakłóceniu: {module.p_recovery_time_s:.3f}s.",
            {"p_recovery_time_s": module.p_recovery_time_s},
            [ref],
            ["Uzupełnij nastawy odbudowy P po FRT lub model dynamiczny."] if not ok else [],
        )

    def _reactive_current_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        if module.reactive_current_gain is None:
            return self._missing(definition, required, reason, "Brak wzmocnienia prądu biernego K_FRT.")
        voltage_drop_pu = 0.5
        iq_pu = min(1.0, module.reactive_current_gain * voltage_drop_pu)
        ok = module.reactive_current_gain >= 2.0 and iq_pu >= 1.0 - 1e-9
        ref = trace.add(
            definition.test_id,
            "reactive_current_injection",
            "Iq = min(1.0, K_FRT * ΔU)",
            {"reactive_current_gain": module.reactive_current_gain, "voltage_drop_pu": voltage_drop_pu},
            f"Iq = min(1.0, {module.reactive_current_gain:.3f} * {voltage_drop_pu:.3f})",
            {"iq_pu": _round(iq_pu, 4), "ok": ok},
            "p.u. * p.u./p.u. = p.u.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"Prąd bierny FRT: Iq={_round(iq_pu, 3)} p.u.",
            {"iq_pu": _round(iq_pu, 4)},
            [ref],
            ["Ustaw K_FRT >= 2 albo wybierz model z szybkim wsparciem napięcia."] if not ok else [],
        )

    def _extended_capability_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        required_flags = {
            "praca_wyspowa": (module.island_operation_required, module.island_operation_capable),
            "rozruch_autonomiczny": (module.black_start_required, module.black_start_capable),
            "tlumienie_oscylacji": (
                module.power_oscillation_damping_required,
                module.power_oscillation_damping_enabled,
            ),
        }
        active = {key: capable for key, (req, capable) in required_flags.items() if req}
        if not active:
            return self._result(definition, required, reason, "not_required", "Nie wskazano wymaganej zdolności dodatkowej.", {}, [])
        ok = all(active.values())
        ref = trace.add(
            definition.test_id,
            "extended_capability",
            "status = wszystkie wymagane zdolności dodatkowe aktywne",
            {"required_flags": required_flags},
            ", ".join(f"{key}={value}" for key, value in active.items()),
            {"ok": ok, "active": active},
            "Wartości logiczne bez jednostek.",
        )
        return self._ok_fail(
            definition,
            True,
            reason,
            ok,
            "Sprawdzono wymagane zdolności dodatkowe programu szczegółowego.",
            {"active_capabilities": active},
            [ref],
            ["Uzupełnij wymagane zdolności: praca wyspowa, black start albo tłumienie oscylacji."] if not ok else [],
        )

    def _observability_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        ok = module.has_scada_communication and module.has_disturbance_recorder
        ref = trace.add(
            definition.test_id,
            "observability",
            "status = SCADA && rejestrator zakłóceń",
            {"has_scada": module.has_scada_communication, "has_recorder": module.has_disturbance_recorder},
            f"{module.has_scada_communication} && {module.has_disturbance_recorder}",
            {"ok": ok},
            "Wartości logiczne bez jednostek.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            "Zweryfikowano obserwowalność i rejestrację zakłóceń.",
            {"has_scada": module.has_scada_communication, "has_recorder": module.has_disturbance_recorder},
            [ref],
            ["Dodaj komunikację SCADA i rejestrator zakłóceń do konfiguracji DER."] if not ok else [],
        )

    def _harmonics_test(
        self,
        definition: NcRfgPtpireeTestDefinition,
        module: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        required: bool,
        reason: str,
    ) -> NcRfgPtpireeTestResult:
        if module.harmonic_thdu_percent is None:
            return self._missing(definition, required, reason, "Brak katalogowej wartości THD_U.")
        limit = 8.0
        ok = module.harmonic_thdu_percent <= limit
        ref = trace.add(
            definition.test_id,
            "harmonic_thdu",
            "THD_U <= 8%",
            {"thdu_percent": module.harmonic_thdu_percent, "limit_percent": limit},
            f"{module.harmonic_thdu_percent:.3f} <= {limit:.3f}",
            {"ok": ok, "margin_percent": _round(limit - module.harmonic_thdu_percent, 4)},
            "% - % = punkt procentowy.",
        )
        return self._ok_fail(
            definition,
            required,
            reason,
            ok,
            f"THD_U źródła: {module.harmonic_thdu_percent:.2f}%.",
            {"thdu_percent": module.harmonic_thdu_percent},
            [ref],
            ["Uruchom pełną analizę harmonicznych E-40 albo wybierz urządzenie o niższej emisji."] if not ok else [],
        )

    def _missing(
        self,
        definition: NcRfgPtpireeTestDefinition,
        required: bool,
        reason: str,
        message: str,
    ) -> NcRfgPtpireeTestResult:
        return self._result(
            definition,
            required,
            reason,
            "no_data" if required else "not_required",
            message if required else f"{message} Test nie jest obowiązkowy w tej klasie.",
            {},
            [],
            [message] if required else [],
        )

    def _ok_fail(
        self,
        definition: NcRfgPtpireeTestDefinition,
        required: bool,
        reason: str,
        ok: bool,
        summary: str,
        metrics: dict[str, Any],
        trace_refs: list[str],
        fix_actions: list[str] | None = None,
    ) -> NcRfgPtpireeTestResult:
        return self._result(
            definition,
            required,
            reason,
            "pass" if ok else "fail",
            summary,
            metrics,
            trace_refs,
            fix_actions or [],
        )

    def _result(
        self,
        definition: NcRfgPtpireeTestDefinition,
        required: bool,
        reason: str,
        verdict: PtpireeVerdict,
        summary: str,
        metrics: dict[str, Any],
        trace_refs: list[str],
        fix_actions: list[str] | None = None,
    ) -> NcRfgPtpireeTestResult:
        return NcRfgPtpireeTestResult(
            test_id=definition.test_id,
            ability_pl=definition.ability_pl,
            required=required,
            required_reason_pl=reason,
            verdict=verdict,
            summary_pl=summary,
            metrics=metrics,
            trace_refs=trace_refs,
            fix_actions=fix_actions or [],
        )

    def _build_report(self, modules: list[NcRfgPtpireeModuleResult], procedure_version: str) -> str:
        lines = [
            "Raport symulacyjny NC RfG / PTPiREE",
            f"Procedura: {procedure_version}",
            f"Solver: {NCRFG_PTPiREE_SOLVER_VERSION}",
            "",
        ]
        for module in modules:
            lines.extend(
                [
                    f"Moduł: {module.der_name or module.der_ref}",
                    f"Operator: {module.operator_name_pl}; typ PGM: {module.module_type}; Pmax: {module.p_max_kw} kW",
                    f"Status: {module.overall_status}; wymagane: {module.required_count}; PASS: {module.pass_count}; FAIL: {module.fail_count}; brak danych: {module.no_data_count}",
                ]
            )
            for test in module.tests:
                if test.required or test.verdict != "not_required":
                    lines.append(f"- {test.test_id} {test.ability_pl}: {test.verdict} - {test.summary_pl}")
            lines.append("")
        return "\n".join(lines).strip()

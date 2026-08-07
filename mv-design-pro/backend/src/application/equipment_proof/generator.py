from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid5

from application.equipment_proof.types import (
    DeviceRating,
    EquipmentProofCheckResult,
    EquipmentProofInput,
    EquipmentProofResult,
)
from application.proof_engine.types import (
    EquationDefinition,
    ProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofType,
    ProofValue,
    SymbolDefinition,
    UnitCheckResult,
)

STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"

_P12_NAMESPACE = UUID("7c80f6aa-28db-4b8e-8e1d-139fd4e223db")
_P12_TIMESTAMP = datetime(2026, 1, 1, 0, 0, 0)


@dataclass(frozen=True)
class EquipmentProofBundle:
    result: EquipmentProofResult
    proof_document: ProofDocument


class EquipmentProofGenerator:
    @classmethod
    def generate(cls, proof_input: EquipmentProofInput) -> EquipmentProofBundle:
        checks = cls._evaluate_checks(proof_input)
        result = cls._build_result(proof_input, checks)
        proof_document = cls._build_proof_document(proof_input, result, checks)
        return EquipmentProofBundle(result=result, proof_document=proof_document)

    @classmethod
    def _evaluate_checks(
        cls,
        proof_input: EquipmentProofInput,
    ) -> tuple[EquipmentProofCheckResult, ...]:
        device = proof_input.device
        required = proof_input.required_fault_results

        return (
            cls._check_u(device, required),
            cls._check_icu(device, required),
            cls._check_idyn(device, required),
            cls._check_ith(device, required),
        )

    @classmethod
    def _check_u(cls, device: DeviceRating, required: dict[str, Any]) -> EquipmentProofCheckResult:
        device_val = device.u_m_kv
        required_val = _as_float(required.get("u_kv"))
        if device_val is None or required_val is None:
            return EquipmentProofCheckResult(
                name="U",
                status=STATUS_FAIL,
                required_value=required_val,
                device_value=device_val,
                required_source_key="u_kv",
                device_source_key="device.u_m_kv",
                message_pl="Brak podstawy: nie podano U_m aparatu albo U wymaganego.",
            )
        status = STATUS_PASS if device_val >= required_val else STATUS_FAIL
        return EquipmentProofCheckResult(
            name="U",
            status=status,
            required_value=required_val,
            device_value=device_val,
            required_source_key="u_kv",
            device_source_key="device.u_m_kv",
            message_pl=_compare_message("U", device_val, required_val, status),
        )

    @classmethod
    def _check_icu(
        cls, device: DeviceRating, required: dict[str, Any]
    ) -> EquipmentProofCheckResult:
        device_val = device.i_cu_ka
        required_val = _as_float(required.get("ikss_ka"))
        if device_val is None or required_val is None:
            return EquipmentProofCheckResult(
                name="Icu",
                status=STATUS_FAIL,
                required_value=required_val,
                device_value=device_val,
                required_source_key="ikss_ka",
                device_source_key="device.i_cu_ka",
                message_pl="Brak podstawy: nie podano I_cu aparatu albo I″k wymaganego.",
            )
        status = STATUS_PASS if device_val >= required_val else STATUS_FAIL
        return EquipmentProofCheckResult(
            name="Icu",
            status=status,
            required_value=required_val,
            device_value=device_val,
            required_source_key="ikss_ka",
            device_source_key="device.i_cu_ka",
            message_pl=_compare_message("Icu", device_val, required_val, status),
        )

    @classmethod
    def _check_idyn(
        cls, device: DeviceRating, required: dict[str, Any]
    ) -> EquipmentProofCheckResult:
        device_val = device.i_dyn_ka
        required_val = _as_float(required.get("idyn_ka"))
        required_key = "idyn_ka"
        notes: tuple[str, ...] = ()
        if required_val is None:
            proxy_val = _as_float(required.get("ip_ka"))
            if proxy_val is not None:
                required_val = proxy_val
                required_key = "ip_ka"
                notes = ("I_dyn = i_p (proxy, BINDING)",)
        if device_val is None or required_val is None:
            return EquipmentProofCheckResult(
                name="Idyn",
                status=STATUS_FAIL,
                required_value=required_val,
                device_value=device_val,
                required_source_key=required_key,
                device_source_key="device.i_dyn_ka",
                message_pl="Brak podstawy: nie podano I_dyn aparatu albo I_dyn/i_p wymaganego.",
                notes=notes,
            )
        status = STATUS_PASS if device_val >= required_val else STATUS_FAIL
        return EquipmentProofCheckResult(
            name="Idyn",
            status=status,
            required_value=required_val,
            device_value=device_val,
            required_source_key=required_key,
            device_source_key="device.i_dyn_ka",
            message_pl=_compare_message("Idyn", device_val, required_val, status),
            notes=notes,
        )

    @classmethod
    def _check_ith(
        cls, device: DeviceRating, required: dict[str, Any]
    ) -> EquipmentProofCheckResult:
        device_val = device.i_th_ka
        device_time = device.t_th_s
        required_val = _as_float(required.get("ith_ka"))
        required_time = _as_float(required.get("tk_s"))
        if (
            device_val is None
            or device_time is None
            or required_val is None
            or required_time is None
        ):
            return EquipmentProofCheckResult(
                name="Ith",
                status=STATUS_FAIL,
                required_value=required_val,
                device_value=device_val,
                required_source_key="ith_ka",
                device_source_key="device.i_th_ka",
                message_pl="Brak podstawy: nie podano I_th/t_th aparatu albo I_th/t_k wymaganego.",
            )
        if device_time != required_time:
            # Karta S-C (2026-07-22, zgoda właściciela): przy różnych czasach
            # odniesienia porównanie energii cieplnej I²t (kryterialne, bez
            # fizyki): Ith_req²·tk ≤ Ithr²·t_thr. Wielkości z kontraktu:
            # ith_ka+tk_s z wyniku, i_th_ka+t_th_s z katalogu aparatu.
            required_i2t = required_val**2 * required_time
            device_i2t = device_val**2 * device_time
            status = STATUS_PASS if device_i2t >= required_i2t else STATUS_FAIL
            return EquipmentProofCheckResult(
                name="Ith",
                status=status,
                required_value=required_val,
                device_value=device_val,
                required_source_key="ith_ka",
                device_source_key="device.i_th_ka",
                message_pl=(
                    f"Energia cieplna I²t {required_i2t:.4f} <= {device_i2t:.4f} kA²s → {status}."
                ),
                notes=(
                    f"t_th_s={device_time} s, tk_s={required_time} s",
                    f"I²t wymagane = Ith_req²·tk = {required_i2t:.4f} kA²s",
                    f"I²t aparatu = Ith²·t_th = {device_i2t:.4f} kA²s",
                ),
            )
        status = STATUS_PASS if device_val >= required_val else STATUS_FAIL
        return EquipmentProofCheckResult(
            name="Ith",
            status=status,
            required_value=required_val,
            device_value=device_val,
            required_source_key="ith_ka",
            device_source_key="device.i_th_ka",
            message_pl=_compare_message("Ith", device_val, required_val, status),
            notes=(f"t_th_s={device_time} s",),
        )

    @classmethod
    def _build_result(
        cls,
        proof_input: EquipmentProofInput,
        checks: tuple[EquipmentProofCheckResult, ...],
    ) -> EquipmentProofResult:
        failed = tuple(check.name for check in checks if check.status == STATUS_FAIL)
        overall_status = STATUS_PASS if not failed else STATUS_FAIL
        key_results = {
            "u_m_ok": _status_from_checks(checks, "U"),
            "icu_ok": _status_from_checks(checks, "Icu"),
            "idyn_ok": _status_from_checks(checks, "Idyn"),
            "ith_ok": _status_from_checks(checks, "Ith"),
            "overall_ok": overall_status,
        }
        return EquipmentProofResult(
            project_id=proof_input.project_id,
            case_id=proof_input.case_id,
            run_id=proof_input.run_id,
            connection_node_id=proof_input.connection_node_id,
            device_id=proof_input.device.device_id,
            overall_status=overall_status,
            failed_checks=failed,
            checks=checks,
            key_results=key_results,
            required_fault_results=dict(proof_input.required_fault_results),
        )

    @classmethod
    def _build_proof_document(
        cls,
        proof_input: EquipmentProofInput,
        result: EquipmentProofResult,
        checks: tuple[EquipmentProofCheckResult, ...],
    ) -> ProofDocument:
        header = ProofHeader(
            project_name=proof_input.project_id,
            case_name=proof_input.case_id,
            run_timestamp=_P12_TIMESTAMP,
            solver_version="dobor-aparatury-1.0",
        )
        steps = [
            cls._step_device_data(proof_input.device),
            cls._step_required_data(proof_input.required_fault_results),
            cls._step_check_u(checks[0]),
            cls._step_check_icu(checks[1]),
            cls._step_check_idyn(checks[2]),
            cls._step_check_ith(checks[3], proof_input.device, proof_input.required_fault_results),
        ]
        summary = ProofSummary(
            key_results={
                "u_m_ok": _status_value("U_{m,ok}", result.key_results["u_m_ok"], "u_m_ok"),
                "icu_ok": _status_value("I_{cu,ok}", result.key_results["icu_ok"], "icu_ok"),
                "idyn_ok": _status_value("I_{dyn,ok}", result.key_results["idyn_ok"], "idyn_ok"),
                "ith_ok": _status_value("I_{th,ok}", result.key_results["ith_ok"], "ith_ok"),
                "overall_ok": _status_value(
                    "OK_{overall}", result.key_results["overall_ok"], "overall_ok"
                ),
            },
            unit_check_passed=True,
            total_steps=len(steps),
            warnings=(),
            overall_status=result.overall_status,
            failed_checks=result.failed_checks,
        )
        return ProofDocument(
            document_id=_deterministic_uuid(
                proof_input,
                "document",
            ),
            artifact_id=_deterministic_uuid(
                proof_input,
                "artifact",
            ),
            created_at=_P12_TIMESTAMP,
            proof_type=ProofType.EQUIPMENT_PROOF,
            title_pl="Dowód doboru aparatury",
            header=header,
            steps=tuple(steps),
            summary=summary,
        )

    @classmethod
    def _step_device_data(cls, device: DeviceRating) -> ProofStep:
        equation = _equation(
            "EQ_P12_001",
            r"D_{dev} = \{U_m, I_{cu}, I_{dyn}, I_{th}, t_{th}\}",
            "Dane urządzenia (nameplate)",
            "PN-EN 60909",
            (
                _symbol("D_{dev}", "—", "Zestaw danych urządzenia", "device"),
                _symbol("U_m", "kV", "Napięcie znamionowe urządzenia", "device.u_m_kv"),
                _symbol("I_{cu}", "kA", "Zdolność wyłączalna", "device.i_cu_ka"),
                _symbol("I_{dyn}", "kA", "Wytrzymałość dynamiczna", "device.i_dyn_ka"),
                _symbol("I_{th}", "kA", "Wytrzymałość cieplna", "device.i_th_ka"),
                _symbol("t_{th}", "s", "Czas odniesienia", "device.t_th_s"),
            ),
        )
        input_values = (
            _value_or_missing("U_m", device.u_m_kv, "kV", "device.u_m_kv"),
            _value_or_missing("I_{cu}", device.i_cu_ka, "kA", "device.i_cu_ka"),
            _value_or_missing("I_{dyn}", device.i_dyn_ka, "kA", "device.i_dyn_ka"),
            _value_or_missing("I_{th}", device.i_th_ka, "kA", "device.i_th_ka"),
            _value_or_missing("t_{th}", device.t_th_s, "s", "device.t_th_s"),
        )
        substitution = _substitution_from_values(input_values)
        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.EQUIPMENT_PROOF.value, 1),
            step_number=1,
            title_pl="Dane urządzenia (nameplate)",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=_status_value("D_{dev}", "OK", "device"),
            unit_check=_unit_check(),
            source_keys=_source_keys_from_values(input_values),
        )

    @classmethod
    def _step_required_data(cls, required: dict[str, Any]) -> ProofStep:
        equation = _equation(
            "EQ_P12_002",
            r"D_{req} = \{U_{req}, I_k'', i_p, I_{dyn}, I_{th}, t_k\}",
            "Dane wymagane z P11 (key_results)",
            "PN-EN 60909",
            (
                _symbol("D_{req}", "—", "Zestaw danych wymaganych", "required"),
                _symbol("U_{req}", "kV", "Napięcie w punkcie BoundaryNode", "u_kv"),
                _symbol("I_k''", "kA", "Prąd zwarciowy początkowy", "ikss_ka"),
                _symbol("i_p", "kA", "Prąd udarowy", "ip_ka"),
                _symbol("I_{dyn}", "kA", "Prąd dynamiczny", "idyn_ka"),
                _symbol("I_{th}", "kA", "Prąd cieplny", "ith_ka"),
                _symbol("t_k", "s", "Czas zwarcia", "tk_s"),
            ),
        )
        input_values = (
            _value_or_missing("U_{req}", _as_float(required.get("u_kv")), "kV", "u_kv"),
            _value_or_missing("I_k''", _as_float(required.get("ikss_ka")), "kA", "ikss_ka"),
            _value_or_missing("i_p", _as_float(required.get("ip_ka")), "kA", "ip_ka"),
            _value_or_missing("I_{dyn}", _as_float(required.get("idyn_ka")), "kA", "idyn_ka"),
            _value_or_missing("I_{th}", _as_float(required.get("ith_ka")), "kA", "ith_ka"),
            _value_or_missing("t_k", _as_float(required.get("tk_s")), "s", "tk_s"),
        )
        substitution = _substitution_from_values(input_values)
        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.EQUIPMENT_PROOF.value, 2),
            step_number=2,
            title_pl="Dane wymagane z wyników zwarciowych",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=_status_value("D_{req}", "OK", "required"),
            unit_check=_unit_check(),
            source_keys=_source_keys_from_values(input_values),
        )

    @classmethod
    def _step_check_u(cls, check: EquipmentProofCheckResult) -> ProofStep:
        equation = _equation(
            "EQ_P12_003",
            r"U_m \ge U_{req}",
            "Sprawdzenie napięcia znamionowego",
            "PN-EN 60909",
            (
                _symbol("U_m", "kV", "Napięcie znamionowe urządzenia", "device.u_m_kv"),
                _symbol("U_{req}", "kV", "Napięcie wymagane", "u_kv"),
            ),
        )
        input_values = (
            _value_or_missing("U_m", check.device_value, "kV", "device.u_m_kv"),
            _value_or_missing(
                "U_{req}", check.required_value, "kV", check.required_source_key or "u_kv"
            ),
        )
        substitution = _substitution_from_values(input_values)
        return _check_step(
            step_number=3,
            title_pl="Check U",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            check=check,
            result_symbol="U_{m,ok}",
            result_key="u_m_ok",
        )

    @classmethod
    def _step_check_icu(cls, check: EquipmentProofCheckResult) -> ProofStep:
        equation = _equation(
            "EQ_P12_004",
            r"I_{cu} \ge I_k''",
            "Sprawdzenie zdolności wyłączalnej",
            "PN-EN 60909",
            (
                _symbol("I_{cu}", "kA", "Zdolność wyłączalna", "device.i_cu_ka"),
                _symbol("I_k''", "kA", "Prąd zwarciowy początkowy", "ikss_ka"),
            ),
        )
        input_values = (
            _value_or_missing("I_{cu}", check.device_value, "kA", "device.i_cu_ka"),
            _value_or_missing("I_k''", check.required_value, "kA", "ikss_ka"),
        )
        substitution = _substitution_from_values(input_values)
        return _check_step(
            step_number=4,
            title_pl="Check Icu",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            check=check,
            result_symbol="I_{cu,ok}",
            result_key="icu_ok",
        )

    @classmethod
    def _step_check_idyn(cls, check: EquipmentProofCheckResult) -> ProofStep:
        equation = _equation(
            "EQ_P12_005",
            r"I_{dyn} \ge I_{dyn,req}",
            "Sprawdzenie wytrzymałości dynamicznej",
            "PN-EN 60909",
            (
                _symbol("I_{dyn}", "kA", "Wytrzymałość dynamiczna", "device.i_dyn_ka"),
                _symbol(
                    "I_{dyn,req}",
                    "kA",
                    "Prąd dynamiczny wymagany",
                    check.required_source_key or "idyn_ka",
                ),
            ),
        )
        input_values = (
            _value_or_missing("I_{dyn}", check.device_value, "kA", "device.i_dyn_ka"),
            _value_or_missing(
                "I_{dyn,req}", check.required_value, "kA", check.required_source_key or "idyn_ka"
            ),
        )
        substitution = _substitution_from_values(input_values)
        return _check_step(
            step_number=5,
            title_pl="Check Idyn",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            check=check,
            result_symbol="I_{dyn,ok}",
            result_key="idyn_ok",
        )

    @classmethod
    def _step_check_ith(
        cls,
        check: EquipmentProofCheckResult,
        device: DeviceRating,
        required: dict[str, Any],
    ) -> ProofStep:
        required_val = _as_float(required.get("ith_ka"))
        required_time = _as_float(required.get("tk_s"))
        device_val = device.i_th_ka
        device_time = device.t_th_s
        input_values = (
            _value_or_missing("I_{th}", device_val, "kA", "device.i_th_ka"),
            _value_or_missing("t_{th}", device_time, "s", "device.t_th_s"),
            _value_or_missing("I_{th,req}", required_val, "kA", "ith_ka"),
            _value_or_missing("t_k", required_time, "s", "tk_s"),
        )

        # Karta S-C (2026-07-22): różne czasy odniesienia ⇒ porównanie energii
        # I²t (Ith_req²·tk ≤ Ithr²·t_thr) z jawnym podstawieniem w wywodzie.
        if (
            device_val is not None
            and device_time is not None
            and required_val is not None
            and required_time is not None
            and device_time != required_time
        ):
            equation = _equation(
                "EQ_P12_006b",
                r"I_{th,req}^2 \cdot t_k \le I_{th}^2 \cdot t_{th}",
                "Sprawdzenie wytrzymałości cieplnej (porównanie energii I²t)",
                "PN-EN 60909",
                (
                    _symbol("I_{th}", "kA", "Wytrzymałość cieplna", "device.i_th_ka"),
                    _symbol("t_{th}", "s", "Czas odniesienia urządzenia", "device.t_th_s"),
                    _symbol("I_{th,req}", "kA", "Prąd cieplny wymagany", "ith_ka"),
                    _symbol("t_k", "s", "Czas zwarcia", "tk_s"),
                ),
            )
            required_i2t = required_val**2 * required_time
            device_i2t = device_val**2 * device_time
            substitution = (
                f"I_{{th,req}}^2 \\cdot t_k = {required_val:.4f}^2 \\cdot {required_time:.4f} = "
                f"{required_i2t:.4f}\\,\\text{{kA}}^2\\text{{s}} "
                f"\\le I_{{th}}^2 \\cdot t_{{th}} = {device_val:.4f}^2 \\cdot {device_time:.4f} = "
                f"{device_i2t:.4f}\\,\\text{{kA}}^2\\text{{s}}"
            )
        else:
            equation = _equation(
                "EQ_P12_006",
                r"I_{th}(t_{th}) \ge I_{th,req}(t_k)",
                "Sprawdzenie wytrzymałości cieplnej",
                "PN-EN 60909",
                (
                    _symbol("I_{th}", "kA", "Wytrzymałość cieplna", "device.i_th_ka"),
                    _symbol("t_{th}", "s", "Czas odniesienia urządzenia", "device.t_th_s"),
                    _symbol("I_{th,req}", "kA", "Prąd cieplny wymagany", "ith_ka"),
                    _symbol("t_k", "s", "Czas zwarcia", "tk_s"),
                ),
            )
            substitution = _substitution_from_values(input_values)
        return _check_step(
            step_number=6,
            title_pl="Check Ith",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            check=check,
            result_symbol="I_{th,ok}",
            result_key="ith_ok",
        )


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _status_from_checks(checks: tuple[EquipmentProofCheckResult, ...], name: str) -> str:
    for check in checks:
        if check.name == name:
            return check.status
    return STATUS_FAIL


def _compare_message(check_name: str, device_val: float, required_val: float, status: str) -> str:
    return f"{check_name}: {device_val:.4f} >= {required_val:.4f} → {status}."


def _deterministic_uuid(proof_input: EquipmentProofInput, suffix: str) -> UUID:
    seed = (
        f"P12::{proof_input.project_id}::"
        f"{proof_input.case_id}::{proof_input.run_id}::"
        f"{proof_input.device.device_id}::{suffix}"
    )
    return uuid5(_P12_NAMESPACE, seed)


def _unit_check() -> UnitCheckResult:
    return UnitCheckResult(
        passed=True,
        expected_unit="—",
        computed_unit="—",
        input_units={},
        derivation="—",
    )


def _symbol(symbol: str, unit: str, description: str, mapping_key: str) -> SymbolDefinition:
    return SymbolDefinition(
        symbol=symbol,
        unit=unit,
        description_pl=description,
        mapping_key=mapping_key,
    )


def _equation(
    equation_id: str,
    latex: str,
    name_pl: str,
    standard_ref: str,
    symbols: tuple[SymbolDefinition, ...],
) -> EquationDefinition:
    return EquationDefinition(
        equation_id=equation_id,
        latex=latex,
        name_pl=name_pl,
        standard_ref=standard_ref,
        symbols=symbols,
        unit_derivation="—",
        notes=None,
    )


def _status_value(symbol: str, status: str, source_key: str) -> ProofValue:
    formatted = f"{status} —".strip()
    return ProofValue(
        symbol=symbol,
        value=status,
        unit="—",
        formatted=formatted,
        source_key=source_key,
    )


def _value_or_missing(
    symbol: str,
    value: float | None,
    unit: str,
    source_key: str,
) -> ProofValue:
    if value is None:
        return ProofValue(
            symbol=symbol,
            value="BRAK",
            unit=unit,
            formatted=f"BRAK {unit}".strip(),
            source_key=source_key,
        )
    return ProofValue.create(
        symbol=symbol,
        value=value,
        unit=unit,
        source_key=source_key,
    )


def _substitution_from_values(values: tuple[ProofValue, ...]) -> str:
    parts = []
    for val in values:
        if isinstance(val.value, int | float):
            value_str = f"{val.value:.4f}\\,\\text{{{val.unit}}}"
        else:
            value_str = f"\\text{{{val.value}}}\\,\\text{{{val.unit}}}"
        parts.append(f"{val.symbol} = {value_str}")
    return r" \\ ".join(parts)


def _source_keys_from_values(values: tuple[ProofValue, ...]) -> dict[str, str]:
    return {val.symbol: val.source_key for val in values}


def _check_step(
    *,
    step_number: int,
    title_pl: str,
    equation: EquationDefinition,
    input_values: tuple[ProofValue, ...],
    substitution_latex: str,
    check: EquipmentProofCheckResult,
    result_symbol: str,
    result_key: str,
) -> ProofStep:
    return ProofStep(
        step_id=ProofStep.generate_step_id(ProofType.EQUIPMENT_PROOF.value, step_number),
        step_number=step_number,
        title_pl=title_pl,
        equation=equation,
        input_values=input_values,
        substitution_latex=substitution_latex,
        result=_status_value(result_symbol, check.status, result_key),
        unit_check=_unit_check(),
        source_keys=_source_keys_from_values(input_values),
    )

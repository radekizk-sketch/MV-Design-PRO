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
from application.equipment_proof.wielkosc_wylaczania import (
    WIELKOSC_IB,
    WielkoscKryteriumWylaczania,
    wielkosc_kryterium_wylaczania,
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
from network_model.catalog.wartosci_robocze import (
    dana_przyjeta_tolerancji_nn,
    dane_przyjete_maszyn,
)
from network_model.pochodne import calka_joule_ka2s
from network_model.solvers.machine_sc_iec60909 import zdanie_zalozen_zaniku_ib_pl
from werdykt import DanaPrzyjeta

STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
#: KARTA UM-ICU-KATALOG (2a): stan jawny dla aparatow bez zdolnosci wylaczania
#: zwarc z definicji normy (rozlacznik/odlacznik/uziemnik). NIE jest to ani
#: PASS (nic nie zostalo sprawdzone), ani FAIL (aparat nie ma tej wady — po
#: prostu kryterium go nie dotyczy). Nie liczy sie do failed_checks.
STATUS_NOT_APPLICABLE = "NIE_DOTYCZY"

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
            cls._check_icu(device, required, zalozenia_zaniku=proof_input.zalozenia_zaniku),
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
            message_pl=_compare_message("U_m", "kV", device_val, required_val),
        )

    @classmethod
    def _check_icu(
        cls,
        device: DeviceRating,
        required: dict[str, Any],
        *,
        zalozenia_zaniku: tuple[dict[str, Any], ...] = (),
    ) -> EquipmentProofCheckResult:
        """Zdolność wyłączania zwarć aparatu wobec prądu, który aparat MA wyłączyć.

        Karta SC-IB-ITH-ZRODLA — rozstrzygnięcie normowe w JEDNYM module
        (`application.equipment_proof.wielkosc_wylaczania`, ten sam predykat woła ocena
        wytrzymałości aparatury pól stacji):

        * wyłącznik SN/WN — IEC 62271-100 § 4.101 (I_sc: wartość skuteczna składowej
          OKRESOWEJ w chwili rozdzielenia styków) wobec symetrycznego prądu wyłączeniowego I_b
          wg IEC 60909-0 rozdz. 9. Składowa nieokresowa i_DC(t_b) (rozdz. 10) idzie do uwag
          kryterium jako informacja: katalog aparatu nie niesie znamionowej składowej
          nieokresowej ani stałej czasowej, więc porównania z nią NIE wystawiamy (brak
          podstawy ≠ spełnia);
        * aparat nN — IEC 60947-2 i IEC 60364-4-43 p. 434.5.1: wobec spodziewanego I_k'';
        * bezpiecznik (IEC 60282-1 / IEC 60269-1) — przerywa przed pierwszym szczytem, jego
          zdolność odnosi się do prądu spodziewanego: wobec I_k'' niezależnie od pasma.

        Brak I_b w wielkościach biegu to brak podstawy kryterium, nigdy cicha podmiana na
        I_k''. Karta TB-WARTOSC-ROBOCZA: I_b z udziałem maszyn wirujących policzony przy t_b
        będącym wartością roboczą — uwaga kryterium nazywa założenie i jego źródło (wynik
        obliczeniowy na danej przyjętej, nie potwierdzony dowód przy rzeczywistym t_b). Karta
        PODSTAWA-Q: I_b, w którym μ albo q maszyny wyznaczono na założeniu inżynierskim (poza
        zakresem albo pomiędzy krzywymi rys. 14 normy), niesie to założenie w uwadze kryterium.
        """
        wielkosc = _wielkosc_wylaczania(device, required)
        required_val = _as_float(required.get(wielkosc.klucz)) if wielkosc else None
        klucz = wielkosc.klucz if wielkosc else "ib_ka"
        notes = _uwagi_wylaczania(wielkosc, required, zalozenia_zaniku=zalozenia_zaniku)
        if device.i_cu_not_applicable:
            # KARTA UM-ICU-KATALOG (2a): rozlacznik/odlacznik/uziemnik nie ma
            # zdolnosci wylaczania zwarc Z DEFINICJI normy — brak i_cu_ka nie
            # jest brakiem danej, tylko wlasciwoscia klasy aparatu. Werdykt
            # NIE_DOTYCZY jest jawny w dowodzie, nigdy pozorny FAIL/PASS.
            return EquipmentProofCheckResult(
                name="Icu",
                status=STATUS_NOT_APPLICABLE,
                required_value=required_val,
                device_value=None,
                required_source_key=klucz,
                device_source_key="device.i_cu_ka",
                message_pl=(
                    "Nie dotyczy — aparat bez zdolności wyłączania zwarć "
                    "(rozłącznik/odłącznik/uziemnik) z definicji normy."
                ),
                notes=notes,
            )
        device_val = device.i_cu_ka
        if wielkosc is None:
            return EquipmentProofCheckResult(
                name="Icu",
                status=STATUS_FAIL,
                required_value=None,
                device_value=device_val,
                required_source_key=klucz,
                device_source_key="device.i_cu_ka",
                message_pl=(
                    "Brak podstawy: bieg nie niesie napięcia znamionowego punktu zwarcia, "
                    "więc nie wiadomo, czy aparat wyłącza prąd I_b (SN/WN, IEC 62271-100), "
                    "czy spodziewany I″k (nN, IEC 60947-2)."
                ),
                notes=notes,
            )
        if device_val is None or required_val is None:
            brak = (
                f"nie podano I_cu aparatu albo {wielkosc.opis_pl} wymaganego"
                if wielkosc.klucz != "ib_ka" or required_val is not None
                else (
                    "wielkości biegu nie niosą prądu wyłączeniowego I_b punktu zwarcia "
                    "(przelicz bieg zwarciowy)"
                )
            )
            return EquipmentProofCheckResult(
                name="Icu",
                status=STATUS_FAIL,
                required_value=required_val,
                device_value=device_val,
                required_source_key=klucz,
                device_source_key="device.i_cu_ka",
                message_pl=f"Brak podstawy: {brak}.",
                notes=notes,
            )
        status = STATUS_PASS if device_val >= required_val else STATUS_FAIL
        return EquipmentProofCheckResult(
            name="Icu",
            status=status,
            required_value=required_val,
            device_value=device_val,
            required_source_key=klucz,
            device_source_key="device.i_cu_ka",
            # Treść nazywa porównane wielkości, wartości i podstawę; status niesie pole
            # `status` (kontrakt werdyktu wyjaśnialnego: tekst nie składa kodu werdyktu).
            message_pl=(
                f"I_cu aparatu {device_val:.4f} kA wobec {wielkosc.opis_pl} "
                f"{required_val:.4f} kA (warunek I_cu ≥ wartość wymagana; {wielkosc.norma})."
            ),
            notes=notes,
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
            message_pl=_compare_message("I_dyn", "kA", device_val, required_val),
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
        if _porownanie_energii_i2t(device_time=device_time, required_time=required_time):
            # Karta S-C (2026-07-22, zgoda właściciela): przy czasie zwarcia DŁUŻSZYM od
            # czasu znamionowego porównanie energii cieplnej I²t (kryterialne, bez
            # fizyki): Ith_req²·tk ≤ Ithr²·t_thr. Wielkości z kontraktu:
            # ith_ka+tk_s z wyniku, i_th_ka+t_th_s z katalogu aparatu.
            # Karta WYTRZYMALOSC-PRAD-POLA: przy czasie KRÓTSZYM od znamionowego
            # równoważność I²t nie działa w górę (IEC 60865-1, wytrzymałość cieplna
            # urządzeń elektrycznych: I_th ≤ I_thr dla T_k ≤ T_kr) — aparat próbowany
            # prądem I_thr nie jest przez to sprawdzony prądem większym; wtedy porównanie
            # wprost niżej.
            required_i2t = calka_joule_ka2s(required_val, required_time)
            device_i2t = calka_joule_ka2s(device_val, device_time)
            status = STATUS_PASS if device_i2t >= required_i2t else STATUS_FAIL
            return EquipmentProofCheckResult(
                name="Ith",
                status=status,
                required_value=required_val,
                device_value=device_val,
                required_source_key="ith_ka",
                device_source_key="device.i_th_ka",
                message_pl=(
                    f"Energia cieplna I²t aparatu {device_i2t:.4f} kA²s wobec wymaganej "
                    f"{required_i2t:.4f} kA²s (warunek I_th²·t_th ≥ I_th,wym²·t_k)."
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
            message_pl=_compare_message("I_th", "kA", device_val, required_val),
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
            dane_przyjete=_dane_przyjete_wejscia(proof_input),
        )

    @classmethod
    def _build_proof_document(
        cls,
        proof_input: EquipmentProofInput,
        result: EquipmentProofResult,
        checks: tuple[EquipmentProofCheckResult, ...],
    ) -> ProofDocument:
        header = ProofHeader(
            project_name=proof_input.project_name,
            case_name=proof_input.case_name,
            run_timestamp=_P12_TIMESTAMP,
            solver_version="dobor-aparatury-1.0",
        )
        steps = [
            cls._step_device_data(proof_input.device),
            cls._step_required_data(proof_input.required_fault_results),
            cls._step_check_u(checks[0]),
            cls._step_check_icu(
                checks[1],
                _wielkosc_wylaczania(proof_input.device, proof_input.required_fault_results),
            ),
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
            warnings=tuple(
                f"Wielkości wymagane liczone z daną przyjętą: {d.nazwa_pl} — {d.powod_pl}"
                for d in result.dane_przyjete
            )
            + tuple(
                uwaga
                for uwaga in (
                    _uwaga_zalozen_zaniku(
                        _wielkosc_wylaczania(
                            proof_input.device, proof_input.required_fault_results
                        ),
                        proof_input.zalozenia_zaniku,
                    ),
                )
                # Aparat bez zdolności wyłączania z definicji (NIE_DOTYCZY) — I_b nie wchodzi
                # do żadnego porównania, więc założenie krzywej nie dotyczy werdyktu.
                if uwaga is not None and not proof_input.device.i_cu_not_applicable
            ),
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
            _value_or_icu(device, "device.i_cu_ka"),
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
            r"D_{req} = \{U_{req}, I_k'', I_b, i_p, I_{dyn}, I_{th}, t_k, t_b, i_{DC}\}",
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
                _symbol("I_b", "kA", "Prąd wyłączeniowy symetryczny", "ib_ka"),
                _symbol("t_b", "s", "Czas wyłączenia", "tb_s"),
                _symbol("i_{DC}", "kA", "Składowa nieokresowa w chwili t_b", "i_dc_ka"),
            ),
        )
        input_values = (
            _value_or_missing("U_{req}", _as_float(required.get("u_kv")), "kV", "u_kv"),
            _value_or_missing("I_k''", _as_float(required.get("ikss_ka")), "kA", "ikss_ka"),
            _value_or_missing("I_b", _as_float(required.get("ib_ka")), "kA", "ib_ka"),
            _value_or_missing("i_p", _as_float(required.get("ip_ka")), "kA", "ip_ka"),
            _value_or_missing("I_{dyn}", _as_float(required.get("idyn_ka")), "kA", "idyn_ka"),
            _value_or_missing("I_{th}", _as_float(required.get("ith_ka")), "kA", "ith_ka"),
            _value_or_missing("t_k", _as_float(required.get("tk_s")), "s", "tk_s"),
            _value_or_missing("t_b", _as_float(required.get("tb_s")), "s", "tb_s"),
            _value_or_missing("i_{DC}", _as_float(required.get("i_dc_ka")), "kA", "i_dc_ka"),
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
    def _step_check_icu(
        cls, check: EquipmentProofCheckResult, wielkosc: WielkoscKryteriumWylaczania | None
    ) -> ProofStep:
        """Krok kryterium wyłączania — wzór i symbol porównywanej wielkości z TEGO SAMEGO
        predykatu co `_check_icu` (`_wielkosc_wylaczania`: I_b dla wyłącznika SN/WN, I_k'' dla
        nN i bezpiecznika), więc dowód mówi, CO porównano. ``None`` (bieg bez napięcia punktu)
        → symbol I_b z brakiem wartości: kryterium bez podstawy, wymienione w treści kroku."""
        if wielkosc is None:
            wielkosc = WIELKOSC_IB
        equation = _equation(
            "EQ_P12_004",
            rf"I_{{cu}} \ge {wielkosc.symbol}",
            "Sprawdzenie zdolności wyłączalnej",
            wielkosc.norma,
            (
                _symbol("I_{cu}", "kA", "Zdolność wyłączalna", "device.i_cu_ka"),
                _symbol(wielkosc.symbol, "kA", wielkosc.opis_pl, wielkosc.klucz),
            ),
        )
        input_values = (
            _value_or_not_applicable(
                "I_{cu}", check.device_value, "kA", "device.i_cu_ka", check.status
            ),
            _value_or_missing(
                wielkosc.symbol,
                _as_float(check.required_value),
                "kA",
                wielkosc.klucz,
            ),
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

        # Karta S-C (2026-07-22): czas zwarcia dłuższy od czasu odniesienia ⇒ porównanie
        # energii I²t (Ith_req²·tk ≤ Ithr²·t_thr) z jawnym podstawieniem w wywodzie. Ten sam
        # predykat co werdykt `_check_ith` — wywód i werdykt nie mogą się rozjechać.
        if (
            device_val is not None
            and device_time is not None
            and required_val is not None
            and required_time is not None
            and _porownanie_energii_i2t(device_time=device_time, required_time=required_time)
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
            required_i2t = calka_joule_ka2s(required_val, required_time)
            device_i2t = calka_joule_ka2s(device_val, device_time)
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


def _wielkosc_wylaczania(
    device: DeviceRating, required: dict[str, Any]
) -> WielkoscKryteriumWylaczania | None:
    """Wejście jedynego predykatu wyboru wielkości kryterium wyłączania dla dowodu doboru:
    napięcie punktu zwarcia z biegu (``u_kv``) i znacznik bezpiecznika z katalogu aparatu."""
    return wielkosc_kryterium_wylaczania(
        _as_float(required.get("u_kv")), bezpiecznik=device.bezpiecznik
    )


def _uwagi_wylaczania(
    wielkosc: WielkoscKryteriumWylaczania | None,
    required: dict[str, Any],
    *,
    zalozenia_zaniku: tuple[dict[str, Any], ...] = (),
) -> tuple[str, ...]:
    """Uwagi kryterium wyłączania: t_b i składowa nieokresowa i_DC(t_b) z biegu (informacja),
    pochodzenie t_b i założenia inżynierskie krzywych zaniku μ/q (karta PODSTAWA-Q)."""
    if wielkosc is not WIELKOSC_IB:
        return ()
    tb_s = _as_float(required.get("tb_s"))
    i_dc_ka = _as_float(required.get("i_dc_ka"))
    if tb_s is None:
        return ("Wielkości biegu nie niosą czasu wyłączenia t_b punktu zwarcia.",)
    tb_txt = f"{tb_s:g}".replace(".", ",")
    uwagi = [
        (
            f"t_b = {tb_txt} s."
            if i_dc_ka is None
            else (
                f"t_b = {tb_txt} s; składowa nieokresowa i_DC(t_b) = "
                f"{f'{i_dc_ka:.4f}'.replace('.', ',')} kA (IEC 60909-0 rozdz. 10) — "
                "informacyjnie: katalog aparatu nie niesie znamionowej składowej nieokresowej, "
                "porównania z nią nie wystawiono."
            )
        )
    ]
    # Karta TB-WARTOSC-ROBOCZA: pochodzenie t_b punktu (pola lokalne albo wartość robocza).
    zrodlo = required.get("tb_zrodlo")
    if isinstance(zrodlo, dict):
        uwagi.append(f"Czas wyłączenia: {zrodlo.get('opis_pl')}")
        if zrodlo.get("wartosc_robocza") and zrodlo.get("ib_z_udzialem_maszyn"):
            uwagi.append(
                "I_b z udziałem maszyn wirujących zależy od t_b (współczynniki μ, q — IEC "
                "60909-0:2016 rozdz. 9), a t_b jest wartością roboczą: porównanie z I_cu jest "
                "wynikiem obliczeniowym na danej przyjętej, nie potwierdzonym dowodem przy "
                "rzeczywistym czasie wyłączenia."
            )
    uwaga_zaniku = _uwaga_zalozen_zaniku(wielkosc, zalozenia_zaniku)
    if uwaga_zaniku is not None:
        uwagi.append(uwaga_zaniku)
    return tuple(uwagi)


def _uwaga_zalozen_zaniku(
    wielkosc: WielkoscKryteriumWylaczania | None, zalozenia_zaniku: tuple[dict[str, Any], ...]
) -> str | None:
    """Karta PODSTAWA-Q: zdanie o założeniach inżynierskich krzywych zaniku μ/q, na których
    stoi I_b porównywany z I_cu — JEDNO źródło dla uwagi kryterium i ostrzeżenia dowodu.

    ``None``, gdy kryterium nie porównuje I_b (aparat nN, bezpiecznik) albo gdy wszystkie μ, q
    punktu wyznaczono z zapisu normy. Zdanie z `zdanie_zalozen_zaniku_ib_pl` — to samo
    zdanie co w zakresie ważności oceny aparatury pól stacji.
    """
    if wielkosc is not WIELKOSC_IB:
        return None
    return zdanie_zalozen_zaniku_ib_pl(zalozenia_zaniku)


def _porownanie_energii_i2t(*, device_time: float, required_time: float) -> bool:
    """JEDYNY predykat wyboru porównania I²t dla kryterium cieplnego (werdykt i wywód).

    Równoważność energii cieplnej działa tylko dla czasu zwarcia DŁUŻSZEGO od czasu
    znamionowego aparatu (IEC 60865-1, wytrzymałość cieplna urządzeń elektrycznych:
    I_th ≤ I_thr dla T_k ≤ T_kr, I_th ≤ I_thr·√(T_kr/T_k) dla T_k ≥ T_kr). Przy czasie
    krótszym albo równym obowiązuje porównanie wprost I_th,req ≤ I_thr.
    """
    return required_time > device_time


def _dane_przyjete_wejscia(proof_input: EquipmentProofInput) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte wymaganych wielkości — stoją w wyniku i w ostrzeżeniu dowodu.

    Punkt zabudowy w sieci nN liczonej z wartością roboczą tolerancji napięcia (karta
    TOLERANCJA-NN-WARTOSC-ROBOCZA) i linie 110 kV z wartością roboczą geometrii w wyspie punktu
    (karta LINIA-110) — każde z czterech sprawdzeń porównuje wielkość z tego biegu.
    Wartości robocze parametrów maszyn wirujących wyspy punktu (karta PODSTAWA-Q,
    rozstrzygnięcie 3) — gdy wpływają na wielkość porównywaną w którymkolwiek sprawdzeniu
    zwarciowym: I_p (I_dyn), I_th (I_th) i wielkość kryterium wyłączania (I_cu; aparat bez
    zdolności wyłączania z definicji tego porównania nie ma).
    """
    tolerancja = (
        (
            dana_przyjeta_tolerancji_nn(
                miejsce_pl=f"punkt zabudowy aparatu „{proof_input.device.name_pl}”"
            ),
        )
        if proof_input.tolerancja_nn_robocza
        else ()
    )
    wielkosci = ["ip", "ith"]
    wielkosc_wylaczania = _wielkosc_wylaczania(
        proof_input.device, proof_input.required_fault_results
    )
    if wielkosc_wylaczania is not None and not proof_input.device.i_cu_not_applicable:
        wielkosci.append(wielkosc_wylaczania.wielkosc_zwarciowa)
    return (
        tolerancja
        + proof_input.dane_galezi
        + dane_przyjete_maszyn(proof_input.parametry_robocze_maszyn, wielkosc=wielkosci)
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


def _compare_message(symbol: str, jednostka: str, device_val: float, required_val: float) -> str:
    """Treść porównania: wielkość aparatu, wartość wymagana, jednostka i warunek.

    Status kryterium niesie wyłącznie pole ``status`` wyniku sprawdzenia — tekst nie składa
    kodu werdyktu (kontrakt werdyktu wyjaśnialnego; ta sama forma co sprawdzenie I_cu).
    """
    return (
        f"{symbol} aparatu {device_val:.4f} {jednostka} wobec wartości wymaganej "
        f"{required_val:.4f} {jednostka} (warunek {symbol} aparatu ≥ wartość wymagana)."
    )


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


def _value_or_icu(device: DeviceRating, source_key: str) -> ProofValue:
    """I_cu w kroku "dane urządzenia" — NIE_DOTYCZY zamiast BRAK, gdy aparat
    nie ma zdolności wyłączania zwarć z definicji normy (2a).
    """
    if device.i_cu_not_applicable:
        return ProofValue(
            symbol="I_{cu}",
            value="NIE DOTYCZY",
            unit="kA",
            formatted="NIE DOTYCZY kA".strip(),
            source_key=source_key,
        )
    return _value_or_missing("I_{cu}", device.i_cu_ka, "kA", source_key)


def _value_or_not_applicable(
    symbol: str,
    value: float | None,
    unit: str,
    source_key: str,
    status: str,
) -> ProofValue:
    """Jak ``_value_or_missing``, ale rozróżnia NIE_DOTYCZY od braku danej."""
    if status == STATUS_NOT_APPLICABLE:
        return ProofValue(
            symbol=symbol,
            value="NIE DOTYCZY",
            unit=unit,
            formatted=f"NIE DOTYCZY {unit}".strip(),
            source_key=source_key,
        )
    return _value_or_missing(symbol, value, unit, source_key)


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

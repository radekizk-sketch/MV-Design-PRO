from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid5

from application.equipment_proof.oceny import OcenyDoboruAparatu, oceny_doboru_aparatu
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
from network_model.solvers.machine_sc_iec60909 import zdanie_zalozen_zaniku_ib_pl
from werdykt import DanaPrzyjeta, FieldQuality, OcenaKryterium, Wielkosc
from werdykt.porownanie import projekcja_statusu, relacja_latex

_P12_NAMESPACE = UUID("7c80f6aa-28db-4b8e-8e1d-139fd4e223db")
_P12_TIMESTAMP = datetime(2026, 1, 1, 0, 0, 0)


@dataclass(frozen=True)
class EquipmentProofBundle:
    result: EquipmentProofResult
    proof_document: ProofDocument


class EquipmentProofGenerator:
    @classmethod
    def generate(cls, proof_input: EquipmentProofInput) -> EquipmentProofBundle:
        oceny = cls._oceny(proof_input)
        checks = cls._evaluate_checks(proof_input, oceny)
        result = cls._build_result(proof_input, checks, oceny)
        proof_document = cls._build_proof_document(proof_input, result, checks, oceny)
        return EquipmentProofBundle(result=result, proof_document=proof_document)

    @classmethod
    def _oceny(cls, proof_input: EquipmentProofInput) -> OcenyDoboruAparatu:
        """Rekordy K czterech sprawdzeń i rekord W doboru — JEDNO źródło statusów dowodu
        (karta WERDYKT-MIGRACJA-190, C33): krok, podsumowanie i kod agregatu je cytują."""
        device = proof_input.device
        required = proof_input.required_fault_results
        wielkosc = _wielkosc_wylaczania(device, required)
        return oceny_doboru_aparatu(
            device=device,
            required=required,
            wielkosc=wielkosc,
            punkt_pl=f"węzeł przyłączenia {proof_input.connection_node_id}",
            run_id=proof_input.run_id,
            dane_ip=_dane_wielkosci(proof_input, "ip"),
            dane_ith=_dane_wielkosci(proof_input, "ith"),
            dane_wylaczania=(
                ()
                if wielkosc is None or device.i_cu_not_applicable
                else _dane_wielkosci(proof_input, wielkosc.wielkosc_zwarciowa)
                + _dana_czasu_tb(required, wielkosc)
            ),
        )

    @classmethod
    def _evaluate_checks(
        cls,
        proof_input: EquipmentProofInput,
        oceny: OcenyDoboruAparatu,
    ) -> tuple[EquipmentProofCheckResult, ...]:
        """Cztery sprawdzenia: liczby porównania (do wywodu) i rekord K (rozstrzygnięcie)."""
        device = proof_input.device
        required = proof_input.required_fault_results
        wielkosc = _wielkosc_wylaczania(device, required)
        klucz_wylaczania = wielkosc.klucz if wielkosc is not None else "ib_ka"
        klucz_ip = "idyn_ka" if _as_float(required.get("idyn_ka")) is not None else "ip_ka"
        return (
            _sprawdzenie(
                "U",
                oceny.izolacja,
                # U_s sieci (wielkość oceniana rekordu, z tablicy IEC 60038 dla U_n punktu).
                required_value=(
                    None if oceny.izolacja.wynik is None else oceny.izolacja.wynik.wartosc.wartosc
                ),
                device_value=device.u_m_kv,
                required_source_key="u_kv",
                device_source_key="device.u_m_kv",
            ),
            _sprawdzenie(
                "Icu",
                oceny.wylaczanie,
                required_value=(
                    _as_float(required.get(wielkosc.klucz)) if wielkosc is not None else None
                ),
                device_value=None if device.i_cu_not_applicable else device.i_cu_ka,
                required_source_key=klucz_wylaczania,
                device_source_key="device.i_cu_ka",
                notes=_uwagi_wylaczania(
                    wielkosc, required, zalozenia_zaniku=proof_input.zalozenia_zaniku
                ),
            ),
            _sprawdzenie(
                "Idyn",
                oceny.dynamiczna,
                required_value=_as_float(required.get(klucz_ip)),
                device_value=device.i_dyn_ka,
                required_source_key=klucz_ip,
                device_source_key="device.i_dyn_ka",
            ),
            _sprawdzenie(
                "Ith",
                oceny.cieplna,
                required_value=_as_float(required.get("ith_ka")),
                device_value=device.i_th_ka,
                required_source_key="ith_ka",
                device_source_key="device.i_th_ka",
                notes=_uwagi_cieplne(oceny.cieplna, device, required),
            ),
        )

    @classmethod
    def _build_result(
        cls,
        proof_input: EquipmentProofInput,
        checks: tuple[EquipmentProofCheckResult, ...],
        oceny: OcenyDoboruAparatu,
    ) -> EquipmentProofResult:
        return EquipmentProofResult(
            project_id=proof_input.project_id,
            case_id=proof_input.case_id,
            run_id=proof_input.run_id,
            connection_node_id=proof_input.connection_node_id,
            device_id=proof_input.device.device_id,
            wymaganie=oceny.wymaganie,
            failed_checks=_naruszone(checks),
            checks=checks,
            required_fault_results=dict(proof_input.required_fault_results),
            dane_przyjete=_dane_przyjete_wejscia(proof_input),
        )

    @classmethod
    def _build_proof_document(
        cls,
        proof_input: EquipmentProofInput,
        result: EquipmentProofResult,
        checks: tuple[EquipmentProofCheckResult, ...],
        oceny: OcenyDoboruAparatu,
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
        # Podsumowanie cytuje ETYKIETY rekordów (kontrakt werdyktu §9) — nigdy gołego kodu;
        # kod agregatu dla filtrów i API jest projekcją rekordów K (`projekcja_statusu`):
        # brak danej nie jest naruszeniem (dawniej „FAIL”), tylko rozstrzygnięciem otwartym.
        summary = ProofSummary(
            key_results={
                "izolacja_ocena": _etykieta_rekordu("U_m", oceny.izolacja, "izolacja_ocena"),
                "wylaczanie_ocena": _etykieta_rekordu(
                    "I_{cu}", oceny.wylaczanie, "wylaczanie_ocena"
                ),
                "dynamiczna_ocena": _etykieta_rekordu(
                    "I_{dyn}", oceny.dynamiczna, "dynamiczna_ocena"
                ),
                "cieplna_ocena": _etykieta_rekordu("I_{th}", oceny.cieplna, "cieplna_ocena"),
                "dobor_ocena": ProofValue(
                    symbol=r"\text{dobór}",
                    value=oceny.wymaganie.etykieta.etykieta_pl,
                    unit="—",
                    formatted=oceny.wymaganie.wyjasnienie.zdanie_pl,
                    source_key="dobor_ocena",
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
            overall_status=projekcja_statusu(
                oceny.oceny,
                spelnia="PASS",
                nie_spelnia="FAIL",
                nierozstrzygniete="NIEROZSTRZYGALNE",
            ),
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
            "Dane znamionowe urządzenia",
            "PN-EN 62271-1 § 4 (wielkości znamionowe aparatury)",
            (
                _symbol("D_{dev}", "—", "Zestaw danych urządzenia", "device"),
                _symbol("U_m", "kV", "Napięcie najwyższe urządzenia", "device.u_m_kv"),
                _symbol("I_{cu}", "kA", "Zdolność wyłączania zwarciowa", "device.i_cu_ka"),
                _symbol(
                    "I_{dyn}", "kA", "Znamionowy prąd szczytowy wytrzymywany", "device.i_dyn_ka"
                ),
                _symbol(
                    "I_{th}", "kA", "Znamionowy prąd krótkotrwały wytrzymywany", "device.i_th_ka"
                ),
                _symbol("t_{th}", "s", "Czas trwania prądu krótkotrwałego", "device.t_th_s"),
            ),
        )
        input_values = (
            _value_or_missing("U_m", device.u_m_kv, "kV", "device.u_m_kv"),
            _value_or_icu(device, "device.i_cu_ka"),
            _value_or_missing("I_{dyn}", device.i_dyn_ka, "kA", "device.i_dyn_ka"),
            _value_or_missing("I_{th}", device.i_th_ka, "kA", "device.i_th_ka"),
            _value_or_missing("t_{th}", device.t_th_s, "s", "device.t_th_s"),
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.EQUIPMENT_PROOF.value, 1),
            step_number=1,
            title_pl="Dane znamionowe urządzenia",
            equation=equation,
            input_values=input_values,
            substitution_latex=_substitution_from_values(input_values),
            result=_zestawienie("D_{dev}", input_values, "device"),
            unit_check=_unit_check(),
            source_keys=_source_keys_from_values(input_values),
        )

    @classmethod
    def _step_required_data(cls, required: dict[str, Any]) -> ProofStep:
        equation = _equation(
            "EQ_P12_002",
            r"D_{req} = \{U_{req}, I_k'', I_b, i_p, I_{dyn}, I_{th}, t_k, t_b, i_{DC}\}",
            "Wielkości wymagane z zapisanego biegu zwarciowego",
            "IEC 60909-0:2016",
            (
                _symbol("D_{req}", "—", "Zestaw danych wymaganych", "required"),
                _symbol("U_{req}", "kV", "Napięcie znamionowe sieci w punkcie zabudowy", "u_kv"),
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
        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.EQUIPMENT_PROOF.value, 2),
            step_number=2,
            title_pl="Dane wymagane z wyników zwarciowych",
            equation=equation,
            input_values=input_values,
            substitution_latex=_substitution_from_values(input_values),
            result=_zestawienie("D_{req}", input_values, "required"),
            unit_check=_unit_check(),
            source_keys=_source_keys_from_values(input_values),
        )

    @classmethod
    def _step_check_u(cls, check: EquipmentProofCheckResult) -> ProofStep:
        equation = _equation(
            "EQ_P12_003",
            check.ocena.kryterium.warunek_latex,
            "Sprawdzenie poziomu izolacji: napięcie najwyższe urządzenia wobec napięcia "
            "najwyższego sieci",
            "IEC 60071-1:2006 p. 3.9–3.10; IEC 60038 tab. 3–5; PN-EN 62271-1 p. 5.2",
            (
                _symbol("U_m", "kV", "Napięcie najwyższe urządzenia", "device.u_m_kv"),
                _symbol("U_s", "kV", "Napięcie najwyższe sieci (IEC 60038)", "u_s_kv"),
            ),
        )
        input_values = (
            _value_or_missing("U_m", _as_float(check.device_value), "kV", "device.u_m_kv"),
            _value_or_missing("U_s", _as_float(check.required_value), "kV", "u_s_kv"),
        )
        return _check_step(
            step_number=3,
            title_pl="Sprawdzenie poziomu izolacji U_m",
            equation=equation,
            input_values=input_values,
            check=check,
            result_symbol="U_m",
            result_key="izolacja_ocena",
        )

    @classmethod
    def _step_check_icu(
        cls, check: EquipmentProofCheckResult, wielkosc: WielkoscKryteriumWylaczania | None
    ) -> ProofStep:
        """Krok kryterium wyłączania — wzór i symbol porównywanej wielkości z TEGO SAMEGO
        predykatu co rekord K (`_wielkosc_wylaczania`: I_b dla wyłącznika SN/WN, I_k'' dla nN
        i bezpiecznika), więc dowód mówi, CO porównano. ``None`` (bieg bez napięcia punktu)
        → symbol I_b z brakiem wartości: rekord nazywa brak."""
        if wielkosc is None:
            wielkosc = WIELKOSC_IB
        equation = _equation(
            "EQ_P12_004",
            check.ocena.kryterium.warunek_latex,
            "Sprawdzenie zdolności wyłączania zwarciowej",
            wielkosc.norma,
            (
                _symbol("I_{cu}", "kA", "Zdolność wyłączania zwarciowa", "device.i_cu_ka"),
                _symbol(wielkosc.symbol, "kA", wielkosc.opis_pl, wielkosc.klucz),
            ),
        )
        input_values = (
            _value_or_not_applicable(
                "I_{cu}", _as_float(check.device_value), "kA", "device.i_cu_ka", check.ocena
            ),
            _value_or_missing(
                wielkosc.symbol, _as_float(check.required_value), "kA", wielkosc.klucz
            ),
        )
        return _check_step(
            step_number=4,
            title_pl="Sprawdzenie zdolności wyłączania I_cu",
            equation=equation,
            input_values=input_values,
            check=check,
            result_symbol="I_{cu}",
            result_key="wylaczanie_ocena",
        )

    @classmethod
    def _step_check_idyn(cls, check: EquipmentProofCheckResult) -> ProofStep:
        equation = _equation(
            "EQ_P12_005",
            check.ocena.kryterium.warunek_latex,
            "Sprawdzenie wytrzymałości dynamicznej",
            "PN-EN 62271-1 § 4.6",
            (
                _symbol(
                    "I_{dyn}", "kA", "Znamionowy prąd szczytowy wytrzymywany", "device.i_dyn_ka"
                ),
                _symbol(
                    "i_p",
                    "kA",
                    "Prąd udarowy w punkcie zabudowy",
                    check.required_source_key or "idyn_ka",
                ),
            ),
        )
        input_values = (
            _value_or_missing("I_{dyn}", _as_float(check.device_value), "kA", "device.i_dyn_ka"),
            _value_or_missing(
                "i_p",
                _as_float(check.required_value),
                "kA",
                check.required_source_key or "idyn_ka",
            ),
        )
        return _check_step(
            step_number=5,
            title_pl="Sprawdzenie wytrzymałości dynamicznej I_dyn",
            equation=equation,
            input_values=input_values,
            check=check,
            result_symbol="I_{dyn}",
            result_key="dynamiczna_ocena",
        )

    @classmethod
    def _step_check_ith(
        cls,
        check: EquipmentProofCheckResult,
        device: DeviceRating,
        required: dict[str, Any],
    ) -> ProofStep:
        """Krok wytrzymałości cieplnej — limit z REKORDU (``limit_cieplny_aparatu_ka``:
        I_thr przy T_k ≤ T_kr, I_thr·√(T_kr/T_k) przy T_k > T_kr — IEC 60865-1), więc wywód
        i rozstrzygnięcie nie mogą się rozjechać."""
        equation = _equation(
            "EQ_P12_006",
            check.ocena.kryterium.warunek_latex,
            "Sprawdzenie wytrzymałości cieplnej",
            "IEC 60865-1:2011; PN-EN 62271-1 § 4.5, § 4.7",
            (
                _symbol("I_{thr}", "kA", "Znamionowy prąd krótkotrwały", "device.i_th_ka"),
                _symbol("T_{kr}", "s", "Czas trwania prądu krótkotrwałego", "device.t_th_s"),
                _symbol("I_{th}", "kA", "Prąd cieplny zastępczy zwarcia", "ith_ka"),
                _symbol("T_k", "s", "Czas zwarcia", "tk_s"),
            ),
        )
        input_values = (
            _value_or_missing("I_{thr}", device.i_th_ka, "kA", "device.i_th_ka"),
            _value_or_missing("T_{kr}", device.t_th_s, "s", "device.t_th_s"),
            _value_or_missing("I_{th}", _as_float(required.get("ith_ka")), "kA", "ith_ka"),
            _value_or_missing("T_k", _as_float(required.get("tk_s")), "s", "tk_s"),
        )
        return _check_step(
            step_number=6,
            title_pl="Sprawdzenie wytrzymałości cieplnej I_th",
            equation=equation,
            input_values=input_values,
            check=check,
            result_symbol="I_{th}",
            result_key="cieplna_ocena",
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
    ocena: OcenaKryterium,
) -> ProofValue:
    """Jak ``_value_or_missing``, ale rozróżnia „nie dotyczy” (z REKORDU) od braku danej."""
    if ocena.status_maszynowy == "NIE_DOTYCZY":
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
    check: EquipmentProofCheckResult,
    result_symbol: str,
    result_key: str,
) -> ProofStep:
    """Krok sprawdzenia: podstawienie liczb porównania i ROZSTRZYGNIĘCIE z rekordu K —
    relacja wyniku wobec limitu (``relacja_latex``) i zdanie rekordu; wynik kroku to etykieta
    rekordu (kontrakt werdyktu §9), nigdy gołe słowo statusu."""
    return ProofStep(
        step_id=ProofStep.generate_step_id(ProofType.EQUIPMENT_PROOF.value, step_number),
        step_number=step_number,
        title_pl=title_pl,
        equation=equation,
        input_values=input_values,
        substitution_latex=_podstawienie_rekordu(input_values, check.ocena),
        result=_etykieta_rekordu(result_symbol, check.ocena, result_key),
        unit_check=_unit_check(),
        source_keys=_source_keys_from_values(input_values),
    )


def _podstawienie_rekordu(values: tuple[ProofValue, ...], ocena: OcenaKryterium) -> str:
    """Podstawienie wielkości kroku i — gdy rekord ma wynik i limit — porównanie z rekordu
    (znak relacji z ``relacja_latex``: jedno źródło rozstrzygnięcia), potem zdanie rekordu."""
    linie = [_substitution_from_values(values)]
    if ocena.wynik is not None and ocena.limit is not None and ocena.limit.wartosc is not None:
        linie.append(
            f"{ocena.wynik.symbol_latex or ocena.kryterium_id} = "
            rf"{ocena.wynik.wartosc.wartosc:.4f}\,\text{{{ocena.wynik.wartosc.jednostka}}} "
            f"{relacja_latex(ocena)} "
            rf"{ocena.limit.wartosc.wartosc:.4f}\,\text{{{ocena.limit.wartosc.jednostka}}}"
        )
    zdanie = ocena.wyjasnienie.zdanie_pl.replace("\\", "/").replace("{", "(").replace("}", ")")
    linie.append(f"\\text{{{zdanie}}}")
    return r" \\ ".join(linie)


def _etykieta_rekordu(symbol: str, ocena: OcenaKryterium, source_key: str) -> ProofValue:
    """Wynik kroku i pozycja podsumowania: etykieta rekordu K, zdanie rekordu w ``formatted``."""
    return ProofValue(
        symbol=symbol,
        value=ocena.etykieta.etykieta_pl,
        unit="—",
        formatted=ocena.wyjasnienie.zdanie_pl,
        source_key=source_key,
    )


def _zestawienie(symbol: str, values: tuple[ProofValue, ...], source_key: str) -> ProofValue:
    """Wynik kroku zestawienia danych: liczba podanych wielkości (nie ocena)."""
    podane = sum(1 for v in values if isinstance(v.value, int | float))
    return ProofValue(
        symbol=symbol,
        value=f"podano {podane} z {len(values)} wielkości",
        unit="—",
        formatted=f"podano {podane} z {len(values)} wielkości",
        source_key=source_key,
    )


def _sprawdzenie(
    nazwa: str,
    ocena: OcenaKryterium,
    *,
    required_value: float | None,
    device_value: float | None,
    required_source_key: str,
    device_source_key: str,
    notes: tuple[str, ...] = (),
) -> EquipmentProofCheckResult:
    """Wynik sprawdzenia: liczby porównania z wejścia i rekord K; komunikat = zdanie rekordu."""
    return EquipmentProofCheckResult(
        name=nazwa,
        ocena=ocena,
        required_value=required_value,
        device_value=device_value,
        required_source_key=required_source_key,
        device_source_key=device_source_key,
        message_pl=ocena.wyjasnienie.zdanie_pl,
        notes=notes,
    )


def _naruszone(checks: tuple[EquipmentProofCheckResult, ...]) -> tuple[str, ...]:
    """Nazwy sprawdzeń z rekordem ``NIE_SPELNIA`` (brak danej nie jest naruszeniem)."""
    return tuple(c.name for c in checks if c.ocena.status_maszynowy == "NIE_SPELNIA")


def _limit(ocena: OcenaKryterium) -> float | None:
    """Wartość graniczna rekordu (np. U_s z tablicy IEC 60038) — do wywodu kroku."""
    if ocena.limit is None or ocena.limit.wartosc is None:
        return None
    return ocena.limit.wartosc.wartosc


def _uwagi_cieplne(
    ocena: OcenaKryterium, device: DeviceRating, required: dict[str, Any]
) -> tuple[str, ...]:
    """Uwaga kryterium cieplnego: czasy i limit przeliczony z rekordu (bez drugiej reguły)."""
    t_k = _as_float(required.get("tk_s"))
    if device.t_th_s is None or t_k is None:
        return ()
    limit = _limit(ocena)
    return (
        f"T_kr = {device.t_th_s:g} s, T_k = {t_k:g} s"
        + ("" if limit is None else f"; limit przeliczony na T_k = {limit:.4f} kA"),
    )


def _dane_wielkosci(proof_input: EquipmentProofInput, wielkosc: str) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte porównywanego prądu (``ip``/``ith``/``ib``/``ikss``): tolerancja sieci nN,
    gałęzie z wartością roboczą i parametry maszyn wpływające na tę wielkość."""
    tolerancja = (
        (
            dana_przyjeta_tolerancji_nn(
                miejsce_pl=f"punkt zabudowy aparatu „{proof_input.device.name_pl}”"
            ),
        )
        if proof_input.tolerancja_nn_robocza
        else ()
    )
    return (
        tolerancja
        + proof_input.dane_galezi
        + dane_przyjete_maszyn(proof_input.parametry_robocze_maszyn, wielkosc=wielkosc)
    )


def _dana_czasu_tb(
    required: dict[str, Any], wielkosc: WielkoscKryteriumWylaczania
) -> tuple[DanaPrzyjeta, ...]:
    """t_b będące wartością roboczą, gdy stoi za porównywanym I_b z udziałem maszyn (karta
    TB-WARTOSC-ROBOCZA) — te same flagi wiersza biegu co ocena aparatury pól stacji."""
    zrodlo = required.get("tb_zrodlo")
    tb_s = _as_float(required.get("tb_s"))
    if (
        wielkosc is not WIELKOSC_IB
        or not isinstance(zrodlo, dict)
        or tb_s is None
        or not zrodlo.get("wartosc_robocza")
        or not zrodlo.get("ib_z_udzialem_maszyn")
    ):
        return ()
    return (
        DanaPrzyjeta(
            nazwa_pl="czas wyłączenia t_b punktu zabudowy",
            wartosc=Wielkosc(wartosc=tb_s, jednostka="s"),
            powod_pl=str(zrodlo.get("opis_pl")),
            jakosc=FieldQuality.ESTIMATED,
        ),
    )

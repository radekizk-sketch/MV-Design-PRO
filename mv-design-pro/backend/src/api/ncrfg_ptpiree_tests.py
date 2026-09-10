from __future__ import annotations

from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin, klucz_twin_z_sciezki
from application.analyses.dowod_certyfikatu import (
    NcRfgCertificateEvidence,
    dowody_certyfikatu,
)
from application.ncrfg_compliance import (
    NcRfgComplianceChecker,
    build_der_compliance_list_from_enm,
)
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from compliance.nc_rfg_modul import modul_nc_rfg
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Request, status
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG

router = APIRouter(prefix="/api/ncrfg-tests", tags=["ncrfg-ptpiree-tests"])
_solver = NcRfgPtpireeSolver()
_compliance_checker = NcRfgComplianceChecker()


@router.get("/catalog")
def get_ncrfg_test_catalog() -> dict[str, object]:
    operators = []
    for operator_id in list_available_operators():
        profile = load_nc_rfg_profile(operator_id)
        operators.append(
            {
                "operator_id": profile.operator_id,
                "operator_name_pl": profile.operator_name_pl,
                "last_revision": profile.last_revision,
                "module_types": [item.model_dump(mode="json") for item in profile.module_types],
                "frequency_response": profile.frequency_response.model_dump(mode="json"),
                "reactive_power": profile.reactive_power.model_dump(mode="json"),
                "p_recovery_after_fault": profile.p_recovery_after_fault.model_dump(mode="json"),
                # Karta FAB-J: krzywe LVRT/HVRT (listy punktów czas/napięcie) BYŁY
                # w profilu (`NcRfgProfile.voltage_levels`) od karty PR-9, ale ten
                # katalog ich nie zwracał — front miał je wyłącznie w statycznym
                # mirrorze (`station-der/catalogs.ts::LVRT_CURVE_CATALOG`/
                # `HVRT_CURVE_CATALOG`). Pole ADDYTYWNE, zero zmiany kontraktu
                # istniejących pól.
                "ride_through": profile.voltage_levels.model_dump(mode="json"),
            }
        )
    return {
        "procedure_version": "PTPiREE Procedura testowania v3.0",
        "source_ref": "https://ptpiree.pl/kodeksy-sieci/procedura-testowania/",
        "operators": operators,
        "tests": [item.model_dump(mode="json") for item in TEST_CATALOG],
    }


@router.get("/modul")
def klasyfikuj_modul_ncrfg(p_max_mw: float, napiecie_kv: float) -> dict[str, str]:
    """Klasyfikacja modułu wytwórczego NC RfG (karta FAB-J).

    Punkt wejścia dla kreatora DER i szuflady SLD: oba miejsca pytają o
    OCZEKIWANY moduł dla mocy i napięcia przyłączenia PRZED zapisem, żeby
    pokazać go projektantowi jako wartość jawnie wybieraną (nie domyślną).
    Jedyne źródło progów: `compliance.nc_rfg_modul.modul_nc_rfg`.
    """
    return {"modul": modul_nc_rfg(p_max_mw, napiecie_kv)}


@router.get("/cases/{case_id}/compliance")
def run_ncrfg_compliance_from_model(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> dict[str, Any]:
    """Zgodność NC RfG liczona z MODELU (V12K-087, G-OZE-B2).

    Buduje wejścia DER z committed ENM przypadku (most
    ``build_der_compliance_list_from_enm`` — zdolności FRT/PF/Q(U) z modelu,
    zero fabrykacji) i uruchamia ``NcRfgComplianceChecker`` per źródło
    przekształtnikowe dla wskazanego operatora. Uczciwy stan zerowy: brak DER
    w modelu → pusta lista raportów (nie błąd). 404 dla nieznanego operatora.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    enm = get_enm(klucz)
    der_inputs = build_der_compliance_list_from_enm(enm)
    reports = [_compliance_checker.check(operator_id, der) for der in der_inputs]
    return {
        "case_id": str(case_id),
        "operator_id": operator_id,
        "der_count": len(reports),
        "reports": [
            {
                **report.model_dump(mode="json"),
                "overall_pass": report.overall_pass,
                "total_tests": report.total_tests,
                "passed_count": report.passed_count,
                "no_module_count": report.no_module_count,
            }
            for report in reports
        ],
    }


class NcRfgPtpireeRunResponse(NcRfgPtpireeRunResult):
    """Wynik biegu POSZERZONY o dowód certyfikacji (dodatek karty P2).

    Dziedziczy kontrakt solvera w całości — wszystkie istniejące pola zachowują
    nazwy, typy i wartości. Nowy jest WYŁĄCZNIE `certificate_evidence`, więc
    konsument sprzed tej karty czyta dokładnie to samo, co czytał.
    """

    certificate_evidence: list[NcRfgCertificateEvidence] = []


@router.post("/run", response_model=NcRfgPtpireeRunResponse)
def run_ncrfg_ptpiree_tests(
    request: NcRfgPtpireeRunRequest,
    http_request: Request,
    case_id: UUID | None = None,
) -> NcRfgPtpireeRunResponse:
    try:
        result = _solver.run(request)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    klucz_twin = None if case_id is None else klucz_twin_z_sciezki(str(case_id), http_request)
    return NcRfgPtpireeRunResponse(
        **result.model_dump(),
        certificate_evidence=dowody_certyfikatu(
            klucz_twin, [module.der_ref for module in result.modules]
        ),
    )

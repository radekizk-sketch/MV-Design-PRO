from __future__ import annotations

from typing import Any
from uuid import UUID

from application.ncrfg_compliance import (
    NcRfgComplianceChecker,
    build_der_compliance_list_from_enm,
)
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG
from pydantic import BaseModel

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
            }
        )
    return {
        "procedure_version": "PTPiREE Procedura testowania v3.0",
        "source_ref": "https://ptpiree.pl/kodeksy-sieci/procedura-testowania/",
        "operators": operators,
        "tests": [item.model_dump(mode="json") for item in TEST_CATALOG],
    }


@router.get("/cases/{case_id}/compliance")
def run_ncrfg_compliance_from_model(case_id: UUID, operator_id: str) -> dict[str, Any]:
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
    enm = get_enm(str(case_id))
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


class NcRfgCertificateEvidence(BaseModel):
    """Dowód certyfikacji PTPiREE urządzenia testowanego w biegu NC RfG.

    Wartości pochodzą WPROST z tabliczki urządzenia w modelu (`Generator.
    materialized_params`), którą kreator DER zapisał z rekordu katalogowego.
    Ten moduł niczego nie wylicza i niczego nie dopowiada: brak danej = ``None``
    (uczciwy stan zerowy), nigdy wartość domyślna ani zgadnięta.
    """

    der_ref: str
    document_number: str | None = None
    acceptance_date: str | None = None
    wos_version: str | None = None
    wipwc_version: str | None = None
    ppm_scope: str | None = None
    source_url: str | None = None


class NcRfgPtpireeRunResponse(NcRfgPtpireeRunResult):
    """Wynik biegu POSZERZONY o dowód certyfikacji (dodatek karty P2).

    Dziedziczy kontrakt solvera w całości — wszystkie istniejące pola zachowują
    nazwy, typy i wartości. Nowy jest WYŁĄCZNIE `certificate_evidence`, więc
    konsument sprzed tej karty czyta dokładnie to samo, co czytał.
    """

    certificate_evidence: list[NcRfgCertificateEvidence] = []


def _dowody_certyfikatu(
    case_id: UUID | None,
    result: NcRfgPtpireeRunResult,
) -> list[NcRfgCertificateEvidence]:
    """Dowód certyfikatu per TESTOWANE urządzenie, w kolejności modułów wyniku.

    Bez wskazanego przypadku (albo dla urządzenia, którego w modelu nie ma) blok
    powstaje z samą referencją i pustymi polami — bieg działa dalej, a projektant
    widzi, że dowodu nie ma, zamiast oglądać wartość wziętą znikąd.
    """
    tabliczki: dict[str, dict[str, Any]] = {}
    if case_id is not None:
        enm = get_enm(str(case_id))
        for generator in enm.generators:
            tabliczki[generator.ref_id] = generator.materialized_params or {}
    dowody: list[NcRfgCertificateEvidence] = []
    for module in result.modules:
        tabliczka = tabliczki.get(module.der_ref, {})
        dowody.append(
            NcRfgCertificateEvidence(
                der_ref=module.der_ref,
                document_number=tabliczka.get("ptpiree_document_number"),
                acceptance_date=tabliczka.get("ptpiree_document_acceptance_date"),
                wos_version=tabliczka.get("ptpiree_wos_version"),
                wipwc_version=tabliczka.get("ptpiree_wipwc_version"),
                ppm_scope=tabliczka.get("ptpiree_ppm_scope"),
                source_url=tabliczka.get("ptpiree_source_url"),
            )
        )
    return dowody


@router.post("/run", response_model=NcRfgPtpireeRunResponse)
def run_ncrfg_ptpiree_tests(
    request: NcRfgPtpireeRunRequest,
    case_id: UUID | None = None,
) -> NcRfgPtpireeRunResponse:
    try:
        result = _solver.run(request)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return NcRfgPtpireeRunResponse(
        **result.model_dump(),
        certificate_evidence=_dowody_certyfikatu(case_id, result),
    )

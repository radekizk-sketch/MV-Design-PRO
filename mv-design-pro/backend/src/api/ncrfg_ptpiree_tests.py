from __future__ import annotations

from uuid import UUID

from api.klucz_twin_dep import KluczTwin, klucz_twin_z_sciezki
from application.analyses.dowod_certyfikatu import dowody_certyfikatu
from application.ncrfg_compliance import (
    NcRfgCaseComplianceResponse,
    NcRfgPtpireeRunResponse,
    odpowiedz_biegu_ncrfg,
    zgodnosc_ncrfg_przypadku,
)
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from compliance.nc_rfg_modul import modul_nc_rfg
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Request, status
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeRunRequest, NcRfgPtpireeSolver
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG

router = APIRouter(prefix="/api/ncrfg-tests", tags=["ncrfg-ptpiree-tests"])
_solver = NcRfgPtpireeSolver()


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


@router.get("/cases/{case_id}/compliance", response_model=NcRfgCaseComplianceResponse)
def run_ncrfg_compliance_from_model(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> NcRfgCaseComplianceResponse:
    """Zgodność NC RfG WSZYSTKICH DER przypadku liczona Z MODELU (karta S-3, W6-0).

    Buduje wejścia solvera z committed ENM przypadku (most
    ``application/ncrfg_compliance/model_bridge.py`` — zdolności FRT/P(f)/Q(U),
    certyfikat PTPiREE, model dynamiczny i granice Q z modelu, zero fabrykacji:
    brak danej = ``False``/``None`` → solver daje ``no_data``) i uruchamia TEN SAM
    ``NcRfgPtpireeSolver``, co bieg macierzy ``POST /api/ncrfg-tests/run``.
    Odpowiedź = kontrakt biegu macierzy (z polami dowodowymi karty S-1)
    opakowany per przypadek; DER bez mocy/napięcia nazwane w ``pominiete``.
    Uczciwy stan zerowy: brak DER w modelu → ``der_count == 0``, ``bieg = None``
    (nie błąd). 404 dla nieznanego operatora.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    return zgodnosc_ncrfg_przypadku(get_enm(klucz), operator_id=operator_id, case_id=str(case_id))


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
    return odpowiedz_biegu_ncrfg(
        result,
        dowody_certyfikatu(klucz_twin, [module.der_ref for module in result.modules]),
    )

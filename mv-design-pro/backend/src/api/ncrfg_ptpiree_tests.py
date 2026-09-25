"""Końcówki API zgodności NC RfG / PTPiREE (karta AB-1a Pakiet C).

- ``GET /api/ncrfg-tests/catalog`` — katalog testów procedury (z rejestrem zdolności i rodzajem
  twierdzenia per test), wersja procedury z warstwy ``PROCEDURA_PTPIREE`` profilu i profile
  operatorów (typy modułów z podstawą klasyfikacji);
- ``GET /api/ncrfg-tests/modul?p_max_kw=&napiecie_kv=`` — klasyfikacja modułu (art. 5, progi
  WOS) z progami, podstawą i powodem — JEDYNE źródło klasy dla interfejsu (kreator DER, SLD);
- ``GET /api/ncrfg-tests/cases/{case_id}/compliance?operator_id=`` — zgodność z
  ZATWIERDZONEGO MODELU przypadku (most modelu, dowody certyfikatu urządzeń wyprowadzone przez
  serwer, źródło danych ``ZATWIERDZONY_MODEL``);
- ``GET /api/ncrfg-tests/cases/{case_id}/wejscia?operator_id=`` — wejścia modułów złożone
  z modelu przypadku TYM SAMYM mostem (formularz wstępny biegu „co-jeśli", jeden odczyt);
- ``POST /api/ncrfg-tests/run`` — bieg „co-jeśli" z danych żądania (źródło danych
  ``ZADANIE_KLIENTA``): bez certyfikatu i bez przypadku, dowód zawsze niepełny (plan AB O-27).

Warstwa API: walidacja wejścia, mapowanie błędów na 404/422 i delegacja do
``application.ncrfg_compliance`` — zero fizyki, zero oceny.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.ncrfg_compliance import (
    NcRfgCaseComplianceResponse,
    NcRfgPtpireeRunResponse,
    NcRfgWejsciaPrzypadkuResponse,
    bieg_ncrfg,
    wejscia_ncrfg_przypadku,
    zgodnosc_ncrfg_przypadku,
)
from catalog.profiles.nc_rfg import (
    klasyfikacja_modulu,
    list_available_operators,
    load_nc_rfg_profile,
)
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeRunRequest
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG

router = APIRouter(prefix="/api/ncrfg-tests", tags=["ncrfg-ptpiree-tests"])


@router.get("/catalog")
def get_ncrfg_test_catalog() -> dict[str, Any]:
    """Katalog testów i profile operatorów. Wersja procedury pochodzi z warstwy
    ``PROCEDURA_PTPIREE`` profilu (warstwa wspólna dla operatorów — test przypina równość)."""
    operators = []
    procedury = []
    for operator_id in list_available_operators():
        profile = load_nc_rfg_profile(operator_id)
        procedury.append(profile.wersja_warstwy("PROCEDURA_PTPIREE", None))
        operators.append(
            {
                "operator_id": profile.operator_id,
                "operator_name_pl": profile.operator_name_pl,
                "last_revision": profile.last_revision,
                "wersja_profilu": profile.wersja_profilu,
                "module_types": [item.model_dump(mode="json") for item in profile.module_types],
                "klasyfikacja_zrodlo": profile.klasyfikacja_zrodlo.model_dump(mode="json"),
                "frequency_response": profile.frequency_response.model_dump(mode="json"),
                "reactive_power": profile.reactive_power.model_dump(mode="json"),
                "p_recovery_after_fault": profile.p_recovery_after_fault.model_dump(mode="json"),
                "ride_through": profile.voltage_levels.model_dump(mode="json"),
            }
        )
    if any(p != procedury[0] for p in procedury):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Profile operatorów niosą różne wersje warstwy procedury PTPiREE.",
        )
    return {
        "procedure_version": procedury[0].model_dump(mode="json"),
        "operators": operators,
        "tests": [item.model_dump(mode="json") for item in TEST_CATALOG],
    }


@router.get("/modul")
def klasyfikuj_modul_ncrfg(p_max_kw: float, napiecie_kv: float) -> dict[str, Any]:
    """Klasyfikacja modułu wytwarzania energii NC RfG z progami, podstawą i powodem.

    Punkt wejścia kreatora DER i szuflady SLD (klasa pokazywana przed zapisem). Moc w kW.
    Wartość nieskończona, nieliczbowa albo ujemna → 422 z komunikatem klasyfikacji.
    """
    try:
        return klasyfikacja_modulu(p_max_kw, napiecie_kv).model_dump(mode="json")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/cases/{case_id}/compliance", response_model=NcRfgCaseComplianceResponse)
def run_ncrfg_compliance_from_model(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> NcRfgCaseComplianceResponse:
    """Zgodność NC RfG WSZYSTKICH źródeł przekształtnikowych przypadku liczona Z MODELU.

    Most ``application/ncrfg_compliance/model_bridge.py`` buduje wejścia solvera i dowody
    certyfikatu urządzeń z zatwierdzonego modelu (zero fabrykacji: brak danej = ocena
    niewykonana z nazwanym brakiem), solver PTPiREE liczy rekordy testów, ocena wymagań —
    rekordy per wymaganie profilu. Uczciwy stan zerowy: brak źródeł → ``der_count == 0``,
    ``bieg = None``. 404: nieznany operator.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    return zgodnosc_ncrfg_przypadku(get_enm(klucz), operator_id=operator_id, case_id=str(case_id))


@router.get("/cases/{case_id}/wejscia", response_model=NcRfgWejsciaPrzypadkuResponse)
def get_ncrfg_module_inputs_from_model(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> NcRfgWejsciaPrzypadkuResponse:
    """Wejścia modułów NC RfG złożone z ZATWIERDZONEGO MODELU przypadku mostem
    ``model_bridge`` (te same, które ocenia ``/compliance``) — formularz wstępny biegu
    „co-jeśli" macierzy. 404: nieznany operator."""
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    return wejscia_ncrfg_przypadku(get_enm(klucz), operator_id=operator_id, case_id=str(case_id))


@router.post("/run", response_model=NcRfgPtpireeRunResponse)
def run_ncrfg_ptpiree_tests(request: NcRfgPtpireeRunRequest) -> NcRfgPtpireeRunResponse:
    """Bieg „co-jeśli" z danych żądania — źródło danych ``ZADANIE_KLIENTA``.

    Ciało nie ma pól certyfikatu ani przypadku (nieznane pole → 422): bieg nie może dać
    sposobu wykazania ``CERTYFIKAT`` ani dowodu pełnego. Nieznany operator albo dane poza
    dziedziną klasyfikacji → 422.
    """
    try:
        return bieg_ncrfg(request, zrodlo_danych="ZADANIE_KLIENTA")
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

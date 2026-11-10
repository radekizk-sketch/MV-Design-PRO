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

from datetime import date
from typing import Any, Literal
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.ncrfg_compliance.dossier import plan_dossier
from application.ncrfg_compliance.wipwc13_certificate_audit import (
    MetadaneCertyfikatu, audyt_certyfikatu,
)
from application.ncrfg_compliance.requirement_gaps import analiza_brakow_przypadku
from application.ncrfg_compliance.wipwc13_certificate_rules import (
    TypMwe, Rodzina, zasady_wipwc13, agreguj_zakres_badan,
)
from application.ncrfg_compliance.bank_nastaw_pl import (
    TypUrzadzenia, bank_nastaw, bank_nastaw_dla_przypadku,
)
from application.ncrfg_compliance.test_scope import (
    RodzinaPgm, TypPgm, zakres_badan, zakres_badan_z_modelu,
)
from application.ncrfg_compliance.source_audit import (
    audyt_zrodel,
    blokery_aktywacji_podstaw,
)
from application.ncrfg_compliance.certificate_review import (
    ocen_stan_rejestru,
    oceny_certyfikatow_przypadku,
)
from application.ncrfg_compliance.regulatory_effectivity import (
    WejscieOcenyPodstaw,
    ocen_podstawy,
)
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
from enm.deklaracje_modulu import DataUmowy
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from network_model.odmowa_danych import odmowa_rdzenia_b01
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
    with odmowa_rdzenia_b01():
        klasyfikacja = klasyfikacja_modulu(p_max_kw, napiecie_kv)
    return klasyfikacja.model_dump(mode="json")


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
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/ocena-wydan")
def ocen_wydania_ncrfg(wejscie: WejscieOcenyPodstaw) -> dict[str, Any]:
    """Odczyt datowej stosowalności WOS/PTPiREE — bez wpływu na solver.

    Przy wejściu od klienta to WYŁĄCZNIE analiza projektu, nie formalny
    dowód, certyfikat ani modyfikacja zatwierdzonego przypadku.
    """
    return ocen_podstawy(wejscie).model_dump(mode="json")


@router.get("/cases/{case_id}/ocena-wydan")
def ocen_wydania_z_modelu(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> dict[str, Any]:
    """Wybór wydania WOS i procedury na źródłowo udokumentowanych zdarzeniach ENM.

    Korzysta z tego SAMEGO mostu i klasyfikacji modułu co biegi NC RfG.
    Brak wydarzeń lub brak klasy -> NIEUSTALONE, a nie obliczeniowy PASS.
    Nie przełącza profilu istniejącego solvera, służy do migracji i audytu.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    enm = get_enm(klucz)
    wejscia = wejscia_ncrfg_przypadku(
        enm, operator_id=operator_id, case_id=str(case_id)
    )
    generatory = {generator.ref_id: generator for generator in enm.generators}
    wyniki: list[dict[str, Any]] = []
    for modul in wejscia.modules:
        if modul.der_kind == "BESS":
            wyniki.append({
                "der_ref": modul.der_ref, "typ": None,
                "status": "NIE_DOTYCZY_NC_RFG_MAGAZYN",
                "powod_pl": "Samodzielny magazyn poza NC RfG; zastosować krajowe "
                            "wymagania magazynowe i warunki przyłączenia.",
            })
            continue
        typ = klasyfikacja_modulu(modul.p_max_kw, modul.voltage_kv).modul
        generator = generatory[modul.der_ref]
        if typ is None:
            wyniki.append({
                "der_ref": modul.der_ref, "typ": None,
                "status": "NIE_DOTYCZY",
                "powod_pl": "Moduł poniżej progu kwalifikacji NC RfG.",
            })
            continue
        ocena = ocen_podstawy(WejscieOcenyPodstaw(
            typ_mwe=typ,
            modul_istniejacy=generator.modul_istniejacy,
            wydarzenia=generator.wydarzenia_regulacyjne,
        ))
        wyniki.append({
            "der_ref": modul.der_ref, "typ": typ,
            "ocena": ocena.model_dump(mode="json"),
            "blokery_aktywacji": list(blokery_aktywacji_podstaw(operator_id, ocena)),
        })
    return {
        "case_id": str(case_id),
        "operator_id": operator_id,
        "source": "ZATWIERDZONY_MODEL",
        "wyniki": wyniki,
        "pominiete": [p.model_dump(mode="json") for p in wejscia.pominiete],
        "proweniencja": (
            "To odczyt podstaw źródłowych; aktywacja WOS 2025 w profilu "
            "NC RfG i kompletna certyfikacja wymagają osobnej migracji release."
        ),
    }



@router.get("/stan-wykazu")
def stan_aktualnosci_wykazu() -> dict[str, Any]:
    """Kontrola snapshotu, bez pobierania licencjonowanego wykazu online."""
    return ocen_stan_rejestru().model_dump(mode="json")


@router.get("/cases/{case_id}/przeglad-certyfikatow")
def przeglad_certyfikatow_z_modelu(
    case_id: UUID,
    klucz: KluczTwin,
    operator_id: str,
    data_oceny: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
) -> dict[str, Any]:
    """Read-only; data oceny jawna, źródło wyłącznie zatwierdzony ENM i rejestr PTPiREE.

    Nie jest wydaniem certyfikatu, zgodą ENEA ani automatycznym wpisem do Werdyktu.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    try:
        kiedy = date.fromisoformat(data_oceny)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Data oceny musi być istniejącą datą RRRR-MM-DD.",
        ) from exc
    wynik = oceny_certyfikatow_przypadku(
        get_enm(klucz), operator_id=operator_id, data_oceny=kiedy
    )
    wynik["case_id"] = str(case_id)
    return wynik



@router.get("/cases/{case_id}/dossier-przygotowawcze")
def dossier_przygotowawcze_ncrfg(
    case_id: UUID, klucz: KluczTwin, operator_id: str,
) -> dict[str, Any]:
    """Dobiera WZORY dokumentów z klasyfikacji zatwierdzonego ENM.

    Nie generuje formalnych oświadczeń/wniosków, nie jest pozwoleniem OSD.
    Mikroinstalacja typu A bez danych kwalifikacyjnych ma warunkowy dokument DI.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    wejscia = wejscia_ncrfg_przypadku(
        get_enm(klucz), operator_id=operator_id, case_id=str(case_id)
    )
    wynik: list[dict[str, Any]] = []
    for mod in wejscia.modules:
        if mod.der_kind == "BESS":
            wynik.append({
                "der_ref": mod.der_ref,
                "status": "NIE_DOTYCZY_NC_RFG_MAGAZYN",
                "powod_pl": "Samodzielny magazyn: procedura MEE i krajowe warunki "
                            "przyłączenia wymagają odrębnej podstawy.",
            })
            continue
        typ = klasyfikacja_modulu(mod.p_max_kw, mod.voltage_kv).modul
        if typ is None:
            wynik.append({
                "der_ref": mod.der_ref,
                "status": "NIE_DOTYCZY_NC_RFG",
                "powod_pl": "Brak kwalifikacji do typu MWE w tej ocenie.",
            })
            continue
        plan = plan_dossier(typ, operator_id=operator_id)
        wynik.append({
            "der_ref": mod.der_ref,
            "plan": plan.model_dump(mode="json"),
        })
    return {
        "case_id": str(case_id), "operator_id": operator_id,
        "wyniki": wynik,
        "pominiete": [p.model_dump(mode="json") for p in wejscia.pominiete],
        "status": "LISTA_KONTROLNA_BEZ_FORMALNEJ_AKCEPTACJI",
    }



@router.get("/audyt-zrodel")
def audyt_zrodel_ncrfg(operator_id: str) -> dict[str, Any]:
    """P0 kontrola kompletu zatwierdzonych źródeł bez tworzenia nowego Werdyktu."""
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    return audyt_zrodel(operator_id)



@router.get("/zakres-badan-v3")
def ptpiree_v3_zakres_badan(typ: TypPgm, rodzina: RodzinaPgm) -> dict[str, Any]:
    """Tabela 1, rozdział 4, PTPiREE v3.0 — zakres testów, NIE wyniki.

    Nie stosować do projektu, dla którego nie ustalono daty oświadczenia
    i właściwej wersji procedury. To jawne zapytanie katalogowe.
    """
    return zakres_badan(typ, rodzina).model_dump(mode="json")



@router.get("/cases/{case_id}/zakres-badan-v3")
def ptpiree_v3_zakres_z_modelu(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> dict[str, Any]:
    """Program testów wynikający z zatwierdzonego ENM i oświadczenia PTPiREE 3.0.

    Zwraca wyłącznie plan koniecznych prób. NIE wykonuje prób i NIE zwraca
    zgodności dla projektów bez skutecznie określonej wersji procedury.
    """
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    result = zakres_badan_z_modelu(
        get_enm(klucz), operator_id=operator_id
    )
    result["case_id"] = str(case_id)
    return result



@router.get("/bank-nastaw-pl")
def bank_nastaw_ptpiree(wariant: TypUrzadzenia) -> dict[str, Any]:
    """Źródłowy Bank Nastaw WiPWC1.3 (PL v1.1) — bez automatycznej konfiguracji."""
    return bank_nastaw(wariant).model_dump(mode="json")


@router.get("/cases/{case_id}/bank-nastaw-pl")
def bank_nastaw_z_modelu(
    case_id: UUID, klucz: KluczTwin, operator_id: str
) -> dict[str, Any]:
    """Dobór referencyjnego profilu A nn lub B SN, nigdy nastaw zaakceptowanych przez OSD."""
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    result = bank_nastaw_dla_przypadku(get_enm(klucz), operator_id=operator_id)
    result["case_id"] = str(case_id)
    return result



@router.get("/wipwc13-reguly-certyfikatow")
def wi_pwc13_reguly_certyfikatow(typ: TypMwe, rodzina: Rodzina) -> dict[str, Any]:
    """Oryginalne §5/6 WiPWC1.3; cert wymagany/optional/niedopuszczalny."""
    return zasady_wipwc13(typ, rodzina).model_dump(mode="json")


@router.get("/wipwc13-polaczone-obowiazki")
def wi_pwc13_polaczone_obowiazki(typ: TypMwe, rodzina: Rodzina) -> dict[str, Any]:
    """Certyfikat WiPWC1.3 × test PTPiREE3.0 (bez fizycznego wykonania)."""
    return agreguj_zakres_badan(typ, rodzina)



@router.get("/cases/{case_id}/luki-dowodowe")
def ncrfg_zrodlowe_luki_dowodowe(
    case_id: UUID,
    klucz: KluczTwin,
    operator_id: str,
    data_oceny: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
) -> dict[str, Any]:
    """Jeden ENM i źródłowa macierz WiPWC/PTPiREE; brak automatycznych PASS."""
    if operator_id not in set(list_available_operators()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nieznany operator NC RfG: {operator_id}.",
        )
    try:
        kiedy = date.fromisoformat(data_oceny)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Data oceny musi być istniejącą datą RRRR-MM-DD.",
        ) from exc
    result = analiza_brakow_przypadku(
        get_enm(klucz), operator_id=operator_id, data_oceny=kiedy,
    )
    result["case_id"]=str(case_id)
    return result



class WniosekKontroliCertyfikatu(BaseModel):
    """Tylko opis dokumentu poddawanego kontroli, nie formalna weryfikacja."""
    dokument: MetadaneCertyfikatu
    typ_mwe: Literal["A","B","C","D"]
    wersja_wipwc: Literal["1.2","1.3"]
    data_oceny: DataUmowy


@router.post("/kontrola-dokumentu-certyfikatu")
def kontrola_wipwc13_dokumentu_cert(
    zadanie: WniosekKontroliCertyfikatu,
) -> dict[str, Any]:
    """WiPWC13 Annex1 a-v + §9/10, bez danych binarnych i bez decyzji OSD."""
    return audyt_certyfikatu(
        zadanie.dokument,
        typ=zadanie.typ_mwe,
        wersja=zadanie.wersja_wipwc,
        data_oceny=zadanie.data_oceny,
    )

"""Type Catalog API endpoints (P8.2 + P13b)

Provides REST API for Type Library operations:
- Fetch catalog types (line, cable, transformer, switch equipment)
- Assign type_ref to elements (branches, transformers, switches)
- Clear type_ref from elements
- Export/Import type library with governance (P13b)

All assign/clear endpoints return 204 No Content.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from api.dependencies import get_uow_factory
from api.odmowa_http import OdmowaHttpError
from application.analyses.protection.catalog.catalog_store import (
    list_devices as list_analytical_protection_devices,
)
from application.analyses.protection.catalog.catalog_store import (
    load_device_capability,
)
from application.catalog_governance import CatalogGovernanceService
from application.parametry_linii_wn import podglad_parametrow_linii
from enm.grupa_polaczen import GRUPY_POLACZEN_IEC60076, GrupaPolaczenIEC60076
from enm.models import UKLADY_SIECI_NN, GeometriaSlupaLinii, UkladSieciNn
from fastapi import APIRouter, Depends, HTTPException, Response, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.catalog.der_dynamic import get_profile, list_all_profile_ids
from network_model.catalog.der_dynamic.models import WindTurbineDynamicProfile
from network_model.catalog.gazy_fluorowane import (
    czy_medium_z_gazem_fluorowanym,
    odmowa_gazu_fluorowanego_pl,
)
from network_model.catalog.governance import ImportMode
from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types
from network_model.catalog.mv_ptpiree_catalog import get_ptpiree_catalog_manifest
from network_model.catalog.niezmienniki_katalogu import (
    KODY_WIARYGODNOSCI,
    REGULY_KATALOGU,
    RODZINY_BEZ_REGUL,
    przeglad_rodziny,
    przeglad_wiarygodnosci,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.switchgear import (
    SWITCHGEAR_FAMILY_REGISTRY,
    list_factory_configurations_for_family,
    list_families_for_manufacturer,
    list_switchgear_families,
    list_switchgear_solution_templates_for_manufacturer,
)
from network_model.catalog.switchgear import (
    list_manufacturers as list_switchgear_manufacturers,
)
from network_model.catalog.types import normalize_ptpiree_key
from network_model.catalog.wartosci_robocze import (
    PROPOZYCJE_LINII_WN,
    propozycje_aparatu_sn,
    rejestr_maszyn_do_formularza,
)
from network_model.core.uziemienie import (
    ROLE_UZIEMNIKA,
    TYPY_PUNKTU_NEUTRALNEGO,
    UZIEMIENIA_EKRANU_KABLA,
    RolaUziemnika,
    TypPunktuNeutralnego,
    UziemienieEkranuKabla,
)
from network_model.odmowa_danych import OdmowaDanychError
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/catalog", tags=["Type Catalog"])


class SlownikGrupPolaczen(BaseModel):
    """Slownik grup polaczen transformatora (IEC 60076-1) — jedno zrodlo dla walidatora
    (E-W5-02), OpenAPI i listy wyboru frontu (W5-A, decyzja F-4/G6)."""

    grupy: list[GrupaPolaczenIEC60076]


@router.get("/grupy-polaczen", response_model=SlownikGrupPolaczen)
def slownik_grup_polaczen() -> SlownikGrupPolaczen:
    """Zamkniety slownik grup polaczen transformatora dwuuzwojeniowego (notacja zegarowa)."""
    return SlownikGrupPolaczen(grupy=list(GRUPY_POLACZEN_IEC60076))


class SlownikiUziemienia(BaseModel):
    """Slowniki uziemienia jednej reprezentacji (W5-A): typ punktu neutralnego
    (`GroundingConfig.type`), uklad sieci nN (`Transformer.lv_earthing_system`), uklad
    uziemienia ekranu kabla (`Cable.screen_bonding`), rola uziemnika pola
    (`BayPrimaryDevice.earthing_role`). Modele ENM nie wchodza do OpenAPI (koncowki
    zwracaja slowniki), wiec TA odpowiedz jest miejscem, w ktorym kontrakt literalow
    staje sie widoczny w schemacie — front przypina do niego swoje literaly testem
    (`frontend/src/types/__tests__/uziemienie.openapi.test.ts`)."""

    typy_punktu_neutralnego: list[TypPunktuNeutralnego]
    uklady_sieci_nn: list[UkladSieciNn]
    uziemienia_ekranu_kabla: list[UziemienieEkranuKabla]
    role_uziemnika: list[RolaUziemnika]


@router.get("/slowniki-uziemienia", response_model=SlownikiUziemienia)
def slowniki_uziemienia() -> SlownikiUziemienia:
    """Zamkniete slowniki uziemienia — jedno zrodlo dla modelu, walidatora, OpenAPI i frontu."""
    return SlownikiUziemienia(
        typy_punktu_neutralnego=list(TYPY_PUNKTU_NEUTRALNEGO),
        uklady_sieci_nn=list(UKLADY_SIECI_NN),
        uziemienia_ekranu_kabla=list(UZIEMIENIA_EKRANU_KABLA),
        role_uziemnika=list(ROLE_UZIEMNIKA),
    )


def _serialize_analytical_protection_device(device: Any) -> dict[str, Any]:
    meta = dict(device.meta or {})
    notes: list[str] = []
    source_ref = meta.get("source_ref")
    if source_ref:
        notes.append(str(source_ref))
    if meta.get("unverified"):
        notes.append(
            "Rekord analityczny: dane urządzenia nie są jeszcze zweryfikowane produkcyjnie."
        )
    if meta.get("unverified_ranges"):
        notes.append("Zakresy nastaw pochodzą z katalogu analitycznego i wymagają weryfikacji.")

    # Karta FAB-A/D-33: `vendor is None` = profil REFERENCYJNY bez marki
    # (byl falszywie przypisany ABB). Etykieta MUSI jednoznacznie mowic, ze to
    # nie jest produkt producenta — konkatenacja f"{vendor} {model}" pokazalaby
    # tu literalny tekst "None", wiec galaz jest odrebna, nie fallbackiem.
    is_referencyjny = device.vendor is None
    if is_referencyjny:
        name_pl = f"Profil referencyjny (nie produkt producenta) - {device.model}"
        verification_status = "REFERENCYJNY"
        catalog_status = "REFERENCYJNY_V1"
        series_value: str | None = None
        verification_note = str(
            meta.get("verification_note")
            or "Profil referencyjny wbudowany MV-DESIGN-PRO; nie dane producenta."
        )
    else:
        name_pl = f"{device.vendor} {device.model}"
        verification_status = (
            "NIEWERYFIKOWANY" if meta.get("unverified") else "CZESCIOWO_ZWERYFIKOWANY"
        )
        catalog_status = "ANALITYCZNY_V1"
        series_value = str(meta.get("series") or device.model)
        verification_note = (
            "Zakres ochrony pochodzi z katalogu analitycznego; rekord nie jest promowany do katalogu produkcyjnego."
            if meta.get("unverified") or meta.get("unverified_ranges")
            else "Rekord analityczny zachowany poza torem produkcyjnym."
        )

    return {
        "id": device.device_id,
        "name_pl": name_pl,
        "params": {
            "vendor": device.vendor,
            "model": device.model,
            "series": series_value,
            "revision": "v0",
            "rated_current_a": float(meta["rated"]) if meta.get("rated") is not None else None,
            "notes_pl": " ".join(notes) if notes else None,
            "source_catalog": "backend/src/application/analyses/protection/catalog/data/devices_v0.json",
            "unverified": bool(meta.get("unverified", False)),
            "unverified_ranges": bool(meta.get("unverified_ranges", False)),
            "source_reference": str(source_ref or "devices_v0.json / katalog analityczny ochrony"),
            "verification_status": verification_status,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
            "functions_supported": list(device.functions_supported),
            "curves_supported": list(device.curves_supported),
            "i_pickup_51_a_min": device.i_pickup_51_a_min,
            "i_pickup_51_a_max": device.i_pickup_51_a_max,
            "tms_51_min": device.tms_51_min,
            "tms_51_max": device.tms_51_max,
            "t_51_s_min": device.t_51_s_min,
            "t_51_s_max": device.t_51_s_max,
            "i_inst_50_a_min": device.i_inst_50_a_min,
            "i_inst_50_a_max": device.i_inst_50_a_max,
            "i_pickup_51n_a_min": device.i_pickup_51n_a_min,
            "i_pickup_51n_a_max": device.i_pickup_51n_a_max,
            "tms_51n_min": device.tms_51n_min,
            "tms_51n_max": device.tms_51n_max,
            "i_inst_50n_a_min": device.i_inst_50n_a_min,
            "i_inst_50n_a_max": device.i_inst_50n_a_max,
        },
    }


def _build_governance_service(uow_factory: Any) -> CatalogGovernanceService:
    return CatalogGovernanceService(uow_factory)


class ImportProtectionLibraryPayload(BaseModel):
    """Payload for importing protection library (P14b)"""

    manifest: dict[str, Any]
    device_types: list[dict[str, Any]]
    curves: list[dict[str, Any]]
    templates: list[dict[str, Any]]


# ============================================================================
# Fetch catalog types (GET endpoints)
# ============================================================================


@router.get("/line-types")
def list_line_types() -> list[dict[str, Any]]:
    """List all line types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_line_types()]


@router.get("/overhead-conductor-types")
def list_overhead_conductor_types() -> dict[str, Any]:
    """Przewody linii napowietrznych 110 kV (karta LINIA-110, przestrzeń PRZEWOD_LINII_WN).

    ``przewody`` — dane wyrobu PN-EN 50182 (bez impedancji linii: R′, X′, B′ i Z′0 liczy solver
    z geometrii słupa). ``wartosci_robocze`` — czym obliczenie uzupełni składową geometrii,
    której projekt nie podaje (zasada nr 4): rodzaj źródła, odniesienie, uzasadnienie, wpływ.
    """
    return {
        "przewody": [
            item.to_dict() for item in get_default_mv_catalog().list_overhead_conductor_types()
        ],
        "wartosci_robocze": [p.to_dict() for p in PROPOZYCJE_LINII_WN.values()],
    }


class ZadaniePodgladuLiniiWN(BaseModel):
    """Geometria słupa z formularza + częstotliwość studium modelu (bez wartości domyślnej)."""

    geometria_slupa: GeometriaSlupaLinii | None = None
    czestotliwosc_hz: float = Field(gt=0)


@router.post("/overhead-conductor-types/{conductor_id}/parametry-linii")
def preview_overhead_line_parameters(
    conductor_id: str, zadanie: ZadaniePodgladuLiniiWN
) -> dict[str, Any]:
    """Podgląd R′, X′, B′, Z′0 linii 110 kV z przewodu katalogu i geometrii — bez zapisu.

    Ślad White Box każdego kroku, dane przyjęte (``ESTIMATED``) dla składowych bez danych
    projektu, kompletność dowodu i pasma wiarygodności. Odmowa danych (przewód spoza katalogu,
    geometria sprzeczna) — 422 z kodem odmowy.
    """
    return podglad_parametrow_linii(conductor_id, zadanie.geometria_slupa, zadanie.czestotliwosc_hz)


@router.get("/cable-types")
def list_cable_types() -> list[dict[str, Any]]:
    """List all cable types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_cable_types()]


@router.get("/transformer-types")
def list_transformer_types() -> list[dict[str, Any]]:
    """List all transformer types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_transformer_types()]


def _dopuszczenie_do_nowych_pol(nazwa: str, medium: str | None) -> dict[str, Any]:
    """Pola filtru pickerów aparatu (zakaz gazów fluorowanych w obiektach projektowanych) —
    JEDNO miejsce wyliczenia dla obu przestrzeni katalogu łączników SN (łącznik gałęzi
    i aparat pola niosą te same pozycje: `CatalogRepository.from_records` wyprowadza aparaty
    z rekordów łączników). Reguła: `odmowa_gazu_fluorowanego_pl` dla obiektu projektowanego —
    ta sama, którą stosuje strażnik operacji domenowej."""
    gaz = czy_medium_z_gazem_fluorowanym(medium)
    powod = odmowa_gazu_fluorowanego_pl(
        f"Aparat {nazwa}", gaz_fluorowany=gaz, stan_obiektu="PROJEKTOWANY"
    )
    return {
        "gaz_fluorowany": gaz,
        "dopuszczony_do_nowych_pol": powod is None,
        "powod_blokady_nowych_pol_pl": powod,
    }


@router.get("/switch-equipment-types")
def list_switch_equipment_types() -> list[dict[str, Any]]:
    """Pozycje katalogu łączników SN (picker typu łącznika w siatce właściwości) z polami
    filtru pickerów — te same co w ``/mv-apparatus-types`` (`_dopuszczenie_do_nowych_pol`)."""
    return [
        {**item.to_dict(), **_dopuszczenie_do_nowych_pol(item.name, item.medium)}
        for item in get_default_mv_catalog().list_switch_equipment_types()
    ]


@router.get("/mv-apparatus-types")
def list_mv_apparatus_types() -> list[dict[str, Any]]:
    """Pozycje katalogu aparatów SN + propozycje wartości roboczych dla braków karty.

    ``wartosci_robocze`` (zasada nr 4, V12K-351) mówi przy pozycji, CZYM obliczenie uzupełni
    parametr, którego karta nie podaje — z rodzajem źródła, odniesieniem i wpływem. Pozycja
    katalogu (``to_dict``) zostaje czysta: niesie wyłącznie dane karty.

    Filtr pickerów (karta UX-04/POLE-LINIOWE-WZORZEC, zakaz gazów fluorowanych w obiektach
    projektowanych): ``gaz_fluorowany`` (medium pozycji z gazem fluorowanym),
    ``dopuszczony_do_nowych_pol`` i ``powod_blokady_nowych_pol_pl`` — TA SAMA reguła co strażnik
    operacji (`network_model.catalog.gazy_fluorowane.odmowa_gazu_fluorowanego_pl` dla obiektu
    projektowanego). Picker aparatu pola projektowanego pokazuje wyłącznie pozycje dopuszczone;
    pola istniejącego — wszystkie, z medium na widoku.
    """
    wynik: list[dict[str, Any]] = []
    for item in get_default_mv_catalog().list_mv_apparatus_types():
        wynik.append(
            {
                **item.to_dict(),
                "wartosci_robocze": [p.to_dict() for p in propozycje_aparatu_sn(item)],
                **_dopuszczenie_do_nowych_pol(item.name, item.medium),
            }
        )
    return wynik


@router.get("/maszyny-wirujace/wartosci-robocze")
def rejestr_wartosci_roboczych_maszyn() -> dict[str, Any]:
    """Parametry zwarciowe maszyn wirujących i ich propozycje wartości roboczych (karta
    PODSTAWA-Q, zasada nr 4): rodzaj generatora → rodzina, parametry rodziny z nazwą, jednostką
    i zakresem bramy oraz propozycja, którą obliczenie przyjmie bez tabliczki i bez wartości
    projektanta. Dostawca sekcji parametrów maszyny w kreatorze edycji parametrów."""
    return rejestr_maszyn_do_formularza()


@router.get("/lv-apparatus-types")
def list_lv_apparatus_types() -> list[dict[str, Any]]:
    """List all LV apparatus types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_apparatus_types()]


@router.get("/lv-cable-types")
def list_lv_cable_types() -> list[dict[str, Any]]:
    """List all LV cable types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_cable_types()]


@router.get("/lv-breaker-mcb-types")
def list_lv_breaker_mcb_types() -> list[dict[str, Any]]:
    """List all LV miniature circuit breaker (MCB, IEC 60898-1) types from the canonical catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_breaker_mcb_types()]


@router.get("/lv-fuse-link-types")
def list_lv_fuse_link_types() -> list[dict[str, Any]]:
    """List all LV gG fuse-link (IEC 60269-1) types from the canonical catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_fuse_link_types()]


@router.get("/lv-rcd-types")
def list_lv_rcd_types() -> list[dict[str, Any]]:
    """List all LV residual current device (RCCB IEC 61008-1 / RCBO IEC 61009-1) types."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_rcd_types()]


@router.get("/load-types")
def list_load_types() -> list[dict[str, Any]]:
    """List all load types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_load_types()]


@router.get("/ct-types")
def list_ct_types() -> list[dict[str, Any]]:
    """List all CT types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_ct_types()]


@router.get("/vt-types")
def list_vt_types() -> list[dict[str, Any]]:
    """List all VT types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_vt_types()]


@router.get("/surge-arrester-types")
def list_surge_arrester_types() -> list[dict[str, Any]]:
    """List all MV surge arrester types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_surge_arrester_types()]


@router.get("/shunt-capacitor-types")
def list_shunt_capacitor_types() -> list[dict[str, Any]]:
    """List all MV shunt capacitor bank types (KOMPENSATOR_SN) from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_shunt_capacitor_types()]


@router.get("/synchronous-generator-types")
def list_synchronous_generator_types() -> list[dict[str, Any]]:
    """List synchronous generator types (GENERATOR_SN) — catalog of `add_generator_sn`."""
    return [item.to_dict() for item in get_default_mv_catalog().list_synchronous_generator_types()]


@router.get("/pv-inverter-types")
def list_pv_inverter_types() -> list[dict[str, Any]]:
    """List all PV inverter types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_pv_inverter_types()]


@router.get("/bess-inverter-types")
def list_bess_inverter_types() -> list[dict[str, Any]]:
    """List all BESS inverter types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_bess_inverter_types()]


@router.get("/bess-battery-types")
def list_bess_battery_types() -> list[dict[str, Any]]:
    """List all BESS battery PACK types (karta FAB-J) — sprzęt oddzielny od PCS.

    Katalog pojemności [kWh] / napięcia DC / C-rate / chemii pakietu baterii;
    typ przekształtnika magazynu (moc, Q, cosφ) niesie `/bess-inverter-types`
    powyżej.
    """
    return [item.to_dict() for item in get_default_mv_catalog().list_bess_battery_types()]


@router.get("/converter-types")
def list_converter_types(kind: str | None = None) -> list[dict[str, Any]]:
    """List all converter source types from the canonical MV catalog."""
    records = [item.to_dict() for item in get_default_mv_catalog().list_converter_types()]
    if not kind:
        return records
    normalized_kind = kind.strip().upper()
    return [item for item in records if str(item.get("kind", "")).upper() == normalized_kind]


@router.get("/wind-inverter-types")
def list_wind_inverter_types() -> list[dict[str, Any]]:
    """List all wind farm converter types from the canonical MV catalog."""
    return [
        item.to_dict()
        for item in get_default_mv_catalog().list_converter_types()
        if item.kind.value == "WIND"
    ]


@router.get("/source-system-types")
def list_source_system_types() -> list[dict[str, Any]]:
    """List all MV system source types for GPZ / zasilanie systemowe."""
    return [item.to_dict() for item in get_default_mv_catalog().list_source_system_types()]


class OdstepstwoWiarygodnosciOdpowiedz(BaseModel):
    """Jedna pozycja katalogu do przegladu — sygnal, nie odmowa."""

    kod: str
    regula: str
    pozycja_id: str
    opis_wartosci: str


class PokrycieRegulyOdpowiedz(BaseModel):
    """Ile pozycji rodziny regula policzyla, a ilu nie dotyczy (z powodem)."""

    kod: str
    policzone: int
    pominiete: int
    powod_pominiecia: str


class RegulaWiarygodnosciOdpowiedz(BaseModel):
    """Opis reguly wiarygodnosci — zeby front nie mial wlasnej kopii uzasadnien."""

    kod: str
    nazwa: str
    podstawa: str
    uzasadnienie: str


class RodzinaPrzegladuOdpowiedz(BaseModel):
    """Wynik przegladu wiarygodnosci JEDNEJ rodziny katalogu."""

    rodzina: str
    etykieta_pl: str
    liczba_pozycji: int
    sprawdzone_reguly: list[str]
    pokrycie: list[PokrycieRegulyOdpowiedz]
    liczba_odstepstw: int
    wedlug_kodu: dict[str, int]
    odstepstwa: list[OdstepstwoWiarygodnosciOdpowiedz]


class RodzinaBezRegulOdpowiedz(BaseModel):
    """Rodzina katalogu POZA przegladem, z powodem merytorycznym."""

    rodzina: str
    powod: str


class PrzegladWiarygodnosciOdpowiedz(BaseModel):
    """Przeglad wiarygodnosci CALEGO katalogu — pozycje do przegladu, zero odmowy."""

    liczba_odstepstw: int
    wedlug_kodu: dict[str, int]
    rodziny: list[RodzinaPrzegladuOdpowiedz]
    rodziny_bez_regul: list[RodzinaBezRegulOdpowiedz]
    reguly: list[RegulaWiarygodnosciOdpowiedz]


def _pozycje_rodziny_przegladu() -> dict[str, list[Any]]:
    """Pozycje KAZDEJ rodziny objetej przegladem — jedno miejsce wiazania z katalogiem.

    Brak rodziny w tym slowniku konczy sie bledem rejestru w
    `przeglad_wiarygodnosci` (a nie cichym raportem bez tej rodziny) — to jest ten
    sam predykat wejscia/wyjscia z jednego zrodla, ktorego wymaga regula KLASA
    NIE INSTANCJA.
    """
    katalog = get_default_mv_catalog()
    return {
        "aparaty-nn": list(katalog.list_lv_apparatus_types()),
        "aparaty-sn": list(katalog.list_mv_apparatus_types()),
        "transformatory": list(katalog.list_transformer_types()),
        "linie-sn": list(katalog.list_line_types()),
        "kable-sn": list(katalog.list_cable_types()),
        "kable-nn": list(katalog.list_lv_cable_types()),
        "zrodla-systemowe": list(katalog.list_source_system_types()),
    }


def _rodzina_odpowiedz(wynik: Any) -> RodzinaPrzegladuOdpowiedz:
    return RodzinaPrzegladuOdpowiedz(**wynik.to_dict())


@router.get("/przeglad-wiarygodnosci", response_model=PrzegladWiarygodnosciOdpowiedz)
def przeglad_wiarygodnosci_katalogu() -> PrzegladWiarygodnosciOdpowiedz:
    """Pozycje katalogu DO PRZEGLADU wg regul klasy WIARYGODNOSC.

    Regula wiarygodnosci nigdy nie odmawia rekordu i niczego nie zmienia — jej
    zlamanie jest sygnalem dla czlowieka z karta producenta w reku. Rodziny, w
    ktorych zadna regula nie ma sensu, sa wymienione OSOBNO z powodem, zeby
    rodzina pominieta nie byla nierozroznialna od przeoczonej.
    """
    wyniki = przeglad_wiarygodnosci(_pozycje_rodziny_przegladu())
    laczne: dict[str, int] = {}
    for wynik in wyniki:
        for kod, liczba in wynik.wedlug_kodu().items():
            laczne[kod] = laczne.get(kod, 0) + liczba
    return PrzegladWiarygodnosciOdpowiedz(
        liczba_odstepstw=sum(len(w.odstepstwa) for w in wyniki),
        wedlug_kodu=dict(sorted(laczne.items())),
        rodziny=[_rodzina_odpowiedz(w) for w in wyniki],
        rodziny_bez_regul=[
            RodzinaBezRegulOdpowiedz(rodzina=rodzina, powod=powod)
            for rodzina, powod in sorted(RODZINY_BEZ_REGUL.items())
        ],
        reguly=[
            RegulaWiarygodnosciOdpowiedz(
                kod=kod,
                nazwa=REGULY_KATALOGU[kod].nazwa,
                podstawa=REGULY_KATALOGU[kod].podstawa,
                uzasadnienie=REGULY_KATALOGU[kod].uzasadnienie,
            )
            for kod in sorted(KODY_WIARYGODNOSCI)
        ],
    )


@router.get("/przeglad-wiarygodnosci/{rodzina}", response_model=RodzinaPrzegladuOdpowiedz)
def przeglad_wiarygodnosci_rodziny(rodzina: str) -> RodzinaPrzegladuOdpowiedz:
    """Przeglad wiarygodnosci jednej rodziny katalogu (404 dla rodziny spoza przegladu)."""
    pozycje = _pozycje_rodziny_przegladu()
    if rodzina not in pozycje:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Rodzina '{rodzina}' nie jest objęta przeglądem wiarygodności. "
                f"Dostępne: {', '.join(sorted(pozycje))}."
            ),
        )
    return _rodzina_odpowiedz(przeglad_rodziny(rodzina, pozycje[rodzina]))


@router.get("/der-dynamic-profiles")
def list_der_dynamic_profiles() -> list[dict[str, Any]]:
    """Profile dynamiczne DER (PV/BESS/FW) — karta FAB-L.

    Jedyne źródło prawdy o katalogowych modelach dynamicznych
    (`network_model.catalog.der_dynamic`): wiązanie `dynamic_model_ref` wytwórcy
    materializuje profil do kopii `Generator.dynamika` czytanej przez bieg
    `dynamika_rms` (`enm.dynamika_z_katalogu`, karta AB-P1).
    Front pokazuje parametry WHITE BOX wprost (Tp/Tq/droop/FRT/inercja) —
    zero drugiej kopii pod zmyślonymi nazwami pól.

    `der_kind` jest dopisywane w tej serializacji ("FW" dla turbin) — model
    katalogowy turbiny niesie tylko `iec_type`, ale front potrzebuje jednego
    pola rodzaju DER dla obu kształtów profilu.
    """
    wyniki: list[dict[str, Any]] = []
    for profile_id in list_all_profile_ids():
        profil = get_profile(profile_id)
        dane = profil.model_dump(mode="json")
        if isinstance(profil, WindTurbineDynamicProfile):
            dane["der_kind"] = "FW"
        wyniki.append(dane)
    return wyniki


@router.get("/ptpiree/manifest")
def get_ptpiree_manifest() -> dict[str, Any]:
    """Return PTPiREE snapshot source metadata used by the local catalog."""
    return get_ptpiree_catalog_manifest()


@router.get("/ptpiree/generator-certificates")
def list_ptpiree_generator_certificates(
    response: Response,
    search: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List local PTPiREE generator/converter certificate snapshot records.

    Pelny wykaz ma 6887 pozycji (~3 MB) — parametry sa ADDYTYWNE (bez nich
    kontrakt sprzed zmiany: pelna lista, ta sama kolejnosc):

    - ``search``: filtr po producencie/modelu/numerze dokumentu. Obie strony
      normalizowane ``normalize_ptpiree_key`` (ta sama regula co dopasowanie
      certyfikacji), dopasowanie KAZDEGO tokenu zapytania (koniunkcja) — to
      WYSZUKIWANIE dla piszacego czlowieka, nie relacja certyfikacji, stad
      wolno mu byc podciagiem („huawei 215ktl" znajduje wiersz, mimo ze
      producent w wykazie niesie pelna forme prawna).
    - ``limit``/``offset``: wycinek po filtrze (limit >= 1, offset >= 0).
    - naglowek ``X-Total-Count``: licznosc PO filtrze, PRZED wycinkiem —
      konsument widzi uczciwie, ile pozycji zostalo poza strona.
    """
    if limit is not None and limit < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Parametr limit musi być >= 1.",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Parametr offset musi być >= 0.",
        )
    records = [
        item.to_dict() for item in get_default_mv_catalog().list_ptpiree_generator_certificates()
    ]
    if search is not None and search.strip():
        tokeny = normalize_ptpiree_key(search).split()
        if tokeny:
            records = [
                record
                for record in records
                if (
                    stog := normalize_ptpiree_key(
                        f"{record.get('manufacturer', '')} {record.get('model', '')} "
                        f"{record.get('document_number', '')}"
                    )
                )
                and all(token in stog for token in tokeny)
            ]
    response.headers["X-Total-Count"] = str(len(records))
    if limit is not None:
        return records[offset : offset + limit]
    if offset:
        return records[offset:]
    return records


@router.get("/branch-point-types")
def list_branch_point_types(kind: str | None = None) -> list[dict[str, Any]]:
    """List all branch point types for branch poles and ZKSN."""
    return get_all_branch_point_types(kind)


@router.get("/switchgear-families")
def list_switchgear_families_endpoint(
    manufacturer_ref: str | None = None,
) -> list[dict[str, Any]]:
    """Lista rodzin rozdzielnic SN (goal §11A.3).

    Z `manufacturer_ref` zwęża do rodzin danego producenta (np.
    `?manufacturer_ref=ABB` → UniGear ZS1, SafeRing, SafePlus, UniSec).

    Bez parametru zwraca wszystkie rodziny rejestru (ZPUE, Elektrometal, ABB,
    Siemens, Schneider Electric).

    ROZSZERZENIE ADDYTYWNE 2026-08-14 (scalenie kanonu rozdzielnic): każdy
    rekord niesie `tor_konfiguracji` — `MODULARNY` (rozdzielnica składana z
    pojedynczych pól) albo `BLOK_RMU` (najpierw blok fabryczny, potem
    doposażenie jednostek). To pole WYLICZANE z `construction_type`, nie druga
    deklaracja architektury; `null` znaczy „rodzina nie zadeklarowała
    konstrukcji". Konfiguracje fabryczne rodziny RMU wystawia subzasób
    `/switchgear-families/{ref}/factory-configurations`.
    """
    families = (
        list_families_for_manufacturer(manufacturer_ref)
        if manufacturer_ref is not None
        else list_switchgear_families()
    )
    return [f.model_dump(mode="json") for f in families]


@router.get("/switchgear-families/{switchgear_family_ref}/factory-configurations")
def list_factory_configurations_endpoint(
    switchgear_family_ref: str,
) -> list[dict[str, Any]]:
    """Konfiguracje fabryczne (bloki) rodziny RMU.

    Rozdzielnica pierścieniowa nie jest zbiorem luźnych szaf: projektant
    wybiera BLOK o stałej sekwencji jednostek (np. `L-L-T`), a dopiero potem
    doposaża jednostki. Rodzina o torze `MODULARNY` zwraca pustą listę —
    uczciwy stan zerowy, nie błąd. Nieznana rodzina kończy się 404 z polskim
    zdaniem, bo pytanie o bloki wyrobu spoza katalogu nie ma odpowiedzi.
    """
    if switchgear_family_ref not in SWITCHGEAR_FAMILY_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Rodzina rozdzielnicy '{switchgear_family_ref}' nie istnieje w "
                "katalogu — brak konfiguracji fabrycznych do pokazania."
            ),
        )
    configurations = list_factory_configurations_for_family(switchgear_family_ref)
    return [c.model_dump(mode="json") for c in configurations]


@router.get("/manufacturers")
def list_manufacturers_endpoint() -> list[dict[str, Any]]:
    """Lista producentów rozdzielnic SN (goal §11A).

    Wszyscy startowi producenci mają `status='requires_catalog'` dopóki nie
    pojawią się zweryfikowane source_refs. UI ma pokazać badge ostrzegawczy.
    """
    return [m.model_dump(mode="json") for m in list_switchgear_manufacturers()]


@router.get("/complete-bay-templates")
def list_complete_bay_templates_endpoint(
    manufacturer_ref: str | None = None,
    bay_kind: str | None = None,
) -> list[dict[str, Any]]:
    """Pełne szablony pól SN powiązane z rodziną rozdzielnicy.

    UI projektanta widzi wyłącznie kompletne pakiety rozwiązań katalogowych.
    Filtrowanie `bay_kind` zwęża listę do pól danego typu (np. transformatorowe).
    """
    templates = list_switchgear_solution_templates_for_manufacturer(manufacturer_ref)
    if bay_kind is not None:
        templates = [t for t in templates if t.bay_kind == bay_kind]
    return [t.model_dump(mode="json") for t in templates]


@router.get("/bay-templates")
def list_bay_templates_endpoint(
    bay_role: str | None = None,
    pole_gpz: bool = False,
    switchgear_family_ref: str | None = None,
    klasa_pola: str | None = None,
) -> list[dict[str, Any]]:
    """Szablony kanoniczne pól SN (`bay_templates.BAY_TEMPLATE_REGISTRY`) z oceną dopuszczalności
    w polu o podanych cechach — filtr pickera szablonu z backendu (karta UX-04/POLE-LINIOWE-
    WZORZEC, rozszerzenie 3).

    Cechy pola: rola modelu (`bay_role` — szablon innej funkcji pominięty, jak w operacji
    `set_bay_equipment`), pole sekcji GPZ (`pole_gpz`), rodzina rozdzielnicy pola (izolacja —
    jedno źródło medium) i klasa pola liniowego. Ocena: TA SAMA reguła co strażnik operacji
    i walidator (`enm.zgodnosc_szablonu_pola.odmowy_szablonu_dla_pola`) — szablon odrzucony niesie
    listę odmów (kod + zdanie z podstawą i akcją), więc picker pokazuje, DLACZEGO wykonanie jest
    niedostępne, zamiast je przemilczać. Kolejność rejestru (deterministyczna).
    """
    from enm.zgodnosc_szablonu_pola import odmowy_szablonu_dla_pola
    from network_model.catalog.bay_templates import (
        KLASY_POLA_LINIOWEGO,
        NAZWY_WYKONANIA_LACZNIKOW_PL,
        NAZWY_WYKONANIA_POLA_PL,
        funkcje_eaz_szablonu,
        list_bay_templates,
        profil_eaz_szablonu,
    )
    from network_model.catalog.funkcje_eaz import opis_funkcji_eaz_pl
    from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY

    if klasa_pola is not None and klasa_pola not in KLASY_POLA_LINIOWEGO:
        raise HTTPException(
            status_code=422,
            detail="Klasa pola liniowego spoza słownika (odbiorcze, mieszane, dedykowane).",
        )
    rodzina = SWITCHGEAR_FAMILY_REGISTRY.get(switchgear_family_ref or "")
    if switchgear_family_ref and rodzina is None:
        raise HTTPException(status_code=404, detail="Katalog nie zna wskazanej rodziny.")
    wynik: list[dict[str, Any]] = []
    for szablon in list_bay_templates():
        if bay_role is not None and szablon.bay_role != bay_role:
            continue
        odmowy = odmowy_szablonu_dla_pola(
            szablon,
            pole_gpz=pole_gpz,
            insulation_type=rodzina.insulation_type if rodzina is not None else None,
            nazwa_rodziny=rodzina.family_name if rodzina is not None else "",
            klasa_pola=klasa_pola,
            opis_pola="pola",
        )
        # Szablon pochodzi z rejestru (`list_bay_templates`), więc zestaw istnieje zawsze;
        # `None` znaczyłoby szablon spoza rejestru — błąd rejestru, nie pusty zestaw.
        funkcje = funkcje_eaz_szablonu(szablon.template_id, klasa_pola)
        if funkcje is None:
            raise RuntimeError(f"Szablon {szablon.template_id} spoza rejestru szablonów pól.")
        wynik.append(
            {
                "template_ref": szablon.template_id,
                "template_name_pl": szablon.description,
                "bay_role": szablon.bay_role,
                "podstawa": szablon.podstawa,
                "wykonanie_pola": szablon.wykonanie_pola,
                "wykonanie_pola_pl": (
                    NAZWY_WYKONANIA_POLA_PL[szablon.wykonanie_pola]
                    if szablon.wykonanie_pola
                    else None
                ),
                "wykonanie_lacznikow": szablon.wykonanie_lacznikow,
                "wykonanie_lacznikow_pl": (
                    NAZWY_WYKONANIA_LACZNIKOW_PL[szablon.wykonanie_lacznikow]
                    if szablon.wykonanie_lacznikow
                    else None
                ),
                "tylko_gpz": szablon.tylko_gpz,
                # Zestaw EAZ szablonu W KLASIE pola (`funkcje_eaz_szablonu`): ten sam, który
                # operacja zapisze w `Bay.protection_codes` po wyborze szablonu.
                "funkcje_eaz": funkcje,
                # Nazwa każdej funkcji ze słownika EAZ (zapis rysunku, IEEE C37.2, nazwa PL) —
                # picker pokazuje, czym jest funkcja, bez kopii słownika we froncie.
                "funkcje_eaz_pl": [opis_funkcji_eaz_pl(kod) for kod in funkcje],
                # Profil funkcjonalny EAZ wzorca (obowiązkowa / wariantowa / opcjonalna, wymóg
                # w każdej klasie z podstawą i statusem weryfikacji) i obwody wtórne rysunku
                # (funkcja → rdzeń CT / uzwojenie VT / sygnał, sygnały do wyłącznika) —
                # uzupełnienie właściciela 2026-10-29; `None` — szablon bez rysunku standardu.
                "profil_eaz": (
                    [pozycja.model_dump(mode="json") for pozycja in profil]
                    if (profil := profil_eaz_szablonu(szablon.template_id)) is not None
                    else None
                ),
                "obwody_wtorne": (
                    szablon.obwody_wtorne.model_dump(mode="json")
                    if szablon.obwody_wtorne is not None
                    else None
                ),
                "dopuszczony": not odmowy,
                "odmowy": [{"kod": kod, "komunikat_pl": zdanie} for kod, zdanie in odmowy],
            }
        )
    return wynik


@router.get("/bay-protection-codes")
def list_bay_protection_codes() -> dict[str, list[str]]:
    """Funkcje EAZ pól SN tworzonych wg roli (readout).

    Jedno źródło prawdy: `funkcje_eaz_roli` — funkcje szablonu kanonicznego roli
    (`SZABLON_KANONICZNY_ROLI` → `BayTemplate.funkcje_eaz`), a dla roli bez szablonu
    kanonicznego (pole baterii kondensatorów) `FUNKCJE_EAZ_ROLI_BEZ_SZABLONU` — to samo,
    z którego korzystają operacje domenowe budujące pola bez wskazanego szablonu. Klucze to
    KAŻDA rola modelu (`enm.rola_pola_sn.ROLE_POLA_MODELU`). Endpoint istnieje po to, by kreator stacji pokazywał kody BEZ
    kopiowania tablicy do frontendu (zero równoległej definicji). Pole pomiarowe ma listę
    pustą — uczciwy brak funkcji wyzwalających, nie luka danych.
    """
    from enm.rola_pola_sn import ROLE_POLA_MODELU
    from network_model.catalog.bay_templates import funkcje_eaz_roli

    return {role: funkcje_eaz_roli(role) for role in ROLE_POLA_MODELU}


@router.get("/bay-apparatus-kinds")
def list_bay_apparatus_kinds() -> dict[str, list[str]]:
    """Rodzaje aparatu GŁÓWNEGO dopuszczalne dla ról pól SN (readout).

    Jedno źródło prawdy: `BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE` — ta sama tablica,
    którą operacje domenowe stosują przy budowie pola. Końcówka istnieje
    dokładnie z tego powodu, co bliźniacza `/bay-protection-codes`: kreator
    stacji ma zawęzić picker aparatu do rozwiązań, które w danym polu REALNIE
    występują, BEZ kopiowania tablicy do frontendu (zero równoległej definicji,
    zero listy wariantów zaszytej w UI).

    Wartości to `device_kind` pozycji katalogu APARAT_SN, więc konsument filtruje
    listę katalogową wprost — nie tłumaczy nazw.
    """
    from network_model.catalog.bay_templates import BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE

    return {role: list(kinds) for role, kinds in BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE.items()}


@router.get("/mv-protection-device-types")
def list_mv_protection_device_types() -> list[dict[str, Any]]:
    """Zabezpieczenia z KANONICZNEGO katalogu MV (przestrzeń `ZABEZPIECZENIE`).

    To ta sama lista, którą waliduje brama katalogowa operacji `add_relay`
    (`materialization`: `get_protection_device_type`). Końcówka
    `/protection/device-types` zwraca inny zbiór — bibliotekę analityczną
    koordynacji zabezpieczeń — więc kreator, który z niej korzystał, oferował
    pozycje odrzucane potem przez operację (fabrykacja wyboru). Kreatory
    budujące model wybierają WYŁĄCZNIE stąd.
    """
    return [item.to_dict() for item in get_default_mv_catalog().list_protection_device_types()]


@router.get("/mv-protection-device-types/{device_type_id}/curves")
def get_mv_protection_device_curves(device_type_id: str) -> dict[str, Any]:
    """Krzywe koordynacji dla pozycji KANONICZNEGO katalogu MV (karta KD-3, poz. 9).

    JEDNA PRAWDA KATALOGÓW, DWIE ROLE. Kanoniczny katalog MV (przestrzeń
    `ZABEZPIECZENIE`) pozostaje jedynym źródłem pickerów budowy modelu, a
    biblioteka analityczna (`/protection/device-types`) — źródłem funkcji i
    charakterystyk czasowo-prądowych dla koordynacji. Do tej pory nic tych ról
    nie łączyło: od dobranego przekaźnika NIE DAŁO SIĘ przejść do jego krzywych
    inaczej niż ręcznym szukaniem po nazwie.

    Powiązanie jest JAWNE w danych katalogu (`analytical_library_ref`), nie
    dopasowaniem po nazwie w UI — dopasowanie po nazwie zwracałoby krzywe innego
    wyrobu przy pierwszej rozbieżności zapisu. Pozycja bez odpowiednika dostaje
    uczciwy kod gotowości, nie wymyślone mapowanie.
    """
    pozycja = get_default_mv_catalog().protection_device_types.get(device_type_id)
    if pozycja is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pozycja katalogowa zabezpieczenia '{device_type_id}' nie istnieje.",
        )

    odpowiedz: dict[str, Any] = {
        "device_type_id": pozycja.id,
        "name_pl": pozycja.name_pl,
        "vendor": pozycja.vendor,
        "analytical_library_ref": pozycja.analytical_library_ref,
        "functions_supported": [],
        "curves_supported": [],
        "readiness_codes": [],
    }

    if not pozycja.analytical_library_ref:
        odpowiedz["readiness_codes"] = ["protection.curve_library_missing"]
        return odpowiedz

    zdolnosc = load_device_capability(pozycja.analytical_library_ref)
    if zdolnosc is None:
        # Referencja wskazuje na wpis, którego w bibliotece nie ma — to BŁĄD
        # danych katalogu, a nie brak krzywych. Zgłaszamy go jawnie zamiast
        # cicho udawać, że pozycja krzywych nie ma.
        odpowiedz["readiness_codes"] = ["protection.curve_library_ref_broken"]
        return odpowiedz

    odpowiedz["functions_supported"] = list(zdolnosc.functions_supported)
    odpowiedz["curves_supported"] = list(zdolnosc.curves_supported)
    odpowiedz["model"] = zdolnosc.model
    return odpowiedz


@router.get("/protection/device-types")
def list_protection_device_types(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """List protection devices from active library or analytical device catalog."""
    with uow_factory() as uow:
        records = uow.protection_catalog.list_protection_device_types()
    if records:
        return records
    return [
        _serialize_analytical_protection_device(device)
        for device in list_analytical_protection_devices()
    ]


@router.get("/protection/curves")
def list_protection_curves(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """List all protection curves from catalog (P14a - READ-ONLY)"""
    with uow_factory() as uow:
        records = uow.protection_catalog.list_protection_curves()
    if records:
        return records
    return [item.to_dict() for item in get_default_mv_catalog().list_protection_curves()]


@router.get("/protection/templates")
def list_protection_setting_templates(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """List all protection setting templates from catalog (P14a - READ-ONLY)"""
    with uow_factory() as uow:
        records = uow.protection_catalog.list_protection_setting_templates()
    if records:
        return records
    return [item.to_dict() for item in get_default_mv_catalog().list_protection_setting_templates()]


@router.get("/protection/device-types/{device_type_id}")
def get_protection_device_type(
    device_type_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Get protection device from active library or analytical device catalog."""
    with uow_factory() as uow:
        result = uow.protection_catalog.get_protection_device_type(device_type_id)
    if result is not None:
        return result

    analytical_device = load_device_capability(device_type_id)
    if analytical_device is not None:
        return _serialize_analytical_protection_device(analytical_device)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Typ urządzenia zabezpieczającego nie znaleziony: {device_type_id}",
    )


@router.get("/protection/curves/{curve_id}")
def get_protection_curve(
    curve_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Get single protection curve by ID (P14a - READ-ONLY)"""
    with uow_factory() as uow:
        result = uow.protection_catalog.get_protection_curve(curve_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Krzywa zabezpieczenia nie znaleziona: {curve_id}",
        )
    return result


@router.get("/protection/templates/{template_id}")
def get_protection_setting_template(
    template_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Get single protection setting template by ID (P14a - READ-ONLY)"""
    with uow_factory() as uow:
        result = uow.protection_catalog.get_protection_setting_template(template_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Szablon nastaw zabezpieczenia nie znaleziony: {template_id}",
        )
    return result


# ============================================================================
# Protection Library Governance (P14b)
# ============================================================================


@router.get("/protection/export")
def export_protection_library(
    library_name_pl: str = "Biblioteka zabezpieczeń",
    vendor: str = "MV-DESIGN-PRO",
    series: str = "Standard",
    revision: str = "1.0",
    description_pl: str = "",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Export protection library with deterministic fingerprint (P14b).

    Returns canonical JSON export with manifest and all protection types.
    Deterministic ordering ensures identical fingerprint for same content.

    Query Parameters:
        library_name_pl: Polish name of the library
        vendor: Vendor/manufacturer name
        series: Product series/line
        revision: Revision string
        description_pl: Optional Polish description
    """
    service = _build_governance_service(uow_factory)
    return service.export_protection_library(
        library_name_pl=library_name_pl,
        vendor=vendor,
        series=series,
        revision=revision,
        description_pl=description_pl,
    )


@router.post("/protection/import")
def import_protection_library(
    payload: ImportProtectionLibraryPayload,
    mode: str = "merge",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Import protection library with conflict detection and reference validation (P14b).

    Modes:
    - merge (default): Add new types, check immutability (no overwrites)
    - replace: Replace entire library (safe for P14b as no bindings yet)

    Conflict rules:
    - Existing type_id with different parameters → 409 Conflict
    - Template references non-existent device_type/curve → 422 Validation Error

    Returns ProtectionImportReport with added/skipped/conflicts/blocked lists.
    """
    # Validate mode
    try:
        import_mode = ImportMode(mode.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy tryb: {mode}. Musi być 'merge' lub 'replace'.",
        ) from exc

    service = _build_governance_service(uow_factory)

    try:
        report = service.import_protection_library(
            data=payload.model_dump(),
            mode=import_mode,
        )
        return report
    except OdmowaDanychError as exc:
        # Conflicts or validation errors detected
        raise OdmowaHttpError(exc, status_code=status.HTTP_409_CONFLICT) from exc


def _build_production_router() -> APIRouter:
    """Router produkcyjny = pelny router. W1: zbior tras wylaczonych z produkcji
    (przypisania typow z tabel `network_*`) znikl razem z tymi trasami; wzorzec
    `production_router = _build_production_router()` zostaje dla guardow tras.
    """
    production = APIRouter()
    for route in router.routes:
        production.routes.append(route)
    return production


production_router = _build_production_router()

"""API odczytu pola i gotowości wytwórcy DER z kanonicznego modelu ENM.

Karta JEDNA-SCIEZKA-EDYCJI: zapis wytwórcy i jego wiązań katalogowych idzie WYŁĄCZNIE
operacjami domenowymi przez `POST /api/cases/{case_id}/enm/domain-ops`
(`add_converter_source`, `set_der_catalog_bindings`) — z dziennikiem zmian, cofaniem i bramą
katalogową. Dawne końcówki zapisu tego modułu (`POST …/generators`, `PATCH …/bindings`) były
drugą drogą zapisu z własnym tłumaczem ładunku i własnym katalogiem transformatorów
dedykowanych; skasowane bez warstwy zgodności.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.analyses.protection.catalog.catalog_store import list_devices
from application.field_read_model import droga_doziemna_pola
from catalog.profiles.nc_rfg import load_nc_rfg_profile
from domain.der_protection_functions import (
    FaktyPolaWytworcy,
    dobierz_funkcje,
    ocen_urzadzenie,
)
from domain.der_readiness import (
    macierz_gotowosci_der,
    osie_gotowosci_der,
    podsumuj_gotowosc,
    ref_profilu_nc_rfg,
    sn_transformatora_dedykowanego_kva,
    wejscie_z_generatora,
)
from domain.dobor_przekladnika import (
    WymaganiaToru,
    WymaganiaToruNapieciowego,
    sprawdz_dobor_ct,
    sprawdz_dobor_vt,
)
from enm.dane_przyjete_galezi import dane_przyjete_galezi_wiersza
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu
from enm.pola import ref_pola_wytworcy
from enm.slownik_komunikatow import opis_elementu
from enm.store import get_enm as _get_enm
from enm.tor_pola import szyna_raportowa
from fastapi import APIRouter, HTTPException, Request, status
from network_model.catalog.wartosci_robocze import (
    dana_przyjeta_tolerancji_nn,
    dane_przyjete_maszyn,
)
from network_model.pochodne import kv_na_v, mw_na_kw, v_na_kv
from network_model.solvers.equipment_checks.ct_burden_saturation import CtDeviceBurden
from werdykt import DanaPrzyjeta
from werdykt.kontrakt import LimitKryterium

router = APIRouter(prefix="/api/projects", tags=["generators"])


def _validate_project_case_context(request: Request, project_id: str, case_id: str) -> None:
    """Sprawdz, ze `case_id` istnieje w bazie i nalezy do `project_id`.

    CV-1-W: przypadek BEZ wiersza w bazie (`study_case is None`) jest zawsze
    404 — magazyn ENM nie ma juz wlasnego modelu per przypadek (inwariant
    I-2, `enm.klucz_twin.PrzypadekBezProjektuError`), wiec „przypadek ma
    materialized ENM pod raw case_id, ale nie ma go w bazie" przestalo byc
    legalnym stanem. Dawny fallback (`_has_enm(case_id)`) tolerowal DOKLADNIE
    ten stan i po CV-1-W dawal odpowiedz sprzeczna z dalsza czescia zadania:
    ta funkcja przepuszczalaby request, a tlumacz klucza (`KluczTwin`,
    wolany przez handler) i tak odrzucalby go 404 — walidacja i rzeczywisty
    dostep do magazynu mowilyby co innego.
    """
    try:
        parsed_project_id = UUID(project_id)
        parsed_case_id = UUID(case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "project_case.invalid_uuid",
                "message_pl": "Niepoprawny identyfikator projektu lub przypadku.",
            },
        ) from exc

    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        return

    with uow_factory() as uow:
        study_case = uow.cases.get_study_case(parsed_case_id)

    if study_case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "study_case.not_found",
                "message_pl": "Nie znaleziono przypadku obliczeniowego.",
            },
        )

    if str(study_case.project_id) != str(parsed_project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "study_case.project_mismatch",
                "message_pl": "Przypadek obliczeniowy nie należy do wskazanego projektu.",
            },
        )


def _fakty_pola_wytworcy(
    generator: dict[str, Any],
    sciezka_zwarcia: dict[str, Any] | None,
    transformatory: list[dict[str, Any]],
) -> FaktyPolaWytworcy:
    """Zloz fakty o polu wytworcy z modelu — bez ani jednej wartosci domyslnej.

    Sciezka zwarcia doziemnego pochodzi z KANONICZNEGO odczytu pola
    (`application.field_read_model.droga_doziemna_pola` — ta sama funkcja co read-model
    pól), a nie z rownoleglego wyprowadzenia — dwa opisy tego samego pola rozjezdzalyby
    sie (precedens V12K-243).
    """

    wariant = generator.get("connection_variant")
    strona = {
        "DEDICATED_MV_CONNECTION": "dedicated_transformer",
        "block_transformer": "dedicated_transformer",
        "SOURCE_CONNECTION_STATION": "SN",
    }.get(wariant if isinstance(wariant, str) else "", "nN")

    rodzaj = {
        "pv_inverter": "PV",
        "bess": "BESS",
        "wind_inverter": "FW",
        "fw_pmsg": "FW",
        "fw_dfig": "FW",
        "fw_scig": "FW",
    }.get(generator.get("gen_type") or "", "PV")

    p_mw = generator.get("p_mw")
    sciezka = sciezka_zwarcia or {}
    return FaktyPolaWytworcy(
        der_id=str(generator.get("ref_id") or ""),
        der_nazwa=nazwa_elementu(generator, "generators"),
        der_kind=rodzaj,  # type: ignore[arg-type]
        connection_side=strona,
        nominal_power_kw=(mw_na_kw(p_mw) if isinstance(p_mw, int | float) else None),
        # Podmiot kryterium 87T: transformator dedykowany z modelu (nie moc źródła).
        sn_transformatora_dedykowanego_kva=sn_transformatora_dedykowanego_kva(
            generator, transformatory
        ),
        # Brak opisu sciezki zwarcia doziemnego zostaje BRAKIEM: regula zamieni go
        # w nazwana kwestie otwarta, zamiast wybrac rodzine funkcji za projektanta.
        neutral_grounding_mode=sciezka.get("neutral_grounding_mode") or None,
        zero_sequence_current_source=sciezka.get("zero_sequence_current_source") or "brak",
        zero_sequence_voltage_source=sciezka.get("zero_sequence_voltage_source") or "brak",
    )


def _sciezka_zwarcia_dla_pola(
    enm: EnergyNetworkModel, bay_ref: str | None
) -> dict[str, Any] | None:
    if not bay_ref:
        return None
    # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: droga doziemna jest daną MODELU — czytana wprost
    # (`droga_doziemna_pola`), a nie z sekcji wyników read-modelu pól (istniejącej tylko po
    # biegu, czytanej dawniej pod nieistniejącym kluczem `items` — fakty zawsze puste).
    droga = droga_doziemna_pola(enm, bay_ref)
    return droga.model_dump(mode="json") if droga is not None else None


def _funkcje_urzadzenia(
    protection_ref: str | None,
) -> tuple[tuple[str, ...] | None, str]:
    """Funkcje deklarowane przez wybrane urzadzenie + jego nazwa do komunikatu."""
    if not protection_ref:
        return None, "wybrane urządzenie"
    for urzadzenie in list_devices():
        if urzadzenie.device_id == protection_ref:
            # Karta FAB-A/D-33: `vendor` bywa None dla profilu referencyjnego
            # bez marki — f"{None} {model}" dawaloby falszywy tekst "None".
            czesci_nazwy = [str(urzadzenie.vendor)] if urzadzenie.vendor else []
            if urzadzenie.model:
                czesci_nazwy.append(str(urzadzenie.model))
            nazwa = " ".join(czesci_nazwy).strip()
            # Nazwa urządzenia z katalogu (producent + model); identyfikator pozycji
            # katalogu nie jest nazwą (karta #144).
            return (
                tuple(urzadzenie.functions_supported),
                nazwa or "urządzenie bez oznaczenia",
            )
    return None, "urządzenie spoza katalogu"


def _prog_87t_operatora(generator: dict[str, Any]) -> tuple[LimitKryterium | None, str | None]:
    """Próg 87T i nazwa operatora z profilu NC RfG wskazanego przez wytwórcę.

    Jedyny dostawca progu (`NcRfgProfile.prog_87t_sn_transformatora`) dla doboru funkcji
    zabezpieczeniowych i gotowości DER. Profil niewskazany → ``(None, None)``; profil spoza
    katalogu operatorów → ``(None, opis)`` — w obu przypadkach wymaganie 87T ma status
    BRAK_PODSTAWY z wyjaśnieniem, nigdy cichy próg.
    """
    ref = ref_profilu_nc_rfg(generator)
    if ref is None:
        return None, None
    try:
        profil = load_nc_rfg_profile(ref)
    except FileNotFoundError:
        # Komunikat bez identyfikatora profilu (`test_komunikaty_operacji_bez_kodow`): projektant
        # widzi profil wytwórcy w jego karcie, tu — przyczynę braku podstawy progu.
        return None, "profil NC RfG wytwórcy (profilu nie ma w katalogu operatorów)"
    return profil.prog_87t_sn_transformatora, profil.operator_name_pl


@router.get("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/protection-functions")
def get_der_protection_functions(
    project_id: str,
    case_id: str,
    klucz: KluczTwin,
    generator_ref: str,
    request: Request,
) -> dict[str, Any]:
    """Wymagane funkcje zabezpieczeniowe pola wytworcy + ocena wybranego urzadzenia.

    ZERO FIZYKI I ZERO NASTAW: odpowiedz mowi, JAKIE funkcje sa wymagane, CZYM je
    zmierzyc i CZY wybrane urzadzenie je realizuje. Nastawy licza moduly koordynacji.
    """

    _validate_project_case_context(request, project_id, case_id)
    enm = _get_enm(klucz)
    dane = enm.model_dump(mode="json")

    generator = next(
        (g for g in dane.get("generators", []) if g.get("ref_id") == generator_ref),
        None,
    )
    if generator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "generator.not_found",
                "message_pl": "Wskazany wytwórca nie istnieje w modelu sieci.",
            },
        )

    zmaterializowane = generator.get("materialized_params") or {}
    meta = generator.get("meta") or {}
    # Relacja wytwórcy z polem — jedno źródło `enm.pola.ref_pola_wytworcy` (karta W5-B).
    bay_ref = ref_pola_wytworcy(generator)

    sciezka = _sciezka_zwarcia_dla_pola(enm, bay_ref)
    fakty = _fakty_pola_wytworcy(generator, sciezka, dane.get("transformers", []))
    prog_87t, profil_operatora_pl = _prog_87t_operatora(generator)
    dobor = dobierz_funkcje(fakty, prog_87t=prog_87t, profil_operatora_pl=profil_operatora_pl)

    protection_ref = None
    for zrodlo in (zmaterializowane, meta):
        if isinstance(zrodlo, dict) and isinstance(zrodlo.get("protection_catalog_ref"), str):
            protection_ref = zrodlo["protection_catalog_ref"]
            break

    funkcje_urzadzenia, nazwa_urzadzenia = _funkcje_urzadzenia(protection_ref)
    ocena = ocen_urzadzenie(dobor.kody(), funkcje_urzadzenia, nazwa_urzadzenia=nazwa_urzadzenia)

    return {
        "generator_ref": generator_ref,
        "bay_ref": bay_ref,
        "fakty": {
            "connection_side": fakty.connection_side,
            "neutral_grounding_mode": fakty.neutral_grounding_mode,
            "zero_sequence_current_source": fakty.zero_sequence_current_source,
            "zero_sequence_voltage_source": fakty.zero_sequence_voltage_source,
        },
        "dobor": dobor.to_dict(),
        "urzadzenie": {
            "protection_catalog_ref": protection_ref,
            "nazwa": nazwa_urzadzenia if protection_ref else None,
            **ocena.to_dict(),
        },
    }


@router.get("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/readiness")
def get_der_readiness(
    project_id: str,
    case_id: str,
    klucz: KluczTwin,
    generator_ref: str,
    request: Request,
) -> dict[str, Any]:
    """Gotowosc analiz dla wytworcy — KANONICZNA regula domenowa (V12K-251).

    DLACZEGO TEN ENDPOINT ISTNIEJE. Regula `domain/der_readiness.py` (519 linii)
    powstala jako backendowy odpowiednik macierzy z frontu i byla utrzymywana pod
    kontraktem parzystosci — ale POMIAR pokazal ZERO konsumentow produkcyjnych
    (`grep -rln der_readiness backend/src` poza samym modulem), wiec wolaly ja
    wylacznie testy. Zdolnosc bez wywolania: regula pilnowana, nikomu nie sluzaca,
    a jedyna ocena widziana przez uzytkownika liczona w przegladarce.

    Odpowiedz niesie statusy osi ORAZ NAZWANE powody (kody + komunikat + miejsce
    naprawy) — bez powodow status jest slepym zaulkiem.

    Klasa przekladnika przychodzi z KATALOGU (`CTType.to_dict`, IEC 61869-2), nie
    ze zgadywania z identyfikatora: regula nie ma wlasnego katalogu.
    """

    _validate_project_case_context(request, project_id, case_id)
    enm = _get_enm(klucz)
    dane = enm.model_dump(mode="json")

    generatory = dane.get("generators", [])
    generator = next((g for g in generatory if g.get("ref_id") == generator_ref), None)
    if generator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "generator.not_found",
                "message_pl": "Wskazany wytwórca nie istnieje w modelu sieci.",
            },
        )

    # Liczba INNYCH wytworcow w tej samej stacji — wejscie osi selektywnosci.
    stacja = generator.get("station_ref")
    inni = sum(
        1 for g in generatory if g.get("ref_id") != generator_ref and g.get("station_ref") == stacja
    )

    klasa_ct, zastosowanie_ct = _klasa_przekladnika_z_katalogu(generator)
    prog_87t, profil_operatora_pl = _prog_87t_operatora(generator)
    wejscie = wejscie_z_generatora(
        generator,
        transformatory=dane.get("transformers", []),
        other_ders_in_station=inni,
        ct_accuracy_class=klasa_ct,
        ct_application=zastosowanie_ct,
        prog_87t=prog_87t,
        profil_operatora_pl=profil_operatora_pl,
    )
    macierz = macierz_gotowosci_der(wejscie)
    osie = osie_gotowosci_der(wejscie)

    return {
        "generator_ref": generator_ref,
        "macierz": macierz,
        "osie": [os.to_dict() for os in osie],
        "podsumowanie": podsumuj_gotowosc(macierz),
    }


@router.get("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/instrument-transformers")
def get_der_instrument_transformers(
    project_id: str,
    case_id: str,
    klucz: KluczTwin,
    generator_ref: str,
    request: Request,
) -> dict[str, Any]:
    """Dobor przekladnikow pola wytworcy — kryteria normowe z jawnym rachunkiem.

    DLACZEGO. Ekran pokazywal przekladniki jako NAZWY katalogowe. Audyt E-21 (pkt P9):
    „bez sprawdzenia przekladni wobec pradu chronionego toru, obciazalnosci cieplnej i
    dynamicznej, nasycenia oraz zgodnosci z wejsciem przekaznika jego wybor nie ma
    wiarygodnosci inzynierskiej".

    SKAD DANE (zero wartosci domyslnych, zero fizyki w tej warstwie):
      * typ przekladnika    — katalog (`CTType`/`VTType`, dane doboru z V12K-254/255),
      * prad roboczy toru   — SOLVER `compute_transformer_rated_currents` (I = S/(√3·U)),
      * Ik'' oraz ip        — WIERSZ WYNIKU zwarciowego dla szyny pola (solver IEC 60909);
                              brak zakonczonego przebiegu zostaje BRAKIEM DANEJ,
      * sposob uziemienia i tor napiecia zerowego — kanoniczny odczyt pola,
      * wejscia pomiarowe urzadzenia — katalog urzadzen (z pochodzeniem deklaracji).
    """

    _validate_project_case_context(request, project_id, case_id)
    enm = _get_enm(klucz)
    dane = enm.model_dump(mode="json")

    generator = next(
        (g for g in dane.get("generators", []) if g.get("ref_id") == generator_ref),
        None,
    )
    if generator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "generator.not_found",
                "message_pl": "Wskazany wytwórca nie istnieje w modelu sieci.",
            },
        )

    zrodla = (
        _slownik_pomocniczy(generator.get("materialized_params")),
        _slownik_pomocniczy(generator.get("meta")),
    )
    # Relacja wytwórcy z polem — jedno źródło `enm.pola.ref_pola_wytworcy` (karta W5-B).
    bay_ref = ref_pola_wytworcy(generator)
    sciezka = _sciezka_zwarcia_dla_pola(enm, bay_ref) or {}

    napiecie_v = _napiecie_szyny_v(dane, generator.get("bus_ref"))
    prad_roboczy = _prad_roboczy_pola_a(generator, napiecie_v)
    ik_ka, ip_ka, run_ref, tolerancja_robocza, dane_galezi, robocze_maszyn = _prady_zwarciowe_szyny(
        case_id, generator.get("bus_ref")
    )
    # Dane przyjęte Ik''/ip szyny pola: tolerancja sieci nN (karta TOLERANCJA-NN-WARTOSC-ROBOCZA),
    # linie 110 kV z wartością roboczą geometrii (karta LINIA-110) i wartości robocze parametrów
    # maszyn wirujących wyspy szyny (karta PODSTAWA-Q).
    dane_przyjete_pola = (
        (
            (
                dana_przyjeta_tolerancji_nn(
                    miejsce_pl=opis_elementu(dane, generator.get("bus_ref"), "szyna pola")
                ),
            )
            if tolerancja_robocza
            else ()
        )
        + dane_galezi
        + dane_przyjete_maszyn(robocze_maszyn, wielkosc=("ikss", "ip"))
    )
    prady_wejsc, napiecia_wejsc, zrodlo_wejsc = _wejscia_urzadzenia(
        _pierwsza_wartosc(zrodla, "protection_catalog_ref")
    )

    ct_ref = _pierwsza_wartosc(zrodla, "ct_catalog_ref")
    obwod_ct = _obwod_wtorny_pomiaru(dane, bay_ref, "CT", ct_ref)

    tor_pradowy = WymaganiaToru(
        prad_roboczy_a=prad_roboczy,
        ik_ka=ik_ka,
        ip_ka=ip_ka,
        # Czas trwania zwarcia przyjety do sprawdzenia cieplnego jest DANA PROJEKTOWA
        # (nastawa stopnia rezerwowego). Model jej nie niesie, wiec zostaje brakiem —
        # regula nazwie go wprost, zamiast podstawic 1 s „bo tak sie zwykle przyjmuje".
        czas_zwarcia_s=None,
        prady_wejsc_przekaznika_a=prady_wejsc,
        # Karta W3-B (mapa 4 #3): jedno zagregowane VA obwodu wtornego (kryterium
        # `ct.obciazalnosc`) NIE JEST liczone tutaj — sumowanie devices+styki bez
        # skladnika I2n^2*Rp bylby S2obl NIEPELNY podpisany jak pelny (fizyka
        # czesciowa gorsza od uczciwego braku). Rygorystyczny bilans (WSZYSTKIE
        # skladniki) liczy teraz jadro w kryterium `ct.alf` z `obwod_ct` ponizej;
        # `ct.obciazalnosc` zostaje `brak_danych` dla DER, dopoki pole wytworcy
        # nie dostanie wlasnej materializacji obwodu (poza zakresem tej karty —
        # DER wiaze CT/VT przez `set_der_catalog_bindings`, NIE przez
        # `Measurement`, wiec nie ma tu jednego elementu modelu do zapisu).
        obciazenie_obwodu_va=None,
        zrodlo_wejsc_pl=zrodlo_wejsc,
        dla_zabezpieczen=True,
        # Obwod wtorny CT — z `Measurement.obwod_wtorny` modelu (pole tej samej
        # stacji, GDY zapisany), zero liczenia fizyki w tej warstwie: fakty
        # przechodza do jadra bez zmian (`sprawdz_dobor_ct` → `ct.alf`).
        dlugosc_przewodu_m=obwod_ct.dlugosc_przewodu_m,
        przekroj_przewodu_mm2=obwod_ct.przekroj_przewodu_mm2,
        obciazenia_aparatow=obwod_ct.obciazenia_aparatow,
        moc_stykow_va=obwod_ct.moc_stykow_va,
    )
    tor_napieciowy = WymaganiaToruNapieciowego(
        napiecie_sieci_v=napiecie_v,
        tryb_uziemienia=sciezka.get("neutral_grounding_mode") or None,
        zwarcie_doziemne_wylaczane_automatycznie=None,
        napiecia_wejsc_przekaznika_v=napiecia_wejsc,
        # Patrz komentarz przy `tor_pradowy.obciazenie_obwodu_va` — ta karta nie
        # rozbudowuje modelu VT pola wytworcy (poza zakresem W3-B).
        obciazenie_obwodu_va=None,
        zrodlo_napiecia_zerowego=sciezka.get("zero_sequence_voltage_source") or "brak",
        zrodlo_wejsc_pl=zrodlo_wejsc,
        dla_zabezpieczen=True,
    )

    vt_ref = _pierwsza_wartosc(zrodla, "vt_catalog_ref")
    return {
        "generator_ref": generator_ref,
        "bay_ref": bay_ref,
        "wejscia": {
            "napiecie_sieci_v": napiecie_v,
            "prad_roboczy_a": prad_roboczy,
            "ik_ka": ik_ka,
            "ip_ka": ip_ka,
            "run_ref_zwarciowy": run_ref,
            "tryb_uziemienia": tor_napieciowy.tryb_uziemienia,
            "zrodlo_napiecia_zerowego": tor_napieciowy.zrodlo_napiecia_zerowego,
            "zrodlo_wejsc_urzadzenia": zrodlo_wejsc,
        },
        "przekladnik_pradowy": _dobor_przekladnika(ct_ref, "ct", tor_pradowy),
        "przekladnik_napieciowy": _dobor_przekladnika(vt_ref, "vt", tor_napieciowy),
        # Karty TOLERANCJA-NN-WARTOSC-ROBOCZA, LINIA-110 i PODSTAWA-Q: Ik''/ip szyny pola
        # liczone z daną przyjętą (znaczniki wiersza biegu) — addytywnie, WYŁĄCZNIE gdy są.
        **(
            {
                "status_danych": "UNVALIDATED_INPUT",
                "dane_przyjete": [d.model_dump(mode="json") for d in dane_przyjete_pola],
            }
            if dane_przyjete_pola
            else {}
        ),
    }


def _pierwsza_wartosc(zrodla: tuple[dict[str, Any], ...], pole: str) -> str | None:
    for zrodlo in zrodla:
        wartosc = zrodlo.get(pole)
        if isinstance(wartosc, str) and wartosc.strip():
            return wartosc
    return None


def _napiecie_szyny_v(dane: dict[str, Any], bus_ref: Any) -> float | None:
    if not isinstance(bus_ref, str):
        return None
    for szyna in dane.get("buses", []):
        if szyna.get("ref_id") == bus_ref:
            kv = szyna.get("voltage_kv")
            return kv_na_v(float(kv)) if isinstance(kv, int | float) else None
    return None


def _prad_roboczy_pola_a(generator: dict[str, Any], napiecie_v: float | None) -> float | None:
    """Prad roboczy toru — Z SOLWERA, nie z wlasnego wzoru w warstwie API.

    `compute_transformer_rated_currents` jest kanonicznym dostawca przeliczenia
    I = S/(√3·U) (WHITE BOX: wzor + zalozenia). Reuzycie zamiast rownoleglego
    rachunku — dwa wzory na to samo rozjezdzaja sie (precedens V12K-243).
    """
    from network_model.solvers.transformer_rated_currents import (
        TransformerRatedCurrentsInput,
        compute_transformer_rated_currents,
    )

    p_mw = generator.get("p_mw")
    if not isinstance(p_mw, int | float) or p_mw <= 0 or not napiecie_v or napiecie_v <= 0:
        return None
    napiecie_kv = v_na_kv(napiecie_v)
    wynik = compute_transformer_rated_currents(
        TransformerRatedCurrentsInput(
            rated_power_kva=mw_na_kw(float(p_mw)),
            primary_voltage_kv=napiecie_kv,
            secondary_voltage_kv=napiecie_kv,
        )
    )
    return wynik.primary_current_a


def _prady_zwarciowe_szyny(case_id: str, bus_ref: Any) -> tuple[
    float | None,
    float | None,
    str | None,
    bool,
    tuple[DanaPrzyjeta, ...],
    list[dict[str, Any]],
]:
    """Ik'', ip, przebieg, znacznik wartości roboczej tolerancji sieci nN (karta
    TOLERANCJA-NN-WARTOSC-ROBOCZA), dane przyjęte gałęzi z wartością roboczą impedancji
    (karta LINIA-110) i wartości robocze parametrów maszyn (karta PODSTAWA-Q) dla szyny pola
    z OSTATNIEGO zakonczonego przebiegu zwarciowego — znaczniki z TEGO SAMEGO wiersza co prądy.

    Brak przebiegu albo brak wiersza dla tej szyny zwraca `(None, None, None, False, (), [])` —
    regula zamieni to w nazwany brak danej („uruchom analize zwarciowa"), a nie w
    zgodnosc. Zadnego sumowania wkladow: suma prądow zwarciowych nalezy do solwera.
    """
    from enm.canonical_analysis import build_short_circuit_results, list_runs_for_case

    if not isinstance(bus_ref, str):
        return None, None, None, False, (), []
    from application.autorytet_biegu_zwarciowego import bieg_w_zakresie_iec60909

    # Karta OD-14: reguły aparatury pola liczą prądem zwarcia METALICZNEGO — bieg przez
    # impedancję przejścia Z_f (poza zakresem IEC 60909) nie jest źródłem Ik''/ip reguły.
    przebiegi = [
        run
        for run in list_runs_for_case(case_id)
        if run.analysis_type == "short_circuit_sn"
        and run.status == "FINISHED"
        and bieg_w_zakresie_iec60909(run)
    ]
    for run in sorted(przebiegi, key=lambda r: r.created_at, reverse=True):
        # Wytwórca na zacisku pola (szyna pomocnicza bez własnego wiersza) — wiersz węzła
        # raportuje szyna pola (`enm.tor_pola.szyna_raportowa`, model TEGO biegu).
        szukana = szyna_raportowa(run.snapshot or {}, bus_ref)
        for wiersz in build_short_circuit_results(run).get("rows", []):
            if wiersz.get("fault_type") not in (None, "3F", "three_phase"):
                continue
            if szukana in (wiersz.get("target_id"), wiersz.get("element_id")):
                return (
                    wiersz.get("ikss_ka"),
                    wiersz.get("ip_ka"),
                    str(run.id),
                    bool(wiersz.get("tolerancja_nn_robocza")),
                    dane_przyjete_galezi_wiersza(wiersz),
                    list(wiersz.get("parametry_robocze_maszyn") or ()),
                )
    return None, None, None, False, (), []


def _wejscia_urzadzenia(
    protection_ref: str | None,
) -> tuple[tuple[float, ...] | None, tuple[float, ...] | None, str | None]:
    if not protection_ref:
        return None, None, None
    for urzadzenie in list_devices():
        if urzadzenie.device_id == protection_ref:
            return (
                urzadzenie.rated_current_inputs_a,
                urzadzenie.rated_voltage_inputs_v,
                urzadzenie.rated_inputs_source,
            )
    return None, None, None


@dataclass(frozen=True)
class _ObwodWtornyPomiaru:
    """Fakty obwodu wtornego wyluskane z `Measurement.obwod_wtorny` modelu.

    Pusta instancja (wszystkie pola `None`/puste) oznacza „obwod niezapisany" —
    `sprawdz_dobor_ct` zamienia to w kod gotowosci `ct.secondary_circuit_missing`,
    NIGDY w wartosc zastepcza (karta W3-B, zero fabrykacji).
    """

    dlugosc_przewodu_m: float | None = None
    przekroj_przewodu_mm2: float | None = None
    obciazenia_aparatow: tuple[CtDeviceBurden, ...] = ()
    moc_stykow_va: float | None = None


_OBWOD_WTORNY_PUSTY = _ObwodWtornyPomiaru()


def _obwod_wtorny_pomiaru(
    dane: dict[str, Any],
    bay_ref: str | None,
    measurement_type: Literal["CT", "VT"],
    catalog_ref: str | None,
) -> _ObwodWtornyPomiaru:
    """Obwod wtorny CT/VT z modelu — TOR: model → domena (zero liczenia tutaj).

    Szuka `Measurement` przypietego do TEGO SAMEGO pola (`bay_ref`), co pole
    wytworcy, o wlasciwym `measurement_type` — obwod wtorny jest cecha FIZYCZNEGO
    okablowania w polu, wiec obowiazuje niezaleznie od tego, ktory `catalog_ref`
    jest akurat sprawdzany w kryterium doboru. Gdy w polu jest kilka pomiarow
    tego samego rodzaju (rzadkie, np. dwa rdzenie osobno modelowane), preferowany
    jest ten o `catalog_ref` zgodnym z wiazaniem wytworcy — w przeciwnym razie
    pierwszy po posortowanym `ref_id` (determinizm, zero zaleznosci od kolejnosci
    zapisu w licie).

    Pole wytwórcy (`bay_ref` tej funkcji) to relacja `Generator.meta.field_ref`
    (`enm.pola.ref_pola_wytworcy`), zapisywana przez operacje budowy źródła i promocję
    aparatów nN. KOREKTA karty W5-B: dawny opis „`Generator.bay_ref` nie jest ustawiany
    żadną drogą" był prawdą o NIEISTNIEJĄCYM kluczu — relacja istniała pod `meta.field_ref`,
    a czytelnicy szukali jej pod `bay_ref` i zawsze dostawali brak (luka zamknięta).
    """
    if not bay_ref:
        return _OBWOD_WTORNY_PUSTY
    kandydaci = [
        m
        for m in dane.get("measurements", [])
        if isinstance(m, dict)
        and m.get("bay_ref") == bay_ref
        and m.get("measurement_type") == measurement_type
    ]
    if not kandydaci:
        return _OBWOD_WTORNY_PUSTY
    dopasowany_katalogowo = [
        m for m in kandydaci if catalog_ref and m.get("catalog_ref") == catalog_ref
    ]
    pula = dopasowany_katalogowo or kandydaci
    wybrany = sorted(pula, key=lambda m: str(m.get("ref_id") or ""))[0]
    obwod = wybrany.get("obwod_wtorny")
    if not isinstance(obwod, dict):
        return _OBWOD_WTORNY_PUSTY
    # Pozycja bez `moc_va` jest POMIJANA, nie zastepowana zerem — zero VA to
    # POMIAR (aparat nic nie pobiera), nie znacznik braku danej. Model
    # (`ObciazenieAparatu.moc_va: float`) czyni to teoretyczne, ale kod NIE
    # zaklada poprawnosci cudzej warstwy zapisu (solver_input_substitute_guard).
    aparaty = tuple(
        CtDeviceBurden(nazwa=str(o.get("nazwa", "")), moc_va=float(o["moc_va"]))
        for o in (obwod.get("obciazenia_aparatow") or [])
        if isinstance(o, dict) and isinstance(o.get("moc_va"), int | float)
    )
    return _ObwodWtornyPomiaru(
        dlugosc_przewodu_m=obwod.get("dlugosc_przewodu_m"),
        przekroj_przewodu_mm2=obwod.get("przekroj_przewodu_mm2"),
        obciazenia_aparatow=aparaty,
        moc_stykow_va=obwod.get("moc_stykow_va"),
    )


def _dobor_przekladnika(
    ref: str | None,
    rodzaj: Literal["ct", "vt"],
    tor: WymaganiaToru | WymaganiaToruNapieciowego,
) -> dict[str, Any]:
    """Dobor dla wiazania katalogowego; brak wiazania NIE jest bledem doboru."""
    from network_model.catalog import get_default_mv_catalog

    if ref is None:
        return {"catalog_ref": None, "nazwa": None, "wynik": None}
    katalog = get_default_mv_catalog()
    typ = katalog.get_ct_type(ref) if rodzaj == "ct" else katalog.get_vt_type(ref)
    if typ is None:
        return {"catalog_ref": ref, "nazwa": None, "wynik": None}
    jako_slownik = typ.to_dict()
    wynik = (
        sprawdz_dobor_ct(jako_slownik, tor)
        if rodzaj == "ct" and isinstance(tor, WymaganiaToru)
        else (
            sprawdz_dobor_vt(jako_slownik, tor)
            if isinstance(tor, WymaganiaToruNapieciowego)
            else None
        )
    )
    return {
        "catalog_ref": ref,
        "nazwa": jako_slownik.get("name"),
        "typ": jako_slownik,
        "wynik": wynik.to_dict() if wynik is not None else None,
    }


def _klasa_przekladnika_z_katalogu(
    generator: dict[str, Any],
) -> tuple[str | None, Any]:
    """Klasa i zastosowanie przekladnika Z KATALOGU — regula ich nie zgaduje.

    Brak wiazania albo typ nieznany katalogowi daje `(None, None)`, co regula zamienia
    w kod `der.ct_class.unresolved` — „nie da sie ustalic" jest innym faktem niz
    „klasa nie jest zabezpieczeniowa" (V12K-232).
    """
    from network_model.catalog import get_default_mv_catalog

    zrodla = (
        _slownik_pomocniczy(generator.get("materialized_params")),
        _slownik_pomocniczy(generator.get("meta")),
    )
    ref = None
    for zrodlo in zrodla:
        wartosc = zrodlo.get("ct_catalog_ref")
        if isinstance(wartosc, str) and wartosc.strip():
            ref = wartosc
            break
    if ref is None:
        return None, None

    typ = get_default_mv_catalog().get_ct_type(ref)
    if typ is None:
        return None, None
    jako_slownik = typ.to_dict()
    return jako_slownik.get("accuracy_class"), jako_slownik.get("application")


def _slownik_pomocniczy(wartosc: Any) -> dict[str, Any]:
    return wartosc if isinstance(wartosc, dict) else {}

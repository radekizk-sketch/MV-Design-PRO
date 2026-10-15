"""Kabel nN jako obiekt projektowy — obliczenia odcinka i dobór przekroju (karta OBIEKT-KABEL-NN).

Dyrektywa nadrzędna właściciela 2026-10-15 (`docs/domain/KONTRAKT_PROWADZENIA_PROJEKTANTA.md`
§6): każdy element sieci jest obiektem projektowym z obliczeniami. Dla odcinka kabla nN
ten moduł składa — WYŁĄCZNIE z istniejących dostawców — komplet obliczeń, które projektant
widzi przy zaznaczonym kablu, oraz porównanie wariantów przekroju z katalogu:

* obciążalność Iz′ po współczynnikach poprawkowych (solver `cable_ampacity_derating`,
  warunki ułożenia z modelu — `nn_circuit_sheet.wspolczynniki_ulozenia_kabla`);
* prąd obliczeniowy Ib, spadek napięcia i straty z BIEGU ROZPŁYWU MOCY policzonego na
  bieżącym modelu (`bieg_wariantu` + `wykonaj_bieg_w_pamieci`, bieg bazowy przypadku daje
  wyłącznie opcje i tożsamość — liczby pochodzą z modelu w chwili zapytania);
* Ik″max (IEC 60909) z biegu zwarciowego na bieżącym modelu, Ik1 min z pętli zwarcia
  (`fault_loop.service.petla_zwarcia_min_w_punkcie`), SWZ (`swz.werdykt.ocen_swz`);
* dopasowanie zabezpieczenia: Ib ≤ In ≤ Iz′, I2 ≤ 1,45·Iz′ (`nn_device_selection.
  kryterium_i2`), zdolność wyłączania wobec Ik″max w punkcie zabudowy aparatu;
* wytrzymałość cieplną I²t ≤ k²S² (`nn_circuit_sheet.wytrzymalosc_cieplna_kabla`) przy
  czasie wyłączenia odczytanym z charakterystyki NORMOWEJ aparatu przy prądzie zwarcia na
  początku odcinka (MCB: górna granica pasma magnetycznego → t ≤ 0,1 s, IEC 60898-1;
  MCCB: stopień wyzwalacza z nastaw; wkładka gG: norma nie daje bramki czasu krótszego niż
  umowny — czas nieustalony, ocena nie jest wydawana).

Każde kryterium jest rekordem werdyktu wyjaśnialnego (`werdykt.OcenaKryterium`) z
odczytem technicznym marginesu dla pierwszego planu (`ocena_techniczna_pl`) i szczegółem na
żądanie zbudowanym z TYCH SAMYCH funkcji kroków co pakiet dowodowy
LV_CIRCUIT_VERIFICATION (`proof_engine.packs.lv_circuit_verification.krok_*`).

Dobór przekroju: każdy kandydat z katalogu kabli nN (ta sama rodzina: materiał, izolacja,
liczba żył) jest liczony TĄ SAMĄ funkcją na migawce scenariusza z zamianą typu
(`enm.scenariusze.ZamianaKatalogu` — w środku ta sama operacja domenowa
`assign_catalog_to_element`, którą projektant wykonuje, wybierając wariant).

Warstwa analiz: zero fizyki — liczby z solverów, tu wybór punktów, składanie rekordów i
porównania na wynikach solverów.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from analysis.normative.kryteria_napiecia import (
    KRYTERIUM_SPADKU_OBWODU_NN_DOKUMENT_PL,
    KRYTERIUM_SPADKU_OBWODU_NN_JEDNOSTKA_REDAKCYJNA,
    KRYTERIUM_SPADKU_OBWODU_NN_PROCENT,
    KRYTERIUM_SPADKU_OBWODU_NN_RODZAJ_PODSTAWY,
    KRYTERIUM_SPADKU_OBWODU_NN_STAN_ZRODLA,
    KRYTERIUM_SPADKU_OBWODU_NN_WYDANIE,
)
from application.analyses.fault_loop.route import LvBusPath
from application.analyses.fault_loop.service import (
    assign_station_lv_buses,
    odmowa_pasma_nn,
    petla_zwarcia_min_w_punkcie,
    station_transformers,
)
from application.analyses.nn_circuit_sheet import (
    TYPY_APARATU,
    delta_u_dla_trasy,
    ik_z_biegu_zwarciowego,
    iz_prime_dla_kabla,
    wspolczynniki_ulozenia_kabla,
    wytrzymalosc_cieplna_kabla,
    zacisk_od_strony_rozdzielnicy,
)
from application.analyses.nn_device_selection import kandydat_z_urzadzenia, kryterium_i2
from application.analyses.ocena_doboru_magistrali import podstawa_wartosci_katalogowej
from application.analyses.swz.werdykt import AparatZabezpieczajacy, SwzResult, SwzStatus, ocen_swz
from application.proof_engine.lv_circuit_verification_binding import (
    resolve_urzadzenie_ochronne,
    zbuduj_wejscie_dowodu_obwodu_nn,
)
from application.proof_engine.packs.lv_circuit_verification import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    LVCircuitVerificationInput,
    SpadekOdcinkaTrasy,
    StratyOdcinka,
    UrzadzenieOchronneNn,
    WynikSwzKroku,
    krok_dobor_zabezpieczenia,
    krok_moc_pozorna,
    krok_napiecie_w_punkcie,
    krok_obciazalnosc,
    krok_prad_obliczeniowy,
    krok_prad_zadzialania,
    krok_prad_zwarcia_min,
    krok_spadek_napiecia_trasy,
    krok_straty,
    krok_swz,
    krok_wytrzymalosc_cieplna,
    krok_zdolnosc_wylaczania,
)
from application.proof_engine.types import ProofStep, ProofValue
from enm.canonical_analysis import (
    ODMOWY_OBLICZENIA_BIEGU,
    CanonicalRun,
    bieg_wariantu,
    build_branch_results,
    build_bus_results,
    list_runs_for_case,
    wykonaj_bieg_w_pamieci,
)
from enm.hash import compute_enm_hash
from enm.katalog_projektu import katalog_dla_modelu
from enm.models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.nazwy_elementow import nazwa_elementu
from enm.scenariusze import (
    SCENARIUSZ_NORMALNY,
    EffectiveNetworkSnapshot,
    OperatingScenario,
    RodzajScenariusza,
    ZamianaKatalogu,
    apply_scenario,
)
from network_model.catalog import lv_ampacity_iec60364_5_52 as tablice_nn
from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import LVCableType
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import ka_na_a, km_na_m, kv_na_v, mw_na_w
from network_model.pochodne.pasma_napieciowe import w_pasmie_nn
from network_model.solvers.conductor_thermal_withstand import ConductorThermalResult
from network_model.solvers.protection_lv_curves import (
    GwarancjaNormy,
    compute_mcb_magnetic_point,
    compute_mccb_point,
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    format_liczba,
    ocen_kryterium,
)

#: Wersja składania obliczeń obiektu kabla (nagłówek dowodu).
WERSJA_OBLICZEN_KABLA_NN = "kabel-nn-1.0"
#: Przedrostek identyfikatorów kroków szczegółu wiersza (dokument pakietu ma „LVCV").
PRZEDROSTEK_KROKU_KABLA = "KNN"
#: Przestrzeń katalogu kabli nN (warianty przekroju).
PRZESTRZEN_KABLI_NN = "KABEL_NN"

# Identyfikatory kryteriów (rekordy K) — stabilne.
K_OBCIAZALNOSC = "kabel_nn.obciazalnosc"
K_POKRYCIE_OBCIAZENIA = "kabel_nn.pokrycie_obciazenia"
K_DOBOR_ZABEZPIECZENIA = "kabel_nn.dobor_zabezpieczenia"
K_PRAD_ZADZIALANIA = "kabel_nn.prad_zadzialania"
K_ZDOLNOSC_WYLACZANIA = "kabel_nn.zdolnosc_wylaczania"
K_WYTRZYMALOSC_CIEPLNA = "kabel_nn.wytrzymalosc_cieplna"
K_SPADEK_NAPIECIA = "kabel_nn.spadek_napiecia"
K_SWZ = "kabel_nn.samoczynne_wylaczenie"

#: Kolejność kryteriów w odpowiedzi (stała — determinizm, ta sama kolejność w tabeli wariantów).
KOLEJNOSC_KRYTERIOW: tuple[str, ...] = (
    K_OBCIAZALNOSC,
    K_POKRYCIE_OBCIAZENIA,
    K_DOBOR_ZABEZPIECZENIA,
    K_PRAD_ZADZIALANIA,
    K_ZDOLNOSC_WYLACZANIA,
    K_WYTRZYMALOSC_CIEPLNA,
    K_SPADEK_NAPIECIA,
    K_SWZ,
)

#: Kryteria zależne od PRZEKROJU kabla — tylko one rozstrzygają rekomendację doboru.
#: Pokrycie obciążenia (In ≥ Ib) i zdolność wyłączania (Icu ≥ Ik″max w miejscu zabudowy
#: aparatu) zależą od aparatu i od sieci przed kablem, nie od przekroju: żaden przekrój ich
#: nie naprawi, więc nie mogą blokować wyboru przekroju (tabela wariantów nadal je pokazuje).
KRYTERIA_ZALEZNE_OD_PRZEKROJU: frozenset[str] = frozenset(
    {
        K_OBCIAZALNOSC,
        K_DOBOR_ZABEZPIECZENIA,
        K_PRAD_ZADZIALANIA,
        K_WYTRZYMALOSC_CIEPLNA,
        K_SPADEK_NAPIECIA,
        K_SWZ,
    }
)

#: Zdolności w rejestrze dowodowym (`solver_input.provenance`).
ZDOLNOSC_ROZPLYWU = "kabel_nn.obliczenia_rozplywu"
ZDOLNOSC_ZWARC = "kabel_nn.obliczenia_zwarciowe"

#: Zaokrąglenie wartości rekordów — determinizm zapisu.
_ZAOKR = 6

_PODSTAWA_433 = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=(
        "PN-HD 60364-4-43 Instalacje elektryczne niskiego napięcia — Ochrona dla zapewnienia "
        "bezpieczeństwa — Ochrona przed prądem przetężeniowym"
    ),
    wydanie="2012",
    jednostka_redakcyjna="433.1 (koordynacja przewodów i zabezpieczeń przeciążeniowych)",
    status="WSKAZANE",
)
_PODSTAWA_4345_1 = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=_PODSTAWA_433.dokument,
    wydanie="2012",
    jednostka_redakcyjna="434.5.1 (zdolność wyłączania zabezpieczenia zwarciowego)",
    status="WSKAZANE",
)
_PODSTAWA_4345_2 = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=_PODSTAWA_433.dokument,
    wydanie="2012",
    jednostka_redakcyjna="434.5.2 (czas wyłączenia zwarcia a wytrzymałość cieplna przewodu)",
    status="WSKAZANE",
)
_PODSTAWA_SWZ = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=(
        "PN-HD 60364-4-41 Instalacje elektryczne niskiego napięcia — Ochrona dla zapewnienia "
        "bezpieczeństwa — Ochrona przed porażeniem elektrycznym"
    ),
    wydanie="2017",
    jednostka_redakcyjna="411.3.2 i tablica 41.1 (samoczynne wyłączenie zasilania)",
    status="WSKAZANE",
)
_PODSTAWA_SPADKU = PodstawaWymagania(
    rodzaj=KRYTERIUM_SPADKU_OBWODU_NN_RODZAJ_PODSTAWY,
    dokument=KRYTERIUM_SPADKU_OBWODU_NN_DOKUMENT_PL,
    wydanie=KRYTERIUM_SPADKU_OBWODU_NN_WYDANIE,
    jednostka_redakcyjna=KRYTERIUM_SPADKU_OBWODU_NN_JEDNOSTKA_REDAKCYJNA,
    status=KRYTERIUM_SPADKU_OBWODU_NN_STAN_ZRODLA,
)
_NIEPEWNOSC_POROWNANIA = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "porównanie wyniku solvera z wartością graniczną — niepewność numeryczna solvera "
        "nie jest szacowana"
    ),
)

#: Opisy rodzajów aparatu (tekst dla projektanta, nie kod).
_RODZAJ_APARATU_PL: dict[str, str] = {
    KIND_MCB: "wyłącznik nadprądowy (MCB)",
    KIND_FUSE_SWITCH: "rozłącznik bezpiecznikowy z wkładką gG",
    KIND_MCCB: "wyłącznik z wyzwalaczem elektronicznym (MCCB)",
}


def _r(wartosc: float) -> float:
    return round(float(wartosc), _ZAOKR)


# =============================================================================
# Obwód kabla — topologia (stacja, transformator, trasa, zabezpieczenie)
# =============================================================================


@dataclass(frozen=True)
class ObwodKablaNn:
    """Kabel nN w obwodzie: stacja i transformator zasilający, trasa i zabezpieczenie."""

    kabel: Cable
    station: Substation
    trafo: Transformer
    #: Trasa od zacisku nN transformatora do szyny końca kabla (ostatnia gałąź = kabel).
    sciezka: LvBusPath
    #: Szyna początku odcinka (strona zasilania) i szyna końca (strona odbioru).
    szyna_poczatku: str
    szyna_konca: str
    #: Najbliższy aparat zabezpieczający NA TRASIE ZASILANIA kabla (przed kablem).
    aparat: SwitchBranch | FuseBranch | None
    #: Korpus rozłącznika bezpiecznikowego tuż przed wkładką (prąd warunkowy kombinacji).
    aparat_korpus: SwitchBranch | FuseBranch | None
    #: Szyna zabudowy aparatu od strony zasilania (punkt oceny zdolności wyłączania).
    szyna_aparatu: str | None


def _odmowa(status: str, reason_pl: str, missing: list[str] | None = None) -> dict[str, Any]:
    return {"status": status, "reason_pl": reason_pl, "missing_data": list(missing or [])}


def _szyny_trasy(start: str, sciezka: LvBusPath) -> list[str]:
    """Kolejne szyny trasy (od korzenia), dla wyznaczenia szyny zabudowy aparatu."""
    szyny = [start]
    for galaz in sciezka.branches:
        szyny.append(galaz.to_bus_ref if galaz.from_bus_ref == szyny[-1] else galaz.from_bus_ref)
    return szyny


def _jest_korpusem_rozlacznika(galaz: object) -> bool:
    if not isinstance(galaz, SwitchBranch | FuseBranch):
        return False
    params = galaz.materialized_params if isinstance(galaz.materialized_params, dict) else {}
    return (
        galaz.catalog_namespace == "APARAT_NN"
        and params.get("device_kind") == "ROZLACZNIK_BEZPIECZNIKOWY"
    )


def lokalizuj_obwod_kabla_nn(
    enm: EnergyNetworkModel, cable_ref: str
) -> tuple[ObwodKablaNn | None, dict[str, Any] | None]:
    """Znajdź obwód kabla nN: stację i transformator zasilający, trasę i zabezpieczenie.

    Kabel nN = gałąź ``cable`` o obu końcach w paśmie nN. Transformator zasilający =
    właściciel szyny końca kabla (najmniej hopów po zamkniętych gałęziach,
    `assign_station_lv_buses`) wśród transformatorów stacji o stronie dolnej w paśmie nN;
    trasa właściciela MUSI kończyć się tym kablem (inaczej kabel nie jest zasilany od tej
    strony). Zabezpieczenie = najbliższy aparat (łącznik/wyłącznik/bezpiecznik) na trasie
    PRZED kablem — to on wyłącza zwarcie w kablu i chroni go przed przeciążeniem.
    """
    galaz = next((b for b in enm.branches if b.ref_id == cable_ref), None)
    if galaz is None:
        return None, _odmowa("brak danych", "Wskazany odcinek nie istnieje w modelu sieci.")
    if not isinstance(galaz, Cable):
        return None, _odmowa(
            "nie dotyczy", "Obliczenia odcinka kabla nN dotyczą wyłącznie gałęzi kablowych."
        )
    napiecia = {b.ref_id: b.voltage_kv for b in enm.buses}
    if not (
        w_pasmie_nn(napiecia.get(galaz.from_bus_ref))
        and w_pasmie_nn(napiecia.get(galaz.to_bus_ref))
    ):
        return None, _odmowa(
            "nie dotyczy",
            "Kabel nie leży w paśmie nN — odcinki SN ocenia dobór przekroju magistrali SN.",
        )

    kandydaci: list[tuple[int, str, Substation, Transformer, LvBusPath]] = []
    for stacja in sorted(enm.substations, key=lambda s: s.ref_id):
        transformatory = [
            t for t in station_transformers(enm, stacja) if odmowa_pasma_nn({}, t) is None
        ]
        if not transformatory:
            continue
        przypisanie = assign_station_lv_buses(enm, transformatory)
        for koniec in (galaz.from_bus_ref, galaz.to_bus_ref):
            wlasciciel = przypisanie.owner_by_bus.get(koniec)
            if wlasciciel is None:
                continue
            sciezka = przypisanie.paths_by_transformer[wlasciciel][koniec]
            if sciezka.branches and sciezka.branches[-1].ref_id == cable_ref:
                trafo = next(t for t in transformatory if t.ref_id == wlasciciel)
                kandydaci.append((sciezka.hop_count, stacja.ref_id, stacja, trafo, sciezka))
    if not kandydaci:
        return None, _odmowa(
            "brak danych",
            (
                f"Kabel „{nazwa_elementu(galaz, 'branches')}” nie jest zasilany z żadnej stacji "
                "SN/nN w aktywnej topologii — sprawdź stany łączników i połączenie z szyną nN "
                "transformatora."
            ),
            ["route"],
        )
    _hops, _ref, stacja, trafo, sciezka = min(kandydaci, key=lambda k: (k[0], k[1]))
    szyny = _szyny_trasy(trafo.lv_bus_ref, sciezka)
    szyna_konca = szyny[-1]
    szyna_poczatku = szyny[-2]

    aparat: SwitchBranch | FuseBranch | None = None
    korpus: SwitchBranch | FuseBranch | None = None
    szyna_aparatu: str | None = None
    for indeks in range(len(sciezka.branches) - 2, -1, -1):
        kandydat = sciezka.branches[indeks]
        if isinstance(kandydat, SwitchBranch | FuseBranch) and kandydat.type in TYPY_APARATU:
            aparat = kandydat
            szyna_aparatu = szyny[indeks]
            if (
                isinstance(kandydat, FuseBranch)
                and indeks > 0
                and _jest_korpusem_rozlacznika(sciezka.branches[indeks - 1])
            ):
                poprzedni = sciezka.branches[indeks - 1]
                assert isinstance(poprzedni, SwitchBranch | FuseBranch)
                korpus = poprzedni
            break
    return (
        ObwodKablaNn(
            kabel=galaz,
            station=stacja,
            trafo=trafo,
            sciezka=sciezka,
            szyna_poczatku=szyna_poczatku,
            szyna_konca=szyna_konca,
            aparat=aparat,
            aparat_korpus=korpus,
            szyna_aparatu=szyna_aparatu,
        ),
        None,
    )


# =============================================================================
# Biegi bazowe i biegi na bieżącym modelu
# =============================================================================


@dataclass(frozen=True)
class BiegiBazowe:
    """Ostatnie zakończone biegi przypadku w stanie normalnym — źródło OPCJI i tożsamości."""

    rozplyw: CanonicalRun | None
    zwarcie: CanonicalRun | None

    @property
    def brakujace(self) -> list[str]:
        braki: list[str] = []
        if self.rozplyw is None:
            braki.append("LOAD_FLOW")
        if self.zwarcie is None:
            braki.append("SC_3F")
        return braki


def _bieg_stanu_normalnego(run: CanonicalRun) -> bool:
    koperta = run.koperta
    return koperta is None or koperta.scenario_ref is None


def biegi_bazowe_przypadku(case_id: str) -> BiegiBazowe:
    """Najnowsze ZAKOŃCZONE biegi rozpływu i zwarć przypadku (stan normalny)."""
    biegi = list_runs_for_case(case_id)  # od najnowszego

    def _pierwszy(rodzaj: str) -> CanonicalRun | None:
        return next(
            (
                r
                for r in biegi
                if r.analysis_type == rodzaj
                and r.status == "FINISHED"
                and _bieg_stanu_normalnego(r)
            ),
            None,
        )

    return BiegiBazowe(rozplyw=_pierwszy("PF"), zwarcie=_pierwszy("short_circuit_sn"))


def _opcje_zwarcia_max(bazowe: dict[str, Any], czas_s: float | None) -> dict[str, Any]:
    """Opcje biegu zwarciowego obiektu: 3F, scenariusz MAX, c z pasma węzła, wszystkie węzły.

    Z opcji bazowych zostają wyłącznie te, które nie zmieniają pytania (konfiguracja audytu
    2 stacji, tryb wkładów); rodzaj zwarcia, scenariusz, płaskie c i lokalizacja są ustalone,
    bo kryteria kabla pytają o Ik″max 3F we WSZYSTKICH punktach obwodu.
    """
    opcje = {
        k: v
        for k, v in bazowe.items()
        if k not in ("fault_type", "short_circuit_type", "scenario", "c_factor", "location")
    }
    opcje["fault_type"] = "3F"
    opcje["scenario"] = "max"
    if czas_s is not None:
        opcje["thermal_time_seconds"] = czas_s
    return opcje


def _wykonaj_wariant(
    bazowy: CanonicalRun,
    migawka: EffectiveNetworkSnapshot,
    analysis_type: str,
    options: dict[str, Any] | None,
    uow_factory: Callable[[], Any] | None,
) -> tuple[CanonicalRun | None, str | None]:
    bieg = bieg_wariantu(bazowy, migawka, analysis_type=analysis_type, options=options)
    try:
        wykonaj_bieg_w_pamieci(bieg, uow_factory=uow_factory)
    except ODMOWY_OBLICZENIA_BIEGU as exc:
        return None, str(exc)
    return bieg, None


def _wiersz_galezi(run: CanonicalRun, ref: str) -> dict[str, Any] | None:
    for row in build_branch_results(run).get("rows", []):
        if (row.get("element_id") or row.get("branch_id")) == ref:
            return dict(row)
    return None


def _napiecie_szyny_kv(run: CanonicalRun, bus_ref: str) -> float | None:
    for row in build_bus_results(run).get("rows", []):
        if row.get("element_id") == bus_ref and row.get("u_kv") is not None:
            return float(row["u_kv"])
    return None


# =============================================================================
# Czas wyłączenia z charakterystyki normowej aparatu (dla I²t)
# =============================================================================


def czas_wylaczenia_aparatu(
    urzadzenie: UrzadzenieOchronneNn, prad_a: float
) -> tuple[float | None, str]:
    """Czas wyłączenia zwarcia o prądzie ``prad_a`` z charakterystyki NORMOWEJ aparatu.

    MCB: zadziałanie magnetyczne gwarantowane od górnej granicy pasma klasy — czas ≤ 0,1 s
    (IEC 60898-1); wewnątrz pasma norma nie gwarantuje czasu. MCCB: stopień wyzwalacza z
    rozwiązanych nastaw (`compute_mccb_point`). Wkładka gG: rejestr bramek nie zawiera
    bramki czasu krótszego niż umowny — czas nieustalony (zero interpolacji).
    """
    if urzadzenie.kind == KIND_MCB:
        assert urzadzenie.klasa_mcb is not None
        punkt = compute_mcb_magnetic_point(
            i_query_a=prad_a, in_a=urzadzenie.in_a, curve_class=urzadzenie.klasa_mcb
        )
        if punkt.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE and punkt.t_umowny_s:
            return punkt.t_umowny_s, punkt.podstawa_pl
        return None, punkt.podstawa_pl
    if urzadzenie.kind == KIND_MCCB:
        punkt_mccb = compute_mccb_point(
            i_query_a=prad_a,
            ir_a=urzadzenie.ir_a,
            isd_a=urzadzenie.isd_a,
            ii_a=urzadzenie.ii_a,
            tr_s=urzadzenie.tr_s,
            tsd_s=urzadzenie.tsd_s,
        )
        return punkt_mccb.t_wyzwolenia_s, punkt_mccb.podstawa_pl
    return None, (
        "Wkładka gG: rejestr bramek I-t normy IEC 60269-1 nie zawiera bramki dla czasów "
        "krótszych niż czas umowny — czas wyłączenia przy prądzie zwarcia nie jest wyznaczony "
        "bez danych producenta (zero interpolacji)."
    )


# =============================================================================
# Obliczenia obiektu — jeden komplet wielkości
# =============================================================================


@dataclass(frozen=True)
class WielkosciKabla:
    """Komplet wielkości obiektu kabla policzonych na jednej migawce modelu."""

    obwod: ObwodKablaNn
    enm: EnergyNetworkModel
    typ_kabla: LVCableType | None
    # Obciążalność
    iz_katalogowe_a: float | None
    iz_prime_a: float | None
    iz_powod_pl: str | None
    wspolczynniki_niepoprawne_pl: str | None
    # Rozpływ
    rozplyw_blad_pl: str | None
    p_mw: float | None
    q_mvar: float | None
    u_poczatku_kv: float | None
    u_zrodla_kv: float | None
    ib_a: float | None
    spadki: tuple[SpadekOdcinkaTrasy, ...]
    spadek_odcinka_kv: float | None
    spadek_odcinka_procent: float | None
    spadek_blad_pl: str | None
    straty: StratyOdcinka | None
    # Zwarcia
    zwarcie_blad_pl: str | None
    ik_aparatu_ka: float | None
    ik_poczatku_ka: float | None
    ik_konca_ka: float | None
    ith_poczatku_ka: float | None
    # Zabezpieczenie
    urzadzenie: UrzadzenieOchronneNn | None
    urzadzenie_powod_pl: str | None
    czas_wylaczenia_s: float | None
    czas_wylaczenia_opis_pl: str | None
    thermal: ConductorThermalResult | None
    # Pętla zwarcia i SWZ
    petla: Any | None
    petla_powod_pl: str | None
    petla_kod_odmowy: str | None
    swz: SwzResult | None
    # Biegi
    bazowe: BiegiBazowe


def _iz_kabla(cable: Cable) -> tuple[float | None, float | None, str | None, str | None]:
    iz = iz_prime_dla_kabla(cable)
    _wsp, blad = wspolczynniki_ulozenia_kabla(cable)
    return iz.get("iz_katalogowe_a"), iz.get("iz_prime_a"), iz.get("reason_pl"), blad


def policz_wielkosci_kabla(
    enm_bazowy: EnergyNetworkModel,
    cable_ref: str,
    *,
    bazowe: BiegiBazowe,
    katalog: CatalogRepository,
    uow_factory: Callable[[], Any] | None = None,
    scenariusz: OperatingScenario = SCENARIUSZ_NORMALNY,
) -> tuple[WielkosciKabla | None, dict[str, Any] | None]:
    """Policz wszystkie wielkości obiektu kabla na migawce ``apply_scenario(enm, scenariusz)``.

    Brak biegu bazowego nie zatrzymuje obliczeń, które go nie potrzebują (obciążalność,
    pętla zwarcia, SWZ) — wielkości zależne od biegu dostają nazwany brak.
    """
    migawka = apply_scenario(enm_bazowy, scenariusz)
    enm = (
        enm_bazowy
        if migawka.tozsama_z_baza
        else EnergyNetworkModel.model_validate(migawka.snapshot)
    )
    obwod, odmowa = lokalizuj_obwod_kabla_nn(enm, cable_ref)
    if obwod is None:
        return None, odmowa
    kabel = obwod.kabel
    typ_kabla = katalog.get_lv_cable_type(kabel.catalog_ref) if kabel.catalog_ref else None
    iz_kat, iz_prime, iz_powod, wsp_blad = _iz_kabla(kabel)

    # --- Rozpływ mocy na bieżącej migawce -------------------------------------------
    rozplyw_blad: str | None = None
    p_mw = q_mvar = u_poczatku = u_zrodla = ib_a = None
    spadki: tuple[SpadekOdcinkaTrasy, ...] = ()
    spadek_odc_kv = spadek_odc_pct = None
    spadek_blad: str | None = None
    straty: StratyOdcinka | None = None
    if bazowe.rozplyw is None:
        rozplyw_blad = "brak zakończonego biegu rozpływu mocy w przypadku obliczeniowym"
    else:
        pf, blad = _wykonaj_wariant(bazowe.rozplyw, migawka, "PF", None, uow_factory)
        if pf is None:
            rozplyw_blad = f"rozpływ mocy na bieżącym modelu nie dał wyniku: {blad}"
        elif not bool(((pf.raw_result or {}).get("result_v1") or {}).get("converged", False)):
            rozplyw_blad = "rozpływ mocy na bieżącym modelu nie zbiegł się"
        else:
            zacisk = zacisk_od_strony_rozdzielnicy(
                obwod.sciezka, obwod.trafo.lv_bus_ref, kabel.ref_id
            )
            wiersz = _wiersz_galezi(pf, kabel.ref_id)
            u_poczatku = _napiecie_szyny_kv(pf, obwod.szyna_poczatku)
            u_zrodla = _napiecie_szyny_kv(pf, obwod.trafo.lv_bus_ref)
            if wiersz is None or zacisk is None or u_poczatku is None:
                rozplyw_blad = (
                    "wynik rozpływu nie zawiera mocy zacisku odcinka albo napięcia szyny "
                    "początku odcinka"
                )
            else:
                od = zacisk == "od"
                p_mw = float(wiersz["p_mw"] if od else wiersz["p_to_mw"])
                q_mvar = float(wiersz["q_mvar"] if od else wiersz["q_to_mvar"])
                _krok, s_mva = krok_moc_pozorna(p_mw, q_mvar, 1, PRZEDROSTEK_KROKU_KABLA)
                _krok2, ib_a = krok_prad_obliczeniowy(s_mva, u_poczatku, 2, PRZEDROSTEK_KROKU_KABLA)
                straty = StratyOdcinka(
                    p_od_mw=float(wiersz["p_mw"]),
                    p_do_mw=float(wiersz["p_to_mw"]),
                    straty_mw=float(wiersz["losses_p_mw"]),
                )
                du = delta_u_dla_trasy(pf, obwod.sciezka.branches, obwod.szyna_konca)
                if du["status"] != "OK":
                    spadek_blad = du["reason_pl"]
                else:
                    nazwy = {b.ref_id: nazwa_elementu(b, "branches") for b in enm.branches}
                    odcinkowe = du["wartosc"]["odcinkowe"]
                    if any(
                        o["delta_u_kv"] is None or o["delta_u_percent"] is None for o in odcinkowe
                    ):
                        spadek_blad = (
                            "dekompozycja spadku napięcia biegu rozpływu nie podaje spadku "
                            "każdego odcinka trasy"
                        )
                    else:
                        spadki = tuple(
                            SpadekOdcinkaTrasy(
                                nazwa=nazwy.get(o["branch_ref"], o["branch_ref"]),
                                delta_u_kv=float(o["delta_u_kv"]),
                                delta_u_percent=float(o["delta_u_percent"]),
                            )
                            for o in odcinkowe
                        )
                        wlasny = next(
                            (o for o in odcinkowe if o["branch_ref"] == kabel.ref_id), None
                        )
                        if wlasny is not None:
                            spadek_odc_kv = float(wlasny["delta_u_kv"])
                            spadek_odc_pct = float(wlasny["delta_u_percent"])

    # --- Zabezpieczenie ---------------------------------------------------------------
    urzadzenie: UrzadzenieOchronneNn | None = None
    urzadzenie_powod: str | None
    if obwod.aparat is None:
        urzadzenie_powod = (
            "na trasie zasilania odcinka nie ma aparatu zabezpieczającego (wyłącznik, "
            "rozłącznik bezpiecznikowy albo bezpiecznik przed kablem)"
        )
    else:
        urzadzenie, urzadzenie_powod = resolve_urzadzenie_ochronne(
            obwod.aparat, apparatus_branch=obwod.aparat_korpus
        )

    # --- Zwarcia na bieżącej migawce ----------------------------------------------------
    zwarcie_blad: str | None = None
    ik_aparatu = ik_poczatku = ik_konca = ith_poczatku = None
    czas_s: float | None = None
    czas_opis: str | None = None
    if bazowe.zwarcie is None:
        zwarcie_blad = "brak zakończonego biegu zwarciowego w przypadku obliczeniowym"
    else:
        sc, blad = _wykonaj_wariant(
            bazowe.zwarcie,
            migawka,
            "short_circuit_sn",
            _opcje_zwarcia_max(bazowe.zwarcie.options, None),
            uow_factory,
        )
        if sc is None:
            zwarcie_blad = f"obliczenie zwarciowe na bieżącym modelu nie dało wyniku: {blad}"
        else:
            if obwod.szyna_aparatu is not None:
                ik_aparatu, _ = ik_z_biegu_zwarciowego(sc, obwod.szyna_aparatu)
            ik_poczatku, _ = ik_z_biegu_zwarciowego(sc, obwod.szyna_poczatku)
            ik_konca, _ = ik_z_biegu_zwarciowego(sc, obwod.szyna_konca)
            if urzadzenie is not None and ik_poczatku is not None:
                czas_s, czas_opis = czas_wylaczenia_aparatu(urzadzenie, ka_na_a(ik_poczatku))
            if czas_s is not None:
                sc_t, blad_t = _wykonaj_wariant(
                    bazowe.zwarcie,
                    migawka,
                    "short_circuit_sn",
                    _opcje_zwarcia_max(bazowe.zwarcie.options, czas_s),
                    uow_factory,
                )
                if sc_t is None:
                    zwarcie_blad = f"prąd cieplny Ith dla czasu wyłączenia: {blad_t}"
                else:
                    _ik, ith_poczatku = ik_z_biegu_zwarciowego(sc_t, obwod.szyna_poczatku)

    thermal: ConductorThermalResult | None = None
    if ith_poczatku is not None and czas_s is not None:
        thermal = wytrzymalosc_cieplna_kabla(kabel, ith_a=ka_na_a(ith_poczatku), czas_s=czas_s)

    # --- Pętla zwarcia i SWZ na końcu odcinka -------------------------------------------
    petla, _braki, petla_powod, petla_kod = petla_zwarcia_min_w_punkcie(
        enm, obwod.station.ref_id, obwod.szyna_konca
    )
    if petla is None and petla_powod is None:
        petla_powod = "dane pętli zwarcia niekompletne: " + ", ".join(_braki)
    swz: SwzResult | None = None
    if petla is not None and urzadzenie is not None:
        swz = ocen_swz(
            ik1_min_a=petla.fault_loop.ik_min_a,
            u0_v=petla.u0_v,
            aparat=AparatZabezpieczajacy(
                typ=(
                    "MCB"
                    if urzadzenie.kind == KIND_MCB
                    else ("WKLADKA_GG" if urzadzenie.kind == KIND_FUSE_SWITCH else KIND_MCCB)
                ),
                in_a=urzadzenie.in_a,
                klasa_mcb=urzadzenie.klasa_mcb,
                ii_a=urzadzenie.ii_a if urzadzenie.kind == KIND_MCCB else None,
            ),
        )

    return (
        WielkosciKabla(
            obwod=obwod,
            enm=enm,
            typ_kabla=typ_kabla,
            iz_katalogowe_a=iz_kat,
            iz_prime_a=iz_prime,
            iz_powod_pl=iz_powod,
            wspolczynniki_niepoprawne_pl=wsp_blad,
            rozplyw_blad_pl=rozplyw_blad,
            p_mw=p_mw,
            q_mvar=q_mvar,
            u_poczatku_kv=u_poczatku,
            u_zrodla_kv=u_zrodla,
            ib_a=ib_a,
            spadki=spadki,
            spadek_odcinka_kv=spadek_odc_kv,
            spadek_odcinka_procent=spadek_odc_pct,
            spadek_blad_pl=spadek_blad,
            straty=straty,
            zwarcie_blad_pl=zwarcie_blad,
            ik_aparatu_ka=ik_aparatu,
            ik_poczatku_ka=ik_poczatku,
            ik_konca_ka=ik_konca,
            ith_poczatku_ka=ith_poczatku,
            urzadzenie=urzadzenie,
            urzadzenie_powod_pl=urzadzenie_powod,
            czas_wylaczenia_s=czas_s,
            czas_wylaczenia_opis_pl=czas_opis,
            thermal=thermal,
            petla=petla,
            petla_powod_pl=petla_powod,
            petla_kod_odmowy=petla_kod,
            swz=swz,
            bazowe=bazowe,
        ),
        None,
    )


# =============================================================================
# Szczegół na żądanie — kroki pakietu dowodowego w kontrakcie ekranu
# =============================================================================


def _bez_ogranicznikow(latex: str) -> str:
    """Zapis LaTeX bez ograniczników ``$$`` (konwencja pól ``*_latex``)."""
    czesci = [c.strip() for c in latex.strip().split("$$") if c.strip()]
    return r" \\ ".join(czesci)


def _wartosc_pv(pv: ProofValue) -> dict[str, Any]:
    if isinstance(pv.value, str):
        return {"wartosc": None, "wartosc_pl": pv.value, "jednostka": pv.unit}
    if isinstance(pv.value, complex):
        return {"wartosc": None, "wartosc_pl": pv.formatted, "jednostka": pv.unit}
    return {"wartosc": _r(pv.value), "wartosc_pl": None, "jednostka": pv.unit}


def krok_w_kontrakcie(krok: ProofStep) -> dict[str, Any]:
    """Krok śladu: wzór → parametry → podstawienie → wynik (pola ``*_latex`` bez ograniczników)."""
    opisy = {s.symbol: s.description_pl for s in krok.equation.symbols}
    return {
        "tytul_pl": krok.title_pl,
        "nazwa_wzoru_pl": krok.equation.name_pl,
        "podstawa_pl": krok.equation.standard_ref,
        "wzor_latex": krok.equation.latex,
        "parametry": [
            {"symbol_latex": pv.symbol, "opis_pl": opisy.get(pv.symbol), **_wartosc_pv(pv)}
            for pv in krok.input_values
        ],
        "podstawienie_latex": _bez_ogranicznikow(krok.substitution_latex),
        "wynik": {"symbol_latex": krok.result.symbol, **_wartosc_pv(krok.result)},
    }


# =============================================================================
# Rekordy kryteriów
# =============================================================================


def _przedmiot(w: WielkosciKabla) -> Przedmiot:
    kabel = w.obwod.kabel
    typ = w.typ_kabla.name if w.typ_kabla is not None else "bez typu z katalogu"
    return Przedmiot(
        element_ref=kabel.ref_id,
        nazwa_pl=nazwa_elementu(kabel, "branches"),
        opis_pl=(
            f"kabel nN {typ}, długość {format_liczba(_r(km_na_m(kabel.length_km)))} m, "
            f"zasilany z transformatora {nazwa_elementu(w.obwod.trafo, 'transformers')}"
        ),
    )


def _dowod(zdolnosc_id: str, dane: StatusDanych | None = None) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(zdolnosc_id)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=dane or StatusDanych(stan="ZWALIDOWANE"),
    )


def _podstawa_iz(w: WielkosciKabla) -> PodstawaWymagania:
    if w.typ_kabla is None:
        return PodstawaWymagania(
            rodzaj="KATALOG_PRODUCENTA",
            dokument="katalog kabli nN",
            status="NIEUSTALONE",
            uwagi_pl="kabel bez pozycji katalogu kabli nN — obciążalność bez rekordu źródłowego",
        )
    return podstawa_wartosci_katalogowej(w.typ_kabla, katalog_pl="katalog kabli nN")


def _zakres_ulozenia(
    w: WielkosciKabla, dziedzina: Literal["POWER_FLOW", "SHORT_CIRCUIT"]
) -> ZakresWaznosci:
    wsp, _blad = wspolczynniki_ulozenia_kabla(w.obwod.kabel)
    from application.proof_engine.packs.lv_circuit_verification import (
        opis_warunkow_ulozenia_pl,
    )

    return ZakresWaznosci(
        rodzaj_analizy=dziedzina,
        opis_pl=(
            f"Odcinek kabla nN w obwodzie od zacisków nN transformatora "
            f"{nazwa_elementu(w.obwod.trafo, 'transformers')}; warunki ułożenia: "
            f"{opis_warunkow_ulozenia_pl(wsp)}."
        ),
        wykluczenia=(
            "obciążenie cykliczne i przeciążenia krótkotrwałe",
            "harmoniczne prądu w przewodzie neutralnym",
        ),
    )


def _wynik(
    wielkosc_pl: str, symbol: str, wartosc: float | None, jednostka: str
) -> WynikKryterium | None:
    if wartosc is None:
        return None
    return WynikKryterium(
        wielkosc_pl=wielkosc_pl,
        symbol_latex=symbol,
        wartosc=Wielkosc(wartosc=_r(wartosc), jednostka=jednostka),
        metoda="OBLICZENIE",
    )


def _ocena(
    *,
    kryterium_id: str,
    w: WielkosciKabla,
    kryterium: Kryterium,
    podstawa: PodstawaWymagania,
    wynik: WynikKryterium | None,
    limit: LimitKryterium | None,
    zdolnosc: str,
    dziedzina: Literal["POWER_FLOW", "SHORT_CIRCUIT"],
    slad_pl: str,
    braki: list[str],
    dotyczy: bool = True,
    powod_stosowalnosci_pl: str = "każdy odcinek kabla nN obwodu odbiorczego podlega temu kryterium",
) -> OcenaKryterium:
    return ocen_kryterium(
        kryterium_id=kryterium_id,
        przedmiot=_przedmiot(w),
        kryterium=kryterium,
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(dotyczy=dotyczy, powod_pl=powod_stosowalnosci_pl),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_POROWNANIA,
        dowod=_dowod(zdolnosc),
        zakres_waznosci=_zakres_ulozenia(w, dziedzina),
        slad=(OdnosnikSladu(krok=f"{kryterium_id}:{w.obwod.kabel.ref_id}", opis_pl=slad_pl),),
        braki_dodatkowe=braki,
    )


def _brak_rozplywu(w: WielkosciKabla) -> list[str]:
    return [] if w.rozplyw_blad_pl is None else [f"prąd obliczeniowy Ib — {w.rozplyw_blad_pl}"]


def _brak_urzadzenia(w: WielkosciKabla) -> list[str]:
    return (
        []
        if w.urzadzenie is not None
        else [f"zabezpieczenie odcinka — {w.urzadzenie_powod_pl or 'aparat nierozpoznany'}"]
    )


_JEDNOSTKA_LATEX: dict[str, str] = {
    "A": r"\mathrm{A}",
    "kA": r"\mathrm{kA}",
    "A²s": r"\mathrm{A^{2}\,s}",
    "%": r"\%",
}

_RELACJA_LATEX: dict[str, str] = {"NIE_WIECEJ": r"\le", "NIE_MNIEJ": r"\ge"}


def _wielkosc_latex(wartosc: float, jednostka: str) -> str:
    jednostka_latex = _JEDNOSTKA_LATEX.get(jednostka) or r"\mathrm{" + jednostka + "}"
    return _liczba_latex(wartosc) + r"\;" + jednostka_latex


def sprawdzenie_z_rekordu(rekord: OcenaKryterium) -> str | None:
    """Podstawienie warunku kryterium liczbami z REKORDU (jedno źródło: wynik, relacja, limit).

    Gdy rekord nie ma wyniku, limitu z wartością albo relacji jednostronnej — ``None`` (nic do
    podstawienia; przyczynę niesie ocena techniczna wiersza).
    """
    wynik, limit = rekord.wynik, rekord.limit
    relacja = _RELACJA_LATEX.get(rekord.kryterium.relacja)
    if wynik is None or limit is None or limit.wartosc is None or relacja is None:
        return None
    return (
        f"{wynik.symbol_latex} = {_wielkosc_latex(wynik.wartosc.wartosc, wynik.wartosc.jednostka)}"
        f" {relacja} {_wielkosc_latex(limit.wartosc.wartosc, limit.wartosc.jednostka)}"
    )


def _oznaczenie_dokumentu(dokument: str) -> str:
    """Oznaczenie normy z pełnego tytułu: człony do pierwszego słowa tytułu („Instalacje")."""
    czlony: list[str] = []
    for czlon in dokument.split(" "):
        if len(czlon) > 1 and czlon[0].isupper() and czlon[1].islower():
            break
        czlony.append(czlon)
    return " ".join(czlony) if czlony else dokument


def norma_wiersza_pl(podstawa: PodstawaWymagania) -> str:
    """„PN-HD 60364-4-43:2012, 433.1 (…)" — oznaczenie, wydanie i jednostka redakcyjna."""
    oznaczenie = _oznaczenie_dokumentu(podstawa.dokument)
    if podstawa.wydanie:
        oznaczenie = f"{oznaczenie}:{podstawa.wydanie}"
    if podstawa.jednostka_redakcyjna:
        oznaczenie = f"{oznaczenie}, {podstawa.jednostka_redakcyjna}"
    return oznaczenie


def _wiersz(
    rekord: OcenaKryterium,
    braki: list[str],
    kroki: list[ProofStep],
) -> dict[str, Any]:
    """Wiersz kryterium: rekord werdyktu + odczyt techniczny marginesu + szczegół na żądanie."""
    dane = rekord.model_dump(mode="json")
    margines = rekord.margines
    if not rekord.stosowalnosc.dotyczy:
        ocena_pl, semantyka = f"nie dotyczy — {rekord.stosowalnosc.powod_pl}", "neutralna"
    elif (
        rekord.wynik is not None
        and rekord.limit is not None
        and margines is not None
        and margines.wartosc is not None
    ):
        wartosc = margines.wartosc.wartosc
        jednostka = margines.wartosc.jednostka
        if wartosc >= 0:
            ocena_pl = f"zapas {format_liczba(_r(wartosc))} {jednostka}"
            semantyka = "pozytywna"
        else:
            ocena_pl = f"przekroczenie o {format_liczba(_r(-wartosc))} {jednostka}"
            semantyka = "negatywna"
    else:
        # Pierwszy plan mówi o JEDNYM konkretnym brakującym parametrze tego obiektu (np.
        # „czas wyłączenia z charakterystyki aparatu"), a ogólne braki reguły K zostają w
        # wyjaśnieniu rekordu (szczegóły audytowe).
        wlasne = [b for b in braki if b]
        ogolne = list(rekord.wyjasnienie.czego_brakuje)
        brak = wlasne[0] if wlasne else (ogolne[0] if ogolne else "")
        ocena_pl = f"nie obliczono — {brak}" if brak else "nie obliczono"
        semantyka = "neutralna"
    return {
        "kryterium_id": rekord.kryterium_id,
        "rekord": dane,
        "norma_pl": norma_wiersza_pl(rekord.podstawa),
        "ocena_techniczna_pl": ocena_pl,
        "ocena_semantyka": semantyka,
        "sprawdzenie_latex": sprawdzenie_z_rekordu(rekord),
        "szczegoly": [krok_w_kontrakcie(k) for k in kroki],
    }


def _liczba_latex(wartosc: float) -> str:
    return format_liczba(_r(wartosc)).replace(",", "{,}")


def _kryteria(w: WielkosciKabla) -> list[dict[str, Any]]:
    wiersze: list[dict[str, Any]] = []
    iz_prime = w.iz_prime_a
    podstawa_iz = _podstawa_iz(w)
    braki_iz = (
        []
        if iz_prime is not None
        else [f"obciążalność Iz′ — {w.iz_powod_pl or 'brak obciążalności katalogowej kabla'}"]
    )

    # --- K1: Ib <= Iz' -------------------------------------------------------------------
    kroki_k1: list[ProofStep] = []
    if w.p_mw is not None and w.q_mvar is not None and w.u_poczatku_kv is not None:
        k1a, s_mva = krok_moc_pozorna(w.p_mw, w.q_mvar, 1, PRZEDROSTEK_KROKU_KABLA)
        k1b, _ib = krok_prad_obliczeniowy(s_mva, w.u_poczatku_kv, 2, PRZEDROSTEK_KROKU_KABLA)
        kroki_k1 += [k1a, k1b]
    wsp, _ = wspolczynniki_ulozenia_kabla(w.obwod.kabel)
    if w.iz_katalogowe_a is not None and iz_prime is not None:
        k1c, _iz = krok_obciazalnosc(
            w.iz_katalogowe_a, wsp, len(kroki_k1) + 1, PRZEDROSTEK_KROKU_KABLA
        )
        kroki_k1.append(k1c)
    braki_wiersza = _brak_rozplywu(w) + braki_iz
    rekord = _ocena(
        kryterium_id=K_OBCIAZALNOSC,
        w=w,
        kryterium=Kryterium(
            opis_pl="Prąd obliczeniowy odcinka nie przekracza obciążalności po korektach",
            warunek_latex=r"I_B \le I_z'",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_433,
        wynik=_wynik("prąd obliczeniowy odcinka z rozpływu mocy", "I_B", w.ib_a, "A"),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(iz_prime), jednostka="A"),
                podstawa=podstawa_iz,
                zakres_stosowalnosci_pl="obciążalność długotrwała typu kabla po współczynnikach "
                "poprawkowych warunków ułożenia",
            )
            if iz_prime is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ROZPLYWU,
        dziedzina="POWER_FLOW",
        slad_pl="Ib z mocy zacisku odcinka od strony zasilania (rozpływ), Iz′ = Iz·f",
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k1,
        )
    )

    # --- K2: Ib <= In (pokrycie obciążenia) i In <= Iz' (ochrona przewodu) ------------------
    # Warunek podwójny Ib ≤ In ≤ Iz′ (§433.1) jako DWA rekordy jednostronne: pasmo [Ib; Iz′]
    # bywa puste (Ib > Iz′ — przekrój za mały dla obciążenia), a rekord pasma pustego nie ma
    # postaci; dwie nierówności mają zawsze sens i każda mówi, z której strony jest problem.
    kroki_k2: list[ProofStep] = []
    if w.urzadzenie is not None and w.ib_a is not None and iz_prime is not None:
        k2, _ok = krok_dobor_zabezpieczenia(
            w.ib_a, w.urzadzenie, iz_prime, 1, PRZEDROSTEK_KROKU_KABLA
        )
        kroki_k2.append(k2)
    in_a = w.urzadzenie.in_a if w.urzadzenie is not None else None
    braki_wiersza = _brak_urzadzenia(w) + _brak_rozplywu(w)
    rekord = _ocena(
        kryterium_id=K_POKRYCIE_OBCIAZENIA,
        w=w,
        kryterium=Kryterium(
            opis_pl="Prąd znamionowy zabezpieczenia nie mniejszy niż prąd obliczeniowy odcinka",
            warunek_latex=r"I_n \ge I_B",
            relacja="NIE_MNIEJ",
        ),
        podstawa=_PODSTAWA_433,
        wynik=_wynik("prąd znamionowy zabezpieczenia", "I_n", in_a, "A"),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(w.ib_a), jednostka="A"),
                podstawa=_PODSTAWA_433,
                zakres_stosowalnosci_pl="prąd obliczeniowy odcinka z rozpływu mocy",
            )
            if w.ib_a is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ROZPLYWU,
        dziedzina="POWER_FLOW",
        slad_pl="In aparatu zainstalowanego (katalog) wobec Ib z rozpływu",
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k2,
        )
    )
    braki_wiersza = _brak_urzadzenia(w) + braki_iz
    rekord = _ocena(
        kryterium_id=K_DOBOR_ZABEZPIECZENIA,
        w=w,
        kryterium=Kryterium(
            opis_pl="Prąd znamionowy zabezpieczenia nie większy niż obciążalność przewodu",
            warunek_latex=r"I_n \le I_z'",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_433,
        wynik=_wynik("prąd znamionowy zabezpieczenia", "I_n", in_a, "A"),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(iz_prime), jednostka="A"),
                podstawa=podstawa_iz,
                zakres_stosowalnosci_pl="obciążalność po współczynnikach poprawkowych",
            )
            if iz_prime is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ROZPLYWU,
        dziedzina="POWER_FLOW",
        slad_pl="In aparatu zainstalowanego (katalog) wobec Iz′",
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k2,
        )
    )

    # --- K3: I2 <= 1,45 Iz' ----------------------------------------------------------------
    kroki_k3: list[ProofStep] = []
    i2_a: float | None = None
    limit_i2: float | None = None
    braki_i2: list[str] = []
    if w.urzadzenie is not None and iz_prime is not None:
        kr = kryterium_i2(kandydat=kandydat_z_urzadzenia(w.urzadzenie), iz_prime_a=iz_prime)
        i2_a = kr.wartosci.get("i2_a")
        limit_i2 = kr.wartosci.get("limit_a")
        if i2_a is None:
            braki_i2.append(f"próg zadziałania I2 — {kr.uzasadnienie_pl}")
        k3, _ = krok_prad_zadzialania(
            i2_a,
            str(kr.wartosci.get("zrodlo") or "próg nierozstrzygalny"),
            kr.uzasadnienie_pl,
            iz_prime,
            1,
            PRZEDROSTEK_KROKU_KABLA,
        )
        kroki_k3.append(k3)
    braki_wiersza = _brak_urzadzenia(w) + braki_iz + braki_i2
    rekord = _ocena(
        kryterium_id=K_PRAD_ZADZIALANIA,
        w=w,
        kryterium=Kryterium(
            opis_pl="Prąd zadziałania zabezpieczenia nie przekracza 1,45 obciążalności przewodu",
            warunek_latex=r"I_2 \le 1{,}45 \cdot I_z'",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_433,
        wynik=_wynik("prąd gwarantowanego zadziałania zabezpieczenia", "I_2", i2_a, "A"),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(limit_i2), jednostka="A"),
                podstawa=podstawa_iz,
                zakres_stosowalnosci_pl="1,45 obciążalności po korektach",
            )
            if limit_i2 is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ROZPLYWU,
        dziedzina="POWER_FLOW",
        slad_pl="I2 z normy aparatu (MCB 1,45·In, gG If = 1,6·In, MCCB 1,3·Ir)",
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k3,
        )
    )

    # --- K4: zdolność wyłączania ---------------------------------------------------------
    kroki_k4: list[ProofStep] = []
    zdolnosc_ka: float | None = None
    podstawa_zdolnosci: PodstawaWymagania | None = None
    braki_k4: list[str] = []
    if w.urzadzenie is not None:
        u = w.urzadzenie
        zdolnosc_ka = (
            u.conditional_sc_current_ka if u.kind == KIND_FUSE_SWITCH else u.wlasna_zdolnosc_ka
        )
        if zdolnosc_ka is None:
            braki_k4.append(
                "zdolność wyłączania aparatu (Icn/Icu albo prąd warunkowy kombinacji) w katalogu"
            )
        typ_aparatu = _typ_katalogowy_aparatu(
            (
                w.obwod.aparat_korpus
                if u.kind == KIND_FUSE_SWITCH and w.obwod.aparat_korpus
                else w.obwod.aparat
            ),
            w,
        )
        podstawa_zdolnosci = (
            podstawa_wartosci_katalogowej(
                typ_aparatu,
                katalog_pl="katalog aparatury nN",
                wielkosc_pl="zdolność wyłączania",
                wielkosc_krotko_pl="zdolność wyłączania",
            )
            if typ_aparatu is not None
            else PodstawaWymagania(
                rodzaj="KATALOG_PRODUCENTA",
                dokument="katalog aparatury nN",
                status="NIEUSTALONE",
                uwagi_pl="aparat bez pozycji katalogu — zdolność wyłączania bez rekordu źródłowego",
            )
        )
        k4, _zd = krok_zdolnosc_wylaczania(u, w.ik_aparatu_ka, 1, PRZEDROSTEK_KROKU_KABLA)
        kroki_k4.append(k4)
    braki_zw = (
        [f"prąd zwarciowy Ik″max w miejscu zabudowy aparatu — {w.zwarcie_blad_pl}"]
        if w.zwarcie_blad_pl is not None and w.ik_aparatu_ka is None
        else []
    )
    braki_wiersza = _brak_urzadzenia(w) + braki_zw + braki_k4
    rekord = _ocena(
        kryterium_id=K_ZDOLNOSC_WYLACZANIA,
        w=w,
        kryterium=Kryterium(
            opis_pl="Zdolność wyłączania zabezpieczenia nie mniejsza niż prąd zwarciowy w miejscu "
            "zabudowy",
            warunek_latex=r"I''_{k,max} \le I_{cu}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_4345_1,
        wynik=_wynik(
            "prąd zwarciowy początkowy 3F w miejscu zabudowy aparatu",
            "I''_{k,max}",
            w.ik_aparatu_ka,
            "kA",
        ),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(zdolnosc_ka), jednostka="kA"),
                podstawa=podstawa_zdolnosci,
                zakres_stosowalnosci_pl="zdolność wyłączania aparatu albo kombinacji z wkładką",
            )
            if zdolnosc_ka is not None and podstawa_zdolnosci is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ZWARC,
        dziedzina="SHORT_CIRCUIT",
        slad_pl="Ik″max IEC 60909 (3F, c max) w szynie zabudowy aparatu",
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k4,
        )
    )

    # --- K5: I²t <= k²S² ------------------------------------------------------------------
    kroki_k5: list[ProofStep] = []
    braki_k5: list[str] = []
    th = w.thermal
    if th is not None:
        kroki_k5.append(krok_wytrzymalosc_cieplna(th, 1, PRZEDROSTEK_KROKU_KABLA))
        if th.status == "UNAVAILABLE":
            braki_k5.append(
                f"dane cieplne kabla — {th.decision_reason_pl or 'niekompletne dane typu kabla'}"
            )
    elif w.urzadzenie is None:
        braki_k5.append(
            "czas wyłączenia zwarcia — "
            + (w.urzadzenie_powod_pl or "zabezpieczenie odcinka nierozpoznane")
        )
    elif w.zwarcie_blad_pl is not None:
        braki_k5.append(f"prąd zwarciowy na początku odcinka — {w.zwarcie_blad_pl}")
    else:
        braki_k5.append(
            "czas wyłączenia zwarcia z charakterystyki aparatu — "
            + (w.czas_wylaczenia_opis_pl or "nieustalony")
        )
    braki_wiersza = braki_k5
    rekord = _ocena(
        kryterium_id=K_WYTRZYMALOSC_CIEPLNA,
        w=w,
        kryterium=Kryterium(
            opis_pl="Energia zwarcia na początku odcinka nie przekracza wytrzymałości cieplnej "
            "przewodu",
            warunek_latex=r"I^2 t \le k^2 S^2",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_4345_2,
        wynik=(
            _wynik("energia zwarciowa na początku odcinka", r"I^2 t", th.i2t_a2s, "A²s")
            if th is not None and th.i2t_a2s is not None
            else None
        ),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(th.i2t_admissible_a2s), jednostka="A²s"),
                podstawa=podstawa_iz,
                zakres_stosowalnosci_pl="wytrzymałość cieplna przewodu fazowego (k z karty typu)",
            )
            if th is not None and th.i2t_admissible_a2s is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ZWARC,
        dziedzina="SHORT_CIRCUIT",
        slad_pl=(
            "Ith IEC 60909 na początku odcinka przy czasie wyłączenia "
            + (
                f"{format_liczba(w.czas_wylaczenia_s)} s z charakterystyki aparatu"
                if w.czas_wylaczenia_s is not None
                else "nieustalonym"
            )
        ),
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k5,
        )
    )

    # --- K6: ΔU do końca odcinka ---------------------------------------------------------
    kroki_k6: list[ProofStep] = []
    du_pct: float | None = None
    if w.spadki:
        k6a, du_kv, du_pct = krok_spadek_napiecia_trasy(w.spadki, 1, PRZEDROSTEK_KROKU_KABLA)
        kroki_k6.append(k6a)
        if w.u_zrodla_kv is not None:
            k6b, _u = krok_napiecie_w_punkcie(
                w.u_zrodla_kv, du_kv, du_pct, 2, PRZEDROSTEK_KROKU_KABLA
            )
            kroki_k6.append(k6b)
    braki_k6 = (
        []
        if du_pct is not None
        else [
            "spadek napięcia na trasie — "
            + (w.spadek_blad_pl or w.rozplyw_blad_pl or "brak dekompozycji spadku")
        ]
    )
    braki_wiersza = braki_k6
    rekord = _ocena(
        kryterium_id=K_SPADEK_NAPIECIA,
        w=w,
        kryterium=Kryterium(
            opis_pl="Spadek napięcia od zacisków nN transformatora do końca odcinka nie przekracza "
            "wartości dopuszczalnej",
            warunek_latex=r"\Delta U_{\%} \le \Delta U_{dop}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_SPADKU,
        wynik=_wynik("spadek napięcia do końca odcinka", r"\Delta U_{\%}", du_pct, "%"),
        limit=LimitKryterium(
            wartosc=Wielkosc(wartosc=KRYTERIUM_SPADKU_OBWODU_NN_PROCENT, jednostka="%"),
            podstawa=_PODSTAWA_SPADKU,
            zakres_stosowalnosci_pl=(
                "spadek od zacisków nN transformatora stacji do odbioru; odbiory dalej w głąb "
                "obwodu mają spadek nie mniejszy niż na końcu tego odcinka"
            ),
        ),
        zdolnosc=ZDOLNOSC_ROZPLYWU,
        dziedzina="POWER_FLOW",
        slad_pl="suma spadków odcinków trasy z dekompozycji ΔU biegu rozpływu",
        braki=braki_wiersza,
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k6,
        )
    )

    # --- K7: SWZ na końcu odcinka ----------------------------------------------------------
    kroki_k7: list[ProofStep] = []
    dotyczy = w.petla_kod_odmowy is None
    braki_k7: list[str] = []
    ik1 = w.petla.fault_loop.ik_min_a if w.petla is not None else None
    if w.petla is not None:
        kroki_k7.append(krok_prad_zwarcia_min(w.petla.fault_loop, 1, PRZEDROSTEK_KROKU_KABLA))
    elif dotyczy:
        braki_k7.append(f"pętla zwarcia na końcu odcinka — {w.petla_powod_pl}")
    ia: float | None = None
    if w.swz is not None and w.petla is not None:
        ia = w.swz.ia_wymagane_a
        kroki_k7.append(
            krok_swz(
                w.petla.fault_loop,
                WynikSwzKroku(
                    rozstrzygniecie=w.swz.status,
                    przyczyna_pl=w.swz.przyczyna_pl,
                    ia_wymagane_a=w.swz.ia_wymagane_a,
                    t_wymagany_s=w.swz.t_wymagany_s,
                    pasmo_u0=w.swz.pasmo_u0,
                    rodzaj_obwodu=w.swz.rodzaj_obwodu,
                ),
                2,
                PRZEDROSTEK_KROKU_KABLA,
            )
        )
        # Predykat PARAMI z werdyktem SWZ: wartość graniczna Ia wchodzi do porównania
        # WYŁĄCZNIE gdy silnik SWZ rozstrzygnął (spełnia / nie spełnia). Werdykt
        # nierozstrzygalny z podaną liczbą (np. bramka umowna wkładki gG) nie może stać się
        # w pierwszym planie „zapasem" — to wciąż brak dowodu zadziałania w czasie wymaganym.
        if w.swz.status == SwzStatus.NIEROZSTRZYGALNE:
            ia = None
        if ia is None:
            braki_k7.append(f"prąd zadziałania Ia w czasie wymaganym — {w.swz.przyczyna_pl}")
    braki_wiersza = _brak_urzadzenia(w) + braki_k7
    rekord = _ocena(
        kryterium_id=K_SWZ,
        w=w,
        kryterium=Kryterium(
            opis_pl="Prąd zwarcia minimalnego na końcu odcinka zapewnia samoczynne wyłączenie "
            "zasilania w czasie wymaganym",
            warunek_latex=r"I_{k1,min} \ge I_a",
            relacja="NIE_MNIEJ",
        ),
        podstawa=_PODSTAWA_SWZ,
        wynik=_wynik(
            "prąd zwarcia jednofazowego minimalny na końcu odcinka", r"I_{k1,min}", ik1, "A"
        ),
        limit=(
            LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(ia), jednostka="A"),
                podstawa=_PODSTAWA_SWZ,
                zakres_stosowalnosci_pl="prąd zapewniający zadziałanie zabezpieczenia w czasie z "
                "tablicy 41.1",
            )
            if ia is not None
            else None
        ),
        zdolnosc=ZDOLNOSC_ZWARC,
        dziedzina="SHORT_CIRCUIT",
        slad_pl="Ik1 min pętli zwarcia (scenariusz MIN) wobec Ia aparatu",
        braki=braki_wiersza,
        dotyczy=dotyczy,
        powod_stosowalnosci_pl=(
            "obwód w układzie TN — samoczynne wyłączenie zasilania prądem zwarcia pętli"
            if dotyczy
            else (w.petla_powod_pl or "układ sieci nN bez pętli zwarcia TN")
        ),
    )
    wiersze.append(
        _wiersz(
            rekord,
            braki_wiersza,
            kroki_k7,
        )
    )
    return wiersze


def _typ_katalogowy_aparatu(
    aparat: SwitchBranch | FuseBranch | None, w: WielkosciKabla
) -> Any | None:
    if aparat is None or not aparat.catalog_ref:
        return None
    katalog = katalog_dla_modelu(w.enm)
    if aparat.catalog_namespace == "APARAT_NN_MCB":
        return katalog.get_lv_breaker_mcb_type(aparat.catalog_ref)
    if aparat.catalog_namespace == "APARAT_NN":
        return katalog.get_lv_apparatus_type(aparat.catalog_ref)
    if aparat.catalog_namespace == "WKLADKA_NN":
        return katalog.get_lv_fuse_link_type(aparat.catalog_ref)
    return None


# =============================================================================
# Wielkości obiektu (wartości bez kryterium) i opcje warunków ułożenia
# =============================================================================


def _wielkosc(
    kod: str,
    nazwa_pl: str,
    symbol: str,
    wartosc: float | None,
    jednostka: str,
    powod_pl: str | None = None,
    kroki: list[ProofStep] | None = None,
) -> dict[str, Any]:
    return {
        "kod": kod,
        "nazwa_pl": nazwa_pl,
        "symbol_latex": symbol,
        "wartosc": _r(wartosc) if wartosc is not None else None,
        "jednostka": jednostka,
        "powod_braku_pl": None if wartosc is not None else powod_pl,
        "szczegoly": [krok_w_kontrakcie(k) for k in (kroki or [])],
    }


def _wielkosci(w: WielkosciKabla) -> list[dict[str, Any]]:
    wsp, _ = wspolczynniki_ulozenia_kabla(w.obwod.kabel)
    kroki_iz: list[ProofStep] = []
    if w.iz_katalogowe_a is not None and w.iz_prime_a is not None:
        kroki_iz.append(krok_obciazalnosc(w.iz_katalogowe_a, wsp, 1, PRZEDROSTEK_KROKU_KABLA)[0])
    straty_w = mw_na_w(w.straty.straty_mw) if w.straty is not None else None
    brak_pf = w.rozplyw_blad_pl
    brak_sc = w.zwarcie_blad_pl
    wspolczynniki = (
        [
            _wielkosc(
                "f_temperatura",
                "Współczynnik temperatury otoczenia",
                r"f_{\theta}",
                wsp.f_temperatura,
                "—",
            ),
            _wielkosc(
                "f_grunt",
                "Współczynnik rezystywności gruntu",
                r"f_{\rho}",
                wsp.f_rezystywnosc_gruntu,
                "—",
            ),
            _wielkosc(
                "f_grupowanie", "Współczynnik grupowania obwodów", r"f_{N}", wsp.f_grupowanie, "—"
            ),
        ]
        if wsp is not None
        else []
    )
    return [
        _wielkosc("ib", "Prąd obliczeniowy odcinka", "I_B", w.ib_a, "A", brak_pf),
        _wielkosc("iz", "Obciążalność katalogowa", "I_z", w.iz_katalogowe_a, "A", w.iz_powod_pl),
        *wspolczynniki,
        _wielkosc(
            "iz_prim",
            "Obciążalność po współczynnikach",
            "I_z'",
            w.iz_prime_a,
            "A",
            w.wspolczynniki_niepoprawne_pl or w.iz_powod_pl,
            kroki_iz,
        ),
        _wielkosc(
            "in",
            "Prąd znamionowy zabezpieczenia",
            "I_n",
            w.urzadzenie.in_a if w.urzadzenie is not None else None,
            "A",
            w.urzadzenie_powod_pl,
        ),
        _wielkosc(
            "du_odcinka_v",
            "Spadek napięcia na odcinku",
            r"\Delta U",
            kv_na_v(w.spadek_odcinka_kv) if w.spadek_odcinka_kv is not None else None,
            "V",
            w.spadek_blad_pl or brak_pf,
        ),
        _wielkosc(
            "du_odcinka_procent",
            "Spadek napięcia na odcinku",
            r"\Delta U_{\%}",
            w.spadek_odcinka_procent,
            "%",
            w.spadek_blad_pl or brak_pf,
        ),
        _wielkosc(
            "du_konca_v",
            "Spadek napięcia do końca odcinka",
            r"\Delta U",
            kv_na_v(sum(s.delta_u_kv for s in w.spadki)) if w.spadki else None,
            "V",
            w.spadek_blad_pl or brak_pf,
        ),
        _wielkosc(
            "straty_w",
            "Straty mocy czynnej w odcinku",
            r"\Delta P",
            straty_w,
            "W",
            brak_pf,
            [krok_straty(w.straty, 1, PRZEDROSTEK_KROKU_KABLA)] if w.straty is not None else [],
        ),
        _wielkosc(
            "ik_max_poczatek",
            "Ik″max na początku odcinka",
            r"I''_{k,max}",
            w.ik_poczatku_ka,
            "kA",
            brak_sc,
        ),
        _wielkosc(
            "ik_max_koniec", "Ik″max na końcu odcinka", r"I''_{k,max}", w.ik_konca_ka, "kA", brak_sc
        ),
        _wielkosc(
            "ik1_min_koniec",
            "Ik1 min na końcu odcinka",
            r"I_{k1,min}",
            w.petla.fault_loop.ik_min_a if w.petla is not None else None,
            "A",
            w.petla_powod_pl,
            (
                [krok_prad_zwarcia_min(w.petla.fault_loop, 1, PRZEDROSTEK_KROKU_KABLA)]
                if w.petla is not None
                else []
            ),
        ),
        _wielkosc(
            "czas_wylaczenia",
            "Czas wyłączenia zwarcia (charakterystyka normowa aparatu)",
            "t_k",
            w.czas_wylaczenia_s,
            "s",
            w.czas_wylaczenia_opis_pl or w.urzadzenie_powod_pl,
        ),
    ]


def opcje_warunkow_ulozenia() -> dict[str, Any]:
    """Wartości warunków ułożenia nN, dla których rejestr tablic G-D1 ma wpis (wybór, nie wpis).

    Kontrolka edycji warunków ułożenia oferuje WYŁĄCZNIE wartości z tablic — wartość spoza
    rejestru byłaby odmową operacji (fail-closed parsera `_nn_cable_laying_conditions`).
    """

    def _temperatury(tablica: dict[tuple[str, int], Any]) -> dict[str, list[int]]:
        wynik: dict[str, list[int]] = {}
        for izolacja, temperatura in sorted(tablica):
            wynik.setdefault(izolacja, []).append(temperatura)
        return wynik

    return {
        "srodowiska": ["powietrze", "grunt"],
        "izolacje": ["PVC", "XLPE"],
        "temperatury": {
            "powietrze": _temperatury(tablice_nn.TABLICA_TEMPERATURY_POWIETRZE_NN),
            "grunt": _temperatury(tablice_nn.TABLICA_TEMPERATURY_GRUNTU_NN),
        },
        "liczby_obwodow": {
            "powietrze": sorted(tablice_nn.TABLICA_GRUPOWANIA_POWIETRZE_NN),
            "grunt": sorted(tablice_nn.TABLICA_GRUPOWANIA_GRUNTU_NN),
        },
        "rezystywnosci_gruntu": sorted(tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN),
    }


def _opis_kabla(w: WielkosciKabla) -> dict[str, Any]:
    kabel = w.obwod.kabel
    warunki = (kabel.meta or {}).get("cable_laying_conditions") if kabel.meta else None
    typ = w.typ_kabla
    wsp, _ = wspolczynniki_ulozenia_kabla(kabel)
    from application.proof_engine.packs.lv_circuit_verification import (
        opis_warunkow_ulozenia_pl,
    )

    return {
        "ref_id": kabel.ref_id,
        "nazwa": nazwa_elementu(kabel, "branches"),
        "catalog_ref": kabel.catalog_ref,
        "catalog_namespace": PRZESTRZEN_KABLI_NN,
        "typ_nazwa": typ.name if typ is not None else None,
        "material": kabel.conductor_material,
        "izolacja": typ.insulation_type if typ is not None else kabel.insulation,
        "przekroj_mm2": kabel.cross_section_mm2,
        "dlugosc_m": _r(km_na_m(kabel.length_km)),
        "warunki_ulozenia": dict(warunki) if warunki else None,
        "warunki_ulozenia_opis_pl": opis_warunkow_ulozenia_pl(wsp),
    }


def _opis_obwodu(w: WielkosciKabla) -> dict[str, Any]:
    o = w.obwod
    return {
        "station_ref": o.station.ref_id,
        "stacja_nazwa": nazwa_elementu(o.station, "substations"),
        "transformator_ref": o.trafo.ref_id,
        "transformator_nazwa": nazwa_elementu(o.trafo, "transformers"),
        "szyna_poczatku": o.szyna_poczatku,
        "szyna_konca": o.szyna_konca,
        "aparat_ref": o.aparat.ref_id if o.aparat is not None else None,
        "aparat_nazwa": nazwa_elementu(o.aparat, "branches") if o.aparat is not None else None,
        "aparat_rodzaj_pl": (
            _RODZAJ_APARATU_PL.get(w.urzadzenie.kind) if w.urzadzenie is not None else None
        ),
    }


def obliczenia_kabla_nn(
    enm: EnergyNetworkModel,
    cable_ref: str,
    *,
    case_id: str,
    uow_factory: Callable[[], Any] | None = None,
    bazowe: BiegiBazowe | None = None,
) -> dict[str, Any]:
    """Sekcja obliczeń obiektu kabla nN — wielkości, kryteria, opcje warunków ułożenia."""
    bazowe = bazowe if bazowe is not None else biegi_bazowe_przypadku(case_id)
    katalog = katalog_dla_modelu(enm)
    w, odmowa = policz_wielkosci_kabla(
        enm, cable_ref, bazowe=bazowe, katalog=katalog, uow_factory=uow_factory
    )
    if w is None:
        assert odmowa is not None
        return {**odmowa, "cable_ref": cable_ref}
    return {
        "status": "OK",
        "cable_ref": cable_ref,
        "kabel": _opis_kabla(w),
        "obwod": _opis_obwodu(w),
        "brakujace_biegi": bazowe.brakujace,
        "wielkosci": _wielkosci(w),
        "kryteria": _kryteria(w),
        "opcje_ulozenia": opcje_warunkow_ulozenia(),
        "audyt": {
            "rewizja_modelu": compute_enm_hash(enm),
            "bieg_bazowy_rozplywu": str(bazowe.rozplyw.id) if bazowe.rozplyw else None,
            "bieg_bazowy_zwarcia": str(bazowe.zwarcie.id) if bazowe.zwarcie else None,
            "wersja_obliczen": WERSJA_OBLICZEN_KABLA_NN,
        },
    }


# =============================================================================
# Dowód obwodu nN z modelu i biegu (pakiet LV_CIRCUIT_VERIFICATION)
# =============================================================================


def wejscie_dowodu_kabla_nn(
    enm: EnergyNetworkModel,
    cable_ref: str,
    *,
    case_id: str,
    project_name: str,
    case_name: str,
    uow_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    """Wejście pakietu dowodowego obwodu nN dla kabla — WYŁĄCZNIE z modelu i biegów.

    Zwraca ``{"status": "OK", "wejscie": LVCircuitVerificationInput}`` albo nazwaną
    odmowę z jednym konkretnym brakiem (np. „uruchom rozpływ mocy", „brak zabezpieczenia").
    """
    bazowe = biegi_bazowe_przypadku(case_id)
    w, odmowa = policz_wielkosci_kabla(
        enm, cable_ref, bazowe=bazowe, katalog=katalog_dla_modelu(enm), uow_factory=uow_factory
    )
    if w is None:
        assert odmowa is not None
        return odmowa
    if bazowe.rozplyw is None or w.rozplyw_blad_pl is not None:
        return _odmowa(
            "brak danych",
            f"Dowód obwodu wymaga rozpływu mocy: {w.rozplyw_blad_pl}.",
            ["load_flow_run"],
        )
    if w.urzadzenie is None or w.obwod.aparat is None:
        return _odmowa(
            "brak danych",
            f"Dowód obwodu wymaga zabezpieczenia odcinka: {w.urzadzenie_powod_pl}.",
            ["breaker"],
        )
    if w.iz_katalogowe_a is None:
        return _odmowa(
            "brak danych", f"Dowód obwodu wymaga obciążalności: {w.iz_powod_pl}.", ["iz"]
        )
    if w.wspolczynniki_niepoprawne_pl is not None:
        return _odmowa("brak danych", w.wspolczynniki_niepoprawne_pl, ["cable_laying_conditions"])
    assert w.p_mw is not None and w.q_mvar is not None and w.u_poczatku_kv is not None
    wsp, _ = wspolczynniki_ulozenia_kabla(w.obwod.kabel)
    thermal = w.thermal or wytrzymalosc_cieplna_kabla(
        w.obwod.kabel,
        ith_a=ka_na_a(w.ith_poczatku_ka) if w.ith_poczatku_ka is not None else None,
        czas_s=w.czas_wylaczenia_s,
    )
    du_kv = sum(s.delta_u_kv for s in w.spadki)
    du_pct = sum(s.delta_u_percent for s in w.spadki) if w.spadki else None
    znacznik = bazowe.rozplyw.finished_at or bazowe.rozplyw.created_at
    try:
        wynik = zbuduj_wejscie_dowodu_obwodu_nn(
            enm=w.enm,
            station_ref=w.obwod.station.ref_id,
            bus_ref=w.obwod.szyna_konca,
            breaker_ref=w.obwod.aparat.ref_id,
            segment_ref=cable_ref,
            project_name=project_name,
            case_name=case_name,
            run_timestamp=znacznik if isinstance(znacznik, datetime) else bazowe.rozplyw.created_at,
            solver_version=WERSJA_OBLICZEN_KABLA_NN,
            p_mw=w.p_mw,
            q_mvar=w.q_mvar,
            u_ll_kv=w.u_poczatku_kv,
            iz_katalogowe_a=w.iz_katalogowe_a,
            wspolczynniki=wsp,
            ik_max_ka=w.ik_aparatu_ka,
            thermal=thermal,
            vdrop_u_source_kv=w.u_zrodla_kv if w.u_zrodla_kv is not None else w.u_poczatku_kv,
            vdrop_delta_u_total_kv=du_kv,
            vdrop_delta_u_total_percent=du_pct,
            apparatus_branch_ref=w.obwod.aparat_korpus.ref_id if w.obwod.aparat_korpus else None,
            straty=w.straty,
        )
    except OdmowaDanychError as exc:
        return _odmowa("brak danych", f"Nie udało się złożyć dowodu obwodu nN: {exc}")
    return wynik


# =============================================================================
# Dobór przekroju — warianty z katalogu kabli nN
# =============================================================================


def _rodzina(typ: LVCableType) -> tuple[str | None, str | None, int]:
    return (typ.conductor_material, typ.insulation_type, typ.number_of_cores)


def kandydaci_przekroju(katalog: CatalogRepository, cable: Cable) -> list[LVCableType]:
    """Kandydaci doboru: typy kabli nN tej samej rodziny (materiał, izolacja, liczba żył).

    Kabel bez typu z katalogu — wszystkie typy kabli nN (rodziny nie da się ustalić).
    Kolejność: przekrój rosnąco, potem identyfikator (determinizm).
    """
    wszystkie = katalog.list_lv_cable_types()
    biezacy = katalog.get_lv_cable_type(cable.catalog_ref) if cable.catalog_ref else None
    if biezacy is not None:
        wszystkie = [t for t in wszystkie if _rodzina(t) == _rodzina(biezacy)]
    return sorted(wszystkie, key=lambda t: (t.cross_section_mm2, t.id))


def _wersja_wiazania(cable: Cable) -> str | None:
    params = cable.materialized_params if isinstance(cable.materialized_params, dict) else {}
    wersja = params.get("catalog_item_version") or (cable.meta or {}).get("catalog_item_version")
    return str(wersja) if wersja else None


def warianty_przekroju_kabla_nn(
    enm: EnergyNetworkModel,
    cable_ref: str,
    *,
    case_id: str,
    uow_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    """Porównanie wariantów przekroju — każdy kandydat liczony TĄ SAMĄ funkcją obiektu.

    Rekomendacja: najmniejszy przekrój, dla którego żadne policzone kryterium ZALEŻNE OD
    PRZEKROJU (`KRYTERIA_ZALEZNE_OD_PRZEKROJU`) nie ma przekroczenia (odczyt techniczny
    marginesu); kryteria nieobliczone są pokazane jako nieobliczone — nie zaliczają się ani
    nie odrzucają wariantu.
    """
    galaz = next((b for b in enm.branches if b.ref_id == cable_ref), None)
    if not isinstance(galaz, Cable):
        return {
            "status": "nie dotyczy",
            "cable_ref": cable_ref,
            "warianty": [],
            "missing_data": [],
            "reason_pl": "Dobór przekroju dotyczy wyłącznie odcinków kablowych.",
        }
    katalog = katalog_dla_modelu(enm)
    bazowe = biegi_bazowe_przypadku(case_id)
    kandydaci = kandydaci_przekroju(katalog, galaz)
    wersja = _wersja_wiazania(galaz)
    warianty: list[dict[str, Any]] = []
    for typ in kandydaci:
        scenariusz = OperatingScenario(
            scenario_id=f"__dobor_przekroju_nn__{cable_ref}__{typ.id}",
            name="Wariant przekroju kabla nN",
            kind=RodzajScenariusza.SIZING,
            zamiany_katalogu=(
                ZamianaKatalogu(
                    element_ref=cable_ref,
                    catalog_namespace=PRZESTRZEN_KABLI_NN,
                    catalog_item_id=typ.id,
                    catalog_item_version=wersja,
                ),
            ),
        )
        w, odmowa = policz_wielkosci_kabla(
            enm,
            cable_ref,
            bazowe=bazowe,
            katalog=katalog,
            uow_factory=uow_factory,
            scenariusz=scenariusz,
        )
        if w is None:
            assert odmowa is not None
            return {**odmowa, "cable_ref": cable_ref, "warianty": []}
        kryteria = _kryteria(w)
        oceny = [
            {
                "kryterium_id": k["kryterium_id"],
                "ocena_semantyka": k["ocena_semantyka"],
                "ocena_techniczna_pl": k["ocena_techniczna_pl"],
                "status_maszynowy": k["rekord"]["status_maszynowy"],
                "zalezne_od_przekroju": k["kryterium_id"] in KRYTERIA_ZALEZNE_OD_PRZEKROJU,
            }
            for k in kryteria
        ]
        warianty.append(
            {
                "catalog_item_id": typ.id,
                "catalog_binding": {
                    "catalog_namespace": PRZESTRZEN_KABLI_NN,
                    "catalog_item_id": typ.id,
                    "catalog_item_version": wersja,
                },
                "nazwa": typ.name,
                "przekroj_mm2": typ.cross_section_mm2,
                "material": typ.conductor_material,
                "izolacja": typ.insulation_type,
                "biezacy": typ.id == galaz.catalog_ref,
                "iz_prime_a": _r(w.iz_prime_a) if w.iz_prime_a is not None else None,
                "ib_a": _r(w.ib_a) if w.ib_a is not None else None,
                "du_konca_procent": (
                    _r(sum(s.delta_u_percent for s in w.spadki)) if w.spadki else None
                ),
                "du_konca_v": (
                    _r(kv_na_v(sum(s.delta_u_kv for s in w.spadki))) if w.spadki else None
                ),
                "straty_w": _r(mw_na_w(w.straty.straty_mw)) if w.straty is not None else None,
                "ik1_min_a": _r(w.petla.fault_loop.ik_min_a) if w.petla is not None else None,
                "kryteria": oceny,
                "bez_przekroczen": not any(
                    o["ocena_semantyka"] == "negatywna" and o["zalezne_od_przekroju"] for o in oceny
                ),
                "nieobliczone": sum(
                    1
                    for k in kryteria
                    if k["ocena_semantyka"] == "neutralna"
                    and k["rekord"]["stosowalnosc"]["dotyczy"]
                ),
            }
        )
    rekomendacja = next((v["catalog_item_id"] for v in warianty if v["bez_przekroczen"]), None)
    return {
        "status": "OK",
        "cable_ref": cable_ref,
        "brakujace_biegi": bazowe.brakujace,
        "kolejnosc_kryteriow": list(KOLEJNOSC_KRYTERIOW),
        "warianty": warianty,
        "rekomendacja": rekomendacja,
        "missing_data": [],
        "reason_pl": None,
    }


__all__ = [
    "BiegiBazowe",
    "LVCircuitVerificationInput",
    "ObwodKablaNn",
    "biegi_bazowe_przypadku",
    "czas_wylaczenia_aparatu",
    "kandydaci_przekroju",
    "lokalizuj_obwod_kabla_nn",
    "obliczenia_kabla_nn",
    "opcje_warunkow_ulozenia",
    "policz_wielkosci_kabla",
    "warianty_przekroju_kabla_nn",
    "wejscie_dowodu_kabla_nn",
]

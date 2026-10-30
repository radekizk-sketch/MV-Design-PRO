"""Dobór aparatu zabezpieczającego nN dla obwodu (karta P0.7, §0.5).

Warstwa APLIKACJI/ANALIZ (interpretacja — NOT-A-SOLVER). Ocenia kandydatów z
katalogu (MCB / rozłącznik bezpiecznikowy+wkładka / wyłącznik nN) przeciw
CZTEREM kryteriom normatywnym doboru zabezpieczenia obwodu nN:

    (i)   Ib <= In <= Iz′               (IEC 60364-4-43 §433.1)
    (ii)  I2 <= 1,45·Iz′                (IEC 60364-4-43 §433.1.1)
    (iii) Icu/Icn/Ic-warunkowy >= Ik″max w punkcie zabudowy (IEC 60947)
    (iv)  SWZ przy Ik_min                (IEC 60364-4-41, REUSE pakietu SWZ)

REUSE, ZERO DRUGIEJ FIZYKI:
  - Iz′: WOLANY dostarcza gotową wartość (solver `cable_ampacity_derating`
    liczy ją — ten moduł tylko PORÓWNUJE, nie liczy współczynników).
  - I2 dla MCB: stała `PROG_CIEPLNY_WYZWALA_X_IN` (1,45×In) z
    `network_model.catalog.lv_mcb_bands_iec60898` — JEDNO źródło progu
    cieplnego (G-D4), zweryfikowane przez `protection_lv_curves.
    compute_mcb_thermal_point` (nie druga stała).
  - I2 dla wkładki gG: `protection_lv_curves.compute_fuse_gg_gate` (If=1,6×In,
    G-D2) — JEDYNE miejsce liczące bramki I-t wkładek.
  - SWZ: `application.analyses.swz.werdykt.ocen_swz` — JEDNO źródło werdyktu
    3-stanowego (P0.6, G-06); ten moduł NIE odtwarza logiki Ia/tabeli
    czasów, tylko woła istniejący silnik dla KAŻDEGO kandydata.
  - Ik1_min/U0 dla wywołania SWZ: orkiestracja (`wybierz_aparat_dla_obwodu_nn`)
    powtarza DOKŁADNIE tę samą sekwencję wywołań solvera pętli zwarcia, którą
    używa `application.analyses.swz.service.build_swz_view` (import
    prywatnych helperów `fault_loop.service` — WZORZEC już ustanowiony i
    świadomie uzasadniony w `swz/service.py`; ten moduł powtarza go z tego
    samego powodu: Ik1_min NIE zależy od tego, KTÓRY aparat jest oceniany —
    tylko od trasy/impedancji, więc liczy się GO RAZ, nie per kandydat).
    `application/analyses/swz/**` pozostaje NIETKNIĘTE (granica karty P0.6).

ZERO FABRYKACJI: kryterium nieobliczalne (brak danej katalogowej, brak
normatywnego mnożnika dla danego rodzaju aparatu) daje TRZECI STAN
(NIEROZSTRZYGALNE), NIGDY ciche odrzucenie ani ciche zaliczenie.

RANKING DETERMINISTYCZNY: kandydaci kwalifikujący się (WSZYSTKIE kryteria
SPEŁNIA) posortowani wg najmniejszego In, tie-break po id. Rekomendacja to
pierwszy z tej listy (najmniejszy spełniający In) albo `None`.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from application.analyses.fault_loop.route import (
    RouteExtractionError,
    path_to_bus,
    route_segments_min_scenario,
)

# Import ŚWIADOMY prywatnych helperów `fault_loop.service` — DOKŁADNIE ten
# sam wzorzec i to samo uzasadnienie, co w `application.analyses.swz.service`
# (patrz docstring modułu powyżej i tamtego modułu): Ik1_min/U0 dla obwodu
# NIE zależą od ocenianego aparatu, więc liczą się RAZ, tą samą fizyką co
# SWZ (zero drugiej ścieżki obliczeniowej pętli zwarcia).
from application.analyses.fault_loop.service import (
    _find_station,
    _transformer_loop_impedance,
    _upstream_thevenin_lv_component,
    oblicz_petle_na_trasie,
    odmowa_analizy_nn,
    resolve_transformer_for_bus,
    uklad_nn_transformatora,
)
from application.analyses.swz.werdykt import (
    AparatZabezpieczajacy,
    dane_przyjete_petli,
    ocen_swz,
)
from application.ocena_niewykonana import rekord_json
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_po_identyfikatorze
from network_model.catalog.lv_mcb_bands_iec60898 import PROG_CIEPLNY_WYZWALA_X_IN
from network_model.catalog.lv_mccb_settings_iec60947_2 import (
    resolwuj_nastawy_mccb as resolwuj_nastawy_mccb_z_zakresow,
)
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import LVApparatusType
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import kv_na_v, napiecie_fazowe_v
from network_model.solvers.fault_loop_builder import (
    sum_phase_and_return_route,
)
from network_model.solvers.protection_lv_curves import (
    FUSE_GG_IF_MULTIPLIER,
    MCCB_I2_MULTIPLIER,
    GwarancjaNormy,
    compute_fuse_gg_gate,
    compute_mcb_thermal_point,
    compute_mccb_point,
)
from solver_input.provenance import classify_dynamic_capability
from solver_input.uklad_sieci_nn import typ_sieci_solvera, uklad_tn
from werdykt import (
    DanaPrzyjeta,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    WyjasnienieWerdyktu,
    WynikWymagania,
    ZakresWaznosci,
    format_liczba,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_katalogu,
    podstawa_nieustalona,
    podstawa_normy,
    podstawa_zalozenia,
    projekcja_statusu,
    rozstrzygniecie,
    wymaganie_z_ocen,
)

from .swz.werdykt_tt_it import KOD_LIMIT_BRAK_TEKSTU_NORMY

# =============================================================================
# STAN KRYTERIUM (trzeci stan obowiązkowy)
# =============================================================================


class KryteriumStatus(StrEnum):
    SPELNIA = "spełnia"
    NIE_SPELNIA = "nie spełnia"
    NIEROZSTRZYGALNE = "nierozstrzygalne"


# Rodzaje kandydatów — mapowanie na namespace'y katalogu nN (P0.2).
KIND_MCB = "MCB"
KIND_FUSE_SWITCH = "FUSE_SWITCH"
KIND_MCCB = "MCCB"
_KINDY_DOZWOLONE = (KIND_MCB, KIND_FUSE_SWITCH, KIND_MCCB)


@dataclass(frozen=True)
class KandydatAparatuNn:
    """Jeden kandydat do doboru — aparat (albo kombinacja aparat+wkładka) z katalogu.

    Attributes:
        id: Stabilny identyfikator kandydata (dla MCB/MCCB = id typu
            katalogowego; dla FUSE_SWITCH = "{apparatus_id}+{fuse_id}").
        nazwa: Nazwa czytelna dla człowieka.
        kind: ``KIND_MCB`` | ``KIND_FUSE_SWITCH`` | ``KIND_MCCB``.
        in_a: Prąd znamionowy DECYDUJĄCY o funkcji ochronnej [A] — dla MCB i
            MCCB to prąd znamionowy aparatu; dla FUSE_SWITCH to prąd
            znamionowy WKŁADKI (to ona ogranicza prąd, nie korpus
            rozłącznika).
        zdolnosc_wylaczania_ka: Pole zdolności wyłączania WŁAŚCIWE dla
            ``kind`` (MCB→icn_ka; FUSE_SWITCH→conditional_sc_current_ka
            KOMBINACJI; MCCB→i_cu_ka) — ``None`` gdy katalog nie niesie tej
            wartości (kryterium iii da wtedy NIEROZSTRZYGALNE, nie 0).
        klasa_mcb: Klasa wyzwolenia B/C/D — WYŁĄCZNIE dla ``kind=KIND_MCB``.
        fuse_breaking_capacity_ka: WYŁĄCZNIE dla ``kind=KIND_FUSE_SWITCH`` —
            własna zdolność wyłączania SAMEJ wkładki (``LVFuseLinkType.
            breaking_capacity_ka``, IEC 60269-1/-2), NIEZALEŻNA od
            ``zdolnosc_wylaczania_ka`` (która niesie wartość KOMBINACJI z
            rozłącznikiem). Pole informacyjne w dowodzie doboru — kombinacja
            fizycznie NIE MOŻE przekroczyć zdolności samej wkładki (walidacja
            w `zbierz_kandydatow_z_katalogu`).
        manufacturer: Producent (opcjonalnie, do prezentacji).
        ir_a, isd_a, ii_a, tr_s, tsd_s: Karta D1 (nN, „runda 8") — WYŁĄCZNIE
            dla ``kind=KIND_MCCB``. Nastawy wyzwalacza elektronicznego
            RESOLWOWANE (nie zakres nastawialności) do absolutnych jednostek
            [A]/[s], konsumowane 1:1 przez `protection_lv_curves.
            compute_mccb_point` (ten sam kontrakt parametrów). Resolucja z
            `LVApparatusType.ir_range/isd_range/ii_range/tr_range/tsd_range`
            do GÓRNEGO krańca zakresu regulacji — ZAŁOŻENIE NAZWANE WPROST
            (nie fabrykacja): kandydat z nastawialnym wyzwalaczem musi
            spełniać kryteria doboru NAWET przy najbardziej wymagającej
            dozwolonej nastawie fabrycznej (`zbierz_kandydatow_z_katalogu`).
            ``None`` gdy katalog nie niesie odpowiedniego zakresu — kryterium
            (ii)/(iv) dają wtedy NIEROZSTRZYGALNE, nigdy fabrykowaną wartość.
    """

    id: str
    nazwa: str
    kind: str
    in_a: float
    zdolnosc_wylaczania_ka: float | None
    klasa_mcb: str | None = None
    fuse_breaking_capacity_ka: float | None = None
    manufacturer: str | None = None
    ir_a: float | None = None
    isd_a: float | None = None
    ii_a: float | None = None
    tr_s: float | None = None
    tsd_s: float | None = None

    def __post_init__(self) -> None:
        if self.kind not in _KINDY_DOZWOLONE:
            raise OdmowaDanychError(
                f"Nieznany rodzaj kandydata '{self.kind}' — dozwolone: {_KINDY_DOZWOLONE}."
            )
        if self.in_a <= 0:
            raise OdmowaDanychError(f"in_a musi być dodatnie, otrzymano {self.in_a}.")
        if self.kind == KIND_MCB and not self.klasa_mcb:
            raise OdmowaDanychError("Kandydat MCB wymaga klasa_mcb (B/C/D).")
        if (
            self.kind == KIND_FUSE_SWITCH
            and self.zdolnosc_wylaczania_ka is not None
            and self.fuse_breaking_capacity_ka is not None
            and self.zdolnosc_wylaczania_ka > self.fuse_breaking_capacity_ka
        ):
            raise OdmowaDanychError(
                f"Dane katalogowe niespójne: warunkowy prąd kombinacji "
                f"({self.zdolnosc_wylaczania_ka:g} kA) przekracza własną zdolność "
                f"wyłączania wkładki ({self.fuse_breaking_capacity_ka:g} kA) — kombinacja "
                "fizycznie nie może przewyższyć zdolności samej wkładki."
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "nazwa": self.nazwa,
            "kind": self.kind,
            "in_a": self.in_a,
            "zdolnosc_wylaczania_ka": self.zdolnosc_wylaczania_ka,
            "klasa_mcb": self.klasa_mcb,
            "fuse_breaking_capacity_ka": self.fuse_breaking_capacity_ka,
            "manufacturer": self.manufacturer,
            "ir_a": self.ir_a,
            "isd_a": self.isd_a,
            "ii_a": self.ii_a,
            "tr_s": self.tr_s,
            "tsd_s": self.tsd_s,
        }


# =============================================================================
# WYNIK JEDNEGO KRYTERIUM
# =============================================================================


@dataclass(frozen=True)
class KryteriumWynik:
    """Kryterium doboru: rekord werdyktu wyjaśnialnego (``ocena`` — K albo W) + kontekst.

    ``status`` jest PROJEKCJĄ rekordu (``projekcja_statusu`` ocen składowych — jedno źródło
    rozstrzygnięcia), ``wyjasnienie`` = wyjaśnienie rekordu. ``uzasadnienie_pl`` i ``wartosci``
    zostają zapisem technicznym wiersza (te same liczby co rekord).
    """

    nazwa: str
    status: KryteriumStatus
    uzasadnienie_pl: str
    ocena: OcenaKryterium | WynikWymagania
    wyjasnienie: WyjasnienieWerdyktu
    wartosci: dict[str, Any] = field(default_factory=dict)
    #: Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: dane przyjęte, na których stoi prąd zwarciowy
    #: kryterium (wartość robocza tolerancji sieci nN) — w odpowiedzi WYŁĄCZNIE gdy są.
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "nazwa": self.nazwa,
            "status": self.status.value,
            "uzasadnienie_pl": self.uzasadnienie_pl,
            "wartosci": self.wartosci,
            "ocena": rekord_json(self.ocena),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
        }
        if self.dane_przyjete:
            wynik["status_danych"] = "UNVALIDATED_INPUT"
            wynik["dane_przyjete"] = [d.model_dump(mode="json") for d in self.dane_przyjete]
        return wynik


@dataclass(frozen=True)
class WynikKandydataNn:
    kandydat: KandydatAparatuNn
    kryteria: tuple[KryteriumWynik, ...]
    kwalifikuje_sie: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "kandydat": self.kandydat.to_dict(),
            "kryteria": [k.to_dict() for k in self.kryteria],
            "kwalifikuje_sie": self.kwalifikuje_sie,
        }


@dataclass(frozen=True)
class WynikDoboruAparatuNn:
    ib_a: float
    iz_prime_a: float
    ik_max_ka: float | None
    ik1_min_a: float
    u0_v: float
    kandydaci: tuple[WynikKandydataNn, ...]
    rekomendacja: KandydatAparatuNn | None
    deterministic_signature: str = ""
    #: Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: dane przyjęte Ik1_min (pętla liczona z wartością
    #: roboczą tolerancji sieci nN) — w odpowiedzi WYŁĄCZNIE gdy są.
    dane_przyjete_ik1_min: tuple[DanaPrzyjeta, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "ib_a": self.ib_a,
            "iz_prime_a": self.iz_prime_a,
            "ik_max_ka": self.ik_max_ka,
            "ik1_min_a": self.ik1_min_a,
            "u0_v": self.u0_v,
            "kandydaci": [k.to_dict() for k in self.kandydaci],
            "rekomendacja": self.rekomendacja.to_dict() if self.rekomendacja else None,
            "deterministic_signature": self.deterministic_signature,
        }
        if self.dane_przyjete_ik1_min:
            wynik["dane_przyjete_ik1_min"] = [
                d.model_dump(mode="json") for d in self.dane_przyjete_ik1_min
            ]
        return wynik


# =============================================================================
# REKORDY WERDYKTU WYJAŚNIALNEGO KRYTERIÓW (karta WERDYKT-MIGRACJA-190, domena 7)
# =============================================================================

#: Zdolności dowodowe porównań doboru (``solver_input/provenance.py``): kryterium zwarciowe
#: stoi na obliczeniu I″k,max, kryteria przeciążeniowe na danych znamionowych i katalogowych.
ZDOLNOSC_DOBORU_NN = "nn.dobor_aparatu"
ZDOLNOSC_DOBORU_NN_ZNAMIONOWA = "nn.dobor_aparatu.dane_znamionowe"

_PODSTAWA_PRZECIAZENIOWA = podstawa_normy(
    "IEC 60364-4-43",
    "2008 / 2023",
    "§433.1 — koordynacja przewodu i zabezpieczenia przeciążeniowego (I_B ≤ I_n ≤ I_z, "
    "I_2 ≤ 1,45·I_z)",
    uwagi_pl="pełny tekst normy niedostępny w repozytorium — warunki wg brzmienia powszechnie "
    "przytaczanego w literaturze instalacyjnej",
)
_PODSTAWA_ZWARCIOWA = podstawa_normy(
    "IEC 60364-4-43",
    "2008 / 2023",
    "§434.5.1 — zdolność wyłączania aparatu nie mniejsza od spodziewanego prądu zwarciowego w "
    "miejscu zainstalowania",
)
_PODSTAWA_IB = podstawa_zalozenia(
    "dane projektu obwodu nN",
    "prąd obliczeniowy obwodu I_B (z biegu rozpływu albo z tabliczek odbiorów odpływu)",
)
_PODSTAWA_IZ = podstawa_normy(
    "IEC 60364-5-52",
    "2009",
    "obciążalność długotrwała przewodu skorygowana współczynnikami ułożenia (I_z′)",
)
_ZAKRES_DOBORU = ZakresWaznosci(
    rodzaj_analizy=None,
    opis_pl=(
        "Dobór aparatu zabezpieczającego obwodu nN: dane znamionowe aparatu z katalogu typów "
        "wobec prądu obliczeniowego, obciążalności skorygowanej przewodu i prądów zwarciowych "
        "punktu (I″k,max z biegu IEC 60909, I_k1,min z pętli zwarcia)"
    ),
    wykluczenia=(
        "selektywność względem zabezpieczeń nadrzędnych i podrzędnych",
        "nastawy inne niż górny kraniec zakresu nastaw z katalogu (wyzwalacze elektroniczne)",
    ),
)


#: Zakres kryterium zwarciowego: I″k,max z biegu IEC 60909 (wynik obliczenia ma dziedzinę).
_ZAKRES_DOBORU_ZWARCIOWY = _ZAKRES_DOBORU.model_copy(update={"rodzaj_analizy": "SHORT_CIRCUIT"})


def _przedmiot_kandydata(kandydat: KandydatAparatuNn) -> Przedmiot:
    return Przedmiot(
        element_ref=kandydat.id,
        nazwa_pl=f"Aparat „{kandydat.nazwa}” w obwodzie nN",
        opis_pl=(
            f"Aparat zabezpieczający „{kandydat.nazwa}” (prąd znamionowy "
            f"{format_liczba(kandydat.in_a)} A) oceniany jako zabezpieczenie obwodu nN"
        ),
    )


def _rekord(
    p: Porownanie,
    kandydat: KandydatAparatuNn,
    *,
    podstawa: PodstawaWymagania,
    podstawa_limitu: PodstawaWymagania | None = None,
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
    zakres: ZakresWaznosci = _ZAKRES_DOBORU,
    slad: tuple[OdnosnikSladu, ...] = (),
) -> OcenaKryterium:
    zdolnosc = (
        ZDOLNOSC_DOBORU_NN_ZNAMIONOWA if p.metoda_wyniku == "DEKLARACJA" else ZDOLNOSC_DOBORU_NN
    )
    return ocena_porownania(
        p,
        przedmiot=_przedmiot_kandydata(kandydat),
        podstawa=podstawa,
        podstawa_limitu=podstawa_limitu,
        zdolnosc=classify_dynamic_capability(zdolnosc),
        zakres=zakres,
        dane_przyjete=dane_przyjete,
        slad=slad,
        odniesienie="application/analyses/nn_device_selection.py",
    )


def _status(oceny: tuple[OcenaKryterium, ...]) -> KryteriumStatus:
    """Kod kryterium zastany — PROJEKCJA rekordu (jedno źródło rozstrzygnięcia)."""
    return KryteriumStatus(
        projekcja_statusu(
            oceny,
            spelnia=KryteriumStatus.SPELNIA.value,
            nie_spelnia=KryteriumStatus.NIE_SPELNIA.value,
            nierozstrzygniete=KryteriumStatus.NIEROZSTRZYGALNE.value,
        )
    )


def _z_oceny(
    nazwa: str,
    ocena: OcenaKryterium,
    uzasadnienie_pl: str,
    wartosci: dict[str, Any],
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
) -> KryteriumWynik:
    return KryteriumWynik(
        nazwa=nazwa,
        status=_status((ocena,)),
        uzasadnienie_pl=uzasadnienie_pl,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        wartosci=wartosci,
        dane_przyjete=dane_przyjete,
    )


def _spelnia(ocena: OcenaKryterium) -> bool:
    return rozstrzygniecie((ocena,)) == "SPELNIA"


# =============================================================================
# KRYTERIA — FUNKCJE CZYSTE
# =============================================================================


def _kryterium_ib_in_iz(
    *, kandydat: KandydatAparatuNn, ib_a: float, iz_prime_a: float
) -> KryteriumWynik:
    """(i) Ib <= In <= Iz′ — IEC 60364-4-43 §433.1: rekord W z dwoma rekordami K (prąd
    znamionowy wobec prądu obliczeniowego i wobec obciążalności skorygowanej przewodu)."""
    in_a = kandydat.in_a
    ocena_ib = _rekord(
        Porownanie(
            kryterium_id="dobor_nn.in_wobec_ib",
            opis_pl="Prąd znamionowy aparatu nie mniejszy od prądu obliczeniowego obwodu",
            relacja="NIE_MNIEJ",
            wielkosc_pl="prąd znamionowy aparatu",
            warunek_latex=r"I_n \ge I_B",
            symbol_latex="I_n",
            jednostka="A",
            wynik=in_a,
            limit=ib_a,
            limit_pl="prąd obliczeniowy obwodu I_B",
            metoda_wyniku="DEKLARACJA",
        ),
        kandydat,
        podstawa=_PODSTAWA_PRZECIAZENIOWA,
        podstawa_limitu=_PODSTAWA_IB,
    )
    ocena_iz = _rekord(
        Porownanie(
            kryterium_id="dobor_nn.in_wobec_iz",
            opis_pl=(
                "Prąd znamionowy aparatu nie większy od obciążalności długotrwałej przewodu "
                "skorygowanej współczynnikami ułożenia"
            ),
            relacja="NIE_WIECEJ",
            wielkosc_pl="prąd znamionowy aparatu",
            warunek_latex=r"I_n \le I_z'",
            symbol_latex="I_n",
            jednostka="A",
            wynik=in_a,
            limit=iz_prime_a,
            limit_pl="obciążalność skorygowana przewodu I_z′",
            metoda_wyniku="DEKLARACJA",
        ),
        kandydat,
        podstawa=_PODSTAWA_PRZECIAZENIOWA,
        podstawa_limitu=_PODSTAWA_IZ,
    )
    oceny = (ocena_ib, ocena_iz)
    wymaganie = wymaganie_z_ocen(
        wymaganie_id="dobor_nn.ib_in_iz",
        nazwa_pl="Prąd znamionowy aparatu między prądem obliczeniowym a obciążalnością przewodu",
        podstawa=_PODSTAWA_PRZECIAZENIOWA,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBORU_NN_ZNAMIONOWA),
        zakres=_ZAKRES_DOBORU,
        odniesienie="application/analyses/nn_device_selection.py",
        sposob_wykazania="DEKLARACJA",
    )
    if _spelnia(ocena_ib) and _spelnia(ocena_iz):
        uzasadnienie = (
            f"Ib={ib_a:g} A <= In={in_a:g} A <= Iz′={iz_prime_a:g} A (IEC 60364-4-43 §433.1)."
        )
    elif not _spelnia(ocena_ib):
        uzasadnienie = f"In={in_a:g} A < Ib={ib_a:g} A — aparat nie pokrywa obciążenia obwodu."
    else:
        uzasadnienie = f"In={in_a:g} A > Iz′={iz_prime_a:g} A — aparat nie chroni przewodu."
    return KryteriumWynik(
        nazwa="Ib<=In<=Iz′",
        status=_status(oceny),
        uzasadnienie_pl=uzasadnienie,
        ocena=wymaganie,
        wyjasnienie=wymaganie.wyjasnienie,
        wartosci={"ib_a": ib_a, "in_a": in_a, "iz_prime_a": iz_prime_a},
    )


def _ocena_i2(
    kandydat: KandydatAparatuNn, *, i2_a: float | None, limit_a: float, opis_i2_pl: str
) -> OcenaKryterium:
    return _rekord(
        Porownanie(
            kryterium_id="dobor_nn.i2_wobec_iz",
            opis_pl=(
                "Prąd zadziałania aparatu w czasie umownym nie większy od 1,45-krotności "
                "obciążalności skorygowanej przewodu"
            ),
            relacja="NIE_WIECEJ",
            wielkosc_pl=f"prąd zadziałania w czasie umownym I_2 ({opis_i2_pl})",
            warunek_latex=r"I_2 \le 1{,}45 \cdot I_z'",
            symbol_latex="I_2",
            jednostka="A",
            wynik=i2_a,
            limit=limit_a,
            limit_pl="1,45·I_z′ (obciążalność skorygowana przewodu)",
            # I_2 to krotność prądu znamionowego/nastawy z definicji normy aparatu — dana
            # znamionowa, nie wynik obliczenia sieci.
            metoda_wyniku="DEKLARACJA",
            braki=(
                ()
                if i2_a is not None
                else (
                    "nastawa długozwłoczna I_r/t_r wyzwalacza elektronicznego (zakres nastaw "
                    "w katalogu)",
                )
            ),
        ),
        kandydat,
        podstawa=_PODSTAWA_PRZECIAZENIOWA,
        podstawa_limitu=_PODSTAWA_IZ,
    )


def _kryterium_i2(*, kandydat: KandydatAparatuNn, iz_prime_a: float) -> KryteriumWynik:
    """(ii) I2 <= 1,45·Iz′ — IEC 60364-4-43 §433.1.1.

    I2 = próg gwarantowanego zadziałania w czasie umownym:
      MCB: 1,45×In (REUSE `PROG_CIEPLNY_WYZWALA_X_IN`, G-D4), zweryfikowany
        przez `compute_mcb_thermal_point`.
      FUSE_SWITCH: 1,6×In wkładki (`FUSE_GG_IF_MULTIPLIER`, G-D2),
        zweryfikowany przez `compute_fuse_gg_gate`.
      MCCB: 1,3×Ir (REUSE `MCCB_I2_MULTIPLIER`, IEC 60947-2, karta D1),
        WYŁĄCZNIE gdy `kandydat.ir_a`/`tr_s` są rozwiązane (katalog niesie
        `ir_range`/`tr_range`) — zweryfikowany przez `compute_mccb_point`
        (musi klasyfikować I2 W lub POWYŻEJ progu długozwłocznego — I2>Ir
        z definicji mnożnika >1). Brak nastawy → rekord bez wyniku (NIE_OCENIONO,
        brak nazwany), WARUNKOWO — zależne od danych katalogowych, nie zaszyte na stałe.
    """
    limit = 1.45 * iz_prime_a
    if kandydat.kind == KIND_MCB:
        i2 = PROG_CIEPLNY_WYZWALA_X_IN * kandydat.in_a
        gate = compute_mcb_thermal_point(i_query_a=i2, in_a=kandydat.in_a)
        assert gate.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE  # I2 z definicji progu
        ocena = _ocena_i2(kandydat, i2_a=i2, limit_a=limit, opis_i2_pl="1,45·I_n MCB, IEC 60898-1")
        uzasadnienie = (
            f"I2={i2:g} A (={PROG_CIEPLNY_WYZWALA_X_IN:g}×In MCB, IEC 60898-1) "
            f"{'<=' if _spelnia(ocena) else '>'} 1,45·Iz′={limit:g} A."
        )
        return _z_oceny(
            "I2<=1,45·Iz′",
            ocena,
            uzasadnienie,
            {"i2_a": i2, "limit_a": limit, "zrodlo": "IEC 60898-1 (1,45×In)"},
        )
    if kandydat.kind == KIND_FUSE_SWITCH:
        i2 = FUSE_GG_IF_MULTIPLIER * kandydat.in_a
        brama_wkladki = compute_fuse_gg_gate(i_query_a=i2, in_a=kandydat.in_a)
        assert brama_wkladki.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        ocena = _ocena_i2(
            kandydat, i2_a=i2, limit_a=limit, opis_i2_pl="I_f = 1,6·I_n wkładki gG, IEC 60269-1"
        )
        uzasadnienie = (
            f"I2={i2:g} A (=If={FUSE_GG_IF_MULTIPLIER:g}×In wkładki, IEC 60269-1) "
            f"{'<=' if _spelnia(ocena) else '>'} 1,45·Iz′={limit:g} A."
        )
        return _z_oceny(
            "I2<=1,45·Iz′",
            ocena,
            uzasadnienie,
            {"i2_a": i2, "limit_a": limit, "zrodlo": "IEC 60269-1 (If=1,6×In)"},
        )
    # KIND_MCCB — karta D1: I2 = MCCB_I2_MULTIPLIER×Ir (IEC 60947-2), gdy
    # nastawa długozwłoczna jest rozwiązana; w przeciwnym razie rekord bez wyniku,
    # WARUNKOWO zależny od tego, czy TEN KONKRETNY rekord katalogu niesie
    # `ir_range`/`tr_range` (nie zaszyty na stałe niezależnie od danych).
    if kandydat.ir_a is None or kandydat.tr_s is None:
        return _z_oceny(
            "I2<=1,45·Iz′",
            _ocena_i2(
                kandydat,
                i2_a=None,
                limit_a=limit,
                opis_i2_pl="1,3·I_r wyzwalacza elektronicznego, IEC 60947-2",
            ),
            (
                "Wyłącznik z wyzwalaczem elektronicznym (MCCB) bez rozwiązanej nastawy "
                "długozwłocznej Ir/tr w katalogu — I2 nie do wyznaczenia bez fabrykacji "
                "(ten rekord katalogu nie niesie `ir_range`/`tr_range`)."
            ),
            {"limit_a": limit},
        )
    i2 = MCCB_I2_MULTIPLIER * kandydat.ir_a
    punkt_mccb = compute_mccb_point(
        i_query_a=i2,
        ir_a=kandydat.ir_a,
        isd_a=kandydat.isd_a,
        ii_a=kandydat.ii_a,
        tr_s=kandydat.tr_s,
        tsd_s=kandydat.tsd_s,
    )
    # I2=1,3×Ir > Ir z definicji mnożnika (>1) — punkt NIGDY nie klasyfikuje
    # się jako "brak" (poniżej progu długozwłocznego); solver to potwierdza
    # (reuse, nie druga fizyka).
    assert punkt_mccb.stopien != "brak"
    ocena = _ocena_i2(
        kandydat,
        i2_a=i2,
        limit_a=limit,
        opis_i2_pl="1,3·I_r wyzwalacza elektronicznego, IEC 60947-2",
    )
    uzasadnienie = (
        f"I2={i2:g} A (={MCCB_I2_MULTIPLIER:g}×Ir={kandydat.ir_a:g} A, wyzwalacz "
        f"elektroniczny, IEC 60947-2 — stopień klasyfikacji '{punkt_mccb.stopien}') "
        f"{'<=' if _spelnia(ocena) else '>'} 1,45·Iz′={limit:g} A."
    )
    return _z_oceny(
        "I2<=1,45·Iz′",
        ocena,
        uzasadnienie,
        {
            "i2_a": i2,
            "limit_a": limit,
            "zrodlo": "IEC 60947-2 (1,3×Ir, wyzwalacz elektroniczny)",
            "ir_a": kandydat.ir_a,
            "mccb_stopien": punkt_mccb.stopien,
        },
    )


#: Pole katalogu niosące zdolność wyłączania właściwą dla rodzaju kandydata.
_POLE_ZDOLNOSCI: dict[str, str] = {
    KIND_MCB: "icn_ka",
    KIND_FUSE_SWITCH: "conditional_sc_current_ka",
    KIND_MCCB: "i_cu_ka",
}
_OPIS_POLA_ZDOLNOSCI_PL: dict[str, str] = {
    KIND_MCB: "znamionowa zdolność zwarciowa I_cn (IEC 60898-1)",
    KIND_FUSE_SWITCH: "warunkowy prąd zwarciowy kombinacji rozłącznik + wkładka (IEC 60947-3)",
    KIND_MCCB: "graniczna zdolność wyłączania I_cu (IEC 60947-2)",
}


def ocena_zdolnosci_wylaczania(
    *,
    kandydat: KandydatAparatuNn,
    ik_max_ka: float | None,
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
    kryterium_id: str = "dobor_nn.zdolnosc_wylaczania",
    opis_pl: str = (
        "Spodziewany prąd zwarciowy w miejscu zainstalowania nie większy od zdolności "
        "wyłączania aparatu"
    ),
) -> OcenaKryterium:
    """Rekord K zdolności wyłączania aparatu wobec I″k,max w punkcie zabudowy — JEDNA reguła
    dla doboru (kryterium iii) i pakietu dowodowego weryfikacji obwodu nN (krok 6).

    Limit to pole katalogu właściwe dla rodzaju aparatu (``_POLE_ZDOLNOSCI``). Brak Ik″max —
    rekord bez wyniku (``NIE_OCENIONO``); brak pola katalogu — rekord bez limitu
    (``BRAK_PODSTAWY``); ``dane_przyjete`` wchodzą do rekordu tylko przy znanym Ik″max.
    """
    pole = _POLE_ZDOLNOSCI[kandydat.kind]
    dane = dane_przyjete if ik_max_ka is not None else ()
    return _rekord(
        Porownanie(
            kryterium_id=kryterium_id,
            opis_pl=opis_pl,
            relacja="NIE_WIECEJ",
            wielkosc_pl="prąd zwarciowy początkowy maksymalny w punkcie zabudowy",
            warunek_latex=r"I''_{k,max} \le I_{cu}",
            symbol_latex="I''_{k,max}",
            jednostka="kA",
            wynik=ik_max_ka,
            limit=kandydat.zdolnosc_wylaczania_ka,
            limit_pl=_OPIS_POLA_ZDOLNOSCI_PL[kandydat.kind],
            braki=(
                ("prąd zwarciowy I″k,max w punkcie zabudowy (bieg zwarciowy IEC 60909)",)
                if ik_max_ka is None
                else (
                    (f"pole katalogu „{pole}” kandydata — zdolność wyłączania nieznana",)
                    if kandydat.zdolnosc_wylaczania_ka is None
                    else ()
                )
            ),
        ),
        kandydat,
        podstawa=_PODSTAWA_ZWARCIOWA,
        podstawa_limitu=(
            podstawa_katalogu(kandydat.nazwa, _OPIS_POLA_ZDOLNOSCI_PL[kandydat.kind])
            if kandydat.zdolnosc_wylaczania_ka is not None
            else podstawa_nieustalona(f"pole katalogu „{pole}” kandydata „{kandydat.nazwa}”")
        ),
        dane_przyjete=dane,
        zakres=_ZAKRES_DOBORU_ZWARCIOWY,
        slad=(
            OdnosnikSladu(
                krok="iec60909:ikss_punktu_zabudowy",
                opis_pl="Prąd zwarciowy początkowy w punkcie zabudowy z biegu zwarciowego IEC 60909",
            ),
        ),
    )


def ocena_zdolnosci_nie_dotyczy(
    *, kandydat: KandydatAparatuNn, kryterium_id: str, opis_pl: str, powod_pl: str
) -> OcenaKryterium:
    """Rekord K ``NIE_DOTYCZY`` zdania zdolności wyłączania, które nie ma sensu dla rodzaju
    aparatu (np. własna zdolność gołego rozłącznika bezpiecznikowego) — pytanie bez sensu,
    nie brak danych; agregat pomija go (``rozstrzygniecie``)."""
    return _rekord(
        Porownanie(
            kryterium_id=kryterium_id,
            opis_pl=opis_pl,
            relacja="NIE_WIECEJ",
            wielkosc_pl="prąd zwarciowy początkowy maksymalny w punkcie zabudowy",
            warunek_latex=r"I''_{k,max} \le I_{cu}",
            symbol_latex="I''_{k,max}",
            jednostka="kA",
            dotyczy=False,
            powod_stosowalnosci_pl=powod_pl,
        ),
        kandydat,
        podstawa=_PODSTAWA_ZWARCIOWA,
        zakres=_ZAKRES_DOBORU_ZWARCIOWY,
    )


def _kryterium_zdolnosc_wylaczania(
    *,
    kandydat: KandydatAparatuNn,
    ik_max_ka: float | None,
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
) -> KryteriumWynik:
    """(iii) Ik″max <= Icu/Icn/Ic-warunkowy w punkcie zabudowy (rekord K).

    ``dane_przyjete`` — dane, na których stoi Ik″max (punkt w sieci nN liczonej z wartością
    roboczą tolerancji, karta TOLERANCJA-NN-WARTOSC-ROBOCZA): dowód rekordu, lista i zdanie
    uzasadnienia. Brak Ik″max (bieg zwarciowy niedostarczony) — rekord bez wyniku
    (``NIE_OCENIONO``); brak zdolności wyłączania w katalogu — rekord bez limitu
    (``BRAK_PODSTAWY``); nigdy spełnienie bez liczb.
    """
    pole = _POLE_ZDOLNOSCI[kandydat.kind]
    dane = dane_przyjete if ik_max_ka is not None else ()
    ocena = ocena_zdolnosci_wylaczania(
        kandydat=kandydat, ik_max_ka=ik_max_ka, dane_przyjete=dane_przyjete
    )
    if ik_max_ka is None:
        return _z_oceny(
            "Zdolność wyłączania >= Ik″max",
            ocena,
            "Brak Ik″max w punkcie zabudowy (bieg zwarciowy nie dostarczony).",
            {"zdolnosc_wylaczania_ka": kandydat.zdolnosc_wylaczania_ka},
        )
    if kandydat.zdolnosc_wylaczania_ka is None:
        uzasadnienie = (
            f"Katalog nie niesie pola '{pole}' dla tego kandydata — zdolność wyłączania "
            "nieznana (zero fabrykacji)."
        )
        wartosci: dict[str, Any] = {"ik_max_ka": ik_max_ka}
    else:
        uzasadnienie = (
            f"Zdolność wyłączania={kandydat.zdolnosc_wylaczania_ka:g} kA "
            f"{'>=' if _spelnia(ocena) else '<'} Ik″max={ik_max_ka:g} kA."
        )
        wartosci = {
            "zdolnosc_wylaczania_ka": kandydat.zdolnosc_wylaczania_ka,
            "ik_max_ka": ik_max_ka,
        }
    if dane:
        nazwy = "; ".join(d.nazwa_pl for d in dane)
        uzasadnienie = (
            f"{uzasadnienie} Ik″max liczony z daną przyjętą (wartość robocza): {nazwy} "
            "— ocena na danej przyjętej, nie potwierdzony dowód zgodności."
        )
    return _z_oceny("Zdolność wyłączania >= Ik″max", ocena, uzasadnienie, wartosci, dane)


def _kryterium_swz(
    *,
    kandydat: KandydatAparatuNn,
    ik1_min_a: float,
    u0_v: float,
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
) -> KryteriumWynik:
    """(iv) SWZ przy Ik_min — REUSE `application.analyses.swz.werdykt.ocen_swz`: rekord W
    samoczynnego wyłączenia (TN), status jako projekcja jego ocen składowych.

    Karta D1: `typ="MCCB"` ma teraz galaz w `ocen_swz` (Ia z nastawy Ii
    magnetycznej/bezzwłocznej, `kandydat.ii_a` — patrz docstring
    `KandydatAparatuNn`) — rekord bez limitu (nierozstrzygnięty), gdy `ii_a is None`.
    """
    typ = {
        KIND_MCB: "MCB",
        KIND_FUSE_SWITCH: "WKLADKA_GG",
    }.get(
        kandydat.kind, kandydat.kind
    )  # MCCB -> "MCCB"
    aparat = AparatZabezpieczajacy(
        typ=typ,
        in_a=kandydat.in_a,
        klasa_mcb=kandydat.klasa_mcb,
        ii_a=kandydat.ii_a if kandydat.kind == KIND_MCCB else None,
    )
    wynik = ocen_swz(
        ik1_min_a=ik1_min_a,
        u0_v=u0_v,
        aparat=aparat,
        dane_przyjete=dane_przyjete,
        przedmiot=_przedmiot_kandydata(kandydat),
    )
    return KryteriumWynik(
        nazwa="SWZ przy Ik_min",
        status=_status(wynik.wymaganie.oceny_skladowe),
        uzasadnienie_pl=wynik.przyczyna_pl,
        ocena=wynik.wymaganie,
        wyjasnienie=wynik.wyjasnienie,
        wartosci=wynik.to_dict(),
        dane_przyjete=wynik.dane_przyjete,
    )


# =============================================================================
# OCENA JEDNEGO KANDYDATA + PEŁNY DOBÓR
# =============================================================================


def oceniaj_przeciazenie_kandydata(
    *, kandydat: KandydatAparatuNn, ib_a: float, iz_prime_a: float
) -> tuple[KryteriumWynik, KryteriumWynik]:
    """Kryteria przeciążeniowe (i) Ib≤In≤Iz′ i (ii) I2≤1,45·Iz′ — niezależne od układu sieci nN.

    Karta W5-E-TTIT: w układzie TT/IT dobór wg SWZ przy Ik_min jest odmową nazwaną, ale ochrona
    przeciążeniowa przewodu obowiązuje tak samo — arkusz obwodów nN ocenia te dwa kryteria tym
    samym kodem, którym ocenia je dobór w TN (jedno źródło, zero drugiej kopii).
    """
    return (
        _kryterium_ib_in_iz(kandydat=kandydat, ib_a=ib_a, iz_prime_a=iz_prime_a),
        _kryterium_i2(kandydat=kandydat, iz_prime_a=iz_prime_a),
    )


def oceniaj_kandydata(
    *,
    kandydat: KandydatAparatuNn,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None,
    ik1_min_a: float,
    u0_v: float,
    dane_przyjete_ik_max: tuple[DanaPrzyjeta, ...] = (),
    dane_przyjete_ik1_min: tuple[DanaPrzyjeta, ...] = (),
) -> WynikKandydataNn:
    """Oceń JEDNEGO kandydata przeciw wszystkim czterem kryteriom (§0.5).

    ``dane_przyjete_ik_max`` / ``dane_przyjete_ik1_min`` — dane przyjęte, na których stoją
    prądy zwarciowe kryteriów (iii) i (iv) (wartość robocza tolerancji sieci nN).
    """
    kryteria = (
        *oceniaj_przeciazenie_kandydata(kandydat=kandydat, ib_a=ib_a, iz_prime_a=iz_prime_a),
        _kryterium_zdolnosc_wylaczania(
            kandydat=kandydat, ik_max_ka=ik_max_ka, dane_przyjete=dane_przyjete_ik_max
        ),
        _kryterium_swz(
            kandydat=kandydat,
            ik1_min_a=ik1_min_a,
            u0_v=u0_v,
            dane_przyjete=dane_przyjete_ik1_min,
        ),
    )
    kwalifikuje = all(k.status == KryteriumStatus.SPELNIA for k in kryteria)
    return WynikKandydataNn(kandydat=kandydat, kryteria=kryteria, kwalifikuje_sie=kwalifikuje)


def ocen_kandydatow_nn(
    *,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None,
    ik1_min_a: float,
    u0_v: float,
    kandydaci: tuple[KandydatAparatuNn, ...],
    dane_przyjete_ik1_min: tuple[DanaPrzyjeta, ...] = (),
) -> WynikDoboruAparatuNn:
    """Oceń WSZYSTKICH kandydatów i zwróć deterministyczny ranking.

    Ranking: kandydaci kwalifikujący się (wszystkie kryteria SPEŁNIA) NA
    POCZĄTKU listy, posortowani wg najmniejszego In (tie-break: id);
    niekwalifikujący się ZA nimi, tym samym kluczem sortowania (pełna
    przejrzystość — żaden kandydat nie znika z odpowiedzi).

    Raises:
        ValueError: ``ib_a < 0``, ``iz_prime_a <= 0`` albo
            ``ik1_min_a < 0``.
    """
    if ib_a < 0:
        raise ValueError(f"ib_a nie może być ujemne, otrzymano {ib_a}.")
    if iz_prime_a <= 0:
        raise ValueError(f"iz_prime_a musi być dodatnie, otrzymano {iz_prime_a}.")
    if ik1_min_a < 0:
        raise ValueError(f"ik1_min_a nie może być ujemne, otrzymano {ik1_min_a}.")

    oceny = [
        oceniaj_kandydata(
            kandydat=k,
            ib_a=ib_a,
            iz_prime_a=iz_prime_a,
            ik_max_ka=ik_max_ka,
            ik1_min_a=ik1_min_a,
            u0_v=u0_v,
            dane_przyjete_ik1_min=dane_przyjete_ik1_min,
        )
        for k in kandydaci
    ]
    oceny_posortowane = tuple(
        sorted(oceny, key=lambda w: (not w.kwalifikuje_sie, w.kandydat.in_a, w.kandydat.id))
    )
    rekomendacja = next(
        (w.kandydat for w in oceny_posortowane if w.kwalifikuje_sie),
        None,
    )

    sig_data = {
        "ib_a": ib_a,
        "iz_prime_a": iz_prime_a,
        "ik_max_ka": ik_max_ka,
        "ik1_min_a": ik1_min_a,
        "u0_v": u0_v,
        "kandydaci": [w.to_dict() for w in oceny_posortowane],
        "rekomendacja": rekomendacja.to_dict() if rekomendacja else None,
    }
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    return WynikDoboruAparatuNn(
        ib_a=ib_a,
        iz_prime_a=iz_prime_a,
        ik_max_ka=ik_max_ka,
        ik1_min_a=ik1_min_a,
        u0_v=u0_v,
        kandydaci=oceny_posortowane,
        rekomendacja=rekomendacja,
        deterministic_signature=signature,
        dane_przyjete_ik1_min=dane_przyjete_ik1_min,
    )


# =============================================================================
# KANDYDACI Z KATALOGU
# =============================================================================


def _resolwuj_nastawy_mccb(
    aparat: LVApparatusType,
) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    """Resolwuj nastawy wyzwalacza elektronicznego MCCB do wartości absolutnych.

    Karta D1 (nN, „runda 8 — PEŁNY WERDYKT nN"). Katalog niesie
    ``LVApparatusType.ir_range``/``isd_range``/``ii_range``/``tr_range``/
    ``tsd_range`` jako ZAKRESY nastawialności (xIn/xIr/[s]) — DOBÓR wymaga
    KONKRETNEJ wartości (kontrakt `compute_mccb_point`). Cienki wrapper —
    formuła rozwiązywania (górny kraniec zakresu, worst-case) żyje w
    ``network_model.catalog.lv_mccb_settings_iec60947_2`` (karta D2, REUSE —
    JEDNO miejsce dla doboru KANDYDATA tutaj i weryfikacji aparatu JUŻ
    ZAINSTALOWANEGO w ``application.analyses.swz.service``/
    ``application.proof_engine.lv_circuit_verification_binding``, zamiast
    dwóch równoległych kopii tej samej fizyki — patrz docstring tamtego
    modułu).

    Zwraca ``(ir_a, isd_a, ii_a, tr_s, tsd_s)``.
    """
    return resolwuj_nastawy_mccb_z_zakresow(
        i_n_a=aparat.i_n_a,
        ir_range=aparat.ir_range,
        isd_range=aparat.isd_range,
        ii_range=aparat.ii_range,
        tr_range=aparat.tr_range,
        tsd_range=aparat.tsd_range,
    )


def zbierz_kandydatow_z_katalogu(
    catalog: CatalogRepository | None = None,
) -> tuple[KandydatAparatuNn, ...]:
    """Zbuduj pełną listę kandydatów instalowalnych z katalogu nN.

    MCB: jeden kandydat na typ `LVBreakerMcbType` (icn_ka).
    FUSE_SWITCH: jeden kandydat na PARĘ (rozłącznik bezpiecznikowy, wkładka)
        — WYŁĄCZNIE gdy prąd wkładki <= prąd znamionowy korpusu rozłącznika
        (ograniczenie fizyczne, nie normatywne odgadywanie).
    MCCB: jeden kandydat na typ `LVApparatusType` z device_kind
        WYLACZNIK_GLOWNY/WYLACZNIK_ODPLYWOWY (i_cu_ka).

    Deterministyczne: kolejność wynikowa zależy WYŁĄCZNIE od kolejności
    repozytorium katalogu (już deterministyczna — `CatalogRepository._sorted`).
    """
    repo = catalog if catalog is not None else get_default_mv_catalog()
    kandydaci: list[KandydatAparatuNn] = []

    for mcb in repo.list_lv_breaker_mcb_types():
        kandydaci.append(
            KandydatAparatuNn(
                id=mcb.id,
                nazwa=mcb.name,
                kind=KIND_MCB,
                in_a=mcb.in_a,
                zdolnosc_wylaczania_ka=mcb.icn_ka,
                klasa_mcb=mcb.curve_class,
                manufacturer=mcb.manufacturer,
            )
        )

    apparaty = [
        a for a in repo.list_lv_apparatus_types() if a.device_kind == "ROZLACZNIK_BEZPIECZNIKOWY"
    ]
    wkladki = repo.list_lv_fuse_link_types()
    for apparat in apparaty:
        for wkladka in wkladki:
            if wkladka.in_a > apparat.i_n_a:
                continue
            kandydaci.append(
                KandydatAparatuNn(
                    id=f"{apparat.id}+{wkladka.id}",
                    nazwa=f"{apparat.name} + {wkladka.name}",
                    kind=KIND_FUSE_SWITCH,
                    in_a=wkladka.in_a,
                    zdolnosc_wylaczania_ka=apparat.conditional_sc_current_ka,
                    fuse_breaking_capacity_ka=wkladka.breaking_capacity_ka,
                    manufacturer=apparat.manufacturer,
                )
            )

    for aparat in repo.list_lv_apparatus_types():
        if aparat.device_kind not in ("WYLACZNIK_GLOWNY", "WYLACZNIK_ODPLYWOWY"):
            continue
        ir_a, isd_a, ii_a, tr_s, tsd_s = _resolwuj_nastawy_mccb(aparat)
        kandydaci.append(
            KandydatAparatuNn(
                id=aparat.id,
                nazwa=aparat.name,
                kind=KIND_MCCB,
                in_a=aparat.i_n_a,
                zdolnosc_wylaczania_ka=aparat.i_cu_ka,
                manufacturer=aparat.manufacturer,
                ir_a=ir_a,
                isd_a=isd_a,
                ii_a=ii_a,
                tr_s=tr_s,
                tsd_s=tsd_s,
            )
        )

    return tuple(kandydaci)


# =============================================================================
# ORKIESTRACJA PER OBWÓD
# =============================================================================


def odmowa_doboru_nadpradowego_tt_it(system: str) -> tuple[str, str]:
    """Odmowa NAZWANA doboru aparatu nadprądowego wg SWZ przy Ik_min w układzie TT/IT.

    Karta W5-E-TTIT: kryterium samoczynnego wyłączenia przy Ik1_min dotyczy pętli L-PE/L-PEN
    układu TN. W układzie TT/IT ochronę przeciwporażeniową ocenia werdykt SWZ TT/IT (RCD,
    napięcie dotykowe, pojemności sieci — `swz/werdykt_tt_it.py`), a warunki dopuszczające
    aparat nadprądowy w tych układach są tekstem normy spoza repozytorium — kod limitu, nie
    werdykt „nie spełnia" bez podstawy. Jedno źródło tekstu dla doboru i arkusza obwodów nN.
    """
    return (
        (
            f"Układ {system}: dobór aparatu nadprądowego wg kryterium samoczynnego wyłączenia "
            "przy Ik1_min dotyczy pętli L-PE/L-PEN układu TN. Ochronę przeciwporażeniową "
            "w tym układzie ocenia werdykt SWZ TT/IT (wyłącznik różnicowoprądowy, napięcie "
            "dotykowe, pojemności sieci); warunki dopuszczające aparat nadprądowy w układzie "
            f"{system} czekają na tekst normy IEC 60364-4-41 od właściciela."
        ),
        KOD_LIMIT_BRAK_TEKSTU_NORMY,
    )


@dataclass(frozen=True)
class Ik1MinObwodu:
    """Ik1_min [A] i U0 [V] obwodu albo nazwany brak; ``dane_przyjete`` — dane, na których
    stoi Ik1_min (wartość robocza tolerancji sieci nN, karta TOLERANCJA-NN-WARTOSC-ROBOCZA)."""

    ik1_min_a: float | None
    u0_v: float | None
    missing_data: list[str]
    reason_pl: str | None
    kod_odmowy: str | None
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()


def _ik1_min_i_u0(enm: EnergyNetworkModel, station_ref: str, bus_ref: str) -> Ik1MinObwodu:
    """Ik1_min [A] i U0 [V] dla obwodu (scenariusz MIN, ta sama fizyka co SWZ).

    Pierwsze dwa pola ``None`` przy braku danych, `missing_data`/`reason_pl` nazywają powód,
    a ``kod_odmowy`` jest ustawiony dla odmowy nazwanej (strona dolna spoza pasma nN).
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return Ik1MinObwodu(None, None, ["station"], None, None)

    # Transformator ZASILAJĄCY punkt (właściciel szyny po zamkniętych gałęziach),
    # nie „pierwszy transformator stacji" — klasa B-02 (stacja 2×TR, sekcja 2).
    trafo, transformer_missing = resolve_transformer_for_bus(enm, station, bus_ref)
    if trafo is None:
        return Ik1MinObwodu(None, None, transformer_missing, None, None)

    # W5-A: układ sieci nN z transformatora zasilającego; brak/TT/IT = odmowa nazwana.
    system = uklad_nn_transformatora(trafo)
    odmowa = odmowa_analizy_nn({}, trafo)
    if odmowa is not None:
        return Ik1MinObwodu(
            None,
            None,
            list(odmowa.get("missing_data", [])),
            odmowa.get("reason_pl"),
            odmowa.get("kod_odmowy"),
        )
    assert system is not None
    if not uklad_tn(system):
        reason_pl, kod = odmowa_doboru_nadpradowego_tt_it(system)
        return Ik1MinObwodu(None, None, [], reason_pl, kod)

    z_tr, missing = _transformer_loop_impedance(trafo)
    if z_tr is None:
        return Ik1MinObwodu(None, None, missing, None, None)

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return Ik1MinObwodu(None, None, upstream_missing, None, None)

    try:
        path = path_to_bus(enm, trafo.lv_bus_ref, bus_ref)
        segments = route_segments_min_scenario(path)
    except RouteExtractionError as exc:
        return Ik1MinObwodu(None, None, ["route"], str(exc), None)

    phase_component, return_component = sum_phase_and_return_route(segments)
    net_type, protection = typ_sieci_solvera(system)
    u_phase_v = napiecie_fazowe_v(kv_na_v(trafo.ulv_kv))

    loop_result = oblicz_petle_na_trasie(
        enm=enm,
        trafo=trafo,
        fault_node_id=bus_ref,
        u_phase_v=u_phase_v,
        net_type=net_type,
        protection=protection,
        z_tr=z_tr,
        upstream=upstream,
        phase_component=phase_component,
        return_component=return_component,
    )
    return Ik1MinObwodu(
        loop_result.ik_min_a,
        u_phase_v,
        [],
        None,
        None,
        dane_przyjete_petli(loop_result, nazwa_po_identyfikatorze(bus_ref, enm)),
    )


def wybierz_aparat_dla_obwodu_nn(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    bus_ref: str,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None,
    catalog: CatalogRepository | None = None,
) -> dict[str, Any]:
    """Dobór aparatu nN dla obwodu — orkiestracja per obwód (API layer).

    Ib, Iz′ i Ik″max są PARAMETRAMI WEJŚCIOWYMI (nie liczone tutaj):
      - Ib to prąd OBLICZENIOWY obwodu z definicji IEC 60364-4-43 §433.1 —
        wielkość PROJEKTOWA, nie wyprowadzona z jednego biegu rozpływu
        (wzorzec: `czasy_wylaczenia_pol_stacji(ik_pol_ka=...)` w tym samym
        module — Ik przyjmowane jako parametr, nie resolwowane wewnątrz).
      - Iz′ pochodzi z `network_model.solvers.cable_ampacity_derating`
        (osobny, już istniejący krok — ten moduł go NIE powtarza).
      - Ik″max pochodzi z biegu zwarciowego IEC 60909 w punkcie zabudowy
        (osobny bieg, jak przy `czasy_wylaczenia_pol_stacji`).

    Ik1_min/U0 SĄ resolwowane tutaj (ta sama fizyka co SWZ, patrz
    `_ik1_min_i_u0`) — to JEDYNA wielkość niezależna od wyboru kandydata.
    """
    obwod = _ik1_min_i_u0(enm, station_ref, bus_ref)
    ik1_min_a, u0_v, missing, reason_pl, kod_odmowy = (
        obwod.ik1_min_a,
        obwod.u0_v,
        obwod.missing_data,
        obwod.reason_pl,
        obwod.kod_odmowy,
    )
    if kod_odmowy is not None:
        return {
            "status": "nie dotyczy",
            "kod_odmowy": kod_odmowy,
            "station_ref": station_ref,
            "bus_ref": bus_ref,
            "missing_data": missing,
            "reason_pl": reason_pl,
        }
    if ik1_min_a is None or u0_v is None:
        return {
            "status": "brak danych",
            "station_ref": station_ref,
            "bus_ref": bus_ref,
            "missing_data": missing,
            "reason_pl": reason_pl,
        }

    kandydaci = zbierz_kandydatow_z_katalogu(catalog)
    wynik = ocen_kandydatow_nn(
        ib_a=ib_a,
        iz_prime_a=iz_prime_a,
        ik_max_ka=ik_max_ka,
        ik1_min_a=ik1_min_a,
        u0_v=u0_v,
        kandydaci=kandydaci,
        dane_przyjete_ik1_min=obwod.dane_przyjete,
    )
    return {
        "status": "OK",
        "station_ref": station_ref,
        "bus_ref": bus_ref,
        "dobor": wynik.to_dict(),
        "missing_data": [],
    }

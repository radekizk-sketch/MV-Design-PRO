"""
LV_CIRCUIT_VERIFICATION Proof Pack — Pakiet dowodowy weryfikacji obwodu nN

STATUS: CANONICAL & BINDING
Reference: docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.10, docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md
(G-21), docs/nn/UZGODNIENIA_WATKOW_2026-08-13.md (runda 5b — dwa zdania zdolności
wyłączania).

Generuje dowód WERYFIKACJI (nie doboru) obwodu nN już zainstalowanego w modelu:
odcinek kablowy + aparat zabezpieczający, w 10 krokach (A10 §9 — 10-krokowa
procedura weryfikacji obwodu nN — jest WZMIANKOWANA w rejestrze G (wiersz G-21)
i w audycie A (§3 „Źródła szczegółowe"), ale sam raport A10 NIE jest zapisany w
repo: audyt A–I jest syntezą 10 równoległych audytów obszarowych, których pełne
raporty żyły wyłącznie w sesji audytowej. Poniższa dziesięciokrokowa struktura
jest więc WYPROWADZONA przez wykonawcę karty P0.10 wprost z:
  - §0.1 karty P0.10 (H_PLAN_IMPLEMENTACJI_NN.md) — pięć klas kryteriów: Iz′ z
    korektami, In≤Iz′, I2≤1,45·Iz′, I²t≤k²S², SWZ, zdolność wyłączania,
  - G-21 (macierz luk) — „procedura 10-krokowa",
  - I §1 (macierz testów) — T-N1..T-N8 nazywają dokładnie te same wielkości.

KROKI (mapowanie krok → dostawca wyniku, ZERO trzeciej fizyki — generator
KONSUMUJE wyniki istniejących solverów/analiz, tylko nazywa/porównuje):

  1. S = sqrt(P²+Q²)                        REUSE EQ_LC_001 (formuła P15)
  2. Ib = S/(sqrt(3)·U_LL)                   REUSE EQ_LC_002 (formuła P15)
  3. Iz′ = Iz · f_θ · f_ρ · f_N              NEW EQ_LVCV_001 — iloczyn REUSE
     `network_model.solvers.cable_ampacity_derating.obciazalnosc_skorygowana`
     (G-D1: `wspolczynniki_nn`)
  4. Dobór: Ib ≤ In ≤ Iz′                    NEW EQ_LVCV_002 (IEC 60364-4-43 §433.1) —
     rekord W z REUSE `application.analyses.nn_device_selection.
     oceniaj_przeciazenie_kandydata` (ta sama reguła co dobór i arkusz obwodów)
  5. I2 ≤ 1,45·Iz′                           NEW EQ_LVCV_003 — rekord K z tego samego
     wywołania: I2 = 1,45·In (MCB, IEC 60898-1), If = 1,6·In wkładki gG (IEC 60269-1),
     1,3·Ir wyzwalacza elektronicznego MCCB (IEC 60947-2, gdy nastawa Ir/tr rozwiązana)
  6. Zdolność wyłączania wobec Ik″max        NEW EQ_LVCV_004 — DWA ZDANIA jako dwa rekordy
     K (kombinacja aparat+wkładka / goły aparat, runda 5b), reguła liczbowa REUSE
     `nn_device_selection.ocena_zdolnosci_wylaczania`
  7. I²t ≤ k²S²                              NEW EQ_LVCV_005 — REUSE
     `network_model.solvers.conductor_thermal_withstand.
     check_conductor_thermal_withstand` (k z `derive_k_iec60949` gdy katalog milczy)
  8. ΔU dowód (łańcuch, kanon kV)            REUSE EQ_VDROP_007 (P0.5b) — REUSE
     `application.proof_engine.vdrop_chain_binding` (headline: U_source, ΔU_total,
     U_target; rozkład per-odcinek pozostaje w osobnym pakiecie VDROP,
     `GET /api/analysis-runs/{run}/pakiet-dowodowy`)
  9. Ik1_min = c_min·U0/|Z_loop|             NEW EQ_LVCV_006 — REUSE
     `network_model.solvers.fault_loop_iec60364.compute_fault_loop`
  10. SWZ: Ik1_min ≥ Ia(t_wym)               NEW EQ_LVCV_007 — REUSE
     `application.analyses.swz.werdykt.ocen_swz`

ANTY-CYRKULARNOŚĆ (wzorzec PODSTAWA-VDROP): żadna wartość kroku nie pochodzi z
samego dowodu. Kroki 1-2, 4-5 są arytmetyką jawnie wykonywaną W TYM generatorze
(dokładnie ten sam wzorzec co P15/`generate_load_currents_proof` i inne pakiety —
proste działania na WEJŚCIACH `LVCircuitVerificationInput`, nie na wyniku
dowodu). Kroki 3, 7, 9, 10 konsumują GOTOWE obiekty wyniku (`ConductorThermalResult`,
`FaultLoopResult`, `SwzResult`) zwrócone przez solvery/analizy WYWOŁANE PRZED
złożeniem tego pakietu (zob. `application.proof_engine.
lv_circuit_verification_binding`) — pakiet ich NIE przelicza, tylko odczytuje pola.

INVARIANTS:
- Solvery nietknięte — pack tylko mapuje wyniki na ProofDocument.
- Deterministyczny — to samo wejście → identyczny dowód.
- LaTeX-only math (blokowy $$...$$).
- Rozdzielenie dwóch zdań zdolności wyłączania (runda 5b) — NIGDY jedno pole.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.analyses.nn_device_selection import (
    KandydatAparatuNn,
    ocena_zdolnosci_nie_dotyczy,
    ocena_zdolnosci_wylaczania,
    oceniaj_przeciazenie_kandydata,
)
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
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
from enm.dane_przyjete_galezi import dane_przyjete_z_zapisu
from network_model.catalog.wartosci_robocze import (
    dana_przyjeta_tolerancji_nn,
    dane_przyjete_maszyn,
)
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import ka_na_a, prad_z_mocy_pozornej_ka
from network_model.solvers.cable_ampacity_derating import (
    WspolczynnikiObciazalnosciNN,
    obciazalnosc_skorygowana,
)
from network_model.solvers.conductor_thermal_withstand import ConductorThermalResult
from network_model.solvers.fault_loop_iec60364 import FaultLoopResult
from werdykt import DanaPrzyjeta, OcenaKryterium, WynikWymagania
from werdykt.porownanie import projekcja_statusu, relacja_latex

# =============================================================================
# Rodzaje urządzenia chroniącego obwód — namespace'y katalogu nN (P0.2/P0.7)
# =============================================================================

KIND_MCB = "MCB"
KIND_FUSE_SWITCH = "FUSE_SWITCH"
KIND_MCCB = "MCCB"
_KINDY_DOZWOLONE = (KIND_MCB, KIND_FUSE_SWITCH, KIND_MCCB)


@dataclass(frozen=True)
class UrzadzenieOchronneNn:
    """Aparat FAKTYCZNIE zainstalowany na WERYFIKOWANYM obwodzie (nie kandydat
    z rankingu doboru — P0.7 `nn_device_selection` to osobna zdolność).

    Attributes:
        kind: ``KIND_MCB`` | ``KIND_FUSE_SWITCH`` | ``KIND_MCCB``.
        id: Identyfikator katalogowy (albo złożony ``aparat+wkładka``).
        nazwa: Nazwa czytelna.
        in_a: Prąd znamionowy decydujący o funkcji ochronnej (dla
            ``FUSE_SWITCH`` — prąd wkładki, nie korpusu rozłącznika).
        klasa_mcb: Klasa wyzwolenia B/C/D — WYŁĄCZNIE dla ``KIND_MCB``.
        wlasna_zdolnosc_ka: WŁASNA zdolność wyłączania GOŁEGO aparatu —
            ``icn_ka`` (MCB, IEC 60898-1) albo ``i_cu_ka`` (MCCB, IEC 60947).
            ``None`` dla ``FUSE_SWITCH`` (rozłącznik bezpiecznikowy sam w
            sobie NIE MA tej zdolności — zapadka NIE_DOTYCZY z katalogu SN,
            karta UM-ICU-KATALOG, działa tu identycznie) albo gdy katalog
            milczy dla MCB/MCCB.
        conditional_sc_current_ka: Prąd zwarciowy warunkowy KOMBINACJI
            aparat+wkładka — WYŁĄCZNIE dla ``KIND_FUSE_SWITCH``, ``None`` gdy
            obwód nie ma zainstalowanej wkładki (rozłącznik goły) albo
            katalog nie niesie tej wartości.
        fuse_breaking_capacity_ka: Własna zdolność wyłączania SAMEJ wkładki
            (``LVFuseLinkType.breaking_capacity_ka``) — pole informacyjne
            (wkładka ZAWSZE ją ma, runda 5b), nie wchodzi do żadnego z dwóch
            zdań kroku 6 (te dotyczą kombinacji i gołego aparatu, nie samej
            wkładki z osobna).
        ii_a: Nastawa zwarciowa/bezzwłoczna Ii [A] wyzwalacza elektronicznego
            (karta D2, nN „runda 8", 2026-08-14) — WYŁĄCZNIE dla
            ``KIND_MCCB``, resolwowana z zakresu regulacji katalogu
            (``ir_range``/``isd_range``/``ii_range``, REUSE
            `network_model.catalog.lv_mccb_settings_iec60947_2.
            resolwuj_nastawy_mccb`). Konsument: krok 10 SWZ
            (``ocen_swz``, wymaga ``ii_a`` do rozstrzygnięcia typ="MCCB" —
            bez niej werdykt SWZ dla KAŻDEGO zainstalowanego MCCB był
            bezwarunkowo NIEROZSTRZYGALNY mimo istniejącej gałęzi karty D1,
            defekt naprawiony kartą D2). ``None`` dla pozostałych ``kind``
            albo gdy katalog nie niesie zakresu ``ii_range``.
        ir_a, isd_a, tr_s, tsd_s: Nastawy długo-/krótkozwłoczne wyzwalacza
            elektronicznego (karta ARKUSZ-NN, nN „runda 9", 2026-08-14) —
            WYŁĄCZNIE dla ``KIND_MCCB``, resolwowane z TEGO SAMEGO wywołania
            `resolwuj_nastawy_mccb` co ``ii_a`` powyżej (jeden odczyt, pięć pól
            — bez tego agregator arkusza obliczeń (`application.analyses.
            nn_circuit_sheet`) nie miałby z czego ocenić kryterium (ii)
            I2<=1,45·Iz′ dla zainstalowanego MCCB: `ir_a`/`tr_s` są tam
            WYMAGANE przez `nn_device_selection._kryterium_i2`, nie tylko
            `ii_a` (który służy WYŁĄCZNIE SWZ, krok 10). ``None`` dla
            pozostałych ``kind`` albo gdy katalog nie niesie odpowiedniego
            zakresu.
    """

    kind: str
    id: str
    nazwa: str
    in_a: float
    klasa_mcb: str | None = None
    wlasna_zdolnosc_ka: float | None = None
    conditional_sc_current_ka: float | None = None
    fuse_breaking_capacity_ka: float | None = None
    ii_a: float | None = None
    ir_a: float | None = None
    isd_a: float | None = None
    tr_s: float | None = None
    tsd_s: float | None = None

    def __post_init__(self) -> None:
        if self.kind not in _KINDY_DOZWOLONE:
            raise OdmowaDanychError(
                f"Nieznany rodzaj urządzenia '{self.kind}' — dozwolone: {_KINDY_DOZWOLONE}."
            )
        if self.in_a <= 0:
            raise OdmowaDanychError(f"in_a musi być dodatnie, otrzymano {self.in_a}.")
        if self.kind == KIND_MCB and not self.klasa_mcb:
            raise OdmowaDanychError("Urządzenie MCB wymaga klasa_mcb (B/C/D).")

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "id": self.id,
            "nazwa": self.nazwa,
            "in_a": self.in_a,
            "klasa_mcb": self.klasa_mcb,
            "wlasna_zdolnosc_ka": self.wlasna_zdolnosc_ka,
            "conditional_sc_current_ka": self.conditional_sc_current_ka,
            "fuse_breaking_capacity_ka": self.fuse_breaking_capacity_ka,
            "ii_a": self.ii_a,
            "ir_a": self.ir_a,
            "isd_a": self.isd_a,
            "tr_s": self.tr_s,
            "tsd_s": self.tsd_s,
        }


# =============================================================================
# Pack input
# =============================================================================


@dataclass(frozen=True)
class LVCircuitVerificationInput:
    """Dane wejściowe pakietu dowodowego weryfikacji obwodu nN (10 kroków).

    Kroki 1-2 i 4-5 są ARYTMETYKĄ jawnie wykonywaną w generatorze na tych
    polach (ten sam wzorzec co P15/VDROP — proste działania na wejściach, nie
    na wyniku dowodu). Kroki 3, 7, 9, 10 konsumują GOTOWE obiekty wyniku
    solverów/analiz (zero drugiej fizyki, zob. docstring modułu).
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    station_ref: str
    bus_ref: str
    breaker_ref: str
    segment_ref: str
    #: Nazwa odcinka nN z modelu — tytuł dowodu; identyfikator zostaje w `segment_ref`
    #: (karta #144). Aparat nazywa `urzadzenie.nazwa`.
    nazwa_odcinka: str

    # Krok 1-2: S, Ib
    p_mw: float
    q_mvar: float
    u_ll_kv: float

    # Krok 3: Iz′ (REUSE cable_ampacity_derating)
    iz_katalogowe_a: float
    wspolczynniki: WspolczynnikiObciazalnosciNN

    # Krok 4-6: urządzenie zainstalowane + Ik″max w punkcie zabudowy
    urzadzenie: UrzadzenieOchronneNn
    ik_max_ka: float | None

    # Krok 7: I²t ≤ k²S² (REUSE conductor_thermal_withstand)
    thermal: ConductorThermalResult

    # Krok 8: ΔU dowód (REUSE vdrop_chain_binding / packs.vdrop — headline)
    vdrop_u_source_kv: float
    vdrop_delta_u_total_kv: float

    # Krok 9-10: pętla zwarcia minimalnego + SWZ (REUSE fault_loop_iec60364/swz.werdykt)
    fault_loop: FaultLoopResult
    #: Rekord W samoczynnego wyłączenia zasilania (TN: ``SwzResult.wymaganie``, TT/IT:
    #: ``SwzTtItWynik.wymaganie``) — jedno źródło rozstrzygnięcia kroku 10 i agregatu.
    swz_wymaganie: WynikWymagania
    swz_przyczyna_pl: str
    swz_ia_wymagane_a: float | None
    swz_t_wymagany_s: float | None
    swz_pasmo_u0: str
    swz_rodzaj_obwodu: str
    swz_margines: float | None

    vdrop_delta_u_total_percent: float | None = None

    #: Karta W5-E-TTIT: werdykt wyjaśnialny SWZ TT/IT (``swz.werdykt_tt_it.SwzTtItWynik``,
    #: ``to_dict()``) — obecny WYŁĄCZNIE gdy ``fault_loop.tt_it`` jest obecne (układ TT/IT);
    #: kroki 9-10 cytują wtedy pętlę doziemną i rekord werdyktu zamiast Ik1_min ≥ Ia(t_wym).
    swz_tt_it: dict[str, Any] | None = None


# =============================================================================
# Helpers (wzorzec protection_settings.py / sc_symmetrical.py)
# =============================================================================


def _pv(symbol: str, value: float | str, unit: str, source_key: str) -> ProofValue:
    if isinstance(value, str):
        return ProofValue(
            symbol=symbol, value=value, unit=unit, formatted=value, source_key=source_key
        )
    return ProofValue.create(
        symbol=symbol, value=value, unit=unit, source_key=source_key, precision=4
    )


def _eq(
    eq_id: str, latex: str, name_pl: str, standard_ref: str, symbols: list[SymbolDefinition]
) -> EquationDefinition:
    return EquationDefinition(
        equation_id=eq_id,
        latex=latex,
        name_pl=name_pl,
        standard_ref=standard_ref,
        symbols=tuple(symbols),
    )


def _sym(symbol: str, unit: str, desc: str, key: str) -> SymbolDefinition:
    return SymbolDefinition(symbol=symbol, unit=unit, description_pl=desc, mapping_key=key)


def _uc(expected: str, computed: str, derivation: str = "", passed: bool = True) -> UnitCheckResult:
    return UnitCheckResult(
        passed=passed, expected_unit=expected, computed_unit=computed, derivation=derivation
    )


# =============================================================================
# Krok 6 — dwa zdania inżynierskie zdolności wyłączania (runda 5b, BINDING)
# =============================================================================


#: Kody statusu wejścia SWZ i zdań kroku 6 USUNIĘTE (karta WERDYKT-MIGRACJA-190): oba
#: zdania zdolności wyłączania i SWZ niosą rekordy werdyktu wyjaśnialnego (``OcenaKryterium``
#: / ``WynikWymagania``), agregat pakietu jest projekcją rekordów (``rozstrzygniecie``).
#: NIE_DOTYCZY (pytanie bez sensu dla rodzaju aparatu) jest stanem rekordu K, odrębnym od braku
#: danych (``NIE_OCENIONO``) i braku podstawy (``BRAK_PODSTAWY``) — agregat pomija wyłącznie
#: NIE_DOTYCZY.

#: Identyfikatory kryteriów dwóch zdań kroku 6 (runda 5b — NIGDY jedno pole).
KRYTERIUM_ZDOLNOSCI_KOMBINACJI = "lvcv.zdolnosc_wylaczania.kombinacja"
KRYTERIUM_ZDOLNOSCI_GOLEGO_APARATU = "lvcv.zdolnosc_wylaczania.goly_aparat"
_OPIS_KOMBINACJI_PL = (
    "Prąd zwarciowy warunkowy kombinacji rozłącznik + wkładka nie mniejszy od spodziewanego "
    "prądu zwarciowego w punkcie zabudowy"
)
_OPIS_GOLEGO_APARATU_PL = (
    "Własna zdolność wyłączania gołego aparatu nie mniejsza od spodziewanego prądu "
    "zwarciowego w punkcie zabudowy"
)


def kandydat_z_urzadzenia(
    urzadzenie: UrzadzenieOchronneNn, *, zdolnosc_wylaczania_ka: float | None
) -> KandydatAparatuNn:
    """Aparat zainstalowany jako kandydat reguł doboru (``nn_device_selection``) — te same
    rekordy K przeciążeniowe i zwarciowe dla doboru i weryfikacji (jedno źródło reguły)."""
    return KandydatAparatuNn(
        id=urzadzenie.id,
        nazwa=urzadzenie.nazwa,
        kind=urzadzenie.kind,
        in_a=urzadzenie.in_a,
        zdolnosc_wylaczania_ka=zdolnosc_wylaczania_ka,
        klasa_mcb=urzadzenie.klasa_mcb,
        fuse_breaking_capacity_ka=urzadzenie.fuse_breaking_capacity_ka,
        ir_a=urzadzenie.ir_a,
        isd_a=urzadzenie.isd_a,
        ii_a=urzadzenie.ii_a,
        tr_s=urzadzenie.tr_s,
        tsd_s=urzadzenie.tsd_s,
    )


@dataclass(frozen=True)
class ZdolnoscWylaczaniaDwaZdania:
    """Dwa RÓŻNE zdania inżynierskie — NIGDY jedno pole (runda 5b) — każde jako rekord K.

    ``kombinacja`` — prąd warunkowy kombinacji rozłącznik + wkładka (WYŁĄCZNIE
    ``KIND_FUSE_SWITCH``; dla innych aparatów rekord ``NIE_DOTYCZY``). ``goly_aparat`` — własna
    zdolność wyłączania MCB/MCCB (dla ``KIND_FUSE_SWITCH`` rekord ``NIE_DOTYCZY``: rozłącznik
    bezpiecznikowy sam w sobie nie ma tej zdolności). Rozstrzygnięcie i zdanie niesie rekord;
    ``*_wartosc_ka`` to wartość katalogowa cytowana w kroku dowodu.
    """

    kombinacja: OcenaKryterium
    kombinacja_wartosc_ka: float | None
    goly_aparat: OcenaKryterium
    goly_aparat_wartosc_ka: float | None

    @property
    def zdanie_kombinacja_pl(self) -> str:
        return self.kombinacja.wyjasnienie.zdanie_pl

    @property
    def zdanie_goly_aparat_pl(self) -> str:
        return self.goly_aparat.wyjasnienie.zdanie_pl

    @property
    def oceny(self) -> tuple[OcenaKryterium, OcenaKryterium]:
        return (self.kombinacja, self.goly_aparat)


def ocen_zdolnosc_wylaczania_dwa_zdania(
    *,
    urzadzenie: UrzadzenieOchronneNn,
    ik_max_ka: float | None,
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
) -> ZdolnoscWylaczaniaDwaZdania:
    """Zbuduj DWA rekordy K (kombinacja aparat+wkładka / goły aparat) — runda 5b.

    Kombinacja: WYŁĄCZNIE dla ``KIND_FUSE_SWITCH``, limit ``conditional_sc_current_ka``.
    Goły aparat: limit ``wlasna_zdolnosc_ka`` dla MCB/MCCB; dla ``KIND_FUSE_SWITCH`` ZAWSZE
    ``NIE_DOTYCZY`` (niezależnie od tego, czy wkładka jest zainstalowana). Reguła liczbowa jest
    JEDNA z doborem (``nn_device_selection.ocena_zdolnosci_wylaczania``): brak I″k,max →
    ``NIE_OCENIONO``, brak pola katalogu → ``BRAK_PODSTAWY``, nigdy spełnienie bez liczb.
    """
    if urzadzenie.kind == KIND_FUSE_SWITCH:
        kandydat = kandydat_z_urzadzenia(
            urzadzenie, zdolnosc_wylaczania_ka=urzadzenie.conditional_sc_current_ka
        )
        kombinacja = ocena_zdolnosci_wylaczania(
            kandydat=kandydat,
            ik_max_ka=ik_max_ka,
            dane_przyjete=dane_przyjete,
            kryterium_id=KRYTERIUM_ZDOLNOSCI_KOMBINACJI,
            opis_pl=_OPIS_KOMBINACJI_PL,
        )
        goly = ocena_zdolnosci_nie_dotyczy(
            kandydat=kandydat,
            kryterium_id=KRYTERIUM_ZDOLNOSCI_GOLEGO_APARATU,
            opis_pl=_OPIS_GOLEGO_APARATU_PL,
            powod_pl=(
                "rozłącznik bezpiecznikowy sam w sobie nie ma własnej zdolności wyłączania "
                "zwarć (zapadka strukturalna katalogu) — jedyną wielkością tego aparatu jest "
                "prąd warunkowy kombinacji z wkładką"
            ),
        )
        return ZdolnoscWylaczaniaDwaZdania(
            kombinacja=kombinacja,
            kombinacja_wartosc_ka=urzadzenie.conditional_sc_current_ka,
            goly_aparat=goly,
            goly_aparat_wartosc_ka=None,
        )
    kandydat = kandydat_z_urzadzenia(
        urzadzenie, zdolnosc_wylaczania_ka=urzadzenie.wlasna_zdolnosc_ka
    )
    kombinacja = ocena_zdolnosci_nie_dotyczy(
        kandydat=kandydat,
        kryterium_id=KRYTERIUM_ZDOLNOSCI_KOMBINACJI,
        opis_pl=_OPIS_KOMBINACJI_PL,
        powod_pl=(
            f"aparat rodzaju {urzadzenie.kind} nie jest kombinacją rozłącznik + wkładka — nie ma "
            "prądu warunkowego kombinacji"
        ),
    )
    goly = ocena_zdolnosci_wylaczania(
        kandydat=kandydat,
        ik_max_ka=ik_max_ka,
        dane_przyjete=dane_przyjete,
        kryterium_id=KRYTERIUM_ZDOLNOSCI_GOLEGO_APARATU,
        opis_pl=_OPIS_GOLEGO_APARATU_PL,
    )
    return ZdolnoscWylaczaniaDwaZdania(
        kombinacja=kombinacja,
        kombinacja_wartosc_ka=None,
        goly_aparat=goly,
        goly_aparat_wartosc_ka=urzadzenie.wlasna_zdolnosc_ka,
    )


# =============================================================================
# Generator — 10 kroków
# =============================================================================


def _kroki_tn(data: LVCircuitVerificationInput, fl: FaultLoopResult) -> list[ProofStep]:
    """Kroki 9-10 układu TN: Ik1_min z pętli L-PE/L-PEN i SWZ Ik1_min ≥ Ia(t_wym)."""
    kroki: list[ProofStep] = []
    # ---------------------------------------------------------------
    # Krok 9: Ik1_min = c_min*U0/|Z_petli|                     NEW EQ_LVCV_006
    # ---------------------------------------------------------------
    eq9 = _eq(
        "EQ_LVCV_006",
        r"I_{k1,min} = \frac{c_{min} \cdot U_0}{|Z_{loop}|}",
        "Prąd zwarcia minimalnego z pętli",
        "IEC 60364-4-41 §411.4.4 / IEC 60909-0 §5.3.2 (c_min)",
        [
            _sym("I_{k1,min}", "A", "Prąd zwarcia jednofazowego minimalny", "ik1_min_a"),
            _sym("c_{min}", "—", "Współczynnik napięciowy minimalny", "c_min"),
            _sym("U_0", "V", "Napięcie fazowe znamionowe", "u0_v"),
            _sym("Z_{loop}", "Ω", "Moduł impedancji pętli zwarcia", "z_loop_magnitude_ohm"),
        ],
    )
    kroki.append(
        ProofStep(
            step_id=ProofStep.generate_step_id("LVCV", 9),
            step_number=9,
            title_pl="Prąd zwarcia minimalnego z pętli (scenariusz MIN)",
            equation=eq9,
            input_values=(
                _pv("c_{min}", fl.c_min, "—", "c_min"),
                _pv("U_0", fl.u_nom_v, "V", "u0_v"),
                _pv("Z_{loop}", fl.z_loop_magnitude_ohm, "Ω", "z_loop_magnitude_ohm"),
            ),
            substitution_latex=(
                f"$$I_{{k1,min}} = \\frac{{{fl.c_min:g} \\cdot {fl.u_nom_v:.2f}}}"
                f"{{{fl.z_loop_magnitude_ohm:.6f}}} = {fl.ik_min_a:.2f}\\;\\mathrm{{A}}$$"
            ),
            result=_pv("I_{k1,min}", fl.ik_min_a, "A", "ik1_min_a"),
            unit_check=_uc("A", "A", "(—) · V / Ω = A"),
            source_keys={
                "trasa": ";".join(c.label for c in fl.components),
                "network_type": fl.network_type.value,
                "c_zrodlo_min": fl.c_zrodlo_min,
            },
        )
    )

    # ---------------------------------------------------------------
    # Krok 10: SWZ Ik1_min >= Ia(t_wym)                        NEW EQ_LVCV_007
    # ---------------------------------------------------------------
    eq10 = _eq(
        "EQ_LVCV_007",
        r"I_{k1,min} \ge I_a(t_{wym})",
        "Samoczynne wyłączenie zasilania (SWZ)",
        "IEC 60364-4-41 Tab. 41.1 (G-D3)",
        [
            _sym("I_{k1,min}", "A", "Prąd zwarcia jednofazowego minimalny", "ik1_min_a"),
            _sym("I_a", "A", "Prąd zapewniający zadziałanie w czasie t_wym", "ia_wymagane_a"),
            _sym("t_{wym}", "s", "Czas wymagany wyłączenia (Tab. 41.1)", "t_wymagany_s"),
        ],
    )
    kroki.append(
        ProofStep(
            step_id=ProofStep.generate_step_id("LVCV", 10),
            step_number=10,
            title_pl=(
                f"SWZ — samoczynne wyłączenie zasilania (pasmo U0={data.swz_pasmo_u0}, "
                f"obwód {data.swz_rodzaj_obwodu})"
            ),
            equation=eq10,
            input_values=(
                _pv("I_{k1,min}", fl.ik_min_a, "A", "ik1_min_a"),
                _pv(
                    "I_a",
                    (
                        data.swz_ia_wymagane_a
                        if data.swz_ia_wymagane_a is not None
                        else "NIEDOSTĘPNE"
                    ),
                    "A",
                    "ia_wymagane_a",
                ),
                _pv(
                    "t_{wym}",
                    (data.swz_t_wymagany_s if data.swz_t_wymagany_s is not None else "NIEDOSTĘPNE"),
                    "s",
                    "t_wymagany_s",
                ),
            ),
            substitution_latex=_zdanie_latex(data.swz_przyczyna_pl),
            result=_pv("\\text{SWZ}", data.swz_wymaganie.etykieta.etykieta_pl, "—", "swz_ocena"),
            unit_check=_uc("A", "A", "A ≥ A (przy dowiedzionym t ≤ t_wym)"),
            source_keys={
                **_klucze_rekordu(data.swz_wymaganie),
                "zrodlo_czasu": "Tab. 41.1 IEC 60364-4-41 (G-D3)",
                "pasmo_u0": data.swz_pasmo_u0,
                "rodzaj_obwodu": data.swz_rodzaj_obwodu,
            },
        )
    )

    return kroki


def _wartosc_lub_brak(value: float | None) -> float | str:
    return value if value is not None else "NIEDOSTĘPNE"


def _liczba_lub_brak(value: Any) -> float | None:
    return float(value) if value is not None else None


def _wartosc_albo_stan(value: float | None, ocena: OcenaKryterium) -> float | str:
    """Wartość katalogowa zdania albo etykieta rekordu (np. „Nie dotyczy”), gdy jej brak."""
    return value if value is not None else ocena.etykieta.etykieta_pl


_ODWROTNA_RELACJA_LATEX = {r"\ge": r"\le", r"\le": r"\ge", "<": ">", ">": "<"}


def _relacja_odwrotna(ocena: OcenaKryterium) -> str:
    """Znak relacji rekordu zapisany od strony limitu (``I_b \\le I_n`` dla ``I_n \\ge I_b``)."""
    znak = relacja_latex(ocena)
    return _ODWROTNA_RELACJA_LATEX.get(znak, znak)


def _zdanie_latex(tekst: str) -> str:
    """Zdanie rekordu werdyktu jako blok ``\\text{}`` (bez znaków sterujących LaTeX)."""
    bezpieczny = tekst.replace("\\", "/").replace("{", "(").replace("}", ")")
    return "$$\\text{" + bezpieczny + "}$$"


def _klucze_rekordu(rekord: OcenaKryterium | WynikWymagania) -> dict[str, str]:
    """Odniesienie kroku dowodu do rekordu werdyktu (identyfikator, status maszynowy, etykieta)
    — rozstrzygnięcie kroku cytowane z rekordu, nie z drugiej kopii warunku."""
    identyfikator = (
        rekord.kryterium_id if isinstance(rekord, OcenaKryterium) else rekord.wymaganie_id
    )
    return {
        "rekord_id": identyfikator,
        "status_rekordu": rekord.status_maszynowy,
        "etykieta_rekordu": rekord.etykieta.etykieta_pl,
    }


def _kroki_tt_it(data: LVCircuitVerificationInput, fl: FaultLoopResult) -> list[ProofStep]:
    """Kroki 9-10 układów TT/IT (karta W5-E-TTIT).

    Krok 9 cytuje pętlę doziemną solvera ``petla_zwarcia_tt_it`` (TT: I_d przez R_A+R_B,
    EQ_LVCV_008; IT: I_d pierwszego zwarcia przez pojemności, EQ_LVCV_010, oraz I_d2 drugiego
    zwarcia, EQ_LVCV_011). Krok 10 cytuje rekord werdyktu wyjaśnialnego (``swz_tt_it``):
    zdanie, kryteria składowe ze statusami i podstawami — limit napięcia dotykowego U_L
    (EQ_LVCV_009) nie jest w repozytorium, więc kryterium ma status BRAK_PODSTAWY.
    """
    tt = fl.tt_it
    assert tt is not None
    assert data.swz_tt_it is not None
    kroki: list[ProofStep] = []
    uklad = tt.uklad.value

    if uklad == "TT":
        eq9 = _eq(
            "EQ_LVCV_008",
            r"I_d = \frac{c_{min} \cdot U_0}{|Z_s|},\quad Z_s = Z_{up} + Z_{TR} + Z_L + R_B + R_A",
            "Prąd zwarcia doziemnego w układzie TT",
            "IEC 60364-4-41 §411.5.3 (pętla doziemna TT) / IEC 60909-0 §5.3.2 (c_min)",
            [
                _sym("I_d", "A", "Prąd zwarcia doziemnego (L–PE przez uziomy)", "ik1_min_a"),
                _sym("c_{min}", "—", "Współczynnik napięciowy minimalny", "c_min"),
                _sym("U_0", "V", "Napięcie fazowe znamionowe", "u0_v"),
                _sym("Z_s", "Ω", "Moduł impedancji pętli doziemnej", "z_loop_magnitude_ohm"),
                _sym("R_A", "Ω", "Rezystancja uziomu instalacji odbiorczej", "r_a_ohm"),
                _sym("R_B", "Ω", "Rezystancja uziomu punktu neutralnego stacji", "r_b_ohm"),
            ],
        )
        kroki.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 9),
                step_number=9,
                title_pl="Prąd zwarcia doziemnego z pętli TT (scenariusz MIN)",
                equation=eq9,
                input_values=(
                    _pv("c_{min}", fl.c_min, "—", "c_min"),
                    _pv("U_0", fl.u_nom_v, "V", "u0_v"),
                    _pv("R_A", _wartosc_lub_brak(tt.r_a_ohm), "Ω", "r_a_ohm"),
                    _pv("R_B", _wartosc_lub_brak(tt.r_b_ohm), "Ω", "r_b_ohm"),
                    _pv("Z_s", fl.z_loop_magnitude_ohm, "Ω", "z_loop_magnitude_ohm"),
                ),
                substitution_latex=(
                    f"$$I_d = \\frac{{{fl.c_min:g} \\cdot {fl.u_nom_v:.2f}}}"
                    f"{{{fl.z_loop_magnitude_ohm:.6f}}} = {fl.ik_min_a:.2f}\\;\\mathrm{{A}}$$"
                ),
                result=_pv("I_d", fl.ik_min_a, "A", "ik1_min_a"),
                unit_check=_uc("A", "A", "(—) · V / Ω = A"),
                source_keys={
                    "trasa": ";".join(c.label for c in fl.components),
                    "network_type": fl.network_type.value,
                    "rodzaj_pradu": tt.rodzaj_pradu_pl,
                    "c_zrodlo_min": fl.c_zrodlo_min,
                },
            )
        )
    else:
        eq9 = _eq(
            "EQ_LVCV_010",
            r"I_d = 3 \cdot \omega \cdot C_e \cdot U_0,\quad \omega = 2\pi f",
            "Prąd pierwszego zwarcia doziemnego w układzie IT",
            "IEC 60364-4-41 §411.6 (układ IT, pierwsze zwarcie — prąd pojemnościowy)",
            [
                _sym("I_d", "A", "Prąd pierwszego zwarcia doziemnego", "i_d_pierwsze_zwarcie_a"),
                _sym("C_e", "F", "Pojemność doziemna jednej fazy sieci IT", "c_e_f"),
                _sym("f", "Hz", "Częstotliwość sieci", "czestotliwosc_hz"),
                _sym("U_0", "V", "Napięcie fazowe znamionowe", "u0_v"),
            ],
        )
        # Wynik pętli IT niesie komplet (solver odmawia bez pojemności/częstotliwości) —
        # brak którejś wielkości to błąd kontraktu, nie dana do podstawienia zerem.
        if (
            tt.i_d_pierwsze_zwarcie_a is None
            or tt.c_e_f is None
            or tt.czestotliwosc_hz is None
            or tt.u_ll_v is None
        ):
            raise OdmowaDanychError(
                "Wynik pętli doziemnej IT bez prądu pierwszego zwarcia, pojemności C_e, "
                "częstotliwości albo napięcia międzyprzewodowego — pakiet nie cytuje zera."
            )
        i_d1 = tt.i_d_pierwsze_zwarcie_a
        c_e = tt.c_e_f
        f_hz = tt.czestotliwosc_hz
        u_ll_v = tt.u_ll_v
        kroki.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 9),
                step_number=9,
                title_pl="Prąd pierwszego i drugiego zwarcia doziemnego w układzie IT",
                equation=eq9,
                input_values=(
                    _pv("C_e", c_e, "F", "c_e_f"),
                    _pv("f", f_hz, "Hz", "czestotliwosc_hz"),
                    _pv("U_0", fl.u_nom_v, "V", "u0_v"),
                    _pv("c_{min}", fl.c_min, "—", "c_min"),
                    _pv("U_{LL}", u_ll_v, "V", "u_ll_v"),
                    _pv("Z_s", fl.z_loop_magnitude_ohm, "Ω", "z_loop_magnitude_ohm"),
                ),
                substitution_latex=(
                    f"$$I_d = 3 \\cdot 2\\pi \\cdot {f_hz:g} \\cdot {c_e:.6e} \\cdot "
                    f"{fl.u_nom_v:.2f} = {i_d1:.4f}\\;\\mathrm{{A}}$$"
                    "$$I_{d2,min} = \\frac{c_{min} \\cdot U_{LL}}{2 \\cdot |Z_s|} = "
                    f"\\frac{{{fl.c_min:g} \\cdot {u_ll_v:.2f}}}"
                    f"{{2 \\cdot {fl.z_loop_magnitude_ohm:.6f}}} = {fl.ik_min_a:.2f}"
                    "\\;\\mathrm{A}\\quad(\\text{EQ\\_LVCV\\_011})$$"
                ),
                result=_pv("I_d", i_d1, "A", "i_d_pierwsze_zwarcie_a"),
                unit_check=_uc("A", "A", "(1/s) · F · V = A; (—) · V / Ω = A"),
                source_keys={
                    "trasa_drugiego_zwarcia": ";".join(c.label for c in fl.components),
                    "network_type": fl.network_type.value,
                    "rownanie_drugiego_zwarcia": "EQ_LVCV_011",
                    "c_zrodlo_min": fl.c_zrodlo_min,
                    "i_d2_min_a": f"{fl.ik_min_a:.4f}",
                    "odcinki_pojemnosci": ";".join(
                        str(o.get("branch_ref", "")) for o in tt.pojemnosci
                    ),
                },
            )
        )

    # Krok 10: werdykt wyjaśnialny — zdanie + kryteria składowe z podstawami
    wymaganie = data.swz_tt_it.get("wymaganie", {})
    wyjasnienie = wymaganie.get("wyjasnienie", {}) if isinstance(wymaganie, dict) else {}
    oceny = wymaganie.get("oceny_skladowe", []) if isinstance(wymaganie, dict) else []
    linie: list[str] = [str(wyjasnienie.get("zdanie_pl") or data.swz_przyczyna_pl)]
    for ocena in oceny:
        if not isinstance(ocena, dict):
            continue
        kryterium = ocena.get("kryterium", {}) or {}
        podstawa = ocena.get("podstawa", {}) or {}
        linie.append(
            f"{kryterium['opis_pl']}: "
            f"{ocena.get('status_maszynowy', '')} — "
            f"{(ocena.get('wyjasnienie') or {}).get('zdanie_pl', '')} "
            f"[podstawa: {podstawa.get('dokument', '')} {podstawa.get('jednostka_redakcyjna', '')}, "
            f"stan: {podstawa.get('stan', '')}]"
        )
    i_wyl = tt.i_delta_n_a if uklad == "TT" else tt.i_d_pierwsze_zwarcie_a
    u_dotyk = tt.u_dotyk_v if uklad == "TT" else tt.u_dotyk_pierwsze_zwarcie_v
    eq10 = _eq(
        "EQ_LVCV_009",
        r"U_{dotyk} = R_A \cdot I_{\Delta n} \le U_L",
        "Napięcie dotykowe przy uziomie instalacji (TT/IT) wobec limitu normy",
        "IEC 60364-4-41 §411.5.3 (TT: R_A·I_Δn) / §411.6.2 (IT: R_A·I_d)",
        [
            _sym("U_{dotyk}", "V", "Napięcie dotykowe na uziomie instalacji", "u_dotyk_v"),
            _sym("R_A", "Ω", "Rezystancja uziomu instalacji odbiorczej", "r_a_ohm"),
            _sym(
                r"I_{\Delta n}",
                "A",
                "Prąd różnicowy znamionowy RCD (TT) / prąd pierwszego zwarcia (IT)",
                "i_delta_n_a",
            ),
            _sym(
                "U_L",
                "V",
                "Dopuszczalne napięcie dotykowe — tekst normy spoza repozytorium",
                "limit_napiecia_dotykowego_v",
            ),
        ],
    )
    kroki.append(
        ProofStep(
            step_id=ProofStep.generate_step_id("LVCV", 10),
            step_number=10,
            title_pl=(
                f"SWZ w układzie {uklad} — werdykt wyjaśnialny (pasmo U0={data.swz_pasmo_u0}, "
                f"obwód {data.swz_rodzaj_obwodu})"
            ),
            equation=eq10,
            input_values=(
                _pv("R_A", _wartosc_lub_brak(tt.r_a_ohm), "Ω", "r_a_ohm"),
                _pv(r"I_{\Delta n}", _wartosc_lub_brak(i_wyl), "A", "i_delta_n_a"),
                _pv("U_{dotyk}", _wartosc_lub_brak(u_dotyk), "V", "u_dotyk_v"),
                _pv(
                    "U_L",
                    "BRAK_PODSTAWY" if data.swz_tt_it.get("kod_odmowy_limitu") else "wg rekordu",
                    "V",
                    "limit_napiecia_dotykowego_v",
                ),
                _pv("t_{wym}", _wartosc_lub_brak(data.swz_t_wymagany_s), "s", "t_wymagany_s"),
            ),
            substitution_latex="".join(
                "$$\\text{" + linia.replace("\\", "/").replace("{", "(").replace("}", ")") + "}$$"
                for linia in linie
            ),
            result=_pv("\\text{SWZ}", data.swz_wymaganie.etykieta.etykieta_pl, "—", "swz_ocena"),
            unit_check=_uc("V", "V", "Ω · A = V"),
            source_keys={
                "kontrakt": str(data.swz_tt_it.get("kontrakt", "")),
                "wymaganie_id": (
                    str(wymaganie.get("wymaganie_id", "")) if isinstance(wymaganie, dict) else ""
                ),
                "status_wymagania": (
                    str(wymaganie.get("status_maszynowy", ""))
                    if isinstance(wymaganie, dict)
                    else ""
                ),
                "kod_odmowy_limitu": str(data.swz_tt_it.get("kod_odmowy_limitu") or ""),
                "zrodlo_czasu": (
                    "TABLICA_TT_ODBIORCZE / CZAS_TT_ROZDZIELCZY (status REFERENCYJNY)"
                    if uklad == "TT"
                    else "—"
                ),
                "pasmo_u0": str(data.swz_pasmo_u0),
                "rodzaj_obwodu": str(data.swz_rodzaj_obwodu),
            },
        )
    )
    return kroki


class LVCircuitVerificationProofPack:
    """Generator pakietu dowodowego LV_CIRCUIT_VERIFICATION (karta P0.10)."""

    @classmethod
    def generate(
        cls, data: LVCircuitVerificationInput, artifact_id: UUID | None = None
    ) -> ProofDocument:
        if artifact_id is None:
            artifact_id = uuid4()

        steps: list[ProofStep] = []

        # ---------------------------------------------------------------
        # Krok 1: S = sqrt(P^2+Q^2)                              REUSE EQ_LC_001
        # ---------------------------------------------------------------
        s_mva = (data.p_mw**2 + data.q_mvar**2) ** 0.5
        eq1 = _eq(
            "EQ_LC_001",
            r"S = \sqrt{P^{2} + Q^{2}}",
            "Moc pozorna",
            "praktyka inżynierska",
            [
                _sym("S", "MVA", "Moc pozorna", "s_mva"),
                _sym("P", "MW", "Moc czynna", "p_mw"),
                _sym("Q", "Mvar", "Moc bierna", "q_mvar"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 1),
                step_number=1,
                title_pl="Dane wejściowe obwodu — moc pozorna",
                equation=eq1,
                input_values=(
                    _pv("P", data.p_mw, "MW", "p_mw"),
                    _pv("Q", data.q_mvar, "Mvar", "q_mvar"),
                ),
                substitution_latex=(
                    f"$$S = \\sqrt{{{data.p_mw:.4f}^2 + {data.q_mvar:.4f}^2}} = {s_mva:.4f}"
                    r"\;\mathrm{MVA}$$"
                ),
                result=_pv("S", s_mva, "MVA", "s_mva"),
                unit_check=_uc("MVA", "MVA", "MW² + Mvar² = MVA² → MVA"),
            )
        )

        # ---------------------------------------------------------------
        # Krok 2: Ib = S/(sqrt(3)*U_LL)                          REUSE EQ_LC_002
        # ---------------------------------------------------------------
        ib_ka = prad_z_mocy_pozornej_ka(s_mva, data.u_ll_kv)
        ib_a = ka_na_a(ib_ka)
        eq2 = _eq(
            "EQ_LC_002",
            r"I = \frac{S}{\sqrt{3}\,U_{LL}}",
            "Prąd obliczeniowy obwodu",
            "praktyka inżynierska",
            [
                _sym("I_b", "A", "Prąd obliczeniowy obwodu", "ib_a"),
                _sym("S", "MVA", "Moc pozorna", "s_mva"),
                _sym("U_{LL}", "kV", "Napięcie międzyfazowe", "u_ll_kv"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 2),
                step_number=2,
                title_pl="Prąd obliczeniowy obwodu Ib",
                equation=eq2,
                input_values=(
                    _pv("S", s_mva, "MVA", "s_mva"),
                    _pv("U_{LL}", data.u_ll_kv, "kV", "u_ll_kv"),
                ),
                substitution_latex=(
                    f"$$I_b = \\frac{{{s_mva:.4f}}}{{\\sqrt{{3}} \\cdot {data.u_ll_kv:g}}} "
                    f"= {ib_a:.2f}\\;\\mathrm{{A}}$$"
                ),
                result=_pv("I_b", ib_a, "A", "ib_a"),
                unit_check=_uc("A", "A", "MVA / kV = kA (MVA = kV·kA) → A"),
            )
        )

        # ---------------------------------------------------------------
        # Krok 3: Iz' = Iz * f_temp * f_grunt * f_grupa           NEW EQ_LVCV_001
        # ---------------------------------------------------------------
        iz_prime_a = obciazalnosc_skorygowana(data.iz_katalogowe_a, data.wspolczynniki)
        w = data.wspolczynniki
        eq3 = _eq(
            "EQ_LVCV_001",
            r"I_z' = I_z \cdot f_{\theta} \cdot f_{\rho} \cdot f_{N}",
            "Obciążalność dopuszczalna po korektach (Iz′)",
            "PN-HD 60364-5-52 (zestaw korekcyjny G-D1)",
            [
                _sym("I_z'", "A", "Obciążalność dopuszczalna po korektach", "iz_prime_a"),
                _sym("I_z", "A", "Obciążalność katalogowa", "iz_katalogowe_a"),
                _sym("f_{\\theta}", "—", "Korekta temperatury otoczenia", "f_temperatura"),
                _sym("f_{\\rho}", "—", "Korekta rezystywności gruntu", "f_rezystywnosc_gruntu"),
                _sym("f_{N}", "—", "Korekta grupowania obwodów", "f_grupowanie"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 3),
                step_number=3,
                title_pl=f"Obciążalność dopuszczalna po korektach ({w.zalozenie_pl()})",
                equation=eq3,
                input_values=(
                    _pv("I_z", data.iz_katalogowe_a, "A", "iz_katalogowe_a"),
                    _pv("f_{\\theta}", w.f_temperatura, "—", "f_temperatura"),
                    _pv("f_{\\rho}", w.f_rezystywnosc_gruntu, "—", "f_rezystywnosc_gruntu"),
                    _pv("f_{N}", w.f_grupowanie, "—", "f_grupowanie"),
                ),
                substitution_latex=(
                    f"$$I_z' = {data.iz_katalogowe_a:g} \\cdot {w.f_temperatura:g} \\cdot "
                    f"{w.f_rezystywnosc_gruntu:g} \\cdot {w.f_grupowanie:g} = "
                    f"{iz_prime_a:.2f}\\;\\mathrm{{A}}$$"
                ),
                result=_pv("I_z'", iz_prime_a, "A", "iz_prime_a"),
                unit_check=_uc("A", "A", "A · (—)·(—)·(—) = A"),
                source_keys={"srodowisko": w.srodowisko, "podstawa_iloczynu": w.zalozenie_pl()},
            )
        )

        # ---------------------------------------------------------------
        # Krok 4: Dobór Ib <= In <= Iz'                          NEW EQ_LVCV_002
        # Krok 5: I2 <= 1,45*Iz'                                  NEW EQ_LVCV_003
        # Reguły i rekordy z doboru aparatu nN (`nn_device_selection`) — JEDNO źródło
        # kryteriów przeciążeniowych dla doboru, arkusza obwodów i tego dowodu.
        # ---------------------------------------------------------------
        in_a = data.urzadzenie.in_a
        kandydat = kandydat_z_urzadzenia(
            data.urzadzenie,
            zdolnosc_wylaczania_ka=(
                data.urzadzenie.conditional_sc_current_ka
                if data.urzadzenie.kind == KIND_FUSE_SWITCH
                else data.urzadzenie.wlasna_zdolnosc_ka
            ),
        )
        kryterium_i, kryterium_ii = oceniaj_przeciazenie_kandydata(
            kandydat=kandydat, ib_a=ib_a, iz_prime_a=iz_prime_a
        )
        wymaganie_doboru = kryterium_i.ocena
        assert isinstance(wymaganie_doboru, WynikWymagania)
        ocena_in_ib, ocena_in_iz = wymaganie_doboru.oceny_skladowe
        eq4 = _eq(
            "EQ_LVCV_002",
            r"I_b \le I_n \le I_z'",
            "Dobór zabezpieczenia obwodu",
            "IEC 60364-4-43 §433.1",
            [
                _sym("I_b", "A", "Prąd obliczeniowy obwodu", "ib_a"),
                _sym("I_n", "A", "Prąd znamionowy zabezpieczenia", "in_a"),
                _sym("I_z'", "A", "Obciążalność dopuszczalna po korektach", "iz_prime_a"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 4),
                step_number=4,
                title_pl=f"Dobór zabezpieczenia ({data.urzadzenie.nazwa})",
                equation=eq4,
                input_values=(
                    _pv("I_b", ib_a, "A", "ib_a"),
                    _pv("I_n", in_a, "A", "in_a"),
                    _pv("I_z'", iz_prime_a, "A", "iz_prime_a"),
                ),
                substitution_latex=(
                    f"$${ib_a:.2f} {_relacja_odwrotna(ocena_in_ib)} {in_a:g} "
                    f"{relacja_latex(ocena_in_iz)} {iz_prime_a:.2f}\\;\\mathrm{{A}}$$"
                    f"{_zdanie_latex(wymaganie_doboru.wyjasnienie.zdanie_pl)}"
                ),
                result=_pv("I_n", in_a, "A", "in_a"),
                unit_check=_uc("A", "A", "A ≤ A ≤ A"),
                source_keys=_klucze_rekordu(wymaganie_doboru),
            )
        )

        i2_a = _liczba_lub_brak(kryterium_ii.wartosci.get("i2_a"))
        limit_a = float(kryterium_ii.wartosci["limit_a"])
        ocena_i2 = kryterium_ii.ocena
        assert isinstance(ocena_i2, OcenaKryterium)
        i2_zrodlo = str(
            kryterium_ii.wartosci.get(
                "zrodlo",
                "wyłącznik z wyzwalaczem elektronicznym bez rozwiązanej nastawy Ir/tr w katalogu",
            )
        )
        eq5 = _eq(
            "EQ_LVCV_003",
            r"I_2 \le 1{,}45 \cdot I_z'",
            "Warunek zadziałania zabezpieczenia",
            "IEC 60364-4-43 §433.1.1",
            [
                _sym("I_2", "A", "Prąd gwarantowanego zadziałania", "i2_a"),
                _sym("I_z'", "A", "Obciążalność dopuszczalna po korektach", "iz_prime_a"),
                _sym("1{,}45 \\cdot I_z'", "A", "Granica dopuszczalna I2", "limit_a"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 5),
                step_number=5,
                title_pl=f"Warunek zadziałania I2 ({i2_zrodlo})",
                equation=eq5,
                input_values=(
                    _pv("I_2", _wartosc_lub_brak(i2_a), "A", "i2_a"),
                    _pv("I_z'", iz_prime_a, "A", "iz_prime_a"),
                ),
                substitution_latex=(
                    (
                        f"$$I_2 = {i2_a:.2f}\\;\\mathrm{{A}} {relacja_latex(ocena_i2)} "
                        f"1{{,}}45 \\cdot {iz_prime_a:.2f} = {limit_a:.2f}\\;\\mathrm{{A}}$$"
                        if i2_a is not None
                        else ""
                    )
                    + _zdanie_latex(ocena_i2.wyjasnienie.zdanie_pl)
                ),
                result=_pv("I_2", _wartosc_lub_brak(i2_a), "A", "i2_a"),
                unit_check=_uc("A", "A", "A ≤ A"),
                source_keys=_klucze_rekordu(ocena_i2),
            )
        )

        # ---------------------------------------------------------------
        # Krok 6: Zdolność wyłączania — DWA ZDANIA (dwa rekordy K)  NEW EQ_LVCV_004
        # ---------------------------------------------------------------
        zdolnosc = ocen_zdolnosc_wylaczania_dwa_zdania(
            urzadzenie=data.urzadzenie, ik_max_ka=data.ik_max_ka
        )
        eq6 = _eq(
            "EQ_LVCV_004",
            r"I_{cond} \ge I_k''_{max} \qquad \text{oraz osobno} \qquad I_{cu/cn} \ge I_k''_{max}",
            "Zdolność wyłączania wobec Ik″max — dwa zdania inżynierskie",
            "IEC 60947 / IEC 60898-1 / IEC 60269-1",
            [
                _sym(
                    "I_{cond}",
                    "kA",
                    "Prąd warunkowy KOMBINACJI aparat+wkładka",
                    "conditional_sc_current_ka",
                ),
                _sym("I_{cu/cn}", "kA", "Własna zdolność GOŁEGO aparatu", "icu_or_icn_ka"),
                _sym("I_k''_{max}", "kA", "Prąd zwarciowy początkowy maksymalny", "ik_max_ka"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 6),
                step_number=6,
                title_pl="Zdolność wyłączania — dwa zdania inżynierskie (kombinacja / goły aparat)",
                equation=eq6,
                input_values=(
                    _pv(
                        "I_{cond}",
                        _wartosc_albo_stan(zdolnosc.kombinacja_wartosc_ka, zdolnosc.kombinacja),
                        "kA",
                        "conditional_sc_current_ka",
                    ),
                    _pv(
                        "I_{cu/cn}",
                        _wartosc_albo_stan(zdolnosc.goly_aparat_wartosc_ka, zdolnosc.goly_aparat),
                        "kA",
                        "icu_or_icn_ka",
                    ),
                    _pv("I_k''_{max}", _wartosc_lub_brak(data.ik_max_ka), "kA", "ik_max_ka"),
                ),
                substitution_latex=(
                    _zdanie_latex(f"kombinacja: {zdolnosc.zdanie_kombinacja_pl}")
                    + "\n"
                    + _zdanie_latex(f"goły aparat: {zdolnosc.zdanie_goly_aparat_pl}")
                ),
                result=_pv(
                    "\\text{zdolność wyłączania}",
                    (
                        f"kombinacja: {zdolnosc.kombinacja.etykieta.etykieta_pl}; "
                        f"goły aparat: {zdolnosc.goly_aparat.etykieta.etykieta_pl}"
                    ),
                    "—",
                    "zdolnosc_wylaczania_rekordy",
                ),
                unit_check=_uc("kA", "kA", "kA ≥ kA"),
                source_keys={
                    "zdanie_kombinacja_pl": zdolnosc.zdanie_kombinacja_pl,
                    "zdanie_goly_aparat_pl": zdolnosc.zdanie_goly_aparat_pl,
                    "kryterium_kombinacji": zdolnosc.kombinacja.kryterium_id,
                    "status_kombinacji": zdolnosc.kombinacja.status_maszynowy,
                    "kryterium_golego_aparatu": zdolnosc.goly_aparat.kryterium_id,
                    "status_golego_aparatu": zdolnosc.goly_aparat.status_maszynowy,
                },
            )
        )

        # ---------------------------------------------------------------
        # Krok 7: I^2*t <= k^2*S^2                                NEW EQ_LVCV_005
        # Rozstrzygnięcie niesie rekord W wytrzymałości cieplnej solvera (`th.ocena`).
        # ---------------------------------------------------------------
        th = data.thermal
        eq7 = _eq(
            "EQ_LVCV_005",
            r"\int i^{2}\,dt \le k^{2} S^{2}",
            "Wytrzymałość cieplna przewodu (bilans energii zwarciowej)",
            "IEC 60949",
            [
                _sym("\\int i^{2}\\,dt", "A²s", "Energia zwarciowa rzeczywista", "i2t_a2s"),
                _sym("k^{2} S^{2}", "A²s", "Energia dopuszczalna", "i2t_admissible_a2s"),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 7),
                step_number=7,
                title_pl="Wytrzymałość cieplna przewodu I²t ≤ k²S²",
                equation=eq7,
                input_values=(
                    _pv("\\int i^{2}\\,dt", _wartosc_lub_brak(th.i2t_a2s), "A²s", "i2t_a2s"),
                    _pv(
                        "k^{2} S^{2}",
                        _wartosc_lub_brak(th.i2t_admissible_a2s),
                        "A²s",
                        "i2t_admissible_a2s",
                    ),
                ),
                substitution_latex=(
                    (
                        f"$${th.i2t_a2s:.1f}\\;\\mathrm{{A^2s}} \\;\\text{{wobec}}\\; "
                        f"{th.i2t_admissible_a2s:.1f}\\;\\mathrm{{A^2s}}$$"
                        if th.i2t_a2s is not None and th.i2t_admissible_a2s is not None
                        else ""
                    )
                    + _zdanie_latex(th.wyjasnienie.zdanie_pl)
                ),
                result=_pv("\\text{I²t}", th.ocena.etykieta.etykieta_pl, "—", "thermal_ocena"),
                unit_check=_uc("A²s", "A²s", "A²·s ≤ (A·√s/mm²)² · mm² = A²·s"),
                source_keys={
                    **_klucze_rekordu(th.ocena),
                    "decision_reason_pl": th.decision_reason_pl or "",
                    "readiness_codes": ",".join(th.readiness_codes),
                },
            )
        )

        # ---------------------------------------------------------------
        # Krok 8: ΔU dowód (headline)                             REUSE EQ_VDROP_007
        # ---------------------------------------------------------------
        u_target_kv = data.vdrop_u_source_kv - data.vdrop_delta_u_total_kv
        eq8 = _eq(
            "EQ_VDROP_007",
            r"U = U_{source} - \Delta U_{total}^{kV}",
            "Napięcie w punkcie po uwzględnieniu spadku",
            "—",
            [
                _sym("U", "kV", "Napięcie w punkcie", "u_kv"),
                _sym("U_{source}", "kV", "Napięcie źródła", "u_source_kv"),
                _sym(
                    "\\Delta U_{total}^{kV}", "kV", "Sumaryczny spadek napięcia", "delta_u_total_kv"
                ),
            ],
        )
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 8),
                step_number=8,
                title_pl="Spadek napięcia — łańcuch źródło → punkt (dowód pełny w pakiecie VDROP)",
                equation=eq8,
                input_values=(
                    _pv("U_{source}", data.vdrop_u_source_kv, "kV", "u_source_kv"),
                    _pv(
                        "\\Delta U_{total}^{kV}",
                        data.vdrop_delta_u_total_kv,
                        "kV",
                        "delta_u_total_kv",
                    ),
                ),
                substitution_latex=(
                    f"$$U = {data.vdrop_u_source_kv:.4f} - {data.vdrop_delta_u_total_kv:.4f} "
                    f"= {u_target_kv:.4f}\\;\\mathrm{{kV}}$$"
                ),
                result=_pv("U", u_target_kv, "kV", "u_kv"),
                unit_check=_uc("kV", "kV", "kV − kV = kV"),
                source_keys={
                    "delta_u_total_percent": (
                        f"{data.vdrop_delta_u_total_percent:.4f}"
                        if data.vdrop_delta_u_total_percent is not None
                        else "brak"
                    )
                },
            )
        )

        # ---------------------------------------------------------------
        # Krok 9-10: pętla zwarcia minimalnego + SWZ — WEDŁUG UKŁADU sieci nN.
        # TN: Ik1_min = c_min·U0/|Z_loop| (EQ_LVCV_006) i Ik1_min ≥ Ia(t_wym)
        # (EQ_LVCV_007). TT/IT (karta W5-E-TTIT): pętla doziemna przez uziomy /
        # pojemności (EQ_LVCV_008 / EQ_LVCV_010 + EQ_LVCV_011) i werdykt
        # wyjaśnialny z limitem U_L (EQ_LVCV_009) — BRAK_PODSTAWY, gdy limit nie
        # jest w repozytorium; żadnej liczby z pamięci.
        # ---------------------------------------------------------------
        fl = data.fault_loop
        if fl.tt_it is not None:
            if data.swz_tt_it is None:
                raise OdmowaDanychError(
                    "Pakiet dowodowy obwodu nN w układzie TT/IT wymaga rekordu werdyktu "
                    "wyjaśnialnego SWZ TT/IT (pole swz_tt_it) — bez niego krok 10 nie ma "
                    "czego cytować."
                )
            steps.extend(_kroki_tt_it(data, fl))
        else:
            steps.extend(_kroki_tn(data, fl))

        # ---------------------------------------------------------------
        # Podsumowanie
        # ---------------------------------------------------------------
        unit_checks_passed = all(step.unit_check.passed for step in steps)
        # Agregat obwodu — PROJEKCJA rekordów K wszystkich kryteriów (`rozstrzygniecie`):
        # naruszenie którejkolwiek oceny stosowalnej → FAIL; każda stosowalna spełniona na
        # liczbach → PASS; inaczej (brak wyniku, brak podstawy, niejednoznaczność) →
        # NIEROZSTRZYGALNE. NIE_DOTYCZY (zdanie zdolności bez sensu dla rodzaju aparatu) jest
        # pomijane — nie blokuje PASS i nie ściąga agregatu do NIEROZSTRZYGALNE. Kompletność
        # dowodu (np. model niezwalidowany) niosą rekordy, nie ten kod agregatu.
        oceny_obwodu: tuple[OcenaKryterium, ...] = (
            *wymaganie_doboru.oceny_skladowe,
            ocena_i2,
            *zdolnosc.oceny,
            *th.ocena.oceny_skladowe,
            *data.swz_wymaganie.oceny_skladowe,
        )
        overall_status = projekcja_statusu(
            oceny_obwodu, spelnia="PASS", nie_spelnia="FAIL", nierozstrzygniete="NIEROZSTRZYGALNE"
        )

        key_results: dict[str, ProofValue] = {
            "s_mva": _pv("S", s_mva, "MVA", "s_mva"),
            "ib_a": _pv("I_b", ib_a, "A", "ib_a"),
            "iz_prime_a": _pv("I_z'", iz_prime_a, "A", "iz_prime_a"),
            "in_a": _pv("I_n", in_a, "A", "in_a"),
            "i2_a": _pv("I_2", _wartosc_lub_brak(i2_a), "A", "i2_a"),
            "zdanie_kombinacja_pl": _pv(
                "\\text{kombinacja}", zdolnosc.zdanie_kombinacja_pl, "—", "zdanie_kombinacja_pl"
            ),
            "zdanie_goly_aparat_pl": _pv(
                "\\text{goły aparat}", zdolnosc.zdanie_goly_aparat_pl, "—", "zdanie_goly_aparat_pl"
            ),
            "thermal_ocena": _pv(
                "\\text{I2t}", th.ocena.etykieta.etykieta_pl, "—", "thermal_ocena"
            ),
            "u_target_kv": _pv("U", u_target_kv, "kV", "u_kv"),
            "ik1_min_a": _pv("I_{k1,min}", fl.ik_min_a, "A", "ik1_min_a"),
            "swz_ocena": _pv(
                "\\text{SWZ}", data.swz_wymaganie.etykieta.etykieta_pl, "—", "swz_ocena"
            ),
        }
        if data.ik_max_ka is not None:
            key_results["ik_max_ka"] = _pv("I_k''_{max}", data.ik_max_ka, "kA", "ik_max_ka")

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=_ostrzezenia_danych_przyjetych(fl, data.nazwa_odcinka),
            overall_status=overall_status,
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            target_id=data.segment_ref,
            element_kind="LV_CIRCUIT",
            fault_location=data.bus_ref,
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LV_CIRCUIT_VERIFICATION,
            title_pl=(
                f"Dowód: weryfikacja obwodu nN — {data.nazwa_odcinka} / {data.urzadzenie.nazwa}"
            ),
            header=header,
            steps=steps,
            summary=summary,
        )

    #: Rozróżnik tożsamości dokumentu (wzorzec PACK-NASTAWY/PACK-BEZ-KONSUMENTA)
    #: — obwód identyfikowany trójką (stacja, szyna, aparat), żeby dwa różne
    #: obwody tego samego przebiegu nie dostały tego samego identyfikatora.
    @staticmethod
    def rozroznik(data: LVCircuitVerificationInput) -> str:
        return f"lv-circuit|{data.station_ref}|{data.bus_ref}|{data.breaker_ref}"

    @classmethod
    def generate_zip(
        cls,
        data: LVCircuitVerificationInput,
        context: ProofPackContext,
        artifact_id: UUID | None = None,
    ) -> bytes:
        """Zbuduj ZIP pakietu dowodowego (dowód, źródło, wykaz, odcisk) — REUSE
        ``ProofPackBuilder`` (ta sama mechanika co wszystkie inne pakiety)."""
        rozroznik = cls.rozroznik(data)
        proof = cls.generate(data, artifact_id or deterministic_artifact_id(context, rozroznik))
        return ProofPackBuilder(context).build(
            dokument_deterministyczny(proof, context, data.run_timestamp, rozroznik)
        )


def serialize_lv_circuit_verification_pack(document: ProofDocument) -> dict[str, Any]:
    """Standardowy kontrakt pack serializer (pack_type + proof + summary)."""
    return {
        "pack_type": "LV_CIRCUIT_VERIFICATION",
        "artifact_id": str(document.artifact_id),
        "created_at": document.created_at.isoformat(),
        "title_pl": document.title_pl,
        "proof": document.to_dict(),
        "summary": {
            "total_steps": document.summary.total_steps,
            "proof_type": document.proof_type.value,
            "overall_status": document.summary.overall_status,
        },
    }


def _ostrzezenia_danych_przyjetych(fl: FaultLoopResult, nazwa_odcinka: str) -> tuple[str, ...]:
    """Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: c pętli z wartości roboczej tolerancji sieci nN —
    dowód stoi na danej przyjętej (jedno tłumaczenie: `dana_przyjeta_tolerancji_nn`). Karta
    LINIA-110: impedancja sieci zasilającej pętli zawiera linie 110 kV z wartością roboczą
    geometrii (`FaultLoopResult.dane_przyjete_linii_wn`, te same rekordy co werdykt SWZ).
    PODSTAWA-Q (rozstrz. 3): impedancja sieci zasilającej SN liczona z wartością roboczą
    parametru maszyny wirującej (`FaultLoopResult.parametry_robocze_maszyn`) — każdy wpis to
    osobne ostrzeżenie (jedno tłumaczenie: `dane_przyjete_maszyn`)."""
    dane = (
        (
            (dana_przyjeta_tolerancji_nn(miejsce_pl=f"obwód „{nazwa_odcinka}”"),)
            if fl.tolerancja_nn_robocza
            else ()
        )
        + dane_przyjete_z_zapisu(fl.dane_przyjete_linii_wn)
        + dane_przyjete_maszyn(fl.parametry_robocze_maszyn, wielkosc="ikss")
    )
    return tuple(
        f"Prąd pętli liczony z daną przyjętą: {dana.nazwa_pl} — {dana.powod_pl}" for dana in dane
    )

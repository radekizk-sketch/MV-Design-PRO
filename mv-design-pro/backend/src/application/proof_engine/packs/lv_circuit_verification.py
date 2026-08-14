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
  4. Dobór: Ib ≤ In ≤ Iz′                    NEW EQ_LVCV_002 (IEC 60364-4-43 §433.1)
  5. I2 ≤ 1,45·Iz′                           NEW EQ_LVCV_003 — I2 z REUSE
     `network_model.catalog.lv_mcb_bands_iec60898.PROG_CIEPLNY_WYZWALA_X_IN`
     (MCB) albo `network_model.solvers.protection_lv_curves.FUSE_GG_IF_MULTIPLIER`
     (wkładka gG)
  6. Zdolność wyłączania wobec Ik″max        NEW EQ_LVCV_004 — DWA ZDANIA
     (kombinacja aparat+wkładka / goły aparat, runda 5b)
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
from network_model.catalog.lv_mcb_bands_iec60898 import PROG_CIEPLNY_WYZWALA_X_IN
from network_model.solvers.cable_ampacity_derating import (
    WspolczynnikiObciazalnosciNN,
    obciazalnosc_skorygowana,
)
from network_model.solvers.conductor_thermal_withstand import ConductorThermalResult
from network_model.solvers.fault_loop_iec60364 import C_MIN_LV, FaultLoopResult
from network_model.solvers.protection_lv_curves import FUSE_GG_IF_MULTIPLIER

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
    """

    kind: str
    id: str
    nazwa: str
    in_a: float
    klasa_mcb: str | None = None
    wlasna_zdolnosc_ka: float | None = None
    conditional_sc_current_ka: float | None = None
    fuse_breaking_capacity_ka: float | None = None

    def __post_init__(self) -> None:
        if self.kind not in _KINDY_DOZWOLONE:
            raise ValueError(
                f"Nieznany rodzaj urządzenia '{self.kind}' — dozwolone: {_KINDY_DOZWOLONE}."
            )
        if self.in_a <= 0:
            raise ValueError(f"in_a musi być dodatnie, otrzymano {self.in_a}.")
        if self.kind == KIND_MCB and not self.klasa_mcb:
            raise ValueError("Urządzenie MCB wymaga klasa_mcb (B/C/D).")

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
    swz_status: str
    swz_przyczyna_pl: str
    swz_ia_wymagane_a: float | None
    swz_t_wymagany_s: float | None
    swz_pasmo_u0: str
    swz_rodzaj_obwodu: str
    swz_margines: float | None

    vdrop_delta_u_total_percent: float | None = None


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


#: Statusy jednego zdania zdolności wyłączania — CZTERY stany, jawnie
#: rozróżnione (NIE_DOTYCZY ≠ nierozstrzygalne — pierwsze znaczy „to pytanie
#: nie ma sensu dla tego rodzaju aparatu", drugie „pytanie ma sens, ale brak
#: danych do odpowiedzi"; zlanie ich w jedno `None` byłoby DOKŁADNIE defektem
#: klasy, przed którym ostrzega reguła KLASA NIE INSTANCJA — agregat
#: werdyktu obwodu MUSI je odróżniać, inaczej NIE_DOTYCZY blokowałby PASS).
STATUS_SPELNIA = "spełnia"
STATUS_NIE_SPELNIA = "nie spełnia"
STATUS_NIE_DOTYCZY = "NIE_DOTYCZY"
STATUS_NIEROZSTRZYGALNE = "nierozstrzygalne"


@dataclass(frozen=True)
class ZdolnoscWylaczaniaDwaZdania:
    """Dwa RÓŻNE zdania inżynierskie — NIGDY jedno pole (runda 5b).

    ``*_status`` ∈ {spełnia, nie spełnia, NIE_DOTYCZY, nierozstrzygalne} —
    ŹRÓDŁO PRAWDY dla agregacji werdyktu obwodu. ``*_spelnia`` (bool | None)
    jest WYPROWADZONE z ``*_status`` (True/False tylko dla spełnia/nie
    spełnia, None dla obu pozostałych stanów) — pozostawione dla wygody
    prezentacji kroku, NIE do agregacji (tam liczy się WYŁĄCZNIE status).
    """

    zdanie_kombinacja_pl: str
    kombinacja_status: str
    kombinacja_wartosc_ka: float | None
    zdanie_goly_aparat_pl: str
    goly_aparat_status: str
    goly_aparat_wartosc_ka: float | None

    @property
    def kombinacja_spelnia(self) -> bool | None:
        return {STATUS_SPELNIA: True, STATUS_NIE_SPELNIA: False}.get(self.kombinacja_status)

    @property
    def goly_aparat_spelnia(self) -> bool | None:
        return {STATUS_SPELNIA: True, STATUS_NIE_SPELNIA: False}.get(self.goly_aparat_status)


def ocen_zdolnosc_wylaczania_dwa_zdania(
    *, urzadzenie: UrzadzenieOchronneNn, ik_max_ka: float | None
) -> ZdolnoscWylaczaniaDwaZdania:
    """Zbuduj DWA zdania (kombinacja aparat+wkładka / goły aparat) — runda 5b.

    Kombinacja aparat+wkładka: WYŁĄCZNIE dla ``KIND_FUSE_SWITCH``, czyta
    ``conditional_sc_current_ka``. Goły aparat: czyta ``wlasna_zdolnosc_ka`` —
    dla ``KIND_FUSE_SWITCH`` ZAWSZE NIE_DOTYCZY (rozłącznik bezpiecznikowy sam
    w sobie nie ma tej zdolności, niezależnie od tego, czy wkładka jest
    zainstalowana), dla MCB/MCCB czyta rzeczywistą wartość katalogową.
    """
    # --- zdanie kombinacji ---
    if urzadzenie.kind != KIND_FUSE_SWITCH:
        zdanie_kombinacja = (
            f"NIE_DOTYCZY — urządzenie {urzadzenie.kind} nie jest kombinacją "
            "rozłącznik+wkładka, nie ma prądu warunkowego kombinacji do oceny."
        )
        kombinacja_status = STATUS_NIE_DOTYCZY
        kombinacja_wartosc: float | None = None
    elif urzadzenie.conditional_sc_current_ka is None:
        zdanie_kombinacja = (
            "NIEROZSTRZYGALNE — obwód bez wkładki zainstalowanej (albo katalog nie "
            "niesie prądu warunkowego kombinacji conditional_sc_current_ka) — brak "
            "podstawy do oceny zdolności wyłączania kombinacji (zero fabrykacji)."
        )
        kombinacja_status = STATUS_NIEROZSTRZYGALNE
        kombinacja_wartosc = None
    elif ik_max_ka is None:
        zdanie_kombinacja = (
            f"NIEROZSTRZYGALNE — prąd warunkowy kombinacji Icond="
            f"{urzadzenie.conditional_sc_current_ka:g} kA jest znany, ale brak Ik″max "
            "w punkcie zabudowy (bieg zwarciowy nie dostarczony)."
        )
        kombinacja_status = STATUS_NIEROZSTRZYGALNE
        kombinacja_wartosc = urzadzenie.conditional_sc_current_ka
    else:
        kombinacja_spelnia_bool = urzadzenie.conditional_sc_current_ka >= ik_max_ka
        kombinacja_status = STATUS_SPELNIA if kombinacja_spelnia_bool else STATUS_NIE_SPELNIA
        kombinacja_wartosc = urzadzenie.conditional_sc_current_ka
        zdanie_kombinacja = (
            f"Kombinacja rozłącznik+wkładka: prąd warunkowy Icond="
            f"{urzadzenie.conditional_sc_current_ka:g} kA "
            f"{'>=' if kombinacja_spelnia_bool else '<'} Ik″max={ik_max_ka:g} kA w punkcie "
            f"zabudowy — {kombinacja_status} (IEC 60947, prąd warunkowy kombinacji)."
        )

    # --- zdanie gołego aparatu ---
    if urzadzenie.kind == KIND_FUSE_SWITCH:
        zdanie_goly = (
            "NIE_DOTYCZY — rozłącznik bezpiecznikowy sam w sobie NIE MA własnej "
            "zdolności wyłączania zwarć (zapadka strukturalna katalogu, wzorzec "
            "UM-ICU-KATALOG); jedyna wielkość dla tego aparatu to prąd warunkowy "
            "KOMBINACJI powyżej."
        )
        goly_status = STATUS_NIE_DOTYCZY
        goly_wartosc: float | None = None
    elif urzadzenie.wlasna_zdolnosc_ka is None:
        zdanie_goly = (
            f"NIEROZSTRZYGALNE — katalog nie niesie własnej zdolności wyłączania "
            f"({'Icn' if urzadzenie.kind == KIND_MCB else 'Icu'}) dla tego aparatu "
            f"{urzadzenie.kind} (zero fabrykacji)."
        )
        goly_status = STATUS_NIEROZSTRZYGALNE
        goly_wartosc = None
    elif ik_max_ka is None:
        etykieta = "Icn (IEC 60898-1)" if urzadzenie.kind == KIND_MCB else "Icu (IEC 60947)"
        zdanie_goly = (
            f"NIEROZSTRZYGALNE — własna zdolność {etykieta}="
            f"{urzadzenie.wlasna_zdolnosc_ka:g} kA jest znana, ale brak Ik″max w "
            "punkcie zabudowy (bieg zwarciowy nie dostarczony)."
        )
        goly_status = STATUS_NIEROZSTRZYGALNE
        goly_wartosc = urzadzenie.wlasna_zdolnosc_ka
    else:
        etykieta = "Icn (IEC 60898-1)" if urzadzenie.kind == KIND_MCB else "Icu (IEC 60947)"
        goly_spelnia_bool = urzadzenie.wlasna_zdolnosc_ka >= ik_max_ka
        goly_status = STATUS_SPELNIA if goly_spelnia_bool else STATUS_NIE_SPELNIA
        goly_wartosc = urzadzenie.wlasna_zdolnosc_ka
        zdanie_goly = (
            f"Goły aparat ({urzadzenie.kind}): własna zdolność {etykieta}="
            f"{urzadzenie.wlasna_zdolnosc_ka:g} kA "
            f"{'>=' if goly_spelnia_bool else '<'} Ik″max={ik_max_ka:g} kA w punkcie "
            f"zabudowy — {goly_status}."
        )

    return ZdolnoscWylaczaniaDwaZdania(
        zdanie_kombinacja_pl=zdanie_kombinacja,
        kombinacja_status=kombinacja_status,
        kombinacja_wartosc_ka=kombinacja_wartosc,
        zdanie_goly_aparat_pl=zdanie_goly,
        goly_aparat_status=goly_status,
        goly_aparat_wartosc_ka=goly_wartosc,
    )


# =============================================================================
# Generator — 10 kroków
# =============================================================================


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
        ib_ka = s_mva / (3**0.5 * data.u_ll_kv)
        ib_a = ib_ka * 1000.0
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
        # ---------------------------------------------------------------
        in_a = data.urzadzenie.in_a
        dobor_spelnia = ib_a <= in_a <= iz_prime_a
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
                    f"$${ib_a:.2f} \\le {in_a:g} \\le {iz_prime_a:.2f}\\;\\mathrm{{A}} "
                    f"\\Rightarrow \\text{{{'spełnia' if dobor_spelnia else 'nie spełnia'}}}$$"
                ),
                result=_pv("I_n", in_a, "A", "in_a"),
                unit_check=_uc("A", "A", "A ≤ A ≤ A"),
                source_keys={"werdykt": "spełnia" if dobor_spelnia else "nie spełnia"},
            )
        )

        # ---------------------------------------------------------------
        # Krok 5: I2 <= 1,45*Iz' (MCB) / 1,6*In wkładki (FUSE_SWITCH)  NEW EQ_LVCV_003
        # ---------------------------------------------------------------
        limit_a = 1.45 * iz_prime_a
        i2_a: float | None
        i2_zrodlo: str
        if data.urzadzenie.kind == KIND_MCB:
            i2_a = PROG_CIEPLNY_WYZWALA_X_IN * in_a
            i2_zrodlo = f"{PROG_CIEPLNY_WYZWALA_X_IN:g}×In (MCB, IEC 60898-1)"
        elif data.urzadzenie.kind == KIND_FUSE_SWITCH:
            i2_a = FUSE_GG_IF_MULTIPLIER * in_a
            i2_zrodlo = f"If={FUSE_GG_IF_MULTIPLIER:g}×In wkładki (IEC 60269-1)"
        else:
            i2_a = None
            i2_zrodlo = (
                "MCCB z wyzwalaczem elektronicznym — brak normatywnego pojedynczego "
                "mnożnika I2 niezależnego od nastaw producenta (zero fabrykacji)"
            )
        i2_spelnia = None if i2_a is None else i2_a <= limit_a
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
                    _pv("I_2", i2_a if i2_a is not None else "NIEROZSTRZYGALNE", "A", "i2_a"),
                    _pv("I_z'", iz_prime_a, "A", "iz_prime_a"),
                ),
                substitution_latex=(
                    f"$$I_2 = {i2_a:.2f}\\;\\mathrm{{A}} \\le 1{{,}}45 \\cdot {iz_prime_a:.2f} "
                    f"= {limit_a:.2f}\\;\\mathrm{{A}}$$"
                    if i2_a is not None
                    else r"$$I_2 \text{ — NIEROZSTRZYGALNE (brak normatywnego mnożnika MCCB)}$$"
                ),
                result=_pv(
                    "I_2",
                    i2_a if i2_a is not None else "NIEROZSTRZYGALNE",
                    "A",
                    "i2_a",
                ),
                unit_check=_uc("A", "A", "A ≤ A"),
                source_keys={
                    "werdykt": (
                        "nierozstrzygalne"
                        if i2_spelnia is None
                        else ("spełnia" if i2_spelnia else "nie spełnia")
                    )
                },
            )
        )

        # ---------------------------------------------------------------
        # Krok 6: Zdolność wyłączania — DWA ZDANIA                NEW EQ_LVCV_004
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
                        (
                            zdolnosc.kombinacja_wartosc_ka
                            if zdolnosc.kombinacja_wartosc_ka is not None
                            else "NIE_DOTYCZY"
                        ),
                        "kA",
                        "conditional_sc_current_ka",
                    ),
                    _pv(
                        "I_{cu/cn}",
                        (
                            zdolnosc.goly_aparat_wartosc_ka
                            if zdolnosc.goly_aparat_wartosc_ka is not None
                            else "NIE_DOTYCZY"
                        ),
                        "kA",
                        "icu_or_icn_ka",
                    ),
                    _pv(
                        "I_k''_{max}",
                        data.ik_max_ka if data.ik_max_ka is not None else "NIEDOSTĘPNE",
                        "kA",
                        "ik_max_ka",
                    ),
                ),
                substitution_latex=(
                    f"$$\\text{{kombinacja: }} {zdolnosc.zdanie_kombinacja_pl}$$\n"
                    f"$$\\text{{goły aparat: }} {zdolnosc.zdanie_goly_aparat_pl}$$"
                ),
                result=_pv(
                    "\\text{werdykt}",
                    f"kombinacja={zdolnosc.kombinacja_status}; goły_aparat={zdolnosc.goly_aparat_status}",
                    "—",
                    "zdolnosc_wylaczania_werdykt",
                ),
                unit_check=_uc("kA", "kA", "kA ≥ kA"),
                source_keys={
                    "zdanie_kombinacja_pl": zdolnosc.zdanie_kombinacja_pl,
                    "zdanie_goly_aparat_pl": zdolnosc.zdanie_goly_aparat_pl,
                },
            )
        )

        # ---------------------------------------------------------------
        # Krok 7: I^2*t <= k^2*S^2                                NEW EQ_LVCV_005
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
        thermal_ok = th.status == "PASS"
        i2t = th.i2t_a2s if th.i2t_a2s is not None else 0.0
        i2t_dop = th.i2t_admissible_a2s if th.i2t_admissible_a2s is not None else 0.0
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 7),
                step_number=7,
                title_pl="Wytrzymałość cieplna przewodu I²t ≤ k²S²",
                equation=eq7,
                input_values=(
                    _pv(
                        "\\int i^{2}\\,dt",
                        i2t if th.i2t_a2s is not None else "NIEDOSTĘPNE",
                        "A²s",
                        "i2t_a2s",
                    ),
                    _pv(
                        "k^{2} S^{2}",
                        i2t_dop if th.i2t_admissible_a2s is not None else "NIEDOSTĘPNE",
                        "A²s",
                        "i2t_admissible_a2s",
                    ),
                ),
                substitution_latex=(
                    f"$${i2t:.1f}\\;\\mathrm{{A^2s}} \\le {i2t_dop:.1f}\\;\\mathrm{{A^2s}} "
                    f"\\Rightarrow \\text{{{th.status}}}$$"
                    if th.i2t_a2s is not None and th.i2t_admissible_a2s is not None
                    else rf"$$\text{{{th.status}}}$$"
                ),
                result=_pv("\\text{status}", th.status, "—", "thermal_status"),
                unit_check=_uc("A²s", "A²s", "A²·s ≤ (A·√s/mm²)² · mm² = A²·s"),
                source_keys={
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
        # Krok 9: Ik1_min = c_min*U0/|Z_petli|                     NEW EQ_LVCV_006
        # ---------------------------------------------------------------
        fl = data.fault_loop
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
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("LVCV", 9),
                step_number=9,
                title_pl="Prąd zwarcia minimalnego z pętli (scenariusz MIN)",
                equation=eq9,
                input_values=(
                    _pv("c_{min}", C_MIN_LV, "—", "c_min"),
                    _pv("U_0", fl.u_nom_v, "V", "u0_v"),
                    _pv("Z_{loop}", fl.z_loop_magnitude_ohm, "Ω", "z_loop_magnitude_ohm"),
                ),
                substitution_latex=(
                    f"$$I_{{k1,min}} = \\frac{{{C_MIN_LV:g} \\cdot {fl.u_nom_v:.2f}}}"
                    f"{{{fl.z_loop_magnitude_ohm:.6f}}} = {fl.ik_min_a:.2f}\\;\\mathrm{{A}}$$"
                ),
                result=_pv("I_{k1,min}", fl.ik_min_a, "A", "ik1_min_a"),
                unit_check=_uc("A", "A", "(—) · V / Ω = A"),
                source_keys={
                    "trasa": ";".join(c.label for c in fl.components),
                    "network_type": fl.network_type.value,
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
        steps.append(
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
                        (
                            data.swz_t_wymagany_s
                            if data.swz_t_wymagany_s is not None
                            else "NIEDOSTĘPNE"
                        ),
                        "s",
                        "t_wymagany_s",
                    ),
                ),
                substitution_latex=rf"$$\text{{{data.swz_przyczyna_pl}}}$$",
                result=_pv("\\text{SWZ}", data.swz_status, "—", "swz_status"),
                unit_check=_uc("A", "A", "A ≥ A (przy dowiedzionym t ≤ t_wym)"),
                source_keys={
                    "zrodlo_czasu": "Tab. 41.1 IEC 60364-4-41 (G-D3)",
                    "pasmo_u0": data.swz_pasmo_u0,
                    "rodzaj_obwodu": data.swz_rodzaj_obwodu,
                },
            )
        )

        # ---------------------------------------------------------------
        # Podsumowanie
        # ---------------------------------------------------------------
        unit_checks_passed = all(step.unit_check.passed for step in steps)
        # Agregacja werdyktu obwodu — NIE_DOTYCZY NIGDY nie blokuje PASS ani nie
        # ściąga werdykt do NIEROZSTRZYGALNE (to inny stan: „pytanie nie ma sensu
        # dla tego aparatu", nie „brak danych"); tylko realny brak danych
        # (nierozstrzygalne) i realna niezgodność (nie spełnia/FAIL) wpływają na
        # agregat. Źródło prawdy = statusy z `ZdolnoscWylaczaniaDwaZdania`, NIE
        # `*_spelnia` (które celowo zlewa NIE_DOTYCZY i nierozstrzygalne w None).
        czesciowe_statusy = [
            STATUS_SPELNIA if dobor_spelnia else STATUS_NIE_SPELNIA,
            (
                STATUS_NIEROZSTRZYGALNE
                if i2_spelnia is None
                else (STATUS_SPELNIA if i2_spelnia else STATUS_NIE_SPELNIA)
            ),
            zdolnosc.kombinacja_status,
            zdolnosc.goly_aparat_status,
            STATUS_SPELNIA if thermal_ok else STATUS_NIE_SPELNIA,
            data.swz_status,
        ]
        rozstrzygalne = [s for s in czesciowe_statusy if s not in (STATUS_NIE_DOTYCZY,)]
        if any(s in (STATUS_NIE_SPELNIA, "nie spełnia") for s in rozstrzygalne):
            overall_status = "FAIL"
        elif any(s in (STATUS_NIEROZSTRZYGALNE, "nierozstrzygalne") for s in rozstrzygalne):
            overall_status = "NIEROZSTRZYGALNE"
        else:
            overall_status = "PASS"

        key_results: dict[str, ProofValue] = {
            "s_mva": _pv("S", s_mva, "MVA", "s_mva"),
            "ib_a": _pv("I_b", ib_a, "A", "ib_a"),
            "iz_prime_a": _pv("I_z'", iz_prime_a, "A", "iz_prime_a"),
            "in_a": _pv("I_n", in_a, "A", "in_a"),
            "i2_a": _pv("I_2", i2_a if i2_a is not None else "NIEROZSTRZYGALNE", "A", "i2_a"),
            "zdanie_kombinacja_pl": _pv(
                "\\text{kombinacja}", zdolnosc.zdanie_kombinacja_pl, "—", "zdanie_kombinacja_pl"
            ),
            "zdanie_goly_aparat_pl": _pv(
                "\\text{goły aparat}", zdolnosc.zdanie_goly_aparat_pl, "—", "zdanie_goly_aparat_pl"
            ),
            "thermal_status": _pv("\\text{I2t}", th.status, "—", "thermal_status"),
            "u_target_kv": _pv("U", u_target_kv, "kV", "u_kv"),
            "ik1_min_a": _pv("I_{k1,min}", fl.ik_min_a, "A", "ik1_min_a"),
            "swz_status": _pv("\\text{SWZ}", data.swz_status, "—", "swz_status"),
        }
        if data.ik_max_ka is not None:
            key_results["ik_max_ka"] = _pv("I_k''_{max}", data.ik_max_ka, "kA", "ik_max_ka")

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
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
            title_pl=f"Dowód: weryfikacja obwodu nN — {data.segment_ref} / {data.breaker_ref}",
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

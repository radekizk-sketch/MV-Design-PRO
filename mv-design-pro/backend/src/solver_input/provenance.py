"""
Parameter provenance tracking for solver-input contract.

Each technical/numerical field in solver payload has a provenance trace entry
documenting its origin (CATALOG, OVERRIDE, DERIVED, DEFAULT_FORBIDDEN).

All structures are JSON-serializable and deterministically sorted.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum, StrEnum
from typing import TYPE_CHECKING, Any, Generic, TypeVar

if TYPE_CHECKING:
    from application.solvers.solver_capability_registry import PhysicsDomain

T = TypeVar("T")


class SourceKind(Enum):
    """Origin of a parameter value in solver-input payload (PIPELINE axis).

    Answers: *where did this value come from in the pipeline* — catalog lookup,
    user override, a derivation rule, or a forbidden default.
    """

    CATALOG = "CATALOG"
    OVERRIDE = "OVERRIDE"
    DERIVED = "DERIVED"
    DEFAULT_FORBIDDEN = "DEFAULT_FORBIDDEN"


class FieldQuality(StrEnum):
    """Data-quality provenance axis for a single card field.

    Orthogonal to :class:`SourceKind` (which records *where* a value came from in
    the pipeline). ``FieldQuality`` records *how trustworthy* the value is:

    - ``DATASHEET`` (karta_techniczna): value taken from a manufacturer datasheet
      / type-test report — fully trustworthy for the OSD package.
    - ``ESTIMATED`` (oszacowane): value is an engineering estimate without a real
      source (e.g. a controller bandwidth assumed from technology defaults). It
      MUST be tagged ``ESTIMATED`` — never ``DATASHEET`` — until a real source is
      attached.
    - ``SYSTEM_DEFAULT`` (domyslne_techniczne): value is a system/technical
      default carried by the schema (the field is present but no real value has
      been provided).

    Paramount rule: "no gaps" means the schema is COMPLETE (every field present),
    NOT that every field is filled with a fabricated value. A value with no real
    source is ``ESTIMATED`` (or ``SYSTEM_DEFAULT``), never ``DATASHEET``.
    """

    DATASHEET = "DATASHEET"
    ESTIMATED = "ESTIMATED"
    SYSTEM_DEFAULT = "SYSTEM_DEFAULT"

    @property
    def label_pl(self) -> str:
        """Polish UI label (no codenames)."""
        return _FIELD_QUALITY_LABEL_PL[self]


_FIELD_QUALITY_LABEL_PL: dict[FieldQuality, str] = {
    FieldQuality.DATASHEET: "karta_techniczna",
    FieldQuality.ESTIMATED: "oszacowane",
    FieldQuality.SYSTEM_DEFAULT: "domyslne_techniczne",
}


class EvidenceTier(StrEnum):
    """Stopien dowodowy WYNIKU obliczenia (trzecia os proweniencji, karta S-1).

    Orthogonal do dwoch osi powyzej:

    - :class:`SourceKind` — skad wartosc WEJSCIOWA pochodzi w potoku;
    - :class:`FieldQuality` — jak bardzo wiarygodna jest wartosc WEJSCIOWA;
    - ``EvidenceTier`` — czy WYNIK obliczenia wolno przedstawic jako dowod
      spelnienia wymagania normatywnego.

    Rozroznienie, ktorego dwie starsze osie nie wyrazaja: wejscie moze byc
    danymi z karty katalogowej najwyzszej jakosci, a mimo to obliczenie, ktore
    je konsumuje, moze nie miec ustalonej poprawnosci fizycznej. Dopuszczalnosc
    dowodowa jest cecha OBLICZENIA (zdolnosci), nie pojedynczego pola.

    Poziomy:

    - ``VALIDATED_SIMULATION``: obliczenie fizyczne o ustalonej poprawnosci
      modelu i zachowania numerycznego (istnieje dowod walidacji). JEDYNY
      poziom dopuszczalny jako dowod regulacyjny.
    - ``DECLARATION``: wartosc zadeklarowana przez wnioskodawce (albo
      odczytana z profilu) i porownana z wymaganiem. Uprawniona kontrola
      wymagania — ale obliczenie niczego nie wykazalo.
    - ``UNVALIDATED_MODEL``: obliczenie zostalo wykonane, ale model za nim nie
      ma ustalonej poprawnosci fizycznej, wiec jego wynik nie moze wspierac
      wniosku normatywnego.
    - ``NOT_SIMULATED``: zadne obliczenie fizyczne nie zostalo wykonane;
      wielkosc „symulowana" przypisana takiemu wynikowi nie jest wartoscia
      policzona.

    Zasada nadrzedna (lustro reguly FieldQuality): awans do
    ``VALIDATED_SIMULATION`` wynika z WYKAZANEJ zdolnosci, nigdy z nazwania.
    Oznaczenie zdolnosci jako zwalidowanej nie czyni jej zwalidowana — poziom
    podnosi sie wylacznie, gdy istnieje dowod walidacji.
    """

    VALIDATED_SIMULATION = "VALIDATED_SIMULATION"
    DECLARATION = "DECLARATION"
    UNVALIDATED_MODEL = "UNVALIDATED_MODEL"
    NOT_SIMULATED = "NOT_SIMULATED"

    @property
    def regulatory_evidence_eligible(self) -> bool:
        """True wylacznie dla poziomu dopuszczalnego jako dowod regulacyjny (fail-closed)."""
        return self is EvidenceTier.VALIDATED_SIMULATION

    @property
    def label_pl(self) -> str:
        """Etykieta PL (bez kodow projektowych)."""
        return _EVIDENCE_TIER_LABEL_PL[self]


#: Zdanie kanoniczne uzywane wszedzie, gdzie wynik NIE jest dowodem
#: regulacyjnym. Swiadomie mowi o BRAKU DOWODU, a nie o niespelnieniu
#: wymagania — to dwa rozne stany („nie spelnia" jest wynikiem wykazanym i
#: raportowalnym; „brak dowodu" to inny stan) i mylenie ich byloby rownie
#: nieuczciwe jak falszywy wynik pozytywny.
BRAK_DOWODU_PL = "BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA"

_EVIDENCE_TIER_LABEL_PL: dict[EvidenceTier, str] = {
    EvidenceTier.VALIDATED_SIMULATION: "symulacja_zwalidowana",
    EvidenceTier.DECLARATION: "deklaracja_wnioskodawcy",
    EvidenceTier.UNVALIDATED_MODEL: "model_niezwalidowany",
    EvidenceTier.NOT_SIMULATED: "brak_symulacji",
}


class ClaimKind(StrEnum):
    """Rodzaj twierdzenia, ktore wynik zdolnosci wspiera.

    - ``DYNAMIC_PERFORMANCE``: narzedzie orzeka, jak modul ZACHOWUJE SIE w
      czasie (LVRT/HVRT, odbudowa mocy czynnej, odpowiedz czestotliwosciowa,
      praca wyspowa, stabilnosc). Wylacznie zwalidowana symulacja moze
      wspierac takie twierdzenie.
    - ``DECLARED_CONFIGURATION``: narzedzie orzeka ZADEKLAROWANY albo
      katalogowy FAKT o module (tryb regulacji, telemechanika, THD z rekordu
      katalogowego) porownany z wymaganiem. Deklaracja jest wlasciwa
      podstawa takiego twierdzenia.
    - ``PHYSICAL_QUANTITY``: narzedzie orzeka WIELKOSC FIZYCZNA stanu
      ustalonego albo zwarcia (prad zwarciowy, napiecie, przeplyw, czas
      zadzialania z krzywej) policzona solverem — nie zachowanie modulu w
      czasie i nie deklaracje. Dowodem jest wylacznie symulacja zwalidowana
      wobec niezaleznej wyroczni (karta AB-1a D1, odbior wykonawcy 1: bez tego
      rodzaju zwarcia i rozplywy nosily myla etykiete „zachowanie_dynamiczne").

    Domyslnie ``DYNAMIC_PERFORMANCE`` — SUROWSZE odczytanie, zeby zdolnosc
    zarejestrowana bez przemyslenia nie stala sie dopuszczalna przez pominiecie.
    """

    DYNAMIC_PERFORMANCE = "DYNAMIC_PERFORMANCE"
    DECLARED_CONFIGURATION = "DECLARED_CONFIGURATION"
    PHYSICAL_QUANTITY = "PHYSICAL_QUANTITY"

    @property
    def label_pl(self) -> str:
        return _CLAIM_KIND_LABEL_PL[self]


_CLAIM_KIND_LABEL_PL: dict[ClaimKind, str] = {
    ClaimKind.DYNAMIC_PERFORMANCE: "zachowanie_dynamiczne",
    ClaimKind.DECLARED_CONFIGURATION: "konfiguracja_zadeklarowana",
    ClaimKind.PHYSICAL_QUANTITY: "wielkosc_fizyczna",
}


@dataclass(frozen=True)
class CapabilityEvidence:
    """Klasyfikacja dowodowa jednej zdolnosci obliczeniowej.

    Attributes:
        capability_id: Stabilny, kropkowany identyfikator zdolnosci
            (np. ``"ncrfg_ptpiree.ride_through"``). Nazywa OBLICZENIE, nie pole.
        tier: Stopien dowodowy wynikow tej zdolnosci.
        rationale_pl: Techniczne uzasadnienie stopnia (bez jezyka miekkiego).
        audit_ref: Odniesienie do dowodu stojacego za klasyfikacja.
        claim_kind: Rodzaj twierdzenia, ktore ta zdolnosc wspiera. Domyslnie
            ``DYNAMIC_PERFORMANCE`` (surowsze odczytanie).
    """

    capability_id: str
    tier: EvidenceTier
    rationale_pl: str
    audit_ref: str
    claim_kind: ClaimKind = ClaimKind.DYNAMIC_PERFORMANCE

    @property
    def regulatory_evidence_eligible(self) -> bool:
        """Czy wynik TEJ zdolnosci wolno przedstawic jako dowod TEGO twierdzenia?

        Fail-closed w obu osiach:

        - twierdzenie o zachowaniu dynamicznym wymaga ``VALIDATED_SIMULATION``;
        - twierdzenie o konfiguracji zadeklarowanej dodatkowo dopuszcza
          ``DECLARATION`` (deklaracja JEST wlasciwa podstawa faktu
          zadeklarowanego) — ale nigdy nie dopuszcza ``UNVALIDATED_MODEL`` ani
          ``NOT_SIMULATED``, co oznaczaloby zle zarejestrowana zdolnosc.
        """
        if self.tier is EvidenceTier.VALIDATED_SIMULATION:
            return True
        if self.claim_kind is ClaimKind.DECLARED_CONFIGURATION:
            return self.tier is EvidenceTier.DECLARATION
        return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "capability_id": self.capability_id,
            "tier": self.tier.value,
            "tier_pl": self.tier.label_pl,
            "claim_kind": self.claim_kind.value,
            "claim_kind_pl": self.claim_kind.label_pl,
            "regulatory_evidence_eligible": self.regulatory_evidence_eligible,
            "rationale_pl": self.rationale_pl,
            "audit_ref": self.audit_ref,
        }


#: Odniesienie audytowe dla rejestru ponizej — karta naprawcza S-1 (dowod
#: repo: solver NC RfG T14/T15 jest tautologia, `_execute_dynamic_stability`
#: wpisywal `reportable`/`complete` na sztywno; patrz `SYNTEZA_DOMKNIECIA_
#: PRODUKTU_2026-09.md` A-2/A-6).
_AUDIT_CARD = "karta_s1_s4_dowod.md"

# Klasyfikacja dowodowa zdolnosci dynamicznych/normatywnych.
#
# KAZDY wpis jest DECLARATION, UNVALIDATED_MODEL albo NOT_SIMULATED: na dzien
# tej karty ZADNA zdolnosc dynamiczna w repozytorium nie ma ustalonej
# poprawnosci fizycznej, wiec zadna nie jest dopuszczalna jako dowod
# regulacyjny. Wpis wolno podniesc do VALIDATED_SIMULATION WYLACZNIE razem z
# dowodem walidacji tej zdolnosci (siec referencyjna / wyrocznia zewnetrzna /
# rozwiazanie analityczne) — poza zakresem tej karty (OD-20).
#
# Rejestr NIE jest wyczerpujacy dla przyszlych zdolnosci: nieznany
# capability_id rozwiazuje sie do UNVALIDATED_MODEL (fail-closed) w
# `classify_dynamic_capability` — nowy albo przemianowany silnik dynamiczny
# jest niedopuszczalny, dopoki nie zostanie swiadomie sklasyfikowany.
_DYNAMIC_CAPABILITY_EVIDENCE: dict[str, CapabilityEvidence] = {
    entry.capability_id: entry
    for entry in (
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.frequency_response",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Odpowiedz czestotliwosciowa (LFSM-O/LFSM-U/FSM/odbudowa) jest "
                "podstawieniem algebraicznym przy zaszytej czestotliwosci "
                "testowej; brak przebiegu f(t)/P(t) — solvers/ncrfg_ptpiree/"
                "engine.py."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T01-T04)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.ride_through",
            tier=EvidenceTier.NOT_SIMULATED,
            rationale_pl=(
                "Ocena LVRT/HVRT nie uruchamia zadnej symulacji: "
                "`simulated_voltage` jest przypisywane z limitu profilu, wiec "
                "margines wychodzi tozsamosciowo zerowy niezaleznie od danych "
                "modulu — solvers/ncrfg_ptpiree/engine.py:646-655."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T14/T15)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.p_recovery",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Czas odbudowy mocy czynnej jest wartoscia zadeklarowana na "
                "wejsciu i porownana z wymaganiem profilu; nie pochodzi z "
                "przebiegu P(t)."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T16)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.reactive_current_frt",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Prad bierny podczas zwarcia jest wyliczany z zadeklarowanego "
                "wzmocnienia przy zaszytym spadku napiecia; nie pochodzi z "
                "przebiegu Iq(t)."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T17)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.extended_dynamic_capability",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Praca wyspowa, rozruch autonomiczny i tlumienie oscylacji sa "
                "orzekane z trzech flag zadeklarowanych na wejsciu; zadne z "
                "tych zjawisk nie jest liczone. To sa twierdzenia o "
                "ZACHOWANIU dynamicznym, wiec deklaracja ich nie dowodzi."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T18)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.declared_configuration",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Potwierdzenie PMIN (T11) i telemechanika/SCADA/rejestrator (T19) "
                "sa faktami konfiguracyjnymi porownanymi z wymaganiem profilu — "
                "deklaracja jest tu wlasciwa podstawa dowodowa. Karta AB-1a (R-6): "
                "T05, T12, T13 przeniesione do `ncrfg_ptpiree.zachowanie_zadeklarowane` "
                "(twierdzenia o zachowaniu w czasie), T10 do "
                "`ncrfg_ptpiree.test_bez_tresci` (tautologia)."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T11, T19); KARTA_AB_1A §0 R-6",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.zachowanie_zadeklarowane",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DYNAMIC_PERFORMANCE,
            rationale_pl=(
                "Regulacja mocy czynnej (T05), zaprzestanie generacji w czasie "
                "nie dluzszym niz 5 s (T12) i zmniejszenie generacji z zadanym "
                "gradientem (T13) sa twierdzeniami o ZACHOWANIU modulu w czasie, "
                "nie faktami konfiguracyjnymi — solver porownuje wylacznie "
                "wartosci zadeklarowane w programie szczegolowym. Deklaracja nie "
                "dowodzi zachowania dynamicznego, dopoki profil regulacyjny jawnie "
                "nie zaakceptuje metody DECLARATION/CERTIFICATE dla tego wymagania "
                "(kamienie AB-1b/AB-1c)."
            ),
            audit_ref="KARTA_AB_1A §0 R-6; OPUS_AUDYT_WARSTWY_REGULACYJNEJ §6.6 p. 6",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.test_bez_tresci",
            tier=EvidenceTier.NOT_SIMULATED,
            claim_kind=ClaimKind.DYNAMIC_PERFORMANCE,
            rationale_pl=(
                "Potwierdzenie PMAX (T10) sprawdza wylacznie `p_max_kw > 0`, a "
                "kontrakt wejscia modulu wymaga `p_max_kw > 0` juz przy budowie — "
                "test przechodzi zawsze, niezaleznie od danych modulu (tautologia, "
                "solvers/ncrfg_ptpiree/engine.py `_pmax_pmin_test`, kontrakt "
                "`NcRfgPtpireeModuleInput.p_max_kw: Field(gt=0)`). Zadna "
                "wielkosc nie jest tu wykazana, wiec wynik nie jest dowodem."
            ),
            audit_ref="KARTA_AB_1A §0 R-6; OPUS_AUDYT_WARSTWY_REGULACYJNEJ §6.6",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.reactive_voltage_mode",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Tryby regulacji U/Q/cosfi i zakres mocy biernej (T06-T09) "
                "pochodza z deklaracji i profilu operatora — fakty "
                "konfiguracyjne."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T06-T09)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.power_quality_declared",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DYNAMIC_PERFORMANCE,
            rationale_pl=(
                "T20 porownuje wartosc THD_U z rekordu katalogowego zrodla z "
                "limitem 8 % ZASZYTYM w solverze (solvers/ncrfg_ptpiree/engine.py "
                "`_harmonics_test`), nie odczytanym z profilu operatora. THD_U jest "
                "wlasnoscia napiecia sieci w miejscu przylaczenia, a nie emisji "
                "urzadzenia — porownanie nie wykazuje spelnienia zadnego wymagania "
                "emisyjnego (to nie jest fakt konfiguracyjny). Wymaganie emisyjne "
                "instalacji ocenia sie wkladem instalacji wobec przydzialu emisji "
                "z dokumentu wskazanego decyzja wlasciciela (OD-38)."
            ),
            audit_ref=(
                f"{_AUDIT_CARD} §0.2 (T20); KARTA_AB_1A §0 R-6; "
                "OPUS_AUDYT_WARSTWY_REGULACYJNEJ §2.2"
            ),
        ),
        CapabilityEvidence(
            capability_id="dynamic_stability.fault_clear",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Katy wirnika i wielkosci pozwarciowe pochodza z opcji biegu "
                "(z wartosciami domyslnymi); werdykt jest porownaniem "
                "progowym wzgledem tych katow, nie calkowaniem rownan ruchu "
                "ukladu — enm/canonical_analysis.py::_execute_dynamic_stability."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.5",
        ),
        CapabilityEvidence(
            capability_id="dynamika_rms.przebieg_czasowy",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Bieg RMS calkuje rownania ruchu ukladu na widoku sieci rozpływu "
                "(rdzen DAE, network_model/solvers/dynamika/), wiec wynik JEST "
                "policzony — ale poprawnosc modelu nie jest WYKAZANA: rdzen ma "
                "wyrocznie analityczne dla ukladu maszyna-szyna sztywna, nie ma "
                "walidacji przebiegow dla pelnej biblioteki urzadzen na sieci "
                "rzeczywistej. Parametry z profilu typowego normy sa deklaracja "
                "projektanta (enm/dynamika_modele.py::ProweniencjaParametrow), "
                "wiec awans do VALIDATED_SIMULATION wymaga dowodu walidacji tej "
                "zdolnosci, nie samego faktu, ze bieg sie wykonal."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.5 (W6-3B: adapter biegu czasowego)",
        ),
        CapabilityEvidence(
            capability_id="frt_hvrt.trajectory",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Trajektoria napiecia MVP jest funkcja zadana parametryzowana "
                "wejsciem scenariusza, nie rozwiazaniem sieci sprzezonym z "
                "reszta modulu — network_model/solvers/frt_hvrt/engine.py."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.9",
        ),
    )
}


def classify_dynamic_capability(capability_id: str) -> CapabilityEvidence:
    """Zwroc klasyfikacje dowodowa zdolnosci dynamicznej (fail-closed).

    Niezarejestrowany identyfikator jest klasyfikowany ``UNVALIDATED_MODEL`` —
    nowy albo przemianowany silnik dynamiczny jest niedopuszczalny jako dowod
    regulacyjny, dopoki nie zostanie swiadomie sklasyfikowany, wiec pominiecie
    rejestracji nie moze cicho wyprodukowac dopuszczalnego dowodu.
    """
    known = _DYNAMIC_CAPABILITY_EVIDENCE.get(capability_id)
    if known is not None:
        return known
    return CapabilityEvidence(
        capability_id=capability_id,
        tier=EvidenceTier.UNVALIDATED_MODEL,
        rationale_pl=(
            "Zdolnosc dynamiczna nie jest sklasyfikowana w rejestrze "
            "dowodowym; domyslnie nieprzydatna jako dowod regulacyjny "
            "(fail-closed)."
        ),
        audit_ref=f"{_AUDIT_CARD} §0.1 (fail-closed)",
    )


def registered_dynamic_capabilities() -> tuple[str, ...]:
    """Identyfikatory zdolnosci w rejestrze dowodowym, posortowane deterministycznie."""
    return tuple(sorted(_DYNAMIC_CAPABILITY_EVIDENCE))


# ---------------------------------------------------------------------------
# Stopien dowodowy zdolnosci REJESTRU SOLVEROW (karta AB-1a D1).
#
# PO CO. Rejestr zdolnosci solverow (`application/solvers/solver_capability_
# registry.py`) do tej karty ZAPISYWAL `reportable=True` w kazdym wpisie, podczas
# gdy ten modul — jedyne zrodlo stopnia dowodowego — mowil o tej samej zdolnosci
# co innego (np. `dynamic_stability.fault_clear = UNVALIDATED_MODEL`). Dwie prawdy
# o jednym fakcie. Od karty AB-1a `reportable` rejestru jest WYPROWADZANY stad:
# kazdy wpis rejestru wskazuje JAWNIE swoj `capability_id` (pole
# `SolverCapability.evidence_capability_id`), a `classify_capability` zwraca jego
# klasyfikacje (fail-closed: identyfikator nieznany = UNVALIDATED_MODEL).
#
# REGULA AWANSU (ta sama co wyzej): `VALIDATED_SIMULATION` WYLACZNIE, gdy w repo
# istnieje test porownujacy wynik TORU KANONICZNEGO z niezalezna wyrocznia
# (narzedzie zewnetrzne, wyrocznia reczna normy, rozwiazanie analityczne w
# postaci zamknietej) — `audit_ref` nazywa ten test. Test kontraktu, determinizmu
# albo „wynik ma klucz X" NIE jest wyrocznia. Brak wyroczni = `UNVALIDATED_MODEL`
# z nazwanym brakiem w `rationale_pl` — nigdy cichy awans.
#
# `claim_kind` tych wpisow = `PHYSICAL_QUANTITY` (odbior wykonawcy 1 karty AB-1a):
# wynik solvera stanu ustalonego/zwarc jest wielkoscia fizyczna, nie twierdzeniem
# o zachowaniu modulu w czasie; dopuszczalnosc bez zmian — wylacznie
# `VALIDATED_SIMULATION` (`CapabilityEvidence.regulatory_evidence_eligible`).
#
# Rozlacznosc kluczy z rejestrem dynamicznym powyzej przypina test
# (`tests/solver_input/test_proweniencja_ab1a.py`).
# ---------------------------------------------------------------------------

_AUDIT_AB1A = "KARTA_AB_1A_FUNDAMENT_WYNIKOW_2026-09.md D1"

#: Brak wyroczni dla solvera akademickiego V12.6 (FROZEN) — jedno zdanie
#: wspolne dla czternastu rodzajow, zeby uzasadnienie nie rozjechalo sie
#: miedzy kopiami. Stan zmierzony 2026-09-23: testy `reference_test` rejestru
#: dla tych rodzajow (`tests/test_v126_*.py`) sprawdzaja kontrakt, determinizm,
#: ksztalt tablic i wzor samego solvera — zaden nie porownuje wyniku z
#: niezalezna wyrocznia.
_V126_BEZ_WYROCZNI_PL = (
    "Solver akademicki V12.6 (network_model/solvers/v126_academic.py, FROZEN) "
    "liczy te zdolnosc, ale w repozytorium nie ma testu porownujacego jej wynik "
    "z niezalezna wyrocznia (siec referencyjna, narzedzie zewnetrzne, "
    "rozwiazanie analityczne) — test rejestru sprawdza kontrakt i determinizm, "
    "nie poprawnosc fizyczna."
)


def _v126(kod: str, brak_pl: str) -> CapabilityEvidence:
    return CapabilityEvidence(
        capability_id=f"v126_academic.{kod}",
        tier=EvidenceTier.UNVALIDATED_MODEL,
        claim_kind=ClaimKind.PHYSICAL_QUANTITY,
        rationale_pl=f"{_V126_BEZ_WYROCZNI_PL} {brak_pl}",
        audit_ref=f"{_AUDIT_AB1A}; tests/test_v126_*.py (pomiar 2026-09-23)",
    )


_SOLVER_CAPABILITY_EVIDENCE: dict[str, CapabilityEvidence] = {
    entry.capability_id: entry
    for entry in (
        CapabilityEvidence(
            capability_id="short_circuit_iec60909.sc_3f",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Zwarcie trojfazowe toru kanonicznego (assembler -> FROZEN "
                "ShortCircuitIEC60909Solver) zgodne z wyrocznia reczna IEC 60909-0:2016 "
                "(rtol 1e-4) i z pandapower na sieciach Thevenina oraz w scenariuszach "
                "max/min."
            ),
            audit_ref=(
                "tests/golden/parytet_benchmarkow/test_wyrocznia_a_expected_json.py::"
                "test_iec60909_example_sc, ::test_pandapower_iec60909_radial_sc; "
                "tests/golden/wyrocznie/test_pandapower_wyspy.py::"
                "test_zwarcie_3f_sieci_thevenina_zgodne_z_pandapower; "
                "tests/golden/wyrocznie/test_pandapower_k7_sk_min.py::"
                "test_zwarcie_3f_min_i_max_zgodne_z_pandapower"
            ),
        ),
        CapabilityEvidence(
            capability_id="short_circuit_iec60909.sc_2f",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Zwarcie dwufazowe toru kanonicznego zgodne z wyrocznia reczna IEC "
                "60909-0:2016 (Z_k = Z_1 + Z_2, wiersz 2F sieci przykladowej, rtol 1e-4)."
            ),
            audit_ref=(
                "tests/golden/parytet_benchmarkow/test_wyrocznia_a_expected_json.py::"
                "test_iec60909_example_sc (expected/iec60909_example.json, wiersz 2F)"
            ),
        ),
        CapabilityEvidence(
            capability_id="short_circuit_iec60909.sc_1f",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Zwarcie jednofazowe: impedancja zerowa na szynie nN liczona recznie "
                "(Z_T0 transformatora Dyn) i prad I_k1 = sqrt(3)*c*U_n/|Z_1+Z_2+Z_0| "
                "(IEC 60909, skladowe symetryczne) zgodne z wynikiem solvera, wartosc "
                "przypieta z obliczenia recznego."
            ),
            audit_ref=(
                "tests/enm/test_zero_sequence_transformer.py::TestHandCalc1F::"
                "test_ik1_matches_iec_formula, ::test_z0_at_lv_equals_transformer_leakage"
            ),
        ),
        CapabilityEvidence(
            capability_id="short_circuit_iec60909.sc_2f_g",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Zwarcie dwufazowe z ziemia: Z_k = Z_1 + Z_2*Z_0/(Z_2+Z_0) (IEC 60909) "
                "z impedancja zerowa liczona recznie zgodne z wynikiem solvera."
            ),
            audit_ref=(
                "tests/enm/test_zero_sequence_transformer.py::TestHandCalc2FZ::"
                "test_2fz_uses_parallel_z2_z0"
            ),
        ),
        CapabilityEvidence(
            capability_id="load_flow.newton_raphson",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Rozplyw Newtona-Raphsona toru kanonicznego zgodny z wartosciami "
                "oczekiwanymi IEEE 4/9/14/39, CIGRE MV/LV i sieci pandapower "
                "(wyrocznia zewnetrzna, tolerancja per wiersz)."
            ),
            audit_ref=(
                "tests/golden/parytet_benchmarkow/test_wyrocznia_a_expected_json.py "
                "(test_ieee_*_pf, test_cigre_*_pf, test_pp_simple_four_bus_pf); "
                "tests/golden/wyrocznie/test_pandapower_wyspy.py::"
                "test_rozplyw_zgodny_z_pandapower"
            ),
        ),
        CapabilityEvidence(
            capability_id="load_flow.gauss_seidel",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Tryb Gaussa-Seidla daje napiecia, katy i straty zgodne z Newtonem-"
                "Raphsonem (ten sam model Y-bus), ktorego zgodnosc z wyrocznia "
                "zewnetrzna jest wykazana — walidacja przechodnia przez parytet."
            ),
            audit_ref=(
                "tests/test_power_flow_gauss_seidel.py (test_*_matches_newton, "
                "test_losses_match_newton)"
            ),
        ),
        CapabilityEvidence(
            capability_id="load_flow.fast_decoupled",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Tryb fast-decoupled daje napiecia zgodne z Newtonem-Raphsonem "
                "(ten sam model Y-bus) przy spelnionych warunkach stosowalnosci — "
                "walidacja przechodnia przez parytet."
            ),
            audit_ref=("tests/test_power_flow_fast_decoupled.py::TestFastDecoupledVsNewtonRaphson"),
        ),
        CapabilityEvidence(
            capability_id="load_flow_unbalanced.bfs",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Rozplyw niesymetryczny (BFS per faza) toru kanonicznego zgodny z "
                "wartosciami oczekiwanymi sieci IEEE 34-bus (wyrocznia zewnetrzna)."
            ),
            audit_ref=(
                "tests/golden/parytet_benchmarkow/test_wyrocznia_a_expected_json.py::"
                "test_ieee_34bus_pf_niesymetryczny_zgodny_z_wyrocznia_a"
            ),
        ),
        CapabilityEvidence(
            capability_id="phase_state_sn.radial",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Stan fazowy SN (model promieniowy z rezystancja galezi per faza) "
                "zgodny z przypadkami obliczonymi recznie: uklad symetryczny "
                "(U_f = U_n/sqrt(3), wskazniki asymetrii 0 %) oraz zwarcie i przerwa "
                "fazy (spadek I*R, zerowe napiecie fazy przerwanej)."
            ),
            audit_ref=(
                "tests/test_phase_state_sn_solver.py::"
                "test_phase_state_sn_solver_balanced_reference_case, "
                "::test_phase_state_sn_solver_fault_and_open_phase_are_reflected_in_outputs"
            ),
        ),
        CapabilityEvidence(
            capability_id="protection_sn.iec60255",
            tier=EvidenceTier.VALIDATED_SIMULATION,
            claim_kind=ClaimKind.PHYSICAL_QUANTITY,
            rationale_pl=(
                "Ocena zabezpieczen nadpradowych liczy czasy zadzialania "
                "charakterystyk IEC 60255-151 (NI/VI/EI/RI/DT) zgodne z wartosciami "
                "odniesienia normy, na pradach zwarciowych biegu IEC 60909, ktorego "
                "zgodnosc z wyrocznia jest wykazana wyzej."
            ),
            audit_ref=(
                "tests/test_protection_iec60255.py (wartosci odniesienia IEC 60255-151); "
                "short_circuit_iec60909.sc_3f"
            ),
        ),
        _v126(
            "power_quality_harmonics",
            "Model galezi R = const, X*h bez kwalifikacji domeny i wstrzykiwanie "
            "pradow wszystkich zrodel z faza 0 (audyt harmonicznych, program A/B §8).",
        ),
        _v126(
            "ssci_impedance",
            "Werdykt Nyquista z zaszytym marginesem 30 stopni i Z_grid z impedancji "
            "zrodla odrzuconej audytem (program A/B §6 poz. 10).",
        ),
        _v126("voltage_stability", "Krzywe P-V/Q-V i wskaznik modalny bez wyroczni."),
        _v126(
            "reliability_contingency",
            "Wskazniki SAIDI/SAIFI z danych awaryjnosci bez wyroczni; ranking N-1 "
            "zdjety z powierzchni (karta W3-E).",
        ),
        _v126("earthing_safety", "Napiecia dotykowe i krokowe IEEE 80 bez wyroczni."),
        _v126(
            "neutral_earthing_design",
            "Test rejestru porownuje indukcyjnosc dlawika z tym samym wzorem, "
            "ktory solver implementuje (L = 1/(3*omega^2*C_0)) — to nie jest "
            "wyrocznia niezalezna.",
        ),
        _v126(
            "insulation_coordination",
            "Tablica BIL i wspolczynniki TOV zaszyte w solverze, bez wyroczni.",
        ),
        _v126(
            "earth_fault_detection",
            "Wybor metody jest tablica decyzyjna, nie obliczeniem fizycznym.",
        ),
        _v126(
            "transient_trv",
            "Przebieg TRV jest funkcja zadana (czestotliwosc wlasna i stala czasowa "
            "z parametrow), nie rozwiazaniem obwodu przejsciowego.",
        ),
        _v126("motor_starting", "Zapad napiecia rozruchowego bez wyroczni."),
        _v126(
            "hosting_capacity",
            "Lokalna impedancja Thevenina bez sprzezenia sieci; zdolnosc wycofana "
            "z nowych biegow (karta W3-E).",
        ),
        _v126(
            "opf_loss_lcc",
            "Wspolczynnik 0,45 zaszyty, prad galezi z jednej szyny; zdolnosc "
            "wycofana z nowych biegow (karta W3-E).",
        ),
        _v126(
            "benchmark_validation",
            "Zdolnosc porownawcza: jej wynik opisuje zgodnosc INNEGO solvera z "
            "wartosciami odniesienia i nie orzeka o spelnieniu zadnego wymagania "
            "projektowego.",
        ),
        _v126(
            "uncertainty_sensitivity",
            "Udzialy wariancji to zaszyte ulamki parametrow (10 % u_k, 5 % |Z|, "
            "10 % S_k), nie propagacja niepewnosci przez model sieci.",
        ),
    )
}


def classify_capability(capability_id: str) -> CapabilityEvidence:
    """Klasyfikacja dowodowa DOWOLNEJ zdolnosci (rejestr dynamiczny + rejestr solverow).

    Jedno wejscie dla konsumenta, ktory nie wie z gory, do ktorej grupy nalezy
    zdolnosc (rejestr zdolnosci solverow). Fail-closed jak
    :func:`classify_dynamic_capability`: identyfikator nieobecny w OBU
    rejestrach = ``UNVALIDATED_MODEL`` (niedopuszczalny jako dowod).
    """
    known = _SOLVER_CAPABILITY_EVIDENCE.get(capability_id)
    if known is not None:
        return known
    return classify_dynamic_capability(capability_id)


def registered_capabilities() -> tuple[str, ...]:
    """Wszystkie identyfikatory obu rejestrow dowodowych, posortowane deterministycznie."""
    return tuple(sorted({*_SOLVER_CAPABILITY_EVIDENCE, *_DYNAMIC_CAPABILITY_EVIDENCE}))


def registered_solver_capabilities() -> tuple[str, ...]:
    """Identyfikatory rejestru zdolnosci solverow (bez rejestru dynamicznego)."""
    return tuple(sorted(_SOLVER_CAPABILITY_EVIDENCE))


# ---------------------------------------------------------------------------
# Kody fail-closed wyniku (W-99, karta AB-1a D6).
# ---------------------------------------------------------------------------


class KodFailClosed(StrEnum):
    """Nazwany powod, dla ktorego wynik NIE niesie wartosci ani werdyktu (W-99).

    Po co: „brak danych" bywal dotad cichym zerem, pustym wierszem albo
    werdyktem „zgodny" z pustej koniunkcji. Kazde miejsce, ktore nie moze
    uczciwie policzyc albo ocenic, konczy sie JEDNYM z tych kodow z opisem, co
    uzytkownik ma zrobic — nigdy liczba zastepcza.

    Slownik jest ZAMKNIETY (pin w `tests/solver_input/test_proweniencja_ab1a.py`):
    nowy kod wymaga etykiety i opisu, inaczej test jest czerwony.

    - ``UNVALIDATED_INPUT``: dana wejsciowa jest, ale jej zrodlo nie jest
      potwierdzone (oszacowanie, wartosc systemowa).
    - ``MODEL_MISSING``: brak modelu elementu w domenie, o ktora pyta bieg (np.
      brak widma, brak impedancji w funkcji czestotliwosci).
    - ``OUTSIDE_DOMAIN``: zapytanie wychodzi poza zakres waznosci modelu
      (czestotliwosc, napiecie, czas) — stan zapytania, nie cecha modelu.
    - ``REQUIREMENT_UNVERIFIED``: wymaganie, wobec ktorego mialby powstac
      werdykt, nie jest potwierdzone (brak dokumentu, wersji albo klauzuli) albo
      nie ma zadnego wymaganego sprawdzenia.
    """

    UNVALIDATED_INPUT = "UNVALIDATED_INPUT"
    MODEL_MISSING = "MODEL_MISSING"
    OUTSIDE_DOMAIN = "OUTSIDE_DOMAIN"
    REQUIREMENT_UNVERIFIED = "REQUIREMENT_UNVERIFIED"

    @property
    def label_pl(self) -> str:
        """Krotka etykieta PL (bez kodow projektowych)."""
        return _KOD_FAIL_CLOSED_LABEL_PL[self]

    @property
    def opis_pl(self) -> str:
        """Co uzytkownik ma zrobic, zeby wynik powstal."""
        return _KOD_FAIL_CLOSED_OPIS_PL[self]

    def to_dict(self) -> dict[str, str]:
        return {"kod": self.value, "label_pl": self.label_pl, "opis_pl": self.opis_pl}


_KOD_FAIL_CLOSED_LABEL_PL: dict[KodFailClosed, str] = {
    KodFailClosed.UNVALIDATED_INPUT: "dane wejściowe niepotwierdzone",
    KodFailClosed.MODEL_MISSING: "brak modelu elementu",
    KodFailClosed.OUTSIDE_DOMAIN: "poza zakresem ważności modelu",
    KodFailClosed.REQUIREMENT_UNVERIFIED: "wymaganie niepotwierdzone",
}

_KOD_FAIL_CLOSED_OPIS_PL: dict[KodFailClosed, str] = {
    KodFailClosed.UNVALIDATED_INPUT: (
        "Wskaż źródło danej (karta katalogowa, protokół pomiaru, dokument producenta) "
        "albo świadomie zaakceptuj oszacowanie — do tego czasu wynik nie jest dowodem."
    ),
    KodFailClosed.MODEL_MISSING: (
        "Uzupełnij model elementu w domenie, której dotyczy obliczenie (typ katalogowy "
        "z odpowiednią sekcją parametrów) — bez modelu wynik nie zostanie policzony."
    ),
    KodFailClosed.OUTSIDE_DOMAIN: (
        "Zawęź zapytanie do zakresu ważności modelu albo wskaż model ważny w żądanym "
        "zakresie — ekstrapolacja poza zakres nie jest wykonywana."
    ),
    KodFailClosed.REQUIREMENT_UNVERIFIED: (
        "Wskaż dokument, wersję i klauzulę wymagania albo zakres wymaganych sprawdzeń "
        "— bez potwierdzonego wymagania werdykt nie jest wydawany."
    ),
}


# ---------------------------------------------------------------------------
# Parametr z proweniencja (W-98, karta AB-1a D5).
# ---------------------------------------------------------------------------


class StatusZrodla(StrEnum):
    """Czy dokument zrodlowy wartosci (norma, profil, karta) jest potwierdzony.

    Os ROZLACZNA z :class:`FieldQuality` (jakosc wartosci karty) — tu chodzi o
    zrodlo NORMATYWNE/regulacyjne: dokument, wersje i klauzule. Wartosc bez
    potwierdzonego dokumentu jest ``UNVERIFIED_SOURCE`` (np. prog, ktorego
    dokumentu nie wskazano) — liczba zostaje, zmienia sie jej opis (karta AB-1a
    §0 R-7).
    """

    UNVERIFIED_SOURCE = "UNVERIFIED_SOURCE"
    VERIFIED_SOURCE = "VERIFIED_SOURCE"

    @property
    def label_pl(self) -> str:
        return _STATUS_ZRODLA_LABEL_PL[self]


_STATUS_ZRODLA_LABEL_PL: dict[StatusZrodla, str] = {
    StatusZrodla.UNVERIFIED_SOURCE: "źródło niezweryfikowane",
    StatusZrodla.VERIFIED_SOURCE: "źródło zweryfikowane",
}


@dataclass(frozen=True)
class WartoscZProweniencja(Generic[T]):
    """Wartosc parametru RAZEM z jej pochodzeniem (W-98: VALUE, UNIT, SOURCE,
    VERSION, STATUS, DOMAIN).

    Po co: liczba bez zrodla, wersji i statusu nie daje sie ocenic — ten sam
    prog 2,0 Hz/s jest dowodem, gdy stoi za nim wskazana klauzula, i domyslem,
    gdy nie stoi nic. Kontrakt wymusza, zeby kazdy konsument (podstawa werdyktu,
    wynik inzynierski) dostawal oba naraz.

    ZADNEGO pola z wartoscia domyslna: brak statusu, zrodla albo jednostki to
    blad budowy (`TypeError` konstruktora), nie cichy status „nieznany".
    `version=None` i `domain=None` sa JAWNYM brakiem (wolajacy musi je podac),
    nie domyslka.

    Attributes:
        value: Wartosc parametru (liczba, tekst, struktura JSON).
        unit: Jednostka (np. ``"Hz/s"``, ``"%"``, ``"-"`` dla bezwymiarowych).
        source: Os potoku — skad wartosc przyszla (:class:`SourceKind`).
        version: Wersja dokumentu/katalogu zrodla; ``None`` = wersja nieznana.
        status: Jakosc wartosci karty (:class:`FieldQuality`) albo status
            dokumentu normatywnego (:class:`StatusZrodla`).
        domain: Domena fizyczna, w ktorej wartosc jest wazna
            (``application.solvers.solver_capability_registry.PhysicsDomain``);
            ``None`` = parametr nie jest zwiazany z domena (np. identyfikator).
    """

    value: T
    unit: str
    source: SourceKind
    version: str | None
    status: FieldQuality | StatusZrodla
    domain: PhysicsDomain | None

    def __post_init__(self) -> None:
        # Leniwy import: rejestr zdolnosci importuje ten modul na poziomie
        # modulu (wyprowadzenie `reportable`), wiec odwrotny import musi byc
        # wykonany dopiero w chwili budowy wartosci.
        from application.solvers.solver_capability_registry import PhysicsDomain

        if not isinstance(self.source, SourceKind):
            raise TypeError(f"WartoscZProweniencja.source musi byc SourceKind: {self.source!r}")
        if not isinstance(self.status, FieldQuality | StatusZrodla):
            raise TypeError(
                "WartoscZProweniencja.status musi byc FieldQuality albo StatusZrodla: "
                f"{self.status!r}"
            )
        if self.domain is not None and not isinstance(self.domain, PhysicsDomain):
            raise TypeError(
                f"WartoscZProweniencja.domain musi byc PhysicsDomain albo None: {self.domain!r}"
            )
        if not self.unit:
            raise ValueError("WartoscZProweniencja.unit nie moze byc pusty (bezwymiarowe: '-').")

    def to_dict(self) -> dict[str, Any]:
        """Postac JSON — klucze stale, kolejnosc stala (determinizm odciskow)."""
        return {
            "value": self.value,
            "unit": self.unit,
            "source": self.source.value,
            "version": self.version,
            "status": self.status.value,
            "status_pl": self.status.label_pl,
            "domain": self.domain.value if self.domain is not None else None,
        }


@dataclass(frozen=True)
class SourceRef:
    """Reference to the source of a parameter value."""

    catalog_ref: str | None = None
    catalog_path: str | None = None
    override_reason: str | None = None
    derivation_rule: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if self.catalog_ref is not None:
            result["catalog_ref"] = self.catalog_ref
        if self.catalog_path is not None:
            result["catalog_path"] = self.catalog_path
        if self.override_reason is not None:
            result["override_reason"] = self.override_reason
        if self.derivation_rule is not None:
            result["derivation_rule"] = self.derivation_rule
        return result


@dataclass(frozen=True)
class ProvenanceEntry:
    """
    Single provenance trace entry for one field in solver-input payload.

    Attributes:
        element_ref: Element reference ID (e.g., "line_1", "trafo_1").
        field_path: Dotted path to the field in payload (e.g., "branches[0].r_ohm_per_km").
        source_kind: Origin category (CATALOG / OVERRIDE / DERIVED / DEFAULT_FORBIDDEN).
        source_ref: Detailed source reference.
        value_hash: Deterministic hash of the value (SHA-256 of JSON-encoded value).
        unit: Physical unit if applicable (e.g., "ohm/km", "A").
        note: Technical note (no soft language).
        quality: Data-quality axis (DATASHEET / ESTIMATED / SYSTEM_DEFAULT).
            Orthogonal to ``source_kind``; optional so existing entries serialize
            byte-identically when unset.
    """

    element_ref: str
    field_path: str
    source_kind: SourceKind
    source_ref: SourceRef = field(default_factory=SourceRef)
    value_hash: str = ""
    unit: str | None = None
    note: str | None = None
    quality: FieldQuality | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "element_ref": self.element_ref,
            "field_path": self.field_path,
            "source_kind": self.source_kind.value,
            "source_ref": self.source_ref.to_dict(),
            "value_hash": self.value_hash,
        }
        if self.unit is not None:
            result["unit"] = self.unit
        if self.note is not None:
            result["note"] = self.note
        if self.quality is not None:
            result["quality"] = self.quality.value
        return result


@dataclass(frozen=True)
class CardFieldStatus:
    """Data-quality status of one field on a converter (inverter) card.

    Lightweight, JSON-serializable. The map {field_name -> CardFieldStatus}
    attached to a card answers, per field, *how trustworthy* its value is. A
    field MISSING from this map is NOT allowed for a complete card — the schema
    is complete, so every card field has a status; the status (not the presence)
    says how trustworthy each value is.

    Attributes:
        field_name: Card field name (matches a ConverterType attribute).
        quality: Data-quality classification (DATASHEET / ESTIMATED / SYSTEM_DEFAULT).
        source_ref: Reference to the real source (datasheet / report) if any.
        note: Technical note (no soft language).
    """

    field_name: str
    quality: FieldQuality
    source_ref: str | None = None
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "field_name": self.field_name,
            "quality": self.quality.value,
        }
        if self.source_ref is not None:
            result["source_ref"] = self.source_ref
        if self.note is not None:
            result["note"] = self.note
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CardFieldStatus:
        return cls(
            field_name=str(data["field_name"]),
            quality=FieldQuality(str(data["quality"])),
            source_ref=data.get("source_ref"),
            note=data.get("note"),
        )


def card_status_map_to_dict(
    status_map: dict[str, CardFieldStatus],
) -> dict[str, dict[str, Any]]:
    """Serialize a {field_name -> CardFieldStatus} map deterministically."""
    return {name: status_map[name].to_dict() for name in sorted(status_map)}


def compute_value_hash(value: Any) -> str:
    """Compute deterministic SHA-256 hash of a JSON-serializable value."""
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class ProvenanceSummary:
    """Aggregated provenance summary for solver-input envelope."""

    catalog_refs_used: tuple[str, ...] = field(default_factory=tuple)
    overrides_used_count: int = 0
    overrides_used_refs: tuple[str, ...] = field(default_factory=tuple)
    derived_fields_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "catalog_refs_used": list(self.catalog_refs_used),
            "overrides_used_count": self.overrides_used_count,
            "overrides_used_refs": list(self.overrides_used_refs),
            "derived_fields_count": self.derived_fields_count,
        }


def build_provenance_summary(entries: list[ProvenanceEntry]) -> ProvenanceSummary:
    """Build aggregated summary from list of provenance entries."""
    catalog_refs: set[str] = set()
    override_refs: set[str] = set()
    derived_count = 0

    for entry in entries:
        if entry.source_kind == SourceKind.CATALOG:
            if entry.source_ref.catalog_ref:
                catalog_refs.add(entry.source_ref.catalog_ref)
        elif entry.source_kind == SourceKind.OVERRIDE:
            override_refs.add(entry.element_ref)
        elif entry.source_kind == SourceKind.DERIVED:
            derived_count += 1

    return ProvenanceSummary(
        catalog_refs_used=tuple(sorted(catalog_refs)),
        overrides_used_count=len(override_refs),
        overrides_used_refs=tuple(sorted(override_refs)),
        derived_fields_count=derived_count,
    )


# Inverter-card ("karta falownika") rating/identity fields. When present these
# seed to DATASHEET (a published catalog rating is treated as datasheet-grade).
_CARD_RATING_FIELDS: tuple[str, ...] = (
    "un_kv",
    "sn_mva",
    "pmax_mw",
    "qmin_mvar",
    "qmax_mvar",
    "cosphi_min",
    "cosphi_max",
    "manufacturer",
    "model",
)


def card_field_quality_map(converter: Any) -> dict[str, CardFieldStatus]:
    """Derive the SEED data-quality map for an inverter card (ConverterType).

    This is only the seed; explicit per-card overrides come later (a separate
    step). Default rule, per field of the COMPLETE card schema:

    - rating / manufacturer / model present (not None) => ``DATASHEET``
      (a published catalog rating is treated as datasheet-grade);
    - controller-bandwidth (SSCI / Z_conv) fields => ``ESTIMATED`` by default
      (these are engineering estimates until a real datasheet value is attached —
      they MUST NOT be tagged DATASHEET just to make D-03 compute);
    - any other card field that is absent (None) => ``SYSTEM_DEFAULT``;
    - SC-model / power-hierarchy fields present (not None) => ``DATASHEET``.

    A field MISSING from the schema is not allowed: the schema is complete, so
    every card field appears in this map; the quality (not the presence) says how
    trustworthy each value is.

    ``converter`` is typed ``Any`` to avoid a hard import of the catalog layer at
    module load; the field tuples are imported lazily from the catalog (single
    source of truth for the card schema).
    """
    from network_model.catalog.types import (  # lazy: avoid import cycle
        _CARD_POWER_HIERARCHY_FIELDS,
        _CARD_SC_MODEL_FIELDS,
        _CARD_SSCI_FIELDS,
    )

    result: dict[str, CardFieldStatus] = {}
    source_ref = getattr(converter, "source_reference", None)

    # Rating / identity block: DATASHEET when present, else SYSTEM_DEFAULT.
    for name in _CARD_RATING_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=FieldQuality.DATASHEET if present else FieldQuality.SYSTEM_DEFAULT,
            source_ref=source_ref if present else None,
        )

    # SC-model and power-hierarchy blocks: DATASHEET when present, else SYSTEM_DEFAULT.
    for name in _CARD_SC_MODEL_FIELDS + _CARD_POWER_HIERARCHY_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=FieldQuality.DATASHEET if present else FieldQuality.SYSTEM_DEFAULT,
            source_ref=source_ref if present else None,
        )

    # Controller-bandwidth + converter-filter (SSCI / Z_conv) block: ESTIMATED by
    # default when present (never DATASHEET without a real source), SYSTEM_DEFAULT
    # when absent. Filter L/R are typical-class VSC estimates, just like the bands.
    for name in _CARD_SSCI_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=FieldQuality.ESTIMATED if present else FieldQuality.SYSTEM_DEFAULT,
            note="oszacowanie pasma/filtra regulatora; wymaga zrodla z karty technicznej",
        )

    return result


def resolve_card_field_quality_map(converter: Any) -> dict[str, CardFieldStatus]:
    """Resolve the EFFECTIVE per-field data-quality map for a converter card.

    Starts from :func:`card_field_quality_map` (the default seed) and applies any
    explicit per-card override carried by the converter as ``card_field_status``
    (a ``{field_name -> CardFieldStatus}`` map, e.g. attached by the catalog
    builder so a reference card can declare its real provenance). The override is
    the single place a card asserts, per field, how trustworthy its value is — it
    can promote a seeded ESTIMATED bandwidth to DATASHEET *only* when a real source
    is attached (the carrier itself records ``source_ref``), and can never be
    fabricated silently because the status is explicit and serialized.

    ``converter`` is ``Any`` to avoid a hard catalog import at module load.
    """
    resolved = card_field_quality_map(converter)
    override = getattr(converter, "card_field_status", None)
    if override:
        for name, status in override.items():
            if isinstance(status, CardFieldStatus):
                resolved[name] = status
            elif isinstance(status, dict):
                resolved[name] = CardFieldStatus.from_dict(status)
    return resolved


# ---------------------------------------------------------------------------
# OSD acceptance gate — blocks the OSD package (NOT the analysis) on any card
# field that is ESTIMATED / SYSTEM_DEFAULT and not consciously accepted.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CardFieldAcceptance:
    """Engineer-acceptance carrier for inverter-card fields toward the OSD package.

    A field whose data quality is ``ESTIMATED`` / ``SYSTEM_DEFAULT`` does NOT block
    the analysis (the full physical model runs on the typical value), but it MUST
    be consciously accepted by an engineer before the card may enter the OSD /
    connection-application ("wniosek przylaczeniowy") package. This carrier is that
    conscious acceptance: a frozen, serializable set of accepted field names plus
    the accepting engineer's identity for the audit trail.

    Attributes:
        accepted_fields: card field names the engineer has explicitly accepted as
            estimated/default for the OSD package.
        accepted_by: optional engineer identity (for the audit trail).
        note: optional technical note (no soft language).
    """

    accepted_fields: frozenset[str] = field(default_factory=frozenset)
    accepted_by: str | None = None
    note: str | None = None

    @classmethod
    def of(cls, fields: set[str] | frozenset[str] | None, **kwargs: Any) -> CardFieldAcceptance:
        """Build from a plain set (``None`` => nothing accepted)."""
        return cls(accepted_fields=frozenset(fields or ()), **kwargs)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"accepted_fields": sorted(self.accepted_fields)}
        if self.accepted_by is not None:
            result["accepted_by"] = self.accepted_by
        if self.note is not None:
            result["note"] = self.note
        return result


# Readiness code (single source of truth) for an unaccepted estimated/default
# card field that blocks the OSD package. Mirrors READINESS_CODES key in
# domain.canonical_operations (no parallel readiness system).
OSD_CARD_FIELD_BLOCKER_CODE = "oze.card_field_not_accepted"


def osd_card_gate(
    converter: Any,
    accepted_fields: set[str] | frozenset[str] | CardFieldAcceptance | None,
) -> tuple[bool, list[Any]]:
    """OSD acceptance gate for one inverter card. Blocks ONLY the OSD package.

    For each card field whose effective :class:`FieldQuality` is ``ESTIMATED`` or
    ``SYSTEM_DEFAULT`` and that is NOT in ``accepted_fields``, emit a
    :class:`~enm.domain_ops_models.ReadinessBlocker` (the existing readiness model —
    no second truth) with a Polish message::

        pole '<f>' = <quality> wymaga akceptacji inzyniera przed pakietem OSD

    ``DATASHEET`` fields never block. The analysis path is independent of this gate:
    the solver still runs on the typical (estimated) value — the gate guards the
    OSD / connection-application export only, exactly per the paramount rule
    (full physical model, explicit status, no deferral, conscious acceptance to
    leave the estimate in the formal package).

    Args:
        converter: a ConverterType-like card (typed ``Any`` to avoid a catalog
            import at module load).
        accepted_fields: the consciously-accepted field names — a plain set, a
            :class:`CardFieldAcceptance` carrier, or ``None`` (nothing accepted).

    Returns:
        ``(ready, blockers)`` — ``ready`` is True iff ``blockers`` is empty.
        Blockers are deterministically ordered by field name.
    """
    from enm.domain_ops_models import ReadinessBlocker  # lazy: avoid import cycle

    if isinstance(accepted_fields, CardFieldAcceptance):
        accepted = set(accepted_fields.accepted_fields)
    else:
        accepted = set(accepted_fields or ())

    quality_map = resolve_card_field_quality_map(converter)
    element_ref = getattr(converter, "id", None)

    blockers: list[Any] = []
    for field_name in sorted(quality_map):
        status = quality_map[field_name]
        if status.quality is FieldQuality.DATASHEET:
            continue  # datasheet-grade values never block the OSD package
        if field_name in accepted:
            continue  # consciously accepted by an engineer
        blockers.append(
            ReadinessBlocker(
                code=OSD_CARD_FIELD_BLOCKER_CODE,
                message_pl=(
                    f"pole '{field_name}' = {status.quality.value} "
                    "wymaga akceptacji inzyniera przed pakietem OSD"
                ),
                element_ref=element_ref,
            )
        )

    return (not blockers, blockers)

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
from enum import Enum
from typing import Any

# Osie ``FieldQuality`` / ``EvidenceTier`` / ``ClaimKind`` i zdanie ``BRAK_DOWODU_PL`` mają JEDNĄ
# definicję w liściu ``werdykt.proweniencja`` (pakiet werdyktu wyjaśnialnego nie może zależeć od
# ``solver_input``, bo import tego pakietu ładuje budowniczego wejścia solverów wraz z ``domain``
# i ``network_model``). Re-eksport zachowuje tożsamość klas dla wszystkich dotychczasowych
# konsumentów ``solver_input.provenance``.
from werdykt.proweniencja import (  # noqa: F401
    BRAK_DOWODU_PL,
    POZIOMY_DOPUSZCZALNE_DLA_TWIERDZENIA,
    ClaimKind,
    EvidenceTier,
    FieldQuality,
)


class SourceKind(Enum):
    """Origin of a parameter value in solver-input payload (PIPELINE axis).

    Answers: *where did this value come from in the pipeline* — catalog lookup,
    user override, a derivation rule, or a forbidden default.
    """

    CATALOG = "CATALOG"
    OVERRIDE = "OVERRIDE"
    DERIVED = "DERIVED"
    DEFAULT_FORBIDDEN = "DEFAULT_FORBIDDEN"


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

        Fail-closed dla KAZDEGO z trzech rodzajow twierdzenia (``ClaimKind``) — tabela
        ``werdykt.proweniencja.POZIOMY_DOPUSZCZALNE_DLA_TWIERDZENIA``:

        - twierdzenie o zachowaniu dynamicznym wymaga ``VALIDATED_SIMULATION`` albo
          certyfikatu badania typu (``TYPE_TEST_CERTIFICATE``);
        - twierdzenie z obliczenia statycznego wymaga ``VALIDATED_SIMULATION``
          (zwalidowany solver statyczny);
        - twierdzenie o konfiguracji zadeklarowanej dodatkowo dopuszcza
          ``DECLARATION`` (deklaracja JEST wlasciwa podstawa faktu
          zadeklarowanego) — ale nigdy nie dopuszcza ``UNVALIDATED_MODEL`` ani
          ``NOT_SIMULATED``, co oznaczaloby zle zarejestrowana zdolnosc.
        """
        return self.tier in POZIOMY_DOPUSZCZALNE_DLA_TWIERDZENIA[self.claim_kind]

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
# ZADNA zdolnosc OBLICZENIOWA w rejestrze nie jest VALIDATED_SIMULATION: na dzien
# tej karty zadna zdolnosc dynamiczna w repozytorium nie ma ustalonej
# poprawnosci fizycznej, wiec zaden wynik obliczenia nie jest dopuszczalny jako
# dowod regulacyjny. Jedyny wpis dopuszczalny to `ncrfg_ptpiree.certyfikat_urzadzenia`
# (TYPE_TEST_CERTIFICATE): narzedzie niczego tam nie liczy — dowodem jest badanie
# typu poswiadczone rekordem wykazu PTPiREE (odbior Pakietu C, plan AB O-50).
# Wpis obliczeniowy wolno podniesc do VALIDATED_SIMULATION WYLACZNIE razem z
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
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Testy odpowiedzi częstotliwościowej (LFSM-O, LFSM-U, FSM, odbudowa "
                "częstotliwości — T01-T04) porównują NASTAWY zadeklarowane modułu (statyzm, "
                "strefa martwa, tempo zmiany mocy) z wartościami wymaganymi i tolerancjami "
                "profilu regulacyjnego; to fakt konfiguracyjny, dla którego deklaracja jest "
                "właściwą podstawą. Odpowiedź Delta P w punkcie częstotliwości testu jest "
                "podstawieniem informacyjnym w śladzie, nie przebiegiem f(t)/P(t) — "
                "solvers/ncrfg_ptpiree/engine.py (kontrakt V2)."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T01-T04); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.ride_through",
            tier=EvidenceTier.NOT_SIMULATED,
            rationale_pl=(
                "Pozostanie w pracy przy zapadzie i wzroście napięcia (T14/T15) jest "
                "twierdzeniem o zachowaniu dynamicznym; pakiet testów nie wykonuje biegu "
                "dynamiki modułu — bez biegu dynamiki porównanie deklaracji nie wykazuje "
                "zachowania dynamicznego (ocena niewykonana do biegu dynamiki RMS modułu). "
                "Obwiednia profilu jest warunkiem wstępnym kryterium, nie jego wynikiem."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T14/T15); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.p_recovery",
            tier=EvidenceTier.NOT_SIMULATED,
            rationale_pl=(
                "Odbudowa mocy czynnej po zakłóceniu (T16) jest twierdzeniem o zachowaniu "
                "dynamicznym; bez biegu dynamiki porównanie deklaracji nie wykazuje "
                "zachowania dynamicznego — czas zadeklarowany jest pokazywany wyłącznie "
                "informacyjnie, przebiegu P(t) narzędzie nie liczy."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T16); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.reactive_current_frt",
            tier=EvidenceTier.NOT_SIMULATED,
            rationale_pl=(
                "Szybki prąd bierny podczas zwarcia (T17) jest twierdzeniem o zachowaniu "
                "dynamicznym; bez biegu dynamiki porównanie deklaracji nie wykazuje "
                "zachowania dynamicznego — wzmocnienie zadeklarowane jest pokazywane "
                "wyłącznie informacyjnie, przebiegu Iq(t) narzędzie nie liczy."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T17); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.extended_dynamic_capability",
            tier=EvidenceTier.NOT_SIMULATED,
            rationale_pl=(
                "Praca wyspowa, rozruch autonomiczny i tłumienie oscylacji (T18) są "
                "twierdzeniami o zachowaniu dynamicznym; bez biegu dynamiki porównanie "
                "deklaracji nie wykazuje zachowania dynamicznego — deklaracje zdolności są "
                "pokazywane wyłącznie informacyjnie."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T18); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.declared_configuration",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Regulacja P (T05), deklaracje PMAX/PMIN (T10/T11), zaprzestanie i "
                "zmniejszenie generacji (T12/T13) oraz komunikacja i rejestrator zakłóceń "
                "(T19) są faktami konfiguracyjnymi porównanymi z wymaganiem profilu — "
                "deklaracja jest tu właściwą podstawą dowodową."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T05, T10-T13, T19); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.reactive_voltage_mode",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Tryby regulacji U/Q/cosfi i zakres mocy biernej (T06-T09) pochodzą z "
                "deklaracji modułu porównanej z profilem operatora — fakty konfiguracyjne."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T06-T09); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.power_quality_declared",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Współczynnik THDu źródła (test T20) pochodzi z rekordu katalogowego źródła "
                "i jest porównywany z limitem profilu — fakt katalogowy, nie wynik symulacji "
                "widma."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.2 (T20); karta AB-1a Pakiet C pkt 5",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.koordynacja_nastaw",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Kryteria koordynacji statycznej (plan AB O-32): nastawa U< i jej czas "
                "wobec obwiedni LVRT profilu oraz nastawa RoCoF/LoM wobec wytrzymałości "
                "RoCoF — porównanie nastaw zabezpieczeń zapisanych w modelu z wartościami "
                "profilu; fakt konfiguracyjny, bez symulacji."
            ),
            audit_ref="karta AB-1a Pakiet C pkt 7 (O-32)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.certyfikat_urzadzenia",
            tier=EvidenceTier.TYPE_TEST_CERTIFICATE,
            rationale_pl=(
                "Wykazanie wymagania certyfikatem urządzenia z wykazu PTPiREE: dowodem jest "
                "badanie typu wykonane u producenta albo w jednostce certyfikującej, "
                "poświadczone rekordem wykazu dopasowanym po stronie serwera do tabliczki "
                "urządzenia — narzędzie niczego nie liczy i nie symuluje. Poziom dopuszcza "
                "certyfikat jako dowód zachowania dynamicznego i konfiguracji zadeklarowanej; "
                "kompletność dowodu (reguła pokrycia wymagania certyfikatem z warstwy WiPWC "
                "profilu i warunek ważności rekordu wykazu) rozstrzyga rekord wymagania, "
                "nie poziom."
            ),
            audit_ref=(
                "karta AB-1a Pakiet C pkt 3 i 8 (O-17, O-27); odbiór Pakietu C " "(plan AB O-50)"
            ),
        ),
        CapabilityEvidence(
            capability_id="pq_coverage.pokrycie_zakresu_q",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Pokrycie wymaganego zakresu mocy biernej profilu operatora: krzywa zdolności "
                "P-Q producenta z karty katalogowej typu przekształtnika porównana z "
                "prostokątnym wymaganiem profilu w punktach krzywej — fakt katalogowy "
                "porównany z wymaganiem, bez symulacji "
                "(application/analyses/pq_coverage.py)."
            ),
            audit_ref="odbiór Pakietu C §0 pkt 4 (plan AB O-50)",
        ),
        CapabilityEvidence(
            capability_id="magistrala_sn.obciazalnosc_dlugotrwala",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Obciążalność długotrwała odcinka magistrali SN: prąd roboczy podany przez "
                "projektanta porównany z obciążalnością z karty katalogowej typu kabla albo "
                "przewodu w warunkach odniesienia producenta — fakt katalogowy porównany "
                "z deklaracją, bez obliczenia cieplnego (application/analyses/"
                "ocena_doboru_magistrali.py)."
            ),
            audit_ref="karta MAGISTRALA-OCENA (plan AB §8 F24, fala WW-4)",
        ),
        CapabilityEvidence(
            capability_id="magistrala_sn.spadek_napiecia",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Spadek napięcia odcinka i ciągu magistrali SN liczony przybliżeniem składowej "
                "podłużnej ΔU = √3·I·(R·cosφ + X·sinφ) z sumą po odcinkach "
                "(network_model/solvers/cable_voltage_drop.py) — obliczenie jest wykonywane, "
                "ale jego zgodności z rozpływem mocy na sieci referencyjnej nie wykazano, więc "
                "wynik nie jest dowodem regulacyjnym; rzeczywisty profil napięcia daje rozpływ "
                "zapisanego modelu."
            ),
            audit_ref="karta MAGISTRALA-OCENA (plan AB §8 F24, fala WW-4)",
        ),
        CapabilityEvidence(
            capability_id="dynamic_stability.fault_clear",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Kąty mocy, napięcie i częstotliwość po zwarciu oraz czas wyłączenia "
                "wpisuje użytkownik w opcjach biegu; bieg nie rozwiązuje sieci i nie "
                "całkuje równań ruchu układu, więc zwraca wyłącznie echo scenariusza "
                "bez oceny stabilności (uczciwość natychmiastowa 2026-09-23)."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.5",
        ),
        CapabilityEvidence(
            capability_id="dynamika_rms.przebieg_czasowy",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Bieg RMS całkuje równania ruchu układu na widoku sieci rozpływu "
                "(rdzeń DAE, network_model/solvers/dynamika/), więc wynik JEST "
                "policzony — ale poprawność modelu nie jest WYKAZANA: rdzeń ma "
                "wyrocznie analityczne dla układu maszyna-szyna sztywna, nie ma "
                "walidacji przebiegów dla pełnej biblioteki urządzeń na sieci "
                "rzeczywistej. Mechanizmy zdarzeń rdzenia (obszar beznapięciowy i "
                "ponowne zasilenie, predykat izolacji usunięcia zwarcia, zwarcie w "
                "linii x*L, elementy nieaktywne w t = 0, próbki obustronne L/P w "
                "chwili zdarzenia, fazory prądów obu zacisków gałęzi, przypisanie stanu "
                "i komenda regulacji z ciagloscia stanow nieprzypisanych, częściowa "
                "utrata źródła jako agregat jednostek, źródło testowe U/f/faza stanowiska, "
                "lokalizacja zdarzeń warunkowych i detektorow przekroczen) mają wyrocznie "
                "niezależne (w tym parytet z solverem IEC 60909, postacie zamknięte "
                "profilu i kroku trapezu, rownanie wahan SMIB po skokach mocy) "
                "w manifeście walidacji fizycznej rdzenia — to dowód "
                "algebry zdarzeń, nie walidacja przebiegów urządzeń: odpowiedź rodzin "
                "(przekształtnik, magazyn, turbina, maszyna z regulatorami) na komende "
                "regulacji i utrate czesci jednostek nie ma wyroczni rodzin, więc poziom "
                "dowodowy się nie zmienia. Parametry z profilu typowego normy są "
                "deklaracja projektanta (enm/dynamika_modele.py::ProweniencjaParametrow), "
                "więc awans do poziomu „symulacja zwalidowana” wymaga dowodu walidacji tej "
                "zdolności, nie samego faktu, ze bieg się wykonał."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.5 (W6-3B: adapter biegu czasowego)",
        ),
        CapabilityEvidence(
            capability_id="frt_hvrt.trajectory",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Trajektoria napięcia MVP jest funkcją zadaną parametryzowaną "
                "wejściem scenariusza, nie rozwiązaniem sieci sprzężonym z "
                "resztą modułu — network_model/solvers/frt_hvrt/engine.py."
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
            "Zdolność dynamiczna nie jest sklasyfikowana w rejestrze "
            "dowodowym; domyślnie nieprzydatna jako dowód regulacyjny "
            "(fail-closed)."
        ),
        audit_ref=f"{_AUDIT_CARD} §0.1 (fail-closed)",
    )


def registered_dynamic_capabilities() -> tuple[str, ...]:
    """Identyfikatory zdolnosci w rejestrze dowodowym, posortowane deterministycznie."""
    return tuple(sorted(_DYNAMIC_CAPABILITY_EVIDENCE))


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
            note="oszacowanie pasma/filtra regulatora; wymaga źródła z karty technicznej",
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

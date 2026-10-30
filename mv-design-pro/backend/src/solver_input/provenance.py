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
        rationale_pl: Techniczne uzasadnienie stopnia dla projektanta — polskie zdania
            z polskimi znakami, bez ścieżek kodu i odsyłaczy do kart (te niesie
            ``audit_ref``); pokazywane na ekranie jako ograniczenie raportowe.
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
#: repo: solver NC RfG T14/T15 jest tautologia, dawny wykonawca toru „stabilnosc po
#: wylaczeniu zwarcia" (skasowany karta AB-P1) wpisywal `reportable`/`complete` na
#: sztywno; patrz `SYNTEZA_DOMKNIECIA_
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
                "częstotliwości — T01–T04) porównują nastawy zadeklarowane modułu (statyzm, "
                "strefa martwa, tempo zmiany mocy) z wartościami wymaganymi i tolerancjami "
                "profilu regulacyjnego; to fakt konfiguracyjny, dla którego deklaracja jest "
                "właściwą podstawą. Odpowiedź ΔP w punkcie częstotliwości testu jest "
                "podstawieniem informacyjnym w śladzie, nie przebiegiem f(t)/P(t)."
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
                "zachowania dynamicznego (ocena niewykonana do czasu biegu dynamiki RMS modułu). "
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
                "Regulacja P (T05), deklaracje Pmax/Pmin (T10/T11), zaprzestanie i "
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
                "Tryby regulacji U/Q/cos φ i zakres mocy biernej (T06–T09) pochodzą z "
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
                "Kryteria koordynacji statycznej: nastawa U< i jej czas wobec obwiedni LVRT "
                "profilu oraz nastawa RoCoF/LoM wobec wytrzymałości RoCoF — porównanie nastaw "
                "zabezpieczeń zapisanych w modelu z wartościami profilu; fakt konfiguracyjny, "
                "bez symulacji."
            ),
            audit_ref="karta AB-1a Pakiet C pkt 7 (O-32)",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.certyfikat_urzadzenia",
            tier=EvidenceTier.TYPE_TEST_CERTIFICATE,
            rationale_pl=(
                "Wykazanie wymagania certyfikatem urządzenia z wykazu PTPiREE: dowodem jest "
                "badanie typu wykonane u producenta albo w jednostce certyfikującej, "
                "poświadczone rekordem wykazu dopasowanym do tabliczki znamionowej "
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
                "porównany z wymaganiem, bez symulacji."
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
            capability_id="nn.dobor_aparatu.dane_znamionowe",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Koordynacja aparatu z przewodem obwodu nN (I_B ≤ I_n ≤ I_z′, I_2 ≤ 1,45·I_z′): "
                "prąd znamionowy i prąd zadziałania umownego aparatu są danymi znamionowymi "
                "z katalogu typów i definicji normy aparatu, porównanymi z prądem obliczeniowym "
                "projektu i obciążalnością przewodu z katalogu skorygowaną współczynnikami "
                "tabelarycznymi ułożenia — deklaracja jest tu właściwą podstawą dowodową."
            ),
            audit_ref="karta P0.7 (§0.5), karta WERDYKT-MIGRACJA-190 (domena 7)",
        ),
        CapabilityEvidence(
            capability_id="nn.dobor_aparatu",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Dobór aparatu zabezpieczającego obwodu nN: dane znamionowe aparatu z katalogu "
                "typów porównane z prądem obliczeniowym, obciążalnością przewodu skorygowaną "
                "współczynnikami ułożenia (network_model/solvers/cable_ampacity_derating.py) "
                "i prądem zwarciowym punktu z biegu IEC 60909 — porównania są jawne, ale "
                "wielkości obliczone po stronie sieci nie mają wyroczni odniesienia, więc "
                "wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta P0.7 (§0.5), karta WERDYKT-MIGRACJA-190 (domena 7)",
        ),
        CapabilityEvidence(
            capability_id="nn.petla_zwarcia_tn",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Pętla zwarcia L-PE/L-PEN układu TN: prąd zwarcia jednofazowego minimalny z sumy "
                "impedancji trasy (rezystancje w temperaturze końcowej, scenariusz MIN), "
                "transformatora i sieci zasilającej (network_model/solvers/"
                "fault_loop_iec60364.py), porównany z prądem zapewniającym zadziałanie aparatu "
                "w czasie z Tab. 41.1 IEC 60364-4-41 — obliczenie jest wykonywane jawnie, ale "
                "nie ma wyroczni odniesienia (pomiar impedancji pętli, przykład normy z kopią "
                "tekstu), więc wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta P0.6 (G-06), karta WERDYKT-MIGRACJA-190 (domena 7)",
        ),
        CapabilityEvidence(
            capability_id="nn.petla_zwarcia_tt_it",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Pętla zwarcia doziemnego nN w układach TT i IT: prąd doziemny z sumy "
                "impedancji trasy, transformatora, sieci zasilającej i uziomów, napięcie "
                "dotykowe z iloczynu rezystancji uziomu i prądu różnicowego, prąd pierwszego "
                "zwarcia sieci IT z pojemności doziemnych odcinków, prąd drugiego zwarcia z "
                "pętli dwóch faz (network_model/solvers/petla_zwarcia_tt_it.py) — obliczenie "
                "jest wykonywane jawnie, ale nie ma wyroczni odniesienia (pomiar pętli, "
                "przykład normy z kopią tekstu), więc wynik nie jest dowodem regulacyjnym; "
                "limity napięcia dotykowego i warunki układu IT czekają na tekst normy od "
                "właściciela."
            ),
            audit_ref="karta W5-E-TTIT (decyzje OD-25, D-11, O-68)",
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
            capability_id="zabezpieczenia.ocena_nadpradowa",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Ocena zadziałania zabezpieczeń nadprądowych z modelu: prąd przekaźnika z "
                "bilansu wkładów gałęziowych biegu zwarciowego IEC 60909 (wkłady źródeł "
                "sumowane netto wg kierunku jako moduły, bez fazorów), czas z charakterystyki "
                "normowej rdzenia IEC 60255 (application/analyses/protection/"
                "ocena_nadpradowa.py). Sumowanie modułów wkładów kilku źródeł jest "
                "przybliżeniem, którego zgodności z rozpływem fazorowym nie wykazano na sieci "
                "referencyjnej — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta BIEG-ZABEZPIECZEN-Z-MODELU (P0, 2026-09)",
        ),
        CapabilityEvidence(
            capability_id="aparatura.wytrzymalosc_zwarciowa_pola",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Wytrzymałość zwarciowa aparatury pola: prąd udarowy i prąd cieplny "
                "zastępczy zwarcia trójfazowego w punkcie zabudowy pola z zapisanego biegu "
                "IEC 60909 porównane ze znamionami pozycji katalogu, czas wyłączenia złożony "
                "z członu nastawczego zabezpieczenia pola i czasu własnego wyłącznika "
                "(application/analyses/wytrzymalosc_aparatury_pol.py). Pełny prąd punktu "
                "zabudowy przyjęty jako prąd aparatu pola jest założeniem bez rozdziału na "
                "gałęzie pola, a zgodności z pomiarem albo przykładem normy nie wykazano — "
                "wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta WYTRZYMALOSC-PRAD-POLA (2026-10)",
        ),
        # Kryteria wyposażenia stacji (karta WERDYKT-MIGRACJA-190): rekordy werdyktu
        # wyjaśnialnego składane w `network_model/solvers/equipment_checks/oceny.py`.
        CapabilityEvidence(
            capability_id="aparatura.przekladnik_pradowy_bilans_nasycenie",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Bilans mocy obwodu wtórnego i nasycenie przekładnika prądowego: moc "
                "obliczeniowa z rezystancji przewodów miedzianych w 20 °C i poborów aparatów, "
                "efektywny współczynnik graniczny ALF_eff = ALF·(S_n+S_w)/(S_2obl+S_w) "
                "(network_model/solvers/equipment_checks/ct_burden_saturation.py). Reaktancja "
                "przewodów, składowa nieokresowa i remanencja są pominięte, a zgodności "
                "z pomiarem obwodu nie wykazano — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta KD-3; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="aparatura.przekladnik_napieciowy_bilans_spadek",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Bilans mocy obwodu wtórnego i zmiana napięcia na przewodach przekładnika "
                "napięciowego: prąd wtórny z mocy aparatów, spadek na rezystancji pętli "
                "przewodów miedzianych w 20 °C (network_model/solvers/equipment_checks/"
                "vt_burden_voltage_drop.py). Limit zmiany napięcia jest założeniem "
                "inżynierskim programu, a zgodności z pomiarem obwodu nie wykazano — wynik nie "
                "jest dowodem regulacyjnym."
            ),
            audit_ref="karta KD-3; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="aparatura.dobor_przekladnika",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Dobór typu przekładnika prądowego i napięciowego pola: zestawienie wymagań "
                "toru (prąd roboczy z tabliczki, I_k″ i i_p z biegu IEC 60909, napięcie "
                "i uziemienie sieci z modelu, wejścia przekaźnika z katalogu) z danymi "
                "znamionowymi pozycji katalogu (domain/dobor_przekladnika.py). Zgodności "
                "z badaniem typu przekładnika nie wykazano — wynik nie jest dowodem "
                "regulacyjnym."
            ),
            audit_ref="karta E21-4; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="aparatura.dobor_aparatu_punktu",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Dowód doboru aparatu w punkcie zabudowy: napięcie najwyższe U_m aparatu wobec "
                "napięcia najwyższego sieci U_s (IEC 60038), zdolność wyłączania I_cu wobec I_b "
                "albo I″k, prąd szczytowy I_dyn wobec i_p i prąd krótkotrwały I_th wobec prądu "
                "cieplnego zapisanego biegu IEC 60909 (application/equipment_proof). Zestawienie "
                "danych znamionowych z wielkościami biegu na modelu niezwalidowanym pomiarem — "
                "nie dowód regulacyjny."
            ),
            audit_ref="application/equipment_proof/oceny.py; karta WERDYKT-MIGRACJA-190",
        ),
        # Kontrole konfiguracji stacji audytu 2 (karta WERDYKT-MIGRACJA-190): rekordy werdyktu
        # wyjaśnialnego składane w `network_model/catalog/audit2_oceny.py`.
        CapabilityEvidence(
            capability_id="audyt2.tryby_pracy_magazynu",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Tryby pracy magazynu energii wobec zdolności przekształtnika: porównanie "
                "wymagań usługi z katalogu trybów (praca czterokwadrantowa, tworzenie "
                "napięcia) z deklaracją zdolności z karty przekształtnika "
                "(network_model/catalog/audit2_oceny.py). Deklaracja producenta nie jest "
                "badaniem typu — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta AUDYT-2 A36; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="audyt2.plan_zaczepow",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Plan zaczepów transformatora: przeznaczenie przełącznika z katalogu wobec "
                "klasy transformatora wyznaczonej z napięć modelu i wymóg regulacji "
                "automatycznej z konfiguracji stacji (network_model/catalog/audit2_oceny.py). "
                "Zakres i krok regulacji wobec profilu napięć nie są tu oceniane — wynik nie "
                "jest dowodem regulacyjnym."
            ),
            audit_ref="karta AUDYT-2 A36; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="audyt2.bilans_eksportu_stacji",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Bilans eksportu stacji: suma mocy znamionowych źródeł z konfiguracji stacji "
                "minus moc odbiorów z modelu (stan pełnej generacji, bez profilu dobowego) "
                "(network_model/catalog/audit2_oceny.py). Granicy eksportu z warunków "
                "przyłączenia model nie niesie — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta AUDYT-2 A37; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="przewod.wytrzymalosc_cieplna_zwarciowa",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Wytrzymałość cieplna zwarciowa żyły: prąd zastępczy cieplny I_th gałęzi z biegu "
                "IEC 60909 i czas wyłączenia porównane z prądem dopuszczalnym "
                "I_th(1 s)/√t (nagrzewanie adiabatyczne, PN-HD 60364-4-43 434.5.2, IEC 60949) "
                "(network_model/solvers/conductor_thermal_withstand.py). Zgodności z przykładem "
                "normy ani pomiarem nie wykazano — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta F-K1; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="przylaczenie.warunki_osd",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Moc czynna i cosφ wymieniane w punkcie przyłączenia odczytane z węzła "
                "bilansującego biegu rozpływu mocy i porównane z warunkami przyłączenia OSD "
                "wpisanymi do projektu (application/analyses/warunki_przylaczenia.py). "
                "Zgodności rozpływu z pomiarem w punkcie przyłączenia nie wykazano — wynik nie "
                "jest dowodem regulacyjnym."
            ),
            audit_ref="karta F-K2; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="der_sn.dobory_toru",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Dobory toru przyłączenia źródła DER-SN: napięcie AC falownika wobec strony nN "
                "transformatora blokowego, strona SN transformatora wobec szyny SN, moc "
                "transformatora blokowego wobec mocy źródeł (decyzja O-53) i kaskada prądu "
                "znamionowego transformator → kabel SN → pole SN — porównanie danych "
                "znamionowych zapisanych w modelu (application/analyses/raport_zgodnosci.py, "
                "enm/der_sn_validation.py). Fakt konfiguracyjny modelu, bez symulacji."
            ),
            audit_ref="RECENZJA_DER_SN_DOBORY_2026-07 wymaganie 13; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="werdykt.projektowy",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Werdykt projektowy przypadku: agregacja ocen kryteriów projektu (warunki "
                "przyłączenia, walidacja energetyczna rozpływu, wytrzymałość cieplna przewodów, "
                "wiarygodność Ik'', dobory toru DER-SN) z gotowych widoków analiz "
                "(application/analyses/werdykt_projektowy.py). Agregat niczego nie liczy — "
                "przydatność dowodowa wynika z ocen składowych."
            ),
            audit_ref="karta F-K3; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="normatywna.ocena_dowodow",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Ocena normatywna dowodów (analysis/normative): wielkości kluczowe dowodów "
                "obciążeń, zabezpieczeń nadprądowych, uziemień, zwarcia trójfazowego i strat "
                "porównane z progami konfiguracji oceny albo z wynikiem warunku zapisanym "
                "w dowodzie. Dowody pochodzą z modelu niezwalidowanego pomiarem — wynik nie "
                "jest dowodem regulacyjnym."
            ),
            audit_ref="analysis/normative/evaluator.py; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="wzorzec_odniesienia.nastawy_i_bis",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Wzorzec odniesienia doboru nastawy I>> linii SN: okno nastaw z warunków "
                "selektywności, czułości i cieplnego oraz cykl cieplny SPZ wyznaczone silnikiem "
                "metodyki Hoppla (application/protection_settings/engine.py) z prądów "
                "zwarciowych danych wzorca — obliczenie statyczne, metodyka z literatury "
                "inżynierskiej, nie norma."
            ),
            audit_ref=(
                "application/reference_patterns/pattern_line_i_doubleprime_thermal_spz.py; "
                "karta WERDYKT-MIGRACJA-190"
            ),
        ),
        CapabilityEvidence(
            capability_id="wzorzec_odniesienia.generacja_lokalna",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Wzorzec odniesienia wpływu generacji lokalnej na zabezpieczenia SN: zmiana "
                "prądu zwarciowego, ryzyko blokady zabezpieczenia szyn i wpływ na selektywność "
                "stopni nadprądowych porównane z progami diagnostycznymi wzorca (bez cytatu "
                "normy) — obliczenie statyczne na prądach zwarciowych danych wzorca."
            ),
            audit_ref=(
                "application/reference_patterns/wzorzec_c_generacja_lokalna.py; "
                "karta WERDYKT-MIGRACJA-190"
            ),
        ),
        CapabilityEvidence(
            capability_id="sila_sieci.scr_wscr",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Siła sieci SCR/WSCR: iloraz mocy zwarciowej S_sc'' węzła z biegu zwarciowego "
                "IEC 60909 i mocy zainstalowanej źródeł falownikowych z modelu, porównany "
                "z progiem sieci słabej. Wskaźnik przesiewowy obliczony statycznie na modelu "
                "niezwalidowanym pomiarem — nie analiza stabilności ani dowód regulacyjny."
            ),
            audit_ref="analysis/grid_strength/builder.py; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="adekwatnosc_q.rezerwa_i_pasmo",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Adekwatność mocy biernej: rezerwa regulacyjna Q_max − Q_akt i Q_akt − Q_min "
                "każdego regulowalnego źródła z biegu rozpływu mocy i granic regulatora z karty "
                "wobec tolerancji nasycenia oraz napięcia węzłów wobec pasma dopuszczalnego. "
                "Stan ustalony na modelu niezwalidowanym pomiarem — nie dowód regulacyjny."
            ),
            audit_ref="analysis/reactive_adequacy/builder.py; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="wrazliwosc.zapas_kryterium",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Wrażliwość zapasu kryterium (analysis/sensitivity): zapas do progu kryterium "
                "(odchyłka napięcia, obciążenie, wytrzymałość zwarciowa aparatu, koordynacja "
                "krzywych) w stanie bazowym i przy zmianie wielkości o ±delta %. Perturbacja "
                "jest przeskalowaniem gotowego wyniku, nie nowym biegiem obliczeń — wynik "
                "orientacyjny, nie dowód regulacyjny."
            ),
            audit_ref="analysis/sensitivity/builder.py; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="rozplyw.walidacja_energetyczna",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Walidacja energetyczna wyniku rozpływu mocy: obciążenie gałęzi i transformatorów "
                "(prąd zacisku wobec prądu znamionowego), odchylenie napięcia szyn, budżet strat "
                "i cosφ węzła bilansującego porównane z progami walidacji "
                "(analysis/energy_validation). Zgodności rozpływu z pomiarem ani z siecią "
                "referencyjną nie wykazano — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta D2 walidacji energetycznej; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="rozplyw.kontyngencje_n1",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Kontyngencje N-1 (application/analyses/kontyngencje_n1.py): osobny bieg "
                "rozpływu mocy wariantu bez wyłączonego elementu, walidacja energetyczna "
                "wariantu (obciążenie, odchylenie napięcia) i wyspa węzła bilansującego "
                "(odbiory bez zasilania). Zgodności rozpływu z pomiarem ani z siecią "
                "referencyjną nie wykazano — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta D8 analizy N-1; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="wiarygodnosc.pasma_wyniku",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Pasma wiarygodności wyniku solvera: Ik'' per poziom napięcia, napięcie szyny "
                "Un ± 10 %, obciążenie gałęzi do 100 % prądu znamionowego zacisku, straty "
                "czynne do progu, parametry jednostkowe linii 110 kV (analysis/sanity_bounds). "
                "Pasmo stwierdza fizyczną możliwość liczby, nie jej poprawność — nie jest "
                "dowodem regulacyjnym ani walidacją solvera."
            ),
            audit_ref="karta K-08 / W3-G2; karta WERDYKT-MIGRACJA-190",
        ),
        CapabilityEvidence(
            capability_id="kabel.starzenie_izolacji",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Względna szybkość starzenia izolacji kabla regułą Montsingera "
                "V = 2^((θ_pracy − θ_zn)/10) przy stałej temperaturze pracy żyły "
                "(network_model/solvers/equipment_checks/cable_thermal_aging.py). Reguła jest "
                "przybliżeniem zależności Arrheniusa, temperatura pracy pochodzi od projektanta "
                "— wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta KD-3; karta WERDYKT-MIGRACJA-190",
        ),
        # Analizy specjalistyczne V12.6 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3): ocena
        # kryteriów rekordami werdyktu wyjaśnialnego (`application/analyses/v126_oceny.py`).
        # Rdzeń V12.6 nie ma wyroczni ani sieci referencyjnej — żadna zdolność nie jest
        # dowodem regulacyjnym (kompletność dowodu NIEPELNY w każdym rekordzie).
        CapabilityEvidence(
            capability_id="v126.koordynacja_izolacji",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Koordynacja izolacji ograniczników przepięć: przepięcie dorywcze z "
                "współczynnika zwarcia doziemnego sieci, napięcie trwałej pracy, wytrzymałość "
                "na przepięcie dorywcze i margines ochrony wobec poziomu izolacji z typoszeregu "
                "IEC 60071-1 — reguły doboru są założeniami inżynierskimi programu, a zgodności "
                "z obliczeniem referencyjnym nie wykazano; wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="v126.bezpieczenstwo_uziomu",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Napięcia rażenia uziomu kratowego wzorami przybliżonymi metody Sveraka "
                "(IEEE 80) z danych uziomu podanych przez projektanta; wzory nie uwzględniają "
                "gruntu dwuwarstwowego w rozkładzie potencjału, a zgodności z obliczeniem "
                "polowym nie wykazano — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="v126.projekt_uziemienia_punktu_neutralnego",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Prąd resztkowy dławika gaszącego i obciążalność cieplna rezystora punktu "
                "neutralnego z modelu doziemienia sieci SN (impedancje podłużne sieci "
                "pominięte wobec obwodu zerowego punktu neutralnego); zgodności z pomiarem "
                "sieci nie wykazano — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="v126.detekcja_doziemien",
            tier=EvidenceTier.DECLARATION,
            claim_kind=ClaimKind.DECLARED_CONFIGURATION,
            rationale_pl=(
                "Dostępność metody detekcji doziemień zalecanej dla sposobu pracy punktu "
                "neutralnego w wyposażeniu przekaźnika zadeklarowanym przez projektanta — fakt "
                "konfiguracyjny, bez symulacji zjawiska doziemienia."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="v126.napiecie_powrotne",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Przebieg napięcia powrotnego z modelu obwodu o parametrach podanych przez "
                "projektanta porównany z obwiednią modelową programu, nie z obwiednią tabel "
                "IEC 62271-100 — wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="v126.rozruch_silnikow",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Zapad napięcia, czas utyku i moment rozruchowy silnika z impedancji źródła "
                "szyny i charakterystyki momentu Klossa — impedancja widziana z szyny bez "
                "sprzężenia całej sieci, bez walidacji z pomiarem rozruchu; wynik nie jest "
                "dowodem regulacyjnym."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="v126.walidacja_benchmarkowa",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            claim_kind=ClaimKind.STATIC_CALCULATION,
            rationale_pl=(
                "Porównanie wartości policzonych z wartościami referencyjnymi sieci "
                "odniesienia podanymi w danych biegu — tolerancję i pochodzenie wartości "
                "referencyjnej deklaruje projektant; wynik nie jest dowodem regulacyjnym."
            ),
            audit_ref="karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §7 (odcinek 3)",
        ),
        CapabilityEvidence(
            capability_id="dynamika_rms.przebieg_czasowy",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Bieg RMS całkuje równania ruchu układu na widoku sieci z rozpływu, więc "
                "wynik jest policzony — ale poprawność modelu nie jest wykazana: rdzeń "
                "obliczeń ma wyrocznie analityczne dla układu maszyna – szyna sztywna, nie ma "
                "walidacji przebiegów dla pełnej biblioteki urządzeń na sieci rzeczywistej. "
                "Mechanizmy zdarzeń (obszar beznapięciowy i ponowne zasilenie, warunek "
                "izolacji przy usunięciu zwarcia, zwarcie w linii w punkcie x·L, elementy "
                "nieaktywne w chwili t = 0, próbki tuż przed i tuż po zdarzeniu, fazory prądów "
                "obu zacisków gałęzi, przypisanie stanu i komenda regulacji z ciągłością stanów "
                "nieprzypisanych, częściowa utrata źródła jako agregat jednostek, źródło "
                "testowe napięcia, częstotliwości i fazy stanowiska, lokalizacja zdarzeń "
                "warunkowych i detektorów przekroczeń) mają niezależne wyrocznie, w tym "
                "zgodność z obliczeniem zwarciowym IEC 60909, postacie zamknięte profilu i "
                "kroku całkowania oraz równanie wahań maszyny przyłączonej do szyny sztywnej "
                "po skokach mocy — to dowód poprawności zdarzeń, nie walidacja przebiegów "
                "urządzeń: odpowiedź rodzin urządzeń (przekształtnik, magazyn, turbina, "
                "maszyna z regulatorami) na komendę regulacji i utratę części jednostek nie ma "
                "wyroczni rodzin, więc poziom dowodowy się nie zmienia. Parametry z profilu typowego "
                "normy są deklaracją projektanta, więc awans do poziomu „symulacja "
                "zwalidowana” wymaga dowodu walidacji tej zdolności, nie samego faktu, że bieg "
                "się wykonał."
            ),
            audit_ref=f"{_AUDIT_CARD} §0.5 (W6-3B: adapter biegu czasowego)",
        ),
        CapabilityEvidence(
            capability_id="frt_hvrt.trajectory",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Trajektoria napięcia jest funkcją zadaną parametrami scenariusza próby, "
                "a nie rozwiązaniem sieci sprzężonym z resztą modułu wytwórczego."
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
            "Zdolność obliczeniowa nie jest sklasyfikowana w rejestrze dowodowym; "
            "do czasu klasyfikacji jej wynik nie jest dowodem regulacyjnym."
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
# seed to DATASHEET ONLY for a record backed by a manufacturer datasheet
# (`verification_status == ZWERYFIKOWANY`); otherwise ESTIMATED (karta
# KATALOG-KOMPLETNY-PROWENIENCJA: a reference computational model or an
# unverified declaration is not datasheet-grade, whatever its fields contain).
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


#: Status weryfikacji rekordu z karta producenta (literal `CatalogVerificationStatus.
#: ZWERYFIKOWANY`; warstwa solver_input nie importuje katalogu przy ladowaniu — parytet
#: literalu z enumem przypina test `test_katalog_proweniencja_kompletnosc.py`).
_STATUS_KARTY_PRODUCENTA = "ZWERYFIKOWANY"


def card_field_quality_map(converter: Any) -> dict[str, CardFieldStatus]:
    """Derive the SEED data-quality map for an inverter card (ConverterType).

    This is only the seed; explicit per-card overrides come later (a separate
    step). Default rule, per field of the COMPLETE card schema:

    - rating / manufacturer / model present (not None) => ``DATASHEET`` when the
      record is backed by a manufacturer datasheet (``verification_status ==
      ZWERYFIKOWANY``), otherwise ``ESTIMATED`` with a note naming the status;
    - controller-bandwidth (SSCI / Z_conv) fields => ``ESTIMATED`` by default
      (these are engineering estimates until a real datasheet value is attached —
      they MUST NOT be tagged DATASHEET just to make D-03 compute);
    - any other card field that is absent (None) => ``SYSTEM_DEFAULT``;
    - SC-model / power-hierarchy fields present (not None) => as rating fields.

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
    verification_status = getattr(converter, "verification_status", None)
    # JEDNO zrodlo prawdy z doborem szablonow (`dopuszczona_do_doboru_szablonu`):
    # wartosc obecna jest DATASHEET wylacznie w rekordzie z karta producenta.
    z_karty = verification_status == _STATUS_KARTY_PRODUCENTA
    jakosc_obecnej = FieldQuality.DATASHEET if z_karty else FieldQuality.ESTIMATED
    nota_obecnej = (
        None
        if z_karty
        else (
            "wartość rekordu bez karty producenta (status weryfikacji: "
            f"{verification_status or 'brak'}) — nie jest daną karty katalogowej"
        )
    )

    # Rating / identity, SC-model and power-hierarchy blocks: quality of a PRESENT
    # value follows the record provenance; absent => SYSTEM_DEFAULT.
    for name in _CARD_RATING_FIELDS + _CARD_SC_MODEL_FIELDS + _CARD_POWER_HIERARCHY_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=jakosc_obecnej if present else FieldQuality.SYSTEM_DEFAULT,
            source_ref=source_ref if present else None,
            note=nota_obecnej if present else None,
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

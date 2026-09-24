"""Modele warstwy interpretacji: stabilność SSCI (kryterium impedancyjne) — ocena niewykonana.

Warstwa ANALIZY (interpretacja, NIE fizyka — Z15). Moduł odczytuje GOTOWY,
zserializowany wynik solvera D-03 SSCI (PHYSICS half: tablice ``z_grid(f)``,
``z_conv(f)`` oraz wzmocnienie pętli mniejszej ``L(f)=Z_grid/Z_conv``) i liczy
metryki kryterium impedancyjnego Nyquista jako materiał AUDYTOWY. Werdykt NIE jest
wydawany (status ``NIE_OCENIONO`` z wyjaśnieniem): Z_grid(f) solvera liczone jest bez
przekładni transformatora (audyt harmonicznych 2026-09-23 — dla szyny 0,4 kV około
1400 razy za duże), więc każdy wniosek z L(f) byłby fałszywy.

Kryterium (literatura impedancyjna SSCI):
  - Sun (2011) „Impedance-Based Stability Criterion for Grid-Connected
    Inverters”, IEEE TPEL 26(11);
  - Wen et al. (2016) „Analysis of D-Q Small-Signal Impedance of Grid-Tied
    Inverters”, IEEE TPEL 31(1);
  - Cespedes & Sun (2014), IEEE TPEL 29(3).

Pierwotny wskaźnik (Sun 2011, praktyczna metryka SSCI):
  ``L(jω) = Z_grid(jω) / Z_conv(jω)`` ⇒  |L|=1 ⟺ |Z_grid|=|Z_conv| (przecięcie
  modułów), a ∠L = ∠Z_grid − ∠Z_conv (różnica faz). Jeżeli |Z_grid| < |Z_conv|
  dla KAŻDEJ częstotliwości (max|L| < 1, brak przecięcia modułów), układ jest
  STABILNY BEZWARUNKOWO niezależnie od fazy (wynik „silnej sieci” Sun 2011).
  Gdy moduły się przecinają (max|L| ≥ 1), stabilność jest WARUNKOWA i zależy od
  różnicy faz w paśmie przecięcia: margines Δφ = 180° − |∠L|. Δφ → 0 (∠L → ±180°
  przy |L| ≥ 1) oznacza okrążenie punktu −1 (niestabilność).

Wskaźniki wspierające (jawnie wtórne wobec różnicy faz/marginesu):
  - liczba przybliżonych okrążeń punktu −1 przez jednostronny przebieg L(jω)
    (przybliżenie skończonego skanu częstotliwości);
  - obecność strefy ujemnej rezystancji Re(Z_conv) < 0 poniżej pasma PLL —
    mechanizm umożliwiający SSCI (raportowana z solvera).

Moduł NIE liczy fizyki: konsumuje gotowy słownik wyniku solvera (NIE importuje
solvera — granica warstw, arch_guard). Werdykt jest deterministyczny: identyczne
wejście daje identyczny identyfikator SHA-256.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from analysis.odcisk_kontekstu import odcisk_kontekstu
from application.ocena_niewykonana import ocena_niewykonana, rekord_json
from werdykt import (
    ClaimKind,
    EvidenceTier,
    FieldQuality,
    PodstawaWymagania,
    Przedmiot,
    ZakresWaznosci,
)

# --- Definicja metryki przecięcia modułów (udokumentowana, NIE dostrajana pod test) ---

# Granica przecięcia modułów impedancji (Sun 2011): |L|=1 ⟺ |Z_grid|=|Z_conv|. To moduł
# warunku −1 wyznaczający pasmo metryk audytowych (przecięcie, najgorszy margines różnicy
# faz). Progi klasyfikacji marginesu („ryzyko" 30°, „niestabilność" 0°) skasowane razem
# z werdyktem (uczciwość natychmiastowa 2026-09-23) — nie ma klasyfikacji, której by służyły.
DEFAULT_GAIN_CROSSOVER_MAG = 1.0

#: Jedyna wartość pola werdyktu (kontrakt `str`) do czasu poprawnego Z_grid(f) — uczciwość
#: natychmiastowa (audyt harmonicznych 2026-09-23). Dawne „stabilny / ryzyko SSCI /
#: niestabilny / brak danych" skasowane: klasyfikacja stała na wzmocnieniu pętli
#: L = Z_grid/Z_conv, a Z_grid liczone jest na macierzy admitancyjnej BEZ przekładni
#: transformatora (dla szyny 0,4 kV około 1400 razy za duże).
VERDICT_NIE_OCENIONO = "nie oceniono"

#: Powód braku oceny — JEDNO miejsce, wspólne dla widoku stabilności SSCI i wyniku analizy
#: V12.6 `ssci_impedance` na ekranie analiz specjalistycznych (tekst o stanie solvera).
POWOD_BRAKU_OCENY_SSCI_PL = (
    "impedancja sieci Z_grid(f) obecnego solvera jest liczona na macierzy admitancyjnej bez "
    "przekładni transformatora — dla przekształtnika na szynie 0,4 kV wychodzi około 1400 razy "
    "za duża — więc wzmocnienie pętli L = Z_grid/Z_conv i każdy wniosek z kryterium Nyquista "
    "są niewiarygodne; wynik nie ma też niezależnej wyroczni"
)
#: Konkretne braki powierzchni SSCI (po brakach nazwanych przez regułę K).
BRAKI_OCENY_SSCI: tuple[str, ...] = (
    "Impedancja sieci Z_grid(f) liczona na wspólnej macierzy admitancyjnej z przekładnią "
    "transformatora i impedancją źródła zasilania — " + POWOD_BRAKU_OCENY_SSCI_PL + ".",
    "Niezależna wyrocznia kryterium impedancyjnego (obliczenie ręczne albo program zewnętrzny) "
    "dla węzła przyłączenia przekształtnika.",
    "Do czasu poprawnego Z_grid(f): badanie zewnętrzne interakcji przekształtnik–sieć albo dane "
    "producenta; wskaźnik strefy ujemnej rezystancji przekształtnika zależy wyłącznie od jego "
    "modelu i pozostaje informacją.",
)

#: Nagłówek sekcji audytowej metryk L(f) — tekst widoczny dla projektanta nad metrykami
#: (max|L|, margines różnicy faz, częstotliwość winna, bliskość punktu −1, okrążenia).
SEKCJA_AUDYTOWA_SSCI_PL = (
    "Metryki kryterium impedancyjnego z Z_grid(f) liczonego bez przekładni transformatora "
    "— materiał audytowy, nie jest wynikiem inżynierskim"
)

# Status zwracany przez solver przy niekompletnych danych wejściowych.
SOLVER_INCOMPLETE_STATUS = "dane niekompletne"

# Pola karty falownika, od których zależy ta analiza (Z_conv ⇒ L ⇒ werdykt).
# Pierwsze trzy są obowiązkowe dla solvera; pozostałe są opcjonalne, ale gdy są
# obecne, współtworzą Z_conv, więc wchodzą do propagacji proweniencji.
SSCI_MANDATORY_FIELDS: tuple[str, ...] = (
    "current_loop_bandwidth_hz",
    "pll_bandwidth_hz",
    "filter_l_pu",
)
SSCI_OPTIONAL_FIELDS: tuple[str, ...] = (
    "voltage_loop_bandwidth_hz",
    "control_delay_ms",
    "filter_r_pu",
)


@dataclass(frozen=True)
class SsciStabilityContext:
    project_name: str | None
    case_name: str | None
    case_id: str | None
    run_timestamp: datetime | None
    snapshot_hash: str | None
    run_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "case_id": self.case_id,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_hash": self.snapshot_hash,
            "run_id": self.run_id,
        }


@dataclass(frozen=True)
class WhiteBoxStep:
    """Pojedynczy krok wywodu White Box (Wzór→Dane→Podstawienie→Wynik→Jednostka)."""

    symbol: str
    formula_latex: str
    substitution_pl: str
    result_pl: str
    unit_check_pl: str


@dataclass(frozen=True)
class CrossoverPoint:
    """Punkt przecięcia modułów |L|=1 (|Z_grid|=|Z_conv|) z marginesem fazy."""

    f_hz: float
    phase_l_deg: float
    phase_margin_deg: float


@dataclass(frozen=True)
class NyquistPoint:
    """Najbliższy punkt przebiegu L(jω) względem punktu −1."""

    f_hz: float
    mag: float
    phase_deg: float
    distance_to_minus_one: float


@dataclass(frozen=True)
class ProvenanceTag:
    """Proweniencja werdyktu: najgorsza (najniższa) jakość pól karty, od których
    analiza zależała. Kolejność DATASHEET ≻ ESTIMATED ≻ SYSTEM_DEFAULT."""

    worst_quality: str  # FieldQuality.value
    worst_quality_label_pl: str  # FieldQuality.label_pl
    is_estimated: bool
    consumed_fields: tuple[str, ...]
    tag_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "worst_quality": self.worst_quality,
            "worst_quality_label_pl": self.worst_quality_label_pl,
            "is_estimated": bool(self.is_estimated),
            "consumed_fields": list(self.consumed_fields),
            "tag_pl": self.tag_pl,
        }


#: Brak tablic impedancji (solver zwrócił status „dane niekompletne").
BRAK_TABLIC_SSCI_PL = (
    "Tablice impedancji Z_grid(f), Z_conv(f) i L(f) — solver ich nie zwrócił (dane "
    "niekompletne)."
)
#: Opis braku dla pól ``missing_fields`` solvera, które NIE są polami karty przekształtnika.
_OPIS_BRAKU_MODELU_PL: dict[str, str] = {
    "converter": "Przekształtnik w modelu sieci — model nie ma przekształtnika, którego dotyczy "
    "analiza.",
    "converter.bus_ref": "Szyna przyłączenia przekształtnika — przekształtnik wskazuje węzeł, "
    "którego nie ma w modelu sieci.",
}


def _opis_braku_danych(pole: str) -> str:
    """Brak nazwany przez solver (``missing_fields``) jako pozycja „czego brakuje"."""
    return _OPIS_BRAKU_MODELU_PL.get(pole, f"Pole karty przekształtnika: {pole}.")


def ocena_ssci_niewykonana(
    *,
    converter_ref: str | None,
    bus_ref: str | None,
    tablice_obecne: bool,
    braki_danych: Sequence[str] = (),
) -> dict[str, Any]:
    """Rekord ``NIE_OCENIONO`` (``werdykt.OcenaKryterium``) analizy SSCI.

    Gdy solver nie zwrócił tablic impedancji (``tablice_obecne=False``), brak tablic i braki
    danych nazwane przez solver (``missing_fields``: przekształtnik w modelu, szyna
    przyłączenia, pola karty) idą przed brakiem poprawnego Z_grid(f) i wyroczni. Podstawa
    kryterium: literatura (kryterium impedancyjne), nie wymaganie normatywne — stan źródła
    ``NIEUSTALONE``.
    """
    braki = (
        *(() if tablice_obecne else (BRAK_TABLIC_SSCI_PL,)),
        *(_opis_braku_danych(pole) for pole in dict.fromkeys(braki_danych)),
        *BRAKI_OCENY_SSCI,
    )
    return rekord_json(
        ocena_niewykonana(
            kryterium_id=f"ssci.nyquist.{converter_ref or 'nie_wskazano'}",
            przedmiot=Przedmiot(
                element_ref=converter_ref,
                nazwa_pl=(
                    f"Przekształtnik {converter_ref}"
                    if converter_ref
                    else "Przekształtnik (nie wskazano)"
                ),
                opis_pl=(
                    f"Interakcja podsynchroniczna przekształtnika z siecią widzianą z szyny {bus_ref}"
                    if bus_ref
                    else "Interakcja podsynchroniczna przekształtnika z siecią"
                ),
            ),
            opis_kryterium_pl=(
                "Stabilność podsynchronicznej interakcji regulacyjnej (kryterium impedancyjne "
                "Nyquista)"
            ),
            podstawa=PodstawaWymagania(
                rodzaj="NIEUSTALONA",
                dokument="Kryterium impedancyjne stabilności (Sun 2011, Wen 2016)",
                status="NIEUSTALONE",
                uwagi_pl="kryterium z literatury — brak wymagania normatywnego operatora dla SSCI",
            ),
            powod_stosowalnosci_pl=(
                "przekształtnik przyłączony do sieci modelu (źródło przekształtnikowe)"
            ),
            rodzaj_twierdzenia=ClaimKind.STATIC_CALCULATION,
            poziom=EvidenceTier.UNVALIDATED_MODEL,
            status_modelu="UNVALIDATED_MODEL",
            zakres_waznosci=ZakresWaznosci(
                opis_pl="Skan impedancji Z_grid(f) i Z_conv(f) w paśmie podsynchronicznym",
                wykluczenia=("impedancja sieci z przekładnią transformatora",),
            ),
            powod_braku_niepewnosci_pl=(
                "brak wielkości rozstrzygającej — metryki L(f) są materiałem audytowym, więc "
                "niepewność wyniku nie dotyczy"
            ),
            czego_brakuje=braki,
        )
    )


@dataclass(frozen=True)
class SsciStabilityVerdict:
    converter_ref: str | None
    bus_ref: str | None
    #: Kontrakt `str` zachowany; jedyna wartość: `VERDICT_NIE_OCENIONO`.
    verdict: str
    #: `None` — ryzyko NIE jest oceniane (bool nie ma wartości neutralnej).
    is_risk: bool | None
    #: Zdanie oceny niewykonanej (to samo co `ocena["wyjasnienie"]["zdanie_pl"]`).
    why_pl: str
    #: Rekord `NIE_OCENIONO` (``werdykt.OcenaKryterium`` w postaci JSON).
    ocena: dict[str, Any]
    # --- metryki kryterium impedancyjnego ---
    max_minor_loop_gain: float | None
    has_magnitude_crossover: bool
    gain_crossover: CrossoverPoint | None
    worst_phase_margin_deg: float | None
    worst_phase_margin_f_hz: float | None
    offending_frequency_hz: float | None
    nearest_to_minus_one: NyquistPoint | None
    encirclement_count: int
    negative_resistance_present: bool
    negative_resistance_f_hz: float | None
    #: Re_min(Z_conv) [Ω] — wartość wskaźnika fizycznego (zależy wyłącznie od modelu
    #: przekształtnika), obok obecności i częstotliwości strefy ujemnej rezystancji.
    negative_resistance_re_min_ohm: float | None
    # --- proweniencja + audyt ---
    provenance: ProvenanceTag | None
    missing_data: tuple[str, ...]
    white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class SsciStabilityView:
    analysis_id: str
    context: SsciStabilityContext | None
    gain_crossover_mag: float
    verdict: SsciStabilityVerdict

    def to_dict(self) -> dict[str, Any]:
        from analysis.ssci_stability.serializer import view_to_dict

        return view_to_dict(self)


def compute_ssci_stability_id(
    context: SsciStabilityContext | None,
    gain_crossover_mag: float,
    verdict: SsciStabilityVerdict,
) -> str:
    """Deterministyczny identyfikator analizy (SHA-256 kanonicznego payloadu).

    Wzorzec ``compute_grid_strength_id``: kanoniczny JSON (sort_keys, bez spacji,
    ensure_ascii=False) z istotnych liczb i etykiet werdyktu.
    """
    payload = {
        "context": odcisk_kontekstu(context),
        "gain_crossover_mag": float(gain_crossover_mag),
        "verdict": {
            "converter_ref": verdict.converter_ref,
            "bus_ref": verdict.bus_ref,
            "verdict": verdict.verdict,
            "is_risk": verdict.is_risk,
            "max_minor_loop_gain": verdict.max_minor_loop_gain,
            "has_magnitude_crossover": verdict.has_magnitude_crossover,
            "gain_crossover": (
                {
                    "f_hz": verdict.gain_crossover.f_hz,
                    "phase_l_deg": verdict.gain_crossover.phase_l_deg,
                    "phase_margin_deg": verdict.gain_crossover.phase_margin_deg,
                }
                if verdict.gain_crossover
                else None
            ),
            "worst_phase_margin_deg": verdict.worst_phase_margin_deg,
            "worst_phase_margin_f_hz": verdict.worst_phase_margin_f_hz,
            "offending_frequency_hz": verdict.offending_frequency_hz,
            "nearest_to_minus_one": (
                {
                    "f_hz": verdict.nearest_to_minus_one.f_hz,
                    "mag": verdict.nearest_to_minus_one.mag,
                    "phase_deg": verdict.nearest_to_minus_one.phase_deg,
                    "distance_to_minus_one": verdict.nearest_to_minus_one.distance_to_minus_one,
                }
                if verdict.nearest_to_minus_one
                else None
            ),
            "encirclement_count": verdict.encirclement_count,
            "negative_resistance_present": verdict.negative_resistance_present,
            "negative_resistance_f_hz": verdict.negative_resistance_f_hz,
            "provenance": verdict.provenance.to_dict() if verdict.provenance else None,
            "missing_data": list(verdict.missing_data),
        },
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def worst_field_quality(qualities: Iterable[Any]) -> Any | None:
    """Najgorsza (najniższa) jakość wg porządku DATASHEET ≻ ESTIMATED ≻
    SYSTEM_DEFAULT. Zwraca ``FieldQuality`` lub ``None`` dla pustego zbioru.

    ``FieldQuality`` pochodzi z jedynego źródła osi proweniencji (pakiet ``werdykt``).
    """
    order = {
        FieldQuality.DATASHEET: 2,
        FieldQuality.ESTIMATED: 1,
        FieldQuality.SYSTEM_DEFAULT: 0,
    }
    worst: Any | None = None
    worst_rank = 99
    for quality in qualities:
        rank = order.get(quality, 0)
        if rank < worst_rank:
            worst_rank = rank
            worst = quality
    return worst

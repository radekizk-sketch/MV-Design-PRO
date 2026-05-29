"""Modele warstwy interpretacji: werdykt stabilności SSCI (kryterium impedancyjne).

Warstwa ANALIZY (interpretacja, NIE fizyka — Z15). Moduł odczytuje GOTOWY,
zserializowany wynik solvera D-03 SSCI (PHYSICS half: tablice ``z_grid(f)``,
``z_conv(f)`` oraz wzmocnienie pętli mniejszej ``L(f)=Z_grid/Z_conv``) i wydaje
WERDYKT stabilności na podstawie kryterium impedancyjnego Nyquista.

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
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

# --- Progi klasyfikacji (udokumentowane, NIE dostrajane pod test) -----------

# Granica przecięcia modułów impedancji = granica stabilności bezwarunkowej
# (Sun 2011). |L|=1 ⟺ |Z_grid|=|Z_conv|. To moduł warunku −1, NIE parametr
# heurystyczny: poniżej tej wartości (brak przecięcia) sieć jest mocna i układ
# stabilny bezwarunkowo, niezależnie od fazy.
DEFAULT_GAIN_CROSSOVER_MAG = 1.0

# Margines różnicy faz Δφ = 180° − |∠L| przy przecięciu modułów. Poniżej tego
# progu margines jest NISKI (zaostrzenie opisu w obrębie „ryzyko SSCI”).
# Konwencja inżynierii regulacji (margines fazy < 30° = mały zapas).
DEFAULT_PM_RISK_DEG = 30.0

# Margines różnicy faz ≤ tej wartości przy |L| ≥ 1 ⟺ ∠L osiąga ±180° w paśmie
# przecięcia ⟺ okrążenie punktu −1 ⟺ niestabilność (kryterium Nyquista).
DEFAULT_PM_UNSTABLE_DEG = 0.0

VERDICT_STABLE = "stabilny"
VERDICT_RISK = "ryzyko SSCI"
VERDICT_UNSTABLE = "niestabilny"
VERDICT_NO_DATA = "brak danych"

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
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
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


@dataclass(frozen=True)
class SsciStabilityVerdict:
    converter_ref: str | None
    bus_ref: str | None
    verdict: str
    is_risk: bool
    why_pl: str
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
    # --- proweniencja + audyt ---
    provenance: ProvenanceTag | None
    missing_data: tuple[str, ...]
    white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class SsciStabilityView:
    analysis_id: str
    context: SsciStabilityContext | None
    gain_crossover_mag: float
    pm_risk_deg: float
    pm_unstable_deg: float
    verdict: SsciStabilityVerdict

    def to_dict(self) -> dict[str, Any]:
        from analysis.ssci_stability.serializer import view_to_dict

        return view_to_dict(self)


def compute_ssci_stability_id(
    context: SsciStabilityContext | None,
    gain_crossover_mag: float,
    pm_risk_deg: float,
    pm_unstable_deg: float,
    verdict: SsciStabilityVerdict,
) -> str:
    """Deterministyczny identyfikator analizy (SHA-256 kanonicznego payloadu).

    Wzorzec ``compute_grid_strength_id``: kanoniczny JSON (sort_keys, bez spacji,
    ensure_ascii=False) z istotnych liczb i etykiet werdyktu.
    """
    payload = {
        "context": context.to_dict() if context else None,
        "gain_crossover_mag": float(gain_crossover_mag),
        "pm_risk_deg": float(pm_risk_deg),
        "pm_unstable_deg": float(pm_unstable_deg),
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

    Import ``FieldQuality`` jest leniwy (warstwa solver_input jest dozwolona dla
    analizy, ale unikamy twardego importu na poziomie modułu).
    """
    from solver_input.provenance import FieldQuality

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

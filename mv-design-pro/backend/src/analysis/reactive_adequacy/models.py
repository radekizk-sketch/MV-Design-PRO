"""Modele warstwy interpretacji: adekwatnosc mocy biernej (D-06d).

Warstwa ANALIZY (interpretacja, NIE fizyka — Z15). Modul odczytuje GOTOWY,
zserializowany wynik power-flow (napiecia |V| per wezel) oraz granice mocy
biernej regulowalnych zrodel (Q_min/Q_max z karty/regulatora) i wydaje WERDYKT
adekwatnosci rezerwy biernej do podtrzymania napiecia:

  - per zrodlo: wykorzystanie Q (Q_actual), rezerwa w gore (Q_max − Q_actual),
    rezerwa w dol (Q_actual − Q_min), znacznik NASYCENIA (przy granicy),
  - bilans bierny systemu: suma Q wygenerowanej vs suma Q pobranej,
  - wezly z naruszeniem pasma napieciowego (|V| poza [U_min; U_max]).

To RAPORT wykonalnosci/adekwatnosci — czysta interpretacja. Modul NIE liczy
fizyki i NIE importuje solvera (granica warstw, arch_guard: analysis ↛ solvers).
Wejscie to plain dataclass'y (jak ``analysis/grid_strength`` konsumuje wynik
IEC 60909 przez ``BusStrengthInput``), wiec analiza jest odsprzezona od solvera.

Werdykt jest deterministyczny: identyczne wejscie daje identyczny identyfikator
SHA-256 (``compute_reactive_adequacy_id``, wzorzec ``compute_grid_strength_id``).

Odniesienia: ENTSO-E / IEEE 1547 (wsparcie napieciowe Q zrodel), praktyka
inzynierska pasma napieciowego SN 0.95–1.05 p.u. (gdy karta wezla nie podaje
wlasnego pasma ``BusLimits``).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

# Tolerancja nasycenia: rezerwa <= tej wartosci [Mvar] => zrodlo przy granicy Q.
# Udokumentowana, NIE dostrajana pod test — domyslna liczbowa "blisko zera".
DEFAULT_SATURATION_TOL_MVAR = 1.0e-3

# Domyslne pasmo napieciowe (gdy karta wezla nie podaje ``BusLimits``). Praktyka
# inzynierska SN: 0.95–1.05 p.u. (parametryzowalne w builderze).
DEFAULT_U_MIN_PU = 0.95
DEFAULT_U_MAX_PU = 1.05

VERDICT_ADEQUATE = "wystarczajaca rezerwa Q"
VERDICT_EXHAUSTED = "rezerwa Q wyczerpana"
VERDICT_NO_DATA = "dane niekompletne"


@dataclass(frozen=True)
class ReactiveAdequacyContext:
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
    """Pojedynczy krok wywodu White Box (Wzor→Dane→Podstawienie→Wynik→Jednostka)."""

    symbol: str
    formula_latex: str
    substitution_pl: str
    result_pl: str
    unit_check_pl: str


# ---------------------------------------------------------------------------
# Wejscia (plain dataclass'y — BEZ importu solvera)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BusVoltageInput:
    """Napiecie wezla z gotowego wyniku power-flow + pasmo dopuszczalne.

    Odwzorowanie z warstwy application:
    - ``v_pu`` ← ``PowerFlowBusResult.v_pu`` (solver power-flow, READ-ONLY),
    - ``u_min_pu`` / ``u_max_pu`` ← ``Bus.nominal_limits`` (``BusLimits``); gdy
      wezel nie podaje pasma, builder stosuje domyslne 0.95–1.05 p.u.

    ``v_pu = None`` oznacza wezel nierozwiazany (``status='not_solved'``) — nie
    wchodzi do oceny naruszen (raportowany jako brak danych napiecia).
    """

    bus_ref: str
    v_pu: float | None
    u_min_pu: float | None = None
    u_max_pu: float | None = None


@dataclass(frozen=True)
class SourceReactiveInput:
    """Regulowalne zrodlo mocy biernej: aktualne Q + granice Q_min/Q_max.

    Odwzorowanie z warstwy application:
    - ``q_actual_mvar`` ← biezaca moc bierna zrodla z wyniku power-flow,
    - ``q_min_mvar`` / ``q_max_mvar`` ← granice regulatora/karty:
      ``InverterControl.qu_q_min_pu/qu_q_max_pu`` (×S_base), ``GenLimits``
      (``q_min_mvar``/``q_max_mvar``), lub ``ConverterType.qmin_mvar/qmax_mvar``.
    - ``limits_field_quality`` ← najgorsza jakosc pol Q-granic z
      ``resolve_card_field_quality_map`` (proweniencja, opcjonalna).

    Konwencja znaku: Q_actual > 0 = generacja (wstrzykiwanie), < 0 = pobor
    (absorpcja). Wymagane Q_min <= Q_max.
    """

    ref: str
    bus_ref: str | None
    q_actual_mvar: float | None
    q_min_mvar: float | None
    q_max_mvar: float | None
    limits_field_quality: Any | None = None  # FieldQuality | None (leniwy import)


@dataclass(frozen=True)
class LoadReactiveInput:
    """Pobor mocy biernej odbioru (do bilansu biernego).

    ``q_mvar`` to moc bierna pobierana przez odbior [Mvar] (wartosc dodatnia
    oznacza pobor Q indukcyjny).
    """

    ref: str
    q_mvar: float | None


# ---------------------------------------------------------------------------
# Proweniencja (kompozycja jak w SSCI)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProvenanceTag:
    """Proweniencja werdyktu: najgorsza (najnizsza) jakosc pol Q-granic, od
    ktorych analiza zalezala. Kolejnosc DATASHEET ≻ ESTIMATED ≻ SYSTEM_DEFAULT."""

    worst_quality: str  # FieldQuality.value
    worst_quality_label_pl: str  # FieldQuality.label_pl
    is_estimated: bool
    tag_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "worst_quality": self.worst_quality,
            "worst_quality_label_pl": self.worst_quality_label_pl,
            "is_estimated": bool(self.is_estimated),
            "tag_pl": self.tag_pl,
        }


# ---------------------------------------------------------------------------
# Wyniki interpretacji
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SourceReactiveEntry:
    ref: str
    bus_ref: str | None
    q_actual_mvar: float | None
    q_min_mvar: float | None
    q_max_mvar: float | None
    headroom_up_mvar: float | None  # Q_max − Q_actual (rezerwa do wstrzykiwania)
    headroom_down_mvar: float | None  # Q_actual − Q_min (rezerwa do absorpcji)
    is_saturated: bool
    at_limit_pl: str | None  # "Q_max" / "Q_min" / None
    why_pl: str
    missing_data: tuple[str, ...]
    white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class VoltageViolationEntry:
    bus_ref: str
    v_pu: float
    u_min_pu: float
    u_max_pu: float
    deviation_pu: float  # >0: powyzej U_max, <0: ponizej U_min
    kind_pl: str  # "przekroczenie U_max" / "ponizej U_min"
    why_pl: str
    white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class SourceQContribution:
    """Wkład pojedynczego zrodla do sumy netto Q (rozbicie ``net_source_q_mvar``).

    ``q_mvar`` to ``Q_actual`` zrodla z wyniku power-flow (znak: >0 generacja,
    <0 absorpcja). Suma ``q_mvar`` po liscie = ``net_source_q_mvar``.
    """

    ref: str
    q_mvar: float


@dataclass(frozen=True)
class ReactiveBalance:
    q_generated_mvar: float | None  # suma Q wstrzykiwanej przez zrodla (>0)
    q_absorbed_by_sources_mvar: float | None  # suma |Q| absorbowanej przez zrodla
    q_load_mvar: float | None  # suma Q pobranej przez odbiory
    net_source_q_mvar: float | None  # suma Q_actual wszystkich zrodel (netto)
    white_box: tuple[WhiteBoxStep, ...]
    # ADDYTYWNIE: rozbicie sumy netto na wklady per zrodlo (ref, Q_actual).
    source_q_actuals: tuple[SourceQContribution, ...] = ()


@dataclass(frozen=True)
class ReactiveAdequacySummary:
    total_sources: int
    saturated_source_count: int
    not_computed_source_count: int
    voltage_violation_count: int
    # Rezerwa systemowa = suma rezerw z NIENASYCONYCH zrodel.
    network_headroom_up_mvar: float | None
    network_headroom_down_mvar: float | None
    saturated_source_refs: tuple[str, ...]
    violated_bus_refs: tuple[str, ...]


@dataclass(frozen=True)
class ReactiveAdequacyView:
    analysis_id: str
    context: ReactiveAdequacyContext | None
    saturation_tol_mvar: float
    default_u_min_pu: float
    default_u_max_pu: float
    verdict: str
    is_adequate: bool
    why_pl: str
    sources: tuple[SourceReactiveEntry, ...]
    voltage_violations: tuple[VoltageViolationEntry, ...]
    balance: ReactiveBalance
    summary: ReactiveAdequacySummary
    provenance: ProvenanceTag | None
    missing_data: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.reactive_adequacy.serializer import view_to_dict

        return view_to_dict(self)


def compute_reactive_adequacy_id(
    context: ReactiveAdequacyContext | None,
    saturation_tol_mvar: float,
    default_u_min_pu: float,
    default_u_max_pu: float,
    verdict: str,
    sources: Iterable[SourceReactiveEntry],
    voltage_violations: Iterable[VoltageViolationEntry],
    balance: ReactiveBalance,
    summary: ReactiveAdequacySummary,
    provenance: ProvenanceTag | None,
    missing_data: Iterable[str],
) -> str:
    """Deterministyczny identyfikator analizy (SHA-256 kanonicznego payloadu).

    Wzorzec ``compute_grid_strength_id`` / ``compute_ssci_stability_id``:
    kanoniczny JSON (sort_keys, bez spacji, ensure_ascii=False) z istotnych liczb
    i etykiet werdyktu (bez tekstow ``why_pl`` / White Box — te sa pochodne).
    """
    payload = {
        "context": context.to_dict() if context else None,
        "saturation_tol_mvar": float(saturation_tol_mvar),
        "default_u_min_pu": float(default_u_min_pu),
        "default_u_max_pu": float(default_u_max_pu),
        "verdict": verdict,
        "sources": [
            {
                "ref": s.ref,
                "bus_ref": s.bus_ref,
                "q_actual_mvar": s.q_actual_mvar,
                "q_min_mvar": s.q_min_mvar,
                "q_max_mvar": s.q_max_mvar,
                "headroom_up_mvar": s.headroom_up_mvar,
                "headroom_down_mvar": s.headroom_down_mvar,
                "is_saturated": s.is_saturated,
                "at_limit_pl": s.at_limit_pl,
                "missing_data": list(s.missing_data),
            }
            for s in sources
        ],
        "voltage_violations": [
            {
                "bus_ref": v.bus_ref,
                "v_pu": v.v_pu,
                "u_min_pu": v.u_min_pu,
                "u_max_pu": v.u_max_pu,
                "deviation_pu": v.deviation_pu,
                "kind_pl": v.kind_pl,
            }
            for v in voltage_violations
        ],
        "balance": {
            "q_generated_mvar": balance.q_generated_mvar,
            "q_absorbed_by_sources_mvar": balance.q_absorbed_by_sources_mvar,
            "q_load_mvar": balance.q_load_mvar,
            "net_source_q_mvar": balance.net_source_q_mvar,
        },
        "summary": {
            "total_sources": summary.total_sources,
            "saturated_source_count": summary.saturated_source_count,
            "not_computed_source_count": summary.not_computed_source_count,
            "voltage_violation_count": summary.voltage_violation_count,
            "network_headroom_up_mvar": summary.network_headroom_up_mvar,
            "network_headroom_down_mvar": summary.network_headroom_down_mvar,
            "saturated_source_refs": list(summary.saturated_source_refs),
            "violated_bus_refs": list(summary.violated_bus_refs),
        },
        "provenance": provenance.to_dict() if provenance else None,
        "missing_data": list(missing_data),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def worst_field_quality(qualities: Iterable[Any]) -> Any | None:
    """Najgorsza (najnizsza) jakosc wg porzadku DATASHEET ≻ ESTIMATED ≻
    SYSTEM_DEFAULT. Zwraca ``FieldQuality`` lub ``None`` dla pustego zbioru.

    Wzorzec ``analysis.ssci_stability.worst_field_quality``: import ``FieldQuality``
    jest leniwy (warstwa ``solver_input`` jest dozwolona dla analizy, ale unikamy
    twardego importu na poziomie modulu).
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

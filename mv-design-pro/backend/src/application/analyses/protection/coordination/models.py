"""Modele wejścia, konfiguracji i wyniku koordynacji zabezpieczeń (E-28).

Karta BIEG-ZABEZPIECZEN-Z-MODELU: wejście to wynik JEDNEJ ścieżki oceny na biegu
maksymalnym i minimalnym (urządzenia i nastawy z modelu), pary selektywności z topologii
albo wskazane i sprawdzone, prądy robocze wyłączników z biegu rozpływu. Dawne wejście
(lista urządzeń klienta, prądy lokalizacji, prądy robocze jako echo ekranu) skasowane.

Niezmienne (frozen), deterministyczna serializacja, opisy po polsku.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from application.analyses.protection.ocena_nadpradowa import WynikOceny


@dataclass(frozen=True)
class CoordinationConfig:
    """Kryteria koordynacji — założenia projektowe (jawne w wyniku, w śladzie i przy każdej
    liczbie sprawdzenia jako wartość wymagana).

    Odstęp czasowy selektywności CTI = czas własny wyłącznika + wybieg przekaźnika + zapas.
    ``sensitivity_ratio_required`` — wymagany iloraz I_min/I_s, ``overload_ratio_required`` —
    wymagany iloraz I_s/I_rob. Koordynacja nie wydaje werdyktów (P-06): kryteria są wartościami
    odniesienia pokazywanymi obok liczb, nie progami pasm „prawidłowa / na granicy".
    """

    breaker_time_s: float = 0.05
    relay_overtravel_s: float = 0.05
    safety_factor_s: float = 0.1
    sensitivity_ratio_required: float = 1.5
    overload_ratio_required: float = 1.2

    def get_minimum_grading_margin_s(self) -> float:
        """Najmniejszy odstęp czasowy selektywności (CTI) [s]."""
        return self.breaker_time_s + self.relay_overtravel_s + self.safety_factor_s

    def to_dict(self) -> dict[str, Any]:
        return {
            "breaker_time_s": self.breaker_time_s,
            "relay_overtravel_s": self.relay_overtravel_s,
            "safety_factor_s": self.safety_factor_s,
            "sensitivity_ratio_required": self.sensitivity_ratio_required,
            "overload_ratio_required": self.overload_ratio_required,
            "minimum_grading_margin_s": self.get_minimum_grading_margin_s(),
        }


@dataclass(frozen=True)
class ParaSelektywnosci:
    """Para stopniowania: urządzenie nadrzędne (rezerwowe) i podrzędne (podstawowe)."""

    nadrzedne_ref: str
    podrzedne_ref: str

    def to_dict(self) -> dict[str, Any]:
        return {"nadrzedne_ref": self.nadrzedne_ref, "podrzedne_ref": self.podrzedne_ref}


@dataclass(frozen=True)
class PradRoboczy:
    """Prąd roboczy wyłącznika urządzenia z biegu rozpływu albo nazwany powód braku."""

    prad_a: float | None
    galaz_ref: str | None
    powod_pl: str | None = None


@dataclass(frozen=True)
class CoordinationInput:
    """Wejście koordynacji — wyłącznie wyniki jednej ścieżki oceny i biegów."""

    ocena_max: WynikOceny
    ocena_min: WynikOceny
    pary: tuple[ParaSelektywnosci, ...]
    odmowy_par: tuple[dict[str, Any], ...]
    prady_robocze: Mapping[str, PradRoboczy]
    #: Ik'' punktów stref (prąd, nazwa) z biegu maksymalnego i minimalnego — znaczniki TCC.
    prady_punktow_max: Mapping[str, tuple[float, str]]
    prady_punktow_min: Mapping[str, tuple[float, str]]
    rodzaj_zwarcia_max: str
    rodzaj_zwarcia_min: str
    #: Bezpieczniki modelu (``FuseBranch``) — pozycje bez pasma topikowego w katalogu.
    bezpieczniki: tuple[dict[str, Any], ...]
    config: CoordinationConfig
    project_id: str
    sc_run_id: str
    sc_run_id_min: str
    pf_run_id: str | None = None


@dataclass(frozen=True)
class TCCPoint:
    """Punkt charakterystyki czasowo-prądowej urządzenia."""

    current_a: float
    current_multiple: float
    time_s: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "current_a": self.current_a,
            "current_multiple": self.current_multiple,
            "time_s": self.time_s,
        }


@dataclass(frozen=True)
class TCCCurve:
    """Charakterystyka czasowo-prądowa urządzenia (wszystkie stopnie nadprądowe).

    ``podstawa_kod`` = ``KRZYWA_PRZEKAZNIKOWA`` (czas z rdzenia IEC 60255) albo
    ``BRAK_PASMA_BEZPIECZNIKA`` (bezpiecznik bez pasma z katalogu — ``points`` puste, próg i
    mnożnik ``None``: bezpiecznik ich nie ma).
    """

    device_id: str
    device_name: str
    curve_type: str
    pickup_current_a: float | None
    time_multiplier: float | None
    points: tuple[TCCPoint, ...]
    color: str
    podstawa_kod: str = "KRZYWA_PRZEKAZNIKOWA"
    powod_pl: str | None = None
    #: Stopnie urządzenia w zdaniu (próg pierwotny, charakterystyka, TMS albo zwłoka).
    opis_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "opis_pl": self.opis_pl,
            "device_id": self.device_id,
            "device_name": self.device_name,
            "curve_type": self.curve_type,
            "pickup_current_a": self.pickup_current_a,
            "time_multiplier": self.time_multiplier,
            "points": [p.to_dict() for p in self.points],
            "color": self.color,
            "podstawa_kod": self.podstawa_kod,
            "powod_pl": self.powod_pl,
        }


@dataclass(frozen=True)
class FaultMarker:
    """Znacznik prądu zwarciowego punktu na wykresie TCC."""

    id: str
    label_pl: str
    current_a: float
    fault_type: str
    location: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label_pl": self.label_pl,
            "current_a": self.current_a,
            "fault_type": self.fault_type,
            "location": self.location,
        }


@dataclass(frozen=True)
class CoordinationAnalysisResult:
    """Wynik koordynacji: sprawdzenia (liczby z wartościami wymaganymi — bez werdyktu, P-06),
    charakterystyki, odmowy, pary i ślad White Box."""

    run_id: str
    project_id: str
    devices: tuple[dict[str, Any], ...] = ()
    sensitivity_checks: tuple[Any, ...] = ()
    selectivity_checks: tuple[Any, ...] = ()
    overload_checks: tuple[Any, ...] = ()
    tcc_curves: tuple[TCCCurve, ...] = ()
    fault_markers: tuple[FaultMarker, ...] = ()
    summary: dict[str, Any] = field(default_factory=dict)
    trace_steps: tuple[dict[str, Any], ...] = ()
    odmowy_urzadzen: tuple[dict[str, Any], ...] = ()
    pominiete: tuple[dict[str, Any], ...] = ()
    pary: tuple[dict[str, Any], ...] = ()
    odmowy_par: tuple[dict[str, Any], ...] = ()
    pf_run_id: str | None = None
    sc_run_id: str | None = None
    sc_run_id_min: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "project_id": self.project_id,
            "devices": list(self.devices),
            "sensitivity_checks": [c.to_dict() for c in self.sensitivity_checks],
            "selectivity_checks": [c.to_dict() for c in self.selectivity_checks],
            "overload_checks": [c.to_dict() for c in self.overload_checks],
            "tcc_curves": [c.to_dict() for c in self.tcc_curves],
            "fault_markers": [m.to_dict() for m in self.fault_markers],
            "summary": self.summary,
            "trace_steps": list(self.trace_steps),
            "odmowy_urzadzen": list(self.odmowy_urzadzen),
            "pominiete": list(self.pominiete),
            "pary": list(self.pary),
            "odmowy_par": list(self.odmowy_par),
            "pf_run_id": self.pf_run_id,
            "sc_run_id": self.sc_run_id,
            "sc_run_id_min": self.sc_run_id_min,
            "created_at": self.created_at.isoformat(),
        }

"""Wynik biegu oceny zabezpieczeń nadprądowych (``protection_sn``) — kontrakt zapisu.

Bieg interpretuje wynik biegu zwarciowego na urządzeniach i nastawach Z MODELU (decyzja
D-21, karta BIEG-ZABEZPIECZEN-Z-MODELU). Liczy go jedna ścieżka
``application.analyses.protection.ocena_nadpradowa``; ten moduł niesie wyłącznie typy
zapisu wyniku i śladu (zamrożone, deterministyczne).

Zmiana względem P15a (usunięte na amen, bez warstwy zgodności): szablon przypadku
(``template_ref``/``template_fingerprint``/``library_manifest_ref``/``overrides``) nie jest
już źródłem urządzeń ani nastaw — pola zniknęły z wyniku i śladu. Urządzenie oceny to
przypisanie zabezpieczenia modelu (``device_id`` = ``ref_id`` przypisania), element
chroniony to jego wyłącznik (``protected_element_ref`` = ``breaker_ref``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any


class TripState(StrEnum):
    """Stan zadziałania urządzenia przy zwarciu w punkcie jego strefy."""

    TRIPS = "TRIPS"
    NO_TRIP = "NO_TRIP"


@dataclass(frozen=True)
class ProtectionEvaluation:
    """Ocena JEDNEGO urządzenia modelu przy zwarciu w JEDNYM punkcie jego strefy.

    ``i_fault_a`` to prąd pierwotny płynący przez wyłącznik urządzenia (bilans klastra
    zacisku z rozpływu biegu SC), NIE Ik'' szyny. ``i_pickup_a`` to prąd rozruchowy strony
    pierwotnej stopnia odniesienia (decydującego albo najczulszego), wyprowadzony z nastawy
    i przekładni przekładnika. ``margin_percent`` = (I/Is − 1)·100 — ``None``, gdy wynik jest
    niewiarygodny (``wiarygodnosc == "NIEWIARYGODNY"``): liczby nie pokazuje się jako zapasu.
    """

    device_id: str
    nazwa_urzadzenia_pl: str
    device_type_ref: str | None
    protected_element_ref: str
    fault_target_id: str
    nazwa_punktu_pl: str
    i_fault_a: float
    i_pickup_a: float
    t_trip_s: float | None
    trip_state: TripState
    stopien_decydujacy: str | None
    curve_kind: str | None
    krotnosc_m: float
    margin_percent: float | None
    wiarygodnosc: str
    wiarygodnosc_powod_pl: str
    notes_pl: str
    stopnie: tuple[dict[str, Any], ...] = ()
    bilans_pradu: dict[str, Any] = field(default_factory=dict)
    ocena: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "nazwa_urzadzenia_pl": self.nazwa_urzadzenia_pl,
            "device_type_ref": self.device_type_ref,
            "protected_element_ref": self.protected_element_ref,
            "fault_target_id": self.fault_target_id,
            "nazwa_punktu_pl": self.nazwa_punktu_pl,
            "i_fault_a": self.i_fault_a,
            "i_pickup_a": self.i_pickup_a,
            "t_trip_s": self.t_trip_s,
            "trip_state": self.trip_state.value,
            "stopien_decydujacy": self.stopien_decydujacy,
            "curve_kind": self.curve_kind,
            "krotnosc_m": self.krotnosc_m,
            "margin_percent": self.margin_percent,
            "wiarygodnosc": self.wiarygodnosc,
            "wiarygodnosc_powod_pl": self.wiarygodnosc_powod_pl,
            "notes_pl": self.notes_pl,
            "stopnie": list(self.stopnie),
            "bilans_pradu": self.bilans_pradu,
            "ocena": self.ocena,
        }


@dataclass(frozen=True)
class ProtectionResultSummary:
    """Podsumowanie wyniku — liczności i skrajne czasy zadziałania."""

    total_evaluations: int
    trips_count: int
    no_trip_count: int
    unreliable_count: int
    refused_devices_count: int
    skipped_devices_count: int
    min_trip_time_s: float | None
    max_trip_time_s: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_evaluations": self.total_evaluations,
            "trips_count": self.trips_count,
            "no_trip_count": self.no_trip_count,
            "unreliable_count": self.unreliable_count,
            "refused_devices_count": self.refused_devices_count,
            "skipped_devices_count": self.skipped_devices_count,
            "min_trip_time_s": self.min_trip_time_s,
            "max_trip_time_s": self.max_trip_time_s,
        }


@dataclass(frozen=True)
class ProtectionResult:
    """Wynik biegu: oceny punktów, odmowy urządzeń (z brakami i akcjami naprawczymi),
    pominięcia (z przyczyną), rozwiązane nastawy i strefy urządzeń."""

    run_id: str
    sc_run_id: str
    protection_case_id: str
    evaluations: tuple[ProtectionEvaluation, ...]
    odmowy: tuple[dict[str, Any], ...]
    pominiete: tuple[dict[str, Any], ...]
    nastawy: tuple[dict[str, Any], ...]
    strefy: dict[str, dict[str, Any]]
    summary: ProtectionResultSummary
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "sc_run_id": self.sc_run_id,
            "protection_case_id": self.protection_case_id,
            "evaluations": [e.to_dict() for e in self.evaluations],
            "odmowy": list(self.odmowy),
            "pominiete": list(self.pominiete),
            "nastawy": list(self.nastawy),
            "strefy": self.strefy,
            "summary": self.summary.to_dict(),
            "created_at": self.created_at.isoformat(),
        }


@dataclass(frozen=True)
class ProtectionTraceStep:
    """Krok śladu White Box — wejścia, wyjścia, opis po polsku."""

    step: str
    description_pl: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "description_pl": self.description_pl,
            "inputs": self.inputs,
            "outputs": self.outputs,
        }


@dataclass(frozen=True)
class ProtectionTrace:
    """Ślad biegu: rozwiązanie nastaw, strefy, bilanse prądów i czasy z rdzenia."""

    run_id: str
    sc_run_id: str
    snapshot_id: str | None
    steps: tuple[ProtectionTraceStep, ...]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "sc_run_id": self.sc_run_id,
            "snapshot_id": self.snapshot_id,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at.isoformat(),
        }


def compute_result_summary(
    evaluations: tuple[ProtectionEvaluation, ...],
    *,
    refused_devices_count: int,
    skipped_devices_count: int,
) -> ProtectionResultSummary:
    """Podsumowanie z ocen — czasy skrajne wyłącznie z wyników wiarygodnych."""
    trip_times = [
        e.t_trip_s
        for e in evaluations
        if e.t_trip_s is not None and e.wiarygodnosc != "NIEWIARYGODNY"
    ]
    return ProtectionResultSummary(
        total_evaluations=len(evaluations),
        trips_count=sum(1 for e in evaluations if e.trip_state == TripState.TRIPS),
        no_trip_count=sum(1 for e in evaluations if e.trip_state == TripState.NO_TRIP),
        unreliable_count=sum(1 for e in evaluations if e.wiarygodnosc == "NIEWIARYGODNY"),
        refused_devices_count=refused_devices_count,
        skipped_devices_count=skipped_devices_count,
        min_trip_time_s=min(trip_times) if trip_times else None,
        max_trip_time_s=max(trip_times) if trip_times else None,
    )

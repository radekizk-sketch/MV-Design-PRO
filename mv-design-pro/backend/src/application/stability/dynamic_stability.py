"""Tor „stabilność dynamiczna po wyłączeniu zwarcia" — echo scenariusza BEZ werdyktu.

Bieg `dynamic_stability` NIE rozwiązuje sieci: kąty mocy źródła przed zwarciem, w czasie
zwarcia i po nim, napięcie i częstotliwość po zwarciu oraz czas wyłączenia zwarcia WPISUJE
użytkownik w opcjach biegu. Dawny „werdykt" STABLE/UNSTABLE (wraz z indeksem stabilności,
czynnikiem ograniczającym, listą naruszonych kryteriów i marginesem czasu wyłączenia) był
porównaniem TYCH liczb z progami przyjętymi w opcjach biegu — liczba wpisana przez
użytkownika zwracała mu się jako „wynik" (uczciwość natychmiastowa, audyt dynamiki
2026-09-23). Tor zostaje do kasacji przy wdrożeniu biegu kanonicznego dynamiki RMS; do tego
czasu bieg się wykonuje i zwraca ECHO scenariusza z rekordem kontraktu werdyktu (`ocena`,
``werdykt.OcenaKryterium`` o statusie ``NIE_OCENIONO``): dowód ``BRAK_METODY``, a wartości
wpisane przez użytkownika jako dane przyjęte bez walidacji (``UNVALIDATED_INPUT``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from application.ocena_niewykonana import ocena_niewykonana, rekord_json
from enm.nazwy_elementow import SPOZA_MODELU, nazwa_po_identyfikatorze
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    ClaimKind,
    DanaPrzyjeta,
    FieldQuality,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    Wielkosc,
    ZakresWaznosci,
)

#: Wersja kontraktu echa scenariusza (dawniej `dynamic_stability_fault_clear_v1` — kontrakt
#: z werdyktem progowym). Nowa wersja, bo wynik przestał nieść werdykt i jego składowe.
WERSJA_KONTRAKTU_ECHA = "dynamic_stability_fault_clear_echo_v2"

#: Konkretne braki toru (po brakach nazwanych przez regułę K) — co trzeba dostarczyć.
BRAKI_OCENY_STABILNOSCI: tuple[str, ...] = (
    "Bieg dynamiki RMS na silniku kanonicznym z modelem źródeł, sieci i obciążeń, "
    "zweryfikowany wyrocznią — kąty mocy, napięcie i częstotliwość po zwarciu oraz czas "
    "wyłączenia w tym biegu pochodzą z wartości wpisanych przez użytkownika, nie z rozwiązania "
    "sieci.",
    "Przebieg kątów mocy, napięcia i częstotliwości wyznaczony z rozwiązania sieci, a nie "
    "wpisany ręcznie.",
    "Zadziałanie zabezpieczeń wyznaczone z ich nastaw i przebiegu prądów zwarciowych "
    "(zabezpieczenia nie są w tym biegu symulowane).",
    "Obliczenie dynamiki czasowej z punktem pracy z rozpływu (bieg kanoniczny albo program "
    "zewnętrzny) — do tego czasu ten bieg pokazuje wyłącznie scenariusz wpisany przez "
    "użytkownika.",
)
#: Zdolność toru w rejestrze dowodowym (jedno źródło poziomu dowodowego).
_ZDOLNOSC_TORU = "dynamic_stability.fault_clear"
_POWOD_DANEJ_WPISANEJ = "wpisana przez użytkownika w opcjach biegu — nie z rozwiązania sieci"


def _dane_wpisane(scenario: FaultClearScenario) -> tuple[DanaPrzyjeta, ...]:
    """Wartości scenariusza wpisane przez użytkownika — dane przyjęte bez walidacji."""
    zrodlo = scenario.source_state

    def dana(nazwa: str, wartosc: float, jednostka: str) -> DanaPrzyjeta:
        return DanaPrzyjeta(
            nazwa_pl=nazwa,
            wartosc=Wielkosc(wartosc=_round_metric(wartosc), jednostka=jednostka),
            powod_pl=_POWOD_DANEJ_WPISANEJ,
            jakosc=FieldQuality.ESTIMATED,
        )

    return (
        dana("czas wyłączenia zwarcia", scenario.clearing_time_ms, "ms"),
        dana("kąt mocy przed zwarciem", zrodlo.pre_fault_angle_deg, "°"),
        dana("kąt mocy w czasie zwarcia", zrodlo.during_fault_angle_deg, "°"),
        dana("kąt mocy po zwarciu", zrodlo.post_fault_angle_deg, "°"),
        dana("napięcie po zwarciu", zrodlo.post_fault_voltage_pu, "p.u. (U_n)"),
        dana("częstotliwość po zwarciu", zrodlo.post_fault_frequency_pu, "p.u. (f_n)"),
    )


def ocena_stabilnosci_niewykonana(
    scenario: FaultClearScenario, *, nazwy: Mapping[str, str]
) -> dict[str, Any]:
    """Rekord ``NIE_OCENIONO`` (``werdykt.OcenaKryterium``) toru z kątów wpisanych ręcznie.

    ``nazwy`` — indeks ``ref_id -> nazwa`` migawki biegu (``enm.nazwy_elementow``): przedmiot
    oceny nazywa źródło i element objęty zwarciem nazwą z modelu; identyfikator zostaje
    w ``element_ref`` (karta #144 — dawniej „Źródło gen_sync … na elemencie line_b_c").
    """
    ewidencja = classify_dynamic_capability(_ZDOLNOSC_TORU)
    zrodlo = scenario.source_state
    return rekord_json(
        ocena_niewykonana(
            kryterium_id=f"dynamic_stability.fault_clear.{scenario.scenario_id}",
            przedmiot=Przedmiot(
                element_ref=zrodlo.source_id,
                nazwa_pl="Źródło "
                + nazwa_po_identyfikatorze(
                    zrodlo.source_id, indeks=nazwy, spoza_modelu=SPOZA_MODELU
                ),
                opis_pl="Źródło w scenariuszu wyłączenia zwarcia na elemencie "
                + nazwa_po_identyfikatorze(
                    scenario.faulted_element_id, indeks=nazwy, spoza_modelu=SPOZA_MODELU
                ),
            ),
            opis_kryterium_pl="Stabilność kątowa źródła po wyłączeniu zwarcia",
            podstawa=PodstawaWymagania(
                rodzaj="NIEUSTALONA",
                dokument="Progi oceny stabilności podane w opcjach biegu",
                status="NIEUSTALONE",
                uwagi_pl="progi bez dokumentu źródłowego — przyjmowane w opcjach biegu",
            ),
            powod_stosowalnosci_pl="scenariusz wyłączenia zwarcia wskazuje oceniane źródło",
            rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
            poziom=ewidencja.tier,
            status_modelu="NIE_DOTYCZY",
            zakres_waznosci=ZakresWaznosci(
                opis_pl="Echo scenariusza wyłączenia zwarcia wpisanego przez użytkownika",
                wykluczenia=(
                    "przebieg kątów mocy wyznaczony z rozwiązania sieci",
                    "zadziałanie zabezpieczeń wyznaczone z nastaw",
                ),
            ),
            powod_braku_niepewnosci_pl=(
                "brak wielkości rozstrzygającej — bieg nie rozwiązuje sieci, więc niepewność "
                "wyniku nie dotyczy"
            ),
            czego_brakuje=BRAKI_OCENY_STABILNOSCI,
            status_danych=StatusDanych(
                stan="UNVALIDATED_INPUT", dane_przyjete=_dane_wpisane(scenario)
            ),
        )
    )


def _round_metric(value: float) -> float:
    return round(float(value), 6)


@dataclass(frozen=True)
class FaultClearSourceState:
    source_id: str
    pre_fault_angle_deg: float
    during_fault_angle_deg: float
    post_fault_angle_deg: float
    post_fault_voltage_pu: float
    post_fault_frequency_pu: float

    def __post_init__(self) -> None:
        if not self.source_id or not self.source_id.strip():
            raise ValueError("source_id is required")

    def to_dict(self) -> dict[str, float | str]:
        return {
            "source_id": self.source_id,
            "pre_fault_angle_deg": _round_metric(self.pre_fault_angle_deg),
            "during_fault_angle_deg": _round_metric(self.during_fault_angle_deg),
            "post_fault_angle_deg": _round_metric(self.post_fault_angle_deg),
            "post_fault_voltage_pu": _round_metric(self.post_fault_voltage_pu),
            "post_fault_frequency_pu": _round_metric(self.post_fault_frequency_pu),
        }


@dataclass(frozen=True)
class FaultClearScenario:
    scenario_id: str
    faulted_element_id: str
    clearing_time_ms: float
    source_state: FaultClearSourceState
    cleared_by_element_ids: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if not self.scenario_id or not self.scenario_id.strip():
            raise ValueError("scenario_id is required")
        if not self.faulted_element_id or not self.faulted_element_id.strip():
            raise ValueError("faulted_element_id is required")
        if self.clearing_time_ms <= 0:
            raise ValueError("clearing_time_ms must be > 0")

        canonical_ids = tuple(
            sorted({element_id for element_id in self.cleared_by_element_ids if element_id})
        )
        if not canonical_ids:
            raise ValueError("cleared_by_element_ids must contain at least one element")
        object.__setattr__(self, "cleared_by_element_ids", canonical_ids)

    def to_dict(self) -> dict[str, object]:
        return {
            "scenario_id": self.scenario_id,
            "scenario_type": "FAULT_CLEAR",
            "faulted_element_id": self.faulted_element_id,
            "clearing_time_ms": _round_metric(self.clearing_time_ms),
            "cleared_by_element_ids": list(self.cleared_by_element_ids),
            "source_state": self.source_state.to_dict(),
        }


@dataclass(frozen=True)
class EchoScenariuszaStabilnosci:
    """Echo scenariusza wpisanego przez użytkownika + ocena niewykonana (bez werdyktu)."""

    scenario_id: str
    scenario_type: str
    source_id: str
    faulted_element_id: str
    cleared_by_element_ids: tuple[str, ...]
    clearing_time_ms: float
    pre_fault_angle_deg: float
    during_fault_angle_deg: float
    post_fault_angle_deg: float
    post_fault_voltage_pu: float
    post_fault_frequency_pu: float
    ocena: dict[str, Any]
    contract_version: str = WERSJA_KONTRAKTU_ECHA

    def to_dict(self) -> dict[str, object]:
        return {
            "scenario_id": self.scenario_id,
            "scenario_type": self.scenario_type,
            "source_id": self.source_id,
            "faulted_element_id": self.faulted_element_id,
            "cleared_by_element_ids": list(self.cleared_by_element_ids),
            # Status maszynowy WYPROWADZONY z rekordu oceny (jedno źródło prawdy) — echo nie
            # ma własnego pola statusu obok rekordu kontraktu werdyktu.
            "status": self.ocena["status_maszynowy"],
            "contract_version": self.contract_version,
            "clearing_time_ms": _round_metric(self.clearing_time_ms),
            "pre_fault_angle_deg": _round_metric(self.pre_fault_angle_deg),
            "during_fault_angle_deg": _round_metric(self.during_fault_angle_deg),
            "post_fault_angle_deg": _round_metric(self.post_fault_angle_deg),
            "post_fault_voltage_pu": _round_metric(self.post_fault_voltage_pu),
            "post_fault_frequency_pu": _round_metric(self.post_fault_frequency_pu),
            "ocena": dict(self.ocena),
        }


def echo_scenariusza_stabilnosci(
    scenario: FaultClearScenario, *, nazwy: Mapping[str, str]
) -> EchoScenariuszaStabilnosci:
    """Echo scenariusza wyłączenia zwarcia z oceną niewykonaną — ZERO porównań z progami.

    ``nazwy`` — indeks nazw migawki biegu (patrz ``ocena_stabilnosci_niewykonana``)."""
    zrodlo = scenario.source_state
    return EchoScenariuszaStabilnosci(
        scenario_id=scenario.scenario_id,
        scenario_type="FAULT_CLEAR",
        source_id=zrodlo.source_id,
        faulted_element_id=scenario.faulted_element_id,
        cleared_by_element_ids=scenario.cleared_by_element_ids,
        clearing_time_ms=scenario.clearing_time_ms,
        pre_fault_angle_deg=zrodlo.pre_fault_angle_deg,
        during_fault_angle_deg=zrodlo.during_fault_angle_deg,
        post_fault_angle_deg=zrodlo.post_fault_angle_deg,
        post_fault_voltage_pu=zrodlo.post_fault_voltage_pu,
        post_fault_frequency_pu=zrodlo.post_fault_frequency_pu,
        ocena=ocena_stabilnosci_niewykonana(scenario, nazwy=nazwy),
    )

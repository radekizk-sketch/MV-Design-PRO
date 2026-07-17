"""Modele warstwy interpretacji: siła sieci dla źródeł falownikowych (SCR/WSCR).

Warstwa ANALIZY (interpretacja, NIE fizyka — Z15). Moduł odczytuje gotowe
wyniki (moc zwarciowa S_sc'' w węźle przyłączenia z solvera IEC 60909) oraz
moc zainstalowaną źródeł IBG i wylicza wskaźnik siły sieci w węźle:

- **SCR** (Short Circuit Ratio) per węzeł:  SCR = S_sc'' / S_n
- **WSCR** (Weighted SCR, metodyka ERCOT) dla wielu źródeł w pobliżu:
  WSCR = Σ_i (S_sc_i · S_n_i) / (Σ_i S_n_i)²

Punkt przyłączenia źródła jest w modelu reprezentowany przez węzeł (szynę),
dlatego referencja to ``bus_ref`` — zgodnie z kanonem modelu (bez terminu
zakazanego w warstwie domenowej).

Odniesienia: IEEE Std 1204-1997 (siła sieci AC/DC), CIGRE TB 671 (IBG w sieci
słabej), metodyka ERCOT (WSCR). Próg ostrzegawczy „sieć słaba” SCR < 3 zgodnie
z PROMPT §8C.4.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

# Domyślne progi klasyfikacji siły sieci (parametryzowalne w builderze).
DEFAULT_WEAK_THRESHOLD = 3.0  # SCR < 3  → sieć słaba (ostrzeżenie, §8C.4)
DEFAULT_VERY_WEAK_THRESHOLD = 2.0  # SCR < 2 → bardzo słaba (ryzyko niestabilności)

VERDICT_STRONG = "mocna"
VERDICT_WEAK = "słaba"
VERDICT_VERY_WEAK = "bardzo słaba"
VERDICT_NO_DATA = "brak danych"


@dataclass(frozen=True)
class GridStrengthContext:
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
class BusSourceModule:
    """Moduł źródłowy (generator IBG) przyłączony do węzła — metadana opisowa.

    ADDYTYWNE (P47b): pozwala warstwie prezentacji odwzorować moduł na węzeł
    przyłączenia. NIE bierze udziału w fizyce ani w odcisku analizy — służy
    wyłącznie mapowaniu moduł→węzeł w pulpicie OZE.

    - ``ref`` ← ``Generator.ref_id`` ze snapshotu,
    - ``name`` ← ``Generator.name`` (o ile obecne w snapshocie),
    - ``sn_mva`` ← udział mocy zainstalowanej modułu [MVA] (``None`` gdy nieznana).
    """

    ref: str
    name: str | None
    sn_mva: float | None


@dataclass(frozen=True)
class BusStrengthInput:
    """Wejście per węzeł przyłączenia źródła.

    Odwzorowanie z modelu (warstwa application):
    - ``s_sc_mva`` ← ``ShortCircuitResult.sk_mva`` w węźle (solver IEC 60909),
    - ``s_installed_mva`` ← suma mocy zainstalowanej źródeł IBG w węźle.
    """

    bus_ref: str
    nominal_kv: float | None
    s_sc_mva: float | None
    s_installed_mva: float | None
    modules: tuple[BusSourceModule, ...] = ()


@dataclass(frozen=True)
class WhiteBoxStep:
    """Pojedynczy krok wywodu White Box (A→B→C→D)."""

    symbol: str
    formula_latex: str
    substitution_pl: str
    result_pl: str


@dataclass(frozen=True)
class BusStrengthEntry:
    bus_ref: str
    nominal_kv: float | None
    s_sc_mva: float | None
    s_installed_mva: float | None
    scr: float | None
    verdict: str
    is_weak: bool
    why_pl: str
    missing_data: tuple[str, ...]
    white_box: tuple[WhiteBoxStep, ...]
    modules: tuple[BusSourceModule, ...] = ()


@dataclass(frozen=True)
class GridStrengthSummary:
    total_buses: int
    weak_bus_count: int
    not_computed_count: int
    wscr: float | None
    wscr_verdict: str
    wscr_why_pl: str
    wscr_white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class GridStrengthView:
    analysis_id: str
    context: GridStrengthContext | None
    weak_threshold: float
    very_weak_threshold: float
    entries: tuple[BusStrengthEntry, ...]
    summary: GridStrengthSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.grid_strength.serializer import view_to_dict

        return view_to_dict(self)


def compute_grid_strength_id(
    context: GridStrengthContext | None,
    weak_threshold: float,
    very_weak_threshold: float,
    entries: Iterable[BusStrengthEntry],
) -> str:
    """Deterministyczny identyfikator analizy (SHA-256 kanonicznego payloadu)."""
    payload = {
        "context": context.to_dict() if context else None,
        "weak_threshold": float(weak_threshold),
        "very_weak_threshold": float(very_weak_threshold),
        "entries": [
            {
                "bus_ref": entry.bus_ref,
                "nominal_kv": entry.nominal_kv,
                "s_sc_mva": entry.s_sc_mva,
                "s_installed_mva": entry.s_installed_mva,
                "scr": entry.scr,
                "verdict": entry.verdict,
                "is_weak": entry.is_weak,
                "missing_data": list(entry.missing_data),
            }
            for entry in entries
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

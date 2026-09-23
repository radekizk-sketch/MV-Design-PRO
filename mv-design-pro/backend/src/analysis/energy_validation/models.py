"""
Energy validation result types.

Validates physical constraints of the network after power flow:
- Branch loading (line/cable current vs rated current)
- Transformer loading (apparent power vs rated power)
- Voltage deviation (per-bus delta from nominal)
- Total losses budget (P_loss / P_total ratio)
- Reactive power balance (Q_slack direction)

This is ANALYSIS, not SOLVER. No physics calculations.
Uses existing PowerFlowResult data only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from analysis.normative.kryteria_napiecia import (
    KRYTERIUM_OSTRZEZENIE_PROCENT,
    KRYTERIUM_PRZEKROCZENIE_PROCENT,
    podstawa_progu_napiecia,
)
from analysis.podstawa_normatywna import PodstawaNormatywna, podstawa_niezweryfikowana


class EnergyCheckType(StrEnum):
    BRANCH_LOADING = "BRANCH_LOADING"
    TRANSFORMER_LOADING = "TRANSFORMER_LOADING"
    VOLTAGE_DEVIATION = "VOLTAGE_DEVIATION"
    LOSS_BUDGET = "LOSS_BUDGET"
    REACTIVE_BALANCE = "REACTIVE_BALANCE"


class EnergyValidationStatus(StrEnum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"


@dataclass(frozen=True)
class EnergyValidationItem:
    check_type: EnergyCheckType
    target_id: str
    target_name: str | None
    observed_value: float | None
    unit: str
    limit_warn: float | None
    limit_fail: float | None
    margin_pct: float | None
    status: EnergyValidationStatus
    why_pl: str
    # Slad WHITE BOX per pozycja (R2-A / K3-G1; struktura R3-D): krotka krokow
    # {"tekst": str, "latex": str | None}. `latex` obecny dla wzoru i
    # podstawienia (kanon Proof Engine: matematyka w LaTeX, UI renderuje KaTeX);
    # `tekst` zawsze (raporty/eksport ASCII). Addytywnie, domyslnie pusty
    # (pozycje NOT_COMPUTED bez wywodu - powod niesie why_pl).
    white_box: tuple[dict, ...] = ()
    #: Odwolanie do dowodu (karta AB-1a D2 — JEDEN ksztalt `{run_id, element_id,
    #: trace_ref}`); wypelnia builder z kontekstu biegu (`trace_ref = "white_box"`,
    #: gdy pozycja niesie wlasny slad). ``None`` = pozycja zbudowana bez buildera.
    dowod: dict[str, str | None] | None = None
    # --- Towarzysze werdyktu (karta AB-1a-bis, guard werdyktu §3.3) -----------
    # WYPROWADZANE w `__post_init__` z pol dostawcy powyzej — jedno zrodlo liczby
    # (zero drugiej prawdy): `wartosc` = `observed_value`, `odniesienie` =
    # `limit_fail` (granica werdyktu FAIL), `margines` = zapas do granicy w
    # konwencji wyniku wyjasnialnego (`OcenaElementu`: dodatni = w granicy), czyli
    # `-margin_pct` (dostawca liczy `wartosc - prog`); `None`, gdy dostawca zapasu
    # nie policzyl (NOT_COMPUTED, bilans Q). `podstawa` z rodzaju kontroli.
    wartosc: float | None = field(init=False)
    odniesienie: float | None = field(init=False)
    margines: float | None = field(init=False)
    podstawa: PodstawaNormatywna = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "wartosc", self.observed_value)
        object.__setattr__(self, "odniesienie", self.limit_fail)
        object.__setattr__(
            self, "margines", -self.margin_pct if self.margin_pct is not None else None
        )
        object.__setattr__(self, "podstawa", podstawa_kontroli(self.check_type, self.limit_fail))


#: Podstawy progow walidacji energetycznej (karta AB-1a-bis). Zaden prog tego
#: modulu nie ma w kodzie cytowanego dokumentu z wydaniem i punktem — wszystkie
#: `UNVERIFIED_SOURCE`; liczby bez zmian (karta AB-1a §0 R-7).
_PODSTAWA_KONTROLI: dict[EnergyCheckType, PodstawaNormatywna] = {
    EnergyCheckType.BRANCH_LOADING: podstawa_niezweryfikowana(
        "Próg obciążenia gałęzi z konfiguracji walidacji energetycznej "
        "(obciążalność długotrwała I_n z danych gałęzi — katalog); dokument normowy "
        "progu nie jest wskazany w kodzie."
    ),
    EnergyCheckType.TRANSFORMER_LOADING: podstawa_niezweryfikowana(
        "Próg obciążenia transformatora z konfiguracji walidacji energetycznej "
        "(moc znamionowa S_n z typu katalogowego); dokument normowy progu nie jest "
        "wskazany w kodzie."
    ),
    EnergyCheckType.LOSS_BUDGET: podstawa_niezweryfikowana(
        "Założenie projektowe: budżet strat mocy z konfiguracji walidacji "
        "energetycznej — nie wymaganie dokumentu normowego."
    ),
    EnergyCheckType.REACTIVE_BALANCE: podstawa_niezweryfikowana(
        "Progi współczynnika mocy w węźle bilansującym zapisane w kodzie walidacji "
        "energetycznej bez wskazanego dokumentu normowego."
    ),
}


def podstawa_kontroli(check_type: EnergyCheckType, limit_fail: float | None) -> PodstawaNormatywna:
    """Podstawa werdyktu pozycji walidacji — z rodzaju kontroli; odchylenie napiecia
    z jednego zrodla kryteriow napieciowych (`kryteria_napiecia`)."""
    if check_type == EnergyCheckType.VOLTAGE_DEVIATION:
        return podstawa_progu_napiecia(limit_fail)
    return _PODSTAWA_KONTROLI[check_type]


@dataclass(frozen=True)
class EnergyValidationSummary:
    pass_count: int
    warning_count: int
    fail_count: int
    not_computed_count: int
    worst_item_target_id: str | None
    worst_item_margin_pct: float | None


@dataclass(frozen=True)
class EnergyValidationContext:
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
            "run_timestamp": (self.run_timestamp.isoformat() if self.run_timestamp else None),
            "snapshot_hash": self.snapshot_hash,
            "run_id": self.run_id,
        }


@dataclass(frozen=True)
class EnergyValidationConfig:
    loading_warn_pct: float = 80.0
    loading_fail_pct: float = 100.0
    #: Jedno zrodlo prawdy: `analysis.normative.kryteria_napiecia` (karta W3-J).
    voltage_warn_pct: float = KRYTERIUM_OSTRZEZENIE_PROCENT
    voltage_fail_pct: float = KRYTERIUM_PRZEKROCZENIE_PROCENT
    loss_warn_pct: float = 5.0
    loss_fail_pct: float = 10.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "loading_warn_pct": self.loading_warn_pct,
            "loading_fail_pct": self.loading_fail_pct,
            "voltage_warn_pct": self.voltage_warn_pct,
            "voltage_fail_pct": self.voltage_fail_pct,
            "loss_warn_pct": self.loss_warn_pct,
            "loss_fail_pct": self.loss_fail_pct,
        }


@dataclass(frozen=True)
class EnergyValidationView:
    context: EnergyValidationContext | None
    config: EnergyValidationConfig
    items: tuple[EnergyValidationItem, ...]
    summary: EnergyValidationSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.energy_validation.serializer import view_to_dict

        return view_to_dict(self)

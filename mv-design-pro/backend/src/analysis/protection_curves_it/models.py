from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from analysis.normative.models import NormativeStatus
from analysis.podstawa_normatywna import PodstawaNormatywna, podstawa_niezweryfikowana

#: Podstawa statusu krzywych I–t (karta AB-1a-bis): status jest AGREGATEM regul
#: P18 raportu normatywnego (wylaczalnosc, warunek dynamiczny, cieplny,
#: selektywnosc) — ich podstawy niesie kazda pozycja raportu; tu nazwa agregatu.
PODSTAWA_KRZYWYCH_IT: PodstawaNormatywna = podstawa_niezweryfikowana(
    "Agregat reguł raportu normatywnego dla pary zabezpieczeń (wyłączalność, warunek "
    "dynamiczny, warunek cieplny, selektywność); podstawa każdej reguły w jej pozycji "
    "raportu — dokument normowy nie jest przypięty w kodzie."
)


class ITCurveRole(StrEnum):
    PRIMARY = "PRIMARY"
    BACKUP = "BACKUP"


class ITCurveType(StrEnum):
    INVERSE = "INVERSE"
    DEFINITE = "DEFINITE"
    INSTANTANEOUS = "INSTANTANEOUS"
    UNKNOWN = "UNKNOWN"


class ITCurveSource(StrEnum):
    CATALOG = "CATALOG"
    USER = "USER"
    UNKNOWN = "UNKNOWN"


class ITMarkerKind(StrEnum):
    IKSS = "IKSS"
    IP = "IP"
    ITH = "ITH"


@dataclass(frozen=True)
class ITCurvePoint:
    i_a: float
    t_s: float


@dataclass(frozen=True)
class ITCurveSeries:
    series_id: str
    device_id: str
    role: ITCurveRole
    curve_type: ITCurveType
    points: tuple[ITCurvePoint, ...]
    source: ITCurveSource


@dataclass(frozen=True)
class ITMarker:
    kind: ITMarkerKind
    i_a: float
    t_s: float | None
    source_proof_id: str


@dataclass(frozen=True)
class ProtectionCurvesITContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None
    #: Identyfikator PRZEBIEGU (V12K-269). Osobne pole, bo `trace_id` jest
    #: identyfikatorem ARTEFAKTU dowodowego — dwa rozne pojecia nie moga
    #: dzielic jednej nazwy. NIE wchodzi do odcisku analizy.
    run_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
            "run_id": self.run_id,
        }


@dataclass(frozen=True)
class ProtectionCurvesITView:
    context: ProtectionCurvesITContext | None
    bus_id: str
    primary_device_id: str
    backup_device_id: str | None
    series: tuple[ITCurveSeries, ...]
    markers: tuple[ITMarker, ...]
    normative_status: NormativeStatus
    margins_pct: dict[str, float]
    why_pl: str
    missing_data: tuple[str, ...]
    # --- Towarzysze werdyktu (karta AB-1a-bis) --------------------------------
    #: Werdykt jest ZLICZENIOWY (agregat regul): `wartosc` = liczba regul P18
    #: pary spelnionych (PASS), `odniesienie` = liczba regul ocenianych dla pary;
    #: ``None`` = brak raportu albo brak regul pary (status NOT_EVALUATED).
    wartosc: int | None = None
    odniesienie: int | None = None
    #: Odwolanie do dowodu `{run_id, element_id, trace_ref}` (element = aparat
    #: glowny, slad = artefakt dowodowy kontekstu).
    dowod: dict[str, str | None] | None = None
    #: Zapas [%] = NAJMNIEJSZY z marginesow `margins_pct` (dodatni = w granicy —
    #: konwencja dostawcy wglebnego `protection_insight`); ``None`` bez marginesow.
    margines: float | None = field(init=False)
    podstawa: PodstawaNormatywna = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "margines",
            min(self.margins_pct.values()) if self.margins_pct else None,
        )
        object.__setattr__(self, "podstawa", PODSTAWA_KRZYWYCH_IT)

    def to_dict(self) -> dict[str, Any]:
        from analysis.protection_curves_it.serializer import view_to_dict

        return view_to_dict(self)

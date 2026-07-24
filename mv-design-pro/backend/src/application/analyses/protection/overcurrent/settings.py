from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json


@dataclass(frozen=True)
class OvercurrentSettingsV0:
    """Nastawy zabezpieczenia nadprądowego.

    V12K-189 (decyzja właściciela: „nastawa bez danych powinna być niedostępna"):
    każda nastawa jest OPCJONALNA. ``None`` znaczy „nie da się wyznaczyć z
    dostępnych danych" i jest jedyną dopuszczalną odpowiedzią przy ich braku —
    wcześniej brakujący prąd znamionowy dawał 100,0 A, a brakujący prąd zwarciowy
    mnożnik 5× nastawy rozruchowej. Obie liczby były oznaczone ostrzeżeniem, ale
    nie miały ŻADNEJ podstawy w danych projektu, a wyglądały jak wynik obliczeń.
    Powód niedostępności niesie ``readiness_codes`` (kody kanoniczne z akcją
    naprawczą), nie sama wartość.
    """

    curve: str
    i_pickup_51_a: float | None
    tms_51: float
    i_inst_50_a: float | None
    i_pickup_51n_a: float | None
    tms_51n: float
    i_inst_50n_a: float | None
    assumptions: tuple[str, ...]
    warnings: tuple[str, ...]
    computed_points: dict[str, Any]
    readiness_codes: tuple[str, ...] = ()

    @property
    def is_complete(self) -> bool:
        """Czy wszystkie cztery nastawy dały się wyznaczyć z danych."""
        return all(
            value is not None
            for value in (
                self.i_pickup_51_a,
                self.i_inst_50_a,
                self.i_pickup_51n_a,
                self.i_inst_50n_a,
            )
        )

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "curve": self.curve,
            "i_pickup_51_a": self.i_pickup_51_a,
            "tms_51": self.tms_51,
            "i_inst_50_a": self.i_inst_50_a,
            "i_pickup_51n_a": self.i_pickup_51n_a,
            "tms_51n": self.tms_51n,
            "i_inst_50n_a": self.i_inst_50n_a,
            "assumptions": self.assumptions,
            "warnings": self.warnings,
            "computed_points": self.computed_points,
            "readiness_codes": self.readiness_codes,
            "is_complete": self.is_complete,
        }
        return canonicalize_json(payload)

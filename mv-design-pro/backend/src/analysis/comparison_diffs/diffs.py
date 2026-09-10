"""Arytmetyka różnic + proweniencja biegu R1 — rdzeń modułu (patrz `__init__.py`).

KLASA, NIE INSTANCJA (CLAUDE.md). Trzy serwisy porównań (PF/zabezpieczenia/
ogólne) miały TRZY niezależne kopie tego samego wzorca: dopasowanie po kluczu +
delta "brakująca strona -> None" (FAB-E: element obecny tylko w jednym z
porównywanych biegów dostaje `None`, NIGDY fabrykowane zero — wyglądałoby jak
realny zanik napięcia/przepływu/prądu). Ten moduł jest jedynym miejscem tej
arytmetyki; kolejna analiza porównawcza reużywa go, nie kopiuje.

B1 (karta CV-3.3-B): porównanie bez `snapshot_hash`/`input_hash`/koperty OBU
biegów jest porównaniem bez dowodu CO było porównywane. `RunProvenance` niesie
te trzy rzeczy dla JEDNEGO biegu `CanonicalRun` — obie strony porównania noszą
osobną instancję.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, TypeVar

from domain.power_flow_comparison import procent_roznicy
from domain.results import ComplexDelta, NumericDelta

if TYPE_CHECKING:
    from enm.canonical_analysis import CanonicalRun

#: `dopasuj_klucze` woła `sorted(...)` na kluczach — wszystkie realne wywołania
#: (bus/branch/protection element_ref) są `str`, więc granica jest tu, nie na
#: `Hashable` (który nie gwarantuje porządku i nie przeszedłby przez `sorted`).
K = TypeVar("K", bound=str)


@dataclass(frozen=True)
class RunProvenance:
    """Tożsamość + proweniencja jednego biegu R1 wewnątrz wyniku porównania.

    B1: `snapshot_hash`/`input_hash`/`envelope` OBU biegów muszą być obecne w
    wyniku porównania — to jest ten kontener. `envelope` to
    `enm.envelope.RevisionEnvelope.to_dict()` (rewizja modelu, odcisk katalogu,
    scenariusz) albo `None` dla biegów sprzed CV-2 (uczciwy brak, nie fabrykacja).
    """

    run_id: str
    analysis_type: str
    status: str
    snapshot_hash: str
    input_hash: str
    finished_at: str | None
    envelope: dict[str, Any] | None

    @classmethod
    def from_canonical_run(cls, run: CanonicalRun) -> RunProvenance:
        return cls(
            run_id=str(run.id),
            analysis_type=run.analysis_type,
            status=run.status,
            snapshot_hash=run.snapshot_hash,
            input_hash=run.input_hash,
            finished_at=run.finished_at.isoformat() if run.finished_at else None,
            envelope=run.envelope,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "analysis_type": self.analysis_type,
            "status": self.status,
            "snapshot_hash": self.snapshot_hash,
            "input_hash": self.input_hash,
            "finished_at": self.finished_at,
            "envelope": self.envelope,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RunProvenance:
        return cls(
            run_id=str(data["run_id"]),
            analysis_type=str(data["analysis_type"]),
            status=str(data["status"]),
            snapshot_hash=str(data["snapshot_hash"]),
            input_hash=str(data["input_hash"]),
            finished_at=data.get("finished_at"),
            envelope=data.get("envelope"),
        )


def pole_lub_none(zrodlo: dict[str, Any], klucz: str) -> float | None:
    """Pole liczbowe wiersza porównania — `None`, gdy brak (nie fikcyjne 0.0)."""
    wartosc = zrodlo.get(klucz)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def delta_lub_none(a: float | None, b: float | None) -> float | None:
    """Delta (B - A) — `None`, gdy KTÓRAKOLWIEK strona nie ma wartości."""
    if a is None or b is None:
        return None
    return b - a


def procent_lub_none(a: float | None, b: float | None) -> float | None:
    """Jak `domain.power_flow_comparison.procent_roznicy`, ale `None` gdy
    KTÓRAKOLWIEK strona nie ma wartości (nie tylko gdy A == 0)."""
    if a is None or b is None:
        return None
    return procent_roznicy(a, b)


def _parse_complex(value: Any) -> complex:
    """Odczyt liczby zespolonej z `{"re": x, "im": y}`, liczby albo `complex`."""
    if isinstance(value, complex):
        return value
    if isinstance(value, int | float) and not isinstance(value, bool):
        return complex(value, 0.0)
    if isinstance(value, dict):
        return complex(float(value.get("re", 0.0)), float(value.get("im", 0.0)))
    return complex(0.0, 0.0)


def numeric_delta_lub_none(
    payload_a: dict[str, Any], payload_b: dict[str, Any], klucz: str
) -> NumericDelta | None:
    """`NumericDelta` dwóch pól payloadu — `None`, gdy klucz brakuje w
    KTÓRYMKOLWIEK payloadzie (nie tylko gdy brakuje w obu)."""
    wartosc_a = payload_a.get(klucz)
    wartosc_b = payload_b.get(klucz)
    if wartosc_a is None or wartosc_b is None:
        return None
    return NumericDelta.compute(float(wartosc_a), float(wartosc_b))


def complex_delta_lub_none(
    payload_a: dict[str, Any], payload_b: dict[str, Any], klucz: str
) -> ComplexDelta | None:
    """Jak `numeric_delta_lub_none`, dla pól zespolonych `{"re": x, "im": y}`."""
    surowa_a = payload_a.get(klucz)
    surowa_b = payload_b.get(klucz)
    if surowa_a is None or surowa_b is None:
        return None
    return ComplexDelta.compute(_parse_complex(surowa_a), _parse_complex(surowa_b))


def dopasuj_klucze(klucze_a: Iterable[K], klucze_b: Iterable[K]) -> list[K]:
    """Deterministyczne dopasowanie: suma kluczy A i B, posortowana.

    Klucz obecny tylko w jednym biegu TRAFIA na listę (wywołujący dostaje
    `None` po stronie brakującej przez `pole_lub_none`/`numeric_delta_lub_none`
    itd.) — dopasowanie nigdy nie ucina elementu, który zniknął albo pojawił
    się między biegami A i B.
    """
    return sorted(set(klucze_a) | set(klucze_b))

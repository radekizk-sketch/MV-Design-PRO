from __future__ import annotations

from datetime import UTC, datetime
from typing import overload


# Przeciążenia: `datetime` na wejściu daje `datetime` na wyjściu — bez nich każdy
# wołający z niepustą datą dostawał `datetime | None` i musiał zwężać wynik, który
# nigdy nie jest `None` (repozytoria persystencji, np. `canonical_run_repository`).
@overload
def ensure_utc(value: datetime) -> datetime: ...
@overload
def ensure_utc(value: None) -> None: ...
def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)

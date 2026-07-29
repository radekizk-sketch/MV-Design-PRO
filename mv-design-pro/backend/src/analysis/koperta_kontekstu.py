"""Jawny, typowany przepis koperty ``context`` między analizami (V12K-267 → domknięcie).

DLACZEGO TEN MODUŁ ISTNIEJE. Konteksty łańcucha dowodowo-raportowego
(``VoltageProfile``/``Normative``/``ProtectionInsight``/``ProtectionCurvesIT``/
``CoverageScore``/``Sensitivity``/``LFSensitivity``/``Recommendation`` +
``ReportContext`` raportu PDF) były kopiowane „po nazwie pola" przez
``getattr(ctx, "pole", None)`` w pięciu builderach i w raporcie PDF. Taka kopia
ma wadę konstrukcyjną nazwaną w rejestrze V12K-267: przemianowanie CZĘŚCI
łańcucha nie zapala żadnego błędu — ``getattr`` z wartością domyślną po cichu
podstawia ``None`` i identyfikator znika z raportów bez śladu.

Ten moduł zamienia kopię odporną-na-błędy na kopię GŁOŚNĄ:

- ``KopertaKontekstu`` to strukturalny kontrakt sześciu pól koperty; każdy
  kontekst łańcucha spełnia go przez samą budowę (zmierzono: wszystkie osiem
  klas ma komplet pól po V12K-269),
- ``pola_koperty`` czyta pola DOSTĘPEM BEZPOŚREDNIM, bez wartości domyślnych —
  kontekst pozbawiony pola (np. po częściowym przemianowaniu) podnosi
  ``AttributeError`` w miejscu kopii, a niezgodność z protokołem widzi też mypy
  u wywołującego. Cisza przestaje być możliwym trybem awarii.

Zakres świadomie wąski: wyłącznie przepis koperty. Budowa kontekstów z dowodów
(``ProofDocument.header``) zostaje w builderach, bo tam nazwy pól są inne
z natury (nagłówek dowodu, nie koperta analizy).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol


class KopertaKontekstu(Protocol):
    """Sześć pól koperty kontekstu, wspólnych dla całego łańcucha analiz."""

    @property
    def project_name(self) -> str | None: ...

    @property
    def case_name(self) -> str | None: ...

    @property
    def run_timestamp(self) -> datetime | None: ...

    @property
    def snapshot_id(self) -> str | None: ...

    @property
    def trace_id(self) -> str | None: ...

    @property
    def run_id(self) -> str | None: ...


def pola_koperty(ctx: KopertaKontekstu) -> dict[str, Any]:
    """Pola koperty do konstruktora kontekstu docelowego: ``Kontekst(**pola_koperty(ctx))``.

    Dostęp bezpośredni jest treścią tej funkcji — brak pola w kontekście
    źródłowym MA wybuchnąć tutaj, a nie stać się cichym ``None`` w raporcie.
    """
    return {
        "project_name": ctx.project_name,
        "case_name": ctx.case_name,
        "run_timestamp": ctx.run_timestamp,
        "snapshot_id": ctx.snapshot_id,
        "trace_id": ctx.trace_id,
        "run_id": ctx.run_id,
    }

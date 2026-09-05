"""Unieważnianie biegów LEGACY toru analiz (`analysis_runs`) — resztka po CV-2-W.

CO STĄD ZNIKŁO I DLACZEGO. Ta klasa kaskadowo przestawiała status wyników na
DWÓCH bytach: na biegach legacy (`analysis_runs.result_status`) i na przypadkach
obliczeniowych (`study_cases.result_status`). Część dotycząca PRZYPADKÓW została
usunięta na amen (CV-2-W): status wyników przypadku jest wyprowadzany z jego
biegów kanonicznych i koperty rewizji (`application/result_freshness.py`,
`application/study_case/status_wynikow.py`), więc nie ma stanu, który trzeba by
unieważniać — a dopóki był, każda ścieżka mutująca model, która zapomniała tu
zajrzeć (zmiana typu katalogowego, kreator), zostawiała przypadek oznaczony jako
aktualny przy modelu, który pojechał dalej.

DLACZEGO MODUŁ ZOSTAJE. Jedynym konsumentem jest legacy tor kreatora
(`application/network_wizard/service.py`), który pracuje na `analysis_runs` —
rejestrze kasowanym razem z tym torem w CV-4. Zakres jest tu ZAMKNIĘTY do biegów
legacy; że nie dotyka przypadków, pilnuje test
`tests/api/test_status_wynikow_przypadku.py::test_invalidator_legacy_nie_dotyka_przypadkow`
oraz `scripts/result_status_writer_guard.py`.
"""

from __future__ import annotations

from uuid import UUID

from infrastructure.persistence.unit_of_work import UnitOfWork


class ResultInvalidator:
    """Kaskada unieważnienia biegów LEGACY (`analysis_runs`) — legacy P2–P12,
    kasacja razem z torem kreatora w CV-4. NIE dotyka przypadków obliczeniowych."""

    def invalidate_project_results(self, uow: UnitOfWork, project_id: UUID) -> int:
        """Oznacz biegi legacy projektu jako OUTDATED. Zwraca liczbę biegów."""
        if uow.analysis_runs is None:
            return 0
        return uow.analysis_runs.mark_results_outdated(project_id, commit=False)

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from types import TracebackType
from typing import Literal

from infrastructure.persistence.repositories.analysis_run_index_repository import (
    AnalysisRunIndexRepository,
)
from infrastructure.persistence.repositories.analysis_run_repository import AnalysisRunRepository
from infrastructure.persistence.repositories.case_repository import CaseRepository
from infrastructure.persistence.repositories.project_repository import ProjectRepository
from infrastructure.persistence.repositories.protection_catalog_repository import (
    ProtectionCatalogRepository,
)
from infrastructure.persistence.repositories.station_audit2_config_repository import (
    StationAudit2ConfigRepository,
)
from sqlalchemy.orm import Session, sessionmaker


class UnitOfWork(AbstractContextManager["UnitOfWork"]):
    """
    Unit of Work pattern for transactional operations.

    W1 (mapa domknięcia §9, 2026-09-09): repozytoria legacy modelu sieci
    (`network`, `snapshots`, `wizard`, `sld`, `design_*`) skasowane razem z tabelami
    `network_*`, katalogiem typów w bazie, SLD ORM i `design_synth` — model sieci
    projektu żyje WYŁĄCZNIE w magazynie ENM (`enm/store.py`, klucz projektu).
    Z dawnego repozytorium kreatora została biblioteka zabezpieczeń
    (`protection_catalog`, tabele `protection_*`), bo ma żywych konsumentów.

    CV-3.3-B: `results` (R3 `study_results`) i `study_runs` (R3) usunięte — zero
    konsumentów po przepięciu porównań i biegów na R1 (`enm.canonical_analysis`).
    `analysis_runs`/`analysis_runs_index` ZOSTAJĄ: pierwsza żyje dla
    `ResultInvalidator`, druga jest NIEZALEŻNĄ tabelą koordynacji zabezpieczeń
    (`application/analyses/protection/{catalog,overcurrent}/pipeline.py`).
    """

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self.session: Session | None = None
        self.projects: ProjectRepository | None = None
        self.cases: CaseRepository | None = None
        self.analysis_runs: AnalysisRunRepository | None = None
        self.analysis_runs_index: AnalysisRunIndexRepository | None = None
        self.protection_catalog: ProtectionCatalogRepository | None = None
        self.audit2_station_configs: StationAudit2ConfigRepository | None = None

    def __enter__(self) -> UnitOfWork:
        self.session = self._session_factory()
        self.projects = ProjectRepository(self.session)
        self.cases = CaseRepository(self.session)
        self.analysis_runs = AnalysisRunRepository(self.session)
        self.analysis_runs_index = AnalysisRunIndexRepository(self.session)
        self.protection_catalog = ProtectionCatalogRepository(self.session)
        self.audit2_station_configs = StationAudit2ConfigRepository(self.session)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> Literal[False]:
        if self.session is None:
            return False
        if exc_type is None:
            self.session.commit()
        else:
            self.session.rollback()
        self.session.close()
        return False

    def commit(self) -> None:
        """Commit the current transaction."""
        if self.session is not None:
            self.session.commit()

    def rollback(self) -> None:
        """Rollback the current transaction."""
        if self.session is not None:
            self.session.rollback()


def build_uow_factory(
    session_factory: sessionmaker[Session],
) -> Callable[[], UnitOfWork]:
    return lambda: UnitOfWork(session_factory)

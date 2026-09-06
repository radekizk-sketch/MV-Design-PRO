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
from infrastructure.persistence.repositories.design_evidence_repository import (
    DesignEvidenceRepository,
)
from infrastructure.persistence.repositories.design_proposal_repository import (
    DesignProposalRepository,
)
from infrastructure.persistence.repositories.design_spec_repository import DesignSpecRepository
from infrastructure.persistence.repositories.network_repository import NetworkRepository
from infrastructure.persistence.repositories.network_wizard_repository import (
    NetworkWizardRepository,
)
from infrastructure.persistence.repositories.project_repository import ProjectRepository
from infrastructure.persistence.repositories.sld_repository import SldRepository
from infrastructure.persistence.repositories.snapshot_repository import SnapshotRepository
from infrastructure.persistence.repositories.station_audit2_config_repository import (
    StationAudit2ConfigRepository,
)
from sqlalchemy.orm import Session, sessionmaker


class UnitOfWork(AbstractContextManager["UnitOfWork"]):
    """
    Unit of Work pattern for transactional operations.

    CV-3.3-B: `results` (R3 `study_results`, `ResultRepository`) i `study_runs`
    (R3 `study_runs`, `StudyRunRepository`, P10a) usunięte — zero konsumentów
    po przepięciu porównań PF/zabezpieczeń/ogólnych i biegów zabezpieczeń na R1
    (`enm.canonical_analysis`). `analysis_runs`/`analysis_runs_index` ZOSTAJĄ:
    pierwsza żyje dla `ResultInvalidator` (legacy `network_wizard`, kasacja
    dopiero w CV-4 razem z całym torem legacy ORM), druga jest NIEZALEŻNĄ
    tabelą koordynacji zabezpieczeń (`application/analyses/protection/
    {catalog,overcurrent}/pipeline.py`), niezwiązaną z R2/R3.
    """

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self.session: Session | None = None
        self.projects: ProjectRepository | None = None
        self.network: NetworkRepository | None = None
        self.cases: CaseRepository | None = None
        self.wizard: NetworkWizardRepository | None = None
        self.sld: SldRepository | None = None
        self.analysis_runs: AnalysisRunRepository | None = None
        self.analysis_runs_index: AnalysisRunIndexRepository | None = None
        self.snapshots: SnapshotRepository | None = None
        self.design_specs: DesignSpecRepository | None = None
        self.design_proposals: DesignProposalRepository | None = None
        self.design_evidence: DesignEvidenceRepository | None = None
        self.audit2_station_configs: StationAudit2ConfigRepository | None = None

    def __enter__(self) -> UnitOfWork:
        self.session = self._session_factory()
        self.projects = ProjectRepository(self.session)
        self.network = NetworkRepository(self.session)
        self.cases = CaseRepository(self.session)
        self.wizard = NetworkWizardRepository(self.session)
        self.sld = SldRepository(self.session)
        self.analysis_runs = AnalysisRunRepository(self.session)
        self.analysis_runs_index = AnalysisRunIndexRepository(self.session)
        self.snapshots = SnapshotRepository(self.session)
        self.design_specs = DesignSpecRepository(self.session)
        self.design_proposals = DesignProposalRepository(self.session)
        self.design_evidence = DesignEvidenceRepository(self.session)
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

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from types import TracebackType
from typing import Literal

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
    `analysis_runs`/`analysis_runs_index` ZOSTAJĄ jako DANE ZASTANE, obie BEZ
    pisarza produkcyjnego. Pierwsza żyła do karty KASACJA-UNIEWAZNIACZA
    (2026-09-17) dla unieważniacza wyników projektu
    (`application/analysis_run/result_invalidator.py`) — ten zszedł razem z resztą
    martwego klastra (moduł, `AnalysisRunRepository.mark_results_outdated`,
    `get`, `list_by_project`, `get_by_deterministic_key`; bramka wskrzeszenia:
    `scripts/legacy_public_path_guard.py::check_uniewazniacz_resurrection`).
    Gałąź `analysis_runs` ZOSTAJE, bo tabela ma żywego konsumenta produkcyjnego
    (`ProjectRepository.has_dependencies` liczy w niej wiersze projektu), a
    wiersze zastane muszą dać się zapisać w teście, który dowodzi, że kanoniczne
    routery ich NIE pokazują (`tests/test_production_canonical_only_api.py`).
    Druga jest NIEZALEŻNĄ tabelą — karta W3-C1 (2026-09) skasowała jej jedyne
    dwa produkcyjne miejsca zapisu
    (`application/analyses/protection/overcurrent/**`, `catalog/pipeline.py::
    run_device_mapping_v0`; dobór aparatu jest odtąd CZYSTĄ funkcją,
    `catalog/pipeline.py::dopasuj_do_aparatu`, bez tego indeksu), więc tabela
    zostaje jako READ-ONLY odbiorca historycznych wpisów (odtwarzalność
    starych archiwów), bez nowego pisarza. Czytelnikiem tej tabeli jest WYŁĄCZNIE eksport
    archiwum projektu (`application/project_archive/service.py`, ORM wprost); repozytorium
    domenowe `AnalysisRunIndexRepository` i rekord `AnalysisRunIndexEntry` nie miały ani
    jednego wołającego (atrybut `analysis_runs_index` jednostki pracy nieużywany) — skasowane
    kartą AB-1a Pakiet E2 regułą „0 wołań = kasacja” (plan AB §8 F10).
    """

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self.session: Session | None = None
        self.projects: ProjectRepository | None = None
        self.cases: CaseRepository | None = None
        self.analysis_runs: AnalysisRunRepository | None = None
        self.protection_catalog: ProtectionCatalogRepository | None = None
        self.audit2_station_configs: StationAudit2ConfigRepository | None = None

    def __enter__(self) -> UnitOfWork:
        self.session = self._session_factory()
        self.projects = ProjectRepository(self.session)
        self.cases = CaseRepository(self.session)
        self.analysis_runs = AnalysisRunRepository(self.session)
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

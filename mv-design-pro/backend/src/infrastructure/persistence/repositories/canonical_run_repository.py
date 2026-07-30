from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any
from uuid import UUID

from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
    session_scope,
)
from infrastructure.persistence.models import CanonicalRunBranchFlowORM, CanonicalRunORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

if TYPE_CHECKING:
    from enm.canonical_analysis import CanonicalRun

#: Klucz surowych wkładów gałęziowych FROZEN solvera w wierszu wyniku zwarciowego.
KLUCZ_ROZPLYWU = "branch_contributions"
#: Znacznik: rozpływ dla tego punktu zwarcia ISTNIEJE i leży w osobnej tabeli.
#: Odróżnia zapis rozdzielony od starszego wyniku policzonego BEZ wkładów.
KLUCZ_DOSTEPNOSCI_ROZPLYWU = "branch_contributions_available"


def _rozdziel_rozplyw(
    raw_result: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, list[Any]]]:
    """Artefakt biegu → (artefakt BEZ rozpływu, rozpływ per punkt zwarcia).

    Rozpływ gałęziowy to iloczyn źródło×gałąź liczony dla KAŻDEGO punktu zwarcia
    (zmierzone na sieci 50 stacji: 104 punkty × 11 506 wpisów), a konsument
    potrzebuje rozpływu jednego wybranego punktu. Przy zapisie wycinamy go z
    artefaktu i kierujemy do osobnej tabeli — wpisy są przenoszone BAJTOWO,
    bez żadnej projekcji.

    Wiersz bez identyfikatora punktu zwarcia zostaje z rozpływem inline: nie ma
    czym zaadresować wiersza tabeli, a ciche zgubienie danych jest zakazane.
    Wartość ``None`` (solver policzony bez wkładów) zostaje jak była — to
    uczciwy brak, nie rozpływ do przeniesienia.
    """
    if not isinstance(raw_result, dict):
        return raw_result, {}
    results = raw_result.get("results")
    if not isinstance(results, list):
        return raw_result, {}

    rozplyw: dict[str, list[Any]] = {}
    wiersze: list[Any] = []
    wyciete = False
    for item in results:
        if not isinstance(item, dict) or item.get(KLUCZ_ROZPLYWU) is None:
            wiersze.append(item)
            continue
        fault_node_id = str(item.get("fault_node_id") or "")
        if not fault_node_id:
            wiersze.append(item)
            continue
        rozplyw[fault_node_id] = item[KLUCZ_ROZPLYWU]
        wiersze.append(
            {
                **{key: value for key, value in item.items() if key != KLUCZ_ROZPLYWU},
                KLUCZ_DOSTEPNOSCI_ROZPLYWU: True,
            }
        )
        wyciete = True

    if not wyciete:
        return raw_result, {}
    return {**raw_result, "results": wiersze}, rozplyw


def _niesie_znacznik_rozplywu(raw_result: dict[str, Any] | None) -> bool:
    """Czy artefakt jest zapisem rozdzielonym (rozpływ trzyma osobna tabela)."""
    if not isinstance(raw_result, dict):
        return False
    results = raw_result.get("results")
    if not isinstance(results, list):
        return False
    return any(isinstance(item, dict) and item.get(KLUCZ_DOSTEPNOSCI_ROZPLYWU) for item in results)


_DEFAULT_DATABASE_URL = "sqlite+pysqlite:///./mv_design_pro.db"
_cached_database_url: str | None = None
_cached_engine: Engine | None = None
_cached_session_factory: sessionmaker[Session] | None = None


def _resolve_database_url() -> str:
    return os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)


def get_canonical_run_session_factory() -> sessionmaker[Session]:
    global _cached_database_url, _cached_engine, _cached_session_factory

    database_url = _resolve_database_url()
    if _cached_session_factory is not None and _cached_database_url == database_url:
        return _cached_session_factory

    if _cached_engine is not None:
        _cached_engine.dispose()

    engine = create_engine_from_url(database_url)
    init_db(engine)
    _cached_database_url = database_url
    _cached_engine = engine
    _cached_session_factory = create_session_factory(engine)
    return _cached_session_factory


@contextmanager
def canonical_run_repository_scope() -> Iterator[CanonicalRunRepository]:
    session_factory = get_canonical_run_session_factory()
    with session_scope(session_factory) as session:
        yield CanonicalRunRepository(session)


class CanonicalRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, run: CanonicalRun) -> None:
        lekki_artefakt, rozplyw = _rozdziel_rozplyw(run.raw_result)
        self._session.add(self._to_orm(run, lekki_artefakt))
        self._zapisz_rozplyw(run, rozplyw)

    def save(self, run: CanonicalRun) -> None:
        lekki_artefakt, rozplyw = _rozdziel_rozplyw(run.raw_result)
        row = self._session.get(CanonicalRunORM, run.id)
        if row is None:
            self._session.add(self._to_orm(run, lekki_artefakt))
            self._zapisz_rozplyw(run, rozplyw)
            return

        row.case_id = run.case_id
        row.project_id = run.project_id
        row.analysis_type = run.analysis_type
        row.status = run.status
        row.result_status = run.result_status
        row.created_at = ensure_utc(run.created_at)
        row.started_at = ensure_utc(run.started_at)
        row.finished_at = ensure_utc(run.finished_at)
        row.snapshot_hash = run.snapshot_hash
        row.input_hash = run.input_hash
        row.snapshot_json = run.snapshot
        row.validation_json = run.validation
        row.readiness_json = run.readiness
        row.options_json = run.options
        row.error_message = run.error_message
        row.raw_result_json = lekki_artefakt
        row.white_box_trace_json = run.white_box_trace
        row.power_flow_trace_json = run.power_flow_trace
        self._zapisz_rozplyw(run, rozplyw)

    def _zapisz_rozplyw(self, run: CanonicalRun, rozplyw: dict[str, list[Any]]) -> None:
        """Zapisz rozpływ biegu W TEJ SAMEJ transakcji co bieg (bez stanów pośrednich).

        Tabela odzwierciedla to, co mówi ZAPISYWANY artefakt:
        - niesie rozpływ inline → tabela dostaje dokładnie ten rozpływ (pełna wymiana),
        - niesie sam znacznik dostępności (artefakt odczytany z bazy i zapisany
          ponownie, np. przy zmianie statusu) → tabela BEZ ZMIAN, bo to ona jest
          magazynem rozpływu; kasowanie byłoby cichą utratą danych,
        - nie niesie ani rozpływu, ani znacznika (bieg bez wyniku, przeliczany
          od nowa, wynik bez wkładów) → tabela czyszczona, żeby nie została
          osierocona treść po poprzednim wykonaniu tego samego biegu.
        """
        if not rozplyw and _niesie_znacznik_rozplywu(run.raw_result):
            return
        self._session.execute(
            delete(CanonicalRunBranchFlowORM).where(CanonicalRunBranchFlowORM.run_id == run.id)
        )
        for fault_node_id, wpisy in sorted(rozplyw.items()):
            self._session.add(
                CanonicalRunBranchFlowORM(
                    run_id=run.id,
                    fault_node_id=fault_node_id,
                    contributions_json=wpisy,
                )
            )

    def get_branch_flows(self, run_id: UUID, fault_node_id: str) -> list[Any] | None:
        """Rozpływ JEDNEGO punktu zwarcia z osobnej tabeli (brak wpisu → None).

        Jedyne wejście do magazynu rozpływu; warstwa domenowa woła je przez
        `enm.canonical_analysis.pobierz_rozplyw_biegu` (jedna prawda dostępu).
        """
        stmt = select(CanonicalRunBranchFlowORM.contributions_json).where(
            CanonicalRunBranchFlowORM.run_id == run_id,
            CanonicalRunBranchFlowORM.fault_node_id == fault_node_id,
        )
        return self._session.execute(stmt).scalar_one_or_none()

    def exists(self, run_id: UUID) -> bool:
        stmt = select(CanonicalRunORM.id).where(CanonicalRunORM.id == run_id)
        return self._session.execute(stmt).scalar_one_or_none() is not None

    def get(self, run_id: UUID) -> CanonicalRun | None:
        row = self._session.get(CanonicalRunORM, run_id)
        return self._to_domain(row) if row is not None else None

    def list_by_case(self, case_id: str) -> list[CanonicalRun]:
        stmt = (
            select(CanonicalRunORM)
            .where(CanonicalRunORM.case_id == case_id)
            .order_by(CanonicalRunORM.created_at.desc(), CanonicalRunORM.id.desc())
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def list_by_project(
        self,
        project_id: str,
        *,
        analysis_type: str | None = None,
    ) -> list[CanonicalRun]:
        stmt = (
            select(CanonicalRunORM)
            .where(CanonicalRunORM.project_id == project_id)
            .order_by(CanonicalRunORM.created_at.desc(), CanonicalRunORM.id.desc())
        )
        if analysis_type is not None:
            stmt = stmt.where(CanonicalRunORM.analysis_type == analysis_type)
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def clear_all(self) -> None:
        # Rozpływ najpierw: w Postgresie klucz obcy z ON DELETE CASCADE zrobiłby to
        # sam, ale SQLite (tor deweloperski/e2e) nie egzekwuje kluczy obcych bez
        # PRAGMA — bez tego zostawałyby wiersze osierocone.
        self._session.execute(delete(CanonicalRunBranchFlowORM))
        self._session.execute(delete(CanonicalRunORM))

    def _to_domain(self, row: CanonicalRunORM) -> CanonicalRun:
        from enm.canonical_analysis import CanonicalRun

        return CanonicalRun(
            id=row.id,
            case_id=row.case_id,
            project_id=row.project_id,
            analysis_type=row.analysis_type,
            status=row.status,
            created_at=ensure_utc(row.created_at),
            snapshot_hash=row.snapshot_hash,
            input_hash=row.input_hash,
            snapshot=row.snapshot_json or {},
            validation=row.validation_json or {},
            readiness=row.readiness_json or {},
            options=row.options_json or {},
            started_at=ensure_utc(row.started_at),
            finished_at=ensure_utc(row.finished_at),
            error_message=row.error_message,
            result_status=row.result_status,
            raw_result=row.raw_result_json,
            white_box_trace=list(row.white_box_trace_json or []),
            power_flow_trace=row.power_flow_trace_json,
        )

    def _to_orm(self, run: CanonicalRun, lekki_artefakt: dict[str, Any] | None) -> CanonicalRunORM:
        return CanonicalRunORM(
            id=run.id,
            case_id=run.case_id,
            project_id=run.project_id,
            analysis_type=run.analysis_type,
            status=run.status,
            result_status=run.result_status,
            created_at=ensure_utc(run.created_at),
            started_at=ensure_utc(run.started_at),
            finished_at=ensure_utc(run.finished_at),
            snapshot_hash=run.snapshot_hash,
            input_hash=run.input_hash,
            snapshot_json=run.snapshot,
            validation_json=run.validation,
            readiness_json=run.readiness,
            options_json=run.options,
            error_message=run.error_message,
            raw_result_json=lekki_artefakt,
            white_box_trace_json=run.white_box_trace,
            power_flow_trace_json=run.power_flow_trace,
        )

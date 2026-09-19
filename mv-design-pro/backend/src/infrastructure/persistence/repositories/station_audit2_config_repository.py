"""Repozytorium konfiguracji audytu 2 stacji — jeden wiersz na ``(project_id, station_id)``.

Karta CV-4.2b (2026-09-05). Do tej karty tabela ``station_audit2_configs`` miała
CZTERY niezależne zapytania ORM poza warstwą persystencji (``api/audit2_station_config.py``
— pięć zapytań, ``api/solver_input.py``, ``api/enm.py::_bay_device_withstand``,
``enm/assembler.py``), a assembler dodatkowo budował WŁASNY silnik/sesję z
``DATABASE_URL`` — inny niż ``app.state.uow_factory`` żądania, więc konfiguracja
zapisana przez API potrafiła być dla biegu niewidoczna (ta sama klasa defektu, którą
CV-3.3-B naprawiła dla ``_execute_protection``). Odczyt i zapis tej tabeli mają od
teraz JEDNO miejsce: ``UnitOfWork.audit2_station_configs``.

Repozytorium zwraca wiersze ORM (``StationAudit2ConfigORM``) — konfiguracja audytu 2
nie ma typu domenowego (jej semantykę rozwija ``solver_input.audit2_der_payload``), a
serializację do odpowiedzi HTTP trzyma router.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from infrastructure.persistence.models import StationAudit2ConfigORM
from sqlalchemy import select
from sqlalchemy.orm import Session


class StationAudit2ConfigRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, project_id: UUID, station_id: str) -> StationAudit2ConfigORM | None:
        stmt = select(StationAudit2ConfigORM).where(
            StationAudit2ConfigORM.project_id == project_id,
            StationAudit2ConfigORM.station_id == station_id,
        )
        return self._session.execute(stmt).scalar_one_or_none()

    def list_for_project(self, project_id: UUID) -> list[StationAudit2ConfigORM]:
        stmt = (
            select(StationAudit2ConfigORM)
            .where(StationAudit2ConfigORM.project_id == project_id)
            .order_by(StationAudit2ConfigORM.station_id)
        )
        return list(self._session.execute(stmt).scalars().all())

    def upsert(
        self,
        project_id: UUID,
        station_id: str,
        *,
        mv_neutral_grounding_ref: str | None,
        tap_changer_refs: list[Any],
        der_specs: list[dict[str, Any]],
        transformer_tap_changers: dict[str, Any],
        bay_hv_fuses: dict[str, Any],
        bay_vts: dict[str, Any],
        bay_device_withstand: dict[str, Any],
    ) -> StationAudit2ConfigORM:
        """Wstaw albo nadpisz wiersz ``(project_id, station_id)`` — zwraca wiersz po ``flush``.

        Identyfikator istniejącego wiersza jest ZACHOWANY (klient porównuje ``id``
        po ponownym zapisie — pin w ``tests/api/test_audit2_station_config_api.py``).
        """
        row = self.get(project_id, station_id)
        if row is None:
            row = StationAudit2ConfigORM(
                id=uuid4(),
                project_id=project_id,
                station_id=station_id,
                mv_neutral_grounding_ref=mv_neutral_grounding_ref,
                tap_changer_refs=list(tap_changer_refs),
                der_specs=list(der_specs),
                transformer_tap_changers=dict(transformer_tap_changers),
                bay_hv_fuses=dict(bay_hv_fuses),
                bay_vts=dict(bay_vts),
                bay_device_withstand=dict(bay_device_withstand),
            )
            self._session.add(row)
        else:
            row.mv_neutral_grounding_ref = mv_neutral_grounding_ref
            row.tap_changer_refs = list(tap_changer_refs)
            row.der_specs = list(der_specs)
            row.transformer_tap_changers = dict(transformer_tap_changers)
            row.bay_hv_fuses = dict(bay_hv_fuses)
            row.bay_vts = dict(bay_vts)
            row.bay_device_withstand = dict(bay_device_withstand)
        self._session.flush()
        return row

    def delete(self, project_id: UUID, station_id: str) -> bool:
        """Usuń wiersz; ``False``, gdy nie istniał (router odpowiada 404)."""
        row = self.get(project_id, station_id)
        if row is None:
            return False
        self._session.delete(row)
        self._session.flush()
        return True

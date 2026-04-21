from __future__ import annotations

from datetime import UTC, datetime

from infrastructure.persistence.models import NetworkSnapshotORM
from network_model.core.snapshot import NetworkSnapshot, SnapshotMeta
from sqlalchemy import desc, select
from sqlalchemy.orm import Session


class SnapshotRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add_snapshot(self, snapshot: NetworkSnapshot, *, commit: bool = True) -> None:
        """Add a snapshot with P10a fingerprint support."""
        payload = snapshot.to_dict()
        meta = snapshot.meta
        created_at = _parse_created_at(meta.created_at)
        self._session.add(
            NetworkSnapshotORM(
                snapshot_id=meta.snapshot_id,
                parent_snapshot_id=meta.parent_snapshot_id,
                created_at=created_at,
                schema_version=meta.schema_version,
                network_model_id=meta.network_model_id,
                fingerprint=meta.fingerprint,  # P10a
                snapshot_json=payload,
            )
        )
        if commit:
            self._session.commit()

    def get_snapshot(self, snapshot_id: str) -> NetworkSnapshot | None:
        stmt = select(NetworkSnapshotORM).where(NetworkSnapshotORM.snapshot_id == snapshot_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        payload = _hydrate_payload(row)
        return NetworkSnapshot.from_dict(payload)

    def get_latest_snapshot(self) -> NetworkSnapshot | None:
        stmt = select(NetworkSnapshotORM).order_by(desc(NetworkSnapshotORM.created_at)).limit(1)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        payload = _hydrate_payload(row)
        return NetworkSnapshot.from_dict(payload)

    def get_latest_snapshot_for_model(self, network_model_id: str) -> NetworkSnapshot | None:
        stmt = (
            select(NetworkSnapshotORM)
            .where(NetworkSnapshotORM.network_model_id == network_model_id)
            .order_by(desc(NetworkSnapshotORM.created_at))
            .limit(1)
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        payload = _hydrate_payload(row)
        return NetworkSnapshot.from_dict(payload)

    def list_lineage(self, snapshot_id: str) -> list[SnapshotMeta]:
        lineage: list[SnapshotMeta] = []
        current_id: str | None = snapshot_id
        while current_id is not None:
            stmt = select(NetworkSnapshotORM).where(NetworkSnapshotORM.snapshot_id == current_id)
            row = self._session.execute(stmt).scalar_one_or_none()
            if row is None:
                break
            lineage.append(_meta_from_row(row))
            current_id = row.parent_snapshot_id
        return list(reversed(lineage))

    # P10a: Fingerprint-based operations
    def get_fingerprint(self, snapshot_id: str) -> str | None:
        """P10a: Get the fingerprint for a snapshot."""
        stmt = select(NetworkSnapshotORM.fingerprint).where(
            NetworkSnapshotORM.snapshot_id == snapshot_id
        )
        return self._session.execute(stmt).scalar_one_or_none()

    def find_by_fingerprint(self, fingerprint: str) -> NetworkSnapshot | None:
        """P10a: Find a snapshot by its fingerprint (for deduplication)."""
        stmt = (
            select(NetworkSnapshotORM).where(NetworkSnapshotORM.fingerprint == fingerprint).limit(1)
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        payload = _hydrate_payload(row)
        return NetworkSnapshot.from_dict(payload)


def _parse_created_at(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        parsed = datetime.now(UTC)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _meta_from_row(row: NetworkSnapshotORM) -> SnapshotMeta:
    """P10a: Include fingerprint in metadata."""
    return SnapshotMeta(
        snapshot_id=row.snapshot_id,
        parent_snapshot_id=row.parent_snapshot_id,
        created_at=row.created_at.isoformat(),
        schema_version=row.schema_version,
        network_model_id=row.network_model_id,
        fingerprint=row.fingerprint,  # P10a
    )


def _hydrate_payload(row: NetworkSnapshotORM) -> dict:
    """P10a: Hydrate payload with fingerprint support."""
    payload = row.snapshot_json
    if not isinstance(payload, dict):
        payload = {}
    payload = dict(payload)
    meta = payload.get("meta")
    if not isinstance(meta, dict):
        payload["meta"] = _meta_from_row(row).to_dict()
        return payload
    meta = dict(meta)
    meta.setdefault("snapshot_id", row.snapshot_id)
    meta.setdefault("parent_snapshot_id", row.parent_snapshot_id)
    meta.setdefault("created_at", row.created_at.isoformat())
    meta.setdefault("schema_version", row.schema_version)
    meta.setdefault("network_model_id", row.network_model_id)
    meta.setdefault("fingerprint", row.fingerprint)  # P10a
    payload["meta"] = meta
    return payload

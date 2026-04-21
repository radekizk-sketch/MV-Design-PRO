from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4, uuid5

from infrastructure.persistence.models import (
    SldAnnotationORM,
    SldBranchSymbolORM,
    SldDiagramORM,
    SldNodeSymbolORM,
)
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


class SldRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def save(
        self,
        *,
        project_id: UUID,
        name: str,
        payload: dict,
        sld_id: UUID | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
        dirty_flag: bool | None = None,
        commit: bool = True,
    ) -> UUID:
        sld_id = sld_id or uuid4()
        created_at = created_at or datetime.now(UTC)
        updated_at = updated_at or created_at
        normalized = self._normalize_payload(
            payload, name=name, dirty_flag=dirty_flag, diagram_id=sld_id
        )
        self._session.add(
            SldDiagramORM(
                id=sld_id,
                project_id=project_id,
                name=name,
                sld_jsonb=normalized,
                dirty_flag=normalized.get("dirty_flag", False),
                created_at=created_at,
                updated_at=updated_at,
            )
        )
        self._sync_symbols(sld_id, normalized)
        if commit:
            self._session.commit()
        return sld_id

    def get(self, diagram_id: UUID) -> dict | None:
        stmt = select(SldDiagramORM).where(SldDiagramORM.id == diagram_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {
            "id": row.id,
            "project_id": row.project_id,
            "name": row.name,
            "payload": row.sld_jsonb,
            "dirty_flag": row.dirty_flag,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    def list_by_project(self, project_id: UUID) -> list[dict]:
        stmt = (
            select(SldDiagramORM)
            .where(SldDiagramORM.project_id == project_id)
            .order_by(SldDiagramORM.created_at, SldDiagramORM.id)
        )
        rows = self._session.execute(stmt).scalars().all()
        return [
            {
                "id": row.id,
                "project_id": row.project_id,
                "name": row.name,
                "payload": row.sld_jsonb,
                "dirty_flag": row.dirty_flag,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            for row in rows
        ]

    def update_payload(self, diagram_id: UUID, payload: dict, *, commit: bool = True) -> None:
        stmt = select(SldDiagramORM).where(SldDiagramORM.id == diagram_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return
        normalized = self._normalize_payload(
            payload,
            name=row.name,
            dirty_flag=payload.get("dirty_flag", row.dirty_flag),
            diagram_id=row.id,
        )
        row.sld_jsonb = normalized
        row.dirty_flag = normalized.get("dirty_flag", row.dirty_flag)
        row.updated_at = datetime.now(UTC)
        self._sync_symbols(diagram_id, normalized)
        if commit:
            self._session.commit()

    def mark_dirty_by_project(self, project_id: UUID, *, commit: bool = True) -> int:
        stmt = select(SldDiagramORM).where(SldDiagramORM.project_id == project_id)
        rows = self._session.execute(stmt).scalars().all()
        for row in rows:
            payload = dict(row.sld_jsonb or {})
            payload["dirty_flag"] = True
            row.sld_jsonb = payload
            row.dirty_flag = True
            row.updated_at = datetime.now(UTC)
        if commit:
            self._session.commit()
        return len(rows)

    def _normalize_payload(
        self,
        payload: dict,
        *,
        name: str,
        dirty_flag: bool | None = None,
        diagram_id: UUID,
    ) -> dict:
        normalized = dict(payload or {})
        normalized.setdefault("version", 1)
        normalized.setdefault("name", name)
        normalized["nodes"] = self._normalize_nodes(normalized.get("nodes", []), diagram_id)
        normalized["branches"] = self._normalize_branches(
            normalized.get("branches", []), diagram_id
        )
        normalized.setdefault("annotations", [])
        if dirty_flag is not None:
            normalized["dirty_flag"] = bool(dirty_flag)
        else:
            normalized.setdefault("dirty_flag", False)
        return normalized

    def _normalize_nodes(self, nodes: list[dict], diagram_id: UUID) -> list[dict]:
        normalized: list[dict] = []
        for node in nodes:
            node_id = UUID(str(node["node_id"]))
            normalized_node = dict(node)
            normalized_node["id"] = str(uuid5(diagram_id, f"node:{node_id}"))
            normalized.append(normalized_node)
        return normalized

    def _normalize_branches(self, branches: list[dict], diagram_id: UUID) -> list[dict]:
        normalized: list[dict] = []
        for branch in branches:
            branch_id = UUID(str(branch["branch_id"]))
            normalized_branch = dict(branch)
            normalized_branch["id"] = str(uuid5(diagram_id, f"branch:{branch_id}"))
            normalized.append(normalized_branch)
        return normalized

    def _sync_symbols(self, diagram_id: UUID, payload: dict) -> None:
        self._session.execute(
            delete(SldNodeSymbolORM).where(SldNodeSymbolORM.diagram_id == diagram_id)
        )
        self._session.execute(
            delete(SldBranchSymbolORM).where(SldBranchSymbolORM.diagram_id == diagram_id)
        )
        self._session.execute(
            delete(SldAnnotationORM).where(SldAnnotationORM.diagram_id == diagram_id)
        )
        for node in payload.get("nodes", []):
            self._session.add(
                SldNodeSymbolORM(
                    id=UUID(node["id"]) if isinstance(node.get("id"), str) else node["id"],
                    diagram_id=diagram_id,
                    node_id=(
                        UUID(node["node_id"])
                        if isinstance(node.get("node_id"), str)
                        else node["node_id"]
                    ),
                    x=float(node.get("x", 0.0)),
                    y=float(node.get("y", 0.0)),
                    label=node.get("label"),
                    # NOTE: is_connection_node is deprecated and always False.
                    # BoundaryNode – węzeł przyłączenia is interpretation, not stored data.
                    is_connection_node=False,
                )
            )
        for branch in payload.get("branches", []):
            self._session.add(
                SldBranchSymbolORM(
                    id=UUID(branch["id"]) if isinstance(branch.get("id"), str) else branch["id"],
                    diagram_id=diagram_id,
                    branch_id=(
                        UUID(branch["branch_id"])
                        if isinstance(branch.get("branch_id"), str)
                        else branch["branch_id"]
                    ),
                    from_node_id=(
                        UUID(branch["from_node_id"])
                        if isinstance(branch.get("from_node_id"), str)
                        else branch["from_node_id"]
                    ),
                    to_node_id=(
                        UUID(branch["to_node_id"])
                        if isinstance(branch.get("to_node_id"), str)
                        else branch["to_node_id"]
                    ),
                    points_jsonb=list(branch.get("points") or []),
                )
            )
        for annotation in payload.get("annotations", []):
            self._session.add(
                SldAnnotationORM(
                    id=(
                        UUID(annotation["id"])
                        if isinstance(annotation.get("id"), str)
                        else annotation["id"]
                    ),
                    diagram_id=diagram_id,
                    text=str(annotation.get("text", "")),
                    x=float(annotation.get("x", 0.0)),
                    y=float(annotation.get("y", 0.0)),
                )
            )

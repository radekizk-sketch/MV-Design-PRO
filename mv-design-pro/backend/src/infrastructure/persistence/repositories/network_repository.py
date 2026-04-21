from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from infrastructure.persistence.models import NetworkBranchORM, NetworkNodeORM
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


class NetworkRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def replace_nodes(
        self, project_id: UUID, nodes: Iterable[dict], *, commit: bool = True
    ) -> None:
        self._session.execute(delete(NetworkNodeORM).where(NetworkNodeORM.project_id == project_id))
        for node in nodes:
            self._session.add(
                NetworkNodeORM(
                    id=node["id"],
                    project_id=project_id,
                    name=node["name"],
                    node_type=node["node_type"],
                    base_kv=node["base_kv"],
                    attrs_jsonb=node.get("attrs", {}),
                )
            )
        if commit:
            self._session.commit()

    def replace_branches(
        self, project_id: UUID, branches: Iterable[dict], *, commit: bool = True
    ) -> None:
        self._session.execute(
            delete(NetworkBranchORM).where(NetworkBranchORM.project_id == project_id)
        )
        for branch in branches:
            self._session.add(
                NetworkBranchORM(
                    id=branch["id"],
                    project_id=project_id,
                    name=branch["name"],
                    branch_type=branch["branch_type"],
                    from_node_id=branch["from_node_id"],
                    to_node_id=branch["to_node_id"],
                    in_service=branch.get("in_service", True),
                    params_jsonb=branch.get("params", {}),
                )
            )
        if commit:
            self._session.commit()

    def add_node(self, project_id: UUID, node: dict, *, commit: bool = True) -> None:
        self._session.add(
            NetworkNodeORM(
                id=node["id"],
                project_id=project_id,
                name=node["name"],
                node_type=node["node_type"],
                base_kv=node["base_kv"],
                attrs_jsonb=node.get("attrs", {}),
            )
        )
        if commit:
            self._session.commit()

    def get_node(self, node_id: UUID) -> dict | None:
        stmt = select(NetworkNodeORM).where(NetworkNodeORM.id == node_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {
            "id": row.id,
            "project_id": row.project_id,
            "name": row.name,
            "node_type": row.node_type,
            "base_kv": row.base_kv,
            "attrs": row.attrs_jsonb,
        }

    def update_node(self, node_id: UUID, patch: dict, *, commit: bool = True) -> dict | None:
        stmt = select(NetworkNodeORM).where(NetworkNodeORM.id == node_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        if "name" in patch:
            row.name = patch["name"]
        if "node_type" in patch:
            row.node_type = patch["node_type"]
        if "base_kv" in patch:
            row.base_kv = patch["base_kv"]
        if "attrs" in patch:
            row.attrs_jsonb = patch["attrs"]
        if commit:
            self._session.commit()
        return {
            "id": row.id,
            "project_id": row.project_id,
            "name": row.name,
            "node_type": row.node_type,
            "base_kv": row.base_kv,
            "attrs": row.attrs_jsonb,
        }

    def delete_node(self, node_id: UUID, *, commit: bool = True) -> None:
        stmt = select(NetworkNodeORM).where(NetworkNodeORM.id == node_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return
        self._session.delete(row)
        if commit:
            self._session.commit()

    def add_branch(self, project_id: UUID, branch: dict, *, commit: bool = True) -> None:
        self._session.add(
            NetworkBranchORM(
                id=branch["id"],
                project_id=project_id,
                name=branch["name"],
                branch_type=branch["branch_type"],
                from_node_id=branch["from_node_id"],
                to_node_id=branch["to_node_id"],
                in_service=branch.get("in_service", True),
                params_jsonb=branch.get("params", {}),
            )
        )
        if commit:
            self._session.commit()

    def get_branch(self, branch_id: UUID) -> dict | None:
        stmt = select(NetworkBranchORM).where(NetworkBranchORM.id == branch_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {
            "id": row.id,
            "project_id": row.project_id,
            "name": row.name,
            "branch_type": row.branch_type,
            "from_node_id": row.from_node_id,
            "to_node_id": row.to_node_id,
            "in_service": row.in_service,
            "params": row.params_jsonb,
        }

    def update_branch(self, branch_id: UUID, patch: dict, *, commit: bool = True) -> dict | None:
        stmt = select(NetworkBranchORM).where(NetworkBranchORM.id == branch_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        if "name" in patch:
            row.name = patch["name"]
        if "branch_type" in patch:
            row.branch_type = patch["branch_type"]
        if "from_node_id" in patch:
            row.from_node_id = patch["from_node_id"]
        if "to_node_id" in patch:
            row.to_node_id = patch["to_node_id"]
        if "in_service" in patch:
            row.in_service = patch["in_service"]
        if "params" in patch:
            row.params_jsonb = patch["params"]
        if commit:
            self._session.commit()
        return {
            "id": row.id,
            "project_id": row.project_id,
            "name": row.name,
            "branch_type": row.branch_type,
            "from_node_id": row.from_node_id,
            "to_node_id": row.to_node_id,
            "in_service": row.in_service,
            "params": row.params_jsonb,
        }

    def delete_branch(self, branch_id: UUID, *, commit: bool = True) -> None:
        stmt = select(NetworkBranchORM).where(NetworkBranchORM.id == branch_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return
        self._session.delete(row)
        if commit:
            self._session.commit()

    def list_nodes(self, project_id: UUID) -> list[dict]:
        stmt = (
            select(NetworkNodeORM)
            .where(NetworkNodeORM.project_id == project_id)
            .order_by(NetworkNodeORM.name, NetworkNodeORM.id)
        )
        rows = self._session.execute(stmt).scalars().all()
        return [
            {
                "id": row.id,
                "project_id": row.project_id,
                "name": row.name,
                "node_type": row.node_type,
                "base_kv": row.base_kv,
                "attrs": row.attrs_jsonb,
            }
            for row in rows
        ]

    def list_branches(self, project_id: UUID) -> list[dict]:
        stmt = (
            select(NetworkBranchORM)
            .where(NetworkBranchORM.project_id == project_id)
            .order_by(NetworkBranchORM.name, NetworkBranchORM.id)
        )
        rows = self._session.execute(stmt).scalars().all()
        return [
            {
                "id": row.id,
                "project_id": row.project_id,
                "name": row.name,
                "branch_type": row.branch_type,
                "from_node_id": row.from_node_id,
                "to_node_id": row.to_node_id,
                "in_service": row.in_service,
                "params": row.params_jsonb,
            }
            for row in rows
        ]

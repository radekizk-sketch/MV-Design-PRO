from __future__ import annotations

from uuid import UUID, uuid4

from infrastructure.persistence.models import (
    CableTypeORM,
    InverterTypeORM,
    LineTypeORM,
    NetworkLoadORM,
    NetworkSourceORM,
    OperatingCaseORM,
    ProjectSettingsORM,
    ProtectionCurveORM,
    ProtectionDeviceTypeORM,
    ProtectionSettingTemplateORM,
    SwitchEquipmentAssignmentORM,
    SwitchEquipmentTypeORM,
    SwitchingStateORM,
    TransformerTypeORM,
)
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


class NetworkWizardRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_settings(self, project_id: UUID) -> dict:
        stmt = select(ProjectSettingsORM).where(ProjectSettingsORM.project_id == project_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return {
                "project_id": project_id,
                "connection_node_id": None,
                "active_case_id": None,
                "grounding": {},
                "limits": {},
            }
        return {
            "project_id": row.project_id,
            "connection_node_id": row.connection_node_id,
            "active_case_id": row.active_case_id,
            "grounding": row.grounding_jsonb,
            "limits": row.limits_jsonb,
        }

    def upsert_settings(
        self,
        project_id: UUID,
        *,
        connection_node_id: UUID | None,
        active_case_id: UUID | None,
        grounding: dict,
        limits: dict,
        commit: bool = True,
    ) -> None:
        stmt = select(ProjectSettingsORM).where(ProjectSettingsORM.project_id == project_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                ProjectSettingsORM(
                    project_id=project_id,
                    connection_node_id=connection_node_id,
                    active_case_id=active_case_id,
                    grounding_jsonb=grounding,
                    limits_jsonb=limits,
                )
            )
        else:
            row.connection_node_id = connection_node_id
            row.active_case_id = active_case_id
            row.grounding_jsonb = grounding
            row.limits_jsonb = limits
        if commit:
            self._session.commit()

    def set_connection_node(
        self, project_id: UUID, node_id: UUID | None, *, commit: bool = True
    ) -> None:
        settings = self.get_settings(project_id)
        self.upsert_settings(
            project_id,
            connection_node_id=node_id,
            active_case_id=settings["active_case_id"],
            grounding=settings["grounding"],
            limits=settings["limits"],
            commit=commit,
        )

    def set_grounding(self, project_id: UUID, grounding: dict, *, commit: bool = True) -> None:
        settings = self.get_settings(project_id)
        self.upsert_settings(
            project_id,
            connection_node_id=settings["connection_node_id"],
            active_case_id=settings["active_case_id"],
            grounding=grounding,
            limits=settings["limits"],
            commit=commit,
        )

    def set_limits(self, project_id: UUID, limits: dict, *, commit: bool = True) -> None:
        settings = self.get_settings(project_id)
        self.upsert_settings(
            project_id,
            connection_node_id=settings["connection_node_id"],
            active_case_id=settings["active_case_id"],
            grounding=settings["grounding"],
            limits=limits,
            commit=commit,
        )

    def get_active_case_id(self, project_id: UUID) -> UUID | None:
        return self.get_settings(project_id)["active_case_id"]

    def set_active_case_id(
        self, project_id: UUID, case_id: UUID | None, *, commit: bool = True
    ) -> None:
        settings = self.get_settings(project_id)
        self.upsert_settings(
            project_id,
            connection_node_id=settings["connection_node_id"],
            active_case_id=case_id,
            grounding=settings["grounding"],
            limits=settings["limits"],
            commit=commit,
        )

    def list_sources(self, project_id: UUID) -> list[dict]:
        stmt = select(NetworkSourceORM).where(NetworkSourceORM.project_id == project_id)
        rows = self._session.execute(stmt).scalars().all()
        return [
            {
                "id": row.id,
                "project_id": row.project_id,
                "node_id": row.node_id,
                "source_type": row.source_type,
                "payload": row.payload_jsonb,
                "in_service": row.in_service,
            }
            for row in rows
        ]

    def list_loads(self, project_id: UUID) -> list[dict]:
        stmt = select(NetworkLoadORM).where(NetworkLoadORM.project_id == project_id)
        rows = self._session.execute(stmt).scalars().all()
        return [
            {
                "id": row.id,
                "project_id": row.project_id,
                "node_id": row.node_id,
                "payload": row.payload_jsonb,
                "in_service": row.in_service,
            }
            for row in rows
        ]

    def upsert_source(self, project_id: UUID, payload: dict, *, commit: bool = True) -> None:
        stmt = select(NetworkSourceORM).where(NetworkSourceORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                NetworkSourceORM(
                    id=payload["id"],
                    project_id=project_id,
                    node_id=payload["node_id"],
                    source_type=payload["source_type"],
                    payload_jsonb=payload["payload"],
                    in_service=payload.get("in_service", True),
                )
            )
        else:
            row.node_id = payload["node_id"]
            row.source_type = payload["source_type"]
            row.payload_jsonb = payload["payload"]
            row.in_service = payload.get("in_service", True)
        if commit:
            self._session.commit()

    def delete_source(self, source_id: UUID, *, commit: bool = True) -> None:
        stmt = select(NetworkSourceORM).where(NetworkSourceORM.id == source_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return
        self._session.delete(row)
        if commit:
            self._session.commit()

    def upsert_load(self, project_id: UUID, payload: dict, *, commit: bool = True) -> None:
        stmt = select(NetworkLoadORM).where(NetworkLoadORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                NetworkLoadORM(
                    id=payload["id"],
                    project_id=project_id,
                    node_id=payload["node_id"],
                    payload_jsonb=payload["payload"],
                    in_service=payload.get("in_service", True),
                )
            )
        else:
            row.node_id = payload["node_id"]
            row.payload_jsonb = payload["payload"]
            row.in_service = payload.get("in_service", True)
        if commit:
            self._session.commit()

    def delete_load(self, load_id: UUID, *, commit: bool = True) -> None:
        stmt = select(NetworkLoadORM).where(NetworkLoadORM.id == load_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return
        self._session.delete(row)
        if commit:
            self._session.commit()

    def delete_sources_by_project(self, project_id: UUID, *, commit: bool = True) -> None:
        self._session.query(NetworkSourceORM).filter(
            NetworkSourceORM.project_id == project_id
        ).delete()
        if commit:
            self._session.commit()

    def delete_loads_by_project(self, project_id: UUID, *, commit: bool = True) -> None:
        self._session.query(NetworkLoadORM).filter(NetworkLoadORM.project_id == project_id).delete()
        if commit:
            self._session.commit()

    def list_line_types(self) -> list[dict]:
        stmt = select(LineTypeORM).order_by(LineTypeORM.name, LineTypeORM.id)
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name": row.name, "params": row.params_jsonb} for row in rows]

    def list_cable_types(self) -> list[dict]:
        stmt = select(CableTypeORM).order_by(CableTypeORM.name, CableTypeORM.id)
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name": row.name, "params": row.params_jsonb} for row in rows]

    def list_transformer_types(self) -> list[dict]:
        stmt = select(TransformerTypeORM).order_by(TransformerTypeORM.name, TransformerTypeORM.id)
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name": row.name, "params": row.params_jsonb} for row in rows]

    def list_switch_equipment_types(self) -> list[dict]:
        stmt = select(SwitchEquipmentTypeORM).order_by(
            SwitchEquipmentTypeORM.name, SwitchEquipmentTypeORM.id
        )
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name": row.name, "params": row.params_jsonb} for row in rows]

    def list_inverter_types(self) -> list[dict]:
        stmt = select(InverterTypeORM).order_by(InverterTypeORM.name, InverterTypeORM.id)
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name": row.name, "params": row.params_jsonb} for row in rows]

    def get_line_type(self, type_id: str) -> dict | None:
        stmt = select(LineTypeORM).where(LineTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name": row.name, "params": row.params_jsonb}

    def get_cable_type(self, type_id: str) -> dict | None:
        stmt = select(CableTypeORM).where(CableTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name": row.name, "params": row.params_jsonb}

    def get_transformer_type(self, type_id: str) -> dict | None:
        stmt = select(TransformerTypeORM).where(TransformerTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name": row.name, "params": row.params_jsonb}

    def get_switch_equipment_type(self, type_id: str) -> dict | None:
        stmt = select(SwitchEquipmentTypeORM).where(SwitchEquipmentTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name": row.name, "params": row.params_jsonb}

    def get_inverter_type(self, type_id: str) -> dict | None:
        stmt = select(InverterTypeORM).where(InverterTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name": row.name, "params": row.params_jsonb}

    def list_protection_device_types(self) -> list[dict]:
        """List all protection device types (P14a)"""
        stmt = select(ProtectionDeviceTypeORM).order_by(
            ProtectionDeviceTypeORM.name_pl, ProtectionDeviceTypeORM.id
        )
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb} for row in rows]

    def list_protection_curves(self) -> list[dict]:
        """List all protection curves (P14a)"""
        stmt = select(ProtectionCurveORM).order_by(
            ProtectionCurveORM.name_pl, ProtectionCurveORM.id
        )
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb} for row in rows]

    def list_protection_setting_templates(self) -> list[dict]:
        """List all protection setting templates (P14a)"""
        stmt = select(ProtectionSettingTemplateORM).order_by(
            ProtectionSettingTemplateORM.name_pl, ProtectionSettingTemplateORM.id
        )
        rows = self._session.execute(stmt).scalars().all()
        return [{"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb} for row in rows]

    def get_protection_device_type(self, type_id: str) -> dict | None:
        """Get single protection device type by ID (P14a)"""
        stmt = select(ProtectionDeviceTypeORM).where(ProtectionDeviceTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb}

    def get_protection_curve(self, curve_id: str) -> dict | None:
        """Get single protection curve by ID (P14a)"""
        stmt = select(ProtectionCurveORM).where(ProtectionCurveORM.id == curve_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb}

    def get_protection_setting_template(self, template_id: str) -> dict | None:
        """Get single protection setting template by ID (P14a)"""
        stmt = select(ProtectionSettingTemplateORM).where(
            ProtectionSettingTemplateORM.id == template_id
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return {"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb}

    def upsert_line_type(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(LineTypeORM).where(LineTypeORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                LineTypeORM(id=payload["id"], name=payload["name"], params_jsonb=payload["params"])
            )
        else:
            row.name = payload["name"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_cable_type(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(CableTypeORM).where(CableTypeORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                CableTypeORM(id=payload["id"], name=payload["name"], params_jsonb=payload["params"])
            )
        else:
            row.name = payload["name"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_transformer_type(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(TransformerTypeORM).where(TransformerTypeORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                TransformerTypeORM(
                    id=payload["id"], name=payload["name"], params_jsonb=payload["params"]
                )
            )
        else:
            row.name = payload["name"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_switch_equipment_type(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(SwitchEquipmentTypeORM).where(SwitchEquipmentTypeORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                SwitchEquipmentTypeORM(
                    id=payload["id"], name=payload["name"], params_jsonb=payload["params"]
                )
            )
        else:
            row.name = payload["name"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_inverter_type(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(InverterTypeORM).where(InverterTypeORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                InverterTypeORM(
                    id=payload["id"], name=payload["name"], params_jsonb=payload["params"]
                )
            )
        else:
            row.name = payload["name"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_protection_device_type(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(ProtectionDeviceTypeORM).where(ProtectionDeviceTypeORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                ProtectionDeviceTypeORM(
                    id=payload["id"],
                    name_pl=payload["name_pl"],
                    params_jsonb=payload["params"],
                )
            )
        else:
            row.name_pl = payload["name_pl"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_protection_curve(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(ProtectionCurveORM).where(ProtectionCurveORM.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                ProtectionCurveORM(
                    id=payload["id"],
                    name_pl=payload["name_pl"],
                    params_jsonb=payload["params"],
                )
            )
        else:
            row.name_pl = payload["name_pl"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def upsert_protection_setting_template(self, payload: dict, *, commit: bool = True) -> None:
        stmt = select(ProtectionSettingTemplateORM).where(
            ProtectionSettingTemplateORM.id == payload["id"]
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                ProtectionSettingTemplateORM(
                    id=payload["id"],
                    name_pl=payload["name_pl"],
                    params_jsonb=payload["params"],
                )
            )
        else:
            row.name_pl = payload["name_pl"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()

    def clear_all_protection_types(self, *, commit: bool = True) -> None:
        self._session.query(ProtectionSettingTemplateORM).delete()
        self._session.query(ProtectionCurveORM).delete()
        self._session.query(ProtectionDeviceTypeORM).delete()
        if commit:
            self._session.commit()

    def assign_switch_equipment_type(
        self,
        project_id: UUID,
        switch_id: UUID,
        equipment_type_id: str,
        *,
        commit: bool = True,
    ) -> None:
        stmt = select(SwitchEquipmentAssignmentORM).where(
            SwitchEquipmentAssignmentORM.project_id == project_id,
            SwitchEquipmentAssignmentORM.switch_id == switch_id,
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                SwitchEquipmentAssignmentORM(
                    id=uuid4(),
                    project_id=project_id,
                    switch_id=switch_id,
                    equipment_type_id=equipment_type_id,
                )
            )
        else:
            row.equipment_type_id = equipment_type_id
        if commit:
            self._session.commit()

    def clear_switch_equipment_type(
        self,
        project_id: UUID,
        switch_id: UUID,
        *,
        commit: bool = True,
    ) -> None:
        """Clear equipment type assignment from switch (P8.2 HOTFIX)"""
        stmt = delete(SwitchEquipmentAssignmentORM).where(
            SwitchEquipmentAssignmentORM.project_id == project_id,
            SwitchEquipmentAssignmentORM.switch_id == switch_id,
        )
        self._session.execute(stmt)
        if commit:
            self._session.commit()

    def set_switching_state(
        self,
        case_id: UUID,
        element_id: UUID,
        element_type: str,
        in_service: bool,
        *,
        commit: bool = True,
    ) -> None:
        stmt = select(SwitchingStateORM).where(
            SwitchingStateORM.case_id == case_id,
            SwitchingStateORM.element_id == element_id,
            SwitchingStateORM.element_type == element_type,
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                SwitchingStateORM(
                    id=uuid4(),
                    case_id=case_id,
                    element_id=element_id,
                    element_type=element_type,
                    in_service=in_service,
                )
            )
        else:
            row.in_service = in_service
        if commit:
            self._session.commit()

    def list_switching_states(self, case_id: UUID) -> list[dict]:
        stmt = select(SwitchingStateORM).where(SwitchingStateORM.case_id == case_id)
        rows = self._session.execute(stmt).scalars().all()
        return [
            {
                "id": row.id,
                "case_id": row.case_id,
                "element_id": row.element_id,
                "element_type": row.element_type,
                "in_service": row.in_service,
            }
            for row in rows
        ]

    def delete_switching_states(self, case_id: UUID, *, commit: bool = True) -> None:
        self._session.execute(delete(SwitchingStateORM).where(SwitchingStateORM.case_id == case_id))
        if commit:
            self._session.commit()

    def delete_switching_states_by_project(self, project_id: UUID, *, commit: bool = True) -> None:
        self._session.query(SwitchingStateORM).filter(
            SwitchingStateORM.case_id.in_(
                select(OperatingCaseORM.id).where(OperatingCaseORM.project_id == project_id)
            )
        ).delete()
        if commit:
            self._session.commit()

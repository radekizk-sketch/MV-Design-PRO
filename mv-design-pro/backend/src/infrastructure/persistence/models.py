from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class GUID(TypeDecorator[UUID]):
    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID as PG_UUID

            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value: UUID | None, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value: str | None, dialect):
        if value is None:
            return None
        return UUID(value)


def _stable_sort_key(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("id", "snapshot_id", "node_id", "branch_id", "name"):
            if key in value and value[key] is not None:
                return str(value[key])
    return str(value)


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, tuple):
        return [_canonicalize(item) for item in value]
    if isinstance(value, set):
        return sorted((_canonicalize(item) for item in value), key=_stable_sort_key)
    try:
        import numpy as np

        if isinstance(value, np.ndarray):
            return _canonicalize(value.tolist())
        if isinstance(value, np.generic):
            return value.item()
    except ImportError:
        pass
    return value


class DeterministicJSON(TypeDecorator[Any]):
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect):
        if value is None:
            return None
        canonical = _canonicalize(value)
        if dialect.name == "postgresql":
            return canonical
        return json.dumps(canonical, sort_keys=True, separators=(",", ":"))

    def process_result_value(self, value: Any, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.loads(value)


class ProjectORM(Base):
    """
    Project ORM model — P10a root aggregate.

    P10a: active_network_snapshot_id tracks the current state of the network.

    Full target schema with:
    - mode: AS-IS (weryfikacja istniejącej sieci) vs TO-BE (projektowanie nowej)
    - voltage_level_kv: Poziom napięcia sieci
    - frequency_hz: Częstotliwość sieci (50 lub 60 Hz)
    - deleted_at: Soft delete (null = aktywny)
    """

    __tablename__ = "projects"

    # Primary key
    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)

    # Basic information
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0")

    # Project mode: AS-IS vs TO-BE
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="AS-IS")

    # Point of Common Coupling (wymagany dla TO-BE z OZE, NC RfG)
    connection_node_id: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("network_nodes.id", use_alter=True, name="fk_projects_connection_node_node"),
    )
    connection_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Network parameters
    voltage_level_kv: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=15.0)
    frequency_hz: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False, default=50.0)

    # Ownership (nullable - FK to users added in future PR)
    owner_id: Mapped[UUID | None] = mapped_column(GUID(), nullable=True)

    # P10a: Reference to the active (current) network snapshot
    active_network_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    sources_jsonb: Mapped[list[dict[str, Any]]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )

    # Timestamps (UTC)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Soft delete
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Table-level constraints (applied for PostgreSQL, SQLite ignores CHECK)
    __table_args__ = (
        CheckConstraint("mode IN ('AS-IS', 'TO-BE')", name="ck_projects_mode"),
        CheckConstraint("voltage_level_kv > 0", name="ck_projects_voltage_positive"),
        CheckConstraint("frequency_hz IN (50.0, 60.0)", name="ck_projects_frequency_valid"),
        Index("ix_projects_mode", "mode"),
        Index("ix_projects_created", "created_at"),
    )


class NetworkSnapshotORM(Base):
    """
    Network Snapshot ORM model — P10a first-class object.

    P10a: Snapshot has deterministic fingerprint for change detection.
    """

    __tablename__ = "network_snapshots"

    snapshot_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    parent_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    schema_version: Mapped[str | None] = mapped_column(String(50))
    network_model_id: Mapped[str | None] = mapped_column(String(64))
    # P10a: Deterministic fingerprint (SHA-256) of graph content
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class ProjectSettingsORM(Base):
    __tablename__ = "project_settings"

    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), primary_key=True)
    connection_node_id: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("network_nodes.id", use_alter=True, name="fk_settings_connection_node_node"),
    )
    active_case_id: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("operating_cases.id", use_alter=True, name="fk_settings_active_case"),
        nullable=True,
    )
    grounding_jsonb: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    limits_jsonb: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )


class NetworkNodeORM(Base):
    __tablename__ = "network_nodes"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    node_type: Mapped[str] = mapped_column(String(100), nullable=False)
    base_kv: Mapped[float] = mapped_column(Float, nullable=False)
    attrs_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class NetworkBranchORM(Base):
    __tablename__ = "network_branches"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch_type: Mapped[str] = mapped_column(String(100), nullable=False)
    from_node_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("network_nodes.id"))
    to_node_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("network_nodes.id"))
    in_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class NetworkSourceORM(Base):
    __tablename__ = "network_sources"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    node_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("network_nodes.id"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    in_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class NetworkLoadORM(Base):
    __tablename__ = "network_loads"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    node_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("network_nodes.id"), nullable=False)
    payload_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    in_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class LineTypeORM(Base):
    __tablename__ = "line_types"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class CableTypeORM(Base):
    __tablename__ = "cable_types"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class TransformerTypeORM(Base):
    __tablename__ = "transformer_types"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class SwitchEquipmentTypeORM(Base):
    __tablename__ = "switch_equipment_types"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class InverterTypeORM(Base):
    __tablename__ = "inverter_types"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class ProtectionDeviceTypeORM(Base):
    """Protection device type (relay, fuse, etc.) - P14a READ-ONLY"""

    __tablename__ = "protection_device_types"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name_pl: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class ProtectionCurveORM(Base):
    """Protection curve (time-current characteristic) - P14a READ-ONLY"""

    __tablename__ = "protection_curves"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name_pl: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class ProtectionSettingTemplateORM(Base):
    """Protection setting template - P14a READ-ONLY"""

    __tablename__ = "protection_setting_templates"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name_pl: Mapped[str] = mapped_column(String(255), nullable=False)
    params_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)


class SwitchEquipmentAssignmentORM(Base):
    __tablename__ = "switch_equipment_assignments"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    switch_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    equipment_type_id: Mapped[str] = mapped_column(String(255), nullable=False)


class SwitchingStateORM(Base):
    __tablename__ = "network_switching_states"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    case_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("operating_cases.id"))
    element_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    element_type: Mapped[str] = mapped_column(String(50), nullable=False)
    in_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class OperatingCaseORM(Base):
    __tablename__ = "operating_cases"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    case_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    project_design_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StudyCaseORM(Base):
    """
    Study Case ORM model — P10a.

    Extended with:
    - is_active: Active case indicator (exactly one per project)
    - result_status: NONE / FRESH / OUTDATED lifecycle
    - description: Case description
    - result_refs_jsonb: References to calculation results
    - network_snapshot_id: P10a binding to specific network snapshot
    """

    __tablename__ = "study_cases"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # P10a: Reference to the network snapshot this case is bound to
    network_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    study_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    result_status: Mapped[str] = mapped_column(String(20), nullable=False, default="NONE")
    result_refs_jsonb: Mapped[list[dict[str, Any]]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )
    revision: Mapped[int] = mapped_column(nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ScenarioORM(Base):
    __tablename__ = "scenarios"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AnalysisRunORM(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (Index("ix_analysis_runs_input_hash", "input_hash"),)

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    operating_case_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("operating_cases.id"), nullable=False
    )
    analysis_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    result_status: Mapped[str] = mapped_column(String(20), nullable=False, default="VALID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    result_summary: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    analysis_case_context: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    reproducibility_json: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    proof_pack_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    completeness_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    export_artifacts_json: Mapped[list[dict[str, Any]]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )
    trace_json: Mapped[dict[str, Any] | list[dict[str, Any]] | None] = mapped_column(
        DeterministicJSON(), nullable=True
    )
    white_box_trace: Mapped[list[dict[str, Any]] | None] = mapped_column(
        DeterministicJSON(), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text)


class CanonicalRunORM(Base):
    __tablename__ = "canonical_runs"
    __table_args__ = (
        Index("ix_canonical_runs_case_id_created_at", "case_id", "created_at"),
        Index("ix_canonical_runs_project_id_created_at", "project_id", "created_at"),
        Index("ix_canonical_runs_analysis_type", "analysis_type"),
        Index("ix_canonical_runs_input_hash", "input_hash"),
    )

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    analysis_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    result_status: Mapped[str] = mapped_column(String(20), nullable=False, default="VALID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snapshot_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    validation_json: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    readiness_json: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    options_json: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_result_json: Mapped[dict[str, Any] | None] = mapped_column(
        DeterministicJSON(), nullable=True
    )
    white_box_trace_json: Mapped[list[dict[str, Any]]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )
    power_flow_trace_json: Mapped[dict[str, Any] | None] = mapped_column(
        DeterministicJSON(), nullable=True
    )


class AnalysisRunIndexORM(Base):
    __tablename__ = "analysis_runs_index"
    __table_args__ = (
        Index("ix_analysis_runs_index_analysis_type", "analysis_type"),
        Index("ix_analysis_runs_index_case_id", "case_id"),
        Index("ix_analysis_runs_index_base_snapshot_id", "base_snapshot_id"),
        Index("ix_analysis_runs_index_fingerprint", "fingerprint"),
        Index("ix_analysis_runs_index_created_at_utc", "created_at_utc"),
    )

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    analysis_type: Mapped[str] = mapped_column(String(100), nullable=False)
    case_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    base_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    primary_artifact_type: Mapped[str] = mapped_column(String(100), nullable=False)
    primary_artifact_id: Mapped[str] = mapped_column(String(64), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    meta_json: Mapped[dict[str, Any] | None] = mapped_column(DeterministicJSON(), nullable=True)


class StudyRunORM(Base):
    """
    Study Run ORM model — P10a immutable calculation execution.

    P10a ADDITIONS:
    - network_snapshot_id: BINDING reference to specific snapshot
    - solver_version_hash: Ensures reproducibility
    - result_state: VALID / OUTDATED validity tracking
    """

    __tablename__ = "study_runs"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    case_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("study_cases.id"), nullable=False)
    analysis_type: Mapped[str] = mapped_column(String(100), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # P10a: BINDING reference to specific network snapshot
    network_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # P10a: Hash of solver version for reproducibility
    solver_version_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # P10a: Result validity state (VALID, OUTDATED)
    result_state: Mapped[str] = mapped_column(String(20), nullable=False, default="VALID")
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StudyResultORM(Base):
    __tablename__ = "study_results"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    run_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("study_runs.id"), nullable=False)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    result_type: Mapped[str] = mapped_column(String(100), nullable=False)
    result_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SldDiagramORM(Base):
    __tablename__ = "sld_diagrams"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sld_jsonb: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    dirty_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SldNodeSymbolORM(Base):
    __tablename__ = "sld_node_symbols"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    diagram_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("sld_diagrams.id"))
    node_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))
    is_connection_node: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SldBranchSymbolORM(Base):
    __tablename__ = "sld_branch_symbols"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    diagram_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("sld_diagrams.id"))
    branch_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    from_node_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    to_node_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    points_jsonb: Mapped[list[dict[str, Any]]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )


class SldAnnotationORM(Base):
    __tablename__ = "sld_annotations"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    diagram_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("sld_diagrams.id"))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)


class DesignSpecORM(Base):
    __tablename__ = "design_specs"
    __table_args__ = (Index("ix_design_specs_case_id", "case_id"),)

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    case_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("operating_cases.id"), nullable=False)
    base_snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    spec_json: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DesignProposalORM(Base):
    __tablename__ = "design_proposals"
    __table_args__ = (Index("ix_design_proposals_case_id", "case_id"),)

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    case_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("operating_cases.id"), nullable=False)
    input_snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    proposal_json: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DesignEvidenceORM(Base):
    __tablename__ = "design_evidence"
    __table_args__ = (Index("ix_design_evidence_case_id", "case_id"),)

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    case_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("operating_cases.id"), nullable=False)
    snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(DeterministicJSON(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StationAudit2ConfigORM(Base):
    """
    Audit2 Station Config ORM (Punkt 3 — Phase 2 backend integration).

    Persystencja stanu audytu 2 per (project_id, station_id):
    - mv_neutral_grounding_ref: B.1 typ uziemienia neutralnego SN
    - tap_changer_refs: eng.13 lista przelacznikow zaczepow per transformator
    - der_specs: lista DER z polami audit2 (BESS modes, block-trafo, P(f))

    Schema: jeden row na (project_id, station_id) - UPSERT przez PUT.
    """

    __tablename__ = "station_audit2_configs"
    __table_args__ = (
        Index("ix_audit2_project_station", "project_id", "station_id", unique=True),
    )

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    station_id: Mapped[str] = mapped_column(String(255), nullable=False)
    mv_neutral_grounding_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tap_changer_refs: Mapped[list[Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )
    der_specs: Mapped[list[dict[str, Any]]] = mapped_column(
        DeterministicJSON(), nullable=False, default=list
    )
    # Phase 8: per-transformer/bay mapping (full UI wiring).
    transformer_tap_changers: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    bay_hv_fuses: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    bay_vts: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    bay_device_withstand: Mapped[dict[str, Any]] = mapped_column(
        DeterministicJSON(), nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

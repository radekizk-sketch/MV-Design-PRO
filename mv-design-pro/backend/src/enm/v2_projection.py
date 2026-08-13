"""Read-only ENM v1 -> ENM v2.0 projection for the V12.xx migration phases."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from enm.hash import compute_enm_hash
from enm.models import (
    BranchPointSN,
    Cable,
    EnergyNetworkModel,
    ENMElement,
    FuseBranch,
    Generator,
    Load,
    Measurement,
    OverheadLine,
    ProtectionAssignment,
    Source,
    SwitchBranch,
    Transformer,
)
from pydantic import BaseModel, Field

ProjectionQuality = Literal["pelna", "czesciowa", "wymaga_decyzji"]
ReadinessStatus = Literal["gotowy", "wymaga_uzupelnienia", "zablokowany"]


class V2Header(BaseModel):
    enm_version: Literal["2.0"] = "2.0"
    projection_version: Literal["v12xx.m2.0"] = "v12xx.m2.0"
    source_enm_version: str
    name: str
    revision: int
    source_hash_sha256: str


class V2ElementReference(BaseModel):
    id: str
    ref_id: str
    name: str
    kind: str
    namespace: str
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    quality_status: ProjectionQuality = "pelna"
    readiness_status: ReadinessStatus = "gotowy"


class V2OperatingVariant(BaseModel):
    ref_id: str
    name: str
    variant_type: Literal["uklad_normalny", "przelaczeniowy", "po_zakloceniu"]
    switching_snapshot_ref: str
    source: Literal["migracja_m1"] = "migracja_m1"


class V2SwitchingDeviceState(BaseModel):
    device_ref: str
    state: Literal["closed", "open", "unknown"]
    device_type: str


class V2SwitchingStateSnapshot(BaseModel):
    ref_id: str
    name: str
    variant_ref: str
    source: Literal["enm_v1_status"] = "enm_v1_status"
    switch_states: list[V2SwitchingDeviceState] = Field(default_factory=list)


class V2ZeroSequenceConfig(BaseModel):
    element_ref: str
    element_kind: Literal["branch", "source", "transformer", "bus"]
    r0: float | None = None
    x0: float | None = None
    b0: float | None = None
    grounding_type: str | None = None
    quality_status: ProjectionQuality


class V2MigrationWarning(BaseModel):
    code: str
    severity: Literal["informacja", "ostrzezenie", "blokada_migracji"]
    element_ref: str | None = None
    message_pl: str


class V2ProjectionSummary(BaseModel):
    buses: int
    branches: int
    transformers: int
    sources: int
    loads: int
    generators: int
    substations: int
    bays: int
    measurements: int
    protection_assignments: int
    branch_points: int
    switching_devices: int
    zero_sequence_configs: int
    operator_profiles: int
    source_profiles: int
    frt_profiles: int
    q_u_profiles: int
    cos_phi_p_profiles: int
    load_profiles: int
    automation_assets: int
    warnings: int


class EnergyNetworkModelV2Projection(BaseModel):
    header: V2Header
    projection_hash_sha256: str = ""
    element_refs: list[V2ElementReference] = Field(default_factory=list)
    operating_variants: list[V2OperatingVariant] = Field(default_factory=list)
    switching_state_snapshots: list[V2SwitchingStateSnapshot] = Field(default_factory=list)
    zero_sequence_configs: list[V2ZeroSequenceConfig] = Field(default_factory=list)
    operator_profiles: list[dict] = Field(default_factory=list)
    source_profiles: list[dict] = Field(default_factory=list)
    frt_profiles: list[dict] = Field(default_factory=list)
    q_u_profiles: list[dict] = Field(default_factory=list)
    cos_phi_p_profiles: list[dict] = Field(default_factory=list)
    load_profiles: list[dict] = Field(default_factory=list)
    automation_assets: list[dict] = Field(default_factory=list)
    migration_warnings: list[V2MigrationWarning] = Field(default_factory=list)
    summary: V2ProjectionSummary


def project_enm_v1_to_v2(enm: EnergyNetworkModel) -> EnergyNetworkModelV2Projection:
    """Build the deterministic, read-only V12.xx projection from the current ENM."""

    element_refs = _build_element_refs(enm)
    switching_snapshot = _build_base_switching_snapshot(enm)
    zero_sequence_configs = _build_zero_sequence_configs(enm)
    operator_profiles = _build_operator_profiles(enm)
    source_profiles = _build_source_profiles(enm)
    frt_profiles = _build_profile_projection(enm, "frt", source_profiles)
    q_u_profiles = _build_profile_projection(enm, "q_u", source_profiles)
    cos_phi_p_profiles = _build_profile_projection(enm, "cos_phi_p", source_profiles)
    load_profiles = _build_load_profiles(enm)
    automation_assets = _build_automation_assets(enm)
    migration_warnings = _build_migration_warnings(enm)

    projection = EnergyNetworkModelV2Projection(
        header=V2Header(
            source_enm_version=str(enm.header.enm_version),
            name=enm.header.name,
            revision=enm.header.revision,
            source_hash_sha256=compute_enm_hash(enm),
        ),
        element_refs=element_refs,
        operating_variants=[
            V2OperatingVariant(
                ref_id="variant.uklad_normalny",
                name="Uklad normalny",
                variant_type="uklad_normalny",
                switching_snapshot_ref=switching_snapshot.ref_id,
            )
        ],
        switching_state_snapshots=[switching_snapshot],
        zero_sequence_configs=zero_sequence_configs,
        operator_profiles=operator_profiles,
        source_profiles=source_profiles,
        frt_profiles=frt_profiles,
        q_u_profiles=q_u_profiles,
        cos_phi_p_profiles=cos_phi_p_profiles,
        load_profiles=load_profiles,
        automation_assets=automation_assets,
        migration_warnings=migration_warnings,
        summary=V2ProjectionSummary(
            buses=len(enm.buses),
            branches=len(enm.branches),
            transformers=len(enm.transformers),
            sources=len(enm.sources),
            loads=len(enm.loads),
            generators=len(enm.generators),
            substations=len(enm.substations),
            bays=len(enm.bays),
            measurements=len(enm.measurements),
            protection_assignments=len(enm.protection_assignments),
            branch_points=len(enm.branch_points),
            switching_devices=len(switching_snapshot.switch_states),
            zero_sequence_configs=len(zero_sequence_configs),
            operator_profiles=len(operator_profiles),
            source_profiles=len(source_profiles),
            frt_profiles=len(frt_profiles),
            q_u_profiles=len(q_u_profiles),
            cos_phi_p_profiles=len(cos_phi_p_profiles),
            load_profiles=len(load_profiles),
            automation_assets=len(automation_assets),
            warnings=len(migration_warnings),
        ),
    )
    projection.projection_hash_sha256 = compute_v2_projection_hash(projection)
    return projection


def compute_v2_projection_hash(projection: EnergyNetworkModelV2Projection) -> str:
    """Return a stable hash of the projection, excluding its own hash field."""

    data = projection.model_dump(mode="json")
    data["projection_hash_sha256"] = ""
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _build_element_refs(enm: EnergyNetworkModel) -> list[V2ElementReference]:
    refs: list[V2ElementReference] = []

    typed_collections: list[tuple[str, str, list[ENMElement]]] = [
        ("bus", "enm.buses", list(enm.buses)),
        ("branch", "enm.branches", list(enm.branches)),
        ("transformer", "enm.transformers", list(enm.transformers)),
        ("source", "enm.sources", list(enm.sources)),
        ("load", "enm.loads", list(enm.loads)),
        ("generator", "enm.generators", list(enm.generators)),
        ("substation", "enm.substations", list(enm.substations)),
        ("bay", "enm.bays", list(enm.bays)),
        ("junction", "enm.junctions", list(enm.junctions)),
        ("corridor", "enm.corridors", list(enm.corridors)),
        ("measurement", "enm.measurements", list(enm.measurements)),
        ("protection_assignment", "enm.protection_assignments", list(enm.protection_assignments)),
        ("branch_point", "enm.branch_points", list(enm.branch_points)),
    ]
    for kind, namespace, elements in typed_collections:
        for element in sorted(elements, key=_element_ref_id):
            refs.append(
                V2ElementReference(
                    id=str(element.id),
                    ref_id=str(element.ref_id),
                    name=str(element.name),
                    kind=kind,
                    namespace=namespace,
                    catalog_ref=getattr(element, "catalog_ref", None),
                    catalog_namespace=getattr(element, "catalog_namespace", None),
                    quality_status=_quality_for_element(element),
                    readiness_status=_readiness_for_element(element),
                )
            )
    refs.sort(key=lambda ref: (ref.namespace, ref.ref_id))
    return refs


def _element_ref_id(element: Any) -> str:
    return str(element.ref_id)


def _build_base_switching_snapshot(enm: EnergyNetworkModel) -> V2SwitchingStateSnapshot:
    switch_states: list[V2SwitchingDeviceState] = []
    for branch in sorted(enm.branches, key=lambda item: item.ref_id):
        if not isinstance(branch, SwitchBranch | FuseBranch):
            continue
        switch_states.append(
            V2SwitchingDeviceState(
                device_ref=branch.ref_id,
                state=branch.status if branch.status in {"closed", "open"} else "unknown",
                device_type=branch.type,
            )
        )
    return V2SwitchingStateSnapshot(
        ref_id="switching.uklad_normalny.base",
        name="Migawka lacznikowa ukladu normalnego",
        variant_ref="variant.uklad_normalny",
        switch_states=switch_states,
    )


def _build_zero_sequence_configs(enm: EnergyNetworkModel) -> list[V2ZeroSequenceConfig]:
    configs: list[V2ZeroSequenceConfig] = []

    for branch in sorted(enm.branches, key=lambda item: item.ref_id):
        if isinstance(branch, OverheadLine | Cable):
            configs.append(
                V2ZeroSequenceConfig(
                    element_ref=branch.ref_id,
                    element_kind="branch",
                    r0=branch.r0_ohm_per_km,
                    x0=branch.x0_ohm_per_km,
                    b0=branch.b0_siemens_per_km,
                    quality_status=(
                        "pelna"
                        if branch.r0_ohm_per_km is not None and branch.x0_ohm_per_km is not None
                        else "czesciowa"
                    ),
                )
            )

    for source in sorted(enm.sources, key=lambda item: item.ref_id):
        configs.append(
            V2ZeroSequenceConfig(
                element_ref=source.ref_id,
                element_kind="source",
                r0=source.r0_ohm,
                x0=source.x0_ohm,
                quality_status=(
                    "pelna"
                    if source.r0_ohm is not None and source.x0_ohm is not None
                    else "czesciowa"
                ),
            )
        )

    for transformer in sorted(enm.transformers, key=lambda item: item.ref_id):
        grounding = transformer.hv_neutral or transformer.lv_neutral
        configs.append(
            V2ZeroSequenceConfig(
                element_ref=transformer.ref_id,
                element_kind="transformer",
                grounding_type=grounding.type if grounding else None,
                quality_status="pelna" if transformer.vector_group and grounding else "czesciowa",
            )
        )

    for bus in sorted(enm.buses, key=lambda item: item.ref_id):
        if bus.grounding is None:
            continue
        configs.append(
            V2ZeroSequenceConfig(
                element_ref=bus.ref_id,
                element_kind="bus",
                r0=bus.grounding.r_ohm,
                x0=bus.grounding.x_ohm,
                grounding_type=bus.grounding.type,
                quality_status="pelna",
            )
        )

    configs.sort(key=lambda item: (item.element_kind, item.element_ref))
    return configs


def _build_operator_profiles(enm: EnergyNetworkModel) -> list[dict]:
    profiles_by_ref: dict[str, dict] = {}
    for generator in sorted(enm.generators, key=lambda item: item.ref_id):
        operator_profile = _materialized_section(generator, "operator_profile")
        if not operator_profile:
            continue
        profile_ref = str(
            operator_profile.get("ref_id")
            or operator_profile.get("id")
            or f"operator_profile.{generator.ref_id}"
        )
        profiles_by_ref[profile_ref] = {
            "ref_id": profile_ref,
            "name": str(operator_profile.get("name") or f"Profil operatora {generator.name}"),
            "source_ref": generator.ref_id,
            "quality_status": "pelna",
            "profile_source": _profile_source(generator),
            "profile": operator_profile,
        }
    return [profiles_by_ref[key] for key in sorted(profiles_by_ref)]


def _build_source_profiles(enm: EnergyNetworkModel) -> list[dict]:
    profiles: list[dict] = []
    for generator in sorted(enm.generators, key=lambda item: item.ref_id):
        materialized_source_profile = _materialized_section(generator, "source_profile")
        generator_model = _generator_model(generator, materialized_source_profile)
        source_type = _source_type_for_generator(generator)
        quality_status = _source_profile_quality(generator, materialized_source_profile)
        profiles.append(
            {
                "ref_id": f"source_profile.{generator.ref_id}",
                "source_ref": generator.ref_id,
                "source_type": source_type,
                "catalog_ref": generator.catalog_ref,
                "catalog_namespace": generator.catalog_namespace,
                "quality_status": quality_status,
                "profile_source": _profile_source(generator),
                "generator_model": generator_model,
                "profile": materialized_source_profile or {},
            }
        )
    return profiles


def _build_profile_projection(
    enm: EnergyNetworkModel,
    profile_key: str,
    source_profiles: list[dict],
) -> list[dict]:
    source_profile_by_ref = {str(profile["source_ref"]): profile for profile in source_profiles}
    profiles: list[dict] = []
    for generator in sorted(enm.generators, key=lambda item: item.ref_id):
        source_profile = source_profile_by_ref.get(generator.ref_id, {})
        materialized_source_profile = source_profile.get("profile", {})
        profile_payload = (
            materialized_source_profile.get(profile_key)
            if isinstance(materialized_source_profile, dict)
            else None
        )
        quality_status: ProjectionQuality = "pelna" if profile_payload else "czesciowa"
        profiles.append(
            {
                "ref_id": f"{profile_key}.{generator.ref_id}",
                "source_ref": generator.ref_id,
                "source_profile_ref": f"source_profile.{generator.ref_id}",
                "source_type": source_profile.get("source_type")
                or _source_type_for_generator(generator),
                "quality_status": quality_status,
                "profile_source": _profile_source(generator),
                "profile": profile_payload or {},
            }
        )
    return profiles


def _build_load_profiles(enm: EnergyNetworkModel) -> list[dict]:
    profiles: list[dict] = []
    for load in sorted(enm.loads, key=lambda item: item.ref_id):
        load_profile = _materialized_section(load, "load_profile")
        if load_profile is None and load.model != "zip":
            continue
        profiles.append(
            {
                "ref_id": f"load_profile.{load.ref_id}",
                "load_ref": load.ref_id,
                "model": load.model,
                "quality_status": "pelna" if load_profile else "czesciowa",
                "profile_source": _profile_source(load),
                "profile": load_profile or {},
            }
        )
    return profiles


def _build_automation_assets(enm: EnergyNetworkModel) -> list[dict]:
    assets: list[dict] = []
    for assignment in sorted(enm.protection_assignments, key=lambda item: item.ref_id):
        materialized = assignment.materialized_params or {}
        automation_profile = (
            materialized.get("automation")
            if isinstance(materialized.get("automation"), dict)
            else {}
        )
        assets.append(
            {
                "ref_id": f"automation.{assignment.ref_id}",
                "protection_assignment_ref": assignment.ref_id,
                "breaker_ref": assignment.breaker_ref,
                "device_type": assignment.device_type,
                "quality_status": "pelna" if automation_profile else "czesciowa",
                "profile_source": _profile_source(assignment),
                "profile": automation_profile,
            }
        )
    return assets


def _build_migration_warnings(enm: EnergyNetworkModel) -> list[V2MigrationWarning]:
    warnings: list[V2MigrationWarning] = []

    for generator in sorted(enm.generators, key=lambda item: item.ref_id):
        if generator.gen_type == "wind_inverter":
            warnings.append(
                V2MigrationWarning(
                    code="V12-MIG-GEN-001",
                    severity="ostrzezenie",
                    element_ref=generator.ref_id,
                    message_pl=(
                        "Generator wiatrowy ma typ legacy 'wind_inverter'. "
                        "Migracja V12.xx wymaga rozroznienia PMSG, DFIG albo SCIG."
                    ),
                )
            )
        if generator.gen_type in _converter_generator_types() and not generator.catalog_ref:
            warnings.append(
                V2MigrationWarning(
                    code="V12-MIG-GEN-002",
                    severity="ostrzezenie",
                    element_ref=generator.ref_id,
                    message_pl="Zrodlo przeksztaltnikowe nie ma referencji katalogowej.",
                )
            )
        source_type = _source_type_for_generator(generator)
        source_profile = _materialized_section(generator, "source_profile")
        if source_type in {"FW_PMSG", "FW_DFIG", "FW_SCIG"}:
            generator_model = _generator_model(generator, source_profile)
            expected = source_type.removeprefix("FW_")
            if generator_model.get("type") != expected:
                warnings.append(
                    V2MigrationWarning(
                        code="V12-MIG-GEN-003",
                        severity="blokada_migracji",
                        element_ref=generator.ref_id,
                        message_pl=(
                            "Zrodlo wiatrowe V12.xx wymaga zgodnego profilu "
                            f"generatora {expected}."
                        ),
                    )
                )

    for load in sorted(enm.loads, key=lambda item: item.ref_id):
        if load.model == "zip":
            warnings.append(
                V2MigrationWarning(
                    code="V12-MIG-LOAD-001",
                    severity="informacja",
                    element_ref=load.ref_id,
                    message_pl="Odbior ZIP wymaga pelnego kontraktu profilu obciazenia w ENM v2.0.",
                )
            )

    warnings.sort(key=lambda item: (item.code, item.element_ref or ""))
    return warnings


def _quality_for_element(element: object) -> ProjectionQuality:
    if isinstance(
        element, OverheadLine | Cable | Transformer | Source | Generator | Load | Measurement
    ):
        return "pelna" if getattr(element, "catalog_ref", None) else "czesciowa"
    if isinstance(element, ProtectionAssignment):
        return "pelna" if element.catalog_ref and element.ct_ref else "czesciowa"
    if isinstance(element, BranchPointSN):
        return "pelna" if element.catalog_ref else "czesciowa"
    return "pelna"


def _readiness_for_element(element: object) -> ReadinessStatus:
    if isinstance(element, OverheadLine | Cable | Transformer | Source):
        return "gotowy" if getattr(element, "catalog_ref", None) else "wymaga_uzupelnienia"
    if isinstance(element, Generator):
        if element.gen_type in _converter_generator_types() and not element.catalog_ref:
            return "wymaga_uzupelnienia"
    if isinstance(element, ProtectionAssignment) and not element.ct_ref:
        return "wymaga_uzupelnienia"
    return "gotowy"


def _converter_generator_types() -> set[str]:
    return {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}


def _source_type_for_generator(generator: Generator) -> str:
    mapping = {
        "pv_inverter": "PV",
        "bess": "BESS",
        "wind_inverter": "FW",
        "fw_pmsg": "FW_PMSG",
        "fw_dfig": "FW_DFIG",
        "fw_scig": "FW_SCIG",
        "synchronous": "SYNCHRONICZNE",
    }
    return mapping.get(str(generator.gen_type or "").lower(), "NIEOKRESLONE")


def _materialized_section(element: object, key: str) -> dict | None:
    materialized = getattr(element, "materialized_params", None)
    if not isinstance(materialized, dict):
        return None
    section = materialized.get(key)
    return section if isinstance(section, dict) else None


def _profile_source(element: object) -> str:
    source_mode = getattr(element, "source_mode", None)
    parameter_source = getattr(element, "parameter_source", None)
    if source_mode:
        return str(source_mode)
    if parameter_source:
        return str(parameter_source)
    return "MIGRACJA"


def _generator_model(
    generator: Generator,
    source_profile: dict | None,
) -> dict:
    profile_model = source_profile.get("generator_model") if source_profile else None
    if isinstance(profile_model, dict):
        normalized = _normalize_generator_model(
            profile_model.get("type")
            or profile_model.get("technology")
            or profile_model.get("generator_type")
        )
        if normalized:
            return {**profile_model, "type": normalized}
        return dict(profile_model)

    source_type = _source_type_for_generator(generator)
    if source_type.startswith("FW_"):
        return {"type": source_type.removeprefix("FW_"), "source": "gen_type"}
    if source_type in {"PV", "BESS", "FW"}:
        return {"type": source_type, "source": "gen_type"}
    return {"type": "NIEOKRESLONE", "source": "migration_default"}


def _normalize_generator_model(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().upper().replace("-", "_")
    normalized = normalized.removeprefix("FW_")
    if normalized in {"PMSG", "DFIG", "SCIG", "PV", "BESS", "FW"}:
        return normalized
    return normalized or None


def _source_profile_quality(
    generator: Generator,
    source_profile: dict | None,
) -> ProjectionQuality:
    if not generator.catalog_ref:
        return "czesciowa"
    if source_profile is None:
        return "czesciowa"
    required = {"frt", "q_u", "cos_phi_p"}
    if required <= set(source_profile):
        return "pelna"
    return "czesciowa"


__all__ = [
    "EnergyNetworkModelV2Projection",
    "V2ElementReference",
    "V2Header",
    "V2MigrationWarning",
    "V2OperatingVariant",
    "V2ProjectionSummary",
    "V2SwitchingDeviceState",
    "V2SwitchingStateSnapshot",
    "V2ZeroSequenceConfig",
    "compute_v2_projection_hash",
    "project_enm_v1_to_v2",
]

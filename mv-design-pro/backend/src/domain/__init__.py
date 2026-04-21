"""Domain layer for MV-DESIGN-PRO."""

from .analysis_run import AnalysisRun
from .element_ref import CatalogRefV1, ElementRefV1, ElementScopeV1, ElementTypeV1
from .export_manifest import ExportManifestV1, build_export_manifest
from .field_device import (
    AparatTypeV1,
    FieldRoleV1,
    PoleTypeV1,
    validate_generator_field_connection,
)
from .field_device import (
    DeviceTypeV1 as FieldDeviceTypeV1,
)
from .grounding import Grounding
from .limits import Limits
from .models import (
    Network,
    OperatingCase,
    Project,
    Scenario,
    StudyCase,
    StudyRun,
)
from .project_design_mode import ProjectDesignMode
from .readiness import (
    ReadinessAreaV1,
    ReadinessGateError,
    ReadinessIssueV1,
    ReadinessPriority,
    ReadinessProfileV1,
    build_readiness_profile,
    require_devices_parametrized,
    require_export_ready,
    require_fields_complete,
    require_load_flow_ready,
    require_protection_bindings,
    require_pv_bess_transformer_rule,
    require_short_circuit_ready,
    require_sld_ready,
)
from .result_join import (
    InspectorFactV1,
    ResultJoinV1,
    SldOverlayTokenV1,
    join_results,
)
from .result_set import OverlayElement, OverlayLegendEntry, OverlayPayloadV1
from .sld import SldAnnotation, SldBranchSymbol, SldDiagram, SldNodeSymbol
from .sources import Source
from .station_field_validation import (
    DeviceBindingV1 as StationDeviceBindingV1,
)
from .station_field_validation import (
    FieldDeviceV1 as StationFieldDeviceV1,
)
from .station_field_validation import (
    StationFieldV1,
    StationValidationInputV1,
    validate_pv_bess_variant_a,
    validate_pv_bess_variant_b,
    validate_station_fields,
)
from .study_case_delta import (
    DeltaOverlay,
    DeltaOverlayToken,
    FieldChange,
    compute_delta,
)
from .substation import SubstationMetadata
from .switchgear_config import (
    SWITCHGEAR_CONFIG_VERSION,
    CatalogBindingV1,
    ConfigFixActionV1,
    ConfigIssueSeverity,
    ConfigValidationIssueV1,
    DeviceConfigV1,
    FieldConfigV1,
    FixActionType,
    ProtectionBindingV1,
    SwitchgearConfigV1,
    SwitchgearConfigValidationCode,
    SwitchgearConfigValidationResultV1,
    canonicalize_config,
    compute_config_hash,
    validate_switchgear_config,
)
from .units import BaseQuantities, UnitSystem
from .validation import ValidationIssue, ValidationReport

__all__ = [
    "BaseQuantities",
    "CatalogRefV1",
    "ElementRefV1",
    "ElementScopeV1",
    "ElementTypeV1",
    "ExportManifestV1",
    "Grounding",
    "AnalysisRun",
    "InspectorFactV1",
    "Limits",
    "OverlayElement",
    "OverlayLegendEntry",
    "OverlayPayloadV1",
    "Network",
    "OperatingCase",
    "Project",
    "ProjectDesignMode",
    "ReadinessAreaV1",
    "ReadinessGateError",
    "ReadinessIssueV1",
    "ReadinessPriority",
    "ReadinessProfileV1",
    "ResultJoinV1",
    "Scenario",
    "SldOverlayTokenV1",
    "Source",
    "StudyCase",
    "StudyRun",
    "SubstationMetadata",
    "SldAnnotation",
    "SldBranchSymbol",
    "SldDiagram",
    "SldNodeSymbol",
    "UnitSystem",
    "ValidationIssue",
    "ValidationReport",
    "build_export_manifest",
    "build_readiness_profile",
    "join_results",
    "require_devices_parametrized",
    "require_export_ready",
    "require_fields_complete",
    "require_load_flow_ready",
    "require_protection_bindings",
    "require_pv_bess_transformer_rule",
    "require_short_circuit_ready",
    "require_sld_ready",
    # Station field validation (RUN #3G)
    "StationDeviceBindingV1",
    "StationFieldDeviceV1",
    "StationFieldV1",
    "StationValidationInputV1",
    "validate_pv_bess_variant_a",
    "validate_pv_bess_variant_b",
    "validate_station_fields",
    # Field/Device (RUN #3F)
    "AparatTypeV1",
    "FieldDeviceTypeV1",
    "FieldRoleV1",
    "PoleTypeV1",
    "validate_generator_field_connection",
    # SwitchgearConfig (RUN #3I)
    "SWITCHGEAR_CONFIG_VERSION",
    "CatalogBindingV1",
    "ConfigFixActionV1",
    "ConfigIssueSeverity",
    "ConfigValidationIssueV1",
    "DeviceConfigV1",
    "FieldConfigV1",
    "FixActionType",
    "ProtectionBindingV1",
    "SwitchgearConfigV1",
    "SwitchgearConfigValidationCode",
    "SwitchgearConfigValidationResultV1",
    "canonicalize_config",
    "compute_config_hash",
    "validate_switchgear_config",
    # Study Case Delta
    "DeltaOverlay",
    "DeltaOverlayToken",
    "FieldChange",
    "compute_delta",
]

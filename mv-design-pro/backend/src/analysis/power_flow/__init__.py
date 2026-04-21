"""Power flow solver (Newton-Raphson) public API."""

from .result import PowerFlowResult
from .solver import PowerFlowSolver, solve_power_flow
from .types import (
    BranchLimitSpec,
    BusVoltageLimitSpec,
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
    SlackSpec,
    TransformerTapSpec,
)
from .violations import (
    BusInfo,
    ViolationType,
    VoltageViolation,
    VoltageViolationsDetector,
    VoltageViolationsResult,
)
from .violations_report import (
    add_violations_section_to_pdf,
    export_violations_report_to_bytes,
    export_violations_report_to_pdf,
)

__all__ = [
    "PowerFlowInput",
    "PowerFlowOptions",
    "PowerFlowResult",
    "PowerFlowSolver",
    "solve_power_flow",
    "SlackSpec",
    "PQSpec",
    "PVSpec",
    "ShuntSpec",
    "TransformerTapSpec",
    "BusVoltageLimitSpec",
    "BranchLimitSpec",
    # Violations detection
    "BusInfo",
    "ViolationType",
    "VoltageViolation",
    "VoltageViolationsDetector",
    "VoltageViolationsResult",
    # Violations report
    "add_violations_section_to_pdf",
    "export_violations_report_to_bytes",
    "export_violations_report_to_pdf",
]

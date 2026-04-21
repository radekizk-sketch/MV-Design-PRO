"""P22: Power Flow Interpretation Layer.

Warstwa interpretacji wynikow rozplywu mocy:
- Czytelna inzyniersko
- Audytowalna
- Deterministyczna
- Gotowa do A/B porownan

USAGE:
    from analysis.power_flow_interpretation import (
        PowerFlowInterpretationBuilder,
        PowerFlowInterpretationResult,
        FindingSeverity,
    )

    builder = PowerFlowInterpretationBuilder(context=context)
    interpretation = builder.build(power_flow_result, run_id)

    # Serialize to dict
    result_dict = interpretation.to_dict()
"""

from analysis.power_flow_interpretation.builder import (
    INTERPRETATION_VERSION,
    PowerFlowInterpretationBuilder,
)
from analysis.power_flow_interpretation.models import (
    BranchLoadingFinding,
    FindingSeverity,
    InterpretationContext,
    InterpretationRankedItem,
    InterpretationSummary,
    InterpretationThresholds,
    InterpretationTrace,
    PowerFlowInterpretationResult,
    VoltageFinding,
)
from analysis.power_flow_interpretation.serializer import (
    SEVERITY_ORDER,
    result_to_dict,
)

__all__ = [
    # Builder
    "INTERPRETATION_VERSION",
    "PowerFlowInterpretationBuilder",
    # Models
    "BranchLoadingFinding",
    "FindingSeverity",
    "InterpretationContext",
    "InterpretationRankedItem",
    "InterpretationSummary",
    "InterpretationThresholds",
    "InterpretationTrace",
    "PowerFlowInterpretationResult",
    "VoltageFinding",
    # Serializer
    "result_to_dict",
    "SEVERITY_ORDER",
]

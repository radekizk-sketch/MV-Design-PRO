from __future__ import annotations

from collections.abc import Callable

from application.analyses.design_synth.envelope_adapter import (
    to_run_envelope as design_synth_to_run_envelope,
)
from application.analyses.energy_validation.envelope_adapter import (
    to_run_envelope as energy_validation_to_run_envelope,
)
from application.analyses.iec60909.envelope_adapter import (
    to_run_envelope as iec60909_to_run_envelope,
)
from application.analyses.protection.catalog.envelope_adapter import (
    to_run_envelope as protection_device_mapping_to_run_envelope,
)
from application.analyses.protection.overcurrent.envelope_adapter import (
    to_run_envelope as protection_overcurrent_to_run_envelope,
)
from application.analyses.run_envelope import AnalysisRunEnvelope

AdapterFn = Callable[..., AnalysisRunEnvelope]

RUN_ENVELOPE_ADAPTERS: dict[str, AdapterFn] = {
    "design_synth.connection_study": design_synth_to_run_envelope,
    "short_circuit.iec60909": iec60909_to_run_envelope,
    "protection.overcurrent.v0": protection_overcurrent_to_run_envelope,
    "protection.device_mapping.v0": protection_device_mapping_to_run_envelope,
    "energy_validation.v0": energy_validation_to_run_envelope,
}


def get_run_envelope_adapter(analysis_type: str) -> AdapterFn | None:
    return RUN_ENVELOPE_ADAPTERS.get(analysis_type)

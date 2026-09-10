"""CV-3.3-B: `AnalysisRunService` (orkiestracja PF/SC na R2 `analysis_runs`,
własny asembler/solver-invoker na legacy grafie sieci) usunięty — jedyni
prawdziwi konsumenci (`power_flow_comparison`, `protection_comparison`) czytają
odtąd R1 (`enm.canonical_analysis`) bezpośrednio. `read_model.py` zostaje: to
czyste funkcje interpretacji śladu, reużywane przez R1-owe widoki biegów
(`api/analysis_runs.py`, `api/canonical_run_views.py`)."""

from .read_model import (
    build_deterministic_id,
    build_input_metadata,
    build_trace_summary,
    canonicalize_json,
    get_run_trace,
    minimize_summary,
)

__all__ = [
    "build_deterministic_id",
    "build_input_metadata",
    "build_trace_summary",
    "canonicalize_json",
    "get_run_trace",
    "minimize_summary",
]

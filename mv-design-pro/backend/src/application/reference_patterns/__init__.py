"""
Reference Patterns Package — Wzorce odniesienia

Engineering benchmark patterns for validating protection methodology.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Patterns are INTERPRETATION layer components.
- WHITE BOX: Full trace of validation steps.
- DETERMINISM: Same inputs → identical outputs.

AVAILABLE PATTERNS:
- Pattern A (RP-LINE-I2-THERMAL-SPZ): Dobór I>> dla linii SN
  Validates: selectivity, sensitivity, thermal criteria, SPZ blocking
- Pattern C (RP-LOC-GEN-IMPACT): Wpływ generacji lokalnej na zabezpieczenia SN
  Validates: fault current change, busbar blocking risk, selectivity impact

NO CODENAMES IN UI/PROOF.
"""

from .base import (
    CheckStatus,
    # Result class
    ReferencePatternResult,
    # Types
    ReferenceVerdict,
    build_check,
    build_trace_step,
    compare_results_deterministic,
    stable_json,
    # Helpers
    stable_sort_dict,
)
from .pattern_line_i_doubleprime_thermal_spz import (
    NARROW_WINDOW_THRESHOLD,
    PATTERN_A_FIXTURES_SUBDIR,
    # Constants
    PATTERN_ID,
    PATTERN_NAME_PL,
    # Validator
    LineIDoublePrimeReferencePattern,
    fixture_to_input,
    get_pattern_a_fixtures_dir,
    # Fixture utilities
    load_fixture,
    # Public API
    run_pattern_a,
)
from .reporting import (
    # Metadata type
    ReportMetadata,
    # Report generators
    export_reference_pattern_to_docx,
    export_reference_pattern_to_pdf,
)
from .wzorzec_c_generacja_lokalna import (
    PATTERN_C_FIXTURES_SUBDIR,
    # Constants
    PATTERN_C_ID,
    PATTERN_C_NAME_PL,
    PROG_GRANICZNY_PCT,
    PROG_INFORMACYJNY_PCT,
    PROG_REZERWY_SELEKTYWNOSCI_PCT,
    DaneZwarciowePunktuZabezpieczenia,
    NastawyZabezpieczen,
    # Types
    TypGeneracji,
    # Validator
    WzorzecCGeneracjaLokalna,
    WzorzecCInput,
    ZrodloGeneracji,
    fixture_to_input_c,
    get_pattern_c_fixtures_dir,
    # Fixture utilities
    load_fixture_c,
    # Public API
    run_pattern_c,
)

__all__ = [
    # Types
    "ReferenceVerdict",
    "CheckStatus",
    # Result
    "ReferencePatternResult",
    # Helpers
    "stable_sort_dict",
    "stable_json",
    "compare_results_deterministic",
    "build_check",
    "build_trace_step",
    # Pattern A
    "PATTERN_ID",
    "PATTERN_NAME_PL",
    "NARROW_WINDOW_THRESHOLD",
    "PATTERN_A_FIXTURES_SUBDIR",
    "LineIDoublePrimeReferencePattern",
    "run_pattern_a",
    "load_fixture",
    "fixture_to_input",
    "get_pattern_a_fixtures_dir",
    # Pattern C
    "PATTERN_C_ID",
    "PATTERN_C_NAME_PL",
    "PATTERN_C_FIXTURES_SUBDIR",
    "PROG_INFORMACYJNY_PCT",
    "PROG_GRANICZNY_PCT",
    "PROG_REZERWY_SELEKTYWNOSCI_PCT",
    "TypGeneracji",
    "ZrodloGeneracji",
    "DaneZwarciowePunktuZabezpieczenia",
    "NastawyZabezpieczen",
    "WzorzecCInput",
    "WzorzecCGeneracjaLokalna",
    "run_pattern_c",
    "load_fixture_c",
    "fixture_to_input_c",
    "get_pattern_c_fixtures_dir",
    # Reporting
    "export_reference_pattern_to_docx",
    "export_reference_pattern_to_pdf",
    "ReportMetadata",
]

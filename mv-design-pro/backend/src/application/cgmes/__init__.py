"""
CGMES application service — deterministic EQ + TP + side-car ZIP orchestration.

Import/Export = NOT-A-SOLVER. Zero new physics. This layer imports neither
solvers nor analysis.
"""

from __future__ import annotations

from .service import (
    CGMES_FORMAT_ID,
    build_refmap,
    export_cgmes,
    import_cgmes,
    verify_cgmes_integrity,
)

__all__ = [
    "CGMES_FORMAT_ID",
    "build_refmap",
    "export_cgmes",
    "import_cgmes",
    "verify_cgmes_integrity",
]

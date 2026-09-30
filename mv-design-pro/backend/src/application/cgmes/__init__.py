"""
CGMES application service — deterministic EQ + TP + side-car ZIP orchestration.

Import/Export = NOT-A-SOLVER. Zero new physics. This layer imports neither
solvers nor analysis.
"""

from __future__ import annotations

from .kompletnosc import (
    BrakKompletnosciCgmes,
    ModelNiekompletnyDlaCgmesError,
    braki_kompletnosci_cgmes,
)
from .service import (
    CGMES_FORMAT_ID,
    build_refmap,
    export_cgmes,
    import_cgmes,
    verify_cgmes_integrity,
)

__all__ = [
    "BrakKompletnosciCgmes",
    "ModelNiekompletnyDlaCgmesError",
    "braki_kompletnosci_cgmes",
    "CGMES_FORMAT_ID",
    "build_refmap",
    "export_cgmes",
    "import_cgmes",
    "verify_cgmes_integrity",
]

"""
CGMES (CIM 3.0 / CIM100) import-export — EQ + TP profiles (D-02).

Greenfield CIM/CGMES support for the EnergyNetworkModel:
  - deterministic export (canonical RDF/XML, no timestamps, sorted attributes)
  - tolerant import (third-party EQ+TP) + lossless internal round-trip (side-car)

SSH / SV / DL profiles and full IEC 61968 are DEFERRED (see profiles.py).
This package contains ZERO physics and imports neither solvers nor analysis.
"""

from __future__ import annotations

from .cgmes_exporter import build_eq_tp_trees, export_eq_tp_bytes
from .cgmes_importer import (
    CgmesImportResult,
    CgmesImportStatus,
    import_from_eq_tp,
    import_from_side_car,
)
from .mrid import mrid_for, urn
from .refmap import CgmesRefMap
from .units import fmt_float

__all__ = [
    "build_eq_tp_trees",
    "export_eq_tp_bytes",
    "import_from_eq_tp",
    "import_from_side_car",
    "CgmesImportResult",
    "CgmesImportStatus",
    "CgmesRefMap",
    "mrid_for",
    "urn",
    "fmt_float",
]

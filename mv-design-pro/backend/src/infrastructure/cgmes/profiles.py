"""
CIM / CGMES profile constants and namespace URIs.

Scope (D-02): EQ (Equipment) + TP (Topology) profiles only.
SSH (SteadyStateHypothesis), SV (StateVariables) and DL (DiagramLayout) are
DEFERRED — see module ``DEFERRED_PROFILES`` and the side-car for ENM-only data.

The constants are pinned to a single CIM version (CIM100 / CGMES 3.0) so the
serialization is deterministic and versioned. The exporter MUST NOT emit any
non-standard ``cim:`` class; ENM-specific concepts live in the side-car.

This module contains ZERO physics and imports neither solvers nor analysis.
"""

from __future__ import annotations

from typing import Final

# ---------------------------------------------------------------------------
# CIM version identity (CGMES 3.0 / CIM100)
# ---------------------------------------------------------------------------

CIM_VERSION: Final[str] = "CIM100"
CGMES_VERSION: Final[str] = "3.0.0"

# Canonical RDF / CIM namespace URIs. Stable across exports → deterministic.
NS_CIM: Final[str] = "http://iec.ch/TC57/CIM100#"
NS_RDF: Final[str] = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
NS_MD: Final[str] = "http://iec.ch/TC57/61970-552/ModelDescription/1#"

# Fixed prefix → URI map. Order is fixed for deterministic header emission.
NAMESPACES: Final[dict[str, str]] = {
    "cim": NS_CIM,
    "rdf": NS_RDF,
    "md": NS_MD,
}

# ---------------------------------------------------------------------------
# Profile identity (CGMES 3.0 profile URIs)
# ---------------------------------------------------------------------------

PROFILE_EQ: Final[str] = "http://iec.ch/TC57/ns/CIM/CoreEquipment-EU/3.0"
PROFILE_TP: Final[str] = "http://iec.ch/TC57/ns/CIM/Topology-EU/3.0"

# Short profile identifiers used in ZIP member names / manifest.
EQ_PROFILE_ID: Final[str] = "EQ"
TP_PROFILE_ID: Final[str] = "TP"

# Profiles intentionally out of scope for D-02. Documented, not emitted.
DEFERRED_PROFILES: Final[dict[str, str]] = {
    "SSH": "http://iec.ch/TC57/ns/CIM/SteadyStateHypothesis-EU/3.0",
    "SV": "http://iec.ch/TC57/ns/CIM/StateVariables-EU/3.0",
    "DL": "http://iec.ch/TC57/ns/CIM/DiagramLayout-EU/3.0",
    "GL": "http://iec.ch/TC57/ns/CIM/GeographicalLocation-EU/3.0",
}

# ---------------------------------------------------------------------------
# RDF attribute / element qnames (pre-expanded for the writer)
# ---------------------------------------------------------------------------

RDF_ABOUT: Final[str] = f"{{{NS_RDF}}}about"
RDF_RESOURCE: Final[str] = f"{{{NS_RDF}}}resource"
RDF_ID: Final[str] = f"{{{NS_RDF}}}ID"
RDF_RDF: Final[str] = f"{{{NS_RDF}}}RDF"

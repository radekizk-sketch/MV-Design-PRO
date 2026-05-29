"""
Deterministic mRID derivation for CGMES objects.

Idiom mirrored from ``enm.mapping._ref_to_uuid`` (uuid5 over NAMESPACE_DNS) but
class-prefixed so that one ENM element expanding into several CIM objects does
NOT collide. For example a single ENM Transformer becomes:

    PowerTransformer:<ref_id>
    PowerTransformerEnd:<ref_id>:1
    PowerTransformerEnd:<ref_id>:2

Each gets a distinct, stable mRID. The mapping mRID -> ref_id is reversible via
the side-car (``refmap.py``); the function here only produces mRIDs.

Determinism: uuid5 is a pure function of its inputs, so the same ENM always
yields the same mRIDs across processes. ZERO physics; no solver/analysis import.
"""

from __future__ import annotations

import uuid


def mrid_for(cim_class: str, ref_id: str, suffix: str | None = None) -> str:
    """Return a deterministic mRID (uuid5 string) for a CIM object.

    Args:
        cim_class: CIM class name (e.g. ``"ConnectivityNode"``).
        ref_id: ENM element ``ref_id`` (the stable identity).
        suffix: optional discriminator for multi-object expansions
            (e.g. transformer end index, terminal index).
    """
    key = f"{cim_class}:{ref_id}"
    if suffix is not None:
        key = f"{key}:{suffix}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, key))


def urn(mrid: str) -> str:
    """Render an mRID as a CIM URN for rdf:resource references."""
    return f"urn:uuid:{mrid}"

"""
CGMES importer: EQ + TP (+ optional side-car) -> EnergyNetworkModel.

Two paths:

  1. INTERNAL round-trip (side-car present): the full ENM canonical JSON is
     restored from the side-car, so the result is byte-identical to the original
     (semantic + input hash equality). ref_id is recovered from the side-car
     identity map. This is the lossless path.

  2. THIRD-PARTY EQ+TP (no side-car): a tolerant reader reconstructs a minimal
     ENM from the standard profiles alone. Because EQ carries no catalog binding,
     every catalog-bound element is materialized via the sanctioned legacy path
     (source_mode="MIGRACJA", parameter_source="MANUAL_EQUIVALENT", catalog_ref=
     None) and the import reports CATALOG_MAPPING_REQUIRED with
     elements_without_catalog populated. Per-km parameters are recovered by
     dividing the SI totals by the (preserved) Conductor.length.

After loading, the ENMValidator is always run and its status surfaced.

The importer is tolerant: unknown elements are ignored, missing optionals fall
back to model defaults, ref_id is recovered from the side-car or derived from
the CIM name. ZERO physics; imports neither solvers nor analysis.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from enum import Enum

from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    FuseBranch,
    Load,
    OverheadLine,
    Source,
    SwitchBranch,
)
from enm.validator import ENMValidator, ValidationResult

from .profiles import NS_CIM, NS_RDF
from .refmap import CgmesRefMap
from .units import (
    total_ohm_to_per_km,
    total_siemens_to_per_km,
    v_to_kv,
    w_to_mw,
)

_CIM = f"{{{NS_CIM}}}"
_RDF_ABOUT = f"{{{NS_RDF}}}about"
_RDF_RESOURCE = f"{{{NS_RDF}}}resource"
_RDF_ID = f"{{{NS_RDF}}}ID"


class CgmesImportStatus(str, Enum):
    """Status of a CGMES import (mirrors ArchiveImportStatus semantics)."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CATALOG_MAPPING_REQUIRED = "CATALOG_MAPPING_REQUIRED"


@dataclass
class CgmesImportResult:
    """Outcome of a CGMES import."""

    status: CgmesImportStatus
    enm: EnergyNetworkModel | None
    validation: ValidationResult | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    elements_without_catalog: list[str] = field(default_factory=list)
    catalog_mapping_required: bool = False
    used_side_car: bool = False


# ---------------------------------------------------------------------------
# XML helpers (namespace-tolerant)
# ---------------------------------------------------------------------------


def _local(tag: str) -> str:
    return tag.rpartition("}")[2]


def _mrid_of(elem: ET.Element) -> str | None:
    rid = elem.get(_RDF_ID) or elem.get(_RDF_ABOUT)
    if rid is None:
        return None
    return rid.replace("urn:uuid:", "").lstrip("#")


def _text(elem: ET.Element, local_name: str) -> str | None:
    for child in elem:
        if _local(child.tag) == local_name:
            return (child.text or "").strip() or None
    return None


def _resource(elem: ET.Element, local_name: str) -> str | None:
    for child in elem:
        if _local(child.tag) == local_name:
            res = child.get(_RDF_RESOURCE)
            if res:
                return res.replace("urn:uuid:", "").lstrip("#")
    return None


def _float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Side-car path (lossless)
# ---------------------------------------------------------------------------


def import_from_side_car(refmap: CgmesRefMap) -> CgmesImportResult:
    """Restore the ENM directly from the side-car (lossless round-trip)."""
    enm = EnergyNetworkModel.model_validate(refmap.enm)
    validation = ENMValidator().validate(enm)
    elements_no_catalog = _elements_without_catalog(enm)
    needs_mapping = bool(elements_no_catalog)
    return CgmesImportResult(
        status=(
            CgmesImportStatus.CATALOG_MAPPING_REQUIRED
            if needs_mapping
            else CgmesImportStatus.SUCCESS
        ),
        enm=enm,
        validation=validation,
        elements_without_catalog=elements_no_catalog,
        catalog_mapping_required=needs_mapping,
        used_side_car=True,
    )


# ---------------------------------------------------------------------------
# Third-party EQ+TP path (tolerant, MIGRACJA)
# ---------------------------------------------------------------------------


def import_from_eq_tp(
    eq_bytes: bytes,
    tp_bytes: bytes,
    *,
    refmap: CgmesRefMap | None = None,
    model_name: str = "Imported CGMES",
) -> CgmesImportResult:
    """Build a minimal ENM from EQ + TP profiles alone (no side-car).

    Catalog-bound elements use the legacy MIGRACJA path and the result reports
    CATALOG_MAPPING_REQUIRED.
    """
    eq_root = ET.fromstring(eq_bytes)
    tp_root = ET.fromstring(tp_bytes)

    # ref_id recovery: side-car map (mrid -> ref) if available, else CIM name.
    mrid_to_ref = dict(refmap.mrid_to_ref) if refmap else {}

    # Index EQ objects by local class name.
    by_class: dict[str, list[ET.Element]] = {}
    for elem in eq_root:
        by_class.setdefault(_local(elem.tag), []).append(elem)

    # BaseVoltage mRID -> kV.
    base_voltage_kv: dict[str, float] = {}
    for bv in by_class.get("BaseVoltage", []):
        mrid = _mrid_of(bv)
        v = _float(_text(bv, "BaseVoltage.nominalVoltage"))
        if mrid and v is not None:
            base_voltage_kv[mrid] = v_to_kv(v)

    # TP: TopologicalNode mRID -> (name, base voltage kV).
    tn_name: dict[str, str] = {}
    tn_voltage: dict[str, float] = {}
    for tn_elem in tp_root:
        if _local(tn_elem.tag) != "TopologicalNode":
            continue
        tn_mrid = _mrid_of(tn_elem)
        if not tn_mrid:
            continue
        tn_name[tn_mrid] = _text(tn_elem, "IdentifiedObject.name") or tn_mrid
        bv_mrid = _resource(tn_elem, "TopologicalNode.BaseVoltage")
        if bv_mrid and bv_mrid in base_voltage_kv:
            tn_voltage[tn_mrid] = base_voltage_kv[bv_mrid]

    # Terminal -> bus (topological node) mapping, gathered from TP bindings.
    terminal_to_tn: dict[str, str] = {}
    for binding in tp_root:
        if _local(binding.tag) != "Terminal":
            continue
        t_mrid = _mrid_of(binding)
        bound_tn = _resource(binding, "Terminal.TopologicalNode")
        if t_mrid and bound_tn:
            terminal_to_tn[t_mrid] = bound_tn

    # Terminal -> equipment mapping (from EQ).
    equip_terminals: dict[str, list[ET.Element]] = {}
    for term in by_class.get("Terminal", []):
        equip = _resource(term, "Terminal.ConductingEquipment")
        if equip:
            equip_terminals.setdefault(equip, []).append(term)

    def ref_of(mrid: str | None, name: str | None) -> str:
        if mrid and mrid in mrid_to_ref:
            return mrid_to_ref[mrid]
        return name or (mrid or "unknown")

    # Buses: one per TopologicalNode.
    buses: list[Bus] = []
    tn_to_busref: dict[str, str] = {}
    for mrid in sorted(tn_name):
        ref = ref_of(mrid, tn_name[mrid])
        tn_to_busref[mrid] = ref
        buses.append(Bus(ref_id=ref, name=tn_name[mrid], voltage_kv=tn_voltage.get(mrid, 0.0)))

    def bus_ref_for_terminal(term_mrid: str | None) -> str | None:
        if term_mrid is None:
            return None
        tn = terminal_to_tn.get(term_mrid)
        if tn is None:
            return None
        return tn_to_busref.get(tn)

    def endpoint_bus_refs(equip_mrid: str) -> tuple[str | None, str | None]:
        terms = sorted(
            equip_terminals.get(equip_mrid, []),
            key=lambda t: _text(t, "ACDCTerminal.sequenceNumber") or "0",
        )
        a = bus_ref_for_terminal(_mrid_of(terms[0])) if terms else None
        b = bus_ref_for_terminal(_mrid_of(terms[1])) if len(terms) > 1 else None
        return a, b

    elements_no_catalog: list[str] = []
    branches: list[OverheadLine | Cable | SwitchBranch | FuseBranch] = []

    # ACLineSegment -> Cable (tolerant default; cable vs line distinction lives
    # in the side-car, so without it we choose Cable and flag MIGRACJA).
    for seg in by_class.get("ACLineSegment", []):
        mrid = _mrid_of(seg)
        if not mrid:
            continue
        name = _text(seg, "IdentifiedObject.name") or mrid
        ref = ref_of(mrid, name)
        length_m = _float(_text(seg, "Conductor.length")) or 0.0
        length_km = length_m / 1000.0
        a, b = endpoint_bus_refs(mrid)
        if a is None or b is None or length_km <= 0:
            continue
        r_total = _float(_text(seg, "ACLineSegment.r")) or 0.0
        x_total = _float(_text(seg, "ACLineSegment.x")) or 0.0
        b_total = _float(_text(seg, "ACLineSegment.bch"))
        r0_total = _float(_text(seg, "ACLineSegment.r0"))
        x0_total = _float(_text(seg, "ACLineSegment.x0"))
        branches.append(
            Cable(
                ref_id=ref,
                name=name,
                from_bus_ref=a,
                to_bus_ref=b,
                length_km=length_km,
                r_ohm_per_km=total_ohm_to_per_km(r_total, length_km),
                x_ohm_per_km=total_ohm_to_per_km(x_total, length_km),
                b_siemens_per_km=(
                    total_siemens_to_per_km(b_total, length_km) if b_total is not None else None
                ),
                r0_ohm_per_km=(
                    total_ohm_to_per_km(r0_total, length_km) if r0_total is not None else None
                ),
                x0_ohm_per_km=(
                    total_ohm_to_per_km(x0_total, length_km) if x0_total is not None else None
                ),
                catalog_ref=None,
                source_mode="MIGRACJA",
                parameter_source="MANUAL_EQUIVALENT",
            )
        )
        elements_no_catalog.append(ref)

    # Switches.
    switch_classes = {
        "Breaker": "breaker",
        "Disconnector": "disconnector",
        "LoadBreakSwitch": "switch",
    }
    for cim_class, enm_type in switch_classes.items():
        for sw in by_class.get(cim_class, []):
            mrid = _mrid_of(sw)
            if not mrid:
                continue
            name = _text(sw, "IdentifiedObject.name") or mrid
            ref = ref_of(mrid, name)
            a, b = endpoint_bus_refs(mrid)
            if a is None or b is None:
                continue
            normal_open = (_text(sw, "Switch.normalOpen") or "false").lower() == "true"
            branches.append(
                SwitchBranch(
                    ref_id=ref,
                    name=name,
                    from_bus_ref=a,
                    to_bus_ref=b,
                    type=enm_type,
                    status="open" if normal_open else "closed",
                )
            )

    # Fuses.
    for fuse in by_class.get("Fuse", []):
        mrid = _mrid_of(fuse)
        if not mrid:
            continue
        name = _text(fuse, "IdentifiedObject.name") or mrid
        ref = ref_of(mrid, name)
        a, b = endpoint_bus_refs(mrid)
        if a is None or b is None:
            continue
        normal_open = (_text(fuse, "Switch.normalOpen") or "false").lower() == "true"
        branches.append(
            FuseBranch(
                ref_id=ref,
                name=name,
                from_bus_ref=a,
                to_bus_ref=b,
                status="open" if normal_open else "closed",
                rated_current_a=_float(_text(fuse, "Switch.ratedCurrent")),
            )
        )

    # Loads -> EnergyConsumer.
    loads: list[Load] = []
    for ec in by_class.get("EnergyConsumer", []):
        mrid = _mrid_of(ec)
        if not mrid:
            continue
        name = _text(ec, "IdentifiedObject.name") or mrid
        ref = ref_of(mrid, name)
        a, _ = endpoint_bus_refs(mrid)
        if a is None:
            continue
        loads.append(
            Load(
                ref_id=ref,
                name=name,
                bus_ref=a,
                p_mw=w_to_mw(_float(_text(ec, "EnergyConsumer.p")) or 0.0),
                q_mvar=w_to_mw(_float(_text(ec, "EnergyConsumer.q")) or 0.0),
            )
        )

    # Sources -> ExternalNetworkInjection.
    sources: list[Source] = []
    for inj in by_class.get("ExternalNetworkInjection", []):
        mrid = _mrid_of(inj)
        if not mrid:
            continue
        name = _text(inj, "IdentifiedObject.name") or mrid
        ref = ref_of(mrid, name)
        a, _ = endpoint_bus_refs(mrid)
        if a is None:
            continue
        r1 = _float(_text(inj, "ExternalNetworkInjection.maxR1"))
        x1 = _float(_text(inj, "ExternalNetworkInjection.maxX1"))
        sources.append(
            Source(
                ref_id=ref,
                name=name,
                bus_ref=a,
                model="external_grid",
                r_ohm=r1,
                x_ohm=x1,
                r0_ohm=_float(_text(inj, "ExternalNetworkInjection.maxR0")),
                x0_ohm=_float(_text(inj, "ExternalNetworkInjection.maxX0")),
                catalog_ref=None,
                source_mode="MIGRACJA",
                parameter_source="MANUAL_EQUIVALENT",
            )
        )
        elements_no_catalog.append(ref)

    enm = EnergyNetworkModel(
        header=ENMHeader(name=model_name),
        buses=buses,
        branches=branches,
        loads=loads,
        sources=sources,
    )
    validation = ENMValidator().validate(enm)
    needs_mapping = bool(elements_no_catalog)
    return CgmesImportResult(
        status=(
            CgmesImportStatus.CATALOG_MAPPING_REQUIRED
            if needs_mapping
            else CgmesImportStatus.SUCCESS
        ),
        enm=enm,
        validation=validation,
        warnings=(
            [f"Import wymaga mapowania katalogowego: {len(elements_no_catalog)} element(ow)."]
            if needs_mapping
            else []
        ),
        elements_without_catalog=sorted(set(elements_no_catalog)),
        catalog_mapping_required=needs_mapping,
        used_side_car=False,
    )


# ---------------------------------------------------------------------------
# Shared catalog gate
# ---------------------------------------------------------------------------


def _elements_without_catalog(enm: EnergyNetworkModel) -> list[str]:
    """Return ref_ids of catalog-bound elements missing a catalog_ref."""
    missing: list[str] = []
    for branch in enm.branches:
        if isinstance(branch, OverheadLine | Cable) and not branch.catalog_ref:
            missing.append(branch.ref_id)
    for trafo in enm.transformers:
        if not trafo.catalog_ref:
            missing.append(trafo.ref_id)
    for source in enm.sources:
        if not source.catalog_ref:
            missing.append(source.ref_id)
    return sorted(set(missing))

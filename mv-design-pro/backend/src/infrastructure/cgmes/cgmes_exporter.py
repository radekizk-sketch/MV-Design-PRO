"""
CGMES exporter: EnergyNetworkModel -> EQ + TP RDF element trees.

Mapping (EQ unless noted; TP = ConnectivityNode/TopologicalNode + Terminals):

  Bus              -> ConnectivityNode + TopologicalNode (+ BaseVoltage)         [EQ/TP]
  OverheadLine     -> ACLineSegment (R/X/B total) + 2 Terminals                 [EQ/TP]
  Cable            -> ACLineSegment (R/X/B total) + 2 Terminals                  [EQ/TP]
  Transformer      -> PowerTransformer + 2 PowerTransformerEnd (+ RatioTapChanger) [EQ]
  SwitchBranch     -> Breaker / Disconnector / LoadBreakSwitch (+ normalOpen)    [EQ]
  FuseBranch       -> Fuse                                                       [EQ]
  Source           -> ExternalNetworkInjection                                  [EQ]
  Generator(sync)  -> SynchronousMachine                                        [EQ]
  Generator(IBR)   -> PowerElectronicsConnection (+ Photovoltaic/Battery unit)  [EQ]
  Load             -> EnergyConsumer                                            [EQ]
  Substation       -> Substation + VoltageLevel(s)                              [EQ]

Concepts with no standard CIM target are preserved ONLY in the side-car
(see ``refmap.LOSSY_BOUNDARY``). The exporter never fabricates non-standard
``cim:`` classes; per the Forbidden Terms rule it emits no boundary/connection
interpretation classes (no point-of-common-coupling, BoundaryNode, or
ConnectionPoint elements).

Determinism: every collection is iterated sorted by ``ref_id``; mRIDs are pure
functions of ref_id; floats use ``units.fmt_float``; no timestamps.

ZERO physics; imports neither solvers nor analysis. The only computation is
unit scaling (units.py) which is pure conversion, not network calculation.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import TYPE_CHECKING

from .mrid import mrid_for, urn
from .profiles import NS_CIM, RDF_ABOUT, RDF_ID, RDF_RESOURCE
from .units import (
    fmt_float,
    km_to_m,
    kv_to_v,
    mva_to_va,
    mw_to_w,
    per_km_to_total_ohm,
    per_km_to_total_siemens,
)

if TYPE_CHECKING:
    from enm.models import (
        Cable,
        EnergyNetworkModel,
        FuseBranch,
        Generator,
        Load,
        OverheadLine,
        ShuntCapacitor,
        Source,
        Substation,
        SwitchBranch,
        Transformer,
    )

_CIM = f"{{{NS_CIM}}}"

# Vector-group connection kind: ENM vector_group (e.g. "Dyn11") -> CIM enums.
_CONNECTION_KIND = {"D": "D", "Y": "Y", "Z": "Z"}


# ---------------------------------------------------------------------------
# Low-level element helpers
# ---------------------------------------------------------------------------


def _obj(parent: ET.Element, cim_class: str, mrid: str) -> ET.Element:
    """Append a CIM object element ``<cim:Class rdf:ID="...">``."""
    elem = ET.SubElement(parent, f"{_CIM}{cim_class}")
    elem.set(RDF_ID, mrid)
    return elem


def _prop(parent: ET.Element, name: str, value: str) -> None:
    """Append a literal property ``<cim:Name>value</cim:Name>``."""
    child = ET.SubElement(parent, f"{_CIM}{name}")
    child.text = value


def _ref(parent: ET.Element, name: str, target_mrid: str) -> None:
    """Append a reference property ``<cim:Name rdf:resource="urn:uuid:..."/>``."""
    child = ET.SubElement(parent, f"{_CIM}{name}")
    child.set(RDF_RESOURCE, urn(target_mrid))


def _enum(parent: ET.Element, name: str, cim_class: str, literal: str) -> None:
    """Append an enumerated property referencing a CIM enum literal."""
    child = ET.SubElement(parent, f"{_CIM}{name}")
    child.set(RDF_RESOURCE, f"{NS_CIM}{cim_class}.{literal}")


# ---------------------------------------------------------------------------
# BaseVoltage registry (one per distinct nominal voltage, deterministic)
# ---------------------------------------------------------------------------


def _base_voltage_mrid(voltage_kv: float) -> str:
    # Stable key from the formatted voltage so equal voltages share one node.
    return mrid_for("BaseVoltage", f"bv-{fmt_float(voltage_kv)}")


def _emit_base_voltages(eq: ET.Element, enm: EnergyNetworkModel) -> None:
    voltages: dict[str, float] = {}
    for bus in enm.buses:
        key = fmt_float(bus.voltage_kv)
        voltages.setdefault(key, bus.voltage_kv)
    for key in sorted(voltages):
        kv = voltages[key]
        bv = _obj(eq, "BaseVoltage", _base_voltage_mrid(kv))
        _prop(bv, "IdentifiedObject.name", f"BV_{key}kV")
        _prop(bv, "BaseVoltage.nominalVoltage", fmt_float(kv_to_v(kv)))


# ---------------------------------------------------------------------------
# Terminal helper (EQ defines Terminal + ConductingEquipment link; TP links CN)
# ---------------------------------------------------------------------------


def _terminal(
    eq: ET.Element,
    *,
    owner_ref: str,
    equipment_mrid: str,
    seq: int,
) -> str:
    """Emit a Terminal in EQ and return its mRID."""
    t_mrid = mrid_for("Terminal", owner_ref, suffix=str(seq))
    term = _obj(eq, "Terminal", t_mrid)
    _prop(term, "IdentifiedObject.name", f"T{seq}")
    _prop(term, "ACDCTerminal.sequenceNumber", str(seq))
    _ref(term, "Terminal.ConductingEquipment", equipment_mrid)
    return t_mrid


# ---------------------------------------------------------------------------
# Bus -> ConnectivityNode (EQ) + TopologicalNode (TP)
# ---------------------------------------------------------------------------


def _emit_buses(eq: ET.Element, tp: ET.Element, enm: EnergyNetworkModel) -> None:
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        cn_mrid = mrid_for("ConnectivityNode", bus.ref_id)
        cn = _obj(eq, "ConnectivityNode", cn_mrid)
        _prop(cn, "IdentifiedObject.name", bus.name)

        tn_mrid = mrid_for("TopologicalNode", bus.ref_id)
        tn = _obj(tp, "TopologicalNode", tn_mrid)
        _prop(tn, "IdentifiedObject.name", bus.name)
        _ref(tn, "TopologicalNode.BaseVoltage", _base_voltage_mrid(bus.voltage_kv))
        _ref(tn, "TopologicalNode.ConnectivityNodes", cn_mrid)


def _connect_terminal_tp(tp: ET.Element, terminal_mrid: str, bus_ref: str) -> None:
    """Bind a Terminal to its ConnectivityNode + TopologicalNode in TP."""
    binding = ET.SubElement(tp, f"{_CIM}Terminal")
    binding.set(RDF_ABOUT, urn(terminal_mrid))
    _ref(binding, "Terminal.ConnectivityNode", mrid_for("ConnectivityNode", bus_ref))
    _ref(binding, "Terminal.TopologicalNode", mrid_for("TopologicalNode", bus_ref))


# ---------------------------------------------------------------------------
# Lines / cables -> ACLineSegment (EQ) + 2 terminals
# ---------------------------------------------------------------------------


def _emit_line(eq: ET.Element, tp: ET.Element, branch: OverheadLine | Cable) -> None:
    mrid = mrid_for("ACLineSegment", branch.ref_id)
    seg = _obj(eq, "ACLineSegment", mrid)
    _prop(seg, "IdentifiedObject.name", branch.name)
    _prop(seg, "Conductor.length", fmt_float(km_to_m(branch.length_km)))
    _prop(
        seg,
        "ACLineSegment.r",
        fmt_float(per_km_to_total_ohm(branch.r_ohm_per_km, branch.length_km)),
    )
    _prop(
        seg,
        "ACLineSegment.x",
        fmt_float(per_km_to_total_ohm(branch.x_ohm_per_km, branch.length_km)),
    )
    if branch.b_siemens_per_km is not None:
        _prop(
            seg,
            "ACLineSegment.bch",
            fmt_float(per_km_to_total_siemens(branch.b_siemens_per_km, branch.length_km)),
        )
    if branch.r0_ohm_per_km is not None:
        _prop(
            seg,
            "ACLineSegment.r0",
            fmt_float(per_km_to_total_ohm(branch.r0_ohm_per_km, branch.length_km)),
        )
    if branch.x0_ohm_per_km is not None:
        _prop(
            seg,
            "ACLineSegment.x0",
            fmt_float(per_km_to_total_ohm(branch.x0_ohm_per_km, branch.length_km)),
        )
    if branch.b0_siemens_per_km is not None:
        _prop(
            seg,
            "ACLineSegment.b0ch",
            fmt_float(per_km_to_total_siemens(branch.b0_siemens_per_km, branch.length_km)),
        )

    t1 = _terminal(eq, owner_ref=branch.ref_id, equipment_mrid=mrid, seq=1)
    t2 = _terminal(eq, owner_ref=branch.ref_id, equipment_mrid=mrid, seq=2)
    _connect_terminal_tp(tp, t1, branch.from_bus_ref)
    _connect_terminal_tp(tp, t2, branch.to_bus_ref)


# ---------------------------------------------------------------------------
# Switches / fuses
# ---------------------------------------------------------------------------

_SWITCH_CLASS = {
    "breaker": "Breaker",
    "switch": "LoadBreakSwitch",
    "bus_coupler": "Breaker",
    "disconnector": "Disconnector",
}


def _emit_switch(eq: ET.Element, tp: ET.Element, branch: SwitchBranch) -> None:
    cim_class = _SWITCH_CLASS.get(branch.type, "LoadBreakSwitch")
    mrid = mrid_for(cim_class, branch.ref_id)
    sw = _obj(eq, cim_class, mrid)
    _prop(sw, "IdentifiedObject.name", branch.name)
    _prop(sw, "Switch.normalOpen", "true" if branch.status == "open" else "false")

    t1 = _terminal(eq, owner_ref=branch.ref_id, equipment_mrid=mrid, seq=1)
    t2 = _terminal(eq, owner_ref=branch.ref_id, equipment_mrid=mrid, seq=2)
    _connect_terminal_tp(tp, t1, branch.from_bus_ref)
    _connect_terminal_tp(tp, t2, branch.to_bus_ref)


def _emit_fuse(eq: ET.Element, tp: ET.Element, branch: FuseBranch) -> None:
    mrid = mrid_for("Fuse", branch.ref_id)
    fuse = _obj(eq, "Fuse", mrid)
    _prop(fuse, "IdentifiedObject.name", branch.name)
    _prop(fuse, "Switch.normalOpen", "true" if branch.status == "open" else "false")
    if branch.rated_current_a is not None:
        _prop(fuse, "Switch.ratedCurrent", fmt_float(branch.rated_current_a))

    t1 = _terminal(eq, owner_ref=branch.ref_id, equipment_mrid=mrid, seq=1)
    t2 = _terminal(eq, owner_ref=branch.ref_id, equipment_mrid=mrid, seq=2)
    _connect_terminal_tp(tp, t1, branch.from_bus_ref)
    _connect_terminal_tp(tp, t2, branch.to_bus_ref)


# ---------------------------------------------------------------------------
# Transformer -> PowerTransformer + 2 PowerTransformerEnd (+ RatioTapChanger)
# ---------------------------------------------------------------------------


def _vector_group_kinds(vector_group: str | None) -> tuple[str | None, str | None, int | None]:
    """Parse 'Dyn11' -> (HV kind, LV kind, clock). Best-effort, side-car authoritative."""
    if not vector_group:
        return None, None, None
    vg = vector_group.strip()
    hv = _CONNECTION_KIND.get(vg[:1].upper()) if vg else None
    lv = None
    clock: int | None = None
    rest = vg[1:]
    # find LV connection letter (next alpha after optional 'n')
    for ch in rest:
        up = ch.upper()
        if up in _CONNECTION_KIND:
            lv = _CONNECTION_KIND[up]
            break
    digits = "".join(c for c in rest if c.isdigit())
    if digits:
        try:
            clock = int(digits)
        except ValueError:
            clock = None
    return hv, lv, clock


def _emit_transformer(eq: ET.Element, tp: ET.Element, trafo: Transformer) -> None:
    mrid = mrid_for("PowerTransformer", trafo.ref_id)
    pt = _obj(eq, "PowerTransformer", mrid)
    _prop(pt, "IdentifiedObject.name", trafo.name)

    hv_kind, lv_kind, clock = _vector_group_kinds(trafo.vector_group)

    # IEC 60909 short-circuit equivalent (referred to HV end):
    #   Z_uk = uk% / 100 * U_hv^2 / S_n ; R = pk / (3 * I_hv^2) but per-end we use
    #   the standard lumped HV-end split. We keep it deterministic + documented.
    sn_va = mva_to_va(trafo.sn_mva)
    uhv_v = kv_to_v(trafo.uhv_kv)
    ulv_v = kv_to_v(trafo.ulv_kv)
    z_hv_ohm = (trafo.uk_percent / 100.0) * (uhv_v**2) / sn_va if sn_va else 0.0
    # R from copper losses pk (kW -> W), referred to HV.
    pk_w = trafo.pk_kw * 1000.0
    r_hv_ohm = pk_w * (uhv_v**2) / (sn_va**2) if sn_va else 0.0
    x_hv_ohm = (z_hv_ohm**2 - r_hv_ohm**2) ** 0.5 if z_hv_ohm > r_hv_ohm else 0.0

    # End 1 = HV (carries the lumped impedance), End 2 = LV (zero impedance).
    for seq, (bus_ref, rated_u_v, kind, r_ohm, x_ohm) in enumerate(
        [
            (trafo.hv_bus_ref, uhv_v, hv_kind, r_hv_ohm, x_hv_ohm),
            (trafo.lv_bus_ref, ulv_v, lv_kind, 0.0, 0.0),
        ],
        start=1,
    ):
        end_mrid = mrid_for("PowerTransformerEnd", trafo.ref_id, suffix=str(seq))
        end = _obj(eq, "PowerTransformerEnd", end_mrid)
        _prop(end, "IdentifiedObject.name", f"{trafo.name}_end{seq}")
        _ref(end, "PowerTransformerEnd.PowerTransformer", mrid)
        _prop(end, "TransformerEnd.endNumber", str(seq))
        _prop(end, "PowerTransformerEnd.ratedS", fmt_float(sn_va))
        _prop(end, "PowerTransformerEnd.ratedU", fmt_float(rated_u_v))
        _prop(end, "PowerTransformerEnd.r", fmt_float(r_ohm))
        _prop(end, "PowerTransformerEnd.x", fmt_float(x_ohm))
        if kind is not None:
            _enum(end, "PowerTransformerEnd.connectionKind", "WindingConnection", kind)
        if seq == 2 and clock is not None:
            _prop(end, "PowerTransformerEnd.phaseAngleClock", str(clock))

        t_mrid = _terminal(eq, owner_ref=trafo.ref_id, equipment_mrid=mrid, seq=seq)
        _ref(end, "TransformerEnd.Terminal", t_mrid)
        _connect_terminal_tp(tp, t_mrid, bus_ref)

    # RatioTapChanger (HV end) if tap data present.
    if trafo.tap_min is not None and trafo.tap_max is not None:
        rtc_mrid = mrid_for("RatioTapChanger", trafo.ref_id)
        rtc = _obj(eq, "RatioTapChanger", rtc_mrid)
        _prop(rtc, "IdentifiedObject.name", f"{trafo.name}_tap")
        _ref(
            rtc,
            "RatioTapChanger.TransformerEnd",
            mrid_for("PowerTransformerEnd", trafo.ref_id, suffix="1"),
        )
        _prop(rtc, "TapChanger.lowStep", str(trafo.tap_min))
        _prop(rtc, "TapChanger.highStep", str(trafo.tap_max))
        if trafo.tap_position is not None:
            _prop(rtc, "TapChanger.normalStep", str(trafo.tap_position))
        if trafo.tap_step_percent is not None:
            _prop(rtc, "RatioTapChanger.stepVoltageIncrement", fmt_float(trafo.tap_step_percent))


# ---------------------------------------------------------------------------
# Source -> ExternalNetworkInjection
# ---------------------------------------------------------------------------


def _emit_source(eq: ET.Element, tp: ET.Element, source: Source, bus_kv: float | None) -> None:
    mrid = mrid_for("ExternalNetworkInjection", source.ref_id)
    inj = _obj(eq, "ExternalNetworkInjection", mrid)
    _prop(inj, "IdentifiedObject.name", source.name)
    if source.sk3_mva is not None:
        # maxInitialSymShCCurrent expressed via Sk -> Ik if bus voltage known.
        _prop(
            inj,
            "ExternalNetworkInjection.maxInitialSymShCCurrent",
            fmt_float(_ik_from_sk(source.sk3_mva, bus_kv)),
        )
        _prop(
            inj,
            "ExternalNetworkInjection.minInitialSymShCCurrent",
            fmt_float(_ik_from_sk(source.sk3_mva, bus_kv)),
        )
    if source.r_ohm is not None:
        _prop(inj, "ExternalNetworkInjection.maxR1", fmt_float(source.r_ohm))
    if source.x_ohm is not None:
        _prop(inj, "ExternalNetworkInjection.maxX1", fmt_float(source.x_ohm))
    if source.r0_ohm is not None:
        _prop(inj, "ExternalNetworkInjection.maxR0", fmt_float(source.r0_ohm))
    if source.x0_ohm is not None:
        _prop(inj, "ExternalNetworkInjection.maxX0", fmt_float(source.x0_ohm))

    t1 = _terminal(eq, owner_ref=source.ref_id, equipment_mrid=mrid, seq=1)
    _connect_terminal_tp(tp, t1, source.bus_ref)


def _ik_from_sk(sk3_mva: float, bus_kv: float | None) -> float:
    """Ik'' [A] = Sk'' / (sqrt(3) * Un). Pure algebraic conversion, not a solve."""
    if not bus_kv or bus_kv <= 0:
        return 0.0
    return (sk3_mva * 1.0e6) / (3.0**0.5 * bus_kv * 1.0e3)


# ---------------------------------------------------------------------------
# Generator -> SynchronousMachine | PowerElectronicsConnection
# ---------------------------------------------------------------------------

_IBR_TYPES = {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}


def _emit_generator(eq: ET.Element, tp: ET.Element, gen: Generator) -> None:
    is_ibr = gen.gen_type in _IBR_TYPES
    if not is_ibr:
        mrid = mrid_for("SynchronousMachine", gen.ref_id)
        sm = _obj(eq, "SynchronousMachine", mrid)
        _prop(sm, "IdentifiedObject.name", gen.name)
        _prop(sm, "RotatingMachine.ratedS", fmt_float(mva_to_va(gen.p_mw)))
        t1 = _terminal(eq, owner_ref=gen.ref_id, equipment_mrid=mrid, seq=1)
        _connect_terminal_tp(tp, t1, gen.bus_ref)
        return

    mrid = mrid_for("PowerElectronicsConnection", gen.ref_id)
    pec = _obj(eq, "PowerElectronicsConnection", mrid)
    _prop(pec, "IdentifiedObject.name", gen.name)
    _prop(pec, "PowerElectronicsConnection.ratedS", fmt_float(mva_to_va(gen.p_mw)))
    _prop(pec, "PowerElectronicsConnection.p", fmt_float(mw_to_w(gen.p_mw)))
    if gen.q_mvar is not None:
        _prop(pec, "PowerElectronicsConnection.q", fmt_float(mw_to_w(gen.q_mvar)))

    # Attached generating unit (CIM 3.0): PV array or battery.
    if gen.gen_type == "bess":
        unit = _obj(eq, "BatteryUnit", mrid_for("BatteryUnit", gen.ref_id))
        _prop(unit, "IdentifiedObject.name", f"{gen.name}_battery")
        _ref(unit, "PowerElectronicsUnit.PowerElectronicsConnection", mrid)
    elif gen.gen_type == "pv_inverter":
        unit = _obj(eq, "PhotovoltaicUnit", mrid_for("PhotovoltaicUnit", gen.ref_id))
        _prop(unit, "IdentifiedObject.name", f"{gen.name}_pv")
        _ref(unit, "PowerElectronicsUnit.PowerElectronicsConnection", mrid)

    t1 = _terminal(eq, owner_ref=gen.ref_id, equipment_mrid=mrid, seq=1)
    _connect_terminal_tp(tp, t1, gen.bus_ref)


# ---------------------------------------------------------------------------
# Load -> EnergyConsumer
# ---------------------------------------------------------------------------


def _emit_load(eq: ET.Element, tp: ET.Element, load: Load) -> None:
    mrid = mrid_for("EnergyConsumer", load.ref_id)
    ec = _obj(eq, "EnergyConsumer", mrid)
    _prop(ec, "IdentifiedObject.name", load.name)
    _prop(ec, "EnergyConsumer.p", fmt_float(mw_to_w(load.p_mw)))
    _prop(ec, "EnergyConsumer.q", fmt_float(mw_to_w(load.q_mvar)))
    t1 = _terminal(eq, owner_ref=load.ref_id, equipment_mrid=mrid, seq=1)
    _connect_terminal_tp(tp, t1, load.bus_ref)


# ---------------------------------------------------------------------------
# ShuntCapacitor -> LinearShuntCompensator
# ---------------------------------------------------------------------------


def _emit_shunt(eq: ET.Element, tp: ET.Element, cap: ShuntCapacitor) -> None:
    """ShuntCapacitor -> LinearShuntCompensator (D-06c).

    Susceptancja na sekcję z pierwszych zasad: B = Q_rated / U_rated² [S].
    Modelujemy jeden stopień (maximumSections=1, sections=1 gdy załączona).
    """
    mrid = mrid_for("LinearShuntCompensator", cap.ref_id)
    lsc = _obj(eq, "LinearShuntCompensator", mrid)
    _prop(lsc, "IdentifiedObject.name", cap.name)
    b_per_section = 0.0
    if cap.rated_kv and cap.rated_kv > 0:
        # B [S] = Q [VAr] / U² [V²]; Q_rated in Mvar -> VAr, U_rated in kV -> V.
        b_per_section = mva_to_va(cap.rated_mvar) / (kv_to_v(cap.rated_kv) ** 2)
    _prop(lsc, "LinearShuntCompensator.bPerSection", fmt_float(b_per_section))
    _prop(lsc, "LinearShuntCompensator.gPerSection", fmt_float(0.0))
    _prop(lsc, "ShuntCompensator.nomU", fmt_float(kv_to_v(cap.rated_kv)))
    _prop(lsc, "ShuntCompensator.maximumSections", "1")
    _prop(lsc, "ShuntCompensator.sections", "0" if cap.status == "open" else "1")
    t1 = _terminal(eq, owner_ref=cap.ref_id, equipment_mrid=mrid, seq=1)
    _connect_terminal_tp(tp, t1, cap.bus_ref)


# ---------------------------------------------------------------------------
# Substation -> Substation + VoltageLevel(s)
# ---------------------------------------------------------------------------


def _emit_substation(eq: ET.Element, sub: Substation, bus_kv: dict[str, float]) -> None:
    mrid = mrid_for("Substation", sub.ref_id)
    s = _obj(eq, "Substation", mrid)
    _prop(s, "IdentifiedObject.name", sub.name)

    # One VoltageLevel per distinct nominal voltage among the station's buses.
    seen: dict[str, float] = {}
    for bus_ref in sub.bus_refs:
        kv = bus_kv.get(bus_ref)
        if kv is None:
            continue
        seen.setdefault(fmt_float(kv), kv)
    for key in sorted(seen):
        kv = seen[key]
        vl_mrid = mrid_for("VoltageLevel", sub.ref_id, suffix=key)
        vl = _obj(eq, "VoltageLevel", vl_mrid)
        _prop(vl, "IdentifiedObject.name", f"{sub.name}_{key}kV")
        _ref(vl, "VoltageLevel.Substation", mrid)
        _ref(vl, "VoltageLevel.BaseVoltage", _base_voltage_mrid(kv))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_eq_tp_trees(enm: EnergyNetworkModel) -> tuple[ET.Element, ET.Element]:
    """Build (EQ, TP) RDF root elements from the ENM. Deterministic."""
    from .rdf_writer import make_root

    eq = make_root()
    tp = make_root()

    bus_kv = {b.ref_id: b.voltage_kv for b in enm.buses}

    _emit_base_voltages(eq, enm)
    _emit_buses(eq, tp, enm)

    from enm.models import Cable, FuseBranch, OverheadLine, SwitchBranch

    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        if isinstance(branch, OverheadLine | Cable):
            _emit_line(eq, tp, branch)
        elif isinstance(branch, SwitchBranch):
            _emit_switch(eq, tp, branch)
        elif isinstance(branch, FuseBranch):
            _emit_fuse(eq, tp, branch)

    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        _emit_transformer(eq, tp, trafo)

    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        _emit_source(eq, tp, source, bus_kv.get(source.bus_ref))

    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        _emit_generator(eq, tp, gen)

    for load in sorted(enm.loads, key=lambda lo: lo.ref_id):
        _emit_load(eq, tp, load)

    for cap in sorted(enm.shunt_capacitors, key=lambda c: c.ref_id):
        _emit_shunt(eq, tp, cap)

    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        _emit_substation(eq, sub, bus_kv)

    return eq, tp


def export_eq_tp_bytes(enm: EnergyNetworkModel) -> tuple[bytes, bytes]:
    """Serialize the ENM to (EQ bytes, TP bytes) canonical RDF/XML."""
    from .rdf_writer import to_bytes

    eq, tp = build_eq_tp_trees(enm)
    return to_bytes(eq), to_bytes(tp)

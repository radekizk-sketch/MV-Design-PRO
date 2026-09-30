"""
CGMES exporter: EnergyNetworkModel -> EQ + TP RDF element trees.

Mapping (EQ unless noted; TP = ConnectivityNode/TopologicalNode + Terminals):

  Bus              -> ConnectivityNode + TopologicalNode (+ BaseVoltage)         [EQ/TP]
  OverheadLine     -> ACLineSegment (R/X/B total) + 2 Terminals                 [EQ/TP]
  Cable            -> ACLineSegment (R/X/B total) + 2 Terminals                  [EQ/TP]
  Transformer      -> PowerTransformer + 2 PowerTransformerEnd (+ RatioTapChanger) [EQ]
  Transformer.tap_changer (V12K-045, regulacja DETC/OLTC)
                   -> RatioTapChanger na końcu uzwojenia regulowanego
                      (+ TapChangerControl, gdy model niesie sterowanie)          [EQ/SSH]
                      — tabela pól i znane utraty: ``_emit_canonical_tap_changer``,
                      ``_emit_tap_changer_control``, ``REGULATOR_ZACZEPOW_UTRATA_TORU_OBCEGO``
  SwitchBranch     -> Breaker / Disconnector / LoadBreakSwitch (+ normalOpen)    [EQ]
  FuseBranch       -> Fuse                                                       [EQ]
  Source           -> ExternalNetworkInjection                                  [EQ]
  Generator(sync)  -> SynchronousMachine                                        [EQ]
  Generator(SCIG)  -> AsynchronousMachine (asynchronousMachineType=generator)    [EQ]
  Generator(IBR)   -> PowerElectronicsConnection (+ PhotoVoltaic/Battery/
                      PowerElectronicsWind unit)                                 [EQ]
  Load             -> EnergyConsumer                                            [EQ]
  Substation       -> Substation + VoltageLevel(s)                              [EQ]

Concepts with no standard CIM target are preserved ONLY in the side-car
(see ``refmap.LOSSY_BOUNDARY``). The exporter never fabricates non-standard
``cim:`` classes; per the Forbidden Terms rule it emits no boundary/connection
interpretation classes (no point-of-common-coupling, BoundaryNode, or
ConnectionPoint elements).

Source short-circuit data (CV-4.3 K7): CIM ``ExternalNetworkInjection`` carries
BOTH ``maxInitialSymShCCurrent`` and ``minInitialSymShCCurrent`` — the profile
DOES have a minimum-scenario attribute (unlike an earlier note in this area
assumed). ``_emit_source`` writes the real MIN value from ``Source.sk3_min_mva``/
``ik3_min_ka`` when the model carries it; when the model does NOT (``None`` — the
OSD never gave S''kQmin/I''kQmin, same condition as readiness code
``source.sk_min_missing``), the attribute is OMITTED, not guessed — CGMES export
never claims min=max and never invents a minimum the model does not declare.
``maxInitialSymShCCurrent``/``minInitialSymShCCurrent`` also derive from ``ik3_ka``/
``ik3_min_ka`` directly when ``sk3_mva``/``sk3_min_mva`` is absent (current-only
source, IEC 60909-0:2016 §6.2.1 eq. 6 read as current — the same data mode
``enm.zrodlo_zwarcie.tryb_danych`` accepts elsewhere in the system). The declared
R/X ratios travel on the standard CIM attributes ``maxR1ToX1Ratio`` (``rx_ratio``,
MAX) and ``minR1ToX1Ratio`` (``rx_ratio_min``, MIN); without them a round-trip
through a third-party importer would silently fall back to the IEC 60909 default
R/X = 0.1 in the mapper — a change of physics the model never declared. The
importer (``cgmes_importer.py``) reads all four attributes back, so the third-party
path (EQ+TP, no side-car) preserves the source's short-circuit declaration:
Sk''-mode sources come back as current-mode (Ik'' = Sk''/(√3·Un), the same
Z_Q in the mapper), Ik''-mode and R+jX-mode sources come back unchanged.

Determinism: every collection is iterated sorted by ``ref_id``; mRIDs are pure
functions of ref_id; floats use ``units.fmt_float``; no timestamps.

ZERO physics; imports neither solvers nor analysis. The only computation is
unit scaling (units.py) which is pure conversion, not network calculation.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import TYPE_CHECKING

from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, liczba_jednostek_zrodla
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import (
    impedancja_z_napiecia_i_mocy_ohm,
    kw_na_mw,
    prad_znamionowy_a,
)

from .mrid import mrid_for, urn
from .profiles import NS_CIM, RDF_ABOUT, RDF_ID, RDF_RESOURCE
from .units import (
    fmt_float,
    ka_to_a,
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

    # Impedancja zwarciowa odniesiona do strony GN (IEC 60076-1): Z_k = uk%/100 · Z_b,
    # R_k = ΔP_Cu/S_n · Z_b, X_k = √(Z_k² − R_k²), Z_b = U_GN²/S_n — baza z recenzowanej
    # formuły ``pochodne`` (karta C3: wzór Z = U²/S nie żyje w infrastrukturze). Stan PRZED
    # podstawiał po cichu Z = 0 przy S_n = 0 i X = 0 przy R_k > Z_k — dane sprzeczne
    # zapisane jako transformator bez reaktancji. Teraz: nazwana odmowa eksportu.
    sn_va = mva_to_va(trafo.sn_mva)
    uhv_v = kv_to_v(trafo.uhv_kv)
    ulv_v = kv_to_v(trafo.ulv_kv)
    if trafo.sn_mva <= 0 or trafo.uhv_kv <= 0:
        raise OdmowaDanychError(
            f"Transformator „{trafo.name}”: moc znamionowa {trafo.sn_mva} MVA i napięcie "
            f"strony GN {trafo.uhv_kv} kV muszą być dodatnie — eksport CGMES niemożliwy."
        )
    z_bazowa_ohm = impedancja_z_napiecia_i_mocy_ohm(trafo.uhv_kv, trafo.sn_mva)
    z_hv_ohm = (trafo.uk_percent / 100.0) * z_bazowa_ohm
    r_hv_ohm = kw_na_mw(trafo.pk_kw) / trafo.sn_mva * z_bazowa_ohm
    if r_hv_ohm > z_hv_ohm:
        raise OdmowaDanychError(
            f"Transformator „{trafo.name}”: straty obciążeniowe {trafo.pk_kw} kW dają "
            f"rezystancję większą niż impedancja zwarciowa (uk = {trafo.uk_percent} %) — dane "
            "sprzeczne; popraw parametry przed eksportem CGMES."
        )
    x_hv_ohm = (z_hv_ohm**2 - r_hv_ohm**2) ** 0.5

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

    if regulator_kanoniczny(trafo):
        _emit_canonical_tap_changer(eq, trafo)
        return

    # RatioTapChanger (HV end) if tap data present — pola legacy `tap_*` dla
    # transformatora BEZ aktywnego regulatora kanonicznego (bajty bez zmian).
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
# Kanoniczny regulator zaczepów (V12K-045) -> RatioTapChanger + TapChangerControl
# ---------------------------------------------------------------------------

#: Rodzaje regulacji, które mają odwzorowanie w CIM (``TapChanger.ltcFlag``).
#: ``NONE`` oznacza „regulatora nie ma" — ``TransformerBranch.get_tap_ratio`` traktuje
#: go identycznie jak brak ``tap_changer`` (fizyka z pól legacy ``tap_*``), a CIM nie
#: zna „przełącznika zaczepów obecnego, lecz bez regulacji" odrębnego od braku obiektu.
_LTC_FLAG: dict[str, str] = {"OLTC": "true", "DETC": "false"}

#: Pola kanonicznego regulatora, których profil CGMES 3.0 (EQ/SSH, CIM100) NIE niesie.
#: Wiązanie z pomiarem: RDFS CGMES 3.0 (pakiet ``pycgmes`` 2.0.6 generowany cimgen z plików
#: ENTSO-E) — klasy ``TapChanger``/``RatioTapChanger``/``TapChangerControl``/
#: ``RegulatingControl`` NIE mają w żadnym profilu atrybutów ``initialDelay``,
#: ``subsequentDelay``, ``lineDropCompensation``, ``lineDropR``, ``lineDropX`` (istnieją
#: w bazowym CIM IEC 61970-301, ale profil ich nie przewiduje, więc eksporter ich nie
#: emituje — zakaz rozszerzeń poza profilem), a ``RegulatingControlModeKind`` nie ma
#: literałów odpowiadających trybom ``PROFILE``/``REMOTE``. Te dane przeżywają WYŁĄCZNIE
#: side-car (tor wewnętrzny, bezstratny); tor obcy EQ+TP je traci — każda pozycja jest
#: przypięta testem ``tests/cgmes/test_cgmes_regulator_zaczepow.py``.
REGULATOR_ZACZEPOW_UTRATA_TORU_OBCEGO: tuple[str, ...] = (
    "tap_changer.delay_seconds — CGMES 3.0 nie ma TapChanger.initialDelay",
    "tap_changer.line_drop_compensation — CGMES 3.0 nie ma TapChangerControl.lineDrop*",
    "tap_changer.control_mode PROFILE/REMOTE — CIM zna tylko regulację włączoną/wyłączoną "
    "(TapChanger.controlEnabled, RegulatingControl.enabled); import odtwarza AUTOMATIC, "
    "fizyka (TapChanger.is_automatic) identyczna",
    "tap_changer.catalog_ref — CIM nie niesie referencji katalogowej",
    "tap_changer z regulation_type=NONE — brak odrębnej semantyki CIM, import daje "
    "tap_changer=None (fizyka identyczna: get_tap_ratio i tak czyta pola legacy)",
    "pola legacy tap_* obok AKTYWNEGO regulatora kanonicznego — jeden RatioTapChanger "
    "na transformator niesie jedno źródło prawdy (kanoniczne, V12K-045)",
    "tap_changer.controlled_bus_ref wskazujący szynę bez żadnego zacisku (Terminal) — "
    "RegulatingControl.Terminal musi wskazać zacisk urządzenia; szyna izolowana go nie ma",
)


def regulator_kanoniczny(trafo: Transformer) -> bool:
    """Czy transformator eksportuje KANONICZNY regulator zaczepów (V12K-045).

    Jedyny predykat wejścia toru kanonicznego eksportu. Jego para po stronie importu to
    obecność ``TapChanger.ltcFlag`` na ``RatioTapChanger`` — eksporter emituje ten
    atrybut WYŁĄCZNIE w torze kanonicznym, tor legacy go nie pisze (bajty modeli bez
    regulatora bez zmian). Zgodność pary przypina test rundy (iloczyn cech).
    """
    tc = trafo.tap_changer
    return tc is not None and tc.regulation_type in _LTC_FLAG


def _sterowanie_regulatora(trafo: Transformer) -> bool:
    """Czy regulator ma obiekt ``TapChangerControl`` — tylko gdy model niesie choć jedno
    pole sterowania: tryb inny niż ręczny, nastawę, pasmo albo szynę regulowaną."""
    tc = trafo.tap_changer
    assert tc is not None
    return (
        tc.control_mode != "MANUAL"
        or tc.voltage_setpoint_kv is not None
        or tc.deadband_kv is not None
        or tc.controlled_bus_ref is not None
    )


def _emit_canonical_tap_changer(eq: ET.Element, trafo: Transformer) -> None:
    """``RatioTapChanger`` na końcu uzwojenia regulowanego — pola kanoniczne 1:1.

    Odwzorowanie (CGMES 3.0; [EQ] profil wyposażenia, [SSH] profil stanu ustalonego):

      regulated_winding HV/LV  -> RatioTapChanger.TransformerEnd = koniec 1 / 2   [EQ]
      regulation_type OLTC/DETC -> TapChanger.ltcFlag true / false               [EQ]
      min/max_position          -> TapChanger.lowStep / highStep                 [EQ]
      neutral_position          -> TapChanger.neutralStep                        [EQ]
      current_position          -> TapChanger.normalStep [EQ] + TapChanger.step  [SSH]
      step_percent              -> RatioTapChanger.stepVoltageIncrement (% U_r)  [EQ]
      control_mode != MANUAL    -> TapChanger.controlEnabled                     [SSH]
      (napięcie znamionowe uzwojenia regulowanego) -> TapChanger.neutralU [V]    [EQ]

    Atrybuty profilu SSH trafiają do członu EQ — ten sam, zastany w repozytorium wzorzec co
    ``EnergyConsumer.p/q`` i ``PowerElectronicsConnection.p/q``: pakiet emituje jeden
    człon wyposażenia (EQ) i topologii (TP), a SSH jest odroczony (``profiles.py``).
    Konwencja znaku zgodna: CIM ``stepVoltageIncrement`` i model ``step_percent`` to
    przyrost napięcia uzwojenia regulowanego na pozycję względem ``neutralStep``.
    """
    tc = trafo.tap_changer
    assert tc is not None
    koniec = "1" if tc.regulated_winding == "HV" else "2"
    rtc = _obj(eq, "RatioTapChanger", mrid_for("RatioTapChanger", trafo.ref_id))
    _prop(rtc, "IdentifiedObject.name", f"{trafo.name}_tap")
    _ref(
        rtc,
        "RatioTapChanger.TransformerEnd",
        mrid_for("PowerTransformerEnd", trafo.ref_id, suffix=koniec),
    )
    _prop(rtc, "TapChanger.ltcFlag", _LTC_FLAG[tc.regulation_type])
    _prop(rtc, "TapChanger.lowStep", str(tc.min_position))
    _prop(rtc, "TapChanger.highStep", str(tc.max_position))
    _prop(rtc, "TapChanger.neutralStep", str(tc.neutral_position))
    _prop(rtc, "TapChanger.normalStep", str(tc.current_position))
    _prop(rtc, "TapChanger.step", str(tc.current_position))
    u_uzwojenia_kv = trafo.uhv_kv if tc.regulated_winding == "HV" else trafo.ulv_kv
    _prop(rtc, "TapChanger.neutralU", fmt_float(kv_to_v(u_uzwojenia_kv)))
    _prop(rtc, "RatioTapChanger.stepVoltageIncrement", fmt_float(tc.step_percent))
    _prop(rtc, "TapChanger.controlEnabled", "false" if tc.control_mode == "MANUAL" else "true")
    if _sterowanie_regulatora(trafo):
        _ref(rtc, "TapChanger.TapChangerControl", mrid_for("TapChangerControl", trafo.ref_id))


def _zaciski_wg_wezla_topologicznego(tp: ET.Element) -> dict[str, list[str]]:
    """TopologicalNode mRID -> posortowane mRID-y zacisków (z powiązań profilu TP)."""
    indeks: dict[str, list[str]] = {}
    prefiks = "urn:uuid:"
    for wiazanie in tp:
        if wiazanie.tag != f"{_CIM}Terminal":
            continue
        zacisk = wiazanie.get(RDF_ABOUT, "").removeprefix(prefiks)
        wezel = wiazanie.find(f"{_CIM}Terminal.TopologicalNode")
        if not zacisk or wezel is None:
            continue
        indeks.setdefault(wezel.get(RDF_RESOURCE, "").removeprefix(prefiks), []).append(zacisk)
    return {wezel: sorted(zaciski) for wezel, zaciski in indeks.items()}


def _zacisk_szyny_regulowanej(
    trafo: Transformer, bus_ref: str, zaciski: dict[str, list[str]]
) -> str | None:
    """Zacisk wskazujący szynę regulowaną w ``RegulatingControl.Terminal``.

    CIM wiąże regulację z ZACISKIEM urządzenia przyłączonego do węzła (nie z węzłem).
    Deterministycznie: szyna własna transformatora -> jego zacisk (1 = GN, 2 = DN);
    szyna zdalna -> najmniejszy mRID zacisku przyłączonego do tej szyny. Szyna bez
    zacisku -> ``None`` (atrybut pominięty, znana utrata — patrz
    ``REGULATOR_ZACZEPOW_UTRATA_TORU_OBCEGO``).
    """
    if bus_ref == trafo.hv_bus_ref:
        return mrid_for("Terminal", trafo.ref_id, suffix="1")
    if bus_ref == trafo.lv_bus_ref:
        return mrid_for("Terminal", trafo.ref_id, suffix="2")
    kandydaci = zaciski.get(mrid_for("TopologicalNode", bus_ref), [])
    return kandydaci[0] if kandydaci else None


def _emit_tap_changer_control(
    eq: ET.Element, trafo: Transformer, zaciski: dict[str, list[str]]
) -> None:
    """``TapChangerControl`` (RegulatingControl) — sterowanie napięciowe regulatora.

      (regulator napięciowy)    -> RegulatingControl.mode = voltage              [EQ]
      controlled_bus_ref        -> RegulatingControl.Terminal                    [EQ]
      control_mode != MANUAL    -> RegulatingControl.enabled                     [SSH]
      (pozycje całkowite)       -> RegulatingControl.discrete = true             [SSH]
      voltage_setpoint_kv       -> RegulatingControl.targetValue [kV]            [SSH]
      deadband_kv (całe pasmo)  -> RegulatingControl.targetDeadband [kV]         [SSH]
      (jednostka nastawy)       -> RegulatingControl.targetValueUnitMultiplier=k [SSH]

    Pole puste w modelu = atrybut POMINIĘTY (nigdy liczba zastępcza). ``targetDeadband``
    w CIM to CAŁE pasmo (100 kV ± 2 kV/2 -> 99…101 kV), tak samo jak ``deadband_kv``
    (``power_flow_oltc_studies``: |U − U_zad| ≤ pasmo/2). Mnożnik ``k`` jest pisany
    tylko wtedy, gdy jest czego dotyczyć (nastawa albo pasmo).
    """
    tc = trafo.tap_changer
    assert tc is not None
    ctrl = _obj(eq, "TapChangerControl", mrid_for("TapChangerControl", trafo.ref_id))
    _prop(ctrl, "IdentifiedObject.name", f"{trafo.name}_regulator")
    _enum(ctrl, "RegulatingControl.mode", "RegulatingControlModeKind", "voltage")
    if tc.controlled_bus_ref is not None:
        zacisk = _zacisk_szyny_regulowanej(trafo, tc.controlled_bus_ref, zaciski)
        if zacisk is not None:
            _ref(ctrl, "RegulatingControl.Terminal", zacisk)
    _prop(ctrl, "RegulatingControl.enabled", "false" if tc.control_mode == "MANUAL" else "true")
    _prop(ctrl, "RegulatingControl.discrete", "true")
    if tc.voltage_setpoint_kv is not None:
        _prop(ctrl, "RegulatingControl.targetValue", fmt_float(tc.voltage_setpoint_kv))
    if tc.deadband_kv is not None:
        _prop(ctrl, "RegulatingControl.targetDeadband", fmt_float(tc.deadband_kv))
    if tc.voltage_setpoint_kv is not None or tc.deadband_kv is not None:
        _enum(ctrl, "RegulatingControl.targetValueUnitMultiplier", "UnitMultiplier", "k")


# ---------------------------------------------------------------------------
# Source -> ExternalNetworkInjection
# ---------------------------------------------------------------------------


def _emit_source(eq: ET.Element, tp: ET.Element, source: Source, bus_kv: float | None) -> None:
    mrid = mrid_for("ExternalNetworkInjection", source.ref_id)
    inj = _obj(eq, "ExternalNetworkInjection", mrid)
    _prop(inj, "IdentifiedObject.name", source.name)
    ik_max_a = _ik_a(source.sk3_mva, source.ik3_ka, bus_kv)
    if ik_max_a is not None:
        _prop(inj, "ExternalNetworkInjection.maxInitialSymShCCurrent", fmt_float(ik_max_a))
    # CV-4.3 K7: scenariusz MIN (IEC 60909-0:2016 §6.2.1) — CIM `ExternalNetworkInjection`
    # NIESIE osobny atrybut `minInitialSymShCCurrent`. Stan PRZED (bug sprzed K7, nie
    # ograniczenie profilu CIM) duplikował tu wartość MAX — eksport twierdził
    # min=max, mimo że model tej równości nie deklarował. Teraz: prawdziwa wartość MIN,
    # gdy źródło ją niesie (`sk3_min_mva`/`ik3_min_ka`); BRAK danych MIN = atrybut
    # POMINIĘTY (zero fabrykacji — eksporter nie zgaduje minimum), to samo założenie co
    # `source.sk_min_missing` w warstwie domenowej (`enm/zrodlo_zwarcie.py`).
    ik_min_a = _ik_a(source.sk3_min_mva, source.ik3_min_ka, bus_kv)
    if ik_min_a is not None:
        _prop(inj, "ExternalNetworkInjection.minInitialSymShCCurrent", fmt_float(ik_min_a))
    # Stosunki R/X deklarowane przez źródło — standardowe atrybuty CIM (`maxR1ToX1Ratio`
    # dla MAX, `minR1ToX1Ratio` dla MIN). Bez nich obcy importer (i nasz tor EQ+TP bez
    # side-cara) traciłby R/X i mapper liczyłby Z_Q z domyślnego R/X = 0,1 IEC 60909 —
    # zmiana fizyki, której model nie zadeklarował. Brak w modelu = atrybut pominięty.
    if source.rx_ratio is not None:
        _prop(inj, "ExternalNetworkInjection.maxR1ToX1Ratio", fmt_float(source.rx_ratio))
    if source.rx_ratio_min is not None:
        _prop(inj, "ExternalNetworkInjection.minR1ToX1Ratio", fmt_float(source.rx_ratio_min))
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


def _ik_a(sk3_mva: float | None, ik3_ka: float | None, bus_kv: float | None) -> float | None:
    """I'' [A] z danych zwarciowych deklarowanych przez źródło (MAX albo MIN, ten sam
    wzorzec dla obu — wołający podaje właściwą parę pól).

    Pierwszeństwo Sk'' nad Ik'' zgodne z `enm.zrodlo_zwarcie.tryb_danych` (ta sama
    kolejność, którą stosuje mapper solvera): Sk'' → Ik'' = Sk''/(√3·Un) — algebra
    czysta, bez współczynnika c (eksport modelu WEJŚCIOWEGO, nie wyniku solvera);
    samo Ik'' → jednostka wprost (kA → A). Brak obu ALBO brak napięcia szyny (Sk''
    bez referencji U nie da się przeliczyć) = `None` — właściwość CIM zostaje
    POMINIĘTA, nie zapisana jako zgadywane 0.
    """
    if sk3_mva is not None:
        if not bus_kv or bus_kv <= 0:
            return None
        return prad_znamionowy_a(sk3_mva, bus_kv)
    if ik3_ka is not None:
        return ka_to_a(ik3_ka)
    return None


# ---------------------------------------------------------------------------
# Generator -> SynchronousMachine | AsynchronousMachine | PowerElectronicsConnection
# ---------------------------------------------------------------------------

#: Źródła energoelektroniczne = kanoniczny zbiór `enm.models.GEN_TYPES_PRZEKSZTALTNIKOWE`
#: (karta AB-H0 Pakiet D: jedno źródło, parytet w `tests/enm/test_gen_types_przeksztaltnikowe.py`).
_IBR_TYPES = GEN_TYPES_PRZEKSZTALTNIKOWE

#: Rodzaj generatora ENM -> (klasa urządzenia CIM, klasa jednostki PowerElectronicsUnit).
#: CGMES 3.0 (RDFS, ``pycgmes`` 2.0.6): turbina wiatrowa typu 1/2 (``fw_scig``, maszyna
#: indukcyjna klatkowa bez przekształtnika) to ``AsynchronousMachine`` (dynamika
#: ``WindTurbineType1or2Dynamics`` wiąże się z maszyną asynchroniczną), typ 3 (``fw_dfig``)
#: i typ 4 (``fw_pmsg``, ``wind_inverter``) to ``PowerElectronicsConnection`` z jednostką
#: ``PowerElectronicsWindUnit`` (``WindTurbineType3or4Dynamics`` wiąże się z PEC). Nazwa
#: klasy jednostki PV w CGMES 3.0 to ``PhotoVoltaicUnit`` (wielkie V) — stan PRZED
#: emitował nieistniejącą klasę ``PhotovoltaicUnit``. ``gen_type=None`` (rodzaj
#: nieokreślony w modelu) -> nazwana ODMOWA eksportu (karta C3): CIM nie ma klasy
#: „generatora nieokreślonego", a każda wybrana klasa zmienia fizykę u odbiorcy (wkład
#: zwarciowy maszyny wirującej albo przekształtnika) — pominięcie zgubiłoby wtrysk mocy.
_KLASA_CIM_GENERATORA: dict[str, tuple[str, str | None]] = {
    "synchronous": ("SynchronousMachine", None),
    "fw_scig": ("AsynchronousMachine", None),
    "pv_inverter": ("PowerElectronicsConnection", "PhotoVoltaicUnit"),
    "bess": ("PowerElectronicsConnection", "BatteryUnit"),
    "wind_inverter": ("PowerElectronicsConnection", "PowerElectronicsWindUnit"),
    "fw_pmsg": ("PowerElectronicsConnection", "PowerElectronicsWindUnit"),
    "fw_dfig": ("PowerElectronicsConnection", "PowerElectronicsWindUnit"),
}

#: Sufiks nazwy obiektu jednostki (nazwy sprzed karty dla PV i baterii bez zmian).
_SUFIKS_JEDNOSTKI: dict[str, str] = {
    "PhotoVoltaicUnit": "pv",
    "BatteryUnit": "battery",
    "PowerElectronicsWindUnit": "wind",
}

#: Dane generatora, których tor obcy EQ+TP NIE odtworzy (side-car je niesie).
GENERATOR_UTRATA_TORU_OBCEGO: tuple[str, ...] = (
    "gen_type fw_pmsg/fw_dfig — EQ zna tylko PowerElectronicsWindUnit (typ 3 od typu 4 "
    "odróżnia profil DY); import daje wind_inverter z ostrzeżeniem",
    "podział mocy znamionowej na jednostki (quantity/n_parallel) — ratedS niesie moc "
    "CAŁEJ instalacji; import: sn_mva = ratedS, jedna jednostka (ta sama moc łączna)",
    "limits (GenLimits), catalog_ref, connection_variant/station_ref/blocking_transformer_ref, "
    "dynamika, modele widmowe, nastawy i deklaracje modułu — brak odpowiednika w EQ",
    "pozostałe klucze materialized_params poza sn_mva i un_kv",
)


def klasa_cim_generatora(gen: Generator) -> str:
    """Klasa urządzenia CIM, na którą eksporter mapuje generator (jedno źródło prawdy —
    ten sam predykat czyta ``application.cgmes.service`` dla mapy tożsamości side-cara).

    Rodzaj nieokreślony (``gen_type=None``) = ``OdmowaDanychError`` (patrz
    ``_KLASA_CIM_GENERATORA``)."""
    return _klasa_i_jednostka(gen)[0]


def _klasa_i_jednostka(gen: Generator) -> tuple[str, str | None]:
    if gen.gen_type is None:
        raise OdmowaDanychError(
            f"Generator „{gen.name}” nie ma określonego rodzaju — uzupełnij rodzaj generatora "
            "przed eksportem CGMES."
        )
    return _KLASA_CIM_GENERATORA[gen.gen_type]


def _konwencja_odbiorcza(wartosc_w: float) -> float:
    """Moc wytwarzana (ENM: dodatnia = oddawana do sieci) -> konwencja odbiorcza CIM
    (``RotatingMachine.p/q``, ``PowerElectronicsConnection.p/q``: „positive sign means
    flow out from a node"). ``0.0 - x`` zamiast ``-x``, żeby zero nie stało się ``-0``."""
    return 0.0 - wartosc_w


def _moc_pozorna_znamionowa_mva(gen: Generator) -> float | None:
    """Moc pozorna znamionowa CAŁEJ instalacji [MVA] — z tabliczki zmaterializowanej karty
    (``materialized_params["sn_mva"]``, moc JEDNEJ jednostki) × liczba jednostek
    (``liczba_jednostek_zrodla``, ta sama reguła co ``enm.mapping._gen_rated_apparent_mva``).
    Brak tabliczki = ``None`` -> atrybut ``ratedS`` POMINIĘTY. Stan PRZED pisał tu moc
    CZYNNĄ ``p_mw`` (P w miejsce S) — obcy program liczyłby prąd znamionowy zaniżony o cosφ.
    """
    sn = (gen.materialized_params or {}).get("sn_mva")
    if isinstance(sn, bool) or not isinstance(sn, int | float) or sn <= 0:
        return None
    return float(sn) * liczba_jednostek_zrodla(gen)


def _napiecie_znamionowe_kv(gen: Generator) -> float | None:
    un = (gen.materialized_params or {}).get("un_kv")
    if isinstance(un, bool) or not isinstance(un, int | float) or un <= 0:
        return None
    return float(un)


def _emit_generator(eq: ET.Element, tp: ET.Element, gen: Generator) -> None:
    """Generator -> urządzenie CIM wg ``_KLASA_CIM_GENERATORA``.

      p_mw (wytwarzanie > 0)       -> RotatingMachine.p / PowerElectronicsConnection.p
                                      [SSH, W, konwencja odbiorcza: −P]
      q_mvar                       -> .q [SSH, var, −Q]; brak = atrybut pominięty
      sn_mva × liczba jednostek    -> .ratedS [EQ, VA]; brak tabliczki = pominięty
      un_kv                        -> .ratedU [EQ, V]; brak = pominięty
      fw_scig                      -> AsynchronousMachine.asynchronousMachineType =
                                      generator [SSH]

    Atrybuty SSH w członie EQ — ten sam zastany wzorzec co ``EnergyConsumer.p/q``.
    """
    klasa, jednostka = _klasa_i_jednostka(gen)
    mrid = mrid_for(klasa, gen.ref_id)
    urzadzenie = _obj(eq, klasa, mrid)
    _prop(urzadzenie, "IdentifiedObject.name", gen.name)
    wlasciciel = "PowerElectronicsConnection" if jednostka is not None else "RotatingMachine"
    moc_s = _moc_pozorna_znamionowa_mva(gen)
    if moc_s is not None:
        _prop(urzadzenie, f"{wlasciciel}.ratedS", fmt_float(mva_to_va(moc_s)))
    un_kv = _napiecie_znamionowe_kv(gen)
    if un_kv is not None:
        _prop(urzadzenie, f"{wlasciciel}.ratedU", fmt_float(kv_to_v(un_kv)))
    _prop(urzadzenie, f"{wlasciciel}.p", fmt_float(_konwencja_odbiorcza(mw_to_w(gen.p_mw))))
    if gen.q_mvar is not None:
        _prop(urzadzenie, f"{wlasciciel}.q", fmt_float(_konwencja_odbiorcza(mw_to_w(gen.q_mvar))))
    if klasa == "AsynchronousMachine":
        _enum(
            urzadzenie,
            "AsynchronousMachine.asynchronousMachineType",
            "AsynchronousMachineKind",
            "generator",
        )
    if jednostka is not None:
        unit = _obj(eq, jednostka, mrid_for(jednostka, gen.ref_id))
        _prop(unit, "IdentifiedObject.name", f"{gen.name}_{_SUFIKS_JEDNOSTKI[jednostka]}")
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

    Susceptancja na sekcję: B = 1/X_C, X_C = U_n²/Q_n — recenzowana formuła U²/S z
    ``pochodne`` (karta C3; stan PRZED liczył Q/U² w infrastrukturze). Bateria 0 Mvar ma
    B = 0 (reaktancja nieskończona — granica wzoru, nie podstawienie). Napięcie ≤ 0 =
    nazwana odmowa (stan PRZED zapisywał po cichu B = 0). Jeden stopień
    (maximumSections=1, sections=1 gdy załączona).
    """
    if cap.rated_kv <= 0:
        raise OdmowaDanychError(
            f"Bateria kondensatorów „{cap.name}”: napięcie znamionowe {cap.rated_kv} kV musi "
            "być dodatnie — eksport CGMES niemożliwy."
        )
    mrid = mrid_for("LinearShuntCompensator", cap.ref_id)
    lsc = _obj(eq, "LinearShuntCompensator", mrid)
    _prop(lsc, "IdentifiedObject.name", cap.name)
    b_per_section = (
        1.0 / impedancja_z_napiecia_i_mocy_ohm(cap.rated_kv, cap.rated_mvar)
        if cap.rated_mvar != 0
        else 0.0
    )
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

    # Sterowanie regulatorów zaczepów na końcu — ``RegulatingControl.Terminal`` może
    # wskazać zacisk DOWOLNEGO urządzenia (szyna zdalna), więc indeks zacisków budujemy
    # z kompletnego profilu TP. Modele bez regulatora kanonicznego: nic nie dochodzi.
    regulatory = [
        t
        for t in sorted(enm.transformers, key=lambda t: t.ref_id)
        if regulator_kanoniczny(t) and _sterowanie_regulatora(t)
    ]
    if regulatory:
        zaciski = _zaciski_wg_wezla_topologicznego(tp)
        for trafo in regulatory:
            _emit_tap_changer_control(eq, trafo, zaciski)

    return eq, tp


def export_eq_tp_bytes(enm: EnergyNetworkModel) -> tuple[bytes, bytes]:
    """Serialize the ENM to (EQ bytes, TP bytes) canonical RDF/XML."""
    from .rdf_writer import to_bytes

    eq, tp = build_eq_tp_trees(enm)
    return to_bytes(eq), to_bytes(tp)

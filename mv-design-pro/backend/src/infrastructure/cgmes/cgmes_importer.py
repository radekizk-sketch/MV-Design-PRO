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
     dividing the SI totals by the (preserved) Conductor.length. Two-winding
     PowerTransformers come back with their canonical tap changer
     (RatioTapChanger + TapChangerControl -> ``Transformer.tap_changer``; the
     field mapping and the named losses live in ``cgmes_exporter``).

After loading, the ENMValidator is always run and its status surfaced.

The importer is tolerant: unknown elements are ignored, missing optionals fall
back to model defaults, ref_id is recovered from the side-car or derived from
the CIM name. ZERO physics; imports neither solvers nor analysis.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Literal

from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    FuseBranch,
    Generator,
    Load,
    OverheadLine,
    ShuntCapacitor,
    Source,
    SwitchBranch,
    TapChanger,
    Transformer,
)
from enm.nazwy_elementow import NAZWA_MODELU_BEZ_NAZWY
from enm.validator import ENMValidator, ValidationResult
from network_model.catalog.governance import brakuje_wymaganej_referencji, wymagalnosc_katalogu
from network_model.pochodne import (
    impedancja_odniesiona_do_napiecia_ohm,
    impedancja_z_napiecia_i_mocy_ohm,
    m_na_km,
    moc_bierna_z_susceptancji_mvar,
    mw_na_kw,
)

from .mrid import KLASY_OBIEKTOW_GLOWNYCH, mrid_for
from .profiles import NS_CIM, NS_RDF
from .refmap import CgmesRefMap
from .units import (
    a_to_ka,
    total_ohm_to_per_km,
    total_siemens_to_per_km,
    v_to_kv,
    va_to_mva,
    w_to_mw,
)

_CIM = f"{{{NS_CIM}}}"
_RDF_ABOUT = f"{{{NS_RDF}}}about"
_RDF_RESOURCE = f"{{{NS_RDF}}}resource"
_RDF_ID = f"{{{NS_RDF}}}ID"


class CgmesImportStatus(StrEnum):
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
    model_name: str = NAZWA_MODELU_BEZ_NAZWY,
) -> CgmesImportResult:
    """Build a minimal ENM from EQ + TP profiles alone (no side-car).

    Catalog-bound elements use the legacy MIGRACJA path and the result reports
    CATALOG_MAPPING_REQUIRED.
    """
    eq_root = ET.fromstring(eq_bytes)
    tp_root = ET.fromstring(tp_bytes)

    # ref_id recovery: side-car map (mrid -> ref) if available, else CIM name.
    mrid_to_ref = _odwrotna_mapa_tozsamosci(refmap) if refmap else {}

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
        length_km = m_na_km(length_m)
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
    #
    # V12K-228: moc odbioru (`EnergyConsumer.p`/`.q`) nalezy w CGMES do profilu
    # STANU USTALONEGO (SteadyStateHypothesis), a nie do EQ/TP. Import bez tego
    # profilu podstawial za brak ZERO, wiec kazdy odbior wchodzil do modelu jako
    # 0 MW — siec wygladala na NIEOBCIAZONA, a rozplyw i spadki napiecia dawaly
    # bezuzytecznie optymistyczny wynik bez zadnego sygnalu, ze danych nie bylo.
    # Kontrakt `Load` wymaga liczby, wiec elementu nie da sie wniesc z brakiem —
    # ale brak MUSI byc NAZWANY w ostrzezeniach importu, bo dopiero wtedy jest
    # decyzja projektanta, a nie cicha podmiana.
    loads: list[Load] = []
    odbiory_bez_stanu_ustalonego: list[str] = []
    for ec in by_class.get("EnergyConsumer", []):
        mrid = _mrid_of(ec)
        if not mrid:
            continue
        name = _text(ec, "IdentifiedObject.name") or mrid
        ref = ref_of(mrid, name)
        a, _ = endpoint_bus_refs(mrid)
        if a is None:
            continue
        p_w = _float(_text(ec, "EnergyConsumer.p"))
        q_w = _float(_text(ec, "EnergyConsumer.q"))
        if p_w is None:
            odbiory_bez_stanu_ustalonego.append(name)
        loads.append(
            Load(
                ref_id=ref,
                name=name,
                bus_ref=a,
                p_mw=w_to_mw(p_w or 0.0),
                q_mvar=w_to_mw(q_w or 0.0),
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
        # CV-4.3 K7: deklaracja zwarciowa źródła czytana W CAŁOŚCI — prądy początkowe
        # MAX/MIN (`*InitialSymShCCurrent`, A -> kA -> `ik3_ka`/`ik3_min_ka`) i stosunki R/X
        # (`maxR1ToX1Ratio`/`minR1ToX1Ratio` -> `rx_ratio`/`rx_ratio_min`). Stan PRZED czytał
        # wyłącznie R1/X1: źródło zadeklarowane mocą/prądem zwarciowym wracało z importu BEZ
        # danych zwarciowych (niepoliczalne, E008), a R/X gubiony po cichu. Atrybut
        # nieobecny = pole `None` (zero fabrykacji) — o trybie danych rozstrzyga
        # `enm.zrodlo_zwarcie.tryb_danych` (R+jX > Sk'' > Ik''), nie importer.
        ik_max_a = _float(_text(inj, "ExternalNetworkInjection.maxInitialSymShCCurrent"))
        ik_min_a = _float(_text(inj, "ExternalNetworkInjection.minInitialSymShCCurrent"))
        sources.append(
            Source(
                ref_id=ref,
                name=name,
                bus_ref=a,
                model="external_grid",
                r_ohm=r1,
                x_ohm=x1,
                ik3_ka=a_to_ka(ik_max_a) if ik_max_a is not None else None,
                rx_ratio=_float(_text(inj, "ExternalNetworkInjection.maxR1ToX1Ratio")),
                ik3_min_ka=a_to_ka(ik_min_a) if ik_min_a is not None else None,
                rx_ratio_min=_float(_text(inj, "ExternalNetworkInjection.minR1ToX1Ratio")),
                r0_ohm=_float(_text(inj, "ExternalNetworkInjection.maxR0")),
                x0_ohm=_float(_text(inj, "ExternalNetworkInjection.maxX0")),
                catalog_ref=None,
                source_mode="MIGRACJA",
                parameter_source="MANUAL_EQUIVALENT",
            )
        )
        elements_no_catalog.append(ref)

    # Transformers -> PowerTransformer + PowerTransformerEnd (+ RatioTapChanger,
    # TapChangerControl). Stan PRZED karty OLTC-U-DOCELOWE/C: tor obcy nie czytał
    # transformatorów WCALE — sieć SN/nN wracała bez transformatorów, a regulator
    # zaczepów (nastawa napięcia docelowego, pasmo, tryb) znikał po cichu.
    ostrzezenia_transformatorow: list[str] = []
    transformers = _importuj_transformatory(
        by_class,
        ref_of=ref_of,
        bus_ref_for_terminal=bus_ref_for_terminal,
        ostrzezenia=ostrzezenia_transformatorow,
    )
    elements_no_catalog.extend(t.ref_id for t in transformers)

    # Generatory i kondensatory (karta OLTC-U-DOCELOWE/C2). Stan PRZED: tor obcy nie
    # czytał ich wcale — źródła wytwórcze i kompensacja znikały po cichu.
    ostrzezenia_elementow: list[str] = []
    generators = _importuj_generatory(
        by_class,
        ref_of=ref_of,
        endpoint_bus_refs=endpoint_bus_refs,
        ostrzezenia=ostrzezenia_elementow,
    )
    elements_no_catalog.extend(g.ref_id for g in generators)
    shunt_capacitors = _importuj_kondensatory(
        by_class,
        ref_of=ref_of,
        endpoint_bus_refs=endpoint_bus_refs,
        ostrzezenia=ostrzezenia_elementow,
    )
    stacje = by_class.get("Substation", [])
    if stacje:
        ostrzezenia_elementow.append(
            f"Stacje nieodtworzone ({len(stacje)}): profil EQ nie niesie rodzaju stacji "
            "(station_type) ani przynależności szyn do stacji — model wymaga obu; "
            "stacje trzeba zdefiniować po imporcie."
        )

    enm = EnergyNetworkModel(
        header=ENMHeader(name=model_name),
        buses=buses,
        branches=branches,
        transformers=transformers,
        loads=loads,
        sources=sources,
        generators=generators,
        shunt_capacitors=shunt_capacitors,
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
        warnings=_ostrzezenia_importu(
            elements_no_catalog=elements_no_catalog,
            odbiory_bez_stanu_ustalonego=odbiory_bez_stanu_ustalonego,
        )
        + ostrzezenia_transformatorow
        + ostrzezenia_elementow,
        elements_without_catalog=sorted(set(elements_no_catalog)),
        catalog_mapping_required=needs_mapping,
        used_side_car=False,
    )


# ---------------------------------------------------------------------------
# Identity recovery (side-car present, EQ+TP path)
# ---------------------------------------------------------------------------


def _odwrotna_mapa_tozsamosci(refmap: CgmesRefMap) -> dict[str, str]:
    """mRID -> ref_id dla KAŻDEGO obiektu głównego, który eksporter mógł wystawić.

    mRID jest czystą funkcją (klasa CIM, ref_id) (``mrid.mrid_for``), więc importer nie
    musi polegać na tym, pod jaką klasą side-car zarejestrował element. Stan PRZED:
    odwzorowanie brało wyłącznie ``refmap.mrid_to_ref`` — szyny (rejestrowane pod
    ConnectivityNode, budowane z TopologicalNode), kondensatory (niezarejestrowane)
    i generator SCIG (zarejestrowany pod klasą, której eksporter już nie emituje)
    wracały z NAZWĄ zamiast ``ref_id``. Wpisy jawne side-cara mają pierwszeństwo.
    """
    refy: set[str] = set(refmap.ref_to_mrid)
    for wartosc in refmap.enm.values():
        if isinstance(wartosc, list):
            refy.update(
                str(e["ref_id"]) for e in wartosc if isinstance(e, dict) and e.get("ref_id")
            )
    mapa = {mrid_for(klasa, ref): ref for ref in sorted(refy) for klasa in KLASY_OBIEKTOW_GLOWNYCH}
    mapa.update(refmap.mrid_to_ref)
    return mapa


# ---------------------------------------------------------------------------
# Generators + shunt capacitors (third-party EQ+TP path)
# ---------------------------------------------------------------------------

#: Klasa jednostki ``PowerElectronicsUnit`` -> rodzaj generatora ENM. Typ z KLASY CIM,
#: nigdy z nazwy. ``PowerElectronicsWindUnit`` nie odróżnia typu 3 (DFIG) od typu 4
#: (to niesie profil DY) — rodzaj ogólny ``wind_inverter`` z nazwanym ostrzeżeniem.
_RODZAJ_Z_JEDNOSTKI: dict[str, str] = {
    "PhotoVoltaicUnit": "pv_inverter",
    "BatteryUnit": "bess",
    "PowerElectronicsWindUnit": "wind_inverter",
}

#: Wynik ``_rodzaj_generatora``: obiekt CIM nie jest generatorem (np. silnik).
_POMIN = "__pomin__"


def _importuj_generatory(
    by_class: dict[str, list[ET.Element]],
    *,
    ref_of: Callable[[str | None, str | None], str],
    endpoint_bus_refs: Callable[[str], tuple[str | None, str | None]],
    ostrzezenia: list[str],
) -> list[Generator]:
    """SynchronousMachine / AsynchronousMachine / PowerElectronicsConnection -> Generator.

    Para eksportu: ``cgmes_exporter._emit_generator`` (tabela pól tam). Moc ``p``/``q``
    w konwencji odbiorczej CIM -> wytwarzanie ENM (znak odwrócony). ``ratedS``/``ratedU``
    -> ``materialized_params`` ``sn_mva``/``un_kv`` (jedna jednostka: ratedS to moc całej
    instalacji), bez atrybutu = klucz nieobecny. Brak ``p`` = 0 MW z NAZWANYM ostrzeżeniem
    (wzorzec odbiorów wyżej; ``Generator.p_mw`` nie przyjmuje braku).
    """
    jednostki: dict[str, list[str]] = {}
    for klasa_jednostki in _RODZAJ_Z_JEDNOSTKI:
        for unit in by_class.get(klasa_jednostki, []):
            pec = _resource(unit, "PowerElectronicsUnit.PowerElectronicsConnection")
            if pec:
                jednostki.setdefault(pec, []).append(klasa_jednostki)

    generatory: list[Generator] = []
    bez_mocy: list[str] = []
    for klasa in ("SynchronousMachine", "AsynchronousMachine", "PowerElectronicsConnection"):
        wlasciciel = (
            "PowerElectronicsConnection"
            if klasa == "PowerElectronicsConnection"
            else "RotatingMachine"
        )
        for elem in by_class.get(klasa, []):
            mrid = _mrid_of(elem)
            if not mrid:
                continue
            name = _text(elem, "IdentifiedObject.name") or mrid
            szyna, _ = endpoint_bus_refs(mrid)
            if szyna is None:
                ostrzezenia.append(f"Generator {name}: brak zacisku z węzłem — pominięty.")
                continue
            rodzaj = _rodzaj_generatora(klasa, elem, jednostki.get(mrid, []), name, ostrzezenia)
            if rodzaj == _POMIN:
                continue
            p_w = _float(_text(elem, f"{wlasciciel}.p"))
            q_w = _float(_text(elem, f"{wlasciciel}.q"))
            s_va = _float(_text(elem, f"{wlasciciel}.ratedS"))
            u_v = _float(_text(elem, f"{wlasciciel}.ratedU"))
            tabliczka: dict[str, float] = {}
            if s_va is not None:
                tabliczka["sn_mva"] = va_to_mva(s_va)
            if u_v is not None:
                tabliczka["un_kv"] = v_to_kv(u_v)
            if p_w is None:
                bez_mocy.append(name)
            generatory.append(
                Generator(
                    ref_id=ref_of(mrid, name),
                    name=name,
                    bus_ref=szyna,
                    p_mw=0.0 - w_to_mw(p_w) if p_w is not None else 0.0,
                    q_mvar=0.0 - w_to_mw(q_w) if q_w is not None else None,
                    gen_type=rodzaj,  # type: ignore[arg-type]
                    materialized_params=tabliczka or None,
                    catalog_ref=None,
                    source_mode="MIGRACJA",
                )
            )
    if bez_mocy:
        ostrzezenia.append(
            f"Brak mocy czynnej w profilu stanu ustalonego dla {len(bez_mocy)} generator(ów) "
            f"— wniesione jako 0 MW: {', '.join(sorted(bez_mocy))}."
        )
    return generatory


def _rodzaj_generatora(
    klasa: str,
    elem: ET.Element,
    klasy_jednostek: list[str],
    name: str,
    ostrzezenia: list[str],
) -> str | None:
    """Rodzaj generatora z KLASY CIM; ``_POMIN`` = element nie jest generatorem."""
    if klasa == "SynchronousMachine":
        return "synchronous"
    if klasa == "AsynchronousMachine":
        rodzaj_maszyny = _enum_literal(elem, "AsynchronousMachine.asynchronousMachineType")
        if rodzaj_maszyny != "generator":
            ostrzezenia.append(
                f"Maszyna asynchroniczna {name}: rodzaj „{rodzaj_maszyny or 'brak'}” zamiast "
                "generatora — model nie ma silnika jako elementu; pominięta."
            )
            return _POMIN
        return "fw_scig"
    rodzaje = sorted(set(klasy_jednostek))
    if len(rodzaje) != 1:
        ostrzezenia.append(
            f"Przekształtnik {name}: jednostki {', '.join(rodzaje) or 'brak'} — rodzaj źródła "
            "nieokreślony (gen_type puste), uzupełnij przed obliczeniami."
        )
        return None
    if rodzaje[0] == "PowerElectronicsWindUnit":
        ostrzezenia.append(
            f"Przekształtnik wiatrowy {name}: profil EQ nie odróżnia typu 3 (DFIG) od typu 4 "
            "— przyjęto przekształtnik pełny (wind_inverter); zweryfikuj rodzaj turbiny."
        )
    return _RODZAJ_Z_JEDNOSTKI[rodzaje[0]]


def _importuj_kondensatory(
    by_class: dict[str, list[ET.Element]],
    *,
    ref_of: Callable[[str | None, str | None], str],
    endpoint_bus_refs: Callable[[str], tuple[str | None, str | None]],
    ostrzezenia: list[str],
) -> list[ShuntCapacitor]:
    """LinearShuntCompensator -> ShuntCapacitor (bateria stała, wszystkie sekcje razem).

    Moc znamionowa Q = B·N·U_n² (U_n = ``nomU``, B = ``bPerSection``, N =
    ``maximumSections``) — ``pochodne.moc_bierna_z_susceptancji_mvar``, para funkcji
    eksportu ``susceptancja_z_mocy_biernej_s``. Status z
    ``sections``: 0 = otwarta, N = załączona. Czego model stałej baterii nie wyrazi
    (dławik B < 0, częściowe załączenie, brak nomU/bPerSection/sections, straty G ≠ 0),
    jest NAZWANE; element niewyrażalny pominięty — nigdy liczba zastępcza.
    """
    kondensatory: list[ShuntCapacitor] = []
    for elem in by_class.get("LinearShuntCompensator", []):
        mrid = _mrid_of(elem)
        if not mrid:
            continue
        name = _text(elem, "IdentifiedObject.name") or mrid
        szyna, _ = endpoint_bus_refs(mrid)
        b_s = _float(_text(elem, "LinearShuntCompensator.bPerSection"))
        u_v = _float(_text(elem, "ShuntCompensator.nomU"))
        sekcje_max = _int(_text(elem, "ShuntCompensator.maximumSections"))
        sekcje = _float(_text(elem, "ShuntCompensator.sections"))
        if szyna is None or b_s is None or u_v is None or sekcje_max is None or sekcje is None:
            brak = [
                etykieta
                for etykieta, wartosc in (
                    ("zacisk", szyna),
                    ("bPerSection", b_s),
                    ("nomU", u_v),
                    ("maximumSections", sekcje_max),
                    ("sections", sekcje),
                )
                if wartosc is None
            ]
            ostrzezenia.append(f"Bateria {name}: brak {', '.join(brak)} — pominięta.")
            continue
        if b_s <= 0 or u_v <= 0 or sekcje_max < 1:
            ostrzezenia.append(
                f"Bateria {name}: bPerSection={b_s} S, nomU={u_v} V, maximumSections="
                f"{sekcje_max} — model przyjmuje wyłącznie baterię kondensatorów; pominięta."
            )
            continue
        if sekcje not in (0.0, float(sekcje_max)):
            ostrzezenia.append(
                f"Bateria {name}: załączone {sekcje:g} z {sekcje_max} sekcji — model stałej "
                "baterii nie wyraża załączenia częściowego; pominięta."
            )
            continue
        g_s = _float(_text(elem, "LinearShuntCompensator.gPerSection"))
        if g_s:
            ostrzezenia.append(
                f"Bateria {name}: konduktancja gPerSection={g_s} S pominięta — model baterii "
                "nie niesie strat."
            )
        rated_kv = v_to_kv(u_v)
        kondensatory.append(
            ShuntCapacitor(
                ref_id=ref_of(mrid, name),
                name=name,
                bus_ref=szyna,
                rated_kv=rated_kv,
                rated_mvar=moc_bierna_z_susceptancji_mvar(b_s * sekcje_max, rated_kv),
                status="open" if sekcje == 0.0 else "closed",
                catalog_ref=None,
                source_mode="MIGRACJA",
                parameter_source="MANUAL_EQUIVALENT",
            )
        )
    return kondensatory


# ---------------------------------------------------------------------------
# Transformers + canonical tap changer (third-party EQ+TP path)
# ---------------------------------------------------------------------------


def _int(value: str | None) -> int | None:
    """Liczba całkowita z tekstu CIM; wartość niecałkowita (np. ciągła pozycja
    ``TapChanger.step``) = ``None`` — nie zaokrąglamy po cichu."""
    liczba = _float(value)
    if liczba is None or not liczba.is_integer():
        return None
    return int(liczba)


def _bool(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.strip().lower() == "true"


def _enum_literal(elem: ET.Element, local_name: str) -> str | None:
    """Literał enumeracji CIM (``...#Klasa.literal`` -> ``literal``)."""
    for child in elem:
        if _local(child.tag) == local_name:
            res = child.get(_RDF_RESOURCE)
            if res:
                return res.rpartition(".")[2]
    return None


#: Mnożnik jednostki ``RegulatingControl.targetValueUnitMultiplier`` -> napięcie w kV.
#: Tylko literały, które dla trybu ``voltage`` mają jednoznaczne przeliczenie na kV;
#: inny albo brak mnożnika = nastawa NIEODCZYTANA (ostrzeżenie), nigdy domysł jednostki.
_MNOZNIK_NA_KV: dict[str, Callable[[float], float]] = {"k": float, "none": v_to_kv}


def _importuj_transformatory(
    by_class: dict[str, list[ET.Element]],
    *,
    ref_of: Callable[[str | None, str | None], str],
    bus_ref_for_terminal: Callable[[str | None], str | None],
    ostrzezenia: list[str],
) -> list[Transformer]:
    """PowerTransformer (2 końce) -> ``Transformer`` w trybie MIGRACJA.

    Impedancja zwarciowa: suma R/X obu końców odniesiona do napięcia końca 1
    (``impedancja_odniesiona_do_napiecia_ohm``), uk% = 100·|Z|/Z_b, ΔP_Cu = R/Z_b·S_n,
    gdzie Z_b = U_1²/S_n (``impedancja_z_napiecia_i_mocy_ohm``) — odwrotność eksportu.
    Koniec o numerze 1 = strona GN (konwencja CGMES: numeracja końców od najwyższego
    napięcia; eksporter pisze tak samo). Grupa połączeń NIE jest odtwarzana: CIM niesie
    ``connectionKind`` i ``phaseAngleClock``, ale eksport nie niesie informacji
    o wyprowadzonym punkcie neutralnym („n"), więc złożenie „Dy11" z „Dyn11" byłoby
    zmianą fizyki składowej zerowej — pole zostaje ``None`` i jest NAZWANE
    w ostrzeżeniu. Każdy pominięty transformator też jest nazwany.
    """
    konce_wg_transformatora: dict[str, list[ET.Element]] = {}
    for koniec in by_class.get("PowerTransformerEnd", []):
        wlasciciel = _resource(koniec, "PowerTransformerEnd.PowerTransformer")
        if wlasciciel:
            konce_wg_transformatora.setdefault(wlasciciel, []).append(koniec)
    rtc_wg_konca: dict[str, ET.Element] = {}
    for rtc in by_class.get("RatioTapChanger", []):
        koniec_mrid = _resource(rtc, "RatioTapChanger.TransformerEnd")
        if koniec_mrid:
            rtc_wg_konca[koniec_mrid] = rtc
    sterowania = {
        mrid: ctrl
        for ctrl in by_class.get("TapChangerControl", [])
        if (mrid := _mrid_of(ctrl)) is not None
    }

    transformatory: list[Transformer] = []
    bez_grupy: list[str] = []
    for pt in by_class.get("PowerTransformer", []):
        mrid = _mrid_of(pt)
        if not mrid:
            continue
        name = _text(pt, "IdentifiedObject.name") or mrid
        ref = ref_of(mrid, name)
        konce = sorted(
            konce_wg_transformatora.get(mrid, []),
            key=lambda k: _int(_text(k, "TransformerEnd.endNumber")) or 0,
        )
        if len(konce) != 2:
            ostrzezenia.append(
                f"Transformator {name}: {len(konce)} końców PowerTransformerEnd — model "
                "przyjmuje wyłącznie transformatory dwuuzwojeniowe; element pominięty."
            )
            continue
        gn, dn = konce
        szyna_gn = bus_ref_for_terminal(_resource(gn, "TransformerEnd.Terminal"))
        szyna_dn = bus_ref_for_terminal(_resource(dn, "TransformerEnd.Terminal"))
        s_va = _float(_text(gn, "PowerTransformerEnd.ratedS"))
        u_gn_v = _float(_text(gn, "PowerTransformerEnd.ratedU"))
        u_dn_v = _float(_text(dn, "PowerTransformerEnd.ratedU"))
        brak = [
            etykieta
            for etykieta, wartosc in (
                ("zacisk strony GN", szyna_gn),
                ("zacisk strony DN", szyna_dn),
                ("ratedS", s_va),
                ("ratedU strony GN", u_gn_v),
                ("ratedU strony DN", u_dn_v),
            )
            if wartosc is None
        ]
        if brak or not s_va or not u_gn_v or not u_dn_v:
            ostrzezenia.append(
                f"Transformator {name}: brak danych {', '.join(brak) or 'niezerowych'} "
                "— element pominięty (bez domysłu parametrów znamionowych)."
            )
            continue
        assert szyna_gn is not None and szyna_dn is not None
        sn_mva = va_to_mva(s_va)
        uhv_kv = v_to_kv(u_gn_v)
        ulv_kv = v_to_kv(u_dn_v)
        z_dn = complex(
            _float(_text(dn, "PowerTransformerEnd.r")) or 0.0,
            _float(_text(dn, "PowerTransformerEnd.x")) or 0.0,
        )
        z_zwarcia = complex(
            _float(_text(gn, "PowerTransformerEnd.r")) or 0.0,
            _float(_text(gn, "PowerTransformerEnd.x")) or 0.0,
        ) + impedancja_odniesiona_do_napiecia_ohm(z_dn, ulv_kv, uhv_kv)
        z_bazowa = impedancja_z_napiecia_i_mocy_ohm(uhv_kv, sn_mva)

        pola_zaczepow = _zaczepy_transformatora(
            name=name,
            konce=(gn, dn),
            rtc_wg_konca=rtc_wg_konca,
            sterowania=sterowania,
            bus_ref_for_terminal=bus_ref_for_terminal,
            ostrzezenia=ostrzezenia,
        )
        transformatory.append(
            Transformer(
                ref_id=ref,
                name=name,
                hv_bus_ref=szyna_gn,
                lv_bus_ref=szyna_dn,
                sn_mva=sn_mva,
                uhv_kv=uhv_kv,
                ulv_kv=ulv_kv,
                uk_percent=100.0 * abs(z_zwarcia) / z_bazowa,
                pk_kw=mw_na_kw(z_zwarcia.real / z_bazowa * sn_mva),
                catalog_ref=None,
                source_mode="MIGRACJA",
                **pola_zaczepow,
            )
        )
        bez_grupy.append(name)
    if bez_grupy:
        ostrzezenia.append(
            f"Grupa połączeń nieodtworzona dla {len(bez_grupy)} transformator(ów): "
            f"{', '.join(sorted(bez_grupy))} — profil nie niesie punktu neutralnego "
            "uzwojeń; uzupełnij grupę połączeń przed obliczeniami składowej zerowej."
        )
    return transformatory


def _zaczepy_transformatora(
    *,
    name: str,
    konce: tuple[ET.Element, ET.Element],
    rtc_wg_konca: dict[str, ET.Element],
    sterowania: dict[str, ET.Element],
    bus_ref_for_terminal: Callable[[str | None], str | None],
    ostrzezenia: list[str],
) -> dict[str, Any]:
    """Pola zaczepów transformatora z ``RatioTapChanger`` (+ ``TapChangerControl``).

    Para predykatu eksportu ``cgmes_exporter.regulator_kanoniczny``: obecność
    ``TapChanger.ltcFlag`` = regulator KANONICZNY (``tap_changer``, V12K-045); brak =
    przełącznik legacy (pola ``tap_min/tap_max/tap_position/tap_step_percent``, dawny
    eksport bez ``ltcFlag``). Brak danej = pole ``None``/regulator pominięty
    z ostrzeżeniem — nigdy liczba zastępcza (O-59: brak nastawy przy regulacji
    automatycznej ma być widoczny jako brak, nie wymyślony).
    """
    rtc: ET.Element | None = None
    uzwojenie: Literal["HV", "LV"] = "HV"
    strony: tuple[Literal["HV", "LV"], Literal["HV", "LV"]] = ("HV", "LV")
    for numer, koniec in zip(strony, konce, strict=True):
        koniec_mrid = _mrid_of(koniec)
        if koniec_mrid is not None and koniec_mrid in rtc_wg_konca:
            rtc, uzwojenie = rtc_wg_konca[koniec_mrid], numer
            break
    if rtc is None:
        return {}

    ltc = _bool(_text(rtc, "TapChanger.ltcFlag"))
    if ltc is None:
        return {
            "tap_min": _int(_text(rtc, "TapChanger.lowStep")),
            "tap_max": _int(_text(rtc, "TapChanger.highStep")),
            "tap_position": _int(_text(rtc, "TapChanger.normalStep")),
            "tap_step_percent": _float(_text(rtc, "RatioTapChanger.stepVoltageIncrement")),
        }

    pozycja = _int(_text(rtc, "TapChanger.step"))
    if pozycja is None:
        pozycja = _int(_text(rtc, "TapChanger.normalStep"))
    dolna = _int(_text(rtc, "TapChanger.lowStep"))
    gorna = _int(_text(rtc, "TapChanger.highStep"))
    neutralna = _int(_text(rtc, "TapChanger.neutralStep"))
    krok = _float(_text(rtc, "RatioTapChanger.stepVoltageIncrement"))
    if pozycja is None or dolna is None or gorna is None or neutralna is None or krok is None:
        brak = [
            nazwa
            for nazwa, wartosc in (
                ("lowStep", dolna),
                ("highStep", gorna),
                ("neutralStep", neutralna),
                ("step/normalStep", pozycja),
                ("stepVoltageIncrement", krok),
            )
            if wartosc is None
        ]
        ostrzezenia.append(
            f"Transformator {name}: regulator zaczepów bez {', '.join(brak)} — regulator "
            "pominięty (bez domysłu pozycji i kroku)."
        )
        return {}

    ctrl_mrid = _resource(rtc, "TapChanger.TapChangerControl")
    ctrl = sterowania.get(ctrl_mrid) if ctrl_mrid else None
    wlaczona = _bool(_text(rtc, "TapChanger.controlEnabled"))
    if wlaczona is None and ctrl is not None:
        wlaczona = _bool(_text(ctrl, "RegulatingControl.enabled"))
    nastawa_kv: float | None = None
    pasmo_kv: float | None = None
    szyna_regulowana: str | None = None
    if ctrl is not None:
        szyna_regulowana = bus_ref_for_terminal(_resource(ctrl, "RegulatingControl.Terminal"))
        nastawa_kv, pasmo_kv = _nastawa_i_pasmo_kv(name, ctrl, ostrzezenia)

    tap_changer = TapChanger(
        regulation_type="OLTC" if ltc else "DETC",
        regulated_winding=uzwojenie,
        neutral_position=neutralna,
        current_position=pozycja,
        min_position=dolna,
        max_position=gorna,
        step_percent=krok,
        control_mode="AUTOMATIC" if wlaczona else "MANUAL",
        voltage_setpoint_kv=nastawa_kv,
        deadband_kv=pasmo_kv,
        controlled_bus_ref=szyna_regulowana,
    )
    return {"tap_changer": tap_changer}


def _nastawa_i_pasmo_kv(
    name: str, ctrl: ET.Element, ostrzezenia: list[str]
) -> tuple[float | None, float | None]:
    """``targetValue``/``targetDeadband`` sterowania napięciowego -> (kV, kV).

    Odczyt tylko dla ``RegulatingControl.mode = voltage`` i jednoznacznego mnożnika
    (``k`` albo ``none``); inaczej nastawa i pasmo zostają ``None`` z ostrzeżeniem.
    """
    nastawa = _float(_text(ctrl, "RegulatingControl.targetValue"))
    pasmo = _float(_text(ctrl, "RegulatingControl.targetDeadband"))
    if nastawa is None and pasmo is None:
        return None, None
    tryb = _enum_literal(ctrl, "RegulatingControl.mode")
    if tryb != "voltage":
        ostrzezenia.append(
            f"Transformator {name}: sterowanie regulatora w trybie {tryb or 'nieokreślonym'} "
            "zamiast napięciowego — nastawa i pasmo nieodczytane."
        )
        return None, None
    mnoznik = _enum_literal(ctrl, "RegulatingControl.targetValueUnitMultiplier")
    przelicz = _MNOZNIK_NA_KV.get(mnoznik or "")
    if przelicz is None:
        ostrzezenia.append(
            f"Transformator {name}: nastawa regulatora bez jednoznacznego mnożnika jednostki "
            f"({mnoznik or 'brak targetValueUnitMultiplier'}) — nastawa i pasmo nieodczytane."
        )
        return None, None
    return (
        przelicz(nastawa) if nastawa is not None else None,
        przelicz(pasmo) if pasmo is not None else None,
    )


# ---------------------------------------------------------------------------
# Shared catalog gate
# ---------------------------------------------------------------------------


def _ostrzezenia_importu(
    *,
    elements_no_catalog: list[str],
    odbiory_bez_stanu_ustalonego: list[str],
) -> list[str]:
    """Ostrzezenia importu — kazdy brak danej NAZWANY, nigdy podmieniony w milczeniu.

    Brak mocy odbioru jest osobnym ostrzezeniem niz brak katalogu, bo prowadzi do
    innej decyzji: katalog projektant domapuje, a moc odbioru musi pochodzic z
    profilu stanu ustalonego CGMES albo z wlasnego zalozenia projektowego.
    """
    ostrzezenia: list[str] = []
    if elements_no_catalog:
        ostrzezenia.append(
            f"Import wymaga mapowania katalogowego: {len(elements_no_catalog)} element(ów)."
        )
    if odbiory_bez_stanu_ustalonego:
        nazwy = ", ".join(sorted(set(odbiory_bez_stanu_ustalonego))[:5])
        wiecej = (
            f" (i {len(set(odbiory_bez_stanu_ustalonego)) - 5} więcej)"
            if len(set(odbiory_bez_stanu_ustalonego)) > 5
            else ""
        )
        ostrzezenia.append(
            f"Brak mocy czynnej w profilu stanu ustalonego dla {len(odbiory_bez_stanu_ustalonego)} "
            f"odbiór(ów) — wniesione jako 0 MW: {nazwy}{wiecej}. "
            "Rozpływ i spadki napięcia będą zaniżone do czasu uzupełnienia profilu "
            "SteadyStateHypothesis albo własnych wartości mocy."
        )
    return ostrzezenia


def _elements_without_catalog(enm: EnergyNetworkModel) -> list[str]:
    """Return ref_ids of catalog-bound elements missing a catalog_ref.

    Side-car (lossless) round-trip only — `catalog.governance.wymagalnosc_
    katalogu` (oś `import_`), jedyne źródło prawdy wspólne z walidatorem E009,
    bramką ZIP i XLSX (karta W3-I). Karta W3-I (2026-09-09): PRZED tą kartą
    to sprawdzenie nie znało wyjątku `parameter_source == "MANUAL_EQUIVALENT"`
    (K1.2) — źródło z jawnym Sk''/RX, poprawne wg E009, wracało z side-car
    round-tripu oznaczone `CATALOG_MAPPING_REQUIRED`. Rozjazd nazwany w
    meldunku karty — naprawiony tu; test round-tripu w
    `tests/cgmes/test_cgmes_katalog_predykat.py`.

    Third-party EQ+TP path (`import_from_eq_tp`) NIE woła tej funkcji — buduje
    własną listę inline, bo TAM każdy element jest z definicji migracyjnym
    artefaktem bez katalogu (CIM nie niesie referencji katalogowej wcale),
    niezależnie od rodzaju — to inna decyzja biznesowa, nie duplikat tego
    predykatu (patrz `import_from_eq_tp`).
    """
    missing: list[str] = []
    for branch in enm.branches:
        if brakuje_wymaganej_referencji(
            wymagalnosc_katalogu(branch.type).import_, branch.catalog_ref
        ):
            missing.append(branch.ref_id)
    for trafo in enm.transformers:
        if brakuje_wymaganej_referencji(
            wymagalnosc_katalogu("transformer").import_, trafo.catalog_ref
        ):
            missing.append(trafo.ref_id)
    for source in enm.sources:
        poziom = wymagalnosc_katalogu("source", parameter_source=source.parameter_source).import_
        if brakuje_wymaganej_referencji(poziom, source.catalog_ref):
            missing.append(source.ref_id)
    return sorted(set(missing))

"""
Internal SLD layout — wewnętrzny widok stacji SN/nN (PR-6).

Generuje DTO `InternalSldDTO` dla stacji z:
- szyną SN + sekcjami
- polami SN w stacji (z kanonicznych BayTemplate)
- transformatorem(ami) SN/nN
- rozdzielnicą nN (jeden lub wiele poziomów — multi-voltage briefa §13)

Brief 2 §7 — wewnętrzny SLD stacji (3 tryby: zewnętrzny / wewnętrzny / mieszany).
Klasyfikacja typu topologicznego: brief 2 §6 pkt 7 (z portów).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from src.application.sld.topology_classifier import (
    TopologicalType,
    infer_topological_type_for_substation,
)
from src.enm.models import Bay, EnergyNetworkModel, Port, Substation, Transformer


class InternalBayDTO(BaseModel):
    """Pole SN wewnątrz stacji."""

    bay_id: str
    designation: str
    bay_role: Literal["IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"]
    template_id: str | None = None
    ports: list[Port] = Field(default_factory=list)
    order: int


class InternalTransformerDTO(BaseModel):
    """Transformator SN/nN wewnątrz stacji."""

    transformer_id: str
    designation: str
    sn_mva: float
    uhv_kv: float
    ulv_kv: float
    vector_group: str | None = None


class InternalNnSwitchgearDTO(BaseModel):
    """Rozdzielnica nN wewnątrz stacji."""

    designation: str
    nn_voltage_kv: float
    feeders_count: int = 0


class InternalSldDTO(BaseModel):
    """Wewnętrzny SLD stacji — kompletny widok dla dwukliku stacji.

    Generowany przez `build_internal_sld(substation_ref, enm)`.
    """

    substation_id: str
    name: str
    topological_type: TopologicalType
    construction_type: (
        Literal["wnetrzowa", "kontenerowa", "slupowa", "prefabrykowana", "inna"] | None
    ) = None
    sn_voltage_kv: float
    nn_voltage_levels: list[float] = Field(default_factory=list)
    bays: list[InternalBayDTO] = Field(default_factory=list)
    transformers: list[InternalTransformerDTO] = Field(default_factory=list)
    nn_switchgears: list[InternalNnSwitchgearDTO] = Field(default_factory=list)
    external_ports: list[Port] = Field(default_factory=list)


def _bays_for_substation(enm: EnergyNetworkModel, substation_ref: str) -> list[Bay]:
    return sorted(
        [b for b in enm.bays if b.substation_ref == substation_ref],
        key=lambda b: b.ref_id,
    )


def _transformers_for_substation(
    enm: EnergyNetworkModel, substation_ref: str
) -> list[Transformer]:
    bus_refs = set()
    for s in enm.substations:
        if s.ref_id == substation_ref:
            bus_refs.update(s.bus_refs)
            break
    return sorted(
        [
            t
            for t in enm.transformers
            if t.hv_bus_ref in bus_refs or t.lv_bus_ref in bus_refs
        ],
        key=lambda t: t.ref_id,
    )


def build_internal_sld(
    substation_ref: str, enm: EnergyNetworkModel
) -> InternalSldDTO | None:
    """Buduje wewnętrzny SLD stacji.

    Zwraca None jeżeli substation_ref nie istnieje w ENM.
    """
    substation: Substation | None = next(
        (s for s in enm.substations if s.ref_id == substation_ref), None
    )
    if substation is None:
        return None

    # Bays w stacji + sortowanie po order/ref_id (deterministyczne)
    sub_bays = _bays_for_substation(enm, substation_ref)
    bay_dtos: list[InternalBayDTO] = []
    for idx, b in enumerate(sub_bays):
        bay_dtos.append(
            InternalBayDTO(
                bay_id=b.ref_id,
                designation=b.name,
                bay_role=b.bay_role,
                template_id=b.bay_template_ref,
                ports=list(b.ports),
                order=idx,
            )
        )

    # Transformatory
    sub_transformers = _transformers_for_substation(enm, substation_ref)
    transformer_dtos: list[InternalTransformerDTO] = []
    for t in sub_transformers:
        transformer_dtos.append(
            InternalTransformerDTO(
                transformer_id=t.ref_id,
                designation=t.name,
                sn_mva=t.sn_mva,
                uhv_kv=t.uhv_kv,
                ulv_kv=t.ulv_kv,
                vector_group=t.vector_group,
            )
        )

    # Rozdzielnice nN — jeden DTO per poziom napięcia nN
    nn_switchgears: list[InternalNnSwitchgearDTO] = []
    for idx, nn_kv in enumerate(substation.nn_voltage_levels):
        feeders_count = sum(
            1
            for b in sub_bays
            if b.bay_role in ("FEEDER", "OUT") and abs(nn_kv - 0.4) < 0.01
        )
        nn_switchgears.append(
            InternalNnSwitchgearDTO(
                designation=f"RnN-{nn_kv}kV-{idx + 1}",
                nn_voltage_kv=nn_kv,
                feeders_count=feeders_count,
            )
        )

    # Ustal SN voltage z pierwszego bus_ref stacji
    sn_voltage_kv = 15.0
    if substation.bus_refs:
        first_bus = next(
            (b for b in enm.buses if b.ref_id == substation.bus_refs[0]), None
        )
        if first_bus:
            sn_voltage_kv = first_bus.voltage_kv

    return InternalSldDTO(
        substation_id=substation.ref_id,
        name=substation.name,
        topological_type=infer_topological_type_for_substation(substation),
        construction_type=substation.construction_type,
        sn_voltage_kv=sn_voltage_kv,
        nn_voltage_levels=list(substation.nn_voltage_levels),
        bays=bay_dtos,
        transformers=transformer_dtos,
        nn_switchgears=nn_switchgears,
        external_ports=list(substation.external_ports),
    )

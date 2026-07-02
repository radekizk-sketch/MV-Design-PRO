"""
Reference catalog of MV shunt capacitor banks (KOMPENSATOR_SN).

Stałe baterie kondensatorów SN do kompensacji mocy biernej. Wartości
referencyjne (typowe stopnie kompensacji dla sieci 15/20 kV). Susceptancja
pojemnościowa wynika z pierwszych zasad B = Q_rated / U_rated² i jest
materializowana do ENM przez MaterializationContract(KOMPENSATOR_SN).
"""

from __future__ import annotations

from .types import (
    CatalogStatus,
    CatalogVerificationStatus,
    ShuntCapacitorType,
)

_SOURCE = "Katalog kompensatorow MV-DESIGN-PRO / wartosci referencyjne"


def _record(
    *,
    type_id: str,
    name: str,
    rated_mvar: float,
    rated_kv: float,
    loss_kw: float | None,
) -> dict:
    return {
        "id": type_id,
        "name": name,
        "params": {
            "rated_mvar": rated_mvar,
            "rated_kv": rated_kv,
            "loss_kw": loss_kw,
            "manufacturer": None,
            "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
            "source_reference": _SOURCE,
            "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
        },
    }


def get_all_shunt_capacitor_records() -> list[dict]:
    """Deterministic reference records for shunt capacitor banks."""
    return [
        _record(
            type_id="KOMP_SN_0V6_15KV",
            name="Bateria kondensatorow SN 0,6 Mvar 15 kV",
            rated_mvar=0.6,
            rated_kv=15.0,
            loss_kw=0.3,
        ),
        _record(
            type_id="KOMP_SN_1V2_15KV",
            name="Bateria kondensatorow SN 1,2 Mvar 15 kV",
            rated_mvar=1.2,
            rated_kv=15.0,
            loss_kw=0.6,
        ),
        _record(
            type_id="KOMP_SN_2V4_15KV",
            name="Bateria kondensatorow SN 2,4 Mvar 15 kV",
            rated_mvar=2.4,
            rated_kv=15.0,
            loss_kw=1.2,
        ),
        _record(
            type_id="KOMP_SN_1V8_20KV",
            name="Bateria kondensatorow SN 1,8 Mvar 20 kV",
            rated_mvar=1.8,
            rated_kv=20.0,
            loss_kw=0.9,
        ),
        _record(
            type_id="KOMP_SN_3V6_20KV",
            name="Bateria kondensatorow SN 3,6 Mvar 20 kV",
            rated_mvar=3.6,
            rated_kv=20.0,
            loss_kw=1.8,
        ),
    ]


def get_all_shunt_capacitor_types() -> list[ShuntCapacitorType]:
    """Materialized ShuntCapacitorType objects (for direct in-process use)."""
    records: list[ShuntCapacitorType] = []
    for record in get_all_shunt_capacitor_records():
        data = {"id": record["id"], "name": record["name"]}
        data.update(record["params"])
        records.append(ShuntCapacitorType.from_dict(data))
    return records

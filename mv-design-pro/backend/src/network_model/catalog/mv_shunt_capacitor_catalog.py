"""
Reference catalog of MV shunt capacitor banks (KOMPENSATOR_SN).

Stałe baterie kondensatorów SN do kompensacji mocy biernej. Wartości
referencyjne (typowe stopnie kompensacji dla sieci 15/20 kV). Susceptancja
pojemnościowa wynika z pierwszych zasad B = Q_rated / U_rated² i jest
materializowana do ENM przez MaterializationContract(KOMPENSATOR_SN).

Układ połączeń pozycji referencyjnych (karta UX-04/POLE-BKR-MODEL): podwójna gwiazda
z izolowanymi punktami gwiazd i jednostkami jednofazowymi — wymóg ENEA Operator, Stacje
elektroenergetyczne 110 kV, Zeszyt 1 §17 s. 32 i Zał. 16 dla baterii rozdzielni SN GPZ.
Pozycja referencyjna jest jednostopniowa (Zał. 16 przedstawia jeden stopień). Tolerancji
pojemności, dławika ograniczającego i rezystorów rozładowczych pozycja referencyjna NIE podaje
(to dane karty producenta) — obliczenie biegnie z wartością roboczą rejestru
(``catalog.wartosci_robocze``, zasada nr 4), jawnie w danych przyjętych.
"""

from __future__ import annotations

from .types import (
    CatalogStatus,
    CatalogVerificationStatus,
    ShuntCapacitorType,
)

_SOURCE = (
    "Katalog kompensatorów MV-DESIGN-PRO / wartości referencyjne; układ połączeń: "
    "ENEA Operator, Zeszyt 1 §17 s. 32 i Zał. 16"
)
#: Układ połączeń pozycji referencyjnych (Zeszyt 1 §17 s. 32: „podwójna gwiazda").
_UKLAD_WG_ZESZYTU_1 = "PODWOJNA_GWIAZDA_IZOLOWANA"


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
            "uklad_polaczen": _UKLAD_WG_ZESZYTU_1,
            "liczba_stopni": 1,
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
            name="Bateria kondensatorów SN 0,6 Mvar 15 kV",
            rated_mvar=0.6,
            rated_kv=15.0,
            loss_kw=0.3,
        ),
        _record(
            type_id="KOMP_SN_1V2_15KV",
            name="Bateria kondensatorów SN 1,2 Mvar 15 kV",
            rated_mvar=1.2,
            rated_kv=15.0,
            loss_kw=0.6,
        ),
        _record(
            type_id="KOMP_SN_2V4_15KV",
            name="Bateria kondensatorów SN 2,4 Mvar 15 kV",
            rated_mvar=2.4,
            rated_kv=15.0,
            loss_kw=1.2,
        ),
        _record(
            type_id="KOMP_SN_1V8_20KV",
            name="Bateria kondensatorów SN 1,8 Mvar 20 kV",
            rated_mvar=1.8,
            rated_kv=20.0,
            loss_kw=0.9,
        ),
        _record(
            type_id="KOMP_SN_3V6_20KV",
            name="Bateria kondensatorów SN 3,6 Mvar 20 kV",
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

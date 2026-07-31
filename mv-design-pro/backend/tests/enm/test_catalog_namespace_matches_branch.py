"""Kategoria katalogu musi pasować do RODZAJU gałęzi (karta KD-6, Zero-Debt).

DEFEKT ZASTANY. `assign_catalog_to_element` przyjmował dowolną kategorię dla
dowolnej gałęzi: wyłącznik pola dawało się przepiąć na pozycję katalogu
KABEL_SN. Skutek nie był kosmetyczny — wiązanie APARAT_SN, którego operacja
stacyjna WYMAGA (B-12), znikało po cichu, a materializacja wpisałaby parametry
kabla (r/x na km, obciążalność) w aparat łączeniowy.

Defekt wyszedł przy budowie ogniwa „wynik zwarciowy → wytrzymałość aparatury":
stacja traciła aparaty pól, więc werdykt z modelu nie miał czego oceniać.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

KABEL = "cable-tfk-yakxs-3x120"
ZRODLO = "src-gpz-15kv-250mva-rx010"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
APARAT = "sw-cb-abb-vd4-17kv-630a"


def _op(snapshot: dict, nazwa: str, payload: dict) -> dict:
    wynik = execute_domain_operation(enm_dict=snapshot, op_name=nazwa, payload=payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')}"
    return wynik["snapshot"]


def _siec_ze_stacja() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="kd6_namespace", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    snapshot = _op(
        enm,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": ZRODLO},
    )
    snapshot = _op(
        snapshot,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 400,
                "catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": KABEL,
                    "catalog_item_version": "2024.1",
                },
            }
        },
    )
    segment = next(b for b in snapshot["branches"] if b["type"] == "cable")
    return _op(
        snapshot,
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": APARAT,
            "segment_id": segment["ref_id"],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": TRAFO,
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )


def _aparat_pola(snapshot: dict) -> dict:
    return next(b for b in snapshot["branches"] if b.get("catalog_namespace") == "APARAT_SN")


def test_kabel_nie_da_sie_przypiac_do_wylacznika_pola() -> None:
    snapshot = _siec_ze_stacja()
    aparat = _aparat_pola(snapshot)

    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": aparat["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "KABEL_SN",
                "catalog_item_id": KABEL,
                "catalog_item_version": "2024.1",
            },
        },
    )

    assert wynik.get("error_code") == "catalog.namespace_mismatch", wynik
    assert "KABEL_SN" in str(wynik.get("error"))


def test_wiazanie_aparatu_przezywa_odrzucona_probe() -> None:
    """Odrzucenie nie może zostawić modelu w stanie pośrednim."""
    snapshot = _siec_ze_stacja()
    aparat_przed = _aparat_pola(snapshot)

    execute_domain_operation(
        enm_dict=snapshot,
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": aparat_przed["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "KABEL_SN",
                "catalog_item_id": KABEL,
                "catalog_item_version": "2024.1",
            },
        },
    )

    aparat_po = _aparat_pola(snapshot)
    assert aparat_po["catalog_namespace"] == "APARAT_SN"
    assert aparat_po["catalog_ref"] == APARAT


def test_wlasciwa_kategoria_aparatu_przechodzi() -> None:
    snapshot = _siec_ze_stacja()
    aparat = _aparat_pola(snapshot)

    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": aparat["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": "sw-cb-abb-vd4-12kv-630a",
                "catalog_item_version": "2024.1",
            },
        },
    )

    assert not wynik.get("error"), wynik.get("error")
    zmieniony = _aparat_pola(wynik["snapshot"])
    assert zmieniony["catalog_ref"] == "sw-cb-abb-vd4-12kv-630a"


def test_kabel_do_odcinka_liniowego_dziala_bez_zmian() -> None:
    """Zgodność: właściwa kategoria dla właściwej gałęzi przechodzi jak dotąd."""
    snapshot = _siec_ze_stacja()
    odcinek = next(b for b in snapshot["branches"] if b["type"] == "cable")

    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": odcinek["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "KABEL_SN",
                "catalog_item_id": KABEL,
                "catalog_item_version": "2024.1",
            },
        },
    )

    assert not wynik.get("error"), wynik.get("error")

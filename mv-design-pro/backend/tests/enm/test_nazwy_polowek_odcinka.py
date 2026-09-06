"""Nazwy połówek dzielonego odcinka dziedziczą nazwę rodzica (KLASA, nie instancja).

Defekt zmierzony na żywym ekranie kontyngencji N-1 (2026-08-14): po wstawieniu
stacji w odcinek połówki nosiły surowy identyfikator
(`Odcinek seg/<hash>/segment_L`) zamiast nazwy z projektu — tabela rankingu
N-1 pokazywała inżynierowi ref techniczny. Ta sama klasa (nazwa sklejana
z ref-u zamiast dziedziczona) siedziała w OBU operacjach tnących odcinek:
`insert_station_on_segment_sn` i `insert_section_switch_sn` — cztery miejsca,
jeden helper `_nazwa_polowki_odcinka`. Testy pokrywają iloczyn cech:
(operacja stacji × operacja łącznika) × (rodzic z nazwą × rodzic bez nazwy).
"""

from __future__ import annotations

from typing import Any

from enm.domain_operations import _nazwa_polowki_odcinka, execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-24kv-630a"
CATALOG_ROZLACZNIK = "sw-ds-abb-ojs-17kv-630a"


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="nazwy_polowek", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    if name == "add_grid_source_sn":
        payload = {
            **({"catalog_ref": CATALOG_ZRODLO_250} if "catalog_ref" not in payload else {}),
            # Karta FAB-G: transformator WN/SN GPZ wymaga jawnej pary
            # hv_voltage_kv + transformer_sn_mva (albo transformer_catalog_ref) —
            # odtwarzamy jako dana fikstury zalozenie, ktore wczesniej wchodzilo
            # domyslnie (25 MVA @ 110 kV).
            **(
                {"hv_voltage_kv": 110.0, "transformer_sn_mva": 25.0}
                if "transformer_catalog_ref" not in payload
                and "transformer_catalog_binding" not in payload
                else {}
            ),
            "gpz_line_field_apparatus": {
                "apparatus_kind": "BREAKER",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": CATALOG_APARAT_SN,
                },
            },
            **payload,
        }
    result = execute_domain_operation(snap, name, payload)
    err = result.get("error")
    assert not err, f"Operacja '{name}' zwróciła błąd: {err} (code={result.get('error_code')})"
    return result["snapshot"]


def _trunk_z_nazwanym_odcinkiem() -> tuple[dict[str, Any], str]:
    """GPZ + jeden NAZWANY segment magistrali. Zwraca (snapshot, ref segmentu)."""
    snap = _empty_enm()
    snap = op(snap, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
    snap = op(
        snap,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 500.0,
                "name": "Magistrala północna",
                "catalog_ref": CATALOG_LINE_70,
            },
        },
    )
    return snap, snap["branches"][-1]["ref_id"]


def _nazwy_polowek(snap: dict[str, Any], seg_id: str) -> list[str]:
    return sorted(
        b["name"]
        for b in snap["branches"]
        if b["ref_id"].startswith(f"{seg_id}_") and b.get("type") != "switch"
    )


def test_polowki_po_wstawieniu_stacji_dziedzicza_nazwe_rodzica() -> None:
    snap, seg_id = _trunk_z_nazwanym_odcinkiem()
    snap = op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": seg_id,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": CATALOG_TRAFO_630,
                },
            },
        },
    )
    assert _nazwy_polowek(snap, seg_id) == [
        "Magistrala północna (1)",
        "Magistrala północna (2)",
    ]


def test_polowki_po_wstawieniu_lacznika_dziedzicza_nazwe_rodzica() -> None:
    snap, seg_id = _trunk_z_nazwanym_odcinkiem()
    snap = op(
        snap,
        "insert_section_switch_sn",
        {
            "segment_id": seg_id,
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": CATALOG_ROZLACZNIK,
            },
        },
    )
    assert _nazwy_polowek(snap, seg_id) == [
        "Magistrala północna (1)",
        "Magistrala północna (2)",
    ]


def test_rodzic_bez_nazwy_zachowuje_jawny_wariant_zapasowy() -> None:
    """Brak nazwy rodzica NIE jest zmyślany — zostaje jawny wariant z ref-em.

    Jedyne wejście do nazwy połówki to `_nazwa_polowki_odcinka` (jedno źródło
    prawdy dla obu operacji), więc wariant zapasowy wystarczy przypiąć na
    helperze.
    """
    assert _nazwa_polowki_odcinka({"name": ""}, "seg/x/segment_L", 1) == "Odcinek seg/x/segment_L"
    assert _nazwa_polowki_odcinka({}, "abc_SR", 2) == "Odcinek abc_SR"
    assert _nazwa_polowki_odcinka({"name": "  "}, "abc_SL", 1) == "Odcinek abc_SL"

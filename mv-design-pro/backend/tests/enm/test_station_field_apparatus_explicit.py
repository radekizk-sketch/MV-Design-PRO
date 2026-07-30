"""B-12: aparat pola SN pochodzi z JAWNEGO wskazania, nigdy z domysłu.

Do 2026-07-30 obie operacje stacyjne (`insert_station_on_segment_sn`,
`append_station_on_endpoint`) uzupełniały brakującą referencję aparatu zaszytym
typem wyłącznika. To była fabrykacja decyzji projektowej: model wyglądał na
kompletny, choć projektant nigdy aparatu nie wybrał. Testy pilnują, że:

1. brak referencji ⇒ JAWNY błąd walidacji (PL, ze wskazaniem pola i roli),
2. jawna referencja ⇒ aparat z tej pozycji katalogu, a meta opisuje stan
   rzeczywisty (komunikat wskazuje jawnie wybraną pozycję),
3. B-4/B-5: oznaczenie i typ konstrukcji stacji trafiają do rekordu stacji,
   a nieprawidłowy typ konstrukcji kończy operację błędem.
"""

from __future__ import annotations

import copy
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
APARAT_SN_ALT = "sw-cb-abb-vd4-17kv-1250a"


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="b12_apparatus_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    result = execute_domain_operation(snap, name, payload)
    err = result.get("error")
    assert not err, f"Operacja '{name}' zwróciła błąd: {err} (code={result.get('error_code')})"
    return result["snapshot"]


def _build_trunk_with_segment() -> tuple[dict[str, Any], str, str]:
    """ENM: GPZ + odcinek 500 m. Zwraca (snapshot, segment_ref, terminal_bus_ref)."""
    snap = _empty_enm()
    snap = _op(
        snap,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_250},
    )
    snap = _op(
        snap,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 500.0,
                "catalog_ref": CATALOG_LINE_70,
            },
        },
    )
    segment = next(b for b in snap["branches"] if b.get("type") == "line_overhead")
    return snap, str(segment["ref_id"]), str(segment["to_bus_ref"])


def _insert_payload(segment_ref: str, **extra: Any) -> dict[str, Any]:
    return {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja B-12",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_block": {"outgoing_feeders_nn_count": 1},
        **extra,
    }


# ---------------------------------------------------------------------------
# 1. Brak referencji aparatu ⇒ jawny błąd
# ---------------------------------------------------------------------------


def test_insert_station_without_apparatus_ref_returns_validation_error() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    response = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(segment_ref),
    )
    assert response.get("error_code") == "station.insert.field_apparatus_ref_missing"
    message = response.get("error") or ""
    # Komunikat po polsku, ze wskazaniem pola (numer + rola) i nazwą kontraktu.
    assert "Pole SN nr 1" in message
    assert "LINIA_IN" in message
    assert "apparatus_catalog_ref" in message
    # Model nietknięty (walidacja przed jakąkolwiek zmianą).
    assert response.get("snapshot") is None


def test_insert_station_without_apparatus_ref_points_at_first_incomplete_field() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref)
    payload["sn_fields"] = [
        {"field_role": "LINIA_IN", "apparatus_catalog_ref": APARAT_SN},
        {"field_role": "LINIA_OUT"},
        {"field_role": "TRANSFORMATOROWE", "apparatus_catalog_ref": APARAT_SN},
    ]
    response = execute_domain_operation(
        copy.deepcopy(snap), "insert_station_on_segment_sn", payload
    )
    assert response.get("error_code") == "station.insert.field_apparatus_ref_missing"
    assert "Pole SN nr 2" in (response.get("error") or "")
    assert "LINIA_OUT" in (response.get("error") or "")


def test_append_station_without_apparatus_ref_returns_validation_error() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()
    response = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
        },
    )
    assert response.get("error_code") == "station.append.field_apparatus_ref_missing"
    assert "apparatus_catalog_ref" in (response.get("error") or "")


# ---------------------------------------------------------------------------
# 2. Jawna referencja ⇒ aparat z katalogu + uczciwa meta
# ---------------------------------------------------------------------------


def test_insert_station_uses_explicit_apparatus_ref_per_field() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN)
    payload["sn_fields"] = [
        {"field_role": "LINIA_IN", "apparatus_catalog_ref": APARAT_SN_ALT},
        {"field_role": "LINIA_OUT"},
        {"field_role": "TRANSFORMATOROWE"},
    ]
    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    assert result.get("error") is None, result.get("error")
    breakers = [
        b
        for b in result["snapshot"]["branches"]
        if "station_field_device" in (b.get("tags") or [])
    ]
    assert len(breakers) == 3
    refs = {b["meta"]["field_role"]: b["catalog_ref"] for b in breakers}
    assert refs["LINIA_IN"] == APARAT_SN_ALT
    assert refs["LINIA_OUT"] == APARAT_SN
    assert refs["TRANSFORMATOROWE"] == APARAT_SN
    # Meta opisuje stan RZECZYWISTY — komunikat wskazuje jawnie wybraną pozycję.
    for breaker in breakers:
        message = breaker["meta"]["catalog_message"]
        assert "jawnie wskazanej" in message
        assert breaker["catalog_ref"] in message


def test_append_station_uses_explicit_apparatus_ref() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()
    result = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "field_apparatus_catalog_ref": APARAT_SN_ALT,
        },
    )
    assert result.get("error") is None, result.get("error")
    apparatus = [
        b
        for b in result["snapshot"]["branches"]
        if "station_field_device" in (b.get("tags") or [])
    ]
    assert apparatus, "Operacja nie utworzyła aparatu pola SN"
    assert all(b["catalog_ref"] == APARAT_SN_ALT for b in apparatus)



"""B-3: CT/VT/zabezpieczenie pola powstają W TEJ SAMEJ operacji co stacja.

DŁUG, KTÓRY TE TESTY ZAMYKAJĄ (B-3, nazwany w V12K-283): kreator stacji zapisywał
stację JEDNĄ operacją, a wyposażenie pomiarowo-zabezpieczeniowe pól dokładał
SEKWENCJĄ osobnych operacji `add_ct`/`add_vt`/`add_relay`. Gdy krok pośredni
zawiódł, model zostawał w stanie połowicznym (stacja zapisana, wyposażenie
częściowe), a kreator mógł tylko uczciwie zameldować „wykonano N z M".

Pilnowane własności:
1. wyposażenie wskazane per pole powstaje w TEJ SAMEJ migawce co stacja
   (jedna operacja, jedna odpowiedź, komplet elementów),
2. zabezpieczenie wiąże wyłącznik ORAZ CT/VT TEGO SAMEGO pola (kolejność
   zakładania: CT → VT → przekaźnik),
3. ATOMOWOŚĆ: błąd któregokolwiek elementu wyposażenia kończy CAŁĄ operację —
   w modelu nie ma ani stacji, ani wyposażenia,
4. ZGODNOŚĆ: tor sekwencyjny (operacja stacyjna bez `equipment`, potem osobne
   `add_ct`/`add_vt`/`add_relay`) działa bez zmian,
5. PARYTET BRAM: pozycja katalogowa wyposażenia w operacji stacyjnej przechodzi
   tę samą bramę katalogową co przy wołaniu osobnej operacji.
"""

from __future__ import annotations

import copy
from typing import Any

from api.domain_ops_policy import validate_and_materialize_catalog_binding
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
CT_REF = "ct_400_5_5p20_15va_abb"
VT_REF = "vt_15kv_100v_3p_abb"
RELAY_REF = "ACME_REX100_v1"


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="b3_equipment_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
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


def _wyposazenie(**over: Any) -> dict[str, Any]:
    """Wyposażenie pola: payload `add_ct`/`add_vt`/`add_relay` bez `bay_ref`."""
    dane: dict[str, Any] = {
        "ct": {
            "catalog_ref": CT_REF,
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
        },
        "vt": {
            "catalog_ref": VT_REF,
            "ratio_primary_v": 15000.0,
            "ratio_secondary_v": 100.0,
        },
        "relay": {"catalog_ref": RELAY_REF, "relay_type": "NADPRADOWY"},
    }
    dane.update(over)
    return dane


def _insert_payload(segment_ref: str, sn_fields: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja B-3",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        "sn_fields": sn_fields,
        "field_apparatus_catalog_ref": APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }


def _pomiary(snapshot: dict[str, Any], typ: str) -> list[dict[str, Any]]:
    return [m for m in snapshot.get("measurements", []) if m.get("measurement_type") == typ]


def _stacja(snapshot: dict[str, Any], nazwa: str) -> dict[str, Any]:
    """Rekord UTWORZONEJ stacji (snapshot niesie też stację GPZ z tego ENM)."""
    return next(s for s in snapshot["substations"] if s.get("name") == nazwa)


def _pole_wg_roli(snapshot: dict[str, Any], nazwa_stacji: str, rola: str) -> str:
    specs = _stacja(snapshot, nazwa_stacji)["meta"]["field_specs"]
    return next(
        s["field_ref"]
        for s in specs
        if (s.get("meta") or {}).get("field_role") == rola or s.get("field_role") == rola
    )


# ---------------------------------------------------------------------------
# 1. Wyposażenie powstaje w TEJ SAMEJ operacji co stacja
# ---------------------------------------------------------------------------


def test_insert_station_creates_field_equipment_in_same_snapshot() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {"field_role": "LINIA_IN", "equipment": _wyposazenie()},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )

    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert result.get("error") is None, result.get("error")
    snapshot = result["snapshot"]
    # Stacja i wyposażenie w JEDNEJ odpowiedzi (jedna operacja, jedna migawka).
    stacja = _stacja(snapshot, "Stacja B-3")
    assert stacja["ref_id"] in set(result["changes"]["created_element_ids"])
    ct_list = _pomiary(snapshot, "CT")
    vt_list = _pomiary(snapshot, "VT")
    assert len(ct_list) == 1
    assert len(vt_list) == 1
    assert ct_list[0]["catalog_ref"] == CT_REF
    assert vt_list[0]["catalog_ref"] == VT_REF
    assert len(snapshot.get("protection_assignments", [])) == 1

    # Utworzone elementy zgłoszone w `changes` (konsument selekcji/undo).
    utworzone = set(result["changes"]["created_element_ids"])
    assert ct_list[0]["ref_id"] in utworzone
    assert vt_list[0]["ref_id"] in utworzone
    assert snapshot["protection_assignments"][0]["ref_id"] in utworzone

    # Zdarzenia domenowe wyposażenia dopisane do przebiegu operacji stacyjnej.
    typy_zdarzen = [z.get("event_type") for z in result["domain_events"]]
    assert "CT_CREATED" in typy_zdarzen
    assert "VT_CREATED" in typy_zdarzen
    assert "PROTECTION_CREATED" in typy_zdarzen
    numery = [z.get("event_seq") for z in result["domain_events"]]
    assert numery == sorted(numery), "Numeracja zdarzeń musi rosnąć monotonicznie"


def test_relay_binds_breaker_and_measurements_of_the_same_field() -> None:
    """Kolejność CT → VT → przekaźnik: zabezpieczenie widzi pomiary swojego pola."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {"field_role": "LINIA_IN", "equipment": _wyposazenie()},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )

    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert result.get("error") is None, result.get("error")
    snapshot = result["snapshot"]
    przypisanie = snapshot["protection_assignments"][0]
    ct = _pomiary(snapshot, "CT")[0]
    vt = _pomiary(snapshot, "VT")[0]
    assert przypisanie["ct_ref"] == ct["ref_id"]
    assert przypisanie["vt_ref"] == vt["ref_id"]

    field_ref = ct["bay_ref"]
    breaker = next(
        b
        for b in snapshot["branches"]
        if (b.get("meta") or {}).get("field_ref") == field_ref and b.get("type") == "breaker"
    )
    assert przypisanie["breaker_ref"] == breaker["ref_id"]

    # Pole niesie referencję zabezpieczenia (spec pola w meta stacji).
    specs = _stacja(snapshot, "Stacja B-3")["meta"]["field_specs"]
    spec = next(s for s in specs if s.get("field_ref") == field_ref)
    assert spec["protection_ref"] == przypisanie["ref_id"]


def test_equipment_may_be_declared_for_many_fields() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {"field_role": "LINIA_IN", "equipment": _wyposazenie()},
            {"field_role": "LINIA_OUT", "equipment": _wyposazenie(vt=None)},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )

    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert result.get("error") is None, result.get("error")
    snapshot = result["snapshot"]
    assert len(_pomiary(snapshot, "CT")) == 2
    # Pole bez wskazanego VT nie dostaje przekładnika napięciowego (uczciwy brak).
    assert len(_pomiary(snapshot, "VT")) == 1
    assert len(snapshot["protection_assignments"]) == 2


# ---------------------------------------------------------------------------
# 2. ATOMOWOŚĆ — błąd wyposażenia cofa całą operację
# ---------------------------------------------------------------------------


def test_invalid_equipment_aborts_whole_station_operation() -> None:
    """Brak pozycji katalogowej zabezpieczenia ⇒ nie powstaje NIC (ani stacja)."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {
                "field_role": "LINIA_IN",
                "equipment": _wyposazenie(relay={"relay_type": "NADPRADOWY"}),
            },
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )

    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert result.get("error_code") == "catalog.ref_required"
    komunikat = result.get("error") or ""
    assert "LINIA_IN" in komunikat
    assert "zabezpieczenia" in komunikat
    # Migawka pusta = do zapisu nie trafia ani stacja, ani wyposażenie.
    assert result.get("snapshot") is None


def test_invalid_ct_ratio_aborts_whole_station_operation() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {
                "field_role": "LINIA_IN",
                "equipment": _wyposazenie(ct={"catalog_ref": CT_REF}),
            },
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )

    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert result.get("error_code") == "ct.ratio_missing"
    assert result.get("snapshot") is None


# ---------------------------------------------------------------------------
# 3. ZGODNOŚĆ — tor sekwencyjny działa bez zmian
# ---------------------------------------------------------------------------


def test_sequential_path_still_works_without_equipment_field() -> None:
    """Operacja stacyjna bez `equipment` + osobne add_ct/add_vt/add_relay."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )

    snapshot = _op(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    assert _pomiary(snapshot, "CT") == []

    field_ref = _pole_wg_roli(snapshot, "Stacja B-3", "LINIA_IN")

    snapshot = _op(
        snapshot,
        "add_ct",
        {
            "bay_ref": field_ref,
            "catalog_ref": CT_REF,
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
        },
    )
    snapshot = _op(
        snapshot,
        "add_vt",
        {
            "bay_ref": field_ref,
            "catalog_ref": VT_REF,
            "ratio_primary_v": 15000.0,
            "ratio_secondary_v": 100.0,
        },
    )
    snapshot = _op(
        snapshot,
        "add_relay",
        {"bay_ref": field_ref, "catalog_ref": RELAY_REF, "relay_type": "NADPRADOWY"},
    )

    assert len(_pomiary(snapshot, "CT")) == 1
    assert len(_pomiary(snapshot, "VT")) == 1
    assert len(snapshot["protection_assignments"]) == 1


def test_atomic_and_sequential_paths_produce_the_same_equipment() -> None:
    """Tor atomowy i sekwencyjny dają TE SAME elementy (parytet treści)."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    pola = [
        {"field_role": "LINIA_IN"},
        {"field_role": "LINIA_OUT"},
        {"field_role": "TRANSFORMATOROWE"},
    ]

    atomowo = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref,
            [{"field_role": "LINIA_IN", "equipment": _wyposazenie()}, *pola[1:]],
        ),
    )["snapshot"]

    sekwencyjnie = _op(
        copy.deepcopy(snap), "insert_station_on_segment_sn", _insert_payload(segment_ref, pola)
    )
    field_ref = _pole_wg_roli(sekwencyjnie, "Stacja B-3", "LINIA_IN")
    sekwencyjnie = _op(
        sekwencyjnie,
        "add_ct",
        {
            "bay_ref": field_ref,
            "catalog_ref": CT_REF,
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
        },
    )
    sekwencyjnie = _op(
        sekwencyjnie,
        "add_vt",
        {
            "bay_ref": field_ref,
            "catalog_ref": VT_REF,
            "ratio_primary_v": 15000.0,
            "ratio_secondary_v": 100.0,
        },
    )
    sekwencyjnie = _op(
        sekwencyjnie,
        "add_relay",
        {"bay_ref": field_ref, "catalog_ref": RELAY_REF, "relay_type": "NADPRADOWY"},
    )

    def istotne(snapshot: dict[str, Any]) -> Any:
        pomiary = [
            {
                "typ": m["measurement_type"],
                "catalog_ref": m["catalog_ref"],
                "bay_ref": m["bay_ref"],
                "rating": m["rating"],
            }
            for m in sorted(snapshot["measurements"], key=lambda m: m["ref_id"])
        ]
        zabezpieczenia = [
            {
                "catalog_ref": p["catalog_ref"],
                "device_type": p["device_type"],
                "breaker_ref": p["breaker_ref"],
                "ct_ref": p["ct_ref"],
                "vt_ref": p["vt_ref"],
                "settings": p["settings"],
            }
            for p in sorted(snapshot["protection_assignments"], key=lambda p: p["ref_id"])
        ]
        return pomiary, zabezpieczenia

    assert istotne(atomowo) == istotne(sekwencyjnie)


# ---------------------------------------------------------------------------
# 4. Operacja „stacja na końcu odcinka" — ten sam tor atomowy
# ---------------------------------------------------------------------------


def test_append_station_creates_field_equipment_in_same_snapshot() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()

    result = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {"name": "Stacja końcowa B-3", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "field_apparatus_catalog_ref": APARAT_SN,
            "sn_fields": [{"field_role": "LINIA_IN", "equipment": _wyposazenie()}],
        },
    )

    assert result.get("error") is None, result.get("error")
    snapshot = result["snapshot"]
    assert len(_pomiary(snapshot, "CT")) == 1
    assert len(_pomiary(snapshot, "VT")) == 1
    assert len(snapshot["protection_assignments"]) == 1


def test_append_station_invalid_equipment_aborts_whole_operation() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()

    result = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {"name": "Stacja końcowa B-3", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "field_apparatus_catalog_ref": APARAT_SN,
            "sn_fields": [
                {
                    "field_role": "LINIA_IN",
                    "equipment": _wyposazenie(vt={"catalog_ref": VT_REF}),
                }
            ],
        },
    )

    assert result.get("error_code") == "vt.ratio_missing"
    assert result.get("snapshot") is None


# ---------------------------------------------------------------------------
# 5. PARYTET BRAM KATALOGOWYCH (API)
# ---------------------------------------------------------------------------


def test_field_equipment_binding_passes_the_same_catalog_gate() -> None:
    """Pozycja katalogowa wyposażenia w operacji stacyjnej — ta sama brama."""
    poprawny = _insert_payload(
        "segment/x",
        [{"field_role": "LINIA_IN", "equipment": _wyposazenie()}],
    )
    blad, _ = validate_and_materialize_catalog_binding("insert_station_on_segment_sn", poprawny)
    assert blad is None

    bez_katalogu = _insert_payload(
        "segment/x",
        [
            {
                "field_role": "LINIA_IN",
                "equipment": _wyposazenie(ct={"ratio_primary_a": 400.0, "ratio_secondary_a": 5.0}),
            }
        ],
    )
    blad, _ = validate_and_materialize_catalog_binding("insert_station_on_segment_sn", bez_katalogu)
    assert blad is not None
    assert "Pole SN nr 1" in blad.message_pl


def test_append_station_field_equipment_binding_checked_by_gate() -> None:
    payload = {
        "endpoint_bus_ref": "bus/x",
        "station": {"name": "Stacja", "station_type": "terminal"},
        "field_apparatus_catalog_ref": APARAT_SN,
        "sn_fields": [
            {
                "field_role": "LINIA_IN",
                "equipment": _wyposazenie(
                    vt={"ratio_primary_v": 15000.0, "ratio_secondary_v": 100.0}
                ),
            }
        ],
    }
    blad, _ = validate_and_materialize_catalog_binding("append_station_on_endpoint", payload)
    assert blad is not None
    assert "Pole SN nr 1" in blad.message_pl

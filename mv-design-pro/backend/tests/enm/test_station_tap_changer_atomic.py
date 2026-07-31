"""B-2: zaczepy transformatora powstają W TEJ SAMEJ operacji co stacja.

DŁUG, KTÓRY TE TESTY ZAMYKAJĄ (B-2, karta KD-3). Kanoniczny podzespół zaczepów
``tap_changer`` (V12K-045) istniał wyłącznie dla transformatora GPZ: operacja
źródła go budowała, a `update_element_parameters` nie miał go nawet w liście pól
dozwolonych. Transformator stacji SN/nN powstawał więc ZAWSZE bez regulacji i nie
było jak jej ustawić — ani w kreatorze, ani operacją osobną.

Pilnowane własności:
1. zaczepy podane w operacji stacyjnej trafiają do TEJ SAMEJ migawki co stacja,
2. używany jest KANONICZNY podzespół `tap_changer` (nie równoległe pole),
3. PARYTET: te same klucze payloadu co operacja źródła GPZ i ten sam handler
   (`update_element_parameters`) co zmiana osobna — wynik identyczny,
4. ATOMOWOŚĆ: błąd zaczepów kończy CAŁĄ operację (w modelu nie ma stacji),
5. ZGODNOŚĆ WSTECZNA: payload bez regulacji nie zmienia modelu o bit,
6. obie operacje stacyjne (`insert_...` i `append_...`) zachowują się tak samo.
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

#: Zaczepy typowe dla transformatora dystrybucyjnego SN/nN: przełącznik BEZ
#: WZBUDZENIA (DETC), pięć pozycji ±2 × 2,5 %, regulacja po stronie górnej.
ZACZEPY_DETC: dict[str, Any] = {
    "transformer_regulation_type": "DETC",
    "transformer_regulated_winding": "HV",
    "transformer_tap_neutral_position": 0,
    "transformer_tap_current_position": -1,
    "transformer_tap_min_position": -2,
    "transformer_tap_max_position": 2,
    "transformer_tap_step_percent": 2.5,
}


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="b2_tap_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
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


def _insert_payload(segment_ref: str, transformer: dict[str, Any]) -> dict[str, Any]:
    return {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja B-2",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "field_apparatus_catalog_ref": APARAT_SN,
        "transformer": transformer,
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }


def _transformator(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Transformator UTWORZONEJ stacji (snapshot niesie też transformator GPZ)."""
    return next(
        t for t in snapshot["transformers"] if str(t.get("name", "")).startswith("Transformator")
    )


# ---------------------------------------------------------------------------
# 1. Zaczepy w tej samej migawce, w kanonicznym podzespole
# ---------------------------------------------------------------------------


def test_insert_station_sets_tap_changer_in_same_snapshot() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630, **ZACZEPY_DETC},
    )

    result = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert result.get("error") is None, result.get("error")
    trafo = _transformator(result["snapshot"])
    tap = trafo.get("tap_changer")
    assert tap is not None, "Zaczepy muszą trafić do TEJ SAMEJ migawki co stacja"
    assert tap["regulation_type"] == "DETC"
    assert tap["regulated_winding"] == "HV"
    assert tap["current_position"] == -1
    assert tap["min_position"] == -2
    assert tap["max_position"] == 2
    assert tap["step_percent"] == 2.5
    # Szyna regulowana = szyna nN stacji (to napięcie utrzymuje regulacja).
    assert tap["controlled_bus_ref"] == trafo["lv_bus_ref"]

    typy = [z.get("event_type") for z in result["domain_events"]]
    assert "TAP_CHANGER_SET" in typy
    numery = [z.get("event_seq") for z in result["domain_events"]]
    assert numery == sorted(numery), "Numeracja zdarzeń musi rosnąć monotonicznie"


def test_tap_changer_uses_canonical_field_not_parallel_one() -> None:
    """Regulacja siedzi w `tap_changer`; stare `tap_*` NIE są dublowane.

    Gdyby operacja zapisywała równoległe pole (albo kopiowała wartości do
    `tap_position`), powstałyby DWA źródła prawdy o zaczepach i solver mógłby
    czytać inne niż UI.
    """
    snap, segment_ref, _ = _build_trunk_with_segment()
    result = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref,
            {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630, **ZACZEPY_DETC},
        ),
    )
    trafo = _transformator(result["snapshot"])
    assert trafo.get("tap_changer", {}).get("current_position") == -1
    assert trafo.get("tap_position") is None


# ---------------------------------------------------------------------------
# 2. Parytet z operacją osobną (ten sam handler, ten sam wynik)
# ---------------------------------------------------------------------------


def test_tap_changer_parity_with_separate_update_operation() -> None:
    """Zaczepy w operacji stacyjnej = zaczepy ustawione osobno, co do pola.

    To jest sedno B-2: kreator NIE ma własnej ścieżki zapisu — woła ten sam
    handler `update_element_parameters` na jeszcze niezapisanej migawce.
    """
    snap, segment_ref, _ = _build_trunk_with_segment()

    # Tor A: zaczepy podane od razu w operacji stacyjnej.
    razem = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref,
            {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630, **ZACZEPY_DETC},
        ),
    )
    assert razem.get("error") is None, razem.get("error")
    trafo_razem = _transformator(razem["snapshot"])

    # Tor B: stacja bez regulacji, potem osobna operacja zmiany parametrów.
    osobno_stacja = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref, {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630}
        ),
    )
    assert osobno_stacja.get("error") is None, osobno_stacja.get("error")
    trafo_osobno = _transformator(osobno_stacja["snapshot"])
    assert trafo_osobno.get("tap_changer") is None

    osobno = execute_domain_operation(
        osobno_stacja["snapshot"],
        "update_element_parameters",
        {
            "element_ref": trafo_osobno["ref_id"],
            "parameters": {"tap_changer": trafo_razem["tap_changer"]},
        },
    )
    assert osobno.get("error") is None, osobno.get("error")
    assert _transformator(osobno["snapshot"])["tap_changer"] == trafo_razem["tap_changer"]


def test_update_element_parameters_accepts_canonical_tap_changer() -> None:
    """Kanoniczne pole musi być DOZWOLONE w operacji osobnej (brama pól).

    Przed B-2 `tap_changer` nie był na liście pól dozwolonych, więc operacja
    osobna odrzucała go jako pole niedozwolone — zdolność nie miała dostawcy.
    """
    snap, segment_ref, _ = _build_trunk_with_segment()
    stacja = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref, {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630}
        ),
    )
    trafo_ref = _transformator(stacja["snapshot"])["ref_id"]

    wynik = execute_domain_operation(
        stacja["snapshot"],
        "update_element_parameters",
        {
            "element_ref": trafo_ref,
            "parameters": {
                "tap_changer": {
                    "regulation_type": "OLTC",
                    "regulated_winding": "HV",
                    "neutral_position": 0,
                    "current_position": 1,
                    "min_position": -8,
                    "max_position": 8,
                    "step_percent": 1.25,
                    "control_mode": "AUTOMATIC",
                }
            },
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    assert _transformator(wynik["snapshot"])["tap_changer"]["regulation_type"] == "OLTC"


# ---------------------------------------------------------------------------
# 3. Atomowość i zgodność wsteczna
# ---------------------------------------------------------------------------


def test_invalid_tap_changer_fails_whole_station_operation() -> None:
    """Błąd zaczepów = błąd CAŁEJ operacji; w modelu nie ma stacji ani pól.

    Bez tego model zostałby w stanie połowicznym: stacja zapisana, regulacja nie
    — dokładnie ta klasa, którą B-3 zamknął dla wyposażenia pól.
    """
    snap, segment_ref, _ = _build_trunk_with_segment()
    przed = copy.deepcopy(snap)

    wynik = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref,
            {
                "create": True,
                "transformer_catalog_ref": CATALOG_TRAFO_630,
                # Typ regulacji spoza kontraktu domenowego — walidacja modelu
                # ENM musi odrzucić CAŁĄ operację.
                "transformer_regulation_type": "TYP_KTOREGO_NIE_MA",
            },
        ),
    )

    assert wynik.get("error"), "Nieprawidłowe zaczepy muszą zakończyć operację błędem"
    assert "snapshot" not in wynik or wynik.get("snapshot") is None
    # Model wejściowy nietknięty (operacja pracuje na kopii).
    assert snap == przed


def test_station_without_regulation_is_bit_identical_to_before() -> None:
    """Payload bez regulacji nie zmienia modelu o bit (zgodność wsteczna)."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref, {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630}
    )

    a = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    b = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)

    assert a.get("error") is None, a.get("error")
    assert _transformator(a["snapshot"]).get("tap_changer") is None
    # Determinizm: dwa biegi tego samego wejścia dają identyczną migawkę.
    assert a["snapshot"] == b["snapshot"]


# ---------------------------------------------------------------------------
# 4. Parytet obu operacji stacyjnych
# ---------------------------------------------------------------------------


def test_append_station_sets_tap_changer_in_same_snapshot() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()

    wynik = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {
                "station_type": "terminal",
                "station_name": "Stacja B-2 koniec",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "TRANSFORMATOROWE"}],
            "field_apparatus_catalog_ref": APARAT_SN,
            "transformer": {
                "create": True,
                "transformer_catalog_ref": CATALOG_TRAFO_630,
                **ZACZEPY_DETC,
            },
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )

    assert wynik.get("error") is None, wynik.get("error")
    trafo = next(
        t for t in wynik["snapshot"]["transformers"] if str(t.get("name", "")).startswith("TR ")
    )
    tap = trafo.get("tap_changer")
    assert tap is not None, "Parytet operacji: append musi zapisać zaczepy tak samo jak insert"
    assert tap["current_position"] == -1
    assert tap["step_percent"] == 2.5
    assert tap["controlled_bus_ref"] == trafo["lv_bus_ref"]

"""Phase 0B-3: testy CRUD GPZ sekcji (add/update/delete)."""

from __future__ import annotations

from typing import Any

from enm.domain_operations import (
    add_gpz_section,
    delete_gpz_section,
    update_gpz_section,
)


def _gpz_with_one_section() -> dict[str, Any]:
    return {
        "buses": [
            {
                "ref_id": "b15",
                "name": "B15",
                "voltage_kv": 15,
                "phase_system": "3ph",
                "tags": [],
                "meta": {},
            },
            {
                "ref_id": "b15-2",
                "name": "B15-2",
                "voltage_kv": 15,
                "phase_system": "3ph",
                "tags": [],
                "meta": {},
            },
            {
                "ref_id": "b110",
                "name": "B110",
                "voltage_kv": 110,
                "phase_system": "3ph",
                "tags": [],
                "meta": {},
            },
        ],
        "branches": [],
        "substations": [
            {
                "ref_id": "GPZ-1",
                "name": "GPZ",
                "tags": [],
                "meta": {},
                "station_type": "gpz",
                "bus_refs": ["b15", "b15-2", "b110"],
                "transformer_refs": [],
                "gpz_sections": [
                    {"section_id": "SEC-A", "order": 1, "name": "sekcja A", "bus_ref": "b15"},
                ],
            }
        ],
        "bays": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "branch_points": [],
        "generators": [],
        "events": [],
        "alarms": [],
    }


# ---------------------------------------------------------------------------
# add_gpz_section
# ---------------------------------------------------------------------------


def test_add_gpz_section_lv_appends_with_auto_order() -> None:
    enm = _gpz_with_one_section()
    response = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-B",
            "bus_ref": "b15-2",
            "name": "sekcja B",
        },
    )
    assert response.get("error") is None
    sections = response["snapshot"]["substations"][0]["gpz_sections"]
    assert len(sections) == 2
    new_section = next(s for s in sections if s["section_id"] == "SEC-B")
    assert new_section["order"] == 2
    assert new_section["bus_ref"] == "b15-2"


def test_add_gpz_section_hv_uses_gpz_hv_sections_field() -> None:
    enm = _gpz_with_one_section()
    response = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "side": "hv",
            "section_id": "HV-A",
            "bus_ref": "b110",
        },
    )
    assert response.get("error") is None
    sub = response["snapshot"]["substations"][0]
    # LV pozostały nienaruszone, HV dodane.
    assert len(sub.get("gpz_sections", [])) == 1
    assert len(sub.get("gpz_hv_sections", [])) == 1
    assert sub["gpz_hv_sections"][0]["section_id"] == "HV-A"


def test_add_gpz_section_rejects_duplicate_section_id() -> None:
    enm = _gpz_with_one_section()
    response = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",  # duplikat
            "bus_ref": "b15-2",
        },
    )
    assert response.get("error_code") == "gpz_section.add.duplicate_section_id"


def test_add_gpz_section_rejects_invalid_bus_ref() -> None:
    enm = _gpz_with_one_section()
    response = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-Z",
            "bus_ref": "b-nonexistent",
        },
    )
    assert response.get("error_code") == "gpz_section.add.bus_ref_missing"


def _gpz_z_transformatorem() -> dict[str, Any]:
    """GPZ z UDOWODNIONYMI stronami szyn (relacja transformatora WN/SN).

    `b110` = `hv_bus_ref`, `b15` = `lv_bus_ref` — dowód strony pochodzi z modelu,
    nie z progu napięciowego.
    """
    enm = _gpz_with_one_section()
    enm["transformers"] = [
        {
            "ref_id": "TR-1",
            "name": "TR1",
            "tags": [],
            "meta": {},
            "hv_bus_ref": "b110",
            "lv_bus_ref": "b15",
            "sn_mva": 25,
            "uhv_kv": 110,
            "ulv_kv": 15,
            "uk_percent": 12,
            "pk_kw": 120,
        }
    ]
    enm["substations"][0]["transformer_refs"] = ["TR-1"]
    enm["substations"][0]["meta"] = {"gpz_hv_bus_refs": ["b110"]}
    return enm


# ILOCZYN CECH (karta WN-WYNIK): {strona hv, strona lv} × {szyna udowodniona WN,
# szyna udowodniona SN, szyna bez dowodu strony}. Sekcja przypisująca szynę do
# udowodnionej PRZECIWNEJ strony była dotąd przyjmowana w ciszy, a schemat
# opisywał wtedy szynę WN napięciem szyny SN („Szyna WN · 15 kV" na szynie
# 110 kV — pomiar na sieci z żywego backendu).


def test_add_gpz_section_hv_odrzuca_szyne_sn_stacji() -> None:
    enm = _gpz_z_transformatorem()
    response = add_gpz_section(
        enm,
        {"substation_ref": "GPZ-1", "side": "hv", "section_id": "HV-Z", "bus_ref": "b15"},
    )
    assert response.get("error_code") == "gpz_section.add.bus_side_mismatch"
    # Odmowa NIE zostawia śladu: brak migawki w odpowiedzi i model wejściowy
    # nietknięty (operacja pracuje na kopii dopiero po przejściu bramek).
    assert response["snapshot"] is None
    assert enm["substations"][0].get("gpz_hv_sections") in (None, [])


def test_add_gpz_section_lv_odrzuca_szyne_wn_stacji() -> None:
    enm = _gpz_z_transformatorem()
    response = add_gpz_section(
        enm,
        {"substation_ref": "GPZ-1", "side": "lv", "section_id": "SEC-Z", "bus_ref": "b110"},
    )
    assert response.get("error_code") == "gpz_section.add.bus_side_mismatch"
    assert response["snapshot"] is None
    assert len(enm["substations"][0]["gpz_sections"]) == 1


def test_add_gpz_section_hv_przyjmuje_szyne_wn_stacji() -> None:
    enm = _gpz_z_transformatorem()
    response = add_gpz_section(
        enm,
        {"substation_ref": "GPZ-1", "side": "hv", "section_id": "HV-A", "bus_ref": "b110"},
    )
    assert response.get("error") is None
    assert response["snapshot"]["substations"][0]["gpz_hv_sections"][0]["bus_ref"] == "b110"


def test_add_gpz_section_lv_przyjmuje_szyne_sn_stacji() -> None:
    enm = _gpz_z_transformatorem()
    response = add_gpz_section(
        enm,
        {"substation_ref": "GPZ-1", "side": "lv", "section_id": "SEC-B", "bus_ref": "b15-2"},
    )
    # `b15-2` nie ma dowodu strony (nie jest zaczepem transformatora ani sekcją)
    # — reguła łapie SPRZECZNOŚĆ, nie zgaduje za projektanta.
    assert response.get("error") is None
    assert len(response["snapshot"]["substations"][0]["gpz_sections"]) == 2


def test_add_gpz_section_hv_przyjmuje_szyne_bez_dowodu_strony() -> None:
    enm = _gpz_z_transformatorem()
    response = add_gpz_section(
        enm,
        {"substation_ref": "GPZ-1", "side": "hv", "section_id": "HV-B", "bus_ref": "b15-2"},
    )
    assert response.get("error") is None


def test_add_gpz_section_rejects_non_gpz_station() -> None:
    enm = _gpz_with_one_section()
    enm["substations"][0]["station_type"] = "mv_lv"
    response = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-Z",
            "bus_ref": "b15-2",
        },
    )
    assert response.get("error_code") == "gpz_section.add.invalid_station_type"


def test_add_gpz_section_rejects_invalid_side() -> None:
    enm = _gpz_with_one_section()
    response = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "side": "ev",
            "section_id": "X",
            "bus_ref": "b15",
        },
    )
    assert response.get("error_code") == "gpz_section.add.invalid_side"


# ---------------------------------------------------------------------------
# update_gpz_section
# ---------------------------------------------------------------------------


def test_update_gpz_section_changes_name() -> None:
    enm = _gpz_with_one_section()
    response = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",
            "updates": {"name": "sekcja A (zmieniona)"},
        },
    )
    assert response.get("error") is None
    sections = response["snapshot"]["substations"][0]["gpz_sections"]
    assert sections[0]["name"] == "sekcja A (zmieniona)"


def test_update_gpz_section_changes_order_and_resorts() -> None:
    enm = _gpz_with_one_section()
    enm["substations"][0]["gpz_sections"].append(
        {"section_id": "SEC-B", "order": 2, "bus_ref": "b15-2"}
    )
    response = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",
            "updates": {"order": 3},
        },
    )
    sections = response["snapshot"]["substations"][0]["gpz_sections"]
    # Po zmianie order(SEC-A)=3, sortowanie: SEC-B (order=2) → SEC-A (order=3).
    assert [s["section_id"] for s in sections] == ["SEC-B", "SEC-A"]


def test_update_gpz_section_clears_coupler_with_none() -> None:
    enm = _gpz_with_one_section()
    enm["substations"][0]["gpz_sections"][0]["right_coupler_ref"] = "bay-cpl"
    response = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",
            "updates": {"right_coupler_ref": None},
        },
    )
    sec = response["snapshot"]["substations"][0]["gpz_sections"][0]
    assert "right_coupler_ref" not in sec


def test_update_gpz_section_rejects_disallowed_keys() -> None:
    enm = _gpz_with_one_section()
    response = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",
            "updates": {"section_id": "NEW-ID"},  # immutable
        },
    )
    assert response.get("error_code") == "gpz_section.update.disallowed_keys"


def test_update_gpz_section_rejects_invalid_bus_ref() -> None:
    enm = _gpz_with_one_section()
    response = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",
            "updates": {"bus_ref": "b-nonexistent"},
        },
    )
    assert response.get("error_code") == "gpz_section.update.bus_ref_missing"


def test_update_gpz_section_rejects_missing_section() -> None:
    enm = _gpz_with_one_section()
    response = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "DOES-NOT-EXIST",
            "updates": {"name": "X"},
        },
    )
    assert response.get("error_code") == "gpz_section.update.section_missing"


# ---------------------------------------------------------------------------
# delete_gpz_section
# ---------------------------------------------------------------------------


def test_delete_gpz_section_removes_when_unused() -> None:
    enm = _gpz_with_one_section()
    enm["substations"][0]["gpz_sections"].append(
        {"section_id": "SEC-B", "order": 2, "bus_ref": "b15-2"}
    )
    response = delete_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-B",
        },
    )
    assert response.get("error") is None
    sections = response["snapshot"]["substations"][0]["gpz_sections"]
    assert [s["section_id"] for s in sections] == ["SEC-A"]


def test_delete_gpz_section_blocks_when_in_use_by_bay() -> None:
    enm = _gpz_with_one_section()
    enm["bays"].append(
        {
            "ref_id": "bay-1",
            "name": "P1",
            "tags": [],
            "meta": {},
            "bay_role": "OUT",
            "substation_ref": "GPZ-1",
            "bus_ref": "b15",
            "gpz_section_id": "SEC-A",
            "equipment_refs": [],
        }
    )
    response = delete_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-A",
        },
    )
    assert response.get("error_code") == "gpz_section.delete.in_use"


def test_delete_gpz_section_rejects_missing_section() -> None:
    enm = _gpz_with_one_section()
    response = delete_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "DOES-NOT-EXIST",
        },
    )
    assert response.get("error_code") == "gpz_section.delete.section_missing"


def test_delete_gpz_section_rejects_missing_substation() -> None:
    enm = _gpz_with_one_section()
    response = delete_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-NONEXIST",
            "section_id": "SEC-A",
        },
    )
    assert response.get("error_code") == "gpz_section.delete.substation_missing"


# ---------------------------------------------------------------------------
# Round-trip: add → update → delete chain
# ---------------------------------------------------------------------------


def test_add_then_update_then_delete_chain() -> None:
    enm = _gpz_with_one_section()

    r1 = add_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-B",
            "bus_ref": "b15-2",
            "name": "sekcja B",
        },
    )
    assert r1.get("error") is None
    enm = r1["snapshot"]

    r2 = update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-B",
            "updates": {"name": "sekcja B (renamed)"},
        },
    )
    assert r2.get("error") is None
    enm = r2["snapshot"]
    assert enm["substations"][0]["gpz_sections"][1]["name"] == "sekcja B (renamed)"

    r3 = delete_gpz_section(
        enm,
        {
            "substation_ref": "GPZ-1",
            "section_id": "SEC-B",
        },
    )
    assert r3.get("error") is None
    enm = r3["snapshot"]
    assert len(enm["substations"][0]["gpz_sections"]) == 1
    assert enm["substations"][0]["gpz_sections"][0]["section_id"] == "SEC-A"

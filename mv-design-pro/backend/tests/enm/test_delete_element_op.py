from enm.domain_operations import execute_domain_operation


def _base_enm():
    # Karta #151: identyfikatory elementów to UUID (kontrakt ENM) — wynik operacji jest
    # walidowany kontraktem; dawne „id": "1" przechodziło tylko dzięki połkniętej walidacji.
    return {
        "header": {
            "name": "Test",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "bus/a",
                "name": "A",
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "bus/b",
                "name": "B",
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "ref_id": "br/ab",
                "name": "AB",
                "type": "cable",
                "from_bus_ref": "bus/a",
                "to_bus_ref": "bus/b",
                "length_km": 1.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.1,
            }
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000004",
                "ref_id": "src/a",
                "name": "GPZ",
                "bus_ref": "bus/a",
                "model": "short_circuit_power",
                "sk3_mva": 250,
                "rx_ratio": 0.1,
            }
        ],
        "loads": [],
        "generators": [],
        "substations": [
            {
                "id": "00000000-0000-0000-0000-000000000005",
                "ref_id": "sub/a",
                "name": "Sub A",
                "station_type": "mv_lv",
                "kind": "mv_station",
                "bus_ref": "bus/a",
                "transformer_refs": [],
            }
        ],
        "bays": [
            {
                "id": "00000000-0000-0000-0000-000000000006",
                "ref_id": "bay/a",
                "name": "Pole A",
                "bay_role": "OUT",
                "substation_ref": "sub/a",
                "bus_ref": "bus/a",
                "equipment_refs": ["br/ab"],
            }
        ],
        "junctions": [],
        "corridors": [
            {
                "ref_id": "corr/main",
                "name": "Magistrala główna",
                "ordered_segment_refs": ["br/ab"],
                "corridor_type": "radial",
                "no_point_ref": "br/ab",
            }
        ],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [
            {
                "id": "00000000-0000-0000-0000-000000000007",
                "ref_id": "bp/ab",
                "name": "Punkt AB",
                "branch_point_type": "branch_pole",
                "parent_segment_id": "br/ab",
                "bus_ref": "bus/b",
                "ports": {"MAIN_IN": "br/ab", "MAIN_OUT": "br/ab", "BRANCH": []},
                "branch_occupied": {},
            }
        ],
    }


def test_delete_branch_removes_from_corridor_and_returns_deleted_list():
    enm = _base_enm()

    response = execute_domain_operation(
        enm,
        "delete_element",
        {"element_ref": "br/ab"},
    )

    assert response.get("error") is None
    assert "br/ab" in response["changes"]["deleted_element_ids"]
    assert response["snapshot"]["branches"] == []
    assert response["snapshot"]["branch_points"] == []
    assert response["logical_views"]["trunks"][0]["segments"] == []


def test_delete_bus_cascades_dependent_elements():
    enm = _base_enm()

    response = execute_domain_operation(
        enm,
        "delete_element",
        {"element_ref": "bus/a"},
    )

    assert response.get("error") is None
    deleted = set(response["changes"]["deleted_element_ids"])
    assert "bus/a" in deleted
    assert "br/ab" in deleted
    assert "src/a" in deleted
    assert "sub/a" in deleted
    assert all(b["ref_id"] != "bus/a" for b in response["snapshot"]["buses"])
    assert response["snapshot"]["substations"] == []
    assert response["snapshot"]["bays"] == []

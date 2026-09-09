"""Karta W3-B (§0.2, mapa 4 #3): `set_measurement_secondary_circuit` — droga
edycji `Measurement.obwod_wtorny` PO utworzeniu przekładnika.

ZMIERZONE PRZED NAPISANIEM TEJ OPERACJI (karta wymagała sprawdzenia, czy
istnieje operacja edycji zamiast nowej — „nie twórz drugiej drogi zapisu"):
`update_element_parameters` odrzuca KAŻDĄ próbę zapisu do kolekcji
`measurements` kodem `field.legacy_write_disabled`, NIEZALEŻNIE od pola —
`measurements` jest na liście `LEGACY_FIELD_COLLECTIONS` (V11, zapis
architektonicznie wyłączony). Pierwszy test tej klasy dokumentuje ten pomiar
(regresja: gdyby ktoś kiedyś zdjął blokadę i otworzył generyczną drogę zapisu,
powstałaby DRUGA droga zapisu tego samego pola — dokładnie to, czego karta
zakazuje). `add_ct`/`add_vt` zapisują `obwod_wtorny` WYŁĄCZNIE przy tworzeniu
(patrz `test_domain_ops_add_ct_persists_obwod_wtorny` w `test_enm_api.py`) —
`set_measurement_secondary_circuit` jest jedyną drogą dla PO utworzeniu.
"""

from __future__ import annotations

import copy

from enm.domain_operations import execute_domain_operation


def _enm_with_ct() -> dict:
    return {
        "header": {"name": "Measurement Circuit Op Test", "revision": 1, "defaults": {}},
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "bus/sn",
                "name": "Szyna SN",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "type": "bus",
            },
        ],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "ct-1",
                "name": "CT pola 1",
                "measurement_type": "CT",
                "bus_ref": "bus/sn",
                "bay_ref": "field_1",
                "rating": {"ratio_primary": 200.0, "ratio_secondary": 5.0},
                "tags": [],
                "meta": {},
            }
        ],
        "protection_assignments": [],
        "branch_points": [],
    }


def _enm_with_vt() -> dict:
    enm = _enm_with_ct()
    enm["measurements"] = [
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "vt-1",
            "name": "VT pola 1",
            "measurement_type": "VT",
            "bus_ref": "bus/sn",
            "bay_ref": "field_1",
            "rating": {"ratio_primary": 15000.0, "ratio_secondary": 100.0},
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def test_update_element_parameters_odrzuca_kazda_probe_na_measurements() -> None:
    """Pomiar udokumentowany w docstringu modułu — regresja tej bramki
    architektonicznej dowodzi, że nowa operacja nie duplikuje istniejącej."""
    enm = _enm_with_ct()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={"element_ref": "ct-1", "parameters": {"name": "Nowa nazwa"}},
    )

    assert result.get("error_code") == "field.legacy_write_disabled"
    assert result.get("snapshot") is None


def test_set_measurement_secondary_circuit_zapisuje_obwod_na_ct() -> None:
    enm = _enm_with_ct()
    before = copy.deepcopy(enm)

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={
            "measurement_ref": "ct-1",
            "obwod_wtorny": {
                "dlugosc_przewodu_m": 40.0,
                "przekroj_przewodu_mm2": 2.5,
                "obciazenia_aparatow": [{"nazwa": "Przekaźnik", "moc_va": 3.0}],
            },
        },
    )

    assert result.get("error_code") is None, result.get("error")
    updated = result["snapshot"]["measurements"][0]
    assert updated["obwod_wtorny"]["dlugosc_przewodu_m"] == 40.0
    # Reszta elementu NIETKNIĘTA — operacja pisze WYŁĄCZNIE obwód wtórny.
    assert before["measurements"][0]["rating"] == updated["rating"]
    assert before["measurements"][0]["name"] == updated["name"]
    assert result["changes"]["updated_element_ids"] == ["ct-1"]
    assert result["domain_events"][0]["event_type"] == "MEASUREMENT_SECONDARY_CIRCUIT_SET"

    # Zapis/odczyt: migawka zwrócona przez operację jest tym, co API by
    # zapisało (`api/enm.py::_domain_ops_pod_blokada` waliduje ją identycznie).
    from enm.models import EnergyNetworkModel

    zwalidowana = EnergyNetworkModel.model_validate(result["snapshot"])
    assert zwalidowana.measurements[0].obwod_wtorny.dlugosc_przewodu_m == 40.0


def test_set_measurement_secondary_circuit_zapisuje_uzwojenie_na_vt() -> None:
    enm = _enm_with_vt()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={
            "measurement_ref": "vt-1",
            "obwod_wtorny": {"dlugosc_przewodu_m": 8.0, "przekroj_przewodu_mm2": 1.5},
            "vt_uzwojenie": "ZABEZPIECZENIOWE",
        },
    )

    assert result.get("error_code") is None, result.get("error")
    updated = result["snapshot"]["measurements"][0]
    assert updated["vt_uzwojenie"] == "ZABEZPIECZENIOWE"
    assert updated["obwod_wtorny"]["dlugosc_przewodu_m"] == 8.0


def test_set_measurement_secondary_circuit_odrzuca_uzwojenie_na_ct() -> None:
    # Walidacja DOMENOWA (blad jasny, nie surowy ValidationError z zapisu).
    enm = _enm_with_ct()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={
            "measurement_ref": "ct-1",
            "obwod_wtorny": {"dlugosc_przewodu_m": 10.0},
            "vt_uzwojenie": "POMIAROWE",
        },
    )

    assert result.get("error_code") == "measurement_circuit.vt_uzwojenie_wrong_type"
    assert result.get("snapshot") is None


def test_set_measurement_secondary_circuit_wymaga_obwodu() -> None:
    enm = _enm_with_ct()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={"measurement_ref": "ct-1"},
    )

    assert result.get("error_code") == "measurement_circuit.obwod_missing"


def test_set_measurement_secondary_circuit_null_czysci_obwod() -> None:
    enm = _enm_with_ct()
    enm["measurements"][0]["obwod_wtorny"] = {
        "dlugosc_przewodu_m": 20.0,
        "przekroj_przewodu_mm2": 2.5,
    }

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={"measurement_ref": "ct-1", "obwod_wtorny": None},
    )

    assert result.get("error_code") is None, result.get("error")
    assert result["snapshot"]["measurements"][0].get("obwod_wtorny") is None


def test_set_measurement_secondary_circuit_nieznany_ref_404_domenowo() -> None:
    enm = _enm_with_ct()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={
            "measurement_ref": "ct-nieistniejacy",
            "obwod_wtorny": {"dlugosc_przewodu_m": 10.0},
        },
    )

    assert result.get("error_code") == "measurement_circuit.not_found"
    assert result.get("snapshot") is None


def test_set_measurement_secondary_circuit_odrzuca_ujemna_dlugosc_przy_zapisie() -> None:
    """Kontrakt walidowany PRZY ZAPISIE migawki (`Measurement.obwod_wtorny`,
    `gt=0`) — operacja domenowa nie omija reguły modelu."""
    from enm.models import EnergyNetworkModel

    enm = _enm_with_ct()
    result = execute_domain_operation(
        enm_dict=enm,
        op_name="set_measurement_secondary_circuit",
        payload={
            "measurement_ref": "ct-1",
            "obwod_wtorny": {"dlugosc_przewodu_m": -5.0},
        },
    )
    assert result.get("error_code") is None  # operacja SAMA nie waliduje kształtu
    try:
        EnergyNetworkModel.model_validate(result["snapshot"])
        raised = False
    except Exception:
        raised = True
    assert raised, "ujemna dlugosc powinna byc odrzucona przy walidacji migawki"

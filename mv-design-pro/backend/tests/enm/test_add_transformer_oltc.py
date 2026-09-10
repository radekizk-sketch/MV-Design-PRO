"""G-TRF (V12K-048): add_transformer_sn_nn materializuje kanoniczny TapChanger.

Domknięcie łańcucha OLTC dla samodzielnego transformatora SN/nN: model TapChanger,
pętla regulacji LF, badania OLTC i raporty istniały (V12K-045/046), ale operacja
`add_transformer_sn_nn` nie tworzyła zaczepu — regulacji dało się użyć tylko na
transformatorze GPZ. Ten test weryfikuje materializację (reużycie proven helpera)
oraz wsteczną zgodność (bez regulacji → brak tap_changer).
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation


def _enm_two_buses() -> dict:
    return {
        "buses": [
            {"ref_id": "bus-sn", "name": "Szyna SN", "voltage_kv": 15.0},
            {"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4},
        ]
    }


def _binding() -> dict:
    return {
        "catalog_binding": {
            "catalog_namespace": "TRAFO_SN_NN",
            "catalog_item_id": "energen-tonr-1000-15-04",
            "catalog_item_version": "2024.1",
            "materialize": True,
        }
    }


def _created_transformer(result: dict) -> dict:
    trafos = result["snapshot"]["transformers"]
    assert len(trafos) == 1
    return trafos[0]


def test_transformer_without_regulation_has_no_tap_changer() -> None:
    result = execute_domain_operation(
        _enm_two_buses(),
        "add_transformer_sn_nn",
        {"hv_bus_ref": "bus-sn", "lv_bus_ref": "bus-nn", **_binding()},
    )
    assert not result.get("error"), result
    assert "tap_changer" not in _created_transformer(result)


def test_transformer_with_oltc_materializes_canonical_tap_changer() -> None:
    result = execute_domain_operation(
        _enm_two_buses(),
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": "bus-sn",
            "lv_bus_ref": "bus-nn",
            **_binding(),
            "transformer_regulation_type": "OLTC",
            "transformer_regulated_winding": "HV",
            "transformer_tap_neutral_position": 0,
            "transformer_tap_current_position": 0,
            "transformer_tap_min_position": -9,
            "transformer_tap_max_position": 9,
            "transformer_tap_step_percent": 1.25,
            # KANONICZNA wartość trybu sterowania (`enm.models.TapChanger`).
            # Wcześniej ten test podawał tu "AUTO" — wartość SPOZA kontraktu —
            # i przechodził, bo nic jej nie sprawdzało: operacja zapisywała ją
            # wprost do migawki, a `TapChanger` odrzuciłby ją dopiero przy
            # walidacji modelu. Test maskował defekt produktu (kreator
            # transformatora ui2 wysyłał dokładnie tę wartość). Karta KD-3
            # naprawiła OBA: kontrakt jest teraz sprawdzany w operacji, a
            # kreator wysyła `AUTOMATIC`.
            "transformer_control_mode": "AUTOMATIC",
            "transformer_voltage_setpoint_kv": 15.5,
            "transformer_deadband_kv": 0.2,
        },
    )
    assert not result.get("error"), result
    tc = _created_transformer(result)["tap_changer"]
    assert tc["regulation_type"] == "OLTC"
    assert tc["regulated_winding"] == "HV"
    assert tc["min_position"] == -9
    assert tc["max_position"] == 9
    assert tc["step_percent"] == 1.25
    assert tc["control_mode"] == "AUTOMATIC"
    assert tc["voltage_setpoint_kv"] == 15.5
    assert tc["deadband_kv"] == 0.2
    # Strona regulowana domyślnie steruje szyną nN (controlled_bus_ref = lv_bus).
    assert tc["controlled_bus_ref"] == "bus-nn"


def test_transformer_tap_changer_survives_create_device() -> None:
    # Regresja: create_device whitelistuje pola — tap_changer musi przetrwać.
    result = execute_domain_operation(
        _enm_two_buses(),
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": "bus-sn",
            "lv_bus_ref": "bus-nn",
            **_binding(),
            "transformer_regulation_type": "DETC",
            "transformer_tap_step_percent": 2.5,
        },
    )
    tc = _created_transformer(result).get("tap_changer")
    assert tc is not None and tc["regulation_type"] == "DETC"


def test_control_mode_outside_contract_is_rejected() -> None:
    """Wartość spoza kontraktu `TapChanger` kończy operację błędem (karta KD-3).

    Do tej pory przechodziła cicho do migawki i wywracała dopiero walidację
    modelu — czyli daleko od miejsca, w którym powstała.
    """
    result = execute_domain_operation(
        _enm_two_buses(),
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": "bus-sn",
            "lv_bus_ref": "bus-nn",
            **_binding(),
            "transformer_regulation_type": "OLTC",
            "transformer_control_mode": "AUTO",
        },
    )
    assert result.get("error"), "Tryb sterowania spoza kontraktu musi zostać odrzucony"
    assert result.get("error_code") == "transformer.tap_changer_invalid"


def test_tap_range_reversed_is_rejected() -> None:
    """Odwrócony zakres zaczepów (min > max) jest błędem, nie danymi."""
    result = execute_domain_operation(
        _enm_two_buses(),
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": "bus-sn",
            "lv_bus_ref": "bus-nn",
            **_binding(),
            "transformer_regulation_type": "DETC",
            "transformer_tap_min_position": 4,
            "transformer_tap_max_position": -4,
            "transformer_tap_step_percent": 2.5,
        },
    )
    assert result.get("error")
    assert result.get("error_code") == "transformer.tap_changer_invalid"


def test_dwa_transformatory_z_tej_samej_szyny_hv_auto_lv_bez_kolizji() -> None:
    """CV-4.3 K1 — KLASA NIE INSTANCJA: seed nowej szyny nN auto-tworzonej
    (`lv_voltage_kv`, bez `lv_bus_ref`) nie niósł `catalog_ref`/zaczepu, więc
    DWA różne transformatory (różny typ katalogowy, różny zaczep pozanominalny)
    odchodzące z TEJ SAMEJ szyny HV na TO SAMO napięcie LV kolidowały —
    dokładnie ta sama klasa, którą ta karta naprawiła wcześniej w
    `continue_trunk_segment_sn`/`start_branch_segment_sn`/
    `connect_secondary_ring_sn` (seed bez catalog_ref/nazwy). Znalezisko:
    sieć IEEE 39-bus (BR40/BR41, oba B18->345 kV, różny katalog/zaczep)."""
    enm = {"buses": [{"ref_id": "bus-hv", "name": "Szyna HV", "voltage_kv": 345.0}]}
    wspolny_payload = {
        "hv_bus_ref": "bus-hv",
        "lv_voltage_kv": 345.0,
        "transformer_regulation_type": "DETC",
        "transformer_tap_neutral_position": 0,
        "transformer_tap_min_position": 0,
        "transformer_tap_max_position": 1,
        "transformer_tap_current_position": 1,
    }
    r1 = execute_domain_operation(
        enm,
        "add_transformer_sn_nn",
        {
            **wspolny_payload,
            **_binding(),
            "transformer_tap_step_percent": 6.0,
        },
    )
    assert not r1.get("error"), r1
    r2 = execute_domain_operation(
        r1["snapshot"],
        "add_transformer_sn_nn",
        {
            **wspolny_payload,
            "transformer_catalog_ref": "bench_ieee14bus_br15",
            "transformer_tap_step_percent": 6.0,
        },
    )
    assert not r2.get("error"), r2
    trafos = r2["snapshot"]["transformers"]
    assert len(trafos) == 2
    assert trafos[0]["ref_id"] != trafos[1]["ref_id"]
    assert trafos[0]["lv_bus_ref"] != trafos[1]["lv_bus_ref"]

"""D1 (RECENZJA_DER_SN_DOBORY_2026-07): twarde walidacje domenowe toru DER-SN.

Ćwiczy wymagania 2 (U_AC↔nN TR), 6 (napięcie SN), 5 (moc TR), 5b (kaskada prądowa)
oraz 9 (jawny „sposób przyłączenia") na przykładach kanonu — przypadki BŁĘDNE odrzucane
z właściwym kodem/komunikatem, przypadki POPRAWNE przechodzą, wynik deterministyczny.

Backend jest jedynym źródłem prawdy walidacji (kreator dubluje ją tylko na żywo). Testy
odwołują się do zmaterializowanego toru z `test_der_sn_topology_domain_ops` (fundament W2b).
"""

from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

# Realne pozycje katalogowe (parytet z test_der_sn_topology_domain_ops + katalog aparatu SN).
_TR_BLOCK_04 = "tr-sn-nn-15-04-1000kva-dyn11"  # Sn = 1,0 MVA (katalog autorytatywny)
_TR_BLOCK_04_630 = "tr-sn-nn-15-04-630kva-dyn11"  # Sn = 0,63 MVA
_CABLE = "cable-base-epr-al-1c-240"
_APARAT_SN_REAL = "sw-cb-abb-vd4-24kv-630a"  # niesie i_n_a=630 A → ogniwo In pola dostępne

#: Napięcie znamionowe falownika → RZECZYWISTA pozycja katalogu o tym napięciu.
#: Tabliczka źródła pochodzi wyłącznie z katalogu (defekt G), więc test nie może
#: „zadeklarować" innego napięcia niż pozycja, którą wskazuje: wariant napięciowy
#: wybiera się teraz WYBOREM POZYCJI KATALOGOWEJ — dokładnie tak, jak projektant.
_FALOWNIK_WG_NAPIECIA: dict[float, str] = {
    0.4: "conv-pv-nn-0p5mw-0p4kv",
    0.69: "conv-pv-nn-0p5mw-0p69kv",
    0.8: "conv-pv-nn-0p5mw-0p8kv",
}


def _sn_station_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="der-sn-val", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm["buses"] = [
        {
            "ref_id": "bus_sn",
            "name": "Szyna SN",
            "voltage_kv": 15.0,
            "frequency_hz": 50.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        }
    ]
    enm["transformers"] = []
    enm["substations"] = [
        {
            "ref_id": "st_1",
            "name": "Stacja 1",
            "station_type": "mv_lv",
            "bus_refs": ["bus_sn"],
            "transformer_refs": [],
            "tags": [],
            "meta": {},
        }
    ]
    enm["sources"] = [
        {
            "ref_id": "src_gpz",
            "name": "GPZ",
            "bus_ref": "bus_sn",
            "model": "short_circuit_power",
            "sk3_mva": 500.0,
            "rx_ratio": 0.1,
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _der_sn_payload(
    *,
    inverter_output_kv: float = 0.4,
    converter_un_kv: float = 0.4,
    block_secondary_kv: float = 0.4,
    block_primary_kv: float = 15.0,
    block_rated_power_mva: float = 1.0,
    block_tr_ref: str = _TR_BLOCK_04,
    power_setpoint_mw: float = 1.0,
    cos_phi: float | None = None,
    loadability_pu: float | None = None,
    simultaneity_factor: float | None = None,
    connection_method: str | None = None,
    has_block_transformer: bool = True,
    has_manufacturer_lv_switchgear: bool = True,
    apparatus_ref: str | None = _APARAT_SN_REAL,
    quantity: int = 1,
) -> dict:
    payload: dict = {
        "source_technology": "PV",
        "connection_variant": "block_transformer",
        "station_ref": "st_1",
        "bus_nn_ref": "bus_sn",
        "source_name": "Blok PV SN",
        "quantity": quantity,
        "power_setpoint_mw": power_setpoint_mw,
        "catalog_binding": {
            "catalog_namespace": "ZRODLO_NN_PV",
            "catalog_item_id": _FALOWNIK_WG_NAPIECIA[converter_un_kv],
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": inverter_output_kv,
            "has_manufacturer_lv_switchgear": has_manufacturer_lv_switchgear,
            "lv_switchgear_variant": "multi-feeder",
            "has_block_transformer": has_block_transformer,
            "block_transformer": {
                "rated_power_mva": block_rated_power_mva,
                "primary_voltage_kv": block_primary_kv,
                "secondary_voltage_kv": block_secondary_kv,
                "catalog_ref": block_tr_ref,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": block_tr_ref,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "has_dedicated_mv_field": True,
            "mv_bus_ref": "bus_sn",
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": False,
                "earthing_switch": True,
                "surge_arrester": False,
                "protection_relay": True,
                "cable_head": True,
                "apparatus_catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": apparatus_ref,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "cable_catalog_ref": _CABLE,
                "cable_catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": _CABLE,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "cable_length_km": 0.05,
            },
        },
    }
    if apparatus_ref is None:
        # Pole bez WSKAZANEGO aparatu jest kanoniczne (`requires_catalog_binding`) —
        # wtedy ogniwo In pola nie ma źródła i musi być pominięte Z OSTRZEŻENIEM.
        payload["der_topology"]["mv_field_configuration"].pop("apparatus_catalog_binding")
    if cos_phi is not None:
        payload["cos_phi"] = cos_phi
    if loadability_pu is not None:
        payload["der_topology"]["block_transformer"]["loadability_pu"] = loadability_pu
    if simultaneity_factor is not None:
        payload["der_topology"]["simultaneity_factor"] = simultaneity_factor
    if connection_method is not None:
        payload["der_topology"]["connection_method"] = connection_method
    return payload


def _run(payload: dict) -> dict:
    return execute_domain_operation(_sn_station_enm(), "add_converter_source", payload)


# ---------------------------------------------------------------------------
# Wymaganie 2: U_AC falownika ↔ strona nN TR blokowego.
# ---------------------------------------------------------------------------


def test_req2_inverter_400v_vs_tr_069_rejected() -> None:
    """Kanon: falownik 400 V + TR 0,69/15 kV = BŁĄD."""
    result = _run(
        _der_sn_payload(inverter_output_kv=0.4, converter_un_kv=0.4, block_secondary_kv=0.69)
    )
    assert result["error_code"] == "converter.der_sn.napiecie_falownika_niezgodne"
    assert "0.4 kV" in result["error"] and "0.69 kV" in result["error"]


def test_req2_inverter_800v_vs_tr_04_rejected() -> None:
    """Kanon: falownik 800 V + TR 0,4/15 kV = BŁĄD."""
    result = _run(
        _der_sn_payload(inverter_output_kv=0.8, converter_un_kv=0.8, block_secondary_kv=0.4)
    )
    assert result["error_code"] == "converter.der_sn.napiecie_falownika_niezgodne"
    assert "0.8 kV" in result["error"] and "0.4 kV" in result["error"]


def test_req2_inverter_400v_vs_tr_04_accepted() -> None:
    """Poprawny dobór: falownik 400 V + TR 0,4/15 kV."""
    result = _run(
        _der_sn_payload(inverter_output_kv=0.4, converter_un_kv=0.4, block_secondary_kv=0.4)
    )
    assert not result.get("error"), result.get("error")


def test_req2_inverter_690v_vs_tr_069_accepted() -> None:
    """Poprawny dobór: falownik 690 V + TR 0,69/15 kV."""
    result = _run(
        _der_sn_payload(inverter_output_kv=0.69, converter_un_kv=0.69, block_secondary_kv=0.69)
    )
    assert not result.get("error"), result.get("error")


# ---------------------------------------------------------------------------
# Wymaganie 6: napięcie strony SN TR blokowego ↔ szyna SN sieci.
# ---------------------------------------------------------------------------


def test_req6_tr_primary_20kv_vs_grid_15kv_rejected() -> None:
    """Kanon: TR 0,69/20 kV (albo pole 20 kV) przy sieci 15 kV = BŁĄD."""
    result = _run(_der_sn_payload(block_primary_kv=20.0))
    assert result["error_code"] == "converter.der_sn.napiecie_sn_niezgodne"
    assert "20 kV" in result["error"] and "15 kV" in result["error"]


def test_req6_tr_primary_15kv_vs_grid_15kv_accepted() -> None:
    result = _run(_der_sn_payload(block_primary_kv=15.0))
    assert not result.get("error"), result.get("error")


# ---------------------------------------------------------------------------
# Wymaganie 5: moc TR blokowego (ΣS ≤ Sn · dopuszczalne obciążenie).
# ---------------------------------------------------------------------------


def test_req5_power_exceeds_transformer_rejected() -> None:
    """Kanon: wybór TR 0,63 MVA (katalog) dla 1,0 MW ⇒ moc niewystarczająca."""
    result = _run(_der_sn_payload(block_tr_ref=_TR_BLOCK_04_630, power_setpoint_mw=1.0))
    assert result["error_code"] == "converter.der_sn.moc_transformatora_niewystarczajaca"
    assert "MVA" in result["error"]


def test_req5_power_within_transformer_accepted() -> None:
    result = _run(_der_sn_payload(block_tr_ref=_TR_BLOCK_04, power_setpoint_mw=1.0))
    assert not result.get("error"), result.get("error")


def test_req5_cos_phi_converts_mw_to_mva_and_rejects() -> None:
    """cosφ=0,9: 0,95 MW / 0,9 = 1,055 MVA > 1,0 MVA (TR 1,0 MVA katalogowy)."""
    result = _run(_der_sn_payload(block_tr_ref=_TR_BLOCK_04, power_setpoint_mw=0.95, cos_phi=0.9))
    assert result["error_code"] == "converter.der_sn.moc_transformatora_niewystarczajaca"


def test_req5_loadability_relaxes_power_limit() -> None:
    """Jawna przeciążalność 1,25 pu dopuszcza 1,2 MW na TR 1,0 MVA (P=S konserwatywnie)."""
    strict = _run(_der_sn_payload(block_tr_ref=_TR_BLOCK_04, power_setpoint_mw=1.2))
    assert strict["error_code"] == "converter.der_sn.moc_transformatora_niewystarczajaca"
    relaxed = _run(
        _der_sn_payload(block_tr_ref=_TR_BLOCK_04, power_setpoint_mw=1.2, loadability_pu=1.25)
    )
    assert not relaxed.get("error"), relaxed.get("error")


def test_req5_simultaneity_factor_reduces_load() -> None:
    """Współczynnik jednoczesności 0,8 obniża ΣS: 1,2 MW · 0,8 = 0,96 MVA ≤ 1,0 MVA."""
    result = _run(
        _der_sn_payload(block_tr_ref=_TR_BLOCK_04, power_setpoint_mw=1.2, simultaneity_factor=0.8)
    )
    assert not result.get("error"), result.get("error")


# ---------------------------------------------------------------------------
# Wymaganie 5b: kaskada prądowa I_TR ≤ Iz kabla ≤ In pola (jawne pomijanie ogniw).
# ---------------------------------------------------------------------------


def _warning_codes(result: dict) -> list[str]:
    return [w["code"] for w in result["readiness"]["warnings"]]


def test_req5b_cascade_full_chain_no_warning() -> None:
    """Wszystkie ogniwa dostępne (Sn/U → I_TR, kabel 400 A, aparat 630 A) i spójne."""
    result = _run(_der_sn_payload())
    assert not result.get("error"), result.get("error")
    codes = _warning_codes(result)
    # Brak ostrzeżeń „brak danych ogniwa" — wszystkie ogniwa mają dane.
    assert "converter.der_sn.kaskada_prad_pole_brak" not in codes
    assert "converter.der_sn.kaskada_prad_kabel_brak" not in codes
    assert "converter.der_sn.kaskada_prad_tr_brak" not in codes


def test_req5b_cascade_missing_field_current_warns_explicitly() -> None:
    """Pole bez WSKAZANEGO aparatu ⇒ In pola pominięte Z JAWNYM OSTRZEŻENIEM.

    Intencja bez zmian (ogniwo bez danych ma być nazwane, nie ominięte w ciszy),
    zmienił się SPOSÓB jej wywołania: dotąd test podawał referencję aparatu,
    której w katalogu nie ma, i operacja to przyjmowała — czyli „brak danej"
    powstawał z martwej referencji zapisywanej do modelu. Po naprawie defektu G
    nieistniejąca pozycja jest odrzucana (patrz test niżej), a jedynym uczciwym
    źródłem braku jest pole bez wskazanego aparatu.
    """
    result = _run(_der_sn_payload(apparatus_ref=None))
    assert not result.get("error"), result.get("error")
    assert "converter.der_sn.kaskada_prad_pole_brak" in _warning_codes(result)


def test_req5b_aparat_spoza_katalogu_jest_odrzucany() -> None:
    """Referencja aparatu, której w katalogu NIE MA, kończy operację (defekt G).

    Wcześniej gałąź aparatu pola źródłowego SN dostawała `source_mode: KATALOG`
    i `catalog_ref` martwej pozycji, a jedyna próba odczytu katalogu (prąd
    znamionowy) cicho zwracała `None` — projektant widział wyłącznie ostrzeżenie
    o brakującym ogniwie kaskady, nigdy przyczyny.
    """
    result = _run(_der_sn_payload(apparatus_ref="ap-sn-cb-630-nieistnieje"))
    assert result.get("error_code") == "catalog.item_not_found", result.get("error")
    assert result.get("snapshot") is None


# ---------------------------------------------------------------------------
# Wymaganie 9: jawny „sposób przyłączenia" — mapowanie i spójność.
# ---------------------------------------------------------------------------


def test_req9_der_z_tr_blokowym_consistent_accepted() -> None:
    result = _run(_der_sn_payload(connection_method="der_z_tr_blokowym"))
    assert not result.get("error"), result.get("error")


def test_req9_der_przez_rozdzielnie_producenta_consistent_accepted() -> None:
    result = _run(
        _der_sn_payload(
            connection_method="der_przez_rozdzielnie_producenta",
            has_manufacturer_lv_switchgear=True,
        )
    )
    assert not result.get("error"), result.get("error")


def test_req9_der_przez_rozdzielnie_bez_rozdzielni_rejected() -> None:
    """Sprzeczność: rozdzielnia producenta zadeklarowana bez rozdzielni nN."""
    result = _run(
        _der_sn_payload(
            connection_method="der_przez_rozdzielnie_producenta",
            has_manufacturer_lv_switchgear=False,
        )
    )
    assert result["error_code"] == "converter.der_sn.sposob_przylaczenia_niespojny"


def test_req9_der_za_tr_stacji_on_sn_topology_rejected() -> None:
    """Sprzeczność: „za TR stacji" (nN) zadeklarowane na torze SN."""
    result = _run(_der_sn_payload(connection_method="der_za_tr_stacji"))
    assert result["error_code"] == "converter.der_sn.sposob_przylaczenia_niespojny"


def test_req9_der_bezposrednio_sn_converter_rejected() -> None:
    """„Bezpośrednio na SN" zarezerwowane dla generatora synchronicznego — falownik odrzucony."""
    result = _run(
        _der_sn_payload(connection_method="der_bezposrednio_sn", has_block_transformer=False)
    )
    assert result["error_code"] == "converter.der_sn.bezposrednio_tylko_generator_synchroniczny"


def test_req9_unknown_connection_method_rejected() -> None:
    result = _run(_der_sn_payload(connection_method="der_nieznany_sposob"))
    assert result["error_code"] == "converter.der_sn.sposob_przylaczenia_nieznany"


# ---------------------------------------------------------------------------
# Determinizm walidacji i materializacji.
# ---------------------------------------------------------------------------


def test_validation_result_is_deterministic() -> None:
    r1 = _run(_der_sn_payload())
    r2 = _run(_der_sn_payload())
    assert not r1.get("error") and not r2.get("error")
    assert r1["readiness"]["warnings"] == r2["readiness"]["warnings"]
    assert r1["changes"]["created_element_ids"] == r2["changes"]["created_element_ids"]


def test_error_case_is_deterministic() -> None:
    r1 = _run(_der_sn_payload(block_secondary_kv=0.69))
    r2 = _run(_der_sn_payload(block_secondary_kv=0.69))
    assert r1["error_code"] == r2["error_code"] == "converter.der_sn.napiecie_falownika_niezgodne"
    assert r1["error"] == r2["error"]


@pytest.mark.parametrize(
    ("inverter_kv", "secondary_kv", "expect_error"),
    [
        (0.4, 0.69, True),
        (0.8, 0.4, True),
        (0.4, 0.4, False),
        (0.69, 0.69, False),
    ],
)
def test_req2_canon_matrix(inverter_kv: float, secondary_kv: float, expect_error: bool) -> None:
    result = _run(
        _der_sn_payload(
            inverter_output_kv=inverter_kv,
            converter_un_kv=inverter_kv,
            block_secondary_kv=secondary_kv,
        )
    )
    if expect_error:
        assert result["error_code"] == "converter.der_sn.napiecie_falownika_niezgodne"
    else:
        assert not result.get("error"), result.get("error")


# ---------------------------------------------------------------------------
# D3 wymaganie 7: spójność układu połączeń TR blokowego z typem katalogowym.
# ---------------------------------------------------------------------------


def test_validate_block_transformer_vector_group_unit() -> None:
    from enm.der_sn_validation import validate_block_transformer_vector_group

    # Brak żądania → użyj grupy katalogu (bez błędu).
    assert (
        validate_block_transformer_vector_group(
            requested_vector_group=None, catalog_vector_group="Dyn11"
        )
        is None
    )
    # Zgodna (różnica tylko wielkości liter/spacji) → bez błędu.
    assert (
        validate_block_transformer_vector_group(
            requested_vector_group=" dyn11 ", catalog_vector_group="Dyn11"
        )
        is None
    )
    # Niezgodna → błąd ze stabilnym kodem.
    err = validate_block_transformer_vector_group(
        requested_vector_group="Dyn5", catalog_vector_group="Dyn11"
    )
    assert err is not None
    assert err.code == "converter.der_sn.grupa_polaczen_niezgodna_z_katalogiem"

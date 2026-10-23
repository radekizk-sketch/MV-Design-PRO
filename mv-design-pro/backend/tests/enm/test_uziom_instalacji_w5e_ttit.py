"""Karta W5-E-TTIT: `Load.earth_electrode_r_ohm` (R_A), dwaj pisarze, jeden walidator, odcisk.

Iloczyn cech (KLASA NIE INSTANCJA): {add_nn_load, update_element_parameters} × {brak R_A,
R_A poprawne, R_A niefizyczne (0, ujemne, NaN, tekst, bool)} — jeden walidator
`enm/uziom_instalacji.py`. Kontrakt odcisku: odbiór bez R_A ma ten sam hash co migawka sprzed
karty (klucz nieobecny), a podane R_A zmienia odcisk wejścia i migawki, nie semantyczny.
Model odrzuca R_A ≤ 0 także przy walidacji dokumentu (`Field(gt=0)`).
"""

from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from enm.hash import (
    _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE,
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    hash_migawki_enm,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Load
from enm.uziom_instalacji import KOD_BLEDU_R_A, waliduj_r_a
from pydantic import ValidationError

from tests.enm.test_load_phases_w5d import _payload_nn, _stacja_z_odplywem_nn


@pytest.mark.parametrize("wartosc", [None, 25.0, 0.5, 1, "12.5"])
def test_walidator_przyjmuje_dodatnie_liczby_i_brak(wartosc: object) -> None:
    r_a, blad = waliduj_r_a(wartosc)
    assert blad is None
    assert r_a == (None if wartosc is None else float(wartosc))


@pytest.mark.parametrize("wartosc", [0, -3.0, float("nan"), float("inf"), "dużo", True, [1]])
def test_walidator_odrzuca_niefizyczne(wartosc: object) -> None:
    r_a, blad = waliduj_r_a(wartosc)
    assert r_a is None and blad is not None and "R_A" in blad


def test_model_odrzuca_r_a_nieprzekraczajace_zera() -> None:
    assert (
        Load(ref_id="l", name="L", bus_ref="b", p_mw=0.01, q_mvar=0.005).earth_electrode_r_ohm
        is None
    )
    assert (
        Load(
            ref_id="l", name="L", bus_ref="b", p_mw=0.01, q_mvar=0.005, earth_electrode_r_ohm=25.0
        ).earth_electrode_r_ohm
        == 25.0
    )
    with pytest.raises(ValidationError):
        Load(ref_id="l", name="L", bus_ref="b", p_mw=0.01, q_mvar=0.005, earth_electrode_r_ohm=0.0)


def _enm(**pola: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="w5e-r-a"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=0.4)],
        loads=[Load(ref_id="l1", name="L1", bus_ref="b1", p_mw=0.01, q_mvar=0.005, **pola)],
    )


def test_rejestr_pol_addytywnych_niesie_r_a() -> None:
    assert "earth_electrode_r_ohm" in _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE["loads"]


def test_odbior_bez_r_a_ma_odcisk_migawki_sprzed_karty() -> None:
    enm = _enm()
    dane = enm.model_dump(mode="json")
    sprzed = {
        **dane,
        "loads": [{k: v for k, v in dane["loads"][0].items() if k != "earth_electrode_r_ohm"}],
    }
    assert hash_migawki_enm(dane) == hash_migawki_enm(sprzed)


def test_podane_r_a_zmienia_odcisk_wejscia_nie_semantyczny() -> None:
    bez, z_r_a = _enm(), _enm(earth_electrode_r_ohm=25.0)
    assert compute_input_hash(bez) != compute_input_hash(z_r_a)
    assert compute_enm_hash(bez) != compute_enm_hash(z_r_a)
    assert compute_semantic_hash(bez) == compute_semantic_hash(z_r_a)


def test_add_nn_load_bez_r_a_nie_dopisuje_klucza() -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    wynik = execute_domain_operation(
        enm_dict=snapshot, op_name="add_nn_load", payload=_payload_nn(feeder_ref, nn_bus_ref)
    )
    assert not wynik.get("error"), wynik.get("error")
    odbior = next(ld for ld in wynik["snapshot"]["loads"] if ld["ref_id"].startswith("nn"))
    assert "earth_electrode_r_ohm" not in odbior


def test_add_nn_load_z_r_a_zapisuje_je_w_modelu() -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_load",
        payload=_payload_nn(feeder_ref, nn_bus_ref, earth_electrode_r_ohm=25.0),
    )
    assert not wynik.get("error"), wynik.get("error")
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    assert [ld.earth_electrode_r_ohm for ld in model.loads if ld.ref_id.startswith("nn")] == [25.0]


@pytest.mark.parametrize("wartosc", [0, -1.0, "brak"])
def test_add_nn_load_z_r_a_niefizycznym_odmawia_nazwanym_kodem(wartosc: object) -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_load",
        payload=_payload_nn(feeder_ref, nn_bus_ref, earth_electrode_r_ohm=wartosc),
    )
    assert wynik["error_code"] == KOD_BLEDU_R_A and wynik["snapshot"] is None


def test_update_element_parameters_ustawia_zdejmuje_i_odmawia() -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    dodany = execute_domain_operation(
        enm_dict=snapshot, op_name="add_nn_load", payload=_payload_nn(feeder_ref, nn_bus_ref)
    )
    load_ref = next(
        ld["ref_id"] for ld in dodany["snapshot"]["loads"] if ld["ref_id"].startswith("nn")
    )

    ustaw = execute_domain_operation(
        enm_dict=dodany["snapshot"],
        op_name="update_element_parameters",
        payload={"element_ref": load_ref, "parameters": {"earth_electrode_r_ohm": 30.0}},
    )
    assert not ustaw.get("error"), ustaw.get("error")
    model = EnergyNetworkModel.model_validate(ustaw["snapshot"])
    assert next(ld for ld in model.loads if ld.ref_id == load_ref).earth_electrode_r_ohm == 30.0

    zdejmij = execute_domain_operation(
        enm_dict=ustaw["snapshot"],
        op_name="update_element_parameters",
        payload={"element_ref": load_ref, "parameters": {"earth_electrode_r_ohm": None}},
    )
    assert not zdejmij.get("error"), zdejmij.get("error")
    model = EnergyNetworkModel.model_validate(zdejmij["snapshot"])
    assert next(ld for ld in model.loads if ld.ref_id == load_ref).earth_electrode_r_ohm is None

    odmowa = execute_domain_operation(
        enm_dict=ustaw["snapshot"],
        op_name="update_element_parameters",
        payload={"element_ref": load_ref, "parameters": {"earth_electrode_r_ohm": -5}},
    )
    assert odmowa["error_code"] == KOD_BLEDU_R_A and odmowa["snapshot"] is None

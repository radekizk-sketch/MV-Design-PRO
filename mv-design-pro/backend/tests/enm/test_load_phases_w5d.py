"""Karta W5-D (decyzja F-1): `PhaseSet`, `Load.phases` i trzy pisarze odbioru.

Iloczyn cech (reguła KLASA NIE INSTANCJA): {add_nn_load, add_load_sn,
update_element_parameters} × {brak faz, faza poprawna, faza spoza słownika} — trzy
pisarze `Load.phases`, JEDEN walidator (`enm/fazy_odbioru.py`). Plus kontrakt
odcisku: odbiór bez faz ma ten sam hash co migawka sprzed karty (klucz `phases`
nieobecny), a wskazana faza zmienia odcisk wejścia i migawki, nie semantyczny.
"""

from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from enm.fazy_odbioru import KOD_BLEDU_FAZ, waliduj_fazy_odbioru
from enm.hash import (
    _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE,
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    hash_migawki_enm,
)
from enm.models import (
    FAZY_ODBIORU_JEDNOFAZOWEGO,
    FAZY_ODBIORU_MIEDZYFAZOWEGO,
    FAZY_PRZYLACZENIA,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Load,
)
from pydantic import ValidationError

from tests.enm.test_domain_operations import _build_gpz_plus_segments, _get_first_segment_ref

# ---------------------------------------------------------------------------
# Słownik faz — jedno źródło
# ---------------------------------------------------------------------------


def test_slownik_faz_jest_jeden_i_zamkniety() -> None:
    assert FAZY_PRZYLACZENIA == ("ABC", "A", "B", "C", "AB", "BC", "CA")
    assert FAZY_ODBIORU_JEDNOFAZOWEGO | FAZY_ODBIORU_MIEDZYFAZOWEGO | {"ABC"} == set(
        FAZY_PRZYLACZENIA
    )
    for faza in FAZY_PRZYLACZENIA:
        assert Load(ref_id="l", name="L", bus_ref="b", p_mw=1.0, q_mvar=0.1, phases=faza).phases


def test_load_bez_faz_ma_none_a_wartosc_spoza_slownika_jest_odrzucana() -> None:
    assert Load(ref_id="l", name="L", bus_ref="b", p_mw=1.0, q_mvar=0.1).phases is None
    with pytest.raises(ValidationError):
        Load(ref_id="l", name="L", bus_ref="b", p_mw=1.0, q_mvar=0.1, phases="L1")


@pytest.mark.parametrize("wartosc", [None, "A", "ABC", "CA"])
def test_walidator_przyjmuje_slownik(wartosc: str | None) -> None:
    assert waliduj_fazy_odbioru(wartosc) == (wartosc, None)


@pytest.mark.parametrize("wartosc", ["L1", "", "abc", 1, ["A"]])
def test_walidator_odrzuca_spoza_slownika(wartosc: object) -> None:
    fazy, blad = waliduj_fazy_odbioru(wartosc)
    assert fazy is None and blad is not None and "Dozwolone" in blad


# ---------------------------------------------------------------------------
# Odcisk: `None` poza hashem, wartość w hashu
# ---------------------------------------------------------------------------


def _enm(**pola: str) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="w5d-fazy"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=0.4)],
        loads=[Load(ref_id="l1", name="L1", bus_ref="b1", p_mw=0.01, q_mvar=0.005, **pola)],
    )


def test_rejestr_pol_addytywnych_niesie_fazy_odbioru() -> None:
    assert _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE["loads"] == ("phases",)


def test_odbior_bez_faz_ma_odcisk_migawki_sprzed_karty() -> None:
    enm = _enm()
    migawka = enm.model_dump(mode="json")
    assert migawka["loads"][0]["phases"] is None
    sprzed_karty = enm.model_dump(mode="json")
    del sprzed_karty["loads"][0]["phases"]
    assert hash_migawki_enm(migawka) == hash_migawki_enm(sprzed_karty)
    assert compute_enm_hash(enm) == hash_migawki_enm(sprzed_karty)


def test_wskazana_faza_zmienia_odcisk_wejscia_nie_semantyczny() -> None:
    bez, z_faza = _enm(), _enm(phases="B")
    assert compute_input_hash(bez) != compute_input_hash(z_faza)
    assert compute_enm_hash(bez) != compute_enm_hash(z_faza)
    assert hash_migawki_enm(bez.model_dump(mode="json")) != hash_migawki_enm(
        z_faza.model_dump(mode="json")
    )
    assert compute_semantic_hash(bez) == compute_semantic_hash(z_faza)


# ---------------------------------------------------------------------------
# Trzy pisarze × {brak, poprawna, błędna}
# ---------------------------------------------------------------------------


def _stacja_z_odplywem_nn() -> tuple[dict, str, str]:
    _, snapshot = _build_gpz_plus_segments(1)
    inserted = execute_domain_operation(
        enm_dict=snapshot,
        op_name="insert_station_on_segment_sn",
        payload={
            "segment_ref": _get_first_segment_ref(snapshot),
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    assert not inserted.get("error"), inserted.get("error")
    station = next(
        sub
        for sub in inserted["snapshot"]["substations"]
        if str(sub.get("ref_id", "")).startswith("stn/")
    )
    bus_by_ref = {bus["ref_id"]: bus for bus in inserted["snapshot"]["buses"]}
    nn_bus_ref = next(
        ref for ref in station["bus_refs"] if bus_by_ref.get(ref, {}).get("voltage_kv") == 0.4
    )
    feeder = execute_domain_operation(
        enm_dict=inserted["snapshot"],
        op_name="add_nn_outgoing_field",
        payload={"bus_nn_ref": nn_bus_ref, "station_ref": station["ref_id"]},
    )
    assert not feeder.get("error"), feeder.get("error")
    return feeder["snapshot"], nn_bus_ref, feeder["changes"]["created_element_ids"][0]


def _payload_nn(feeder_ref: str, nn_bus_ref: str, **extra: object) -> dict:
    return {
        "bus_nn_ref": nn_bus_ref,
        "feeder_ref": feeder_ref,
        "active_power_kw": 5.0,
        "cos_phi": 0.95,
        "load_kind": "SKUPIONY",
        "connection_type": "JEDNOFAZOWY",
        "source_mode": "EKSPERCKI_RECZNY",
        **extra,
    }


def test_add_nn_load_bez_faz_nie_dopisuje_klucza() -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    wynik = execute_domain_operation(
        enm_dict=snapshot, op_name="add_nn_load", payload=_payload_nn(feeder_ref, nn_bus_ref)
    )
    assert not wynik.get("error"), wynik.get("error")
    odbior = next(ld for ld in wynik["snapshot"]["loads"] if ld["ref_id"].startswith("nn"))
    assert "phases" not in odbior
    assert EnergyNetworkModel.model_validate(wynik["snapshot"]).loads[-1].phases is None


def test_add_nn_load_z_faza_zapisuje_ja_w_modelu() -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_load",
        payload=_payload_nn(feeder_ref, nn_bus_ref, phases="A"),
    )
    assert not wynik.get("error"), wynik.get("error")
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    assert [ld.phases for ld in model.loads if ld.ref_id.startswith("nn")] == ["A"]


def test_add_nn_load_z_faza_spoza_slownika_odmawia_nazwanym_kodem() -> None:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_load",
        payload=_payload_nn(feeder_ref, nn_bus_ref, phases="L1"),
    )
    assert wynik["error_code"] == KOD_BLEDU_FAZ and wynik["snapshot"] is None


def _enm_z_szyna() -> dict:
    _, snapshot = _build_gpz_plus_segments(1)
    return snapshot


def _szyna_sn(snapshot: dict) -> str:
    return next(bus["ref_id"] for bus in snapshot["buses"] if bus["voltage_kv"] == 15.0)


@pytest.mark.parametrize(
    ("fazy", "oczekiwane"), [(None, None), ("C", "C"), ("AB", "AB"), ("ABC", "ABC")]
)
def test_add_load_sn_zapisuje_fazy_wedlug_slownika(
    fazy: str | None, oczekiwane: str | None
) -> None:
    snapshot = _enm_z_szyna()
    payload: dict = {"bus_ref": _szyna_sn(snapshot), "p_mw": 0.5, "q_mvar": 0.1}
    if fazy is not None:
        payload["phases"] = fazy
    wynik = execute_domain_operation(enm_dict=snapshot, op_name="add_load_sn", payload=payload)
    assert not wynik.get("error"), wynik.get("error")
    odbior = wynik["snapshot"]["loads"][-1]
    assert odbior.get("phases") == oczekiwane
    if oczekiwane is None:
        assert "phases" not in odbior


def test_add_load_sn_z_faza_spoza_slownika_odmawia() -> None:
    snapshot = _enm_z_szyna()
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_load_sn",
        payload={"bus_ref": _szyna_sn(snapshot), "p_mw": 0.5, "q_mvar": 0.1, "phases": "AC"},
    )
    assert wynik["error_code"] == KOD_BLEDU_FAZ


def test_update_element_parameters_zmienia_i_zdejmuje_fazy_oraz_odmawia_spoza_slownika() -> None:
    snapshot = _enm_z_szyna()
    dodany = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_load_sn",
        payload={"bus_ref": _szyna_sn(snapshot), "p_mw": 0.5, "q_mvar": 0.1, "phases": "A"},
    )
    load_ref = dodany["snapshot"]["loads"][-1]["ref_id"]

    zmiana = execute_domain_operation(
        enm_dict=dodany["snapshot"],
        op_name="update_element_parameters",
        payload={"element_ref": load_ref, "parameters": {"phases": "BC"}},
    )
    assert not zmiana.get("error"), zmiana.get("error")
    assert EnergyNetworkModel.model_validate(zmiana["snapshot"]).loads[-1].phases == "BC"

    zdjecie = execute_domain_operation(
        enm_dict=zmiana["snapshot"],
        op_name="update_element_parameters",
        payload={"element_ref": load_ref, "parameters": {"phases": None}},
    )
    assert not zdjecie.get("error"), zdjecie.get("error")
    assert EnergyNetworkModel.model_validate(zdjecie["snapshot"]).loads[-1].phases is None

    odmowa = execute_domain_operation(
        enm_dict=zmiana["snapshot"],
        op_name="update_element_parameters",
        payload={"element_ref": load_ref, "parameters": {"phases": "X"}},
    )
    assert odmowa["error_code"] == KOD_BLEDU_FAZ

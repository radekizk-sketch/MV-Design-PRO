"""W5-A: migracja zastanego zapisu uziemienia do jednej reprezentacji.

Iloczyn cech (KLASA NIE INSTANCJA): {szyna z wartością × źródło na szynie /
źródło w stacji / brak źródła / źródło już opisane / konflikt} × {meta stacji:
układ nN z transformatorem / bez transformatora / spoza słownika / klucze
grounding+zero_sequence} × {droga wczytania: funkcja / model_validate}.
"""

from __future__ import annotations

import copy

from enm.models import UKLADY_SIECI_NN, EnergyNetworkModel
from enm.uziemienie import (
    blad_konfiguracji_uziemienia,
    migruj_uziemienie_slownika,
    raport_migracji_uziemienia,
    uziemienie_grounded,
)


def _dane() -> dict:
    return {
        "header": {"name": "migracja"},
        "buses": [
            {
                "ref_id": "b_sn",
                "name": "SN",
                "voltage_kv": 15.0,
                "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
            },
            {"ref_id": "b_hv", "name": "WN", "voltage_kv": 110.0, "grounding": None},
            {"ref_id": "b_nn", "name": "nN", "voltage_kv": 0.4},
        ],
        "sources": [
            {
                "ref_id": "src",
                "name": "GPZ",
                "bus_ref": "b_hv",
                "model": "short_circuit_power",
                "substation_ref": "gpz",
            }
        ],
        "transformers": [
            {
                "ref_id": "tr",
                "name": "TR",
                "hv_bus_ref": "b_sn",
                "lv_bus_ref": "b_nn",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 4.5,
                "pk_kw": 6.5,
            }
        ],
        "substations": [
            {
                "ref_id": "gpz",
                "name": "GPZ",
                "station_type": "gpz",
                "bus_refs": ["b_sn", "b_hv"],
                "meta": {
                    "grounding": {"type": "resistor_grounded"},
                    "zero_sequence": {"enabled": True},
                    "inne": 1,
                },
            },
            {
                "ref_id": "st",
                "name": "Stacja",
                "station_type": "mv_lv",
                "bus_refs": ["b_nn"],
                "transformer_refs": ["tr"],
                "meta": {"nn_earthing_system": "TN-S"},
            },
        ],
    }


def test_szyna_bez_zrodla_na_szynie_trafia_do_zrodla_tej_samej_stacji_i_meta_jest_czyszczone():
    dane = _dane()
    kopia = copy.deepcopy(dane)
    wynik, raport = migruj_uziemienie_slownika(dane, uklady_nn=UKLADY_SIECI_NN)
    assert dane == kopia, "migracja nie mutuje słownika wołającego"
    assert wynik["sources"][0]["neutral_grounding"] == {"type": "resistor_grounded", "r_ohm": 12.0}
    assert all("grounding" not in b for b in wynik["buses"])
    assert wynik["substations"][0]["meta"] == {"inne": 1}
    assert wynik["transformers"][0]["lv_earthing_system"] == "TN-S"
    assert "nn_earthing_system" not in wynik["substations"][1]["meta"]
    assert raport.zmieniono and not raport.utracone
    assert len(raport.przeniesione) == 2
    assert set(raport.usuniete_klucze_meta) == {
        "stacja gpz: meta.grounding",
        "stacja gpz: meta.zero_sequence",
    }
    assert "UTRACONE" not in raport.opis_pl()


def test_migracja_jest_idempotentna_i_bez_zmian_zwraca_ten_sam_obiekt():
    raz, _ = migruj_uziemienie_slownika(_dane(), uklady_nn=UKLADY_SIECI_NN)
    dwa, raport = migruj_uziemienie_slownika(raz, uklady_nn=UKLADY_SIECI_NN)
    assert dwa is raz
    assert not raport.zmieniono


def test_szyna_bez_zadnego_zrodla_to_utrata_nazwana_nie_cicha():
    dane = _dane()
    dane["sources"] = []
    wynik, raport = migruj_uziemienie_slownika(dane, uklady_nn=UKLADY_SIECI_NN)
    assert all("grounding" not in b for b in wynik["buses"])
    assert any("b_sn" in u and "bez źródła" in u for u in raport.utracone)
    assert "UTRACONE" in raport.opis_pl()


def test_zrodlo_juz_opisane_sprzecznie_wygrywa_a_konflikt_jest_nazwany():
    dane = _dane()
    dane["sources"][0]["neutral_grounding"] = {"type": "isolated"}
    wynik, raport = migruj_uziemienie_slownika(dane, uklady_nn=UKLADY_SIECI_NN)
    assert wynik["sources"][0]["neutral_grounding"] == {"type": "isolated"}
    assert any("sprzeczne" in u for u in raport.utracone)


def test_uklad_nn_bez_transformatora_i_spoza_slownika_sa_utratami_nazwanymi():
    dane = _dane()
    dane["substations"][1]["transformer_refs"] = []
    _, raport = migruj_uziemienie_slownika(dane, uklady_nn=UKLADY_SIECI_NN)
    assert any("bez transformatora" in u for u in raport.utracone)
    dane = _dane()
    dane["substations"][1]["meta"]["nn_earthing_system"] = "TN-X"
    wynik, raport = migruj_uziemienie_slownika(dane, uklady_nn=UKLADY_SIECI_NN)
    assert any("spoza słownika" in u for u in raport.utracone)
    assert wynik["transformers"][0].get("lv_earthing_system") is None


def test_model_validate_migruje_ta_sama_funkcja_i_raport_z_nosnika_jest_zgodny():
    dane = _dane()
    model = EnergyNetworkModel.model_validate(dane)
    assert model.sources[0].neutral_grounding is not None
    assert model.sources[0].neutral_grounding.type == "resistor_grounded"
    assert model.transformers[0].lv_earthing_system == "TN-S"
    assert "grounding" not in model.substations[0].meta
    assert not hasattr(model.buses[0], "grounding")
    raport = raport_migracji_uziemienia(dane, uklady_nn=UKLADY_SIECI_NN)
    assert raport.zmieniono
    # Zapis po migracji nie migruje już niczego (postać kanoniczna).
    assert not raport_migracji_uziemienia(
        model.model_dump(mode="json"), uklady_nn=UKLADY_SIECI_NN
    ).zmieniono


def test_jeden_predykat_spojnosci_konfiguracji():
    assert blad_konfiguracji_uziemienia("resistor_grounded", None, None)
    assert blad_konfiguracji_uziemienia("resistor_grounded", 0.0, None)
    assert blad_konfiguracji_uziemienia("petersen_coil", 5.0, None)
    assert blad_konfiguracji_uziemienia("resistor_grounded", 12.0, None) is None
    assert blad_konfiguracji_uziemienia("petersen_coil", None, 150.0) is None
    assert blad_konfiguracji_uziemienia("directly_grounded", None, None) is None
    assert blad_konfiguracji_uziemienia("isolated", None, None) is None
    assert {
        t
        for t in ("isolated", "petersen_coil", "directly_grounded", "resistor_grounded")
        if uziemienie_grounded(t)
    } == {
        "petersen_coil",
        "directly_grounded",
        "resistor_grounded",
    }

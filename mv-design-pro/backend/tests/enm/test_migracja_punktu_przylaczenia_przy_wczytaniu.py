"""Automigracja punktu przyłączenia MUSI wykonać się przy wczytaniu modelu (V12K-268).

DLACZEGO OSOBNY TEST NA POZIOMIE MAGAZYNU. Testy samej funkcji migrującej
(`tests/enm/migrations/test_punkt_przylaczenia_der.py`) sprawdzają, że przenosi
klucz poprawnie — i przechodzą także wtedy, gdy nikt jej nie woła. Zmierzone:
odpięcie migracji od `get_enm` nie zapaliło ANI JEDNEGO z 1089 testów `tests/domain`
+ `tests/enm`. Migracja, której nie ma kto uruchomić, jest martwym kodem, a projekt
zapisany starym kluczem po cichu traci punkt przyłączenia. Ten test zamyka tę lukę:
jedzie realną drogą — zapis na dysk, wczytanie przez `get_enm`.
"""

from __future__ import annotations

import pytest
from enm.migrations.punkt_przylaczenia_der import KLUCZ_KANONICZNY
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader, Generator
from enm.store import get_enm, reset_enm_store, set_enm


@pytest.fixture(autouse=True)
def _magazyn_w_katalogu_tymczasowym(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    yield
    reset_enm_store()


def _model_ze_starym_kluczem() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Projekt sprzed zmiany nazwy", defaults=ENMDefaults()),
        generators=[
            Generator(
                ref_id="g1",
                name="Farma PV",
                bus_ref="bus-1",
                p_mw=1.0,
                materialized_params={"pcc_ref": "szyna-sn-7"},
            )
        ],
    )


def test_wczytanie_projektu_ze_starym_kluczem_przenosi_go_pod_nazwe_kanoniczna():
    case_id = "przypadek-stary-zapis"
    set_enm(case_id, _model_ze_starym_kluczem())
    reset_enm_store(remove_persisted=False)  # wymuś odczyt z dysku, jak po restarcie

    wczytany = get_enm(case_id)

    dane = wczytany.generators[0].materialized_params
    assert dane is not None
    assert dane[KLUCZ_KANONICZNY] == "szyna-sn-7", (
        "punkt przylaczenia zapisany stara nazwa musi byc widoczny po wczytaniu"
    )
    assert "pcc_ref" not in dane


def test_migracja_przy_wczytaniu_jest_utrwalana_a_nie_powtarzana():
    """Drugie wczytanie nie podbija rewizji — migracja wykonuje się RAZ."""
    case_id = "przypadek-utrwalenie"
    set_enm(case_id, _model_ze_starym_kluczem())
    reset_enm_store(remove_persisted=False)

    po_pierwszym = get_enm(case_id)
    rewizja_po_migracji = po_pierwszym.header.revision

    reset_enm_store(remove_persisted=False)
    po_drugim = get_enm(case_id)

    assert po_drugim.header.revision == rewizja_po_migracji
    assert po_drugim.generators[0].materialized_params[KLUCZ_KANONICZNY] == "szyna-sn-7"


def test_projekt_bez_starego_klucza_nie_dostaje_nowej_rewizji():
    """Model już kanoniczny nie może zostać „zmigrowany" i unieważnić wyników."""
    case_id = "przypadek-juz-kanoniczny"
    model = _model_ze_starym_kluczem()
    model.generators[0].materialized_params = {KLUCZ_KANONICZNY: "szyna-sn-7"}
    zapisany = set_enm(case_id, model)
    rewizja_zapisu = zapisany.header.revision
    reset_enm_store(remove_persisted=False)

    wczytany = get_enm(case_id)

    assert wczytany.header.revision == rewizja_zapisu

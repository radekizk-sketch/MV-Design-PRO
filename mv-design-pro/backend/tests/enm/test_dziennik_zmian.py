"""Dziennik zmian modelu — „ktora zmiana uniewaznila wynik" (V12K-264).

Testy pilnuja trzech rzeczy, ktore razem tworzyly dlug:
1. Rewizja rosnie i JEST zapisana z przyczyna (wczesniej przyczyna gineła).
2. Opis pochodzi z KANONU operacji, nie z identyfikatora.
3. Zapis bez znanej operacji jest NAZWANY brakiem, a nie ukryty ani zgadniety.

Determinizm: dopisanie dziennika NIE MOZE zmienic hasha snapshotu — dziennik jest
zapisem rownoleglym, poza modelem. Osobny test tego pilnuje, bo naruszenie byłoby
zlamaniem kanonicznej reguly „ten sam wejscie = ten sam wynik".
"""

from __future__ import annotations

import pytest
from enm.dziennik_zmian import (
    dopisz,
    opis_operacji,
    wpisy_od,
    wszystkie_wpisy,
    wyczysc_dziennik,
)
from enm.hash import compute_enm_hash
from enm.store import ZrodloZmiany, get_enm, reset_enm_store, set_enm


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield
    reset_enm_store()
    wyczysc_dziennik()


class TestPrzyczynaZapisana:
    def test_zapis_z_operacja_trafia_do_dziennika_z_opisem_z_kanonu(self):
        enm = get_enm("c1")
        enm.header.name = "Sieć A"
        set_enm(
            "c1",
            enm,
            zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay", utworzone=("gpz/pole_1",)),
        )

        wpisy = wszystkie_wpisy("c1")
        assert len(wpisy) == 1
        wpis = wpisy[0]
        assert wpis.operacja == "add_sn_bay"
        # Opis MUSI pochodzic z kanonu — nie z nazwy operacji.
        assert wpis.opis_pl == opis_operacji("add_sn_bay")
        assert "pola SN" in wpis.opis_pl
        assert wpis.utworzone == ("gpz/pole_1",)
        assert wpis.liczba_elementow() == 1

    def test_zapis_bez_operacji_jest_nazwany_brakiem_nie_zgadniety(self):
        enm = get_enm("c1")
        enm.header.name = "Sieć A"
        set_enm("c1", enm)

        wpis = wszystkie_wpisy("c1")[0]
        # Kluczowe: brak wiedzy o przyczynie NIE staje sie przyczyna zmyslona.
        assert wpis.operacja is None
        assert "bez zarejestrowanej operacji" in wpis.opis_pl

    def test_operacja_spoza_kanonu_jest_nazwana_wprost(self):
        assert "nie wystepuje w kanonie" in opis_operacji("operacja_ktorej_nie_ma")


class TestZakresOdRewizji:
    def test_zwracane_sa_TYLKO_zmiany_po_rewizji_wyniku(self):
        enm = get_enm("c1")
        for i, op in enumerate(["add_sn_bay", "set_normal_open_point", "add_nn_load"]):
            enm = get_enm("c1")
            enm.header.description = f"zmiana {i}"
            set_enm("c1", enm, zrodlo_zmiany=ZrodloZmiany(operacja=op))

        # Wynik policzony na rewizji 3 → uniewazniaja go rewizje 4 i wyzsze.
        assert [w.rewizja for w in wpisy_od("c1", 3)] == [4]
        assert [w.operacja for w in wpisy_od("c1", 2)] == [
            "set_normal_open_point",
            "add_nn_load",
        ]
        # Wynik na rewizji biezacej: nic go nie uniewaznilo.
        assert wpisy_od("c1", 4) == []

    def test_zapis_bez_zmiany_modelu_nie_tworzy_wpisu(self):
        enm = get_enm("c1")
        enm.header.name = "Sieć A"
        set_enm("c1", enm, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        przed = len(wszystkie_wpisy("c1"))

        # Ten sam model ponownie — `set_enm` nie podnosi rewizji, wiec dziennik
        # nie moze urosnac. Inaczej „co sie zmienilo" pokazywaloby zmiany, ktorych
        # nie bylo.
        set_enm("c1", get_enm("c1"), zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        assert len(wszystkie_wpisy("c1")) == przed

    def test_dopisanie_tej_samej_rewizji_jest_idempotentne(self):
        dopisz("c1", rewizja=7, operacja="add_sn_bay")
        dopisz("c1", rewizja=7, operacja="add_nn_load")
        wpisy = wszystkie_wpisy("c1")
        assert len(wpisy) == 1
        # Pierwszy zapis wygrywa — powtorzone zadanie HTTP nie przepisuje historii.
        assert wpisy[0].operacja == "add_sn_bay"


class TestDeterminizm:
    def test_dziennik_NIE_zmienia_hasha_snapshotu(self):
        enm = get_enm("c1")
        enm.header.name = "Sieć A"
        zapisany_bez = set_enm("c1", enm)
        hash_bez = zapisany_bez.header.hash_sha256

        reset_enm_store()
        wyczysc_dziennik()

        enm2 = get_enm("c1")
        enm2.header.name = "Sieć A"
        zapisany_z = set_enm(
            "c1",
            enm2,
            zrodlo_zmiany=ZrodloZmiany(
                operacja="add_sn_bay",
                utworzone=("a", "b"),
                zmienione=("c",),
            ),
        )

        # Hash zalezy WYLACZNIE od modelu. Gdyby dziennik trafil do naglowka ENM,
        # ta asercja by padla — i slusznie, bo zmienilyby sie wszystkie zapisane
        # hasze w projekcie.
        assert zapisany_z.header.hash_sha256 == hash_bez
        assert compute_enm_hash(zapisany_z) == hash_bez

    def test_dziennik_przetrwa_restart_procesu(self):
        enm = get_enm("c1")
        enm.header.name = "Sieć A"
        set_enm("c1", enm, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))

        # Symulacja restartu: czyscimy pamiec podreczna BEZ kasowania plikow.
        reset_enm_store(remove_persisted=False)
        wyczysc_dziennik(usun_pliki=False)

        wpisy = wszystkie_wpisy("c1")
        assert len(wpisy) == 1
        assert wpisy[0].operacja == "add_sn_bay"

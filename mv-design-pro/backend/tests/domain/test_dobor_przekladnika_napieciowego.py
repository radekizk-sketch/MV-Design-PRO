"""Dobor przekladnika napieciowego — kryteria normowe (karta E21-4, audyt E-21 pkt P9).

Testy jada na REALNYCH wpisach katalogu (V12K-255), nie na wymyslonych slownikach:
gdyby katalog przestal niesc wspolczynnik napieciowy albo uzwojenie resztkowe, ta
regresja to pokaze — tak samo jak dla przekladnikow pradowych.

Sedno: brak danej jest TRZECIM STANEM (nie „spelnione"), a tor napiecia zerowego jest
sprawdzalny, bo katalog ma rodzine faza-ziemia z uzwojeniem resztkowym.
"""

from __future__ import annotations

import pytest

from domain.dobor_przekladnika import (
    WymaganiaToruNapieciowego,
    sprawdz_dobor_vt,
)
from network_model.catalog.mv_auxiliary_catalog import get_all_vt_types
from network_model.catalog.types import VTType


def typ(id_katalogowy: str) -> dict:
    for wpis in get_all_vt_types():
        if wpis["id"] == id_katalogowy:
            return VTType.from_dict(
                {"id": wpis["id"], "name": wpis["name"], **wpis["params"]}
            ).to_dict()
    raise AssertionError(f"brak wpisu katalogu: {id_katalogowy}")


#: VT 20 kV / 100 V kl. 3P — uzwojenie zabezpieczeniowe, uklad miedzyfazowy.
VT_20KV_3P = "vt_20kv_100v_3p_abb"
#: VT 20 kV / 100 V kl. 0.5 — uzwojenie pomiarowe.
VT_20KV_05 = "vt_20kv_100v_05_arteche"
#: Rodzina faza-ziemia z uzwojeniem resztkowym (11547 V / 57,7 V, kl. 3P + 0.5).
VT_20KV_FZ = "vt_20kv_fz_100_3_05_3p_siemens"


def tor(**nadpisania) -> WymaganiaToruNapieciowego:
    baza = {
        "napiecie_sieci_v": 20000.0,
        "tryb_uziemienia": "cewka_petersena",
        "zwarcie_doziemne_wylaczane_automatycznie": False,
        "napiecia_wejsc_przekaznika_v": (100.0, 110.0),
        "obciazenie_obwodu_va": 20.0,
        "zrodlo_napiecia_zerowego": "brak",
        "dla_zabezpieczen": True,
    }
    baza.update(nadpisania)
    return WymaganiaToruNapieciowego(**baza)


def kryterium(wynik, kod: str):
    return next(k for k in wynik.kryteria if k.kod == kod)


def kody(wynik) -> set[str]:
    return {k.kod for k in wynik.kryteria}


class TestKatalogNiesieDaneDoboru:
    def test_rodzina_faza_ziemia_istnieje_i_ma_uzwojenie_resztkowe(self) -> None:
        # Bez tej rodziny kryterium toru napiecia zerowego byloby na zawsze „brak
        # danych" — a wlasciciel odrzucil nazywanie sprawdzen niewykonalnymi.
        rodzina = [
            w
            for w in get_all_vt_types()
            if VTType.from_dict(
                {"id": w["id"], "name": w["name"], **w["params"]}
            ).has_residual_winding
        ]
        assert len(rodzina) == 4, [w["id"] for w in rodzina]

    @pytest.mark.parametrize("wpis", get_all_vt_types(), ids=lambda w: w["id"])
    def test_kazdy_wpis_ma_wspolczynnik_napieciowy_z_czasem_i_moc(self, wpis: dict) -> None:
        dane = typ(wpis["id"])
        assert dane["rated_voltage_factor"] is not None, wpis["id"]
        assert dane["voltage_factor_duration_s"] is not None, wpis["id"]
        assert dane["burden_va"] is not None, wpis["id"]

    def test_rodzaj_uzwojenia_jest_wyprowadzany_z_klasy(self) -> None:
        assert typ(VT_20KV_3P)["application"] == "protection"
        assert typ(VT_20KV_05)["application"] == "metering"


class TestDoborKompletny:
    def test_przekladnik_zabezpieczeniowy_w_sieci_kompensowanej_jest_POTWIERDZONY(self) -> None:
        wynik = sprawdz_dobor_vt(typ(VT_20KV_3P), tor())
        assert wynik.dobor_potwierdzony is True, [
            (k.kod, k.werdykt, k.komentarz_pl) for k in wynik.kryteria
        ]

    def test_kazde_kryterium_ma_JAWNY_RACHUNEK_i_podstawe(self) -> None:
        wynik = sprawdz_dobor_vt(
            typ(VT_20KV_FZ), tor(zrodlo_napiecia_zerowego="uzwojenie_resztkowe_vt")
        )
        for k in wynik.kryteria:
            assert k.podstawa_pl.strip(), f"{k.kod} bez podstawy"
            if k.werdykt in ("spelnione", "niespelnione"):
                assert k.wymagane, f"{k.kod} bez wartosci wymaganej"
                assert k.dostepne, f"{k.kod} bez wartosci dostepnej"


class TestWspolczynnikNapieciowy:
    """Wymaganie F_v zalezy NAJPIERW od ukladu pracy, potem od uziemienia (V12K-256).

    Zwarcie doziemne podnosi napiecie faz zdrowych WZGLEDEM ZIEMI — miedzyfazowe zostaje
    bez zmian. Dlatego przekladnik miedzyfazowy potrzebuje tylko wspolczynnika ciaglego,
    a wymagania 1,5 i 1,9 dotycza wylacznie uzwojenia faza-ziemia. Testy sprawdzaja OBIE
    galezie, bo pomylenie ich raz zaniza wymaganie, a raz je zawyza.
    """

    def test_przekladnik_MIEDZYFAZOWY_potrzebuje_tylko_wspolczynnika_ciaglego(self) -> None:
        k = kryterium(sprawdz_dobor_vt(typ(VT_20KV_3P), tor()), "vt.wspolczynnik_napieciowy")
        assert k.werdykt == "spelnione"
        assert "1.2" in (k.wymagane or "")

    def test_uzwojenie_FAZA_ZIEMIA_w_sieci_kompensowanej_wymaga_1_9_przez_8_h(self) -> None:
        k = kryterium(sprawdz_dobor_vt(typ(VT_20KV_FZ), tor()), "vt.wspolczynnik_napieciowy")
        assert k.werdykt == "spelnione"
        assert "1.9 przez 8 h" in (k.wymagane or "")

    def test_faza_ziemia_w_sieci_bezposrednio_uziemionej_wymaga_1_5_przez_30_s(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(
                typ(VT_20KV_FZ),
                tor(
                    tryb_uziemienia="bezposrednio_uziemiony",
                    zwarcie_doziemne_wylaczane_automatycznie=None,
                ),
            ),
            "vt.wspolczynnik_napieciowy",
        )
        # Dana o automatyce NIE jest tu potrzebna: w sieci uziemionej norma podaje 30 s.
        assert k.werdykt == "spelnione"
        assert "1.5 przez 30 s" in (k.wymagane or "")

    def test_siec_uziemiona_przez_rezystor_tez_wymaga_1_9(self) -> None:
        # Siec uziemiona przez rezystor NIE jest siecia skutecznie uziemiona — to byl
        # rozjazd z `audit2_catalogs`, ktory dopuszczal tam 1,5 (V12K-256).
        k = kryterium(
            sprawdz_dobor_vt(typ(VT_20KV_FZ), tor(tryb_uziemienia="rezystor")),
            "vt.wspolczynnik_napieciowy",
        )
        assert "1.9" in (k.wymagane or "")

    def test_nieznany_sposob_uziemienia_daje_BRAK_DANYCH_nie_zgodnosc(self) -> None:
        wynik = sprawdz_dobor_vt(typ(VT_20KV_FZ), tor(tryb_uziemienia="nieznany"))
        k = kryterium(wynik, "vt.wspolczynnik_napieciowy")
        assert k.werdykt == "brak_danych"
        assert "sposób uziemienia" in (k.komentarz_pl or "")
        assert wynik.dobor_potwierdzony is False

    def test_nierozpoznany_uklad_pracy_kieruje_do_kryterium_przekladni(self) -> None:
        # 15 kV VT w sieci 20 kV: ani miedzyfazowy, ani faza-ziemia — dopoki uklad nie
        # jest rozstrzygniety, nie wiadomo, ktora rodzina wymagan obowiazuje.
        k = kryterium(
            sprawdz_dobor_vt(typ("vt_15kv_100v_3p_abb"), tor()),
            "vt.wspolczynnik_napieciowy",
        )
        assert k.werdykt == "brak_danych"
        assert "układ pracy" in (k.komentarz_pl or "")

    def test_brak_danej_o_automatyce_nazywa_dokladnie_ta_dana(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(typ(VT_20KV_FZ), tor(zwarcie_doziemne_wylaczane_automatycznie=None)),
            "vt.wspolczynnik_napieciowy",
        )
        assert k.werdykt == "brak_danych"
        assert "wyłączane automatycznie" in (k.komentarz_pl or "")

    def test_zbyt_niski_wspolczynnik_jest_NIESPELNIONY(self) -> None:
        ubozszy = {**typ(VT_20KV_FZ), "rated_voltage_factor": 1.5}
        k = kryterium(sprawdz_dobor_vt(ubozszy, tor()), "vt.wspolczynnik_napieciowy")
        assert k.werdykt == "niespelnione"
        assert "nasyci" in (k.komentarz_pl or "")

    def test_wystarczajaca_krotnosc_na_zbyt_krotki_czas_jest_NIESPELNIONA(self) -> None:
        krotki = {**typ(VT_20KV_FZ), "voltage_factor_duration_s": 30.0}
        k = kryterium(sprawdz_dobor_vt(krotki, tor()), "vt.wspolczynnik_napieciowy")
        assert k.werdykt == "niespelnione"
        assert "czas" in (k.komentarz_pl or "")


class TestUkladPracy:
    def test_uklad_faza_ziemia_jest_ROZPOZNAWANY_z_przekladni(self) -> None:
        k = kryterium(sprawdz_dobor_vt(typ(VT_20KV_FZ), tor()), "vt.napiecie_pierwotne")
        assert k.werdykt == "spelnione"
        assert "faza–ziemia" in (k.komentarz_pl or "")

    def test_przekladnik_na_nizsze_napiecie_jest_NIESPELNIONY(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(typ("vt_10kv_100v_05_abb"), tor(dla_zabezpieczen=False)),
            "vt.napiecie_pierwotne",
        )
        assert k.werdykt == "niespelnione"
        assert "przepięciu" in (k.komentarz_pl or "")

    def test_duzy_zapas_przekladni_to_INFORMACJA_nie_blad(self) -> None:
        wynik = sprawdz_dobor_vt(typ(VT_20KV_3P), tor(napiecie_sieci_v=10000.0))
        k = kryterium(wynik, "vt.nadwymiarowanie")
        assert k.werdykt == "informacja"
        assert wynik.niespelnione == []


class TestTorNapieciaZerowego:
    def test_bez_zadeklarowanego_zrodla_kryterium_NIE_POWSTAJE(self) -> None:
        # Brak toru 3U0 nazywa dobor funkcji zabezpieczeniowych (V12K-252);
        # powtarzanie go tutaj byloby szumem na ekranie.
        assert "vt.tor_napiecia_zerowego" not in kody(sprawdz_dobor_vt(typ(VT_20KV_3P), tor()))

    def test_uzwojenie_resztkowe_spelnione_tylko_dla_rodziny_ktora_je_ma(self) -> None:
        zadanie = tor(zrodlo_napiecia_zerowego="uzwojenie_resztkowe_vt")
        assert (
            kryterium(
                sprawdz_dobor_vt(typ(VT_20KV_FZ), zadanie), "vt.tor_napiecia_zerowego"
            ).werdykt
            == "spelnione"
        )
        k = kryterium(sprawdz_dobor_vt(typ(VT_20KV_3P), zadanie), "vt.tor_napiecia_zerowego")
        assert k.werdykt == "niespelnione"
        assert "nie ma" in (k.komentarz_pl or "")

    def test_otwarty_trojkat_wymaga_ukladu_faza_ziemia(self) -> None:
        zadanie = tor(zrodlo_napiecia_zerowego="otwarty_trojkat_vt")
        assert (
            kryterium(
                sprawdz_dobor_vt(typ(VT_20KV_FZ), zadanie), "vt.tor_napiecia_zerowego"
            ).werdykt
            == "spelnione"
        )
        k = kryterium(sprawdz_dobor_vt(typ(VT_20KV_3P), zadanie), "vt.tor_napiecia_zerowego")
        assert k.werdykt == "niespelnione"
        assert "3U0" in (k.komentarz_pl or "")

    def test_pomiar_obliczany_tez_wymaga_napiec_fazowych(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(typ(VT_20KV_3P), tor(zrodlo_napiecia_zerowego="obliczone")),
            "vt.tor_napiecia_zerowego",
        )
        assert k.werdykt == "niespelnione"

    def test_brak_danej_konstrukcyjnej_kieruje_do_rodziny_z_katalogu(self) -> None:
        nieznany = {**typ(VT_20KV_3P), "has_residual_winding": None}
        k = kryterium(
            sprawdz_dobor_vt(nieznany, tor(zrodlo_napiecia_zerowego="uzwojenie_resztkowe_vt")),
            "vt.tor_napiecia_zerowego",
        )
        assert k.werdykt == "brak_danych"
        assert "rodzina faza–ziemia" in (k.komentarz_pl or "")


class TestPozostaleKryteria:
    def test_uzwojenie_pomiarowe_do_zabezpieczen_jest_NIESPELNIONE(self) -> None:
        k = kryterium(sprawdz_dobor_vt(typ(VT_20KV_05), tor()), "vt.rodzaj_uzwojenia")
        assert k.werdykt == "niespelnione"

    def test_bez_funkcji_zabezpieczeniowych_kryterium_uzwojenia_NIE_POWSTAJE(self) -> None:
        assert "vt.rodzaj_uzwojenia" not in kody(
            sprawdz_dobor_vt(typ(VT_20KV_05), tor(dla_zabezpieczen=False))
        )

    def test_napiecie_wtorne_faza_ziemia_pasuje_do_wejscia_100_V(self) -> None:
        # 57,7 V to 100 V / √3 — zgodnosc, nie niezgodnosc.
        assert (
            kryterium(sprawdz_dobor_vt(typ(VT_20KV_FZ), tor()), "vt.napiecie_wtorne").werdykt
            == "spelnione"
        )

    def test_niezgodne_napiecie_wtorne_jest_NIESPELNIONE(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(
                typ("vt_20kv_110v_05_abb"),
                tor(dla_zabezpieczen=False, napiecia_wejsc_przekaznika_v=(100.0,)),
            ),
            "vt.napiecie_wtorne",
        )
        assert k.werdykt == "niespelnione"

    def test_przeciazony_obwod_wtorny_jest_NIESPELNIONY(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(typ(VT_20KV_3P), tor(obciazenie_obwodu_va=45.0)), "vt.obciazalnosc"
        )
        assert k.werdykt == "niespelnione"

    def test_brak_obciazenia_obwodu_nazywa_DANA_PROJEKTOWA(self) -> None:
        k = kryterium(
            sprawdz_dobor_vt(typ(VT_20KV_3P), tor(obciazenie_obwodu_va=None)), "vt.obciazalnosc"
        )
        assert k.werdykt == "brak_danych"
        assert "daną projektową" in (k.komentarz_pl or "")

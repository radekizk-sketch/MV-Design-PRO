"""Dobor przekladnika pradowego — kryteria normowe (karta E21-4, audyt E-21 pkt P9).

Wlasciciel: „bez ustalenia, czy przekladnik 200/5 A dotyczy jednostki 1 MW, bloku czy
calej farmy 8 MW, jego wybor nie ma wiarygodnosci inzynierskiej". Testy pilnuja, ze
kazde kryterium ma jawny RACHUNEK (wymagane vs dostepne) i ze BRAK DANEJ jest trzecim
stanem — nigdy nie udaje zgodnosci.
"""

from __future__ import annotations

from domain.dobor_przekladnika import WymaganiaToru, sprawdz_dobor_ct

#: Realny wpis katalogu po rozbudowie z V12K-254 (CT 200/5 A kl. 5P10 10 VA).
CT_200_5P10 = {
    "id": "ct_200_5_5p10_10va_abb",
    "ratio_primary_a": 200.0,
    "ratio_secondary_a": 5.0,
    "accuracy_class": "5P10",
    "burden_va": 10.0,
    "application": "protection",
    "accuracy_limit_factor": 10.0,
    "ith_ka_1s": 20.0,
    "idyn_ka_peak": 50.0,
    "fs_safety_factor": None,
    "rct_ohm": None,
}

CT_100_POMIAROWY = {
    **CT_200_5P10,
    "id": "ct_100_1_0_5_5va_abb",
    "ratio_primary_a": 100.0,
    "ratio_secondary_a": 1.0,
    "accuracy_class": "0.5",
    "application": "metering",
    "accuracy_limit_factor": None,
    "ith_ka_1s": 16.0,
    "idyn_ka_peak": 40.0,
    "fs_safety_factor": 10.0,
}


def kryterium(wynik, kod: str):
    return next(k for k in wynik.kryteria if k.kod == kod)


def tor_kompletny(**nadpisania) -> WymaganiaToru:
    baza = {
        "prad_roboczy_a": 154.0,  # 4 MVA / (√3 · 15 kV)
        "ik_ka": 1.8,
        "ip_ka": 4.5,
        "czas_zwarcia_s": 1.0,
        "prad_wejscia_przekaznika_a": 5.0,
        "obciazenie_obwodu_va": 7.5,
        "dla_zabezpieczen": True,
    }
    baza.update(nadpisania)
    return WymaganiaToru(**baza)


class TestDoborKompletny:
    def test_wszystkie_kryteria_spelnione_daja_POTWIERDZONY_dobor(self) -> None:
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny())
        assert wynik.dobor_potwierdzony is True
        assert wynik.niespelnione == []
        assert wynik.bez_danych == []

    def test_kazde_kryterium_ma_JAWNY_RACHUNEK_i_podstawe(self) -> None:
        # Sedno pkt P9: nazwa katalogowa bez rachunku nie jest dowodem doboru.
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny())
        for k in wynik.kryteria:
            assert k.podstawa_pl.strip(), f"{k.kod} bez podstawy"
            if k.werdykt in ("spelnione", "niespelnione"):
                assert k.wymagane, f"{k.kod} bez wartosci wymaganej"
                assert k.dostepne, f"{k.kod} bez wartosci dostepnej"


class TestKryteriaZwarciowe:
    def test_ALF_niewystarczajacy_przy_duzym_pradzie_zwarciowym(self) -> None:
        # Ik'' 6 kA na przekladni 200 A wymaga ALF >= 30; typ ma ALF 10.
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=6.0))
        k = kryterium(wynik, "ct.alf")
        assert k.werdykt == "niespelnione"
        assert "ALF ≥ 30.0" in (k.wymagane or "")
        assert "nasyci" in (k.komentarz_pl or "")

    def test_wytrzymalosc_cieplna_liczona_z_czasu_zwarcia(self) -> None:
        # Ith wymagane = Ik''·√tk = 15 kA · √1 = 15 kA <= 20 kA → spelnione…
        assert (
            kryterium(
                sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=15.0, ip_ka=30.0)),
                "ct.wytrzymalosc_cieplna",
            ).werdykt
            == "spelnione"
        )
        # …ale przy tk = 3 s wymaganie rosnie do 25,98 kA i typ nie wystarcza.
        k = kryterium(
            sprawdz_dobor_ct(
                CT_200_5P10, tor_kompletny(ik_ka=15.0, ip_ka=30.0, czas_zwarcia_s=3.0)
            ),
            "ct.wytrzymalosc_cieplna",
        )
        assert k.werdykt == "niespelnione"
        assert "25.98" in (k.wymagane or "")

    def test_wytrzymalosc_dynamiczna_wobec_pradu_szczytowego(self) -> None:
        assert (
            kryterium(
                sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ip_ka=60.0)),
                "ct.wytrzymalosc_dynamiczna",
            ).werdykt
            == "niespelnione"
        )
        assert (
            kryterium(
                sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ip_ka=49.0)),
                "ct.wytrzymalosc_dynamiczna",
            ).werdykt
            == "spelnione"
        )


class TestKryteriaToru:
    def test_prad_roboczy_powyzej_przekladni_jest_NIESPELNIONY(self) -> None:
        k = kryterium(
            sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(prad_roboczy_a=308.0)),
            "ct.przekladnia",
        )
        assert k.werdykt == "niespelnione"
        assert "308" in (k.wymagane or "")

    def test_bardzo_niskie_wykorzystanie_to_INFORMACJA_nie_blad(self) -> None:
        # Farma 1 MW na przekladni 2000 A: dobor formalnie poprawny, ale pomiar slaby.
        wynik = sprawdz_dobor_ct(
            {**CT_200_5P10, "ratio_primary_a": 2000.0}, tor_kompletny(prad_roboczy_a=38.5)
        )
        k = kryterium(wynik, "ct.wykorzystanie_przekladni")
        assert k.werdykt == "informacja"
        # Informacja NIE psuje werdyktu doboru — inaczej ekran krzyczalby o niczym.
        assert wynik.niespelnione == []

    def test_rdzen_pomiarowy_do_zabezpieczen_jest_NIESPELNIONY(self) -> None:
        k = kryterium(
            sprawdz_dobor_ct(
                CT_100_POMIAROWY, tor_kompletny(prad_roboczy_a=80.0, prad_wejscia_przekaznika_a=1.0)
            ),
            "ct.rodzaj_rdzenia",
        )
        assert k.werdykt == "niespelnione"
        assert "nasyca" in (k.komentarz_pl or "")

    def test_niezgodny_prad_wtorny_z_wejsciem_przekaznika(self) -> None:
        k = kryterium(
            sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(prad_wejscia_przekaznika_a=1.0)),
            "ct.prad_wtorny",
        )
        assert k.werdykt == "niespelnione"

    def test_przeciazony_obwod_wtorny(self) -> None:
        k = kryterium(
            sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(obciazenie_obwodu_va=15.0)),
            "ct.obciazalnosc",
        )
        assert k.werdykt == "niespelnione"
        assert "ALF" in (k.komentarz_pl or "")


class TestBrakDanychJestTrzecimStanem:
    def test_brak_pradu_zwarciowego_NIE_udaje_zgodnosci(self) -> None:
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=None, ip_ka=None))
        for kod in ("ct.alf", "ct.wytrzymalosc_cieplna", "ct.wytrzymalosc_dynamiczna"):
            assert kryterium(wynik, kod).werdykt == "brak_danych"
        # Dobor NIE jest potwierdzony, mimo ze nic nie jest „niespelnione".
        assert wynik.dobor_potwierdzony is False
        assert wynik.niespelnione == []
        assert len(wynik.bez_danych) == 3

    def test_brak_obciazenia_obwodu_nazywa_DANA_PROJEKTOWA_do_podania(self) -> None:
        k = kryterium(
            sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(obciazenie_obwodu_va=None)),
            "ct.obciazalnosc",
        )
        assert k.werdykt == "brak_danych"
        assert "daną projektową" in (k.komentarz_pl or "")

    def test_przekladnik_bez_danych_katalogowych_daje_same_braki_nie_zgodnosc(self) -> None:
        # Kontrola granicy: typ sprzed rozbudowy katalogu (V12K-254) nie moze
        # przechodzic doboru „na cisze".
        ubozszy = {
            "ratio_primary_a": 200.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P10",
            "burden_va": 10.0,
            "application": "protection",
            "accuracy_limit_factor": 10.0,
        }
        wynik = sprawdz_dobor_ct(ubozszy, tor_kompletny())
        assert kryterium(wynik, "ct.wytrzymalosc_cieplna").werdykt == "brak_danych"
        assert kryterium(wynik, "ct.wytrzymalosc_dynamiczna").werdykt == "brak_danych"
        assert wynik.dobor_potwierdzony is False

    def test_kryterium_bez_danych_ma_NAZWANY_powod(self) -> None:
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=None))
        for k in wynik.bez_danych:
            assert k.komentarz_pl, f"{k.kod} bez powodu braku"

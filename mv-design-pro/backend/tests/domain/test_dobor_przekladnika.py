"""Dobor przekladnika pradowego — kryteria normowe (karta E21-4, audyt E-21 pkt P9;
kryterium 4 przepisane na karcie W3-B — ALF katalogowy vs nasycenie z jadra).

Wlasciciel: „bez ustalenia, czy przekladnik 200/5 A dotyczy jednostki 1 MW, bloku czy
calej farmy 8 MW, jego wybor nie ma wiarygodnosci inzynierskiej". Testy pilnuja, ze
kazde kryterium ma jawny RACHUNEK (wymagane vs dostepne) i ze BRAK DANEJ jest trzecim
stanem — nigdy nie udaje zgodnosci.

KARTA W3-B (mapa 4 #3). Kryterium 4 (`ct.alf`) przestalo liczyc wlasny prosty warunek
(milczace zalozenie S2obl = Sn dawalo „spelnione" bez podstawy do oceny nasycenia).
Teraz sa DWA wpisy:
  * `ct.alf_katalogowy` — warunek KONIECZNY (ALF >= Ik''/I1n, bez obciazenia wtornego),
    werdykt ZAWSZE „informacja" (nigdy „spelnione"),
  * `ct.alf` — nasycenie z jadra FROZEN `ct_burden_saturation.py::check_ct_burden_saturation`
    (bilans mocy wtornej S2obl, wariant PELNY/UPROSZCZONY, ALF_eff).
Testy ponizej pokrywaja ILOCZYN CECH z karty: {obwod zapisany, brak} x {Rct w katalogu,
brak} x {ALF z pola, z klasy, brak} x {Ik'' znane, brak}.
"""

from __future__ import annotations

import pytest
from api.main import app
from domain.dobor_przekladnika import CtDeviceBurden, WymaganiaToru, sprawdz_dobor_ct
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog

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

#: Obwod wtorny „lekki" — S2obl niskie wobec Sn=10 VA, wiec ALF_eff (wariant
#: UPROSZCZONY, CT_200_5P10 nie niesie rct_ohm) starcza na wymaganie kart ponizej
#: (ik_ka=1.8 kA / In=200 A => alf_wymagany=9.0; S2obl ~6.45 VA => ALF_eff ~15.5).
OBWOD_LEKKI = {
    "dlugosc_przewodu_m": 10.0,
    "przekroj_przewodu_mm2": 2.5,
    "obciazenia_aparatow": (CtDeviceBurden(nazwa="Przekaźnik", moc_va=3.0),),
}


def kryterium(wynik, kod: str):
    return next(k for k in wynik.kryteria if k.kod == kod)


def tor_kompletny(**nadpisania) -> WymaganiaToru:
    baza = {
        "prad_roboczy_a": 154.0,  # 4 MVA / (√3 · 15 kV)
        "ik_ka": 1.8,
        "ip_ka": 4.5,
        "czas_zwarcia_s": 1.0,
        "prady_wejsc_przekaznika_a": (1.0, 5.0),
        "obciazenie_obwodu_va": 7.5,
        "dla_zabezpieczen": True,
        # Karta W3-B: obwod wtorny "kompletny" wchodzi do bazy KOMPLETNEGO toru —
        # inaczej `ct.alf` byloby zawsze `brak_danych`, a test doboru kompletnego
        # klamalby o kompletnosci.
        **OBWOD_LEKKI,
    }
    baza.update(nadpisania)
    return WymaganiaToru(**baza)


class TestDoborKompletny:
    def test_wszystkie_kryteria_spelnione_daja_POTWIERDZONY_dobor(self) -> None:
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny())
        assert wynik.dobor_potwierdzony is True
        assert wynik.niespelnione == []
        assert wynik.bez_danych == []
        # `ct.alf_katalogowy` jest INFORMACJA, wiec nie blokuje potwierdzenia —
        # ale MUSI byc obecne (karta W3-B: dwa wpisy, nie jeden).
        assert kryterium(wynik, "ct.alf_katalogowy").werdykt == "informacja"
        assert kryterium(wynik, "ct.alf").werdykt == "spelnione"

    def test_kazde_kryterium_ma_JAWNY_RACHUNEK_i_podstawe(self) -> None:
        # Sedno pkt P9: nazwa katalogowa bez rachunku nie jest dowodem doboru.
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny())
        for k in wynik.kryteria:
            assert k.podstawa_pl.strip(), f"{k.kod} bez podstawy"
            if k.werdykt in ("spelnione", "niespelnione", "informacja"):
                assert k.wymagane, f"{k.kod} bez wartosci wymaganej"
                assert k.dostepne, f"{k.kod} bez wartosci dostepnej"


class TestKryteriaZwarciowe:
    def test_ALF_katalogowy_jest_INFORMACJA_nigdy_werdyktem(self) -> None:
        # Ik'' 6 kA na przekladni 200 A wymaga ALF >= 30; typ ma ALF 10 — warunek
        # KONIECZNY nie jest spelniony, ale kryterium NIE orzeka nasycenia samo:
        # to defekt, ktory karta W3-B zamyka (dawne "niespelnione" bez podstawy).
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=6.0))
        k = kryterium(wynik, "ct.alf_katalogowy")
        assert k.werdykt == "informacja"
        assert "ALF ≥ 30.0" in (k.wymagane or "")
        assert "ALF 10" in (k.dostepne or "")
        assert "ct.alf" in (k.komentarz_pl or "")

    def test_ALF_nasycenie_niespelnione_gdy_bilans_wtorny_nie_pokrywa_wymagania(self) -> None:
        # Ten sam prad zwarciowy (Ik'' 6 kA => alf_wymagany 30.0): rozstrzyga TERAZ
        # `ct.alf` z jadra (ALF_eff ~15.5 < 30.0 — bilans wtorny, nie sam ALF).
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=6.0))
        k = kryterium(wynik, "ct.alf")
        assert k.werdykt == "niespelnione"
        assert "ALF_eff ≥ 30.0" in (k.wymagane or "")
        assert "ALF_eff" in (k.dostepne or "")
        assert "UPROSZCZONY_BEZ_RCT" in (k.dostepne or "")
        assert k.slad, "ct.alf powinno niesc slad WHITE BOX z jadra"

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
                CT_100_POMIAROWY,
                tor_kompletny(prad_roboczy_a=80.0, prady_wejsc_przekaznika_a=(1.0,)),
            ),
            "ct.rodzaj_rdzenia",
        )
        assert k.werdykt == "niespelnione"
        assert "nasyca" in (k.komentarz_pl or "")

    def test_niezgodny_prad_wtorny_z_wejsciem_przekaznika(self) -> None:
        k = kryterium(
            sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(prady_wejsc_przekaznika_a=(1.0,))),
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
        for kod in (
            "ct.alf_katalogowy",
            "ct.alf",
            "ct.wytrzymalosc_cieplna",
            "ct.wytrzymalosc_dynamiczna",
        ):
            assert kryterium(wynik, kod).werdykt == "brak_danych", kod
        # Dobor NIE jest potwierdzony, mimo ze nic nie jest „niespelnione".
        assert wynik.dobor_potwierdzony is False
        assert wynik.niespelnione == []
        assert len(wynik.bez_danych) == 4

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


class TestNasycenieRdzeniaIloczynCech:
    """Karta W3-B: `ct.alf` deleguje do jadra — iloczyn cech, nie przyklad z karty.

    {obwod zapisany, brak} x {Rct w katalogu, brak} x {ALF z pola, z klasy, brak}
    x {Ik'' znane, brak}. Kazda kombinacja jest osobnym testem — defekt, ktory karta
    zamyka (spelnione bez podstawy), moglby sie schowac w kazdej z nich osobno.
    """

    def test_obwod_brak_daje_brak_danych_z_kodem_gotowosci(self) -> None:
        # obwod: BRAK. Rct: brak. ALF: z pola. Ik'': znane.
        tor = tor_kompletny(
            dlugosc_przewodu_m=None, przekroj_przewodu_mm2=None, obciazenia_aparatow=()
        )
        k = kryterium(sprawdz_dobor_ct(CT_200_5P10, tor), "ct.alf")
        assert k.werdykt == "brak_danych"
        assert "ct.secondary_circuit_missing" in k.kody_gotowosci

    def test_obwod_zapisany_rct_brak_daje_wariant_uproszczony(self) -> None:
        # obwod: zapisany. Rct: BRAK (CT_200_5P10.rct_ohm is None). ALF: z pola.
        # Ik'': znane. Przy lekkim obwodzie ALF_eff wystarcza -> spelnione,
        # ale wariant MUSI byc nazwany UPROSZCZONY (wynik optymistyczny).
        k = kryterium(sprawdz_dobor_ct(CT_200_5P10, tor_kompletny()), "ct.alf")
        assert k.werdykt == "spelnione"
        assert "UPROSZCZONY_BEZ_RCT" in (k.dostepne or "")
        assert "ct.winding_resistance_missing" in k.kody_gotowosci

    def test_obwod_zapisany_rct_w_katalogu_daje_wariant_pelny(self) -> None:
        # obwod: zapisany. Rct: W KATALOGU. ALF: z pola. Ik'': znane.
        ct_z_rct = {**CT_200_5P10, "rct_ohm": 0.3}
        k = kryterium(sprawdz_dobor_ct(ct_z_rct, tor_kompletny()), "ct.alf")
        assert k.werdykt == "spelnione"
        assert "PELNY_IEC61869_2" in (k.dostepne or "")
        assert "ct.winding_resistance_missing" not in k.kody_gotowosci

    def test_alf_z_klasy_gdy_pole_katalogu_puste(self) -> None:
        # obwod: zapisany. Rct: brak. ALF: Z KLASY (accuracy_limit_factor=None,
        # accuracy_class="5P10" -> jadro wyprowadza 10). Ik'': znane.
        bez_alf_pola = {**CT_200_5P10, "accuracy_limit_factor": None}
        wynik = sprawdz_dobor_ct(bez_alf_pola, tor_kompletny())
        katalogowe = kryterium(wynik, "ct.alf_katalogowy")
        assert katalogowe.werdykt == "informacja"
        assert "wyprowadzony z klasy" in (katalogowe.dostepne or "")
        assert kryterium(wynik, "ct.alf").werdykt == "spelnione"

    def test_alf_brak_wszedzie_daje_brak_danych_z_kodem_katalogowym(self) -> None:
        # obwod: zapisany. Rct: brak. ALF: BRAK (pole puste, klasa pomiarowa bez P).
        # Ik'': znane.
        bez_alf = {**CT_100_POMIAROWY}
        wynik = sprawdz_dobor_ct(bez_alf, tor_kompletny(prady_wejsc_przekaznika_a=(1.0,)))
        assert kryterium(wynik, "ct.alf_katalogowy").werdykt == "brak_danych"
        k = kryterium(wynik, "ct.alf")
        assert k.werdykt == "brak_danych"
        assert "ct.accuracy_limit_missing" in k.kody_gotowosci

    def test_ik_brak_daje_brak_danych_na_obu_kryteriach(self) -> None:
        # obwod: zapisany. Rct: brak. ALF: z pola. Ik'': BRAK.
        wynik = sprawdz_dobor_ct(CT_200_5P10, tor_kompletny(ik_ka=None))
        assert kryterium(wynik, "ct.alf_katalogowy").werdykt == "brak_danych"
        k = kryterium(wynik, "ct.alf")
        assert k.werdykt == "brak_danych"
        assert "ct.required_alf_missing" in k.kody_gotowosci
        # Bilans wtorny nadal jest POLICZONY (i2n/sn/dlugosc/przekroj obecne) —
        # brakuje WYLACZNIE odniesienia (Ik''), wiec status_obciazenia istnieje.
        assert "S2obl" in (k.dostepne or "") or k.dostepne is None

    def test_moc_stykow_wchodzi_do_bilansu_gdy_podana(self) -> None:
        # obwod: zapisany + moc stykow jawna. Rct: brak. ALF: z pola. Ik'': znane.
        tor_bez_stykow = tor_kompletny()
        tor_ze_stykami = tor_kompletny(moc_stykow_va=5.0)
        eff_bez = kryterium(sprawdz_dobor_ct(CT_200_5P10, tor_bez_stykow), "ct.alf").dostepne
        eff_ze = kryterium(sprawdz_dobor_ct(CT_200_5P10, tor_ze_stykami), "ct.alf").dostepne
        assert eff_bez != eff_ze


class TestParytetKtWynikJadraIEndpointuHttp:
    """Karta W3-B DoD: parytet `ct.alf` <-> `POST /api/solver/ct-burden-check` dla
    tych samych danych (te same liczby, ten sam wariant) — podstawienie do
    REALNEGO katalogu i REALNEGO endpointu, nie porownanie dwoch implementacji
    napisanych rownolegle."""

    @pytest.fixture
    def klient(self) -> TestClient:
        return TestClient(app)

    @staticmethod
    def _pierwszy_ct_zabezpieczeniowy() -> str:
        katalog = get_default_mv_catalog()
        for ident, pozycja in sorted(katalog.ct_types.items()):
            if pozycja.accuracy_class and "P" in pozycja.accuracy_class.upper():
                return ident
        raise AssertionError("Katalog nie ma przekładnika prądowego klasy zabezpieczeniowej.")

    def test_te_same_liczby_ten_sam_wariant(self, klient: TestClient) -> None:
        ref = self._pierwszy_ct_zabezpieczeniowy()
        pozycja = get_default_mv_catalog().ct_types[ref].to_dict()

        odpowiedz = klient.post(
            "/api/solver/ct-burden-check",
            json={
                "ct_catalog_ref": ref,
                "dlugosc_przewodu_m": 20.0,
                "przekroj_przewodu_mm2": 4.0,
                "obciazenia_aparatow": [{"nazwa": "Przekaźnik", "moc_va": 2.0}],
                "alf_wymagany": 6.0,
            },
        )
        assert odpowiedz.status_code == 200
        z_http = odpowiedz.json()

        tor = tor_kompletny(
            ik_ka=6.0 * pozycja["ratio_primary_a"] / 1000.0,
            dlugosc_przewodu_m=20.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=(CtDeviceBurden(nazwa="Przekaźnik", moc_va=2.0),),
        )
        wynik = sprawdz_dobor_ct(pozycja, tor)
        k = kryterium(wynik, "ct.alf")

        assert z_http["wariant_alf"] in (k.dostepne or "")
        assert f"{z_http['alf_efektywny']:.1f}" in (k.dostepne or "")
        mapa_status = {"PASS": "spelnione", "FAIL": "niespelnione", "UNAVAILABLE": "brak_danych"}
        assert k.werdykt == mapa_status[z_http["status_nasycenia"]]

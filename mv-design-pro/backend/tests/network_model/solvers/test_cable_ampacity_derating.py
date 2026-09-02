"""Karta F-K7 (znalezisko Z6, V12K-207): korekta obciazalnosci wg warunkow ulozenia.

Intencja testow: obciazalnosc katalogowa obowiazuje dla warunkow ODNIESIENIA
producenta. Dobor na samej wartosci katalogowej jest optymistyczny, a dotad
NIGDZIE nie bylo napisane, ze wynik dotyczy warunkow katalogowych. Testy pilnuja
trzech rzeczy: (1) domyslnie nic sie nie zmienia, ale zalozenie jest jawne,
(2) wspolczynnik zawsze ma udokumentowana podstawe, (3) nieznany zestaw i brak
opisu warunkow wlasnych sa odrzucane (fail-closed), a nie zgadywane.
"""

from __future__ import annotations

import pytest
from network_model.catalog import lv_ampacity_iec60364_5_52 as tablice_nn
from network_model.solvers.cable_ampacity_derating import (
    NAZWA_WARUNKI_KATALOGOWE,
    NAZWA_ZIEMIA_3_KABLE_200MM,
    WARUNKI_KATALOGOWE,
    ZESTAWY_WARUNKOW,
    ZIEMIA_3_KABLE_200MM,
    WspolczynnikiObciazalnosci,
    WspolczynnikiObciazalnosciNN,
    obciazalnosc_skorygowana,
    widok_zestawow,
    wspolczynniki_nn,
    wspolczynniki_wlasne,
    wspolczynniki_z_opisu,
    zestaw_warunkow,
)


def test_warunki_katalogowe_nie_zmieniaja_obciazalnosci() -> None:
    """Iloczyn 1,0 — dolozenie modulu nie moze przesunac ZADNEGO dotychczasowego doboru."""
    assert WARUNKI_KATALOGOWE.iloczyn == 1.0
    assert WARUNKI_KATALOGOWE.bez_korekty is True
    assert obciazalnosc_skorygowana(340.0, WARUNKI_KATALOGOWE) == pytest.approx(340.0)


def test_warunki_katalogowe_nazywaja_swoje_ograniczenie() -> None:
    """Zalozenie MUSI byc jawne: „warunki katalogowe" to nie to samo co „bez zalozen"."""
    zalozenie = WARUNKI_KATALOGOWE.zalozenie_pl()
    assert "WARUNKÓW KATALOGOWYCH" in zalozenie
    assert "może być mniejsza" in zalozenie


def test_zestaw_ziemny_obniza_obciazalnosc_o_zmierzona_wartosc() -> None:
    """DOWOD LICZBOWY: 0,90 · 1,01 · 0,82 = 0,74538; 340 A -> 253,43 A."""
    assert ZIEMIA_3_KABLE_200MM.iloczyn == pytest.approx(0.74538, abs=1e-9)
    assert ZIEMIA_3_KABLE_200MM.bez_korekty is False
    assert obciazalnosc_skorygowana(340.0, ZIEMIA_3_KABLE_200MM) == pytest.approx(
        253.4292, abs=1e-4
    )


def test_kazdy_zestaw_ma_udokumentowana_podstawe() -> None:
    """Wspolczynnik bez podstawy dokumentowej jest liczba zgadnieta — regula braku fabrykacji."""
    for nazwa, zestaw in ZESTAWY_WARUNKOW.items():
        assert zestaw.nazwa == nazwa, "klucz slownika musi zgadzac sie z nazwa zestawu"
        assert zestaw.podstawa.strip(), f"zestaw {nazwa} bez podstawy dokumentowej"
        assert zestaw.etykieta_pl.strip(), f"zestaw {nazwa} bez etykiety dla projektanta"


def test_zalozenie_zestawu_ziemnego_niesie_rozbicie_i_podstawe() -> None:
    """Slad WHITE BOX musi dac sie obronic: trzy wspolczynniki, iloczyn i skad pochodza."""
    zalozenie = ZIEMIA_3_KABLE_200MM.zalozenie_pl()
    assert "f_grunt = 0.9" in zalozenie
    assert "f_wiazka = 1.01" in zalozenie
    assert "f_grupa = 0.82" in zalozenie
    assert "0.7454" in zalozenie
    assert "MT880" in zalozenie


def test_zestaw_po_nazwie_i_fail_closed_dla_nieznanej() -> None:
    """Nieznany zestaw = blad, nie ciche przyjecie warunkow katalogowych."""
    assert zestaw_warunkow(NAZWA_WARUNKI_KATALOGOWE) is WARUNKI_KATALOGOWE
    assert zestaw_warunkow(NAZWA_ZIEMIA_3_KABLE_200MM) is ZIEMIA_3_KABLE_200MM
    with pytest.raises(ValueError, match="Nieznany zestaw warunków ułożenia"):
        zestaw_warunkow("ziemia_5_kabli_rura_karbowana")


def test_komunikat_bledu_wymienia_dostepne_zestawy_i_powod_krotkiej_listy() -> None:
    """Projektant musi wiedziec, co jest dostepne i DLACZEGO lista jest krotka."""
    with pytest.raises(ValueError) as blad:
        zestaw_warunkow("nieistniejacy")
    tresc = str(blad.value)
    assert NAZWA_WARUNKI_KATALOGOWE in tresc
    assert NAZWA_ZIEMIA_3_KABLE_200MM in tresc
    assert "nie interpoluje" in tresc
    assert "IEC 60287" in tresc


def test_wspolczynniki_wlasne_wymagaja_opisu_warunkow() -> None:
    """Bez opisu wynik doboru nie dalby sie obronic w dokumentacji projektu."""
    wlasne = wspolczynniki_wlasne(
        f_grunt=0.85,
        f_wiazka=1.0,
        f_grupa=0.75,
        opis_pl="Ziemia, 2 obwody w rurach oslonowych, odstep 300 mm",
    )
    assert wlasne.iloczyn == pytest.approx(0.6375)
    assert "rurach oslonowych" in wlasne.zalozenie_pl()
    assert "projektanta" in wlasne.podstawa

    for pusty in ("", "   "):
        with pytest.raises(ValueError, match="wymagają opisu"):
            wspolczynniki_wlasne(f_grunt=0.9, f_wiazka=1.0, f_grupa=0.8, opis_pl=pusty)


@pytest.mark.parametrize("wartosc", [0.0, -0.5, 1.51, 2.0])
def test_wspolczynnik_poza_zakresem_jest_odrzucany(wartosc: float) -> None:
    """Zakres (0; 1,5]: zero/ujemna wartosc nie ma sensu fizycznego, a >1,5 to literowka."""
    with pytest.raises(ValueError, match="zakresie"):
        WspolczynnikiObciazalnosci(
            nazwa="test",
            etykieta_pl="test",
            f_grunt=wartosc,
            f_wiazka=1.0,
            f_grupa=1.0,
            podstawa="test",
        )


def test_obciazalnosc_katalogowa_musi_byc_dodatnia() -> None:
    """Brak/zerowa obciazalnosc katalogowa = brak danych, nie „0 A dopuszczalne"."""
    with pytest.raises(ValueError, match="musi być dodatnia"):
        obciazalnosc_skorygowana(0.0, WARUNKI_KATALOGOWE)


def test_wspolczynniki_z_opisu_jest_jedynym_przelozeniem() -> None:
    """Jedno miejsce zamiany OPISU warunkow na wspolczynniki (API, model, raport).

    Gdyby kazda warstwa odtwarzala te regule osobno, raport zgodnosci moglby policzyc
    propozycje inaczej niz kreator i zglosic odstepstwo od wlasnego rachunku.
    """
    assert wspolczynniki_z_opisu(None) is WARUNKI_KATALOGOWE
    assert wspolczynniki_z_opisu("") is WARUNKI_KATALOGOWE
    assert wspolczynniki_z_opisu("   ") is WARUNKI_KATALOGOWE
    assert wspolczynniki_z_opisu(NAZWA_ZIEMIA_3_KABLE_200MM) is ZIEMIA_3_KABLE_200MM
    # Nazwa z bialymi znakami po bokach jest normalizowana (jedno wejscie, jeden wynik).
    assert wspolczynniki_z_opisu(f"  {NAZWA_ZIEMIA_3_KABLE_200MM} ") is ZIEMIA_3_KABLE_200MM

    wlasne = wspolczynniki_z_opisu(
        "wlasne", f_grunt=0.9, f_wiazka=1.0, f_grupa=0.85, opis_pl="Ziemia, rura oslonowa"
    )
    assert wlasne.iloczyn == pytest.approx(0.765)
    with pytest.raises(ValueError, match="trzech współczynników"):
        wspolczynniki_z_opisu("wlasne", f_grunt=0.9, opis_pl="brak dwoch pozostalych")
    with pytest.raises(ValueError, match="Nieznany zestaw"):
        wspolczynniki_z_opisu("ziemia_7_kabli")


def test_widok_zestawow_jest_deterministyczny_i_pelny() -> None:
    """Widok dla prezentacji: posortowany, z podstawa i powodem krotkiej listy."""
    widok = widok_zestawow()
    assert widok == widok_zestawow()

    nazwy = [item["name"] for item in widok["sets"]]  # type: ignore[index]
    assert nazwy == sorted(nazwy)
    assert set(nazwy) == set(ZESTAWY_WARUNKOW)
    assert widok["default_name"] == NAZWA_WARUNKI_KATALOGOWE
    assert widok["custom_name"] == "wlasne"
    assert "IEC 60287" in str(widok["limitation_pl"])
    for item in widok["sets"]:  # type: ignore[union-attr]
        assert item["basis"].strip()
        assert item["assumption_pl"].strip()


# ---------------------------------------------------------------------------
# nN — Iz' wg PN-HD 60364-5-52 (karta P0.5a, luka G-08/G-D1)
#
# Wartosci referencyjne ponizej sa policzone RECZNIE z tablic (rejestr
# `network_model.catalog.lv_ampacity_iec60364_5_52`), NIE z uruchomienia
# testowanego kodu — patrz komentarz kazdego testu.
# ---------------------------------------------------------------------------


def test_iz_prim_xlpe_grunt_rezystywnosc_1_5() -> None:
    """DOWOD 1: kabel XLPE w gruncie, rezystywnosc 1,5 K*m/W, temp. 20°C (ref.), 1 obwod.

    Tablice: f_temperatura(XLPE, grunt, 20°C) = 1,00 (referencja);
    f_rezystywnosc_gruntu(1,5) = 1,10; f_grupowanie(grunt, 1 obwod) = 1,00.
    Iloczyn = 1,00 * 1,10 * 1,00 = 1,10. Iz katalogowe 200 A -> Iz' = 220,0 A.
    """
    wynik = wspolczynniki_nn(
        srodowisko="grunt",
        izolacja="XLPE",
        temperatura_c=20.0,
        liczba_obwodow=1,
        rezystywnosc_gruntu_km_w=1.5,
    )
    assert wynik.f_temperatura == pytest.approx(1.00)
    assert wynik.f_rezystywnosc_gruntu == pytest.approx(1.10)
    assert wynik.f_grupowanie == pytest.approx(1.00)
    assert wynik.iloczyn == pytest.approx(1.10)
    assert obciazalnosc_skorygowana(200.0, wynik) == pytest.approx(220.0)


def test_iz_prim_pvc_powietrze_40c() -> None:
    """DOWOD 2: kabel PVC w powietrzu, 40°C, 1 obwod.

    Tablica B.52.14: f_temperatura(PVC, powietrze, 40°C) = 0,87.
    f_grupowanie(powietrze, 1 obwod) = 1,00; rezystywnosc gruntu nie dotyczy
    (powietrze) -> f_rezystywnosc_gruntu = 1,00 (neutralne, nie brak danej).
    Iloczyn = 0,87. Iz katalogowe 100 A -> Iz' = 87,0 A.
    """
    wynik = wspolczynniki_nn(
        srodowisko="powietrze",
        izolacja="PVC",
        temperatura_c=40.0,
        liczba_obwodow=1,
    )
    assert wynik.f_temperatura == pytest.approx(0.87)
    assert wynik.f_rezystywnosc_gruntu == pytest.approx(1.00)
    assert wynik.f_grupowanie == pytest.approx(1.00)
    assert wynik.rezystywnosc_gruntu_km_w is None
    assert wynik.iloczyn == pytest.approx(0.87)
    assert obciazalnosc_skorygowana(100.0, wynik) == pytest.approx(87.0)


def test_iz_prim_grupa_4_obwodow_powietrze() -> None:
    """DOWOD 3: grupa 4 obwodow wielozylowych w powietrzu (wiazka), XLPE, 30°C (ref.).

    Tablica B.52.17: f_grupowanie(powietrze, 4 obwody) = 0,65.
    Temperatura referencyjna (30°C) izoluje efekt grupowania: f_temperatura = 1,00.
    Iloczyn = 0,65. Iz katalogowe 300 A -> Iz' = 195,0 A.
    """
    wynik = wspolczynniki_nn(
        srodowisko="powietrze",
        izolacja="XLPE",
        temperatura_c=30.0,
        liczba_obwodow=4,
    )
    assert wynik.f_temperatura == pytest.approx(1.00)
    assert wynik.f_grupowanie == pytest.approx(0.65)
    assert wynik.iloczyn == pytest.approx(0.65)
    assert obciazalnosc_skorygowana(300.0, wynik) == pytest.approx(195.0)


def test_bez_korekty_w_punkcie_odniesienia_normy() -> None:
    """W punkcie odniesienia (30°C powietrze, 1 obwod) Iz' = Iz katalogowe (co do bitu)."""
    wynik = wspolczynniki_nn(
        srodowisko="powietrze", izolacja="PVC", temperatura_c=30.0, liczba_obwodow=1
    )
    assert wynik.bez_korekty is True
    assert obciazalnosc_skorygowana(340.0, wynik) == pytest.approx(340.0)


class TestSanityBoundsNN:
    """Sanity-bounds z karty P0.5a §0.4 — parametryzowane po WSZYSTKICH zasilonych
    zestawach (iloczyn cech), nie po przykladzie z karty (regula KLASA NIE INSTANCJA)."""

    _WSZYSTKIE_TABLICE = (
        tablice_nn.TABLICA_TEMPERATURY_POWIETRZE_NN,
        tablice_nn.TABLICA_TEMPERATURY_GRUNTU_NN,
        tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN,
        tablice_nn.TABLICA_GRUPOWANIA_POWIETRZE_NN,
        tablice_nn.TABLICA_GRUPOWANIA_GRUNTU_NN,
    )

    def test_kazdy_wpis_w_zakresie_0_1_3(self) -> None:
        """Kazdy wspolczynnik tablicowy w (0; 1,3] — we WSZYSTKICH pieciu tablicach."""
        for tablica in self._WSZYSTKIE_TABLICE:
            for klucz, wpis in tablica.items():
                assert 0.0 < wpis.wartosc <= 1.3, (tablica, klucz, wpis.wartosc)

    def test_kazdy_wpis_ma_podstawe_z_dwoma_zrodlami(self) -> None:
        """Proweniencja niesie numer tablicy normy i dwa zrodla weryfikacji."""
        for tablica in self._WSZYSTKIE_TABLICE:
            for wpis in tablica.values():
                assert "PN-HD 60364-5-52" in wpis.podstawa
                assert "(1)" in wpis.podstawa and "(2)" in wpis.podstawa

    @pytest.mark.parametrize("izolacja", ["PVC", "XLPE"])
    def test_korekta_temperatury_powietrze_maleje_i_rowna_1_w_referencji(
        self, izolacja: str
    ) -> None:
        wpisy = sorted(
            (temp, wpis.wartosc)
            for (iz, temp), wpis in tablice_nn.TABLICA_TEMPERATURY_POWIETRZE_NN.items()
            if iz == izolacja
        )
        wartosci = [wartosc for _temp, wartosc in wpisy]
        assert wartosci == sorted(wartosci, reverse=True), "korekta musi maleć z temperaturą"
        assert dict(wpisy)[30] == 1.0, "30°C to referencja normy dla powietrza"

    @pytest.mark.parametrize("izolacja", ["PVC", "XLPE"])
    def test_korekta_temperatury_gruntu_maleje_i_rowna_1_w_referencji(self, izolacja: str) -> None:
        wpisy = sorted(
            (temp, wpis.wartosc)
            for (iz, temp), wpis in tablice_nn.TABLICA_TEMPERATURY_GRUNTU_NN.items()
            if iz == izolacja
        )
        wartosci = [wartosc for _temp, wartosc in wpisy]
        assert wartosci == sorted(wartosci, reverse=True), "korekta musi maleć z temperaturą"
        assert dict(wpisy)[20] == 1.0, "20°C to referencja normy dla gruntu"

    def test_korekta_rezystywnosci_gruntu_maleje_i_rowna_1_w_referencji(self) -> None:
        wpisy = sorted(tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN.items())
        wartosci = [wpis.wartosc for _rez, wpis in wpisy]
        assert wartosci == sorted(wartosci, reverse=True), "korekta musi maleć z rezystywnością"
        assert (
            tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN[2.5].wartosc == 1.0
        ), "2,5 K·m/W to referencja normy"

    @pytest.mark.parametrize(
        "tablica",
        [tablice_nn.TABLICA_GRUPOWANIA_POWIETRZE_NN, tablice_nn.TABLICA_GRUPOWANIA_GRUNTU_NN],
    )
    def test_grupowanie_maleje_z_liczba_obwodow_i_jest_lte_1(self, tablica: object) -> None:
        wpisy = sorted(tablica.items())  # type: ignore[attr-defined]
        wartosci = [wpis.wartosc for _n, wpis in wpisy]
        assert all(w <= 1.0 for w in wartosci)
        assert wartosci == sorted(wartosci, reverse=True), "korekta musi maleć z liczbą obwodów"
        assert tablica[1].wartosc == 1.0, "1 obwód = brak korekty grupowania"  # type: ignore[index]

    @pytest.mark.parametrize(
        "izolacja,temp",
        sorted(tablice_nn.TABLICA_TEMPERATURY_POWIETRZE_NN.keys()),
    )
    @pytest.mark.parametrize("liczba_obwodow", sorted(tablice_nn.TABLICA_GRUPOWANIA_POWIETRZE_NN))
    def test_iloczyn_dodatni_dla_kazdej_kombinacji_powietrze(
        self, izolacja: str, temp: int, liczba_obwodow: int
    ) -> None:
        """Iloczyn zestawu > 0 dla KAZDEJ kombinacji izolacja x temperatura x obwody (powietrze)."""
        wynik = wspolczynniki_nn(
            srodowisko="powietrze",
            izolacja=izolacja,  # type: ignore[arg-type]
            temperatura_c=float(temp),
            liczba_obwodow=liczba_obwodow,
        )
        assert wynik.iloczyn > 0.0
        assert wynik.f_rezystywnosc_gruntu == 1.0

    @pytest.mark.parametrize(
        "izolacja,temp",
        sorted(tablice_nn.TABLICA_TEMPERATURY_GRUNTU_NN.keys()),
    )
    @pytest.mark.parametrize("liczba_obwodow", sorted(tablice_nn.TABLICA_GRUPOWANIA_GRUNTU_NN))
    @pytest.mark.parametrize("rezystywnosc", sorted(tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN))
    def test_iloczyn_dodatni_dla_kazdej_kombinacji_grunt(
        self, izolacja: str, temp: int, liczba_obwodow: int, rezystywnosc: float
    ) -> None:
        """Iloczyn zestawu > 0 dla KAZDEJ kombinacji izolacja x temp x obwody x rezystywność (grunt)."""
        wynik = wspolczynniki_nn(
            srodowisko="grunt",
            izolacja=izolacja,  # type: ignore[arg-type]
            temperatura_c=float(temp),
            liczba_obwodow=liczba_obwodow,
            rezystywnosc_gruntu_km_w=rezystywnosc,
        )
        assert wynik.iloczyn > 0.0
        assert wynik.rezystywnosc_gruntu_km_w == rezystywnosc


class TestWspolczynnikiNNFailClosed:
    """Nieznana kombinacja (poza zweryfikowanym rejestrem G-D1) = blad, nie zgadywanie."""

    def test_nieznana_temperatura_powietrza_odrzucona(self) -> None:
        with pytest.raises(ValueError, match="Brak zweryfikowanej korekty temperatury"):
            wspolczynniki_nn(
                srodowisko="powietrze", izolacja="PVC", temperatura_c=25.0, liczba_obwodow=1
            )

    def test_nieznana_rezystywnosc_gruntu_odrzucona(self) -> None:
        with pytest.raises(ValueError, match="rezystywności cieplnej gruntu"):
            wspolczynniki_nn(
                srodowisko="grunt",
                izolacja="XLPE",
                temperatura_c=20.0,
                liczba_obwodow=1,
                rezystywnosc_gruntu_km_w=1.2,
            )

    def test_nieznana_liczba_obwodow_odrzucona(self) -> None:
        with pytest.raises(ValueError, match="Brak zweryfikowanej korekty grupowania"):
            wspolczynniki_nn(
                srodowisko="powietrze", izolacja="PVC", temperatura_c=30.0, liczba_obwodow=5
            )

    def test_grunt_bez_rezystywnosci_odrzucony(self) -> None:
        with pytest.raises(ValueError, match="wymaga rezystywności"):
            wspolczynniki_nn(
                srodowisko="grunt", izolacja="PVC", temperatura_c=20.0, liczba_obwodow=1
            )

    def test_powietrze_z_rezystywnoscia_odrzucone(self) -> None:
        with pytest.raises(ValueError, match="nie dotyczy ułożenia w powietrzu"):
            wspolczynniki_nn(
                srodowisko="powietrze",
                izolacja="PVC",
                temperatura_c=30.0,
                liczba_obwodow=1,
                rezystywnosc_gruntu_km_w=1.5,
            )

    def test_nieznane_srodowisko_odrzucone(self) -> None:
        with pytest.raises(ValueError, match="Nieznane środowisko"):
            wspolczynniki_nn(
                srodowisko="rura_kablowa",  # type: ignore[arg-type]
                izolacja="PVC",
                temperatura_c=30.0,
                liczba_obwodow=1,
            )

    def test_nieznana_izolacja_odrzucona(self) -> None:
        with pytest.raises(ValueError, match="Nieznany typ izolacji"):
            wspolczynniki_nn(
                srodowisko="powietrze",
                izolacja="EPR",  # type: ignore[arg-type]
                temperatura_c=30.0,
                liczba_obwodow=1,
            )

    def test_liczba_obwodow_ponizej_1_odrzucona(self) -> None:
        with pytest.raises(ValueError, match="Liczba obwodów musi być >= 1"):
            wspolczynniki_nn(
                srodowisko="powietrze", izolacja="PVC", temperatura_c=30.0, liczba_obwodow=0
            )


def test_obciazalnosc_skorygowana_dziala_dla_sn_i_nn_przez_jeden_kanal() -> None:
    """JEDNA sciezka mnozenia: `obciazalnosc_skorygowana` przyjmuje SN i nN bez zmian.

    Regula KLASA NIE INSTANCJA (karta P0.5a) — SN (`WspolczynnikiObciazalnosci`) i nN
    (`WspolczynnikiObciazalnosciNN`) spelniaja ten sam protokol strukturalnie
    (`.iloczyn`), wiec ta sama funkcja liczy obie bez rozgalezienia typu.
    """
    sn = WARUNKI_KATALOGOWE
    nn = wspolczynniki_nn(
        srodowisko="powietrze", izolacja="PVC", temperatura_c=40.0, liczba_obwodow=1
    )
    assert isinstance(sn, WspolczynnikiObciazalnosci)
    assert isinstance(nn, WspolczynnikiObciazalnosciNN)
    assert obciazalnosc_skorygowana(100.0, sn) == pytest.approx(100.0)
    assert obciazalnosc_skorygowana(100.0, nn) == pytest.approx(87.0)


def test_modul_katalogowy_nn_nie_ma_wlasnej_implementacji_liczacej() -> None:
    """JEDNA sciezka fizyki: modul danych (katalog) nie eksportuje funkcji liczacej.

    Karta P0.5a §0.2: `lv_ampacity_iec60364_5_52` (katalog) zostaje WYLACZNIE
    nosnikiem danych — nie ma `obciazalnosc_skorygowana`, `iloczyn` ani zadnej
    innej funkcji/wlasnosci, ktora mnozylaby wspolczynniki. Mnozenie zyje
    WYLACZNIE w `cable_ampacity_derating.obciazalnosc_skorygowana`.
    """
    assert not hasattr(tablice_nn, "obciazalnosc_skorygowana")
    assert not hasattr(tablice_nn, "iloczyn")
    assert not hasattr(tablice_nn.WpisNormyNN, "iloczyn")
    # Rejestr danych sam nie liczy Iz' — jedynie wartosc + podstawa per wpis.
    for tablica in (
        tablice_nn.TABLICA_TEMPERATURY_POWIETRZE_NN,
        tablice_nn.TABLICA_TEMPERATURY_GRUNTU_NN,
        tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN,
        tablice_nn.TABLICA_GRUPOWANIA_POWIETRZE_NN,
        tablice_nn.TABLICA_GRUPOWANIA_GRUNTU_NN,
    ):
        for wpis in tablica.values():
            assert set(vars(wpis)) == {"wartosc", "podstawa"}


def test_wspolczynniki_nn_determinizm_dwoch_wywolan() -> None:
    """Ten sam input -> identyczny wynik (dwa niezalezne wywolania)."""
    a = wspolczynniki_nn(
        srodowisko="grunt",
        izolacja="XLPE",
        temperatura_c=20.0,
        liczba_obwodow=2,
        rezystywnosc_gruntu_km_w=1.5,
    )
    b = wspolczynniki_nn(
        srodowisko="grunt",
        izolacja="XLPE",
        temperatura_c=20.0,
        liczba_obwodow=2,
        rezystywnosc_gruntu_km_w=1.5,
    )
    assert a == b
    assert a.iloczyn == b.iloczyn


def test_wspolczynniki_nn_poza_zakresem_odrzucone() -> None:
    """Zakres (0; 1,3]: konstrukcja z wartoscia spoza zakresu jest odrzucona."""
    with pytest.raises(ValueError, match="zakresie"):
        WspolczynnikiObciazalnosciNN(
            srodowisko="powietrze",
            izolacja="PVC",
            temperatura_c=30.0,
            liczba_obwodow=1,
            rezystywnosc_gruntu_km_w=None,
            f_temperatura=1.31,
            f_rezystywnosc_gruntu=1.0,
            f_grupowanie=1.0,
            podstawa_temperatura="test",
            podstawa_rezystywnosc=None,
            podstawa_grupowanie="test",
        )


def test_zalozenie_pl_nn_niesie_rozbicie_i_srodowisko() -> None:
    """Slad WHITE BOX nN musi dac sie obronic: srodowisko, izolacja, obwody, wspolczynniki."""
    wynik = wspolczynniki_nn(
        srodowisko="grunt",
        izolacja="XLPE",
        temperatura_c=20.0,
        liczba_obwodow=1,
        rezystywnosc_gruntu_km_w=1.5,
    )
    zalozenie = wynik.zalozenie_pl()
    assert "grunt" in zalozenie
    assert "XLPE" in zalozenie
    assert "1,5" in zalozenie.replace(".", ",") or "1.5" in zalozenie
    assert "1,10" in zalozenie.replace(".", ",") or "1.1" in zalozenie

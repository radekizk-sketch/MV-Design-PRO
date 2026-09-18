"""Falsyfikacja obserwabli W6-A: czestotliwosc wezla i wielkosci zaciskow galezi.

TO NIE SA TESTY DEKLARACJI. Kazdy przypadek ma wynik oczekiwany wyprowadzony PRZED
uruchomieniem — z tozsamosci fazorowej albo z rachunku analitycznego ukladu — a na koncu
pliku stoi rodzina INIEKCJI: wariant kodu z konkretnym defektem i dowod, ze te testy go
zlapia. Test, ktory nie pada na zepsutej implementacji, niczego nie pilnuje.
"""

from __future__ import annotations

import cmath
import math

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    PunktPracy,
    SilnikDynamiki,
    SkokObciazenia,
    WejscieDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.obserwable import (
    JAKOSC_NIEDOSTEPNA,
    JAKOSC_OGRANICZONA,
    JAKOSC_WIARYGODNA,
    OPIS_JAKOSCI_PL,
    CzestotliwoscWezla,
    czestotliwosc_wezla,
    wielkosci_galezi,
)
from network_model.solvers.dynamika.siec import zloz_model_sieci

from tests.network_model.dynamika.uklady import (
    F_BAZOWA_HZ,
    S_BAZOWA_MVA,
    U_N_KV,
    X_LINII_PU,
    nastawy,
    zbuduj_smib,
)

#: Niepewnosc napiecia uzywana w testach jednostkowych czestotliwosci — WEJSCIE
#: funkcji, nie nastawa solvera (od korekty par. 5 niepewnosc jest mierzona).
NIEPEWNOSC_NAPIECIA = 1.0e-10


# ---------------------------------------------------------------------------
# F-1..F-5: czestotliwosc wezla — tozsamosci fazorowe (wynik znany przed biegiem)
# ---------------------------------------------------------------------------


def test_f1_stan_ustalony_daje_dokladnie_czestotliwosc_znamionowa() -> None:
    """Zerowa pochodna fazora => f = f_n CO DO BITU, bez wzgledu na modul i kat."""
    for modul, kat in ((1.0, 0.0), (0.93, 2.1), (1.07, -3.0)):
        wynik = czestotliwosc_wezla(
            modul * cmath.exp(1j * kat),
            0j,
            f_bazowa_hz=F_BAZOWA_HZ,
            niepewnosc_napiecia_pu=0.0,
            niepewnosc_pochodnej_pu_s=0.0,
        )
        assert wynik.f_hz == F_BAZOWA_HZ
        assert wynik.niepewnosc_hz == 0.0
        assert wynik.jakosc == JAKOSC_WIARYGODNA


@pytest.mark.parametrize("poslizg", [-0.02, -1e-4, 1e-4, 0.05])
def test_f2_jednostajny_obrot_wszystkich_fazorow_daje_f_n_razy_predkosc(poslizg: float) -> None:
    """F-2 (tozsamosc): `V_i = A_i e^{j(theta_i + s omega_0 t)}` => `f_i = f_n (1+s)`.

    To jest test UKLADU ODNIESIENIA. Gdyby kat solvera byl liczony w ukladzie
    nieruchomym, poprawny wzor nie mialby czlonu `f_n` i ten test padlby dla kazdego
    niezerowego poslizgu. Wynik NIE zalezy ani od modulu, ani od kata poczatkowego —
    dlatego sprawdzamy kilka roznych wezlow naraz.
    """
    omega_0 = 2.0 * math.pi * F_BAZOWA_HZ
    for modul, kat in ((1.0, 0.0), (0.88, 1.3), (1.04, -2.7)):
        napiecie = modul * cmath.exp(1j * kat)
        wynik = czestotliwosc_wezla(
            napiecie,
            1j * poslizg * omega_0 * napiecie,
            f_bazowa_hz=F_BAZOWA_HZ,
            niepewnosc_napiecia_pu=0.0,
            niepewnosc_pochodnej_pu_s=0.0,
        )
        assert wynik.f_hz == pytest.approx(F_BAZOWA_HZ * (1.0 + poslizg), rel=1e-12)


def test_f3_przejscie_kata_przez_pi_nie_tworzy_impulsu() -> None:
    """Zawijanie fazy nie istnieje w tej formulacji — i to jest sprawdzalne.

    Dwa fazory lezace po obu stronach granicy `+/-pi`, obracajace sie z ta sama
    predkoscia, musza dac te sama czestotliwosc. Estymator na roznicy katow dalby tutaj
    skok o `2 pi / dt`.
    """
    omega_0 = 2.0 * math.pi * F_BAZOWA_HZ
    poslizg = 0.01
    tuz_przed = cmath.exp(1j * (math.pi - 1e-9))
    tuz_za = cmath.exp(1j * (-math.pi + 1e-9))
    przed = czestotliwosc_wezla(
        tuz_przed,
        1j * poslizg * omega_0 * tuz_przed,
        f_bazowa_hz=F_BAZOWA_HZ,
        niepewnosc_napiecia_pu=0.0,
        niepewnosc_pochodnej_pu_s=0.0,
    )
    za = czestotliwosc_wezla(
        tuz_za,
        1j * poslizg * omega_0 * tuz_za,
        f_bazowa_hz=F_BAZOWA_HZ,
        niepewnosc_napiecia_pu=0.0,
        niepewnosc_pochodnej_pu_s=0.0,
    )
    assert przed.f_hz == pytest.approx(za.f_hz, rel=1e-12)
    assert przed.f_hz == pytest.approx(F_BAZOWA_HZ * (1.0 + poslizg), rel=1e-12)


def test_f4_zapad_do_zera_konczy_sie_stanem_niedostepnym_a_nie_liczba() -> None:
    """Fazor wewnatrz kuli niepewnosci => brak informacji o kacie.

    Wartosc nie jest po cichu podstawiana jako znamionowa: NIEPEWNOSC rowna sie wtedy
    calej czestotliwosci znamionowej, wiec nawet konsument ignorujacy kod jakosci widzi,
    ze liczba nic nie znaczy.
    """
    wynik = czestotliwosc_wezla(
        complex(NIEPEWNOSC_NAPIECIA / 2.0, 0.0),
        complex(1.0, 1.0),
        f_bazowa_hz=F_BAZOWA_HZ,
        niepewnosc_napiecia_pu=NIEPEWNOSC_NAPIECIA,
        niepewnosc_pochodnej_pu_s=0.0,
    )
    assert wynik.jakosc == JAKOSC_NIEDOSTEPNA
    assert wynik.niepewnosc_hz == F_BAZOWA_HZ


def test_f4b_pasmo_ograniczonej_wiarygodnosci_jest_wyprowadzone_a_nie_zgadniete() -> None:
    """Podstawienie wzorow daje granice `|V| = 3 * u_V` — i tak sie zachowuje kod.

    `|Vdot| = s omega_0 |V|`, wiec przy `u_Vdot = 0` niepewnosc to `3 s f_n u_V / |V|`, a
    odchylka to `s f_n`. Warunek `u > odchylka` sprowadza sie do `|V| < 3 u_V` — BEZ
    zadnej dobranej liczby i BEZ progu napieciowego (OD-36). Test sprawdza OBIE strony
    granicy, wiec nie przechodzi dla funkcji, ktora zawsze zwraca ten sam stan.

    KOREKTA W6-A par. 5: wczesniejsza wersja tego testu przypinala granice `|V| = 4 tol`,
    bo niepewnosc napiecia byla ZAKLADANA rowna tolerancji Newtona. To zalozenie zostalo
    obalone pomiarem (blad napiecia jest `J^-1 r`, nie `r`), wiec granica jest dzis
    wyrazona w MIERZONEJ niepewnosci, a wspolczynnik spadl z 4 do 3 — zniknal czlon,
    ktory pochodzil z zalozenia o proporcjonalnosci bledu pochodnej.
    """
    niepewnosc_napiecia = 1.0e-8
    omega_0 = 2.0 * math.pi * F_BAZOWA_HZ
    poslizg = 1.0e-3
    for modul, oczekiwany in (
        (2.0 * niepewnosc_napiecia, JAKOSC_OGRANICZONA),
        (8.0 * niepewnosc_napiecia, JAKOSC_WIARYGODNA),
    ):
        napiecie = complex(modul, 0.0)
        wynik = czestotliwosc_wezla(
            napiecie,
            1j * poslizg * omega_0 * napiecie,
            f_bazowa_hz=F_BAZOWA_HZ,
            niepewnosc_napiecia_pu=niepewnosc_napiecia,
            niepewnosc_pochodnej_pu_s=0.0,
        )
        assert wynik.jakosc == oczekiwany, f"modul {modul}"


def test_kody_jakosci_sa_zamknietym_zbiorem_z_opisem() -> None:
    """Deklaracja „zamkniety zbior kodow" ma przypiety test (regula KLASA par. 4)."""
    assert set(OPIS_JAKOSCI_PL) == {JAKOSC_WIARYGODNA, JAKOSC_OGRANICZONA, JAKOSC_NIEDOSTEPNA}
    assert len({JAKOSC_WIARYGODNA, JAKOSC_OGRANICZONA, JAKOSC_NIEDOSTEPNA}) == 3


# ---------------------------------------------------------------------------
# B-1..B-7: wielkosci zaciskow galezi — rachunek analityczny
# ---------------------------------------------------------------------------


def _model_dwuwezlowy(
    *, b_poprzeczna_pu: float = 0.0, przekladnia: complex = 1 + 0j, y_szeregowa_pu: complex
):
    galaz = GalazDynamiki(
        ident="L1",
        wezel_od="A",
        wezel_do="B",
        y_szeregowa_pu=y_szeregowa_pu,
        b_poprzeczna_pu=b_poprzeczna_pu,
        przekladnia=przekladnia,
    )
    model = zloz_model_sieci((WezelDynamiki("A", U_N_KV), WezelDynamiki("B", U_N_KV)), (galaz,), ())
    return model, galaz


def test_b1_galaz_bezstratna_ma_zerowy_bilans_mocy_i_przeciwne_prady() -> None:
    """Reaktancja czysta: `s_od + s_do = 0` DOKLADNIE, `i_od = -i_do`."""
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / complex(0.0, X_LINII_PU))
    napiecia = np.array([1.05 * cmath.exp(1j * 0.25), complex(1.0, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    assert wynik.i_do_pu == pytest.approx(-wynik.i_od_pu, rel=1e-12)
    assert (wynik.s_od_pu + wynik.s_do_pu).real == pytest.approx(0.0, abs=1e-12)


def test_b2_galaz_rezystancyjna_ma_strate_rowna_kwadratowi_pradu() -> None:
    """`Re(s_od + s_do) = |i|^2 R` — wartosc policzona niezaleznie od kodu produktu."""
    rezystancja = 0.08
    reaktancja = 0.2
    impedancja = complex(rezystancja, reaktancja)
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / impedancja)
    napiecia = np.array([1.04 * cmath.exp(1j * 0.18), complex(1.0, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    prad_oczekiwany = (napiecia[0] - napiecia[1]) / impedancja
    strata_oczekiwana = abs(prad_oczekiwany) ** 2 * rezystancja
    assert wynik.i_od_pu == pytest.approx(prad_oczekiwany, rel=1e-12)
    assert (wynik.s_od_pu + wynik.s_do_pu).real == pytest.approx(strata_oczekiwana, rel=1e-10)


def test_b3_odwrocenie_przeplywu_zmienia_znak_mocy_a_nie_orientacji() -> None:
    """Kierunek przeplywu zmienia ZNAK `Re(s_od)`; orientacja `od -> do` zostaje.

    Orientacja jest wlasnoscia GALEZI (wezel_od/wezel_do), nie chwilowego kierunku —
    gdyby kod liczyl ja z biezacego przeplywu, ten test by tego nie wykryl... dlatego
    sprawdzamy oba znaki PRZY TEJ SAMEJ definicji galezi.
    """
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / complex(0.02, 0.2))
    naprzod = np.array([1.05 * cmath.exp(1j * 0.2), complex(1.0, 0.0)], dtype=complex)
    wstecz = np.array([complex(1.0, 0.0), 1.05 * cmath.exp(1j * 0.2)], dtype=complex)
    assert wielkosci_galezi(model, galaz, naprzod).s_od_pu.real > 0.0
    assert wielkosci_galezi(model, galaz, wstecz).s_od_pu.real < 0.0


def test_b4_galaz_wylaczona_nie_przewodzi() -> None:
    """Galaz poza zbiorem aktywnych: oba prady i obie moce DOKLADNIE zerowe."""
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / complex(0.0, X_LINII_PU))
    model_bez = zloz_model_sieci(model.wezly, model.galezie, (), galezie_aktywne=frozenset())
    napiecia = np.array([1.05 * cmath.exp(1j * 0.25), complex(1.0, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model_bez, galaz, napiecia)
    assert wynik.i_od_pu == 0j
    assert wynik.i_do_pu == 0j
    assert wynik.s_od_pu == 0j
    assert wynik.s_do_pu == 0j


def test_b5_susceptancja_poprzeczna_rozjezdza_prady_zaciskow() -> None:
    """Model pi: `i_od != -i_do` o prad ladowania; polowa susceptancji na zacisk."""
    b_calkowite = 0.12
    y_szeregowa = 1.0 / complex(0.0, X_LINII_PU)
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=y_szeregowa, b_poprzeczna_pu=b_calkowite)
    napiecia = np.array([complex(1.0, 0.0), complex(1.0, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    # Przy rownych napieciach prad szeregowy znika, zostaje samo ladowanie polowa b.
    assert wynik.i_od_pu == pytest.approx(complex(0.0, b_calkowite / 2.0), rel=1e-12)
    assert wynik.i_do_pu == pytest.approx(complex(0.0, b_calkowite / 2.0), rel=1e-12)


def test_b6_transformator_z_przekladnia_zgadza_sie_z_wzorami_ybus() -> None:
    """Przekladnia zespolona: wartosci policzone niezaleznie ze wzorow modelu pi."""
    przekladnia = 1.025 * cmath.exp(1j * (math.pi / 6.0))
    y_szeregowa = 1.0 / complex(0.01, 0.1)
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=y_szeregowa, przekladnia=przekladnia)
    napiecia = np.array([1.03 * cmath.exp(1j * 0.12), complex(1.0, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    modul_kwadrat = abs(przekladnia) ** 2
    i_od_oczekiwany = (
        napiecia[0] * y_szeregowa / modul_kwadrat
        - (napiecia[1] * y_szeregowa) / przekladnia.conjugate()
    )
    i_do_oczekiwany = -(napiecia[0] * y_szeregowa) / przekladnia + napiecia[1] * y_szeregowa
    assert wynik.i_od_pu == pytest.approx(i_od_oczekiwany, rel=1e-12)
    assert wynik.i_do_pu == pytest.approx(i_do_oczekiwany, rel=1e-12)


def test_b7_moc_zacisku_jest_iloczynem_napiecia_i_sprzezonego_pradu() -> None:
    """Konwencja `S = V conj(I)` — sprawdzana WPROST, bo pomylka sprzezenia odwraca Q."""
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / complex(0.03, 0.25))
    napiecia = np.array([1.02 * cmath.exp(1j * 0.3), 0.99 * cmath.exp(-1j * 0.05)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    assert wynik.s_od_pu == pytest.approx(napiecia[0] * wynik.i_od_pu.conjugate(), rel=1e-12)
    assert wynik.s_do_pu == pytest.approx(napiecia[1] * wynik.i_do_pu.conjugate(), rel=1e-12)


# ---------------------------------------------------------------------------
# Poziom BIEGU: F-2 na ukladzie wyspowym i B-8 parytet chwili zerowej
# ---------------------------------------------------------------------------


def _wyspa_maszyna_odbior(delta_p_pu: float) -> WejscieDynamiki:
    """Wyspa: maszyna na GEN, odbior o stalej mocy na ODB, jedna galaz miedzy nimi.

    BRAK SZYNY SZTYWNEJ — czestotliwosc wyspy wyznacza WYLACZNIE maszyna. Skok obciazenia
    w `t = 0,2 s` wytraca uklad z rownowagi, wiec predkosc wirnika odjezdza od jedynki i
    tozsamosc `f_i = f_n * omega` przestaje byc trywialna.
    """
    napiecie_odb = complex(1.0, 0.0)
    p_odbioru_pu, q_odbioru_pu = 0.5, 0.1
    prad = complex(p_odbioru_pu, -q_odbioru_pu) / napiecie_odb.conjugate()
    napiecie_gen = napiecie_odb + complex(0.0, X_LINII_PU) * prad
    return WejscieDynamiki(
        wezly=(WezelDynamiki("GEN", U_N_KV), WezelDynamiki("ODB", U_N_KV)),
        galezie=(
            GalazDynamiki(
                ident="LINIA",
                wezel_od="GEN",
                wezel_do="ODB",
                y_szeregowa_pu=1.0 / complex(0.0, X_LINII_PU),
                b_poprzeczna_pu=0.0,
                przekladnia=complex(1.0, 0.0),
            ),
        ),
        odsprzegi=(),
        odbiory=(OdbiorDynamiki(ident="ODB1", wezel="ODB", p_pu=p_odbioru_pu, q_pu=q_odbioru_pu),),
        urzadzenia=(zbuduj_smib().maszyna,),
        punkt_pracy=PunktPracy(
            napiecia_pu={"GEN": napiecie_gen, "ODB": napiecie_odb},
            moce_zrodel_pu={"G1": napiecie_gen * prad.conjugate()},
        ),
        harmonogram=HarmonogramDynamiki(
            zdarzenia=(
                SkokObciazenia(t_s=0.2, odbior="ODB1", delta_p_pu=delta_p_pu, delta_q_pu=0.0),
            )
        ),
        nastawy=nastawy(horyzont_s=1.0, krok_wyjscia_s=0.02),
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
    )


def test_f2_bieg_wyspowy_kazda_szyna_czyta_czestotliwosc_maszyny() -> None:
    """F-2 NA BIEGU: w wyspie z jednym zrodlem KAZDA szyna ma `f = f_n * omega` maszyny.

    Miedzy zdarzeniami sila elektromotoryczna i moc mechaniczna maszyny klasycznej sa
    stale, a odbior o stalej mocy jest ekwiwariantny wzgledem obrotu, wiec caly uklad
    fazorow obraca sie sztywno z katem wirnika. Tozsamosc jest wiec DOKLADNA, nie
    przyblizona — i lamie sie natychmiast, gdy z formuly zniknie czlon `f_n` albo gdy
    kat solvera zostanie potraktowany jako kat w ukladzie nieruchomym.
    """
    wynik = SilnikDynamiki(wejscie=_wyspa_maszyna_odbior(delta_p_pu=0.15)).uruchom()
    omega = wynik.probki["omega_pu@G1"]
    assert max(abs(wartosc - 1.0) for wartosc in omega) > 1.0e-4, "skok nie wytracil predkosci"
    for ident in ("GEN", "ODB"):
        szereg = wynik.probki[f"f_hz@{ident}"]
        assert len(szereg) == len(omega)
        for chwila, (f_hz, omega_pu) in enumerate(zip(szereg, omega, strict=True)):
            assert f_hz == pytest.approx(
                F_BAZOWA_HZ * omega_pu, rel=1e-6
            ), f"szyna {ident}, probka {chwila}"


def test_f5_kazda_probka_biegu_ze_zdarzeniem_jest_skonczona_i_ma_kod_jakosci() -> None:
    """Zdarzenie nieciagle nie produkuje wartosci spoza zbioru ani kodu spoza slownika."""
    wynik = SilnikDynamiki(wejscie=_wyspa_maszyna_odbior(delta_p_pu=0.3)).uruchom()
    dozwolone = set(OPIS_JAKOSCI_PL)
    for ident in ("GEN", "ODB"):
        for f_hz in wynik.probki[f"f_hz@{ident}"]:
            assert math.isfinite(f_hz)
        for niepewnosc in wynik.probki[f"u_f_hz@{ident}"]:
            assert math.isfinite(niepewnosc) and niepewnosc >= 0.0
        for kod in wynik.probki[f"jakosc_f@{ident}"]:
            assert kod in dozwolone


def test_b8_parytet_chwili_zerowej_z_punktem_pracy() -> None:
    """B-8: w `t = 0` wielkosci zaciskow galezi zgadzaja sie z punktem pracy rozpływu.

    Punkt pracy ukladu SMIB jest policzony z fazorow (`uklady.zbuduj_smib`), wiec prad
    galezi w chwili zerowej jest znany PRZED biegiem. Rozjazd tutaj oznacza, ze cala
    reszta przebiegu opisuje inny uklad niz ten, ktory projektant wybral.
    """
    uklad = zbuduj_smib()
    wejscie = uklad.wejscie(HarmonogramDynamiki(zdarzenia=()), nastawy(horyzont_s=0.1))
    wynik = SilnikDynamiki(wejscie=wejscie).uruchom()

    napiecie_gen = uklad.punkt_pracy.napiecia_pu["GEN"]
    napiecie_sys = uklad.punkt_pracy.napiecia_pu["SYS"]
    prad_oczekiwany = (napiecie_gen - napiecie_sys) / complex(0.0, X_LINII_PU)
    moc_oczekiwana = napiecie_gen * prad_oczekiwany.conjugate()

    assert wynik.probki["i_od_pu@LINIA"][0] == pytest.approx(abs(prad_oczekiwany), rel=1e-8)
    assert wynik.probki["p_od_pu@LINIA"][0] == pytest.approx(moc_oczekiwana.real, rel=1e-8)
    assert wynik.probki["q_od_pu@LINIA"][0] == pytest.approx(moc_oczekiwana.imag, abs=1e-8)
    assert wynik.probki["f_hz@GEN"][0] == pytest.approx(F_BAZOWA_HZ, abs=1e-9)


# ---------------------------------------------------------------------------
# INIEKCJE: dowod, ze powyzsze testy lapia konkretne defekty
# ---------------------------------------------------------------------------


def test_iniekcja_brak_czlonu_czestotliwosci_znamionowej_jest_wykrywalna() -> None:
    """Defekt: `f = (1/2pi) dtheta/dt` bez `f_n` (kat wziety jako kat ukladu nieruchomego)."""
    omega_0 = 2.0 * math.pi * F_BAZOWA_HZ
    poslizg = 0.02
    napiecie = 1.02 * cmath.exp(1j * 0.4)
    pochodna = 1j * poslizg * omega_0 * napiecie
    poprawne = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_BAZOWA_HZ,
        niepewnosc_napiecia_pu=0.0,
        niepewnosc_pochodnej_pu_s=0.0,
    ).f_hz
    zepsute = (pochodna * napiecie.conjugate()).imag / abs(napiecie) ** 2 / (2.0 * math.pi)
    assert poprawne == pytest.approx(F_BAZOWA_HZ * (1.0 + poslizg), rel=1e-12)
    assert abs(poprawne - zepsute) == pytest.approx(F_BAZOWA_HZ, rel=1e-9)


def test_iniekcja_estymator_roznicowy_na_siatce_wyjscia_daje_impuls_przy_zawinieciu() -> None:
    """Defekt: pochodna z roznicy katow probek — na granicy `+/-pi` daje wartosc absurdalna.

    Ten test nie sprawdza produktu; dowodzi, ze test F-3 rozroznia obie implementacje.
    """
    krok_wyjscia_s = 0.01
    kat_przed = math.pi - 1e-9
    kat_po = -math.pi + 1e-9
    zepsute_hz = F_BAZOWA_HZ + (kat_po - kat_przed) / (2.0 * math.pi * krok_wyjscia_s)
    assert abs(zepsute_hz - F_BAZOWA_HZ) > 90.0


def test_iniekcja_zamiana_zaciskow_galezi_jest_wykrywalna() -> None:
    """Defekt: `i_do` policzony wzorem `i_od` (odwrocona orientacja)."""
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / complex(0.03, 0.22))
    napiecia = np.array([1.05 * cmath.exp(1j * 0.22), complex(0.99, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    zepsute_s_do = napiecia[1] * wynik.i_od_pu.conjugate()
    assert abs(zepsute_s_do - wynik.s_do_pu) > 1.0e-3


def test_iniekcja_bledne_sprzezenie_odwraca_znak_mocy_biernej() -> None:
    """Defekt: `S = V * I` zamiast `V * conj(I)` — znak `Q` sie odwraca."""
    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=1.0 / complex(0.03, 0.22))
    napiecia = np.array([1.05 * cmath.exp(1j * 0.22), complex(0.99, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    zepsute = napiecia[0] * wynik.i_od_pu
    assert wynik.s_od_pu.imag != pytest.approx(zepsute.imag, abs=1e-6)


def test_iniekcja_polowa_susceptancji_pominieta_jest_wykrywalna() -> None:
    """Defekt: caly `b` zamiast `b/2` na zacisk — test B-5 pada."""
    b_calkowite = 0.12
    model, galaz = _model_dwuwezlowy(
        y_szeregowa_pu=1.0 / complex(0.0, X_LINII_PU), b_poprzeczna_pu=b_calkowite
    )
    napiecia = np.array([complex(1.0, 0.0), complex(1.0, 0.0)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    assert wynik.i_od_pu.imag == pytest.approx(b_calkowite / 2.0, rel=1e-12)
    assert wynik.i_od_pu.imag != pytest.approx(b_calkowite, rel=1e-6)


# ---------------------------------------------------------------------------
# RUNDA DOMKNIECIA W6-A (2026-09-18): F-6, pokrycie niepewnosci, semantyka
# granicy zdarzenia, iloczyn cech galezi, zbieznosc != wiarygodnosc
# ---------------------------------------------------------------------------


def test_f6_trajektoria_zadana_analitycznie_jest_odtworzona_co_do_szostej_cyfry() -> None:
    """F-6: `V(t) = A(t) e^{j theta(t)}` o ZNANEJ pochodnej kata, zbudowane poza solverem.

    Ani fazor, ani jego pochodna, ani wartosc oczekiwana nie przechodza przez kod
    produkcyjny: `A`, `theta` i ich pochodne sa wypisane recznie, a `Vdot` zlozone ze
    wzoru `Vdot = (A' + j A theta') e^{j theta}`. Test sprawdza wiec, czy implementacja
    odtwarza ZADANA z gory pochodna kata, a nie czy jest zgodna sama ze soba.

    Trajektoria jest celowo niestacjonarna w OBU skladowych (modul faluje, kat ma
    czlon kwadratowy i oscylacyjny), wiec czlon `A'` nie moze zniknac bez sladu —
    implementacja mylaca `Im(Vdot conj(V))` z `|Vdot|` albo gubiaca dzielenie przez
    `|V|^2` pada tu natychmiast.
    """
    for t in (0.0, 0.13, 0.5, 1.7, 3.3):
        amplituda = 1.0 + 0.3 * math.sin(5.0 * t)
        amplituda_prim = 1.5 * math.cos(5.0 * t)
        kat = 0.4 * t * t - 0.7 * math.cos(3.0 * t)
        kat_prim = 0.8 * t + 2.1 * math.sin(3.0 * t)
        obrot = cmath.exp(1j * kat)
        napiecie = amplituda * obrot
        pochodna = (amplituda_prim + 1j * amplituda * kat_prim) * obrot
        wynik = czestotliwosc_wezla(
            napiecie,
            pochodna,
            f_bazowa_hz=F_BAZOWA_HZ,
            niepewnosc_napiecia_pu=0.0,
            niepewnosc_pochodnej_pu_s=0.0,
        )
        assert wynik.f_hz == pytest.approx(
            F_BAZOWA_HZ + kat_prim / (2.0 * math.pi), rel=1e-12
        ), f"t={t}"


def _uklad_z_odbiorem(p_odbioru_pu: float) -> tuple[object, ...]:
    """Maszyna — linia — odbior o stalej mocy tuz przed nosem krzywej PV.

    `P_max = E^2 / (2 X)` dla `E = 1,10` i `X = 0,60` wynosi 1,0083, wiec `P = 1,0079`
    lezy w ostatnim promilu obciazalnosci: Newton wciaz zbiega, ale `J^-1` jest tam o
    rzad wielkosci wieksze niz w punkcie znamionowym. To jest wlasnie przypadek, w
    ktorym „zbiegl" nie znaczy „wiarygodny".
    """
    from network_model.solvers.dynamika.urzadzenia.maszyna_klasyczna import MaszynaKlasyczna

    model = zloz_model_sieci(
        (WezelDynamiki("A", U_N_KV), WezelDynamiki("B", U_N_KV)),
        (
            GalazDynamiki(
                ident="L1",
                wezel_od="A",
                wezel_do="B",
                y_szeregowa_pu=1.0 / complex(0.0, 0.30),
                b_poprzeczna_pu=0.0,
                przekladnia=complex(1.0, 0.0),
            ),
        ),
        (),
    )
    odbiory = (OdbiorDynamiki(ident="O1", wezel="B", p_pu=p_odbioru_pu, q_pu=0.0),)
    maszyna = MaszynaKlasyczna(
        ident="G1",
        wezel="A",
        h_s=3.5,
        d_pu=0.0,
        x_prim_pu=0.30,
        ra_pu=0.0,
        omega_bazowa_rad_s=2.0 * math.pi * F_BAZOWA_HZ,
    )
    stany = (np.array([0.0, 1.002, p_odbioru_pu, 1.10], dtype=float),)
    return model, odbiory, (maszyna,), stany


def test_niepewnosc_ogranicza_rzeczywisty_blad_takze_blisko_granicy_obciazalnosci() -> None:
    """P0 W6-A par. 5: `u_f` MUSI ograniczac blad czestotliwosci, nie tylko go udawac.

    METODA. Ten sam punkt pracy rozwiazujemy dwa razy: z tolerancja badana i z tolerancja
    o osiem rzedow ciasniejsza. Roznica czestotliwosci miedzy rozwiazaniami to RZECZYWISTY
    blad przy tolerancji badanej. Niepewnosc zameldowana przy tolerancji badanej musi go
    pokryc.

    HISTORIA. Przed korekta z 2026-09-18 niepewnosc byla liczona z SAMEJ TOLERANCJI
    Newtona. W tym punkcie dawalo to `u = 5,07e-07 Hz` przy rzeczywistym bledzie
    `1,24e-06 Hz` (iloraz 2,45) i przy kodzie jakosci „wiarygodna" — czyli liczbe
    zanizona 2,45 raza, przedstawiona jako pewna. Zrodlem bledu bylo zalozenie
    `u_V = ||r||`, podczas gdy blad rozwiazania to `J^-1 r`; w tym punkcie wzmocnienie
    wynosi 8,4x. Test jest przypiety do KONKRETNEGO punktu, zeby regresja modelu jakosci
    byla wykrywalna, a nie rozmyta w usrednieniu.
    """
    from network_model.solvers.dynamika.obserwable import pochodna_napiec_z_niepewnoscia
    from network_model.solvers.dynamika.siec import rozwiaz_algebre

    wspolne = {"max_iteracji": 400, "max_nawrotow": 90, "t_s": 0.0}

    def czestotliwosci(
        model, odbiory, urzadzenia, stany, napiecia: np.ndarray
    ) -> list[CzestotliwoscWezla]:
        pomiar = pochodna_napiec_z_niepewnoscia(model, odbiory, urzadzenia, stany, napiecia)
        return [
            czestotliwosc_wezla(
                complex(napiecia[i]),
                complex(pomiar.pochodna_pu_s[i]),
                f_bazowa_hz=F_BAZOWA_HZ,
                niepewnosc_napiecia_pu=float(pomiar.niepewnosc_napiecia_pu[i]),
                niepewnosc_pochodnej_pu_s=float(pomiar.niepewnosc_pochodnej_pu_s[i]),
            )
            for i in range(model.liczba_wezlow)
        ]

    # DWA rozlaczne rezimy bledu, bo skladniki niepewnosci dominuja w roznych punktach:
    #  * P = 1,0079 ze startu 0,70 — dominuje blad NAPIECIA (`|J^-1 r|`, wzmocnienie 8,4x),
    #  * P = 0,99 ze startu 1,00   — dominuje blad POCHODNEJ (jakobian zlozony w punkcie
    #    obarczonym bledem); pominiecie tego czlonu niedoszacowuje niepewnosc 1,83 raza.
    # Jeden punkt nie pilnuje obu — to jest KLASA defektu, nie jego instancja.
    for p_odbioru_pu, start_modul, tolerancje in (
        (1.0079, 0.70, (1.0e-4, 1.0e-5, 1.0e-6)),
        (0.99, 1.00, (1.0e-4, 1.0e-5, 1.0e-6)),
    ):
        model, odbiory, urzadzenia, stany = _uklad_z_odbiorem(p_odbioru_pu)
        start = np.array([complex(1.0, 0.0), complex(start_modul, -0.25)], dtype=complex)
        for tolerancja in tolerancje:
            badany = rozwiaz_algebre(
                model, odbiory, urzadzenia, stany, start, tolerancja=tolerancja, **wspolne
            )
            odniesienie = rozwiaz_algebre(
                model, odbiory, urzadzenia, stany, badany.napiecia, tolerancja=1.0e-14, **wspolne
            )
            zmierzone = czestotliwosci(model, odbiory, urzadzenia, stany, badany.napiecia)
            scisle = czestotliwosci(model, odbiory, urzadzenia, stany, odniesienie.napiecia)
            for pozycja, ident in enumerate(model.identy_wezlow):
                blad_hz = abs(zmierzone[pozycja].f_hz - scisle[pozycja].f_hz)
                assert zmierzone[pozycja].niepewnosc_hz >= blad_hz, (
                    f"P={p_odbioru_pu}, start={start_modul}, tolerancja {tolerancja:g}, "
                    f"szyna {ident}: niepewnosc {zmierzone[pozycja].niepewnosc_hz:.3e} Hz "
                    f"NIE pokrywa bledu {blad_hz:.3e} Hz"
                )


def test_niepewnosc_rosnie_gdy_jakobian_algebry_staje_sie_gorzej_uwarunkowany() -> None:
    """Model jakosci MUSI reagowac na uwarunkowanie, inaczej jest ozdoba.

    Ten sam uklad przy tej samej tolerancji, raz w polowie obciazalnosci, raz w ostatnim
    promilu. Zmierzona niepewnosc napiecia — `|J^-1 r|` — musi byc w punkcie blizszym
    granicy WIEKSZA. Test pada dla kazdej implementacji, ktora zwraca wielkosc zalezna
    wylacznie od tolerancji.
    """
    from network_model.solvers.dynamika.obserwable import pochodna_napiec_z_niepewnoscia
    from network_model.solvers.dynamika.siec import rozwiaz_algebre
    from network_model.solvers.dynamika.urzadzenia.maszyna_klasyczna import MaszynaKlasyczna

    def niepewnosc_napiecia(p_odbioru_pu: float) -> float:
        model = zloz_model_sieci(
            (WezelDynamiki("A", U_N_KV), WezelDynamiki("B", U_N_KV)),
            (
                GalazDynamiki(
                    ident="L1",
                    wezel_od="A",
                    wezel_do="B",
                    y_szeregowa_pu=1.0 / complex(0.0, 0.30),
                    b_poprzeczna_pu=0.0,
                    przekladnia=complex(1.0, 0.0),
                ),
            ),
            (),
        )
        odbiory = (OdbiorDynamiki(ident="O1", wezel="B", p_pu=p_odbioru_pu, q_pu=0.0),)
        urzadzenia = (
            MaszynaKlasyczna(
                ident="G1",
                wezel="A",
                h_s=3.5,
                d_pu=0.0,
                x_prim_pu=0.30,
                ra_pu=0.0,
                omega_bazowa_rad_s=2.0 * math.pi * F_BAZOWA_HZ,
            ),
        )
        stany = (np.array([0.0, 1.002, p_odbioru_pu, 1.10], dtype=float),)
        rozwiazanie = rozwiaz_algebre(
            model,
            odbiory,
            urzadzenia,
            stany,
            np.array([complex(1.0, 0.0), complex(0.70, -0.25)], dtype=complex),
            tolerancja=1.0e-4,
            max_iteracji=400,
            max_nawrotow=90,
            t_s=0.0,
        )
        pomiar = pochodna_napiec_z_niepewnoscia(
            model, odbiory, urzadzenia, stany, rozwiazanie.napiecia
        )
        return float(pomiar.niepewnosc_napiecia_pu.max())

    assert niepewnosc_napiecia(1.0079) > niepewnosc_napiecia(0.5)


def test_jakobian_osobliwy_konczy_sie_odmowa_nazwana_a_nie_bledem_scipy() -> None:
    """par. 6: „algebra zbiegla" nie jest dowodem, ze pochodna z niej istnieje.

    Wezel bez zadnej galezi, odsprzegu, odbioru i urzadzenia daje w Ybus wiersz i kolumne
    zerowa, wiec jakobian algebry jest OSOBLIWY. Wyznaczenie `dV/dt` musi wtedy skonczyc
    sie odmowa NAZWANA (kod kontraktu), a nie surowym `RuntimeError` z biblioteki
    rzadkiej algebry — bo tylko nazwana odmowa daje sie obsluzyc wyzej.
    """
    from network_model.solvers.dynamika.kontrakty import KOD_ALGEBRA_NIEZBIEZNA, OdmowaDynamiki
    from network_model.solvers.dynamika.obserwable import pochodna_napiec

    model = zloz_model_sieci((WezelDynamiki("SAM", U_N_KV),), (), ())
    with pytest.raises(OdmowaDynamiki) as odmowa:
        pochodna_napiec(model, (), (), (), np.array([complex(1.0, 0.0)], dtype=complex))
    assert odmowa.value.kod == KOD_ALGEBRA_NIEZBIEZNA


def _wyspa_z_druga_galezia(t_otwarcia_s: float) -> WejscieDynamiki:
    """Wyspa jak w F-2, ale z DRUGIM torem, ktory scenariusz otwiera w zadanej chwili.

    Punkt pracy liczony jest dla reaktancji ZASTEPCZEJ obu rownoleglych torow
    (`X_z = X * 2X / (X + 2X) = 2X/3`), bo inaczej zadany punkt nie jest rownowaga i
    bramka inicjalizacji — slusznie — odmawia biegu.
    """
    from network_model.solvers.dynamika import ZmianaGalezi

    napiecie_odb = complex(1.0, 0.0)
    p_odbioru_pu, q_odbioru_pu = 0.5, 0.1
    prad = complex(p_odbioru_pu, -q_odbioru_pu) / napiecie_odb.conjugate()
    reaktancja_zastepcza_pu = 2.0 * X_LINII_PU / 3.0
    napiecie_gen = napiecie_odb + complex(0.0, reaktancja_zastepcza_pu) * prad
    return WejscieDynamiki(
        wezly=(WezelDynamiki("GEN", U_N_KV), WezelDynamiki("ODB", U_N_KV)),
        galezie=(
            GalazDynamiki(
                ident="LINIA",
                wezel_od="GEN",
                wezel_do="ODB",
                y_szeregowa_pu=1.0 / complex(0.0, X_LINII_PU),
                b_poprzeczna_pu=0.0,
                przekladnia=complex(1.0, 0.0),
            ),
            GalazDynamiki(
                ident="LINIA2",
                wezel_od="GEN",
                wezel_do="ODB",
                y_szeregowa_pu=1.0 / complex(0.0, 2.0 * X_LINII_PU),
                b_poprzeczna_pu=0.0,
                przekladnia=complex(1.0, 0.0),
            ),
        ),
        odsprzegi=(),
        odbiory=(OdbiorDynamiki(ident="ODB1", wezel="ODB", p_pu=p_odbioru_pu, q_pu=q_odbioru_pu),),
        urzadzenia=(zbuduj_smib().maszyna,),
        punkt_pracy=PunktPracy(
            napiecia_pu={"GEN": napiecie_gen, "ODB": napiecie_odb},
            moce_zrodel_pu={"G1": napiecie_gen * prad.conjugate()},
        ),
        harmonogram=HarmonogramDynamiki(
            zdarzenia=(ZmianaGalezi(t_s=t_otwarcia_s, galaz="LINIA2", zalaczona=False),)
        ),
        nastawy=nastawy(horyzont_s=0.6, krok_wyjscia_s=0.02),
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
    )


def test_z1_probka_w_chwili_zdarzenia_jest_granica_prawostronna() -> None:
    """par. 7: kontrakt probki w chwili `t_e` to granica PRAWOSTRONNA — jawnie i z testem.

    Silnik wykonuje zdarzenie i reinicjalizuje algebre PRZED pobraniem probki, wiec probka
    w chwili zdarzenia opisuje siec PO zmianie. Galaz otwarta w `t_e` musi wiec w tej samej
    probce miec prad DOKLADNIE zerowy, a w probce poprzedniej — niezerowy. Bez tego zapisu
    konsument nie wie, czy `t_e` czyta stan sprzed, czy po lączeniu.
    """
    t_otwarcia_s = 0.20
    wynik = SilnikDynamiki(wejscie=_wyspa_z_druga_galezia(t_otwarcia_s)).uruchom()
    os_czasu = list(wynik.os_czasu_s)
    indeks = min(range(len(os_czasu)), key=lambda pozycja: abs(os_czasu[pozycja] - t_otwarcia_s))
    assert os_czasu[indeks] == pytest.approx(
        t_otwarcia_s, abs=1e-12
    ), "brak probki w chwili zdarzenia"

    prad_w_chwili = wynik.probki["i_od_pu@LINIA2"][indeks]
    prad_przed = wynik.probki["i_od_pu@LINIA2"][indeks - 1]
    assert prad_w_chwili == 0.0, "probka w chwili zdarzenia czyta stan SPRZED laczenia"
    assert prad_przed > 1.0e-3, "drugi tor nie przewodzil przed otwarciem — scenariusz pusty"
    for przyrostek in ("i_do_pu", "p_od_pu", "q_od_pu", "p_do_pu", "q_do_pu"):
        assert wynik.probki[f"{przyrostek}@LINIA2"][indeks] == 0.0


def test_z2_iniekcja_rozniczkowanie_przez_nieciaglosc_daje_impuls() -> None:
    """par. 7 / M-04: dowod, ze tor analityczny NIE rozniczkuje przez granice zdarzenia.

    Bierzemy TEN SAM bieg i liczymy czestotliwosc dwiema drogami: kanalem `f_hz@`
    (rozniczkowanie rownania algebraicznego) oraz roznica wsteczna katow `kat_deg@` po
    siatce wyjscia — czyli tak, jak zrobilby to konsument bez dostepu do rdzenia. W chwili
    otwarcia galezi kat skacze, wiec estymator roznicowy produkuje IMPULS, a kanal
    analityczny nie. Rozjazd jest dowodem rozdzielnosci obu drog; jego brak oznaczalby,
    ze kanal analityczny jest w istocie roznica probek.
    """
    t_otwarcia_s = 0.20
    wynik = SilnikDynamiki(wejscie=_wyspa_z_druga_galezia(t_otwarcia_s)).uruchom()
    os_czasu = list(wynik.os_czasu_s)
    indeks = min(range(len(os_czasu)), key=lambda pozycja: abs(os_czasu[pozycja] - t_otwarcia_s))
    katy = wynik.probki["kat_deg@ODB"]
    krok_s = os_czasu[indeks] - os_czasu[indeks - 1]
    roznicowa_hz = F_BAZOWA_HZ + math.radians(katy[indeks] - katy[indeks - 1]) / (
        2.0 * math.pi * krok_s
    )
    analityczna_hz = wynik.probki["f_hz@ODB"][indeks]
    assert abs(roznicowa_hz - F_BAZOWA_HZ) > 10.0 * abs(analityczna_hz - F_BAZOWA_HZ), (
        "estymator roznicowy nie wyprodukowal impulsu na granicy zdarzenia — "
        "scenariusz nie cwiczy nieciaglosci"
    )
    assert abs(analityczna_hz - F_BAZOWA_HZ) < 1.0, "kanal analityczny niesie impuls zdarzenia"


def test_b9_przekladnia_i_susceptancja_naraz_zgadzaja_sie_ze_wzorami_ybus() -> None:
    """ILOCZYN CECH (regula KLASA par. 2): przekladnia zespolona RAZEM z susceptancja.

    Test B-6 cwiczyl przekladnie przy `b = 0`, a B-5 susceptancje przy `a = 1`. Defekt
    mieszczacy sie dokladnie w ich iloczynie — polowa susceptancji podzielona przez
    `|a|^2` albo nie — nie mial gdzie sie pokazac. Wartosci oczekiwane wypisane sa tu ze
    wzorow modelu pi, nie z implementacji.
    """
    przekladnia = 0.975 * cmath.exp(-1j * (math.pi / 9.0))
    y_szeregowa = 1.0 / complex(0.02, 0.18)
    b_poprzeczna = 0.26
    model, galaz = _model_dwuwezlowy(
        y_szeregowa_pu=y_szeregowa, b_poprzeczna_pu=b_poprzeczna, przekladnia=przekladnia
    )
    napiecia = np.array([1.04 * cmath.exp(1j * 0.21), 0.97 * cmath.exp(-1j * 0.08)], dtype=complex)
    wynik = wielkosci_galezi(model, galaz, napiecia)

    polowa = complex(0.0, b_poprzeczna / 2.0)
    modul_kwadrat = abs(przekladnia) ** 2
    i_od_oczekiwany = (
        napiecia[0] * (y_szeregowa + polowa) / modul_kwadrat
        - (napiecia[1] * y_szeregowa) / przekladnia.conjugate()
    )
    i_do_oczekiwany = -(napiecia[0] * y_szeregowa) / przekladnia + napiecia[1] * (
        y_szeregowa + polowa
    )
    assert wynik.i_od_pu == pytest.approx(i_od_oczekiwany, rel=1e-12)
    assert wynik.i_do_pu == pytest.approx(i_do_oczekiwany, rel=1e-12)


def test_b10_bilans_zaciskow_rowna_sie_stratom_galezi() -> None:
    """`S_od + S_do` to STRATA galezi — czesc czynna dodatnia, bierna zgodna z modelem.

    Dla galezi bez przekladni i bez susceptancji strata czynna rowna sie `|I|^2 R`, a
    bierna `|I|^2 X`; przy wlaczonej susceptancji dochodzi generacja bierna obu polowek,
    wiec czesc bierna bilansu maleje o `(|V_od|^2 + |V_do|^2) b/2`. Obie tozsamosci sa
    wypisane ze wzorow, nie odczytane z implementacji.
    """
    y_szeregowa = 1.0 / complex(0.04, 0.22)
    napiecia = np.array([1.03 * cmath.exp(1j * 0.17), 0.98 * cmath.exp(-1j * 0.06)], dtype=complex)

    model, galaz = _model_dwuwezlowy(y_szeregowa_pu=y_szeregowa)
    wynik = wielkosci_galezi(model, galaz, napiecia)
    prad_szeregowy = (napiecia[0] - napiecia[1]) * y_szeregowa
    impedancja = 1.0 / y_szeregowa
    bilans = wynik.s_od_pu + wynik.s_do_pu
    assert bilans.real == pytest.approx(abs(prad_szeregowy) ** 2 * impedancja.real, rel=1e-10)
    assert bilans.imag == pytest.approx(abs(prad_szeregowy) ** 2 * impedancja.imag, rel=1e-10)
    assert bilans.real > 0.0

    b_poprzeczna = 0.18
    model_b, galaz_b = _model_dwuwezlowy(y_szeregowa_pu=y_szeregowa, b_poprzeczna_pu=b_poprzeczna)
    wynik_b = wielkosci_galezi(model_b, galaz_b, napiecia)
    bilans_b = wynik_b.s_od_pu + wynik_b.s_do_pu
    generacja_bierna = (abs(napiecia[0]) ** 2 + abs(napiecia[1]) ** 2) * b_poprzeczna / 2.0
    assert bilans_b.real == pytest.approx(bilans.real, rel=1e-10)
    assert bilans_b.imag == pytest.approx(bilans.imag - generacja_bierna, rel=1e-10)

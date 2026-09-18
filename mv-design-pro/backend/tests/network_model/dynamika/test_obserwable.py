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

TOLERANCJA_ALGEBRY = 1.0e-10


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
            tolerancja_algebry=TOLERANCJA_ALGEBRY,
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
            tolerancja_algebry=TOLERANCJA_ALGEBRY,
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
        tolerancja_algebry=TOLERANCJA_ALGEBRY,
    )
    za = czestotliwosc_wezla(
        tuz_za,
        1j * poslizg * omega_0 * tuz_za,
        f_bazowa_hz=F_BAZOWA_HZ,
        tolerancja_algebry=TOLERANCJA_ALGEBRY,
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
        complex(TOLERANCJA_ALGEBRY / 2.0, 0.0),
        complex(1.0, 1.0),
        f_bazowa_hz=F_BAZOWA_HZ,
        tolerancja_algebry=TOLERANCJA_ALGEBRY,
    )
    assert wynik.jakosc == JAKOSC_NIEDOSTEPNA
    assert wynik.niepewnosc_hz == F_BAZOWA_HZ


def test_f4b_pasmo_ograniczonej_wiarygodnosci_jest_wyprowadzone_a_nie_zgadniete() -> None:
    """Podstawienie wzorow daje granice `|V| = 4 * tolerancja` — i tak sie zachowuje kod.

    `|Vdot| = s omega_0 |V|`, wiec `u = 4 s f_n tol / |V|`, a odchylka to `s f_n`. Warunek
    `u > odchylka` sprowadza sie do `|V| < 4 tol` — BEZ zadnej dobranej liczby. Test
    sprawdza OBIE strony granicy, wiec nie przechodzi dla funkcji, ktora zawsze zwraca
    ten sam stan.
    """
    tolerancja = 1.0e-8
    omega_0 = 2.0 * math.pi * F_BAZOWA_HZ
    poslizg = 1.0e-3
    for modul, oczekiwany in (
        (2.0 * tolerancja, JAKOSC_OGRANICZONA),
        (8.0 * tolerancja, JAKOSC_WIARYGODNA),
    ):
        napiecie = complex(modul, 0.0)
        wynik = czestotliwosc_wezla(
            napiecie,
            1j * poslizg * omega_0 * napiecie,
            f_bazowa_hz=F_BAZOWA_HZ,
            tolerancja_algebry=tolerancja,
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
        napiecie, pochodna, f_bazowa_hz=F_BAZOWA_HZ, tolerancja_algebry=TOLERANCJA_ALGEBRY
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

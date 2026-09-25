"""Sprzezenie sieciowe: Ybus, rozwiazanie algebry, niezalezne residuum KCL."""

from __future__ import annotations

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    WezelDynamiki,
    residuum_kcl_niezalezne,
    rozwiaz_algebre,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.kontrakty import KOD_ALGEBRA_NIEZBIEZNA, KOD_SIEC_NIESPOJNA
from network_model.solvers.dynamika.odbiory import (
    jakobian_pradu_mocy as jakobian_pradu_odbioru,
)
from network_model.solvers.dynamika.odbiory import (
    prad_mocy_pu as prad_odbioru_pu,
)
from network_model.solvers.dynamika.siec import (
    jakobian_algebry,
    przezloz,
    residuum_algebry,
)

from tests.network_model.dynamika.uklady import (
    nastawy,
    zbuduj_smib,
    zbuduj_smib_z_odbiorem,
)

WEZLY = (WezelDynamiki("A", 15.0), WezelDynamiki("B", 15.0))


def _galaz(przekladnia: complex = complex(1.0, 0.0), b: float = 0.0) -> GalazDynamiki:
    return GalazDynamiki(
        ident="L",
        wezel_od="A",
        wezel_do="B",
        y_szeregowa_pu=1.0 / complex(0.02, 0.2),
        b_poprzeczna_pu=b,
        przekladnia=przekladnia,
        aktywna_na_starcie=True,
        rodzaj="linia",
    )


def test_ybus_modelu_pi_bez_przekladni() -> None:
    """Klasyczny model pi: `Y_ff = y + jb/2`, `Y_ft = -y`."""
    galaz = _galaz(b=0.06)
    model = zloz_model_sieci(WEZLY, (galaz,), ())
    macierz = model.ybus.toarray()
    y = galaz.y_szeregowa_pu
    polowa = complex(0.0, 0.03)
    assert macierz[0, 0] == pytest.approx(y + polowa)
    assert macierz[1, 1] == pytest.approx(y + polowa)
    assert macierz[0, 1] == pytest.approx(-y)
    assert macierz[1, 0] == pytest.approx(-y)


def test_ybus_z_przekladnia_zespolona() -> None:
    """Przekladnia zespolona `a`: `Y_ff = (y+jb/2)/|a|^2`, `Y_ft = -y/conj(a)`, `Y_tf = -y/a`."""
    a = complex(1.05, 0.12)
    galaz = _galaz(przekladnia=a, b=0.04)
    macierz = zloz_model_sieci(WEZLY, (galaz,), ()).ybus.toarray()
    y = galaz.y_szeregowa_pu
    polowa = complex(0.0, 0.02)
    assert macierz[0, 0] == pytest.approx((y + polowa) / abs(a) ** 2)
    assert macierz[1, 1] == pytest.approx(y + polowa)
    assert macierz[0, 1] == pytest.approx(-y / a.conjugate())
    assert macierz[1, 0] == pytest.approx(-y / a)
    assert macierz[0, 1] != pytest.approx(macierz[1, 0])


def test_odsprzeg_wchodzi_na_przekatna() -> None:
    model = zloz_model_sieci(
        WEZLY,
        (_galaz(),),
        (OdsprzegDynamiki("BAT", "B", g_pu=0.01, b_pu=0.5, aktywna_na_starcie=True),),
    )
    bez = zloz_model_sieci(WEZLY, (_galaz(),), ())
    roznica = model.ybus.toarray() - bez.ybus.toarray()
    assert roznica[1, 1] == pytest.approx(complex(0.01, 0.5))
    assert np.allclose(np.delete(np.delete(roznica, 1, 0), 1, 1), 0.0)


def test_zlozenie_od_nowa_czyni_zwarcie_zalozone_i_zdjete_tozsamym() -> None:
    """Zalozenie i zdjecie zwarcia MUSI wrocic do macierzy wyjsciowej BIT W BIT.

    Gdyby stan topologii powstawal przyrostowo (dodaj admitancje, potem odejmij),
    roznica zaokraglen zostawialaby siec „prawie taka sama", a odcisk topologii
    przestalby odpowiadac topologii.
    """
    model = zloz_model_sieci(WEZLY, (_galaz(),), ())
    ze_zwarciem = przezloz(model, admitancje_zwarc=(("B", complex(0.0, -50.0)),))
    bez_zwarcia = przezloz(ze_zwarciem, admitancje_zwarc=())
    assert np.array_equal(bez_zwarcia.ybus.toarray(), model.ybus.toarray())


def test_wylaczenie_i_zalaczenie_galezi_wraca_do_punktu_wyjscia() -> None:
    model = zloz_model_sieci(WEZLY, (_galaz(),), ())
    bez_galezi = przezloz(model, galezie_aktywne=frozenset())
    assert np.array_equal(bez_galezi.ybus.toarray(), np.zeros((2, 2), dtype=complex))
    z_powrotem = przezloz(bez_galezi, galezie_aktywne=frozenset({"L"}))
    assert np.array_equal(z_powrotem.ybus.toarray(), model.ybus.toarray())


def test_galaz_do_nieistniejacego_wezla_jest_odmawiana() -> None:
    galaz = GalazDynamiki(
        "L", "A", "NIE_MA", 1.0 / complex(0.0, 0.2), 0.0, complex(1.0, 0.0), True, "linia"
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        zloz_model_sieci(WEZLY, (galaz,), ())
    assert blad.value.kod == KOD_SIEC_NIESPOJNA


def test_powtorzony_ident_wezla_jest_odmawiany() -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        zloz_model_sieci((WEZLY[0], WEZLY[0]), (), ())
    assert blad.value.kod == KOD_SIEC_NIESPOJNA


def test_zerowa_przekladnia_jest_odmawiana() -> None:
    galaz = _galaz(przekladnia=complex(0.0, 0.0))
    with pytest.raises(OdmowaDynamiki) as blad:
        zloz_model_sieci(WEZLY, (galaz,), ())
    assert blad.value.kod == KOD_SIEC_NIESPOJNA


def test_prad_odbioru_odpowiada_pobranej_mocy() -> None:
    napiecie = complex(0.98, 0.07)
    prad = prad_odbioru_pu(0.4, 0.2, napiecie)
    assert napiecie * prad.conjugate() == pytest.approx(complex(-0.4, -0.2))


def test_jakobian_odbioru_zgodny_z_roznica_skonczona() -> None:
    """Pochodna pradu odbioru PQ liczona analitycznie musi zgadzac sie z roznica."""
    napiecie = complex(0.93, -0.12)
    analityczny = jakobian_pradu_odbioru(0.4, 0.2, napiecie)
    krok = 1.0e-7
    for os in (0, 1):
        przesuniecie = complex(krok, 0.0) if os == 0 else complex(0.0, krok)
        w_gore = prad_odbioru_pu(0.4, 0.2, napiecie + przesuniecie)
        w_dol = prad_odbioru_pu(0.4, 0.2, napiecie - przesuniecie)
        numeryczny = np.array([(w_gore - w_dol).real, (w_gore - w_dol).imag]) / (2.0 * krok)
        assert np.allclose(analityczny[:, os], numeryczny, atol=1e-5)


def test_jakobian_algebry_zgodny_z_roznica_skonczona() -> None:
    """Pelny jakobian `g_y` (siec + urzadzenia + odbior) wobec roznicy skonczonej."""
    uklad = zbuduj_smib_z_odbiorem()
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    urzadzenia = (uklad.maszyna, uklad.szyna)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in urzadzenia
    )
    napiecia = np.array([complex(1.01, 0.08), complex(0.99, -0.02)], dtype=complex)
    analityczny = jakobian_algebry(model, uklad.odbiory, urzadzenia, stany, napiecia).toarray()

    krok = 1.0e-7
    numeryczny = np.zeros_like(analityczny)
    for kolumna in range(4):
        przesuniecie = np.zeros(2, dtype=complex)
        if kolumna < 2:
            przesuniecie[kolumna] = complex(krok, 0.0)
        else:
            przesuniecie[kolumna - 2] = complex(0.0, krok)
        w_gore = residuum_algebry(model, uklad.odbiory, urzadzenia, stany, napiecia + przesuniecie)
        w_dol = residuum_algebry(model, uklad.odbiory, urzadzenia, stany, napiecia - przesuniecie)
        numeryczny[:, kolumna] = (w_gore - w_dol) / (2.0 * krok)
    assert np.allclose(analityczny, numeryczny, atol=1e-5)


def test_newton_zbiega_z_punktu_pracy_w_zero_iteracji() -> None:
    """Punkt pracy z rozpływu JUZ spelnia `g = 0` — Newton nie ma czego poprawiac."""
    uklad = zbuduj_smib()
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    urzadzenia = (uklad.maszyna, uklad.szyna)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in urzadzenia
    )
    napiecia = np.array(
        [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow], dtype=complex
    )
    wynik = rozwiaz_algebre(
        model,
        (),
        urzadzenia,
        stany,
        napiecia,
        tolerancja=1e-10,
        max_iteracji=20,
        max_nawrotow=10,
        t_s=0.0,
    )
    assert wynik.iteracje == 0
    assert wynik.residuum < 1e-14
    assert residuum_kcl_niezalezne(model, (), urzadzenia, stany, wynik.napiecia) < 1e-14


def test_residuum_kcl_jest_liczone_niezaleznie_od_ybus() -> None:
    """Bilans KCL zbudowany element po elemencie zgadza sie z residuum przez Ybus.

    Obie drogi dzialaja na TYM SAMYM stanie, ale zadna nie uzywa wynikow drugiej —
    zgodnosc jest wiec dowodem zlozenia Ybus, a nie tautologia.
    """
    uklad = zbuduj_smib_z_odbiorem()
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    urzadzenia = (uklad.maszyna, uklad.szyna)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in urzadzenia
    )
    napiecia = np.array([complex(1.03, 0.05), complex(0.98, -0.01)], dtype=complex)
    przez_ybus = residuum_algebry(model, uklad.odbiory, urzadzenia, stany, napiecia)
    element_po_elemencie = residuum_kcl_niezalezne(
        model, uklad.odbiory, urzadzenia, stany, napiecia
    )
    assert element_po_elemencie == pytest.approx(
        float(np.max(np.abs(przez_ybus[:2] + 1j * przez_ybus[2:]))), rel=1e-9
    )


def test_glebokie_zwarcie_z_odbiorem_stalej_mocy_konczy_sie_odmowa() -> None:
    """Granica waznosci modelu PQ jest NAZWANA, nie ukryta.

    Odbior o stalej mocy zada pradu `I = conj(S)/conj(V)`, wiec przy zapadzie
    napiecia do zera uklad algebraiczny nie ma rozwiazania. Rdzen ma to
    zameldowac kodem, a nie zwrocic ostatnie przyblizenie.
    """
    uklad = zbuduj_smib_z_odbiorem(p_odbioru_pu=0.5)
    model = zloz_model_sieci(
        uklad.wezly,
        uklad.galezie,
        (),
        admitancje_zwarc=(("GEN", complex(0.0, -1.0e4)),),
    )
    urzadzenia = (uklad.maszyna, uklad.szyna)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in urzadzenia
    )
    napiecia = np.array(
        [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow], dtype=complex
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        rozwiaz_algebre(
            model,
            uklad.odbiory,
            urzadzenia,
            stany,
            napiecia,
            tolerancja=1e-12,
            max_iteracji=nastawy().max_iteracji_newtona,
            max_nawrotow=nastawy().max_nawrotow,
            t_s=0.5,
        )
    assert blad.value.kod == KOD_ALGEBRA_NIEZBIEZNA
    assert "residuum" in blad.value.szczegoly

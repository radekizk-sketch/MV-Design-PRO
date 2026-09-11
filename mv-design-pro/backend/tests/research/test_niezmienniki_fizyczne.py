"""Niezmienniki FIZYCZNE sprawdzane Z WYNIKU, nie z wnętrza solvera (§17).

PO CO TEN PLIK. Dotychczasowe testy sprawdzały, czy solver zgłasza zbieżność i
czy przebiegi „wyglądają" poprawnie. To są własności NUMERYCZNE. Symulacja może
zbiegać bezbłędnie i mimo to łamać prawo zachowania energii albo prawo prądowe
Kirchhoffa, jeśli błąd siedzi w RÓWNANIU, a nie w metodzie. Prawa zachowania są
jedynym testem, który tego nie przepuszcza — i jedynym, którego nie da się
spełnić przez dopasowanie tolerancji.

SPRAWDZANE Z WYNIKU, NIE ZE STANU WEWNĘTRZNEGO. Każdy test poniżej czyta
WYŁĄCZNIE `WynikDynamiczny` (plus topologię, która jest wejściem) i odtwarza
wielkości fizyczne samodzielnie. Gdyby czytał wnętrze solvera, sprawdzałby, czy
solver zgadza się sam ze sobą. Dlatego wynik musi nieść KĄT napięcia — bez fazy
nie policzy się ani rozpływu w gałęziach, ani bilansu mocy.

CZWORO PRAW, KAŻDE INNEJ NATURY:
  1. prawo prądowe Kirchhoffa           — algebra sieci,
  2. bilans mocy czynnej                — zachowanie energii w sieci,
  3. tożsamość mocy maszyny             — spójność modelu dq z zaciskami,
  4. równanie ruchu (swing)             — całkowanie mechaniki wirnika,
  5. bilans energii magazynu            — spójność SOC z oddaną mocą.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.konwencje import OMEGA_S
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)
from dynamic_lab.urzadzenia_oze import MagazynEnergiiBESS
from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny

S_BAZOWA_MVA = 100.0


def _napiecia_zespolone(wynik: WynikDynamiczny, szyny: tuple[str, ...]) -> np.ndarray:
    """Macierz ``[chwila, szyna]`` napięć zespolonych odtworzona Z WYNIKU."""
    moduly = np.array([wynik.sygnal("u_pu", s).wartosci for s in szyny])
    katy = np.array([wynik.sygnal("u_kat_rad", s).wartosci for s in szyny])
    return (moduly * np.exp(1j * katy)).T


def _seria(wynik: WynikDynamiczny, klucz: str, ref: str, przestrzen=None) -> np.ndarray:
    return np.array(wynik.sygnal(klucz, ref, przestrzen).wartosci, dtype=np.float64)


# ---------------------------------------------------------------------------
# Układ badany: generator z regulatorami, odbiór i falownik — bez zdarzeń,
# żeby topologia wyniku była jednoznaczna (prawa zachowania nie zależą od
# zdarzeń, a zmienna topologia wymagałaby odtwarzania Ybus per chwila).
# ---------------------------------------------------------------------------


def _topologia() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("GEN", "MID", "DER", "SYS"),
        galezie=[
            Galaz("GEN", "MID", 0.010, 0.080, b_poprzeczna_pu=0.02),
            Galaz("MID", "DER", 0.020, 0.060, b_poprzeczna_pu=0.01),
            Galaz("MID", "SYS", 0.008, 0.050, b_poprzeczna_pu=0.03),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def _model_i_dyspozycja():
    zespol = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(
            ref="G1", szyna="GEN", h_s=4.0, d_tlumienie=1.0, ra_pu=0.005
        ),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )
    odbior = OdbiorStalejMocy(ref="ODB", szyna="MID", p_pu=-0.5, q_pu=-0.12)
    falownik = FalownikGFL(ref="DER", szyna="DER", s_zn_pu=0.6, i_max_pu=0.8)
    model = ModelDynamiczny(topologia=_topologia(), urzadzenia=[zespol, odbior, falownik])
    dyspozycja = {
        "G1": complex(0.35, 0.15),
        "ODB": complex(-0.5, -0.12),
        "DER": complex(0.25, 0.03),
    }
    return model, dyspozycja, zespol


@pytest.fixture(scope="module")
def bieg() -> tuple[WynikDynamiczny, ModelDynamiczny, ZespolSynchroniczny, SilnikRMS]:
    """Bieg z REALNYM przejściem, ale o NIEZMIENNEJ topologii.

    Zaburzeniem jest SKOK DYSPOZYCJI falownika po inicjalizacji, nie zwarcie:
    prawa zachowania odtwarzane są tu z jednej macierzy ``Ybus``, a zdarzenie
    topologiczne wymagałoby odtwarzania jej dla każdej chwili osobno. Fizycznie
    to jest to samo zaburzenie z punktu widzenia bilansu — zmienia rozpływ, kąty
    i prędkość wirnika.

    Bieg BEZ zaburzenia byłby testem pustym: w stanie ustalonym każda równość
    zachodzi trywialnie, bo wszystko stoi.
    """
    model, dyspozycja, zespol = _model_i_dyspozycja()
    silnik = SilnikRMS(model, integrator="trapez_niejawny", krok_s=0.002)
    x0 = silnik.inicjalizuj(dyspozycja)
    falownik = next(u for u in model.urzadzenia if u.ref == "DER")
    falownik.p_ref_pu = 0.55
    falownik.q_ref_pu = -0.10
    wynik = silnik.symuluj(x0, czas_koncowy_s=1.0)
    assert wynik.diagnostyka.kazdy_krok_scisle_zbiezny
    return wynik, model, zespol, silnik


# ---------------------------------------------------------------------------
# 1. PRAWO PRĄDOWE KIRCHHOFFA
# ---------------------------------------------------------------------------


def test_prawo_pradowe_kirchhoffa_w_kazdej_chwili(bieg) -> None:
    """``Ybus @ V = I_wstrzyk`` na KAŻDEJ szynie nie-sztywnej i w KAŻDEJ chwili.

    Szyny sztywne są wyłączone świadomie: dla nich równanie węzłowe zastępuje się
    ``V = V_zadane``, a niezbilansowany prąd jest wstrzyknięciem systemu
    nadrzędnego — czyli wielkością WYNIKOWĄ, nie residuum.
    """
    wynik, model, _, _ = bieg
    topologia = model.topologia
    szyny = topologia.szyny
    idx = topologia.indeks
    ybus = topologia.zbuduj_ybus()
    v = _napiecia_zespolone(wynik, szyny)

    # Wstrzyknięcia odtworzone z mocy zapisanej w wyniku: I = conj(S/V).
    i_wstrzyk = np.zeros_like(v)
    for u in model.urzadzenia:
        kolumna = idx[u.szyna]
        s = _seria(wynik, "p_pu", u.ref, PrzestrzenSygnalu.WYJSCIE) + 1j * _seria(
            wynik, "q_pu", u.ref, PrzestrzenSygnalu.WYJSCIE
        )
        i_wstrzyk[:, kolumna] += np.conj(s / v[:, kolumna])

    residuum = v @ ybus.T - i_wstrzyk
    ruchome = [i for i, s in enumerate(szyny) if s not in topologia.szyny_sztywne]
    maks = float(np.max(np.abs(residuum[:, ruchome])))
    # Próg wynika z DRABINY TOLERANCJI: solver sieci pracuje z 1e-12, a wynik
    # niesie moduł i kąt zaokrąglone do reprezentacji float, więc odtworzenie
    # prądu z (P, Q, |V|, arg V) traci kilka cyfr na dzieleniu zespolonym.
    assert maks < 1.0e-9, f"max |Ybus·V - I| = {maks:.3e}"


# ---------------------------------------------------------------------------
# 2. BILANS MOCY CZYNNEJ
# ---------------------------------------------------------------------------


def test_bilans_mocy_czynnej_sieci(bieg) -> None:
    """Suma mocy wstrzykniętych (z systemem) = straty w gałęziach, w każdej chwili.

    Straty liczone są z prądów GAŁĘZIOWYCH odtworzonych z napięć, a wstrzyknięcia
    — z mocy zapisanych w wyniku plus wstrzyknięcie szyny sztywnej policzone z
    ``Ybus``. Dwie niezależne drogi do tej samej liczby; gdyby model gubił albo
    produkował moc, rozjechałyby się.
    """
    wynik, model, _, _ = bieg
    topologia = model.topologia
    szyny = topologia.szyny
    idx = topologia.indeks
    ybus = topologia.zbuduj_ybus()
    v = _napiecia_zespolone(wynik, szyny)

    # Wstrzyknięcie sieci: pełny wektor z Ybus (obejmuje też szyny sztywne).
    i_siec = v @ ybus.T
    s_wstrzyk_z_sieci = v * np.conj(i_siec)
    p_suma = np.sum(s_wstrzyk_z_sieci.real, axis=1)

    # Straty: szeregowe R|I|² + poprzeczne G|V|² (tu G = 0, susceptancje nie grzeją).
    straty = np.zeros(len(wynik.czas_s))
    for g in topologia.galezie:
        if not g.zalaczona:
            continue
        y = g.admitancja_szeregowa()
        i_g = (v[:, idx[g.od_szyny]] - v[:, idx[g.do_szyny]]) * y
        straty += g.r_pu * np.abs(i_g) ** 2

    maks = float(np.max(np.abs(p_suma - straty)))
    assert maks < 1.0e-9, f"max |ΣP - straty| = {maks:.3e}"


def test_moce_urzadzen_zgadzaja_sie_ze_wstrzyknieciem_sieciowym(bieg) -> None:
    """Moc ZAPISANA per urządzenie = moc, którą sieć widzi na tej szynie.

    To jest ogniwo łączące dwa poprzednie testy: gdyby zbieracz zapisywał moc
    innego urządzenia albo innej chwili, oba prawa nadal by się domykały (bo
    liczone z napięć), a wynik i tak byłby fałszywy.
    """
    wynik, model, _, _ = bieg
    topologia = model.topologia
    idx = topologia.indeks
    ybus = topologia.zbuduj_ybus()
    v = _napiecia_zespolone(wynik, topologia.szyny)
    s_sieci = v * np.conj(v @ ybus.T)

    for szyna in topologia.szyny:
        if szyna in topologia.szyny_sztywne:
            continue
        z_urzadzen = np.zeros(len(wynik.czas_s), dtype=np.complex128)
        for u in model.urzadzenia:
            if u.szyna != szyna:
                continue
            z_urzadzen += _seria(wynik, "p_pu", u.ref, PrzestrzenSygnalu.WYJSCIE) + 1j * _seria(
                wynik, "q_pu", u.ref, PrzestrzenSygnalu.WYJSCIE
            )
        maks = float(np.max(np.abs(z_urzadzen - s_sieci[:, idx[szyna]])))
        assert maks < 1.0e-9, f"{szyna}: {maks:.3e}"


# ---------------------------------------------------------------------------
# 3. TOŻSAMOŚĆ MOCY MASZYNY
# ---------------------------------------------------------------------------


def test_moc_w_szczelinie_rowna_mocy_na_zaciskach_plus_straty_stojana(bieg) -> None:
    """``Pe = P_zacisków + Ra·|I|²`` — model dq musi zgadzać się z zaciskami.

    Model liczy ``Pe = Vd·Id + Vq·Iq + Ra·(Id²+Iq²)`` w osiach maszyny, a sieć
    widzi ``Re(V·conj(I))`` w ramie sieci. Równość obu obowiązuje z definicji
    transformacji dq — jeżeli przestanie, znaczy to, że kąt transformacji albo
    znak którejś składowej jest błędny. Takiego błędu NIE widać w przebiegu:
    trajektoria pozostaje gładka i zbieżna.
    """
    wynik, model, zespol, _ = bieg
    maszyna = zespol.maszyna
    v = _napiecia_zespolone(wynik, model.topologia.szyny)
    kolumna = model.topologia.indeks[maszyna.szyna]

    delta = _seria(wynik, "delta_rad", "G1", PrzestrzenSygnalu.STAN)
    e_q = _seria(wynik, "e_q_prim_pu", "G1", PrzestrzenSygnalu.STAN)
    e_d = _seria(wynik, "e_d_prim_pu", "G1", PrzestrzenSygnalu.STAN)
    p_zaciski = _seria(wynik, "p_pu", "G1", PrzestrzenSygnalu.WYJSCIE)

    omega = _seria(wynik, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
    pe = np.zeros_like(p_zaciski)
    strata_stojana = np.zeros_like(p_zaciski)
    for k in range(len(p_zaciski)):
        stan = np.array([delta[k], omega[k], e_q[k], e_d[k]], dtype=np.float64)
        i_d, i_q, _, _ = maszyna.prady_dq(
            float(e_d[k]), float(e_q[k]), complex(v[k, kolumna]), float(delta[k])
        )
        pe[k] = maszyna.moc_elektryczna(stan, complex(v[k, kolumna]))
        strata_stojana[k] = maszyna.ra_pu * (i_d**2 + i_q**2)

    maks = float(np.max(np.abs(pe - (p_zaciski + strata_stojana))))
    assert maks < 1.0e-9, f"max |Pe - (P_zacisk + Ra|I|²)| = {maks:.3e}"
    # Strata stojana MUSI być niezerowa, inaczej test przechodzi trywialnie.
    assert float(np.min(strata_stojana)) > 0.0


# ---------------------------------------------------------------------------
# 4. RÓWNANIE RUCHU WIRNIKA
# ---------------------------------------------------------------------------


def test_rownanie_ruchu_zgadza_sie_z_trajektoria(bieg) -> None:
    """``d(delta)/dt = OMEGA_S·(omega - 1)`` odtworzone różnicami centralnymi.

    Prawa strona bierze się ze stanu ZAPISANEGO, lewa — z pochodnej ZAPISANEJ
    trajektorii. Błąd jest rzędu metody (tu trapezy, ``O(dt²)``), więc próg jest
    wyprowadzony z kroku, a nie dobrany tak, żeby przeszło.
    """
    wynik, _, _, silnik = bieg
    czas = np.array(wynik.czas_s)
    delta = _seria(wynik, "delta_rad", "G1", PrzestrzenSygnalu.STAN)
    omega = _seria(wynik, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
    dt = float(czas[1] - czas[0])

    pochodna_num = (delta[2:] - delta[:-2]) / (2.0 * dt)
    pochodna_row = OMEGA_S * (omega[1:-1] - 1.0)
    blad = float(np.max(np.abs(pochodna_num - pochodna_row)))
    # Różnica centralna jest dokładna do O(dt²); przy dt = 2 ms i skali
    # |d³δ/dt³| rzędu 10² daje to margines rzędu 1e-3.
    assert blad < 1.0e-3, f"max |Δδ/Δt - ω_s(ω-1)| = {blad:.3e} przy dt = {dt}"
    # Trajektoria MUSI być nietrywialna, inaczej równość jest pusta.
    assert float(np.max(np.abs(omega - 1.0))) > 1.0e-6


# ---------------------------------------------------------------------------
# 5. BILANS ENERGII MAGAZYNU
# ---------------------------------------------------------------------------


def test_soc_magazynu_zgadza_sie_z_calka_oddanej_mocy() -> None:
    """``ΔSOC·E·3600 = -∫P·S_base dt`` — SOC nie może dryfować niezależnie od mocy.

    To jest jedyne miejsce w laboratorium, gdzie p.u. spotyka się z jednostkami
    mianowanymi, więc błąd współczynnika (3600, baza mocy, znak) daje wynik
    wyglądający poprawnie i fizycznie fałszywy. Całka liczona trapezami z
    przebiegu ZAPISANEGO, nie ze stanu solvera.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="MID",
        e_pojemnosc_mwh=2.0,
        s_bazowa_mva=S_BAZOWA_MVA,
        s_falownika_pu=1.0,
        soc_poczatkowy=0.6,
        p_ref_pu=0.4,
    )
    topologia = TopologiaSieci(
        szyny=("MID", "SYS"),
        galezie=[Galaz("MID", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(
        topologia=topologia,
        urzadzenia=[magazyn, OdbiorStalejMocy(ref="ODB", szyna="MID", p_pu=-0.4, q_pu=-0.05)],
    )
    silnik = SilnikRMS(model, integrator="trapez_niejawny", krok_s=0.002)
    x0 = silnik.inicjalizuj({"BAT": complex(0.4, 0.0), "ODB": complex(-0.4, -0.05)})
    wynik = silnik.symuluj(x0, czas_koncowy_s=5.0)

    czas = np.array(wynik.czas_s)
    soc = _seria(wynik, "soc", "BAT", PrzestrzenSygnalu.STAN)
    p_oddana = _seria(wynik, "p_pu", "BAT", PrzestrzenSygnalu.WYJSCIE)

    energia_mws = float(np.trapz(p_oddana, czas)) * S_BAZOWA_MVA
    delta_soc_z_energii = -energia_mws / (3600.0 * magazyn.e_pojemnosc_mwh)
    delta_soc_z_przebiegu = float(soc[-1] - soc[0])

    assert delta_soc_z_przebiegu < 0.0, "magazyn oddający moc musi się rozładowywać"
    assert delta_soc_z_przebiegu == pytest.approx(delta_soc_z_energii, rel=1.0e-6)
    # Zmiana MUSI być mierzalna, inaczej zgodność jest zgodnością dwóch zer.
    assert abs(delta_soc_z_przebiegu) > 1.0e-4

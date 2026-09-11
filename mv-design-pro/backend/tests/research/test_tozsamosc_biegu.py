"""Bieg jest identyfikowany przez PEŁNE zagadnienie początkowe (§2 rundy 3).

Symulacja dynamiczna rozwiązuje

    ẋ = f(x, y, p, u, t),   0 = g(x, y, p, u, t),   x(0) = x₀,  y(0) = y₀

więc tożsamość biegu musi obejmować komplet: migawkę sieci, definicję modelu,
dyspozycję, punkt pracy rozpływu, ``x0``, ``y0/V0``, konfigurację solvera,
harmonogram, horyzont i bazy.

DEFEKT PRZED NAPRAWĄ. ``_odcisk_scenariusza`` budował ``PunktPracy()`` ze
wszystkimi osiami nieznanymi i nie wiązał tożsamości ani z ``moce_zadane``, ani
z ``x0``, ani z ``V0``. Ta sama sieć przy ``P_G = 0,2`` i ``P_G = 0,9`` dawała
więc TEN SAM odcisk scenariusza, choć to dwa różne zagadnienia dynamiczne.

OSIE MUSZĄ POZOSTAĆ ROZDZIELNE. Brakującego punktu pracy nie wolno „przemycić"
do odcisku MODELU: definicja modelu i punkt pracy to dwie niezależne osie i
mieszanie ich odbiera możliwość odpowiedzi na pytanie „czy to ten sam model
w innym punkcie pracy, czy inny model".
"""

from __future__ import annotations

import numpy as np
from dynamic_lab.benchmarki import smib
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZwarcieTrojfazowe


def _bieg(*, p_gen: float = 0.6, krok_s: float = 0.005, zdarzenia=(), x0_delta: float = 0.0):
    model, moce = smib(h_s=4.0, x_linii_pu=0.15)
    moce = {ref: complex(p_gen, moc.imag) for ref, moc in moce.items()}
    silnik = SilnikRMS(model, integrator="rk4", krok_s=krok_s)
    x0 = silnik.inicjalizuj(moce)
    if x0_delta:
        x0 = x0.copy()
        x0[0] += x0_delta
    return silnik.symuluj(x0, czas_koncowy_s=0.2, harmonogram=HarmonogramZdarzen(list(zdarzenia)))


def test_rozny_punkt_pracy_daje_rozna_tozsamosc_biegu() -> None:
    """Ten sam model, ta sama sieć, to samo zdarzenie — INNA dyspozycja."""
    a = _bieg(p_gen=0.2)
    b = _bieg(p_gen=0.9)
    assert a.odcisk_scenariusza != b.odcisk_scenariusza
    assert a.odcisk_wyniku() != b.odcisk_wyniku()


def test_punkt_pracy_nie_zmienia_odcisku_TOPOLOGII() -> None:
    """Osie rozdzielne: inny punkt pracy to nadal TA SAMA sieć."""
    assert _bieg(p_gen=0.2).odcisk_topologii == _bieg(p_gen=0.9).odcisk_topologii


def test_punkt_pracy_nie_zmienia_odcisku_MODELU() -> None:
    """Punktu pracy NIE wolno przemycić do tożsamości modelu.

    Gdyby dyspozycja wpływała na odcisk parametrów modelu, pytanie „ten sam model
    w innym punkcie pracy czy inny model?" przestałoby mieć odpowiedź.
    """
    a = {m.element_ref: m.odcisk_parametrow for m in _bieg(p_gen=0.2).modele}
    b = {m.element_ref: m.odcisk_parametrow for m in _bieg(p_gen=0.9).modele}
    assert a == b, "dyspozycja wyciekła do tożsamości modelu"


def test_zmiana_kroku_zmienia_tozsamosc_biegu() -> None:
    """``dt`` jest nastawą numeryczną, ale nadal częścią tożsamości biegu."""
    assert _bieg(krok_s=0.005).odcisk_scenariusza != _bieg(krok_s=0.002).odcisk_scenariusza


def test_zmiana_x0_zmienia_tozsamosc_biegu() -> None:
    """``x0`` jest warunkiem początkowym — inny warunek to inne zagadnienie."""
    assert _bieg().odcisk_scenariusza != _bieg(x0_delta=1.0e-3).odcisk_scenariusza


def test_zmiana_harmonogramu_zmienia_tozsamosc_biegu() -> None:
    bez = _bieg()
    ze = _bieg(zdarzenia=[ZwarcieTrojfazowe(czas_s=0.1, szyna="GEN", x_f_pu=0.05)])
    assert bez.odcisk_scenariusza != ze.odcisk_scenariusza


def test_to_samo_zagadnienie_daje_ten_sam_odcisk() -> None:
    """Strona pozytywna — bez niej powyższe przechodziłyby przy odcisku losowym."""
    a, b = _bieg(p_gen=0.55), _bieg(p_gen=0.55)
    assert a.odcisk_scenariusza == b.odcisk_scenariusza
    assert a.odcisk_wyniku() == b.odcisk_wyniku()


def test_dyspozycja_nastawy_x0_i_v0_sa_w_wejsciu_zagadnienia() -> None:
    """Inwariant konstrukcyjny: KOMPLET wejścia zagadnienia, nie wybrana podlista.

    Zagadnienie brzmi ``ẋ = f(x, y, p, u, t)``, ``0 = g(...)``, ``x(0)=x₀``,
    ``y(0)=y₀`` — więc tożsamość biegu musi znać wszystkie cztery człony.

    AKTUALIZACJA (§5 audytu rundy 3): doszło ``nastawy``, i to nie jest dodatek
    kosmetyczny. ``dyspozycja`` to moce zadane w chwili ``inicjalizuj``;
    ``nastawy`` to wartości OBOWIĄZUJĄCE w chwili startu symulacji. Rozróżnienie
    jest konieczne, bo scenariusz „limit eksportu zaczyna wiązać" zmienia
    ``RegulatorElektrowniPPC.p_zadane_pu`` PO inicjalizacji — wartość zapamiętana
    przy starcie nie opisuje wtedy biegu, który się wykona.

    Nastawy wypadły jednocześnie z tożsamości MODELU (inaczej inicjalizacja
    zmieniałaby model). Obie konsekwencje pochodzą z JEDNEJ deklaracji przy polu,
    więc nie da się mieć jednej bez drugiej.
    """
    model, moce = smib(h_s=4.0, x_linii_pu=0.15)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj(moce)
    wejscie = silnik._wejscie_zagadnienia_poczatkowego(x0)
    assert set(wejscie) == {"dyspozycja", "nastawy", "x0", "v0"}
    assert wejscie["dyspozycja"], "dyspozycja pusta — tożsamość nie zna wejścia"
    assert len(wejscie["x0"]) == len(x0)
    assert len(wejscie["v0"]) == len(model.topologia.szyny)
    assert all(np.isfinite(v) for v in wejscie["x0"])
    # Nastawy: KAŻDE urządzenie ma swój wpis.
    nastawy = wejscie["nastawy"]
    assert set(nastawy) == {u.ref for u in model.urzadzenia}
    # `smib` buduje zespół BEZ regulatorów, więc jego nastawami są wartości
    # wyliczone z punktu pracy dla stałego wzbudzenia i stałej mocy mechanicznej.
    zespol = next(u for u in model.urzadzenia if u.ref == "G1")
    assert zespol.avr is None and zespol.governor is None
    assert set(nastawy["G1"]) == {"_efd_stale", "_pm_stale"}
    assert nastawy["G1"]["_efd_stale"] != 0.0, "Efd ma pochodzić z rozpływu"


def test_nastawy_zagniezdzone_w_regulatorach_wchodza_do_wejscia_zagadnienia() -> None:
    """Zbieranie nastaw jest REKURENCYJNE — sięga w regulatory, nie tylko w pola urządzenia.

    Bez tego zespół z AVR miałby w tożsamości biegu puste nastawy, a ``V_ref``
    wzbudnicy (wyliczone z rozpływu, zmieniające cały przebieg) nie wchodziłoby
    ani do modelu, ani do biegu — czyli wypadłoby z tożsamości całkowicie.
    """
    from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
    from dynamic_lab.urzadzenia import ZespolSynchroniczny

    model, moce = smib(h_s=4.0, x_linii_pu=0.15)
    goly = next(u for u in model.urzadzenia if u.ref == "G1")
    model.urzadzenia[model.urzadzenia.index(goly)] = ZespolSynchroniczny(
        maszyna=goly.maszyna, avr=RegulatorNapiecia(), governor=RegulatorTurbiny()
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj(moce)
    nastawy = silnik._wejscie_zagadnienia_poczatkowego(x0)["nastawy"]["G1"]
    assert set(nastawy) == {"_efd_stale", "_pm_stale", "avr.v_ref_pu", "governor.p_ref_pu"}
    assert nastawy["avr.v_ref_pu"] != 1.0, "V_ref ma pochodzić z rozpływu, nie z domyślnej"

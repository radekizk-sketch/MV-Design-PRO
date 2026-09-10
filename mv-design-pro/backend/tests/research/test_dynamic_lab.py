"""Testy laboratorium dynamicznego — własności inżynierskie, nie złote liczby.

KOD BADAWCZY — patrz `backend/research/README.md`.

Testy są pisane jako WŁASNOŚCI METAMORFICZNE: „zmiana X musi zmienić Y", a nie
jako porównania z zapisanymi wartościami. Powód jest wprost z audytu — 84%
produkcyjnych testów dynamicznych sprawdzało wyłącznie kształt kontraktu, więc
przechodziły, mimo że silnik zwracał ten sam wynik dla falownika PV i turbiny
DFIG. Test kształtu nie odróżnia fizyki od jej braku; test własności odróżnia.

Każdy test niżej PADŁBY na produkcyjnej warstwie dynamicznej sprzed containmentu.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from dynamic_lab.benchmarki import (
    dwie_maszyny,
    harmonogram_zwarcia,
    maszyna_klasyczna,
    siec_sn_z_der,
    smib,
)
from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.frt import (
    ObwiedniaFrt,
    PrzebiegNapiecia,
    WerdyktFrt,
    czas_odbudowy_mocy,
    ocen_frt,
)
from dynamic_lab.konwencje import dq_z_sieci, siec_z_dq
from dynamic_lab.siec import Galaz, SolverSieci, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, RownowagaNieosiagnietaError, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    FalownikGFM,
    MaszynaSynchroniczna4Rzedu,
    ZespolSynchroniczny,
)
from dynamic_lab.walidacja import WyroczniaWahan, zmierz_czestotliwosc_oscylacji
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieDoziemne

TOL_ROWNOWAGI = 1.0e-8


def _uruchom(model, moce, **kw):
    silnik = SilnikRMS(model, **kw)
    x0 = silnik.inicjalizuj(moce)
    return silnik, x0


# ---------------------------------------------------------------------------
# 1. Konwencje — fundament, bez którego reszta jest nieweryfikowalna
# ---------------------------------------------------------------------------


def test_konwencja_dq_daje_kanoniczne_pe() -> None:
    """Transformacja dq musi dawać ``Pe = E'*V*sin(delta-theta)/X'`` dla modelu klasycznego.

    To jest test SAMEJ KONWENCJI. Produkcyjny model liczył ``Pe = V*sin(delta)``
    bez reaktancji, SEM i kąta szyny — czego nie dało się nawet sprawdzić, bo
    rama odniesienia nie była nigdzie zdefiniowana.
    """
    x_prim, e_prim, v_mod, theta, delta = 0.3, 1.05, 0.98, 0.10, 0.65
    v_siec = v_mod * complex(math.cos(theta), math.sin(theta))
    v_d, v_q = dq_z_sieci(v_siec, delta)
    assert v_d == pytest.approx(v_mod * math.sin(delta - theta), abs=1e-12)
    assert v_q == pytest.approx(v_mod * math.cos(delta - theta), abs=1e-12)

    i_d = (e_prim - v_q) / x_prim
    i_q = v_d / x_prim
    pe = v_d * i_d + v_q * i_q
    assert pe == pytest.approx(e_prim * v_mod * math.sin(delta - theta) / x_prim, rel=1e-12)


def test_transformacja_dq_jest_odwracalna() -> None:
    delta = 0.77
    i_siec = complex(0.6, -0.25)
    obrot = complex(math.cos(delta - math.pi / 2), -math.sin(delta - math.pi / 2))
    i_dq = i_siec * obrot
    assert siec_z_dq(i_dq.real, i_dq.imag, delta) == pytest.approx(i_siec, abs=1e-12)


# ---------------------------------------------------------------------------
# 2. Inicjalizacja — dowód, że start JEST równowagą (defekt P0-04)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("h_s", [2.0, 4.0, 8.0])
@pytest.mark.parametrize("x_linii_pu", [0.08, 0.15, 0.35])
def test_maszyna_startuje_w_rownowadze(h_s: float, x_linii_pu: float) -> None:
    """``||f(x0, y0)|| ~ 0`` dla iloczynu bezwładności i impedancji sieci."""
    model, moce = smib(h_s=h_s, x_linii_pu=x_linii_pu, klasyczna=False, z_regulatorami=True)
    silnik, x0 = _uruchom(model, moce)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI


def test_falowniki_startuja_w_rownowadze() -> None:
    model, moce = siec_sn_z_der()
    silnik, x0 = _uruchom(model, moce)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI


def test_uklad_wielomaszynowy_startuje_w_rownowadze() -> None:
    model, moce = dwie_maszyny()
    silnik, x0 = _uruchom(model, moce)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI


def test_stan_zerowy_jest_ODRZUCANY_jako_punkt_startowy() -> None:
    """Reprodukcja defektu P0-04: start ze stanów zerowych MUSI być odrzucony.

    Produkcyjny silnik startował z ``np.zeros(...)``, przez co ``dx/dt(0) != 0``
    i każdy przebieg był artefaktem rozruchu. Tutaj taki punkt nie przechodzi
    weryfikacji równowagi.
    """
    model, moce = smib(z_regulatorami=True, klasyczna=False)
    silnik = SilnikRMS(model)
    x_zerowy = np.zeros(silnik.uklad.dlugosc, dtype=np.float64)
    assert silnik.norma_pochodnej(x_zerowy) > 1.0e-3


def test_silnik_odrzuca_punkt_poza_rownowaga() -> None:
    model, moce = smib(z_regulatorami=True, klasyczna=False)
    silnik = SilnikRMS(model, tolerancja_rownowagi=1.0e-14)
    # Tolerancja absurdalnie ostra -> nawet poprawny punkt ją przekroczy.
    with pytest.raises(RownowagaNieosiagnietaError):
        silnik.inicjalizuj(moce)


# ---------------------------------------------------------------------------
# 3. WYROCZNIA ANALITYCZNA — poprawność MODELU, nie tylko kodu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("h_s,x_linii", [(3.0, 0.10), (4.0, 0.15), (6.0, 0.25)])
def test_czestotliwosc_wahan_zgadza_sie_z_wyrocznia(h_s: float, x_linii: float) -> None:
    """Zmierzona częstotliwość wahań vs rozwiązanie analityczne — błąd < 1%.

    To jest jedyny poziom walidacji dający dowód BEZ narzędzia zewnętrznego.
    Maszyna zredukowana do klasycznej (``Xd=Xd'=Xq=Xq'``, ``Ra=0``), bez
    regulatorów, bez tłumienia.
    """
    x_masz = 0.30
    model, moce = smib(x_linii_pu=x_linii, r_linii_pu=0.0, h_s=h_s, d_tlumienie=0.0, klasyczna=True)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.001)
    x0 = silnik.inicjalizuj(moce)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI

    wyrocznia = WyroczniaWahan(
        e_prim_pu=float(x0[2]),
        v_sys_pu=1.0,
        x_calkowite_pu=x_masz + x_linii,
        delta0_rad=float(x0[0]),
        h_s=h_s,
    )
    x_zaburzony = x0.copy()
    x_zaburzony[0] += math.radians(1.0)
    wynik = silnik.symuluj(x_zaburzony, czas_koncowy_s=8.0)
    zmierzona = zmierz_czestotliwosc_oscylacji(
        wynik.czas_s, wynik.sygnal("delta_rad", "G1").wartosci
    )
    assert zmierzona is not None
    assert zmierzona == pytest.approx(wyrocznia.czestotliwosc_wlasna_hz, rel=0.01)


def test_wyrocznia_odmawia_poza_zakresem_stosowalnosci() -> None:
    """Wyrocznia z ujemną mocą synchronizującą MUSI odmówić, nie zgadywać."""
    wyrocznia = WyroczniaWahan(
        e_prim_pu=1.0,
        v_sys_pu=1.0,
        x_calkowite_pu=0.4,
        delta0_rad=math.radians(95.0),
        h_s=4.0,
    )
    with pytest.raises(ValueError, match="stabilnoś|stabilnos"):
        _ = wyrocznia.pulsacja_wlasna_rad_s


# ---------------------------------------------------------------------------
# 4. SPRZĘŻENIE Z SIECIĄ — własności metamorficzne (defekty P0-02, P0-06, P0-07)
# ---------------------------------------------------------------------------


def _przebieg_zwarciowy(*, x_linii=0.15, h_s=4.0, t_wyl=0.15, x_f=0.0):
    model, moce = smib(x_linii_pu=x_linii, h_s=h_s, klasyczna=False, z_regulatorami=True)
    silnik, x0 = _uruchom(model, moce, integrator="rk4", krok_s=0.002)
    harmonogram = HarmonogramZdarzen(
        [ZwarcieDoziemne(0.5, "GEN", x_f_pu=x_f), ZdjecieZwarcia(0.5 + t_wyl, "GEN")]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=4.0, harmonogram=harmonogram)
    return (
        np.array(wynik.sygnal("delta_rad", "G1").wartosci),
        np.array(wynik.sygnal("u_pu", "GEN").wartosci),
    )


def test_slabsza_siec_daje_wieksze_wahania() -> None:
    """Impedancja sieci MUSI wpływać na odpowiedź dynamiczną (defekt P0-02)."""
    d_mocna, u_mocna = _przebieg_zwarciowy(x_linii=0.08)
    d_slaba, u_slaba = _przebieg_zwarciowy(x_linii=0.40)
    assert d_slaba.max() > d_mocna.max() * 1.10
    assert u_slaba.min() < u_mocna.min()


def test_wieksza_bezwladnosc_daje_mniejsze_wahania() -> None:
    """Parametr maszyny MUSI wpływać na odpowiedź (defekt P0-03)."""
    d_lekka, _ = _przebieg_zwarciowy(h_s=2.0)
    d_ciezka, _ = _przebieg_zwarciowy(h_s=8.0)
    assert d_ciezka.max() < d_lekka.max()


def test_dluzsze_zwarcie_nie_poprawia_wyniku() -> None:
    """Dłuższe zwarcie NIE MOŻE dać lepszego wyniku — monotoniczność fizyczna."""
    d_krotkie, _ = _przebieg_zwarciowy(t_wyl=0.08)
    d_dlugie, _ = _przebieg_zwarciowy(t_wyl=0.25)
    assert d_dlugie.max() > d_krotkie.max()


def test_glebokosc_zwarcia_zmienia_zapad_napiecia() -> None:
    """Impedancja zwarcia MUSI zmieniać napięcie (defekt P0-06: stała 0,05 p.u.)."""
    _, u_plytkie = _przebieg_zwarciowy(x_f=0.30)
    _, u_glebokie = _przebieg_zwarciowy(x_f=0.0)
    assert u_glebokie.min() < u_plytkie.min() - 0.10


def test_brak_zaklocenia_daje_przebieg_stacjonarny() -> None:
    """Bez zdarzenia przebieg musi zostać w punkcie pracy (brak artefaktu rozruchu)."""
    model, moce = smib(klasyczna=False, z_regulatorami=True)
    silnik, x0 = _uruchom(model, moce, integrator="rk4", krok_s=0.005)
    wynik = silnik.symuluj(x0, czas_koncowy_s=3.0)
    delta = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
    assert float(np.max(np.abs(delta - delta[0]))) < 1.0e-6


def test_zdarzenie_na_wskazanej_szynie_ma_znaczenie() -> None:
    """Lokalizacja zwarcia MUSI zmieniać wynik — ``target_ref`` nie może być phantomem."""
    model, moce = dwie_maszyny()
    wyniki = {}
    for szyna in ("G1B", "G2B"):
        silnik, x0 = _uruchom(model, moce, integrator="rk4", krok_s=0.002)
        harmonogram = HarmonogramZdarzen(
            [ZwarcieDoziemne(0.5, szyna, x_f_pu=0.02), ZdjecieZwarcia(0.62, szyna)]
        )
        wynik = silnik.symuluj(x0, czas_koncowy_s=3.0, harmonogram=harmonogram)
        wyniki[szyna] = np.array(wynik.sygnal("delta_rad", "G1").wartosci).max()
    assert abs(wyniki["G1B"] - wyniki["G2B"]) > 1.0e-3


def test_maszyny_oddzialuja_na_siebie() -> None:
    """Zwarcie przy G2 MUSI poruszyć G1 — w produkcji elementy były rozprzężone."""
    model, moce = dwie_maszyny()
    silnik, x0 = _uruchom(model, moce, integrator="rk4", krok_s=0.002)
    harmonogram = HarmonogramZdarzen(
        [ZwarcieDoziemne(0.5, "G2B", x_f_pu=0.02), ZdjecieZwarcia(0.62, "G2B")]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=3.0, harmonogram=harmonogram)
    delta_g1 = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
    assert float(np.max(np.abs(delta_g1 - delta_g1[0]))) > 1.0e-3


# ---------------------------------------------------------------------------
# 5. URZĄDZENIA — technologia musi mieć konsekwencję (defekty P0-07, P1-08)
# ---------------------------------------------------------------------------


def _przebieg_der(urzadzenie):
    topologia = TopologiaSieci(
        szyny=("DER", "MID", "SYS"),
        galezie=[Galaz("DER", "MID", 0.02, 0.10), Galaz("MID", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(topologia=topologia, urzadzenia=[urzadzenie])
    silnik, x0 = _uruchom(
        model, {urzadzenie.ref: complex(0.6, 0.0)}, integrator="rk4", krok_s=0.002
    )
    harmonogram = HarmonogramZdarzen(
        [ZwarcieDoziemne(0.5, "MID", x_f_pu=0.05), ZdjecieZwarcia(0.65, "MID")]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=3.0, harmonogram=harmonogram)
    return (
        np.array(wynik.sygnal("u_pu", "DER").wartosci),
        np.array(wynik.sygnal("p_pu", urzadzenie.ref).wartosci),
        np.array(wynik.sygnal("i_pu", urzadzenie.ref).wartosci),
    )


def test_gfm_i_gfl_roznia_sie_trajektoria() -> None:
    """GFM i GFL to RÓŻNE modele fizyczne, nie różne etykiety (defekt P1-08).

    W produkcji oba tryby wykonywały identyczny kod — ``control_mode`` nie miał
    żadnej konsekwencji obliczeniowej.
    """
    u_gfl, p_gfl, _ = _przebieg_der(FalownikGFL(ref="D", szyna="DER", i_max_pu=1.2))
    u_gfm, p_gfm, _ = _przebieg_der(FalownikGFM(ref="D", szyna="DER", h_wirtualna_s=4.0))
    assert abs(u_gfl.min() - u_gfm.min()) > 0.05
    # Źródło napięciowe trzyma napięcie lepiej niż źródło prądowe.
    assert u_gfm.min() > u_gfl.min()


def test_ogranicznik_pradu_falownika_dziala() -> None:
    """Prąd falownika NIE MOŻE przekroczyć ogranicznika — to fizyka, nie kosmetyka."""
    for i_max in (0.9, 1.2, 1.5):
        _, _, i = _przebieg_der(FalownikGFL(ref="D", szyna="DER", i_max_pu=i_max))
        assert i.max() <= i_max + 1.0e-6


def test_parametry_falownika_zmieniaja_przebieg() -> None:
    """Różne nastawy MUSZĄ dać różne przebiegi (defekt P0-07: wynik niezależny od DER)."""
    _, p_wolny, _ = _przebieg_der(FalownikGFL(ref="D", szyna="DER", t_p_s=0.30))
    _, p_szybki, _ = _przebieg_der(FalownikGFL(ref="D", szyna="DER", t_p_s=0.02))
    assert float(np.max(np.abs(p_wolny - p_szybki))) > 1.0e-3


def test_regulatory_maja_wplyw_na_przebieg() -> None:
    """AVR i governor MUSZĄ zmieniać wynik — pętla zamknięta (defekt P0-05)."""
    d_bez, _ = _przebieg_zwarciowy()
    model, moce = smib(klasyczna=False, z_regulatorami=False)
    silnik, x0 = _uruchom(model, moce, integrator="rk4", krok_s=0.002)
    harmonogram = HarmonogramZdarzen(
        [ZwarcieDoziemne(0.5, "GEN", x_f_pu=0.0), ZdjecieZwarcia(0.65, "GEN")]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=4.0, harmonogram=harmonogram)
    d_bez_reg = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
    assert abs(d_bez.max() - d_bez_reg.max()) > 1.0e-3


# ---------------------------------------------------------------------------
# 6. FRT — wymaganie i wynik jako różne byty (defekt P0-01)
# ---------------------------------------------------------------------------


def test_przebieg_nie_moze_pochodzic_z_obwiedni() -> None:
    """Konstruktor MUSI odrzucić przebieg podszywający się pod wymaganie."""
    with pytest.raises(ValueError, match="fabrykacja"):
        PrzebiegNapiecia(
            czas_s=(0.0, 1.0),
            napiecie_pu=(0.05, 0.05),
            zrodlo="obwiednia_profilu",
            element_ref="D",
        )


def test_frt_moze_wypasc_negatywnie() -> None:
    """Test FRT MUSI być falsyfikowalny — w produkcji T14/T15 nie mogły dać `fail`."""
    obwiednia = ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (0.15, 0.15), (1.5, 0.85)))
    przebieg = PrzebiegNapiecia(
        czas_s=(0.0, 0.1, 0.2, 0.5, 1.0),
        napiecie_pu=(1.0, 0.02, 0.05, 0.20, 0.40),
        zrodlo="symulacja_laboratoryjna",
        element_ref="D",
    )
    ocena = ocen_frt(przebieg, obwiednia, chwila_zaklocenia_s=0.0)
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    assert ocena.margines_pu is not None and ocena.margines_pu < 0.0


def test_frt_margines_nie_jest_tozsamosciowo_zerowy() -> None:
    """Reprodukcja P0-01: margines liczony z DWÓCH niezależnych wielkości.

    W produkcji ``margin = simulated - limiting`` przy ``simulated := limiting``
    dawało dokładnie 0,0 dla każdego wejścia i werdykt zawsze `pass`.
    """
    obwiednia = ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (0.15, 0.15), (1.5, 0.85)))
    poziomy = (0.20, 0.45, 0.70, 0.95)
    marginesy = []
    for poziom in poziomy:
        # Przebieg plaski na zadanym poziomie: punkt krytyczny jest ZAWSZE w tej
        # samej chwili, wiec margines jest funkcja WYLACZNIE poziomu przebiegu.
        przebieg = PrzebiegNapiecia(
            czas_s=(0.0, 0.1, 0.5, 1.0),
            napiecie_pu=(1.0, poziom, poziom, poziom),
            zrodlo="symulacja_laboratoryjna",
            element_ref="D",
        )
        ocena = ocen_frt(przebieg, obwiednia, chwila_zaklocenia_s=0.0)
        marginesy.append(round(ocena.margines_pu or 0.0, 6))
    # Kazdy poziom daje INNY margines — w produkcji byla jedna wartosc: 0.0.
    assert len(set(marginesy)) == len(poziomy)
    assert marginesy == sorted(marginesy), "margines musi rosnac z poziomem napiecia"
    assert all(abs(m) > 1.0e-9 for m in marginesy)


def test_hvrt_moze_wypasc_negatywnie() -> None:
    """Reprodukcja: HVRT w produkcji był strukturalnie niefalsyfikowalny."""
    obwiednia = ObwiedniaFrt(rodzaj="hvrt", punkty=((0.0, 1.30), (0.5, 1.20), (60.0, 1.10)))
    przebieg = PrzebiegNapiecia(
        czas_s=(0.0, 0.1, 1.0, 5.0),
        napiecie_pu=(1.0, 1.45, 1.25, 1.05),
        zrodlo="symulacja_laboratoryjna",
        element_ref="D",
    )
    ocena = ocen_frt(przebieg, obwiednia, chwila_zaklocenia_s=0.0)
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA


def test_brak_pokrycia_okna_daje_nierozstrzygalne() -> None:
    """Brak danych NIE jest wynikiem pozytywnym."""
    obwiednia = ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (1.5, 0.85)))
    przebieg = PrzebiegNapiecia(
        czas_s=(0.0, 0.1),
        napiecie_pu=(1.0, 1.0),
        zrodlo="symulacja_laboratoryjna",
        element_ref="D",
    )
    ocena = ocen_frt(przebieg, obwiednia, chwila_zaklocenia_s=5.0)
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE


def test_czas_odbudowy_mocy_zalezy_od_przebiegu() -> None:
    """``p_recovery`` MUSI wynikać z P(t), a nie być deklaracją (defekt P0-08)."""
    czas = np.linspace(0.0, 2.0, 201)
    for tau in (0.05, 0.20, 0.50):
        moc = 1.0 - 0.8 * np.exp(-(czas - 0.6) / tau) * (czas >= 0.6)
        wynik = czas_odbudowy_mocy(czas, moc, moc_przed_zaklocaniem_pu=1.0, chwila_wylaczenia_s=0.6)
        assert wynik is not None
    szybki = czas_odbudowy_mocy(
        czas,
        1.0 - 0.8 * np.exp(-(czas - 0.6) / 0.05) * (czas >= 0.6),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.6,
    )
    wolny = czas_odbudowy_mocy(
        czas,
        1.0 - 0.8 * np.exp(-(czas - 0.6) / 0.50) * (czas >= 0.6),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.6,
    )
    assert szybki is not None and wolny is not None and szybki < wolny


def test_brak_odbudowy_daje_none() -> None:
    czas = np.linspace(0.0, 2.0, 201)
    moc = np.full_like(czas, 0.2)
    assert (
        czas_odbudowy_mocy(czas, moc, moc_przed_zaklocaniem_pu=1.0, chwila_wylaczenia_s=0.6) is None
    )


# ---------------------------------------------------------------------------
# 7. Numeryka, zdarzenia, powtarzalność
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", sorted(INTEGRATORY))
def test_wszystkie_integratory_zbiegaja_na_zadaniu_referencyjnym(nazwa: str) -> None:
    model, moce = smib(d_tlumienie=1.0, klasyczna=False, z_regulatorami=True)
    silnik, x0 = _uruchom(model, moce, integrator=nazwa, krok_s=0.005)
    harmonogram = harmonogram_zwarcia(szyna="GEN", x_f_pu=0.05, czas_trwania_s=0.12)
    wynik = silnik.symuluj(x0, czas_koncowy_s=2.0, harmonogram=harmonogram)
    delta = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
    assert wynik.diagnostyka.zbiegl
    assert np.all(np.isfinite(delta))


def test_wynik_jest_powtarzalny() -> None:
    """Ten sam wejściowy scenariusz → ten sam odcisk wyniku."""
    odciski = []
    for _ in range(2):
        model, moce = smib(klasyczna=False, z_regulatorami=True)
        silnik, x0 = _uruchom(model, moce, integrator="rk4", krok_s=0.005)
        wynik = silnik.symuluj(
            x0,
            czas_koncowy_s=1.5,
            harmonogram=harmonogram_zwarcia(szyna="GEN", x_f_pu=0.05),
        )
        odciski.append(wynik.odcisk_wyniku())
    assert odciski[0] == odciski[1]


def test_zmiana_parametru_zmienia_odcisk_modelu() -> None:
    """Odcisk parametrów musi wykryć, że „ten sam" model policzył co innego."""
    odciski = set()
    for h_s in (4.0, 4.5):
        model, moce = smib(h_s=h_s, klasyczna=False)
        silnik, x0 = _uruchom(model, moce)
        wynik = silnik.symuluj(x0, czas_koncowy_s=0.2)
        odciski.add(wynik.modele[0].odcisk_parametrow)
    assert len(odciski) == 2


def test_kolejnosc_zdarzen_rownoczesnych_jest_deterministyczna() -> None:
    zdarzenia = [
        ZdjecieZwarcia(czas_s=1.0, szyna="A"),
        ZwarcieDoziemne(czas_s=1.0, szyna="B"),
    ]
    kolejnosc = [type(z).__name__ for z in HarmonogramZdarzen(zdarzenia).do_chwili(0.5, 1.5)]
    kolejnosc_odwrotna = [
        type(z).__name__ for z in HarmonogramZdarzen(list(reversed(zdarzenia))).do_chwili(0.5, 1.5)
    ]
    assert kolejnosc == kolejnosc_odwrotna == ["ZwarcieDoziemne", "ZdjecieZwarcia"]


def test_wylaczenie_galezi_zmienia_ybus() -> None:
    topologia = TopologiaSieci(
        szyny=("A", "B"),
        galezie=[Galaz("A", "B", 0.01, 0.10)],
        szyny_sztywne={"B": complex(1.0, 0.0)},
    )
    przed = topologia.zbuduj_ybus()
    po = topologia.z_wylaczona_galezia("A", "B").zbuduj_ybus()
    assert not np.allclose(przed, po)


def test_nieznane_wylaczenie_podnosi_blad() -> None:
    topologia = TopologiaSieci(szyny=("A", "B"), galezie=[Galaz("A", "B", 0.01, 0.10)])
    with pytest.raises(ValueError):
        topologia.z_wylaczona_galezia("A", "C")


def test_maszyna_odrzuca_niespojne_reaktancje() -> None:
    with pytest.raises(ValueError):
        MaszynaSynchroniczna4Rzedu(ref="X", szyna="B", h_s=4.0, xd_pu=0.2, xd_prim_pu=0.3)


def test_nazwa_modelu_odpowiada_liczbie_stanow() -> None:
    """Zakaz zawyżania nazwą (defekt P0-03): 4. rząd MUSI mieć 4 stany."""
    maszyna = maszyna_klasyczna()
    assert len(maszyna.nazwy_stanow()) == 4
    zespol = ZespolSynchroniczny(maszyna=maszyna)
    assert len(zespol.nazwy_stanow()) == 6


def test_solver_sieci_wykrywa_osobliwosc() -> None:
    """Wyspa bez źródła MUSI dać jawny błąd, nie cichy wynik."""
    topologia = TopologiaSieci(szyny=("A", "B"), galezie=[])
    solver = SolverSieci(topologia, maks_iteracji=3)
    with pytest.raises(Exception):
        solver.rozwiaz(
            lambda v: np.zeros(2, dtype=np.complex128) + 1.0,
            np.ones(2, dtype=np.complex128),
        )


# ---------------------------------------------------------------------------
# Czas krytyczny wyłączenia zwarcia — defekt P0-06 (stała `return 0.05`)
# ---------------------------------------------------------------------------


def test_cct_rosnie_z_bezwladnoscia_jak_pierwiastek() -> None:
    """CCT ∝ √H — klasyczny wynik kryterium równych pól, TU NIEZAPROGRAMOWANY.

    To jest najmocniejszy dostępny test tego rdzenia bez narzędzia zewnętrznego:
    nigdzie w kodzie nie ma wzoru na CCT ani na kryterium równych pól. Ta
    zależność może wyjść wyłącznie z całkowania równania wahań przy zwarciu
    zmieniającym Ybus. Gdyby zwarcie było stałą (defekt P0-06), CCT byłoby
    identyczne dla każdego H.

    Czterokrotny wzrost H musi dać dwukrotny wzrost CCT.
    """
    from dynamic_lab.benchmarki import czas_krytyczny_zwarcia

    cct_2 = czas_krytyczny_zwarcia(h_s=2.0, dokladnosc_s=0.01)
    cct_8 = czas_krytyczny_zwarcia(h_s=8.0, dokladnosc_s=0.01)
    assert cct_8 > cct_2
    assert cct_8 / cct_2 == pytest.approx(2.0, rel=0.05), (
        f"CCT(H=8)/CCT(H=2) = {cct_8 / cct_2:.4f}, oczekiwane ~2,0 (bo ∝ √H). "
        "Odstępstwo znaczy, że zwarcie albo bezwładność nie wchodzą do wyniku."
    )


def test_cct_maleje_gdy_siec_slabnie() -> None:
    """Słabsza sieć → mniejsza moc synchronizująca → krótszy czas krytyczny.

    Kierunek jest fizyczny i niezależny od skali. Gdyby wynik nie zależał od
    impedancji sieci (P0-02: brak warstwy sieciowej), oba CCT byłyby równe.
    """
    from dynamic_lab.benchmarki import czas_krytyczny_zwarcia

    cct_sztywna = czas_krytyczny_zwarcia(x_linii_pu=0.05, dokladnosc_s=0.01)
    cct_slaba = czas_krytyczny_zwarcia(x_linii_pu=0.40, dokladnosc_s=0.01)
    assert cct_slaba < cct_sztywna, (
        f"CCT w sieci słabej ({cct_slaba * 1000:.0f} ms) nie jest krótszy niż "
        f"w sztywnej ({cct_sztywna * 1000:.0f} ms) — sieć nie wpływa na wynik."
    )


def test_bisekcja_cct_odmawia_gdy_zakres_jest_zly() -> None:
    """Brak CCT w przedziale to BŁĄD, nie wartość brzegowa.

    Zwrócenie granicy przedziału jako „wyniku" byłoby cichym zgadywaniem —
    tą samą klasą, którą audyt nazwał kaskadą wartości domyślnych.
    """
    from dynamic_lab.benchmarki import czas_krytyczny_zwarcia

    with pytest.raises(ValueError, match="poza badanym przedziałem"):
        czas_krytyczny_zwarcia(h_s=4.0, dolna_granica_s=0.9, gorna_granica_s=0.95)

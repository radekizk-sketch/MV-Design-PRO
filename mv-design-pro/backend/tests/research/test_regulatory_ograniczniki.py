"""Ograniczniki stanów regulatorów jako NIEZMIENNIKI DYSKRETNE.

PO CO TEN PLIK. Ogranicznik był zapisany wyłącznie w pochodnej: zerowała się,
gdy stan JUŻ był na granicy albo poza nią. To nie gwarantuje
``x_min <= x_n <= x_max`` przy skończonym kroku. Pomiary na HEAD przed naprawą:

  AVR  (x0 = 4,0; cel = 5,0; T_a = 0,05; efd_max = 5,0)
      Euler jawny, dt = 0,10 → ``Efd = 6,000000`` (+1,0 p.u., 20 % ponad sufit)
      Euler jawny, dt = 0,50 → +9,0 p.u.;  RK4, dt = 0,50 → +286 p.u.
      Trapezy,     dt = 0,50 → +0,667 p.u. (trapezy łamią niezmiennik dla dt > 2T)

  GOV  (x0 = 1,0; omega = 0,95; T_g = 0,5; p_max = 1,2)
      Euler jawny, dt = 0,50 → ``Pm = 1,800`` (+0,6 p.u., 50 % ponad limit)
      Euler jawny, dt = 0,20 → ``Pm = 1,320`` (+0,12 p.u.)
      Metody NIEJAWNE w ogóle nie zbiegały: nieograniczone żądanie + nieciągłe
      zerowanie pochodnej dawały równanie ``x1 = x0 + dt*f(x1)`` BEZ ROZWIĄZANIA
      (``BrakZbieznosciIntegratoraError``, residuum ``4,000e-01``).

Governor był tu KLASĄ tego samego defektu, który w AVR był już naprawiony
(ograniczenie żądania) — naprawa instancji zamiast klasy. Oba są tu pilnowane
razem, na iloczynie cech: {regulator} × {integrator} × {dt}.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from dynamic_lab.calkowanie import (
    INTEGRATORY,
    BrakZbieznosciIntegratoraError,
    DziennikRzutowan,
    OgraniczenieStanu,
    z_niezmiennikami,
)
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from numpy.typing import NDArray

AVR = RegulatorNapiecia(k_a=200.0, t_a_s=0.05, efd_min=0.0, efd_max=5.0, v_ref_pu=1.0)
GOV = RegulatorTurbiny(r_statyzm=0.05, t_g_s=0.5, p_min_pu=0.0, p_max_pu=1.2, p_ref_pu=0.8)

#: Kroki obejmujące OBA reżimy: takie, przy których metoda jawna przeskakuje
#: granicę (dt >= T), i takie, przy których niezmiennik trzyma się sam.
KROKI_AVR = (0.50, 0.20, 0.15, 0.10, 0.05, 0.02, 0.01, 0.001)
KROKI_GOV = (2.00, 1.50, 1.00, 0.60, 0.50, 0.20, 0.05, 0.001)


def _f_avr(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
    """Głęboki zapad: ``v_t = 0`` wypycha żądanie na sufit wzbudnicy."""
    return np.array([AVR.pochodna(float(x[0]), 0.0)])


def _f_gov(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
    """Spadek częstotliwości do 0,95 p.u. wypycha żądanie ponad ``p_max``."""
    return np.array([GOV.pochodna(float(x[0]), 0.95)])


_PRZYPADKI = {
    "avr": (_f_avr, 4.0, AVR.efd_min, AVR.efd_max, AVR.ogranicznik_stanu(0), KROKI_AVR),
    "gov": (_f_gov, 1.0, GOV.p_min_pu, GOV.p_max_pu, GOV.ogranicznik_stanu(0), KROKI_GOV),
}


def _przebieg(regulator: str, nazwa_integratora: str, dt: float, *, rzutuj: bool):
    """Zwróć ``(najwiekszy_nadmiar, dziennik)``; ``None`` gdy krok nie zbiegł."""
    f, x0, dol, gora, ogranicznik, _ = _PRZYPADKI[regulator]
    integrator = (
        z_niezmiennikami(nazwa_integratora, (ogranicznik,))
        if rzutuj
        else INTEGRATORY[nazwa_integratora]
    )
    x = np.array([x0])
    t = 0.0
    nadmiar = 0.0
    try:
        for _ in range(5):
            x, _ = integrator.krok(f, x, t, dt)
            t += dt
            wartosc = float(x[0])
            nadmiar = max(nadmiar, wartosc - gora, dol - wartosc, 0.0)
    except BrakZbieznosciIntegratoraError:
        return None, None
    return nadmiar, (integrator.dziennik if rzutuj else None)


# ---------------------------------------------------------------------------
# 1. Niezmiennik przy KAŻDEJ przyjętej próbce — iloczyn {regulator}×{metoda}×{dt}
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("regulator", sorted(_PRZYPADKI))
@pytest.mark.parametrize("nazwa", sorted(INTEGRATORY))
def test_niezmiennik_stanu_trzyma_sie_dla_kazdej_metody_i_kazdego_kroku(
    regulator: str, nazwa: str
) -> None:
    _, _, dol, gora, _, kroki = _PRZYPADKI[regulator]
    for dt in kroki:
        nadmiar, _ = _przebieg(regulator, nazwa, dt, rzutuj=True)
        assert nadmiar is not None, f"{regulator}/{nazwa}/dt={dt}: krok nie zbiegł"
        assert (
            nadmiar == 0.0
        ), f"{regulator}/{nazwa}/dt={dt}: stan wyszedł poza [{dol}, {gora}] o {nadmiar:.3e}"


@pytest.mark.parametrize("regulator", sorted(_PRZYPADKI))
def test_bez_niezmiennika_duzy_krok_LAMIE_ogranicznik(regulator: str) -> None:
    """Dowód, że niezmiennik jest potrzebny — a nie tylko obecny.

    Bez tego testu naprawa mogłaby „przechodzić" na krokach, przy których
    ogranicznik i tak nigdy nie był łamany.
    """
    _, _, _, _, _, kroki = _PRZYPADKI[regulator]
    lamiace = [
        (nazwa, dt)
        for nazwa in sorted(INTEGRATORY)
        for dt in kroki
        if (_przebieg(regulator, nazwa, dt, rzutuj=False)[0] or 0.0) > 0.0
    ]
    assert lamiace, f"{regulator}: zestaw kroków nie zawiera ani jednego łamiącego granicę"
    assert any(
        INTEGRATORY[nazwa].jawny for nazwa, _ in lamiace
    ), "wymagany jest krok, przy którym integrator JAWNY przeskakuje granicę"


def test_zmierzony_przypadek_z_audytu_euler_jawny_dt_dziesiec_setnych() -> None:
    """Liczby wprost z pomiaru: x=4,0; cel=5,0; T=0,05; dt=0,10 → Euler daje 6,0."""
    assert AVR.pochodna(4.0, 0.0) == pytest.approx(20.0)
    bez, _ = INTEGRATORY["euler_jawny"].krok(_f_avr, np.array([4.0]), 0.0, 0.10)
    assert float(bez[0]) == pytest.approx(6.0)
    assert float(bez[0]) > AVR.efd_max
    integrator = z_niezmiennikami("euler_jawny", (AVR.ogranicznik_stanu(0),))
    z_rzut, _ = integrator.krok(_f_avr, np.array([4.0]), 0.0, 0.10)
    assert float(z_rzut[0]) == pytest.approx(AVR.efd_max)


# ---------------------------------------------------------------------------
# 2. Rzutowanie jest ZAPISYWANE — zakaz cichego min(max())
# ---------------------------------------------------------------------------


def test_rzutowanie_zostawia_zapis_ze_znaczeniem_fizycznym() -> None:
    integrator = z_niezmiennikami("euler_jawny", (AVR.ogranicznik_stanu(0),))
    integrator.krok(_f_avr, np.array([4.0]), 0.0, 0.10)
    zapisy = integrator.dziennik.zapisy
    assert len(zapisy) == 1
    zapis = zapisy[0]
    assert zapis.nazwa == "efd_pu"
    assert zapis.granica == "gora"
    assert zapis.wartosc_przed == pytest.approx(6.0)
    assert zapis.wartosc_po == pytest.approx(5.0)
    assert zapis.nadmiar == pytest.approx(1.0)
    assert zapis.chwila_s == pytest.approx(0.10)
    assert "wzbudzenia" in zapis.znaczenie


def test_brak_przekroczenia_nie_zostawia_zapisu() -> None:
    """Dziennik ma odróżniać „nie było potrzeby" od „było i poprawiono"."""
    integrator = z_niezmiennikami("euler_jawny", (AVR.ogranicznik_stanu(0),))
    integrator.krok(_f_avr, np.array([4.0]), 0.0, 0.001)
    assert integrator.dziennik.bez_rzutowan is True
    assert integrator.dziennik.najwiekszy_nadmiar == 0.0


def test_ogranicznik_bez_znaczenia_fizycznego_jest_odrzucany() -> None:
    """Deklaracja „zakaz cichego min(max())" ma przypięty mechanizm, nie tylko zdanie."""
    with pytest.raises(ValueError, match="znaczenia fizycznego"):
        OgraniczenieStanu(indeks=0, dol=0.0, gora=1.0, nazwa="x", znaczenie="  ")


def test_naklada_bez_ograniczen_i_z_duplikatem_indeksu_jest_odrzucana() -> None:
    with pytest.raises(ValueError, match="bez ograniczeń"):
        z_niezmiennikami("rk4", ())
    ogr = AVR.ogranicznik_stanu(0)
    with pytest.raises(ValueError, match="ten sam stan"):
        z_niezmiennikami("rk4", (ogr, GOV.ogranicznik_stanu(0)))


def test_naklada_zachowuje_kontrakt_integratora() -> None:
    integrator = z_niezmiennikami("trapez_niejawny", (AVR.ogranicznik_stanu(0),))
    assert integrator.rzad == INTEGRATORY["trapez_niejawny"].rzad
    assert integrator.jawny is False
    assert integrator.nazwa == "trapez_niejawny+niezmienniki"
    x, ewaluacje = integrator.krok(_f_avr, np.array([4.0]), 0.0, 0.01)
    assert ewaluacje >= 1
    assert x.shape == (1,)


def test_dziennik_mozna_podac_z_zewnatrz_i_dzielic_miedzy_kroki() -> None:
    dziennik = DziennikRzutowan()
    integrator = z_niezmiennikami("euler_jawny", (AVR.ogranicznik_stanu(0),), dziennik=dziennik)
    x = np.array([4.0])
    for k in range(3):
        x, _ = integrator.krok(_f_avr, x, k * 0.10, 0.10)
    assert len(dziennik.zapisy) == 1, "po pierwszym rzutowaniu stan siedzi już na suficie"
    assert dziennik.najwiekszy_nadmiar == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# 3. Wejście w ogranicznik i WYJŚCIE z niego (anti-windup)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", sorted(INTEGRATORY))
def test_zejscie_z_ogranicznika_jest_natychmiastowe(nazwa: str) -> None:
    """Anti-windup: stan nie ładuje się poza sufitem, więc nie ma opóźnienia powrotu.

    Scenariusz pokrywa OBIE strony ogranicznika: 0,3 s głębokiego zapadu (wejście
    w sufit) i 0,3 s po powrocie napięcia (zejście z sufitu).

    ZAPISANA WŁASNOŚĆ MODELU, nie przybliżenie testu: przy ograniczonym ŻĄDANIU
    (``cel = efd_max``) stan dochodzi do sufitu ASYMPTOTYCZNIE — po czasie ``T``
    zostaje mu ``(x0 - efd_max) * exp(-T/T_a)``, tu ``4 * exp(-6) = 9,9e-03``.
    Ogranicznik typu non-windup z NIEOGRANICZONYM żądaniem siadałby na suficie
    dokładnie i w ~1 ms. Ta różnica jest świadoma (ograniczenie żądania bounduje
    predyktor kroku niejawnego — patrz `RegulatorNapiecia.pochodna`) i jest tu
    PRZYPIĘTA liczbą, żeby ewentualna zmiana konwencji nie przeszła niezauważona.
    """
    regulator = RegulatorNapiecia(k_a=200.0, t_a_s=0.05, efd_min=0.0, efd_max=5.0, v_ref_pu=1.005)

    def f(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
        return np.array([regulator.pochodna(float(x[0]), 0.0 if t < 0.3 else 1.0)])

    integrator = z_niezmiennikami(nazwa, (regulator.ogranicznik_stanu(0),))
    dt = 0.001
    x = np.array([1.0])
    t = 0.0
    na_suficie = 0.0
    for _ in range(600):
        x, _ = integrator.krok(f, x, t, dt)
        t += dt
        assert regulator.efd_min <= float(x[0]) <= regulator.efd_max
        if t < 0.3:
            na_suficie = max(na_suficie, float(x[0]))
    odleglosc_od_sufitu = (regulator.efd_max - 1.0) * math.exp(-0.3 / regulator.t_a_s)
    assert na_suficie <= regulator.efd_max
    # Tolerancja 2e-3 mieści błąd metody (Euler wsteczny przy dt=1e-3 zaniża o
    # ~8e-4), a nadal ROZRÓŻNIA obie konwencje: ogranicznik non-windup dałby tu
    # dokładnie efd_max, czyli o 9,9e-03 więcej — pięć razy powyżej tolerancji.
    assert na_suficie == pytest.approx(
        regulator.efd_max - odleglosc_od_sufitu, abs=2e-3
    ), "dojście do sufitu jest asymptotyczne przy ograniczonym żądaniu"
    # Stała czasowa T_a = 0,05 s; po 0,3 s (6*T_a) od powrotu napięcia stan musi
    # być już przy nowym celu (1,0 p.u.). Windup dałby tu wartość wciąż wysoką.
    assert float(x[0]) == pytest.approx(1.0, abs=0.05)


# ---------------------------------------------------------------------------
# 4. Cena metody: rzutowanie nie degraduje rzędu poza krokiem, w którym działa
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("nazwa", "rzad_lokalny"),
    [("euler_jawny", 2), ("euler_niejawny", 2), ("rk4", 5), ("trapez_niejawny", 3)],
)
def test_rzutowanie_nie_zmienia_rzedu_metody_poza_krokiem_granicznym(
    nazwa: str, rzad_lokalny: int
) -> None:
    """Poniżej progu przekroczenia wynik jest IDENTYCZNY z wersją bez rzutowania.

    Zmierzony rząd błędu LOKALNEGO (``p+1``) jest zachowany; rzutowanie działa
    wyłącznie w krokach, które i tak łamały niezmiennik.
    """

    def dokladne(dt: float) -> float:
        return 5.0 + (4.0 - 5.0) * math.exp(-dt / AVR.t_a_s)

    poprzedni = None
    for dt in (0.025, 0.0125, 0.00625, 0.003125):
        integrator = z_niezmiennikami(nazwa, (AVR.ogranicznik_stanu(0),))
        x_z, _ = integrator.krok(_f_avr, np.array([4.0]), 0.0, dt)
        x_bez, _ = INTEGRATORY[nazwa].krok(_f_avr, np.array([4.0]), 0.0, dt)
        assert integrator.dziennik.bez_rzutowan is True
        assert float(x_z[0]) == float(x_bez[0]), "bez przekroczenia: bit w bit ten sam wynik"
        blad = abs(float(x_z[0]) - dokladne(dt))
        if poprzedni is not None and blad > 0.0:
            assert math.log2(poprzedni / blad) == pytest.approx(rzad_lokalny, abs=0.5)
        poprzedni = blad


# ---------------------------------------------------------------------------
# 5. Ograniczenie ŻĄDANIA — ta sama reguła w OBU regulatorach (klasa, nie instancja)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", sorted(INTEGRATORY))
def test_governor_zbiega_dla_kazdej_metody_przy_glebokim_spadku_czestotliwosci(
    nazwa: str,
) -> None:
    """Przed naprawą metody niejawne kończyły tu ``BrakZbieznosciIntegratoraError``."""
    x, _ = INTEGRATORY[nazwa].krok(_f_gov, np.array([1.0]), 0.0, 0.5)
    assert np.all(np.isfinite(x))


@pytest.mark.parametrize(
    ("regulator", "zadanie", "granica"),
    [("avr", lambda: AVR.pochodna(4.0, 0.0), 5.0), ("gov", lambda: GOV.pochodna(1.0, 0.95), 1.2)],
)
def test_zadanie_jest_ograniczone_w_obu_regulatorach(
    regulator: str, zadanie, granica: float
) -> None:
    """Pochodna nie może żądać więcej, niż wynosi odległość do granicy przez T."""
    _, x0, _, _, _, _ = _PRZYPADKI[regulator]
    stala_czasowa = AVR.t_a_s if regulator == "avr" else GOV.t_g_s
    assert zadanie() <= (granica - x0) / stala_czasowa + 1e-12


def test_zerowanie_pochodnej_bylo_martwe() -> None:
    """Usunięty warunek ``if x >= max and d > 0`` nie mógł się wykonać.

    Skoro żądanie leży w ``[dol, gora]``, to dla ``x >= gora`` pochodna jest
    niedodatnia, a dla ``x <= dol`` — nieujemna. Test pilnuje tej własności, bo
    to ona zastępuje usunięty warunek; gdyby ograniczenie żądania zniknęło,
    zapali się tutaj, a nie dopiero w przebiegu.
    """
    for v_t in (0.0, 0.5, 1.0, 1.5, 2.0):
        assert AVR.pochodna(AVR.efd_max, v_t) <= 0.0
        assert AVR.pochodna(AVR.efd_min, v_t) >= 0.0
        assert AVR.pochodna(AVR.efd_max + 10.0, v_t) <= 0.0
    for omega in (0.90, 0.95, 1.0, 1.05, 1.10):
        assert GOV.pochodna(GOV.p_max_pu, omega) <= 0.0
        assert GOV.pochodna(GOV.p_min_pu, omega) >= 0.0
        assert GOV.pochodna(GOV.p_max_pu + 10.0, omega) <= 0.0


def test_stan_ustalony_obu_regulatorow_lezy_w_ograniczniku() -> None:
    efd0, v_ref = AVR.stan_ustalony(efd_wymagane=99.0, v_t_pu=1.0)
    assert AVR.efd_min <= efd0 <= AVR.efd_max
    assert RegulatorNapiecia(
        k_a=AVR.k_a, t_a_s=AVR.t_a_s, efd_min=AVR.efd_min, efd_max=AVR.efd_max, v_ref_pu=v_ref
    ).pochodna(efd0, 1.0) == pytest.approx(0.0)
    pm0, p_ref = GOV.stan_ustalony(pm_wymagane=99.0)
    assert GOV.p_min_pu <= pm0 <= GOV.p_max_pu
    assert RegulatorTurbiny(
        r_statyzm=GOV.r_statyzm,
        t_g_s=GOV.t_g_s,
        p_min_pu=GOV.p_min_pu,
        p_max_pu=GOV.p_max_pu,
        p_ref_pu=p_ref,
    ).pochodna(pm0, 1.0) == pytest.approx(0.0)


def test_ograniczniki_stanu_odpowiadaja_nastawom_regulatorow() -> None:
    """Granice nie mogą być drugą kopią liczb — pochodzą z tych samych pól."""
    ogr = AVR.ogranicznik_stanu(4)
    assert (ogr.indeks, ogr.dol, ogr.gora, ogr.nazwa) == (4, AVR.efd_min, AVR.efd_max, "efd_pu")
    ogr = GOV.ogranicznik_stanu(5)
    assert (ogr.indeks, ogr.dol, ogr.gora, ogr.nazwa) == (5, GOV.p_min_pu, GOV.p_max_pu, "pm_pu")

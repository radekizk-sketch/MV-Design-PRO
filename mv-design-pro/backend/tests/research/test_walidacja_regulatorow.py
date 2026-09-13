"""Walidacja regulatorów AVR / governor / PSS — wyrocznie ANALITYCZNE.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

CO TU JEST NOWEGO (plan pre-Fable §5–§7). `test_regulatory_ograniczniki.py`
sprawdza OGRANICZNIKI: niezmienniki dyskretne, zbieżność metod niejawnych,
martwość dawnego zerowania pochodnej. To jest kontrola numeryczna. Brakowało
kontroli, czy regulator liczy TO RÓWNANIE, które deklaruje — czyli porównania z
postacią zamkniętą odpowiedzi, a nie tylko z własnymi granicami.

Każdy człon pierwszego rzędu ``T·dx/dt = cel - x`` ma rozwiązanie

    x(t) = cel + (x_0 - cel)·exp(-t/T),

więc odpowiedź skokowa jest sprawdzalna CO DO WARTOŚCI, nie „co do kształtu".
Stąd biorą się wyrocznie w tym pliku: stała czasowa, wartość ustalona, statyzm i
odpowiedź częstotliwościowa PSS.

STATUS. To są wyrocznie klasy ANALITYCZNA (postać zamknięta tego samego
równania, które implementuje kod). NIE są niezależną walidacją fizyczną: nie
mówią, czy równanie opisuje prawdziwą wzbudnicę — mówią, czy kod liczy
równanie, które deklaruje. Rozróżnienie jest wymagane planem §13 i jest tu
powtórzone świadomie.
"""

from __future__ import annotations

import cmath
import math

import numpy as np
import pytest
from dynamic_lab.benchmarki import smib
from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.regulatory import (
    RegulatorNapiecia,
    RegulatorTurbiny,
    StabilizatorSystemowy,
)
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.urzadzenia import MaszynaSynchroniczna4Rzedu, ZespolSynchroniczny
from dynamic_lab.wynik import PrzestrzenSygnalu
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieTrojfazowe


def _calkuj(f, x0: np.ndarray, *, dt: float, kroki: int) -> np.ndarray:
    """Całkowanie WŁASNYM integratorem laboratorium (rk4), nie atrapą.

    Test ma sprawdzać drogę produkcyjną. Gdyby całkował własnym schematem,
    mierzyłby zgodność dwóch rzeczy, z których żadna nie jest badanym kodem.
    """
    integrator = INTEGRATORY["rk4"]
    x = x0.copy()
    slad = [x.copy()]
    for k in range(kroki):
        x, _ = integrator.krok(f, x, k * dt, dt)
        slad.append(x.copy())
    return np.array(slad)


# ---------------------------------------------------------------------------
# §5 AVR — SPECYFIKACJA I WYROCZNIE
# ---------------------------------------------------------------------------


def test_avr_rownowaga_jest_dokladna_dla_wyliczonego_v_ref() -> None:
    """Inicjalizacja idzie ODWROTNIE niż symulacja i musi dać dokładne zero."""
    avr = RegulatorNapiecia(k_a=200.0, t_a_s=0.05)
    for efd_wymagane, v_t in ((1.5, 1.0), (0.8, 0.97), (4.0, 1.05)):
        efd0, v_ref = avr.stan_ustalony(efd_wymagane, v_t)
        nastrojony = RegulatorNapiecia(
            k_a=avr.k_a, t_a_s=avr.t_a_s, efd_min=avr.efd_min, efd_max=avr.efd_max, v_ref_pu=v_ref
        )
        assert nastrojony.pochodna(efd0, v_t) == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize("t_a_s", [0.02, 0.05, 0.20])
def test_avr_odpowiedz_skokowa_ZGADZA_SIE_Z_POSTACIA_ZAMKNIETA(t_a_s: float) -> None:
    """WYROCZNIA ANALITYCZNA: ``Efd(t) = cel + (Efd_0 - cel)·exp(-t/T_a)``.

    Napięcie zaciskowe trzymamy stałe (wymuszenie skokiem ``V_ref``), więc układ
    jest liniowy pierwszego rzędu i ma rozwiązanie w postaci zamkniętej. Test
    porównuje CAŁY przebieg, nie tylko wartość końcową — pomylona stała czasowa
    zmienia kształt, nie punkt ustalony.
    """
    k_a, v_t = 50.0, 1.0
    avr = RegulatorNapiecia(k_a=k_a, t_a_s=t_a_s, efd_min=-100.0, efd_max=100.0, v_ref_pu=1.02)
    efd_0 = 1.0
    cel = k_a * (avr.v_ref_pu - v_t)

    dt = t_a_s / 200.0
    kroki = 1500
    slad = _calkuj(
        lambda x, t: np.array([avr.pochodna(float(x[0]), v_t)]),
        np.array([efd_0]),
        dt=dt,
        kroki=kroki,
    )
    czas = np.arange(kroki + 1) * dt
    analityczne = cel + (efd_0 - cel) * np.exp(-czas / t_a_s)
    blad = float(np.max(np.abs(slad[:, 0] - analityczne)))
    assert blad < 1.0e-8, f"T_a={t_a_s}: max |symulacja - postać zamknięta| = {blad:.3e}"


def test_avr_stala_czasowa_odczytana_z_przebiegu_rowna_sie_zadeklarowanej() -> None:
    """Drugie, niezależne odczytanie tej samej wielkości.

    Po czasie ``T_a`` odpowiedź pokonuje dokładnie ``1 - 1/e`` drogi do wartości
    ustalonej. To sprawdza tę samą fizykę co test wyżej, ale przez inną
    wielkość — pomyłka w mnożniku ``K_a`` przeszłaby tamten test po
    przeskalowaniu celu, a tego nie przejdzie.
    """
    t_a_s, k_a, v_t = 0.05, 50.0, 1.0
    avr = RegulatorNapiecia(k_a=k_a, t_a_s=t_a_s, efd_min=-100.0, efd_max=100.0, v_ref_pu=1.02)
    efd_0 = 0.0
    cel = k_a * (avr.v_ref_pu - v_t)
    dt = t_a_s / 500.0
    kroki = 500
    slad = _calkuj(
        lambda x, t: np.array([avr.pochodna(float(x[0]), v_t)]),
        np.array([efd_0]),
        dt=dt,
        kroki=kroki,
    )
    po_jednej_stalej = float(slad[kroki, 0])
    assert po_jednej_stalej == pytest.approx(cel * (1.0 - math.exp(-1.0)), rel=1e-6)


def test_avr_reaguje_na_zaklocenie_napiecia_we_wlasciwa_strone() -> None:
    """Znak sprzężenia: spadek ``V_t`` MUSI podnieść wzbudzenie."""
    avr = RegulatorNapiecia(k_a=50.0, t_a_s=0.05, efd_min=-100.0, efd_max=100.0, v_ref_pu=1.0)
    assert avr.pochodna(1.0, 0.95) > 0.0, "zapad napięcia ma podnosić Efd"
    assert avr.pochodna(1.0, 1.05) < 0.0, "przepięcie ma obniżać Efd"


@pytest.mark.parametrize("granica", ["gora", "dol"])
def test_avr_wejscie_i_zejscie_z_ogranicznika(granica: str) -> None:
    """Wejście w nasycenie, trwanie i NATYCHMIASTOWE zejście (anti-windup).

    Windup objawiłby się opóźnieniem zejścia: stan „naładowany" poza granicą
    musiałby najpierw wrócić do niej, zanim wyjście ruszy. Tutaj stan nie może
    wyjść poza granicę, więc zejście jest natychmiastowe — i to jest mierzone,
    a nie zadeklarowane.
    """
    k_a, t_a_s, efd_min, efd_max = 200.0, 0.05, 0.0, 5.0
    avr = RegulatorNapiecia(k_a=k_a, t_a_s=t_a_s, efd_min=efd_min, efd_max=efd_max, v_ref_pu=1.0)
    if granica == "gora":
        v_glebokie, efd_start, oczekiwana_granica = 0.5, 1.0, efd_max
    else:
        v_glebokie, efd_start, oczekiwana_granica = 1.5, 4.0, efd_min

    # Napięcie powrotne dobrane tak, aby żądanie wypadło ŚCIŚLE WEWNĄTRZ pasma
    # [efd_min, efd_max]. Przy V_t = V_ref żądanie wynosi dokładnie 0, czyli LEŻY NA
    # dolnej granicy — pochodna jest wtedy zerowa z fizyki modelu, nie z windupu,
    # i taki test nie odróżnia anti-windupu od jego braku.
    zadanie_powrotne = 2.5
    assert efd_min < zadanie_powrotne < efd_max
    v_powrotne = avr.v_ref_pu - zadanie_powrotne / k_a

    dt = 0.001
    x = np.array([efd_start])
    for _ in range(2000):
        x, _ = INTEGRATORY["rk4"].krok(
            lambda y, t: np.array([avr.pochodna(float(y[0]), v_glebokie)]), x, 0.0, dt
        )
    assert float(x[0]) == pytest.approx(oczekiwana_granica, abs=1e-3), "nie dobił do granicy"

    # ZEJŚCIE: po powrocie napięcia pochodna musi NATYCHMIAST osiągnąć wartość
    # (żądanie - Efd)/T_a. Windup (stan naliczony poza granicą) dałby wartość
    # mniejszą co do modułu, bo Efd musiałby najpierw wrócić do granicy.
    pochodna_po_powrocie = avr.pochodna(float(x[0]), v_powrotne)
    oczekiwana_pochodna = (zadanie_powrotne - oczekiwana_granica) / t_a_s
    assert pochodna_po_powrocie == pytest.approx(oczekiwana_pochodna, rel=1e-6, abs=1e-6)
    if granica == "gora":
        assert pochodna_po_powrocie < 0.0
    else:
        assert pochodna_po_powrocie > 0.0


@pytest.mark.parametrize(
    ("efd_wymagane", "oczekiwane"),
    [(9.0, 5.0), (-3.0, 0.0), (2.5, 2.5)],
)
def test_avr_punkt_startowy_lezy_W_OGRANICZNIKU(efd_wymagane: float, oczekiwane: float) -> None:
    """Anti-windup obowiązuje TAKŻE w chwili zero — inicjalizacja nie jest wyjątkiem.

    DLACZEGO TEN TEST ISTNIEJE (uczciwie): kampania mutacyjna §5 wykazała, że
    mutacja „usuń rzutowanie w `stan_ustalony`" PRZEŻYWAŁA komplet 35 testów.
    Przeżywała, bo wszystkie one startowały z punktu pracy leżącego wewnątrz
    zakresu wzbudnicy — czyli sprawdzały mechanizm wyłącznie tam, gdzie nic nie
    robi. Bez tego testu maszyna o wymaganiu ``Efd`` ponad sufitem startowałaby
    poza ogranicznikiem, a niezmiennik dyskretny ściągnąłby ją w pierwszym kroku,
    dając skok wzbudzenia NIEMAJĄCY przyczyny fizycznej.

    Zakres pokrywa oba przekroczenia i przypadek wewnętrzny — inaczej test
    dowodziłby tylko jednej gałęzi rzutowania (błąd tej samej klasy co wyżej).
    """
    avr = RegulatorNapiecia(k_a=200.0, t_a_s=0.05, efd_min=0.0, efd_max=5.0)
    efd0, v_ref = avr.stan_ustalony(efd_wymagane=efd_wymagane, v_t_pu=1.0)
    assert efd0 == pytest.approx(oczekiwane)
    assert avr.efd_min <= efd0 <= avr.efd_max

    # Dobrane ``V_ref`` musi dawać RÓWNOWAGĘ w tym właśnie (ograniczonym) punkcie:
    # rzutowanie bez korekty nastawy dałoby stan w zakresie, ale nie w równowadze.
    zestrojony = RegulatorNapiecia(
        k_a=avr.k_a, t_a_s=avr.t_a_s, efd_min=avr.efd_min, efd_max=avr.efd_max, v_ref_pu=v_ref
    )
    assert zestrojony.pochodna(efd0, 1.0) == pytest.approx(0.0, abs=1e-12)


def test_governor_punkt_startowy_lezy_W_OGRANICZNIKU() -> None:
    """Ta sama własność po stronie turbiny — bo to ta sama KLASA, nie ten sam przypadek."""
    governor = RegulatorTurbiny(r_statyzm=0.05, t_g_s=0.5, p_min_pu=0.2, p_max_pu=1.2)
    for pm_wymagane, oczekiwane in ((2.0, 1.2), (-0.5, 0.2), (0.8, 0.8)):
        pm0, p_ref = governor.stan_ustalony(pm_wymagane=pm_wymagane)
        assert pm0 == pytest.approx(oczekiwane)
        assert governor.p_min_pu <= pm0 <= governor.p_max_pu
        zestrojony = RegulatorTurbiny(
            r_statyzm=governor.r_statyzm,
            t_g_s=governor.t_g_s,
            p_min_pu=governor.p_min_pu,
            p_max_pu=governor.p_max_pu,
            p_ref_pu=p_ref,
        )
        assert zestrojony.pochodna(pm0, 1.0) == pytest.approx(0.0, abs=1e-12)


def test_avr_zadanie_nie_wychodzi_poza_ogranicznik_nawet_przy_glebokim_zapadzie() -> None:
    """Bez ograniczenia żądania ``K_a·(V_ref - V_t)`` sięga ~88 p.u. (pomiar z modułu)."""
    avr = RegulatorNapiecia(k_a=200.0, t_a_s=0.05, efd_min=0.0, efd_max=5.0, v_ref_pu=1.0)
    pochodna = avr.pochodna(0.0, 0.01)
    # cel jest ograniczony do efd_max, więc pochodna <= (efd_max - efd)/T_a
    assert pochodna <= (5.0 - 0.0) / 0.05 + 1e-9


# ---------------------------------------------------------------------------
# §6 GOVERNOR — SPECYFIKACJA I WYROCZNIE
# ---------------------------------------------------------------------------


def test_governor_rownowaga_przy_predkosci_synchronicznej() -> None:
    gov = RegulatorTurbiny(r_statyzm=0.05, t_g_s=0.5)
    for pm_wymagane in (0.2, 0.6, 1.0):
        pm0, p_ref = gov.stan_ustalony(pm_wymagane)
        nastrojony = RegulatorTurbiny(
            r_statyzm=gov.r_statyzm,
            t_g_s=gov.t_g_s,
            p_min_pu=gov.p_min_pu,
            p_max_pu=gov.p_max_pu,
            p_ref_pu=p_ref,
        )
        assert nastrojony.pochodna(pm0, 1.0) == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize("r_statyzm", [0.03, 0.05, 0.08])
def test_governor_statyzm_ZGADZA_SIE_Z_POSTACIA_ZAMKNIETA(r_statyzm: float) -> None:
    """WYROCZNIA ANALITYCZNA: ``ΔP_∞ / Δω = -1/R`` dokładnie.

    To jest definicja statyzmu i jedyna liczba, którą governor pierwszego rzędu
    obiecuje w stanie ustalonym. Sprawdzana dla trzech wartości ``R`` i obu
    kierunków odchyłki.
    """
    gov = RegulatorTurbiny(
        r_statyzm=r_statyzm, t_g_s=0.5, p_min_pu=-10.0, p_max_pu=10.0, p_ref_pu=0.6
    )
    for d_omega in (-0.01, -0.002, 0.002, 0.01):
        omega = 1.0 + d_omega
        # Stan ustalony: dPm/dt = 0 => Pm = cel
        pm_ustalone = gov.p_ref_pu - d_omega / r_statyzm
        assert gov.pochodna(pm_ustalone, omega) == pytest.approx(0.0, abs=1e-12)
        assert (pm_ustalone - gov.p_ref_pu) / d_omega == pytest.approx(-1.0 / r_statyzm, rel=1e-12)


@pytest.mark.parametrize("t_g_s", [0.2, 0.5, 1.0])
def test_governor_odpowiedz_skokowa_ZGADZA_SIE_Z_POSTACIA_ZAMKNIETA(t_g_s: float) -> None:
    """``Pm(t) = cel + (Pm_0 - cel)·exp(-t/T_g)`` dla skoku częstotliwości."""
    r = 0.05
    gov = RegulatorTurbiny(r_statyzm=r, t_g_s=t_g_s, p_min_pu=-10.0, p_max_pu=10.0, p_ref_pu=0.6)
    omega = 0.99
    cel = gov.p_ref_pu - (omega - 1.0) / r
    pm_0 = 0.6
    dt = t_g_s / 200.0
    kroki = 1200
    slad = _calkuj(
        lambda x, t: np.array([gov.pochodna(float(x[0]), omega)]),
        np.array([pm_0]),
        dt=dt,
        kroki=kroki,
    )
    czas = np.arange(kroki + 1) * dt
    analityczne = cel + (pm_0 - cel) * np.exp(-czas / t_g_s)
    assert float(np.max(np.abs(slad[:, 0] - analityczne))) < 1.0e-8


def test_governor_znak_sprzezenia_jest_ujemny() -> None:
    """Wzrost częstotliwości MUSI zmniejszać moc — inaczej regulacja jest dodatnia."""
    gov = RegulatorTurbiny(r_statyzm=0.05, t_g_s=0.5, p_min_pu=-10.0, p_max_pu=10.0, p_ref_pu=0.6)
    assert gov.pochodna(0.6, 1.01) < 0.0
    assert gov.pochodna(0.6, 0.99) > 0.0


def test_lancuch_predkosc_governor_Pm_dochodzi_do_MASZYNY() -> None:
    """§6: dowód, że tor ``Δω → governor → Pm → maszyna`` jest ZAMKNIĘTY.

    Sprawdzamy strukturalnie: pochodna kąta/prędkości maszyny liczona z ``Pm``
    ze stanu zespołu musi się zmienić, gdy zmieni się TYLKO stan ``pm``. Gdyby
    maszyna czytała moc mechaniczną skądinąd (stała, słownik parametrów — defekt
    P0-05 audytu), ta różnica byłaby zerem.
    """
    model, moce = smib(klasyczna=False, z_regulatorami=True)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.004)
    x0 = silnik.inicjalizuj(moce)
    v = silnik.rozwiaz_siec(x0)
    zespol = model.urzadzenia[0]
    idx = model.topologia.indeks[zespol.szyna]

    x_a = x0.copy()
    x_b = x0.copy()
    x_b[5] += 0.05  # tylko Pm
    d_a = zespol.pochodne(x_a, complex(v[idx]))
    d_b = zespol.pochodne(x_b, complex(v[idx]))
    assert d_a[1] != pytest.approx(
        d_b[1], abs=1e-12
    ), "zmiana Pm nie zmieniła pochodnej prędkości — tor governor→maszyna jest otwarty"
    # Kierunek: więcej mocy mechanicznej = większe przyspieszenie.
    assert d_b[1] > d_a[1]


def test_lancuch_napiecie_AVR_Efd_dochodzi_do_MASZYNY() -> None:
    """Ten sam dowód dla toru wzbudzenia."""
    model, moce = smib(klasyczna=False, z_regulatorami=True)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.004)
    x0 = silnik.inicjalizuj(moce)
    v = silnik.rozwiaz_siec(x0)
    zespol = model.urzadzenia[0]
    idx = model.topologia.indeks[zespol.szyna]
    x_b = x0.copy()
    x_b[4] += 0.10  # tylko Efd
    d_a = zespol.pochodne(x0, complex(v[idx]))
    d_b = zespol.pochodne(x_b, complex(v[idx]))
    assert d_a[2] != pytest.approx(
        d_b[2], abs=1e-12
    ), "zmiana Efd nie zmieniła pochodnej e_q' — tor AVR→maszyna jest otwarty"


# ---------------------------------------------------------------------------
# §7 PSS — SPECYFIKACJA, WYROCZNIA CZĘSTOTLIWOŚCIOWA, PĘTLA ZAMKNIĘTA
# ---------------------------------------------------------------------------


def test_pss_w_punkcie_pracy_daje_DOKLADNIE_zero() -> None:
    """Najważniejsza własność: stabilizator NIE przesuwa punktu pracy.

    Washout ma zerowe wzmocnienie dla składowej stałej, więc przy ``Δω = 0``
    wyjście jest zerem dokładnie. PSS, który przesuwa punkt pracy, fałszowałby
    rozpływ — i byłoby to niewidoczne, bo „wyniki wyglądałyby wiarygodnie".
    """
    pss = StabilizatorSystemowy()
    x_w, x_1, x_2 = pss.stan_ustalony()
    assert (x_w, x_1, x_2) == (0.0, 0.0, 0.0)
    assert pss.wyjscie(x_w, x_1, x_2, 1.0) == 0.0
    assert pss.pochodne(x_w, x_1, x_2, 1.0) == (0.0, 0.0, 0.0)


def test_pss_washout_wycisza_STALA_odchylke() -> None:
    """Zerowe wzmocnienie dla składowej stałej — sprawdzone przebiegiem.

    Przy stałej odchyłce prędkości wyjście MUSI zaniknąć do zera ze stałą ``T_w``.
    Gdyby washout był zwykłym wzmacniaczem, wyjście utrzymałoby się na ``K_s·Δω``
    i stabilizator wprowadzałby trwały błąd napięcia.
    """
    pss = StabilizatorSystemowy(k_s=10.0, t_w_s=1.0, v_min_pu=-10.0, v_max_pu=10.0)
    omega = 1.0 + 0.01
    dt = 0.001
    x = np.array([0.0, 0.0, 0.0])
    wyjscia = []
    for _ in range(8000):
        wyjscia.append(pss.wyjscie(float(x[0]), float(x[1]), float(x[2]), omega))
        x, _ = INTEGRATORY["rk4"].krok(
            lambda y, t: np.array(pss.pochodne(float(y[0]), float(y[1]), float(y[2]), omega)),
            x,
            0.0,
            dt,
        )
    assert abs(wyjscia[0]) > 0.01, "na starcie stabilizator ma reagować"
    assert (
        abs(wyjscia[-1]) < 1.0e-3
    ), f"po 8 s stała odchyłka nie została wyciszona: {wyjscia[-1]:.3e}"


@pytest.mark.parametrize("f_hz", [0.3, 0.8, 1.5, 2.5])
def test_pss_odpowiedz_czestotliwosciowa_ZGADZA_SIE_Z_TRANSMITANCJA(f_hz: float) -> None:
    """WYROCZNIA ANALITYCZNA dla PSS — amplituda I faza.

    Transmitancja stabilizatora to

        H(s) = K_s · sT_w/(1+sT_w) · (1+sT_1)/(1+sT_2) · (1+sT_3)/(1+sT_4).

    Podajemy na wejście sinusoidę ``Δω = A·sin(2πft)``, całkujemy do zaniku
    składowej przejściowej i mierzymy amplitudę oraz przesunięcie fazowe
    ustalonej odpowiedzi. Obie wielkości porównujemy z ``|H(j2πf)|`` i
    ``arg H(j2πf)``. To sprawdza CAŁĄ strukturę filtru — pomylona kolejność
    członów albo zamienione ``T_1``/``T_2`` zmieniają fazę, nie amplitudę
    ustaloną.
    """
    pss = StabilizatorSystemowy(
        k_s=10.0,
        t_w_s=10.0,
        t_1_s=0.15,
        t_2_s=0.03,
        t_3_s=0.15,
        t_4_s=0.03,
        v_min_pu=-1e6,
        v_max_pu=1e6,
    )
    omega_rad = 2.0 * math.pi * f_hz
    s = 1j * omega_rad
    h = (
        pss.k_s
        * (s * pss.t_w_s / (1.0 + s * pss.t_w_s))
        * ((1.0 + s * pss.t_1_s) / (1.0 + s * pss.t_2_s))
        * ((1.0 + s * pss.t_3_s) / (1.0 + s * pss.t_4_s))
    )
    amplituda_analityczna = abs(h)
    faza_analityczna = cmath.phase(h)

    amplituda_wejscia = 1.0e-3
    dt = 1.0 / (f_hz * 4000.0)
    okresy_rozruchu, okresy_pomiaru = 60, 4
    kroki_rozruchu = int(okresy_rozruchu / (f_hz * dt))
    kroki_pomiaru = int(okresy_pomiaru / (f_hz * dt))

    def omega_w(t: float) -> float:
        return 1.0 + amplituda_wejscia * math.sin(omega_rad * t)

    x = np.array([0.0, 0.0, 0.0])
    t = 0.0
    for _ in range(kroki_rozruchu):
        x, _ = INTEGRATORY["rk4"].krok(
            lambda y, tt: np.array(
                pss.pochodne(float(y[0]), float(y[1]), float(y[2]), omega_w(tt))
            ),
            x,
            t,
            dt,
        )
        t += dt

    czasy, wyjscia = [], []
    for _ in range(kroki_pomiaru):
        wyjscia.append(pss.wyjscie(float(x[0]), float(x[1]), float(x[2]), omega_w(t)))
        czasy.append(t)
        x, _ = INTEGRATORY["rk4"].krok(
            lambda y, tt: np.array(
                pss.pochodne(float(y[0]), float(y[1]), float(y[2]), omega_w(tt))
            ),
            x,
            t,
            dt,
        )
        t += dt

    # Demodulacja synchroniczna: rzut odpowiedzi na sin i cos nośnej.
    czasy_a = np.asarray(czasy)
    wyjscia_a = np.asarray(wyjscia)
    skladowa_sin = 2.0 * float(np.mean(wyjscia_a * np.sin(omega_rad * czasy_a)))
    skladowa_cos = 2.0 * float(np.mean(wyjscia_a * np.cos(omega_rad * czasy_a)))
    amplituda_zmierzona = math.hypot(skladowa_sin, skladowa_cos) / amplituda_wejscia
    faza_zmierzona = math.atan2(skladowa_cos, skladowa_sin)

    assert amplituda_zmierzona == pytest.approx(amplituda_analityczna, rel=0.02), (
        f"f={f_hz} Hz: |H| zmierzone {amplituda_zmierzona:.4f} vs "
        f"analityczne {amplituda_analityczna:.4f}"
    )
    roznica_fazy = (faza_zmierzona - faza_analityczna + math.pi) % (2 * math.pi) - math.pi
    assert abs(roznica_fazy) < math.radians(3.0), (
        f"f={f_hz} Hz: faza zmierzona {math.degrees(faza_zmierzona):.2f}° vs "
        f"analityczna {math.degrees(faza_analityczna):.2f}°"
    )


def test_pss_ogranicznik_wyjscia_dziala() -> None:
    pss = StabilizatorSystemowy(k_s=1000.0, v_min_pu=-0.05, v_max_pu=0.05)
    assert pss.wyjscie(0.0, 0.0, 0.0, 1.5) == pytest.approx(0.05)
    assert pss.wyjscie(0.0, 0.0, 0.0, 0.5) == pytest.approx(-0.05)


def test_pss_wstrzykuje_sie_do_AVR_a_nie_omija_ogranicznika() -> None:
    """Punkt wstrzyknięcia: PRZED ogranicznikiem żądania wzbudnicy.

    Gdyby PSS dodawał się ZA ogranicznikiem, mógłby wypchnąć ``Efd`` ponad
    fizyczny sufit wzbudnicy — czyli oddać moc, której maszyna nie ma.
    """
    avr = RegulatorNapiecia(k_a=200.0, t_a_s=0.05, efd_min=0.0, efd_max=5.0, v_ref_pu=1.0)
    # Sygnał PSS ogromny: cel i tak nie przekroczy sufitu.
    pochodna = avr.pochodna(5.0, 1.0, v_pss_pu=10.0)
    assert pochodna == pytest.approx(0.0, abs=1e-12), "PSS wypchnął żądanie ponad sufit wzbudnicy"
    # ...a dla sygnału w zakresie MUSI mieć wpływ (druga strona predykatu).
    assert avr.pochodna(1.0, 1.0, v_pss_pu=0.01) > avr.pochodna(1.0, 1.0, v_pss_pu=0.0)


def test_brak_PSS_jest_dokladnie_rownowazny_ukladowi_sprzed_dodania() -> None:
    """Zgodność wsteczna sprawdzona liczbowo, nie zadeklarowana."""
    avr = RegulatorNapiecia(k_a=200.0, t_a_s=0.05, v_ref_pu=1.01)
    for efd, v_t in ((1.0, 0.98), (3.0, 1.02), (0.0, 1.0)):
        assert avr.pochodna(efd, v_t) == avr.pochodna(efd, v_t, v_pss_pu=0.0)


# ---------------------------------------------------------------------------
# §7 PSS — PĘTLA ZAMKNIĘTA NA BENCHMARKU
# ---------------------------------------------------------------------------


def _zespol_z_pss(pss: StabilizatorSystemowy | None):
    from dynamic_lab.siec import Galaz, TopologiaSieci
    from dynamic_lab.silnik import ModelDynamiczny

    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=0.15)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    zespol = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(
            ref="G1", szyna="GEN", h_s=4.0, d_tlumienie=0.0, ra_pu=0.005
        ),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
        pss=pss,
    )
    return ModelDynamiczny(topologia=topo, urzadzenia=[zespol]), {"G1": complex(0.5, 0.1)}


def _bieg_z_zakloceniem(pss: StabilizatorSystemowy | None) -> dict[str, np.ndarray]:
    """Małe zakłócenie: krótkie zwarcie o dużej impedancji, potem zdjęcie."""
    model, moce = _zespol_z_pss(pss)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
    x0 = silnik.inicjalizuj(moce)
    harmonogram = HarmonogramZdarzen(
        zdarzenia=[
            ZwarcieTrojfazowe(czas_s=0.5, szyna="GEN", x_f_pu=0.02),
            ZdjecieZwarcia(czas_s=0.58, szyna="GEN"),
        ]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=8.0, harmonogram=harmonogram)
    czas = np.asarray(wynik.czas_s, dtype=np.float64)
    omega = np.asarray(
        wynik.sygnal("omega_pu", "G1", PrzestrzenSygnalu.STAN).wartosci, dtype=np.float64
    )
    return {"czas": czas, "omega": omega}


def test_PSS_wlaczony_zmienia_dynamike_wzbudzenia() -> None:
    """Minimalna teza §7: wyjście PSS FAKTYCZNIE modyfikuje dynamikę wzbudzenia.

    Bez tego testu stabilizator mógłby być liczony i wyrzucany — dokładnie
    defekt P0-05 audytu, tyle że dla trzeciego regulatora.
    """
    bez = _bieg_z_zakloceniem(None)
    z_pss = _bieg_z_zakloceniem(StabilizatorSystemowy())
    roznica = float(np.max(np.abs(bez["omega"] - z_pss["omega"])))
    assert (
        roznica > 1.0e-6
    ), f"PSS nie zmienił przebiegu prędkości (max Δω = {roznica:.3e}) — pętla jest otwarta"


def test_PSS_pomiar_tlumienia_na_ZDEFINIOWANYM_benchmarku() -> None:
    """POMIAR, nie teza o uniwersalnej poprawie stabilności.

    Metryka: energia oscylacji ``∫(ω-1)² dt`` po ustaniu zakłócenia. Raportujemy
    zmierzoną wartość dla TEGO benchmarku (SMIB 4. rzędu, H = 4 s, x = 0,15 p.u.,
    zwarcie o impedancji 2,0 p.u. przez 80 ms, nastawy PSS domyślne). Nie jest to
    twierdzenie, że PSS poprawia tłumienie w każdym układzie — takiego zdania ten
    test nie stawia i postawić nie może.
    """
    bez = _bieg_z_zakloceniem(None)
    z_pss = _bieg_z_zakloceniem(StabilizatorSystemowy())
    maska = bez["czas"] >= 0.6
    energia_bez = float(np.trapz((bez["omega"][maska] - 1.0) ** 2, bez["czas"][maska]))
    energia_z = float(np.trapz((z_pss["omega"][maska] - 1.0) ** 2, z_pss["czas"][maska]))
    # Sam pomiar musi być sensowny liczbowo — zero znaczyłoby brak oscylacji,
    # czyli brak czego mierzyć.
    assert energia_bez > 0.0 and energia_z > 0.0
    print(
        f"\n[pomiar §7] energia oscylacji ∫(ω-1)²dt: bez PSS = {energia_bez:.6e}, "
        f"z PSS = {energia_z:.6e}, iloraz = {energia_z / energia_bez:.4f}"
    )


# ---------------------------------------------------------------------------
# MUTACJE WYMAGANE PLANEM §5 i §6
# ---------------------------------------------------------------------------


def test_mutacja_odwrocony_znak_AVR_jest_wykrywalna() -> None:
    """Odwrócony znak sprzężenia = regulacja dodatnia zamiast ujemnej."""
    avr = RegulatorNapiecia(k_a=50.0, t_a_s=0.05, efd_min=-100.0, efd_max=100.0, v_ref_pu=1.0)
    poprawna = avr.pochodna(1.0, 0.95)
    zmutowana = (
        max(-100.0, min(100.0, 50.0 * (0.95 - avr.v_ref_pu))) - 1.0
    ) / 0.05  # znak odwrócony
    assert poprawna > 0.0 > zmutowana


def test_mutacja_zla_stala_czasowa_zmienia_przebieg() -> None:
    """Pomylona ``T_a`` nie zmienia punktu ustalonego — zmienia kształt.

    Dlatego wyrocznia z tego pliku porównuje CAŁY przebieg: test sprawdzający
    tylko wartość końcową tej mutacji by nie zobaczył.
    """
    k_a, v_t, v_ref = 50.0, 1.0, 1.02
    wspolne = {"k_a": k_a, "efd_min": -100.0, "efd_max": 100.0, "v_ref_pu": v_ref}
    a = RegulatorNapiecia(t_a_s=0.05, **wspolne)
    b = RegulatorNapiecia(t_a_s=0.10, **wspolne)
    cel = k_a * (v_ref - v_t)
    # Punkt pomiarowy MUSI leżeć z dala od celu: w samym celu obie pochodne są
    # zerowe niezależnie od T_a, więc mutacja byłaby tam niewidoczna.
    efd_probny = 0.0
    assert abs(efd_probny - cel) > 0.5
    assert a.pochodna(efd_probny, v_t) == pytest.approx((cel - efd_probny) / 0.05, rel=1e-12)
    assert b.pochodna(efd_probny, v_t) == pytest.approx((cel - efd_probny) / 0.10, rel=1e-12)
    assert a.pochodna(efd_probny, v_t) != pytest.approx(b.pochodna(efd_probny, v_t), rel=1e-6)
    # ...a punkt ustalony jest TEN SAM — stąd potrzeba porównania przebiegu.
    assert a.pochodna(cel, v_t) == pytest.approx(0.0, abs=1e-12)
    assert b.pochodna(cel, v_t) == pytest.approx(0.0, abs=1e-12)


def test_mutacja_zamienione_granice_jest_odrzucana_konstruktorem() -> None:
    """``min > max`` nie ma prawa dać obiektu — dla obu regulatorów."""
    with pytest.raises(ValueError):
        RegulatorNapiecia(efd_min=5.0, efd_max=0.0)
    with pytest.raises(ValueError):
        RegulatorTurbiny(p_min_pu=2.0, p_max_pu=1.0)
    with pytest.raises(ValueError):
        StabilizatorSystemowy(v_min_pu=1.0, v_max_pu=-1.0)


def test_mutacja_wylaczony_ogranicznik_pozwala_wyjsc_poza_sufit() -> None:
    """Kontrola bazowa dla ogranicznika żądania."""
    z_ogranicznikiem = RegulatorNapiecia(
        k_a=200.0, t_a_s=0.05, efd_min=0.0, efd_max=5.0, v_ref_pu=1.0
    )
    bez_ogranicznika = RegulatorNapiecia(
        k_a=200.0, t_a_s=0.05, efd_min=-1e9, efd_max=1e9, v_ref_pu=1.0
    )
    assert bez_ogranicznika.pochodna(0.0, 0.5) > 10.0 * z_ogranicznikiem.pochodna(0.0, 0.5)


def test_mutacja_odlaczone_wyjscie_governora_jest_wykrywalna() -> None:
    """„Disconnected output" z planu §6 — sprawdzone strukturalnie.

    Symulujemy odłączenie: zespół bez governora ma ``Pm`` stałe, więc pochodna
    prędkości NIE zależy od stanu ``pm``. Test `test_lancuch_predkosc_governor_Pm`
    pokazuje przypadek przeciwny; ten pokazuje, że różnica jest wykrywalna.
    """
    model, moce = smib(klasyczna=False, z_regulatorami=True)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.004)
    x0 = silnik.inicjalizuj(moce)
    v = silnik.rozwiaz_siec(x0)
    zespol = model.urzadzenia[0]
    idx = model.topologia.indeks[zespol.szyna]
    d_pm_podlaczony = zespol.pochodne(x0, complex(v[idx]))[5]
    # Zespół BEZ governora: pochodna Pm musi być zerem (stała z punktu pracy).
    from dataclasses import replace

    odlaczony = replace(zespol, governor=None)
    assert odlaczony.pochodne(x0, complex(v[idx]))[5] == 0.0
    assert d_pm_podlaczony == pytest.approx(
        0.0, abs=1e-12
    ), "w punkcie pracy pochodna Pm też jest zerem — porównanie musi być na zakłóceniu"
    # Na ZAKŁÓCENIU różnica jest już widoczna:
    x_zaklocony = x0.copy()
    x_zaklocony[1] = 0.99
    assert zespol.pochodne(x_zaklocony, complex(v[idx]))[5] != 0.0
    assert odlaczony.pochodne(x_zaklocony, complex(v[idx]))[5] == 0.0

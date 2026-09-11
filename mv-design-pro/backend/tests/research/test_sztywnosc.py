"""Benchmark sztywny (D-02) — testy pinujące KAŻDE mocne twierdzenie modułu.

KOD BADAWCZY — patrz `backend/research/README.md`.

DLACZEGO TE TESTY WYGLĄDAJĄ TAK, A NIE INACZEJ
----------------------------------------------
``dynamic_lab.sztywnosc`` twierdzi w docstringu rzeczy mocne i liczbowe: że
przypadek jest sztywny (wskaźnik 4,3·10³), że metody jawne mają sufit kroku
zgodny ze wzorem ``2/|λ|max``, że trapez przy 20 ms bije Eulera jawnego przy
1 ms, i — uczciwie — że RK4 nadal wygrywa w reżimie wysokiej dokładności.
Twierdzenie bez przypiętego testu jest groźniejsze niż defekt, bo wyłącza
czujność. Każda z tych tez ma tu swój test.

Testy są WŁASNOŚCIAMI i ILOCZYNAMI CECH, nie przykładami:
  - metamorficzne: „przyspieszenie pętli prądowej skraca krok jawny i NIE
    zmienia niejawnego" — iloczyn {stała czasowa} × {jawny, niejawny},
  - wyrocznia analityczna: zmierzona granica stabilności wobec zamkniętego
    wzoru teorii liniowej; zmierzona wartość własna wobec ``−1/T``,
  - granice modelu: falownik ODMAWIA liczenia poza zakresem ważności — i to
    też jest przypięte, bo cicha liczba byłaby fabrykacją.

Czas wykonania całego pliku to ok. 2 minuty: pomiary są prawdziwymi symulacjami,
a nie atrapami. Wspólne fikstury mają zasięg modułu, żeby nie płacić dwa razy.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.sztywnosc import (
    STANY_PRZYPADKU,
    FalownikZKaskadaRegulacji,
    PomiarIntegratora,
    PozaZakresemModeluError,
    jakobian_numeryczny,
    krok_graniczny_stabilnosci,
    maksymalny_krok_dokladnosci,
    porownaj_integratory_na_przypadku_sztywnym,
    przypadek_sztywny,
    raport_sztywnosci,
    silnik_przypadku,
    stan_zaburzony,
    tabela_porownania,
    widmo_jakobianu,
    zmierz_integrator,
    zmierz_iteracje_newtona,
)

METODY_NIEJAWNE = ("euler_niejawny", "trapez_niejawny")
METODY_JAWNE = ("euler_jawny", "rk4")

#: Stała wzmocnienia obszaru stabilności metody. Euler jawny: obszarem jest koło
#: |1+z| ≤ 1, więc na osi rzeczywistej granicą jest z = −2. RK4: granicą jest
#: pierwiastek ``|1 + z + z²/2 + z³/6 + z⁴/24| = 1`` na ujemnej półosi, czyli
#: z = −2,7853. Obie wartości są ZAMKNIĘTYMI wzorami teorii, niezależnymi od tej
#: implementacji — to czyni porównanie wyrocznią analityczną (W2), nie własnością.
GRANICA_OBSZARU_STABILNOSCI: dict[str, float] = {"euler_jawny": 2.0, "rk4": 2.7853}


def _pomiar(pomiary: tuple[PomiarIntegratora, ...], nazwa: str, krok_s: float) -> PomiarIntegratora:
    """Wyciągnij jeden pomiar; brak pozycji jest błędem testu, nie ciszą."""
    for pomiar in pomiary:
        if pomiar.nazwa == nazwa and math.isclose(pomiar.krok_s, krok_s):
            return pomiar
    raise AssertionError(f"Brak pomiaru {nazwa} @ {krok_s * 1000:.2f} ms w zestawie")


# --------------------------------------------------------------------------
# Fikstury — pomiary są kosztowne, liczymy je raz na moduł
# --------------------------------------------------------------------------

KROKI_BENCHMARKU: tuple[float, ...] = (0.001, 0.002, 0.005, 0.010, 0.020)


@pytest.fixture(scope="module")
def pomiary() -> tuple[PomiarIntegratora, ...]:
    """Pełna tabela porównania w konfiguracji UDOKUMENTOWANEJ w module."""
    return porownaj_integratory_na_przypadku_sztywnym(kroki_s=KROKI_BENCHMARKU, czas_koncowy_s=1.0)


@pytest.fixture(scope="module")
def granice_1ms() -> dict[str, object]:
    return {nazwa: krok_graniczny_stabilnosci(nazwa) for nazwa in sorted(INTEGRATORY)}


@pytest.fixture(scope="module")
def granice_2ms() -> dict[str, object]:
    return {
        nazwa: krok_graniczny_stabilnosci(nazwa, t_pradu_s=0.002) for nazwa in sorted(INTEGRATORY)
    }


@pytest.fixture(scope="module")
def kroki_dokladnosci() -> dict[str, object]:
    """Największy krok przy progu 1e-3 rad — odpowiedź inżynierska na D-02."""
    return {
        nazwa: maksymalny_krok_dokladnosci(nazwa, prog_bledu=1.0e-3)
        for nazwa in sorted(INTEGRATORY)
    }


# --------------------------------------------------------------------------
# 1. Sztywność przypadku — POMIAR, nie przymiotnik
# --------------------------------------------------------------------------


def test_wskaznik_sztywnosci_przekracza_prog() -> None:
    """Bez tej liczby cały benchmark byłby porównaniem na zadaniu niesztywnym.

    Wartość zmierzona: 4,29·10³ przy pętli prądowej 1 ms. Próg 100 jest granicą,
    powyżej której metody jawne przestają być ograniczane dokładnością, a
    zaczynają — stabilnością.
    """
    widmo = widmo_jakobianu()
    assert widmo.wskaznik_sztywnosci > 100.0
    assert widmo.wskaznik_sztywnosci == pytest.approx(4.29e3, rel=0.05)
    assert widmo.maks_re == pytest.approx(1000.0, rel=1e-4)
    assert widmo.min_re_niezerowe == pytest.approx(0.2333, rel=1e-3)


@pytest.mark.parametrize("t_pradu_s", [0.001, 0.002, 0.005])
def test_najszybsze_wartosci_wlasne_zgadzaja_sie_z_odwrotnoscia_stalej_czasowej(
    t_pradu_s: float,
) -> None:
    """WYROCZNIA ANALITYCZNA (C2/W2): dwa najszybsze mody to ``−1/T_pradu``.

    Wzór jest wyprowadzony niezależnie od implementacji: pętla prądowa ma
    równanie ``di/dt = (i_zad − i)/T``, więc wiersz jakobianu ma na przekątnej
    ``−1/T`` i sprzęga się z resztą modelu wyłącznie przez ``i_zad``. Zgodność
    w granicach 1 % dla trzech różnych stałych czasowych dowodzi, że sztywność
    pochodzi z ZAMIERZONEGO źródła, a nie z przypadkowego artefaktu numerycznego.
    """
    widmo = widmo_jakobianu(t_pradu_s=t_pradu_s)
    oczekiwana = 1.0 / t_pradu_s
    najszybsze = sorted((abs(w.real) for w in widmo.wartosci_wlasne), reverse=True)[:2]
    for wartosc in najszybsze:
        assert wartosc == pytest.approx(oczekiwana, rel=0.01)
    # Trzecia wartość musi być o rzędy wolniejsza — inaczej „dwie skale czasowe"
    # byłoby opisem, a nie faktem.
    trzecia = sorted((abs(w.real) for w in widmo.wartosci_wlasne), reverse=True)[2]
    assert trzecia < 0.05 * oczekiwana


def test_zerowe_wartosci_wlasne_sa_strukturalne() -> None:
    """Zera są policzalne z góry, więc filtr niezerowości ma jawne uzasadnienie.

    Maszyna pracuje bez AVR i governora, więc ``Efd`` i ``Pm`` są stanami stałymi:
    ich wiersze jakobianu są IDENTYCZNIE zerowe. Gdyby zera pochodziły z szumu,
    filtr we wskaźniku sztywności byłby zamiataniem problemu pod dywan.
    """
    silnik, x0 = silnik_przypadku()
    jakobian = jakobian_numeryczny(silnik, x0)
    indeks_efd = [nazwa for _, nazwa in STANY_PRZYPADKU].index("efd_pu")
    indeks_pm = [nazwa for _, nazwa in STANY_PRZYPADKU].index("pm_pu")
    assert np.all(jakobian[indeks_efd] == 0.0)
    assert np.all(jakobian[indeks_pm] == 0.0)

    widmo = widmo_jakobianu()
    assert widmo.liczba_zerowych == 2
    posortowane = sorted(abs(w.real) for w in widmo.wartosci_wlasne)
    assert posortowane[1] < 1.0e-9 * widmo.maks_re
    assert posortowane[2] > 0.2


@pytest.mark.parametrize("prog_wzgledny", [1.0e-9, 1.0e-6, 1.0e-4])
def test_wskaznik_sztywnosci_nie_zalezy_od_doboru_progu_zera(prog_wzgledny: float) -> None:
    """Margines między zerem strukturalnym a najwolniejszym modem to 5 rzędów.

    Docstring ``widmo_jakobianu`` twierdzi, że dobór progu nie jest dowolny, bo
    margines jest o rzędy większy niż niepewność pomiaru. To jest to twierdzenie,
    sprawdzone przez zmianę progu o pięć rzędów wielkości.
    """
    widmo = widmo_jakobianu(prog_zera_wzgledny=prog_wzgledny)
    assert widmo.liczba_zerowych == 2
    assert widmo.wskaznik_sztywnosci == pytest.approx(4.29e3, rel=0.05)


def test_wskaznik_sztywnosci_rosnie_gdy_petla_pradowa_przyspiesza() -> None:
    """WŁASNOŚĆ METAMORFICZNA: sztywność jest własnością rozstawu skal czasowych.

    Pięciokrotne przyspieszenie pętli prądowej (5 ms → 1 ms) musi pięciokrotnie
    podnieść wskaźnik, bo mody wolne pozostają bez zmian. Gdyby wskaźnik nie
    reagował, mierzyłby coś innego niż sztywność.
    """
    wolna = widmo_jakobianu(t_pradu_s=0.005)
    szybka = widmo_jakobianu(t_pradu_s=0.001)
    assert szybka.wskaznik_sztywnosci / wolna.wskaznik_sztywnosci == pytest.approx(5.0, rel=0.02)
    assert szybka.min_re_niezerowe == pytest.approx(wolna.min_re_niezerowe, rel=1e-3)


def test_mod_wahan_elektromechanicznych_ma_realna_czestotliwosc() -> None:
    """1,17 Hz to wielkość spotykana w sieci — przypadek nie jest fikcją liczbową."""
    widmo = widmo_jakobianu()
    czestotliwosc = widmo.czestotliwosc_modu_wahan_hz
    assert czestotliwosc is not None
    assert 0.2 < czestotliwosc < 3.0
    assert czestotliwosc == pytest.approx(1.174, rel=0.02)


# --------------------------------------------------------------------------
# 2. Model falownika — równowaga i GRANICE (zero fabrykacji)
# --------------------------------------------------------------------------


def test_falownik_startuje_w_scislej_rownowadze() -> None:
    """Docstring falownika twierdzi, że wszystkie cztery pochodne są zerowe.

    ``SilnikRMS.inicjalizuj`` weryfikuje ``‖f(x0,y0)‖ ≤ tolerancja`` i podnosi
    wyjątek, gdy start nie jest równowagą — brak wyjątku jest już dowodem, ale
    sprawdzamy też samą normę, bo próg silnika (1e-6) jest luźniejszy niż to,
    co ten model osiąga.
    """
    silnik, x0 = silnik_przypadku()
    assert silnik.norma_pochodnej(x0) < 1.0e-9


def test_falownik_odmawia_liczenia_ponizej_granicy_waznosci() -> None:
    """Zaślepka zwracająca liczbę byłaby gorsza niż brak funkcji.

    Model nie ma ogranicznika prądu ani trybu FRT, więc przy głębokim zapadzie
    napięcia jego równania dałyby prąd rosnący bez ograniczenia. Wszystkie trzy
    wejścia (pochodne, wstrzyknięcie, inicjalizacja) muszą odmówić — pominięcie
    jednego zostawiłoby cichą ścieżkę fabrykacji.
    """
    falownik = FalownikZKaskadaRegulacji(ref="INV", szyna="SN", napiecie_minimalne_pu=0.2)
    stan = np.array([0.4, 0.05, 0.4, 0.05], dtype=np.float64)
    zapad = complex(0.05, 0.0)
    with pytest.raises(PozaZakresemModeluError):
        falownik.pochodne(stan, zapad)
    with pytest.raises(PozaZakresemModeluError):
        falownik.wstrzykniecie(stan, zapad)
    with pytest.raises(PozaZakresemModeluError):
        falownik.inicjalizuj(zapad, complex(0.4, 0.05))


def test_falownik_odrzuca_konfiguracje_bez_rozdzialu_skal_czasowych() -> None:
    """Kaskada bez rozdziału skal nie jest kaskadą — i nie byłaby sztywna."""
    with pytest.raises(ValueError, match="SZYBSZA"):
        FalownikZKaskadaRegulacji(ref="INV", szyna="SN", t_pradu_s=0.2, t_mocy_s=0.2)
    with pytest.raises(ValueError):
        FalownikZKaskadaRegulacji(ref="INV", szyna="SN", t_pradu_s=0.0)


def test_moc_falownika_odpowiada_zadanej_w_punkcie_pracy() -> None:
    """WYROCZNIA: z definicji wstrzyknięcia ``S = |V|·(i_d + j·i_q)``.

    Sprawdzane na NIEJEDNOSTKOWYM napięciu i niezerowym kącie, bo przy ``V = 1∠0``
    błąd w transformacji ramy byłby niewidoczny — to jest iloczyn cech
    {moduł ≠ 1} × {kąt ≠ 0}.
    """
    falownik = FalownikZKaskadaRegulacji(ref="INV", szyna="SN")
    v = 0.93 * complex(math.cos(0.21), math.sin(0.21))
    s_zadane = complex(0.4, 0.05)
    stan = falownik.inicjalizuj(v, s_zadane)
    prad = falownik.wstrzykniecie(stan, v)
    moc = v * np.conj(prad)
    assert moc.real == pytest.approx(s_zadane.real, rel=1e-12)
    assert moc.imag == pytest.approx(s_zadane.imag, rel=1e-12)
    assert np.allclose(falownik.pochodne(stan, v), 0.0, atol=1e-15)


def test_zaburzenie_trafia_w_kat_wirnika_maszyny() -> None:
    """``stan_zaburzony`` zakłada, że indeks 0 to ``delta`` maszyny G1.

    Założenie o kolejności urządzeń w modelu jest niewidoczne w kodzie funkcji;
    bez tego testu przestawienie listy urządzeń cicho przesunęłoby zaburzenie na
    inny stan i cały benchmark mierzyłby co innego.
    """
    model, _ = przypadek_sztywny()
    assert model.urzadzenia[0].ref == "G1"
    assert model.urzadzenia[0].nazwy_stanow()[0] == "delta_rad"
    assert STANY_PRZYPADKU[0] == ("G1", "delta_rad")

    _, x0 = silnik_przypadku()
    x = stan_zaburzony(x0, przyrost_kata_deg=5.0)
    assert x[0] - x0[0] == pytest.approx(math.radians(5.0))
    assert np.allclose(x[1:], x0[1:])


# --------------------------------------------------------------------------
# 3. Istota sztywności: jawne padają tam, gdzie niejawne są dokładne
# --------------------------------------------------------------------------


def test_euler_jawny_traci_stabilnosc_tam_gdzie_metody_niejawne_sa_dokladne(
    pomiary: tuple[PomiarIntegratora, ...],
) -> None:
    """TO JEST ISTOTA SZTYWNOŚCI — jeśli tego nie widać, przypadek nie jest sztywny.

    Przy dt = 5 ms Euler jawny rozbiega się (``|1 + dt·λ| = 4`` dla λ = −1000),
    a obie metody niejawne trzymają błąd poniżej 1e-2 rad, czyli poniżej 12 %
    zaburzenia startowego (5° = 0,0873 rad).
    """
    jawny = _pomiar(pomiary, "euler_jawny", 0.005)
    assert not jawny.stabilny
    assert jawny.powod_niepowodzenia is not None
    assert jawny.blad_max is None

    for nazwa in METODY_NIEJAWNE:
        niejawny = _pomiar(pomiary, nazwa, 0.005)
        assert niejawny.stabilny, nazwa
        assert niejawny.blad_max is not None
        assert niejawny.blad_max < 1.0e-2, nazwa


def test_rk4_takze_traci_stabilnosc_mimo_czwartego_rzedu(
    pomiary: tuple[PomiarIntegratora, ...],
) -> None:
    """Iloczyn cech {rząd metody} × {jawna/niejawna}: rząd NIE ratuje przed sztywnością.

    RK4 jest o trzy rzędy dokładniejszy od Eulera jawnego przy dt = 2 ms
    (2,2e−07 vs 2,2e−03 rad) i mimo to pada przy 5 ms. Gdyby test sprawdzał tylko
    Eulera jawnego, można by wyciągnąć fałszywy wniosek „wystarczy podnieść rząd".
    """
    assert _pomiar(pomiary, "rk4", 0.002).stabilny
    assert _pomiar(pomiary, "rk4", 0.002).blad_max == pytest.approx(2.20e-7, rel=0.2)
    for krok in (0.005, 0.010, 0.020):
        assert not _pomiar(pomiary, "rk4", krok).stabilny


@pytest.mark.parametrize("nazwa", METODY_NIEJAWNE)
def test_kazda_metoda_niejawna_osiaga_zadana_dokladnosc(
    pomiary: tuple[PomiarIntegratora, ...], nazwa: str
) -> None:
    """Każda metoda niejawna jest stabilna na CAŁYM zakresie kroków i dokładna.

    Próg 2e-2 rad przy dt = 20 ms to 23 % zaburzenia startowego — to jest granica
    użyteczności, nie granica jakości; różnice jakości między metodami niejawnymi
    pokazują osobne testy rzędu.
    """
    for krok in KROKI_BENCHMARKU:
        pomiar = _pomiar(pomiary, nazwa, krok)
        assert pomiar.stabilny, f"{nazwa} @ {krok}"
        assert pomiar.blad_max is not None
        assert pomiar.blad_max < 2.0e-2, f"{nazwa} @ {krok}"


@pytest.mark.parametrize(("nazwa", "rzad"), [("euler_niejawny", 1), ("trapez_niejawny", 2)])
def test_rzad_metody_niejawnej_widac_w_skalowaniu_bledu(
    pomiary: tuple[PomiarIntegratora, ...], nazwa: str, rzad: int
) -> None:
    """Podwojenie kroku mnoży błąd przez ``2^rzad`` — to odróżnia metody 1. i 2. rzędu.

    Bez tego testu zdanie „A-stabilność nie wystarcza, potrzebny rząd ≥ 2" byłoby
    deklaracją. Tutaj jest zmierzoną własnością obu metod.
    """
    for maly, duzy in ((0.005, 0.010), (0.010, 0.020)):
        blad_maly = _pomiar(pomiary, nazwa, maly).blad_max
        blad_duzy = _pomiar(pomiary, nazwa, duzy).blad_max
        assert blad_maly is not None and blad_duzy is not None
        assert blad_duzy / blad_maly == pytest.approx(2.0**rzad, rel=0.15)


def test_blad_rosnie_monotonicznie_z_krokiem(pomiary: tuple[PomiarIntegratora, ...]) -> None:
    """Przypina ZAŁOŻENIE bisekcji w ``_bisekcja_kroku``.

    Bisekcja szuka największego kroku spełniającego kryterium i zakłada, że
    kryterium jest monotoniczne. Gdyby błąd nie rósł monotonicznie z krokiem,
    zwrócony „maksymalny krok" byłby dowolnym punktem przedziału — liczbą bez
    znaczenia, podaną z pełnym przekonaniem.
    """
    for nazwa in sorted(INTEGRATORY):
        bledy = [
            (krok, _pomiar(pomiary, nazwa, krok).blad_max)
            for krok in KROKI_BENCHMARKU
            if _pomiar(pomiary, nazwa, krok).stabilny
        ]
        wartosci = [blad for _, blad in bledy]
        assert all(b is not None for b in wartosci)
        assert wartosci == sorted(wartosci), f"{nazwa}: błąd nie rośnie z krokiem ({bledy})"


# --------------------------------------------------------------------------
# 4. Bilans kosztu — obie strony, bo pomiar nie ma tezy
# --------------------------------------------------------------------------


def test_trapez_bije_eulera_jawnego_dokladnoscia_przy_porownywalnym_koszcie(
    pomiary: tuple[PomiarIntegratora, ...],
) -> None:
    """Główna teza D-02, przypięta liczbą: 20× dłuższy krok i mniejszy błąd.

    Trapez @ 20 ms: 5,49e−04 rad w 992 ewaluacjach.
    Euler jawny @ 1 ms: 1,08e−03 rad w 1001 ewaluacjach.
    """
    trapez = _pomiar(pomiary, "trapez_niejawny", 0.020)
    jawny = _pomiar(pomiary, "euler_jawny", 0.001)
    assert trapez.stabilny and jawny.stabilny
    assert trapez.blad_max is not None and jawny.blad_max is not None
    assert trapez.blad_max < jawny.blad_max
    assert trapez.ewaluacje_pochodnych <= jawny.ewaluacje_pochodnych
    assert trapez.krok_s / jawny.krok_s == pytest.approx(20.0)
    assert trapez.blad_max == pytest.approx(5.49e-4, rel=0.10)
    assert jawny.blad_max == pytest.approx(1.08e-3, rel=0.10)


def test_rk4_wygrywa_w_rezimie_bardzo_wysokiej_dokladnosci(
    pomiary: tuple[PomiarIntegratora, ...],
) -> None:
    """KONTR-TEZA, przypięta świadomie: przewaga metody niejawnej NIE jest bezwarunkowa.

    Ten test istnieje po to, żeby nie dało się cicho przekręcić wniosku D-02 w
    „trapez zawsze lepszy". W oknie stabilności RK4 daje o rząd mniejszy błąd
    przy sześciokrotnie mniejszej liczbie ewaluacji niż trapez.
    """
    rk4 = _pomiar(pomiary, "rk4", 0.002)
    trapez = _pomiar(pomiary, "trapez_niejawny", 0.001)
    assert rk4.stabilny and trapez.stabilny
    assert rk4.blad_max is not None and trapez.blad_max is not None
    assert rk4.blad_max < trapez.blad_max
    assert rk4.ewaluacje_pochodnych < trapez.ewaluacje_pochodnych


def test_a_stabilnosc_sama_nie_kupuje_dokladnosci(
    pomiary: tuple[PomiarIntegratora, ...],
) -> None:
    """Euler niejawny (A-stabilny, 1. rzędu) jest tak samo NIEDOKŁADNY jak jawny.

    Przy dt = 1 ms oba dają ~1,1e−03 rad, przy czym niejawny kosztuje 13 ewaluacji
    na krok zamiast jednej. To jest uzasadnienie wniosku „potrzebny rząd ≥ 2":
    A-stabilność rozszerza zakres KROKU, nie poprawia RZĘDU.
    """
    niejawny = _pomiar(pomiary, "euler_niejawny", 0.001)
    jawny = _pomiar(pomiary, "euler_jawny", 0.001)
    assert niejawny.blad_max is not None and jawny.blad_max is not None
    assert niejawny.blad_max == pytest.approx(jawny.blad_max, rel=0.05)
    assert niejawny.ewaluacje_na_krok == pytest.approx(13.0, rel=0.05)
    assert jawny.ewaluacje_na_krok == pytest.approx(1.0, rel=0.05)


# --------------------------------------------------------------------------
# 5. Kroki graniczne — wobec zamkniętego wzoru i wobec siebie
# --------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", METODY_JAWNE)
def test_krok_graniczny_metod_jawnych_zgadza_sie_ze_wzorem(
    granice_1ms: dict[str, object], nazwa: str
) -> None:
    """WYROCZNIA ANALITYCZNA (C2/W2): granica = stała obszaru stabilności / ``|λ|max``.

    Zmierzone: Euler jawny 2,034 ms wobec 2,000 ms; RK4 2,812 ms wobec 2,785 ms.
    Pasmo 0,8…1,3 obejmuje zarówno 5-procentową dokładność bisekcji, jak i
    odchyłkę linearyzacji od pełnego układu nieliniowego z algebrą sieci.
    """
    widmo = widmo_jakobianu()
    oczekiwany = GRANICA_OBSZARU_STABILNOSCI[nazwa] / widmo.maks_re
    zmierzony = granice_1ms[nazwa]
    assert not zmierzony.ograniczony_przedzialem
    assert 0.8 * oczekiwany <= zmierzony.krok_s <= 1.3 * oczekiwany


@pytest.mark.parametrize("nazwa", METODY_NIEJAWNE)
def test_metody_niejawne_nie_maja_granicy_stabilnosci_w_badanym_przedziale(
    granice_1ms: dict[str, object], nazwa: str
) -> None:
    """A-stabilność: kryterium spełnione w CAŁYM przedziale 0,5…50 ms.

    Flaga ``ograniczony_przedzialem`` musi być ustawiona — inaczej moduł podawałby
    50 ms jako „zmierzoną granicę", czyli liczbę udającą pomiar, którego nie było.
    """
    granica = granice_1ms[nazwa]
    assert granica.ograniczony_przedzialem
    assert granica.krok_s == pytest.approx(granica.przedzial_s[1])


def test_maksymalny_stabilny_krok_metody_jawnej_jest_istotnie_mniejszy(
    granice_1ms: dict[str, object],
) -> None:
    """Kryterium zadania: sufit metod jawnych musi być RZĘDY niżej niż niejawnych."""
    for jawna in METODY_JAWNE:
        for niejawna in METODY_NIEJAWNE:
            assert granice_1ms[jawna].krok_s < 0.2 * granice_1ms[niejawna].krok_s


def test_zaostrzenie_petli_pradowej_skraca_krok_jawny_a_nie_niejawny(
    granice_1ms: dict[str, object], granice_2ms: dict[str, object]
) -> None:
    """WŁASNOŚĆ METAMORFICZNA (C2/W1) — iloczyn {stała czasowa} × {jawny, niejawny}.

    Dwukrotne przyspieszenie pętli prądowej (2 ms → 1 ms) musi DWUKROTNIE skrócić
    krok graniczny metod jawnych i NIE RUSZYĆ metod niejawnych. To jest jedyny
    test, który odróżnia „metoda A-stabilna" od „metoda, która akurat przeszła":
    sprawdza reakcję na zmianę, a nie wartość w jednym punkcie.
    """
    for nazwa in METODY_JAWNE:
        stosunek = granice_2ms[nazwa].krok_s / granice_1ms[nazwa].krok_s
        assert stosunek == pytest.approx(2.0, rel=0.15), nazwa
    for nazwa in METODY_NIEJAWNE:
        assert granice_2ms[nazwa].krok_s == pytest.approx(granice_1ms[nazwa].krok_s)
        assert granice_2ms[nazwa].ograniczony_przedzialem


def test_maksymalny_krok_dokladnosci_wskazuje_trapez(
    kroki_dokladnosci: dict[str, object],
) -> None:
    """Odpowiedź inżynierska D-02 przy progu 1e-3 rad, zmierzona dla WSZYSTKICH metod.

    Zmierzone: euler_jawny 0,922 ms · euler_niejawny 0,922 ms · rk4 2,712 ms ·
    trapez_niejawny 26,165 ms. Dwie obserwacje, obie przypięte:
    (a) trapez daje o rząd dłuższy krok niż którakolwiek z pozostałych metod,
    (b) A-stabilny Euler niejawny NIE daje dłuższego kroku niż Euler jawny —
        ogranicza go rząd, nie stabilność.
    """
    trapez = kroki_dokladnosci["trapez_niejawny"].krok_s
    assert trapez == pytest.approx(26.2e-3, rel=0.10)
    assert trapez > 9.0 * max(
        kroki_dokladnosci[nazwa].krok_s for nazwa in ("euler_jawny", "euler_niejawny", "rk4")
    )
    assert kroki_dokladnosci["euler_niejawny"].krok_s == pytest.approx(
        kroki_dokladnosci["euler_jawny"].krok_s, rel=0.05
    )
    assert kroki_dokladnosci["rk4"].krok_s == pytest.approx(2.71e-3, rel=0.10)


def test_bisekcja_odmawia_zamiast_zwrocic_liczbe_gdy_kryterium_nie_zachodzi() -> None:
    """Próg nieosiągalny w całym przedziale musi dać wyjątek, nie „najlepszy krok".

    Zwrócenie najmniejszego badanego kroku byłoby odpowiedzią wyglądającą na
    pomiar, a niebędącą nim — dokładnie ten wzorzec zakazany w laboratorium.
    """
    with pytest.raises(ValueError, match="poza badanym przedziałem"):
        maksymalny_krok_dokladnosci(
            "euler_jawny",
            prog_bledu=1.0e-12,
            dolny_s=0.002,
            gorny_s=0.004,
            czas_koncowy_s=0.2,
        )


# --------------------------------------------------------------------------
# 6. Iteracje Newtona — pomiar bezpośredni, nie oszacowanie
# --------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", METODY_NIEJAWNE)
@pytest.mark.parametrize("krok_s", [0.005, 0.020])
def test_pomiar_iteracji_zgadza_sie_z_licznikiem_integratora(nazwa: str, krok_s: float) -> None:
    """Przypina REGUŁĘ ROZPOZNANIA sondy jakobianu, na której stoi cały pomiar.

    Jądro ``calkowanie._newton_niejawny`` wykonuje: 1 ewaluację w punkcie wyjścia,
    następnie dla każdej z ``m`` iteracji jedną ewaluację rezydualną, a po
    wszystkich oprócz ostatniej — ``n`` sond jakobianu. Stąd tożsamość

        ewaluacje = 1 + m + (m − 1)·n

    Jeśli reguła rozpoznania myliłaby sondę z iteracją (albo odwrotnie), ta
    tożsamość by pękła. Sprawdzana dla dwóch kroków, bo przy 20 ms liczba iteracji
    przestaje być stała i test przestaje być przykładem, a staje się własnością.
    """
    pomiar = zmierz_iteracje_newtona(nazwa, krok_s, liczba_krokow=10)
    assert pomiar is not None
    n = len(STANY_PRZYPADKU)
    oczekiwane = 1.0 + pomiar.iteracje_na_krok + (pomiar.iteracje_na_krok - 1.0) * n
    assert pomiar.ewaluacje_na_krok == pytest.approx(oczekiwane, rel=1e-9)
    assert pomiar.iteracje_na_krok >= 2.0


@pytest.mark.parametrize("nazwa", METODY_JAWNE)
def test_metody_jawne_nie_maja_iteracji_newtona(nazwa: str) -> None:
    """``None``, nie zero: metoda jawna nie ma iteracji, a zero byłoby liczbą.

    Podanie zera sugerowałoby „zmierzono, wyszło zero" — informację fałszywą.
    """
    assert zmierz_iteracje_newtona(nazwa, 0.001, liczba_krokow=3) is None


# --------------------------------------------------------------------------
# 7. Determinizm i prezentacja
# --------------------------------------------------------------------------


def test_wynik_nie_zalezy_od_kolejnosci_wywolan() -> None:
    """Determinizm: te same liczby niezależnie od kolejności integratorów i przebiegów.

    Ryzyko jest realne, nie teoretyczne: urządzenia laboratorium MUTUJĄ się przy
    inicjalizacji (falownik zapamiętuje ``P_ref``, zespół podmienia regulatory),
    a ``SilnikRMS`` trzyma zatwierdzony punkt startowy iteracji sieci. Gdyby
    model nie był budowany od nowa dla każdego przebiegu, wynik zależałby od
    historii wywołań.
    """
    pierwsze = porownaj_integratory_na_przypadku_sztywnym(
        kroki_s=(0.005,), czas_koncowy_s=0.3, nazwy=("rk4", "trapez_niejawny")
    )
    drugie = porownaj_integratory_na_przypadku_sztywnym(
        kroki_s=(0.005,), czas_koncowy_s=0.3, nazwy=("trapez_niejawny", "rk4")
    )
    assert [p.nazwa for p in pierwsze] == [p.nazwa for p in drugie]
    for a, b in zip(pierwsze, drugie, strict=True):
        assert a.blad_max == b.blad_max
        assert a.blad_kata_rad == b.blad_kata_rad
        assert a.ewaluacje_pochodnych == b.ewaluacje_pochodnych
        assert a.stabilny == b.stabilny


def test_powtorzony_pomiar_daje_identyczne_liczby() -> None:
    """Ten sam pomiar dwa razy — bit w bit. Bez tego żadna tabela nie jest wynikiem."""
    pierwszy = zmierz_integrator("trapez_niejawny", 0.01, czas_koncowy_s=0.3)
    drugi = zmierz_integrator("trapez_niejawny", 0.01, czas_koncowy_s=0.3)
    assert pierwszy.blad_max == drugi.blad_max
    assert pierwszy.blad_kata_rad == drugi.blad_kata_rad
    assert pierwszy.ewaluacje_pochodnych == drugi.ewaluacje_pochodnych
    assert pierwszy.liczba_krokow == drugi.liczba_krokow


def test_swiezy_silnik_nie_dziedziczy_stanu_po_poprzednim() -> None:
    """``silnik_przypadku`` musi budować model od nowa — inaczej mutacje się kumulują."""
    silnik_a, x_a = silnik_przypadku()
    silnik_b, x_b = silnik_przypadku()
    assert silnik_a is not silnik_b
    assert silnik_a.model is not silnik_b.model
    assert np.array_equal(x_a, x_b)
    assert isinstance(silnik_a, SilnikRMS)


def test_tabela_zawiera_kazdy_pomiar_i_oznacza_niestabilne(
    pomiary: tuple[PomiarIntegratora, ...],
) -> None:
    """Tabela jest jedynym miejscem, z którego liczby trafiają do meldunku.

    KOREKTA 2026-09-11. Test żądał wcześniej DOSŁOWNIE łańcucha
    ``"BrakZbieznosciSieciError"`` w tabeli — czyli zakładał, że przynajmniej
    jeden przypadek siatki padnie awarią solvera sieci. Po globalizacji solvera
    (nawrót niemonotoniczny + kierunek Levenberga–Marquardta, `dynamic_lab.siec`)
    ten sam przypadek już nie pada: niestabilność integratora nadal występuje i
    nadal jest oznaczona, ale nie przez błąd solvera.

    Dlatego test pilnuje teraz KONTRAKTU tabeli, a nie historycznego wyniku:
    każdy pomiar ma swój wiersz, niestabilność jest oznaczona, a kolumna „uwaga"
    niesie powód DOKŁADNIE tych przebiegów, które go mają. Asercja na konkretną
    klasę wyjątku wiązała test z metodą rozwiązywania sieci — a to nie jest jego
    przedmiot.
    """
    tabela = tabela_porownania(pomiary)
    linie = tabela.splitlines()
    assert len(linie) == len(pomiary) + 2
    for nazwa in sorted(INTEGRATORY):
        assert f"`{nazwa}`" in tabela

    niestabilne = [p for p in pomiary if not p.stabilny]
    assert niestabilne, (
        "Siatka pomiarowa nie zawiera ANI JEDNEGO przypadku niestabilnego — "
        "tabela nie ma czego oznaczać, więc test niczego nie broni. Rozszerz "
        "siatkę kroków albo horyzont."
    )
    assert tabela.count("| NIE |") == len(niestabilne), (
        f"Oznaczono {tabela.count('| NIE |')} przebiegów jako niestabilne, "
        f"a zmierzono {len(niestabilne)}."
    )
    # PREDYKATY PARAMI: powód niepowodzenia jest w tabeli DOKŁADNIE wtedy, gdy
    # jest w pomiarze — ani „uwaga" bez powodu, ani powód zgubiony po drodze.
    for p in pomiary:
        wiersz = next(
            w for w in linie[2:] if w.startswith(f"| `{p.nazwa}` | {p.krok_s * 1000:.2f} ")
        )
        if p.powod_niepowodzenia:
            assert p.powod_niepowodzenia in wiersz, (p.nazwa, p.krok_s, wiersz)
        else:
            assert wiersz.endswith("|  |"), f"uwaga bez powodu: {wiersz}"


def test_raport_laczy_widmo_tabele_i_iteracje() -> None:
    """Raport nie wystawia werdyktu — podaje liczby, na których werdykt się opiera."""
    raport = raport_sztywnosci(kroki_s=(0.005, 0.020), czas_koncowy_s=0.3)
    assert "wskaźnik sztywności" in raport
    assert "Iteracje Newtona" in raport
    assert "euler_jawny" in raport and "trapez_niejawny" in raport
    # Raport badawczy nie może udawać oceny gotowości ani statusu dowodowego.
    assert "gotow" not in raport.lower()

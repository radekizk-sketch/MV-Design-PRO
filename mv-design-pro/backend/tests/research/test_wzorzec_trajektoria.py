"""Trajektoria wobec ANDES — POMIAR NUMERYCZNY, nie walidacja fizyczna (§5).

CO TE TESTY PRZYPINAJĄ. Nie „zgodność z rzeczywistością" — oba narzędzia całkują
TEN SAM podręcznikowy model klasyczny, więc ich zgodność nie mówi nic o tym, czy
model opisuje maszynę. Przypinana jest ZGODNOŚĆ RACHUNKU oraz — to jest sedno
zmiany — MECHANIZM ROZSTRZYGANIA, który pozwala powiedzieć, CZYJ jest błąd.

MECHANIZM: trzeci arbiter. Dla maszyny klasycznej przy ``D = 0`` istnieje ścisła
całka pierwsza. Dryf po niej mierzy błąd całkowania bez odwoływania się do
drugiego narzędzia, więc rozbieżność przestaje być bezimienna.

BRAMKOWANIE — KOREKTA PO AUDYCIE (P1-B55-03 przeglądu cienia). Poprzednia
redakcja tego nagłówka twierdziła, że ``importorskip("andes")`` „obejmuje
wyłącznie testy WYMAGAJĄCE wzorca", a sonda stojąca w połowie pliku „nie jest
pomijana". To było NIEPRAWDĄ: ``importorskip`` na poziomie modułu przerywa jego
import, więc pomijane były WSZYSTKIE testy pliku — także szesnaście
niewymagających ANDES. Pozycja wywołania w pliku nie ma znaczenia.

Skutek był dowodowy, nie kosmetyczny: mutacja ``M-KON-04`` wskazuje ten plik
jako JEDYNĄ sondę, więc w środowisku bez ANDES kampania mutacyjna meldowała dla
niej „1 skipped" i nie potwierdzała deklarowanego kompletu.

Ten plik nie zależy od ANDES i NIE JEST bramkowany — jest obowiązkową, niezależną
sondą kontraktu przebiegu. Testy wymagające wzorca mieszkają w
``test_wzorzec_trajektoria_andes.py``.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from dynamic_lab.wzorzec_trajektoria import (
    MINIMUM_KROKOW_W_OKNIE,
    POLOWA_OKNA_PRZELACZENIA_S,
    SEMANTYKA_PRZELACZENIA,
    EkstrapolacjaZabronionaError,
    Odcinek,
    OsCzasuNiepoprawnaError,
    Przebieg,
    PrzypadekTrajektorii,
    dryf_niezmiennika,
    energia_maszyny_klasycznej,
    granice_odcinkow,
    przebiegi_laboratorium,
)

#: Punkt pracy wzorca ZMIERZONY raz i zapisany, żeby testy nieużywające ANDES
#: mogły ćwiczyć realną ścieżkę laboratorium bez uruchamiania wzorca.
Q_PUNKTU_PRACY_PU = 0.01877644271298366


# ---------------------------------------------------------------------------
# Kontrola osi czasu i zakaz ekstrapolacji — BEZ wzorca
# ---------------------------------------------------------------------------


def _przebieg(czas: list[float], wartosci: list[float]) -> Przebieg:
    return Przebieg(
        np.asarray(czas, dtype=np.float64),
        np.asarray(wartosci, dtype=np.float64),
        "rad",
        "test",
    )


def test_os_czasu_malejaca_jest_odrzucona() -> None:
    """Oś nierosnąca wywraca interpolację PO CICHU — musi być błędem.

    ``numpy.interp`` nie sprawdza monotoniczności: dla osi malejącej zwraca
    liczby, tyle że pozbawione znaczenia. Wynik wygląda wtedy na policzony, a
    porównanie trajektorii — na wykonane.
    """
    with pytest.raises(OsCzasuNiepoprawnaError, match="ściśle rosnąca"):
        _przebieg([0.0, 0.2, 0.1, 0.3], [1.0, 2.0, 3.0, 4.0])


def test_os_czasu_z_powtorzona_chwila_jest_odrzucona() -> None:
    """Powtórzona chwila to dwie różne wartości w jednym punkcie."""
    with pytest.raises(OsCzasuNiepoprawnaError, match="ściśle rosnąca"):
        _przebieg([0.0, 0.1, 0.1, 0.2], [1.0, 2.0, 3.0, 4.0])


@pytest.mark.parametrize("zla", [float("nan"), float("inf"), float("-inf")])
def test_os_czasu_niesksonczona_jest_odrzucona(zla: float) -> None:
    """NaN/Inf na osi czasu — sprawdzane PRZED monotonicznością.

    Kolejność jest istotna: porównanie ``nan > poprzednia`` jest fałszem, więc
    kontrola monotoniczności zgłosiłaby „oś nie jest rosnąca" i wskazała
    nieprawdziwą przyczynę.
    """
    from dynamic_lab.skonczonosc import WartoscNieskonczonaError

    with pytest.raises(WartoscNieskonczonaError, match="oś czasu"):
        _przebieg([0.0, 0.1, zla, 0.3], [1.0, 2.0, 3.0, 4.0])


def test_wartosci_niesksonczone_sa_odrzucone() -> None:
    from dynamic_lab.skonczonosc import WartoscNieskonczonaError

    with pytest.raises(WartoscNieskonczonaError, match="wartości przebiegu"):
        _przebieg([0.0, 0.1, 0.2], [1.0, float("nan"), 3.0])


def test_niezgodne_dlugosci_sa_odrzucone() -> None:
    with pytest.raises(OsCzasuNiepoprawnaError, match="chwil wobec"):
        _przebieg([0.0, 0.1, 0.2], [1.0, 2.0])


def test_ekstrapolacja_poza_dane_jest_bledem_a_nie_wartoscia_brzegowa() -> None:
    """SEDNO: ``numpy.interp`` poza zakresem PRZYTRZYMUJE skrajną wartość i milczy.

    Gdyby porównanie wolno było liczyć poza danymi, odcinek bez pokrycia
    mierzyłby stałą wartość brzegową JEDNEGO przebiegu — czyli wychodziłby tym
    zgodniejszy, im mniej danych. Cicha ekstrapolacja jest nieodróżnialna od
    zgodności i dlatego jest zakazana, a nie tylko odradzana.
    """
    przebieg = _przebieg([0.0, 0.1, 0.2], [1.0, 2.0, 3.0])
    # Kontrola przeciwna: WEWNĄTRZ zakresu interpolacja działa normalnie.
    assert przebieg.na_siatce(np.asarray([0.05, 0.15])) == pytest.approx([1.5, 2.5])
    with pytest.raises(EkstrapolacjaZabronionaError, match="wychodzi"):
        przebieg.na_siatce(np.asarray([0.1, 0.25]))
    with pytest.raises(EkstrapolacjaZabronionaError):
        przebieg.na_siatce(np.asarray([-0.05, 0.1]))


# ---------------------------------------------------------------------------
# Odcinki — BEZ wzorca
# ---------------------------------------------------------------------------


def test_okno_przelaczenia_ma_szerokosc_STALA_niezalezna_od_kroku() -> None:
    """Zapadka na defekt WŁASNY tej zmiany, wykryty pomiarem drabiny.

    Pierwsza wersja skalowała okno krokiem (``5*dt``). Ponieważ błąd po
    zdarzeniu rośnie z odległością od zdarzenia, kurczące się okno obcinało
    maksimum proporcjonalnie do ``dt`` i dawało „rząd obserwowany 1,00/1,01/1,03"
    — liczbę do złudzenia podobną do rzędu metody, a będącą w istocie pomiarem
    SZEROKOŚCI OKNA. Po ustaleniu stałej szerokości ZMIERZONO w oknie
    4,8659e-06 rad na KAŻDYM z czterech szczebli.

    Stałość jest też warunkiem porównywalności drabiny: błąd liczony na RÓŻNYCH
    przedziałach dla różnych kroków nie jest jedną wielkością.
    """
    przypadek = PrzypadekTrajektorii()
    granice = [
        granice_odcinkow(przypadek, krok_laboratorium_s=krok, poczatek_s=0.0, koniec_s=4.0)
        for krok in (0.004, 0.001)
    ]
    okna = [g[Odcinek.OKNO_PRZELACZENIA] for g in granice]
    assert okna[0] == okna[1]
    lo, hi = okna[0]
    assert hi - lo == pytest.approx(2.0 * POLOWA_OKNA_PRZELACZENIA_S)


def test_okno_odrzuca_krok_zbyt_gruby_wobec_zjawiska() -> None:
    """Okno musi objąć przejście, a nie tylko je zawierać nominalnie."""
    przypadek = PrzypadekTrajektorii()
    za_gruby = POLOWA_OKNA_PRZELACZENIA_S / (MINIMUM_KROKOW_W_OKNIE - 1)
    with pytest.raises(ValueError, match="za duży wobec okna"):
        granice_odcinkow(przypadek, krok_laboratorium_s=za_gruby, poczatek_s=0.0, koniec_s=4.0)


def test_odcinki_pokrywaja_horyzont_bez_luk_i_bez_nakladek() -> None:
    """Trzy odcinki muszą dzielić horyzont, a nie go próbkować."""
    przypadek = PrzypadekTrajektorii()
    granice = granice_odcinkow(przypadek, krok_laboratorium_s=0.001, poczatek_s=0.0, koniec_s=4.0)
    assert granice[Odcinek.PRZED][0] == 0.0
    assert granice[Odcinek.PRZED][1] == pytest.approx(granice[Odcinek.OKNO_PRZELACZENIA][0])
    assert granice[Odcinek.OKNO_PRZELACZENIA][1] == pytest.approx(granice[Odcinek.PO][0])
    assert granice[Odcinek.PO][1] == 4.0
    # Chwila zdarzenia leży WEWNĄTRZ okna, nie na jego brzegu.
    lo, hi = granice[Odcinek.OKNO_PRZELACZENIA]
    assert lo < przypadek.czas_wylaczenia_s < hi


def test_semantyka_przelaczenia_jest_zapisana_a_nie_domyslna() -> None:
    """Wspólna semantyka chwili zdarzenia musi być CZYTELNA, nie umowna."""
    assert "0+" in SEMANTYKA_PRZELACZENIA
    assert "różniczkow" in SEMANTYKA_PRZELACZENIA.lower()


# ---------------------------------------------------------------------------
# Przypadek: D = 0 jest WARUNKIEM istnienia arbitra — BEZ wzorca
# ---------------------------------------------------------------------------


def test_tlumienie_niezerowe_jest_odrzucone_bo_znosi_arbitra() -> None:
    """Bez ``D = 0`` całka pierwsza nie jest zachowana i nie ma rozjemcy."""
    with pytest.raises(ValueError, match="D = 0"):
        PrzypadekTrajektorii(d_tlumienie=0.05)


def test_e_prim_pochodzi_ze_wzoru_rownowagi_a_nie_z_narzedzia() -> None:
    """Arbiter, który pożycza liczbę od strony sporu, przestaje być niezależny.

    Sprawdzenie odwrotne: podstawiając wyliczone ``E'`` do wzoru na moc czynną
    maszyny klasycznej w punkcie pracy, musimy odzyskać zadane ``P_m``.
    """
    przypadek = PrzypadekTrajektorii()
    delta0 = 0.223138619087
    e_prim = przypadek.e_prim_pu(delta0)
    p_odtworzone = e_prim * przypadek.v_sys_pu / przypadek.x_calkowite_przed_pu * math.sin(delta0)
    assert p_odtworzone == pytest.approx(przypadek.p_gen_pu, rel=1e-12)


def test_calka_pierwsza_jest_stala_na_rozwiazaniu_scislym() -> None:
    """Kontrola samego arbitra: dla ruchu ścisłego ``V`` musi być stałe.

    Bez tego testu arbiter byłby deklaracją: funkcja, która zwraca cokolwiek,
    „wykrywałaby" dryf u każdego. Tu ruch bierze się z ZAMKNIĘTEGO rozwiązania
    małych drgań wokół punktu równowagi, a nie z żadnego integratora — więc test
    bada wzór, nie całkowanie.
    """
    przypadek = PrzypadekTrajektorii()
    delta_r = 0.30
    e_prim = przypadek.e_prim_pu(delta_r)
    x = przypadek.x_calkowite_przed_pu
    from dynamic_lab.konwencje import OMEGA_S

    # Małe drgania: omega_n^2 = omega_b * P_max * cos(delta_r) / (2H)
    p_max = e_prim * przypadek.v_sys_pu / x
    omega_n = math.sqrt(OMEGA_S * p_max * math.cos(delta_r) / (2.0 * przypadek.h_s))
    amplituda = 1.0e-4
    t = np.linspace(0.0, 2.0, 4001)
    delta = delta_r + amplituda * np.cos(omega_n * t)
    d_omega = -amplituda * omega_n * np.sin(omega_n * t)
    omega_pu = 1.0 + d_omega / OMEGA_S

    v = energia_maszyny_klasycznej(przypadek, delta, omega_pu, e_prim_pu=e_prim, x_pu=x)
    # Dla drgań małych stałość jest z dokładnością do wyrazu trzeciego rzędu.
    assert float(np.max(np.abs(v - v[0]))) < 1.0e-11


# ---------------------------------------------------------------------------
# Laboratorium samo w sobie — BEZ wzorca
# ---------------------------------------------------------------------------


def test_laboratorium_wylacza_JEDEN_tor_a_nie_oba() -> None:
    """Scenariusz MUSI wyłączyć jeden tor.

    To jest ten sam defekt, który wyszedł przy budowie przypadku: adresowanie
    parą szyn wyłączało oba tory i maszyna była odcinana od systemu. Bez tego
    przypadku porównanie trajektorii porównywałoby utratę synchronizmu z
    kołysaniem i wyszłoby ogromne rozjechanie o zupełnie innej przyczynie.
    """
    przypadek = PrzypadekTrajektorii()
    przebiegi, _ = przebiegi_laboratorium(przypadek, q_gen_pu=Q_PUNKTU_PRACY_PU, krok_s=0.001)
    delta = przebiegi["delta_rad"].wartosci
    zakres_st = math.degrees(float(delta.max() - delta.min()))
    assert 5.0 < zakres_st < 45.0, (
        f"Zakres kąta {zakres_st:.2f}° — poniżej 5° zaburzenie jest zbyt małe, żeby "
        f"mówić o zachowaniu dużosygnałowym, powyżej 45° wygląda na odcięcie od "
        f"systemu, czyli wyłączenie OBU torów."
    )


def test_rk4_trzyma_calke_pierwsza_na_poziomie_zaokraglen() -> None:
    """POMIAR: błąd całkowania ``rk4`` jest o rzędy mniejszy niż podłoga 3e-05 rad.

    To jest przesłanka, z której wynika cała atrybucja podłogi: skoro
    laboratorium nie gubi wielkości zachowanej, rozbieżność wobec wzorca nie może
    być błędem laboratorium. Zmierzone przy 1 ms: 4,46e-14.
    """
    przypadek = PrzypadekTrajektorii()
    przebiegi, delta0 = przebiegi_laboratorium(przypadek, q_gen_pu=Q_PUNKTU_PRACY_PU, krok_s=0.001)
    dryf = dryf_niezmiennika(przypadek, przebiegi, zrodlo="rk4", krok_s=0.001, delta0_rad=delta0)
    assert dryf.maks_dryf_bezwzgledny < 1.0e-12, (
        f"Dryf całki pierwszej {dryf.maks_dryf_bezwzgledny:.3e} — powyżej tej "
        f"wartości laboratorium przestaje być stroną dokładniejszą i atrybucja "
        f"podłogi do wzorca traci podstawę."
    )


def test_amplituda_kolysania_nie_zanika_bo_tlumienia_nie_ma() -> None:
    """Przy ``D = 0`` kolejne maksima muszą być RÓWNE.

    Zmierzone dla laboratorium (rk4, 1 ms): 0,37649387, 0,37649344, 0,37649377,
    0,37649392 rad — stałe co do siódmego miejsca. Dla wzorca te same maksima
    MALEJĄ monotonicznie (0,37649246 … 0,37648440), co jest tłumieniem
    numerycznym, a nie fizyką. Ten test przypina stronę, po której zanikania
    BYĆ NIE MOŻE.
    """
    przypadek = PrzypadekTrajektorii()
    przebiegi, _ = przebiegi_laboratorium(przypadek, q_gen_pu=Q_PUNKTU_PRACY_PU, krok_s=0.001)
    t = przebiegi["delta_rad"].czas_s
    y = przebiegi["delta_rad"].wartosci
    po = t > przypadek.czas_wylaczenia_s + 1.0e-9
    tt, yy = t[po], y[po]
    indeksy = np.where((yy[1:-1] > yy[:-2]) & (yy[1:-1] > yy[2:]))[0] + 1
    maksima = yy[indeksy]
    assert maksima.size >= 3, f"Za mało maksimów ({maksima.size}) na horyzoncie {tt[-1]} s."
    rozrzut = float(maksima.max() - maksima.min())
    assert rozrzut < 1.0e-6, (
        f"Maksima kołysania rozjeżdżają się o {rozrzut:.3e} rad przy D = 0. "
        f"Zanikanie albo narastanie amplitudy jest tu artefaktem całkowania."
    )

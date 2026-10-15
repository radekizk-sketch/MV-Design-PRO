"""Trajektoria wobec ANDES — część WYMAGAJĄCA wzorca zewnętrznego.

CO TE TESTY PRZYPINAJĄ. Nie „zgodność z rzeczywistością" — oba narzędzia całkują
TEN SAM podręcznikowy model klasyczny, więc ich zgodność nie mówi nic o tym, czy
model opisuje maszynę. Przypinana jest ZGODNOŚĆ RACHUNKU oraz MECHANIZM
ROZSTRZYGANIA, który pozwala powiedzieć, CZYJ jest błąd (trzeci arbiter: ścisła
całka pierwsza maszyny klasycznej przy ``D = 0``).

DLACZEGO OSOBNY PLIK (P1-B55-03). ``importorskip`` na poziomie modułu pomija
CAŁY plik, więc trzymanie sond ANDES-owych i nie-ANDES-owych razem powodowało,
że brak opcjonalnej wyroczni wyłączał także kontrolę kontraktu przebiegu —
i kampania mutacyjna traciła jedyną sondę ``M-KON-04``. Rozdział plików jest
MECHANIZMEM, a nie deklaracją w nagłówku: tu bramka obejmuje dokładnie to, co
wzorca wymaga, bo nic innego w tym pliku nie mieszka.

Część niewymagająca ANDES: ``test_wzorzec_trajektoria.py``.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from dynamic_lab.wzorzec_trajektoria import (
    DRABINA_KROKOW_S,
    KryteriumOdbioru,
    Odcinek,
    PrzypadekTrajektorii,
    StatusPorownania,
)

# ---------------------------------------------------------------------------
# Wymagające WZORCA
# ---------------------------------------------------------------------------

andes = pytest.importorskip("andes")

from dynamic_lab.wzorzec_trajektoria import (  # noqa: E402
    drabina_kroku,
    odbior_trajektorii,
    porownaj_trajektorie,
    przebiegi_wzorca,
)


@pytest.fixture(scope="module")
def porownanie():
    return porownaj_trajektorie(krok_laboratorium_s=0.001)


def test_wzorzec_daje_trajektorie_a_nie_punkt_pracy_powielony() -> None:
    """Bez tego moduł przechodziłby też wtedy, gdyby ANDES zwracał stałą."""
    przypadek = PrzypadekTrajektorii()
    przebiegi, delta_pierwszej = przebiegi_wzorca(przypadek, krok_s=0.001)
    delta = przebiegi["delta_rad"].wartosci
    assert delta.size > 100
    assert float(delta.max() - delta.min()) > 1.0e-3, "Wzorzec zwrócił przebieg stały."
    assert abs(float(delta[0]) - delta_pierwszej) < 1.0e-12


def test_wzorzec_zageszcza_siatke_wokol_przelaczenia() -> None:
    """SEMANTYKA PRZEŁĄCZENIA: siatki narzędzi RÓŻNIĄ SIĘ i to jest zmierzone.

    Wzorzec wstawia własne punkty z krokiem 1e-04 s niezależnie od zadanego
    ``tstep`` i nie zapisuje próbki dla ``t = 0``. Oba fakty wpływają na zakres
    wspólny porównania, więc muszą być przypięte, a nie pamiętane.
    """
    przypadek = PrzypadekTrajektorii()
    przebiegi, _ = przebiegi_wzorca(przypadek, krok_s=0.004)
    t = przebiegi["delta_rad"].czas_s
    assert t[0] == pytest.approx(0.004), "Wzorzec jednak zapisuje t = 0 — zakres wspólny inny."
    minimalny_krok = float(np.min(np.diff(t)))
    assert minimalny_krok < 0.004 / 10.0, (
        f"Najkrótszy krok wzorca {minimalny_krok:.3e} s — brak zagęszczenia wokół "
        f"przełączenia zmieniłby wnioski o oknie przełączenia."
    )


def test_punkt_pracy_zgadza_sie_z_wzorcem(porownanie) -> None:
    """Trajektoria startuje z TEGO SAMEGO miejsca — inaczej reszta nie ma sensu."""
    assert porownanie.blad_punktu_pracy_rad < 1.0e-7, (
        f"Kąt początkowy rozjeżdża się o {porownanie.blad_punktu_pracy_rad:.3e} rad — "
        f"porównanie trajektorii mierzyłoby wtedy różnicę punktów pracy."
    )


def test_zaburzenie_faktycznie_wywoluje_kolysanie(porownanie) -> None:
    """Kontrola przeciwna: bez ruchu przebiegu zgodność byłaby bezwartościowa."""
    zakres_rad = porownanie.blad("delta_rad", Odcinek.PO).zakres_odniesienia
    assert math.degrees(zakres_rad) > 5.0, (
        f"Kołysanie ma zakres {math.degrees(zakres_rad):.2f}° — za mało, żeby "
        f"porównanie mówiło cokolwiek o zachowaniu dużosygnałowym."
    )


def test_odcinki_sa_raportowane_OSOBNO_i_roznia_sie_o_rzedy(porownanie) -> None:
    """Sedno §5: jedna liczba na cały horyzont zamazywała trzy różne zjawiska.

    ZMIERZONE max|Δδ| (rk4, 1 ms): przed 3,68e-09, okno 4,87e-06, po 3,25e-05 —
    cztery rzędy wielkości rozpiętości. Uśrednienie ich w jedną liczbę czyniło
    dokładność punktu pracy nieodróżnialną od błędu po zdarzeniu.
    """
    przed = porownanie.blad("delta_rad", Odcinek.PRZED)
    okno = porownanie.blad("delta_rad", Odcinek.OKNO_PRZELACZENIA)
    po = porownanie.blad("delta_rad", Odcinek.PO)
    for b in (przed, okno, po):
        assert b.rozstrzygniety, f"{b.odcinek}: {b.powod_nierozstrzygniecia}"
    assert przed.maks_blad_bezwzgledny < okno.maks_blad_bezwzgledny
    assert okno.maks_blad_bezwzgledny < po.maks_blad_bezwzgledny
    assert przed.maks_blad_bezwzgledny < 1.0e-7


def test_wzorzec_gubi_calke_pierwsza_a_laboratorium_nie(porownanie) -> None:
    """ROZSTRZYGNIĘCIE, CZYJ JEST BŁĄD — pomiar, nie deklaracja.

    Zmierzone przy 1 ms: laboratorium 4,46e-14, wzorzec (0,125 ms) 1,34e-06.
    Przewaga rzędu 1e+07 znaczy, że rozbieżność trajektorii jest własnością
    wzorca. To jest jedyna przesłanka, która pozwala nazwać podłogę ≈3e-05 rad.
    """
    assert porownanie.dryf_laboratorium.maks_dryf_bezwzgledny < 1.0e-12
    assert porownanie.dryf_wzorca.maks_dryf_bezwzgledny > 1.0e-8
    assert porownanie.przewaga_niezmiennika > 1.0e3


def test_podloga_NIE_zalezy_od_kroku_laboratorium() -> None:
    """OBALENIE POPRZEDNIEJ HIPOTEZY — najważniejszy pomiar tej zmiany.

    Poprzednia wersja modułu tłumaczyła podłogę ≈3e-05 rad różnicą traktowania
    NIECIĄGŁOŚCI: „ANDES zagęszcza krok wokół przełączenia, laboratorium
    przechodzi krokiem stałym". Gdyby tak było, błąd zależałby od kroku
    LABORATORIUM. ZMIERZONE max|Δδ| po zdarzeniu dla 4/2/1/0,5 ms::

        3,2478e-05   3,2492e-05   3,2495e-05   3,2495e-05

    czyli stała co do czwartej cyfry przy ośmiokrotnej zmianie kroku. Poprzedni
    „spadek z krokiem" był artefaktem metody: zmieniano JEDNOCZEŚNIE krok obu
    narzędzi, więc malał błąd WZORCA, a przypisywano to laboratorium.
    """
    drabina = drabina_kroku(integrator="rk4")
    assert drabina.kroki_s == DRABINA_KROKOW_S
    rozrzut = drabina.rozrzut_ogona(Odcinek.PO)
    assert rozrzut < 1.01, (
        f"Rozrzut błędu po ogonie drabiny {rozrzut:.4f} — podłoga zaczęła zależeć "
        f"od kroku laboratorium, więc przestała być wyjaśniona błędem wzorca."
    )
    # Okno przełączenia też jest nasycone — przy STAŁEJ szerokości okna.
    assert drabina.rozrzut_ogona(Odcinek.OKNO_PRZELACZENIA) < 1.01


def test_rzad_metody_czyta_sie_z_calki_a_nie_z_porownania() -> None:
    """DWIE MIARY, bo jedna jest nasycona — i to jest wynik, nie usterka.

    Rząd wobec wzorca wychodzi ≈0 (porównanie nasycone błędem wzorca), a rząd po
    całce pierwszej pokazuje rzeczywiste zachowanie metody. Podanie samego
    pierwszego byłoby stwierdzeniem, że ``rk4`` nie jest zbieżny.
    """
    drabina = drabina_kroku(integrator="rk4")
    rzedy_wobec = drabina.rzedy_wobec_wzorca(Odcinek.PO)
    assert all(abs(r) < 0.1 for r in rzedy_wobec), (
        f"Rzędy wobec wzorca {rzedy_wobec} — niezerowe znaczyłoby, że porównanie "
        f"przestało być nasycone i drugą miarę trzeba przeliczyć."
    )
    rzedy_calki = drabina.rzedy_niezmiennika
    assert rzedy_calki[0] > 3.5, (
        f"Rząd rk4 po całce pierwszej {rzedy_calki[0]:.2f} — metoda rzędu 4 musi "
        f"dać co najmniej ~4 zanim wejdzie podłoga zaokrągleń."
    )


def test_trapez_po_naprawie_tolerancji_jest_rzedu_drugiego() -> None:
    """Zapadka na defekt znaleziony przy okazji §5 i naprawiony u źródła.

    Przed naprawą (tolerancja równania kroku STAŁA) dryf trapezu szedł
    2,54e-08 -> 6,36e-09 -> 7,57e-06 -> 1,55e-05, czyli ZAGĘSZCZANIE KROKU
    POGARSZAŁO wynik. Po powiązaniu tolerancji z krokiem
    (``calkowanie.wspolczynnik_kroku``): 2,54e-08 -> 6,36e-09 -> 1,59e-09 ->
    3,98e-10, rzędy +2,00 +2,00 +2,00.
    """
    drabina = drabina_kroku(integrator="trapez_niejawny")
    rzedy = drabina.rzedy_niezmiennika
    assert all(r > 1.8 for r in rzedy), (
        f"Rzędy trapezu po całce pierwszej {rzedy} — wartość poniżej 1,8 znaczy, "
        f"że tolerancja równania kroku znów przestała być skalowana krokiem."
    )


def test_odbior_wystawia_werdykt_z_uzasadnieniem_kazdego_skladnika() -> None:
    """Kryterium odbioru musi być JAWNE i rozliczalne składnik po składniku."""
    ocena = odbior_trajektorii(integrator="rk4")
    assert ocena.status is StatusPorownania.ZGODNE_W_GRANICACH_WZORCA
    assert not ocena.niespelnione
    assert not ocena.nierozstrzygniete
    assert len(ocena.spelnione) == 4, (
        f"Oczekiwane cztery rozliczone składniki kryterium, jest "
        f"{len(ocena.spelnione)}: {ocena.spelnione}"
    )
    slownik = ocena.to_dict()
    # Zastrzeżenie musi ODMAWIAĆ dwóch konkretnych wniosków, a nie zawierać
    # dowolne słowo o walidacji — asercja na fragment słowa pękała na odmianie
    # („zwalidowana" nie zawiera „walidacj") i nic merytorycznego nie sprawdzała.
    zastrzezenie = slownik["czego_status_NIE_znaczy"]
    assert "czego_status_NIE_znaczy" in slownik
    assert "model poprawny fizycznie" in zastrzezenie
    assert "zwalidowana" in zastrzezenie
    assert slownik["porownanie"]["czym_to_jest"].startswith("Cross-check")


def test_odbior_wykrywa_rozjechany_punkt_pracy() -> None:
    """DRUGA STRONA PREDYKATU: kryterium musi umieć powiedzieć „niezgodne".

    Kryterium, którego nikt nie widział na czerwono, jest deklaracją. Zaostrzenie
    progu punktu pracy poniżej ZMIERZONEJ wartości (3,68e-09 rad) wymusza
    werdykt negatywny bez psucia modelu ani fikstury.
    """
    ocena = odbior_trajektorii(
        integrator="rk4",
        kryterium=KryteriumOdbioru(maks_blad_punktu_pracy_rad=1.0e-12),
        z_drabina=False,
    )
    assert ocena.status is StatusPorownania.NIEZGODNE
    assert any("Punkt pracy" in p for p in ocena.niespelnione)

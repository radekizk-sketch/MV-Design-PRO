"""C1/W3 dla modelu 4. RZĘDU i REGULATORÓW: laboratorium vs ANDES GENROU.

KOD BADAWCZY — patrz `backend/research/README.md`.

TE TESTY SĄ BRAMKOWANE ``importorskip("andes")`` — i to trzeba nazwać wprost.
ANDES nie jest zależnością repozytorium ani żadnego workflow CI, więc dopóki nią
nie będzie, ten plik jest **narzędziem badawczym, a nie obowiązującą bramką**.
„Testy przechodzą" nic tu nie znaczy, jeśli zostały pominięte. To jest dokładnie
ten wzorzec „uśpionego dowodu", który audyt wytknął testom porównawczym z
pandapower; zapisujemy go, zamiast udawać, że go nie ma. Rekomendacja (uczynić
ANDES zależnością dev i wpiąć ten poziom w CI) jest pozycją decyzyjną, nie
decyzją tego kodu.

CO TE TESTY DODAJĄ PONAD `test_wzorzec_zewnetrzny.py`
-----------------------------------------------------
Tamten plik porównuje laboratorium z GENCLS, czyli z maszyną KLASYCZNĄ, a nasz
model jest tam zredukowany przez ``Xd = Xd'``. Przy takiej redukcji równania
``E'q`` i ``E'd`` są trywialne, więc nie były sprawdzone ani ``Td0'``, ani
``Tq0'``, ani sprzężenie SEM przejściowych z prądem, ani żaden regulator. Tutaj
maszyna pracuje z ``Xd = 1,9`` i ``Xq = 1,7`` przy ``Xd' = Xq' = 0,3``, więc
człony ``(Xd−Xd')·Id`` i ``(Xq−Xq')·Iq`` są NIEZEROWE — pilnuje tego osobna
asercja, żeby przypadek nie mógł cicho zdegenerować się do klasycznego.

Przypadek ANIZOTROPOWY (``Xd' ≠ Xq'``, czyli domyślna parametryzacja
`MaszynaSynchroniczna4Rzedu`) ma osobny test, bo dla niego redukcja dokładna
nie istnieje — ANDES wymusza ``Xd'' = Xq''``. Tam wzorcem jest granica
``Td0'' → 0``, a zgodność jest asymptotyczna i tak nazwana.
"""

from __future__ import annotations

import contextlib
import io
import itertools
import math
import sys

import numpy as np
import pytest

andes = pytest.importorskip("andes", reason="ANDES nie jest zależnością repozytorium")

from dynamic_lab.konwencje import F_BAZOWA_HZ  # noqa: E402
from dynamic_lab.wzorzec_genrou import (  # noqa: E402
    ZAKRES_WALIDACJI,
    DopasowanieWidm,
    ModeleNierownowazneError,
    NastawyTurbiny,
    NastawyWzbudzenia,
    PrzypadekGenrou,
    _sprawdz_baze_mocy,
    _sprawdz_unieczynnienie_lead_lag,
    dopasuj_widma,
    mod_z_trajektorii,
    porownaj_z_wzorcem,
    raport_zakresu_walidacji,
    rozbieznosc_od_nasycenia,
    rozbieznosc_od_reaktancji_podprzejsciowej,
    rozbieznosc_od_stalej_tlumika,
    tabela_zakresu_walidacji,
    wynik_wzorca,
    zmierz_mod_oscylacyjny,
)
from dynamic_lab.wzorzec_zewnetrzny import (  # noqa: E402
    NiezgodnaBazaCzestotliwosciError,
)

# --------------------------------------------------------------------------
# Tolerancje — każda z uzasadnieniem, żadna dobrana pod wynik
# --------------------------------------------------------------------------

TOL_PUNKT_PRACY = 1.0e-6
"""Punkt pracy jest rozwiązaniem tych samych równań algebraicznych w obu
narzędziach; różnica może pochodzić tylko z tolerancji ich rozpływów. ZMIERZONE
maksimum na całym zamiatanym iloczynie cech: 1,3·10⁻⁷ (przy ``P = 0,9`` p.u.)."""

TOL_WIDMA = 1.0e-6
"""Widmo wzorca pochodzi z linearyzacji analitycznej, nasze — z jakobianu
liczonego różnicami centralnymi o kroku 1e-6 przy tolerancji sieci 1e-13, więc
szum sieci wchodzi wzmocniony 1e6 razy. ZMIERZONE maksimum: 2,3·10⁻⁷; typowo
1,2·10⁻⁸. Zapas czterokrotny."""

TOL_MOD_ODSPRZEZONY = 1.0e-12
"""Mody odsprzężone (tłumiki, lead-lag) mają wynikać z parametru DOKŁADNIE, bo
ich wiersze jakobianu są blokowo-trójkątne. ZMIERZONY błąd względny: 0,0 —
zgodność co do bitu. Próg jest formalnością, nie zapasem."""

TOL_MOD_Z_TRAJEKTORII = 1.0e-3
"""Mod z trajektorii RK4 mierzony regresją po ekstremach vs wartość własna
wzorca. ZMIERZONE: 6,1·10⁻⁵ przy zaburzeniu 0,5°. Zapas rzędu wielkości, bo
metoda ma składnik zależny od amplitudy (nieliniowość równania wahań)."""


# --------------------------------------------------------------------------
# Fikstury
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def przypadek() -> PrzypadekGenrou:
    return PrzypadekGenrou()


@pytest.fixture(scope="module")
def porownanie_bazowe():
    return porownaj_z_wzorcem()


@pytest.fixture(scope="module")
def porownanie_z_avr():
    return porownaj_z_wzorcem(wzbudnica=NastawyWzbudzenia())


@pytest.fixture(scope="module")
def porownanie_z_turbina():
    return porownaj_z_wzorcem(turbina=NastawyTurbiny())


@pytest.fixture(scope="module")
def porownanie_z_obydwoma():
    return porownaj_z_wzorcem(wzbudnica=NastawyWzbudzenia(), turbina=NastawyTurbiny())


# --------------------------------------------------------------------------
# Przypadek NIE degeneruje się do klasycznego — warunek sensu całego pliku
# --------------------------------------------------------------------------


def test_przypadek_faktycznie_cwiczy_dynamike_4_rzedu(porownanie_bazowe) -> None:
    """Bez tej asercji cały plik mógłby cicho powtórzyć walidację GENCLS.

    Model 4. rzędu degeneruje się do klasycznego, gdy ``Xd = Xd'`` i ``Xq = Xq'``
    — wtedy ``E'q ≡ Efd`` i ``E'd ≡ 0``, a stałe ``Td0'``, ``Tq0'`` przestają
    cokolwiek znaczyć. Sprawdzamy więc, że w tym przypadku SEM przejściowe
    RÓŻNIĄ SIĘ od swoich zdegenerowanych wartości o wielkość inżyniersko istotną,
    a nie o szum.
    """
    p = porownanie_bazowe.przypadek
    assert p.xd_pu > p.x_prim_pu and p.xq_pu > p.x_prim_pu

    wzorzec = porownanie_bazowe.wzorzec
    assert (
        abs(wzorzec.e_d_prim_pu) > 0.1
    ), "E'd bliskie zeru znaczy, że oś q jest zdegenerowana — przypadek nie ćwiczy Tq0'."
    assert (
        abs(wzorzec.e_q_prim_pu - wzorzec.efd_pu) > 0.1
    ), "E'q ≈ Efd znaczy, że człon (Xd−Xd')·Id znika — przypadek nie ćwiczy Td0'."


# --------------------------------------------------------------------------
# Punkt pracy i widmo — przypadek bazowy
# --------------------------------------------------------------------------


def test_punkt_pracy_modelu_4_rzedu_zgadza_sie_z_genrou(porownanie_bazowe) -> None:
    """δ0, E'q, E'd, Efd oraz napięcie zaciskowe odtworzone z zadanego P + jQ.

    Napięcie jest tu realnym sprawdzianem warstwy algebraicznej: laboratorium
    nie ma węzła PV, dostaje moc zespoloną wyliczoną przez wzorzec i musi
    ODTWORZYĆ napięcie wzorca. Odwrotna kolejność byłaby tautologią.
    """
    assert porownanie_bazowe.blad_delta0 < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_e_q_prim < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_e_d_prim < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_efd < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_napiecia_modul < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_napiecia_kat < TOL_PUNKT_PRACY


def test_widmo_modelu_4_rzedu_zgadza_sie_z_genrou(porownanie_bazowe) -> None:
    """CAŁE widmo, nie tylko mod elektromechaniczny.

    Model może mieć poprawną częstotliwość wahań i błędną stałą czasową obwodu
    wzbudzenia — porównanie samego modu oscylacyjnego tego nie wykryje.
    """
    dopasowanie = porownanie_bazowe.dopasowanie
    assert len(dopasowanie.pary) == 4, "Model 4. rzędu ma 4 mody dynamiczne"
    assert dopasowanie.maks_blad_wzgledny < TOL_WIDMA
    assert porownanie_bazowe.blad_modu_najslabiej_tlumionego < TOL_WIDMA


def test_mody_bez_odpowiednika_sa_nazwane_i_policzone(porownanie_bazowe) -> None:
    """„Mod bez odpowiednika" musi być WYJAŚNIONY, nie tylko odłożony.

    Po stronie wzorca zostają dokładnie dwa mody tłumików; po stronie
    laboratorium dokładnie dwa zera strukturalne (``Efd`` i ``Pm`` są stanami
    także bez regulatorów). Gdyby zostało coś jeszcze, znaczyłoby to, że modele
    różnią się w sposób, którego nie umiemy nazwać.
    """
    dopasowanie = porownanie_bazowe.dopasowanie
    assert len(dopasowanie.mody_wzorca_bez_odpowiednika) == 2
    assert len(dopasowanie.zera_strukturalne_laboratorium) == 2
    assert (
        len(dopasowanie.zera_strukturalne_laboratorium)
        == porownanie_bazowe.liczba_zer_strukturalnych_oczekiwana
    )


@pytest.mark.parametrize(
    ("td0_bis_s", "tq0_bis_s"),
    [(0.03, 0.02), (0.05, 0.5), (0.005, 0.2), (0.1, 0.01)],
)
def test_mody_bez_odpowiednika_to_dokladnie_odwrotnosci_stalych_tlumikow(
    td0_bis_s: float, tq0_bis_s: float
) -> None:
    """Redukcja R1: przy ``Xd'' = Xd'`` tłumiki są ODSPRZĘŻONE, więc ich mody
    muszą wynosić dokładnie ``−1/Td0''`` i ``−1/Tq0''``.

    To jest mocne twierdzenie docstringu modułu i dlatego ma test. Stałe są
    parami RÓŻNE (i raz odwrócone co do wielkości), więc zamiana ``Td0''`` z
    ``Tq0''`` w mapowaniu parametrów zostałaby wykryta — przy równych stałych
    byłaby niewidoczna.
    """
    porownanie = porownaj_z_wzorcem(PrzypadekGenrou(td0_bis_s=td0_bis_s, tq0_bis_s=tq0_bis_s))
    zmierzone = sorted(porownanie.dopasowanie.mody_wzorca_bez_odpowiednika, key=lambda w: w.real)
    oczekiwane = sorted(porownanie.mody_oczekiwane_bez_odpowiednika, key=lambda w: w.real)
    assert len(zmierzone) == len(oczekiwane) == 2
    for zm, ocz in zip(zmierzone, oczekiwane, strict=True):
        assert abs(zm - ocz) / abs(ocz) <= TOL_MOD_ODSPRZEZONY


@pytest.mark.parametrize(
    ("ra_pu", "h_s", "p_gen_pu", "xq_pu"),
    list(itertools.product((0.0, 0.01), (1.0, 16.0), (0.1, 0.9), (1.0, 2.5))),
)
def test_widmo_zgadza_sie_na_iloczynie_cech_maszyny(
    ra_pu: float, h_s: float, p_gen_pu: float, xq_pu: float
) -> None:
    """Zgodność na ILOCZYNIE cech, nie na jednym przykładzie.

    Cechy dobrane tak, żeby każda mogła ukryć inny defekt: ``ra`` włącza człony
    rezystancyjne równań stojana, ``H`` skaluje wyłącznie mod elektromechaniczny,
    ``P`` zmienia punkt pracy (i moc synchronizującą), ``xq`` rozdziela osie
    d i q. Pojedynczy przykład mógłby przejść przy błędzie widocznym dopiero w
    kombinacji (np. ``ra ≠ 0`` przy dużym obciążeniu).
    """
    porownanie = porownaj_z_wzorcem(
        PrzypadekGenrou(ra_pu=ra_pu, h_s=h_s, p_gen_pu=p_gen_pu, xq_pu=xq_pu)
    )
    assert porownanie.blad_punktu_pracy < TOL_PUNKT_PRACY
    assert porownanie.blad_widma < TOL_WIDMA


@pytest.mark.parametrize(
    ("d_tlumienie", "h_s"), list(itertools.product((0.0, 2.0, 10.0), (2.0, 8.0)))
)
def test_bezwladnosc_i_tlumienie_przesuwaja_widmo_zgodnie(d_tlumienie: float, h_s: float) -> None:
    """Równanie wahań z członem tłumiącym ``D`` — nie tylko z bezwładnością.

    ``D`` jest w przypadku bazowym ZEROWE, więc bez tego zamiatania cały człon
    ``D·(ω − 1)`` przechodziłby przez walidację niesprawdzony: zgodność przy
    ``D = 0`` nie mówi nic o skalowaniu ``D`` ani o jego znaku. Iloczyn z ``H``
    dlatego, że oba wchodzą do tego samego równania i błąd w jednym potrafi się
    schować pod właściwą wartością drugiego (``D/2H`` jest tym, co widać w
    części rzeczywistej modu).

    Druga część, metamorficzna: ``D`` musi FAKTYCZNIE zmieniać tłumienie modu we
    wzorcu — inaczej zgodność byłaby spełniona trywialnie.
    """
    porownanie = porownaj_z_wzorcem(PrzypadekGenrou(d_tlumienie=d_tlumienie, h_s=h_s))
    assert porownanie.blad_punktu_pracy < TOL_PUNKT_PRACY
    assert porownanie.blad_widma < TOL_WIDMA

    bez_tlumienia = porownaj_z_wzorcem(PrzypadekGenrou(d_tlumienie=0.0, h_s=h_s))
    zmiana = abs(
        porownanie.wzorzec.mod_najslabiej_tlumiony.real
        - bez_tlumienia.wzorzec.mod_najslabiej_tlumiony.real
    )
    if d_tlumienie > 0.0:
        assert zmiana > 0.01, "Człon D nie zmienił tłumienia modu we wzorcu"
    else:
        assert zmiana == 0.0


@pytest.mark.parametrize(
    ("td0_prim_s", "tq0_prim_s"),
    list(itertools.product((2.0, 8.0, 16.0), (0.2, 2.0))),
)
def test_stale_czasowe_obwodow_wirnika_przesuwaja_widmo_zgodnie(
    td0_prim_s: float, tq0_prim_s: float
) -> None:
    """Walidacja ``Td0'`` i ``Tq0'`` — czyli tego, czego GENCLS nie mógł sprawdzić.

    Sprawdzenie jest DWUCZĘŚCIOWE, bo sama zgodność nic by nie znaczyła, gdyby
    widmo w ogóle nie reagowało na te stałe:
      1. widmo laboratorium zgadza się z widmem wzorca dla każdej pary stałych,
      2. zmiana ``Td0'`` FAKTYCZNIE przesuwa widmo wzorca (metamorficznie),
         więc punkt 1 nie jest spełniony trywialnie.
    """
    porownanie = porownaj_z_wzorcem(PrzypadekGenrou(td0_prim_s=td0_prim_s, tq0_prim_s=tq0_prim_s))
    assert porownanie.blad_widma < TOL_WIDMA

    odniesienie = porownaj_z_wzorcem(
        PrzypadekGenrou(td0_prim_s=2.0 * td0_prim_s, tq0_prim_s=tq0_prim_s)
    )
    najwolniejszy = min(
        (w for w in porownanie.wzorzec.wartosci_wlasne if abs(w.real) > 1.0e-9),
        key=lambda w: abs(w.real),
    )
    najwolniejszy_odn = min(
        (w for w in odniesienie.wzorzec.wartosci_wlasne if abs(w.real) > 1.0e-9),
        key=lambda w: abs(w.real),
    )
    assert (
        abs(najwolniejszy - najwolniejszy_odn) / abs(najwolniejszy) > 0.05
    ), "Podwojenie Td0' nie ruszyło widma wzorca — test zgodności byłby pusty."


# --------------------------------------------------------------------------
# Całkowanie: trajektoria vs wartość własna
# --------------------------------------------------------------------------


def test_mod_z_trajektorii_zgadza_sie_z_wartoscia_wlasna_wzorca(
    przypadek, porownanie_bazowe
) -> None:
    """Zamknięcie łańcucha: równania (jakobian) ORAZ całkowanie (RK4).

    Jakobian dowodzi, że równania laboratorium zgadzają się z wzorcem. Ten test
    dokłada drugą część: że całkowanie tych równań daje ten sam mod — zarówno
    częstotliwość, jak i TŁUMIENIE, którego przypadek GENCLS (D = 0, maszyna
    klasyczna) w ogóle nie miał.

    Dwie amplitudy, bo różnica z wartością własną rosnąca z amplitudą to
    POPRAWNA fizyka (nieliniowość równania wahań), a różnica nieznikająca przy
    amplitudzie dążącej do zera byłaby błędem modelu albo pomiaru.
    """
    wzorcowy = porownanie_bazowe.wzorzec.mod_najslabiej_tlumiony
    assert wzorcowy.real < 0.0, "Przypadek ma być tłumiony — inaczej nie ma czego mierzyć"

    bledy = []
    for amplituda in (2.0, 0.5):
        zmierzony = mod_z_trajektorii(
            przypadek,
            q_gen_pu=porownanie_bazowe.wzorzec.q_gen_pu,
            zaburzenie_stopni=amplituda,
        )
        bledy.append(abs(zmierzony - wzorcowy) / abs(wzorcowy))
    assert max(bledy) < TOL_MOD_Z_TRAJEKTORII


# --------------------------------------------------------------------------
# Regulatory — część wspólna
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("k_a", "t_a_s"), list(itertools.product((50.0, 200.0, 400.0), (0.02, 0.05, 0.2)))
)
def test_avr_zgadza_sie_z_sexs_na_iloczynie_nastaw(k_a: float, t_a_s: float) -> None:
    """`RegulatorNapiecia` vs SEXS z unieczynnionym lead-lagiem.

    Iloczyn wzmocnienia i stałej czasowej, bo to one razem decydują o położeniu
    modu wzbudzenia: samo ``K_a`` przy jednej ``T_a`` mogłoby przejść mimo błędu
    w skalowaniu stałej czasowej. Sprawdzana jest CZĘŚĆ WSPÓLNA — ogranicznik
    pozostaje nieaktywny w otoczeniu punktu pracy, więc anti-windup NIE jest tym
    testem zwalidowany (tak mówi `ZAKRES_WALIDACJI`).
    """
    wzbudnica = NastawyWzbudzenia(k_a=k_a, t_a_s=t_a_s)
    porownanie = porownaj_z_wzorcem(wzbudnica=wzbudnica)
    assert porownanie.blad_punktu_pracy < TOL_PUNKT_PRACY
    assert porownanie.blad_widma < TOL_WIDMA
    assert len(porownanie.dopasowanie.pary) == 5, "4 stany maszyny + Efd"
    assert len(porownanie.dopasowanie.zera_strukturalne_laboratorium) == 1, "zostaje Pm"
    bez_odpowiednika = sorted(
        porownanie.dopasowanie.mody_wzorca_bez_odpowiednika, key=lambda w: w.real
    )
    oczekiwane = sorted(porownanie.mody_oczekiwane_bez_odpowiednika, key=lambda w: w.real)
    for zm, ocz in zip(bez_odpowiednika, oczekiwane, strict=True):
        assert abs(zm - ocz) / abs(ocz) <= TOL_MOD_ODSPRZEZONY


@pytest.mark.parametrize(
    ("r_statyzm", "t_g_s"), list(itertools.product((0.02, 0.05, 0.10), (0.2, 0.5, 1.5)))
)
def test_governor_zgadza_sie_z_tgov1_na_iloczynie_nastaw(r_statyzm: float, t_g_s: float) -> None:
    """`RegulatorTurbiny` vs TGOV1 z unieczynnionym lead-lagiem i ``Dt = 0``.

    Statyzm i stała czasowa razem, z tego samego powodu co przy AVR: statyzm
    ustawia wzmocnienie pętli, stała czasowa jej dynamikę, a błąd w jednym
    potrafi się schować pod właściwą wartością drugiego.
    """
    turbina = NastawyTurbiny(r_statyzm=r_statyzm, t_g_s=t_g_s)
    porownanie = porownaj_z_wzorcem(turbina=turbina)
    assert porownanie.blad_punktu_pracy < TOL_PUNKT_PRACY
    assert porownanie.blad_widma < TOL_WIDMA
    assert len(porownanie.dopasowanie.pary) == 5, "4 stany maszyny + Pm"
    assert len(porownanie.dopasowanie.zera_strukturalne_laboratorium) == 1, "zostaje Efd"


@pytest.mark.parametrize(("k_a", "r_statyzm"), [(200.0, 0.05), (50.0, 0.02)])
def test_avr_i_governor_razem_zgadzaja_sie_z_wzorcem(k_a: float, r_statyzm: float) -> None:
    """Obie pętle JEDNOCZEŚNIE — sprawdza, że nie interferują błędnie.

    Osobno poprawne regulatory mogą razem dawać zły wynik, jeśli któryś czyta
    zły sygnał pomiarowy (defekt P0-05 audytu: governor czytał prędkość ze
    słownika stałych). Przy obu pętlach czynnych laboratorium nie ma już żadnego
    stanu stałego, więc wszystkie sześć modów musi mieć odpowiednik.
    """
    porownanie = porownaj_z_wzorcem(
        wzbudnica=NastawyWzbudzenia(k_a=k_a),
        turbina=NastawyTurbiny(r_statyzm=r_statyzm),
    )
    assert porownanie.blad_punktu_pracy < TOL_PUNKT_PRACY
    assert porownanie.blad_widma < TOL_WIDMA
    assert len(porownanie.dopasowanie.pary) == 6
    assert porownanie.dopasowanie.zera_strukturalne_laboratorium == ()
    assert len(porownanie.dopasowanie.mody_wzorca_bez_odpowiednika) == 4


@pytest.mark.parametrize(
    ("wzbudnica", "turbina", "oczekiwane_zera"),
    [
        (None, None, 2),
        (NastawyWzbudzenia(), None, 1),
        (None, NastawyTurbiny(), 1),
        (NastawyWzbudzenia(), NastawyTurbiny(), 0),
    ],
)
def test_liczba_zer_strukturalnych_odpowiada_brakujacym_regulatorom(
    wzbudnica, turbina, oczekiwane_zera: int
) -> None:
    """Zera w widmie laboratorium to ARTEFAKT reprezentacji, nie mody fizyczne.

    `ZespolSynchroniczny` trzyma ``Efd`` i ``Pm`` jako stany także wtedy, gdy nie
    ma regulatora, więc wiersze jakobianu są wtedy identycznie zerowe. Twierdzenie
    „tyle zer, ile brakujących regulatorów" jest w docstringu modułu i dlatego
    jest tu sprawdzone na WSZYSTKICH czterech konfiguracjach, a nie na jednej.
    """
    porownanie = porownaj_z_wzorcem(wzbudnica=wzbudnica, turbina=turbina)
    assert len(porownanie.dopasowanie.zera_strukturalne_laboratorium) == oczekiwane_zera
    assert porownanie.liczba_zer_strukturalnych_oczekiwana == oczekiwane_zera


# --------------------------------------------------------------------------
# ZAKRES ZGODNOŚCI — granica jest wynikiem, nie porażką
# --------------------------------------------------------------------------


def test_rozbieznosc_rosnie_monotonicznie_z_odstepem_podprzejsciowym() -> None:
    """Zakres zgodności jako funkcja parametru, który RÓŻNI modele.

    Przy zerowym odstępie (``Xd'' = Xd'``) rozbieżność musi być na poziomie
    szumu numerycznego — to jest redukcja R1. Dalej ma rosnąć MONOTONICZNIE:
    gdyby rosła niemonotonicznie albo zaczynała od wartości niezerowej,
    znaczyłoby to, że różnica nie pochodzi z tłumików, tylko z błędu.

    Punkt pracy ma przy tym pozostać NIEZMIENIONY: reaktancja podprzejściowa nie
    wchodzi do stanu ustalonego. To rozdziela dwie klasy różnic (dynamika vs
    punkt pracy), których zlepienie ukryłoby jedną z nich.
    """
    pomiary = rozbieznosc_od_reaktancji_podprzejsciowej()
    assert pomiary[0].wartosc == pytest.approx(0.30), "Pierwszy punkt to redukcja R1"
    assert pomiary[0].blad_modu_najslabiej_tlumionego < TOL_WIDMA

    bledy = [p.blad_modu_najslabiej_tlumionego for p in pomiary]
    assert bledy == sorted(bledy), f"Rozbieżność niemonotoniczna: {bledy}"
    assert bledy[-1] > 1.0e-2, "Przy odstępie 0,15 p.u. rozbieżność ma być istotna"

    for pomiar in pomiary:
        assert (
            pomiar.blad_punktu_pracy < TOL_PUNKT_PRACY
        ), "Xd'' zmienił punkt pracy — a nie powinien wchodzić do stanu ustalonego."


def test_rozbieznosc_maleje_liniowo_ze_stala_czasowa_tlumika() -> None:
    """Redukcja R2: ``Td0'' → 0`` przy CZYNNYM odstępie ``Xd''``.

    To jest silniejsze twierdzenie niż „modele się różnią": rozbieżność ma znikać
    LINIOWO ze stałą czasową tłumika, co dowodzi, że pochodzi dokładnie z jego
    dynamiki. Gdyby zbiegała do wartości niezerowej, byłby to defekt jednego z
    modeli, a nie różnica strukturalna.

    Sprawdzany jest iloraz ``błąd / Td0''`` — ma być w wąskim paśmie w całym
    zamiataniu (ZMIERZONE ≈ 1,25 s⁻¹), a nie tylko monotoniczny.
    """
    pomiary = rozbieznosc_od_stalej_tlumika()
    ilorazy = [p.blad_modu_najslabiej_tlumionego / p.wartosc for p in pomiary]
    assert min(ilorazy) > 0.0
    assert (
        max(ilorazy) / min(ilorazy) < 1.5
    ), f"Rozbieżność nie jest liniowa w Td0'': ilorazy {ilorazy}"
    najszybszy = min(pomiary, key=lambda p: p.wartosc)
    assert najszybszy.blad_modu_najslabiej_tlumionego < 2.0e-3


@pytest.mark.parametrize("xq_prim_pu", [0.55, 0.45])
def test_anizotropia_przejsciowa_zgadza_sie_w_granicy_szybkich_tlumikow(
    xq_prim_pu: float,
) -> None:
    """Domyślna, REALISTYCZNA parametryzacja laboratorium ma ``Xd' ≠ Xq'``.

    Do tej pory cały ten plik sprawdzał wyłącznie maszynę izotropową przejściowo
    (``Xd' = Xq'``), bo tylko dla niej istnieje redukcja DOKŁADNA — ANDES wymusza
    ``Xd'' = Xq''``, więc odstęp podprzejściowy nie może zniknąć w obu osiach
    naraz. Konfiguracja `MaszynaSynchroniczna4Rzedu` z domyślnymi wartościami
    (``Xd' = 0,30``, ``Xq' = 0,55``) zostawałaby wtedy poza walidacją zewnętrzną —
    czyli akurat ta, którą laboratorium naprawdę liczy.

    Drogą wyjścia jest druga redukcja (R2, ``Td0'' → 0``) i sprawdzamy ją tak,
    żeby nie dało się jej pomylić z dopasowaniem:
      1. PUNKT PRACY musi zgadzać się DOKŁADNIE dla KAŻDEJ stałej tłumika —
         reaktancja podprzejściowa nie wchodzi do stanu ustalonego,
      2. błąd widma musi maleć LINIOWO ze stałą tłumika (stały iloraz),
         a nie tylko „być mały" — liniowość dowodzi, że różnica pochodzi
         dokładnie z dynamiki tłumików.
    """
    baza = PrzypadekGenrou(xq_prim_pu=xq_prim_pu)
    assert baza.anizotropia_przejsciowa
    assert (
        not baza.rownowazne_strukturalnie
    ), "Anizotropia MUSI być zgłoszona jako brak równoważności dokładnej."

    pomiary = rozbieznosc_od_stalej_tlumika(
        baza, x_bis_pu=0.25, stale_s=(0.05, 0.02, 0.01, 0.005, 0.002, 0.001)
    )
    for pomiar in pomiary:
        assert (
            pomiar.blad_punktu_pracy < TOL_PUNKT_PRACY
        ), "Stała tłumika ruszyła punkt pracy — a nie powinna."
    ilorazy = [p.blad_widma / p.wartosc for p in pomiary]
    assert min(ilorazy) > 0.0
    assert (
        max(ilorazy) / min(ilorazy) < 1.2
    ), f"Błąd widma nie jest liniowy w Td0'': ilorazy {ilorazy}"
    najszybszy = min(pomiary, key=lambda p: p.wartosc)
    assert najszybszy.blad_widma < 5.0e-3

    # Metamorficznie: Xq' MUSI zmieniać wynik, inaczej test nie badałby anizotropii.
    izotropowy = rozbieznosc_od_stalej_tlumika(PrzypadekGenrou(), x_bis_pu=0.25, stale_s=(0.001,))[
        0
    ]
    assert abs(izotropowy.blad_widma - najszybszy.blad_widma) > 1.0e-5


def test_nasycenie_rozjezdza_punkt_pracy_a_nie_tylko_dynamike() -> None:
    """Drugi powód nierównoważności działa INACZEJ niż tłumiki — i to ma znaczenie.

    Tłumiki zmieniają wyłącznie dynamikę; nasycenie zmienia także ``δ0`` i SEM
    przejściowe, bo wchodzi do równań stanu ustalonego. Rozróżnienie tych dwóch
    mechanizmów jest treścią zakresu walidacji: gdyby moduł mierzył tylko
    „rozbieżność", obie klasy zlałyby się w jedną liczbę.
    """
    pomiary = rozbieznosc_od_nasycenia()
    assert pomiary[0].wartosc == 0.0
    assert pomiary[0].blad_punktu_pracy < TOL_PUNKT_PRACY

    bledy_pp = [p.blad_punktu_pracy for p in pomiary]
    assert bledy_pp == sorted(bledy_pp), f"Rozbieżność punktu pracy niemonotoniczna: {bledy_pp}"
    assert bledy_pp[-1] > 1.0e-2
    assert pomiary[-1].blad_e_d_prim > 1.0e-2


def test_przypadek_nierownowazny_jest_odrzucany_zamiast_porownywany() -> None:
    """Porównanie modeli nierównoważnych bez świadomej zgody jest ZAKAZANE.

    Najłatwiejsza pomyłka tego modułu to odczytanie różnicy MODELI jako błędu
    laboratorium. Domyślna ścieżka musi więc odmawiać, a nie zwracać liczbę —
    liczba wygląda tak samo w obu przypadkach.
    """
    with pytest.raises(ModeleNierownowazneError, match="tłumiące"):
        porownaj_z_wzorcem(PrzypadekGenrou(x_bis_pu=0.2))
    with pytest.raises(ModeleNierownowazneError, match="[Nn]asycenie"):
        porownaj_z_wzorcem(PrzypadekGenrou(s10=0.1, s12=0.3))

    # Ta sama para przypadków przechodzi, gdy różnica JEST mierzoną wielkością.
    assert (
        porownaj_z_wzorcem(PrzypadekGenrou(x_bis_pu=0.2), wymagaj_rownowaznosci=False).blad_widma
        > 0.0
    )


def test_powody_nierownowaznosci_wymieniaja_oba_mechanizmy() -> None:
    """Lista powodów jest ZAMKNIĘTA — każdy ma przypięty osobny pomiar."""
    assert PrzypadekGenrou().powody_nierownowaznosci == ()
    assert PrzypadekGenrou().rownowazne_strukturalnie
    dwa = PrzypadekGenrou(x_bis_pu=0.2, s10=0.1, s12=0.3).powody_nierownowaznosci
    assert len(dwa) == 2
    assert any("tłumiące" in p for p in dwa)
    assert any("asycenie" in p for p in dwa)


# --------------------------------------------------------------------------
# Pułapki narzędzia wzorcowego
# --------------------------------------------------------------------------


def test_pulapka_bazy_czestotliwosci_dotyczy_takze_genrou(przypadek) -> None:
    """Wzorzec na 60 Hz musi być ODRZUCONY, a nie przeskalowany.

    Przeskalowanie byłoby fabrykacją zgodności: „dopasowaniem" wzorca do modelu
    wzorem, który wzorzec ma właśnie sprawdzić.
    """
    with pytest.raises(NiezgodnaBazaCzestotliwosciError):
        wynik_wzorca(przypadek, fn_hz=60.0)
    assert wynik_wzorca(przypadek).baza_czestotliwosci_hz == pytest.approx(F_BAZOWA_HZ)


def test_ustawienie_config_freq_nie_dziala_na_genrou() -> None:
    """Twierdzenie docstringu: skuteczny jest wyłącznie ``fn`` PRZY URZĄDZENIU.

    Bez tego testu byłaby to opowieść. Z nim jest to zmierzony fakt: mimo
    ``ss.config.freq = 50`` GENROU zostaje na 60 Hz, czyli na innej sieci niż
    laboratorium.
    """
    ss = andes.System()
    ss.config.freq = 50.0
    ss.add("Bus", {"idx": 1, "Vn": 110.0, "v0": 1.0})
    ss.add("Bus", {"idx": 2, "Vn": 110.0, "v0": 1.0, "a0": 0.0})
    ss.add("Line", {"idx": 1, "bus1": 1, "bus2": 2, "r": 0.0, "x": 0.15, "b": 0.0, "Sn": 100.0})
    ss.add("PV", {"idx": 1, "bus": 1, "p0": 0.5, "v0": 1.0, "Sn": 100.0, "qmax": 9.0, "qmin": -9.0})
    ss.add(
        "Slack",
        {"idx": 2, "bus": 2, "v0": 1.0, "a0": 0.0, "Sn": 100.0, "qmax": 9.0, "qmin": -9.0},
    )
    ss.add(
        "GENROU",
        {
            "idx": 1,
            "bus": 1,
            "gen": 1,
            "Sn": 100.0,
            "Vn": 110.0,
            "D": 0.0,
            "M": 8.0,
            "ra": 0.0,
            "xl": 0.0,
            "xd": 1.9,
            "xq": 1.7,
            "xd1": 0.3,
            "xq1": 0.3,
            "xd2": 0.3,
            "xq2": 0.3,
            "Td10": 8.0,
            "Tq10": 0.8,
            "Td20": 0.03,
            "Tq20": 0.02,
            "S10": 0.0,
            "S12": 1.0,
        },
    )
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
    assert (
        float(ss.GENROU.fn.v[0]) == 60.0
    ), "ss.config.freq zaczęło działać — pułapka zniknęła i trzeba przepisać docstring."


def test_rozna_baza_mocy_jest_odrzucana_zamiast_cicho_przeskalowana(przypadek) -> None:
    """Cicha zmiana bazy mocy dałaby porównanie DWÓCH RÓŻNYCH maszyn.

    ANDES przelicza ``M``, ``D`` i ograniczniki z bazy urządzenia na bazę
    systemu (100 MVA), a laboratorium nie przelicza baz w ogóle. Przy
    ``Sn = 200 MVA`` bezwładność wzorca byłaby dwukrotnie inna niż nasza, a
    różnica wyglądałaby jak błąd modelu — dlatego ścieżka ma odmówić.
    """
    with pytest.raises(ModeleNierownowazneError, match="[Bb]aza mocy"):
        wynik_wzorca(PrzypadekGenrou(s_bazowa_mva=200.0))

    class _Config:
        mva = 100.0

    class _System:
        config = _Config()

    _sprawdz_baze_mocy(_System(), przypadek)


def test_s12_zerowe_jest_odrzucane_bo_andes_je_po_cichu_podmienia() -> None:
    """``S10 = S12 = 0`` NIE wyłącza nasycenia w sposób jawny.

    ANDES koryguje ``S12 = 0`` na ``1`` (usługa ``_fS12``), więc przypadek
    liczyłby się z innym parametrem niż zapisany, a raport mówiłby „nasycenie
    wyłączone" na podstawie wartości, której narzędzie nie użyło. Test pilnuje
    OBU stron: że nasz przypadek to odrzuca i że korekta ANDES-a nadal istnieje.
    """
    with pytest.raises(ValueError, match="PUŁAPKĄ"):
        PrzypadekGenrou(s10=0.0, s12=0.0)

    ss = andes.System()
    ss.add("Bus", {"idx": 1, "Vn": 110.0, "v0": 1.0})
    ss.add("Bus", {"idx": 2, "Vn": 110.0, "v0": 1.0, "a0": 0.0})
    ss.add(
        "Line",
        {"idx": 1, "bus1": 1, "bus2": 2, "r": 0.0, "x": 0.15, "b": 0.0, "fn": 50.0, "Sn": 100.0},
    )
    ss.add("PV", {"idx": 1, "bus": 1, "p0": 0.5, "v0": 1.0, "Sn": 100.0, "qmax": 9.0, "qmin": -9.0})
    ss.add(
        "Slack",
        {"idx": 2, "bus": 2, "v0": 1.0, "a0": 0.0, "Sn": 100.0, "qmax": 9.0, "qmin": -9.0},
    )
    ss.add(
        "GENROU",
        {
            "idx": 1,
            "bus": 1,
            "gen": 1,
            "Sn": 100.0,
            "Vn": 110.0,
            "fn": 50.0,
            "D": 0.0,
            "M": 8.0,
            "ra": 0.0,
            "xl": 0.0,
            "xd": 1.9,
            "xq": 1.7,
            "xd1": 0.3,
            "xq1": 0.3,
            "xd2": 0.3,
            "xq2": 0.3,
            "Td10": 8.0,
            "Tq10": 0.8,
            "Td20": 0.03,
            "Tq20": 0.02,
            "S10": 0.0,
            "S12": 0.0,
        },
    )
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        ss.PFlow.run()
        ss.TDS.init()
    assert float(ss.GENROU.S12.v[0]) == 0.0
    assert (
        float(ss.GENROU._S12.v[0]) == 1.0
    ), "Korekta _fS12 zniknęła — pułapka opisana w module przestała istnieć."


def test_unieczynnienie_lead_lag_jest_sprawdzane_a_nie_zakladane() -> None:
    """Gdyby lead-lag wzorca był CZYNNY, porównywalibyśmy inne modele.

    Sprawdzenie działa na atrybutach modelu ANDES, więc testujemy je na obiekcie
    zastępczym: przypadek „TA ≠ TB" nie da się dziś wywołać przez publiczne
    API (``TATB`` jest ustawiane na 1), a właśnie dlatego zabezpieczenie musi
    mieć własny test — inaczej byłoby martwym kodem o nieznanym zachowaniu.
    """

    class _Param:
        def __init__(self, wartosc: float) -> None:
            self.v = [wartosc]

    class _Sexs:
        def __init__(self, t_a: float, t_b: float) -> None:
            self.TA = _Param(t_a)
            self.TB = _Param(t_b)

    class _Tgov:
        def __init__(self, t_2: float, t_3: float, d_t: float) -> None:
            self.T2 = _Param(t_2)
            self.T3 = _Param(t_3)
            self.Dt = _Param(d_t)

    class _System:
        def __init__(self, sexs=None, tgov=None) -> None:
            self.SEXS = sexs
            self.TGOV1 = tgov

    _sprawdz_unieczynnienie_lead_lag(
        _System(sexs=_Sexs(1.0, 1.0), tgov=_Tgov(2.0, 2.0, 0.0)),
        NastawyWzbudzenia(),
        NastawyTurbiny(),
    )
    with pytest.raises(ModeleNierownowazneError, match="TA"):
        _sprawdz_unieczynnienie_lead_lag(_System(sexs=_Sexs(0.4, 1.0)), NastawyWzbudzenia(), None)
    with pytest.raises(ModeleNierownowazneError, match="T2"):
        _sprawdz_unieczynnienie_lead_lag(
            _System(tgov=_Tgov(0.2, 10.0, 0.0)), None, NastawyTurbiny()
        )
    with pytest.raises(ModeleNierownowazneError, match="Dt"):
        _sprawdz_unieczynnienie_lead_lag(_System(tgov=_Tgov(2.0, 2.0, 0.5)), None, NastawyTurbiny())


# --------------------------------------------------------------------------
# Narzędzia pomiarowe modułu — własne wyrocznie
# --------------------------------------------------------------------------


@pytest.mark.parametrize(("sigma", "f_hz"), [(-1.0, 1.5), (-0.2, 0.8), (-3.0, 5.0), (-0.05, 0.35)])
def test_zmierz_mod_oscylacyjny_odtwarza_zadany_mod(sigma: float, f_hz: float) -> None:
    """Narzędzie pomiarowe też potrzebuje wyroczni — tu jest nią zamknięty wzór.

    Bez tego testu błąd w mierniku byłby nieodróżnialny od błędu w modelu:
    porównanie „trajektoria vs wartość własna" mierzy sumę obu.
    """
    omega = 2.0 * math.pi * f_hz
    czas = np.arange(0.0, 10.0, 0.001)
    sygnal = 0.01 * np.exp(sigma * czas) * np.cos(omega * czas)
    zmierzony = zmierz_mod_oscylacyjny(czas, sygnal)
    assert zmierzony.imag == pytest.approx(omega, rel=1.0e-4)
    assert zmierzony.real == pytest.approx(sigma, rel=1.0e-3)


def test_zmierz_mod_oscylacyjny_odmawia_zamiast_zgadywac() -> None:
    """Poza zakresem stosowalności narzędzie ma PODNIEŚĆ WYJĄTEK.

    Zaślepka zwracająca „coś" jest gorsza niż brak funkcji: liczba bez pokrycia
    trafiłaby do raportu nieodróżnialna od pomiaru.
    """
    czas = np.arange(0.0, 2.0, 0.001)
    with pytest.raises(ValueError, match="równomierna"):
        zmierz_mod_oscylacyjny(np.concatenate([czas[:100], czas[100:] + 0.5]), np.ones(czas.size))
    with pytest.raises(ValueError, match="ekstremów"):
        zmierz_mod_oscylacyjny(czas, czas.copy())
    with pytest.raises(ValueError, match="Różne długości"):
        zmierz_mod_oscylacyjny(czas, czas[:-1])
    with pytest.raises(ValueError, match="zbyt krótki"):
        zmierz_mod_oscylacyjny(czas[:4], czas[:4])


def test_dopasowanie_widm_jest_optymalne_a_nie_zachlanne() -> None:
    """Kolejność modów nie może wpływać na wynik dopasowania.

    Dobrany przykład, w którym przypisanie zachłanne („najbliższy wolny", po
    kolei) daje sumę 0,24, a optymalne 0,16 — i inne pary. Gdyby dopasowanie
    było zachłanne, błąd widma zależałby od kolejności zwracanej przez
    ``eigvals``, czyli nie byłby wynikiem.
    """
    dopasowanie = dopasuj_widma((-1.15 + 0j, -1.19 + 0j), (-1.2 + 0j, -1.0 + 0j))
    pary = dict(dopasowanie.pary)
    assert pary[-1.19 + 0j] == -1.2 + 0j
    assert pary[-1.15 + 0j] == -1.0 + 0j


def test_dopasowanie_widm_odmawia_gdy_laboratorium_ma_wiecej_modow() -> None:
    """Cicha utrata modu laboratorium ukryłaby sprzeczność modeli."""
    with pytest.raises(ValueError, match="Skojarzenie zgubiłoby"):
        dopasuj_widma((-1 + 0j, -2 + 0j, -3 + 0j), (-1 + 0j, -2 + 0j))
    with pytest.raises(ValueError, match="samych zer"):
        dopasuj_widma((0j, 0j), (-1 + 0j,))
    with pytest.raises(ValueError, match="Puste widmo"):
        dopasuj_widma((-1 + 0j,), ())


def test_dopasowanie_widm_odklada_zera_zanim_zacznie_kojarzyc() -> None:
    """Zero strukturalne nie może „zabrać" partnera prawdziwemu modowi."""
    dopasowanie = dopasuj_widma((0j, -33.0 + 0j), (-33.0 + 0j, -50.0 + 0j))
    assert dopasowanie.zera_strukturalne_laboratorium == (0j,)
    assert dopasowanie.pary == ((-33.0 + 0j, -33.0 + 0j),)
    assert dopasowanie.mody_wzorca_bez_odpowiednika == (-50.0 + 0j,)
    assert isinstance(dopasowanie, DopasowanieWidm)


# --------------------------------------------------------------------------
# Deklaracje zakresu walidacji — każda z przypiętym testem
# --------------------------------------------------------------------------


def test_zakres_walidacji_wskazuje_istniejace_testy() -> None:
    """Deklaracja „zwalidowane" bez przypiętego testu jest fałszywą pewnością.

    Groźniejszą niż sam brak dowodu, bo wyłącza czujność u czytającego tabelę.
    """
    modul = sys.modules[__name__]
    braki = [
        pozycja.czym
        for pozycja in ZAKRES_WALIDACJI
        if pozycja.zwalidowane and not callable(getattr(modul, pozycja.czym, None))
    ]
    assert not braki, f"Zakres walidacji wskazuje nieistniejące testy: {braki}"


def test_zakres_walidacji_nazywa_takze_to_czego_nie_dowiedziono() -> None:
    """Tabela musi wymieniać obie strony — inaczej byłaby reklamą, nie zakresem.

    To jest bezpośrednia odpowiedź na zarzut, że „zgodna z ANDES do 8e-09"
    sugerowało walidację pełnej dynamiki 4. rzędu i regulatorów.
    """
    niezwalidowane = [p for p in ZAKRES_WALIDACJI if not p.zwalidowane]
    assert len(niezwalidowane) >= 5
    tematy = " ".join(p.rownanie for p in niezwalidowane).lower()
    for wymagany in ("anti-windup", "nasycenie", "tłumiąc", "lead-lag"):
        assert wymagany in tematy, f"Zakres nie wymienia niezwalidowanego obszaru: {wymagany}"
    for pozycja in niezwalidowane:
        assert pozycja.czym.strip(), "Powód braku dowodu musi być podany"

    tabela = tabela_zakresu_walidacji()
    assert tabela.startswith("| Równanie / mechanizm |")
    assert tabela.count("\n") == len(ZAKRES_WALIDACJI) + 1
    assert "| TAK |" in tabela and "| NIE |" in tabela


def test_raport_zakresu_walidacji_zawiera_zmierzone_granice() -> None:
    """Raport ma być gotowy do meldunku i zawierać LICZBY, nie deklaracje."""
    raport = raport_zakresu_walidacji()
    assert "MODELE RÓWNOWAŻNE: tak" in raport
    assert "rozbieżność vs odstęp podprzejściowy" in raport
    assert "rozbieżność vs stała czasowa tłumika" in raport
    assert "rozbieżność vs nasycenie" in raport
    assert raport.count("|") > 100

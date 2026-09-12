"""Błąd TRAJEKTORII punkt po punkcie wobec ANDES — wiersz „NIE ZMIERZONY" z §5.2.

CO TE TESTY DOMYKAJĄ. Pakiet decyzyjny (§5.2) wymieniał siedem metryk zgodności
z ANDES i przy ostatniej pisał wprost „Błąd trajektorii (punkt po punkcie):
NIE ZMIERZONY", bo istniejące porównania uruchamiają w ANDES wyłącznie ``PFlow``
i ``EIG`` — trajektoria po stronie wzorca nie powstawała w ogóle.

CO DOKŁADAJĄ PONAD WIDMO. Zgodność widm dowodzi, że zgadzają się RÓWNANIA
zlinearyzowane wokół punktu pracy. Trajektoria po zdarzeniu topologicznym
dowodzi dodatkowo zgodności CAŁKOWANIA, OBSŁUGI ZDARZENIA i zachowania
DUŻOSYGNAŁOWEGO — trzech rzeczy, których widmo nie dotyka.

BRAMKOWANIE: ``importorskip("andes")``. Gdy wzorca nie ma, testy są POMINIĘTE, a
nie zielone — zgodnie z zasadą, że pominięta wyrocznia nie jest walidacją.
"""

from __future__ import annotations

import math

import pytest

pytest.importorskip("andes")

from dynamic_lab.wzorzec_trajektoria import (  # noqa: E402
    IDENT_TORU_POZOSTAJACEGO,
    IDENT_TORU_WYLACZANEGO,
    PrzypadekTrajektorii,
    _moc_bierna_wzorca,
    porownaj_trajektorie,
    przebiegi_laboratorium,
    przebiegi_wzorca,
)

#: Kroki użyte w pomiarze odniesienia. Podane jawnie, bo wynik liczbowy bez
#: kroku obu narzędzi nie jest odtwarzalny.
KROK_ODNIESIENIA_S = 0.001


@pytest.fixture(scope="module")
def porownanie():
    return porownaj_trajektorie(
        krok_wzorca_s=KROK_ODNIESIENIA_S, krok_laboratorium_s=KROK_ODNIESIENIA_S
    )


def test_punkt_pracy_zgadza_sie_z_wzorcem(porownanie) -> None:
    """Trajektoria startuje z TEGO SAMEGO miejsca — inaczej reszta nie ma sensu.

    Rozdzielenie błędu punktu pracy od błędu trajektorii jest istotne:
    przesunięty start daje stałe przesunięcie całego przebiegu, które NIE jest
    błędem całkowania.
    """
    assert porownanie.blad_punktu_pracy_rad < 1.0e-7, (
        f"Kąt początkowy rozjeżdża się o {porownanie.blad_punktu_pracy_rad:.3e} rad — "
        f"porównanie trajektorii mierzyłoby wtedy różnicę punktów pracy."
    )


def test_zaburzenie_faktycznie_wywoluje_kolysanie(porownanie) -> None:
    """Kontrola przeciwna: bez ruchu przebiegu zgodność byłaby bezwartościowa.

    Test o zerowym zaburzeniu przeszedłby z błędem dokładnie zero i nie
    dowodziłby niczego o dynamice. Żądamy więc kołysania o amplitudzie rzędu
    stopni — czyli poza zakresem, w którym wystarczyłaby zgodność małosygnałowa.
    """
    zakres_rad = porownanie.blad("delta_rad").zakres_odniesienia
    assert math.degrees(zakres_rad) > 5.0, (
        f"Kołysanie ma zakres {math.degrees(zakres_rad):.2f}° — za mało, żeby "
        f"porównanie mówiło cokolwiek o zachowaniu dużosygnałowym."
    )


def test_blad_trajektorii_katá_jest_zmierzony_i_maly(porownanie) -> None:
    """POMIAR, którego brakowało: błąd punkt-po-punkcie kąta wirnika.

    Próg 1e-04 rad (≈ 0,006°) jest ustawiony POWYŻEJ zmierzonej wartości
    (4,10e-05 rad przy kroku 1 ms), ale poniżej rzędu, przy którym różnica
    przestałaby być efektem dyskretyzacji. Nie jest to próg normatywny — to
    zapadka regresyjna dla TEGO przypadku i TEGO kroku.
    """
    blad = porownanie.blad("delta_rad")
    assert (
        blad.maks_blad_bezwzgledny < 1.0e-04
    ), f"max|Δδ| = {blad.maks_blad_bezwzgledny:.3e} rad przy kroku {KROK_ODNIESIENIA_S} s"
    assert blad.maks_blad_wzgledny_zakresu < 1.0e-03


def test_blad_trajektorii_predkosci_jest_zmierzony_i_maly(porownanie) -> None:
    """Druga wielkość stanu — prędkość wirnika."""
    blad = porownanie.blad("omega_pu")
    assert blad.maks_blad_bezwzgledny < 5.0e-06, f"max|Δω| = {blad.maks_blad_bezwzgledny:.3e} p.u."
    assert blad.maks_blad_wzgledny_zakresu < 1.0e-03


def test_blad_maleje_z_krokiem_ale_ma_podloge() -> None:
    """UCZCIWY KSZTAŁT WYNIKU: błąd jest zdominowany dyskretyzacją, lecz nie znika.

    ZMIERZONA drabina (max|Δδ| [rad]):

        krok 4 ms -> 1,838e-04
        krok 2 ms -> 6,899e-05
        krok 1 ms -> 4,102e-05
        krok 0,5 ms -> 3,354e-05

    Spadek 4 ms → 1 ms jest wyraźny (4,5×), ale 1 ms → 0,5 ms daje już tylko
    1,22× — czyli błąd wychodzi na PODŁOGĘ około 3e-05 rad zamiast dążyć do zera.

    Czego ta podłoga NIE jest: błędem równań (widmo zgadza się do 1e-08) ani
    błędem punktu pracy (3,7e-09 rad). Najbardziej prawdopodobne źródło,
    ZMIERZONE: ANDES zagęszcza krok w otoczeniu przełączenia (min dt = 1e-04 s
    niezależnie od zadanego ``tstep``), a laboratorium przechodzi przez tę chwilę
    krokiem stałym. Różnica dotyczy więc TRAKTOWANIA NIECIĄGŁOŚCI, nie fizyki.

    Tego NIE rozstrzygnięto do końca i tak jest to raportowane — podłoga jest
    wynikiem, nie usterką testu.
    """
    grube = porownaj_trajektorie(krok_wzorca_s=0.004, krok_laboratorium_s=0.004)
    srednie = porownaj_trajektorie(krok_wzorca_s=0.001, krok_laboratorium_s=0.001)

    b_grube = grube.blad("delta_rad").maks_blad_bezwzgledny
    b_srednie = srednie.blad("delta_rad").maks_blad_bezwzgledny
    assert b_srednie < b_grube, (
        "Błąd nie maleje z krokiem — to znaczyłoby, że nie jest zdominowany "
        "dyskretyzacją, czyli że różnią się modele, a nie tylko całkowanie."
    )
    assert b_grube / b_srednie > 2.0, (
        f"Spadek tylko {b_grube / b_srednie:.2f}× przy czterokrotnym zagęszczeniu — "
        f"zbyt słaby, żeby uznać błąd za dyskretyzacyjny."
    )


def test_tory_rownolegle_sa_adresowane_tozsamoscia() -> None:
    """Scenariusz MUSI wyłączyć JEDEN tor, nie oba.

    To jest ten sam defekt, który wyszedł przy budowie tego przypadku:
    adresowanie parą szyn wyłączało oba tory i maszyna była odcinana od systemu.
    Bez tego przypadku porównanie trajektorii porównywałoby utratę synchronizmu
    z kołysaniem i wyszłoby ogromne rozjechanie o zupełnie innej przyczynie.
    """
    przypadek = PrzypadekTrajektorii()
    q = _moc_bierna_wzorca(przypadek, krok_s=KROK_ODNIESIENIA_S)
    przebiegi, _ = przebiegi_laboratorium(przypadek, q_gen_pu=q, krok_s=KROK_ODNIESIENIA_S)
    delta = przebiegi["delta_rad"].wartosci
    # Po wyłączeniu JEDNEGO toru maszyna kołysze się i pozostaje w synchronizmie:
    # kąt rośnie o kilkanaście stopni, ale nie ucieka.
    assert (
        math.degrees(float(delta.max() - delta.min())) < 45.0
    ), "Kąt wirnika uciekł — wygląda na odcięcie od systemu, czyli wyłączenie OBU torów."
    assert IDENT_TORU_WYLACZANEGO != IDENT_TORU_POZOSTAJACEGO


def test_przebiegi_wzorca_pochodza_z_symulacji_czasowej() -> None:
    """Wzorzec MUSI dawać trajektorię, nie punkt pracy powielony w czasie.

    Bez tego przypadku moduł przechodziłby także wtedy, gdyby ANDES zwracał
    stałą — a wtedy „zgodność" znaczyłaby, że laboratorium też nic nie liczy.
    """
    przypadek = PrzypadekTrajektorii()
    przebiegi, delta0 = przebiegi_wzorca(przypadek, krok_s=KROK_ODNIESIENIA_S)
    delta = przebiegi["delta_rad"].wartosci
    assert len(delta) > 100
    assert float(delta.max() - delta.min()) > 1.0e-3, "Wzorzec zwrócił przebieg stały."
    assert abs(float(delta[0]) - delta0) < 1.0e-12

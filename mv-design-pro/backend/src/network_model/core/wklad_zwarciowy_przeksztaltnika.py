"""Współczynnik wkładu zwarciowego źródła przekształtnikowego — JEDNO miejsce.

CO OPISUJE. ``k_sc`` mnoży prąd znamionowy falownika, dając jego wkład do prądu
zwarciowego: ``I_k = k_sc · I_n`` (model źródła prądowego o ograniczonej
wydajności, IEC 60909). Wartość zależy od ogranicznika prądu KONKRETNEGO
przekształtnika i pochodzi z karty producenta albo z certyfikatu jednostki
wytwórczej — nie z rodzaju technologii.

DEFEKT, KTÓRY TEN MODUŁ ZAMYKA (pomiar 2026-09-11). Liczba ``1.1`` była wpisana
NA SZTYWNO w DZIEWIĘCIU niezależnych miejscach, bez jednego zdania uzasadnienia
w całym repozytorium, a ślad proweniencji oznaczał ją jako daną katalogową.

TRZY STANY, NIE DWA (korekta po recenzji niezależnej, P1-DELTA-04). Pierwsza
wersja miała wyłącznie „deklaracja" i „domyślka", więc KAŻDA wartość, której nie
umiała przyjąć, cicho stawała się domyślką. To zrównywało dwie ZUPEŁNIE różne
sytuacje:

  * nikt nie podał danej (brak) — stan normalny, obsługiwany domyślką jawnie
    oznaczoną w śladzie;
  * ktoś podał daną NIEPOPRAWNĄ (``NaN``, ``±Inf``, zero, wartość ujemna, tekst,
    ``bool``) — to błąd danych wejściowych, a nie brak.

Zrównanie ich miało zmierzony skutek: ``+Inf`` przechodziło jako DEKLARACJA
(bo predykat sprawdzał wyłącznie ``> 0``), dając ``I_k = inf`` z etykietą
„użytkownik to podał". Recenzent wykonał ten przypadek niezależnie.

Stan trzeci ``DANE_NIEPOPRAWNE`` MUSI docierać do warstwy gotowości jako
blokada — nigdy jako proweniencja katalogowa ani nadpisanie.
"""

from __future__ import annotations

import math

#: Wartość używana, gdy nikt nie podał współczynnika: ANI karta producenta, ANI
#: użytkownik. NIE jest to wartość normatywna ani „typowa dla technologii" —
#: to jawnie oznaczony stan braku danych, wspólny dla wszystkich torów,
#: żeby nie dało się go zmienić w jednym miejscu i przeoczyć w ośmiu innych.
K_SC_DOMYSLNY_SYSTEMOWY: float = 1.1

#: Znaczniki pochodzenia współczynnika w śladzie White Box. Rozróżnienie jest
#: całym sensem tego modułu: wynik policzony z deklaracji producenta, wynik
#: policzony z domyślki systemowej i wynik, którego danej wejściowej NIE DA SIĘ
#: przyjąć, mają RÓŻNĄ wiarygodność i różne skutki dla gotowości.
K_SC_ZRODLO_DEKLARACJA = "DEKLARACJA"
K_SC_ZRODLO_DOMYSLNE = "DOMYSLNE_SYSTEMOWE"
K_SC_ZRODLO_NIEPOPRAWNE = "DANE_NIEPOPRAWNE"
#: Czynniki są każdy z osobna poprawne, ale ich ILOCZYN wychodzi poza zakres
#: liczb skończonych (P1-DELTA-07). Znacznik osobny od DANE_NIEPOPRAWNE, bo
#: wadliwa jest PARA, a nie żadna z wartości z osobna — komunikat musi to
#: powiedzieć, inaczej projektant szuka błędu w niewłaściwym polu.
K_SC_ZRODLO_POZA_DZIEDZINA = "POZA_DZIEDZINA_WYNIKU"
#: Prąd znamionowy źródła jest nieobecny, zerowy, ujemny albo nieskończony —
#: więc WKŁADU NIE DA SIĘ POLICZYĆ. Znacznik osobny od pozostałych, bo wadliwa
#: jest inna dana (tabliczka źródła, nie współczynnik) i inna jest naprawa.
#:
#: KOREKTA (audyt niezależny, plan naprawy §3). Poprzednia wersja zwracała w tej
#: sytuacji ``(0.0, znacznik_k_sc)``: źródło bez prądu znamionowego wnosiło
#: 0 A i ZACHOWYWAŁO znacznik DEKLARACJA, więc wynik zwarciowy pozostawał w
#: pełni miarodajny. Brak danej znamionowej udawał wtedy wkład zerowy — a to
#: dwie różne rzeczy: „nie wnosi prądu" jest twierdzeniem fizycznym, „nie wiem,
#: ile wnosi" jest brakiem danych. Zerowy wkład ZANIŻA prąd zwarciowy, więc
#: przepuszczał aparat o za małej zdolności wyłączalnej.
K_SC_ZRODLO_PRAD_NIEPOPRAWNY = "PRAD_ZNAMIONOWY_NIEPOPRAWNY"


def _jest_liczba_skonczona_dodatnia(wartosc: object) -> bool:
    """Czy wartość nadaje się na współczynnik: liczba SKOŃCZONA i dodatnia.

    ``bool`` odrzucamy jawnie, bo jest podklasą ``int`` — bez tej gałęzi ``True``
    przeszłoby jako ``k_sc = 1.0``, czyli jako deklaracja, której nikt nie złożył.

    ``math.isfinite`` odrzuca ``NaN`` i obie nieskończoności JEDNYM warunkiem.
    Poprzednia wersja sprawdzała wyłącznie ``> 0``: ``NaN > 0`` jest fałszem, więc
    wpadał do domyślki „przypadkiem", a ``+Inf > 0`` jest prawdą, więc przechodził
    jako deklaracja. Ta asymetria była defektem, nie decyzją.

    GÓRNEGO OGRANICZENIA NIE NAKŁADAMY. Nie ma podstawy inżynierskiej, którą
    dałoby się tu uczciwie zacytować, a wymyślony próg odrzucałby poprawne
    deklaracje producentów. Zakres dopuszczalny bada `network_model.validation`
    na gotowym modelu, tam gdzie jest kontekst.
    """
    if isinstance(wartosc, bool):
        return False
    if not isinstance(wartosc, int | float):
        return False
    return math.isfinite(float(wartosc)) and float(wartosc) > 0.0


def wspolczynnik_wkladu_zwarciowego(wartosc: object) -> tuple[float, str]:
    """Zwróć ``(k_sc, znacznik_pochodzenia)`` — JEDEN predykat dla wszystkich torów.

    Wcześniej każdy tor sprawdzał co innego: ``data.get("k_sc", 1.1)``
    przyjmowało zero i wartości ujemne, a ``isinstance(...) and k_sc > 0`` je
    odrzucało. Ta sama dana dawała różny wynik zależnie od tego, którędy weszła
    do modelu.

    Zwracana wartość liczbowa jest ZAWSZE skończona i dodatnia — także w stanie
    ``DANE_NIEPOPRAWNE``, żeby żaden tor nie musiał radzić sobie z ``NaN``. O tym,
    że tej liczby NIE WOLNO użyć jako danej miarodajnej, mówi ZNACZNIK, nie sama
    liczba; konsumuje go warstwa gotowości
    (`network_model.core.zdolnosci_wkladu_zwarciowego`).
    """
    if _jest_liczba_skonczona_dodatnia(wartosc):
        return float(wartosc), K_SC_ZRODLO_DEKLARACJA  # type: ignore[arg-type]
    if wartosc is None:
        return K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE
    return K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_NIEPOPRAWNE


def deklaracja_k_sc(wartosc: object) -> float | None:
    """Deklarowana wartość albo ``None`` — jeden odsiew dla wszystkich torów.

    Modele rdzenia przechowują DEKLARACJĘ (``None`` = nikt nie podał), a wartość
    użytą w rachunku i znacznik pochodzenia WYPROWADZAJĄ z niej właściwościami.

    UWAGA NA ZAKRES TEJ FUNKCJI: sprowadza ona stan ``DANE_NIEPOPRAWNE`` do
    ``None``, bo model rdzenia nie ma pola na „wartość, której nie da się
    przyjąć". Kontrolę poprawności danych wejściowych robi warstwa, która te dane
    PRZYJMUJE (operacja domenowa), i ona melduje błąd — tutaj chodzi wyłącznie o
    to, żeby niepoprawna liczba nie trafiła do rachunku.
    """
    if not _jest_liczba_skonczona_dodatnia(wartosc):
        return None
    return float(wartosc)  # type: ignore[arg-type]


def prad_wkladu_zwarciowego(k_sc: object, i_n_a: object) -> tuple[float, str]:
    """Zwróć ``(I_k, znacznik)`` dla ``I_k = k_sc · I_n`` — z kontrolą DZIEDZINY WYNIKU.

    DLACZEGO NIE WYSTARCZY SPRAWDZIĆ CZYNNIKÓW (P1-DELTA-07, recenzja niezależna).
    Skończoność czynników NIE domyka mnożenia w arytmetyce IEEE-754: recenzent
    wykonał ``k_sc = 1e308`` przy ``I_n = 1000 A`` i dostał ``I_k = inf`` przy
    znaczniku ``DEKLARACJA``. Obie liczby wejściowe przechodziły każdy predykat
    wejściowy, bo każda z osobna jest skończona i dodatnia — wadliwy był dopiero
    ich iloczyn, czyli pierwsza wielkość FIZYCZNA rachunku.

    ŚWIADOMIE BEZ ARBITRALNEGO PROGU ``k_sc``. Właściciel zakazał wymyślania
    uniwersalnego maksimum bez podstawy inżynierskiej i ten zakaz jest tu
    respektowany: nie porównujemy ``k_sc`` z żadną wymyśloną liczbą. Sprawdzamy
    WYŁĄCZNIE to, co jest matematycznie sprawdzalne bez wiedzy o producencie —
    czy wynik działania należy do dziedziny liczb skończonych dodatnich.

    Zwracana wartość jest ZAWSZE skończona (przy przepełnieniu wraca iloczyn
    domyślki i prądu znamionowego), żeby żaden tor nie musiał radzić sobie z
    ``inf``. O tym, że tej liczby NIE WOLNO użyć, mówi znacznik.
    """
    k_sc_wartosc, znacznik = wspolczynnik_wkladu_zwarciowego(k_sc)

    if not _jest_liczba_skonczona_dodatnia(i_n_a):
        # BRAK DANEJ TO NIE JEST WKŁAD ZEROWY. Zwracana liczba pozostaje 0,0,
        # bo żadnej innej nie da się uczciwie policzyć, ale znacznik mówi, że
        # to jest BRAK — i warstwa gotowości ma go zablokować, zamiast przyjąć
        # zaniżony prąd zwarciowy za wynik.
        return 0.0, K_SC_ZRODLO_PRAD_NIEPOPRAWNY

    iloczyn = k_sc_wartosc * float(i_n_a)  # type: ignore[arg-type]
    if not math.isfinite(iloczyn) or iloczyn <= 0.0:
        return K_SC_DOMYSLNY_SYSTEMOWY * float(i_n_a), K_SC_ZRODLO_POZA_DZIEDZINA  # type: ignore[arg-type]
    return iloczyn, znacznik

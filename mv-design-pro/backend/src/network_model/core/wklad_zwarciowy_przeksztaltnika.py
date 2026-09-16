"""Współczynnik wkładu zwarciowego źródła przekształtnikowego — JEDNO miejsce.

CO OPISUJE. ``k_sc`` mnoży prąd znamionowy falownika, dając jego wkład do prądu
zwarciowego: ``I_k = k_sc · I_n`` (model źródła prądowego o ograniczonej
wydajności, IEC 60909). Wartość zależy od ogranicznika prądu KONKRETNEGO
przekształtnika i pochodzi z karty producenta albo z certyfikatu jednostki
wytwórczej — nie z rodzaju technologii.

DEFEKT, KTÓRY TEN MODUŁ ZAMYKA (karta S-2 AUTORYTET, `docs/plan/
SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §0 p. 4, A-3). Przed tą kartą
``InverterSource.k_sc`` miał wartość domyślną 1,1 WPISANĄ NA SZTYWNO w polu
dataclass i DRUGIE pole ``k_sc_zrodlo`` (proweniencja), które musiało się z nią
zgadzać ręcznie — dwie dane opisujące jeden fakt, defekt czekający na dane
brzegowe. Dyrektywa właściciela 2026-09-16: „K_sc pozostaje DEFAULT_FORBIDDEN,
zero domyślek-fantomów" — domyślka systemowa MUSI być jawnie oznaczona w
śladzie i NIGDY nie może być podstawą doboru aparatury, nastaw zabezpieczeń
ani pakietu dowodowego.

TRZY STANY, NIE DWA. Wersja z dwoma stanami („deklaracja"/„domyślka") zrównuje
dwie zupełnie różne sytuacje:

  * nikt nie podał danej (brak) — stan normalny, obsługiwany domyślką jawnie
    oznaczoną w śladzie;
  * ktoś podał daną NIEPOPRAWNĄ (``NaN``, ``±Inf``, zero, wartość ujemna, tekst,
    ``bool``) — to błąd danych wejściowych, a nie brak.

Zrównanie ich ma zmierzony skutek: ``+Inf`` przechodzi jako DEKLARACJA (gdy
predykat sprawdza wyłącznie ``> 0``), dając ``I_k = inf`` z etykietą „użytkownik
to podał". Stan trzeci ``DANE_NIEPOPRAWNE`` MUSI docierać do warstwy gotowości
i autorytetu jako blokada — nigdy jako proweniencja katalogowa ani nadpisanie
domyślki.
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
#: przyjąć, mają RÓŻNĄ wiarygodność i różne skutki dla gotowości i autorytetu.
K_SC_ZRODLO_DEKLARACJA = "DEKLARACJA"
K_SC_ZRODLO_DOMYSLNE = "DOMYSLNE_SYSTEMOWE"
K_SC_ZRODLO_NIEPOPRAWNE = "DANE_NIEPOPRAWNE"
#: Czynniki są każdy z osobna poprawne, ale ich ILOCZYN wychodzi poza zakres
#: liczb skończonych. Znacznik osobny od DANE_NIEPOPRAWNE, bo wadliwa jest PARA,
#: a nie żadna z wartości z osobna — komunikat musi to powiedzieć, inaczej
#: projektant szuka błędu w niewłaściwym polu.
K_SC_ZRODLO_POZA_DZIEDZINA = "POZA_DZIEDZINA_WYNIKU"
#: Prąd znamionowy źródła jest nieobecny, zerowy, ujemny albo nieskończony —
#: więc WKŁADU NIE DA SIĘ POLICZYĆ. Znacznik osobny od pozostałych, bo wadliwa
#: jest inna dana (tabliczka źródła, nie współczynnik) i inna jest naprawa.
#: Poprzedni wzorzec (`enm/mapping.py` sprzed tej karty) zwracał w tej sytuacji
#: wkład 0 A ze znacznikiem DEKLARACJA/ZALOZENIE: źródło bez prądu znamionowego
#: wnosiło 0 A i wynik zwarciowy pozostawał w pełni miarodajny. Brak danej
#: znamionowej udawał wtedy wkład zerowy — a to dwie różne rzeczy: „nie wnosi
#: prądu" jest twierdzeniem fizycznym, „nie wiem, ile wnosi" jest brakiem
#: danych. Zerowy wkład ZANIŻA prąd zwarciowy, więc przepuszczałby aparat o za
#: małej zdolności wyłączalnej.
K_SC_ZRODLO_PRAD_NIEPOPRAWNY = "PRAD_ZNAMIONOWY_NIEPOPRAWNY"


def _jest_liczba_skonczona_dodatnia(wartosc: object) -> bool:
    """Czy wartość nadaje się na współczynnik: liczba SKOŃCZONA i dodatnia.

    ``bool`` odrzucamy jawnie, bo jest podklasą ``int`` — bez tej gałęzi ``True``
    przeszłoby jako ``k_sc = 1.0``, czyli jako deklaracja, której nikt nie złożył.

    ``math.isfinite`` odrzuca ``NaN`` i obie nieskończoności JEDNYM warunkiem —
    sprawdzenie wyłącznie ``> 0`` jest asymetryczne: ``NaN > 0`` jest fałszem
    (wpada do domyślki „przypadkiem"), a ``+Inf > 0`` jest prawdą (przechodzi
    jako deklaracja). Ta asymetria jest defektem, nie decyzją.

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

    Bez tego modułu każdy tor sprawdzał co innego: jeden czytał
    ``data.get("k_sc", 1.1)`` (przyjmowało zero i wartości ujemne), drugi
    ``isinstance(...) and k_sc > 0`` (je odrzucało). Ta sama dana dawała różny
    wynik zależnie od tego, którędy weszła do modelu — dokładnie predykat,
    który reguła KLASA NIE INSTANCJA (CLAUDE.md) każe scalić w jedno źródło
    prawdy.

    Zwracana wartość liczbowa jest ZAWSZE skończona i dodatnia — także w stanie
    ``DANE_NIEPOPRAWNE``, żeby żaden tor nie musiał radzić sobie z ``NaN``. O tym,
    że tej liczby NIE WOLNO użyć jako danej miarodajnej, mówi ZNACZNIK, nie sama
    liczba; znacznik konsumuje warstwa gotowości i autorytetu
    (`network_model.core.zdolnosci_wkladu_zwarciowego`,
    `network_model.core.autorytet_wyniku_zwarciowego`).
    """
    if _jest_liczba_skonczona_dodatnia(wartosc):
        return float(wartosc), K_SC_ZRODLO_DEKLARACJA  # type: ignore[arg-type]
    if wartosc is None:
        return K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE
    return K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_NIEPOPRAWNE


def prad_wkladu_zwarciowego(k_sc: object, i_n_a: object) -> tuple[float, str]:
    """Zwróć ``(I_k, znacznik)`` dla ``I_k = k_sc · I_n`` — z kontrolą DZIEDZINY WYNIKU.

    DLACZEGO NIE WYSTARCZY SPRAWDZIĆ CZYNNIKÓW. Skończoność czynników NIE
    domyka mnożenia w arytmetyce IEEE-754: ``k_sc = 1e308`` przy ``I_n = 1000 A``
    daje ``I_k = inf`` mimo że OBIE liczby wejściowe przechodzą każdy predykat
    wejściowy (każda z osobna jest skończona i dodatnia) — wadliwy jest dopiero
    ich iloczyn, czyli pierwsza wielkość FIZYCZNA rachunku.

    ŚWIADOMIE BEZ ARBITRALNEGO PROGU ``k_sc``. Właściciel zakazał wymyślania
    uniwersalnego maksimum bez podstawy inżynierskiej — ten zakaz jest tu
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
        # to jest BRAK — warstwa gotowości i autorytetu ma go zablokować,
        # zamiast przyjąć zaniżony prąd zwarciowy za wynik.
        return 0.0, K_SC_ZRODLO_PRAD_NIEPOPRAWNY

    iloczyn = k_sc_wartosc * float(i_n_a)  # type: ignore[arg-type]
    if not math.isfinite(iloczyn) or iloczyn <= 0.0:
        return K_SC_DOMYSLNY_SYSTEMOWY * float(i_n_a), K_SC_ZRODLO_POZA_DZIEDZINA  # type: ignore[arg-type]
    return iloczyn, znacznik

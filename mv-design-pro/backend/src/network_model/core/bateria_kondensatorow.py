"""Bateria kondensatorów równoległych SN — słownik układów połączeń i podstawy (liść).

JEDNO źródło dla modelu ENM (``enm.models.ShuntCapacitor.uklad_polaczen``), typu katalogowego
(``catalog.types.ShuntCapacitorType``), rejestru wartości roboczych
(``catalog.wartosci_robocze``), mapowania składowej zerowej (``enm.mapping``), wejścia
uziemienia punktu neutralnego (``solver_input.v126_contracts``), reguł walidatora
(``enm.validator``) i lustra frontu (``frontend/src/types/enm.ts::UkladPolaczenBaterii`` —
równość przypina ``tests/enm/test_bateria_kondensatorow_model.py``). Karta
UX-04/POLE-BKR-MODEL (ENEA Operator, Stacje 110 kV, Zeszyt 1 §17 s. 32 i Zał. 16).

Moduł-LIŚĆ: importuje wyłącznie ``typing``.
"""

from __future__ import annotations

from typing import Literal, get_args

#: Układ połączeń baterii:
#:
#: * ``PODWOJNA_GWIAZDA_IZOLOWANA`` — dwie gwiazdy równoległe z izolowanymi punktami gwiazd,
#:   połączonymi przewodem z przekładnikiem niezrównoważenia (Zeszyt 1 §17, Zał. 16);
#: * ``GWIAZDA_IZOLOWANA`` — pojedyncza gwiazda z izolowanym punktem gwiazdy;
#: * ``GWIAZDA_UZIEMIONA`` — gwiazda z punktem gwiazdy połączonym z ziemią;
#: * ``TROJKAT`` — trójkąt (bez punktu gwiazdy).
UkladPolaczenBaterii = Literal[
    "PODWOJNA_GWIAZDA_IZOLOWANA",
    "GWIAZDA_IZOLOWANA",
    "GWIAZDA_UZIEMIONA",
    "TROJKAT",
]
UKLADY_POLACZEN_BATERII: tuple[str, ...] = get_args(UkladPolaczenBaterii)

#: Nazwa układu w zdaniu dla projektanta.
NAZWY_UKLADOW_POLACZEN_BATERII_PL: dict[str, str] = {
    "PODWOJNA_GWIAZDA_IZOLOWANA": "podwójna gwiazda z izolowanymi punktami gwiazd",
    "GWIAZDA_IZOLOWANA": "gwiazda z izolowanym punktem gwiazdy",
    "GWIAZDA_UZIEMIONA": "gwiazda z uziemionym punktem gwiazdy",
    "TROJKAT": "trójkąt",
}

#: Układy z drogą dla prądu składowej zerowej: wyłącznie gwiazda z uziemionym punktem gwiazdy.
#: Gwiazda izolowana (pojedyncza i podwójna) nie ma połączenia punktu gwiazdy z ziemią, więc
#: prądy trzech faz składowej zerowej (równe co do fazy) nie mają drogi powrotnej; trójkąt nie
#: ma punktu gwiazdy (prąd składowej zerowej nie wypływa z trójkąta do sieci).
UKLADY_Z_DROGA_ZEROWA: frozenset[str] = frozenset({"GWIAZDA_UZIEMIONA"})

#: Układy wymagające przekładnika niezrównoważenia w połączeniu międzygwiazdowym
#: (Zeszyt 1 §17 s. 32: „PP w połączeniu międzygwiazdowym"; Zał. 16 — zabezpieczenie Ir>).
UKLADY_Z_PRZEKLADNIKIEM_NIEZROWNOWAZENIA: frozenset[str] = frozenset({"PODWOJNA_GWIAZDA_IZOLOWANA"})

#: Podstawa pominięcia baterii w składowej zgodnej i przeciwnej zwarcia. Parafraza normy (nie
#: cytat); numer punktu o kondensatorach równoległych nie został zweryfikowany ze źródłem —
#: warunek ogólny jest ten sam, co ustalona przez właściciela podstawa pominięcia admitancji
#: poprzecznych gałęzi (``network_model.core.ybus.PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH``).
PODSTAWA_POMINIECIA_SKLADOWA_ZGODNA_PL = (
    "IEC 60909-0:2016 (parafraza): w składowej zgodnej i przeciwnej pomija się admitancje "
    "poprzeczne elementów nieobrotowych (pkt 5.2 f) — jak pojemności linii), a prąd "
    "rozładowania baterii kondensatorów równoległych nie wchodzi do prądu zwarciowego "
    "niezależnie od chwili zwarcia (punkt normy o kondensatorach i odbiorach nieobrotowych; "
    "numer punktu nie został zweryfikowany ze źródłem); jedynym napięciem czynnym sieci jest "
    "zastępcze źródło c·U_n/√3 w miejscu zwarcia (pkt 5.3.1)"
)

#: Podstawa udziału baterii w składowej zerowej i w prądzie pojemnościowym sieci.
PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL = (
    "Metoda składowych symetrycznych (IEC 60909-0:2016 pkt 5.3.2, parafraza): admitancja "
    "zerowa elementu poprzecznego to admitancja trzech faz połączonych równolegle z powrotem "
    "przez ziemię. Bateria w gwieździe uziemionej ma każdą fazę między przewodem a ziemią, "
    "więc Y0 = Y1 (dla trzech faz jednakowych); gwiazda izolowana, podwójna gwiazda izolowana "
    "i trójkąt nie mają połączenia z ziemią — admitancja zerowa jest zerowa (brak drogi "
    "zerowej) i bateria nie wnosi prądu pojemnościowego przy zwarciu doziemnym"
)

#: Podstawa wymogu pola BKR, przekładników baterii i wyłączenia od transformatora.
PODSTAWA_POLA_BKR_PL = (
    "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1: §13 s. 23 (pola funkcyjne "
    "rozdzielni SN: 2× BKR), §17 s. 32 (podwójna gwiazda, 2 przekładniki napięciowe "
    "międzyfazowe do rozładowania, przekładnik prądowy w połączeniu międzygwiazdowym) "
    "i Zał. 16"
)
PODSTAWA_WYLACZENIA_OD_TR_PL = (
    "IRiESD ENEA Operator, pkt II.4.5.4.4.2 s. 54: każde wyłączenie pola SN transformatora "
    "powoduje wyłączenie baterii kondensatorów zasilanej przez ten transformator"
)


def liczba_stopni_pl(liczba: int) -> str:
    """„1 stopień", „2 stopnie", „5 stopni", „22 stopnie" — liczebnik z rzeczownikiem."""
    if liczba == 1:
        return "1 stopień"
    if liczba % 10 in (2, 3, 4) and liczba % 100 not in (12, 13, 14):
        return f"{liczba} stopnie"
    return f"{liczba} stopni"


def liczba_pozycji_pl(liczba: int) -> str:
    """„1 pozycję", „2 pozycje", „5 pozycji" (biernik po „ma")."""
    if liczba == 1:
        return "1 pozycję"
    if liczba % 10 in (2, 3, 4) and liczba % 100 not in (12, 13, 14):
        return f"{liczba} pozycje"
    return f"{liczba} pozycji"


def sprzecznosc_parametrow_baterii(
    *,
    liczba_stopni: int | None,
    stopnie_zalaczone: list[bool] | None,
    dlawik_ograniczajacy: bool | None,
    dlawik_indukcyjnosc_mh: float | None,
) -> str | None:
    """Zdanie o sprzeczności parametrów baterii NADANYCH na elemencie albo ``None``.

    JEDNO źródło dla walidatora modelu (``enm.models.ShuntCapacitor``) i odmowy zapisu
    parametrów (``enm.bateria_kondensatorow.odmowa_parametrow_baterii``): stan stopni pusty
    albo innej długości niż liczba stopni nadana na elemencie, indukcyjność dławika przy
    baterii bez dławika. Zgodność stanu stopni z liczbą stopni typu albo rejestru sprawdza
    walidator modelu (E043, ``niezgodnosc_stopni``).
    """
    if stopnie_zalaczone is not None and not stopnie_zalaczone:
        return "stan stopni nie może być pusty — podaj stan każdego stopnia baterii"
    if (
        stopnie_zalaczone is not None
        and liczba_stopni is not None
        and len(stopnie_zalaczone) != liczba_stopni
    ):
        return (
            f"stan stopni ma {liczba_pozycji_pl(len(stopnie_zalaczone))}, a bateria ma "
            f"{liczba_stopni_pl(liczba_stopni)}"
        )
    if dlawik_ograniczajacy is False and dlawik_indukcyjnosc_mh is not None:
        return "podano indukcyjność dławika, a bateria nie ma dławika ograniczającego"
    return None

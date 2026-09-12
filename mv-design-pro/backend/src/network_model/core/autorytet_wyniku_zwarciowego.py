"""Autorytet wyniku zwarciowego — JEDYNY wykonywalny punkt autoryzacji.

DLACZEGO TEN MODUŁ ISTNIEJE (recenzja niezależna, runda 2). Poprzednia
remediacja zabramkowała URUCHOMIENIE nowej analizy: graf z falownikiem bez
deklaracji ``k_sc`` nie przechodzi już kwalifikacji dla zwarcia i zabezpieczeń.
Recenzent odrzucił to jako niewystarczające i miał rację — bramka na starcie
solvera nie chroni wyniku, który do systemu WSZEDŁ inną drogą:

* wynik historyczny odczytany z magazynu,
* wynik odtworzony z payloadu (deserializacja),
* wynik skonstruowany ręcznie w kodzie wywołującego,
* liczby podane WPROST w żądaniu HTTP do generatora dowodu.

Reprodukcja sprzed naprawy (wykonana, nie założona): ``POST /api/equipment-proof/pack``
z polem ``required_fault_results`` wypełnionym liczbami z powietrza i
``run_id="BIEG-KTORY-NIGDY-NIE-ISTNIAL"`` wytwarzało kompletny pakiet dowodowy
doboru aparatury. Żaden predykat nie pytał, skąd te prądy pochodzą.

REGUŁA, KTÓRĄ TEN MODUŁ EGZEKWUJE:

    miarodajny wynik zależny od zwarcia
    wymaga miarodajnej proweniencji wejścia.

KLUCZOWA WŁASNOŚĆ — PROWENIENCJI NIE DA SIĘ ZADEKLAROWAĆ, TYLKO WYPROWADZIĆ.
``ProweniencjaWynikuZwarciowego`` nie ma konstruktora przyjmującego „zaufaj mi"
w postaci gotowej flagi. Powstaje WYŁĄCZNIE z danych: z grafu obliczeniowego
albo ze snapshotu ENM. Dwa pozostałe konstruktory (``payload_klienta``,
``bez_sladu``) są jawnymi stanami NIEMIARODAJNYMI i istnieją po to, żeby
wywołujący musiał nazwać sytuację, w której jest, zamiast pominąć temat.

FAIL-CLOSED. Brak proweniencji (``None``) NIE jest przepustką. Jest traktowany
jak ``bez_sladu`` i blokuje — bo „nie wiem, skąd to jest" i „to jest dobre" to
dwie różne odpowiedzi, a produkt inżynierski nie ma prawa ich mylić.

GRANICA JEST WĄSKA. Autoryzacji podlegają wyłącznie zdolności z
``ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO``. Rozpływ mocy, topologia, schemat i
edycja modelu przechodzą niezależnie — wkład zwarciowy nie wchodzi do ich
równań, więc ich blokada byłaby karą bez przyczyny i recenzja wprost jej zakazuje.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_DOMYSLNE,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
    prad_wkladu_zwarciowego,
    wspolczynnik_wkladu_zwarciowego,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KOD_BLOKADY_K_SC_DOMYSLNY,
    KOD_BLOKADY_K_SC_NIEPOPRAWNY,
    KOD_BLOKADY_K_SC_POZA_DZIEDZINA,
    KOD_BLOKADY_PRAD_ZNAMIONOWY_NIEPOPRAWNY,
    ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZdolnoscMiarodajna,
)

#: Wynik nie niesie żadnego śladu pochodzenia — historyczny, odtworzony z
#: payloadu albo zbudowany w kodzie wywołującego. Stan domyślny przy ``None``.
KOD_BLOKADY_WYNIK_BEZ_SLADU = "SI-112"

#: Wielkości zwarciowe podane wprost w żądaniu, bez modelu, z którego by
#: wynikały. Osobny kod od SI-112, bo to inna sytuacja operacyjna: tu ktoś
#: podał liczby świadomie, a produkt ma powiedzieć, czego brakuje (modelu).
KOD_BLOKADY_WYNIK_Z_PAYLOADU = "SI-113"

KOD_BLOKADY_ZNACZNIK_NIEZNANY = "SI-115"
"""Znacznik proweniencji spoza ZAMKNIĘTEJ listy — wynik niemiarodajny.

FAIL-CLOSED, BO INACZEJ LISTA NIE JEST ZAMKNIĘTA. Pierwsza wersja pomijała
znacznik, którego nie znała (``if wpis is None: continue``), więc dowolny napis
niebędący żadnym ze znanych znaczników przechodził jako brak zastrzeżeń.
ZMIERZONE na HEAD 64004a5d: ``ze_znacznikow(("NIEZNANY_ZNACZNIK",))`` dawało
``wynik_jest_miarodajny(REGULATORY_EVIDENCE) == True``.

Milczenie o znaczniku, którego się nie rozumie, jest najgorszą z możliwych
odpowiedzi: nowy znacznik dodany w warstwie wkładu (a takich przybyło w tej
rundzie dwa) automatycznie NIE BLOKOWAŁBY niczego, dopóki ktoś nie dopisałby go
tutaj — czyli domyślnym zachowaniem nowego ostrzeżenia byłoby jego zignorowanie."""


class ZrodloWynikuZwarciowego(StrEnum):
    """Skąd wzięły się wielkości zwarciowe podane konsumentowi."""

    #: Policzone przez solver z modelu, którego proweniencję znamy.
    SOLVER_Z_MODELU = "SOLVER_Z_MODELU"
    #: Liczby z żądania klienta — brak modelu, z którego by wynikały.
    PAYLOAD_KLIENTA = "PAYLOAD_KLIENTA"
    #: Wynik bez śladu: historyczny, deserializowany, ręcznie skonstruowany.
    BRAK_SLADU = "BRAK_SLADU"


@dataclass(frozen=True)
class BlokadaAutorytetu:
    """Powód, dla którego wynik nie może zostać użyty jako miarodajny."""

    kod: str
    zdolnosc: ZdolnoscMiarodajna
    komunikat_pl: str

    def to_dict(self) -> dict[str, str]:
        return {
            "kod": self.kod,
            "zdolnosc": str(self.zdolnosc),
            "komunikat_pl": self.komunikat_pl,
        }


class BrakAutorytetuWyniku(Exception):
    """Podniesiony, gdy konsument miarodajny dostaje niemiarodajne wejście.

    Niesie komplet blokad, żeby warstwa API mogła je przełożyć na odpowiedź bez
    zgadywania powodu.
    """

    def __init__(self, blokady: tuple[BlokadaAutorytetu, ...]) -> None:
        self.blokady = blokady
        super().__init__("; ".join(b.komunikat_pl for b in blokady))


@dataclass(frozen=True)
class ProweniencjaWynikuZwarciowego:
    """Pochodzenie wielkości zwarciowych — wyprowadzone z danych, nie deklarowane.

    ``znaczniki_k_sc`` to znaczniki pochodzenia ``k_sc`` WSZYSTKICH czynnych
    źródeł falownikowych, które weszły do rachunku. Pusta krotka przy źródle
    ``SOLVER_Z_MODELU`` znaczy „model nie ma czynnych falowników" — i jest
    stanem MIARODAJNYM, bo wtedy wkład falownikowy nie wchodzi do równań wcale.
    """

    zrodlo: ZrodloWynikuZwarciowego
    znaczniki_k_sc: tuple[str, ...] = ()

    # -- konstruktory wyprowadzające ----------------------------------------

    @classmethod
    def z_grafu(cls, graph: Any) -> ProweniencjaWynikuZwarciowego:
        """Proweniencja policzona z grafu obliczeniowego.

        Źródła wyłączone (``in_service=False``) są pomijane — nie wnoszą prądu,
        więc ich brak deklaracji nie może blokować niczego.
        """
        zrodla = getattr(graph, "inverter_sources", None) or {}
        wartosci = zrodla.values() if isinstance(zrodla, Mapping) else zrodla
        return cls(
            zrodlo=ZrodloWynikuZwarciowego.SOLVER_Z_MODELU,
            znaczniki_k_sc=tuple(
                sorted(_znacznik_zrodla(z) for z in wartosci if getattr(z, "in_service", True))
            ),
        )

    @classmethod
    def ze_znacznikow(cls, znaczniki: Iterable[str]) -> ProweniencjaWynikuZwarciowego:
        """Proweniencja odtworzona ze znaczników zapisanych przy wyniku.

        Używana dla wyniku wczytanego z magazynu albo z payloadu, który ślad
        NIESIE. Wynik bez śladu nie trafia tutaj — dla niego właściwy jest
        ``bez_sladu`` i blokada SI-112.
        """
        return cls(
            zrodlo=ZrodloWynikuZwarciowego.SOLVER_Z_MODELU,
            znaczniki_k_sc=tuple(sorted(znaczniki)),
        )

    # -- konstruktory stanów jawnie niemiarodajnych -------------------------

    @classmethod
    def payload_klienta(cls) -> ProweniencjaWynikuZwarciowego:
        """Wielkości podane wprost w żądaniu — zawsze niemiarodajne."""
        return cls(zrodlo=ZrodloWynikuZwarciowego.PAYLOAD_KLIENTA)

    @classmethod
    def bez_sladu(cls) -> ProweniencjaWynikuZwarciowego:
        """Wynik bez śladu pochodzenia — zawsze niemiarodajny."""
        return cls(zrodlo=ZrodloWynikuZwarciowego.BRAK_SLADU)


def _znacznik_zrodla(zrodlo: Any) -> str:
    """Znacznik pochodzenia ``k_sc`` źródła, z kontrolą dziedziny iloczynu.

    PRZEPEŁNIENIE JEST WADĄ WEJŚCIA, NIE WYNIKU (P1-DELTA-07). Skończone
    ``k_sc`` i skończone ``I_n`` mogą dać nieskończony iloczyn — samo sprawdzenie
    czynników tego nie wyklucza. Dlatego znacznik liczy się z OBU wielkości.
    """
    deklaracja = getattr(zrodlo, "k_sc", None)
    znacznik = wspolczynnik_wkladu_zwarciowego(deklaracja)[1]
    if znacznik != K_SC_ZRODLO_DEKLARACJA:
        return znacznik
    return prad_wkladu_zwarciowego(deklaracja, getattr(zrodlo, "in_rated_a", None))[1]


ZNACZNIKI_BEZ_ZASTRZEZEN: frozenset[str] = frozenset({K_SC_ZRODLO_DEKLARACJA})
"""Znaczniki, które NIE wnoszą zastrzeżenia — lista ZAMKNIĘTA i rozłączna z
kluczami ``_KOMUNIKAT_ZNACZNIKA``. Rozłączność i kompletność wobec zbioru
znaczników wystawianych przez warstwę wkładu są PRZYPIĘTE TESTEM: gdyby jakiś
znacznik wypadł z obu list, wróciłoby ciche przepuszczanie, a gdyby wpadł do obu
— o tym samym stanie orzekałyby dwie sprzeczne reguły."""

_KOMUNIKAT_ZNACZNIKA: dict[str, tuple[str, str]] = {
    K_SC_ZRODLO_DOMYSLNE: (
        KOD_BLOKADY_K_SC_DOMYSLNY,
        "Wkład zwarciowy źródła falownikowego pochodzi z domyślki systemowej, "
        "nie z deklaracji producenta. Podaj współczynnik z karty jednostki "
        "wytwórczej, żeby wynik mógł być podstawą tej decyzji.",
    ),
    K_SC_ZRODLO_NIEPOPRAWNE: (
        KOD_BLOKADY_K_SC_NIEPOPRAWNY,
        "Zadeklarowany współczynnik wkładu zwarciowego jest niemożliwy do "
        "przyjęcia. Popraw wartość w danych źródła falownikowego.",
    ),
    K_SC_ZRODLO_POZA_DZIEDZINA: (
        KOD_BLOKADY_K_SC_POZA_DZIEDZINA,
        "Iloczyn współczynnika wkładu zwarciowego i prądu znamionowego źródła "
        "wykracza poza zakres liczb skończonych. Popraw dane znamionowe źródła "
        "falownikowego.",
    ),
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY: (
        KOD_BLOKADY_PRAD_ZNAMIONOWY_NIEPOPRAWNY,
        "Źródło falownikowe nie ma poprawnego prądu znamionowego I_n, więc jego "
        "wkładu zwarciowego nie da się policzyć. Wkład zerowy zaniżyłby prąd zwarciowy "
        "i przepuścił aparat o za małej zdolności wyłączalnej — uzupełnij dane "
        "tabliczkowe źródła.",
    ),
}


def blokady_autorytetu(
    zdolnosc: ZdolnoscMiarodajna,
    proweniencja: ProweniencjaWynikuZwarciowego | None,
) -> tuple[BlokadaAutorytetu, ...]:
    """Powody, dla których ``zdolnosc`` nie może skonsumować tego wyniku.

    Pusta krotka znaczy „wolno". ``proweniencja=None`` znaczy „nie wiem" i jest
    traktowane jak brak śladu — fail-closed.
    """
    if zdolnosc not in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO:
        return ()

    if proweniencja is None:
        proweniencja = ProweniencjaWynikuZwarciowego.bez_sladu()

    if proweniencja.zrodlo is ZrodloWynikuZwarciowego.BRAK_SLADU:
        return (
            BlokadaAutorytetu(
                kod=KOD_BLOKADY_WYNIK_BEZ_SLADU,
                zdolnosc=zdolnosc,
                komunikat_pl=(
                    "Wynik zwarciowy nie niesie śladu pochodzenia wkładu "
                    "falownikowego, więc nie może być podstawą tej decyzji. "
                    "Przelicz zwarcie na modelu, dla którego ślad powstaje."
                ),
            ),
        )

    if proweniencja.zrodlo is ZrodloWynikuZwarciowego.PAYLOAD_KLIENTA:
        return (
            BlokadaAutorytetu(
                kod=KOD_BLOKADY_WYNIK_Z_PAYLOADU,
                zdolnosc=zdolnosc,
                komunikat_pl=(
                    "Wielkości zwarciowe podano wprost w żądaniu, bez modelu, z "
                    "którego wynikają. Podaj model (snapshot), żeby wynik mógł "
                    "być podstawą tej decyzji."
                ),
            ),
        )

    blokady: list[BlokadaAutorytetu] = []
    for znacznik in sorted(set(proweniencja.znaczniki_k_sc)):
        wpis = _KOMUNIKAT_ZNACZNIKA.get(znacznik)
        if wpis is None:
            # ZNACZNIK NIEZNANY => BLOKADA, nie pominięcie. Lista znaczników
            # bezpiecznych jest ZAMKNIĘTA (`ZNACZNIKI_BEZ_ZASTRZEZEN`) i
            # rozłączna z listą blokujących; wszystko poza ich sumą jest dla
            # tej warstwy nierozpoznane, a nierozpoznane nie może znaczyć „w
            # porządku".
            if znacznik in ZNACZNIKI_BEZ_ZASTRZEZEN:
                continue
            blokady.append(
                BlokadaAutorytetu(
                    kod=KOD_BLOKADY_ZNACZNIK_NIEZNANY,
                    zdolnosc=zdolnosc,
                    komunikat_pl=(
                        f"Wynik zwarciowy niesie znacznik pochodzenia "
                        f'„{znacznik}", którego ta warstwa nie zna, więc nie '
                        f"potrafi ocenić, czy wynik wolno użyć do tej decyzji. "
                        f"Wynik nieoceniony nie jest wynikiem przyjętym."
                    ),
                )
            )
            continue
        kod, komunikat = wpis
        blokady.append(BlokadaAutorytetu(kod=kod, zdolnosc=zdolnosc, komunikat_pl=komunikat))
    return tuple(blokady)


def wynik_jest_miarodajny(
    zdolnosc: ZdolnoscMiarodajna,
    proweniencja: ProweniencjaWynikuZwarciowego | None,
) -> bool:
    """Czy ``zdolnosc`` może skonsumować wynik o tej proweniencji."""
    return not blokady_autorytetu(zdolnosc, proweniencja)


def wymagaj_autorytetu(
    zdolnosci: Iterable[ZdolnoscMiarodajna],
    proweniencja: ProweniencjaWynikuZwarciowego | None,
) -> None:
    """Bramka wywoływana przez konsumenta miarodajnego. Podnosi przy braku prawa.

    Przyjmuje ZBIÓR zdolności, bo jeden artefakt potrafi realizować więcej niż
    jedną (pakiet doboru aparatury jest jednocześnie doborem zdolności
    wyłączalnej i dowodem wytrzymałości zwarciowej).
    """
    blokady: list[BlokadaAutorytetu] = []
    for zdolnosc in zdolnosci:
        blokady.extend(blokady_autorytetu(zdolnosc, proweniencja))
    if blokady:
        raise BrakAutorytetuWyniku(tuple(blokady))

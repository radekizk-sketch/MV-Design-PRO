"""Które ZDOLNOŚCI zależą od wkładu zwarciowego falowników — kontrakt maszynowy.

DECYZJA WŁAŚCICIELA, WIĄŻĄCA (recenzja niezależna, P0-DELTA-03): domyślka
systemowa ``k_sc`` NIE JEST miarodajną daną inżynierską. Wynik policzony z takiej
domyślki wolno pokazać jako ROBOCZY, ale nie wolno go skonsumować jako podstawy
doboru aparatury, nastaw zabezpieczeń ani dowodu.

DLACZEGO OSOBNY MODUŁ, A NIE `if` W JEDNYM MIEJSCU. Recenzent odrzucił poprzednią
wersję właśnie za to, że znacznik ``DEFAULT_FORBIDDEN`` był informacyjny:
docierał do śladu, ale ŻADEN predykat go nie czytał, więc ten sam graf
przechodził `check_eligibility` dla zwarcia. Gdyby naprawa polegała na dopisaniu
warunku w `eligibility.py`, każdy kolejny konsument (dobór aparatu, pakiet
dowodowy, raport) musiałby pamiętać o powtórzeniu tego warunku — i pierwszy,
który zapomni, otworzy tę samą dziurę. Lista zdolności jest tu RAZ i jest
maszynowo czytelna.

GRANICA JEST ZAMIERZONA I WĄSKA. Blokujemy WYŁĄCZNIE te zdolności, dla których
prąd zwarciowy falownika jest wielkością wejściową. Rozpływ mocy, topologia,
schemat i edycja modelu pozostają niezależnie dostępne — wkład zwarciowy nie
wchodzi do ich równań, więc ich blokada byłaby karą bez przyczyny.
"""

from __future__ import annotations

from enum import StrEnum

from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
)


class ZdolnoscMiarodajna(StrEnum):
    """Zdolności inżynierskie rozpatrywane osobno pod kątem miarodajności danych.

    Nazwy odpowiadają zdolnościom wymienionym w decyzji właściciela. Kilka z nich
    nie ma dziś własnego typu analizy w `SolverAnalysisType` (dobór aparatury,
    dowód wytrzymałości zwarciowej, dowód regulacyjny) — są tu mimo to, bo
    kontrakt opisuje ZDOLNOŚCI, nie bieżący zestaw endpointów, i to on ma
    powiedzieć nowemu konsumentowi, po której stronie granicy stoi.
    """

    LOAD_FLOW = "LOAD_FLOW"
    SHORT_CIRCUIT_3F = "SHORT_CIRCUIT_3F"
    SHORT_CIRCUIT_1F = "SHORT_CIRCUIT_1F"
    PROTECTION = "PROTECTION"
    BREAKING_CAPACITY_SELECTION = "BREAKING_CAPACITY_SELECTION"
    PROTECTION_COORDINATION = "PROTECTION_COORDINATION"
    SC_WITHSTAND_EVIDENCE = "SC_WITHSTAND_EVIDENCE"
    REGULATORY_EVIDENCE = "REGULATORY_EVIDENCE"
    TOPOLOGY = "TOPOLOGY"
    SLD = "SLD"
    EDITING = "EDITING"


#: Zdolności, dla których prąd zwarciowy falownika JEST wielkością wejściową.
#: Zbiór ZAMKNIĘTY — dopisanie zdolności bez wpisu tutaj jest naruszeniem
#: kontraktu i łapie je test `test_kazda_zdolnosc_ma_jawna_klasyfikacje`.
ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO: frozenset[ZdolnoscMiarodajna] = frozenset(
    {
        ZdolnoscMiarodajna.SHORT_CIRCUIT_3F,
        ZdolnoscMiarodajna.SHORT_CIRCUIT_1F,
        ZdolnoscMiarodajna.PROTECTION,
        ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION,
        ZdolnoscMiarodajna.PROTECTION_COORDINATION,
        ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE,
        ZdolnoscMiarodajna.REGULATORY_EVIDENCE,
    }
)

#: Zdolności, do których równań wkład zwarciowy falownika NIE WCHODZI. Zbiór
#: wymieniony JAWNIE, a nie liczony jako dopełnienie: dopełnienie milcząco
#: wciągnęłoby każdą nową zdolność na stronę „wolno", czyli w stronę niebezpieczną.
ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO: frozenset[ZdolnoscMiarodajna] = frozenset(
    {
        ZdolnoscMiarodajna.LOAD_FLOW,
        ZdolnoscMiarodajna.TOPOLOGY,
        ZdolnoscMiarodajna.SLD,
        ZdolnoscMiarodajna.EDITING,
    }
)

#: Kod blokady — brak deklaracji współczynnika przy CZYNNYM źródle falownikowym.
KOD_BLOKADY_K_SC_DOMYSLNY = "SI-110"
#: Kod blokady — deklaracja podana, ale niemożliwa do przyjęcia (NaN, ±Inf, 0, …).
KOD_BLOKADY_K_SC_NIEPOPRAWNY = "SI-111"
#: Kod blokady — czynniki poprawne, ale iloczyn ``k_sc · I_n`` wychodzi poza
#: dziedzinę liczb skończonych (P1-DELTA-07). Osobny kod, bo osobna naprawa:
#: projektant ma poprawić PARĘ danych znamionowych, nie sam współczynnik.
KOD_BLOKADY_K_SC_POZA_DZIEDZINA = "SI-114"


def zdolnosc_zalezy_od_wkladu_zwarciowego(zdolnosc: ZdolnoscMiarodajna) -> bool:
    """Czy wkład zwarciowy falownika wchodzi do równań tej zdolności."""
    return zdolnosc in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO


def wklad_jest_miarodajny(k_sc_zrodlo: str) -> bool:
    """Czy współczynnik o tym pochodzeniu wolno uznać za daną miarodajną.

    Miarodajna jest WYŁĄCZNIE deklaracja. Domyślka systemowa, dana niepoprawna i
    para wychodząca poza dziedzinę wyniku są niemiarodajne — różni je przyczyna i
    komunikat, nie skutek.
    """
    return k_sc_zrodlo == K_SC_ZRODLO_DEKLARACJA


def kod_blokady_dla_pochodzenia(k_sc_zrodlo: str) -> str:
    """Kod blokady odpowiadający przyczynie niemiarodajności."""
    if k_sc_zrodlo == K_SC_ZRODLO_NIEPOPRAWNE:
        return KOD_BLOKADY_K_SC_NIEPOPRAWNY
    if k_sc_zrodlo == K_SC_ZRODLO_POZA_DZIEDZINA:
        return KOD_BLOKADY_K_SC_POZA_DZIEDZINA
    return KOD_BLOKADY_K_SC_DOMYSLNY


def komunikat_blokady(*, ref_zrodla: str, k_sc_zrodlo: str) -> str:
    """Komunikat blokady — mówi, CZEGO brakuje i SKĄD to wziąć."""
    if k_sc_zrodlo == K_SC_ZRODLO_POZA_DZIEDZINA:
        return (
            f"Źródło falownikowe '{ref_zrodla}': iloczyn współczynnika wkładu zwarciowego "
            f"k_sc i prądu znamionowego I_n wykracza poza zakres liczb skończonych, więc "
            f"pierwsza wielkość fizyczna rachunku nie istnieje. Popraw dane znamionowe źródła."
        )
    if k_sc_zrodlo == K_SC_ZRODLO_NIEPOPRAWNE:
        return (
            f"Źródło falownikowe '{ref_zrodla}' ma niemożliwą do przyjęcia deklarację "
            f"współczynnika wkładu zwarciowego k_sc (wymagana liczba skończona i dodatnia). "
            f"Wynik zwarciowy nie może być miarodajny — popraw daną wejściową."
        )
    return (
        f"Źródło falownikowe '{ref_zrodla}' nie ma zadeklarowanego współczynnika wkładu "
        f"zwarciowego k_sc. Wartość domyślna systemu NIE JEST daną inżynierską: podaj k_sc "
        f"z karty producenta albo certyfikatu jednostki wytwórczej. Rozpływ mocy, topologia "
        f"i schemat pozostają dostępne."
    )

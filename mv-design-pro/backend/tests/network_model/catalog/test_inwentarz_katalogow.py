"""Macierz gotowości katalogów jest POMIAREM — i pomiar musi się dać powtórzyć.

DLACZEGO TEN PLIK ISTNIEJE. Kanon (§23) żąda, żeby gotowość katalogów była
MIERZONA, nie deklarowana, i żeby „gotowość" nie znaczyła „dużo rekordów".
Skrypt `scripts/inwentarz_katalogow.py` liczy ją z żywego katalogu; te testy
pilnują, żeby sam MIERNIK nie zaczął kłamać — bo fałszywy pomiar jest gorszy niż
brak pomiaru: wygląda na wynik.

DWIE POMYŁKI POPEŁNIONE PRZY PISANIU MIERNIKA, oba przypadki przypięte niżej:

1. NAZWY PÓL Z PAMIĘCI. Pierwsza wersja pytała o `primary_a`, `i_th_a`,
   `q_mvar` — nazw, których kontrakt nie ma — i raportowała 0 % kompletności
   tam, gdzie dane BYŁY (`ratio_primary_a`, `ith_1s_a`, `rated_mvar`).
2. WZORZEC ZAMIAST STRUKTURY. Klasyfikacja proweniencji po samym wyrażeniu
   regularnym uznała 6887 certyfikatów PTPiREE za „bez źródła zewnętrznego",
   bo „PTPiREE Wykaz urzadzen 1.2" nie ma numeru w kształcie normy — mimo że
   rekord niesie `document_number`, `source_url` i datę publikacji.
"""

from __future__ import annotations

import dataclasses

import pytest
from network_model.catalog.repository import get_default_mv_catalog

from scripts.inwentarz_katalogow import WYMAGANE, WYPROWADZALNE, zmierz


def _pola_kontraktu(akcesor: str) -> set[str]:
    pozycje = getattr(get_default_mv_catalog(), akcesor)()
    if not pozycje:
        return set()
    return set(dataclasses.asdict(pozycje[0]).keys())


@pytest.mark.parametrize("rodzina", sorted(WYMAGANE))
def test_kazde_pole_wymagane_istnieje_w_kontrakcie(rodzina: str) -> None:
    """Miernik nie może pytać o pole, którego kontrakt nie ma.

    To jest bramka na pomyłkę nr 1: nazwa spoza kontraktu daje 0 % kompletności
    i FAŁSZYWY brak danych. Test odrzuca ją, zanim trafi do raportu.
    """
    pola = _pola_kontraktu(f"list_{rodzina}")
    if not pola:
        pytest.skip(f"rodzina '{rodzina}' jest pusta — nie ma z czym porównać")
    nieznane = sorted(set(WYMAGANE[rodzina]) - pola)
    assert not nieznane, (
        f"Miernik pyta rodzinę '{rodzina}' o pola spoza kontraktu: {nieznane}. "
        f"Dostępne: {sorted(pola)}"
    )


@pytest.mark.parametrize("rodzina", sorted(WYPROWADZALNE))
def test_pole_wyprowadzalne_ma_w_kontrakcie_swoja_podstawe(rodzina: str) -> None:
    """„Wyprowadzalne" znaczy: podstawa wyprowadzenia JEST w kontrakcie.

    Bez tego testu lista wyjątków stałaby się workiem na braki: wystarczyłoby
    dopisać pole do `WYPROWADZALNE`, żeby zniknęło z raportu — razem z luką,
    którą opisywało.
    """
    pola = _pola_kontraktu(f"list_{rodzina}")
    for pole, opis in WYPROWADZALNE[rodzina].items():
        assert pole in pola, f"{rodzina}: '{pole}' nie istnieje w kontrakcie"
        podstawa = opis.split("`")[1] if "`" in opis else ""
        assert podstawa, f"{rodzina}/{pole}: opis wyprowadzenia nie nazywa pola podstawy"
        assert (
            podstawa in pola
        ), f"{rodzina}/{pole}: podstawa wyprowadzenia '{podstawa}' nie istnieje w kontrakcie"


def test_certyfikaty_ptpiree_maja_zrodlo_zewnetrzne() -> None:
    """Wykaz PTPiREE JEST dokumentem zewnętrznym — bramka na pomyłkę nr 2.

    Klasyfikacja po samym wzorcu tekstowym dawała tu 0/6887. Pozycja niesie
    `document_number`, `source_url` i datę publikacji, więc sygnał strukturalny
    rozstrzyga przed wzorcem.
    """
    pomiar = zmierz()["ptpiree_generator_certificates"]
    assert pomiar["liczba"] > 0
    assert pomiar["zrodla"].get("DOKUMENT_ZEWNETRZNY") == pomiar["liczba"]


def test_miernik_nie_gubi_zadnej_rodziny_katalogu() -> None:
    """Pomiar obejmuje KAŻDY akcesor `list_*` — inwentarz nie może być wybiórczy.

    Rodzina pominięta w pomiarze jest niewidoczna w macierzy gotowości, więc
    nigdy nie zostanie zgłoszona jako niekompletna.
    """
    katalog = get_default_mv_catalog()
    akcesory = {m.removeprefix("list_") for m in dir(katalog) if m.startswith("list_")}
    assert set(zmierz()) == akcesory


def test_kazda_rodzina_ma_deklaracje_pol_wymaganych() -> None:
    """Nowa rodzina katalogu MUSI dostać wpis — także pusty, ale ŚWIADOMIE pusty.

    Brak wpisu dawałby `kompletnosc_pct = None`, czyli rodzinę nieocenianą w
    macierzy. Pusta krotka jest deklaracją „ta rodzina nie zasila obliczeń",
    a nie przeoczeniem.
    """
    brak_deklaracji = sorted(set(zmierz()) - set(WYMAGANE))
    assert not brak_deklaracji, (
        f"Rodziny bez deklaracji pól wymaganych (dopisz wpis w WYMAGANE, także "
        f"pustą krotką, jeśli rodzina nie zasila obliczeń): {brak_deklaracji}"
    )


def test_zaden_katalog_nie_ma_zduplikowanych_identyfikatorow() -> None:
    """Dwa rekordy o tym samym id = niedeterministyczne rozwiązanie referencji."""
    duplikaty = {
        rodzina: dane["id_zduplikowane"]
        for rodzina, dane in zmierz().items()
        if dane.get("id_zduplikowane")
    }
    assert not duplikaty, f"Zduplikowane identyfikatory pozycji katalogowych: {duplikaty}"

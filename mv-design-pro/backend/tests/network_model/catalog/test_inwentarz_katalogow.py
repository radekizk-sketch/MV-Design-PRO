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
    for zdolnosc, wymagane_pola in WYMAGANE[rodzina].items():
        nieznane = sorted(set(wymagane_pola) - pola)
        assert not nieznane, (
            f"Miernik pyta rodzinę '{rodzina}' (zdolność {zdolnosc}) o pola spoza "
            f"kontraktu: {nieznane}. Dostępne: {sorted(pola)}"
        )


def test_transformator_ma_rozdzielone_wymagania_rozplywu_i_modelu_strat() -> None:
    """LUKA METRYKI Z RECENZJI (P1, dodatkowe znalezisko) — zamknięta strukturalnie.

    Recenzent pokazał, że `WYMAGANE["transformer_types"]` pomijało ``p0_kw`` i
    ``i0_percent``, a testy niezmienników pomijają wartości nieobecne — więc
    rekord z dokumentem zewnętrznym, ale bez tych pól, mógł wyjść
    PRODUCTION_READY, choć solver strat nie miałby z czego liczyć
    (`_klasyfikacja(1, 100, {"DOKUMENT_ZEWNETRZNY": 1}) -> "PRODUCTION_READY"`).

    Przypisania są WYPROWADZONE Z KONSUMENTÓW, nie z nazw:
    ``p0_kw`` czyta `equipment_checks/transformer_losses.py` (brak albo zero →
    wynik NIEDOSTEPNY), ``i0_percent`` — `solver_input/builder.py` (gałąź
    magnesująca rozpływu), ``uk_percent``/``pk_kw`` — impedancja, czyli rozpływ
    ORAZ zwarcie.

    Transformator MOŻE być gotowy dla rozpływu i niegotowy dla modelu strat —
    macierz ma to pokazać, a nie uśrednić.
    """
    zdolnosci = WYMAGANE["transformer_types"]
    assert "p0_kw" in zdolnosci["LOSS_MODEL"], "model strat bez P0 nie ma z czego liczyć"
    assert "pk_kw" in zdolnosci["LOSS_MODEL"]
    assert "i0_percent" in zdolnosci["LOAD_FLOW"], "gałąź magnesująca rozpływu bez I0"
    assert "p0_kw" not in zdolnosci["SHORT_CIRCUIT"], (
        "P0 nie wchodzi do impedancji zwarciowej — wymaganie go tam byłoby "
        "blokadą bez przyczyny (recenzja zakazuje wymuszania pól w cudzych zdolnościach)"
    )
    assert "i0_percent" not in zdolnosci["SHORT_CIRCUIT"]


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
    macierzy. Pusty słownik jest deklaracją „ta rodzina nie zasila obliczeń",
    a nie przeoczeniem.
    """
    brak_deklaracji = sorted(set(zmierz()) - set(WYMAGANE))
    assert not brak_deklaracji, (
        f"Rodziny bez deklaracji pól wymaganych (dopisz wpis w WYMAGANE, także "
        f"pustym słownikiem, jeśli rodzina nie zasila obliczeń): {brak_deklaracji}"
    )


def test_klasyfikacja_nie_uzywa_juz_etykiety_production_ready() -> None:
    """KOMPLET PÓL ≠ ZWERYFIKOWANA DANA INŻYNIERSKA (§8 zlecenia remediacji).

    Etykieta „PRODUCTION_READY" zlepiała dwie różne rzeczy: kompletność pól
    oprogramowania i weryfikację danych wobec dokumentu. Recenzja wskazała to
    wprost. Klasy nazywają się teraz `FIELD_COMPLETE_*`, a kwalifikacji
    produkcyjnej NIE przyznaje sobie żaden pomiar wewnętrzny.
    """
    klasy = {str(dane.get("klasa")) for dane in zmierz().values()}
    assert (
        "PRODUCTION_READY" not in klasy
    ), "Miernik znów twierdzi, że sam ustala gotowość produkcyjną: " + str(sorted(klasy))
    assert all(
        k.startswith("FIELD_COMPLETE_") or k in {"DATA_INCOMPLETE", "MISSING"} for k in klasy
    ), sorted(klasy)


def test_zaden_katalog_nie_ma_zduplikowanych_identyfikatorow() -> None:
    """Dwa rekordy o tym samym id = niedeterministyczne rozwiązanie referencji."""
    duplikaty = {
        rodzina: dane["id_zduplikowane"]
        for rodzina, dane in zmierz().items()
        if dane.get("id_zduplikowane")
    }
    assert not duplikaty, f"Zduplikowane identyfikatory pozycji katalogowych: {duplikaty}"

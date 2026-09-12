"""Kampania mutacyjna — czy detektory laboratorium w ogóle coś wykrywają.

PO CO OSOBNY POZIOM. Zielony zestaw testów dowodzi, że kod robi to, czego testy
żądają; NIE dowodzi, że testy żądają czegokolwiek istotnego. Mutacja wprowadza
ZNANY defekt i sprawdza, czy którykolwiek mechanizm go zauważy.

CO TE TESTY PILNUJĄ. Nie tylko wyniku kampanii, ale też SAMEJ RAMY: mutacja bez
detektora nie ma prawa powstać, wyjątek w scenariuszu nie może liczyć się jako
zabicie, a przeżycie w klasie fizycznej/numerycznej musi być widoczne jako luka.
Rama, która wszystko zalicza, jest gorsza od jej braku.
"""

from __future__ import annotations

import pytest
from dynamic_lab.katalog_mutacji import KATALOG_MUTACJI
from dynamic_lab.mutacje import (
    KLASY_KRYTYCZNE,
    KlasaDefektu,
    Mutacja,
    WynikMutacji,
    uruchom_kampanie,
)


@pytest.fixture(scope="module")
def kampania():
    return uruchom_kampanie(KATALOG_MUTACJI)


def test_zadna_mutacja_krytyczna_nie_przezyla(kampania) -> None:
    """Przeżycie w klasie FIZYKA albo NUMERYKA jest LUKĄ KWALIFIKACJI."""
    assert kampania.przezyly_krytyczne == (), "Przeżyły mutacje krytyczne: " + ", ".join(
        f"{r.ident} ({r.oczekiwany_detektor})" for r in kampania.przezyly_krytyczne
    )


def test_zadna_mutacja_nie_wysypala_sie_przy_wykonaniu(kampania) -> None:
    """``BLAD_WYKONANIA`` znaczy zepsuty SCENARIUSZ, nie działający detektor.

    Ten stan jest osobny od przeżycia właśnie po to, żeby nie dało się go
    pomylić z zabiciem — i musi być pusty, bo inaczej wynik kampanii mierzy
    jakość moich scenariuszy, a nie laboratorium.
    """
    wysypane = [r for r in kampania.raporty if r.wynik is WynikMutacji.BLAD_WYKONANIA]
    assert not wysypane, [f"{r.ident}: {(r.szczegoly or '')[-200:]}" for r in wysypane]


def test_kampania_pokrywa_wszystkie_klasy_defektow(kampania) -> None:
    """Kampania badająca jedną klasę dawałaby złudzenie pokrycia."""
    obecne = {r.klasa for r in kampania.raporty}
    assert obecne == set(KlasaDefektu), f"Brak klas: {set(KlasaDefektu) - obecne}"


def test_kazda_mutacja_wskazuje_detektor() -> None:
    """Mutacja bez detektora jest zgadywaniem — nie ma prawa powstać."""
    for m in KATALOG_MUTACJI:
        assert m.oczekiwany_detektor, m.ident
    with pytest.raises(ValueError, match="detektora"):
        Mutacja(
            ident="X",
            opis="bez detektora",
            klasa=KlasaDefektu.FIZYKA,
            oczekiwany_detektor="",
            wykonaj=lambda: True,
        )


def test_wyjatek_w_mutacji_nie_liczy_sie_jako_zabicie() -> None:
    """DRUGA STRONA RAMY: rama nie może zaliczać tego, co się wywaliło.

    Bez tego przypadku scenariusz z literówką wyglądałby jak zabita mutacja i
    zawyżałby wynik kampanii — czyli rama kłamałaby dokładnie w tę stronę, w
    którą kłamać nie wolno.
    """

    def _wybuch() -> bool:
        raise RuntimeError("scenariusz zepsuty")

    wynik = uruchom_kampanie(
        (
            Mutacja(
                ident="M-TEST",
                opis="scenariusz wywala sie",
                klasa=KlasaDefektu.FIZYKA,
                oczekiwany_detektor="nieistotny",
                wykonaj=_wybuch,
            ),
        )
    )
    assert wynik.zabite == 0
    assert wynik.raporty[0].wynik is WynikMutacji.BLAD_WYKONANIA
    assert wynik.przezyly_krytyczne, "Wyjątek w klasie FIZYKA musi być widoczny jako luka"


def test_przezyla_mutacja_obniza_wynik_punktowy() -> None:
    """Rama musi UMIEĆ zgłosić przeżycie — inaczej 100% nic nie znaczy."""
    wynik = uruchom_kampanie(
        (
            Mutacja(
                ident="M-ZABITA",
                opis="detektor dziala",
                klasa=KlasaDefektu.KONTRAKT,
                oczekiwany_detektor="d",
                wykonaj=lambda: True,
            ),
            Mutacja(
                ident="M-PRZEZYLA",
                opis="detektora brak",
                klasa=KlasaDefektu.KONTRAKT,
                oczekiwany_detektor="d",
                wykonaj=lambda: False,
            ),
        )
    )
    assert wynik.zabite == 1
    assert wynik.wynik_punktowy == pytest.approx(0.5)
    # Klasa KONTRAKT nie jest krytyczna, więc przeżycie nie blokuje kwalifikacji,
    # ale MUSI być policzone.
    assert len(wynik.przezyly) == 1
    assert wynik.przezyly_krytyczne == ()
    assert wynik.bez_luk_krytycznych


def test_powtorzony_identyfikator_mutacji_jest_bledem() -> None:
    """Dwie mutacje o tej samej nazwie są nierozróżnialne w raporcie."""
    m = Mutacja(
        ident="M-DUP",
        opis="x",
        klasa=KlasaDefektu.KONTRAKT,
        oczekiwany_detektor="d",
        wykonaj=lambda: True,
    )
    with pytest.raises(ValueError, match="Powtórzone"):
        uruchom_kampanie((m, m))


def test_klasy_krytyczne_sa_wymienione_jawnie() -> None:
    """Dopełnienie wciągnęłoby każdą nową klasę na stronę „mniej ważne”."""
    assert KLASY_KRYTYCZNE == frozenset({KlasaDefektu.FIZYKA, KlasaDefektu.NUMERYKA})

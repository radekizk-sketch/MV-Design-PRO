"""Kampania mutacyjna — czy detektory laboratorium w ogóle coś wykrywają.

KOD BADAWCZY — patrz `backend/research/README.md`.

PO CO. Zielony zestaw testów dowodzi, że kod robi to, czego testy żądają. NIE
dowodzi, że testy żądają czegokolwiek istotnego. Mutacja wprowadza ZNANY defekt
i sprawdza, czy którykolwiek mechanizm go zauważy. Mutacja, która PRZEŻYŁA, jest
luką kwalifikacji — nie ciekawostką.

CZYM TU JEST MUTACJA. Nie losową zmianą bajtu, tylko defektem NAZWANYM i wziętym
z realnej klasy błędów symulacji: zgubiony znak, pomylona baza, przeskoczone
zdarzenie, stagnacja zgłoszona jako zbieżność, wynik bez tożsamości. Każda ma
przypisany DETEKTOR — konkretne miejsce, które ma ją złapać. Mutacja bez
wskazanego detektora jest zgadywaniem, a nie badaniem.

MUTACJE DZIAŁAJĄ NA KOPIACH DANYCH SCENARIUSZA, nigdy przez podmianę kodu
laboratorium w locie. Podmiana modułu zostawiłaby proces w stanie zależnym od
kolejności testów — czyli reintrodukowałaby klasę defektu, którą to laboratorium
już raz naprawiło (stan przeciekający między biegami).

TRZY WYNIKI, NIE DWA. ``BLAD_WYKONANIA`` jest osobny od ``PRZEZYLA``: mutacja,
która wysypała się przy budowie scenariusza, nie dowodzi, że detektor działa —
dowodzi, że scenariusz jest zepsuty. Zliczanie jej jako zabicia zawyżałoby wynik.
"""

from __future__ import annotations

import traceback
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum


class WynikMutacji(StrEnum):
    ZABITA = "ZABITA"
    PRZEZYLA = "PRZEZYLA"
    BLAD_WYKONANIA = "BLAD_WYKONANIA"


class KlasaDefektu(StrEnum):
    """Do czego mutacja się odnosi — rozstrzyga o wadze przeżycia."""

    FIZYKA = "FIZYKA"
    NUMERYKA = "NUMERYKA"
    KONTRAKT = "KONTRAKT"
    TOZSAMOSC = "TOZSAMOSC"


#: Klasy, w których przeżycie mutacji jest LUKĄ KWALIFIKACJI, a nie uwagą.
#: Zbiór wymieniony jawnie — dopełnienie wciągnęłoby każdą nową klasę na stronę
#: „mniej ważne", czyli w stronę niebezpieczną.
KLASY_KRYTYCZNE: frozenset[KlasaDefektu] = frozenset({KlasaDefektu.FIZYKA, KlasaDefektu.NUMERYKA})


@dataclass(frozen=True)
class Mutacja:
    """Jeden nazwany defekt wraz z detektorem, który ma go złapać."""

    ident: str
    opis: str
    klasa: KlasaDefektu
    oczekiwany_detektor: str
    wykonaj: Callable[[], bool]
    """Zwraca ``True``, gdy defekt ZOSTAŁ wykryty (mutacja zabita)."""

    def __post_init__(self) -> None:
        if not self.ident:
            raise ValueError("Mutacja bez identyfikatora nie ma tożsamości w raporcie.")
        if not self.oczekiwany_detektor:
            raise ValueError(
                f"Mutacja „{self.ident}” nie wskazuje detektora. Mutacja bez wskazanego "
                f"miejsca, które ma ją złapać, jest zgadywaniem, a nie badaniem."
            )


@dataclass(frozen=True)
class RaportMutacji:
    ident: str
    opis: str
    klasa: KlasaDefektu
    oczekiwany_detektor: str
    wynik: WynikMutacji
    szczegoly: str | None = None

    def to_dict(self) -> dict[str, str | None]:
        return {
            "ident": self.ident,
            "opis": self.opis,
            "klasa": str(self.klasa),
            "oczekiwany_detektor": self.oczekiwany_detektor,
            "wynik": str(self.wynik),
            "szczegoly": self.szczegoly,
        }


@dataclass(frozen=True)
class WynikKampanii:
    raporty: tuple[RaportMutacji, ...]

    @property
    def zabite(self) -> int:
        return sum(1 for r in self.raporty if r.wynik is WynikMutacji.ZABITA)

    @property
    def przezyly(self) -> tuple[RaportMutacji, ...]:
        return tuple(r for r in self.raporty if r.wynik is not WynikMutacji.ZABITA)

    @property
    def przezyly_krytyczne(self) -> tuple[RaportMutacji, ...]:
        """Przeżycia w klasach FIZYKA i NUMERYKA — luki kwalifikacji."""
        return tuple(r for r in self.przezyly if r.klasa in KLASY_KRYTYCZNE)

    @property
    def wynik_punktowy(self) -> float:
        return self.zabite / len(self.raporty) if self.raporty else 0.0

    @property
    def bez_luk_krytycznych(self) -> bool:
        return not self.przezyly_krytyczne

    def to_dict(self) -> dict[str, object]:
        return {
            "liczba_mutacji": len(self.raporty),
            "zabite": self.zabite,
            "przezyly": len(self.przezyly),
            "przezyly_krytyczne": [r.ident for r in self.przezyly_krytyczne],
            "wynik_punktowy": self.wynik_punktowy,
            "bez_luk_krytycznych": self.bez_luk_krytycznych,
            "raporty": [r.to_dict() for r in self.raporty],
        }


def uruchom_kampanie(mutacje: tuple[Mutacja, ...]) -> WynikKampanii:
    """Uruchom komplet mutacji. Wyjątek w mutacji NIE jest zabiciem."""
    identy = [m.ident for m in mutacje]
    powtorzone = sorted({i for i in identy if identy.count(i) > 1})
    if powtorzone:
        raise ValueError(f"Powtórzone identyfikatory mutacji: {powtorzone}")

    raporty: list[RaportMutacji] = []
    for mutacja in mutacje:
        try:
            wykryta = mutacja.wykonaj()
        except Exception:  # noqa: BLE001 - porażka scenariusza to OSOBNY stan
            raporty.append(
                RaportMutacji(
                    ident=mutacja.ident,
                    opis=mutacja.opis,
                    klasa=mutacja.klasa,
                    oczekiwany_detektor=mutacja.oczekiwany_detektor,
                    wynik=WynikMutacji.BLAD_WYKONANIA,
                    szczegoly=traceback.format_exc(limit=3),
                )
            )
            continue
        raporty.append(
            RaportMutacji(
                ident=mutacja.ident,
                opis=mutacja.opis,
                klasa=mutacja.klasa,
                oczekiwany_detektor=mutacja.oczekiwany_detektor,
                wynik=WynikMutacji.ZABITA if wykryta else WynikMutacji.PRZEZYLA,
            )
        )
    return WynikKampanii(raporty=tuple(raporty))

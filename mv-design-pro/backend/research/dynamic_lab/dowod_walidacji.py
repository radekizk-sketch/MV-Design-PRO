"""PROTOTYP modelu zaufania: status dowodowy WYPROWADZANY, nie nadawany.

KOD BADAWCZY — patrz `backend/research/README.md`. **PROTOTYP, NIE KANON.**
Ten moduł niczego nie zmienia w produkcji i nie jest propozycją kontraktu.

PROBLEM, KTÓRY BADA (pozycja decyzyjna D-09)
--------------------------------------------
Produkcyjny `solver_input.provenance.EvidenceTier` jest **wartością, którą kod
może sobie przypisać**. Dziś żadna zdolność dynamiczna nie ma najwyższego
stopnia, więc bezpiecznik D-00 trzyma — ale trzyma UMOWĄ, nie konstrukcją.
Wystarczy, że ktoś wpisze najwyższy stopień w rejestrze, i cały tor dowodowy
otwiera się bez żadnego dowodu. Jest to dokładnie ta sama konstrukcja, która
pozwoliła powstać defektowi P0-01: status nadany deklaracją, nie pomiarem.

HIPOTEZA SPRAWDZANA TUTAJ
-------------------------
Że da się zrobić inaczej: żeby „to jest zwalidowana symulacja" było
**funkcją danych**, a nie literałem. Wtedy:

- model bez zapisanego dowodu walidacji NIE MOŻE dostać stopnia dowodowego;
- model zwalidowany na wąskim zakresie **traci** stopień dowodowy poza tym
  zakresem, automatycznie i bez niczyjej decyzji;
- zmiana parametru modelu unieważnia dowód, bo odcisk przestaje się zgadzać;
- przeterminowanie wyroczni (nowa wersja narzędzia) też unieważnia dowód.

Klucz jest w ostatnim punkcie listy: dowód nie jest atrybutem MODELU, tylko
relacją między MODELEM, ZAKRESEM i PUNKTEM PRACY, w którym pytamy.

CZEGO TEN PROTOTYP NIE ROBI
---------------------------
Nie zastępuje `provenance.py`, nie nadaje niczego produkcji i świadomie NIE
używa produkcyjnych literałów stopni — nazwy są tu polskie i własne, żeby nie
dało się pomylić prototypu z kontraktem (pilnuje tego `research_isolation_guard`).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class StopienDowodowy(StrEnum):
    """Stopnie zaufania do wyniku — NAZWY WŁASNE prototypu, nie kontrakt produkcji."""

    ZWALIDOWANA_SYMULACJA = "ZWALIDOWANA_SYMULACJA"
    DEKLARACJA = "DEKLARACJA"
    MODEL_NIEZWALIDOWANY = "MODEL_NIEZWALIDOWANY"
    NIE_SYMULOWANO = "NIE_SYMULOWANO"


def _odcisk(payload: Any) -> str:
    tekst = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class TozsamoscModelu:
    """Kto liczył: klasa, wersja i ODCISK PARAMETRÓW.

    Odcisk parametrów jest tu istotą, nie ozdobą: bez niego „ten sam model"
    obejmuje też model po cichej zmianie stałej czasowej.
    """

    klasa: str
    wersja: str
    parametry: dict[str, float]

    @property
    def odcisk(self) -> str:
        return _odcisk({"klasa": self.klasa, "wersja": self.wersja, "parametry": self.parametry})


@dataclass(frozen=True)
class ZakresWalidacji:
    """Obszar, w którym dowód OBOWIĄZUJE — poza nim nie obowiązuje.

    Każdy wymiar jest przedziałem domkniętym. Wymiar nieustalony (``None``)
    znaczy „nie badano", a NIE „dowolny": pytanie o punkt pracy w takim wymiarze
    kończy się brakiem pokrycia. To jest różnica między dowodem a życzeniem.
    """

    napiecie_pu: tuple[float, float] | None = None
    moc_pu: tuple[float, float] | None = None
    scr: tuple[float, float] | None = None
    rodzaje_zdarzen: frozenset[str] = frozenset()

    def _poza(
        self, nazwa: str, wartosc: float | None, przedzial: tuple[float, float] | None
    ) -> str | None:
        if wartosc is None:
            return None
        if przedzial is None:
            return f"{nazwa}: model nie był walidowany w tym wymiarze"
        dol, gora = przedzial
        if not (dol <= wartosc <= gora):
            return f"{nazwa} = {wartosc:g} poza zakresem walidacji [{dol:g}, {gora:g}]"
        return None

    def braki_pokrycia(self, punkt: PunktPracy) -> tuple[str, ...]:
        """Wypisz powody, dla których dowód NIE obejmuje tego punktu pracy."""
        powody = [
            self._poza("napięcie", punkt.napiecie_pu, self.napiecie_pu),
            self._poza("moc", punkt.moc_pu, self.moc_pu),
            self._poza("SCR", punkt.scr, self.scr),
        ]
        if (
            punkt.rodzaj_zdarzenia is not None
            and punkt.rodzaj_zdarzenia not in self.rodzaje_zdarzen
        ):
            powody.append(f"zdarzenie „{punkt.rodzaj_zdarzenia}" + "” nie było objęte walidacją")
        return tuple(p for p in powody if p is not None)


@dataclass(frozen=True)
class PunktPracy:
    """Warunki, w których PYTAMY o przydatność dowodową."""

    napiecie_pu: float | None = None
    moc_pu: float | None = None
    scr: float | None = None
    rodzaj_zdarzenia: str | None = None


@dataclass(frozen=True)
class MetrykiAkceptacji:
    """Tolerancje ustalone PRZED biegiem — inaczej dowód dopasowuje się do wyniku."""

    maks_blad_wzgledny: float
    zmierzony_blad_wzgledny: float

    @property
    def spelnione(self) -> bool:
        return self.zmierzony_blad_wzgledny <= self.maks_blad_wzgledny


@dataclass(frozen=True)
class Wyrocznia:
    """Czym mierzono — z wersją, bo zmiana wersji unieważnia dowód."""

    nazwa: str
    wersja: str
    metoda: str


@dataclass(frozen=True)
class DowodWalidacji:
    """Zapis walidacji: kto, czym, w jakim zakresie i z jakim wynikiem."""

    model: TozsamoscModelu
    wyrocznia: Wyrocznia
    zakres: ZakresWalidacji
    metryki: tuple[MetrykiAkceptacji, ...]
    przypadki: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.przypadki:
            raise ValueError(
                "Dowód walidacji bez ANI JEDNEGO przypadku jest dowodem przez "
                "nieobecność dowodu — pułapka `all([]) == True`."
            )
        if not self.metryki:
            raise ValueError("Dowód walidacji bez metryk akceptacji nie jest dowodem.")

    @property
    def wszystkie_metryki_spelnione(self) -> bool:
        return all(m.spelnione for m in self.metryki)

    @property
    def odcisk(self) -> str:
        return _odcisk(
            {
                "model": self.model.odcisk,
                "wyrocznia": [self.wyrocznia.nazwa, self.wyrocznia.wersja, self.wyrocznia.metoda],
                "przypadki": sorted(self.przypadki),
                "metryki": [
                    [m.maks_blad_wzgledny, m.zmierzony_blad_wzgledny] for m in self.metryki
                ],
            }
        )


@dataclass(frozen=True)
class OrzeczenieDowodowe:
    """Wynik pytania „czy to jest dowód TUTAJ" — zawsze z uzasadnieniem."""

    stopien: StopienDowodowy
    powody: tuple[str, ...]
    odcisk_dowodu: str | None

    @property
    def przydatny_dowodowo(self) -> bool:
        return self.stopien is StopienDowodowy.ZWALIDOWANA_SYMULACJA


@dataclass
class RejestrDowodow:
    """Rejestr dowodów walidacji, indeksowany ODCISKIEM MODELU, nie jego nazwą.

    Indeksowanie odciskiem, a nie nazwą, jest tu decyzją projektową: model po
    zmianie parametru ma inny odcisk, więc automatycznie przestaje być objęty
    starym dowodem — bez niczyjej pamięci i bez migracji rejestru.
    """

    _dowody: dict[str, DowodWalidacji] = field(default_factory=dict)

    def zarejestruj(self, dowod: DowodWalidacji) -> None:
        self._dowody[dowod.model.odcisk] = dowod

    def orzeknij(self, model: TozsamoscModelu, punkt: PunktPracy) -> OrzeczenieDowodowe:
        """Odpowiedz, czy wynik tego modelu w tym punkcie jest przydatny dowodowo.

        Kolejność sprawdzeń jest istotna — od najbardziej podstawowego braku
        do najbardziej szczegółowego, żeby komunikat wskazywał PRZYCZYNĘ, a nie
        pierwszy napotkany objaw.
        """
        dowod = self._dowody.get(model.odcisk)
        if dowod is None:
            return OrzeczenieDowodowe(
                stopien=StopienDowodowy.MODEL_NIEZWALIDOWANY,
                powody=(
                    f"Brak zapisanego dowodu walidacji dla modelu {model.klasa} "
                    f"{model.wersja} (odcisk parametrów {model.odcisk[:12]}…).",
                ),
                odcisk_dowodu=None,
            )
        if not dowod.wszystkie_metryki_spelnione:
            niespelnione = [
                f"błąd {m.zmierzony_blad_wzgledny:.2e} > tolerancja {m.maks_blad_wzgledny:.2e}"
                for m in dowod.metryki
                if not m.spelnione
            ]
            return OrzeczenieDowodowe(
                stopien=StopienDowodowy.MODEL_NIEZWALIDOWANY,
                powody=(
                    "Walidacja wykonana, ale metryki akceptacji NIE są spełnione.",
                    *niespelnione,
                ),
                odcisk_dowodu=dowod.odcisk,
            )
        braki = dowod.zakres.braki_pokrycia(punkt)
        if braki:
            return OrzeczenieDowodowe(
                stopien=StopienDowodowy.MODEL_NIEZWALIDOWANY,
                powody=(
                    "Model jest zwalidowany, ale NIE w tym punkcie pracy.",
                    *braki,
                ),
                odcisk_dowodu=dowod.odcisk,
            )
        return OrzeczenieDowodowe(
            stopien=StopienDowodowy.ZWALIDOWANA_SYMULACJA,
            powody=(
                f"Walidacja wobec {dowod.wyrocznia.nazwa} {dowod.wyrocznia.wersja} "
                f"({dowod.wyrocznia.metoda}), {len(dowod.przypadki)} przypadków, "
                f"wszystkie metryki spełnione, punkt pracy w zakresie.",
            ),
            odcisk_dowodu=dowod.odcisk,
        )

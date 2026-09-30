"""Blokada srodowiska: czego aparat dowodowy WYMAGA i co faktycznie zastal (R10 par. 6).

ZASADA. Brak zaleznosci potrzebnej do dowodu jest PORAZKA walidacji, nie powodem
do odznaczenia testu. Pomiar, ktorego nie wykonano, nie moze byc raportowany jako
zielony — to byla dokladnie tresc defektu F-5.

Modul rozdziela dwie rzeczy, ktore latwo pomylic:

* `ZALEZNOSCI_DOWODU` — bez nich walidacja NIE MA SENSU (numpy, scipy). Ich brak
  zatrzymuje bieg calej suity juz w `tests/conftest.py`.
* `ZALEZNOSCI_WYROCZNI_ZEWNETRZNEJ` — ANDES. NIE jest zaleznoscia produkcyjna
  (osobne srodowisko, inny pin scipy), wiec jej brak nie moze wywalac zwyklego
  biegu. Ale nie moze tez znikac po cichu: testy wyroczni zewnetrznej sa oznaczone
  `@pytest.mark.andes`, a manifest dowodow (`manifest.py`) NAZYWA, ktore
  twierdzenia opieraja sie na tej wyroczni i gdzie ich dowod jest wykonywany.
"""

from __future__ import annotations

import importlib.metadata
import importlib.util
import platform
import sys
from dataclasses import dataclass

#: Bez tych bibliotek nie ma czym liczyc ani wyroczni, ani produktu.
ZALEZNOSCI_DOWODU: tuple[str, ...] = ("numpy", "scipy")

#: Wyrocznia zewnetrzna — poza zaleznosciami produkcyjnymi ze wzgledu na pin scipy.
ZALEZNOSCI_WYROCZNI_ZEWNETRZNEJ: tuple[str, ...] = ("andes",)


@dataclass(frozen=True)
class Srodowisko:
    """Zastane srodowisko biegu — idzie do meldunku, zeby pomiar mial adres."""

    python: str
    platforma: str
    wersje: tuple[tuple[str, str], ...]
    brakujace: tuple[str, ...]

    @property
    def kompletne(self) -> bool:
        return not self.brakujace


def _wersja(nazwa: str) -> str:
    try:
        return importlib.metadata.version(nazwa)
    except importlib.metadata.PackageNotFoundError:
        return "BRAK"


def zbadaj(nazwy: tuple[str, ...] = ZALEZNOSCI_DOWODU) -> Srodowisko:
    """Zmierz srodowisko — bez podnoszenia wyjatku; decyzje podejmuje wolajacy."""
    brakujace = tuple(sorted(n for n in nazwy if importlib.util.find_spec(n) is None))
    return Srodowisko(
        python=sys.version.split()[0],
        platforma=f"{platform.system()} {platform.machine()}",
        wersje=tuple((nazwa, _wersja(nazwa)) for nazwa in nazwy),
        brakujace=brakujace,
    )


def wyrocznia_zewnetrzna_dostepna() -> bool:
    """Czy ANDES jest w tym srodowisku (sprawdzenie, nie import — import jest ciezki)."""
    return all(
        importlib.util.find_spec(nazwa) is not None for nazwa in ZALEZNOSCI_WYROCZNI_ZEWNETRZNEJ
    )


__all__ = [
    "ZALEZNOSCI_DOWODU",
    "ZALEZNOSCI_WYROCZNI_ZEWNETRZNEJ",
    "Srodowisko",
    "wyrocznia_zewnetrzna_dostepna",
    "zbadaj",
]

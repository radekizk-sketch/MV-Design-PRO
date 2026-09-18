"""Granica importow pakietu `network_model/solvers/dynamika/**` — JEDNA implementacja.

PO CO. Rdzen dynamiki (karta W6-2, SS0 p.1) powstal OBOK zamrozonych rdzeni
solverow, nie w nich, i ma byc liscem grafu importow backendu: `numpy`,
`scipy.sparse`, `network_model.pochodne` i zamkniety zbior modulow jezykowych
biblioteki standardowej — nic wiecej. Kazdy import z `application/`, `enm/`,
`api/`, `domain/` albo `infrastructure/` wciagnalby warstwe, ktora sama moze
zaleze od solverow, i zamienil rdzen obliczeniowy w wezel cyklu; kazdy import z
POZOSTALYCH modulow `network_model/solvers/*` zatarlby granice B-01 („obok, nie
w srodku").

DLACZEGO OSOBNY MODUL, A NIE DWIE KOPIE SPRAWDZENIA. Ten sam predykat wola
`scripts/dynamika_granica_importow_guard.py` (samodzielna bramka, wpieta w CI)
oraz `scripts/solver_boundary_guard.py` (bramka granicy solverow, ktora karta
wymienia z nazwy). Gdyby kazda z nich miala wlasna kopie listy dozwolonych
modulow, obie „zgadzalyby sie dzis" i rozjechaly przy pierwszym nowym imporcie —
dokladnie wzorzec KLASA, NIE INSTANCJA, ktorego repozytorium zakazuje.

ALLOWLISTA JEST ZAMKNIETA. Nowy import spoza niej to naruszenie, nie powod do
dopisania wiersza „bo akurat potrzebny". Dopisanie wymaga decyzji: czy rdzen
naprawde ma zalezec od tej rzeczy. Zamkniecie listy jest PRZYPIETE testem
(`scripts/test_dynamika_granica_importow_guard.py`), zeby deklaracja z tego
docstringa miala pokrycie, a nie tylko brzmiala stanowczo.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[1]
KATALOG_PAKIETU = KORZEN / "backend" / "src" / "network_model" / "solvers" / "dynamika"
#: Prefiks modulu pakietu — uzywany do rozstrzygania importow wzglednych.
MODUL_PAKIETU = "network_model.solvers.dynamika"

#: Moduly jezykowe biblioteki standardowej dozwolone w rdzeniu. ZAMKNIETE.
#: Kazda pozycja jest czysto jezykowa albo czysto pomocnicza (bez wejscia/wyjscia
#: sieciowego, bez procesow, bez losowosci, bez czasu zegarowego poza pomiarem
#: trwania biegu) — rdzen ma byc deterministyczny i wolny od skutkow ubocznych.
STDLIB_DOZWOLONE: frozenset[str] = frozenset(
    {
        "__future__",  # skladnia adnotacji
        "cmath",  # funkcje zespolone (faza, exp)
        "dataclasses",  # zamrozone struktury danych
        "hashlib",  # odciski tozsamosci biegu
        "json",  # kanoniczna postac tresci do odcisku
        "math",  # funkcje rzeczywiste
        "pathlib",  # odczyt zrodel pakietu dla odcisku implementacji
        "time",  # pomiar czasu trwania biegu (`czas_obliczen_s`)
        "typing",  # protokoly i adnotacje
    }
)

#: Biblioteki obliczeniowe dozwolone w rdzeniu (SS0 p.1). ZAMKNIETE.
OBCE_DOZWOLONE: frozenset[str] = frozenset({"numpy", "scipy.sparse", "scipy.sparse.linalg"})

#: Jedyny dozwolony modul WLASNY repozytorium poza pakietem: warstwa wielkosci
#: pochodnych (lisc grafu importow, importuje wylacznie `math`).
WLASNE_DOZWOLONE: frozenset[str] = frozenset({"network_model.pochodne"})

#: Nazwy, ktore wolno sprowadzic skladnia `from scipy import X` (modul `scipy`
#: sam w sobie nie jest dozwolony — dozwolony jest jego podpakiet rzadkiej algebry).
NAZWY_ZE_SCIPY: frozenset[str] = frozenset({"sparse"})


@dataclass(frozen=True)
class Naruszenie:
    """Jedno naruszenie granicy importow, z adresem plik:linia."""

    plik: str
    linia: int
    modul: str
    powod: str

    def __str__(self) -> str:
        return f"{self.plik}:{self.linia}: import {self.modul!r} — {self.powod}"


def _dozwolony_absolutny(modul: str) -> str | None:
    """Zwroc powod odrzucenia albo `None`, gdy modul jest dozwolony."""
    korzen = modul.split(".")[0]
    if korzen in STDLIB_DOZWOLONE:
        return None
    if modul in OBCE_DOZWOLONE:
        return None
    if any(modul.startswith(f"{dozwolony}.") for dozwolony in OBCE_DOZWOLONE):
        return None
    if modul in WLASNE_DOZWOLONE or any(
        modul.startswith(f"{dozwolony}.") for dozwolony in WLASNE_DOZWOLONE
    ):
        return None
    if modul == MODUL_PAKIETU or modul.startswith(f"{MODUL_PAKIETU}."):
        return None
    if modul.startswith("network_model.solvers"):
        return (
            "rdzen dynamiki stoi OBOK zamrozonych rdzeni solverow (B-01) i nie wolno mu "
            "ich importowac"
        )
    if korzen in {"application", "enm", "api", "domain", "infrastructure", "solver_input"}:
        return f"warstwa {korzen!r} jest nad rdzeniem obliczeniowym — import odwracalby zaleznosc"
    return "modul spoza ZAMKNIETEJ allowlisty rdzenia dynamiki"


def _modul_wzgledny(plik: Path, poziom: int, modul: str | None) -> str:
    """Rozwiaz import wzgledny do pelnej nazwy modulu."""
    czesci = plik.relative_to(KATALOG_PAKIETU).with_suffix("").parts
    if czesci and czesci[-1] == "__init__":
        czesci = czesci[:-1]
    pakiet = [MODUL_PAKIETU, *czesci]
    if poziom > len(pakiet):
        return "..(poza korzeniem)"
    baza = pakiet[: len(pakiet) - poziom + 1]
    return ".".join([*baza, modul] if modul else baza)


def znajdz_naruszenia() -> list[Naruszenie]:
    """Naruszenia granicy importow w calym pakiecie (pusty wynik = zielono)."""
    naruszenia: list[Naruszenie] = []
    for plik in sorted(KATALOG_PAKIETU.rglob("*.py")):
        if "__pycache__" in plik.parts:
            continue
        wzgledna = plik.relative_to(KORZEN).as_posix()
        drzewo = ast.parse(plik.read_text(encoding="utf-8"), filename=str(plik))
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.Import):
                for alias in wezel.names:
                    powod = _dozwolony_absolutny(alias.name)
                    if powod:
                        naruszenia.append(Naruszenie(wzgledna, wezel.lineno, alias.name, powod))
            elif isinstance(wezel, ast.ImportFrom):
                if wezel.level:
                    modul = _modul_wzgledny(plik, wezel.level, wezel.module)
                    if not (modul == MODUL_PAKIETU or modul.startswith(f"{MODUL_PAKIETU}.")):
                        naruszenia.append(
                            Naruszenie(
                                wzgledna,
                                wezel.lineno,
                                modul,
                                "import wzgledny wychodzi poza pakiet dynamiki",
                            )
                        )
                    continue
                modul = wezel.module or ""
                if modul == "scipy":
                    for alias in wezel.names:
                        if alias.name not in NAZWY_ZE_SCIPY:
                            naruszenia.append(
                                Naruszenie(
                                    wzgledna,
                                    wezel.lineno,
                                    f"scipy.{alias.name}",
                                    "z pakietu `scipy` wolno sprowadzic wylacznie `sparse`",
                                )
                            )
                    continue
                powod = _dozwolony_absolutny(modul)
                if powod:
                    naruszenia.append(Naruszenie(wzgledna, wezel.lineno, modul, powod))
    return naruszenia


def raport() -> tuple[int, list[Naruszenie]]:
    """(liczba przeskanowanych plikow, naruszenia)."""
    pliki = [plik for plik in KATALOG_PAKIETU.rglob("*.py") if "__pycache__" not in plik.parts]
    return len(pliki), znajdz_naruszenia()


__all__ = [
    "KATALOG_PAKIETU",
    "MODUL_PAKIETU",
    "OBCE_DOZWOLONE",
    "STDLIB_DOZWOLONE",
    "WLASNE_DOZWOLONE",
    "Naruszenie",
    "raport",
    "znajdz_naruszenia",
]

"""Rozwiązywanie importów w drzewie składni — JEDNO źródło prawdy dla bramek CI.

PO CO (karta GRANICE-IMPORTOW-WZGLEDNE, 2026-09-30). Bramki pilnujące granic importów
czytały `ast.ImportFrom.module` wprost albo liczyły import względny własną arytmetyką.
Zmierzone na kopiach w katalogu tymczasowym: granica rdzenia dynamiki rozwiązywała poziom
o jeden za głęboko (`from ..power_flow_newton import …` w `dynamika/a.py` przechodziło —
import zamrożonego rdzenia B-01), bramka klucza magazynu ENM pomijała importy względne
w całości, a bramki kopii scenariusza, parametrów zwarcia i ścieżek zastanych czytały samo
`module`, więc `from .canonical_analysis import _execute_power_flow` było dla nich innym
modułem niż `from enm.canonical_analysis import _execute_power_flow`. Każda kolejna kopia
tej arytmetyki to następne miejsce, w którym granica ma dziurę na imporcie względnym.

SEMANTYKA. Dokładnie ta, którą stosuje interpreter: `importlib.util.resolve_name`
(poziom 1 = pakiet zawierający moduł, każdy kolejny poziom = pakiet nadrzędny). Pakietem
pliku `a/b/c.py` jest `a.b`, pakietem `a/b/__init__.py` też jest `a.b` (moduł `__init__`
JEST pakietem). Moduł najwyższego poziomu (`x.py` wprost w korzeniu) ma pakiet pusty —
każdy jego import względny jest błędem interpretera.

WYJŚCIE PONAD KORZEŃ JEST JAWNE. Gdy interpreter zgłosiłby `ImportError` („attempted
relative import beyond top-level package” albo brak pakietu), funkcje tego modułu rzucają
`ImportPonadKorzen`. Bramka, która go nie obsłuży, kończy się wyjątkiem (czerwień), a nie
cichym przepuszczeniem — fail-closed z konstrukcji. Bramki obsługują go jawnie jako
naruszenie z adresem plik:linia.

DWA ZBIORY CELÓW, BO BRAMKI PYTAJĄ O DWIE RÓŻNE RZECZY:

* `cele_importu` — moduły, KTÓRE instrukcja sprowadza: `from M import a` → `(M,)`,
  `from . import a, b` → `(P.a, P.b)` (nazwa sprowadzana z pakietu bez `module` jest
  podmodułem albo atrybutem `__init__`; jako cel przyjmujemy podmoduł — tak czyta to
  każda bramka listy dozwolonych). Dla list DOZWOLONYCH (allowlista liścia).
* `moduly_dotkniete` — każdy moduł, który instrukcja MOŻE załadować: dla `Import` nazwy
  modułów, dla `ImportFrom` moduł bazowy ORAZ `baza.nazwa` dla każdej nazwy (nazwa
  sprowadzona z pakietu może być podmodułem: `from network_model import solvers`). Dla list
  ZAKAZANYCH — nadzbiór jest tu właściwy, bo przeoczenie jest groźniejsze niż nazwa
  atrybutu, która przypadkiem nie jest modułem.

Test iloczynu cech {moduł zwykły, `__init__.py`, moduł podpakietu, `__init__.py` podpakietu}
× {poziom 1, 2, 3, ponad korzeń} × {`module` nazwany, `module=None` z aliasami}, z wartościami
oczekiwanymi wypisanymi z definicji semantyki interpretera: `scripts/test_importy_ast.py`.
"""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path


class ImportPonadKorzen(ValueError):
    """Import względny wychodzi ponad korzeń drzewa importów (interpreter: `ImportError`)."""


def nazwa_modulu(plik: Path, korzen: Path) -> str:
    """Pełna nazwa modułu pliku leżącego pod `korzen` (`a/b/__init__.py` → `a.b`).

    Plik spoza `korzen` → `ValueError` (jak `Path.relative_to`)."""
    czesci = list(plik.relative_to(korzen).with_suffix("").parts)
    if czesci and czesci[-1] == "__init__":
        czesci = czesci[:-1]
    return ".".join(czesci)


def pakiet_pliku(plik: Path, korzen: Path) -> str:
    """`__package__` pliku leżącego pod `korzen`: `a/b/c.py` → `a.b`, `a/b/__init__.py` →
    `a.b`, `x.py` w korzeniu → `""`.

    Plik spoza `korzen` → `ValueError` (jak `Path.relative_to`)."""
    czesci = plik.relative_to(korzen).with_suffix("").parts
    return ".".join(czesci[:-1])


def rozwiaz(poziom: int, modul: str | None, pakiet: str) -> str:
    """Pełna nazwa modułu dla `from <'.' * poziom><modul> import …` w pakiecie `pakiet`
    (poziom 0 = import bezwzględny, zwracany bez zmian)."""
    if poziom == 0:
        return modul or ""
    nazwa = "." * poziom + (modul or "")
    try:
        return importlib.util.resolve_name(nazwa, pakiet)
    except (ImportError, ValueError) as blad:
        raise ImportPonadKorzen(
            f"import względny {nazwa!r} w pakiecie {pakiet or '(moduł najwyższego poziomu)'!r} "
            f"wychodzi ponad korzeń drzewa importów ({blad})"
        ) from blad


def modul_bazowy(pakiet: str, wezel: ast.ImportFrom) -> str:
    """Moduł, Z KTÓREGO instrukcja `from … import …` sprowadza nazwy (dla `from . import x`
    — sam pakiet). Rzuca `ImportPonadKorzen`."""
    return rozwiaz(wezel.level, wezel.module, pakiet)


def cele_importu(pakiet: str, wezel: ast.ImportFrom) -> tuple[str, ...]:
    """Moduły sprowadzane przez `from … import …` (patrz nagłówek). Rzuca `ImportPonadKorzen`."""
    baza = modul_bazowy(pakiet, wezel)
    if wezel.module is not None:
        return (baza,)
    return tuple(baza if alias.name == "*" else f"{baza}.{alias.name}" for alias in wezel.names)


def moduly_dotkniete(pakiet: str, wezel: ast.Import | ast.ImportFrom) -> tuple[str, ...]:
    """Każdy moduł, który instrukcja może załadować (patrz nagłówek). Rzuca `ImportPonadKorzen`."""
    if isinstance(wezel, ast.Import):
        return tuple(alias.name for alias in wezel.names)
    baza = modul_bazowy(pakiet, wezel)
    return (baza, *(f"{baza}.{alias.name}" for alias in wezel.names if alias.name != "*"))


def pod_prefiksem(modul: str, prefiksy: tuple[str, ...] | frozenset[str] | set[str]) -> bool:
    """Czy `modul` jest jednym z `prefiksy` albo leży pod którymś (granica po kropce)."""
    return any(modul == prefiks or modul.startswith(f"{prefiks}.") for prefiks in prefiksy)


__all__ = [
    "ImportPonadKorzen",
    "cele_importu",
    "modul_bazowy",
    "moduly_dotkniete",
    "nazwa_modulu",
    "pakiet_pliku",
    "pod_prefiksem",
    "rozwiaz",
]

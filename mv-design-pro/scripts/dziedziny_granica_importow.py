"""Granica importów pakietu-liścia `backend/src/dziedziny/**` — JEDNA implementacja.

PO CO (karta AB-H0 §0.1, decyzja O-45). Kontrakty dziedziny częstotliwości (sekcje modelu
urządzenia, modele źródeł widmowych, parametry pomiaru, pasma, wymagania jakości energii,
mapa dziedzin analizy, karta widmowa) są czytane przez katalog (`network_model/catalog`),
ENM (`enm/models.py`) i warstwy wyżej. Żeby katalog i ENM mogły je importować bez cyklu,
pakiet musi być LIŚCIEM grafu importów: stdlib, `pydantic`, `werdykt.kontrakt`,
`werdykt.proweniencja` i moduły własne — nic więcej.

DLACZEGO WŁASNY STRAŻNIK. `arch_guard.py` widzi wyłącznie ścieżki z członem
`solvers`/`analysis`, a `import_graph_guard.py` pilnuje wejść frontendu i indeksów
dokumentów — żaden z nich nie zobaczyłby importu `network_model` w nowym liściu.

DLACZEGO OSOBNY MODUŁ PREDYKATU. Ten sam predykat woła bramka CI
(`scripts/dziedziny_granica_importow_guard.py`) i jej self-test
(`scripts/test_dziedziny_granica_importow_guard.py`) — jedna lista dozwolonych modułów.

ALLOWLISTA JEST ZAMKNIĘTA. Szczególnie: `network_model.pochodne` jest ZAKAZANE — import
podmodułu wykonuje `network_model/__init__.py`, który gorliwie ładuje `core` z `networkx`
i domyka cykl z katalogiem. `solver_input` jest zakazane (pakiet zależy od `enm` i katalogu);
oś jakości danej pochodzi z `werdykt.proweniencja`. Zamknięcie list jest PRZYPIĘTE testem.

`znajdz_naruszenia(katalog)` przyjmuje katalog skanu (self-test skanuje KOPIĘ drzewa
w katalogu tymczasowym — nigdy nie wstrzykuje plików do żywego pakietu, bo w tym samym
drzewie pracują równolegle inni wykonawcy).
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[1]
KATALOG_PAKIETU = KORZEN / "backend" / "src" / "dziedziny"
#: Nazwa pakietu — do rozstrzygania importów względnych i własnych.
MODUL_PAKIETU = "dziedziny"

#: Moduły biblioteki standardowej dozwolone w liściu. ZAMKNIĘTE: czysto językowe, bez
#: wejścia/wyjścia, procesów, losowości i zegara.
STDLIB_DOZWOLONE: frozenset[str] = frozenset(
    {
        "__future__",
        "collections",
        "dataclasses",
        "datetime",
        "decimal",
        "enum",
        "hashlib",
        "json",
        "math",
        "re",
        "types",
        "typing",
    }
)

#: Biblioteki zewnętrzne dozwolone w liściu. ZAMKNIĘTE.
OBCE_DOZWOLONE: frozenset[str] = frozenset({"pydantic"})

#: Moduły WŁASNE repozytorium spoza pakietu dozwolone w liściu. ZAMKNIĘTE: kontrakt
#: werdyktu (typy podstawy, wielkości, dziedziny fizyki) i osie proweniencji.
WLASNE_DOZWOLONE: frozenset[str] = frozenset({"werdykt.kontrakt", "werdykt.proweniencja"})

#: Korzenie warstw, których import odwracałby zależność (nazwane w komunikacie).
WARSTWY_ZAKAZANE: frozenset[str] = frozenset(
    {
        "network_model",
        "enm",
        "catalog",
        "application",
        "api",
        "analysis",
        "solvers",
        "solver_input",
        "infrastructure",
        "domain",
    }
)


@dataclass(frozen=True)
class Naruszenie:
    """Jedno naruszenie granicy importów, z adresem plik:linia."""

    plik: str
    linia: int
    modul: str
    powod: str

    def __str__(self) -> str:
        return f"{self.plik}:{self.linia}: import {self.modul!r} — {self.powod}"


def _powod_odrzucenia(modul: str) -> str | None:
    """Powód odrzucenia importu bezwzględnego albo `None`, gdy dozwolony."""
    korzen = modul.split(".")[0]
    if korzen in STDLIB_DOZWOLONE:
        return None
    if modul in OBCE_DOZWOLONE or any(modul.startswith(f"{o}.") for o in OBCE_DOZWOLONE):
        return None
    if modul in WLASNE_DOZWOLONE:
        return None
    if modul == MODUL_PAKIETU or modul.startswith(f"{MODUL_PAKIETU}."):
        return None
    if korzen == "werdykt":
        return (
            "z pakietu `werdykt` liść importuje wyłącznie `werdykt.kontrakt` i "
            "`werdykt.proweniencja`"
        )
    if modul.startswith("network_model.pochodne"):
        return (
            "`network_model.pochodne` jest zakazane — import podmodułu wykonuje gorliwy "
            "`network_model/__init__.py` (cykl z katalogiem); liść nie liczy fizyki"
        )
    if korzen in WARSTWY_ZAKAZANE:
        return f"warstwa {korzen!r} jest nad liściem kontraktów — import odwracałby zależność"
    return "moduł spoza ZAMKNIĘTEJ allowlisty liścia `dziedziny`"


def _modul_wzgledny(katalog: Path, plik: Path, poziom: int, modul: str | None) -> str:
    """Rozwiąż import względny wg semantyki Pythona: poziom 1 = pakiet zawierający moduł,
    każdy kolejny poziom = pakiet nadrzędny. Wyjście ponad korzeń drzewa importów daje
    nazwę modułu najwyższego poziomu (np. ``from ..enm import x`` w ``dziedziny/a.py``
    → ``enm``)."""
    # Dla `pakiet/__init__.py` ostatni człon to `__init__`, dla `pakiet/modul.py` — nazwa
    # modułu; w obu przypadkach pakietem zawierającym jest ścieżka bez ostatniego członu.
    czesci = list(plik.relative_to(katalog).with_suffix("").parts)
    pakiet = [MODUL_PAKIETU, *czesci[:-1]]
    baza = pakiet[: max(len(pakiet) - (poziom - 1), 0)]
    return ".".join([*baza, modul] if modul else baza) or "(poza korzeniem)"


def pliki_pakietu(katalog: Path = KATALOG_PAKIETU) -> list[Path]:
    """Pliki `.py` pakietu (posortowane, bez `__pycache__`)."""
    return sorted(p for p in katalog.rglob("*.py") if "__pycache__" not in p.parts)


def znajdz_naruszenia(katalog: Path = KATALOG_PAKIETU) -> list[Naruszenie]:
    """Naruszenia granicy importów w całym pakiecie (pusty wynik = zielono)."""
    naruszenia: list[Naruszenie] = []
    for plik in pliki_pakietu(katalog):
        try:
            wzgledna = plik.relative_to(KORZEN).as_posix()
        except ValueError:
            wzgledna = plik.relative_to(katalog.parent).as_posix()
        drzewo = ast.parse(plik.read_text(encoding="utf-8"), filename=str(plik))
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.Import):
                for alias in wezel.names:
                    powod = _powod_odrzucenia(alias.name)
                    if powod:
                        naruszenia.append(Naruszenie(wzgledna, wezel.lineno, alias.name, powod))
            elif isinstance(wezel, ast.ImportFrom):
                if wezel.level:
                    modul = _modul_wzgledny(katalog, plik, wezel.level, wezel.module)
                    if not (modul == MODUL_PAKIETU or modul.startswith(f"{MODUL_PAKIETU}.")):
                        naruszenia.append(
                            Naruszenie(
                                wzgledna,
                                wezel.lineno,
                                modul,
                                "import względny wychodzi poza pakiet `dziedziny`",
                            )
                        )
                    continue
                modul = wezel.module or ""
                if modul == "werdykt":
                    naruszenia.append(
                        Naruszenie(
                            wzgledna,
                            wezel.lineno,
                            "werdykt",
                            "import z korzenia `werdykt` ładuje generator tekstu i decyzję — "
                            "importuj z `werdykt.kontrakt` albo `werdykt.proweniencja`",
                        )
                    )
                    continue
                powod = _powod_odrzucenia(modul)
                if powod:
                    naruszenia.append(Naruszenie(wzgledna, wezel.lineno, modul, powod))
    return naruszenia


def raport(katalog: Path = KATALOG_PAKIETU) -> tuple[int, list[Naruszenie]]:
    """(liczba przeskanowanych plików, naruszenia)."""
    return len(pliki_pakietu(katalog)), znajdz_naruszenia(katalog)


__all__ = [
    "KATALOG_PAKIETU",
    "MODUL_PAKIETU",
    "OBCE_DOZWOLONE",
    "STDLIB_DOZWOLONE",
    "WARSTWY_ZAKAZANE",
    "WLASNE_DOZWOLONE",
    "Naruszenie",
    "pliki_pakietu",
    "raport",
    "znajdz_naruszenia",
]

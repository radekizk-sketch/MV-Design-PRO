#!/usr/bin/env python3
"""Strażnik klasy „połknięty wyjątek" w `backend/src` (karta #151).

PO CO. Połknięty albo przebrany wyjątek daje projektantowi fałszywy wynik albo
fałszywy komunikat: błąd programu wraca jako „archiwum niezgodne ze schematem",
„scenariusz nieoceniony", 4xx „błąd danych" albo — najgorzej — jako cicha zmiana
metody w solverze. Karta archiwum (#134) usunęła tę klasę w modułach archiwum;
karta #151 zamknęła resztę `backend/src` i ten strażnik pilnuje, żeby nie wróciła.

CO JEST NARUSZENIEM (AST, nie grep — napis, komentarz i docstring nie liczą się):

* handler `except` łapiący `Exception` albo `BaseException` (nazwa gołą albo
  atrybutem, np. `builtins.Exception`), gołe `except:` oraz krotka zawierająca
  którykolwiek z nich (`except (ValueError, Exception)`) — CHYBA że OSTATNIA
  instrukcja treści handlera jest ponownym rzuceniem TEGO SAMEGO obiektu
  (`raise` albo `raise <nazwa z `as`>`). To jest rodzaj C karty: sprzątanie i
  ponowne rzucenie nie połyka. `raise Inny(...) from exc` NIE jest ponownym
  rzuceniem — to tłumaczenie obcego wyjątku na nazwany (rodzaj B), które musi
  łapać konkretne typy, bo inaczej błąd programu staje się błędem użytkownika.
  Warunkowy `raise` tylko w jednej gałęzi `if` też jest naruszeniem: druga gałąź
  połyka.
* wywołanie `suppress(...)` (także `contextlib.suppress`) z `Exception` albo
  `BaseException` wśród argumentów — to handler połykający w innym zapisie.
* handler `ImportError`/`ModuleNotFoundError` (sam albo w krotce) wokół importu
  modułu, który NIE MOŻE być nieobecny: pakietu własnego `backend/src` albo
  biblioteki standardowej (`sys.stdlib_module_names`) — chyba że handler kończy się
  ponownym rzuceniem. Taki handler jest martwy dla danych i żywy wyłącznie dla
  defektu wydania (cykl importów, literówka, skasowany moduł), który po cichu
  zamienia w „brak parametrów"/„funkcja niedostępna". Import zależności opcjonalnej
  (reportlab, python-docx, boto3, google-cloud-storage) z nazwaną reakcją 501 jest
  dozwolony.

ALLOWLISTA PUSTA. Budżet 0. Jedyne miejsce spoza budżetu to `WYJATKI_B01`:
handler w rdzeniu zamrożonym (lista właściciela `scripts/rdzenie_b01.py`), którego
agent nie ma prawa edytować bez decyzji B-01. Wpis ma odesłanie do decyzji; samotest
przypina, że każdy wpis wskazuje plik z listy B-01, i strażnik czerwienieje, gdy
wpis przestaje być potrzebny (zapadka w dół — po decyzji właściciela wpis znika).
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Typy, których złapanie jest „szerokie" (łapie błędy programu).
SZEROKIE_TYPY = frozenset({"Exception", "BaseException"})

#: Typy błędu importu.
TYPY_BLEDU_IMPORTU = frozenset({"ImportError", "ModuleNotFoundError"})


def pakiety_wlasne(korzen: Path = BACKEND_SRC) -> frozenset[str]:
    """Nazwy najwyższego poziomu importowalne z `backend/src` (katalogi i moduły)."""
    nazwy = {p.name for p in korzen.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))}
    nazwy |= {p.stem for p in korzen.glob("*.py")}
    return frozenset(nazwy)


#: Handler szeroki w rdzeniu B-01 czekający na decyzję właściciela:
#: (ścieżka względem `backend/src`, funkcja) → liczba handlerów i odesłanie.
WYJATKI_B01: dict[tuple[str, str], tuple[int, str]] = {
    ("network_model/solvers/state_estimation_wls.py", "_chi_square_threshold"): (
        1,
        "Decyzja właściciela B-01 (karta #151): przy DOWOLNYM wyjątku z "
        "`scipy.stats.chi2.ppf` solver po cichu przechodzi na aproksymację "
        "Wilsona-Hilferty'ego. Propozycja: jawny import `chi2`, kasacja ścieżki "
        "awaryjnej i `_normal_ppf`.",
    ),
}


def _jest_szeroki(typ: ast.expr | None) -> bool:
    if typ is None:
        return True
    if isinstance(typ, ast.Name):
        return typ.id in SZEROKIE_TYPY
    if isinstance(typ, ast.Attribute):
        return typ.attr in SZEROKIE_TYPY
    if isinstance(typ, ast.Tuple):
        return any(_jest_szeroki(element) for element in typ.elts)
    return False


def _lapie_blad_importu(typ: ast.expr | None) -> bool:
    if isinstance(typ, ast.Name):
        return typ.id in TYPY_BLEDU_IMPORTU
    if isinstance(typ, ast.Attribute):
        return typ.attr in TYPY_BLEDU_IMPORTU
    if isinstance(typ, ast.Tuple):
        return any(_lapie_blad_importu(element) for element in typ.elts)
    return False


def _importy_obowiazkowe(tresc: list[ast.stmt], wlasne: frozenset[str]) -> list[str]:
    """Moduły z `tresc` (bez zagłębiania w funkcje), które nie mogą być nieobecne."""
    znalezione: list[str] = []
    for instrukcja in tresc:
        for wezel in ast.walk(instrukcja):
            nazwy: list[str] = []
            if isinstance(wezel, ast.Import):
                nazwy = [alias.name for alias in wezel.names]
            elif isinstance(wezel, ast.ImportFrom) and wezel.level == 0 and wezel.module:
                nazwy = [wezel.module]
            elif isinstance(wezel, ast.ImportFrom) and wezel.level > 0:
                nazwy = ["." * wezel.level + (wezel.module or "")]
            for nazwa in nazwy:
                glowa = nazwa.split(".")[0]
                if nazwa.startswith(".") or glowa in wlasne or glowa in sys.stdlib_module_names:
                    znalezione.append(nazwa)
    return znalezione


def _konczy_sie_ponownym_rzuceniem(handler: ast.ExceptHandler) -> bool:
    ostatnia = handler.body[-1]
    if not isinstance(ostatnia, ast.Raise) or ostatnia.cause is not None:
        return False
    if ostatnia.exc is None:
        return True
    return (
        handler.name is not None
        and isinstance(ostatnia.exc, ast.Name)
        and ostatnia.exc.id == handler.name
    )


def _nazwa_wywolania(wywolanie: ast.Call) -> str | None:
    if isinstance(wywolanie.func, ast.Name):
        return wywolanie.func.id
    if isinstance(wywolanie.func, ast.Attribute):
        return wywolanie.func.attr
    return None


class _Skaner(ast.NodeVisitor):
    def __init__(self, wlasne: frozenset[str]) -> None:
        self.wlasne = wlasne
        self.funkcje: list[str] = []
        self.naruszenia: list[tuple[int, str, str]] = []

    def _funkcja(self) -> str:
        return self.funkcje[-1] if self.funkcje else "<moduł>"

    def visit_FunctionDef(self, wezel: ast.FunctionDef) -> None:  # noqa: N802
        self.funkcje.append(wezel.name)
        self.generic_visit(wezel)
        self.funkcje.pop()

    def visit_AsyncFunctionDef(self, wezel: ast.AsyncFunctionDef) -> None:  # noqa: N802
        self.funkcje.append(wezel.name)
        self.generic_visit(wezel)
        self.funkcje.pop()

    def visit_Try(self, wezel: ast.Try) -> None:  # noqa: N802
        for handler in wezel.handlers:
            if not _lapie_blad_importu(handler.type) or _konczy_sie_ponownym_rzuceniem(handler):
                continue
            obowiazkowe = _importy_obowiazkowe(wezel.body, self.wlasne)
            if obowiazkowe:
                self.naruszenia.append(
                    (
                        handler.lineno,
                        self._funkcja(),
                        f"except {ast.unparse(handler.type)} wokół importu modułu, który "
                        f"nie może być nieobecny: {', '.join(obowiazkowe)}",
                    )
                )
        self.generic_visit(wezel)

    def visit_ExceptHandler(self, wezel: ast.ExceptHandler) -> None:  # noqa: N802
        if _jest_szeroki(wezel.type) and not _konczy_sie_ponownym_rzuceniem(wezel):
            opis = "gołe except" if wezel.type is None else ast.unparse(wezel.type)
            self.naruszenia.append((wezel.lineno, self._funkcja(), f"except {opis}"))
        self.generic_visit(wezel)

    def visit_Call(self, wezel: ast.Call) -> None:  # noqa: N802
        if _nazwa_wywolania(wezel) == "suppress" and any(
            _jest_szeroki(argument) for argument in wezel.args
        ):
            self.naruszenia.append((wezel.lineno, self._funkcja(), ast.unparse(wezel)))
        self.generic_visit(wezel)


def naruszenia_w_kodzie(
    kod: str, wlasne: frozenset[str] = frozenset({"enm", "network_model", "api"})
) -> list[tuple[int, str, str]]:
    """Naruszenia w jednym module: (linia, funkcja, opis). `wlasne` — pakiety własne."""
    skaner = _Skaner(wlasne)
    skaner.visit(ast.parse(kod))
    return sorted(skaner.naruszenia)


def zmierz(korzen: Path = BACKEND_SRC) -> list[tuple[str, int, str, str]]:
    """Wszystkie naruszenia pod `korzen`: (ścieżka względna, linia, funkcja, opis)."""
    wynik: list[tuple[str, int, str, str]] = []
    wlasne = pakiety_wlasne(korzen) if korzen.is_dir() else frozenset()
    for plik in sorted(korzen.rglob("*.py")):
        wzgledna = plik.relative_to(korzen).as_posix()
        tresc = plik.read_text(encoding="utf-8")
        for linia, funkcja, opis in naruszenia_w_kodzie(tresc, wlasne):
            wynik.append((wzgledna, linia, funkcja, opis))
    return wynik


def ocen(naruszenia: list[tuple[str, int, str, str]]) -> list[str]:
    """Komunikaty błędów strażnika (pusta lista = zielony)."""
    bledy: list[str] = []
    licznik = Counter((sciezka, funkcja) for sciezka, _, funkcja, _ in naruszenia)
    for sciezka, linia, funkcja, opis in naruszenia:
        if (sciezka, funkcja) in WYJATKI_B01:
            continue
        bledy.append(
            f"backend/src/{sciezka}:{linia} ({funkcja}): {opis} — handler połyka albo "
            "przebiera wyjątek. Złap nazwany typ, który ta ścieżka naprawdę rzuca, z "
            "nazwaną reakcją i testem, albo zakończ handler ponownym `raise`."
        )
    for klucz, (oczekiwane, _) in sorted(WYJATKI_B01.items()):
        faktyczne = licznik.get(klucz, 0)
        if faktyczne > oczekiwane:
            bledy.append(
                f"backend/src/{klucz[0]} ({klucz[1]}): {faktyczne} handlerów szerokich, "
                f"wpis B-01 obejmuje {oczekiwane}."
            )
        elif faktyczne < oczekiwane:
            bledy.append(
                f"backend/src/{klucz[0]} ({klucz[1]}): wpis B-01 obejmuje {oczekiwane}, "
                f"zostało {faktyczne} — usuń/obniż wpis w WYJATKI_B01 (zapadka w dół)."
            )
    return bledy


def main() -> int:
    bledy = ocen(zmierz())
    if bledy:
        print("polykanie_wyjatkow_guard: NARUSZENIA")
        for blad in bledy:
            print(f"  - {blad}")
        return 1
    print(
        "polykanie_wyjatkow_guard: OK — zero handlerów połykających w backend/src "
        f"(wpisy B-01 czekające na decyzję właściciela: {len(WYJATKI_B01)})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

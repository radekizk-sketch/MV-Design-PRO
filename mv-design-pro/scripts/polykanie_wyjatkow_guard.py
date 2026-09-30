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

DRUGA POŁOWA — ODMOWA DANYCH (karta ODMOWA-DANYCH-422). Ta sama klasa „obcy wyjątek
przebrany za błąd użytkownika" miała jeszcze jedno miejsce: globalny handler API zamieniał
KAŻDY `ValueError` na 422, a trasy łapały `ValueError` wokół głębokich wywołań usług.
Odtąd 422 daje wyłącznie nazwana odmowa `network_model/odmowa_danych.py::OdmowaDanychError`.
Naruszeniem jest (AST, budżet 0, lista dozwolona PUSTA):

* w `api/**`: rejestracja handlera wyjątku dla `ValueError`
  (`@app.exception_handler(ValueError)`, `add_exception_handler(ValueError, …)`);
* w `api/**`: handler `except` łapiący `ValueError` (sam albo w krotce), który nie kończy
  się ponownym rzuceniem — CHYBA że blok `try` jest PARSOWANIEM wejścia: same instrukcje
  proste (przypisanie, wyrażenie, `return`), a każde wywołanie w nich to konstruktor typu
  (nazwa wielką literą: `UUID`, enum), `int`/`float`/`str`/`Decimal` albo normalizacja
  tekstu (`.lower()`/`.upper()`/`.strip()`). Taki blok nie ma dokąd sięgnąć po błąd
  programu; każdy inny łapie błąd programu razem z odmową;
* w `api/**`: `raise ValueError` — odmowa trasy to `OdmowaDanychError`, błąd programu
  asercja;
* wszędzie: blok `with odmowa_rdzenia_b01():` inny niż JEDNA instrukcja wołająca rdzeń
  B-01 (nazwa importowana z modułu z listy `scripts/rdzenie_b01.py` albo obiekt modułu
  zbudowany z takiej nazwy). Granica tłumaczy `ValueError` rdzenia na odmowę — obejmując
  cokolwiek więcej, przebrałaby błąd programu spoza rdzenia.

Warstwa aplikacji (`application/**`): liczba `raise ValueError` jest przypięta
(`PIN_RAISE_VALUEERROR_APLIKACJA`, zapadka w obie strony). Nowa odmowa dziedziny to
`OdmowaDanychError`; nowy błąd programu — asercja. Pin nie jest listą dozwoloną: nie
wskazuje miejsc, tylko nie pozwala dopisać nowego gołego `ValueError` bez decyzji.
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rdzenie_b01 import jest_rdzeniem_b01  # noqa: E402

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


# ---------------------------------------------------------------------------
# Druga połowa: odmowa danych (karta ODMOWA-DANYCH-422)
# ---------------------------------------------------------------------------

#: Liczba `raise ValueError` w `application/**` (pomiar po karcie ODMOWA-DANYCH-422,
#: 2026-09-25). Zapadka w obie strony: wzrost = nowy goły `ValueError` bez decyzji
#: (odmowa → `OdmowaDanychError`, błąd programu → asercja); spadek = obniż pin z pomiarem.
PIN_RAISE_VALUEERROR_APLIKACJA = 82

#: Wywołania dozwolone w bloku `try` parsowania wejścia trasy (poza konstruktorami typów).
PARSERY_WBUDOWANE = frozenset({"int", "float", "str", "Decimal"})
NORMALIZACJA_TEKSTU = frozenset({"lower", "upper", "strip"})

TYP_ODMOWY = "ValueError"
GRANICA_B01 = "odmowa_rdzenia_b01"


def _lapie_value_error(typ: ast.expr | None) -> bool:
    if isinstance(typ, ast.Name):
        return typ.id == TYP_ODMOWY
    if isinstance(typ, ast.Attribute):
        return typ.attr == TYP_ODMOWY
    if isinstance(typ, ast.Tuple):
        return any(_lapie_value_error(element) for element in typ.elts)
    return False


def _jest_parsowaniem(tresc: list[ast.stmt]) -> bool:
    """Blok `try` = instrukcje proste (przypisanie, wyrażenie, `return`), a każde wywołanie
    w nich to konstruktor typu, parser wbudowany albo normalizacja tekstu."""
    if not all(isinstance(i, ast.Assign | ast.AnnAssign | ast.Expr | ast.Return) for i in tresc):
        return False
    wywolania = [w for i in tresc for w in ast.walk(i) if isinstance(w, ast.Call)]
    if not wywolania:
        return False
    for wywolanie in wywolania:
        funkcja = wywolanie.func
        if isinstance(funkcja, ast.Name):
            if funkcja.id in PARSERY_WBUDOWANE or funkcja.id[:1].isupper():
                continue
            return False
        if isinstance(funkcja, ast.Attribute) and funkcja.attr in NORMALIZACJA_TEKSTU:
            continue
        return False
    return True


def _nazwa_modulu_na_sciezke(modul: str, korzen: Path) -> str | None:
    """`a.b.c` → `a/b/c.py` albo `a/b/c/__init__.py` (względem `korzen`), jeśli istnieje."""
    baza = modul.replace(".", "/")
    for kandydat in (f"{baza}.py", f"{baza}/__init__.py"):
        if (korzen / kandydat).is_file():
            return kandydat
    return None


def nazwy_rdzeni_b01(drzewo: ast.Module, korzen: Path = BACKEND_SRC) -> frozenset[str]:
    """Nazwy w module wskazujące rdzeń B-01: importy z modułów z listy właściciela oraz
    zmienne modułu zbudowane wywołaniem takiej nazwy (`_solver = Solver()`)."""
    nazwy: set[str] = set()
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.ImportFrom) and wezel.level == 0 and wezel.module:
            sciezka = _nazwa_modulu_na_sciezke(wezel.module, korzen)
            if sciezka is not None and jest_rdzeniem_b01(sciezka):
                nazwy.update(alias.asname or alias.name for alias in wezel.names)
    for wezel in drzewo.body:
        if (
            isinstance(wezel, ast.Assign)
            and isinstance(wezel.value, ast.Call)
            and isinstance(wezel.value.func, ast.Name)
            and wezel.value.func.id in nazwy
        ):
            nazwy.update(cel.id for cel in wezel.targets if isinstance(cel, ast.Name))
    return frozenset(nazwy)


def _wola_rdzen(instrukcja: ast.stmt, rdzenie: frozenset[str]) -> bool:
    for wezel in ast.walk(instrukcja):
        if not isinstance(wezel, ast.Call):
            continue
        funkcja = wezel.func
        while isinstance(funkcja, ast.Attribute):
            funkcja = funkcja.value
        if isinstance(funkcja, ast.Name) and funkcja.id in rdzenie:
            return True
    return False


def naruszenia_odmowy_w_kodzie(
    kod: str, *, warstwa_api: bool, rdzenie: frozenset[str] | None = None
) -> list[tuple[int, str]]:
    """Naruszenia odmowy danych w jednym module: (linia, opis).

    `warstwa_api` — moduł z `api/**` (reguły handlera, `except` i `raise` trasy);
    `rdzenie` — nazwy rdzeni B-01 widoczne w module (domyślnie z importów modułu).
    """
    drzewo = ast.parse(kod)
    if rdzenie is None:
        rdzenie = nazwy_rdzeni_b01(drzewo)
    naruszenia: list[tuple[int, str]] = []
    for wezel in ast.walk(drzewo):
        if warstwa_api and isinstance(wezel, ast.Call):
            nazwa = _nazwa_wywolania(wezel)
            if nazwa in ("exception_handler", "add_exception_handler") and any(
                _lapie_value_error(argument) for argument in wezel.args[:1]
            ):
                naruszenia.append(
                    (wezel.lineno, "handler globalny `ValueError` — 422 daje OdmowaDanychError")
                )
        if warstwa_api and isinstance(wezel, ast.Try):
            for handler in wezel.handlers:
                if (
                    _lapie_value_error(handler.type)
                    and not _konczy_sie_ponownym_rzuceniem(handler)
                    and not _jest_parsowaniem(wezel.body)
                ):
                    naruszenia.append(
                        (
                            handler.lineno,
                            f"except {ast.unparse(handler.type)} wokół wywołania, które nie "
                            "jest parsowaniem wejścia — łap OdmowaDanychError",
                        )
                    )
        if warstwa_api and isinstance(wezel, ast.Raise) and wezel.exc is not None:
            cel = wezel.exc.func if isinstance(wezel.exc, ast.Call) else wezel.exc
            if isinstance(cel, ast.Name) and cel.id == TYP_ODMOWY:
                naruszenia.append(
                    (wezel.lineno, "raise ValueError w trasie — OdmowaDanychError albo asercja")
                )
        if isinstance(wezel, ast.With) and any(
            isinstance(element.context_expr, ast.Call)
            and _nazwa_wywolania(element.context_expr) == GRANICA_B01
            for element in wezel.items
        ):
            if len(wezel.body) != 1 or not _wola_rdzen(wezel.body[0], rdzenie):
                naruszenia.append(
                    (
                        wezel.lineno,
                        "granica B-01 obejmuje coś innego niż jedno wywołanie rdzenia "
                        "z listy `scripts/rdzenie_b01.py`",
                    )
                )
    return sorted(naruszenia)


def zmierz_odmowy(korzen: Path = BACKEND_SRC) -> list[tuple[str, int, str]]:
    """Naruszenia odmowy danych pod `korzen`: (ścieżka względna, linia, opis)."""
    wynik: list[tuple[str, int, str]] = []
    for plik in sorted(korzen.rglob("*.py")):
        wzgledna = plik.relative_to(korzen).as_posix()
        tresc = plik.read_text(encoding="utf-8")
        drzewo = ast.parse(tresc)
        for linia, opis in naruszenia_odmowy_w_kodzie(
            tresc,
            warstwa_api=wzgledna.startswith("api/"),
            rdzenie=nazwy_rdzeni_b01(drzewo, korzen),
        ):
            wynik.append((wzgledna, linia, opis))
    return wynik


def policz_raise_value_error(korzen: Path) -> int:
    """Liczba `raise ValueError` (AST) w drzewie `korzen`."""
    licznik = 0
    for plik in sorted(korzen.rglob("*.py")):
        for wezel in ast.walk(ast.parse(plik.read_text(encoding="utf-8"))):
            if isinstance(wezel, ast.Raise) and wezel.exc is not None:
                cel = wezel.exc.func if isinstance(wezel.exc, ast.Call) else wezel.exc
                if isinstance(cel, ast.Name) and cel.id == TYP_ODMOWY:
                    licznik += 1
    return licznik


def ocen_odmowy(
    naruszenia: list[tuple[str, int, str]], raise_aplikacji: int, pin: int
) -> list[str]:
    """Komunikaty błędów drugiej połowy (pusta lista = zielony)."""
    bledy = [f"backend/src/{sciezka}:{linia}: {opis}." for sciezka, linia, opis in naruszenia]
    if raise_aplikacji > pin:
        bledy.append(
            f"backend/src/application: {raise_aplikacji} × `raise ValueError`, pin {pin} — "
            "nowa odmowa dziedziny to OdmowaDanychError, nowy błąd programu to asercja."
        )
    elif raise_aplikacji < pin:
        bledy.append(
            f"backend/src/application: {raise_aplikacji} × `raise ValueError`, pin {pin} — "
            "obniż PIN_RAISE_VALUEERROR_APLIKACJA do pomiaru (zapadka w dół)."
        )
    return bledy


def main() -> int:
    bledy = ocen(zmierz()) + ocen_odmowy(
        zmierz_odmowy(),
        policz_raise_value_error(BACKEND_SRC / "application"),
        PIN_RAISE_VALUEERROR_APLIKACJA,
    )
    if bledy:
        print("polykanie_wyjatkow_guard: NARUSZENIA")
        for blad in bledy:
            print(f"  - {blad}")
        return 1
    print(
        "polykanie_wyjatkow_guard: OK — zero handlerów połykających w backend/src, "
        "422 wyłącznie z OdmowaDanychError "
        f"(wpisy B-01 czekające na decyzję właściciela: {len(WYJATKI_B01)})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

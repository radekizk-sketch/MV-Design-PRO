#!/usr/bin/env python3
"""Arch Guard — granica warstw solverów i analizy (importy, AST).

Reguła (`FORBIDDEN_IMPORTS`): plik warstwy `solvers` (ścieżka z członem `solvers`) nie
importuje `analysis`; plik warstwy `analysis` nie importuje pakietu `solvers` (warstwa
wywołań/dyspozycji solverów, `backend/src/solvers/**`).

IMPORTY są rozwiązywane wg semantyki interpretera (`scripts/importy_ast.py`, jedno źródło
prawdy bramek). Do 2026-09-30 bramka czytała samo `ImportFrom.module`, więc import
względny `from .solvers import x` w `analysis/pakiet/m.py` (moduł `analysis.pakiet.solvers`)
był raportowany jako import warstwy `solvers`, a nazwa sprowadzona z pakietu
(`from analysis import protection`) nie była liczona jako moduł `analysis.protection`.
Import względny ponad korzeń drzewa importów (interpreter: `ImportError`) jest naruszeniem
— bramka nie zgaduje jego celu. Testy: `scripts/test_granice_importow_wzglednych.py`.

ALIAS PAKIETU `src`. `backend/src/__init__.py` istnieje, więc `src.network_model.solvers`
i `network_model.solvers` to ten sam kod pod dwiema nazwami. Każda nazwa modułu jest przed
porównaniem sprowadzana do postaci bez prefiksu `src.` (`_bez_src`), a sam pakiet `src`
jest przodkiem każdego pakietu produktu.

REGUŁA SOLVERÓW FIZYCZNYCH W WARSTWIE ANALIZY — PO DOSTĘPIE, NIE PO ŚCIEŻCE IMPORTU
(karta TORY-TYLKO-W-TESTACH, poprawki karty TORY-POPRAWKI, 2026-09-30).
Kod produktu `backend/src/analysis/**` nie ma w zasięgu żadnego obiektu solvera
fizycznego (`network_model.solvers*`) poza listą zamkniętą `ANALIZA_DOZWOLONE_Z_SOLVEROW`
(typy wyników i kontrakty wejścia — dane, nie obliczenia). Pierwsza wersja reguły
pilnowała ścieżki importu `network_model.solvers…`, więc solver był osiągalny bokiem:
`import network_model.core.graph` wiąże nazwę `network_model`, przez którą łańcuch
atrybutów sięga `network_model.solvers.power_flow_newton` (gorliwy `solvers/__init__.py`
ładuje moduły solverów przy każdym imporcie typu z listy); reeksport
`from enm.canonical_analysis import PowerFlowNewtonSolver`; obiekt pakietu
`from application import solvers`; alias `from src.network_model.solvers… import …`.

Dlatego każda nazwa wiązana instrukcją importu w `src/analysis/**` (także w funkcji
i pod `TYPE_CHECKING`) jest rozwiązywana STATYCZNIE do obiektu, który wskazuje
(`_Rozwiazywacz`: pochodzenie nazwy przez łańcuch reeksportów modułów `backend/src`,
z importami względnymi, `*`, przypisaniem aliasu i ciałem klasy). Naruszeniem jest:

* symbol zdefiniowany w `network_model.solvers*` spoza listy zamkniętej — niezależnie
  od modułu, przez który przyszedł (`from enm.canonical_analysis import solve_with_oltc`);
  typ z listy zamkniętej reeksportowany innym modułem pozostaje dozwolony (pochodzenie
  decyduje, nie ścieżka);
* obiekt modułu `network_model.solvers*` (także z listy — moduł daje dostęp do funkcji)
  i obiekt pakietu-przodka solverów (`network_model`, `src`) — tak wiąże go
  `import network_model.core.graph` bez aliasu;
* obiekt modułu produktu spoza analizy, którego przestrzeń nazw udostępnia obiekt
  naruszający (`from enm import canonical_analysis`); obiekt pakietu — gdy udostępnia go
  którykolwiek jego podmoduł (`from application import solvers`);
* obiekt przypisany w module reeksportującym z wyrażenia sięgającego obiektu
  naruszającego (`SOLVER = PowerFlowNewtonSolver()`, `class X(PowerFlowNewtonSolver)`);
* nazwa, której pochodzenia nie da się dowieść (brak wiązania w module, `__getattr__`
  modułu) — fail-closed;
* łańcuch atrybutów, którego postać kropkowa leży pod `network_model.solvers`;
* import bezpośrednio z modułu solvera: moduł spoza listy, nazwa spoza listy, `*`.

IMPORT DYNAMICZNY I REFLEKSJA (fail-closed). `importlib.import_module` i `__import__` są
dozwolone WYŁĄCZNIE jako bezpośrednie wywołanie, którego argumenty są stałymi dającymi
się zwinąć (napis, `__name__`, `__package__`, konkatenacja `+` i f-string z samych
stałych); moduł wynikowy (dla `__import__` bez `fromlist` — pakiet najwyższego poziomu)
i każdy moduł ładowany (`fromlist`, import względny z `package=` albo `level=`) przechodzą
te same sprawdzenia co import statyczny. Naruszeniem jest nazwa nie-stała, `*args`
i `**kwargs`, alias funkcji (`im = importlib.import_module`, przekazanie jako argument),
każde inne użycie modułu `importlib`, `from importlib import` czegokolwiek poza
`import_module`, `sys.modules` i każde użycie `sys` poza atrybutem, moduły refleksji
(`REFLEKSJA_MODULY_ZAKAZANE`), wbudowane dające dostęp do przestrzeni nazw
(`REFLEKSJA_WBUDOWANE_ZAKAZANE`) i atrybuty refleksji (`REFLEKSJA_ATRYBUTY_ZAKAZANE`,
np. `f.__globals__` — przestrzeń nazw modułu funkcji reeksportowanej).

GRANICA REGUŁY (jawnie). Reguła dotyczy obiektów solverów. Funkcja warstwy wiązania
(np. `application`), która wewnątrz woła solver, jest osobnym obiektem zdefiniowanym poza
solverami — jej import nie jest dostępem do solvera; granicę tej warstwy trzyma
`FORBIDDEN_IMPORTS` i strażnicy warstwy wiązania. Testy `backend/tests/analysis/**` są
poza regułą — test woła solver, żeby dowieść fizyki.
"""

from __future__ import annotations

import ast
import importlib.util
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from importy_ast import (  # noqa: E402
    ImportPonadKorzen,
    modul_bazowy,
    moduly_dotkniete,
    nazwa_modulu,
    pakiet_pliku,
    pod_prefiksem,
    rozwiaz,
)

REPO_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_IMPORTS = {
    "solvers": ("analysis", "analysis.protection"),
    "analysis": ("solvers",),
    "analysis.protection": ("solvers",),
}

#: Pakiet solverów fizycznych (WHITE BOX) — warstwa analizy go nie woła.
SOLVERY_FIZYCZNE = ("network_model.solvers",)

#: Warstwa analizy — jej moduły są skanowane same, więc obiekt z nich pochodzący jest
#: dowiedziony (każde wiązanie w nich przechodzi tę samą regułę).
WARSTWA_ANALIZY = ("analysis",)

#: LISTA ZAMKNIĘTA (pomiar 2026-09-30 na całym `backend/src/analysis/**`): jedyne nazwy,
#: które warstwa analizy sprowadza z solverów. Każda to typ danych, nie obliczenie.
#: Nowy wpis wymaga uzasadnienia przy wpisie; wpis bez importera w `src/analysis/**` jest
#: martwym wyjątkiem (pilnuje `test_lista_dozwolona_bez_martwych_wpisow`).
ANALIZA_DOZWOLONE_Z_SOLVEROW: dict[str, frozenset[str]] = {
    # Kontrakt WEJŚCIA solvera rozpływu (dataclasses bez obliczeń), reeksportowany przez
    # `analysis/power_flow/types.py` jako część publicznego API pakietu typu wyniku.
    "network_model.solvers.power_flow_types": frozenset(
        {
            "BranchLimitSpec",
            "BusVoltageLimitSpec",
            "PowerFlowInput",
            "PowerFlowOptions",
            "PQSpec",
            "PVSpec",
            "ShuntSpec",
            "SlackSpec",
            "TransformerTapSpec",
        }
    ),
    # Typ wyniku rozpływu FROZEN v1 — czytany przez rozkład segmentów profilu napięć
    # (`analysis/voltage_profile/segment_decomposition.py`), bez `build_power_flow_result_v1`.
    "network_model.solvers.power_flow_result": frozenset({"PowerFlowResultV1"}),
}


@dataclass(frozen=True, eq=False)  # tożsamość = obiekt (klucz pamięci rozwiązywacza)
class PolitykaDostepu:
    """Co jest chronione przed plikiem i co z chronionego wolno mu mieć w zasięgu.

    `chronione` — prefiksy modułów, których obiekty są poza zasięgiem; `dozwolone` — lista
    zamknięta symboli (moduł → nazwy) z modułów chronionych; `dowiedzione` — warstwa,
    której moduły są skanowane tą samą regułą (obiekt z nich pochodzący jest dowiedziony);
    `warstwa` — etykieta w komunikacie. Reguła warstwy analizy i bramka pakietu dowodowego
    stanu fazowego SN (`legacy_public_path_guard`) to dwie polityki tej samej reguły."""

    chronione: tuple[str, ...]
    dozwolone: Mapping[str, frozenset[str]]
    dowiedzione: tuple[str, ...]
    warstwa: str
    nazwa_listy: str


POLITYKA_ANALIZY = PolitykaDostepu(
    chronione=SOLVERY_FIZYCZNE,
    dozwolone=ANALIZA_DOZWOLONE_Z_SOLVEROW,
    dowiedzione=WARSTWA_ANALIZY,
    warstwa="analysis",
    nazwa_listy="ANALIZA_DOZWOLONE_Z_SOLVEROW",
)

#: Funkcje importu dynamicznego napisem.
_FUNKCJE_IMPORTU = frozenset({"import_module", "__import__"})

#: Moduły refleksji i ładowania kodu: każdy import w `src/analysis/**` jest naruszeniem
#: (sięgają dowolnego obiektu interpretera: `gc.get_objects()`, `inspect.getmodule(f)`,
#: `runpy.run_module`, `builtins.__import__`, loadery). Pomiar 2026-09-30: zero użyć.
REFLEKSJA_MODULY_ZAKAZANE = (
    "builtins",
    "ctypes",
    "gc",
    "imp",
    "inspect",
    "marshal",
    "pickle",
    "pkgutil",
    "runpy",
    "zipimport",
)

#: Wbudowane dające dostęp do przestrzeni nazw albo wykonania kodu z napisu.
REFLEKSJA_WBUDOWANE_ZAKAZANE = frozenset(
    {"__builtins__", "compile", "eval", "exec", "globals", "locals", "vars"}
)

#: Atrybuty refleksji: przestrzeń nazw modułu funkcji (`__globals__`), wbudowane
#: (`__builtins__`), wszystkie klasy interpretera (`__subclasses__`), komórki domknięcia,
#: loader modułu.
REFLEKSJA_ATRYBUTY_ZAKAZANE = frozenset(
    {
        "__builtins__",
        "__closure__",
        "__globals__",
        "__import__",
        "__loader__",
        "__spec__",
        "__subclasses__",
    }
)

#: Moduły maszynerii importu: obiekt takiego modułu (albo jego funkcja importu)
#: reeksportowany przez moduł produktu jest naruszeniem (nie da się śledzić jego użycia).
_MASZYNERIA_IMPORTU = ("importlib", "sys", *REFLEKSJA_MODULY_ZAKAZANE)


def _bez_src(modul: str) -> str:
    """Nazwa modułu bez aliasu pakietu `src` (`src.network_model` → `network_model`)."""
    return modul[4:] if modul.startswith("src.") else modul


def _pakiet(path: Path, backend_root: Path) -> str:
    """`__package__` pliku: korzeniem importów jest `backend/src` dla kodu produktu
    i `backend/` dla testów i skryptów backendu (pakiet `tests`)."""
    for korzen in (backend_root / "src", backend_root):
        try:
            return pakiet_pliku(path, korzen)
        except ValueError:
            continue
    return ""


def _import_targets(node: ast.AST, pakiet: str) -> list[str]:
    """Moduły ładowane przez instrukcję importu (bez aliasu `src.`). Rzuca
    `ImportPonadKorzen`."""
    if isinstance(node, ast.Import | ast.ImportFrom):
        return [_bez_src(m) for m in moduly_dotkniete(pakiet, node)]
    return []


def _matches_forbidden(imported: str, forbidden_prefix: str) -> bool:
    return imported == forbidden_prefix or imported.startswith(f"{forbidden_prefix}.")


def _violates(layer: str, imported: str) -> bool:
    for forbidden_prefix in FORBIDDEN_IMPORTS.get(layer, ()):
        if _matches_forbidden(imported, forbidden_prefix):
            return True
    return False


def _layer_for_path(path: Path) -> str | None:
    parts = path.parts
    if "solvers" in parts:
        return "solvers"
    if "analysis" in parts:
        if "protection" in parts:
            return "analysis.protection"
        return "analysis"
    return None


def _kod_analizy_produktu(path: Path, backend_root: Path) -> bool:
    """Plik kodu produktu warstwy analizy: `backend/src/analysis/**` (testy poza regułą)."""
    try:
        return path.relative_to(backend_root / "src" / "analysis") is not None
    except ValueError:
        return False


def _przodek(modul: str, chronione: tuple[str, ...]) -> bool:
    """`modul` jest pakietem nadrzędnym modułów chronionych (`network_model`, `src`)."""
    return modul == "src" or any(s.startswith(f"{modul}.") for s in chronione)


# ---------------------------------------------------------------------------
# Statyczny rozwiązywacz pochodzenia nazw w drzewie `backend/src`.
# ---------------------------------------------------------------------------


class _Wiazania:
    """Wiązania nazw na poziomie modułu (także w `if`/`try`/`with`/pętlach)."""

    def __init__(self, drzewo: ast.Module) -> None:
        self.nazwy: dict[str, list[tuple[str, ast.AST]]] = {}
        self.gwiazdki: list[ast.ImportFrom] = []
        self._zbierz(drzewo.body)

    def _dodaj(self, nazwa: str, rodzaj: str, wezel: ast.AST) -> None:
        self.nazwy.setdefault(nazwa, []).append((rodzaj, wezel))

    def _cele(self, cel: ast.AST, rodzaj: str, wartosc: ast.AST) -> None:
        for n in ast.walk(cel):
            if isinstance(n, ast.Name):
                self._dodaj(n.id, rodzaj, wartosc)

    def _zbierz(self, instrukcje: list[ast.stmt]) -> None:
        for st in instrukcje:
            if isinstance(st, ast.Import):
                for alias in st.names:
                    self._dodaj(
                        alias.asname or alias.name.split(".")[0], "import", alias
                    )
            elif isinstance(st, ast.ImportFrom):
                for alias in st.names:
                    if alias.name == "*":
                        self.gwiazdki.append(st)
                    else:
                        self._dodaj(alias.asname or alias.name, "from", st)
            elif isinstance(st, ast.FunctionDef | ast.AsyncFunctionDef):
                self._dodaj(st.name, "def", st)
            elif isinstance(st, ast.ClassDef):
                self._dodaj(st.name, "class", st)
            elif isinstance(st, ast.Assign):
                for cel in st.targets:
                    self._cele(cel, "assign", st.value)
            elif isinstance(st, ast.AnnAssign | ast.AugAssign):
                if st.value is not None:
                    self._cele(st.target, "assign", st.value)
            elif isinstance(st, ast.For | ast.AsyncFor):
                self._cele(st.target, "assign", st.iter)
                self._zbierz(st.body)
                self._zbierz(st.orelse)
            elif isinstance(st, ast.While):
                self._zbierz(st.body)
                self._zbierz(st.orelse)
            elif isinstance(st, ast.If):
                self._zbierz(st.body)
                self._zbierz(st.orelse)
            elif isinstance(st, ast.With | ast.AsyncWith):
                for item in st.items:
                    if item.optional_vars is not None:
                        self._cele(item.optional_vars, "assign", item.context_expr)
                self._zbierz(st.body)
            elif isinstance(st, ast.Try | ast.TryStar):
                self._zbierz(st.body)
                for handler in st.handlers:
                    self._zbierz(handler.body)
                self._zbierz(st.orelse)
                self._zbierz(st.finalbody)
            elif isinstance(st, ast.Match):
                for przypadek in st.cases:
                    self._zbierz(przypadek.body)


class _Rozwiazywacz:
    """Pochodzenie obiektu wskazywanego nazwą — statycznie, po drzewie `backend/src`.

    Każda metoda `narusza_*` zwraca opis naruszenia (napis) albo `None`. Pamięć podręczna
    przerywa cykle importów (obiekt w trakcie rozwiązywania liczy się jako dowiedziony —
    jego wiązania i tak zostaną sprawdzone na zewnętrznym poziomie rekursji)."""

    def __init__(self, src: Path, polityka: PolitykaDostepu) -> None:
        self.src = src
        self.polityka = polityka
        self._wiazania: dict[str, _Wiazania | None] = {}
        self._pamiec: dict[tuple[str, ...], str | None] = {}

    # -- pliki i wiązania ------------------------------------------------------

    def plik(self, modul: str) -> Path | None:
        if not modul:
            return None
        baza = self.src.joinpath(*modul.split("."))
        if (baza / "__init__.py").is_file():
            return baza / "__init__.py"
        if baza.with_suffix(".py").is_file():
            return baza.with_suffix(".py")
        return None

    def pakiet_modulu(self, modul: str) -> str:
        plik = self.plik(modul)
        if plik is not None and plik.name == "__init__.py":
            return modul
        return modul.rpartition(".")[0]

    def wiazania(self, modul: str) -> _Wiazania | None:
        if modul not in self._wiazania:
            plik = self.plik(modul)
            if plik is None:
                self._wiazania[modul] = None
            else:
                try:
                    drzewo = ast.parse(plik.read_text(encoding="utf-8"))
                except SyntaxError:
                    drzewo = ast.Module(body=[], type_ignores=[])
                self._wiazania[modul] = _Wiazania(drzewo)
        return self._wiazania[modul]

    def _podmoduly(self, modul: str) -> list[str]:
        plik = self.plik(modul)
        if plik is None or plik.name != "__init__.py":
            return []
        wynik: list[str] = []
        for dziecko in sorted(plik.parent.iterdir()):
            if dziecko.suffix == ".py" and dziecko.name != "__init__.py":
                wynik.append(f"{modul}.{dziecko.stem}")
            elif dziecko.is_dir() and (dziecko / "__init__.py").is_file():
                wynik.append(f"{modul}.{dziecko.name}")
        return wynik

    def _z_pamiecia(
        self, klucz: tuple[str, ...], licz: Callable[[], str | None]
    ) -> str | None:
        if klucz in self._pamiec:
            return self._pamiec[klucz]
        self._pamiec[klucz] = None  # cykl → dowiedziony na tym poziomie
        wynik = licz()
        self._pamiec[klucz] = wynik
        return wynik

    # -- obiekty ---------------------------------------------------------------

    def narusza_modul(self, modul: str) -> str | None:
        """Obiekt modułu `modul` w zasięgu analizy."""
        modul = _bez_src(modul)
        if pod_prefiksem(modul, self.polityka.dowiedzione):
            return None
        if pod_prefiksem(modul, self.polityka.chronione):
            return f"obiekt modulu solvera {modul} (modul daje dostep do obliczen)"
        if _przodek(modul, self.polityka.chronione):
            return (
                f"obiekt pakietu {modul} (przodek network_model.solvers — lancuch atrybutow "
                "siega modulow solverow)"
            )
        if pod_prefiksem(modul, _MASZYNERIA_IMPORTU):
            return f"obiekt modulu maszynerii importu {modul} (dostep do network_model.solvers)"
        if self.plik(modul) is None:
            return None
        return self._z_pamiecia(("modul", modul), lambda: self._udostepnia(modul))

    def _udostepnia(self, modul: str) -> str | None:
        wiazania = self.wiazania(modul)
        assert wiazania is not None
        for nazwa in sorted(wiazania.nazwy):
            powod = self.narusza_symbol(modul, nazwa)
            if powod is not None:
                return f"modul {modul} udostepnia {nazwa}: {powod}"
        for wezel in wiazania.gwiazdki:
            powod = self._narusza_gwiazdka(modul, wezel)
            if powod is not None:
                return f"modul {modul} udostepnia `*`: {powod}"
        for podmodul in self._podmoduly(modul):
            powod = self.narusza_modul(podmodul)
            if powod is not None:
                return f"pakiet {modul} udostepnia podmodul {podmodul}: {powod}"
        return None

    def _baza(self, modul: str, wezel: ast.ImportFrom) -> str:
        return _bez_src(modul_bazowy(self.pakiet_modulu(modul), wezel))

    def _narusza_gwiazdka(self, modul: str, wezel: ast.ImportFrom) -> str | None:
        try:
            baza = self._baza(modul, wezel)
        except ImportPonadKorzen as blad:
            return str(blad)
        if pod_prefiksem(baza, self.polityka.chronione) or pod_prefiksem(
            baza, _MASZYNERIA_IMPORTU
        ):
            return f"`from {baza} import *`"
        return self.narusza_modul(baza)

    def narusza_symbol(self, modul: str, nazwa: str) -> str | None:
        """Obiekt `modul.nazwa` (nazwa z przestrzeni nazw modułu) w zasięgu analizy."""
        modul = _bez_src(modul)
        if modul == "src":
            return self.narusza_modul(nazwa)
        if pod_prefiksem(modul, self.polityka.dowiedzione):
            return None
        podmodul = f"{modul}.{nazwa}"
        if not pod_prefiksem(modul, self.polityka.chronione) and (
            pod_prefiksem(podmodul, self.polityka.chronione)
            or _przodek(podmodul, self.polityka.chronione)
        ):
            # `from network_model import solvers`: nazwa z pakietu jest podmodułem solverów
            # (albo ich przodkiem) — niezależnie od tego, czy plik istnieje w drzewie.
            return self.narusza_modul(podmodul)
        if pod_prefiksem(modul, _MASZYNERIA_IMPORTU):
            # `sys`: groźny jest wyłącznie `sys.modules`; pozostałe moduły maszynerii
            # (importlib, refleksja) — każdy symbol (funkcja importu, loader, `eval`).
            if modul.split(".")[0] != "sys" or nazwa == "modules":
                return f"symbol maszynerii importu {modul}.{nazwa}"
            return None
        if self.plik(modul) is None:
            if pod_prefiksem(modul, self.polityka.chronione):
                return f"{modul}.{nazwa} (pakiet solverow fizycznych)"
            return None
        return self._z_pamiecia(
            ("symbol", modul, nazwa), lambda: self._symbol(modul, nazwa)
        )

    def _symbol(self, modul: str, nazwa: str) -> str | None:
        wiazania = self.wiazania(modul)
        assert wiazania is not None
        wpisy = wiazania.nazwy.get(nazwa)
        if wpisy:
            for rodzaj, wezel in wpisy:
                powod = self._wiazanie(modul, nazwa, rodzaj, wezel)
                if powod is not None:
                    return powod
            return None
        for wezel in wiazania.gwiazdki:
            try:
                baza = self._baza(modul, wezel)
            except ImportPonadKorzen as blad:
                return str(blad)
            if self.plik(baza) is not None and self._wiaze(baza, nazwa):
                return self.narusza_symbol(baza, nazwa)
        if self.plik(f"{modul}.{nazwa}") is not None:
            return self.narusza_modul(f"{modul}.{nazwa}")
        if "__getattr__" in wiazania.nazwy:
            return (
                f"nazwa {modul}.{nazwa} z dynamicznego __getattr__ modulu — nie dowiedziono, "
                "ze nie jest obiektem network_model.solvers (fail-closed)"
            )
        return (
            f"nie dowiedziono pochodzenia nazwy {modul}.{nazwa} (brak wiazania w module; "
            "fail-closed wobec network_model.solvers)"
        )

    def _wiaze(self, modul: str, nazwa: str) -> bool:
        wiazania = self.wiazania(modul)
        if wiazania is None:
            return False
        return nazwa in wiazania.nazwy or self.plik(f"{modul}.{nazwa}") is not None

    def _wiazanie(
        self, modul: str, nazwa: str, rodzaj: str, wezel: ast.AST
    ) -> str | None:
        solverowy = pod_prefiksem(modul, self.polityka.chronione)
        if rodzaj == "import":
            assert isinstance(wezel, ast.alias)
            cel = wezel.name if wezel.asname else wezel.name.split(".")[0]
            return self.narusza_modul(cel)
        if rodzaj == "from":
            assert isinstance(wezel, ast.ImportFrom)
            try:
                baza = self._baza(modul, wezel)
            except ImportPonadKorzen as blad:
                return str(blad)
            oryginal = next(
                a.name for a in wezel.names if (a.asname or a.name) == nazwa
            )
            return self.narusza_symbol(baza, oryginal)
        if solverowy:
            # Symbol ZDEFINIOWANY w module solvera: decyduje lista zamknięta.
            if nazwa in self.polityka.dozwolone.get(modul, frozenset()):
                return None
            return (
                f"{modul}.{nazwa} (obiekt solvera spoza listy typow wynikow i kontraktow "
                f"{self.polityka.nazwa_listy})"
            )
        if rodzaj == "def":
            return None
        if rodzaj == "class":
            assert isinstance(wezel, ast.ClassDef)
            wyrazenia: list[ast.AST] = [
                *wezel.bases,
                *wezel.keywords,
                *wezel.decorator_list,
            ]
            for st in wezel.body:
                if isinstance(st, ast.Assign | ast.AugAssign):
                    wyrazenia.append(st.value)
                elif isinstance(st, ast.AnnAssign) and st.value is not None:
                    wyrazenia.append(st.value)
            for wyrazenie in wyrazenia:
                powod = self.narusza_wyrazenie(modul, wyrazenie)
                if powod is not None:
                    return f"klasa {modul}.{nazwa} siega {powod}"
            return None
        return self.narusza_wyrazenie(modul, wezel)

    def narusza_wyrazenie(self, modul: str, wyrazenie: ast.AST) -> str | None:
        """Wyrażenie w przestrzeni nazw modułu sięga obiektu naruszającego."""
        wiazania = self.wiazania(modul)
        for n in ast.walk(wyrazenie):
            if isinstance(n, ast.Name):
                if wiazania is not None and n.id in wiazania.nazwy:
                    powod = self.narusza_symbol(modul, n.id)
                    if powod is not None:
                        return powod
                elif n.id in REFLEKSJA_WBUDOWANE_ZAKAZANE or n.id == "__import__":
                    return f"wbudowane {n.id} (refleksja)"
            elif isinstance(n, ast.Attribute) and n.attr in REFLEKSJA_ATRYBUTY_ZAKAZANE:
                return f"atrybut refleksji {n.attr}"
        return None


_ROZWIAZYWACZE: dict[tuple[Path, PolitykaDostepu], _Rozwiazywacz] = {}


def _rozwiazywacz(src: Path, polityka: PolitykaDostepu) -> _Rozwiazywacz:
    klucz = (src.resolve(), polityka)
    if klucz not in _ROZWIAZYWACZE:
        _ROZWIAZYWACZE[klucz] = _Rozwiazywacz(klucz[0], polityka)
    return _ROZWIAZYWACZE[klucz]


# ---------------------------------------------------------------------------
# Reguła w pliku warstwy analizy.
# ---------------------------------------------------------------------------


def _import_z_chronionego(
    baza: str, node: ast.ImportFrom, polityka: PolitykaDostepu
) -> str | None:
    """Import bezpośrednio z modułu chronionego — lista zamknięta."""
    dozwolone = polityka.dozwolone.get(baza)
    if dozwolone is None:
        return (
            f"{polityka.warstwa} must not import {baza} (modul spoza listy typow "
            f"wynikow i kontraktow {polityka.nazwa_listy})"
        )
    for alias in node.names:
        if alias.name not in dozwolone:
            return (
                f"{polityka.warstwa} must not import {baza}.{alias.name} (nazwa spoza listy "
                f"typow wynikow i kontraktow {polityka.nazwa_listy})"
            )
    return None


def _kropkowo(wezel: ast.AST) -> str | None:
    czesci: list[str] = []
    while isinstance(wezel, ast.Attribute):
        czesci.append(wezel.attr)
        wezel = wezel.value
    if isinstance(wezel, ast.Name):
        czesci.append(wezel.id)
        return ".".join(reversed(czesci))
    return None


class _RegulaDostepu:
    """Sprawdzenie jednego pliku wobec polityki dostępu (patrz nagłówek modułu)."""

    def __init__(
        self, drzewo: ast.Module, pakiet: str, modul: str, rozw: _Rozwiazywacz
    ):
        self.drzewo = drzewo
        self.pakiet = pakiet
        self.modul = modul
        self.rozw = rozw
        self.warstwa = rozw.polityka.warstwa
        self.rodzic: dict[int, ast.AST] = {}
        for n in ast.walk(drzewo):
            for dziecko in ast.iter_child_nodes(n):
                self.rodzic[id(dziecko)] = n
        # Nazwy związane w pliku z maszynerią importu.
        self.funkcje_importu: set[str] = {"__import__"}
        self.moduly_importlib: set[str] = set()
        self.moduly_sys: set[str] = set()

    def sprawdz(self) -> str | None:
        for n in ast.walk(self.drzewo):
            if isinstance(n, ast.Import | ast.ImportFrom):
                powod = self._import(n)
                if powod is not None:
                    return powod
        for n in ast.walk(self.drzewo):
            powod = self._uzycie(n)
            if powod is not None:
                return powod
        return None

    # -- instrukcje importu ------------------------------------------------------

    def _import(self, n: ast.Import | ast.ImportFrom) -> str | None:
        if isinstance(n, ast.Import):
            for alias in n.names:
                nazwa = _bez_src(alias.name)
                if pod_prefiksem(nazwa, REFLEKSJA_MODULY_ZAKAZANE):
                    return f"{self.warstwa} must not import {nazwa} (refleksja siega network_model.solvers)"
                if nazwa == "importlib" or nazwa.startswith("importlib."):
                    if alias.asname is not None and nazwa != "importlib":
                        return (
                            f"{self.warstwa} must not import {nazwa} (maszyneria importu; dozwolone "
                            "wylacznie wywolanie importlib.import_module — network_model.solvers)"
                        )
                    self.moduly_importlib.add(alias.asname or "importlib")
                    continue
                if nazwa == "sys":
                    self.moduly_sys.add(alias.asname or "sys")
                    continue
                if pod_prefiksem(nazwa, self.rozw.polityka.chronione):
                    return (
                        f"{self.warstwa} must not import {nazwa} (import modulu solvera daje "
                        "dostep do obliczen; dozwolone wylacznie `from <modul> import <typ>` "
                        f"z {self.rozw.polityka.nazwa_listy})"
                    )
                cel = nazwa if alias.asname else nazwa.split(".")[0]
                powod = self.rozw.narusza_modul(cel)
                if powod is not None:
                    return (
                        f"{self.warstwa} must not bind {alias.asname or cel}: {powod}"
                    )
            return None
        baza = _bez_src(modul_bazowy(self.pakiet, n))
        if baza == "src":
            for alias in n.names:
                powod = self.rozw.narusza_modul(alias.name)
                if powod is not None:
                    return f"{self.warstwa} must not import src.{alias.name}: {powod}"
            return None
        if pod_prefiksem(baza, self.rozw.polityka.chronione):
            return _import_z_chronionego(baza, n, self.rozw.polityka)
        if pod_prefiksem(baza, REFLEKSJA_MODULY_ZAKAZANE):
            return f"{self.warstwa} must not import from {baza} (refleksja siega network_model.solvers)"
        if baza == "importlib" or baza.startswith("importlib."):
            for alias in n.names:
                if baza != "importlib" or alias.name != "import_module":
                    return (
                        f"{self.warstwa} must not import {baza}.{alias.name} (maszyneria importu; "
                        "dozwolone wylacznie wywolanie importlib.import_module — "
                        "network_model.solvers)"
                    )
                self.funkcje_importu.add(alias.asname or alias.name)
            return None
        if baza == "sys":
            for alias in n.names:
                if alias.name in ("modules", "*"):
                    return f"{self.warstwa} must not import sys.modules (dostep do network_model.solvers)"
            return None
        for alias in n.names:
            if alias.name == "*":
                if self.rozw.plik(baza) is not None:
                    powod = self.rozw.narusza_modul(baza)
                    if powod is not None:
                        return f"{self.warstwa} must not import * from {baza}: {powod}"
                continue
            powod = self.rozw.narusza_symbol(baza, alias.name)
            if powod is not None:
                return f"{self.warstwa} must not import {baza}.{alias.name}: {powod}"
        return None

    # -- użycia nazw ---------------------------------------------------------------

    def _uzycie(self, n: ast.AST) -> str | None:
        rodzic = self.rodzic.get(id(n))
        if isinstance(n, ast.Attribute):
            if n.attr in REFLEKSJA_ATRYBUTY_ZAKAZANE:
                return f"{self.warstwa} must not use .{n.attr} (refleksja siega network_model.solvers)"
            kropkowo = _kropkowo(n)
            if kropkowo is not None and pod_prefiksem(
                _bez_src(kropkowo), self.rozw.polityka.chronione
            ):
                return f"{self.warstwa} must not access {kropkowo} (lancuch atrybutow do solvera)"
            return None
        if not isinstance(n, ast.Name) or not isinstance(n.ctx, ast.Load):
            return None
        if n.id in REFLEKSJA_WBUDOWANE_ZAKAZANE:
            return f"{self.warstwa} must not use {n.id} (refleksja siega network_model.solvers)"
        if n.id in self.funkcje_importu:
            if isinstance(rodzic, ast.Call) and rodzic.func is n:
                return self._wywolanie(rodzic, n.id == "__import__")
            return (
                f"{self.warstwa} must not alias {n.id} (funkcja importu dynamicznego poza "
                "bezposrednim wywolaniem — nie dowiedziono celu wobec network_model.solvers)"
            )
        if n.id in self.moduly_importlib:
            dziadek = self.rodzic.get(id(rodzic)) if rodzic is not None else None
            if (
                isinstance(rodzic, ast.Attribute)
                and rodzic.attr == "import_module"
                and isinstance(dziadek, ast.Call)
                and dziadek.func is rodzic
            ):
                return self._wywolanie(dziadek, False)
            return (
                f"{self.warstwa} must not use {n.id} poza wywolaniem {n.id}.import_module(...) "
                "(maszyneria importu — nie dowiedziono celu wobec network_model.solvers)"
            )
        if n.id in self.moduly_sys:
            if (
                isinstance(rodzic, ast.Attribute)
                and rodzic.value is n
                and rodzic.attr != "modules"
            ):
                return None
            return f"{self.warstwa} must not use {n.id}.modules ani obiektu {n.id} (dostep do network_model.solvers)"
        return None

    def _zwin(self, wyrazenie: ast.AST | None) -> str | None:
        """Wartość napisu dającego się zwinąć do stałej albo `None`."""
        if isinstance(wyrazenie, ast.Constant) and isinstance(wyrazenie.value, str):
            return wyrazenie.value
        if isinstance(wyrazenie, ast.Name):
            if wyrazenie.id == "__name__":
                return self.modul
            if wyrazenie.id == "__package__":
                return self.pakiet
            return None
        if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.Add):
            lewy, prawy = self._zwin(wyrazenie.left), self._zwin(wyrazenie.right)
            return None if lewy is None or prawy is None else lewy + prawy
        if isinstance(wyrazenie, ast.JoinedStr):
            czesci: list[str] = []
            for wartosc in wyrazenie.values:
                if isinstance(wartosc, ast.FormattedValue):
                    if wartosc.conversion != -1 or wartosc.format_spec is not None:
                        return None
                    zwiniete = self._zwin(wartosc.value)
                else:
                    zwiniete = self._zwin(wartosc)
                if zwiniete is None:
                    return None
                czesci.append(zwiniete)
            return "".join(czesci)
        return None

    def _wywolanie(self, wywolanie: ast.Call, dunder: bool) -> str | None:
        niestala = (
            f"{self.warstwa}: import dynamiczny z argumentem nie-stalym — nie dowiedziono, ze cel "
            "lezy poza network_model.solvers (fail-closed)"
        )
        if any(isinstance(a, ast.Starred) for a in wywolanie.args) or any(
            k.arg is None for k in wywolanie.keywords
        ):
            return niestala
        nazwy_argumentow = (
            ("name", "globals", "locals", "fromlist", "level")
            if dunder
            else ("name", "package")
        )
        argumenty: dict[str, ast.AST] = {}
        for i, arg in enumerate(wywolanie.args):
            if i >= len(nazwy_argumentow):
                return niestala
            argumenty[nazwy_argumentow[i]] = arg
        for kw in wywolanie.keywords:
            argumenty[str(kw.arg)] = kw.value
        nazwa = self._zwin(argumenty.get("name"))
        if nazwa is None:
            return niestala
        ladowane: list[str] = []
        try:
            if dunder:
                poziom_w = argumenty.get("level")
                poziom = 0
                if poziom_w is not None:
                    if not (
                        isinstance(poziom_w, ast.Constant)
                        and isinstance(poziom_w.value, int)
                    ):
                        return niestala
                    poziom = poziom_w.value
                if poziom > 0:
                    glob = argumenty.get("globals")
                    if not (
                        isinstance(glob, ast.Call)
                        and isinstance(glob.func, ast.Name)
                        and glob.func.id == "globals"
                        and not glob.args
                    ):
                        return niestala
                lista_w = argumenty.get("fromlist")
                lista: list[str] = []
                if lista_w is not None and not (
                    isinstance(lista_w, ast.Constant) and lista_w.value is None
                ):
                    if not isinstance(lista_w, ast.List | ast.Tuple):
                        return niestala
                    for element in lista_w.elts:
                        zwiniety = self._zwin(element)
                        if zwiniety is None:
                            return niestala
                        lista.append(zwiniety)
                cel = _bez_src(rozwiaz(poziom, nazwa or None, self.pakiet))
                ladowane = [cel, *(f"{cel}.{f}" for f in lista if f != "*")]
                zwracany = cel if lista else cel.split(".")[0]
            else:
                if nazwa.startswith("."):
                    pakiet = self._zwin(argumenty.get("package"))
                    if pakiet is None:
                        return niestala
                    cel = _bez_src(importlib.util.resolve_name(nazwa, pakiet))
                else:
                    cel = _bez_src(nazwa)
                ladowane = [cel]
                zwracany = cel
        except (ImportError, ValueError) as blad:
            return f"{self.warstwa}: import dynamiczny ponad korzen ({blad}) — network_model.solvers"
        for modul in ladowane:
            if pod_prefiksem(modul, self.rozw.polityka.chronione):
                return f"{self.warstwa} must not import {modul} (dynamiczny import solvera)"
        powod = self.rozw.narusza_modul(zwracany)
        if powod is not None:
            return f"{self.warstwa}: import dynamiczny {zwracany}: {powod}"
        for modul in ladowane[1:]:
            powod = self.rozw.narusza_modul(modul)
            if powod is not None:
                return f"{self.warstwa}: import dynamiczny {modul}: {powod}"
        return None


def _solver_w_analizie(
    tree: ast.Module, path: Path, pakiet: str, backend_root: Path
) -> str | None:
    """Naruszenie reguły solverów fizycznych w pliku warstwy analizy albo `None`.

    Rzuca `ImportPonadKorzen`."""
    return naruszenie_dostepu(
        tree, path, backend_root / "src", POLITYKA_ANALIZY, pakiet
    )


def naruszenie_dostepu(
    tree: ast.Module,
    path: Path,
    src: Path,
    polityka: PolitykaDostepu,
    pakiet: str | None = None,
) -> str | None:
    """Naruszenie polityki dostępu w pliku `path` leżącym pod `src` albo `None`.

    Publiczne wejście reguły dla innych strażników (jedna implementacja). Rzuca
    `ImportPonadKorzen`."""
    modul = nazwa_modulu(path, src)
    if pakiet is None:
        pakiet = pakiet_pliku(path, src)
    return _RegulaDostepu(tree, pakiet, modul, _rozwiazywacz(src, polityka)).sprawdz()


def _scan_file(path: Path, backend_root: Path | None = None) -> tuple[str, str] | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        return (str(path), f"SyntaxError: {exc.msg}")
    layer = _layer_for_path(path)
    if layer is None:
        return None
    korzen = backend_root or REPO_ROOT / "backend"
    pakiet = _pakiet(path, korzen)
    for node in ast.walk(tree):
        try:
            targets = _import_targets(node, pakiet)
        except ImportPonadKorzen as blad:
            return (str(path), f"{layer}: {blad}")
        for imported in targets:
            if _violates(layer, imported):
                rule = f"{layer} must not import {imported}"
                return (str(path), rule)
    if _kod_analizy_produktu(path, korzen):
        try:
            naruszenie = _solver_w_analizie(tree, path, pakiet, korzen)
        except ImportPonadKorzen as blad:
            return (str(path), f"{layer}: {blad}")
        if naruszenie is not None:
            return (str(path), naruszenie)
    return None


def _iter_python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def main() -> int:
    backend_root = REPO_ROOT / "backend"
    if not backend_root.exists():
        print("arch-guard: backend directory not found", file=sys.stderr)
        return 2
    _ROZWIAZYWACZE.clear()  # drzewo mogło się zmienić od poprzedniego biegu
    pliki = _iter_python_files(backend_root)
    for path in pliki:
        violation = _scan_file(path, backend_root)
        if violation:
            file_path, rule = violation
            print(f"ARCH-GUARD VIOLATION: {file_path}", file=sys.stderr)
            print(f"Rule: {rule}", file=sys.stderr)
            return 1
    # Guard konczacy sie sukcesem MUSI powiedziec, ILE obejrzal: pusty log przy
    # RC=0 wyglada identycznie jak bramka, ktora nic nie przeskanowala (defekt H
    # przegladu 2026-08-01: no_direct_fault_params skanowal ZERO plikow i swiecil
    # zielono od dnia powstania). Licznik jest jedynym tanim dowodem biegu.
    print(f"arch-guard: OK, przeskanowano {len(pliki)} plikow backendu")
    return 0


if __name__ == "__main__":
    sys.exit(main())

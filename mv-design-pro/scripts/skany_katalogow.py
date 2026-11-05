"""SKANY KATALOGÓW w drzewie składni — korzeń i filtr każdego `glob`/`rglob`/`iterdir`/`os.walk`.

PO CO (karta SZYBKIE-TESTY-2, 2026-10-28). Bramka scalenia (`bramka_scalenia.py`) wybiera
testy backendu krawędziami importu i dwiema regułami danych. Test, który SKANUJE katalog
repozytorium (`SRC.rglob("*.py")` + `ast.parse`, `(FRONTEND / k).glob("*.json")`, strażnik
uruchamiany na drzewie), zależy od KAŻDEGO pliku pod skanowanym korzeniem, także od pliku,
którego nie importuje i którego nazwy nie zawiera. Pomiar na drzewie 1465336df: 52 pliki
testów backendu skanują katalogi, a zmiana pliku frontu albo dokumentu nie wybierała żadnego
z nich — wybór przestawał być nadzbiorem testów, których wynik zmiana może zmienić.

CO WYZNACZA. Dla każdego wywołania skanu: korzeń (ścieżka względem repozytorium) i filtr
nazwy (ostatni człon wzorca napisowego, np. `*.py`). Wyrażenie korzenia jest wyliczane
statycznie, a wynik to ZBIÓR wariantów (jeden skan dostaje różne korzenie z różnych wywołań
funkcji). Drogi wyliczenia:
* stałe napisowe, `__file__`, `Path(...)`, `.resolve()`, `.parent`, `.parents[n]`, `/`,
  `.joinpath`, `str(...)`, `os.fspath`, `os.path.join/dirname/abspath/realpath/normpath`;
* nazwa wiązana JEDEN raz w zasięgu (funkcja, funkcje obejmujące, moduł) przypisaniem —
  nazwa wiązana więcej niż raz albo pętlą, `with`, wyrażeniem przypisania, `except`,
  importem lokalnym jest nieustalona (jej wartość zależy od drogi wykonania);
* stała modułu importowanego (`from m import KATALOG`, `m.KATALOG`, moduł załadowany po
  ścieżce `module_from_spec(spec_from_file_location(_, SCIEZKA))`) i jej reeksport;
* wywołanie funkcji modułu (własnej, zagnieżdżonej albo importowanej) o JEDNYM `return`;
* PARAMETR funkcji: suma wartości domyślnej i argumentów WSZYSTKICH wywołań funkcji
  w drzewach Pythona bramki (ten sam moduł i każdy moduł, który ją importuje). Parametr jest
  nieustalony, gdy funkcja jest metodą, gdy jej nazwa pada poza pozycją wywołania (funkcja
  przekazana jako wartość — wywołań nie widać), gdy wywołanie rozpakowuje `*`/`**`, gdy
  parametr jest `*args`/`**kwargs` albo gdy nie ma ani domyślnej, ani wywołania (test
  i fikstura pytest dostają argumenty od pytest).
Człon nieznany po prawej stronie `/` (zmienna pętli, f-napis) daje wariant „pod znaną lewą
stroną”: skan leży gdzieś pod nią — nadzbiór, nie zgadywanie.

TRZY WYNIKI, KAŻDY JAWNY:
* korzeń ustalony — skan zależy od plików pod korzeniem pasujących do filtra nazwy;
* poza repozytorium (`tmp_path`, `tempfile`, ścieżka absolutna spoza drzewa) — skan nie
  czyta treści repozytorium;
* NIEUSTALONY (wynik nieznanego wywołania, katalog magazynu z otoczenia) — skan może
  czytać cokolwiek; bramka traktuje go jak zależny od KAŻDEJ zmiany.

Testy: `scripts/test_skany_katalogow.py` (iloczyn: droga wyliczenia korzenia × rodzaj skanu
× wynik) i `scripts/test_bramka_scalenia.py` (reguła skanu w wyborze testów, prawdziwe drzewo).
"""

from __future__ import annotations

import ast
import dataclasses
import fnmatch
import itertools
import os
import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

#: Metody `Path` czytające zawartość katalogu: wywołanie `X.metoda(wzorzec?)`.
METODY_SKANU = frozenset({"rglob", "glob", "iterdir"})
#: Funkcje modułów czytające zawartość katalogu: (moduł, funkcja) → indeks argumentu korzenia
#: (None = argument jest wzorcem ścieżki, `glob.glob`).
FUNKCJE_SKANU: dict[tuple[str, str], int | None] = {
    ("os", "walk"): 0,
    ("os", "scandir"): 0,
    ("os", "listdir"): 0,
    ("glob", "glob"): None,
    ("glob", "iglob"): None,
}
#: Szybki filtr tekstu: plik bez żadnego z tych napisów nie zawiera skanu (przypięte testem
#: zgodności z `METODY_SKANU` i `FUNKCJE_SKANU`).
ZNAMIONA_SKANU = re.compile(r"\.(?:rglob|glob|iterdir)\(|\b(?:walk|scandir|listdir|iglob)\(")
#: Nazwy fikstur pytest dające katalog tymczasowy (poza repozytorium).
NAZWY_TYMCZASOWE = frozenset({"tmp_path", "tmpdir", "tmp_path_factory", "tmpdir_factory"})
#: Wywołania dające katalog tymczasowy (poza repozytorium).
FUNKCJE_TYMCZASOWE = frozenset({"mkdtemp", "gettempdir", "TemporaryDirectory", "mktemp"})
_GLEBOKOSC = 40
#: Więcej wariantów jednego wyrażenia niż ten próg → wartość nieustalona (nadzbiór: skan
#: nieustalony zależy od każdej zmiany), zamiast wykładniczego iloczynu wariantów.
_MAKS_WARIANTOW = 64


@dataclass(frozen=True)
class Skan:
    """Jeden wariant korzenia jednego wywołania skanu katalogu."""

    linia: int
    #: korzeń względem repozytorium (`""` = całe repozytorium); None = nieustalony
    korzen: str | None
    #: filtr nazwy pliku (fnmatch) albo None (każda nazwa)
    wzorzec: str | None = None
    #: True = skan katalogu spoza repozytorium (nie czyta treści repozytorium)
    poza: bool = False

    def obejmuje(self, zmieniony: str) -> bool:
        """Czy zmiana pliku `zmieniony` (ścieżka względem repozytorium) może zmienić wynik
        skanu."""
        if self.poza:
            return False
        if self.korzen is None:
            return True
        if self.korzen and not (
            zmieniony == self.korzen or zmieniony.startswith(self.korzen + "/")
        ):
            return False
        return self.wzorzec is None or fnmatch.fnmatchcase(Path(zmieniony).name, self.wzorzec)

    def opis(self) -> str:
        if self.poza:
            return "poza repozytorium"
        if self.korzen is None:
            return "korzeń nieustalony"
        return f"{self.korzen or '.'}/**/{self.wzorzec or '*'}"


@dataclass(frozen=True)
class _Pod:
    """Ścieżka nieznana, ale leżąca pod `sciezka` (albo nią będąca)."""

    sciezka: Path


@dataclass(frozen=True)
class _Poza:
    """Ścieżka spoza repozytorium (katalog tymczasowy)."""


@dataclass(frozen=True)
class _ModulPoSciezce:
    """Moduł załadowany z pliku (`module_from_spec(spec_from_file_location(_, plik))`)."""

    plik: Path


@dataclass(frozen=True)
class _Spec:
    plik: Path


_POZA = _Poza()
#: Wartość jednego wariantu; None = nieustalona.
_Jedna = Path | _Pod | _Poza | str | _ModulPoSciezce | _Spec | None
_Warianty = tuple[_Jedna, ...]
_NIEUSTALONA: _Warianty = (None,)
_Zakres = ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda
_Funkcja = ast.FunctionDef | ast.AsyncFunctionDef


@dataclass(frozen=True)
class _Wiazania:
    #: nazwa → jedyne przypisane wyrażenie
    wartosci: Mapping[str, ast.expr]
    #: każda nazwa wiązana w zasięgu (także wielokrotnie, pętlą, `with`, importem, parametrem)
    wiazane: frozenset[str]
    #: nazwa → liczba wiązań w zasięgu
    liczby: Mapping[str, int]
    #: nazwa wiązana JEDEN raz pętlą `for` → (wyrażenie iterowane, indeksy rozpakowania)
    elementy: Mapping[str, tuple[ast.expr, tuple[int, ...]]] = dataclasses.field(
        default_factory=dict
    )
    #: nazwa wiązana JEDEN raz `with X as nazwa` → X (ustalone tylko dla katalogu tymczasowego)
    wejscia: Mapping[str, ast.expr] = dataclasses.field(default_factory=dict)


def _wiazania(cialo: Iterable[ast.AST], parametry: Iterable[str] = ()) -> _Wiazania:
    """Wiązania nazw w ciele zasięgu (bez wnętrza zagnieżdżonych funkcji i klas)."""
    wartosci: dict[str, ast.expr] = {}
    elementy: dict[str, tuple[ast.expr, tuple[int, ...]]] = {}
    wejscia: dict[str, ast.expr] = {}
    liczby: dict[str, int] = dict.fromkeys(parametry, 1)

    def zwieksz(nazwa: str) -> None:
        liczby[nazwa] = liczby.get(nazwa, 0) + 1

    stos: list[ast.AST] = list(cialo)
    while stos:
        wezel = stos.pop()
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            zwieksz(wezel.name)
            continue
        if isinstance(wezel, ast.Lambda):
            continue
        cele: list[ast.expr] = []
        wartosc: ast.expr | None = None
        if isinstance(wezel, ast.Assign):
            cele, wartosc = list(wezel.targets), wezel.value
        elif isinstance(wezel, ast.AnnAssign):
            cele, wartosc = [wezel.target], wezel.value
        elif isinstance(wezel, ast.For | ast.AsyncFor | ast.comprehension):
            cele = [wezel.target]
            for nazwa, indeksy in _rozpakowanie(wezel.target, ()):
                elementy[nazwa] = (wezel.iter, indeksy)
        elif isinstance(wezel, ast.AugAssign):
            cele = [wezel.target]
        elif isinstance(wezel, ast.With | ast.AsyncWith):
            cele = [e.optional_vars for e in wezel.items if e.optional_vars is not None]
            for e in wezel.items:
                if isinstance(e.optional_vars, ast.Name):
                    wejscia[e.optional_vars.id] = e.context_expr
        elif isinstance(wezel, ast.NamedExpr):
            cele = [wezel.target]
        elif isinstance(wezel, ast.ExceptHandler) and wezel.name:
            zwieksz(wezel.name)
        elif isinstance(wezel, ast.Import | ast.ImportFrom):
            for alias in wezel.names:
                zwieksz(alias.asname or alias.name.split(".")[0])
        elif isinstance(wezel, ast.Global | ast.Nonlocal):
            for nazwa in wezel.names:
                liczby[nazwa] = 2  # wartość zależy od innego zasięgu w czasie wykonania
        for cel in cele:
            for nazwa in ast.walk(cel):
                if isinstance(nazwa, ast.Name):
                    zwieksz(nazwa.id)
                    if wartosc is not None and cel is nazwa:
                        wartosci[nazwa.id] = wartosc
        stos.extend(ast.iter_child_nodes(wezel))
    return _Wiazania(
        wartosci={n: w for n, w in wartosci.items() if liczby[n] == 1},
        wiazane=frozenset(liczby),
        liczby=liczby,
        elementy={n: e for n, e in elementy.items() if liczby[n] == 1},
        wejscia={n: e for n, e in wejscia.items() if liczby[n] == 1},
    )


def _rozpakowanie(cel: ast.expr, indeksy: tuple[int, ...]) -> list[tuple[str, tuple[int, ...]]]:
    """Nazwy celu pętli z indeksami rozpakowania (`for a, (b, c) in …` → a:(0,), b:(1, 0)…)."""
    if isinstance(cel, ast.Name):
        return [(cel.id, indeksy)]
    if isinstance(cel, ast.Tuple | ast.List) and not any(
        isinstance(e, ast.Starred) for e in cel.elts
    ):
        return [w for i, e in enumerate(cel.elts) for w in _rozpakowanie(e, (*indeksy, i))]
    return []


def _parametry(zakres: _Zakres) -> list[ast.arg]:
    a = zakres.args
    return [
        *a.posonlyargs,
        *a.args,
        *([a.vararg] if a.vararg else []),
        *a.kwonlyargs,
        *([a.kwarg] if a.kwarg else []),
    ]


class _Plik:
    """Indeks jednego pliku: zasięgi, importy, funkcje, wywołania."""

    def __init__(self, plik: Path, drzewo: ast.Module, nazwa: str, pakiet: str):
        self.plik = plik
        self.drzewo = drzewo
        self.nazwa = nazwa
        self.modul = _wiazania(drzewo.body)
        self._rodzic: dict[ast.AST, ast.AST] | None = None
        self._wiazania_zakresu: dict[ast.AST, _Wiazania] = {}
        #: nazwa lokalna → (moduł, atrybut albo None) — importy z każdego miejsca pliku
        self.importy: dict[str, tuple[str, str | None]] = {}
        #: nazwa → definicje funkcji o tej nazwie (każdy poziom zagnieżdżenia)
        self.funkcje: dict[str, list[_Funkcja]] = {}
        #: nazwa → wywołania `nazwa(...)` i `x.nazwa(...)`
        self.wywolania: dict[str, list[ast.Call]] = {}
        #: węzły `Name`/`Attribute` odczytywane poza pozycją wywoływanej funkcji
        self.odczyty: dict[str, list[ast.expr]] = {}
        funkcje_wywolan: set[int] = set()
        odczytywane: list[ast.expr] = []
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.Name | ast.Attribute):
                if isinstance(wezel.ctx, ast.Load):
                    odczytywane.append(wezel)
            elif isinstance(wezel, ast.Call):
                funkcje_wywolan.add(id(wezel.func))
                if isinstance(wezel.func, ast.Name):
                    self.wywolania.setdefault(wezel.func.id, []).append(wezel)
                elif isinstance(wezel.func, ast.Attribute):
                    self.wywolania.setdefault(wezel.func.attr, []).append(wezel)
            elif isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
                self.funkcje.setdefault(wezel.name, []).append(wezel)
            elif isinstance(wezel, ast.Import):
                for alias in wezel.names:
                    if alias.asname:
                        self.importy[alias.asname] = (alias.name, None)
                    else:
                        glowa = alias.name.split(".")[0]
                        self.importy.setdefault(glowa, (glowa, None))
            elif isinstance(wezel, ast.ImportFrom):
                baza = wezel.module or ""
                if wezel.level:
                    czesci = pakiet.split(".") if pakiet else []
                    czesci = czesci[: len(czesci) - (wezel.level - 1)]
                    baza = ".".join([*czesci, *([wezel.module] if wezel.module else [])])
                for alias in wezel.names:
                    if alias.name != "*":
                        self.importy[alias.asname or alias.name] = (baza, alias.name)
        for wezel in odczytywane:
            if id(wezel) not in funkcje_wywolan:
                klucz = wezel.id if isinstance(wezel, ast.Name) else wezel.attr
                self.odczyty.setdefault(klucz, []).append(wezel)

    @property
    def rodzic(self) -> dict[ast.AST, ast.AST]:
        """Węzeł → rodzic (budowane przy pierwszym pytaniu o zasięg)."""
        if self._rodzic is None:
            self._rodzic = {
                dziecko: wezel
                for wezel in ast.walk(self.drzewo)
                for dziecko in ast.iter_child_nodes(wezel)
            }
        return self._rodzic

    def zakresy(self, wezel: ast.AST) -> list[_Zakres]:
        """Funkcje obejmujące węzeł, najbliższa pierwsza."""
        wynik: list[_Zakres] = []
        biezacy = self.rodzic.get(wezel)
        while biezacy is not None:
            if isinstance(biezacy, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda):
                wynik.append(biezacy)
            biezacy = self.rodzic.get(biezacy)
        return wynik

    def wiazania(self, zakres: _Zakres) -> _Wiazania:
        if zakres not in self._wiazania_zakresu:
            cialo = zakres.body if isinstance(zakres.body, list) else [zakres.body]
            self._wiazania_zakresu[zakres] = _wiazania(cialo, (a.arg for a in _parametry(zakres)))
        return self._wiazania_zakresu[zakres]

    def na_poziomie_modulu(self, funkcja: ast.AST) -> bool:
        return any(w is funkcja for w in self.drzewo.body)


class Wyliczacz:
    """Wyliczanie statyczne korzeni skanów (patrz nagłówek modułu).

    `moduly`: nazwa modułu → plik (każda nazwa, pod którą plik jest importowany);
    `zrodla`: plik → tekst (wszystkie pliki drzew Pythona; tu szukane są wywołania funkcji);
    `pakiet_pliku`: plik → `__package__` (importy względne);
    `drzewa`: plik → sparsowane drzewo (opcjonalnie, żeby nie parsować drugi raz)."""

    def __init__(
        self,
        repo: Path,
        moduly: Mapping[str, Path],
        zrodla: Mapping[Path, str],
        pakiet_pliku: Callable[[Path], str],
        drzewa: Mapping[Path, ast.Module] | None = None,
    ):
        self.repo = repo
        self.moduly = moduly
        self.zrodla = zrodla
        self.pakiet_pliku = pakiet_pliku
        self._drzewa = dict(drzewa or {})
        self._pliki: dict[Path, _Plik | None] = {}
        self._nazwa_pliku: dict[Path, str] = {}
        for nazwa, plik in sorted(moduly.items()):
            self._nazwa_pliku.setdefault(plik, nazwa)
        self._w_toku: set[tuple[int, str]] = set()
        self._wywolania: dict[int, list[tuple[ast.Call, _Plik]] | None] = {}
        #: pamięć wyników: wartość wyrażenia zależy wyłącznie od jego miejsca w drzewie
        self._pamiec: dict[int, _Warianty] = {}
        self._pamiec_parametrow: dict[tuple[int, str], _Warianty] = {}
        self._indeks_slow: dict[str, list[Path]] | None = None

    # --- indeks plików ------------------------------------------------------------------
    def plik(self, sciezka: Path) -> _Plik | None:
        if sciezka not in self._pliki:
            drzewo = self._drzewa.get(sciezka)
            if drzewo is None:
                tekst = self.zrodla.get(sciezka)
                if tekst is None and sciezka.is_file():
                    tekst = sciezka.read_text(encoding="utf-8", errors="replace")
                try:
                    drzewo = ast.parse(tekst) if tekst is not None else None
                except SyntaxError:
                    drzewo = None
            self._pliki[sciezka] = (
                None
                if drzewo is None
                else _Plik(
                    sciezka, drzewo, self._nazwa_pliku.get(sciezka, ""), self._pakiet(sciezka)
                )
            )
        return self._pliki[sciezka]

    def _pakiet(self, sciezka: Path) -> str:
        try:
            return self.pakiet_pliku(sciezka)
        except ValueError:
            return ""

    def _plik_modulu(self, nazwa: str) -> _Plik | None:
        sciezka = self.moduly.get(nazwa)
        return self.plik(sciezka) if sciezka is not None else None

    # --- wyliczanie -----------------------------------------------------------------------
    def wylicz(self, wyr: ast.expr, plik: _Plik, glebokosc: int = 0) -> _Warianty:
        """Warianty wartości wyrażenia w miejscu jego wystąpienia w pliku."""
        if glebokosc > _GLEBOKOSC:
            return _NIEUSTALONA
        klucz = id(wyr)
        if klucz not in self._pamiec:
            wynik = self._wylicz(wyr, plik, glebokosc)
            if len(wynik) > _MAKS_WARIANTOW:
                wynik = _NIEUSTALONA
            # Wynik obcięty cyklem albo głębokością zawiera NIEUSTALONĄ — jest nadzbiorem
            # (skan nieustalony zależy od każdej zmiany), więc wolno go zapamiętać.
            self._pamiec[klucz] = wynik
        return self._pamiec[klucz]

    def _wylicz(self, wyr: ast.expr, plik: _Plik, glebokosc: int) -> _Warianty:
        g = glebokosc + 1
        if isinstance(wyr, ast.Constant):
            return (wyr.value,) if isinstance(wyr.value, str) else _NIEUSTALONA
        if isinstance(wyr, ast.Name):
            return self._nazwa(wyr.id, wyr, plik, g)
        if isinstance(wyr, ast.Attribute):
            if wyr.attr == "parent":
                return _mapuj(lambda w: _przodek(w, 0), self.wylicz(wyr.value, plik, g))
            cel = self._modul_wyrazenia(wyr.value, plik, g)
            if wyr.attr == "__file__":
                return _NIEUSTALONA if cel is None else (cel.plik,)
            return _NIEUSTALONA if cel is None else self._nazwa_modulu(cel, wyr.attr, g)
        if isinstance(wyr, ast.Subscript):
            if (
                isinstance(wyr.value, ast.Attribute)
                and wyr.value.attr == "parents"
                and isinstance(wyr.slice, ast.Constant)
                and isinstance(wyr.slice.value, int)
            ):
                n = wyr.slice.value
                return _mapuj(lambda w: _przodek(w, n), self.wylicz(wyr.value.value, plik, g))
            return _NIEUSTALONA
        if isinstance(wyr, ast.BinOp) and isinstance(wyr.op, ast.Div):
            return self._dolacz_leniwie(self.wylicz(wyr.left, plik, g), [wyr.right], plik, g)
        if isinstance(wyr, ast.Call):
            return self._wywolanie(wyr, plik, g)
        if isinstance(wyr, ast.BoolOp) and isinstance(wyr.op, ast.Or):
            # `a or b` — wartość jednego z członów (każdy jest wariantem).
            # Stała fałszywa (`None`, `""`) przed ostatnim członem nigdy nie jest wynikiem.
            czlony = [
                w
                for i, w in enumerate(wyr.values)
                if i == len(wyr.values) - 1 or not (isinstance(w, ast.Constant) and not w.value)
            ]
            return _suma(*(self.wylicz(w, plik, g) for w in czlony))
        if isinstance(wyr, ast.IfExp):
            return _suma(self.wylicz(wyr.body, plik, g), self.wylicz(wyr.orelse, plik, g))
        if isinstance(wyr, ast.JoinedStr):
            czesci: list[_Warianty] = []
            for czesc in wyr.values:
                if isinstance(czesc, ast.FormattedValue):
                    if czesc.format_spec is not None:
                        return _NIEUSTALONA
                    czesci.append(self.wylicz(czesc.value, plik, g))
                else:
                    czesci.append(self.wylicz(czesc, plik, g))
            return _iloczyn(_zlacz_napisy, *czesci)
        return _NIEUSTALONA

    def _nazwa(self, nazwa: str, miejsce: ast.AST, plik: _Plik, g: int) -> _Warianty:
        if nazwa == "__file__":
            return (plik.plik,)
        for zakres in plik.zakresy(miejsce):
            wiazania = plik.wiazania(zakres)
            if nazwa not in wiazania.wiazane:
                continue
            if nazwa in wiazania.wartosci:
                return self.wylicz(wiazania.wartosci[nazwa], plik, g)
            if nazwa in wiazania.elementy:
                return self._element(*wiazania.elementy[nazwa], plik, g)
            if nazwa in wiazania.wejscia:
                return self._wejscie(wiazania.wejscia[nazwa], plik, g)
            if any(a.arg == nazwa for a in _parametry(zakres)):
                return self._parametr(zakres, nazwa, plik, g)
            return _NIEUSTALONA
        if nazwa in NAZWY_TYMCZASOWE:
            return (_POZA,)
        return self._nazwa_modulu(plik, nazwa, g)

    def _wejscie(self, kontekst: ast.expr, plik: _Plik, g: int) -> _Warianty:
        """`with X as k`: `k` to wynik `X.__enter__()` — znany tylko dla katalogu
        tymczasowego (`TemporaryDirectory()` daje ścieżkę spoza repozytorium)."""
        warianty = self.wylicz(kontekst, plik, g)
        return (_POZA,) if all(isinstance(w, _Poza) for w in warianty) else _NIEUSTALONA

    def _element(
        self, iterowane: ast.expr, indeksy: tuple[int, ...], plik: _Plik, g: int
    ) -> _Warianty:
        """Suma wartości zmiennej pętli po literale (`for k in (A, B)`, `for k in LISTA`
        z `LISTA = [A, B]`); iterowanie po czymkolwiek innym — nieustalona."""
        elementy = self._literal(iterowane, plik, g)
        if elementy is None:
            return _NIEUSTALONA
        warianty: list[_Jedna] = []
        for element in elementy:
            for indeks in indeksy:
                if not isinstance(element, ast.Tuple | ast.List) or indeks >= len(element.elts):
                    return _NIEUSTALONA
                element = element.elts[indeks]
            warianty.extend(self.wylicz(element, plik, g))
        return tuple(dict.fromkeys(warianty)) if warianty else _NIEUSTALONA

    def _literal(self, wyr: ast.expr, plik: _Plik, g: int) -> list[ast.expr] | None:
        """Elementy literału krotki/listy/zbioru (także przez nazwę przypisaną raz)."""
        if g > _GLEBOKOSC:
            return None
        if isinstance(wyr, ast.Tuple | ast.List | ast.Set):
            if any(isinstance(e, ast.Starred) for e in wyr.elts):
                return None
            return list(wyr.elts)
        if isinstance(wyr, ast.Call) and isinstance(wyr.func, ast.Name) and len(wyr.args) == 1:
            if wyr.func.id in ("sorted", "tuple", "list", "set", "reversed") and not wyr.keywords:
                return self._literal(wyr.args[0], plik, g + 1)
        if isinstance(wyr, ast.Name):
            for zakres in plik.zakresy(wyr):
                wiazania = plik.wiazania(zakres)
                if wyr.id in wiazania.wiazane:
                    if wyr.id in wiazania.wartosci:
                        return self._literal(wiazania.wartosci[wyr.id], plik, g + 1)
                    return None
            if wyr.id in plik.modul.wartosci:
                return self._literal(plik.modul.wartosci[wyr.id], plik, g + 1)
        return None

    def _nazwa_modulu(self, plik: _Plik, nazwa: str, g: int) -> _Warianty:
        """Wartość nazwy z zasięgu modułu `plik` (jedyne przypisanie albo import)."""
        if g > _GLEBOKOSC:
            return _NIEUSTALONA
        if nazwa in plik.modul.wartosci:
            return self.wylicz(plik.modul.wartosci[nazwa], plik, g)
        if nazwa in plik.modul.elementy:
            return self._element(*plik.modul.elementy[nazwa], plik, g)
        if nazwa in plik.importy and plik.modul.wiazane.issuperset({nazwa}):
            baza, atrybut = plik.importy[nazwa]
            cel = self._plik_modulu(baza) if atrybut is not None else None
            if cel is not None and atrybut is not None:
                return self._nazwa_modulu(cel, atrybut, g + 1)
        return _NIEUSTALONA

    def _modul_wyrazenia(self, wyr: ast.expr, plik: _Plik, g: int) -> _Plik | None:
        """Moduł, który oznacza wyrażenie (`m`, `a.b` po `import a.b`, moduł po ścieżce)."""
        lancuch: list[str] = []
        biezacy: ast.expr = wyr
        while isinstance(biezacy, ast.Attribute):
            lancuch.insert(0, biezacy.attr)
            biezacy = biezacy.value
        if not isinstance(biezacy, ast.Name):
            return None
        if biezacy.id in plik.importy:
            baza, atrybut = plik.importy[biezacy.id]
            return self._plik_modulu(".".join([baza, *([atrybut] if atrybut else []), *lancuch]))
        if lancuch:
            return None
        warianty = self._nazwa(biezacy.id, biezacy, plik, g)
        if len(warianty) == 1 and isinstance(warianty[0], _ModulPoSciezce):
            return self.plik(warianty[0].plik)
        return None

    def _wywolanie(self, wyr: ast.Call, plik: _Plik, g: int) -> _Warianty:
        funkcja = wyr.func
        nazwa = (
            funkcja.id
            if isinstance(funkcja, ast.Name)
            else funkcja.attr if isinstance(funkcja, ast.Attribute) else None
        )
        if nazwa in FUNKCJE_TYMCZASOWE:
            return (_POZA,)
        if any(isinstance(a, ast.Starred) for a in wyr.args):
            return _NIEUSTALONA

        def arg(i: int) -> _Warianty:
            return self.wylicz(wyr.args[i], plik, g)

        n = len(wyr.args)
        if nazwa in ("Path", "PurePath", "PosixPath") and not wyr.keywords:
            if not n:
                return _NIEUSTALONA
            return self._dolacz_leniwie(_mapuj(_sciezka, arg(0)), wyr.args[1:], plik, g)
        if nazwa in ("str", "fspath") and n == 1 and not wyr.keywords:
            return arg(0)
        if nazwa == "getfile" and n == 1:
            # `inspect.getfile(modul)` — plik modułu importowanego.
            cel = self._modul_wyrazenia(wyr.args[0], plik, g)
            return _NIEUSTALONA if cel is None else (cel.plik,)
        if nazwa == "spec_from_file_location" and n >= 2:
            return _mapuj(
                lambda w: _Spec(w) if isinstance(w, Path) else None, _mapuj(_sciezka, arg(1))
            )
        if nazwa == "module_from_spec" and n == 1:
            return _mapuj(
                lambda w: _ModulPoSciezce(w.plik) if isinstance(w, _Spec) else None, arg(0)
            )
        if isinstance(funkcja, ast.Attribute):
            if funkcja.attr in ("resolve", "absolute", "expanduser") and not n:
                return self.wylicz(funkcja.value, plik, g)
            if funkcja.attr == "joinpath":
                return self._dolacz_leniwie(self.wylicz(funkcja.value, plik, g), wyr.args, plik, g)
            podstawa = funkcja.value
            if (
                isinstance(podstawa, ast.Attribute)
                and podstawa.attr == "path"
                and isinstance(podstawa.value, ast.Name)
                and podstawa.value.id == "os"
            ):
                if not n:
                    return _NIEUSTALONA
                if funkcja.attr == "join":
                    return self._dolacz_leniwie(_mapuj(_sciezka, arg(0)), wyr.args[1:], plik, g)
                if funkcja.attr == "dirname":
                    return _mapuj(lambda w: _przodek(_sciezka(w), 0), arg(0))
                if funkcja.attr in ("abspath", "realpath", "normpath"):
                    return _mapuj(_sciezka, arg(0))
                return _NIEUSTALONA
        # Wywołanie funkcji o jednym `return` — wartość wyliczana w jej ciele (parametry
        # z sumy wszystkich wywołań, `_parametr`).
        definicja, plik_definicji = self._definicja_wywolanej(wyr, plik, g)
        if definicja is None or plik_definicji is None:
            return _NIEUSTALONA
        zwroty = [
            w
            for w in ast.walk(definicja)
            if isinstance(w, ast.Return) and plik_definicji.zakresy(w)[:1] == [definicja]
        ]
        if len(zwroty) != 1 or zwroty[0].value is None:
            return _NIEUSTALONA
        return self.wylicz(zwroty[0].value, plik_definicji, g)

    def _dolacz_leniwie(
        self, lewa: _Warianty, prawe: list[ast.expr], plik: _Plik, g: int
    ) -> _Warianty:
        """`lewa / p1 / …` z członami prawymi wyliczanymi dopiero, gdy lewa strona jest
        ścieżką — nieustalona lewa daje nieustalony wynik bez względu na człony."""
        if not any(isinstance(w, Path | _Pod) for w in lewa):
            return _mapuj(lambda w: _dolacz(w), lewa)
        wynik = lewa
        for czlon in prawe:
            if not any(isinstance(w, Path) for w in wynik):
                break  # `_Pod`, `_Poza` i nieustalona nie zależą od dalszych członów
            wynik = _iloczyn(_dolacz, wynik, self.wylicz(czlon, plik, g))
        return wynik

    def _definicja_wywolanej(
        self, wyr: ast.Call, plik: _Plik, g: int
    ) -> tuple[_Funkcja | None, _Plik | None]:
        funkcja = wyr.func
        if isinstance(funkcja, ast.Name):
            for zakres in plik.zakresy(wyr):
                if funkcja.id in plik.wiazania(zakres).wiazane:
                    lokalne = [
                        d for d in plik.funkcje.get(funkcja.id, []) if plik.rodzic.get(d) is zakres
                    ]
                    if len(lokalne) == 1 and funkcja.id not in plik.wiazania(zakres).wartosci:
                        return lokalne[0], plik
                    return None, None
            return self._funkcja_modulu(plik, funkcja.id, g)
        if isinstance(funkcja, ast.Attribute):
            cel = self._modul_wyrazenia(funkcja.value, plik, g)
            if cel is not None:
                return self._funkcja_modulu(cel, funkcja.attr, g)
        return None, None

    def _funkcja_modulu(
        self, plik: _Plik, nazwa: str, g: int
    ) -> tuple[_Funkcja | None, _Plik | None]:
        if g > _GLEBOKOSC:
            return None, None
        definicje = [d for d in plik.funkcje.get(nazwa, []) if plik.na_poziomie_modulu(d)]
        if definicje:
            liczba_wiazan = sum(
                1
                for w in plik.drzewo.body
                if isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef) and w.name == nazwa
            )
            if (
                len(definicje) == 1
                and liczba_wiazan == 1
                and plik.modul.liczby.get(nazwa) == 1
                and nazwa not in plik.importy
            ):
                return definicje[0], plik
            return None, None
        if nazwa in plik.importy:
            baza, atrybut = plik.importy[nazwa]
            cel = self._plik_modulu(baza) if atrybut is not None else None
            if cel is not None and atrybut is not None:
                return self._funkcja_modulu(cel, atrybut, g + 1)
        return None, None

    def _parametr(self, zakres: _Zakres, nazwa: str, plik: _Plik, g: int) -> _Warianty:
        """Suma wartości parametru: domyślna ∪ argumenty wszystkich wywołań funkcji."""
        if nazwa in NAZWY_TYMCZASOWE:
            return (_POZA,)
        if not isinstance(zakres, ast.FunctionDef | ast.AsyncFunctionDef):
            return _NIEUSTALONA
        klucz = (id(zakres), nazwa)
        if klucz in self._pamiec_parametrow:
            return self._pamiec_parametrow[klucz]
        if klucz in self._w_toku or g > _GLEBOKOSC:
            return _NIEUSTALONA
        self._w_toku.add(klucz)
        try:
            wynik = self._wartosci_parametru(zakres, nazwa, plik, g)
        finally:
            self._w_toku.discard(klucz)
        if len(wynik) > _MAKS_WARIANTOW:
            wynik = _NIEUSTALONA
        self._pamiec_parametrow[klucz] = wynik
        return wynik

    def _wartosci_parametru(self, funkcja: _Funkcja, nazwa: str, plik: _Plik, g: int) -> _Warianty:
        if isinstance(plik.rodzic.get(funkcja), ast.ClassDef):
            return _NIEUSTALONA  # metoda: wywołania `obiekt.metoda(...)` nie są rozstrzygalne
        argumenty = funkcja.args
        if (argumenty.vararg is not None and argumenty.vararg.arg == nazwa) or (
            argumenty.kwarg is not None and argumenty.kwarg.arg == nazwa
        ):
            return _NIEUSTALONA
        pozycyjne = [a.arg for a in [*argumenty.posonlyargs, *argumenty.args]]
        przesuniecie = len(pozycyjne) - len(argumenty.defaults)
        domyslna: ast.expr | None = None
        indeks: int | None = None
        if nazwa in pozycyjne:
            indeks = pozycyjne.index(nazwa)
            if indeks >= przesuniecie:
                domyslna = argumenty.defaults[indeks - przesuniecie]
        for a, d in zip(argumenty.kwonlyargs, argumenty.kw_defaults, strict=True):
            if a.arg == nazwa:
                domyslna = d
        warianty: list[_Jedna] = []
        if domyslna is not None:
            warianty.extend(self.wylicz(domyslna, plik, g))
        wywolania = self._wywolania_funkcji(funkcja, plik, g)
        if wywolania is None:
            return _NIEUSTALONA
        for wywolanie, plik_wywolania in wywolania:
            if any(isinstance(a, ast.Starred) for a in wywolanie.args) or any(
                k.arg is None for k in wywolanie.keywords
            ):
                return _NIEUSTALONA
            argument: ast.expr | None = None
            if indeks is not None and indeks < len(wywolanie.args):
                argument = wywolanie.args[indeks]
            for k in wywolanie.keywords:
                if k.arg == nazwa:
                    argument = k.value
            if argument is not None:
                warianty.extend(self.wylicz(argument, plik_wywolania, g))
        return tuple(dict.fromkeys(warianty)) if warianty else _NIEUSTALONA

    def _wywolania_funkcji(
        self, funkcja: _Funkcja, plik: _Plik, g: int
    ) -> list[tuple[ast.Call, _Plik]] | None:
        """Każde wywołanie funkcji w drzewach; None, gdy funkcja jest odczytywana jako wartość
        (przekazana dalej — wywołań nie widać)."""
        if id(funkcja) not in self._wywolania:
            self._wywolania[id(funkcja)] = self._szukaj_wywolan(funkcja, plik, g)
        return self._wywolania[id(funkcja)]

    def _pliki_ze_slowem(self, slowo: str) -> list[Path]:
        """Pliki, których tekst zawiera identyfikator `slowo` (indeks budowany raz)."""
        if self._indeks_slow is None:
            indeks: dict[str, list[Path]] = {}
            for sciezka, tekst in sorted(self.zrodla.items()):
                for s in set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", tekst)):
                    indeks.setdefault(s, []).append(sciezka)
            self._indeks_slow = indeks
        return self._indeks_slow.get(slowo, [])

    def _szukaj_wywolan(
        self, funkcja: _Funkcja, plik: _Plik, g: int
    ) -> list[tuple[ast.Call, _Plik]] | None:
        nazwa = funkcja.name
        modulowa = plik.na_poziomie_modulu(funkcja)
        # Odczyt nazwy poza wywołaniem (w tym pliku) — funkcja przekazana jako wartość.
        if nazwa in plik.odczyty:
            return None
        wynik: list[tuple[ast.Call, _Plik]] = []
        for wywolanie in plik.wywolania.get(nazwa, []):
            if isinstance(wywolanie.func, ast.Name):
                wynik.append((wywolanie, plik))
            elif (
                modulowa
                and isinstance(wywolanie.func, ast.Attribute)
                and self._modul_wyrazenia(wywolanie.func.value, plik, g) is plik
            ):
                wynik.append((wywolanie, plik))
        if not modulowa:
            return wynik
        for sciezka in self._pliki_ze_slowem(nazwa):
            if sciezka == plik.plik:
                continue
            inny = self.plik(sciezka)
            if inny is None:
                continue
            aliasy = {
                lokalna
                for lokalna, (baza, atrybut) in inny.importy.items()
                if atrybut is not None
                and (cel := self._plik_modulu(baza)) is not None
                and self._funkcja_modulu(cel, atrybut, g + 1)[0] is funkcja
            }
            if aliasy & set(inny.odczyty):
                return None
            for lokalna in sorted(aliasy):
                for wywolanie in inny.wywolania.get(lokalna, []):
                    if isinstance(wywolanie.func, ast.Name):
                        wynik.append((wywolanie, inny))
            for wywolanie in inny.wywolania.get(nazwa, []):
                if isinstance(wywolanie.func, ast.Attribute) and (
                    self._modul_wyrazenia(wywolanie.func.value, inny, g) is plik
                ):
                    wynik.append((wywolanie, inny))
            for odczyt in inny.odczyty.get(nazwa, []):
                if isinstance(odczyt, ast.Attribute) and (
                    self._modul_wyrazenia(odczyt.value, inny, g) is plik
                ):
                    return None  # `m.f` przekazane jako wartość
        return wynik

    # --- skany ----------------------------------------------------------------------------
    def skany(self, sciezka: Path) -> list[Skan]:
        """Każdy wariant korzenia każdego wywołania skanu katalogu w pliku (kolejność linii)."""
        plik = self.plik(sciezka)
        if plik is None:
            return []
        wynik: set[Skan] = set()
        for wezel in ast.walk(plik.drzewo):
            if not isinstance(wezel, ast.Call) or not isinstance(wezel.func, ast.Attribute):
                continue
            funkcja = wezel.func
            modul_funkcji = funkcja.value.id if isinstance(funkcja.value, ast.Name) else ""
            if (modul_funkcji, funkcja.attr) in FUNKCJE_SKANU:
                indeks = FUNKCJE_SKANU[(modul_funkcji, funkcja.attr)]
                if indeks is None:
                    wzorzec = wezel.args[0] if wezel.args else None
                    if wzorzec is None:
                        wynik.add(Skan(wezel.lineno, korzen=None))
                        continue
                    wynik.update(
                        self._wynik(wezel.lineno, _sciezka(w), None)
                        for w in self.wylicz(wzorzec, plik)
                    )
                elif len(wezel.args) > indeks:
                    wynik.update(self._skan(wezel.lineno, wezel.args[indeks], None, plik))
                else:
                    wynik.add(Skan(wezel.lineno, korzen=None))
            elif funkcja.attr in METODY_SKANU:
                wynik.update(
                    self._skan(
                        wezel.lineno, funkcja.value, wezel.args[0] if wezel.args else None, plik
                    )
                )
        return sorted(wynik, key=lambda s: (s.linia, s.korzen or "", s.wzorzec or "", s.poza))

    def _skan(
        self, linia: int, cel: ast.expr, wzorzec_wyr: ast.expr | None, plik: _Plik
    ) -> list[Skan]:
        wzorce: _Warianty = self.wylicz(wzorzec_wyr, plik) if wzorzec_wyr is not None else (None,)
        wynik: list[Skan] = []
        for wartosc, wzorzec in itertools.product(self.wylicz(cel, plik), wzorce):
            nazwa: str | None = None
            if isinstance(wzorzec, str):
                ostatni = wzorzec.rsplit("/", 1)[-1]
                nazwa = ostatni if ostatni not in ("", "**", "*") else None
            wynik.append(self._wynik(linia, _sciezka(wartosc), nazwa))
        return wynik

    def _wynik(self, linia: int, wartosc: _Jedna, wzorzec: str | None) -> Skan:
        if isinstance(wartosc, _Poza):
            return Skan(linia, korzen=None, poza=True)
        if isinstance(wartosc, Path | _Pod):
            sciezka = _bez_gwiazdek(
                Path(os.path.normpath(wartosc if isinstance(wartosc, Path) else wartosc.sciezka))
            )
            try:
                rel = sciezka.relative_to(self.repo).as_posix()
            except ValueError:
                return Skan(linia, korzen=None, poza=True)
            return Skan(linia, korzen="" if rel == "." else rel, wzorzec=wzorzec)
        return Skan(linia, korzen=None)


def _bez_gwiazdek(sciezka: Path) -> Path:
    """Część ścieżki przed pierwszym członem wzorca (`a/b/*/c` → `a/b`)."""
    czesci: list[str] = []
    for czesc in sciezka.parts:
        if any(z in czesc for z in "*?["):
            break
        czesci.append(czesc)
    return Path(*czesci) if czesci else sciezka


def _suma(*warianty: _Warianty) -> _Warianty:
    return tuple(dict.fromkeys(w for grupa in warianty for w in grupa))


def _zlacz_napisy(*czesci: _Jedna) -> _Jedna:
    """f-napis: złączenie, gdy każda część jest napisem; ścieżka w f-napisie — jej postać
    tekstowa (`f"{KATALOG}/x"`)."""
    tekst: list[str] = []
    for czesc in czesci:
        if isinstance(czesc, str):
            tekst.append(czesc)
        elif isinstance(czesc, Path):
            tekst.append(czesc.as_posix())
        else:
            return None
    return "".join(tekst)


def _mapuj(funkcja: Callable[[_Jedna], _Jedna], warianty: _Warianty) -> _Warianty:
    return tuple(dict.fromkeys(funkcja(w) for w in warianty))


def _iloczyn(funkcja: Callable[..., _Jedna], *warianty: _Warianty) -> _Warianty:
    return tuple(dict.fromkeys(funkcja(*k) for k in itertools.product(*warianty)))


def _sciezka(*czesci: _Jedna) -> _Jedna:
    """`Path(a, b, …)`: napis absolutny staje się ścieżką, względny — nieustalony (zależy od
    katalogu bieżącego procesu)."""
    if not czesci:
        return None
    pierwsza = czesci[0]
    if isinstance(pierwsza, str):
        pierwsza = Path(pierwsza) if os.path.isabs(pierwsza) else None
    return _dolacz(pierwsza, *czesci[1:]) if len(czesci) > 1 else pierwsza


def _przodek(wartosc: _Jedna, n: int) -> _Jedna:
    if isinstance(wartosc, str):
        wartosc = _sciezka(wartosc)
    if isinstance(wartosc, _Poza):
        return wartosc
    if isinstance(wartosc, Path):
        return wartosc.parents[n] if n < len(wartosc.parents) else None
    if isinstance(wartosc, _Pod):
        # Przodek ścieżki nieznanej pod P leży gdzieś pod przodkiem P — nadzbiór.
        sciezka = wartosc.sciezka
        return _Pod(sciezka.parents[n]) if n < len(sciezka.parents) else None
    return None


def _dolacz(lewa: _Jedna, *prawe: _Jedna) -> _Jedna:
    """`lewa / p1 / p2 …`; człon nieznany (albo z gwiazdką) daje ścieżkę POD znaną lewą."""
    if isinstance(lewa, _Poza):
        return lewa
    if isinstance(lewa, str):
        lewa = _sciezka(lewa)
    if not isinstance(lewa, Path | _Pod):
        return None
    biezaca: Path | _Pod = lewa
    for czlon in prawe:
        if isinstance(biezaca, _Pod):
            return biezaca
        if isinstance(czlon, str) and os.path.isabs(czlon):
            biezaca = Path(czlon)  # `a / "/abs"` = `/abs`
        elif isinstance(czlon, str) and not any(z in czlon for z in "*?["):
            biezaca = Path(os.path.normpath(biezaca / czlon))
        elif isinstance(czlon, Path):
            biezaca = czlon
        else:
            return _Pod(biezaca)
    return biezaca

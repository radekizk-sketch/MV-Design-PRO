"""Analiza AST: klucze ładunku (``payload``) czytane przez handler operacji domenowej.

Narzędzie testu ``test_spec_operacji_rowna_odczytom_handlera.py``. Dla każdego handlera
z ``_HANDLERS`` (``enm/domain_operations.py``) i ``ALL_V2_HANDLERS``
(``enm/domain_operations_v2.py``) wyznacza — PRZECHODNIO, przez wywołania funkcji modułów
``enm/**`` — zbiór kluczy najwyższego poziomu ładunku, które handler czyta.

Rozpoznawane odczyty: ``p.get(k)`` / ``p.pop(k)`` / ``p.setdefault(k)``, ``p[k]``, ``k in p``;
klucz jako stała tekstowa, stała modułu (krotka, zbiór, słownik — klucze), f-napis (rodzina
``prefiks_{x}_sufiks``), zmienna pętli po stałej, parametr funkcji podstawiany w miejscu
wywołania (pozycyjnie, nazwą, wartością domyślną, ``*args``). Aliasy ładunku: ``q = p``,
``q = dict(p)``, zmienna pętli po krotce zawierającej ``p`` (``for src in (entry, p)``),
słownik pochodny ``{**p, k: v}`` (bez kluczy nadpisanych) przekazany dalej.

ZASADA DOMKNIĘCIA: każde inne użycie aliasu ładunku (przekazanie do funkcji spoza ``enm``,
iteracja po kluczach, ``**p`` w wywołaniu, zapis do kolekcji…) trafia do zbioru UŻYĆ
DYNAMICZNYCH — test wymaga, żeby był pusty, bo odczyt, którego analiza nie widzi, czyni
porównanie ze specyfikacją fałszywą pewnością.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path

#: Wbudowane, które nie czytają kluczy (alias jako argument jest dla nich bezpieczny).
_WBUDOWANE_BEZ_ODCZYTU = frozenset({"isinstance", "len", "bool", "str", "id", "type", "repr"})
#: Funkcje tworzące KOPIĘ ładunku — wynik przypisany do nazwy staje się aliasem.
_KOPIUJACE = frozenset({"dict", "deepcopy"})


@dataclass
class Odczyty:
    klucze: set[str] = field(default_factory=set)
    znaczniki: set[tuple[str, str]] = field(default_factory=set)
    dynamiczne: set[str] = field(default_factory=set)


class AnalizaEnm:
    """Indeks funkcji, importów i stałych modułów ``enm/**`` + analiza odczytów."""

    def __init__(self, katalog_enm: Path) -> None:
        self.katalog = katalog_enm
        self.moduly = {
            p: ast.parse(p.read_text(encoding="utf-8")) for p in sorted(katalog_enm.rglob("*.py"))
        }
        self.funkcje: dict[tuple[Path, str], ast.FunctionDef] = {}
        self.stale: dict[tuple[Path, str], ast.expr] = {}
        self.importy: dict[Path, dict[str, tuple[Path, str]]] = {}
        for p, drzewo in self.moduly.items():
            imp: dict[str, tuple[Path, str]] = {}
            for wezel in drzewo.body:
                if isinstance(wezel, ast.FunctionDef):
                    self.funkcje[(p, wezel.name)] = wezel
                if isinstance(wezel, ast.ImportFrom) and wezel.module:
                    kandydaci = [q for q in self.moduly if q.stem == wezel.module.split(".")[-1]]
                    for alias in wezel.names:
                        if kandydaci:
                            imp[alias.asname or alias.name] = (kandydaci[0], alias.name)
                cel = None
                if isinstance(wezel, ast.AnnAssign):
                    cel = wezel.target
                elif isinstance(wezel, ast.Assign) and len(wezel.targets) == 1:
                    cel = wezel.targets[0]
                wartosc = getattr(wezel, "value", None)
                if isinstance(cel, ast.Name) and wartosc is not None:
                    self.stale[(p, cel.id)] = wartosc
            self.importy[p] = imp
        self._pamiec: dict[tuple[Path, str, str], Odczyty] = {}

    # -- rozwiązywanie nazw ---------------------------------------------------------------

    def _rozwiaz(self, p: Path, nazwa: str, tabela: dict) -> tuple[Path, object] | None:
        if (p, nazwa) in tabela:
            return p, tabela[(p, nazwa)]
        if nazwa in self.importy[p]:
            q, n = self.importy[p][nazwa]
            if (q, n) in tabela:
                return q, tabela[(q, n)]
        return None

    def funkcja(self, p: Path, nazwa: str) -> tuple[Path, ast.FunctionDef] | None:
        wynik = self._rozwiaz(p, nazwa, self.funkcje)
        return wynik  # type: ignore[return-value]

    def napisy_stale(self, p: Path, wyr: ast.expr, glebokosc: int = 0) -> set[str] | None:
        """Zbiór napisów wyrażenia stałego albo ``None``, gdy wyrażenie nie jest stałe."""
        if glebokosc > 6:
            return None
        if isinstance(wyr, ast.Constant) and isinstance(wyr.value, str):
            return {wyr.value}
        if isinstance(wyr, ast.Starred):
            return self.napisy_stale(p, wyr.value, glebokosc + 1)
        if isinstance(wyr, ast.JoinedStr):
            return {
                "".join(
                    v.value if isinstance(v, ast.Constant) else "{" + ast.unparse(v.value) + "}"
                    for v in wyr.values
                )
            }
        if isinstance(wyr, ast.Tuple | ast.List | ast.Set):
            wynik: set[str] = set()
            for el in wyr.elts:
                s = self.napisy_stale(p, el, glebokosc + 1)
                if s is None:
                    return None
                wynik |= s
            return wynik
        if isinstance(wyr, ast.Dict):
            wynik = set()
            for k in wyr.keys:
                s = self.napisy_stale(p, k, glebokosc + 1) if k is not None else None
                if s is None:
                    return None
                wynik |= s
            return wynik
        if (
            isinstance(wyr, ast.Call)
            and isinstance(wyr.func, ast.Name)
            and wyr.func.id in ("frozenset", "tuple", "set", "sorted")
            and wyr.args
        ):
            return self.napisy_stale(p, wyr.args[0], glebokosc + 1)
        if isinstance(wyr, ast.BinOp) and isinstance(wyr.op, ast.Add | ast.BitOr):
            a = self.napisy_stale(p, wyr.left, glebokosc + 1)
            b = self.napisy_stale(p, wyr.right, glebokosc + 1)
            return None if a is None or b is None else a | b
        if isinstance(wyr, ast.Name):
            r = self._rozwiaz(p, wyr.id, self.stale)
            if r is not None:
                return self.napisy_stale(r[0], r[1], glebokosc + 1)  # type: ignore[arg-type]
        return None

    # -- analiza funkcji -------------------------------------------------------------------

    def odczyty(self, p: Path, fn: ast.FunctionDef, parametr: str) -> Odczyty:
        klucz_pamieci = (p, fn.name, parametr)
        if klucz_pamieci in self._pamiec:
            return self._pamiec[klucz_pamieci]
        self._pamiec[klucz_pamieci] = Odczyty()  # rekursja: cykl nie dokłada odczytów
        wynik = _AnalizaFunkcji(self, p, fn, parametr).wykonaj()
        self._pamiec[klucz_pamieci] = wynik
        return wynik


class _AnalizaFunkcji:
    def __init__(self, analiza: AnalizaEnm, p: Path, fn: ast.FunctionDef, parametr: str) -> None:
        self.a = analiza
        self.p = p
        self.fn = fn
        self.parametr = parametr
        self.wynik = Odczyty()
        self.parametry = [x.arg for x in fn.args.args + fn.args.kwonlyargs]
        self.vararg = fn.args.vararg.arg if fn.args.vararg else None
        self.aliasy = {parametr}
        self.lokalne: dict[str, ast.expr] = {}
        self.pochodne: dict[str, set[str]] = {}
        self.rodzic = {id(c): n for n in ast.walk(fn) for c in ast.iter_child_nodes(n)}
        self.obsluzone: set[int] = set()

    # Słownik ``{**alias, k: v}`` → zbiór kluczy nadpisanych (None: to nie pochodna ładunku).
    def _nadpisania(self, wyr: ast.expr) -> set[str] | None:
        if not isinstance(wyr, ast.Dict):
            return None
        if not any(
            k is None and isinstance(v, ast.Name) and v.id in self.aliasy
            for k, v in zip(wyr.keys, wyr.values, strict=True)
        ):
            return None
        wynik: set[str] = set()
        for k in wyr.keys:
            if k is not None:
                wynik |= self.a.napisy_stale(self.p, k) or set()
        return wynik

    def _zbierz_aliasy(self) -> None:
        # Kilka przebiegów: alias aliasu i pętla po krotce z aliasem stabilizują się szybko.
        for _ in range(4):
            for wezel in ast.walk(self.fn):
                if (
                    isinstance(wezel, ast.Assign)
                    and len(wezel.targets) == 1
                    and isinstance(wezel.targets[0], ast.Name)
                ):
                    cel, v = wezel.targets[0].id, wezel.value
                    self.lokalne.setdefault(cel, v)
                    nad = self._nadpisania(v)
                    if nad is not None:
                        self.pochodne[cel] = nad
                        self._oznacz_spread(v)
                    if isinstance(v, ast.Name) and v.id in self.aliasy:
                        self.aliasy.add(cel)
                        self.obsluzone.add(id(v))
                    elif (
                        isinstance(v, ast.Call)
                        and isinstance(v.func, ast.Name)
                        and v.func.id in _KOPIUJACE
                        and len(v.args) == 1
                        and isinstance(v.args[0], ast.Name)
                        and v.args[0].id in self.aliasy
                    ):
                        self.aliasy.add(cel)
                        self.obsluzone.add(id(v.args[0]))
                # ``pochodna[k] = v`` — kolejny klucz NADPISANY w słowniku pochodnym.
                if isinstance(wezel, ast.Assign):
                    for cel_z in wezel.targets:
                        if (
                            isinstance(cel_z, ast.Subscript)
                            and isinstance(cel_z.value, ast.Name)
                            and cel_z.value.id in self.pochodne
                        ):
                            klucze = self.a.napisy_stale(self.p, cel_z.slice)
                            if klucze is not None:
                                self.pochodne[cel_z.value.id] |= klucze
                                self.obsluzone.add(id(cel_z.value))
                if isinstance(wezel, ast.For | ast.comprehension):
                    cel_p, it = wezel.target, wezel.iter
                    if (
                        isinstance(cel_p, ast.Name)
                        and isinstance(it, ast.Tuple | ast.List)
                        and any(isinstance(e, ast.Name) and e.id in self.aliasy for e in it.elts)
                    ):
                        self.aliasy.add(cel_p.id)
                        for e in it.elts:
                            if isinstance(e, ast.Name) and e.id in self.aliasy:
                                self.obsluzone.add(id(e))

    def _klucz(self, wyr: ast.expr) -> None:
        s = self.a.napisy_stale(self.p, wyr)
        if s is not None:
            self.wynik.klucze |= s
            return
        if isinstance(wyr, ast.Name):
            if wyr.id in self.parametry and wyr.id != self.parametr:
                self.wynik.znaczniki.add(("P", wyr.id))
                return
            it = self._iterator_petli(wyr)
            if it is not None:
                if isinstance(it, ast.Name) and it.id == self.vararg:
                    self.wynik.znaczniki.add(("V", it.id))
                    return
                if isinstance(it, ast.Name) and it.id in self.parametry:
                    self.wynik.znaczniki.add(("P", it.id))
                    return
                s = self.a.napisy_stale(self.p, it)
                if s is None and isinstance(it, ast.Name) and it.id in self.lokalne:
                    s = self.a.napisy_stale(self.p, self.lokalne[it.id])
                if s is not None:
                    self.wynik.klucze |= s
                    return
        self.wynik.dynamiczne.add(f"klucz {ast.unparse(wyr)} @ {self.fn.name}")

    def _iterator_petli(self, nazwa: ast.Name) -> ast.expr | None:
        """Iterator NAJBLIŻSZEJ pętli/wyrażenia składanego, które wiąże ``nazwa``."""
        wezel: ast.AST | None = nazwa
        while wezel is not None:
            wezel = self.rodzic.get(id(wezel))
            generatory: list[ast.comprehension | ast.For] = []
            if isinstance(wezel, ast.ListComp | ast.SetComp | ast.GeneratorExp | ast.DictComp):
                generatory = list(wezel.generators)
            elif isinstance(wezel, ast.For):
                generatory = [wezel]
            for gen in generatory:
                cel = gen.target
                if isinstance(cel, ast.Name) and cel.id == nazwa.id:
                    return gen.iter
                if (
                    isinstance(cel, ast.Tuple)
                    and cel.elts
                    and isinstance(cel.elts[0], ast.Name)
                    and cel.elts[0].id == nazwa.id
                    and isinstance(gen.iter, ast.Call)
                    and isinstance(gen.iter.func, ast.Attribute)
                    and gen.iter.func.attr in ("items", "keys")
                ):
                    return gen.iter.func.value
        return None

    def _wywolanie_z_aliasem(self, wezel: ast.Call, indeks: int, kw: str | None) -> bool:
        """Alias przekazany do funkcji ``enm`` — dołącz jej odczyty. False: funkcja nieznana."""
        f = wezel.func
        if not isinstance(f, ast.Name):
            return False
        r = self.a.funkcja(self.p, f.id)
        if r is None:
            return False
        q, g = r
        gp = [x.arg for x in g.args.args]
        if kw is None:
            if indeks >= len(gp):
                return False
            param = gp[indeks]
        else:
            param = kw
        pod = self.a.odczyty(q, g, param)
        self.wynik.klucze |= pod.klucze
        self.wynik.dynamiczne |= pod.dynamiczne
        for rodzaj, nazwa in pod.znaczniki:
            if rodzaj == "V":
                for extra in wezel.args[len(gp) :]:
                    self._klucz(extra)
                continue
            if nazwa in gp and gp.index(nazwa) < len(wezel.args):
                self._klucz(wezel.args[gp.index(nazwa)])
                continue
            kwargi = [k for k in wezel.keywords if k.arg == nazwa]
            if kwargi:
                self._klucz(kwargi[0].value)
                continue
            domyslne = g.args.defaults
            idx = gp.index(nazwa) - (len(gp) - len(domyslne)) if nazwa in gp else -1
            tylko_nazwa = [x.arg for x in g.args.kwonlyargs]
            domyslna_kw = (
                g.args.kw_defaults[tylko_nazwa.index(nazwa)] if nazwa in tylko_nazwa else None
            )
            if 0 <= idx < len(domyslne):
                self._klucz(domyslne[idx])
            elif domyslna_kw is not None:
                self._klucz(domyslna_kw)
            else:
                self.wynik.dynamiczne.add(f"znacznik {nazwa} @ {g.name}")
        return True

    def wykonaj(self) -> Odczyty:
        self._zbierz_aliasy()
        for wezel in ast.walk(self.fn):
            if isinstance(wezel, ast.Call):
                self._wezel_wywolania(wezel)
            elif (
                isinstance(wezel, ast.Subscript)
                and isinstance(wezel.value, ast.Name)
                and wezel.value.id in self.aliasy
                and isinstance(wezel.ctx, ast.Load)
            ):
                self._klucz(wezel.slice)
                self.obsluzone.add(id(wezel.value))
            elif (
                isinstance(wezel, ast.Compare)
                and len(wezel.ops) == 1
                and isinstance(wezel.ops[0], ast.In | ast.NotIn)
                and isinstance(wezel.comparators[0], ast.Name)
                and wezel.comparators[0].id in self.aliasy
            ):
                self._klucz(wezel.left)
                self.obsluzone.add(id(wezel.comparators[0]))
        # Domknięcie: każde wystąpienie aliasu musi być obsłużonym użyciem.
        for wezel in ast.walk(self.fn):
            if (
                isinstance(wezel, ast.Name)
                and isinstance(wezel.ctx, ast.Load)
                and (wezel.id in self.aliasy or wezel.id in self.pochodne)
                and id(wezel) not in self.obsluzone
            ):
                rodzic = self.rodzic.get(id(wezel))
                opis = type(rodzic).__name__ if rodzic is not None else "?"
                self.wynik.dynamiczne.add(
                    f"użycie {wezel.id} ({opis}) @ {self.fn.name}:{wezel.lineno}"
                )
        return self.wynik

    def _wezel_wywolania(self, wezel: ast.Call) -> None:
        f = wezel.func
        if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name):
            if f.value.id in self.aliasy and f.attr in ("get", "pop", "setdefault") and wezel.args:
                self._klucz(wezel.args[0])
                self.obsluzone.add(id(f.value))
        for i, arg in enumerate(wezel.args):
            nad = self._nadpisania(arg)
            if nad is None and isinstance(arg, ast.Name) and arg.id in self.pochodne:
                nad = self.pochodne[arg.id]
            if nad is not None:
                r = self.a.funkcja(self.p, f.id) if isinstance(f, ast.Name) else None
                if r is not None:
                    q, g = r
                    gp = [x.arg for x in g.args.args]
                    if i < len(gp):
                        pod = self.a.odczyty(q, g, gp[i])
                        self.wynik.klucze |= pod.klucze - nad
                        self.wynik.dynamiczne |= pod.dynamiczne
                        self._oznacz_spread(arg)
                        self.obsluzone.add(id(arg))
                        continue
            if isinstance(arg, ast.Name) and arg.id in self.aliasy:
                if isinstance(f, ast.Name) and f.id in _WBUDOWANE_BEZ_ODCZYTU | _KOPIUJACE:
                    self.obsluzone.add(id(arg))
                elif self._wywolanie_z_aliasem(wezel, i, None):
                    self.obsluzone.add(id(arg))
        for kw in wezel.keywords:
            if (
                isinstance(kw.value, ast.Name)
                and kw.value.id in self.aliasy
                and kw.arg is not None
                and self._wywolanie_z_aliasem(wezel, -1, kw.arg)
            ):
                self.obsluzone.add(id(kw.value))

    def _oznacz_spread(self, arg: ast.expr) -> None:
        if isinstance(arg, ast.Dict):
            for k, v in zip(arg.keys, arg.values, strict=True):
                if k is None and isinstance(v, ast.Name):
                    self.obsluzone.add(id(v))


def handlery(analiza: AnalizaEnm) -> dict[str, tuple[Path, ast.FunctionDef]]:
    """Nazwa operacji → (moduł, funkcja handlera) z obu słowników handlerów."""
    wynik: dict[str, tuple[Path, ast.FunctionDef]] = {}
    for plik, nazwa_slownika in (
        ("domain_operations.py", "_HANDLERS"),
        ("domain_operations_v2.py", "ALL_V2_HANDLERS"),
    ):
        p = analiza.katalog / plik
        slownik = analiza.stale[(p, nazwa_slownika)]
        assert isinstance(slownik, ast.Dict), nazwa_slownika
        for k, v in zip(slownik.keys, slownik.values, strict=True):
            assert isinstance(k, ast.Constant) and isinstance(v, ast.Name), ast.unparse(slownik)
            r = analiza.funkcja(p, v.id)
            assert r is not None, f"handler {k.value} -> {v.id} nierozwiązany"
            wynik[str(k.value)] = r
    return wynik


def odczyty_operacji(analiza: AnalizaEnm, p: Path, fn: ast.FunctionDef) -> Odczyty:
    """Odczyty handlera ``(enm, payload)`` — drugi parametr to ładunek."""
    return analiza.odczyty(p, fn, fn.args.args[1].arg)

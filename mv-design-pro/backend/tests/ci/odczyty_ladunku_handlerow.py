"""Analiza AST: klucze ładunku (``payload``) czytane przez handler operacji domenowej.

Narzędzie testu ``test_spec_operacji_rowna_odczytom_handlera.py``. Dla każdego handlera
z ``_HANDLERS`` (``enm/domain_operations.py``) i ``ALL_V2_HANDLERS``
(``enm/domain_operations_v2.py``) wyznacza — PRZECHODNIO, przez wywołania funkcji modułów
``enm/**`` — zbiór kluczy najwyższego poziomu ładunku, które handler czyta.

Rozpoznawane odczyty: ``p.get(k)`` / ``p.pop(k)`` / ``p.setdefault(k)``, ``p[k]``, ``k in p``;
klucz jako stała tekstowa, stała modułu (krotka, zbiór, słownik — klucze), f-napis (rodzina
``prefiks_{x}_sufiks``), wyrażenie warunkowe stałych (obie gałęzie), wywołanie funkcji
``enm`` o ciele ``return <wyrażenie stałe>``, zmienna pętli po stałej, parametr funkcji podstawiany w miejscu
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
    #: Klucz → odczyty WARTOŚCI pod tym kluczem (obiekt zagnieżdżony albo element listy
    #: obiektów): ``s = p.get("segment") or {}; s.get("dlugosc_m")`` daje
    #: ``zagniezdzone["segment"].klucze == {"dlugosc_m"}``. ``dynamiczne`` poziomu
    #: zagnieżdżonego zawiera też użycia wartości skalarnej (``float(v)``) — o domknięciu
    #: rozstrzyga porównanie tylko dla kluczy, które są obiektami.
    zagniezdzone: dict[str, Odczyty] = field(default_factory=dict)
    #: Wartość czytana jak słownik (``.get``/``[k]``) — odróżnia obiekt od napisu, w którym
    #: ``"." in ref`` też jest porównaniem ``in``.
    slownikowy: bool = False
    #: Wartość obiektu zagnieżdżonego PRZECHOWANA bez czytania kluczy (zwrócona, wpisana do
    #: słownika/listy migawki) — nie jest odczytem klienta; nie rozstrzyga o kształcie.
    ucieczki: set[str] = field(default_factory=set)

    def dolacz(self, inne: Odczyty, bez: set[str] | frozenset[str] = frozenset()) -> None:
        """Dołącz odczyty innej analizy (bez kluczy ``bez`` — nadpisanych w pochodnej)."""
        self.klucze |= inne.klucze - set(bez)
        self.dynamiczne |= inne.dynamiczne
        self.ucieczki |= inne.ucieczki
        self.slownikowy |= inne.slownikowy
        for klucz, pod in inne.zagniezdzone.items():
            if klucz not in bez:
                self.zagniezdzone.setdefault(klucz, Odczyty()).dolacz(pod)


def _wartosci_opakowania(wyr: ast.AST) -> list[ast.expr]:
    """Wyrażenia, których WARTOŚĆ przenosi opakowanie ``wyr`` (lista pusta: to nie opakowanie)."""
    if isinstance(wyr, ast.BoolOp) and isinstance(wyr.op, ast.Or):
        return list(wyr.values)
    if isinstance(wyr, ast.IfExp):
        return [wyr.body, wyr.orelse]
    if isinstance(wyr, ast.Call) and len(wyr.args) == 1 and not wyr.keywords:
        f = wyr.func
        if isinstance(f, ast.Name) and f.id in ("dict", "list", "tuple", "deepcopy"):
            return [wyr.args[0]]
        if isinstance(f, ast.Attribute) and f.attr in ("deepcopy", "copy"):
            return [wyr.args[0]]
    if (
        isinstance(wyr, ast.Call)
        and isinstance(wyr.func, ast.Name)
        and wyr.func.id == "cast"
        and len(wyr.args) == 2
    ):
        return [wyr.args[1]]
    return []


def _opakowanie(rodzic: ast.AST, dziecko: ast.AST) -> bool:
    return any(w is dziecko for w in _wartosci_opakowania(rodzic))


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
        self._pamiec: dict[tuple[Path, str, str, bool], Odczyty] = {}

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
        if isinstance(wyr, ast.IfExp):
            # Klucz wybierany warunkiem: odczyt dotyczy KAŻDEJ z gałęzi (warunek nie zawęża).
            a = self.napisy_stale(p, wyr.body, glebokosc + 1)
            b = self.napisy_stale(p, wyr.orelse, glebokosc + 1)
            return None if a is None or b is None else a | b
        if isinstance(wyr, ast.Call) and isinstance(wyr.func, ast.Name):
            # Funkcja `enm`, której ciało to jeden `return <wyrażenie stałe>` (np. wybór klucza
            # dla strony równoważnika) — zbiór napisów, które może zwrócić.
            fn = self.funkcja(p, wyr.func.id)
            if fn is not None:
                cialo = [
                    w
                    for w in fn[1].body
                    if not (isinstance(w, ast.Expr) and isinstance(w.value, ast.Constant))
                ]
                if (
                    len(cialo) == 1
                    and isinstance(cialo[0], ast.Return)
                    and cialo[0].value is not None
                ):
                    return self.napisy_stale(fn[0], cialo[0].value, glebokosc + 1)
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

    def odczyty(
        self, p: Path, fn: ast.FunctionDef, parametr: str, zagniezdzony: bool = False
    ) -> Odczyty:
        """Odczyty nazwy ``parametr`` w ``fn``. ``zagniezdzony``: wartość wyjęta z ładunku
        (obiekt albo lista obiektów) — pętla po niej czyta ELEMENTY tym samym kształtem;
        pętla po samym ładunku (iteracja po kluczach) pozostaje użyciem dynamicznym."""
        klucz_pamieci = (p, fn.name, parametr, zagniezdzony)
        if klucz_pamieci in self._pamiec:
            return self._pamiec[klucz_pamieci]
        self._pamiec[klucz_pamieci] = Odczyty()  # rekursja: cykl nie dokłada odczytów
        wynik = _AnalizaFunkcji(self, p, fn, parametr, zagniezdzony).wykonaj()
        self._pamiec[klucz_pamieci] = wynik
        return wynik


class _AnalizaFunkcji:
    def __init__(
        self,
        analiza: AnalizaEnm,
        p: Path,
        fn: ast.FunctionDef,
        parametr: str,
        zagniezdzony: bool = False,
    ) -> None:
        self.a = analiza
        self.zagniezdzony = zagniezdzony
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
                    else:
                        # ``q = p or {}``, ``q = p if … else {}``, ``q = copy.deepcopy(p)``,
                        # ``q = cast(T, p)`` — ta sama wartość albo pusty zamiennik.
                        zrodla = [
                            n
                            for n in _wartosci_opakowania(v)
                            if isinstance(n, ast.Name) and n.id in self.aliasy
                        ]
                        if zrodla:
                            self.aliasy.add(cel)
                            self.obsluzone |= {id(n) for n in zrodla}
                            if isinstance(v, ast.Call):
                                # Kopia (``dict(p)``): ``kopia[k] = v`` NADPISUJE klucz.
                                self.pochodne.setdefault(cel, set())
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
                if (
                    self.zagniezdzony
                    and isinstance(wezel, ast.Call)
                    and isinstance(wezel.func, ast.Attribute)
                    and wezel.func.attr in ("append", "insert")
                    and isinstance(wezel.func.value, ast.Name)
                    and wezel.args
                ):
                    # ``lista.append({**element, "rola": …})`` — lista POCHODNYCH elementów:
                    # pętla po niej czyta element (bez kluczy nadpisanych).
                    arg = wezel.args[-1]
                    nad = self._nadpisania(arg)
                    if nad is None and isinstance(arg, ast.Name) and arg.id in self.aliasy:
                        nad = set()
                        self.obsluzone.add(id(arg))
                    if nad is None and wezel.func.value.id in self.pochodne:
                        # Element dopisany przez operację (nie z ładunku) — nie odczyt.
                        self.obsluzone.add(id(wezel.func.value))
                    if nad is not None:
                        lista = wezel.func.value.id
                        self.aliasy.add(lista)
                        self.pochodne[lista] = self.pochodne.get(lista, set()) | nad
                        self._oznacz_spread(arg)
                        self.obsluzone.add(id(wezel.func.value))
                if self.zagniezdzony and isinstance(wezel, ast.For | ast.comprehension):
                    iterowane, element = wezel.iter, wezel.target
                    if (
                        isinstance(iterowane, ast.Call)
                        and isinstance(iterowane.func, ast.Name)
                        and iterowane.func.id == "enumerate"
                        and iterowane.args
                        and isinstance(element, ast.Tuple)
                        and len(element.elts) == 2
                    ):
                        iterowane, element = iterowane.args[0], element.elts[1]
                    zrodla = [
                        n
                        for n in [iterowane, *_wartosci_opakowania(iterowane)]
                        if isinstance(n, ast.Name) and n.id in self.aliasy
                    ]
                    if (
                        zrodla
                        and isinstance(element, ast.Name)
                        and id(zrodla[0]) not in self.obsluzone
                    ):
                        # Lista obiektów: element czytany tym samym kształtem.
                        pod = self.a.odczyty(self.p, self.fn, element.id, zagniezdzony=True)
                        self.wynik.dolacz(pod, bez=self.pochodne.get(zrodla[0].id, set()))
                        self.obsluzone |= {id(n) for n in zrodla}
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

    def _klucz(self, wyr: ast.expr, cel: Odczyty | None = None) -> None:
        wynik = self.wynik if cel is None else cel
        s = self.a.napisy_stale(self.p, wyr)
        if s is None and isinstance(wyr, ast.Name) and wyr.id not in self.parametry:
            s = self._klucze_nazwy(wyr)
        if s is not None:
            wynik.klucze |= s
            return
        if isinstance(wyr, ast.Name):
            if wyr.id in self.parametry and wyr.id != self.parametr:
                wynik.znaczniki.add(("P", wyr.id))
                return
            it = self._iterator_petli(wyr)
            if it is not None:
                if isinstance(it, ast.Name) and it.id == self.vararg:
                    wynik.znaczniki.add(("V", it.id))
                    return
                if isinstance(it, ast.Name) and it.id in self.parametry:
                    wynik.znaczniki.add(("P", it.id))
                    return
                s = self.a.napisy_stale(self.p, it)
                if s is None and isinstance(it, ast.Name) and it.id in self.lokalne:
                    s = self.a.napisy_stale(self.p, self.lokalne[it.id])
                if s is not None:
                    wynik.klucze |= s
                    return
        wynik.dynamiczne.add(f"klucz {ast.unparse(wyr)} @ {self.fn.name}")

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
        pod = self.a.odczyty(q, g, param, zagniezdzony=self.zagniezdzony)
        self.wynik.dolacz(pod)
        self._znaczniki_wywolania(pod, wezel, g, self.wynik)
        return True

    def _znaczniki_wywolania(
        self, pod: Odczyty, wezel: ast.Call, g: ast.FunctionDef, cel: Odczyty
    ) -> None:
        """Klucze-parametry funkcji wywołanej (znaczniki) rozwiązane argumentami wywołania."""
        gp = [x.arg for x in g.args.args]
        for rodzaj, nazwa in pod.znaczniki:
            if rodzaj == "V":
                for extra in wezel.args[len(gp) :]:
                    self._klucz(extra, cel)
                continue
            if nazwa in gp and gp.index(nazwa) < len(wezel.args):
                self._klucz(wezel.args[gp.index(nazwa)], cel)
                continue
            kwargi = [k for k in wezel.keywords if k.arg == nazwa]
            if kwargi:
                self._klucz(kwargi[0].value, cel)
                continue
            domyslne = g.args.defaults
            idx = gp.index(nazwa) - (len(gp) - len(domyslne)) if nazwa in gp else -1
            tylko_nazwa = [x.arg for x in g.args.kwonlyargs]
            domyslna_kw = (
                g.args.kw_defaults[tylko_nazwa.index(nazwa)] if nazwa in tylko_nazwa else None
            )
            if 0 <= idx < len(domyslne):
                self._klucz(domyslne[idx], cel)
            elif domyslna_kw is not None:
                self._klucz(domyslna_kw, cel)
            else:
                cel.dynamiczne.add(f"znacznik {nazwa} @ {g.name}")

    def wykonaj(self) -> Odczyty:
        self._zbierz_aliasy()
        for wezel in ast.walk(self.fn):
            klucze_wyjete = self._ekstrakcja(wezel)
            if klucze_wyjete:
                pod = self._sledz(wezel)
                for klucz in klucze_wyjete:
                    self.wynik.zagniezdzone.setdefault(klucz, Odczyty()).dolacz(pod)
            if isinstance(wezel, ast.Call):
                self._wezel_wywolania(wezel)
            elif (
                isinstance(wezel, ast.Subscript)
                and isinstance(wezel.value, ast.Name)
                and wezel.value.id in self.aliasy
                and isinstance(wezel.ctx, ast.Load)
            ):
                self.wynik.slownikowy = True
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
                and not self._test_prawdy(wezel)
                and not self._w_galezi_napisu(wezel)
            ):
                rodzic = self.rodzic.get(id(wezel))
                opis = type(rodzic).__name__ if rodzic is not None else "?"
                if self.zagniezdzony and self._ucieczka(wezel):
                    self.wynik.ucieczki.add(f"{wezel.id} ({opis}) @ {self.fn.name}:{wezel.lineno}")
                    continue
                self.wynik.dynamiczne.add(
                    f"użycie {wezel.id} ({opis}) @ {self.fn.name}:{wezel.lineno}"
                )
        return self.wynik

    def _w_galezi_napisu(self, wezel: ast.expr) -> bool:
        """Użycie w gałęzi ``if isinstance(x, str):`` — wartość jest tam napisem
        (np. nazwa zestawu warunków ułożenia zamiast obiektu), nie obiektem."""
        if not isinstance(wezel, ast.Name):
            return False
        dziecko: ast.AST = wezel
        rodzic = self.rodzic.get(id(wezel))
        while rodzic is not None:
            if isinstance(rodzic, ast.If) and any(d is dziecko for d in rodzic.body):
                t = rodzic.test
                if (
                    isinstance(t, ast.Call)
                    and isinstance(t.func, ast.Name)
                    and t.func.id == "isinstance"
                    and len(t.args) == 2
                    and isinstance(t.args[0], ast.Name)
                    and t.args[0].id == wezel.id
                    and isinstance(t.args[1], ast.Name)
                    and t.args[1].id == "str"
                ):
                    return True
            dziecko, rodzic = rodzic, self.rodzic.get(id(rodzic))
        return False

    def _ucieczka(self, wezel: ast.expr) -> bool:
        """Wartość przechowana albo zmieniana, nie czytana: ``return x``, ``{"k": x}``,
        ``[x]``, ``lista.append(x)``, ``obiekt[k] = x`` (także przez opakowanie
        ``x if … else None``) oraz zapis do niej ``x[k] = v`` / ``del x[k]``."""
        rodzic = self.rodzic.get(id(wezel))
        if (
            isinstance(rodzic, ast.Subscript)
            and rodzic.value is wezel
            and isinstance(rodzic.ctx, ast.Store | ast.Del)
        ):
            return True
        while rodzic is not None and _opakowanie(rodzic, wezel):
            wezel, rodzic = rodzic, self.rodzic.get(id(rodzic))  # type: ignore[assignment]
        if isinstance(rodzic, ast.Dict) and any(
            v is wezel and k is None for k, v in zip(rodzic.keys, rodzic.values, strict=True)
        ):
            # ``{**x, k: v}`` zwrócone albo przechowane — kopia, której analiza nie czyta.
            return self._ucieczka(rodzic)
        if isinstance(rodzic, ast.Return):
            return True
        if isinstance(rodzic, ast.Dict) and any(
            v is wezel and k is not None for k, v in zip(rodzic.keys, rodzic.values, strict=True)
        ):
            return True  # ``{**x}`` to kopia czytana dalej, nie przechowanie
        if isinstance(rodzic, ast.List | ast.Tuple) and isinstance(
            self.rodzic.get(id(rodzic)), ast.Return | ast.Assign | ast.Dict | ast.List
        ):
            return True
        if (
            isinstance(rodzic, ast.Call)
            and isinstance(rodzic.func, ast.Attribute)
            and rodzic.func.attr in ("append", "extend")
        ):
            return True
        return (
            isinstance(rodzic, ast.Assign)
            and rodzic.value is wezel
            and all(isinstance(t, ast.Subscript | ast.Attribute) for t in rodzic.targets)
        )

    def _test_prawdy(self, wezel: ast.expr) -> bool:
        """Użycie, które nie czyta kluczy: test prawdziwości (``if s:``, ``not s``,
        ``s and …`` w teście) i porównanie z ``None``/stałą (``s is None``)."""
        rodzic = self.rodzic.get(id(wezel))
        if isinstance(rodzic, ast.If | ast.While | ast.IfExp | ast.Assert) and (
            rodzic.test is wezel
        ):
            return True
        if isinstance(rodzic, ast.UnaryOp) and isinstance(rodzic.op, ast.Not):
            return True
        if isinstance(rodzic, ast.BoolOp):
            dziadek = self.rodzic.get(id(rodzic))
            return isinstance(dziadek, ast.If | ast.While | ast.IfExp | ast.Assert | ast.UnaryOp)
        if isinstance(rodzic, ast.Compare) and all(
            isinstance(op, ast.Is | ast.IsNot | ast.Eq | ast.NotEq) for op in rodzic.ops
        ):
            return all(
                isinstance(c, ast.Constant)
                for c in [rodzic.left, *rodzic.comparators]
                if c is not wezel
            )
        return False

    # -- obiekty zagnieżdżone ------------------------------------------------------------

    def _klucze_wyrazenia(self, wyr: ast.expr) -> set[str] | None:
        """Stałe klucze wyrażenia (także zmienna pętli po stałej krotce) — bez skutków."""
        s = self.a.napisy_stale(self.p, wyr)
        if s is not None or not isinstance(wyr, ast.Name):
            return s
        s = self._klucze_nazwy(wyr)
        if s is not None:
            return s
        it = self._iterator_petli(wyr)
        if it is None:
            return None
        s = self.a.napisy_stale(self.p, it)
        if s is None and isinstance(it, ast.Name) and it.id in self.lokalne:
            s = self.a.napisy_stale(self.p, self.lokalne[it.id])
        return s

    def _klucze_nazwy(self, nazwa: ast.Name) -> set[str] | None:
        """Klucz w zmiennej lokalnej: stała przypisana raz (``key = f"{side}_r_ohm"``) albo
        składowa pętli po stałej krotce krotek (``for k_ladunku, k_celu in (("a", "x"), …)``).
        """
        if nazwa.id in self.lokalne and nazwa.id not in self.aliasy:
            s = self.a.napisy_stale(self.p, self.lokalne[nazwa.id])
            if s is not None:
                return s
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
                if not isinstance(cel, ast.Tuple) or not isinstance(gen.iter, ast.Tuple | ast.List):
                    continue
                pozycje = [
                    i
                    for i, e in enumerate(cel.elts)
                    if isinstance(e, ast.Name) and e.id == nazwa.id
                ]
                if not pozycje:
                    continue
                wynik: set[str] = set()
                for element in gen.iter.elts:
                    if not isinstance(element, ast.Tuple | ast.List):
                        return None
                    s = self.a.napisy_stale(self.p, element.elts[pozycje[0]])
                    if s is None:
                        return None
                    wynik |= s
                return wynik
        return None

    def _ekstrakcja(self, wezel: ast.AST) -> set[str] | None:
        """Klucze, gdy ``wezel`` wyjmuje wartość z aliasu ładunku (``p.get(k)``, ``p[k]``)."""
        if (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Attribute)
            and isinstance(wezel.func.value, ast.Name)
            and wezel.func.value.id in self.aliasy
            and wezel.func.attr in ("get", "pop", "setdefault")
            and wezel.args
        ):
            return self._klucze_wyrazenia(wezel.args[0])
        if (
            isinstance(wezel, ast.Subscript)
            and isinstance(wezel.value, ast.Name)
            and wezel.value.id in self.aliasy
            and isinstance(wezel.ctx, ast.Load)
        ):
            return self._klucze_wyrazenia(wezel.slice)
        return None

    def _sledz(self, wezel: ast.expr, glebokosc: int = 0) -> Odczyty:
        """Odczyty WARTOŚCI wyrażenia ``wezel`` (obiektu wyjętego z ładunku): dokąd płynie
        — do nazwy lokalnej, do funkcji ``enm``, do pętli (elementy listy), do kolejnego
        ``.get`` — i co się z niej czyta. Przepływ nierozpoznany trafia do ``dynamiczne``."""
        wynik = Odczyty()
        if glebokosc > 5:
            wynik.dynamiczne.add(f"zbyt głęboko @ {self.fn.name}")
            return wynik
        w: ast.expr = wezel
        while True:  # opakowania nie zmieniające wartości: ``x or {}``, ``dict(x)``, ``cast(T, x)``
            r = self.rodzic.get(id(w))
            if r is not None and _opakowanie(r, w):
                w = r  # type: ignore[assignment]
            else:
                break
        r = self.rodzic.get(id(w))
        cel: ast.expr | None = None
        if isinstance(r, ast.Assign) and len(r.targets) == 1 and r.value is w:
            cel = r.targets[0]
        elif isinstance(r, ast.AnnAssign) and r.value is w:
            cel = r.target
        elif isinstance(r, ast.For) and r.iter is w:
            cel = r.target
        elif isinstance(r, ast.comprehension) and r.iter is w:
            cel = r.target
        if cel is not None:
            if isinstance(cel, ast.Name) and cel.id not in self.aliasy:
                pod = self.a.odczyty(self.p, self.fn, cel.id, zagniezdzony=True)
                wynik.dolacz(pod)
                wynik.dynamiczne |= {f"znacznik {z} @ {self.fn.name}" for z in pod.znaczniki}
            else:
                wynik.dynamiczne.add(f"przypisanie {ast.unparse(cel)} @ {self.fn.name}")
            return wynik
        if isinstance(r, ast.Attribute) and r.value is w and r.attr in ("get", "pop", "setdefault"):
            wywolanie = self.rodzic.get(id(r))
            if isinstance(wywolanie, ast.Call) and wywolanie.func is r and wywolanie.args:
                self._odczyt_zagniezdzony(wynik, wywolanie.args[0], wywolanie, glebokosc)
                return wynik
        if isinstance(r, ast.Subscript) and r.value is w and isinstance(r.ctx, ast.Load):
            self._odczyt_zagniezdzony(wynik, r.slice, r, glebokosc)
            return wynik
        if (
            isinstance(r, ast.Compare)
            and len(r.ops) == 1
            and isinstance(r.ops[0], ast.In | ast.NotIn)
            and r.comparators[0] is w
        ):
            klucze = self._klucze_wyrazenia(r.left)
            if klucze is None:
                wynik.dynamiczne.add(f"klucz {ast.unparse(r.left)} @ {self.fn.name}")
            else:
                wynik.klucze |= klucze
            return wynik
        if isinstance(r, ast.keyword):
            w, r = r, self.rodzic.get(id(r))  # type: ignore[assignment]
        if isinstance(r, ast.Call) and r.func is not w:
            f = r.func
            if isinstance(f, ast.Name) and f.id in _WBUDOWANE_BEZ_ODCZYTU:
                return wynik
            funkcja = self.a.funkcja(self.p, f.id) if isinstance(f, ast.Name) else None
            if funkcja is not None:
                q, g = funkcja
                gp = [x.arg for x in g.args.args]
                param = None
                pozycje = [i for i, x in enumerate(r.args) if x is w]
                if pozycje and pozycje[0] < len(gp):
                    param = gp[pozycje[0]]
                if isinstance(w, ast.keyword):
                    param = w.arg
                if param is not None:
                    pod = self.a.odczyty(q, g, param, zagniezdzony=True)
                    wynik.dolacz(pod)
                    self._znaczniki_wywolania(pod, r, g, wynik)
                    return wynik
            wynik.dynamiczne.add(f"przekazanie do {ast.unparse(f)} @ {self.fn.name}")
            return wynik
        if self._test_prawdy(w):
            return wynik
        opis = type(r).__name__ if r is not None else "?"
        if self._ucieczka(w):
            wynik.ucieczki.add(f"wartość ({opis}) @ {self.fn.name}:{w.lineno}")
            return wynik
        wynik.dynamiczne.add(f"użycie wartości ({opis}) @ {self.fn.name}:{w.lineno}")
        return wynik

    def _odczyt_zagniezdzony(
        self, wynik: Odczyty, klucz: ast.expr, wezel: ast.expr, glebokosc: int
    ) -> None:
        klucze = self._klucze_wyrazenia(klucz)
        if klucze is None:
            wynik.dynamiczne.add(f"klucz {ast.unparse(klucz)} @ {self.fn.name}")
            return
        wynik.klucze |= klucze
        wynik.slownikowy = True
        pod = self._sledz(wezel, glebokosc + 1)
        for k in klucze:
            wynik.zagniezdzone.setdefault(k, Odczyty()).dolacz(pod)

    def _wezel_wywolania(self, wezel: ast.Call) -> None:
        f = wezel.func
        if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name):
            if f.value.id in self.aliasy and f.attr in ("get", "pop", "setdefault") and wezel.args:
                self.wynik.slownikowy = True
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
                        pod = self.a.odczyty(q, g, gp[i], zagniezdzony=self.zagniezdzony)
                        self.wynik.dolacz(pod, bez=nad)
                        self._oznacz_spread(arg)
                        self.obsluzone.add(id(arg))
                        continue
            if isinstance(arg, ast.Name) and arg.id in self.aliasy:
                if (isinstance(f, ast.Name) and f.id in _WBUDOWANE_BEZ_ODCZYTU | _KOPIUJACE) or (
                    self.zagniezdzony and self._w_galezi_napisu(arg)
                ):
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

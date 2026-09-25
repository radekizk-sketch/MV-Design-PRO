#!/usr/bin/env python3
"""Strażnik: nazwa elementu nigdy z identyfikatora maszynowego (karta #144, klasa karty #140).

PO CO. Projektant widzi nazwy elementów na schemacie, w tabelach wyników, w dowodach,
w dokumentach i w komunikatach. Operacja `continue_trunk_segment_sn` bez jawnej nazwy
odcinka nadawała mu nazwę `f"Odcinek {branch_ref[-8:]}"` — dosłownie „Odcinek /segment"
(końcówka identyfikatora `seg/<ziarno>/segment`); tabele wyników pokazywały identyfikator
szyny, gdy węzeł nie miał nazwy (`node.get("name", bus_id)`); migracja modeli zastanych
nazywała odcinki identyfikatorem rekordu bazy. Każda z tych dróg była inną INSTANCJĄ tej samej
KLASY: wyrażenie, którego wartość staje się nazwą pokazywaną człowiekowi, sięga po
identyfikator (`ref_id`, jego fragment, ziarno, `edge_id`, `catalog_ref`, `.get("id")`).
Kod innej operacji wręcz filtrował nazwy z „seg/" i „/segment" — defekt był widziany
i obchodzony zamiast naprawiony. Ten strażnik pilnuje KSZTAŁTU, nie słowa.

CO WYKRYWA (analiza składni `backend/src/**`, nie dopasowanie tekstu). Trafienie = odwołanie
do identyfikatora W WYRAŻENIU NAZWY. Wyrażenie nazwy to wartość w jednym z położeń:
  klucz      — literał słownika z kluczem nazwy (`{"name": …}`, `"label_pl"`, `"nazwa_wezla"`);
  argument   — argument nazwany wywołania (`name=…`, `title=…`, `etykieta_pl=…`);
  indeks     — przypisanie do klucza nazwy (`x["name"] = …`);
  atrybut    — przypisanie do atrybutu nazwy (`x.name = …`);
  zmienna    — przypisanie do zmiennej lokalnej o nazwie nazwy (`nazwa_der = …`, `label = …`);
  zwrot      — `return …` funkcji o nazwie nazwy (`_nazwa_polowki_odcinka`, `source_name`);
  zapas_get  — wartość zapasowa odczytu nazwy (`x.get("name", ref)`, `getattr(x, "name", ref)`,
               `x.setdefault("name", ref)`) — w DOWOLNYM miejscu, także w komunikacie;
  zapas_or   — człon po odczycie nazwy w `A or B` (`x.get("name") or x.get("ref_id")`,
               `x.name or x.ref_id`) — w DOWOLNYM miejscu, także w komunikacie.
Obok rodziny NAZWY strażnik pilnuje rodziny TEKSTU rekordów, wyników i śladów dla projektanta
(położenia z przedrostkiem `tekst_`): pola `*_pl` (jak reguła 5 `werdykt_wyjasnialny_guard`)
oraz `czego_brakuje`, `zastrzezenia`, `substitution`, `podstawienie`, `przedmiot`, `zakres` —
BEZ pól komunikatu (`message`, `message_pl`, `detail`, `error*`, `fix_message_pl`,
`komunikat*`), które są osobną klasą (karta #142).
Klucz/zmienna/funkcja „nazwy" = token `name|nazwa|label|etykieta|title|tytul` rozdzielony
podkreśleniem (`name`, `source_name`, `label_pl`, `nazwa_wezla`, `_nazwa_odcinka`), z wyjątkiem
nazw PROGRAMOWYCH (`WYKLUCZONE_NAZWY`: plik, arkusz, kolumna, operacja, klasa, moduł, pole
kontraktu — to nie są nazwy elementów sieci).

Odwołanie do identyfikatora = nazwa, atrybut, klucz słownika (`x["…"]`, `x.get("…")`,
`getattr(x, "…")`) z tokenem `ref|refs|id|ids|uuid|seed|hash|hasz|identyfikator` (np. `ref_id`,
`bus_ref`, `edge_id`, `catalog_ref`, `.ref`, `.id`, `["id"]`), jego wycinek (`ref[-8:]`) albo
ZMIENNA-NOŚNIK: zmienna lokalna przypisana z takiego odwołania (`identyfikator = str(r["id"])`,
`lit = str(wezel["id"])`) albo zmienna pętli po kolekcji identyfikatorów (`for stary_bus in
sorted(bus_refs)`). Zasięg nośnika: funkcja, sekwencyjnie (ponowne przypisanie innej wartości
kasuje nośnik), bez analizy przepływu sterowania — jak forma H `solver_input_substitute_guard`.
Przejście w głąb wyrażenia nazwy: f-napis, `or`/`and`, `a if w else b`, `+`/`%`, `str()`,
metody napisu (`strip`, `upper`, `format`, `join` …), wartość zapasowa `.get(k, zapas)`,
element wyrażenia zbiorczego (`", ".join(v.bus_ref for v in naruszenia)`).
Wywołanie innej funkcji NIE jest przechodzone: `_nazwa_z_modelu(ref)`, `nazwy[ref]`,
`nazwy.get(ref)` to ODCZYT nazwy po identyfikatorze, a nie nazwa z identyfikatora.

JAK NAPRAWIAĆ (rozstrzygnięcie karty #144 §0.1–§0.2): nazwa pochodzi z modelu (własna nazwa
elementu, nazwa rodzica/ciągu/stacji) + polskie słowo rodzaju + numer porządkowy, deterministycznie;
gdy nazwy naprawdę brak — polski opis rodzaju („Szyna bez nazwy", „Odcinek bez nazwy"), nigdy
identyfikator ani jego fragment. Identyfikator zostaje w POLACH rekordu (`ref_id`, `element_ref`,
`element_id`), z których interfejs wiąże wybór i nawigację.

LISTA DOZWOLONA I ZAPADKA (`DOZWOLONE`, klucz = TOŻSAMOŚĆ `moduł:symbol:położenie:cel:odwołanie`,
wartość = (liczba wystąpień, uzasadnienie merytoryczne)). Tożsamość, nie `plik:linia` — numer
linii dryfuje przy każdej edycji pliku. Liczba wystąpień, bo jedna tożsamość bywa wieloma
miejscami w tej samej funkcji: nowe wystąpienie pod starą tożsamością też jest czerwone.
Zapadka w OBIE strony: wzrost albo nowa tożsamość = czerwony (nowy dług); spadek albo
tożsamość, która zniknęła z drzewa = czerwony („obniż/usuń wpis — zapadka w dół"), żeby
pomiar nie kłamał. Wpis bez uzasadnienia jest błędem listy (samotest).

CZEGO NIE WYKRYWA (nazwane, żeby zieleń nie znaczyła więcej, niż znaczy — reguła KLASA pkt 4):
  * identyfikatora wklejonego WPROST do tekstu komunikatu bez wyrażenia nazwy
    (`f"Szyna '{bus_ref}' nie istnieje"`) — to treść komunikatu (osobna klasa: komunikat nie
    niesie identyfikatora; pomiar i przydział w meldunku karty #144);
  * tekstu złożonego w liście przez `lista.append(f"… {ref}")` i sklejonego później
    (`missing_fields_pl=lista`) — przepływ przez strukturę (tak znalezione ręcznie i naprawione
    w karcie #144: braki gotowości obliczeń, uzasadnienia adekwatności mocy biernej);
  * pól prezentacji spoza obu rodzin: `substitution_latex`, symbol `ProofValue`, nagłówek
    dowodu `source_bus`/`target_bus` (tak znalezione ręcznie i naprawione w karcie #144:
    symbole `P_{loss,<id>}` dowodu strat, szyny nagłówka dowodu spadku napięcia);
  * nazwy złożonej w innej funkcji i przekazanej dalej argumentem pozycyjnym bez nazwy
    (`_zbuduj(ref)` z `name` wewnątrz — trafienie jest wtedy WEWNĄTRZ tamtej funkcji, jeśli
    jej parametr ma token identyfikatora);
  * aliasu nośnika przez strukturę (`t = (ref,)`, `d = {"x": ref}` i odczyt `d["x"]`);
  * nazw pokazywanych przez frontend (osobna warstwa, strażnik `no_raw_ids_in_ui_guard`).

TRYBY: domyślny (porównanie z `DOZWOLONE`); `--zmierz` wypisuje każde trafienie z `plik:linia`.
KODY WYJŚCIA: 0 — zgodnie z listą; 1 — naruszenia albo wpisy do obniżenia/usunięcia.
"""

from __future__ import annotations

import ast
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Token identyfikatora maszynowego w nazwie zmiennej/atrybutu/klucza.
WZORZEC_IDENTYFIKATORA = re.compile(
    r"(^|_)(ref|refs|id|ids|uuid|seed|hash|hasz|identyfikator|identyfikatory)(_|$)",
    re.IGNORECASE,
)
#: Kolekcja identyfikatorów (zmienna pętli po niej jest nośnikiem identyfikatora).
WZORZEC_KOLEKCJI_IDENTYFIKATOROW = re.compile(r"(^|_)(refs|ids|identyfikatory)$", re.IGNORECASE)
#: Token nazwy pokazywanej człowiekowi (klucz, argument, atrybut, zmienna, funkcja).
WZORZEC_NAZWY = re.compile(r"(^|_)(name|nazwa|label|etykieta|title|tytul)(_|$)", re.IGNORECASE)
#: Nazwy programowe — plik, arkusz, kolumna, operacja, klasa, moduł, pole kontraktu —
#: nie są nazwami elementów sieci pokazywanymi projektantowi.
WYKLUCZONE_NAZWY = frozenset(
    {
        "filename",
        "file_name",
        "nazwa_pliku",
        "sheet_name",
        "nazwa_arkusza",
        "column_name",
        "nazwa_kolumny",
        "op_name",
        "operation_name",
        "class_name",
        "module_name",
        "field_name",
        "param_name",
        "attr_name",
        "key_name",
        "tag_name",
        "table_name",
        "schema_name",
        "queue_name",
        "task_name",
        "logger_name",
        "env_name",
    }
)
#: Pola TREŚCI rekordów, wyników i śladów dla człowieka (rodzina „tekst"): klucz `*_pl`
#: (jak reguła 5 `werdykt_wyjasnialny_guard`) oraz listy wyjaśnień i linie śladu.
POLA_TEKSTU_DOSLOWNE = frozenset(
    {"czego_brakuje", "zastrzezenia", "substitution", "podstawienie", "przedmiot", "zakres"}
)
#: Pola KOMUNIKATU (błąd/ostrzeżenie operacji, walidacji, gotowości, odpowiedzi HTTP) —
#: osobna klasa „komunikat nie niesie identyfikatora" (karta #142), nie ten strażnik.
POLA_KOMUNIKATU = frozenset(
    {
        "message",
        "message_pl",
        "detail",
        "error",
        "error_pl",
        "error_message",
        "error_message_pl",
        "fix_message_pl",
        "komunikat",
        "komunikat_pl",
    }
)
#: Metody napisu, przez które nazwa przenosi identyfikator bez zmiany jego natury.
METODY_NAPISU = frozenset(
    {"strip", "lstrip", "rstrip", "upper", "lower", "title", "capitalize", "replace", "format"}
)


def jest_nazwa(tekst: str) -> bool:
    return bool(WZORZEC_NAZWY.search(tekst)) and tekst.lower() not in WYKLUCZONE_NAZWY


def rodzaj_pola(tekst: str) -> str | None:
    """`"nazwa"`, `"tekst"` (treść rekordu/wyniku/śladu) albo None (pole spoza klasy)."""
    if jest_nazwa(tekst):
        return "nazwa"
    klucz = tekst.lower()
    if klucz in POLA_KOMUNIKATU:
        return None
    if klucz.endswith("_pl") or klucz in POLA_TEKSTU_DOSLOWNE:
        return "tekst"
    return None


def _polozenie(rodzaj: str, polozenie: str) -> str:
    return polozenie if rodzaj == "nazwa" else f"tekst_{polozenie}"


def _klucz_napisu(wezel: ast.AST | None) -> str | None:
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        return wezel.value
    return None


@dataclass(frozen=True)
class Trafienie:
    """Jedno odwołanie do identyfikatora w wyrażeniu nazwy."""

    modul: str
    linia: int
    symbol: str
    polozenie: str
    cel: str
    odwolanie: str

    @property
    def tozsamosc(self) -> str:
        return f"{self.modul}:{self.symbol}:{self.polozenie}:{self.cel}:{self.odwolanie}"


class _Skaner(ast.NodeVisitor):
    """Przegląd jednego modułu: stos symboli, nośniki identyfikatora per zasięg funkcji."""

    def __init__(self, modul: str) -> None:
        self.modul = modul
        self.symbole: list[str] = []
        self.nosniki: list[set[str]] = [set()]
        self.trafienia: list[Trafienie] = []
        self._zgloszone: set[int] = set()

    # --- odwołanie do identyfikatora -------------------------------------------------

    def _odwolanie(self, wezel: ast.AST) -> str | None:
        """Opis odwołania, gdy `wezel` WPROST jest identyfikatorem (bez przejścia w głąb)."""
        if isinstance(wezel, ast.Name):
            if WZORZEC_IDENTYFIKATORA.search(wezel.id) or wezel.id in self.nosniki[-1]:
                return wezel.id
            return None
        if isinstance(wezel, ast.Attribute):
            return f".{wezel.attr}" if WZORZEC_IDENTYFIKATORA.search(wezel.attr) else None
        if isinstance(wezel, ast.Subscript):
            klucz = _klucz_napisu(wezel.slice)
            if klucz is not None:
                return f'["{klucz}"]' if WZORZEC_IDENTYFIKATORA.search(klucz) else None
            if isinstance(wezel.slice, ast.Slice):
                return self._odwolanie(wezel.value)
            return None
        if isinstance(wezel, ast.Call):
            funkcja = wezel.func
            if (
                isinstance(funkcja, ast.Attribute)
                and funkcja.attr == "get"
                and len(wezel.args) == 1
            ):
                klucz = _klucz_napisu(wezel.args[0])
                if klucz is not None and WZORZEC_IDENTYFIKATORA.search(klucz):
                    return f'.get("{klucz}")'
            if isinstance(funkcja, ast.Name) and funkcja.id == "getattr" and len(wezel.args) == 2:
                klucz = _klucz_napisu(wezel.args[1])
                if klucz is not None and WZORZEC_IDENTYFIKATORA.search(klucz):
                    return f'getattr("{klucz}")'
            if isinstance(funkcja, ast.Name) and funkcja.id in {"str", "repr"} and wezel.args:
                return self._odwolanie(wezel.args[0])
        return None

    def _odwolania_w(self, wezel: ast.AST | None) -> list[ast.AST]:
        """Węzły-identyfikatory osiągalne z wyrażenia nazwy regułami przejścia z docstringu."""
        if wezel is None:
            return []
        if self._odwolanie(wezel) is not None:
            return [wezel]
        wynik: list[ast.AST] = []
        if isinstance(wezel, ast.JoinedStr):
            for czesc in wezel.values:
                if isinstance(czesc, ast.FormattedValue):
                    wynik += self._odwolania_w(czesc.value)
        elif isinstance(wezel, ast.BoolOp):
            for czlon in wezel.values:
                wynik += self._odwolania_w(czlon)
        elif isinstance(wezel, ast.IfExp):
            wynik += self._odwolania_w(wezel.body) + self._odwolania_w(wezel.orelse)
        elif isinstance(wezel, ast.BinOp) and isinstance(wezel.op, ast.Add | ast.Mod):
            wynik += self._odwolania_w(wezel.left) + self._odwolania_w(wezel.right)
        elif isinstance(wezel, ast.Call):
            funkcja = wezel.func
            if (
                isinstance(funkcja, ast.Attribute)
                and funkcja.attr in {"get", "setdefault"}
                and len(wezel.args) >= 2
            ):
                wynik += self._odwolania_w(wezel.args[1])
            elif isinstance(funkcja, ast.Name) and funkcja.id == "getattr" and len(wezel.args) >= 3:
                wynik += self._odwolania_w(wezel.args[2])
            elif isinstance(funkcja, ast.Attribute) and funkcja.attr in METODY_NAPISU:
                wynik += self._odwolania_w(funkcja.value)
                for argument in wezel.args:
                    wynik += self._odwolania_w(argument)
            elif isinstance(funkcja, ast.Attribute) and funkcja.attr == "join":
                for argument in wezel.args:
                    wynik += self._odwolania_w(argument)
            elif isinstance(funkcja, ast.Name) and funkcja.id in {"str", "repr"}:
                for argument in wezel.args:
                    wynik += self._odwolania_w(argument)
        elif isinstance(wezel, ast.GeneratorExp | ast.ListComp | ast.SetComp):
            # `", ".join(v.bus_ref for v in naruszenia)` — element wyrażenia zbiorczego.
            wynik += self._odwolania_w(wezel.elt)
        return wynik

    def _zglos(self, wyrazenie: ast.AST | None, polozenie: str, cel: str) -> None:
        if isinstance(wyrazenie, ast.List | ast.Tuple | ast.Set):
            for element in wyrazenie.elts:
                self._zglos(element, polozenie, cel)
            return
        for wezel in self._odwolania_w(wyrazenie):
            if id(wezel) in self._zgloszone:
                continue
            self._zgloszone.add(id(wezel))
            self.trafienia.append(
                Trafienie(
                    modul=self.modul,
                    linia=getattr(wezel, "lineno", 0),
                    symbol=".".join(self.symbole) or "<moduł>",
                    polozenie=polozenie,
                    cel=cel,
                    odwolanie=self._odwolanie(wezel) or "?",
                )
            )

    # --- zasięgi -----------------------------------------------------------------------

    def _w_zasiegu(self, wezel: ast.AST, nazwa: str | None) -> None:
        if nazwa is not None:
            self.symbole.append(nazwa)
        self.nosniki.append(set())
        self.generic_visit(wezel)
        self.nosniki.pop()
        if nazwa is not None:
            self.symbole.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        self._w_zasiegu(node, node.name)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        self._w_zasiegu(node, node.name)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:  # noqa: N802
        self._w_zasiegu(node, node.name)

    def visit_Lambda(self, node: ast.Lambda) -> None:  # noqa: N802
        self._w_zasiegu(node, None)

    # --- nośniki identyfikatora --------------------------------------------------------

    def _ustal_nosnik(self, cel: ast.AST, wartosc: ast.AST) -> None:
        """Nośnik = zmienna przypisana z identyfikatora ALBO z napisu złożonego z niego
        (`x = f"Odcinek {ref}"`, potem `"name": x` — to samo co wpisanie wprost)."""
        if isinstance(cel, ast.Name):
            if self._odwolania_w(wartosc):
                self.nosniki[-1].add(cel.id)
            else:
                self.nosniki[-1].discard(cel.id)

    def _nosnik_petli(self, cel: ast.AST, zrodlo: ast.AST) -> None:
        rdzen = zrodlo
        while (
            isinstance(rdzen, ast.Call)
            and isinstance(rdzen.func, ast.Name)
            and rdzen.func.id in {"sorted", "list", "set", "tuple", "reversed"}
            and rdzen.args
        ):
            rdzen = rdzen.args[0]
        nazwa_kolekcji = None
        if isinstance(rdzen, ast.Name):
            nazwa_kolekcji = rdzen.id
        elif isinstance(rdzen, ast.Attribute):
            nazwa_kolekcji = rdzen.attr
        if isinstance(cel, ast.Name):
            if nazwa_kolekcji and WZORZEC_KOLEKCJI_IDENTYFIKATOROW.search(nazwa_kolekcji):
                self.nosniki[-1].add(cel.id)
            else:
                self.nosniki[-1].discard(cel.id)

    # --- położenia nazwy ---------------------------------------------------------------

    def visit_Dict(self, node: ast.Dict) -> None:  # noqa: N802
        for klucz, wartosc in zip(node.keys, node.values, strict=True):
            tekst = _klucz_napisu(klucz)
            rodzaj = rodzaj_pola(tekst) if tekst is not None else None
            if tekst is not None and rodzaj is not None:
                self._zglos(wartosc, _polozenie(rodzaj, "klucz"), tekst)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        for argument in node.keywords:
            rodzaj = rodzaj_pola(argument.arg) if argument.arg is not None else None
            if argument.arg is not None and rodzaj is not None:
                self._zglos(argument.value, _polozenie(rodzaj, "argument"), argument.arg)
        funkcja = node.func
        if (
            isinstance(funkcja, ast.Attribute)
            and funkcja.attr in {"get", "setdefault"}
            and len(node.args) >= 2
        ):
            klucz = _klucz_napisu(node.args[0])
            if klucz is not None and jest_nazwa(klucz):
                self._zglos(node.args[1], "zapas_get", klucz)
        if isinstance(funkcja, ast.Name) and funkcja.id == "getattr" and len(node.args) >= 3:
            klucz = _klucz_napisu(node.args[1])
            if klucz is not None and jest_nazwa(klucz):
                self._zglos(node.args[2], "zapas_get", klucz)
        self.generic_visit(node)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:  # noqa: N802
        if isinstance(node.op, ast.Or):
            cel: str | None = None
            for czlon in node.values:
                if cel is not None:
                    self._zglos(czlon, "zapas_or", cel)
                if cel is None:
                    cel = _odczyt_nazwy(czlon)
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign) -> None:  # noqa: N802
        self.visit(node.value)
        for cel in node.targets:
            self._cel_przypisania(cel, node.value)
            self._ustal_nosnik(cel, node.value)
            self.visit(cel)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:  # noqa: N802
        if node.value is not None:
            self.visit(node.value)
            self._cel_przypisania(node.target, node.value)
            self._ustal_nosnik(node.target, node.value)

    def visit_For(self, node: ast.For) -> None:  # noqa: N802
        self.visit(node.iter)
        self._nosnik_petli(node.target, node.iter)
        for instrukcja in [*node.body, *node.orelse]:
            self.visit(instrukcja)

    def visit_comprehension(self, node: ast.comprehension) -> None:  # noqa: N802
        self.visit(node.iter)
        self._nosnik_petli(node.target, node.iter)
        for warunek in node.ifs:
            self.visit(warunek)

    def _wyrazenie_z_petla(self, generatory: list[ast.comprehension], *wyniki: ast.AST) -> None:
        """Najpierw pętle (ustalają nośniki), potem wyrażenie wyniku — kolejność wykonania,
        nie kolejność pól w drzewie składni."""
        for generator in generatory:
            self.visit(generator)
        for wynik in wyniki:
            self.visit(wynik)

    def visit_ListComp(self, node: ast.ListComp) -> None:  # noqa: N802
        self._wyrazenie_z_petla(node.generators, node.elt)

    def visit_SetComp(self, node: ast.SetComp) -> None:  # noqa: N802
        self._wyrazenie_z_petla(node.generators, node.elt)

    def visit_GeneratorExp(self, node: ast.GeneratorExp) -> None:  # noqa: N802
        self._wyrazenie_z_petla(node.generators, node.elt)

    def visit_DictComp(self, node: ast.DictComp) -> None:  # noqa: N802
        self._wyrazenie_z_petla(node.generators, node.key, node.value)

    def _cel_przypisania(self, cel: ast.AST, wartosc: ast.AST) -> None:
        if isinstance(cel, ast.Subscript):
            klucz = _klucz_napisu(cel.slice)
            rodzaj = rodzaj_pola(klucz) if klucz is not None else None
            if klucz is not None and rodzaj is not None:
                self._zglos(wartosc, _polozenie(rodzaj, "indeks"), klucz)
        elif isinstance(cel, ast.Attribute) and rodzaj_pola(cel.attr) is not None:
            rodzaj = rodzaj_pola(cel.attr) or "nazwa"
            self._zglos(wartosc, _polozenie(rodzaj, "atrybut"), cel.attr)
        elif isinstance(cel, ast.Name) and jest_nazwa(cel.id):
            self._zglos(wartosc, "zmienna", cel.id)

    def visit_Return(self, node: ast.Return) -> None:  # noqa: N802
        if self.symbole and jest_nazwa(self.symbole[-1].lstrip("_")) and node.value is not None:
            self._zglos(node.value, "zwrot", self.symbole[-1])
        self.generic_visit(node)


def _odczyt_nazwy(wezel: ast.AST) -> str | None:
    """Klucz nazwy, gdy człon `or` jest odczytem nazwy (`x.get("name")`, `x.name`, `x["name"]`,
    zmienna nazwy); inaczej None."""
    if isinstance(wezel, ast.Call) and isinstance(wezel.func, ast.Name):
        if wezel.func.id in {"str", "repr"} and wezel.args:
            return _odczyt_nazwy(wezel.args[0])
        if wezel.func.id == "getattr" and len(wezel.args) >= 2:
            klucz = _klucz_napisu(wezel.args[1])
            return klucz if klucz is not None and jest_nazwa(klucz) else None
        return None
    if isinstance(wezel, ast.Call) and isinstance(wezel.func, ast.Attribute):
        if wezel.func.attr == "get" and wezel.args:
            klucz = _klucz_napisu(wezel.args[0])
            return klucz if klucz is not None and jest_nazwa(klucz) else None
        if wezel.func.attr in METODY_NAPISU:
            return _odczyt_nazwy(wezel.func.value)
        return None
    if isinstance(wezel, ast.Attribute):
        return wezel.attr if jest_nazwa(wezel.attr) else None
    if isinstance(wezel, ast.Subscript):
        klucz = _klucz_napisu(wezel.slice)
        return klucz if klucz is not None and jest_nazwa(klucz) else None
    if isinstance(wezel, ast.Name):
        return wezel.id if jest_nazwa(wezel.id) else None
    return None


def trafienia_w_kodzie(kod: str, modul: str = "<kod>") -> list[Trafienie]:
    """Trafienia w jednym module (wejście samotestów)."""
    skaner = _Skaner(modul)
    skaner.visit(ast.parse(kod))
    return sorted(skaner.trafienia, key=lambda t: (t.linia, t.tozsamosc))


class PustySkanError(RuntimeError):
    """Skan nie znalazł ani jednego modułu — zieleń z pustego skanu byłaby kłamstwem."""


def zmierz(korzen: Path = BACKEND_SRC) -> list[Trafienie]:
    """Wszystkie trafienia w drzewie źródeł backendu, deterministycznie posortowane.

    Podnosi `PustySkanError`, gdy w `korzen` nie ma żadnego modułu Pythona.
    """
    pliki = sorted(korzen.rglob("*.py"))
    if not pliki:
        raise PustySkanError(f"brak modulow Pythona w {korzen}")
    trafienia: list[Trafienie] = []
    for plik in pliki:
        modul = plik.relative_to(korzen).as_posix()
        trafienia += trafienia_w_kodzie(plik.read_text(encoding="utf-8"), modul)
    return trafienia


def policz(trafienia: list[Trafienie]) -> Counter[str]:
    return Counter(t.tozsamosc for t in trafienia)


#: Uzasadnienie wspólne dwóch wpisów zapasu `der_name or der_ref` w rdzeniu NC RfG.
_ZAPAS_NAZWY_DER_NIE_ODPALA = (
    "Rdzeń FROZEN (B-01). Zapas `der_name or der_ref` nie odpala: jedyny producent wejścia "
    "solvera (`application/ncrfg_compliance/model_bridge.py`) nadaje `der_name` przez "
    "`enm.nazwy_elementow.nazwa_elementu` — nazwa z modelu albo opis rodzaju, nigdy pusta."
)
#: Uzasadnienie wspólne dwóch wpisów kodu testu z profilu NC RfG w tekstach rdzenia.
_KOD_TESTU_PROFILU = (
    "Rdzeń FROZEN (B-01) i profil NC RfG (B-01): `test_id` to kod testu z profilu operatora "
    "(oznaczenie normatywnej procedury badania), nie identyfikator elementu sieci."
)

#: Lista dozwolona: tożsamość → (liczba wystąpień, uzasadnienie merytoryczne). Zapadka w dół.
DOZWOLONE: dict[str, tuple[int, str]] = {
    "api/proof_pack.py:_walidacja_iec:tekst_klucz:wartosc_pl:input_hash": (
        1,
        "Pozycja walidacji „Determinizm kontraktu (input_hash)” pokazuje ODCISK wejścia jako "
        "wartość dowodu audytowego — skrót SHA-256 jest tu samą daną, którą pozycja "
        "potwierdza, a nie nazwą elementu sieci.",
    ),
    'application/analyses/v126_gotowosc.py:_warunki_silnikow:zmienna:etykieta:.get("ref")': (
        1,
        "`motors[].ref` to „Oznaczenie silnika” wpisane przez projektanta w formularzu "
        "parametrów analizy V12.6 (`application/analyses/v126_katalog.py`); silnik tej "
        "analizy nie jest elementem modelu ENM, więc oznaczenie projektanta jest jego "
        "jedyną nazwą.",
    ),
    'application/xlsx_import/importer.py:XlsxNetworkImporter._zbuduj_rekordy:klucz:name:["id"]': (
        5,
        "Kolumna `id` arkuszy odcinków, transformatorów, źródeł, odbiorów i łączników XLSX to "
        "OZNACZENIE wpisane przez projektanta (np. „L1”, „T1”) — te arkusze nie mają kolumny "
        "nazwy (ma ją wyłącznie arkusz szyn, czytany jako `nazwa`); identyfikator maszynowy "
        "modelu nadaje dopiero operacja kompilatora grafu.",
    ),
    "domain/dobor_przekladnika.py:sprawdz_dobor_ct:tekst_argument:podstawa_pl:.formula_ref": (
        1,
        "`formula_ref` wyniku `equipment_checks/ct_burden_saturation` niesie TREŚĆ wzoru "
        "(„S2obl = S_aparatow + I2n²·Rp; ALF_eff = …”), nie identyfikator — token „ref” "
        "pochodzi z nazwy pola kontraktu wyniku; wartość jest dokładnie tym, co pozycja "
        "podstawy pokazuje projektantowi.",
    ),
    (
        "application/analyses/ocena_doboru_magistrali.py:_ocena_spadku_odcinka:"
        "tekst_argument:opis_pl:slad_opis"
    ): (
        1,
        "`slad_opis` składa `formula_ref` wyniku `cable_voltage_drop` — TREŚĆ wzoru "
        "(„ΔU = √3·I·(s_P·R·cosφ + s_Q·X·sinφ)”), nie identyfikator — z wielkościami wejścia "
        "odcinka opisanego numerem porządkowym w ciągu magistrali; token „ref” pochodzi z nazwy "
        "pola kontraktu wyniku (ten sam przypadek co `dobor_przekladnika`).",
    ),
    "enm/kompilator_grafu.py:_nazwa_krawedzi:zwrot:_nazwa_krawedzi:.edge_id": (
        1,
        "W grafie wejściowym kompilatora `edge_id` to oznaczenie nadane przez człowieka: "
        "literaturowe w sieciach benchmarkowych („650-632” z publikacji IEEE) albo wpisane "
        "przez projektanta w kolumnie `id` arkusza XLSX. Migracja modelu zastanego (klucz "
        "rekordu bazy) podaje `name` jawnie (`application/migracja_legacy.py`).",
    ),
    (
        "network_model/solvers/conductor_thermal_withstand.py:_build_k_justification:"
        "tekst_klucz:zrodlo_pl:.material_source_ref"
    ): (
        1,
        "`material_source_ref` niesie CYTAT normy z karty katalogowej materiału (np. "
        "„PN-E-05115 / IEC 61936-1 — … k wg IEC 60949 § 3”), nie identyfikator — token „ref” "
        "pochodzi z nazwy pola; cytat jest dokładnie tym, co uzasadnienie współczynnika k "
        "pokazuje projektantowi.",
    ),
    (
        "network_model/solvers/ncrfg_ptpiree/engine.py:NcRfgPtpireeSolver._build_report:"
        "zapas_or:der_name:.der_ref"
    ): (1, _ZAPAS_NAZWY_DER_NIE_ODPALA),
    (
        "network_model/solvers/ncrfg_ptpiree/engine.py:NcRfgPtpireeSolver._run_module:"
        "argument:nazwa_pl:.der_ref"
    ): (1, _ZAPAS_NAZWY_DER_NIE_ODPALA),
    (
        "network_model/solvers/ncrfg_ptpiree/engine.py:NcRfgPtpireeSolver._ocena:"
        "tekst_argument:opis_pl:.test_id"
    ): (1, _KOD_TESTU_PROFILU),
    (
        "network_model/solvers/ncrfg_ptpiree/engine.py:NcRfgPtpireeSolver._statyzm:"
        "tekst_argument:zakres_stosowalnosci_pl:.test_id"
    ): (1, _KOD_TESTU_PROFILU),
    (
        "network_model/solvers/short_circuit_iec60909.py:ShortCircuitIEC60909Solver."
        "_append_transformer_kt_trace:argument:title:branch_id"
    ): (
        1,
        "Rdzeń FROZEN (B-01). Zapas `branch.name or branch_id` nie odpala: mapowanie ENM → "
        "graf (`enm/mapping.py`) nadaje każdej gałęzi grafu nazwę przez `nazwa_elementu` "
        "(nazwa z modelu albo opis rodzaju, nigdy pusta).",
    ),
    (
        "network_model/solvers/short_circuit_iec60909.py:ShortCircuitIEC60909Solver."
        "_build_branch_contributions_for_thevenin:argument:title:branch_id"
    ): (
        1,
        "Rdzeń FROZEN (B-01): tytuł kroku śladu wkładu Thevenina składa identyfikator gałęzi "
        "grafu BEZ nazwy. Naprawa wymaga zgody właściciela na edycję rdzenia (bramka B-01) — "
        "zgłoszone w meldunku karty #144 jako decyzja właściciela, nie obejście.",
    ),
}


def porownaj_z_lista(pomiar: Counter[str], dozwolone: dict[str, tuple[int, str]]) -> list[str]:
    """Rozjazdy pomiaru z listą: nowe tożsamości/wzrost i wpisy do obniżenia/usunięcia."""
    bledy: list[str] = []
    for tozsamosc, ile in sorted(pomiar.items()):
        wpis = dozwolone.get(tozsamosc)
        if wpis is None:
            bledy.append(f"[nazwa-z-identyfikatora] {tozsamosc} ({ile})")
        elif ile > wpis[0]:
            bledy.append(f"[dlug-urosl] {tozsamosc}: {wpis[0]} -> {ile}")
        elif ile < wpis[0]:
            bledy.append(f"[dlug-zmalal] {tozsamosc}: {wpis[0]} -> {ile} — obniz wpis DOZWOLONE")
    for tozsamosc in sorted(set(dozwolone) - set(pomiar)):
        bledy.append(f"[dlug-zmalal] {tozsamosc}: 0 wystapien — usun wpis z DOZWOLONE")
    return bledy


def main(argv: list[str] | None = None, korzen: Path = BACKEND_SRC) -> int:
    argv = sys.argv[1:] if argv is None else argv
    try:
        trafienia = zmierz(korzen)
    except PustySkanError as blad:
        print(f"nazwa_bez_identyfikatora_guard: PUSTY SKAN ({blad}) — to blad, nie zielen.")
        return 1
    pomiar = policz(trafienia)
    print(
        f"nazwa_bez_identyfikatora_guard: {len(trafienia)} odwolan do identyfikatora "
        f"w wyrazeniach nazwy ({len(pomiar)} tozsamosci; lista dozwolona {len(DOZWOLONE)})"
    )
    if "--zmierz" in argv:
        for trafienie in trafienia:
            print(f"  {trafienie.modul}:{trafienie.linia}  {trafienie.tozsamosc}")
    bledy = porownaj_z_lista(pomiar, DOZWOLONE)
    if bledy:
        print("NARUSZENIA:")
        for blad in bledy:
            print("  " + blad)
        return 1
    print("OK: zadna nazwa pokazywana projektantowi nie powstaje z identyfikatora maszynowego.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

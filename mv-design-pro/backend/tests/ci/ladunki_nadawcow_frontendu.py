"""Statyczny odczyt ładunków operacji domenowych wysyłanych przez nadawców spoza backendu.

Nadawcy: seedy i narzędzia ``frontend/scripts`` (``*.mjs``, ``*.py``, ``*.sh``), specy
i pomocniki e2e (``frontend/e2e/**/*.ts``) oraz kod produktu ``frontend/src/**/*.ts(x)`` (bez
testów). Czujnik ładunku dyspozytora (``tests/conftest.py``) widzi tylko nadawców ćwiczonych
testami backendu — ci nadawcy wysyłają operacje do żywego backendu poza pytestem, więc klucz
spoza kontraktu przepadałby u nich bez śladu. Ładunki kreatorów budowane funkcją modelu
(``zbudujPayload``) i wysyłane zmienną bez literału sprawdza czujnik testów frontendu
(``frontend/src/test/czujnikLadunkow.ts``) na makietach wysyłki.

Rozpoznawane postaci (JS/TS):

- obiekt operacji z literałem nazwy i literałem ładunku: ``{ name: 'op', payload: { … } }``;
- wywołanie z literałem nazwy i ładunkiem: ``fn(…, 'op', { … })``;
- wywołanie z literałem nazwy i zmienną: ``fn(…, 'op', ladunek)``, gdzie ``ladunek`` ma w tym
  samym pliku dokładnie jedną deklarację ``const|let ladunek = { … }`` (także z adnotacją typu
  ``const ladunek: Record<string, unknown> = { … }``); klucze dopisane po deklaracji
  (``ladunek.klucz = …``) należą do ładunku;
- krotka tablicowa ``['op', { … }]``.

Wywołania otwierające FORMULARZ operacji (``__mvdpOpenOperationForm`` /
``openOperationForm`` i ich aliasy w pliku, np. ``const openForm = useStore((s) =>
s.openOperationForm)``) nie są nadawcami: drugi argument to kontekst formularza UI
(``position_on_segment``, ``terminal_id``… czyta kreator), nie ładunek operacji.

Python: słownik ``{"name": "op", "payload": {…}}`` i wywołanie ``fn(…, "op", {…})``.
Powłoka: argument ``-d "{…}"`` curla (JSON z ``\\"``).

Wartości ładunku: literał obiektu → słownik, literał tablicy → lista (elementy-obiekty jako
słowniki), każde inne wyrażenie → ``None`` (kształt nieznany statycznie). Rozwinięcie
``...x`` i klucz obliczany ``[x]:`` oznaczają ładunek jako NIEDOMKNIĘTY — jego jawne klucze
i tak są sprawdzane (klucz obcy obok rozwinięcia jest obcy).
"""

from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

_ZNAKI_PRZED_REGEXEM = set("(,=:[!&|?{};+-*%<>~^")

#: Funkcje, których argument po nazwie operacji jest kontekstem formularza, nie ładunkiem.
#: Alias w pliku (``const openForm = useStore((s) => s.openOperationForm)``) dziedziczy
#: tę rolę — ``_aliasy_formularza``.
KONTEKST_FORMULARZA = frozenset({"__mvdpOpenOperationForm", "openOperationForm"})


@dataclass(frozen=True)
class Token:
    rodzaj: str  # "napis" | "nazwa" | "liczba" | "znak" | "szablon"
    tekst: str
    linia: int


@dataclass
class Ladunek:
    plik: str
    linia: int
    operacja: str
    tresc: dict[str, object]
    niedomkniety: bool = False


@dataclass
class _Stan:
    niedomkniety: bool = False
    bledy: list[str] = field(default_factory=list)


def tokeny_js(zrodlo: str) -> list[Token]:
    """Tokeny JS/TS: napisy, nazwy, liczby, znaki; komentarze pominięte; szablon nieprzejrzysty."""
    wynik: list[Token] = []
    i, n, linia = 0, len(zrodlo), 1
    while i < n:
        c = zrodlo[i]
        if c == "\n":
            linia += 1
            i += 1
        elif c.isspace():
            i += 1
        elif zrodlo.startswith("//", i):
            koniec = zrodlo.find("\n", i)
            i = n if koniec < 0 else koniec
        elif zrodlo.startswith("/*", i):
            koniec = zrodlo.find("*/", i + 2)
            koniec = n if koniec < 0 else koniec + 2
            linia += zrodlo.count("\n", i, koniec)
            i = koniec
        elif c in "'\"":
            j = i + 1
            while j < n and zrodlo[j] != c:
                j += 2 if zrodlo[j] == "\\" else 1
            wynik.append(Token("napis", zrodlo[i + 1 : j], linia))
            i = j + 1
        elif c == "`":
            j, glebokosc = i + 1, 0
            while j < n:
                if zrodlo[j] == "\\":
                    j += 2
                    continue
                if zrodlo.startswith("${", j):
                    glebokosc += 1
                    j += 2
                    continue
                if zrodlo[j] == "}" and glebokosc:
                    glebokosc -= 1
                elif zrodlo[j] == "`" and not glebokosc:
                    break
                j += 1
            wynik.append(Token("szablon", zrodlo[i + 1 : j], linia))
            linia += zrodlo.count("\n", i, j)
            i = j + 1
        elif c == "/" and (not wynik or wynik[-1].tekst in _ZNAKI_PRZED_REGEXEM):
            j, klasa = i + 1, False
            while j < n and (zrodlo[j] != "/" or klasa) and zrodlo[j] != "\n":
                if zrodlo[j] == "\\":
                    j += 1
                elif zrodlo[j] == "[":
                    klasa = True
                elif zrodlo[j] == "]":
                    klasa = False
                j += 1
            wynik.append(Token("szablon", zrodlo[i : j + 1], linia))
            i = j + 1
            while i < n and zrodlo[i].isalpha():
                i += 1
        elif c.isalpha() or c in "_$":
            j = i
            while j < n and (zrodlo[j].isalnum() or zrodlo[j] in "_$"):
                j += 1
            wynik.append(Token("nazwa", zrodlo[i:j], linia))
            i = j
        elif c.isdigit():
            j = i
            while j < n and (zrodlo[j].isalnum() or zrodlo[j] in "._"):
                j += 1
            wynik.append(Token("liczba", zrodlo[i:j], linia))
            i = j
        elif zrodlo.startswith("...", i):
            wynik.append(Token("znak", "...", linia))
            i += 3
        else:
            wynik.append(Token("znak", c, linia))
            i += 1
    return wynik


_OTWARCIA = {"{": "}", "[": "]", "(": ")"}


def _koniec_wyrazenia(t: list[Token], i: int) -> int:
    """Indeks pierwszego ``,`` / ``}`` / ``]`` / ``)`` poziomu wyrażenia od ``i``."""
    stos: list[str] = []
    while i < len(t):
        tekst = t[i].tekst if t[i].rodzaj == "znak" else ""
        if tekst in _OTWARCIA:
            stos.append(_OTWARCIA[tekst])
        elif stos and tekst == stos[-1]:
            stos.pop()
        elif not stos and tekst in {",", "}", "]", ")"}:
            return i
        i += 1
    return i


def _wartosc(t: list[Token], i: int, stan: _Stan) -> tuple[object, int]:
    if t[i].tekst == "{" and t[i].rodzaj == "znak":
        obiekt, j = obiekt_js(t, i, stan)
        if t[j].tekst in {",", "}", "]", ")"}:
            return obiekt, j
    elif t[i].tekst == "[" and t[i].rodzaj == "znak":
        lista: list[object] = []
        j = i + 1
        while j < len(t) and t[j].tekst != "]":
            element, j = _wartosc(t, j, stan)
            lista.append(element)
            if t[j].tekst == ",":
                j += 1
        if j + 1 < len(t) and t[j + 1].tekst in {",", "}", "]", ")"}:
            return lista, j + 1
    return None, _koniec_wyrazenia(t, i)


def obiekt_js(t: list[Token], i: int, stan: _Stan) -> tuple[dict[str, object], int]:
    """Literał obiektu od ``{`` w ``t[i]`` → (słownik, indeks za ``}``)."""
    wynik: dict[str, object] = {}
    j = i + 1
    while j < len(t) and t[j].tekst != "}":
        tok = t[j]
        if tok.tekst == "...":
            stan.niedomkniety = True
            j = _koniec_wyrazenia(t, j + 1)
        elif tok.tekst == "[" and tok.rodzaj == "znak":
            stan.niedomkniety = True
            j = _koniec_wyrazenia(t, j)
        elif tok.rodzaj in {"nazwa", "napis", "liczba"}:
            nastepny = t[j + 1].tekst
            if nastepny == ":":
                wartosc, j = _wartosc(t, j + 2, stan)
                wynik[tok.tekst] = wartosc
            elif nastepny in {",", "}"}:
                wynik[tok.tekst] = None  # skrót ``{ klucz }``
                j += 1
            else:  # metoda / akcesor — ładunek nie jest daną
                stan.niedomkniety = True
                j = _koniec_wyrazenia(t, j)
        else:
            stan.bledy.append(f"linia {tok.linia}: nieoczekiwany {tok.tekst!r}")
            j = _koniec_wyrazenia(t, j)
        if j < len(t) and t[j].tekst == ",":
            j += 1
    return wynik, j + 1


_OTWARCIA_TYPU = frozenset({"<", "(", "[", "{"})
_ZAMKNIECIA_TYPU = frozenset({">", ")", "]", "}"})


def _przypisanie(t: list[Token], k: int) -> bool:
    """``t[k]`` to ``=`` przypisania — nie ``==``/``===``/``=>``/``!=``/``<=``/``>=``."""
    return (
        t[k].rodzaj == "znak"
        and t[k].tekst == "="
        and t[k + 1].tekst not in {"=", ">"}
        and t[k - 1].tekst not in {"=", "!", "<", ">"}
    )


def _koniec_adnotacji_typu(t: list[Token], k: int) -> int | None:
    """Indeks ``=`` za adnotacją typu od ``:`` w ``t[k]`` (``const x: Record<A, B> = …``)."""
    glebokosc = 0
    for m in range(k + 1, min(len(t) - 1, k + 80)):
        if t[m].rodzaj != "znak":
            continue
        if t[m].tekst in _OTWARCIA_TYPU:
            glebokosc += 1
        elif t[m].tekst in _ZAMKNIECIA_TYPU and not (t[m].tekst == ">" and t[m - 1].tekst == "="):
            glebokosc -= 1
            if glebokosc < 0:
                return None
        elif t[m].tekst == ";":
            return None
        elif glebokosc == 0 and t[m].tekst == "=" and t[m + 1].tekst not in {"=", ">"}:
            return m  # w typie nie ma ``>=``: ``Record<A, B>=`` to zamknięcie typu i ``=``
    return None


def _deklaracje_obiektow(t: list[Token]) -> dict[str, list[int]]:
    """Nazwa → indeksy ``{`` literałów, którymi ją zadeklarowano (``const x = {``,
    ``const x: T = {``)."""
    deklaracje: dict[str, list[int]] = {}
    for k in range(len(t) - 3):
        if t[k].tekst not in {"const", "let", "var"} or t[k + 1].rodzaj != "nazwa":
            continue
        rowna: int | None = k + 2
        if t[k + 2].tekst == ":":
            rowna = _koniec_adnotacji_typu(t, k + 2)
        if rowna is not None and t[rowna].tekst == "=" and t[rowna + 1].tekst == "{":
            deklaracje.setdefault(t[k + 1].tekst, []).append(rowna + 1)
    return deklaracje


def _aliasy_formularza(t: list[Token]) -> frozenset[str]:
    """Nazwy zadeklarowane wyrażeniem sięgającym po funkcję formularza
    (``const openForm = useNetworkBuildStore((state) => state.openOperationForm)``)."""
    aliasy: set[str] = set()
    for k in range(len(t) - 2):
        if (
            t[k].tekst not in {"const", "let"}
            or t[k + 1].rodzaj != "nazwa"
            or t[k + 2].tekst != "="
        ):
            continue
        for m in range(k + 3, min(len(t), k + 25)):
            if t[m].tekst in {";", "const", "let", "function", "return"}:
                break
            if t[m].rodzaj == "nazwa" and t[m].tekst in KONTEKST_FORMULARZA:
                aliasy.add(t[k + 1].tekst)
                break
    return frozenset(aliasy)


def _dopisane_klucze(t: list[Token]) -> dict[str, list[str]]:
    """Nazwa → klucze dopisane po deklaracji (``x.klucz = …``) — część ładunku ``x``."""
    dopisane: dict[str, list[str]] = {}
    for k in range(1, len(t) - 4):
        if (
            t[k].rodzaj == "nazwa"
            and t[k - 1].tekst != "."
            and t[k + 1].tekst == "."
            and t[k + 2].rodzaj == "nazwa"
            and _przypisanie(t, k + 3)
        ):
            dopisane.setdefault(t[k].tekst, []).append(t[k + 2].tekst)
    return dopisane


def ladunki_js(plik: str, zrodlo: str, operacje: frozenset[str]) -> tuple[list[Ladunek], list[str]]:
    t = tokeny_js(zrodlo)
    t.append(Token("znak", "", 0))
    deklaracje = _deklaracje_obiektow(t)
    dopisane = _dopisane_klucze(t)
    formularze = KONTEKST_FORMULARZA | _aliasy_formularza(t)
    wynik: list[Ladunek] = []
    bledy: list[str] = []

    def dodaj(operacja: str, start: int, linia: int, zmienna: str = "") -> None:
        stan = _Stan()
        tresc, _ = obiekt_js(t, start, stan)
        for klucz in dopisane.get(zmienna, []):
            tresc.setdefault(klucz, None)
        bledy.extend(f"{plik}: {b}" for b in stan.bledy)
        wynik.append(Ladunek(plik, linia, operacja, tresc, stan.niedomkniety))

    stos: list[int] = []  # indeksy otwarć ``{`` — obiekt nadrzędny tokenu
    otoczenie: list[int] = []
    nawiasy: list[str] = []  # wywoływane funkcje otwartych ``(`` (``""`` — nie wywołanie)
    wolajacy: list[str] = []
    for k, tok in enumerate(t):
        otoczenie.append(stos[-1] if stos else -1)
        wolajacy.append(nawiasy[-1] if nawiasy else "")
        if tok.rodzaj == "znak" and tok.tekst == "{":
            stos.append(k)
        elif tok.rodzaj == "znak" and tok.tekst == "}" and stos:
            stos.pop()
        elif tok.rodzaj == "znak" and tok.tekst == "(":
            m = k - 1
            while m >= 0 and t[m].tekst in {"?", "."} and t[m].rodzaj == "znak":
                m -= 1  # ``fn?.(`` — wywołanie opcjonalne
            nawiasy.append(t[m].tekst if m >= 0 and t[m].rodzaj == "nazwa" else "")
        elif tok.rodzaj == "znak" and tok.tekst == ")" and nawiasy:
            nawiasy.pop()
    for k, tok in enumerate(t[:-3]):
        # ``name: 'op'`` + ``payload: {`` w TYM SAMYM obiekcie
        if tok.tekst == "payload" and t[k + 1].tekst == ":" and t[k + 2].tekst == "{":
            nazwy = [
                t[m + 2].tekst
                for m in range(len(t) - 3)
                if otoczenie[m] == otoczenie[k]
                and t[m].tekst == "name"
                and t[m + 1].tekst == ":"
                and t[m + 2].rodzaj == "napis"
            ]
            if len(nazwy) == 1:
                dodaj(nazwy[0], k + 2, tok.linia)
        # ``'op', {`` / ``'op', zmienna`` — literał nazwy operacji przed ładunkiem
        elif (
            tok.rodzaj == "napis"
            and tok.tekst in operacje
            and t[k + 1].tekst == ","
            and wolajacy[k] not in formularze
        ):
            if t[k + 2].tekst == "{":
                dodaj(tok.tekst, k + 2, tok.linia)
            elif (
                t[k + 2].rodzaj == "nazwa"
                and t[k + 3].tekst in {")", "]", ","}
                and len(deklaracje.get(t[k + 2].tekst, [])) == 1
            ):
                dodaj(tok.tekst, deklaracje[t[k + 2].tekst][0], tok.linia, t[k + 2].tekst)
    return wynik, bledy


def _z_ast(wezel: ast.expr, stan: _Stan) -> object:
    if isinstance(wezel, ast.Dict):
        wynik: dict[str, object] = {}
        for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
            if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str):
                wynik[klucz.value] = _z_ast(wartosc, stan)
            else:
                stan.niedomkniety = True
        return wynik
    if isinstance(wezel, ast.List | ast.Tuple):
        return [_z_ast(e, stan) for e in wezel.elts]
    return None


def ladunki_py(plik: str, zrodlo: str, operacje: frozenset[str]) -> list[Ladunek]:
    wynik: list[Ladunek] = []

    def dodaj(operacja: str, wezel: ast.Dict) -> None:
        stan = _Stan()
        tresc = _z_ast(wezel, stan)
        assert isinstance(tresc, dict)
        wynik.append(Ladunek(plik, wezel.lineno, operacja, tresc, stan.niedomkniety))

    for wezel in ast.walk(ast.parse(zrodlo)):
        if isinstance(wezel, ast.Dict):
            pary = {
                k.value: v
                for k, v in zip(wezel.keys, wezel.values, strict=True)
                if isinstance(k, ast.Constant) and isinstance(k.value, str)
            }
            nazwa, ladunek = pary.get("name"), pary.get("payload")
            if (
                isinstance(nazwa, ast.Constant)
                and isinstance(nazwa.value, str)
                and isinstance(ladunek, ast.Dict)
            ):
                dodaj(nazwa.value, ladunek)
        elif isinstance(wezel, ast.Call):
            for a, b in zip(wezel.args, wezel.args[1:], strict=False):
                if isinstance(a, ast.Constant) and a.value in operacje and isinstance(b, ast.Dict):
                    dodaj(str(a.value), b)
    return wynik


_CURL_DANE = re.compile(r'-d\s+"((?:[^"\\]|\\.)*)"')


def ladunki_sh(plik: str, zrodlo: str) -> tuple[list[Ladunek], list[str]]:
    wynik: list[Ladunek] = []
    bledy: list[str] = []
    for dopasowanie in _CURL_DANE.finditer(zrodlo):
        tekst = dopasowanie.group(1).replace('\\"', '"')
        linia = zrodlo.count("\n", 0, dopasowanie.start()) + 1
        try:
            dane = json.loads(tekst)
        except json.JSONDecodeError as blad:
            bledy.append(f"{plik}:{linia}: JSON curla nieczytelny ({blad})")
            continue
        operacja = dane.get("operation") if isinstance(dane, dict) else None
        if isinstance(operacja, dict) and isinstance(operacja.get("payload"), dict):
            wynik.append(Ladunek(plik, linia, operacja["name"], operacja["payload"]))
    return wynik, bledy


def pliki_nadawcow(frontend: Path) -> list[Path]:
    """Pliki wysyłające operacje domenowe (wołające endpoint ``domain-ops``)."""
    kandydaci = [
        *frontend.glob("scripts/**/*.mjs"),
        *frontend.glob("scripts/**/*.py"),
        *frontend.glob("scripts/**/*.sh"),
        *frontend.glob("e2e/**/*.ts"),
    ]
    return sorted(p for p in kandydaci if "domain-ops" in p.read_text(encoding="utf-8"))


def ladunki_nadawcow(
    frontend: Path, operacje: frozenset[str]
) -> tuple[dict[str, list[Ladunek]], list[str]]:
    """plik (względny) → ładunki; oraz błędy parsowania."""
    wynik: dict[str, list[Ladunek]] = {}
    bledy: list[str] = []
    for sciezka in pliki_nadawcow(frontend):
        plik = sciezka.relative_to(frontend).as_posix()
        zrodlo = sciezka.read_text(encoding="utf-8")
        if sciezka.suffix == ".py":
            wynik[plik] = ladunki_py(plik, zrodlo, operacje)
        elif sciezka.suffix == ".sh":
            wynik[plik], b = ladunki_sh(plik, zrodlo)
            bledy.extend(b)
        else:
            wynik[plik], b = ladunki_js(plik, zrodlo, operacje)
            bledy.extend(b)
    return wynik, bledy


def pliki_zrodel_frontendu(frontend: Path) -> list[Path]:
    """Kod produktu frontendu (``src/**/*.ts(x)``) bez testów — nadawcy operacji z UI."""
    return sorted(
        p
        for p in (*frontend.glob("src/**/*.ts"), *frontend.glob("src/**/*.tsx"))
        if "__tests__" not in p.parts and ".test." not in p.name
    )


def ladunki_zrodel_frontendu(
    frontend: Path, operacje: frozenset[str]
) -> tuple[list[Ladunek], list[str]]:
    """Ładunki z literałem nazwy operacji w kodzie produktu frontendu; oraz błędy parsowania."""
    wynik: list[Ladunek] = []
    bledy: list[str] = []
    for sciezka in pliki_zrodel_frontendu(frontend):
        zrodlo = sciezka.read_text(encoding="utf-8")
        if not any(op in zrodlo for op in operacje):
            continue
        ladunki, b = ladunki_js(sciezka.relative_to(frontend).as_posix(), zrodlo, operacje)
        wynik.extend(ladunki)
        bledy.extend(b)
    return wynik, bledy

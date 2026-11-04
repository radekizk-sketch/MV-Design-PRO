#!/usr/bin/env python3
r"""
CI Guard: backend_proza_symboli_guard.py (karta UX-04 / ZU, punkt 4 decyzji koordynatora
2026-10-30; kontrakt `docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md`).

KRYTERIUM. Każdy wzór i symbol z indeksem, który projektant widzi, renderuje się przez
`MathRenderer` z pola `*_latex` (albo z segmentu `$...$` przez `TekstZWzorami`). Proza
backendu, która trafia do ekranu albo raportu (uwagi kroku śladu, opisy danych przyjętych,
komunikaty odmowy, uzasadnienia werdyktu), nie może więc nieść symbolu spłaszczonego do
Unicode/ASCII (`I″k`, `U_n`, `cos φ`, `R′0`, `t_b`, `Ik3`): symbol w prozie pisze się
słowami („początkowy prąd zwarciowy", „napięcie znamionowe"), a wzór idzie addytywnym polem
`*_latex`. Ten guard mierzy tę klasę w `backend/src/**/*.py` i trzyma zapadkę PER PLIK.

CO JEST TRAFIENIEM. Stała tekstowa albo cały f-string (części stałe sklejone ze znacznikiem
`{}`), która jednocześnie: ma spację (zdanie, nie identyfikator), ma słowo polskie i ma
symbol z indeksem albo symbol spłaszczony (`SYMBOL_RE`). Tekst z ukośnikiem, z `$` albo
z indeksem w klamrach (`_{`, `^{`) jest już LaTeX-em (polecenie, segment wzoru, zapis indeksu
LaTeX) i nie jest prozą spłaszczoną; tekst zaczynający się znacznikiem (`<`) jest znakowaniem
(XML pakietu XLSX), nie prozą. Tekst dla człowieka rozpoznaje znak diakrytyczny albo słowo
z co najmniej czterech małych liter (`POLSKI_RE`) — proza angielska też trafia na ekran.

DRUGA CZĘŚĆ KLASY — WZÓR BEZ SŁÓW (decyzja architekta 2026-11-04). Tekst, który jest samym
wzorem albo podstawieniem (`Z_k = {} + {} = {}`, `Ik''={} kA`, `U0 = {} V; U_b = {} V`), nie ma
słowa, więc pierwsza reguła go nie widzi, a ekran pokazuje go tak samo spłaszczonego. Trafienie:
symbol (`SYMBOL_RE`), znak wzoru (`=`, `≥`, `≤`, `×`, `·` albo miejsce na liczbę `{}`), spacja
albo znak działania (`×`, `≥`, `≤`, `·` — `{}×In` bez spacji też jest zapisem dla człowieka)
i brak słowa. Naprawa: pole prozy słowami, wzór i podstawienie w addytywnym polu `*_latex`
(`substitution_latex`, `result_latex`, …) renderowanym przez `MathRenderer`; komórka raportu
tekstowego — słowa i symbol w zapisie LaTeX (format wzoru raportu, jak linia „Wzór:").

CZEGO SKAN NIE LICZY — reguły strukturalne, nie lista wyjątków (każda z uzasadnieniem):
  1. Docstring (pierwsza instrukcja modułu/klasy/funkcji) i docstring atrybutu (gołe
     wyrażenie tekstowe w dowolnym miejscu, np. po polu klasy) — komentarz dla programisty;
     goła stała tekstowa nie ma wartości, więc nie trafia do żadnego wyjścia.
  2. Komunikat `assert` i argumenty `AssertionError` — niezmiennik kodu, nie tekst UI.
  3. Argumenty wywołań loggera (`*.debug/info/warning/error/exception/critical/log` na
     obiekcie, którego nazwa zawiera „log") — dziennik serwera, nie ekran.
  4. Identyfikatory i kody wewnątrz tekstu: fragmenty w odwrotnych apostrofach, identyfikatory
     snake_case z co najmniej dwoma podkreślnikami, kody statusów WIELKIMI_LITERAMI, numery
     kart programu (`P0.7`), kody błędów w przestrzeni nazw (`generator.q_missing`) i adresy URL (ścieżka dokumentu źródłowego to odsyłacz, nie
     symbol — `…/legislation.gov.uk/…`, `…-pdf_Original…`).
  5. `EquationDefinition(notes=...)` w `application/proof_engine/equation_registry.py` —
     pole idzie wyłącznie do `proof.json` (`EquationDefinition.to_dict`); eksport LaTeX/PDF,
     inspektor dowodu i frontend go nie renderują (pomiar 2026-10-30, karta ZU).
  6. Ślad solvera V12.6 (`network_model/solvers/v126_academic.py`, rdzeń B-01): argument
     wzoru `trace.add(klucz, WZÓR, …)` (i zmienna `formula` podawana w to miejsce) — każdy
     klucz ma bliźniaczy zapis LaTeX w `application/analyses/v126_wzory.py`
     (`REJESTR_WZOROW_V126`, test kompletności z AST rdzenia), ekran renderuje LaTeX;
     argument podstawienia `trace.add(klucz, wzór, wejścia, PODSTAWIENIE, …)` — tylko dla
     kluczy, które w rejestrze mają budowniczego podstawienia (`podstawienie=`), bo wtedy
     ekran pokazuje `substitution_latex`.
  7. Ślad testów NC RfG (`network_model/solvers/ncrfg_ptpiree/engine.py`, rdzeń B-01):
     argument wzoru `trace.add(id, nazwa, WZÓR, …)` — każdy zapis ma wpis LaTeX w
     `application/ncrfg_compliance/wzory_sladu.py` (test kompletności z AST rdzenia, obie
     gałęzie wyrażeń warunkowych), widok śladu renderuje go przez `MathBlock`.
     Klucze słownika rejestru `wzory_sladu.py` są tym samym zapisem rdzenia (klucz wyszukania,
     nie tekst ekranu) — skan ich nie liczy; wartości (LaTeX) i każdy inny tekst rejestru tak.

  8. Wartość pola LaTeX: argument nazwany `latex`/`*_latex` i wartość klucza słownika
     `latex`/`*_latex` — zapis wzoru dla `MathRenderer`, nie proza (`Z'_1 = Z_s - Z_m` bez
     ukośnika też jest LaTeX-em). Ten sam tekst pod inną nazwą pola jest liczony.

  9. `Field(description=...)` w `domain/result_contract_v1.py` — opis pola jest częścią
     zamrożonego schematu `backend/schemas/resultset_v1_schema.json` (kontrakt FROZEN,
     `resultset_v1_schema_guard.py`); zmiana tekstu to zmiana kontraktu z podniesieniem
     wersji. Opis służy integratorowi API (identyfikator `ref_id`, kody metryk), ekran go nie
     pokazuje. Każdy inny tekst tego pliku jest liczony.

  10. Wartość zmiennej, która w tej samej funkcji idzie do pola `latex`/`*_latex`
     (`formula = r"Z_k = Z_1"` … `formula_latex=formula`, klucz słownika albo przypisanie
     `krok["substitution_latex"] = podstawienie`), i element krotki zwracanej przez
     funkcję modułu rozpakowywanej do takiej zmiennej — zapis LaTeX bez ukośnika, nie proza.
     Ta sama wartość zmiennej, która do pola LaTeX nie idzie, jest liczona.

ZAPADKA PER PLIK (pin z pomiaru, w obie strony): `guard_references/backend_proza_symboli_pin.json`
trzyma zmierzoną liczbę trafień każdego pliku. Plik spoza mapy ma pin 0 — nowy moduł startuje
czysty. Więcej niż pin = czerwień (nowa proza z symbolem spłaszczonym). Mniej niż pin = też
czerwień: obniż pin `--aktualizuj` (zapis odmawia, gdy którykolwiek plik przekracza pin), żeby
zapadka nie stała się martwą liczbą.

EXIT 0 = każdy plik dokładnie na pinie; EXIT 1 = przekroczenie albo pin nieświeży.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import Counter
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "backend" / "src"
PIN_PLIK = Path(__file__).resolve().parent / "guard_references" / "backend_proza_symboli_pin.json"

#: Symbol z indeksem (`U_n`, `I_th`, `Z_0`), znak symbolu spłaszczonego (prim, bis, φ, indeks
#: dolny Unicode), zapis `Ik''`, `IΔ`, symbol wielkości z kwadratem Unicode (`I²t`, `k²S²`,
#: `β²` — jednostka `A²`, `mm²` nie jest symbolem: litera A i przedrostek słowny odpadają)
#: i symbole elektrotechniki pisane bez podkreślnika (`Ik3`, `Un`, `ip`, `t_b`, `cos`, `R0`,
#: `Pmax`, `S min`).
SYMBOL_RE = re.compile(
    r"""(?x)
    (?<![\w])[^\W\d_]{1,3}_[^\W_]\w{0,8}(?![\w]) | [″′φ₀-₉] | (?<![\w])[A-Za-z]{1,2}'' | IΔ
    | (?<![\w])[IkSPQUZRXβ]²
    | (?<![\w])(?:
        I(?:k|p|b|th|dyn|cw|n|r|a|q|d|max|min|k3|kmax|kmin|0|1|2)
      | U(?:n|r|m|k|max|min|0|1|2) | u(?:k|kr) | i(?:p|b|DC) | t(?:k|b)
      | P(?:k|0|max|min|n) | Q(?:max|min|n) | S(?:n|k|k3|kmax|kmin|r)
      | [XZ][012] | [RXZ]k | Zn | R0 | B0 | cos | tg
      | [PQSIU]\ (?:min|max)
    )(?!\w)
    """
)
#: Tekst dla człowieka: znak diakrytyczny albo słowo z co najmniej czterech liter
#: (wielka litera tylko na początku słowa).
#: Kryterium strukturalne, nie słownik: lista słów funkcyjnych i rdzeni (pomiar 2026-11-04)
#: przepuszczała prozę spoza listy („Susceptancja B′1", „Stosunek X′0/X′1") i każdą prozę
#: angielską („Equivalent impedance is zero; cannot compute Ik''"), a ekran i raport pokazują
#: oba rodzaje tak samo.
POLSKI_RE = re.compile(r"[ąćęłńóśźż]|\b(?:[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{3,}|[a-ząćęłńóśźż]{4,})\b")
_LOGGER = frozenset({"debug", "info", "warning", "warn", "error", "exception", "critical", "log"})

PLIK_REJESTRU_ROWNAN = "application/proof_engine/equation_registry.py"
PLIK_V126 = "network_model/solvers/v126_academic.py"
PLIK_REJESTRU_V126 = "application/analyses/v126_wzory.py"
PLIK_NCRFG = "network_model/solvers/ncrfg_ptpiree/engine.py"
PLIK_WZOROW_NCRFG = "application/ncrfg_compliance/wzory_sladu.py"
PLIK_KONTRAKTU_RESULTSET = "domain/result_contract_v1.py"


def oczysc(tekst: str) -> str:
    """Usuwa z tekstu identyfikatory i kody (reguła 4) — zostaje proza."""
    tekst = re.sub(r"`[^`]*`", " ", tekst)
    tekst = re.sub(r"https?://\S+", " ", tekst)
    tekst = re.sub(r"\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+){2,}\b", " ", tekst)
    # Kod błędu w przestrzeni nazw („kod 'generator.q_missing'") — identyfikator, nie symbol.
    tekst = re.sub(r"\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\b", " ", tekst)
    # Numer karty albo punktu programu („karty P0.7", „P0.6") — odwołanie, nie symbol P0.
    tekst = re.sub(r"\b[A-Z]\d+\.\d+\b", " ", tekst)
    return re.sub(r"\b[A-ZĄĆĘŁŃÓŚŹŻ]{2,}(?:_[A-ZĄĆĘŁŃÓŚŹŻ0-9]{2,})+\b", " ", tekst)


#: Znak wzoru albo podstawienia: relacja, iloczyn albo miejsce na liczbę (`{}` f-stringu).
WZOR_RE = re.compile(r"[=≥≤×·]|\{\}")
#: Znak działania matematycznego — tekst z nim jest zapisem dla człowieka także bez spacji
#: (`{}×In`, `5·I_Δn`); identyfikator kodu takiego znaku nie zawiera.
ZNAK_DZIALANIA_RE = re.compile(r"[×≥≤·]")


def _czysty_tekst(tekst: str | None) -> str | None:
    """Tekst po regule 4 albo `None`, gdy to już LaTeX (ukośnik, `$`, indeks w klamrach) lub
    znakowanie (`<…`)."""
    if tekst is None or "\\" in tekst or "$" in tekst or re.search(r"[_^]\{", tekst):
        return None
    if tekst.lstrip().startswith("<"):
        return None  # znaczniki (XML pakietu XLSX, HTML) — nie proza
    return oczysc(tekst)


def jest_proza_z_symbolem(tekst: str | None) -> bool:
    czysty = _czysty_tekst(tekst)
    if czysty is None:
        return False
    return " " in czysty and bool(POLSKI_RE.search(czysty)) and bool(SYMBOL_RE.search(czysty))


def jest_wzorem_bez_slow(tekst: str | None) -> bool:
    """Tekst będący samym wzorem albo podstawieniem bez żadnego słowa (`Z_k = {} + {}`,
    `Ik''={} kA`, `U0 = {} V; U_b = {} V`): symbol spłaszczony, znak wzoru, spacja albo znak
    działania (zapis dla człowieka, nie identyfikator) i brak słowa (`POLSKI_RE`)."""
    czysty = _czysty_tekst(tekst)
    if czysty is None:
        return False
    return (
        (" " in czysty.strip() or bool(ZNAK_DZIALANIA_RE.search(czysty)))
        and not POLSKI_RE.search(czysty)
        and bool(SYMBOL_RE.search(czysty))
        and bool(WZOR_RE.search(czysty))
    )


def jest_trafieniem(tekst: str | None) -> bool:
    """Klasa strażnika: proza z symbolem spłaszczonym albo wzór/podstawienie bez słów."""
    return jest_proza_z_symbolem(tekst) or jest_wzorem_bez_slow(tekst)


def _tekst(wezel: ast.AST) -> str | None:
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        return wezel.value
    if isinstance(wezel, ast.JoinedStr):
        return "".join(
            (c.value if isinstance(c, ast.Constant) and isinstance(c.value, str) else "{}")
            for c in wezel.values
        )
    return None


def _pole_latex(nazwa: str) -> bool:
    """Pole zapisu LaTeX (`latex`, `*_latex`) — wartość renderuje KaTeX (reguła 8)."""
    return nazwa == "latex" or nazwa.endswith("_latex")


def _oznacz(wezel: ast.AST, pomin: set[int]) -> None:
    for x in ast.walk(wezel):
        pomin.add(id(x))


def klucze_v126_z_podstawieniem(src: Path | None = None) -> frozenset[str]:
    """Klucze `REJESTR_WZOROW_V126`, które mają budowniczego podstawienia LaTeX (reguła 6)."""
    src = SRC if src is None else src
    drzewo = ast.parse((src / PLIK_REJESTRU_V126).read_text(encoding="utf-8"))
    klucze: set[str] = set()
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.Dict):
            continue
        for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
            if (
                isinstance(klucz, ast.Constant)
                and isinstance(klucz.value, str)
                and isinstance(wartosc, ast.Call)
                and any(
                    k.arg == "podstawienie"
                    and not (isinstance(k.value, ast.Constant) and k.value.value is None)
                    for k in wartosc.keywords
                )
            ):
                klucze.add(klucz.value)
    return frozenset(klucze)


def _wywolanie_trace_add(wezel: ast.AST) -> bool:
    return (
        isinstance(wezel, ast.Call)
        and isinstance(wezel.func, ast.Attribute)
        and wezel.func.attr == "add"
        and "trace" in ast.unparse(wezel.func.value)
    )


def _nazwy_do_pola_latex(funkcja: ast.AST) -> set[str]:
    """Nazwy zmiennych podawane w funkcji jako wartość pola `latex`/`*_latex` (reguła 10)."""
    nazwy: set[str] = set()
    for w in ast.walk(funkcja):
        if isinstance(w, ast.Call):
            for k in w.keywords:
                if k.arg is not None and _pole_latex(k.arg) and isinstance(k.value, ast.Name):
                    nazwy.add(k.value.id)
        if isinstance(w, ast.Dict):
            for klucz, wartosc in zip(w.keys, w.values, strict=True):
                if (
                    isinstance(klucz, ast.Constant)
                    and isinstance(klucz.value, str)
                    and _pole_latex(klucz.value)
                    and isinstance(wartosc, ast.Name)
                ):
                    nazwy.add(wartosc.id)
        # `krok["substitution_latex"] = podstawienie` — ten sam przepływ co klucz słownika.
        if isinstance(w, ast.Assign) and isinstance(w.value, ast.Name):
            for cel in w.targets:
                if (
                    isinstance(cel, ast.Subscript)
                    and isinstance(cel.slice, ast.Constant)
                    and isinstance(cel.slice.value, str)
                    and _pole_latex(cel.slice.value)
                ):
                    nazwy.add(w.value.id)
    return nazwy


def _oznacz_przeplyw_do_latex(drzewo: ast.AST, pomin: set[int]) -> None:
    """Reguła 10: wartość przypisana zmiennej, która w tej samej funkcji idzie do pola
    `*_latex`, jest zapisem LaTeX — także element krotki zwracanej przez funkcję modułu,
    gdy wynik jest rozpakowywany do takiej zmiennej (`wzor, podst = _wzor_petli(...)`)."""
    funkcje = {
        w.name: w for w in ast.walk(drzewo) if isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef)
    }
    for funkcja in funkcje.values():
        nazwy = _nazwy_do_pola_latex(funkcja)
        if not nazwy:
            continue
        for w in ast.walk(funkcja):
            if not isinstance(w, ast.Assign | ast.AnnAssign) or w.value is None:
                continue
            cele = w.targets if isinstance(w, ast.Assign) else [w.target]
            for cel in cele:
                if isinstance(cel, ast.Name) and cel.id in nazwy:
                    _oznacz(w.value, pomin)
                if isinstance(cel, ast.Tuple) and isinstance(w.value, ast.Call):
                    nazwa_wolanej = getattr(w.value.func, "attr", None) or getattr(
                        w.value.func, "id", None
                    )
                    wolana = funkcje.get(str(nazwa_wolanej))
                    indeksy = [
                        i
                        for i, e in enumerate(cel.elts)
                        if isinstance(e, ast.Name) and e.id in nazwy
                    ]
                    if wolana is None or not indeksy:
                        continue
                    for zwrot in ast.walk(wolana):
                        if isinstance(zwrot, ast.Return) and isinstance(zwrot.value, ast.Tuple):
                            for i in indeksy:
                                if i < len(zwrot.value.elts):
                                    _oznacz(zwrot.value.elts[i], pomin)


def _pominiete(drzewo: ast.AST, wzgledna: str, klucze_v126: frozenset[str]) -> set[int]:
    pomin: set[int] = set()
    _oznacz_przeplyw_do_latex(drzewo, pomin)
    for w in ast.walk(drzewo):
        cialo = getattr(w, "body", None)
        if (
            isinstance(w, ast.Module | ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
            and cialo
            and isinstance(cialo[0], ast.Expr)
            and isinstance(cialo[0].value, ast.Constant)
        ):
            pomin.add(id(cialo[0].value))
        if (
            isinstance(w, ast.Expr)
            and isinstance(w.value, ast.Constant)
            and isinstance(w.value.value, str)
        ):
            # Docstring atrybutu (gołe wyrażenie tekstowe po polu klasy) — reguła 1.
            pomin.add(id(w.value))
        if isinstance(w, ast.Assert) and w.msg is not None:
            _oznacz(w.msg, pomin)
        if isinstance(w, ast.JoinedStr):
            for czesc in w.values:
                pomin.add(id(czesc))
        if wzgledna == PLIK_WZOROW_NCRFG and isinstance(w, ast.Dict):
            # Klucz rejestru = zapis wzoru rdzenia NC RfG (reguła 7), wartość = LaTeX ekranu.
            for klucz in w.keys:
                if klucz is not None:
                    _oznacz(klucz, pomin)
        if isinstance(w, ast.Dict):
            for klucz, wartosc in zip(w.keys, w.values, strict=True):
                if (
                    isinstance(klucz, ast.Constant)
                    and isinstance(klucz.value, str)
                    and _pole_latex(klucz.value)
                ):
                    _oznacz(wartosc, pomin)
        if isinstance(w, ast.Call):
            for k in w.keywords:
                if k.arg is not None and _pole_latex(k.arg):
                    _oznacz(k.value, pomin)
        if not isinstance(w, ast.Call):
            continue
        f = w.func
        nazwa = getattr(f, "attr", None) or getattr(f, "id", None)
        obiekt = getattr(f, "value", None)
        nazwa_obiektu = getattr(obiekt, "id", None) or getattr(obiekt, "attr", None) or ""
        if (nazwa in _LOGGER and "log" in nazwa_obiektu.lower()) or nazwa == "AssertionError":
            for argument in [*w.args, *(k.value for k in w.keywords)]:
                _oznacz(argument, pomin)
        if wzgledna == PLIK_KONTRAKTU_RESULTSET and nazwa == "Field":
            # Opis pola kontraktu ResultSet v1 (reguła 9) — tekst schematu FROZEN.
            for k in w.keywords:
                if k.arg == "description":
                    _oznacz(k.value, pomin)
        if wzgledna == PLIK_REJESTRU_ROWNAN and nazwa == "EquationDefinition":
            for k in w.keywords:
                if k.arg == "notes":
                    _oznacz(k.value, pomin)
        if wzgledna == PLIK_V126 and _wywolanie_trace_add(w) and len(w.args) >= 2:
            _oznacz(w.args[1], pomin)
            klucz = w.args[0]
            if len(w.args) >= 4 and isinstance(klucz, ast.Constant) and klucz.value in klucze_v126:
                _oznacz(w.args[3], pomin)
        if wzgledna == PLIK_NCRFG and _wywolanie_trace_add(w) and len(w.args) >= 3:
            _oznacz(w.args[2], pomin)
    if wzgledna == PLIK_V126:
        # Zmienna `formula` podawana jako argument wzoru `trace.add` (reguła 6).
        for w in ast.walk(drzewo):
            if isinstance(w, ast.Assign) and any(
                isinstance(c, ast.Name) and c.id == "formula" for c in w.targets
            ):
                _oznacz(w.value, pomin)
    return pomin


def trafienia_pliku(
    sciezka: Path, wzgledna: str, klucze_v126: frozenset[str]
) -> Iterator[tuple[int, str]]:
    drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
    pomin = _pominiete(drzewo, wzgledna, klucze_v126)
    for w in ast.walk(drzewo):
        if id(w) in pomin:
            continue
        tekst = _tekst(w)
        if jest_trafieniem(tekst):
            yield getattr(w, "lineno", 0), str(tekst)


def zmierz(src: Path | None = None) -> dict[str, list[tuple[int, str]]]:
    src = SRC if src is None else src
    klucze_v126 = (
        klucze_v126_z_podstawieniem(src) if (src / PLIK_REJESTRU_V126).exists() else (frozenset())
    )
    wynik: dict[str, list[tuple[int, str]]] = {}
    for sciezka in sorted(src.rglob("*.py")):
        if "__pycache__" in sciezka.parts:
            continue
        wzgledna = sciezka.relative_to(src).as_posix()
        trafienia = sorted(trafienia_pliku(sciezka, wzgledna, klucze_v126))
        if trafienia:
            wynik[wzgledna] = trafienia
    return wynik


def wczytaj_pin(plik: Path | None = None) -> dict[str, int]:
    plik = PIN_PLIK if plik is None else plik
    return {k: int(v) for k, v in json.loads(plik.read_text(encoding="utf-8")).items()}


def porownaj(
    zmierzone: dict[str, list[tuple[int, str]]], pin: dict[str, int]
) -> tuple[list[str], list[str]]:
    """(przekroczenia, piny nieświeże) — oba niepuste = czerwień."""
    licznik = Counter({k: len(v) for k, v in zmierzone.items()})
    przekroczenia = sorted(k for k in licznik if licznik[k] > pin.get(k, 0))
    nieswieze = sorted(k for k in pin if licznik.get(k, 0) < pin[k])
    return przekroczenia, nieswieze


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--aktualizuj",
        action="store_true",
        help="obniż piny do pomiaru (odmawia, gdy którykolwiek plik przekracza pin)",
    )
    parser.add_argument(
        "--inicjuj",
        action="store_true",
        help="pierwszy zapis pinu z pomiaru (tylko gdy pliku pinu jeszcze nie ma)",
    )
    parser.add_argument("--lista", action="store_true", help="wypisz wszystkie trafienia")
    args = parser.parse_args(argv)
    if not SRC.is_dir():
        print(f"FAILED: brak katalogu {SRC}")
        return 1
    zmierzone = zmierz()
    pin = wczytaj_pin() if PIN_PLIK.exists() else {}
    przekroczenia, nieswieze = porownaj(zmierzone, pin)
    razem = sum(len(v) for v in zmierzone.values())
    if args.lista:
        for plik, trafienia in zmierzone.items():
            for linia, tekst in trafienia:
                print(f"{plik}:{linia}\t{tekst[:200]!r}")
    print(
        f"Zmierzono: {razem} tekstów prozy z symbolem spłaszczonym albo wzorów bez słów "
        f"w {len(zmierzone)} plikach "
        f"(pin łącznie {sum(pin.values())})."
    )
    for plik in przekroczenia:
        print(f"\nPRZEKROCZENIE {plik}: {len(zmierzone[plik])} > pin {pin.get(plik, 0)}")
        for linia, tekst in zmierzone[plik]:
            print(f"  {plik}:{linia}\t{tekst[:200]!r}")
    if args.inicjuj:
        if PIN_PLIK.exists():
            print(f"FAILED: pin już istnieje ({PIN_PLIK}) — obniżaj go przez --aktualizuj.")
            return 1
        przekroczenia = []
        args.aktualizuj = True
    if args.aktualizuj:
        if przekroczenia:
            print("\nFAILED: --aktualizuj odmawia podniesienia pinu — napisz te teksty słowami.")
            return 1
        PIN_PLIK.write_text(
            json.dumps({k: len(v) for k, v in zmierzone.items()}, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"Zapisano pin: {PIN_PLIK}")
        return 0
    if przekroczenia:
        print(
            "\nFAILED: symbol w prozie pisz słowami, wzór i podstawienie podaj polem *_latex "
            "(KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md)."
        )
        return 1
    if nieswieze:
        print("\nFAILED: pin nieświeży (zmierzono mniej) — obniż go: --aktualizuj")
        for plik in nieswieze:
            print(f"  {plik}: {len(zmierzone.get(plik, []))} < pin {pin[plik]}")
        return 1
    print("OK: każdy plik na pinie.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

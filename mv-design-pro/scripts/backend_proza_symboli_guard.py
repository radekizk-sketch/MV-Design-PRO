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
symbol z indeksem albo symbol spłaszczony (`SYMBOL_RE`). Tekst z ukośnikiem albo z `$` jest
już LaTeX-em (polecenie albo segment wzoru) i nie jest prozą spłaszczoną.

CZEGO SKAN NIE LICZY — reguły strukturalne, nie lista wyjątków (każda z uzasadnieniem):
  1. Docstring (pierwsza instrukcja modułu/klasy/funkcji) — komentarz dla programisty.
  2. Komunikat `assert` i argumenty `AssertionError` — niezmiennik kodu, nie tekst UI.
  3. Argumenty wywołań loggera (`*.debug/info/warning/error/exception/critical/log` na
     obiekcie, którego nazwa zawiera „log") — dziennik serwera, nie ekran.
  4. Identyfikatory i kody wewnątrz tekstu: fragmenty w odwrotnych apostrofach, identyfikatory
     snake_case z co najmniej dwoma podkreślnikami, kody statusów WIELKIMI_LITERAMI, numery
     kart programu (`P0.7`).
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
#: dolny Unicode), zapis `Ik''`, `IΔ` i symbole elektrotechniki pisane bez podkreślnika
#: (`Ik3`, `Un`, `ip`, `t_b`, `cos`, `R0`, `Pmax`, `S min`).
SYMBOL_RE = re.compile(
    r"""(?x)
    (?<![\w])[^\W\d_]{1,3}_[^\W_]\w{0,8}(?![\w]) | [″′φ₀-₉] | (?<![\w])[A-Za-z]{1,2}'' | IΔ
    | (?<![\w])(?:
        I(?:k|p|b|th|dyn|cw|n|r|a|q|d|max|min|k3|kmax|kmin|0|1|2)
      | U(?:n|r|m|k|max|min|0|1|2) | u(?:k|kr) | i(?:p|b|DC) | t(?:k|b)
      | P(?:k|0|max|min|n) | Q(?:max|min|n) | S(?:n|k|k3|kmax|kmin|r)
      | [XZ][012] | [RXZ]k | Zn | R0 | B0 | cos | tg
      | [PQSIU]\ (?:min|max)
    )(?!\w)
    """
)
#: Słowo polskie: znak diakrytyczny albo częste słowo funkcyjne (tekst dla człowieka).
POLSKI_RE = re.compile(r"[ąćęłńóśźż]|\b(?:i|lub|albo|nie|dla|jest|brak|z|w|na)\b", re.I)
_LOGGER = frozenset({"debug", "info", "warning", "warn", "error", "exception", "critical", "log"})

PLIK_REJESTRU_ROWNAN = "application/proof_engine/equation_registry.py"
PLIK_V126 = "network_model/solvers/v126_academic.py"
PLIK_REJESTRU_V126 = "application/analyses/v126_wzory.py"
PLIK_NCRFG = "network_model/solvers/ncrfg_ptpiree/engine.py"


def oczysc(tekst: str) -> str:
    """Usuwa z tekstu identyfikatory i kody (reguła 4) — zostaje proza."""
    tekst = re.sub(r"`[^`]*`", " ", tekst)
    tekst = re.sub(r"\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+){2,}\b", " ", tekst)
    # Numer karty albo punktu programu („karty P0.7", „P0.6") — odwołanie, nie symbol P0.
    tekst = re.sub(r"\b[A-Z]\d+\.\d+\b", " ", tekst)
    return re.sub(r"\b[A-ZĄĆĘŁŃÓŚŹŻ]{2,}(?:_[A-ZĄĆĘŁŃÓŚŹŻ0-9]{2,})+\b", " ", tekst)


def jest_proza_z_symbolem(tekst: str | None) -> bool:
    if tekst is None or "\\" in tekst or "$" in tekst:
        return False
    czysty = oczysc(tekst)
    return " " in czysty and bool(POLSKI_RE.search(czysty)) and bool(SYMBOL_RE.search(czysty))


def _tekst(wezel: ast.AST) -> str | None:
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        return wezel.value
    if isinstance(wezel, ast.JoinedStr):
        return "".join(
            c.value if isinstance(c, ast.Constant) and isinstance(c.value, str) else "{}"
            for c in wezel.values
        )
    return None


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


def _pominiete(drzewo: ast.AST, wzgledna: str, klucze_v126: frozenset[str]) -> set[int]:
    pomin: set[int] = set()
    for w in ast.walk(drzewo):
        cialo = getattr(w, "body", None)
        if (
            isinstance(w, ast.Module | ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
            and cialo
            and isinstance(cialo[0], ast.Expr)
            and isinstance(cialo[0].value, ast.Constant)
        ):
            pomin.add(id(cialo[0].value))
        if isinstance(w, ast.Assert) and w.msg is not None:
            _oznacz(w.msg, pomin)
        if isinstance(w, ast.JoinedStr):
            for czesc in w.values:
                pomin.add(id(czesc))
        if not isinstance(w, ast.Call):
            continue
        f = w.func
        nazwa = getattr(f, "attr", None) or getattr(f, "id", None)
        obiekt = getattr(f, "value", None)
        nazwa_obiektu = getattr(obiekt, "id", None) or getattr(obiekt, "attr", None) or ""
        if (nazwa in _LOGGER and "log" in nazwa_obiektu.lower()) or nazwa == "AssertionError":
            for argument in [*w.args, *(k.value for k in w.keywords)]:
                _oznacz(argument, pomin)
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
        if jest_proza_z_symbolem(tekst):
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
        f"Zmierzono: {razem} tekstów prozy z symbolem spłaszczonym w {len(zmierzone)} plikach "
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
            "\nFAILED: symbol w prozie pisz słowami, wzór podaj polem *_latex "
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

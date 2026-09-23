#!/usr/bin/env python3
"""Guard werdyktu wyjasnialnego: werdykt jest OBIEKTEM z pieciu towarzyszami, nie literalem.

PO CO (karta AB-1a D7, audyt warstwy regulacyjnej 2026-09-23 §3.3, plan A/B §6.11).
Werdykt wydany jako goly literal (`{"status": "zgodny"}`, `Verdict(severity, message)`,
pole `verdict: Literal["pass", "fail"]` bez wartosci i wymagania) jest dla odbiorcy
nie do sprawdzenia: nie wiadomo, CO porownano, Z CZYM, z jakim ZAPASEM, na jakiej
PODSTAWIE i gdzie jest DOWOD. Zakaz samych literalow bylby niewykonalny i bledny
(slowniki `pass/fail/no_data/not_required`, `SPELNIA/NIE_SPELNIA/BRAK_PODSTAW` sa
legalnymi czlonkami typow), wiec regula dotyczy OBIEKTU wyniku, nie literalu.

REGULA (audyt §3.3 p. 1-8, przeniesiona w calosci):

1. `TOKENY_WERDYKTU` = {pass, fail, PASS, FAIL, SPELNIA, NIE_SPELNIA, SPEŁNIA,
   NIE SPEŁNIA, zgodny, niezgodny, SPELNIONE, NARUSZONE} — dokladne dopasowanie
   wielkosci liter.
2. NOSNIK WERDYKTU =
   (a) klasa (`BaseModel` / `@dataclass` / `TypedDict` — kazda klasa z polami
       adnotowanymi) z polem, ktorego adnotacja zawiera `Literal[...]` z >= 1 tokenem
       albo ALIAS takiego `Literal` (alias zdefiniowany w dowolnym module
       `backend/src`, bo nosnik importuje go po nazwie);
   (b) literal slownika z kluczem z `KLUCZE_WERDYKTU` = {verdict, werdykt, wynik,
       status, overall_status, compatibility_status} i wartoscia bedaca stala z
       `TOKENY_WERDYKTU` (literal napisu, nazwa stalej modulowej o wartosci-tokenie,
       wyrazenie warunkowe, ktorego obie galezie sa tokenami, albo — AB-1a-bis —
       czlonek enum o wartosci-tokenie: `Status.PASS` / `Status.PASS.value`);
   (c) KARTA AB-1a-bis (domkniecie luki zmierzonej przez wykonawce 2: 7 klas
       `analysis/**` z werdyktem typu `StrEnum` przechodzilo bez zgloszenia):
       klasa jak w (a), ktorej pole ma adnotacje wskazujaca klase wyliczeniowa
       (`Enum`/`StrEnum`/`str, Enum`/enum dziedziczacy po enum) z >= 1 czlonkiem
       o wartosci-tokenie (literal albo `auto()` w `StrEnum`), albo ALIAS takiej
       klasy (`X = Status`, `X = Status | None`, `X: TypeAlias = Optional[Status]`,
       alias aliasu — do punktu stalego). Definicje typow (aliasy `Literal`, enumy
       i ich aliasy) sa zbierane z CALEGO `backend/src` (enum bywa w `domain/**`),
       nosniki — wylacznie z zakresu skanu.
3. GRUPY TOWARZYSZY (kazda grupa: dowolna z nazw), szukane w nosniku ALBO w klasie
   nadrzednej, ktora zawiera go jako pole (zagniezdzenie jak `PozycjaWerdyktu →
   OcenaElementu`), a dla slownika — w kluczach tego slownika albo slownika, ktory
   go zawiera; pola klas bazowych naleza do klasy:
   wartosc {measured, wartosc, value, wartosc_pomiar}; wymaganie {required,
   odniesienie, limit, tolerancja_pct}; margines {margin, margines, odchylka_pct};
   podstawa {basis, podstawa, norma_pl, clause_ref, zrodlo_tolerancji}; dowod
   {evidence, dowod, trace, trace_refs, slad_pl, run_id}.
4. Guard ZGLASZA nosnik, ktoremu brakuje >= 1 grupy, chyba ze jest to
   `WynikInzynierski` albo pole w nim.
5. Guard NIE ZGLASZA: samej definicji typu (`X = Literal[...]`, `class X(StrEnum)`),
   map etykiet (slownik o kluczach bedacych czlonkami typu werdyktu — klucz nie
   nalezy do `KLUCZE_WERDYKTU`, wiec nie jest nosnikiem z definicji), porownan
   (`== "pass"` — to nie slownik ani pole), plikow `tests/**`, `docs/**` (poza
   zakresem skanu).
6. LISTA WYJATKOW `scripts/explainable_verdict_allowlist.txt` — ZAMKNIETA, wylacznie
   nosniki FROZEN (solver B-01 nie moze dostac pol): kazda pozycja z nazwa adaptera,
   ktory opakowuje nosnik w ksztalt wyniku wyjasnialnego (`modul.py::funkcja`) albo
   z adnotacja `WYCOFYWANA_AB-1d_min[ZDOLNOSC]` (zdolnosc wycofywana — adapter nie
   powstaje; legalna, dopoki wpis rejestru NIE jest `withdrawn`) albo
   `WYCOFANA[ZDOLNOSC]` (zdolnosc juz wycofana — legalna WYLACZNIE przy wpisie
   `withdrawn`). Test przypina, ze adapter istnieje i jest wolany przez trase API
   (AST, domkniecie wywolan), a obie adnotacje trzymaja sie wpisu rejestru zdolnosci.
   Pliki FROZEN z nosnikami sa skanowane ZAWSZE (`SKAN_FROZEN`), zeby usuniecie
   pozycji z listy wyjatkow dawalo zgloszenie, a nie cisze.
7. FRONTEND (`--frontend`): ta sama regula na interfejsach
   `frontend/src/ui2/**/api.ts` — propercja typu unii literalow z tokenem (wprost
   albo przez alias `type X = 'a' | 'b'`, albo — AB-1a-bis — enum TS z czlonkiem
   o wartosci-tokenie; aliasy i enumy zbierane z calego `frontend/src/**`, bo
   lustro moze importowac typ z `model.ts` czy `types/**`) bez pieciu grup w tym samym interfejsie,
   w interfejsie rozszerzanym (`extends`) albo w interfejsie nadrzednym, ktory go
   zawiera jako propercje. Lista wyjatkow frontu:
   `scripts/explainable_verdict_frontend_allowlist.txt` (pozycja = `plik::Interfejs.propercja`
   z powodem). Czesc „regula renderu" p. 7 audytu (etykieta werdyktu z `strings.ts`
   w jednym komponencie prezentacji) nalezy do guardu grafu importow — nie do tego
   pliku.
8. Testy mutacyjne: `scripts/test_explainable_verdict_guard.py`.

Uruchomienie: `python scripts/explainable_verdict_guard.py` (backend) oraz
`python scripts/explainable_verdict_guard.py --frontend`. Czysty AST / tekst, bez
zaleznosci. Kod wyjscia 0 = zero zgloszen poza lista wyjatkow, 1 = zgloszenia albo
niespojna lista wyjatkow.
"""

from __future__ import annotations

import ast
import functools
import re
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
FRONTEND_UI2 = PROJECT_ROOT / "frontend" / "src" / "ui2"
ALLOWLIST = Path(__file__).resolve().parent / "explainable_verdict_allowlist.txt"
ALLOWLIST_FRONTEND = Path(__file__).resolve().parent / "explainable_verdict_frontend_allowlist.txt"

#: Korzenie skanu wzgledem BACKEND_SRC (audyt §3.3: warstwy, ktore WYDAJA wynik).
SKAN_ROOTS: tuple[str, ...] = ("api", "application", "analysis", "solver_input")

#: Pliki FROZEN (B-01) zawierajace nosniki z listy wyjatkow — skanowane zawsze
#: (p. 6 reguly: usuniecie pozycji z listy wyjatkow = zgloszenie, nie cisza).
SKAN_FROZEN: tuple[str, ...] = (
    "network_model/solvers/ncrfg_ptpiree/contracts.py",
    "network_model/solvers/v126_academic.py",
)

TOKENY_WERDYKTU: frozenset[str] = frozenset(
    {
        "pass",
        "fail",
        "PASS",
        "FAIL",
        "SPELNIA",
        "NIE_SPELNIA",
        "SPEŁNIA",
        "NIE SPEŁNIA",
        "zgodny",
        "niezgodny",
        "SPELNIONE",
        "NARUSZONE",
    }
)

KLUCZE_WERDYKTU: frozenset[str] = frozenset(
    {"verdict", "werdykt", "wynik", "status", "overall_status", "compatibility_status"}
)

GRUPY_TOWARZYSZY: dict[str, frozenset[str]] = {
    "wartosc": frozenset({"measured", "wartosc", "value", "wartosc_pomiar"}),
    "wymaganie": frozenset({"required", "odniesienie", "limit", "tolerancja_pct"}),
    "margines": frozenset({"margin", "margines", "odchylka_pct"}),
    "podstawa": frozenset({"basis", "podstawa", "norma_pl", "clause_ref", "zrodlo_tolerancji"}),
    "dowod": frozenset({"evidence", "dowod", "trace", "trace_refs", "slad_pl", "run_id"}),
}

#: Nazwa kontraktu wyniku wyjasnialnego (p. 4 reguly) — nosnik o tej nazwie i jego
#: pola sa z definicji zgodne.
WYNIK_INZYNIERSKI = "WynikInzynierski"

ADNOTACJA_WYCOFYWANA = re.compile(r"^WYCOFYWANA_AB-1d_min\[([A-Z0-9_]+)\]$")
#: Karta AB-1d_min krok 3: zdolnosc JUZ wycofana z powierzchni (`availability="withdrawn"`
#: rejestru, 410 na POST, brak prezentacji na ekranie) — nosnik FROZEN zostaje w solverze
#: do kasacji kodu (OD-15(d)), adapter nie powstaje. Para z rejestrem: adnotacja legalna
#: WYLACZNIE, gdy wpis jest `withdrawn` (przywrocenie zdolnosci = adapter albo blad).
ADNOTACJA_WYCOFANA = re.compile(r"^WYCOFANA\[([A-Z0-9_]+)\]$")


@dataclass(frozen=True)
class Zgloszenie:
    """Jedno zgloszenie guardu: stabilny identyfikator nosnika + opis braku."""

    ident: str
    plik: str
    linia: int
    brakujace: tuple[str, ...]

    def opis(self) -> str:
        return (
            f"{self.plik}:{self.linia}: nosnik werdyktu {self.ident} bez towarzyszy: "
            + ", ".join(self.brakujace)
        )


# ---------------------------------------------------------------------------
# Wspolne
# ---------------------------------------------------------------------------


def brakujace_grupy(nazwy: Iterable[str]) -> tuple[str, ...]:
    """Grupy towarzyszy, ktorych ZADNA nazwa nie wystepuje w `nazwy`."""
    zbior = set(nazwy)
    return tuple(grupa for grupa, czlony in GRUPY_TOWARZYSZY.items() if not (zbior & czlony))


# ---------------------------------------------------------------------------
# Backend (AST)
# ---------------------------------------------------------------------------


def _tokeny_literalu(wezel: ast.AST) -> set[str]:
    """Tokeny werdyktu wewnatrz KAZDEGO `Literal[...]` w wyrazeniu adnotacji."""
    znalezione: set[str] = set()
    for pod in ast.walk(wezel):
        if not isinstance(pod, ast.Subscript):
            continue
        nazwa = pod.value
        if isinstance(nazwa, ast.Attribute):
            nazwa_txt = nazwa.attr
        elif isinstance(nazwa, ast.Name):
            nazwa_txt = nazwa.id
        else:
            continue
        if nazwa_txt != "Literal":
            continue
        for stala in ast.walk(pod.slice):
            if isinstance(stala, ast.Constant) and isinstance(stala.value, str):
                if stala.value in TOKENY_WERDYKTU:
                    znalezione.add(stala.value)
    return znalezione


def _nazwy_w_adnotacji(wezel: ast.AST) -> set[str]:
    nazwy: set[str] = set()
    for pod in ast.walk(wezel):
        if isinstance(pod, ast.Name):
            nazwy.add(pod.id)
        elif isinstance(pod, ast.Attribute):
            nazwy.add(pod.attr)
        elif isinstance(pod, ast.Constant) and isinstance(pod.value, str):
            # adnotacje w cudzyslowie (forward reference): "OcenaElementu"
            try:
                wyr = ast.parse(pod.value, mode="eval")
            except SyntaxError:
                continue
            nazwy |= _nazwy_w_adnotacji(wyr)
    return nazwy


def aliasy_werdyktu(drzewo: ast.Module) -> set[str]:
    """Nazwy aliasow `X = Literal[...]` (i `X: TypeAlias = ...`, `type X = ...`) z tokenem."""
    aliasy: set[str] = set()
    for wezel in drzewo.body:
        if isinstance(wezel, ast.Assign) and len(wezel.targets) == 1:
            cel = wezel.targets[0]
            if isinstance(cel, ast.Name) and _tokeny_literalu(wezel.value):
                aliasy.add(cel.id)
        elif isinstance(wezel, ast.AnnAssign) and isinstance(wezel.target, ast.Name):
            if wezel.value is not None and _tokeny_literalu(wezel.value):
                aliasy.add(wezel.target.id)
        elif type(wezel).__name__ == "TypeAlias":  # `type X = Literal[...]` (3.12+)
            nazwa = getattr(wezel, "name", None)
            wartosc = getattr(wezel, "value", None)
            if isinstance(nazwa, ast.Name) and wartosc is not None and _tokeny_literalu(wartosc):
                aliasy.add(nazwa.id)
    return aliasy


#: Bazy klas wyliczeniowych (AB-1a-bis). `class X(str, Enum)` ma baze `Enum`.
BAZY_ENUM: frozenset[str] = frozenset({"Enum", "StrEnum", "IntEnum", "Flag", "IntFlag"})


def _nazwa_bazy(baza: ast.expr) -> str:
    if isinstance(baza, ast.Name):
        return baza.id
    if isinstance(baza, ast.Attribute):
        return baza.attr
    return ""


def _wartosc_czlonka(wartosc: ast.expr, nazwa: str, strenum: bool) -> str | None:
    """Wartosc napisowa czlonka enum: literal albo `auto()` w `StrEnum` (= nazwa malymi)."""
    if isinstance(wartosc, ast.Constant) and isinstance(wartosc.value, str):
        return wartosc.value
    if (
        strenum
        and isinstance(wartosc, ast.Call)
        and _nazwa_bazy(wartosc.func) == "auto"
        and not wartosc.args
    ):
        return nazwa.lower()
    return None


def enumy_werdyktu(pliki: Iterable[ast.Module]) -> dict[str, set[str]]:
    """Klasy `Enum`/`StrEnum` (takze dziedziczace po innym enum) -> czlonkowie-tokeny.

    AB-1a-bis: nosnikiem jest tez pole typowane klasa wyliczeniowa, ktorej >= 1
    czlonek ma wartosc bedaca tokenem werdyktu. Zwraca TYLKO enumy z tokenem.
    Dwa przebiegi: enum dziedziczacy po enum (bez czlonkow — Python zabrania
    rozszerzania enum z czlonkami, wiec to zawsze pusta baza) rozpoznawany po bazie.
    """
    klasy: list[ast.ClassDef] = [
        w for drzewo in pliki for w in ast.walk(drzewo) if isinstance(w, ast.ClassDef)
    ]
    nazwy_enum: set[str] = set()
    zmiana = True
    while zmiana:
        zmiana = False
        for klasa in klasy:
            if klasa.name in nazwy_enum:
                continue
            bazy = {_nazwa_bazy(b) for b in klasa.bases}
            if bazy & (BAZY_ENUM | nazwy_enum):
                nazwy_enum.add(klasa.name)
                zmiana = True
    wynik: dict[str, set[str]] = {}
    for klasa in klasy:
        if klasa.name not in nazwy_enum:
            continue
        bazy = {_nazwa_bazy(b) for b in klasa.bases}
        strenum = "StrEnum" in bazy
        tokeny: set[str] = set()
        for instr in klasa.body:
            if isinstance(instr, ast.Assign) and len(instr.targets) == 1:
                cel = instr.targets[0]
                if isinstance(cel, ast.Name):
                    wart = _wartosc_czlonka(instr.value, cel.id, strenum)
                    if wart in TOKENY_WERDYKTU:
                        tokeny.add(cel.id)
        if tokeny:
            wynik.setdefault(klasa.name, set()).update(tokeny)
    return wynik


def aliasy_nazw(drzewo: ast.Module, cele: set[str]) -> set[str]:
    """Nazwy aliasow wskazujacych na ktorakolwiek z `cele` (`X = Enum`, `X: TypeAlias = ...`,
    `type X = ...`, unie `X = A | None`)."""
    aliasy: set[str] = set()
    for wezel in drzewo.body:
        nazwa: str | None = None
        wartosc: ast.AST | None = None
        if isinstance(wezel, ast.Assign) and len(wezel.targets) == 1:
            if isinstance(wezel.targets[0], ast.Name):
                nazwa, wartosc = wezel.targets[0].id, wezel.value
        elif isinstance(wezel, ast.AnnAssign) and isinstance(wezel.target, ast.Name):
            nazwa, wartosc = wezel.target.id, wezel.value
        elif type(wezel).__name__ == "TypeAlias":
            cel = getattr(wezel, "name", None)
            if isinstance(cel, ast.Name):
                nazwa, wartosc = cel.id, getattr(wezel, "value", None)
        if nazwa is None or wartosc is None or nazwa in cele:
            continue
        if _jest_wyrazeniem_typu(wartosc, cele) and _nazwy_w_adnotacji(wartosc) & cele:
            aliasy.add(nazwa)
    return aliasy


def _jest_wyrazeniem_typu(wezel: ast.AST, cele: set[str]) -> bool:
    """Czy wyrazenie jest wyrazeniem TYPU (alias), a nie wartoscia.

    Typ: nazwa, `modul.Nazwa`, unia `A | B`, subskrypcja `Optional[A]`/`Annotated[A, ...]`.
    Nie-typ: slownik/lista/krotka stalych (`STATUS_ORDER = {Status.PASS: 0}`,
    `__all__ = ["Status"]`), wywolanie, czlonek enum (`DOMYSLNY = Status.PASS`).
    """
    if isinstance(wezel, ast.Name):
        return True
    if isinstance(wezel, ast.Attribute):
        return not (isinstance(wezel.value, ast.Name) and wezel.value.id in cele)
    if isinstance(wezel, ast.BinOp) and isinstance(wezel.op, ast.BitOr):
        return _jest_wyrazeniem_typu(wezel.left, cele) and _jest_wyrazeniem_typu(wezel.right, cele)
    if isinstance(wezel, ast.Constant):
        return wezel.value is None
    if isinstance(wezel, ast.Subscript):
        if not isinstance(wezel.value, ast.Name | ast.Attribute):
            return False
        czlony = wezel.slice.elts if isinstance(wezel.slice, ast.Tuple) else [wezel.slice]
        # Annotated[A, meta]: metadane nie musza byc typem — wystarczy pierwszy argument.
        if _nazwa_bazy(wezel.value) == "Annotated":
            czlony = czlony[:1]
        return all(_jest_wyrazeniem_typu(c, cele) for c in czlony)
    return False


def stale_tokenow(drzewo: ast.Module) -> set[str]:
    """Nazwy stalych modulowych, ktorych wartoscia jest token werdyktu (`WYNIK = "SPELNIA"`)."""
    stale: set[str] = set()
    for wezel in drzewo.body:
        cel: ast.expr | None = None
        wartosc: ast.expr | None = None
        if isinstance(wezel, ast.Assign) and len(wezel.targets) == 1:
            cel, wartosc = wezel.targets[0], wezel.value
        elif isinstance(wezel, ast.AnnAssign):
            cel, wartosc = wezel.target, wezel.value
        if (
            isinstance(cel, ast.Name)
            and isinstance(wartosc, ast.Constant)
            and isinstance(wartosc.value, str)
            and wartosc.value in TOKENY_WERDYKTU
        ):
            stale.add(cel.id)
    return stale


@dataclass
class _Klasa:
    nazwa: str
    plik: str
    linia: int
    bazy: tuple[str, ...]
    pola: dict[str, ast.expr]  # nazwa pola -> adnotacja


def _klasy(drzewo: ast.Module, plik: str) -> list[_Klasa]:
    wynik: list[_Klasa] = []
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.ClassDef):
            continue
        pola: dict[str, ast.expr] = {}
        for instr in wezel.body:
            if isinstance(instr, ast.AnnAssign) and isinstance(instr.target, ast.Name):
                pola[instr.target.id] = instr.annotation
        bazy = tuple(
            (b.id if isinstance(b, ast.Name) else b.attr if isinstance(b, ast.Attribute) else "")
            for b in wezel.bases
        )
        wynik.append(_Klasa(wezel.name, plik, wezel.lineno, bazy, pola))
    return wynik


def _pola_z_bazami(
    klasa: _Klasa, po_nazwie: dict[str, _Klasa], _byly: frozenset[str] = frozenset()
) -> set[str]:
    nazwy = set(klasa.pola)
    for baza in klasa.bazy:
        if baza in po_nazwie and baza not in _byly:
            nazwy |= _pola_z_bazami(po_nazwie[baza], po_nazwie, _byly | {klasa.nazwa})
    return nazwy


def _jest_tokenem(
    wartosc: ast.expr, stale: set[str], enumy: dict[str, set[str]] | None = None
) -> bool:
    if isinstance(wartosc, ast.Constant) and isinstance(wartosc.value, str):
        return wartosc.value in TOKENY_WERDYKTU
    if isinstance(wartosc, ast.Name):
        return wartosc.id in stale
    if isinstance(wartosc, ast.IfExp):
        return _jest_tokenem(wartosc.body, stale, enumy) and _jest_tokenem(
            wartosc.orelse, stale, enumy
        )
    if enumy and isinstance(wartosc, ast.Attribute):
        # `Status.PASS.value` albo `Status.PASS` — czlonek enum o wartosci-tokenie.
        wezel: ast.expr = wartosc
        if wezel.attr == "value" and isinstance(wezel.value, ast.Attribute):
            wezel = wezel.value
        if isinstance(wezel, ast.Attribute) and isinstance(wezel.value, ast.Name):
            return wezel.attr in enumy.get(wezel.value.id, set())
    return False


def _klucze_slownika(slownik: ast.Dict) -> set[str]:
    return {
        k.value for k in slownik.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)
    }


def _rodzice(drzewo: ast.AST) -> dict[ast.AST, ast.AST]:
    rodzic: dict[ast.AST, ast.AST] = {}
    for wezel in ast.walk(drzewo):
        for dziecko in ast.iter_child_nodes(wezel):
            rodzic[dziecko] = wezel
    return rodzic


def _funkcja_otaczajaca(wezel: ast.AST, rodzic: dict[ast.AST, ast.AST]) -> str:
    nazwy: list[str] = []
    biezacy: ast.AST | None = wezel
    while biezacy is not None:
        if isinstance(biezacy, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            nazwy.append(biezacy.name)
        biezacy = rodzic.get(biezacy)
    return ".".join(reversed(nazwy)) or "<modul>"


def typy_werdyktu(drzewa: Iterable[ast.Module]) -> tuple[set[str], dict[str, set[str]]]:
    """(nazwy typow-werdyktow do dopasowania w adnotacjach, enumy -> czlonkowie-tokeny).

    Nazwy typow = aliasy `Literal` z tokenem + klasy enum z czlonkiem-tokenem +
    aliasy tych nazw (przechodnio, do punktu stalego: `A = Status`, `B = A | None`).
    """
    drzewa = list(drzewa)
    enumy = enumy_werdyktu(drzewa)
    nazwy: set[str] = set(enumy)
    for drzewo in drzewa:
        nazwy |= aliasy_werdyktu(drzewo)
    while True:
        nowe: set[str] = set()
        for drzewo in drzewa:
            nowe |= aliasy_nazw(drzewo, nazwy)
        if nowe <= nazwy:
            return nazwy, enumy
        nazwy |= nowe


def zbierz_zgloszenia_backend(
    pliki: dict[str, ast.Module],
    kontekst: Iterable[ast.Module] = (),
) -> list[Zgloszenie]:
    """Wszystkie nosniki werdyktu bez kompletu towarzyszy w podanych drzewach.

    `pliki`: sciezka wzgledna (klucz identyfikatora) -> sparsowany modul (skanowane
    nosniki). `kontekst`: dodatkowe moduly, z ktorych biora sie WYLACZNIE definicje
    typow-werdyktow (aliasy `Literal`, enumy z czlonkiem-tokenem i ich aliasy) —
    nosnik w `analysis/**` importuje `StrEnum` np. z `domain/**`, wiec definicje
    zbiera sie z calego `backend/src`, a nosniki tylko z zakresu skanu.
    """
    klasy: list[_Klasa] = []
    for plik, drzewo in pliki.items():
        klasy.extend(_klasy(drzewo, plik))
    aliasy, enumy = typy_werdyktu([*pliki.values(), *kontekst])
    po_nazwie: dict[str, _Klasa] = {}
    for klasa in klasy:
        po_nazwie.setdefault(klasa.nazwa, klasa)

    zgloszenia: list[Zgloszenie] = []

    # (a) klasy z polem Literal/aliasem z tokenem
    for klasa in klasy:
        if klasa.nazwa == WYNIK_INZYNIERSKI:
            continue
        pola_werdyktu = [
            nazwa
            for nazwa, adnotacja in klasa.pola.items()
            if _tokeny_literalu(adnotacja) or (_nazwy_w_adnotacji(adnotacja) & aliasy)
        ]
        if not pola_werdyktu:
            continue
        nazwy = _pola_z_bazami(klasa, po_nazwie)
        # klasy nadrzedne zawierajace nosnik jako pole (zagniezdzenie)
        for rodzic_kl in klasy:
            if rodzic_kl is klasa:
                continue
            if any(klasa.nazwa in _nazwy_w_adnotacji(adn) for adn in rodzic_kl.pola.values()):
                if rodzic_kl.nazwa == WYNIK_INZYNIERSKI:
                    nazwy |= set().union(*GRUPY_TOWARZYSZY.values())
                nazwy |= _pola_z_bazami(rodzic_kl, po_nazwie)
        brak = brakujace_grupy(nazwy)
        if brak:
            zgloszenia.append(
                Zgloszenie(
                    ident=f"{klasa.plik}::{klasa.nazwa}",
                    plik=klasa.plik,
                    linia=klasa.linia,
                    brakujace=brak,
                )
            )

    # (b) literaly slownikow z kluczem werdyktu i wartoscia-tokenem
    for plik, drzewo in pliki.items():
        stale = stale_tokenow(drzewo)
        rodzic = _rodzice(drzewo)
        # Kilka nosnikow w jednej funkcji dostaje kolejne numery (`#2`, `#3`) w
        # kolejnosci zrodla — kazdy jest osobnym nosnikiem (zadnego nie ukrywamy
        # za pierwszym zgloszeniem tej samej funkcji).
        licznik: dict[str, int] = {}
        slowniki = sorted(
            (w for w in ast.walk(drzewo) if isinstance(w, ast.Dict)),
            key=lambda w: (w.lineno, w.col_offset),
        )
        for wezel in slowniki:
            klucze_werdyktu = [
                k.value
                for k, v in zip(wezel.keys, wezel.values, strict=True)
                if isinstance(k, ast.Constant)
                and isinstance(k.value, str)
                and k.value in KLUCZE_WERDYKTU
                and _jest_tokenem(v, stale, enumy)
            ]
            if not klucze_werdyktu:
                continue
            nazwy = _klucze_slownika(wezel)
            biezacy: ast.AST | None = rodzic.get(wezel)
            while biezacy is not None and not isinstance(biezacy, ast.stmt):
                if isinstance(biezacy, ast.Dict):
                    nazwy |= _klucze_slownika(biezacy)
                biezacy = rodzic.get(biezacy)
            brak = brakujace_grupy(nazwy)
            if not brak:
                continue
            baza = f"{plik}::{_funkcja_otaczajaca(wezel, rodzic)}[{klucze_werdyktu[0]}]"
            licznik[baza] = licznik.get(baza, 0) + 1
            ident = baza if licznik[baza] == 1 else f"{baza}#{licznik[baza]}"
            zgloszenia.append(
                Zgloszenie(ident=ident, plik=plik, linia=wezel.lineno, brakujace=brak)
            )
    return sorted(zgloszenia, key=lambda z: (z.plik, z.linia, z.ident))


def _pliki_backendu(src: Path) -> dict[str, ast.Module]:
    pliki: dict[str, ast.Module] = {}
    for korzen in SKAN_ROOTS:
        for sciezka in sorted((src / korzen).rglob("*.py")):
            pliki[sciezka.relative_to(src).as_posix()] = ast.parse(
                sciezka.read_text(encoding="utf-8"), filename=str(sciezka)
            )
    for wzgledna in SKAN_FROZEN:
        sciezka = src / wzgledna
        pliki[wzgledna] = ast.parse(sciezka.read_text(encoding="utf-8"), filename=str(sciezka))
    return pliki


def _kontekst_backendu(src: Path, skanowane: Iterable[str]) -> list[ast.Module]:
    """Pozostale moduly `backend/src` — zrodlo definicji typow-werdyktow (nie nosnikow)."""
    pominiete = set(skanowane)
    return [
        ast.parse(sciezka.read_text(encoding="utf-8"), filename=str(sciezka))
        for sciezka in sorted(src.rglob("*.py"))
        if sciezka.relative_to(src).as_posix() not in pominiete
    ]


def zgloszenia_drzewa(src: Path) -> list[Zgloszenie]:
    """Zgloszenia na prawdziwym drzewie: nosniki z zakresu skanu, typy z calego `src`."""
    pliki = _pliki_backendu(src)
    return zbierz_zgloszenia_backend(pliki, _kontekst_backendu(src, pliki))


# ---------------------------------------------------------------------------
# Lista wyjatkow (backend)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaWyjatku:
    ident: str
    adapter: str
    powod: str


def wczytaj_liste_wyjatkow(tekst: str) -> list[PozycjaWyjatku]:
    """Format linii: `ident -> adapter | powod` (komentarze `#`, puste linie pomijane)."""
    pozycje: list[PozycjaWyjatku] = []
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        linia = linia.strip()
        if not linia or linia.startswith("#"):
            continue
        if " -> " not in linia or " | " not in linia:
            raise ValueError(
                f"lista wyjatkow, linia {numer}: oczekiwano `ident -> adapter | powod`"
            )
        ident, reszta = linia.split(" -> ", 1)
        adapter, powod = reszta.split(" | ", 1)
        if not powod.strip():
            raise ValueError(f"lista wyjatkow, linia {numer}: brak powodu")
        pozycje.append(PozycjaWyjatku(ident.strip(), adapter.strip(), powod.strip()))
    return pozycje


def _funkcje_modulu(
    drzewo: ast.Module,
) -> dict[str, ast.FunctionDef | ast.AsyncFunctionDef]:
    return {w.name: w for w in drzewo.body if isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef)}


def _wolane_nazwy(funkcja: ast.AST) -> set[str]:
    nazwy: set[str] = set()
    for wezel in ast.walk(funkcja):
        if isinstance(wezel, ast.Call):
            if isinstance(wezel.func, ast.Name):
                nazwy.add(wezel.func.id)
            elif isinstance(wezel.func, ast.Attribute):
                nazwy.add(wezel.func.attr)
    return nazwy


def _jest_trasa(funkcja: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for dekorator in funkcja.decorator_list:
        cel = dekorator.func if isinstance(dekorator, ast.Call) else dekorator
        if isinstance(cel, ast.Attribute) and cel.attr in {
            "get",
            "post",
            "put",
            "patch",
            "delete",
            "api_route",
        }:
            return True
    return False


def adapter_wolany_z_trasy_api(src: Path, adapter: str) -> tuple[bool, str]:
    """Czy funkcja `plik.py::nazwa` istnieje i jest osiagalna z trasy API (domkniecie wywolan).

    Rozwiazanie po NAZWIE funkcji w obrebie `backend/src` (AST) — wystarcza, bo
    pytanie brzmi „czy sciezka uzytkownika dochodzi do adaptera", a nie „ktora
    konkretna definicja". Zwraca (wynik, opis).
    """
    if "::" not in adapter:
        return False, f"adapter {adapter!r} nie ma postaci `plik.py::funkcja`"
    plik, nazwa = adapter.split("::", 1)
    sciezka = src / plik
    if not sciezka.is_file():
        return False, f"plik adaptera {plik} nie istnieje"
    drzewo_adaptera = ast.parse(sciezka.read_text(encoding="utf-8"))
    if nazwa not in _funkcje_modulu(drzewo_adaptera):
        return False, f"funkcja {nazwa} nie istnieje w {plik}"
    if nazwa in _osiagalne_z_tras(src):
        return True, f"{nazwa} osiagalny z trasy API"
    return False, f"{nazwa} nie jest osiagalny z zadnej trasy API"


@functools.lru_cache(maxsize=8)
def _osiagalne_z_tras(src: Path) -> frozenset[str]:
    """Nazwy funkcji osiagalnych z tras API (domkniecie wywolan po nazwie, AST).

    Pamiec podreczna per katalog zrodel w obrebie jednego procesu — graf jest ten
    sam dla kazdej pozycji listy wyjatkow (jeden bieg guardu = jeden odczyt drzewa).
    """
    wolajacy: dict[str, set[str]] = {}  # nazwa funkcji -> nazwy wolane
    trasy: list[str] = []
    for sciezka_py in sorted(src.rglob("*.py")):
        try:
            drzewo = ast.parse(sciezka_py.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        je_api = sciezka_py.relative_to(src).parts[0] == "api"
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
                wolajacy.setdefault(wezel.name, set()).update(_wolane_nazwy(wezel))
                if je_api and _jest_trasa(wezel):
                    trasy.append(wezel.name)
    osiagalne: set[str] = set()
    do_odwiedzenia = list(trasy)
    while do_odwiedzenia:
        biezaca = do_odwiedzenia.pop()
        if biezaca in osiagalne:
            continue
        osiagalne.add(biezaca)
        do_odwiedzenia.extend(wolajacy.get(biezaca, set()) - osiagalne)
    return frozenset(osiagalne)


def _dostepnosc_zdolnosci(src: Path, zdolnosc: str) -> str | None:
    """`availability` wpisu rejestru zdolnosci (AST, bez importu) albo None, gdy brak wpisu."""
    sciezka = src / "application" / "solvers" / "solver_capability_registry.py"
    drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.Call):
            continue
        kw = {k.arg: k.value for k in wezel.keywords if k.arg}
        cap = kw.get("capability")
        if isinstance(cap, ast.Constant) and cap.value == zdolnosc:
            av = kw.get("availability")
            if isinstance(av, ast.Constant) and isinstance(av.value, str):
                return av.value
    return None


def sprawdz_liste_wyjatkow(
    zgloszenia: list[Zgloszenie], pozycje: list[PozycjaWyjatku], src: Path
) -> tuple[list[Zgloszenie], list[str]]:
    """Zwroc (zgloszenia poza lista, bledy listy). Pozycja bez odpowiadajacego
    zgloszenia to martwy wpis (lista ZAMKNIETA — bledem jest tez nadmiar)."""
    bledy: list[str] = []
    po_ident = {p.ident: p for p in pozycje}
    for pozycja in pozycje:
        if not pozycja.ident.startswith(tuple(SKAN_FROZEN)):
            bledy.append(
                f"lista wyjatkow: {pozycja.ident} nie lezy w pliku FROZEN (SKAN_FROZEN) — "
                "nosnik spoza rdzenia zamrozonego ma byc przebudowany, nie wyjety"
            )
        dopasowanie = ADNOTACJA_WYCOFYWANA.match(pozycja.adapter)
        if dopasowanie:
            dost = _dostepnosc_zdolnosci(src, dopasowanie.group(1))
            if dost is None or dost == "withdrawn":
                bledy.append(
                    f"lista wyjatkow: {pozycja.ident} ma adnotacje {pozycja.adapter}, a wpis "
                    f"rejestru zdolnosci {dopasowanie.group(1)} jest {dost or 'nieobecny'} — "
                    "adnotacja znika razem z wpisem rejestru"
                )
            continue
        wycofana = ADNOTACJA_WYCOFANA.match(pozycja.adapter)
        if wycofana:
            dost = _dostepnosc_zdolnosci(src, wycofana.group(1))
            if dost != "withdrawn":
                bledy.append(
                    f"lista wyjatkow: {pozycja.ident} ma adnotacje {pozycja.adapter}, a wpis "
                    f"rejestru zdolnosci {wycofana.group(1)} jest {dost or 'nieobecny'} — "
                    "adnotacja WYCOFANA wymaga wpisu `withdrawn` (zdolnosc na powierzchni "
                    "dostaje adapter)"
                )
            continue
        ok, opis = adapter_wolany_z_trasy_api(src, pozycja.adapter)
        if not ok:
            bledy.append(f"lista wyjatkow: {pozycja.ident}: {opis}")
    idents = {z.ident for z in zgloszenia}
    for pozycja in pozycje:
        if pozycja.ident not in idents:
            bledy.append(f"lista wyjatkow: martwy wpis {pozycja.ident} (brak takiego nosnika)")
    poza = [z for z in zgloszenia if z.ident not in po_ident]
    return poza, bledy


# ---------------------------------------------------------------------------
# Frontend (tekst TS)
# ---------------------------------------------------------------------------

_INTERFEJS = re.compile(
    r"export\s+interface\s+(\w+)(?:<[^>{]*>)?(?:\s+extends\s+([\w\s,<>.]+?))?\s*\{",
    re.M,
)
_ALIAS = re.compile(r"(?:export\s+)?\btype\s+(\w+)\s*=\s*([^;]+);", re.M)
_ENUM_TS = re.compile(r"(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+(\w+)\s*\{", re.M)
_TOKEN_TS = re.compile(r"'([^'\n]*)'|\"([^\"\n]*)\"")
_PROPERCJA = re.compile(r"^\s*(?:readonly\s+)?(\w+)\??\s*:\s*(.+?);?\s*$")


@dataclass
class _Interfejs:
    nazwa: str
    plik: str
    linia: int
    rozszerza: tuple[str, ...]
    propercje: dict[str, tuple[str, int]]  # nazwa -> (typ, linia)


def _blok(tekst: str, start: int) -> tuple[str, int]:
    """Tresc bloku `{...}` od klamry otwierajacej (indeks `start`), z zagniezdzeniem."""
    glebokosc = 0
    for i in range(start, len(tekst)):
        znak = tekst[i]
        if znak == "{":
            glebokosc += 1
        elif znak == "}":
            glebokosc -= 1
            if glebokosc == 0:
                return tekst[start + 1 : i], i
    return tekst[start + 1 :], len(tekst)


def _bez_komentarzy(tekst: str) -> str:
    tekst = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), tekst, flags=re.S)
    return re.sub(r"//[^\n]*", "", tekst)


def aliasy_ts(tekst: str) -> dict[str, str]:
    """Aliasy typow (`type X = ...`) i enumy TS (`enum X { A = 'PASS' }` -> `'PASS'`).

    AB-1a-bis: enum TS z czlonkiem-tokenem jest typem werdyktu tak samo jak unia
    literalow — jego tresc zapisujemy jako unie wartosci czlonkow. Aliasy
    nieeksportowane tez sie licza (propercja moze uzywac typu lokalnego pliku).
    """
    czysty = _bez_komentarzy(tekst)
    aliasy = {m.group(1): m.group(2) for m in _ALIAS.finditer(czysty)}
    for m in _ENUM_TS.finditer(czysty):
        tresc, _koniec = _blok(czysty, m.end() - 1)
        wartosci = [a or b for a, b in _TOKEN_TS.findall(tresc)]
        aliasy[m.group(1)] = " | ".join(f"'{w}'" for w in wartosci) or "never"
    return aliasy


def interfejsy_ts(tekst: str, plik: str) -> tuple[list[_Interfejs], dict[str, str]]:
    """Interfejsy (propercje najwyzszego poziomu) i aliasy typow pliku TS."""
    czysty = _bez_komentarzy(tekst)
    aliasy = aliasy_ts(tekst)
    interfejsy: list[_Interfejs] = []
    for m in _INTERFEJS.finditer(czysty):
        start = m.end() - 1
        tresc, _koniec = _blok(czysty, start)
        linia0 = czysty.count("\n", 0, start) + 1
        propercje: dict[str, tuple[str, int]] = {}
        glebokosc = 0
        biezaca = ""
        biezaca_linia = linia0
        for przesuniecie, wiersz in enumerate(tresc.split("\n")):
            if glebokosc == 0:
                biezaca = wiersz
                biezaca_linia = linia0 + przesuniecie
            else:
                biezaca += " " + wiersz.strip()
            glebokosc += (
                wiersz.count("{") + wiersz.count("(") - wiersz.count("}") - wiersz.count(")")
            )
            if glebokosc <= 0:
                glebokosc = 0
                dop = _PROPERCJA.match(biezaca)
                if dop:
                    propercje[dop.group(1)] = (dop.group(2), biezaca_linia)
                biezaca = ""
        rozszerza = tuple(
            r.strip().split("<")[0] for r in (m.group(2) or "").split(",") if r.strip()
        )
        interfejsy.append(_Interfejs(m.group(1), plik, linia0, rozszerza, propercje))
    return interfejsy, aliasy


def _tokeny_typu_ts(
    typ: str, aliasy: dict[str, str], _byly: frozenset[str] = frozenset()
) -> set[str]:
    znalezione = {(a or b) for a, b in _TOKEN_TS.findall(typ) if (a or b) in TOKENY_WERDYKTU}
    for nazwa in re.findall(r"\b([A-Z]\w*)\b", typ):
        if nazwa in aliasy and nazwa not in _byly:
            znalezione |= _tokeny_typu_ts(aliasy[nazwa], aliasy, _byly | {nazwa})
    return znalezione


def _dolacz_aliasy(cel: dict[str, str], nowe: dict[str, str]) -> None:
    """Ta sama nazwa typu w dwoch plikach -> suma tresci (ostroznie: typ-werdykt w
    KTORYMKOLWIEK z plikow wystarcza, zeby propercja tej nazwy byla sprawdzana)."""
    for nazwa, tresc in nowe.items():
        if nazwa in cel and cel[nazwa] != tresc:
            cel[nazwa] = f"{cel[nazwa]} | {tresc}"
        else:
            cel[nazwa] = tresc


def zbierz_zgloszenia_frontend(
    pliki: dict[str, str], kontekst: Iterable[str] = ()
) -> list[Zgloszenie]:
    """Propercje-werdykty interfejsow `ui2/**/api.ts` bez kompletu towarzyszy.

    `kontekst`: teksty pozostalych plikow TS frontu — zrodlo WYLACZNIE aliasow i
    enumow (AB-1a-bis: lustro w `api.ts` moze typowac status aliasem albo enumem
    zaimportowanym z `types/**` czy `model.ts`)."""
    interfejsy: list[_Interfejs] = []
    aliasy: dict[str, str] = {}
    for tekst in kontekst:
        _dolacz_aliasy(aliasy, aliasy_ts(tekst))
    for plik, tekst in pliki.items():
        i, a = interfejsy_ts(tekst, plik)
        interfejsy.extend(i)
        _dolacz_aliasy(aliasy, a)
    po_nazwie = {i.nazwa: i for i in interfejsy}

    def nazwy_z_rozszerzeniami(
        interfejs: _Interfejs, byly: frozenset[str] = frozenset()
    ) -> set[str]:
        nazwy = set(interfejs.propercje)
        for baza in interfejs.rozszerza:
            if baza in po_nazwie and baza not in byly:
                nazwy |= nazwy_z_rozszerzeniami(po_nazwie[baza], byly | {interfejs.nazwa})
        return nazwy

    zgloszenia: list[Zgloszenie] = []
    for interfejs in interfejsy:
        for prop, (typ, linia) in sorted(interfejs.propercje.items()):
            if not _tokeny_typu_ts(typ, aliasy):
                continue
            nazwy = nazwy_z_rozszerzeniami(interfejs)
            for rodzic in interfejsy:
                if rodzic is interfejs:
                    continue
                if any(
                    re.search(rf"\b{re.escape(interfejs.nazwa)}\b", t)
                    for t, _l in rodzic.propercje.values()
                ):
                    nazwy |= nazwy_z_rozszerzeniami(rodzic)
            brak = brakujace_grupy(nazwy)
            if brak:
                zgloszenia.append(
                    Zgloszenie(
                        ident=f"{interfejs.plik}::{interfejs.nazwa}.{prop}",
                        plik=interfejs.plik,
                        linia=linia,
                        brakujace=brak,
                    )
                )
    return sorted(zgloszenia, key=lambda z: (z.plik, z.linia, z.ident))


def wczytaj_liste_wyjatkow_frontu(tekst: str) -> dict[str, str]:
    """Format linii: `ident | powod`."""
    wynik: dict[str, str] = {}
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        linia = linia.strip()
        if not linia or linia.startswith("#"):
            continue
        if " | " not in linia:
            raise ValueError(f"lista wyjatkow frontu, linia {numer}: oczekiwano `ident | powod`")
        ident, powod = linia.split(" | ", 1)
        if not powod.strip():
            raise ValueError(f"lista wyjatkow frontu, linia {numer}: brak powodu")
        wynik[ident.strip()] = powod.strip()
    return wynik


def _kontekst_frontu(ui2: Path, skanowane: Iterable[str]) -> list[str]:
    """Pozostale pliki `frontend/src/**/*.ts(x)` (bez testow) — zrodlo typow."""
    korzen = ui2.parent.parent  # frontend/
    pominiete = set(skanowane)
    return [
        sciezka.read_text(encoding="utf-8")
        for wzor in ("*.ts", "*.tsx")
        for sciezka in sorted(ui2.parent.rglob(wzor))
        if "__tests__" not in sciezka.parts
        and sciezka.relative_to(korzen).as_posix() not in pominiete
    ]


def zgloszenia_frontu(ui2: Path) -> list[Zgloszenie]:
    """Zgloszenia na prawdziwym drzewie frontu: nosniki z `ui2/**/api.ts`, typy z `src/**`."""
    pliki = _pliki_frontu(ui2)
    return zbierz_zgloszenia_frontend(pliki, _kontekst_frontu(ui2, pliki))


def _pliki_frontu(ui2: Path) -> dict[str, str]:
    korzen = ui2.parent.parent  # frontend/
    return {
        sciezka.relative_to(korzen).as_posix(): sciezka.read_text(encoding="utf-8")
        for sciezka in sorted(ui2.rglob("api.ts"))
        if "__tests__" not in sciezka.parts
    }


# ---------------------------------------------------------------------------
# Wejscie
# ---------------------------------------------------------------------------


def _iter_linie(zgloszenia: Iterable[Zgloszenie]) -> Iterator[str]:
    for z in zgloszenia:
        yield "  " + z.opis()


def main_backend() -> int:
    zgloszenia = zgloszenia_drzewa(BACKEND_SRC)
    pozycje = wczytaj_liste_wyjatkow(ALLOWLIST.read_text(encoding="utf-8"))
    poza, bledy = sprawdz_liste_wyjatkow(zgloszenia, pozycje, BACKEND_SRC)
    if poza or bledy:
        print("explainable_verdict_guard: NARUSZENIA (werdykt bez pieciu towarzyszy)")
        for linia in _iter_linie(poza):
            print(linia)
        for blad in bledy:
            print("  " + blad)
        return 1
    print(
        f"explainable_verdict_guard: OK — {len(zgloszenia)} nosnik(i) FROZEN na liscie "
        f"wyjatkow z adapterem, zero werdyktow bez towarzyszy w {', '.join(SKAN_ROOTS)}."
    )
    return 0


def main_frontend() -> int:
    zgloszenia = zgloszenia_frontu(FRONTEND_UI2)
    wyjatki = wczytaj_liste_wyjatkow_frontu(ALLOWLIST_FRONTEND.read_text(encoding="utf-8"))
    idents = {z.ident for z in zgloszenia}
    poza = [z for z in zgloszenia if z.ident not in wyjatki]
    martwe = sorted(set(wyjatki) - idents)
    if poza or martwe:
        print("explainable_verdict_guard --frontend: NARUSZENIA")
        for linia in _iter_linie(poza):
            print(linia)
        for ident in martwe:
            print(f"  lista wyjatkow frontu: martwy wpis {ident}")
        return 1
    print(
        f"explainable_verdict_guard --frontend: OK — {len(zgloszenia)} pozycji na liscie "
        "wyjatkow z powodem, zero nowych werdyktow bez towarzyszy w ui2/**/api.ts."
    )
    return 0


def main(argv: list[str]) -> int:
    if "--frontend" in argv:
        return main_frontend()
    return main_backend()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

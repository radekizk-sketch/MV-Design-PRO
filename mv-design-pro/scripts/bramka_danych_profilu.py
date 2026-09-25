#!/usr/bin/env python3
"""Bramka danych właściciela (OD-21) — podstawy profilu NC RfG o stanie NIEUSTALONE.

PO CO (plan A/B §12.1, decyzja O-43; karta AB-1a §0 pkt 12, Pakiet E). Werdykt zgodności wobec
limitu o stanie źródła `NIEUSTALONE` nie jest wydawany (`BRAK_PODSTAWY`, decyzja O-2′), a
wymaganie wykazywane certyfikatem bez wskazanej reguły pokrycia kończy się `BRAK_DOWODU` (O-17).
Bez jawnej listy tego, CZEGO brakuje i CO to odblokowuje, program produkowałby `BRAK_PODSTAWY`
„prawie wszędzie" bez ścieżki wyjścia. Lista pisana ręcznie odjechałaby od profilu przy
pierwszej zmianie warstwy — dlatego jest GENEROWANA z profilu efektywnego każdego operatora, a
strażnik porównuje tabelę w planie z pomiarem (wzorzec `inwentarz_katalogow_guard.py`: jedna
funkcja wie, jak wygląda poprawna tabela).

INWENTARZ KLASY — skąd pewność, że żadna podstawa nie umknie:
  * nośnik stanu źródła jest rozpoznawany STRUKTURALNIE, nie po nazwie pola: każdy model
    pydantic profilu, którego pole `status` ma typ stanu źródła (`werdykt.kontrakt.StanZrodla`,
    także w unii z `None`). Jeden przebieg obejmuje trzy rodzaje nośników:
      - `PodstawaWymagania` — parametry (`frequency_response`, `reactive_power`,
        `voltage_levels` LVRT/HVRT, `p_recovery_after_fault`, `zakresy_czestotliwosci`,
        `lfsm_o_granice`, `zaprzestanie_generacji`, `kryteria_akceptacji`),
        `klasyfikacja_zrodlo`, wymagania (`zrodlo`, `pokrycie_zrodlo` z warstwy WiPWC,
        `wykonanie_prawa_zrodlo` z warstwy OSD), pozycje Banku Nastaw, scenariusze programu badań;
      - `DokumentWarstwy` — dokument każdej warstwy `warstwy[*]`;
      - sekcje-zbiory ze stanem (`BankNastaw`, `ProgramBadan`; pusty zbiór = `NIEUSTALONE`);
    warstwa WiPWC (`wipwc`: wersje wykazu, wskazanie rejestru) nie niesie dziś stanu źródła —
    jej regułę pokrycia niesie `pokrycie_zrodlo` każdego wymagania;
  * przegląd jest REKURENCYJNY po polach modelu (`model_fields`), krotkach, listach i
    słownikach — nowe pole loadera niosące podstawę jest znalezione bez zmiany tego skryptu
    (samotest z modelem rozszerzonym o nowe pole);
  * kompletność przypięta NIEZALEŻNĄ drogą: liczba znalezionych `PodstawaWymagania` = liczba
    słowników o zbiorze kluczy `PodstawaWymagania` w `model_dump()` profilu (samotest, każdy
    operator), tak samo dla dokumentów warstw;
  * przegląd TYPÓW (adnotacji pól, nie instancji) wylicza każdą ścieżkę, na której MOŻE stać
    nośnik — także pola dziś puste (`bank_nastaw.pozycje[*]`, `program_badan.scenariusze[*]`).
    Każda taka ścieżka poza `wymagania[*]` i `warstwy[*]` musi mieć czytelników w `CZYTELNICY`,
    a każda klasa sekcji-zbioru — warstwę w `WARSTWA_SEKCJI`; inaczej strażnik jest czerwony
    (nośnik bez odpowiedzi „co odblokowuje" to deklaracja bez pokrycia).

CO ODBLOKOWUJE (kolumna tabeli):
  * `wymagania[ID].*` — wymaganie z profilu (nazwa, rola pola, testy z pola `testy`);
  * `warstwy[W]` — podstawy profilu z tym samym dokumentem oraz sekcje-zbiory tej warstwy;
  * pozostałe ścieżki — `CZYTELNICY`: testy procedury, których kryterium czyta grupę (zbiór
    sprawdzany w samoteście krzyżowo z AST solvera `ncrfg_ptpiree/engine.py`: test → metoda
    kryterium → pola profilu), wymagania czytające grupę poza testami (ocena wymagań: O-30
    program badań, O-32 koordynacja nastaw — samotest sprawdza, że `ocena_wymagan.py` czyta te
    grupy) i opis; wymagania testów wyprowadza `NcRfgProfile.wymagania_testu`.

TRYBY:
  --zmierz   wypisuje tabelę Markdown na standardowe wyjście;
  --zapisz   wpisuje tabelę do planu między znacznikami w §12.1;
  domyślny   strażnik: tabela w planie ≠ pomiar → kod 1 z różnicą.

KODY WYJŚCIA: 0 — tabela zgodna z pomiarem; 1 — rozjazd, brak znaczników albo błąd kontraktu
bramki (nośnik bez czytelników, czytelnik wskazujący nieistniejące wymaganie lub test spoza
kanonu T01–T20, martwy wpis `CZYTELNICY`, sekcja-zbiór bez warstwy); 2 — błąd środowiska
(brak pliku planu albo interpreter bez zależności backendu).

Uruchomienie interpreterem środowiska backendu (import loadera profilu):
    poetry run python ../scripts/bramka_danych_profilu.py            # z katalogu backend/
    poetry run python ../scripts/bramka_danych_profilu.py --zapisz   # po zmianie profilu
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
import types
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Annotated, Any, Literal, Union, get_args, get_origin

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR / "src"))
sys.path.insert(0, str(BACKEND_DIR))

try:
    from catalog.profiles.nc_rfg.loader import (
        DokumentWarstwy,
        NcRfgProfile,
        WarstwaProfilu,
        list_available_operators,
        load_nc_rfg_profile,
    )
    from pydantic import BaseModel
    from werdykt.kontrakt import PodstawaWymagania, StanZrodla
except ModuleNotFoundError as _brak:
    # Interpreter bez zależności backendu (pydantic, yaml, networkx przez `network_model`) to
    # błąd ŚRODOWISKA, nie wynik strażnika — kod 2, jak brak pliku planu.
    print(
        f"bramka_danych_profilu: BŁĄD ŚRODOWISKA: brak modułu {_brak.name!r} — uruchom "
        "interpreterem środowiska backendu (z katalogu backend/: poetry run python "
        "../scripts/bramka_danych_profilu.py)",
        file=sys.stderr,
    )
    raise SystemExit(2) from _brak

PLAN = PROJECT_ROOT / "docs" / "plan" / "PLAN_AB_DYNAMIKA_A_B_2026-09.md"
ZNACZNIK_START = "<!-- BRAMKA_DANYCH_PROFILU:START -->"
ZNACZNIK_KONIEC = "<!-- BRAMKA_DANYCH_PROFILU:KONIEC -->"

#: Ścieżki, których czytelników wyprowadza sam profil (nie `CZYTELNICY`).
PREFIKS_WYMAGAN = "wymagania"
PREFIKS_WARSTW = "warstwy"

_STANY_ZRODLA = frozenset(get_args(StanZrodla))
_TEST_KANONU = re.compile(r"^T(?:0[1-9]|1\d|20)$")
_INDEKS = re.compile(r"\[[^\]]*\]")


@dataclass(frozen=True)
class Czytelnicy:
    """Kto czyta grupę profilu — treść kolumny „odblokowuje".

    ``testy`` — testy procedury (solver PTPiREE), których kryterium czyta grupę; zbiór jest
    sprawdzany w samoteście krzyżowo z AST solvera. ``wymagania`` — wymagania czytające grupę
    POZA testami (ocena wymagań). ``opis_pl`` — czytelnik spoza katalogu wymagań.
    """

    testy: tuple[str, ...] = ()
    wymagania: tuple[str, ...] = ()
    opis_pl: str | None = None


#: Czytelnicy grup profilu poza `wymagania[*]` i `warstwy[*]` (klucz: ścieżka pola bez indeksów;
#: dopasowanie najdłuższego prefiksu po segmentach). Testy: odczyt kodu solvera
#: `ncrfg_ptpiree/engine.py` (`_specyfikacja` → metoda kryterium → `profile.<pole>`), przypięty
#: samotestem. Wymagania spoza testów: decyzje planu A/B (O-30 program badań — wymagania
#: wykazywane biegami T14–T17; O-32 koordynacja nastaw — RFG_14_3 i RFG_13_1B; O-3 zakresy
#: częstotliwości — RFG_13_1A bez metody).
CZYTELNICY: Mapping[str, Czytelnicy] = MappingProxyType(
    {
        "klasyfikacja_zrodlo": Czytelnicy(
            opis_pl=(
                "klasa modułu (progi WOS, decyzja O-1) — stosowalność każdego wymagania i "
                "każdego testu"
            )
        ),
        "zakresy_czestotliwosci": Czytelnicy(wymagania=("RFG_13_1A",)),
        "lfsm_o_granice": Czytelnicy(
            wymagania=("RFG_13_2",),
            opis_pl="granice dopuszczalne wartości krajowych LFSM-O (walidacja profilu)",
        ),
        "zaprzestanie_generacji": Czytelnicy(testy=("T12",)),
        "frequency_response": Czytelnicy(testy=("T01", "T02", "T03", "T04", "T05", "T13")),
        "reactive_power": Czytelnicy(testy=("T06", "T07", "T08", "T09")),
        "voltage_levels.lvrt_zrodlo": Czytelnicy(
            testy=("T14",),
            opis_pl="kryterium koordynacji nastawy U< modułu z obwiednią (O-32)",
        ),
        "voltage_levels.hvrt_zrodlo": Czytelnicy(testy=("T15",)),
        "p_recovery_after_fault": Czytelnicy(testy=("T16",)),
        "kryteria_akceptacji": Czytelnicy(
            testy=("T01", "T02", "T03", "T04", "T05", "T12", "T13", "T17", "T20")
        ),
        "program_badan": Czytelnicy(
            wymagania=("RFG_14_3", "RFG_17_3", "RFG_20_2B", "RFG_20_3", "ZASTANE_HVRT"),
            opis_pl=(
                "pokrycie programu badań — warunek stanu SPEŁNIA wymagań wykazywanych biegami "
                "(O-30)"
            ),
        ),
        "bank_nastaw": Czytelnicy(
            wymagania=("RFG_13_1B", "RFG_14_3"),
            opis_pl=(
                "kryteria koordynacji nastaw zabezpieczeń modułu (O-32); nastawy "
                "zabezpieczeń w pętli czasu (AB-5)"
            ),
        ),
    }
)

#: Warstwa, której dokument uzupełnia sekcję-zbiór (sekcja nie niesie własnego dokumentu).
WARSTWA_SEKCJI: Mapping[str, str] = MappingProxyType(
    {"BankNastaw": "OSD", "ProgramBadan": "PROCEDURA_PTPIREE"}
)

#: Rola pola wymagania w kolumnie „odblokowuje" (pole nieznane — nazwa pola).
_ROLA_POLA_WYMAGANIA: Mapping[str, str] = MappingProxyType(
    {
        "zrodlo": "podstawa wymagania",
        "pokrycie_zrodlo": "reguła pokrycia certyfikatem (WiPWC)",
        "wykonanie_prawa_zrodlo": "stosowalność — wykonanie prawa operatora do określenia",
    }
)


class BladKontraktuBramki(ValueError):
    """Profil i deklaracje bramki są niespójne — tabela nie może powstać uczciwie."""


# ---------------------------------------------------------------------------
# Rozpoznanie nośników stanu źródła
# ---------------------------------------------------------------------------


def _stany(adnotacja: Any) -> frozenset[Any]:
    """Wartości literału w adnotacji (unia z ``None`` i ``Annotated`` rozwijane)."""
    origin = get_origin(adnotacja)
    if origin is Annotated:
        return _stany(get_args(adnotacja)[0])
    if origin is Literal:
        return frozenset(get_args(adnotacja))
    if origin in (Union, types.UnionType):
        wynik: set[Any] = set()
        for argument in get_args(adnotacja):
            if argument is not type(None):
                wynik |= _stany(argument)
        return frozenset(wynik)
    return frozenset()


def jest_nosnikiem(klasa: type[BaseModel]) -> bool:
    """Model niesie stan źródła: pole ``status`` typu ``StanZrodla`` (także ``| None``)."""
    pole = klasa.model_fields.get("status")
    return pole is not None and _stany(pole.annotation) == _STANY_ZRODLA


def rodzaj_nosnika(klasa: type[BaseModel]) -> str:
    """``podstawa`` / ``dokument`` / ``sekcja`` (sekcja-zbiór ze stanem)."""
    if issubclass(klasa, PodstawaWymagania):
        return "podstawa"
    if issubclass(klasa, DokumentWarstwy):
        return "dokument"
    return "sekcja"


def _dolacz(sciezka: str, nazwa: str) -> str:
    return f"{sciezka}.{nazwa}" if sciezka else nazwa


def _etykieta_elementu(element: object, indeks: int) -> str:
    if isinstance(element, BaseModel):
        pola = type(element).model_fields
        for klucz in ("id", "warstwa", "wersja"):
            if klucz in pola:
                return str(getattr(element, klucz))
    return str(indeks)


@dataclass(frozen=True)
class Nosnik:
    sciezka: str
    obiekt: BaseModel


def nosniki(model: BaseModel) -> list[Nosnik]:
    """Wszystkie nośniki stanu źródła w instancji modelu (rekurencyjnie, kolejność pól)."""
    wynik: list[Nosnik] = []
    _przejdz_model(model, "", wynik)
    return wynik


def _przejdz_model(model: BaseModel, sciezka: str, wynik: list[Nosnik]) -> None:
    if jest_nosnikiem(type(model)):
        wynik.append(Nosnik(sciezka, model))
    for nazwa in type(model).model_fields:
        _przejdz(getattr(model, nazwa), _dolacz(sciezka, nazwa), wynik)


def _przejdz(wartosc: object, sciezka: str, wynik: list[Nosnik]) -> None:
    if isinstance(wartosc, BaseModel):
        _przejdz_model(wartosc, sciezka, wynik)
    elif isinstance(wartosc, Mapping):
        for klucz in sorted(wartosc, key=str):
            _przejdz(wartosc[klucz], f"{sciezka}[{klucz}]", wynik)
    elif isinstance(wartosc, tuple | list):
        for indeks, element in enumerate(wartosc):
            _przejdz(element, f"{sciezka}[{_etykieta_elementu(element, indeks)}]", wynik)


def sciezki_typow(klasa: type[BaseModel]) -> list[tuple[str, type[BaseModel]]]:
    """Ścieżki (z ``[*]``), na których w modelu MOŻE stać nośnik — przegląd adnotacji pól."""
    wynik: set[tuple[str, type[BaseModel]]] = set()
    _typ_modelu(klasa, "", (), wynik)
    return sorted(wynik, key=lambda para: (para[0], para[1].__name__))


def _typ_modelu(
    klasa: type[BaseModel],
    sciezka: str,
    stos: tuple[type[BaseModel], ...],
    wynik: set[tuple[str, type[BaseModel]]],
) -> None:
    if klasa in stos:
        return
    if jest_nosnikiem(klasa):
        wynik.add((sciezka, klasa))
    for nazwa, pole in klasa.model_fields.items():
        _typ(pole.annotation, _dolacz(sciezka, nazwa), (*stos, klasa), wynik)


def _typ(
    adnotacja: Any,
    sciezka: str,
    stos: tuple[type[BaseModel], ...],
    wynik: set[tuple[str, type[BaseModel]]],
) -> None:
    origin = get_origin(adnotacja)
    if origin is Annotated:
        _typ(get_args(adnotacja)[0], sciezka, stos, wynik)
    elif isinstance(adnotacja, type) and issubclass(adnotacja, BaseModel):
        _typ_modelu(adnotacja, sciezka, stos, wynik)
    elif origin in (Union, types.UnionType):
        for argument in get_args(adnotacja):
            _typ(argument, sciezka, stos, wynik)
    elif isinstance(origin, type) and issubclass(origin, Mapping):
        argumenty = get_args(adnotacja)
        if argumenty:
            _typ(argumenty[-1], f"{sciezka}[*]", stos, wynik)
    elif isinstance(origin, type) and issubclass(origin, tuple | list | set | frozenset):
        for argument in get_args(adnotacja):
            if argument is not Ellipsis:
                _typ(argument, f"{sciezka}[*]", stos, wynik)


def wzorzec(sciezka: str) -> str:
    """Ścieżka instancji → ścieżka typu (indeksy zastąpione ``[*]``)."""
    return _INDEKS.sub("[*]", sciezka)


def _segmenty(sciezka: str) -> list[str]:
    return _INDEKS.sub("", sciezka).split(".")


def klucz_czytelnikow(sciezka: str, czytelnicy: Mapping[str, Czytelnicy]) -> str | None:
    """Najdłuższy klucz ``czytelnicy`` będący prefiksem ścieżki (po segmentach)."""
    segmenty = _segmenty(sciezka)
    for dlugosc in range(len(segmenty), 0, -1):
        kandydat = ".".join(segmenty[:dlugosc])
        if kandydat in czytelnicy:
            return kandydat
    return None


def _poza_czytelnikami(sciezka: str) -> bool:
    """Ścieżki, których czytelników wyprowadza sam profil (wymagania, dokumenty warstw)."""
    return _segmenty(sciezka)[0] in (PREFIKS_WYMAGAN, PREFIKS_WARSTW)


# ---------------------------------------------------------------------------
# Kontrakt bramki (deklaracje wobec profilu)
# ---------------------------------------------------------------------------


def sprawdz_kontrakt(
    profile: Mapping[str, NcRfgProfile],
    czytelnicy: Mapping[str, Czytelnicy] = CZYTELNICY,
    warstwa_sekcji: Mapping[str, str] = WARSTWA_SEKCJI,
) -> list[str]:
    """Błędy deklaracji bramki wobec profili (lista pusta = spójne)."""
    bledy: list[str] = []
    klasy = sorted({type(p) for p in profile.values()}, key=lambda k: k.__name__)
    sciezki = sorted({s for klasa in klasy for s in sciezki_typow(klasa)}, key=lambda s: s[0])
    uzyte: set[str] = set()
    for sciezka, klasa in sciezki:
        if rodzaj_nosnika(klasa) == "sekcja" and klasa.__name__ not in warstwa_sekcji:
            bledy.append(
                f"sekcja-zbiór {klasa.__name__} ({sciezka}) bez warstwy dokumentu w "
                "WARSTWA_SEKCJI"
            )
        if _poza_czytelnikami(sciezka):
            continue
        klucz = klucz_czytelnikow(sciezka, czytelnicy)
        if klucz is None:
            bledy.append(
                f"nośnik stanu źródła `{sciezka}` bez czytelników — dopisz grupę do CZYTELNICY "
                "(które testy albo wymagania go czytają)"
            )
        else:
            uzyte.add(klucz)
    for klucz in sorted(set(czytelnicy) - uzyte):
        bledy.append(f"martwy wpis CZYTELNICY `{klucz}` — żadna ścieżka profilu go nie używa")
    for klucz, wpis in sorted(czytelnicy.items()):
        if not (wpis.testy or wpis.wymagania or wpis.opis_pl):
            bledy.append(f"CZYTELNICY `{klucz}`: wpis pusty (brak testów, wymagań i opisu)")
        for test_id in wpis.testy:
            if not _TEST_KANONU.match(test_id):
                bledy.append(f"CZYTELNICY `{klucz}`: test {test_id!r} spoza kanonu T01–T20")
        for operator_id, profil in sorted(profile.items()):
            znane = {w.id for w in profil.wymagania}
            for wymaganie_id in wpis.wymagania:
                if wymaganie_id not in znane:
                    bledy.append(
                        f"CZYTELNICY `{klucz}`: wymaganie {wymaganie_id} nie istnieje w profilu "
                        f"{operator_id}"
                    )
    return bledy


# ---------------------------------------------------------------------------
# Wiersze tabeli
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Wiersz:
    """Wiersz tabeli bez kolumny operatora (klucz deduplikacji między operatorami)."""

    grupa: int
    sciezka: str
    warstwa_rodzaj: str
    dokument: str
    wydanie: str
    brakuje: str
    odblokowuje: str
    uwagi: str


@dataclass(frozen=True)
class Pomiar:
    operatorzy: tuple[str, ...]
    wiersze: tuple[tuple[Wiersz, tuple[str, ...]], ...]
    nosniki_razem: Mapping[str, int]
    nosniki_nieustalone: Mapping[str, int]


def _dokument_warstwy(profil: NcRfgProfile, warstwa: str) -> WarstwaProfilu:
    for pozycja in profil.warstwy:
        if pozycja.warstwa == warstwa:
            return pozycja
    raise BladKontraktuBramki(f"profil {profil.operator_id}: brak warstwy {warstwa}")


def _brakuje_podstawy(podstawa: PodstawaWymagania) -> str:
    if podstawa.rodzaj == "NIEUSTALONA":
        return (
            "dokument źródłowy, wydanie i jednostka redakcyjna (wartość z warstwy bez "
            "ustalonego pochodzenia)"
        )
    braki = [
        nazwa
        for nazwa, wartosc in (
            ("wydanie", podstawa.wydanie),
            ("jednostka redakcyjna", podstawa.jednostka_redakcyjna),
        )
        if wartosc is None
    ]
    if braki:
        return ", ".join(braki)
    return "potwierdzenie jednostki redakcyjnej z tekstem dokumentu (stan zadeklarowany w warstwie)"


def _brakuje_dokumentu(dokument: WarstwaProfilu) -> str:
    if dokument.warstwa == "NIEUSTALONA":
        return "dokument źródłowy (warstwa bez ustalonego pochodzenia)"
    braki = [
        nazwa
        for nazwa, wartosc in (
            ("wydanie", dokument.wydanie),
            ("data obowiązywania", dokument.obowiazuje_od),
        )
        if wartosc is None
    ]
    return ", ".join(braki) if braki else "potwierdzenie treści dokumentu w repozytorium"


def _pozycje_sekcji(sekcja: BaseModel) -> int:
    return sum(
        len(wartosc)
        for nazwa in type(sekcja).model_fields
        if isinstance(wartosc := getattr(sekcja, nazwa), tuple | list)
    )


def _lista(elementy: Iterable[str]) -> str:
    return ", ".join(elementy) or "—"


def _odblokowuje_czytelnicy(profil: NcRfgProfile, wpis: Czytelnicy) -> str:
    kolejnosc = {w.id: i for i, w in enumerate(profil.wymagania)}
    wymagania = {w.id for t in wpis.testy for w in profil.wymagania_testu(t)} | set(wpis.wymagania)
    czesci: list[str] = []
    if wpis.testy:
        czesci.append(f"testy: {_lista(wpis.testy)}")
    if wymagania:
        czesci.append(f"wymagania: {_lista(sorted(wymagania, key=kolejnosc.__getitem__))}")
    if wpis.opis_pl:
        czesci.append(wpis.opis_pl)
    return "; ".join(czesci)


def _odblokowuje_wymaganie(profil: NcRfgProfile, sciezka: str) -> str:
    dopasowanie = re.match(rf"^{PREFIKS_WYMAGAN}\[([^\]]+)\]\.?(.*)$", sciezka)
    if dopasowanie is None:
        raise BladKontraktuBramki(f"nierozpoznana ścieżka wymagania {sciezka!r}")
    wymaganie = profil.wymaganie(dopasowanie.group(1))
    pole = _segmenty(dopasowanie.group(2))[0] if dopasowanie.group(2) else ""
    rola = _ROLA_POLA_WYMAGANIA.get(pole, f"pole {pole}")
    if pole == "pokrycie_zrodlo":
        typy = _lista(wymaganie.certyfikat_pokrywa_typy)
        rola += (
            f"; typy objęte: {typy}"
            if wymaganie.certyfikat_pokrywa_typy
            else "; reguła pusta — certyfikat nie pokrywa żadnego typu"
        )
    return (
        f"{wymaganie.id} „{wymaganie.nazwa_pl}” — {rola}; testy: "
        f"{_lista(wymaganie.testy) if wymaganie.testy else 'brak testu w katalogu'}"
    )


def _odblokowuje_dokument(
    profil: NcRfgProfile,
    dokument: WarstwaProfilu,
    wszystkie: list[Nosnik],
    warstwa_sekcji: Mapping[str, str],
) -> str:
    podstawy = [
        n.sciezka
        for n in wszystkie
        if isinstance(n.obiekt, PodstawaWymagania) and n.obiekt.dokument == dokument.tytul
    ]
    sekcje = [
        n.sciezka
        for n in wszystkie
        if rodzaj_nosnika(type(n.obiekt)) == "sekcja"
        and warstwa_sekcji.get(type(n.obiekt).__name__) == dokument.warstwa
    ]
    czesci = [
        (
            f"podstawy tej warstwy w profilu ({len(podstawy)}): {_lista(podstawy)}"
            if podstawy
            else "brak podstaw tej warstwy w profilu (katalog wymagań warstwy pusty)"
        )
    ]
    if sekcje:
        czesci.append(f"sekcje-zbiory: {_lista(sekcje)}")
    return "; ".join(czesci)


def wiersze_profilu(
    profil: NcRfgProfile,
    czytelnicy: Mapping[str, Czytelnicy] = CZYTELNICY,
    warstwa_sekcji: Mapping[str, str] = WARSTWA_SEKCJI,
) -> list[Wiersz]:
    """Wiersze tabeli jednego profilu: każdy nośnik o stanie ``NIEUSTALONE``."""
    wszystkie = nosniki(profil)
    wynik: list[Wiersz] = []
    for nosnik in wszystkie:
        obiekt, sciezka = nosnik.obiekt, nosnik.sciezka
        if getattr(obiekt, "status", None) != "NIEUSTALONE":
            continue
        uwagi = getattr(obiekt, "uwagi_pl", None) or "—"
        if isinstance(obiekt, PodstawaWymagania):
            dokument, wydanie = obiekt.dokument, obiekt.wydanie or "—"
            warstwa_rodzaj = f"{obiekt.rodzaj} (podstawa)"
            brakuje = _brakuje_podstawy(obiekt)
        elif isinstance(obiekt, WarstwaProfilu):
            dokument, wydanie = obiekt.tytul, obiekt.wydanie or "—"
            warstwa_rodzaj = f"{obiekt.warstwa} (dokument warstwy)"
            brakuje = _brakuje_dokumentu(obiekt)
        else:
            nazwa_klasy = type(obiekt).__name__
            if nazwa_klasy not in warstwa_sekcji:
                raise BladKontraktuBramki(f"sekcja-zbiór {nazwa_klasy} bez warstwy dokumentu")
            warstwa = warstwa_sekcji[nazwa_klasy]
            dok = _dokument_warstwy(profil, warstwa)
            dokument, wydanie = dok.tytul, dok.wydanie or "—"
            warstwa_rodzaj = f"{warstwa} (sekcja-zbiór)"
            brakuje = (
                "pozycje zbioru z podstawą — zbiór pusty (każda pozycja z jednostką "
                "redakcyjną dokumentu warstwy)"
                if _pozycje_sekcji(obiekt) == 0
                else "potwierdzenie kompletności zbioru (stan zadeklarowany w warstwie)"
            )
        if _segmenty(sciezka)[0] == PREFIKS_WYMAGAN:
            grupa, odblokowuje = 2, _odblokowuje_wymaganie(profil, sciezka)
        elif _segmenty(sciezka)[0] == PREFIKS_WARSTW:
            if not isinstance(obiekt, WarstwaProfilu):
                raise BladKontraktuBramki(f"nośnik {sciezka!r} w warstwach nie jest dokumentem")
            grupa = 0
            odblokowuje = _odblokowuje_dokument(profil, obiekt, wszystkie, warstwa_sekcji)
        else:
            klucz = klucz_czytelnikow(sciezka, czytelnicy)
            if klucz is None:
                raise BladKontraktuBramki(f"nośnik stanu źródła `{sciezka}` bez czytelników")
            grupa, odblokowuje = 1, _odblokowuje_czytelnicy(profil, czytelnicy[klucz])
        wynik.append(
            Wiersz(
                grupa=grupa,
                sciezka=sciezka,
                warstwa_rodzaj=warstwa_rodzaj,
                dokument=dokument,
                wydanie=wydanie,
                brakuje=brakuje,
                odblokowuje=odblokowuje,
                uwagi=uwagi,
            )
        )
    return wynik


def zmierz(
    profile: Mapping[str, NcRfgProfile],
    czytelnicy: Mapping[str, Czytelnicy] = CZYTELNICY,
    warstwa_sekcji: Mapping[str, str] = WARSTWA_SEKCJI,
) -> Pomiar:
    """Pomiar wszystkich profili: wiersze zdeduplikowane między operatorami + liczniki."""
    if not profile:
        raise BladKontraktuBramki("brak profili operatorów — pusty pomiar nie jest zielony")
    bledy = sprawdz_kontrakt(profile, czytelnicy, warstwa_sekcji)
    if bledy:
        raise BladKontraktuBramki("; ".join(bledy))
    scalone: dict[Wiersz, list[str]] = {}
    razem: dict[str, int] = {"podstawa": 0, "dokument": 0, "sekcja": 0}
    nieustalone: dict[str, int] = {"podstawa": 0, "dokument": 0, "sekcja": 0}
    for operator_id in sorted(profile):
        profil = profile[operator_id]
        for nosnik in nosniki(profil):
            rodzaj = rodzaj_nosnika(type(nosnik.obiekt))
            razem[rodzaj] += 1
            if getattr(nosnik.obiekt, "status", None) == "NIEUSTALONE":
                nieustalone[rodzaj] += 1
        for wiersz in wiersze_profilu(profil, czytelnicy, warstwa_sekcji):
            scalone.setdefault(wiersz, []).append(operator_id)
    wiersze = tuple(
        sorted(
            ((w, tuple(sorted(o))) for w, o in scalone.items()),
            key=lambda para: (para[0].grupa, para[0].sciezka, para[1], para[0].dokument),
        )
    )
    return Pomiar(
        operatorzy=tuple(sorted(profile)),
        wiersze=wiersze,
        nosniki_razem=MappingProxyType(razem),
        nosniki_nieustalone=MappingProxyType(nieustalone),
    )


# ---------------------------------------------------------------------------
# Tabela Markdown
# ---------------------------------------------------------------------------


def _komorka(tekst: str) -> str:
    return re.sub(r"\s+", " ", tekst).strip().replace("|", "\\|")


def _operatorzy_wiersza(operatorzy: tuple[str, ...], wszyscy: tuple[str, ...]) -> str:
    return "wspólna" if operatorzy == wszyscy else ", ".join(operatorzy)


def tabela(pomiar: Pomiar) -> str:
    """Blok Markdown wstawiany między znaczniki §12.1 (bez znaczników)."""
    per_warstwa: dict[str, int] = {}
    for wiersz, _ in pomiar.wiersze:
        per_warstwa[wiersz.warstwa_rodzaj] = per_warstwa.get(wiersz.warstwa_rodzaj, 0) + 1
    razem, nieustalone = pomiar.nosniki_razem, pomiar.nosniki_nieustalone
    linie = [
        "_Generowane przez `scripts/bramka_danych_profilu.py --zapisz` z profilu efektywnego "
        f"operatorów: {', '.join(pomiar.operatorzy)}. Nie edytować ręcznie — strażnik "
        "porównuje tę tabelę z pomiarem profilu (kod 1 przy rozjeździe)._",
        "",
        "Pomiar: nośniki stanu źródła w profilach (suma po operatorach, przed deduplikacją) — "
        f"podstawy {razem['podstawa']} (w tym NIEUSTALONE {nieustalone['podstawa']}), "
        f"dokumenty warstw {razem['dokument']} (NIEUSTALONE {nieustalone['dokument']}), "
        f"sekcje-zbiory {razem['sekcja']} (NIEUSTALONE {nieustalone['sekcja']}). "
        f"Wierszy po deduplikacji między operatorami: {len(pomiar.wiersze)} — "
        + "; ".join(f"{k}: {v}" for k, v in sorted(per_warstwa.items()))
        + ".",
        "",
        "| # | Ścieżka w profilu | Warstwa / rodzaj | Operator | Dokument | Wydanie | "
        "Czego brakuje | Odblokowuje | Uwagi |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for numer, (wiersz, operatorzy) in enumerate(pomiar.wiersze, start=1):
        komorki = [
            str(numer),
            f"`{wiersz.sciezka}`",
            wiersz.warstwa_rodzaj,
            _operatorzy_wiersza(operatorzy, pomiar.operatorzy),
            wiersz.dokument,
            wiersz.wydanie,
            wiersz.brakuje,
            wiersz.odblokowuje,
            wiersz.uwagi,
        ]
        linie.append("| " + " | ".join(_komorka(k) for k in komorki) + " |")
    return "\n".join(linie)


def blok_planu(pomiar: Pomiar) -> str:
    """Treść między znacznikami (z pustą linią po znaczniku startu i przed końcowym)."""
    return f"\n{tabela(pomiar)}\n"


def wstaw_blok(tresc: str, blok: str) -> str:
    poczatek, koniec = tresc.find(ZNACZNIK_START), tresc.find(ZNACZNIK_KONIEC)
    if poczatek < 0 or koniec < 0 or koniec < poczatek:
        raise BladKontraktuBramki(
            f"plan bez znaczników {ZNACZNIK_START} / {ZNACZNIK_KONIEC} w poprawnej kolejności"
        )
    return tresc[: poczatek + len(ZNACZNIK_START)] + blok + tresc[koniec:]


def blok_z_planu(tresc: str) -> str:
    poczatek, koniec = tresc.find(ZNACZNIK_START), tresc.find(ZNACZNIK_KONIEC)
    if poczatek < 0 or koniec < 0 or koniec < poczatek:
        raise BladKontraktuBramki(
            f"plan bez znaczników {ZNACZNIK_START} / {ZNACZNIK_KONIEC} w poprawnej kolejności"
        )
    return tresc[poczatek + len(ZNACZNIK_START) : koniec]


def profile_repozytorium() -> dict[str, NcRfgProfile]:
    """Profile efektywne wszystkich operatorów z plikiem warstwy OSD."""
    return {
        operator_id: load_nc_rfg_profile(operator_id) for operator_id in list_available_operators()
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Bramka danych właściciela (OD-21): podstawy profilu NC RfG NIEUSTALONE."
    )
    tryb = parser.add_mutually_exclusive_group()
    tryb.add_argument("--zmierz", action="store_true", help="wypisz tabelę na stdout")
    tryb.add_argument("--zapisz", action="store_true", help="wpisz tabelę do planu §12.1")
    parser.add_argument("--plan", type=Path, default=PLAN, help="ścieżka planu A/B")
    argumenty = parser.parse_args(sys.argv[1:] if argv is None else argv)

    try:
        pomiar = zmierz(profile_repozytorium())
    except BladKontraktuBramki as blad:
        print(f"bramka_danych_profilu: BŁĄD KONTRAKTU BRAMKI: {blad}", file=sys.stderr)
        return 1
    blok = blok_planu(pomiar)
    if argumenty.zmierz:
        print(tabela(pomiar))
        return 0
    if not argumenty.plan.is_file():
        print(
            f"bramka_danych_profilu: BŁĄD ŚRODOWISKA: brak planu {argumenty.plan}",
            file=sys.stderr,
        )
        return 2
    tresc = argumenty.plan.read_text(encoding="utf-8")
    try:
        if argumenty.zapisz:
            nowa = wstaw_blok(tresc, blok)
            if nowa != tresc:
                argumenty.plan.write_text(nowa, encoding="utf-8")
            print(
                f"bramka_danych_profilu: zapisano {len(pomiar.wiersze)} wierszy do "
                f"{argumenty.plan}"
            )
            return 0
        obecny = blok_z_planu(tresc)
    except BladKontraktuBramki as blad:
        print(f"bramka_danych_profilu: {blad}", file=sys.stderr)
        return 1
    if obecny != blok:
        roznica = difflib.unified_diff(
            obecny.splitlines(),
            blok.splitlines(),
            fromfile="plan §12.1 (tabela w dokumencie)",
            tofile="pomiar profilu",
            lineterm="",
        )
        print("BRAMKA DANYCH PROFILU: tabela §12.1 rozjechała się z profilem", file=sys.stderr)
        print("\n".join(roznica), file=sys.stderr)
        print(
            "\nNapraw: poetry run python ../scripts/bramka_danych_profilu.py --zapisz "
            "(z katalogu backend/) i sprawdź różnicę przed commitem.",
            file=sys.stderr,
        )
        return 1
    print(
        f"Bramka danych profilu: OK ({len(pomiar.wiersze)} wierszy, operatorzy "
        f"{', '.join(pomiar.operatorzy)}; tabela §12.1 zgodna z pomiarem)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

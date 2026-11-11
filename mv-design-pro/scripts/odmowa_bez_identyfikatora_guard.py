#!/usr/bin/env python3
"""Strażnik: treść odmowy danych nigdy nie niesie identyfikatora maszynowego (partia 10).

PO CO. Odmowa danych (`network_model.odmowa_danych.OdmowaDanychError` i jej podklasy) trafia
do projektanta jako treść odpowiedzi 422 (`api/exception_handlers.py`), komunikat biegu
zakończonego odmową albo pozycja listy braków. Partia integracji 9 wykryła, że rdzenie
i warstwa aplikacji wklejały do tej treści identyfikator elementu (`f"Szyna {bus_ref} …"`,
`f"Bieg {run_id!r} nie istnieje"`) — projektant widział UUID albo klucz rekordu zamiast
nazwy. Partia 10 przebudowała KLASĘ: rdzeń zwraca odmowę STRUKTURALNĄ (kod + odwołanie
do elementu, `RekordOdmowy`/`OdwolanieElementu`), zdanie z nazwą elementu buduje warstwa
modelu (`enm.zdania_odmow_rdzenia`), a warstwa aplikacji pisze nazwę z modelu
(`enm.slownik_komunikatow.opis_elementu`, `enm.nazwy_elementow`). Identyfikator zostaje
w POLACH (`dane`, `odwolania`, `ref_id`), z których interfejs wiąże nawigację.
Ten strażnik pilnuje, żeby klasa nie wróciła — KSZTAŁT, nie słowo.

RODZINA (wyprowadzana z drzewa, nie wypisana ręcznie). Klasy odmowy = `OdmowaDanychError`
oraz jej podklasy przechodnio (analiza składni dziedziczenia w całym `backend/src/**`)
i rekord `RekordOdmowy`. Położenie TEKSTU w wywołaniu konstruktora:
  * klasa bez własnego `__init__` w łańcuchu (aż do `OdmowaDanychError`) — pierwszy argument
    pozycyjny (`ValueError(komunikat)`);
  * klasa z własnym `__init__` — parametry o nazwie tekstu (`TEKST_PARAMETRY`) wg sygnatury,
    pozycyjnie albo nazwą; wnętrze tego `__init__` (`super().__init__(…)`) jest skanowane
    jako położenie tekstu;
  * `RekordOdmowy` — `tresc` (drugi argument pozycyjny albo nazwany).
Odwołanie do identyfikatora i przejście w głąb wyrażenia (f-napis, `%`, `+`, `.format`,
`str()`/`repr()`, `or`, `a if w else b`, `join`, zmienna-nośnik przypisana z identyfikatora)
— TE SAME reguły co `nazwa_bez_identyfikatora_guard` (klasa `_Skaner` współdzielona, jedno
źródło definicji „identyfikatora").

CZEGO NIE WYKRYWA (reguła KLASA pkt 4): wyjątków spoza rodziny (`ValueError`, `KeyError`,
`HTTPException` — błąd programu albo walidacja kontraktu żądania z `loc`); tekstu
przekazanego przez strukturę (lista dopisywana w pętli i sklejona później); identyfikatora
w zmiennej bez tokenu identyfikatora (`klucz`, `od`); identyfikatora cytowanego w treści
przez wywołanie innej funkcji (`opis(ref)` jest ODCZYTEM nazwy — tak jak w strażniku nazw).

LISTA DOZWOLONA I ZAPADKA (`DOZWOLONE`, tożsamość `moduł:symbol:klasa:odwołanie` → (liczba,
uzasadnienie merytoryczne)). Zapadka w obie strony jak w `nazwa_bez_identyfikatora_guard`.

PRZEKŁAD ODMOWY NA `HTTPException` (druga reguła, zero dozwolonych). Identyfikator żyje
w polach odmowy (`kod`/`dane`/`rekordy`); router, który łapie odmowę z rodziny i podnosi
`HTTPException(detail=str(exc))`, wysyła klientowi samo zdanie i gubi te pola. Każdy blok
`except` w `api/**` łapiący klasę rodziny, którego wnętrze podnosi `HTTPException`, jest
naruszeniem, gdy `detail` jest samym zdaniem odmowy (`str(exc)`, f-napis z `exc`): odmowę
przepuszcza się do globalnego handlera (422) albo podnosi `api.odmowa_http.OdmowaHttpError`
(inny status, ten sam kształt ciała). `detail` w postaci struktury (słownik, lista z polem
identyfikatora) jest jawnym kontraktem routera i nie jest naruszeniem.

TRYBY: domyślny (porównanie z `DOZWOLONE`); `--zmierz` wypisuje każde trafienie z `plik:linia`.
KODY WYJŚCIA: 0 — zgodnie z listą; 1 — naruszenia, wpisy do obniżenia/usunięcia, pusty skan.
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nazwa_bez_identyfikatora_guard import _Skaner  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Korzeń rodziny klas odmowy danych.
KLASA_KORZENIA = "OdmowaDanychError"
#: Rekord odmowy strukturalnej: (indeks pozycyjny tekstu, nazwa pola tekstu).
REKORDY_TEKSTU: dict[str, tuple[int, str]] = {"RekordOdmowy": (1, "tresc")}
#: Nazwy parametrów `__init__`, które niosą tekst dla projektanta.
TEKST_PARAMETRY = frozenset({"komunikat", "message", "msg", "tresc", "powod", "element_opis"})


@dataclass(frozen=True)
class Sygnatura:
    """Położenia tekstu w wywołaniu konstruktora klasy rodziny."""

    pozycje: tuple[int, ...]
    nazwy: frozenset[str]


@dataclass(frozen=True)
class Trafienie:
    modul: str
    linia: int
    symbol: str
    klasa: str
    odwolanie: str

    @property
    def tozsamosc(self) -> str:
        return f"{self.modul}:{self.symbol}:{self.klasa}:{self.odwolanie}"


def _nazwa_bazy(baza: ast.expr) -> str | None:
    if isinstance(baza, ast.Name):
        return baza.id
    if isinstance(baza, ast.Attribute):
        return baza.attr
    return None


def _sygnatura_init(init: ast.FunctionDef) -> Sygnatura:
    parametry = [a.arg for a in [*init.args.posonlyargs, *init.args.args]][1:]
    pozycje = tuple(i for i, p in enumerate(parametry) if p in TEKST_PARAMETRY)
    nazwy = {p for p in parametry if p in TEKST_PARAMETRY}
    nazwy |= {a.arg for a in init.args.kwonlyargs if a.arg in TEKST_PARAMETRY}
    return Sygnatura(pozycje=pozycje, nazwy=frozenset(nazwy))


def rodzina(moduly: dict[str, ast.Module]) -> dict[str, Sygnatura]:
    """Klasy odmowy (korzeń + podklasy przechodnio) → położenia tekstu w konstruktorze."""
    bazy: dict[str, list[str]] = {}
    inity: dict[str, ast.FunctionDef] = {}
    for drzewo in moduly.values():
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.ClassDef):
                bazy.setdefault(wezel.name, []).extend(
                    n for n in (_nazwa_bazy(b) for b in wezel.bases) if n is not None
                )
                for element in wezel.body:
                    if isinstance(element, ast.FunctionDef) and element.name == "__init__":
                        inity[wezel.name] = element
    wynik: dict[str, Sygnatura] = {KLASA_KORZENIA: Sygnatura(pozycje=(0,), nazwy=frozenset())}
    zmiana = True
    while zmiana:
        zmiana = False
        for klasa, rodzice in sorted(bazy.items()):
            if klasa in wynik:
                continue
            rodzic = next((r for r in rodzice if r in wynik), None)
            if rodzic is None:
                continue
            init = inity.get(klasa)
            wynik[klasa] = _sygnatura_init(init) if init is not None else wynik[rodzic]
            zmiana = True
    return wynik


class _SkanerOdmow(_Skaner):
    """Skaner nazw z jedną zmianą: zgłasza WYŁĄCZNIE położenia tekstu odmowy."""

    def __init__(self, modul: str, klasy: dict[str, Sygnatura]) -> None:
        super().__init__(modul)
        self.klasy = klasy
        self.odmowy: list[Trafienie] = []
        self._klasa_init: list[str | None] = [None]

    def _zglos(self, wyrazenie: ast.AST | None, polozenie: str, cel: str) -> None:
        if not polozenie.startswith("odmowa:"):
            return
        for wezel in self._odwolania_w(wyrazenie):
            if id(wezel) in self._zgloszone:
                continue
            self._zgloszone.add(id(wezel))
            self.odmowy.append(
                Trafienie(
                    modul=self.modul,
                    linia=getattr(wezel, "lineno", 0),
                    symbol=".".join(self.symbole) or "<moduł>",
                    klasa=cel,
                    odwolanie=self._odwolanie(wezel) or "?",
                )
            )

    def visit_ClassDef(self, node: ast.ClassDef) -> None:  # noqa: N802
        self._klasa_init.append(node.name if node.name in self.klasy else None)
        super().visit_ClassDef(node)
        self._klasa_init.pop()

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        nazwa = _nazwa_bazy(node.func) if isinstance(node.func, ast.Name | ast.Attribute) else None
        if nazwa in REKORDY_TEKSTU:
            indeks, pole = REKORDY_TEKSTU[nazwa]
            if len(node.args) > indeks:
                self._zglos(node.args[indeks], "odmowa:", nazwa)
            for argument in node.keywords:
                if argument.arg == pole:
                    self._zglos(argument.value, "odmowa:", nazwa)
        elif nazwa is not None and nazwa in self.klasy:
            sygnatura = self.klasy[nazwa]
            for indeks in sygnatura.pozycje:
                if len(node.args) > indeks:
                    self._zglos(node.args[indeks], "odmowa:", nazwa)
            for argument in node.keywords:
                if argument.arg in sygnatura.nazwy:
                    self._zglos(argument.value, "odmowa:", nazwa)
        elif (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "__init__"
            and isinstance(node.func.value, ast.Call)
            and isinstance(node.func.value.func, ast.Name)
            and node.func.value.func.id == "super"
            and self._klasa_init[-1] is not None
            and node.args
        ):
            self._zglos(node.args[0], "odmowa:", self._klasa_init[-1])
        super().visit_Call(node)


class PustySkanError(RuntimeError):
    """Skan nie znalazł modułów albo klasy korzenia — zieleń z pustego skanu byłaby kłamstwem."""


def trafienia_w_modulach(moduly: dict[str, str]) -> list[Trafienie]:
    """Trafienia w zbiorze modułów (`ścieżka → kod`); rodzina wyprowadzana z tych modułów."""
    drzewa = {m: ast.parse(k) for m, k in sorted(moduly.items())}
    klasy = rodzina(drzewa)
    wynik: list[Trafienie] = []
    for modul, drzewo in drzewa.items():
        skaner = _SkanerOdmow(modul, klasy)
        skaner.visit(drzewo)
        wynik += skaner.odmowy
    return sorted(wynik, key=lambda t: (t.modul, t.linia, t.tozsamosc))


def zmierz(korzen: Path = BACKEND_SRC) -> list[Trafienie]:
    return trafienia_w_modulach(_moduly(korzen))


def _typy_wyjatku(typ: ast.expr | None) -> list[str]:
    if typ is None:
        return []
    elementy = typ.elts if isinstance(typ, ast.Tuple) else [typ]
    return [n for n in (_nazwa_bazy(e) for e in elementy) if n is not None]


def _samo_zdanie_odmowy(detail: ast.expr, nazwa: str | None) -> bool:
    """`detail` to samo zdanie odmowy: `str(exc)` albo f-napis z `exc` (pola gubione).

    `detail` w postaci struktury (słownik, lista z polem identyfikatora) jest jawnym
    kontraktem odpowiedzi routera — nie jest przekładem gubiącym pola."""
    if nazwa is None:
        return False
    if isinstance(detail, ast.Call) and _nazwa_bazy(detail.func) in {"str", "repr"}:
        return any(isinstance(a, ast.Name) and a.id == nazwa for a in detail.args)
    if isinstance(detail, ast.JoinedStr):
        return any(
            isinstance(w, ast.FormattedValue)
            and isinstance(w.value, ast.Name)
            and w.value.id == nazwa
            for w in detail.values
        )
    return False


def _podnosi_http_exception(handler: ast.ExceptHandler) -> bool:
    for wezel in ast.walk(ast.Module(body=handler.body, type_ignores=[])):
        if isinstance(wezel, ast.Raise) and isinstance(wezel.exc, ast.Call):
            if _nazwa_bazy(wezel.exc.func) != "HTTPException":
                continue
            for kw in wezel.exc.keywords:
                if kw.arg == "detail" and _samo_zdanie_odmowy(kw.value, handler.name):
                    return True
    return False


def przeklady_na_http(moduly: dict[str, str]) -> list[str]:
    """`moduł:linia` każdego bloku `except` w `api/**`, który łapie klasę rodziny odmowy
    i podnosi `HTTPException` (gubi pola strukturalne odmowy)."""
    drzewa = {m: ast.parse(k) for m, k in sorted(moduly.items())}
    klasy = rodzina(drzewa)
    wynik: list[str] = []
    for modul, drzewo in drzewa.items():
        if not modul.startswith("api/"):
            continue
        for wezel in ast.walk(drzewo):
            if (
                isinstance(wezel, ast.ExceptHandler)
                and any(t in klasy for t in _typy_wyjatku(wezel.type))
                and _podnosi_http_exception(wezel)
            ):
                wynik.append(f"{modul}:{wezel.lineno}")
    return sorted(wynik)


def _moduly(korzen: Path) -> dict[str, str]:
    pliki = sorted(korzen.rglob("*.py"))
    if not pliki:
        raise PustySkanError(f"brak modulow Pythona w {korzen}")
    moduly = {p.relative_to(korzen).as_posix(): p.read_text(encoding="utf-8") for p in pliki}
    if not any(f"class {KLASA_KORZENIA}(" in kod for kod in moduly.values()):
        raise PustySkanError(f"brak klasy {KLASA_KORZENIA} w {korzen}")
    return moduly


def policz(trafienia: list[Trafienie]) -> Counter[str]:
    return Counter(t.tozsamosc for t in trafienia)


#: Uzasadnienie wspólne odmów adaptera dynamiki z identyfikatorem ELEMENTU MIGAWKI.
_ADAPTER_DYNAMIKI_ZAMIANA_NAZW = (
    "Odmowa adaptera dynamiki (`OdmowaWejsciaDynamiki`) cytuje identyfikator elementu "
    "ISTNIEJĄCEGO w migawce biegu (iteracja po migawce albo element już odnaleziony) i ma "
    "jedną drogę do projektanta: `enm/canonical_analysis.py::_execute_dynamika_rms` przepisuje "
    "treść przez `application.dynamika.odmowy.komunikat_dla_projektanta`, który zamienia "
    "każdy identyfikator migawki na nazwę z `enm.nazwy_elementow` (test "
    "`tests/application/dynamika/test_zalozenia_i_odmowy_dla_projektanta.py::"
    "test_odmowa_rdzenia_z_odbiorem_dociera_do_projektanta_z_nazwa`). Identyfikatory SPOZA "
    "migawki (bieg, odcisk migawki, szyna spoza modelu) zostały z treści usunięte w partii 10."
)
#: Uzasadnienie odmowy rdzenia dynamiki cytującej miejsce zwarcia (węzeł albo gałąź migawki).
_RDZEN_DYNAMIKI_MIEJSCE_ZWARCIA = (
    "Odmowa rdzenia dynamiki `KOD_ZWARCIE_NIEODIZOLOWANE` (`SilnikDynamiki._sprawdz_izolacje`) "
    "opisuje miejsce zwarcia słowami („w węźle X” / „na gałęzi X (położenie względne g)”, "
    "karta komunikatów 2026-10-29 — dawniej słownik Pythona `{'wezel': …}`); X jest "
    "identyfikatorem elementu ISTNIEJĄCEGO w migawce biegu (zdarzenie zwarcia odnalezione "
    "w sieci rdzenia), a treść ma jedną drogę do projektanta: "
    "`application.dynamika.odmowy.komunikat_dla_projektanta` zamienia go na nazwę z "
    "`enm.nazwy_elementow` — ta sama droga co odmowy adaptera (`_ADAPTER_DYNAMIKI_ZAMIANA_NAZW`). "
    "Rdzeń nie zna nazw elementów (granica importów rdzenia dynamiki)."
)
#: Uzasadnienie wspólne odmów katalogu projektu cytujących oznaczenie z arkusza projektanta.
_OZNACZENIE_Z_ARKUSZA = (
    "Oznaczenie pozycji/karty katalogu projektu WPISAŁ projektant w arkuszu importu — to jego "
    "dana, a przedmiotem odmowy jest właśnie kolizja tego oznaczenia (z katalogiem statycznym "
    "albo z inną pozycją); bez zacytowania oznaczenia projektant nie wie, który wiersz "
    "arkusza poprawić. Typ i karta, z którymi koliduje, są w treści opisane NAZWĄ."
)

#: Lista dozwolona: tożsamość → (liczba wystąpień, uzasadnienie merytoryczne). Zapadka w dół.
DOZWOLONE: dict[str, tuple[int, str]] = {
    "enm/adapter_dynamiki.py:_charakterystyka_odbioru:OdmowaWejsciaDynamiki:.ref_id": (
        1,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "enm/adapter_dynamiki.py:_sprawdz_szyny:OdmowaWejsciaDynamiki:ref_id": (
        1,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "enm/adapter_dynamiki.py:harmonogram_z_scenariusza:OdmowaWejsciaDynamiki:.ref_id": (
        1,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "enm/adapter_dynamiki.py:punkt_pracy_z_biegu_rozplywu:OdmowaWejsciaDynamiki:ref_id": (
        1,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "enm/adapter_dynamiki.py:zloz_urzadzenia:OdmowaWejsciaDynamiki:.ref_id": (
        2,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "enm/adapter_dynamiki.py:zloz_urzadzenia:OdmowaWejsciaDynamiki:ref": (
        1,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "enm/adapter_dynamiki.py:zloz_widok_sieci:OdmowaWejsciaDynamiki:.ref_id": (
        4,
        _ADAPTER_DYNAMIKI_ZAMIANA_NAZW,
    ),
    "network_model/solvers/dynamika/silnik.py:SilnikDynamiki._sprawdz_izolacje:OdmowaDynamiki:"
    "opis_miejsca": (
        1,
        _RDZEN_DYNAMIKI_MIEJSCE_ZWARCIA,
    ),
    "enm/katalog_projektu.py:_katalog_z_klucza:BladKataloguProjektu:zajete": (
        1,
        _OZNACZENIE_Z_ARKUSZA,
    ),
    "enm/katalog_projektu_karty.py:dodaj_karte_do_sekcji:BladKartWidmowych:.id": (
        3,
        _OZNACZENIE_Z_ARKUSZA,
    ),
}


def porownaj_z_lista(pomiar: Counter[str], dozwolone: dict[str, tuple[int, str]]) -> list[str]:
    bledy: list[str] = []
    for tozsamosc, ile in sorted(pomiar.items()):
        wpis = dozwolone.get(tozsamosc)
        if wpis is None:
            bledy.append(f"[identyfikator-w-odmowie] {tozsamosc} ({ile})")
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
        przeklady = przeklady_na_http(_moduly(korzen))
    except PustySkanError as blad:
        print(f"odmowa_bez_identyfikatora_guard: PUSTY SKAN ({blad}) — to blad, nie zielen.")
        return 1
    pomiar = policz(trafienia)
    print(
        f"odmowa_bez_identyfikatora_guard: {len(trafienia)} odwolan do identyfikatora "
        f"w tresci odmow ({len(pomiar)} tozsamosci; lista dozwolona {len(DOZWOLONE)})"
    )
    if "--zmierz" in argv:
        for trafienie in trafienia:
            print(f"  {trafienie.modul}:{trafienie.linia}  {trafienie.tozsamosc}")
    bledy = porownaj_z_lista(pomiar, DOZWOLONE)
    bledy += [f"[odmowa-na-HTTPException] {miejsce}" for miejsce in przeklady]
    if bledy:
        print("NARUSZENIA:")
        for blad in bledy:
            print("  " + blad)
        return 1
    print(
        "OK: zadna tresc odmowy danych nie niesie identyfikatora maszynowego; "
        "zaden router nie przeklada odmowy na HTTPException."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

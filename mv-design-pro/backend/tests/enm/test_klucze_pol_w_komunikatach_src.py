"""Klasa: surowy klucz pola kontraktu w komunikacie dla projektanta — strażnik CAŁEGO ``src``.

PO CO. Karta #142 (``test_komunikaty_operacji_bez_kodow.py``) pilnuje inwentarza modułów
komunikatów operacji domenowych pełnym zestawem reguł (kody, identyfikatory, sklejenia).
Klasa „surowy klucz parametru zamiast nazwy wielkości” jest szersza: komunikat odmowy,
walidacji albo ostrzeżenia trafia do projektanta z KAŻDEGO miejsca, którego wyjątek
albo rekord przechodzi do API/UI — rdzeń obliczeniowy (odmowa 422 podglądu, bieg
zakończony odmową), walidator modelu (pydantic → 422), scenariusz, katalog, import
arkusza, analiza. Ten strażnik przegląda drzewo składniowe całego ``src`` i w tekstach
przekazywanych KANAŁEM widocznym dla projektanta szuka tokenu ``snake_case``, kodu
``WIELKIE_LITERY_Z_PODKRESLNIKIEM``, znanego kodu wartości i fragmentu w odwróconych
apostrofach (reguła ``kody_w_tekscie`` — ta sama, co w karcie #142; symbole wielkości
z indeksem dolnym są jawną listą z podstawą normową).

KANAŁ = argument wywołania wyjątku widocznego dla projektanta albo rekordu komunikatu
(``ValueError`` — pydantic przenosi jego treść do 422, bieg kończy się z nią odmową;
``HTTPException``; ``PydanticCustomError``; KAŻDA klasa wyjątku zdefiniowana w ``src``,
zebrana przechodnio z drzewa składniowego, nie wpisana ręką) albo argument nazwany
komunikatu (``message_pl``, ``detail``, ``fix_hint_pl``…). Gołe ``KeyError``/``TypeError``/
``RuntimeError`` są błędem programu (odpowiedź 500), nie komunikatem — poza kanałem.

REGUŁY TEJ SAMEJ RODZINY (wewnętrzny identyfikator kodu w zdaniu dla projektanta):

* nazwa klasy ``src`` (``CamelCase`` zebrany z drzewa składniowego) albo ``type(x).__name__``
  w zdaniu — w modułach odmów tłumaczonych dopuszczalna tylko w odwróconych apostrofach, bo
  tłumacz zamienia ją na polską nazwę rodzaju (``NAZWY_KLAS_DYNAMIKI_PL``);
* identyfikator elementu w zdaniu ZOSTAJE (projektant potrzebuje wskazania elementu), ale
  musi stać przy nim polska nazwa rodzaju obiektu („Linia L-12: …”) — goły identyfikator
  jest naruszeniem;
* kod reguły („kod reguły: KAT-T-006”) jest dowodem audytowym wyłącznie jako dopisek PO
  polskim zdaniu — komunikat złożony z samego kodu albo samej wartości jest naruszeniem.

Rdzenie zamrożone B-01 (``scripts/rdzenie_b01.py``) są W zakresie strażnika (pin 0) —
decyzja B-01 architekta dopuściła zmianę wyłącznie literałów komunikatów tych plików.

WYŁĄCZENIA (każde z uzasadnieniem merytorycznym i testem żywotności):

* klasy błędów programu (``BLEDY_PROGRAMU``) — wyjątek oznacza defekt kodu, nie danych;
* moduły bez konsumenta produkcyjnego (``MODULY_POZA_KLASA``);
* tokeny FORMATU DANYCH projektanta (``TOKENY_FORMATU_DANYCH``) — nagłówek kolumny
  arkusza, klucz pliku cennika, wartość słownika arkusza: projektant wpisuje DOKŁADNIE ten
  napis, więc komunikat musi go zacytować;
* odmowy rdzenia i adaptera dynamiki (``MODULY_ODMOW_TLUMACZONYCH``): klucz cytowany
  w odwróconych apostrofach zamienia na etykietę formularza scenariusza
  ``application.dynamika.odmowy.komunikat_dla_projektanta`` (jedno źródło etykiet,
  ``enm.scenariusze.ETYKIETY_POL``) — strażnik stosuje TĘ SAMĄ funkcję etykiety;
  klucz bez etykiety albo goły (bez apostrofów) pozostaje naruszeniem.
"""

from __future__ import annotations

import ast
import builtins
import importlib.util
import re
from collections.abc import Mapping
from functools import cache
from pathlib import Path

import pytest
from application.dynamika.odmowy import etykieta_klucza

from tests.enm.test_komunikaty_operacji_bez_kodow import (
    _LUDZKI,
    SRC,
    Naruszenie,
    ZakresModulu,
    _interpolacja_identyfikatora,
    _poza_komunikatem,
    _rodzice,
    kody_w_tekscie,
    naruszenia_modulu,
    teksty_komunikatow,
)

#: Wyjątki biblioteczne, których treść trafia do projektanta.
KANALY_ZEWNETRZNE: frozenset[str] = frozenset(
    {"ValueError", "HTTPException", "PydanticCustomError"}
)
#: Rekordy komunikatu (pozycje gotowości, kwestie walidacji, ostrzeżenia analiz).
KANALY_REKORDOW: frozenset[str] = frozenset(
    {"ValidationIssue", "ReadinessIssue", "Ostrzezenie", "Issue", "Problem", "Uwaga"}
)
#: Argumenty nazwane, których wartość jest zdaniem dla projektanta.
KANALY_SLOW: frozenset[str] = frozenset(
    {
        "detail",
        "message",
        "message_pl",
        "komunikat",
        "komunikat_pl",
        "ostrzezenie",
        "ostrzezenia",
        "warning",
        "warnings",
        "uwagi",
        "opis_pl",
        "powod_pl",
        "przyczyna",
        "przyczyna_pl",
        "naprawa",
        "naprawa_pl",
        "fix_hint",
        "fix_hint_pl",
        "hint",
        "podpowiedz",
    }
)

#: Klasy wyjątków oznaczające DEFEKT PROGRAMU (nie danych projektanta) — poza kanałem.
BLEDY_PROGRAMU: dict[str, str] = {
    "BladRejestruNiezmiennikow": (
        "rejestr reguł katalogu sprawdza własną definicję przy imporcie modułu i wywołania "
        "bramki z kodem spoza rejestru — błąd programisty (docstring `regula`), nie odmowa "
        "rekordu katalogu; rekord odmawia `OdmowaKatalogu`"
    ),
    "LegacyFieldSpecsError": (
        "zapis modelu z dawnymi słownikami pól jest błędem operacji, która je zapisała "
        "(`enm/store.py`, karta W5-B): model z pliku przechodzi migrację przed zapisem"
    ),
}

#: Moduły bez konsumenta produkcyjnego — ich komunikat nie ma drogi do projektanta.
MODULY_POZA_KLASA: dict[str, tuple[str, str]] = {
    # ścieżka (plik albo katalog z ``/``) → (prefiks jedynych dozwolonych konsumentów,
    # uzasadnienie)
    "network_model/core/action_envelope.py": (
        "network_model/core/",
        "koperta akcji migawki (event-sourcing IR) ma zero konsumentów produkcyjnych — "
        "wyłącznie testy; procedura kasacji legacy persystencji IR "
        "(`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §D-03)",
    ),
    "application/symphony/": (
        "application/symphony/",
        "orkiestrator zadań agentów programistycznych (plik konfiguracji przebiegów agentów) "
        "— narzędzie wytwórcze, nie część produktu: żaden moduł API ani produktu go nie "
        "importuje, więc jego komunikat nie ma drogi do projektanta",
    ),
}

#: Tokeny formatu danych wpisywanych przez projektanta (``plik:token``).
TOKENY_FORMATU_DANYCH: dict[str, str] = {
    "application/xlsx_import/importer.py:zaczep_min": "nagłówek kolumny arkusza transformatorów",
    "application/xlsx_import/importer.py:zaczep_max": "nagłówek kolumny arkusza transformatorów",
    "application/xlsx_import/importer.py:PLUS_6": (
        "wartość słownika tolerancji nN w arkuszu (tabela 1 IEC 60909-0) — projektant ją wpisuje"
    ),
    "application/xlsx_import/importer.py:PLUS_10": (
        "wartość słownika tolerancji nN w arkuszu (tabela 1 IEC 60909-0) — projektant ją wpisuje"
    ),
    "application/analyses/zgodnosc_powykonawcza.py:element_ref": (
        "nagłówek kolumny pliku CSV pomiarów powykonawczych"
    ),
    "catalog/cenniki/loader.py:type_id": "klucz pozycji pliku YAML cennika",
    "catalog/cenniki/loader.py:data_cen": "klucz sekcji głównej pliku YAML cennika",
    "catalog/cenniki/loader.py:energia_strat": "klucz sekcji pliku YAML cennika",
    # Warstwy normatywne NC RfG (rdzeń B-01, decyzja architekta 2026-10-29: zmiana WYŁĄCZNIE
    # tekstów — wyrażenia zostają). Pliki są danymi produktu (`catalog/profiles/nc_rfg/`;
    # publiczne wejścia modułu nie przyjmują innego katalogu — `test_warstwy_nc_rfg_tylko_
    # z_pakietu`), a komunikat wskazuje opiekunowi danych klucz albo wartość, które ma
    # poprawić w pliku YAML — cytat zapisu pliku jest jedynym precyzyjnym wskazaniem.
    "catalog/profiles/nc_rfg/loader.py:bank_nastaw": "klucz sekcji pliku YAML operatora",
    "catalog/profiles/nc_rfg/loader.py:wykonanie_prawa": "klucz sekcji pliku YAML operatora",
    "catalog/profiles/nc_rfg/loader.py:` ⟨⟩ `": (
        "klucz sekcji pliku YAML operatora cytowany zmienną pętli po `bank_nastaw`, "
        "`wykonanie_prawa`"
    ),
    "catalog/profiles/nc_rfg/loader.py:NC_RFG": "wartość klucza `warstwa` pliku YAML warstwy",
    "catalog/profiles/nc_rfg/loader.py:PROCEDURA_PTPIREE": (
        "wartość klucza `warstwa` pliku YAML warstwy"
    ),
}

#: Moduły, których odmowy przechodzą przez ``komunikat_dla_projektanta`` (prefiks katalogu
#: kończy się ``/``).
MODULY_ODMOW_TLUMACZONYCH: dict[str, str] = {
    "network_model/solvers/dynamika/": (
        "odmowy rdzenia dynamiki (`OdmowaDynamiki`) — `enm/canonical_analysis.py` zamienia "
        "klucze na etykiety przed zapisem komunikatu biegu"
    ),
    "enm/adapter_dynamiki.py": (
        "odmowy adaptera dynamiki (`OdmowaWejsciaDynamiki`) — ta sama zamiana w "
        "`enm/canonical_analysis.py`"
    ),
}
#: Interpolacja klucza w apostrofach (``f"`{nazwa}`"``) w module tłumaczonym — dopuszczalna,
#: gdy KAŻDA wartość zmiennej ma etykietę (przypina ``test_petla_nastaw_ma_etykiety``).
INTERPOLOWANE_KLUCZE_TLUMACZONE: dict[str, str] = {
    "network_model/solvers/dynamika/kontrakty.py": (
        "pętla dodatniości nastaw solvera po literalnych kluczach `NastawySolvera`"
    ),
    "network_model/solvers/dynamika/urzadzenia/zrodlo_testowe.py": (
        "pętla skończoności po polach segmentu profilu źródła testowego (każde pole każdego "
        "segmentu ma etykietę — `test_pola_segmentow_profilu_maja_etykiety`)"
    ),
}

#: Funkcje wstawiające parametr do komunikatu, których literalne klucze NIE są klasą
#: (``plik::funkcja`` → uzasadnienie; każdy wpis ma test warunku).
HELPERY_POZA_KLASA: dict[str, str] = {
    "network_model/ir_fields.py::BrakujacePoleIRError": (
        "integralność rekordu IR (plik katalogu statycznego, migawka zapisana przez system) — "
        "jedyne wejście pisane przez projektanta, katalog projektu z arkusza, zamienia klucz "
        "na etykietę (`enm/katalog_projektu.py`, `etykieta_parametru`)"
    ),
    "application/solvers/power_flow_binding.py::_liczba": (
        "integralność zapisanego wyniku rozpływu — klucz zamrożonego kontraktu wyniku "
        "(zapisuje solver, projektant go nie wpisuje; komunikat każe przeliczyć)"
    ),
    "application/solvers/power_flow_binding.py::_tekst": "jak `_liczba` tego modułu",
    "application/solvers/power_flow_binding.py::_lista": "jak `_liczba` tego modułu",
    "application/solvers/power_flow_binding.py::_calkowita": "jak `_liczba` tego modułu",
    "application/solvers/power_flow_binding.py::_logiczna": "jak `_liczba` tego modułu",
    "application/analyses/voltage_profile_view.py::_wymagana_liczba_galezi": (
        "integralność zapisanego wyniku rozpływu (pola zamrożonego `PowerFlowBranchResult`)"
    ),
    "application/analyses/voltage_profile_view.py::_wymagana_liczba_podsumowania": (
        "integralność zapisanego wyniku rozpływu (pola zamrożonego `PowerFlowSummary`)"
    ),
    "application/analyses/konwencja_mocy.py::_wymagana_moc_galezi": (
        "integralność zapisanego wyniku rozpływu (pola zamrożonego `PowerFlowBranchResult`)"
    ),
    "enm/rozplyw_wysp.py::_unia": (
        "niezmiennik programu: wyspy rozpływu są rozłączne z konstrukcji — odmowa oznacza "
        "defekt składania wysp, pole to atrybut `PowerFlowNewtonSolution`"
    ),
    "domain/project_archive.py::_sekcja": (
        "format pliku archiwum projektu — sekcja nazwana tak, jak stoi w pliku (ścieżka pola "
        "formatu jest jedynym precyzyjnym wskazaniem w pliku, który importuje projektant)"
    ),
    "domain/incremental_archive.py::_wartosc_enum": "format pliku paczki przyrostowej",
    "domain/readiness.py::ReadinessGateError": (
        "bramki `require_*` modułu gotowości bez konsumenta produkcyjnego (wyłącznie testy)"
    ),
    "network_model/odmowa_danych.py::OdmowaNazwana": (
        "kod maszynowy trafia do zdania wyłącznie w odmowie niezmiennika „kod nie należy do "
        "treści” — dla poprawnego wywołania gałąź nie odpala"
    ),
    "infrastructure/persistence/repositories/document_store_repository.py::"
    "build_document_record": (
        "odmowa NIEZNANEJ wartości słownika rodzajów dokumentu — literał z wywołania jest "
        "wartością słownika, więc gałąź nie odpala"
    ),
    "network_model/catalog/rodzaje_aparatury.py::wielkosc_zwarciowa_aparatu_sn_dotyczy": (
        "odmowa NIEZNANEJ wielkości zwarciowej — literał z wywołania jest wielkością słownika"
    ),
    "network_model/catalog/rodzaje_aparatury.py::wielkosc_zwarciowa_lacznika_dotyczy": (
        "odmowa NIEZNANEJ wielkości zwarciowej — literał z wywołania jest wielkością słownika"
    ),
    "network_model/catalog/sekcje_modelu.py::dane_typu": (
        "odmowa przestrzeni katalogu BEZ widoku sekcji — literał z wywołania ma widok"
    ),
}

_ZASTEPNIK = "` ⟨⟩ `"


def _tresc(plik: Path) -> str:
    """Treść pliku; pliki ``src`` czytane raz na bieg (strażnik przegląda całe drzewo wiele
    razy — reguła kanału, pętli i argumentów, testy warunków wyłączeń)."""
    if plik.is_relative_to(SRC):
        return _tresc_src(plik)
    return plik.read_text(encoding="utf-8")


@cache
def _tresc_src(plik: Path) -> str:
    return plik.read_text(encoding="utf-8")


def _drzewo(plik: Path) -> ast.Module:
    """Drzewo składniowe pliku; pliki ``src`` parsowane raz na bieg. Plik spoza ``src``
    (moduł wstrzyknięty w ``tmp_path``) jest parsowany za każdym razem."""
    if plik.is_relative_to(SRC):
        return _drzewo_src(plik)
    return ast.parse(plik.read_text(encoding="utf-8"))


@cache
def _drzewo_src(plik: Path) -> ast.Module:
    return ast.parse(_tresc_src(plik))


@cache
def _rdzenie_b01() -> object:
    sciezka = SRC.parents[1] / "scripts" / "rdzenie_b01.py"
    spec = importlib.util.spec_from_file_location("rdzenie_b01", sciezka)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def jest_rdzeniem_b01(sciezka: str) -> bool:
    return bool(_rdzenie_b01().jest_rdzeniem_b01(sciezka))  # type: ignore[attr-defined]


@cache
def klasy_wyjatkow_src() -> frozenset[str]:
    """Każda klasa wyjątku zdefiniowana w ``src`` (przechodnio od wyjątku wbudowanego albo
    ``HTTPException``) — z drzewa składniowego, nie z ręcznej listy."""
    bazy: dict[str, set[str]] = {}
    for plik in sorted(SRC.rglob("*.py")):
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.ClassDef):
                bazy.setdefault(wezel.name, set()).update(
                    ast.unparse(baza).split(".")[-1] for baza in wezel.bases
                )
    znane = {
        nazwa
        for nazwa in dir(builtins)
        if isinstance(getattr(builtins, nazwa), type)
        and issubclass(getattr(builtins, nazwa), BaseException)
    } | {"HTTPException"}
    klasy: set[str] = set()
    while True:
        nowe = {k for k, b in bazy.items() if k not in klasy and b & (znane | klasy)}
        if not nowe:
            return frozenset(klasy)
        klasy |= nowe


def _nazwa_wywolanej(wezel: ast.Call) -> str:
    funkcja = wezel.func
    if isinstance(funkcja, ast.Name):
        return funkcja.id
    if isinstance(funkcja, ast.Attribute):
        return funkcja.attr
    return ""


@cache
def funkcje_opakowujace_src(kanaly: frozenset[str]) -> frozenset[str]:
    """Funkcje ``src``, które PRZEKAZUJĄ swój parametr do kanału (``raise``/``return``
    wywołania kanału z argumentem zależnym od parametru) — np. ``odmowa_twarda(kod,
    komunikat)`` katalogu czy ``_odmowa_charakterystyki(komunikat)`` dynamiki. Tekst podany
    takiej funkcji trafia do projektanta tak samo jak tekst samego wyjątku, więc funkcja
    jest kanałem; domknięcie przechodnie (opakowanie opakowania), z drzewa składniowego."""
    definicje: list[ast.FunctionDef | ast.AsyncFunctionDef] = [
        wezel
        for plik in sorted(SRC.rglob("*.py"))
        for wezel in ast.walk(_drzewo(plik))
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef)
    ]
    znane = set(kanaly)
    while True:
        nowe: set[str] = set()
        for definicja in definicje:
            if definicja.name in znane:
                continue
            parametry = {
                a.arg
                for a in (
                    definicja.args.posonlyargs + definicja.args.args + definicja.args.kwonlyargs
                )
            } - {"self", "cls"}
            for wezel in ast.walk(definicja):
                if isinstance(wezel, ast.Raise):
                    wywolanie = wezel.exc
                elif isinstance(wezel, ast.Return):
                    wywolanie = wezel.value
                else:
                    continue
                if not (isinstance(wywolanie, ast.Call) and _nazwa_wywolanej(wywolanie) in znane):
                    continue
                argumenty = [*wywolanie.args, *(k.value for k in wywolanie.keywords)]
                if any(
                    isinstance(n, ast.Name) and n.id in parametry
                    for argument in argumenty
                    for n in ast.walk(argument)
                ):
                    nowe.add(definicja.name)
                    break
        if not nowe:
            return frozenset(znane - set(kanaly))
        znane |= nowe


@cache
def kanaly_wywolan() -> frozenset[str]:
    bezposrednie = frozenset(
        (klasy_wyjatkow_src() - set(BLEDY_PROGRAMU)) | KANALY_ZEWNETRZNE | KANALY_REKORDOW
    )
    return bezposrednie | funkcje_opakowujace_src(bezposrednie)


def _tlumaczony(sciezka: str) -> bool:
    return any(
        sciezka == wpis or (wpis.endswith("/") and sciezka.startswith(wpis))
        for wpis in MODULY_ODMOW_TLUMACZONYCH
    )


def _surowe_naruszenia(
    sciezka: str, plik: Path | None = None, wywolania: frozenset[str] | None = None
) -> list[Naruszenie]:
    zakres = ZakresModulu(
        sciezka, wywolania=wywolania or kanaly_wywolan(), slowa_kluczowe=KANALY_SLOW
    )
    return [n for n in naruszenia_modulu(zakres, plik) if n.powod.startswith("kod ")]


def _klucze_iteracji(petla: ast.For, funkcja: ast.AST | None) -> list[str]:
    """Literalne klucze, po których iteruje pętla: krotka/lista krotek albo napisów
    (``for nazwa, wartosc in (("in_a", x), …)``) albo ``slownik.items()`` lokalnego
    słownika z literałem kluczy (``liczby = {"a_p": …}``) w tej samej funkcji."""
    zrodlo = petla.iter
    if (
        isinstance(zrodlo, ast.Call)
        and isinstance(zrodlo.func, ast.Attribute)
        and zrodlo.func.attr in {"items", "keys"}
        and isinstance(zrodlo.func.value, ast.Name)
        and funkcja is not None
    ):
        nazwa = zrodlo.func.value.id
        klucze: list[str] = []
        for wezel in ast.walk(funkcja):
            if (
                isinstance(wezel, ast.Assign)
                and any(isinstance(c, ast.Name) and c.id == nazwa for c in wezel.targets)
                and isinstance(wezel.value, ast.Dict)
            ):
                klucze += [
                    k.value
                    for k in wezel.value.keys
                    if isinstance(k, ast.Constant) and isinstance(k.value, str)
                ]
        return klucze
    if not isinstance(zrodlo, ast.Tuple | ast.List):
        return []
    klucze = []
    for element in zrodlo.elts:
        pierwszy = element.elts[0] if isinstance(element, ast.Tuple | ast.List) else element
        if isinstance(pierwszy, ast.Constant) and isinstance(pierwszy.value, str):
            klucze.append(pierwszy.value)
    return klucze


def naruszenia_petli_kluczy(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Klucz pola wstawiony do komunikatu ZMIENNĄ pętli po literałach (``f"pole {nazwa}"``)
    — reguła tekstowa widzi tylko ``{…}``, więc ta reguła czyta literały iteracji. W module
    tłumaczonym klucz w apostrofach z etykietą przechodzi (zamienia go
    ``komunikat_dla_projektanta``)."""
    drzewo = _drzewo(plik or SRC / sciezka)
    kanaly = kanaly_wywolan()
    wynik: list[Naruszenie] = []
    funkcja_wezla: dict[ast.AST, ast.AST] = {}
    for funkcja in ast.walk(drzewo):
        if isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
            for wezel in ast.walk(funkcja):
                funkcja_wezla[wezel] = funkcja  # najgłębsza funkcja wygrywa (walk: zewn.→wewn.)
    for petla in ast.walk(drzewo):
        if isinstance(petla, ast.For):
            funkcja = funkcja_wezla.get(petla)
            cel = petla.target.elts[0] if isinstance(petla.target, ast.Tuple) else petla.target
            if not isinstance(cel, ast.Name):
                continue
            klucze = [k for k in _klucze_iteracji(petla, funkcja) if kody_w_tekscie(k)]
            if not klucze:
                continue
            for wywolanie in ast.walk(petla):
                if not (isinstance(wywolanie, ast.Call) and _nazwa_wywolanej(wywolanie) in kanaly):
                    continue
                argumenty = [*wywolanie.args]
                argumenty += [k.value for k in wywolanie.keywords if k.arg in KANALY_SLOW]
                for napis in (n for a in argumenty for n in ast.walk(a)):
                    if not isinstance(napis, ast.JoinedStr):
                        continue
                    czesci = napis.values
                    for i, czesc in enumerate(czesci):
                        if not (
                            isinstance(czesc, ast.FormattedValue)
                            and isinstance(czesc.value, ast.Name)
                            and czesc.value.id == cel.id
                        ):
                            continue
                        w_apostrofach = (
                            i > 0
                            and isinstance(czesci[i - 1], ast.Constant)
                            and str(czesci[i - 1].value).endswith("`")  # type: ignore[attr-defined]
                        )
                        for klucz in klucze:
                            if (
                                w_apostrofach
                                and _tlumaczony(sciezka)
                                and etykieta_klucza(klucz) is not None
                            ):
                                continue
                            wynik.append(
                                Naruszenie(
                                    sciezka,
                                    napis.lineno,
                                    f"kod {klucz} (zmienna pętli {cel.id})",
                                    ast.unparse(napis),
                                )
                            )
    return sorted(set(wynik), key=lambda n: (n.linia, n.powod))


def _modul_pliku(sciezka: str) -> str:
    return sciezka.removesuffix(".py").removesuffix("/__init__").replace("/", ".")


def _argumenty_komunikatu(wywolanie: ast.Call) -> list[ast.expr]:
    """Argumenty wywołania kanału niosące TREŚĆ (pozycyjne i nazwane ``KANALY_SLOW``) — nie
    kod maszynowy (``kod=``), nie dane strukturalne (``dane=``)."""
    return [*wywolanie.args, *(k.value for k in wywolanie.keywords if k.arg in KANALY_SLOW)]


def _parametry(funkcja: ast.FunctionDef | ast.AsyncFunctionDef) -> tuple[list[str], list[str]]:
    pozycyjne = [a.arg for a in funkcja.args.posonlyargs + funkcja.args.args]
    if pozycyjne and pozycyjne[0] in {"self", "cls"}:
        pozycyjne = pozycyjne[1:]
    return pozycyjne, [a.arg for a in funkcja.args.kwonlyargs]


#: Miejsce parametru funkcji: (pozycja argumentu albo ``None`` dla parametru tylko-nazwanego,
#: nazwa parametru).
_MiejsceParametru = tuple[int | None, str]


@cache
def funkcje_parametryczne_src() -> dict[tuple[str, str], frozenset[_MiejsceParametru]]:
    """Funkcje (i konstruktory klas wyjątków), które wstawiają SWÓJ PARAMETR gołą
    interpolacją (``f"… {klucz} …"``) do treści kanału — wprost albo przechodnio przez
    inną taką funkcję. Klucz: (plik względem ``src``, nazwa funkcji albo klasy).

    Po co: reguła tekstowa widzi zdanie, a nie wartość podstawianą pod ``{klucz}``.
    Literał klucza podany takiej funkcji (``wymagany_float(dane, "cross_section_mm2")``)
    trafia do komunikatu tak samo jak wpisany w zdanie."""
    kanaly = kanaly_wywolan()
    definicje: dict[tuple[str, str], ast.FunctionDef | ast.AsyncFunctionDef] = {}
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        for wezel in _drzewo(plik).body:
            if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
                definicje[(sciezka, wezel.name)] = wezel
            elif isinstance(wezel, ast.ClassDef) and wezel.name in kanaly:
                for metoda in wezel.body:
                    if isinstance(metoda, ast.FunctionDef) and metoda.name == "__init__":
                        definicje[(sciezka, wezel.name)] = metoda
    miejsca: dict[tuple[str, str], set[_MiejsceParametru]] = {k: set() for k in definicje}

    def _miejsce(nazwa: str, pozycyjne: list[str], nazwane: list[str]) -> _MiejsceParametru | None:
        if nazwa in pozycyjne:
            return (pozycyjne.index(nazwa), nazwa)
        if nazwa in nazwane:
            return (None, nazwa)
        return None

    wylaczone = {tuple(wpis.split("::", 1)) for wpis in HELPERY_POZA_KLASA}
    for klucz, funkcja in definicje.items():
        if klucz in wylaczone:
            continue
        pozycyjne, nazwane = _parametry(funkcja)
        for wywolanie in ast.walk(funkcja):
            if not (
                isinstance(wywolanie, ast.Call)
                and _nazwa_wywolanej(wywolanie) in kanaly | {"__init__"}
            ):
                continue
            for napis in (n for a in _argumenty_komunikatu(wywolanie) for n in ast.walk(a)):
                if isinstance(napis, ast.JoinedStr):
                    for czesc in napis.values:
                        if isinstance(czesc, ast.FormattedValue) and isinstance(
                            czesc.value, ast.Name
                        ):
                            miejsce = _miejsce(czesc.value.id, pozycyjne, nazwane)
                            if miejsce is not None:
                                miejsca[klucz].add(miejsce)
    while True:
        zmiana = False
        for klucz, funkcja in definicje.items():
            if klucz in wylaczone:
                continue
            pozycyjne, nazwane = _parametry(funkcja)
            for wywolanie in ast.walk(funkcja):
                if not isinstance(wywolanie, ast.Call):
                    continue
                cel = _rozwiaz_wywolanie(klucz[0], wywolanie, definicje)
                if cel is None or cel == klucz or cel in wylaczone:
                    continue
                for argument in _argumenty_w_miejscach(wywolanie, miejsca[cel]):
                    if isinstance(argument, ast.Name):
                        miejsce = _miejsce(argument.id, pozycyjne, nazwane)
                        if miejsce is not None and miejsce not in miejsca[klucz]:
                            miejsca[klucz].add(miejsce)
                            zmiana = True
        if not zmiana:
            return {k: frozenset(v) for k, v in miejsca.items() if v}


@cache
def _importy_nazw(sciezka: str) -> dict[str, tuple[str, str]]:
    """Nazwa zaimportowana w module → (plik źródłowy względem ``src``, nazwa w nim)."""
    pliki = {_modul_pliku(p.relative_to(SRC).as_posix()): p for p in SRC.rglob("*.py")}
    wynik: dict[str, tuple[str, str]] = {}
    for wezel in ast.walk(_drzewo(SRC / sciezka)):
        if isinstance(wezel, ast.ImportFrom) and wezel.module in pliki:
            zrodlo = pliki[wezel.module].relative_to(SRC).as_posix()
            for alias in wezel.names:
                wynik[alias.asname or alias.name] = (zrodlo, alias.name)
    return wynik


def _rozwiaz_wywolanie(
    sciezka: str, wywolanie: ast.Call, definicje: Mapping[tuple[str, str], object]
) -> tuple[str, str] | None:
    """Definicja wołanej funkcji: ten sam moduł albo import z nazwy (bez zgadywania)."""
    if not isinstance(wywolanie.func, ast.Name):
        return None
    nazwa = wywolanie.func.id
    if (sciezka, nazwa) in definicje:
        return (sciezka, nazwa)
    zrodlo = _importy_nazw(sciezka).get(nazwa)
    return zrodlo if zrodlo in definicje else None


def _argumenty_w_miejscach(
    wywolanie: ast.Call, miejsca: frozenset[_MiejsceParametru] | set[_MiejsceParametru]
) -> list[ast.expr]:
    wynik: list[ast.expr] = []
    for pozycja, nazwa in miejsca:
        if pozycja is not None and pozycja < len(wywolanie.args):
            wynik.append(wywolanie.args[pozycja])
        wynik += [k.value for k in wywolanie.keywords if k.arg == nazwa]
    return wynik


def naruszenia_kluczy_w_argumentach(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Literał klucza pola podany funkcji, która wstawia ten argument do treści kanału
    (``funkcje_parametryczne_src``), poza ``HELPERY_POZA_KLASA``."""
    parametryczne = funkcje_parametryczne_src()
    wynik: list[Naruszenie] = []
    drzewo = _drzewo(plik or SRC / sciezka)
    for wywolanie in ast.walk(drzewo):
        if not isinstance(wywolanie, ast.Call):
            continue
        cel = _rozwiaz_wywolanie(sciezka, wywolanie, parametryczne)
        if cel is None:
            continue
        for argument in _argumenty_w_miejscach(wywolanie, parametryczne[cel]):
            if (
                isinstance(argument, ast.Constant)
                and isinstance(argument.value, str)
                and " " not in argument.value
            ):
                for token in kody_w_tekscie(argument.value):
                    wynik.append(
                        Naruszenie(
                            sciezka,
                            wywolanie.lineno,
                            f"kod {token} (argument {cel[1]})",
                            argument.value,
                        )
                    )
    return wynik


# ---------------------------------------------------------------------------
# Reguły tej samej rodziny: identyfikator KODU zamiast słowa w zdaniu dla projektanta
# ---------------------------------------------------------------------------

#: Nazwa klasy w zapisie ``WielkieLiteryBezSpacji`` (co najmniej dwa człony).
_NAZWA_KLASY = re.compile(r"(?<![\w.`])([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+)(?![\w])")
#: Nazwa klasy w zapisie atrybutu (``Measurement.sigma``) — także klasa jednoczłonowa.
_KLASA_Z_ATRYBUTEM = re.compile(r"(?<![\w.`])([A-Z][A-Za-z0-9]*)\.[a-z_][A-Za-z0-9_]*")
#: Wyrażenie wstawiające nazwę typu Pythona (``type(x).__name__``, ``x.__class__``).
_NAZWA_TYPU = re.compile(r"__name__|__class__|__qualname__")
#: Rdzenie polskich nazw rodzajów elementów i obiektów, które projektant rozpoznaje — przy
#: identyfikatorze w zdaniu stoi słowo mówiące, CZYM jest wskazany obiekt (rozstrzygnięcie
#: architekta 2026-10-29: identyfikator elementu zostaje jako wskazanie, warunkiem jest
#: polska nazwa rodzaju). Lista jest jawna; nowy rodzaj obiektu w komunikacie dopisuje się
#: tutaj, a nie omija regułę.
_RODZAJE_OBIEKTOW = re.compile(
    r"^(?:węz|wez|szyn|gałą|gałę|galaz|galez|transformator|łączni|lacznik|stacj|pol[eau]$|pól"
    r"|źródł|zrodl|odbi|moduł|modul|profil|przypad|scenariusz|bieg|przebieg|projek|kryteri"
    r"|wymagani|kart|typ|pozycj|aparat|wkładk|pakiet|rodzin|wzor|szablon|element|blok|seri"
    r"|kopi|krzyw|charakterystyk|urządze|urzadze|generator|zabezpiecz|przekładnik|kab|lini"
    r"|bateri|magazyn|segment|krok|dokument|punkt|wysp|obliczeni|test|nastaw|format"
    r"|producent|wytwórc|zacisk|równani|rownani|rekord|detektor|dozor|zdarzeni|odcin|sekcj"
    r"|rozdzielnic|zwarci|analiz|ocen|raport|porównani|porownani|cennik|katalog|tor|obwód"
    r"|obwod|faz|przełącz|zaczep|odgromnik|ogranicznik|uziemie|rdzeń|rdzen|kondensator"
    r"|dławik|dlawik|turbin|falownik|przekształtnik|przeksztaltnik|składni|skladni|maszyn"
    r"|regulator|stabilizator|jednostk|odejści|odejsci|konfiguracj|migawk|operacj|przewód"
    r"|przewod|rcd$|der$|oze$|osd$|operator|wariant|grup|plik|warstw|zestaw|wynik|rozpływ"
    r"|rozplyw|ścieżk|sciezk|trasa|tras|miejsc|zasob|zasób)",
    re.IGNORECASE,
)
#: Słowa kotwiczące identyfikator (``o ID``, ``identyfikatorem``) — pomijane przy szukaniu
#: nazwy rodzaju, bo same nie mówią, czym jest obiekt.
_KOTWICE_IDENTYFIKATORA = re.compile(
    r"(?:\s+o)?\s+(?:ID|id|identyfikatorze|identyfikatorem|identyfikator|identyfikatora)$"
)
#: Zmienna niosąca kod maszynowy (nie zdanie): ``kod``, ``code``, ``kod_reguly``, ``error_code``.
_ZMIENNA_KODU = re.compile(r"(?:^|\.)(?:kod|code|kod_\w+|code_\w+|\w+_kod|\w+_code)$")
#: Nazwy parametrów niosących TREŚĆ komunikatu w konstruktorach wyjątków i opakowaniach.
_PARAMETRY_TRESCI: frozenset[str] = frozenset(
    {"komunikat", "message", "msg", "tekst", "tresc", "opis", "komunikat_pl", "message_pl"}
)


@cache
def klasy_src() -> frozenset[str]:
    """Nazwa każdej klasy zdefiniowanej w ``src`` (z drzewa składniowego)."""
    return frozenset(
        wezel.name
        for plik in sorted(SRC.rglob("*.py"))
        for wezel in ast.walk(_drzewo(plik))
        if isinstance(wezel, ast.ClassDef)
    )


def ma_nazwe_rodzaju(przed: str) -> bool:
    """Czy tekst stojący PRZED identyfikatorem nazywa rodzaj obiektu (ostatnie trzy słowa,
    bez cudzysłowów, nawiasu otwierającego i słów kotwiczących ``o ID``)."""
    tekst = przed.replace("⟨⟩", " ").rstrip(" '\"„“”«»(:=#[")
    tekst = _KOTWICE_IDENTYFIKATORA.sub("", tekst)
    slowa = re.findall(r"[^\W\d_][\w]*", tekst)[-3:]
    return any(_RODZAJE_OBIEKTOW.match(slowo) for slowo in slowa)


def _dane_wyrazenia(wyrazenie: ast.expr) -> list[ast.Name]:
    """Zmienne, których WARTOŚĆ wchodzi do wyrażenia (argument, element, operand) — bez
    odbiorcy metody (``seria.sorted_items()`` nie niesie tekstu ``seria``)."""
    odbiorcy = {
        id(w.value)
        for w in ast.walk(wyrazenie)
        if isinstance(w, ast.Attribute) and isinstance(w.value, ast.Name)
    }
    return [n for n in ast.walk(wyrazenie) if isinstance(n, ast.Name) and id(n) not in odbiorcy]


def _nazwy_skazone(drzewo: ast.Module) -> dict[int, set[str]]:
    """Zmienne lokalne funkcji, których wartość pochodzi z nazwy typu (``obce =
    tuple(type(z).__name__ for z in …)``), przechodnio — klucz: ``id`` funkcji."""
    wynik: dict[int, set[str]] = {}
    for funkcja in ast.walk(drzewo):
        if not isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        skazone: set[str] = set()
        while True:
            nowe = {
                cel.id
                for wezel in ast.walk(funkcja)
                if isinstance(wezel, ast.Assign)
                for cel in wezel.targets
                if isinstance(cel, ast.Name)
                and cel.id not in skazone
                and (
                    _NAZWA_TYPU.search(ast.unparse(wezel.value))
                    or any(n.id in skazone for n in _dane_wyrazenia(wezel.value))
                )
            }
            if not nowe:
                break
            skazone |= nowe
        wynik[id(funkcja)] = skazone
    return wynik


def _w_apostrofach(czesci: list[ast.expr], i: int) -> bool:
    """Wstawka ``czesci[i]`` f-stringu stoi w odwróconych apostrofach (`` `{…}` ``)."""
    przed = czesci[i - 1] if i > 0 else None
    po = czesci[i + 1] if i + 1 < len(czesci) else None
    return (
        isinstance(przed, ast.Constant)
        and str(przed.value).endswith("`")
        and isinstance(po, ast.Constant)
        and str(po.value).startswith("`")
    )


def _nazwa_typu_tlumaczona(wyrazenie: ast.expr) -> bool:
    """``type(x).__name__`` — nazwa klasy, którą ``komunikat_dla_projektanta`` zamienia na
    rodzaj obiektu słowami (``NAZWY_KLAS_DYNAMIKI_PL``; kompletność przypina test rodzin)."""
    return (
        isinstance(wyrazenie, ast.Attribute)
        and wyrazenie.attr == "__name__"
        and isinstance(wyrazenie.value, ast.Call)
        and isinstance(wyrazenie.value.func, ast.Name)
        and wyrazenie.value.func.id == "type"
    )


def _zlaczenie_w_apostrofach(wezel: ast.AST) -> bool:
    """``", ".join(f"`{n}`" for n in …)`` — każdy element w odwróconych apostrofach."""
    return (
        isinstance(wezel, ast.Call)
        and isinstance(wezel.func, ast.Attribute)
        and wezel.func.attr == "join"
        and len(wezel.args) == 1
        and isinstance(wezel.args[0], ast.GeneratorExp)
        and isinstance(wezel.args[0].elt, ast.JoinedStr)
        and ast.unparse(wezel.args[0].elt).startswith("f'`{")
        and ast.unparse(wezel.args[0].elt).endswith("}`'")
    )


def naruszenia_nazw_i_identyfikatorow(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Ta sama rodzina co klucz pola — identyfikator KODU w zdaniu dla projektanta:

    * ``klasa X`` — nazwa klasy ``src`` w tekście (``NetworkSnapshot``, ``Measurement.sigma``);
    * ``nazwa typu E`` — wstawka nazwy typu Pythona (``type(x).__name__``) albo zmiennej
      z niej wyprowadzonej; w module tłumaczonym ``type(x).__name__`` w odwróconych
      apostrofach przechodzi (rodzaj obiektu słowami z ``NAZWY_KLAS_DYNAMIKI_PL``);
    * ``identyfikator bez rodzaju E`` — identyfikator elementu bez polskiej nazwy rodzaju
      przed nim (``Run nie znaleziony: {run_id}``)."""
    drzewo = _drzewo(plik or SRC / sciezka)
    zakres = ZakresModulu(sciezka, wywolania=kanaly_wywolan(), slowa_kluczowe=KANALY_SLOW)
    klasy = klasy_src()
    tlumaczony = _tlumaczony(sciezka)
    skazone_funkcji = _nazwy_skazone(drzewo)
    funkcja_wezla: dict[int, ast.AST] = {}
    for funkcja in ast.walk(drzewo):
        if isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
            for wezel in ast.walk(funkcja):
                funkcja_wezla[id(wezel)] = funkcja
    wynik: list[Naruszenie] = []
    for komunikat, _rodzice_tekstu in teksty_komunikatow(zakres, drzewo):
        wezel, tekst = komunikat.wezel, komunikat.tekst
        stale = tekst.replace(" ⟨⟩ ", " ")
        for nazwa in sorted(
            set(_NAZWA_KLASY.findall(stale)) | set(_KLASA_Z_ATRYBUTEM.findall(stale))
        ):
            if nazwa in klasy:
                wynik.append(Naruszenie(sciezka, wezel.lineno, f"klasa {nazwa}", tekst))
        if not isinstance(wezel, ast.JoinedStr):
            continue
        funkcja = funkcja_wezla.get(id(wezel))
        skazone = skazone_funkcji.get(id(funkcja), set()) if funkcja is not None else set()
        czesci = list(wezel.values)
        for i, czesc in enumerate(czesci):
            if not isinstance(czesc, ast.FormattedValue):
                continue
            wyrazenie = czesc.value
            zrodlo = ast.unparse(wyrazenie)
            uzyte = {n.id for n in _dane_wyrazenia(wyrazenie)} & skazone
            if _NAZWA_TYPU.search(zrodlo) or uzyte:
                dozwolone = tlumaczony and (
                    (_nazwa_typu_tlumaczona(wyrazenie) and _w_apostrofach(czesci, i))
                    or (
                        isinstance(wyrazenie, ast.Name)
                        and funkcja is not None
                        and all(
                            _zlaczenie_w_apostrofach(przypisanie.value)
                            for przypisanie in ast.walk(funkcja)
                            if isinstance(przypisanie, ast.Assign)
                            and any(
                                isinstance(c, ast.Name) and c.id == wyrazenie.id
                                for c in przypisanie.targets
                            )
                        )
                    )
                )
                if not dozwolone:
                    wynik.append(Naruszenie(sciezka, wezel.lineno, f"nazwa typu {zrodlo}", tekst))
            identyfikator = _interpolacja_identyfikatora(wyrazenie)
            if identyfikator is not None:
                przed = "".join(
                    str(c.value) if isinstance(c, ast.Constant) else " ⟨⟩ " for c in czesci[:i]
                )
                if not ma_nazwe_rodzaju(przed):
                    wynik.append(
                        Naruszenie(
                            sciezka,
                            wezel.lineno,
                            f"identyfikator bez rodzaju {identyfikator}",
                            tekst,
                        )
                    )
    zgloszone = {(n.linia, n.powod) for n in wynik}
    for komunikat, rodzice in teksty_komunikatow(ZakresModulu(sciezka), drzewo):
        wezel = komunikat.wezel
        if not isinstance(wezel, ast.JoinedStr) or _w_bledzie_programu(wezel, rodzice):
            continue
        czesci = list(wezel.values)
        for i, czesc in enumerate(czesci):
            if not (
                isinstance(czesc, ast.FormattedValue)
                and _NAZWA_TYPU.search(ast.unparse(czesc.value))
            ):
                continue
            if tlumaczony and _nazwa_typu_tlumaczona(czesc.value) and _w_apostrofach(czesci, i):
                continue
            powod = f"nazwa typu {ast.unparse(czesc.value)}"
            if (wezel.lineno, powod) not in zgloszone:
                wynik.append(Naruszenie(sciezka, wezel.lineno, powod, komunikat.tekst))
    return wynik


def _w_bledzie_programu(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> bool:
    """Tekst wyjątku spoza kanału (``TypeError``, ``KeyError``, ``RuntimeError``…) — błąd
    programu: odpowiedź 500 i dziennik serwera, nie zdanie dla projektanta."""
    kanaly = kanaly_wywolan()
    przodek = rodzice.get(id(wezel))
    while przodek is not None:
        if isinstance(przodek, ast.Raise):
            wyjatek = przodek.exc
            return isinstance(wyjatek, ast.Call) and _nazwa_wywolanej(wyjatek) not in kanaly
        przodek = rodzice.get(id(przodek))
    return False


@cache
def pozycje_tresci() -> dict[str, int | None]:
    """Pozycja argumentu TREŚCI w wywołaniu kanału: pierwszy parametr o nazwie treści
    (``komunikat``, ``message``…) konstruktora wyjątku albo opakowania ``src``; klasa bez
    własnego konstruktora — argument 0 (``Exception(komunikat)``); ``None`` — treść
    wyłącznie argumentem nazwanym (rekordy, ``HTTPException(detail=…)``)."""
    pozycje: dict[str, int | None] = {
        "ValueError": 0,
        "HTTPException": None,
        "PydanticCustomError": 1,
    }
    kanaly = kanaly_wywolan()
    for plik in sorted(SRC.rglob("*.py")):
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.ClassDef) and wezel.name in kanaly:
                if wezel.name in KANALY_REKORDOW:
                    pozycje.setdefault(wezel.name, None)
                    continue
                konstruktor = next(
                    (
                        f
                        for f in wezel.body
                        if isinstance(f, ast.FunctionDef) and f.name == "__init__"
                    ),
                    None,
                )
                if konstruktor is None:
                    pozycje.setdefault(wezel.name, 0)
                    continue
                parametry = [a.arg for a in konstruktor.args.args][1:]
                pozycje.setdefault(
                    wezel.name,
                    next((i for i, a in enumerate(parametry) if a in _PARAMETRY_TRESCI), None),
                )
            elif isinstance(wezel, ast.FunctionDef) and wezel.name in kanaly:
                parametry = [a.arg for a in wezel.args.args if a.arg not in {"self", "cls"}]
                pozycje.setdefault(
                    wezel.name,
                    next((i for i, a in enumerate(parametry) if a in _PARAMETRY_TRESCI), None),
                )
    return pozycje


def _bez_zdania(argument: ast.expr) -> str | None:
    """Opis argumentu treści, który NIE niesie zdania po polsku (sam kod, pusty napis,
    wstawki wyłącznie kodów i identyfikatorów); ``None`` — treść jest zdaniem albo
    zmienną tekstu, której strażnik nie rozstrzyga składniowo."""
    if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
        return None if _LUDZKI.search(argument.value) else repr(argument.value)
    if isinstance(argument, ast.JoinedStr):
        stale = "".join(str(c.value) for c in argument.values if isinstance(c, ast.Constant))
        if _LUDZKI.search(stale):
            return None
        wstawki = [c.value for c in argument.values if isinstance(c, ast.FormattedValue)]
        if all(
            _interpolacja_identyfikatora(w) is not None or _ZMIENNA_KODU.search(ast.unparse(w))
            for w in wstawki
        ):
            return ast.unparse(argument)
        return None
    if isinstance(argument, ast.Name | ast.Attribute) and _ZMIENNA_KODU.search(
        ast.unparse(argument)
    ):
        return ast.unparse(argument)
    return None


def naruszenia_tresci_bez_zdania(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Komunikat, którego JEDYNĄ treścią jest kod (``odmowa_twarda("KAT-T-006",
    "KAT-T-006")``, ``ValueError(kod)``) — rozstrzygnięcie architekta 2026-10-29: kod reguły
    zostaje WYŁĄCZNIE jako dopisek po polskim zdaniu, które obywa się bez niego. Reguły
    tekstowe pomijają napis bez słowa po polsku (nie jest zdaniem), więc ta reguła czyta
    argument treści wprost."""
    drzewo = _drzewo(plik or SRC / sciezka)
    rodzice = _rodzice(drzewo)
    pozycje = pozycje_tresci()
    kanaly = kanaly_wywolan()
    wynik: list[Naruszenie] = []
    for wywolanie in ast.walk(drzewo):
        if not isinstance(wywolanie, ast.Call):
            continue
        nazwa = _nazwa_wywolanej(wywolanie)
        argumenty: list[ast.expr] = []
        if nazwa in kanaly:
            pozycja = pozycje.get(nazwa)
            if pozycja is not None and len(wywolanie.args) > pozycja:
                argumenty.append(wywolanie.args[pozycja])
            argumenty += [
                k.value
                for k in wywolanie.keywords
                if k.arg in _PARAMETRY_TRESCI or k.arg in KANALY_SLOW
            ]
        else:
            argumenty += [k.value for k in wywolanie.keywords if k.arg in KANALY_SLOW]
        for argument in argumenty:
            if isinstance(argument, ast.Starred) or _poza_komunikatem(argument, rodzice):
                continue
            opis = _bez_zdania(argument)
            if opis is not None:
                wynik.append(
                    Naruszenie(sciezka, wywolanie.lineno, f"treść bez zdania {opis}", opis)
                )
    return wynik


def _linie_nazw_typow_tlumaczonych(sciezka: str, plik: Path | None = None) -> set[int]:
    """Wiersze f-stringów, w których KAŻDA wstawka w odwróconych apostrofach jest nazwą typu
    (``type(x).__name__``) albo złączeniem nazw w apostrofach — w module tłumaczonym zamienia
    je na rodzaj obiektu słowami ``komunikat_dla_projektanta`` (``NAZWY_KLAS_DYNAMIKI_PL``)."""
    wiersze: set[int] = set()
    for napis in ast.walk(_drzewo(plik or SRC / sciezka)):
        if not isinstance(napis, ast.JoinedStr):
            continue
        czesci = list(napis.values)
        w_apostrofach = [
            czesc.value
            for i, czesc in enumerate(czesci)
            if isinstance(czesc, ast.FormattedValue) and _w_apostrofach(czesci, i)
        ]
        if w_apostrofach and all(_nazwa_typu_tlumaczona(w) for w in w_apostrofach):
            wiersze.add(napis.lineno)
    return wiersze


def _token_naruszenia(naruszenie: Naruszenie) -> str:
    """Token kodu z powodu naruszenia reguły tekstowej, pętli albo argumentu
    (``kod bank_nastaw (zmienna pętli sekcja)`` → ``bank_nastaw``)."""
    token = naruszenie.powod.removeprefix("kod ")
    return token if token == _ZASTEPNIK else token.split(" (", 1)[0]


def naruszenia_klasy(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Naruszenia klasy w module (po wyłączeniach z uzasadnieniem)."""
    wynik: list[Naruszenie] = [
        n
        for n in (
            *naruszenia_petli_kluczy(sciezka, plik),
            *naruszenia_kluczy_w_argumentach(sciezka, plik),
        )
        if f"{sciezka}:{_token_naruszenia(n)}" not in TOKENY_FORMATU_DANYCH
    ]
    wynik += naruszenia_nazw_i_identyfikatorow(sciezka, plik)
    wynik += naruszenia_tresci_bez_zdania(sciezka, plik)
    for naruszenie in _surowe_naruszenia(sciezka, plik):
        token = _token_naruszenia(naruszenie)
        if f"{sciezka}:{token}" in TOKENY_FORMATU_DANYCH:
            continue
        if _tlumaczony(sciezka):
            if token == _ZASTEPNIK and sciezka in INTERPOLOWANE_KLUCZE_TLUMACZONE:
                continue
            if token == _ZASTEPNIK and naruszenie.linia in _linie_nazw_typow_tlumaczonych(
                sciezka, plik
            ):
                continue
            klucz = token.strip("`")
            if f"`{klucz}`" in naruszenie.tekst and etykieta_klucza(klucz) is not None:
                continue
        wynik.append(naruszenie)
    return wynik


def _moduly_klasy() -> list[str]:
    return [
        plik.relative_to(SRC).as_posix()
        for plik in sorted(SRC.rglob("*.py"))
        if not _poza_klasa(plik.relative_to(SRC).as_posix())
    ]


def _poza_klasa(sciezka: str) -> bool:
    return any(
        sciezka == wpis or (wpis.endswith("/") and sciezka.startswith(wpis))
        for wpis in MODULY_POZA_KLASA
    )


def test_komunikaty_calego_src_bez_kluczy_pol() -> None:
    """KLASA: żaden komunikat odmowy, walidacji ani ostrzeżenia w ``src`` nie niesie klucza
    pola zamiast nazwy wielkości."""
    naruszenia = [n for sciezka in _moduly_klasy() for n in naruszenia_klasy(sciezka)]
    assert not naruszenia, "\n".join(str(n) for n in naruszenia)


def test_kanal_obejmuje_wyjatki_projektu_i_pomija_bledy_programu() -> None:
    """Kanał jest wyprowadzony z drzewa klas: wyjątki, których treść projektant widzi
    (scenariusz, import arkusza, brak zasobu, budowa grafu, odmowy dynamiki), są w nim;
    klasy błędu programu — nie."""
    kanaly = kanaly_wywolan()
    for klasa in (
        "OdmowaDanychError",
        "OdmowaNazwana",
        "FaultScenarioValidationError",
        "XlsxValidationError",
        "BrakZasobuError",
        "BenchmarkBuildError",
        "OdmowaDynamiki",
        "OdmowaWejsciaDynamiki",
        "TemplateApplyError",
        "ValueError",
        "HTTPException",
    ):
        assert klasa in kanaly, klasa
    assert not (set(BLEDY_PROGRAMU) & kanaly)
    assert "KeyError" not in kanaly and "TypeError" not in kanaly


def test_wylaczenia_klasy_sa_zywe() -> None:
    """Każde wyłączenie wskazuje istniejące miejsce, które BEZ wyłączenia byłoby naruszeniem
    — martwy wpis byłby furtką dla przyszłego klucza w tym samym miejscu."""
    klasy = klasy_wyjatkow_src()
    for klasa in BLEDY_PROGRAMU:
        assert klasa in klasy, klasa
        z_klasa = [
            plik.relative_to(SRC).as_posix()
            for plik in sorted(SRC.rglob("*.py"))
            if _surowe_naruszenia(plik.relative_to(SRC).as_posix(), wywolania=frozenset({klasa}))
        ]
        assert z_klasa, f"{klasa}: wyłączenie bez naruszenia — zbędne"
    for wpis in MODULY_POZA_KLASA:
        pliki = (
            sorted(p.relative_to(SRC).as_posix() for p in (SRC / wpis).rglob("*.py"))
            if wpis.endswith("/")
            else [wpis]
        )
        assert all((SRC / sciezka).is_file() for sciezka in pliki), wpis
        assert any(
            _surowe_naruszenia(sciezka) or naruszenia_kluczy_w_argumentach(sciezka)
            for sciezka in pliki
        ), f"{wpis}: wyłączenie bez naruszenia — zbędne"
    wylaczone = {tuple(wpis.split("::", 1)) for wpis in HELPERY_POZA_KLASA}
    for sciezka, nazwa in sorted(wylaczone):
        drzewo = _drzewo(SRC / sciezka)
        assert any(
            isinstance(w, ast.FunctionDef | ast.ClassDef) and w.name == nazwa for w in drzewo.body
        ), f"{sciezka}::{nazwa}: brak definicji — wpis zbędny"
    for wpis in TOKENY_FORMATU_DANYCH:
        sciezka, token = wpis.split(":", 1)
        tokeny = {
            _token_naruszenia(n)
            for n in (
                *_surowe_naruszenia(sciezka),
                *naruszenia_petli_kluczy(sciezka),
                *naruszenia_kluczy_w_argumentach(sciezka),
            )
        }
        assert token in tokeny, f"{wpis}: token nie występuje w komunikacie — wpis zbędny"
    for wpis in MODULY_ODMOW_TLUMACZONYCH:
        assert (SRC / wpis).exists(), wpis
    for sciezka in INTERPOLOWANE_KLUCZE_TLUMACZONE:
        tokeny = {n.powod.removeprefix("kod ") for n in _surowe_naruszenia(sciezka)}
        assert _ZASTEPNIK in tokeny, sciezka


def test_rdzenie_b01_sa_w_zakresie_strazenika() -> None:
    """Pin 0: rdzenie zamrożone B-01 NIE mają wyjątku — decyzja architekta 2026-10-29
    przyjęła zmianę WYŁĄCZNIE tekstów ich komunikatów (drzewa składniowe z wymazanymi
    stałymi napisowymi identyczne), więc każdy plik każdego wpisu listy B-01 jest
    sprawdzany tak samo jak reszta ``src``. Przywrócenie wyjątku czerwieni ten test."""
    moduly = set(_moduly_klasy())
    pliki_b01 = sorted(
        sciezka
        for plik in SRC.rglob("*.py")
        if jest_rdzeniem_b01(sciezka := plik.relative_to(SRC).as_posix())
    )
    assert len(pliki_b01) >= len(_rdzenie_b01().sciezki_b01())  # type: ignore[attr-defined]
    assert not [sciezka for sciezka in pliki_b01 if sciezka not in moduly]
    for wpis in _rdzenie_b01().sciezki_b01():  # type: ignore[attr-defined]
        assert any(s == wpis or s.startswith(wpis) for s in pliki_b01), wpis


def _klucz_w_apostrofach(petla: ast.For) -> bool:
    """Czy odmowa w pętli cytuje PIERWSZĄ zmienną pętli w odwróconych apostrofach
    (``f"…`{nazwa}`…"``) — tylko taka interpolacja korzysta z wyłączenia
    ``INTERPOLOWANE_KLUCZE_TLUMACZONE``; pętla z opisem po polsku go nie potrzebuje."""
    cel = petla.target.elts[0]  # type: ignore[attr-defined]
    if not isinstance(cel, ast.Name):
        return False
    for wezel in ast.walk(petla):
        if not isinstance(wezel, ast.JoinedStr):
            continue
        czesci = wezel.values
        for poprzednia, biezaca in zip(czesci, czesci[1:], strict=False):
            if (
                isinstance(poprzednia, ast.Constant)
                and str(poprzednia.value).endswith("`")
                and isinstance(biezaca, ast.FormattedValue)
                and isinstance(biezaca.value, ast.Name)
                and biezaca.value.id == cel.id
            ):
                return True
    return False


def test_petla_nastaw_ma_etykiety() -> None:
    """Interpolowany klucz pętli dodatniości nastaw (``kontrakty.py``) ma etykietę dla
    KAŻDEJ wartości — warunek wyłączenia ``INTERPOLOWANE_KLUCZE_TLUMACZONE``. Pętla, której
    odmowa podaje opis po polsku (punkt pracy: „napięcia węzłów”), wyłączenia nie używa."""
    drzewo = _drzewo(SRC / "network_model/solvers/dynamika/kontrakty.py")
    petle = [
        wezel
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.For)
        and isinstance(wezel.target, ast.Tuple)
        and isinstance(wezel.iter, ast.Tuple)
        and any(
            isinstance(z, ast.Call) and getattr(z.func, "id", "") == "OdmowaDynamiki"
            for z in ast.walk(wezel)
        )
        and _klucz_w_apostrofach(wezel)
    ]
    assert petle, "pętla nastaw zniknęła — wpis INTERPOLOWANE_KLUCZE_TLUMACZONE zbędny"
    klucze = [
        element.elts[0].value
        for petla in petle
        for element in petla.iter.elts  # type: ignore[attr-defined]
        if isinstance(element, ast.Tuple) and isinstance(element.elts[0], ast.Constant)
    ]
    assert klucze and all(etykieta_klucza(k) is not None for k in klucze), klucze


def test_symbole_wielkosci_nie_sa_kluczami() -> None:
    """Symbole z indeksem dolnym (lista z podstawą normową) przechodzą; klucz pola nie."""
    assert kody_w_tekscie("I_B ≤ I_n ≤ I_z; t_b = 0,1 s; c_max; R_A·I_Δn ≤ 50 V; u_k") == []
    assert kody_w_tekscie("Pole in_a musi być dodatnie") == ["in_a"]


def test_strazenik_wykrywa_wstrzykniety_klucz_w_kazdym_kanale(tmp_path: Path) -> None:
    """Iniekcja w kopii modułu spoza inwentarza #142: każdy kanał (wyjątek biblioteczny,
    wyjątek projektu, ``HTTPException``, argument nazwany, rekord) i każdy rodzaj tokenu
    czerwienieje; wyłączenie formatu danych działa wyłącznie dla SWOJEGO pliku."""
    wzor = SRC / "network_model" / "solvers" / "protection_lv_curves.py"
    kopia = tmp_path / "iniekcja.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(x):\n"
        + "    raise ValueError(f'Prąd in_a musi być dodatni, otrzymano {x}.')\n"
        + "def _iniekcja2(x):\n"
        + "    raise OdmowaNazwana('Pole r_total_ohm jest wymagane', kod='k')\n"
        + "def _iniekcja3(x):\n"
        + "    raise HTTPException(status_code=422, detail='Brak wartości `sk3_mva` w danych')\n"
        + "def _iniekcja4(x):\n"
        + "    return Ostrzezenie(kod='k', message_pl='Tryb SHORT_CIRCUIT_POWER bez danych')\n"
        + "def _iniekcja5(x):\n"
        + "    raise ValueError('Kolumna zaczep_min jest pusta')\n"
        + "def _iniekcja6(x):\n"
        + "    raise KeyError('klucz_wewnetrzny nie istnieje')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/protection_lv_curves.py"
    tokeny = {n.powod.removeprefix("kod ") for n in naruszenia_klasy(sciezka, kopia)}
    assert {"in_a", "r_total_ohm", "`sk3_mva`", "sk3_mva", "SHORT_CIRCUIT_POWER"} <= tokeny
    assert "zaczep_min" in tokeny  # wyłączenie formatu danych dotyczy wyłącznie importu arkusza
    assert "klucz_wewnetrzny" not in tokeny  # gołe KeyError = błąd programu, poza kanałem
    assert all(
        n.linia > len(wzor.read_text(encoding="utf-8").splitlines())
        for n in naruszenia_klasy(sciezka, kopia)
    )


def test_strazenik_modeluje_zamiane_kluczy_odmow_dynamiki(tmp_path: Path) -> None:
    """W module tłumaczonym klucz w apostrofach z etykietą przechodzi (zamienia go
    ``komunikat_dla_projektanta``); klucz goły i klucz bez etykiety — nie."""
    wzor = SRC / "network_model" / "solvers" / "dynamika" / "kontrakty.py"
    kopia = tmp_path / "kontrakty_iniekcja.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(x):\n"
        + "    raise OdmowaDynamiki('k', f'Nastawa `dt_s` = {x} poza zakresem')\n"
        + "def _iniekcja2(x):\n"
        + "    raise OdmowaDynamiki('k', f'Nastawa dt_s = {x} poza zakresem')\n"
        + "def _iniekcja3(x):\n"
        + "    raise OdmowaDynamiki('k', f'Nastawa `klucz_bez_etykiety` = {x} odrzucona')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/dynamika/kontrakty.py"
    nowe = [
        n
        for n in naruszenia_klasy(sciezka, kopia)
        if n.linia > len(wzor.read_text(encoding="utf-8").splitlines())
    ]
    tokeny = {(n.tekst.split("=")[0].strip(), n.powod.removeprefix("kod ")) for n in nowe}
    assert ("Nastawa dt_s", "dt_s") in tokeny
    assert ("Nastawa `klucz_bez_etykiety`", "`klucz_bez_etykiety`") in tokeny
    assert not any(t[0] == "Nastawa `dt_s`" for t in tokeny)


@pytest.mark.parametrize("wpis", sorted(MODULY_POZA_KLASA))
def test_modul_poza_klasa_nie_ma_konsumenta_produkcyjnego(wpis: str) -> None:
    """Warunek wyłączenia ``MODULY_POZA_KLASA``: żaden moduł produkcyjny spoza dozwolonego
    prefiksu (pakiet, który nazwy tylko reeksportuje, albo sam wyłączony pakiet) nie używa
    modułu ani żadnej jego publicznej funkcji czy klasy."""
    dozwolony_prefiks, _ = MODULY_POZA_KLASA[wpis]
    pliki = sorted((SRC / wpis).rglob("*.py")) if wpis.endswith("/") else [SRC / wpis]
    nazwy: set[str] = set()
    moduly: set[str] = set()
    for plik in pliki:
        sciezka = plik.relative_to(SRC).as_posix()
        modul = _modul_pliku(sciezka)
        moduly |= {modul, modul.rsplit(".", 1)[-1]}
        nazwy |= {
            wezel.name
            for wezel in _drzewo(plik).body
            if isinstance(wezel, ast.FunctionDef | ast.ClassDef) and not wezel.name.startswith("_")
        }
    assert nazwy, wpis

    prefiks_modulu = _modul_pliku(dozwolony_prefiks.rstrip("/") + ".py")
    pelne_moduly = {m for m in moduly if "." in m}

    def _konsument(plik: Path) -> bool:
        """Import modułu (albo pakietu) wyłączonego lub import jego publicznej nazwy
        z reeksportu w dozwolonym pakiecie — tekst docstringu nie jest użyciem."""
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.Import) and any(
                a.name in pelne_moduly or any(a.name.startswith(m + ".") for m in pelne_moduly)
                for a in wezel.names
            ):
                return True
            if isinstance(wezel, ast.ImportFrom) and wezel.module:
                if wezel.module in pelne_moduly or any(
                    wezel.module.startswith(m + ".") for m in pelne_moduly
                ):
                    return True
                if wezel.module.startswith(prefiks_modulu) and any(
                    a.name in nazwy | moduly for a in wezel.names
                ):
                    return True
        return False

    importujacy = sorted(
        plik.relative_to(SRC).as_posix()
        for plik in SRC.rglob("*.py")
        if not plik.relative_to(SRC).as_posix().startswith(dozwolony_prefiks) and _konsument(plik)
    )
    assert not importujacy, importujacy


#: Wywołania, których literał klucza pola trafia do ``nazwa_pola`` (pozycja argumentu albo
#: nazwa argumentu): ``pole``/``nazwa_pola`` (pierwszy), ``parsuj_uuid`` (drugi — klucz
#: parametru ścieżki), ``param_name=`` resolvera biegu ``api/enm.py``.
_ARGUMENTY_KLUCZA_POLA: dict[str, int] = {"pole": 0, "nazwa_pola": 0, "parsuj_uuid": 1}


def _literalne_klucze_pol() -> list[tuple[str, int, str]]:
    wynik: list[tuple[str, int, str]] = []
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        for wezel in ast.walk(_drzewo(plik)):
            if not isinstance(wezel, ast.Call):
                continue
            nazwa = getattr(wezel.func, "id", None) or getattr(wezel.func, "attr", None)
            pozycja = _ARGUMENTY_KLUCZA_POLA.get(nazwa or "")
            kandydaci: list[ast.expr] = []
            if pozycja is not None and len(wezel.args) > pozycja:
                # Wywołanie z kontekstem operacji (drugi argument ``pole``) sprawdza
                # strażnik karty #142 — tu wyłącznie klucz ogólny.
                if not (nazwa in {"pole", "nazwa_pola"} and len(wezel.args) > 1):
                    kandydaci.append(wezel.args[pozycja])
            kandydaci.extend(k.value for k in wezel.keywords if k.arg == "param_name")
            for kandydat in kandydaci:
                if isinstance(kandydat, ast.Constant) and isinstance(kandydat.value, str):
                    wynik.append((sciezka, wezel.lineno, kandydat.value))
    return wynik


def test_kazdy_literalny_klucz_pola_w_src_ma_nazwe_w_mapie() -> None:
    """Brak wpisu w ``NAZWY_POL_KONTRAKTU_PL`` nie może wyjść dopiero w ścieżce błędu
    (``KeyError`` → 500 zamiast komunikatu): każdy literał klucza w CAŁYM ``src`` —
    także poza inwentarzem #142 (``parsuj_uuid``, resolver biegu ``param_name=``) — ma
    nazwę po polsku bez tokenu kodu."""
    from enm.slownik_komunikatow import nazwa_pola

    klucze = _literalne_klucze_pol()
    sciezki = {s for s, _, _ in klucze}
    assert {"api/enm.py", "api/execution_runs.py", "api/study_cases.py"} <= sciezki
    assert any(k == "case_id" for _, _, k in klucze)
    assert any(k == "short_circuit_run_id" for _, _, k in klucze)
    braki: list[str] = []
    for sciezka, linia, klucz in klucze:
        try:
            nazwa = nazwa_pola(klucz)
        except KeyError:
            braki.append(f"{sciezka}:{linia}: {klucz} (brak wpisu)")
            continue
        if kody_w_tekscie(nazwa):
            braki.append(f"{sciezka}:{linia}: {klucz} → {nazwa!r} (token kodu w nazwie)")
    assert not braki, braki


def test_pola_segmentow_profilu_maja_etykiety() -> None:
    """Warunek wpisu ``zrodlo_testowe.py`` w ``INTERPOLOWANE_KLUCZE_TLUMACZONE``: odmowa
    skończoności cytuje KAŻDE pole KAŻDEGO segmentu profilu (``vars(segment)``) — każde ma
    etykietę, więc ``komunikat_dla_projektanta`` zamienia je na nazwę."""
    import dataclasses
    import typing

    from network_model.solvers.dynamika.urzadzenia.zrodlo_testowe import SegmentProfilu

    segmenty = typing.get_args(SegmentProfilu)
    assert len(segmenty) == 5, segmenty
    pola = {pole.name for segment in segmenty for pole in dataclasses.fields(segment)}
    assert {"t_s", "u_pu", "kat_deg", "czas_trwania_s"} <= pola
    assert all(etykieta_klucza(pole) is not None for pole in pola), sorted(
        p for p in pola if etykieta_klucza(p) is None
    )


def test_regula_petli_i_opakowan_wykrywa_wstrzykniete_klucze(tmp_path: Path) -> None:
    """Iniekcja: klucz pola wstawiony zmienną pętli (krotka literałów, ``.items()`` słownika
    lokalnego) i tekst przekazany funkcji opakowującej kanał (``odmowa_twarda``) czerwienieją;
    pętla z opisem po polsku i klucz w apostrofach z etykietą w module tłumaczonym — nie."""
    assert "odmowa_twarda" in kanaly_wywolan()
    assert "_odmowa_charakterystyki" in kanaly_wywolan()
    assert "KeyError" not in kanaly_wywolan()
    wzor = SRC / "network_model" / "solvers" / "protection_lv_curves.py"
    kopia = tmp_path / "iniekcja_petli.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja_petli(a, b):\n"
        + "    for nazwa, wartosc in (('in_a', a), ('i_query_a', b)):\n"
        + "        if wartosc <= 0:\n"
        + "            raise ValueError(f'Pole {nazwa} musi być dodatnie')\n"
        + "def _iniekcja_slownika(a):\n"
        + "    liczby = {'r_total_ohm': a}\n"
        + "    for nazwa, wartosc in liczby.items():\n"
        + "        raise OdmowaDanychError(f'{nazwa} = {wartosc} odrzucone')\n"
        + "def _iniekcja_opisu(a):\n"
        + "    for opis, wartosc in (('prąd znamionowy I_n', a),):\n"
        + "        raise ValueError(f'{opis} musi być dodatni')\n"
        + "def _iniekcja_opakowania():\n"
        + "    odmowa_twarda('KAT-T-001', 'Pole cross_section_mm2 musi być dodatnie')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/protection_lv_curves.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    tokeny = {
        n.powod.removeprefix("kod ").split(" (")[0]
        for n in naruszenia_klasy(sciezka, kopia)
        if n.linia > granica
    }
    assert {"in_a", "i_query_a", "r_total_ohm", "cross_section_mm2"} <= tokeny, tokeny
    assert not any("I_n" in t or "prąd" in t for t in tokeny), tokeny

    wzor_dyn = SRC / "network_model" / "solvers" / "dynamika" / "kontrakty.py"
    kopia_dyn = tmp_path / "kontrakty_petla.py"
    kopia_dyn.write_text(
        wzor_dyn.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja_tlumaczona(a, b):\n"
        + "    for nazwa, wartosc in (('dt_s', a), ('klucz_bez_etykiety', b)):\n"
        + "        raise OdmowaDynamiki('k', f'Nastawa `{nazwa}` = {wartosc} odrzucona')\n",
        encoding="utf-8",
    )
    sciezka_dyn = "network_model/solvers/dynamika/kontrakty.py"
    granica_dyn = len(wzor_dyn.read_text(encoding="utf-8").splitlines())
    tokeny_dyn = {
        n.powod.removeprefix("kod ").split(" (")[0]
        for n in naruszenia_petli_kluczy(sciezka_dyn, kopia_dyn)
        if n.linia > granica_dyn
    }
    assert tokeny_dyn == {"klucz_bez_etykiety"}, tokeny_dyn


def _literaly_wywolan(
    cele: set[tuple[str, str]], pozycja: int | None, nazwa: str
) -> list[tuple[str, int, str]]:
    """Literały podane w CAŁYM ``src`` funkcji z ``cele`` (rozwiązanej po imporcie) na
    miejscu parametru ``(pozycja, nazwa)``."""
    wynik: list[tuple[str, int, str]] = []
    definicje = dict.fromkeys(cele)
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        for wywolanie in ast.walk(_drzewo(plik)):
            if not isinstance(wywolanie, ast.Call):
                continue
            if _rozwiaz_wywolanie(sciezka, wywolanie, definicje) is None:
                continue
            for argument in _argumenty_w_miejscach(wywolanie, {(pozycja, nazwa)}):
                if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                    wynik.append((sciezka, wywolanie.lineno, argument.value))
    return wynik


def test_wylaczenie_rekordu_ir_brama_katalogu_projektu_nazywa_pola() -> None:
    """Warunek wpisu ``BrakujacePoleIRError``: typy, które katalog projektu (arkusz
    projektanta) składa przez ``CatalogRepository.from_records`` (linia, kabel,
    transformator), czytają pola wymagane literałem klucza z ETYKIETĄ (``etykieta_parametru``
    nie spada do opisu ogólnego), a granica katalogu projektu zamienia klucz odmowy na tę
    etykietę — nie cytuje treści wyjątku."""
    from enm.slownik_komunikatow import etykieta_parametru

    drzewo = _drzewo(SRC / "network_model/catalog/types.py")
    klasy = {"LineType", "CableType", "TransformerType"}
    klucze: set[str] = set()
    for klasa in drzewo.body:
        if not (isinstance(klasa, ast.ClassDef) and klasa.name in klasy):
            continue
        for wywolanie in ast.walk(klasa):
            if (
                isinstance(wywolanie, ast.Call)
                and _nazwa_wywolanej(wywolanie).startswith("wymagany_")
                and len(wywolanie.args) > 1
                and isinstance(wywolanie.args[1], ast.Constant)
            ):
                klucze.add(str(wywolanie.args[1].value))
    # Pola wymagane trzech typów arkusza projektanta (impedancja linii/kabla, dane
    # znamionowe transformatora) — zbiór pusty znaczyłby, że wzorzec odczytu się zmienił
    # i warunek wpisu przestał cokolwiek sprawdzać.
    assert {
        "r_ohm_per_km",
        "x_ohm_per_km",
        "rated_current_a",
        "rated_power_mva",
        "uk_percent",
        "voltage_hv_kv",
        "voltage_lv_kv",
    } <= klucze, sorted(klucze)
    ogolne = etykieta_parametru("klucz_spoza_wszystkich_slownikow")
    bez_etykiety = sorted(k for k in klucze if etykieta_parametru(k) == ogolne)
    assert not bez_etykiety, bez_etykiety

    granica = _drzewo(SRC / "enm/katalog_projektu.py")
    obsluga = [
        h
        for h in ast.walk(granica)
        if isinstance(h, ast.ExceptHandler)
        and isinstance(h.type, ast.Name)
        and h.type.id == "BrakujacePoleIRError"
    ]
    assert len(obsluga) == 1, "granica katalogu projektu musi łapać BrakujacePoleIRError"
    tresc = ast.unparse(obsluga[0])
    assert "etykieta_parametru(blad.field)" in tresc, tresc
    assert "str(blad)" not in tresc and "{blad}" not in tresc, tresc
    uzycia = sorted(
        p.relative_to(SRC).as_posix()
        for p in SRC.rglob("*.py")
        if "from_records(" in _tresc(p)
        and not p.relative_to(SRC).as_posix().startswith("network_model/catalog/")
    )
    assert uzycia == ["enm/katalog_projektu.py"], uzycia


def test_wylaczenie_wyniku_rozplywu_klucze_sa_polami_zamrozonego_kontraktu() -> None:
    """Warunek wpisów integralności wyniku rozpływu: każdy literał podany tym pomocnikom jest
    polem zamrożonego kontraktu wyniku (zapisuje go solver, nie projektant)."""
    import dataclasses

    from network_model.solvers.power_flow_newton import PowerFlowNewtonSolution
    from network_model.solvers.power_flow_result import (
        PowerFlowBranchResult,
        PowerFlowBusResult,
        PowerFlowResultV1,
        PowerFlowSummary,
    )

    pola = {
        pole.name
        for klasa in (
            PowerFlowBusResult,
            PowerFlowBranchResult,
            PowerFlowSummary,
            PowerFlowResultV1,
            PowerFlowNewtonSolution,
        )
        for pole in dataclasses.fields(klasa)
    }
    pomocnicy = {
        tuple(w.split("::", 1))
        for w in HELPERY_POZA_KLASA
        if w.split("::", 1)[0]
        in {
            "application/solvers/power_flow_binding.py",
            "application/analyses/voltage_profile_view.py",
            "application/analyses/konwencja_mocy.py",
            "enm/rozplyw_wysp.py",
        }
    }
    assert len(pomocnicy) == 9, pomocnicy
    literaly = [
        lit
        for cel in pomocnicy
        for miejsce in ((1, "klucz"), (1, "pole"))
        for lit in _literaly_wywolan({cel}, *miejsce)  # type: ignore[arg-type]
    ]
    assert len(literaly) >= 40, literaly
    # ``value`` — pole wpisu kroku śladu White Box (``{"value": …, "unit": …}``), który
    # zapisuje ``enm.canonical_analysis`` z rozwiązania solvera; to format śladu wyniku,
    # nie pole wpisywane przez projektanta.
    slad = (SRC / "enm/canonical_analysis.py").read_text(encoding="utf-8")
    assert '"max_mismatch_pu": {"value": float(solution.max_mismatch), "unit": "pu"}' in slad
    spoza = sorted({k for _, _, k in literaly} - pola - {"value"})
    assert not spoza, spoza


def test_wylaczenie_archiwum_klucze_sa_formatem_pliku() -> None:
    """Warunek wpisów formatu archiwum: literał sekcji/pola jest kluczem, który ten sam moduł
    zapisuje do pliku (``"klucz": …`` w słowniku eksportu)."""
    for sciezka, nazwa, miejsce in (
        ("domain/project_archive.py", "_sekcja", (1, "klucz")),
        ("domain/incremental_archive.py", "_wartosc_enum", (2, "sciezka")),
    ):
        literaly = {k for _, _, k in _literaly_wywolan({(sciezka, nazwa)}, *miejsce)}
        assert literaly, (sciezka, nazwa)
        drzewo = _drzewo(SRC / sciezka)
        zapisywane = {
            k.value
            for w in ast.walk(drzewo)
            if isinstance(w, ast.Dict)
            for k in w.keys
            if isinstance(k, ast.Constant)
        }
        assert literaly <= zapisywane, (sciezka, sorted(literaly - zapisywane))


def test_wylaczenie_bramek_gotowosci_bez_konsumenta() -> None:
    """Warunek wpisu ``ReadinessGateError``: ani wyjątek, ani bramki ``require_*`` nie mają
    konsumenta produkcyjnego (poza modułem i reeksportem pakietu)."""
    drzewo = _drzewo(SRC / "domain/readiness.py")
    nazwy = {"ReadinessGateError"} | {
        w.name
        for w in drzewo.body
        if isinstance(w, ast.FunctionDef) and w.name.startswith("require_")
    }
    assert len(nazwy) == 9, nazwy
    konsumenci = sorted(
        p.relative_to(SRC).as_posix()
        for p in SRC.rglob("*.py")
        if p.relative_to(SRC).as_posix() not in {"domain/readiness.py", "domain/__init__.py"}
        and {
            n.id if isinstance(n, ast.Name) else n.attr if isinstance(n, ast.Attribute) else ""
            for n in ast.walk(_drzewo(p))
        }
        & nazwy
    )
    assert not konsumenci, konsumenci


def test_wylaczenie_odmowy_nazwanej_kod_tylko_w_niezmienniku() -> None:
    """Warunek wpisu ``OdmowaNazwana``: poprawne wywołanie nie wstawia kodu do zdania; kod
    pojawia się w treści wyłącznie w odmowie niezmiennika."""
    from network_model.odmowa_danych import OdmowaNazwana

    odmowa = OdmowaNazwana("Brak mocy źródła w modelu.", kod="polecenie_osd.zrodlo_bez_mocy")
    assert "polecenie_osd" not in str(odmowa)
    with pytest.raises(ValueError, match="nie należy do treści"):
        OdmowaNazwana("Odmowa polecenie_osd.x w zdaniu", kod="polecenie_osd.x")


def test_wylaczenia_slownikowe_literaly_sa_wartosciami_slownika() -> None:
    """Warunek wpisów „odmowa NIEZNANEJ wartości”: każdy literał z wywołania należy do
    słownika, więc odmowa z jego cytatem nie odpala."""
    from infrastructure.persistence.repositories.document_store_repository import (
        DOCUMENT_TYPES,
    )
    from network_model.catalog.rodzaje_aparatury import WIELKOSCI_ZWARCIOWE_APARATU_SN
    from network_model.catalog.sekcje_modelu import PRZESTRZENIE_Z_SEKCJAMI

    rodzaje_dokumentow = {
        k
        for plik in SRC.rglob("*.py")
        for w in ast.walk(_drzewo(plik))
        if isinstance(w, ast.Call)
        for kw in w.keywords
        if kw.arg == "doc_type" and isinstance(kw.value, ast.Constant)
        for k in [str(kw.value.value)]
    }
    assert rodzaje_dokumentow and rodzaje_dokumentow <= DOCUMENT_TYPES, rodzaje_dokumentow
    sciezka = "network_model/catalog/rodzaje_aparatury.py"
    aparat = {
        k
        for _, _, k in _literaly_wywolan(
            {(sciezka, "wielkosc_zwarciowa_aparatu_sn_dotyczy")}, 1, "pole"
        )
    }
    assert aparat and aparat <= set(WIELKOSCI_ZWARCIOWE_APARATU_SN), aparat
    lacznik = {
        k
        for _, _, k in _literaly_wywolan(
            {(sciezka, "wielkosc_zwarciowa_lacznika_dotyczy")}, 1, "pole"
        )
    }
    assert lacznik <= {"ik_ka", "i_cu_ka", "icw_ka"}, lacznik
    przestrzenie = {
        k
        for _, _, k in _literaly_wywolan(
            {
                ("network_model/catalog/sekcje_modelu.py", "sekcje_typu"),
                ("network_model/catalog/sekcje_modelu.py", "dane_typu"),
            },
            1,
            "przestrzen",
        )
    }
    assert przestrzenie and przestrzenie <= set(PRZESTRZENIE_Z_SEKCJAMI), przestrzenie


def test_regula_argumentow_wykrywa_klucz_przekazany_pomocnikowi(tmp_path: Path) -> None:
    """Iniekcja: literał klucza podany funkcji, która wstawia argument do treści kanału
    (wprost, przechodnio, przez konstruktor wyjątku), czerwienieje; literał podany pomocnikowi
    wyłączonemu (``wymagany_float`` → ``BrakujacePoleIRError``) — nie."""
    wzor = SRC / "api" / "der_sn_documents.py"
    kopia = tmp_path / "iniekcja_argumentow.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(payload):\n"
        + "    return _zastosowana_wartosc(payload, 'sn_mva', 'r_total_ohm')\n"
        + "def _iniekcja_wylaczona(dane):\n"
        + "    return wymagany_float(dane, 'cross_section_mm2')\n",
        encoding="utf-8",
    )
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    tokeny = {
        n.powod
        for n in naruszenia_kluczy_w_argumentach("api/der_sn_documents.py", kopia)
        if n.linia > granica
    }
    assert tokeny == {"kod r_total_ohm (argument _zastosowana_wartosc)"}, tokeny
    parametryczne = funkcje_parametryczne_src()
    assert ("api/der_sn_documents.py", "_zastosowana_wartosc") in parametryczne
    assert ("network_model/ir_fields.py", "wymagany_float") not in parametryczne
    assert ("network_model/ir_fields.py", "BrakujacePoleIRError") not in parametryczne


# ---------------------------------------------------------------------------
# Identyfikator KODU w zdaniu: nazwa klasy, nazwa typu, identyfikator bez rodzaju, sam kod
# ---------------------------------------------------------------------------


def _rodziny_klas_dynamiki() -> dict[str, frozenset[str]]:
    """Rodziny klas rdzenia dynamiki, których nazwę odmowa cytuje ``type(x).__name__``:
    zdarzenia harmonogramu (``ZdarzenieDynamiki`` — akcja dozoru, tryb stanowiska),
    segmenty profilu źródła testowego (``SegmentProfilu``) i urządzenia (każda klasa
    ``urzadzenia/`` deklarująca ``stany_przypisywalne`` — protokół ``Urzadzenie``)."""
    from typing import get_args

    from network_model.solvers.dynamika.kontrakty import ZdarzenieDynamiki
    from network_model.solvers.dynamika.urzadzenia.zrodlo_testowe import SegmentProfilu

    urzadzenia = frozenset(
        wezel.name
        for plik in sorted((SRC / "network_model/solvers/dynamika/urzadzenia").rglob("*.py"))
        for wezel in ast.walk(_drzewo(plik))
        if isinstance(wezel, ast.ClassDef)
        and any(
            isinstance(f, ast.FunctionDef) and f.name == "stany_przypisywalne" for f in wezel.body
        )
    )
    return {
        "zdarzenia": frozenset(k.__name__ for k in get_args(ZdarzenieDynamiki)),
        "segmenty": frozenset(k.__name__ for k in get_args(SegmentProfilu)),
        "urzadzenia": urzadzenia,
    }


def test_nazwy_klas_dynamiki_kompletne_wobec_rodzin() -> None:
    """Warunek wyłączenia ``type(x).__name__`` w apostrofach w module tłumaczonym: KAŻDA
    klasa każdej rodziny ma rodzaj obiektu słowami, a każdy wpis słownika jest klasą
    rodziny (martwy wpis byłby fikcją). Rodziny pochodzą z kodu, nie z ręcznej listy."""
    from application.dynamika.odmowy import NAZWY_KLAS_DYNAMIKI_PL

    rodziny = _rodziny_klas_dynamiki()
    assert len(rodziny["urzadzenia"]) >= 10, rodziny["urzadzenia"]
    wszystkie = frozenset().union(*rodziny.values())
    assert not (wszystkie - set(NAZWY_KLAS_DYNAMIKI_PL)), sorted(
        wszystkie - set(NAZWY_KLAS_DYNAMIKI_PL)
    )
    assert not (set(NAZWY_KLAS_DYNAMIKI_PL) - wszystkie)
    for etykieta in NAZWY_KLAS_DYNAMIKI_PL.values():
        assert not kody_w_tekscie(etykieta) and not _NAZWA_KLASY.findall(etykieta), etykieta


def test_odmowa_dynamiki_nazywa_rodzaj_obiektu_slowami() -> None:
    """Realna ścieżka: odmowa rdzenia (akcja dozoru o niechwilowym rodzaju, stan
    nieprzypisywalny urządzenia) przechodzi przez ``komunikat_dla_projektanta`` i nie niesie
    nazwy klasy — niesie rodzaj obiektu słowami."""
    from application.dynamika.odmowy import NAZWY_KLAS_DYNAMIKI_PL, komunikat_dla_projektanta
    from network_model.solvers.dynamika.urzadzenia.maszyna_klasyczna import MaszynaKlasyczna
    from network_model.solvers.dynamika.zdarzenia import sprawdz_przypisanie

    urzadzenie = object.__new__(MaszynaKlasyczna)
    object.__setattr__(urzadzenie, "ident", "G1")
    with pytest.raises(Exception) as blad:
        sprawdz_przypisanie(urzadzenie, "omega_pu", 1.0, 0.5)
    tekst = komunikat_dla_projektanta(str(blad.value), {})
    assert "MaszynaKlasyczna" not in tekst
    assert NAZWY_KLAS_DYNAMIKI_PL["MaszynaKlasyczna"] in tekst, tekst
    assert not [n for n in _NAZWA_KLASY.findall(tekst) if n in klasy_src()], tekst


@pytest.mark.parametrize(
    ("tekst_przed", "oczekiwane"),
    [
        ("Nie znaleziono biegu obliczeń ", True),
        ("Węzeł o ID '", True),
        ("Generator '⟨⟩' (", True),
        ("Wykryto model w projekcie ", True),
        ("Run nie znaleziony: ", False),
        ("Kopia zapasowa nie znaleziona: project=", False),
        ("", False),
    ],
)
def test_nazwa_rodzaju_przy_identyfikatorze(tekst_przed: str, oczekiwane: bool) -> None:
    """Predykat reguły identyfikatora: rodzaj obiektu słowem przed identyfikatorem (także
    przez cytowaną nazwę i nawias), a nie sam czasownik albo zapis ``klucz=``."""
    assert ma_nazwe_rodzaju(tekst_przed) is oczekiwane


def test_regula_nazw_klas_typow_i_identyfikatorow_wykrywa_iniekcje(tmp_path: Path) -> None:
    """Iniekcja w kopii modułu (iloczyn: kanał wyjątku × kanał rekordu × tekst w zmiennej ×
    rodzaj tokenu): nazwa klasy ``src`` w zdaniu, ``type(x).__name__`` w kanale i w tekście
    zapisanym do zmiennej, zmienna wyprowadzona z nazwy typu, identyfikator bez rodzaju —
    czerwienieją; identyfikator z rodzajem, nazwa typu w błędzie programu (``TypeError``)
    i zdanie bez identyfikatora kodu — nie."""
    wzor = SRC / "network_model" / "solvers" / "protection_lv_curves.py"
    kopia = tmp_path / "iniekcja_nazw.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _i1(x):\n"
        + "    raise ValueError('Migawka NetworkSnapshot została zmieniona przez operację.')\n"
        + "def _i2(x):\n"
        + "    raise ValueError(f'Nieobsługiwany element sieci {type(x).__name__} w trasie.')\n"
        + "def _i3(run_id):\n"
        + "    raise ValueError(f'Bieg nie znaleziony w rejestrze: {run_id}')\n"
        + "def _i4(x, run):\n"
        + "    run.error_message = f'Błąd wewnętrzny programu ({type(x).__name__}) — przerwano.'\n"
        + "def _i5(xs):\n"
        + "    obce = tuple(type(x).__name__ for x in xs)\n"
        + "    raise ValueError(f'Zdarzenia spoza trybu stanowiska: {obce} są odrzucone.')\n"
        + "def _i6(element_id):\n"
        + "    return Ostrzezenie(kod='k', message_pl=f'Nie znaleziono: {element_id} w modelu')\n"
        + "def _ok1(run_id):\n"
        + "    raise ValueError(f'Nie znaleziono biegu obliczeń {run_id} w rejestrze.')\n"
        + "def _ok2(x):\n"
        + "    raise TypeError(f'Wartość typu {type(x).__name__} nie ma postaci kanonicznej.')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/protection_lv_curves.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    powody = {n.powod for n in naruszenia_klasy(sciezka, kopia) if n.linia > granica}
    assert powody == {
        "klasa NetworkSnapshot",
        "nazwa typu type(x).__name__",
        "identyfikator bez rodzaju run_id",
        "nazwa typu obce",
        "identyfikator bez rodzaju element_id",
    }, powody
    linie = sorted(n.linia - granica for n in naruszenia_klasy(sciezka, kopia) if n.linia > granica)
    # _i2 (kanał) i _i4 (tekst w zmiennej) — oba przypadki nazwy typu są złapane osobno.
    assert len(linie) == 6, linie


def test_nazwa_typu_w_module_tlumaczonym_tylko_w_apostrofach(tmp_path: Path) -> None:
    """W module tłumaczonym ``type(x).__name__`` w apostrofach (zamiana na rodzaj obiektu
    słowami) i złączenie nazw w apostrofach przechodzą; bez apostrofów — nie."""
    wzor = SRC / "network_model" / "solvers" / "dynamika" / "kontrakty.py"
    kopia = tmp_path / "kontrakty_nazwy.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _ok(x):\n"
        + "    raise OdmowaDynamiki('k', f'akcja `{type(x).__name__}` nie jest chwilowa')\n"
        + "def _ok2(xs):\n"
        + "    obce = tuple(type(x).__name__ for x in xs)\n"
        + "    lista = ', '.join(f'`{n}`' for n in sorted(obce))\n"
        + "    raise OdmowaDynamiki('k', f'zdarzenia ({lista}) należą do innego trybu')\n"
        + "def _zle(x):\n"
        + "    raise OdmowaDynamiki('k', f'akcja {type(x).__name__} nie jest chwilowa')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/dynamika/kontrakty.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    powody = [n.powod for n in naruszenia_klasy(sciezka, kopia) if n.linia > granica]
    assert powody == ["nazwa typu type(x).__name__"], powody


def test_regula_tresci_bez_zdania_wykrywa_sam_kod(tmp_path: Path) -> None:
    """Rozstrzygnięcie architekta: kod reguły zostaje wyłącznie jako dopisek po zdaniu.
    Iniekcja: treść będąca samym kodem (napis, zmienna kodu, f-string z samym kodem,
    argument nazwany rekordu) czerwienieje; zdanie z kodem w dopisku — nie."""
    wzor = SRC / "network_model" / "catalog" / "niezmienniki_katalogu.py"
    kopia = tmp_path / "iniekcja_tresci.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _i1():\n"
        + "    odmowa_twarda('KAT-T-006', 'KAT-T-006')\n"
        + "def _i2(kod):\n"
        + "    raise ValueError(kod)\n"
        + "def _i3(kod, element_id):\n"
        + "    raise HTTPException(status_code=422, detail=f'{kod}: {element_id}')\n"
        + "def _i4(kod):\n"
        + "    return Ostrzezenie(kod='k', message_pl=kod)\n"
        + "def _ok(kod):\n"
        + "    odmowa_twarda('KAT-T-006', f'Przekrój żyły musi być dodatni (reguła {kod}).')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/catalog/niezmienniki_katalogu.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    powody = sorted(
        n.powod for n in naruszenia_tresci_bez_zdania(sciezka, kopia) if n.linia > granica
    )
    assert powody == [
        "treść bez zdania 'KAT-T-006'",
        "treść bez zdania f'{kod}: {element_id}'",
        "treść bez zdania kod",
        "treść bez zdania kod",
    ], powody


def test_kod_reguly_katalogu_jest_dopiskiem_po_zdaniu() -> None:
    """Odmowa twardej reguły katalogu: zdanie po polsku, a kod reguły WYŁĄCZNIE jako dopisek
    ``(kod reguły: …)`` na końcu — zdanie bez dopisku jest pełne (obywa się bez kodu)."""
    from network_model.catalog.niezmienniki_katalogu import (
        REGULY_KATALOGU,
        OdmowaKatalogu,
        odmowa_twarda,
    )

    kod = next(k for k, r in sorted(REGULY_KATALOGU.items()) if r.twarda)
    zdanie = "Przekrój żyły musi być dodatni."
    with pytest.raises(OdmowaKatalogu) as blad:
        odmowa_twarda(kod, zdanie)
    tekst = str(blad.value)
    assert tekst == f"{zdanie} (kod reguły: {kod})"
    assert kod not in tekst.removesuffix(f" (kod reguły: {kod})")


def test_warstwy_nc_rfg_tylko_z_pakietu() -> None:
    """Warunek wpisów ``TOKENY_FORMATU_DANYCH`` warstw NC RfG: publiczne wejścia modułu nie
    przyjmują katalogu warstw ani operatorów (pliki są danymi produktu z pakietu), a żaden
    moduł ``src`` spoza modułu nie podaje ich katalogu."""
    sciezka = "catalog/profiles/nc_rfg/loader.py"
    drzewo = _drzewo(SRC / sciezka)
    publiczne = [
        w for w in drzewo.body if isinstance(w, ast.FunctionDef) and not w.name.startswith("_")
    ]
    assert publiczne
    for funkcja in publiczne:
        parametry = [a.arg for a in (*funkcja.args.args, *funkcja.args.kwonlyargs)]
        assert not [p for p in parametry if p.startswith("katalog")], funkcja.name
    for plik in sorted(SRC.rglob("*.py")):
        if plik.relative_to(SRC).as_posix() == sciezka:
            continue
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.keyword) and wezel.arg in {
                "katalog_warstw",
                "katalog_operatorow",
            }:
                raise AssertionError(f"{plik}: podaje katalog warstw NC RfG")

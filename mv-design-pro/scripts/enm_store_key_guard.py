#!/usr/bin/env python3
"""
CI Guard: enm_store_key_guard.py - karta CV-1-G (2026-09-04).

Inwariant (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2, ADR-012 korekta
2026-09-04, enm/store.py naglowek): magazyn ENM (`enm/store.py`) jest
kluczowany kluczem Canonical Project Twin
(`enm/klucz_twin.py::klucz_twin_projektu(project_id)` -> "projekt:<uuid>").
`case_id` NIE JEST kluczem magazynu - jest adresem WEJSCIOWYM API,
tlumaczonym na klucz projektu w JEDNYM miejscu
(`application/twin_key.py::klucz_twin_dla_przypadku`). Warstwa API/aplikacji
nie smie wolac magazynu surowym `case_id` (ani zmienna/atrybutem o nazwie
kojarzacej sie z przypadkiem) - musi przejsc przez tlumacza.

PO CO TA BRAMKA. Magazyn byl do CV-1 kluczowany `sha256(case_id)`, wiec kazdy
przypadek obliczeniowy mial WLASNA siec ("StudyCase owns ENM" zamiast
"PROJECT owns ENM" - defekt nazwany w naglowku `enm/store.py`). CV-1
wprowadzil klucz projektu i JEDNO miejsce tlumaczenia, ale nie przepisal od
razu wszystkich wywolan magazynu w warstwie API/aplikacji - to jest DLUG
MIGRACJI STRANGLEROWEJ (CLAUDE.md, ZASADA NR 3: dlug wykryty ma MALEC, nigdy
rosnac po cichu). Bez tej bramki nowe wywolanie magazynu surowym `case_id`
(kopiuj-wklej z ktoregos z istniejacych zastanych miejsc) wchodzi do repo bez
ostrzezenia, a dlug rosnie zamiast malec.

CO WYKRYWA (analiza skladni, nie dopasowanie tekstu)
-----------------------------------------------------
Trafieniem jest WYWOLANIE funkcji magazynu `get_enm`, `set_enm`, `has_enm`,
`restore_enm`, `blokada_twin` (zaimportowanej z `enm.store` pod DOWOLNA
lokalna nazwa), ktorego PIERWSZY argument jest "adresem przypadku":

  * `ast.Name`, ktorego identyfikator zawiera "case"
    (`case_id`, `case_key`, `case_ref`, `new_case_id`, ...),
  * `ast.Attribute`, ktorego atrybut zawiera "case"
    (`payload.case_id`, `run.case_id`, `scenario.study_case_id`, ...),
  * `ast.Call` do `str(...)` z JEDNYM argumentem powyzszej postaci
    (`str(case_id)`, `str(scenario.study_case_id)`, `str(new_case_id)`).

DROGI IMPORTU SA ROZPOZNAWANE TRANZYTYWNIE, NIE TYLKO WPROST (obie proste
formy i jeden REEKSPORT zyja w repo - patrz `zbuduj_eksporty`):
  * `from enm.store import get_enm as _get_enm` - lokalna nazwa FUNKCJI,
    dowolny alias (`_get_enm`, `_set_enm`, `_has_enm`, ...);
  * `from enm import store` + `store.get_enm(...)` - lokalna nazwa MODULU;
  * REEKSPORT PRZEZ TRZECI PLIK: `api/enm.py` importuje `get_enm`/`set_enm`
    z `enm.store` pod aliasem `_get_enm`/`_set_enm`, a
    `application/station_templates/apply.py` importuje TE ALIASY z
    `api.enm` (lokalnie, wewnatrz funkcji, zeby uniknac cyklu importow) -
    `_get_enm(case_key)`/`_set_enm(case_key, ...)` tam sa wywolaniem
    magazynu surowym case_id DOKLADNIE tak samo, jak gdyby wolaly
    `enm.store` wprost. Wlasny pomiar przy pisaniu tej bramki (regula
    KLASA-NIE-INSTANCJA z CLAUDE.md, punkt 1: inwentarz klasy PRZED naprawa) -
    pierwsza wersja rozpoznawala wylacznie import BEZPOSREDNI z `enm.store`
    i milczala na tych dwoch wywolaniach mimo ze plik jest W ZAKRESIE SKANU.

WYJATEK - DROGA PRZEZ TLUMACZA. Argument POCHODZACY z wywolania
`klucz_twin_dla_przypadku(...)` albo `klucz_twin_projektu(...)`
(bezposrednio jako wywolanie, albo przez zmienna o nazwie zawierajacej
"klucz") NIE jest naruszeniem - to jest dokladnie droga, ktora ta bramka ma
WYMUSZAC, a nie karac:

    klucz = klucz_twin_dla_przypadku(case_id, uow_factory)
    enm = get_enm(klucz)                    # NIE jest naruszeniem

    enm = get_enm(case_id)                  # JEST naruszeniem (forma "name")
    enm = get_enm(payload.case_id)          # JEST naruszeniem (forma "attr")
    enm = get_enm(str(scenario.study_case_id))  # JEST naruszeniem (forma "str")

ZAKRES SKANU
------------
`api/**` i `application/**` pod `backend/src`, Z WYJATKIEM
`application/twin_key.py` - to JEDYNE miejsce, w ktorym tlumaczenie
`case_id -> klucz projektu` smie sie odbywac, wiec ten plik z natury rzeczy
przyjmuje surowy `case_id` jako WEJSCIE swojej wlasnej funkcji tlumaczacej
(patrz jego wlasny naglowek: "JEDYNE miejsce tlumaczenia").

ZAPADKA (`ZASTANE_KLUCZE_PRZYPADKU`)
-------------------------------------
Konwencja `solver_input_substitute_guard.py` / `no_direct_fault_params_guard.py`:
budzet wiaze KONKRETNA, zmierzona liczbe zastanych wywolan surowym `case_id`
NA PLIK (nie na sygnature - dlug tej karty jest jednorodny: "ten plik
jeszcze nie przeszedl na klucz projektu", a nie zbior odrebnych wzorcow).
Liczba zmierzona 2026-09-04 (uruchomieniem tego skanu z pusta zapadka).

Zapadka dziala W OBIE STRONY: NADWYZKA ponad budzet to naruszenie (nowe
uzycie surowego `case_id` zamiast klucza projektu), a NIEDOBOR tez jest
czerwony i zada OBNIZENIA budzetu - inaczej migracja pliku na klucz projektu
nie zostaje utrwalona i dlug wraca po cichu przy nastepnej zmianie tego
pliku. Budzet moze wylacznie MALEC do zera - to jest miara postepu migracji
stranglerowej z docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Korzenie skanowania (wzgledem BACKEND_SRC) - patrz "ZAKRES SKANU" wyzej.
SCAN_ROOTS: tuple[str, ...] = ("api", "application")

#: Jedyny plik w zakresie WOLNY od reguly - tlumacz `case_id` -> klucz projektu.
#: Sciezki wzgledem BACKEND_SRC.
WYLACZONE_PLIKI: frozenset[str] = frozenset({"application/twin_key.py"})

#: Funkcje magazynu objete regula (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2).
FUNKCJE_MAGAZYNU: frozenset[str] = frozenset(
    {"get_enm", "set_enm", "has_enm", "restore_enm", "blokada_twin"}
)

#: Funkcje tlumacza - argument POCHODZACY z ich wywolania nie jest naruszeniem
#: (patrz "WYJATEK - DROGA PRZEZ TLUMACZA" wyzej).
FUNKCJE_TLUMACZA: frozenset[str] = frozenset({"klucz_twin_dla_przypadku", "klucz_twin_projektu"})

_TOKEN_CASE = "case"
_TOKEN_KLUCZ = "klucz"


def _nazwa_wywolania(expr: ast.expr) -> str | None:
    """Nazwa funkcji wywolywanej w `expr`, jesli `expr` jest wywolaniem (`ast.Call`)."""
    if not isinstance(expr, ast.Call):
        return None
    if isinstance(expr.func, ast.Name):
        return expr.func.id
    if isinstance(expr.func, ast.Attribute):
        return expr.func.attr
    return None


def _identyfikator(expr: ast.expr) -> str | None:
    """Identyfikator `Name`/`Attribute` (sama nazwa/atrybut, bez sciezki), albo None."""
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return expr.attr
    return None


def sciezka_kropkowana(expr: ast.expr) -> str:
    """Czytelny opis wyrazenia `Name`/`Attribute` do komunikatu bledu (np. "payload.case_id")."""
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return f"{sciezka_kropkowana(expr.value)}.{expr.attr}"
    return "<wyrazenie>"


def opis_argumentu_przypadku(expr: ast.expr) -> tuple[str, str] | None:
    """(`forma`, `cel`), gdy `expr` jest ADRESEM PRZYPADKU wedlug reguly wyzej, albo None.

    `forma` in {"name", "attr", "str"}. WYJATEK TLUMACZA jest rozstrzygany TUTAJ,
    w jednym miejscu (bezposrednie wywolanie funkcji tlumacza jako `expr` samo
    w sobie, albo `expr` bedace Name/Attribute o identyfikatorze zawierajacym
    "klucz") - zeby kazde miejsce wolajace ta funkcje nie musialo pamietac
    o wyjatku osobno (predykaty parami - regula KLASA-NIE-INSTANCJA (CLAUDE.md), punkt 3).
    """
    if _nazwa_wywolania(expr) in FUNKCJE_TLUMACZA:
        return None

    ident = _identyfikator(expr)
    if ident is not None:
        if _TOKEN_KLUCZ in ident.lower():
            return None
        if _TOKEN_CASE not in ident.lower():
            return None
        forma = "name" if isinstance(expr, ast.Name) else "attr"
        return forma, sciezka_kropkowana(expr)

    if isinstance(expr, ast.Call) and _nazwa_wywolania(expr) == "str" and len(expr.args) == 1:
        wewnetrzny = opis_argumentu_przypadku(expr.args[0])
        if wewnetrzny is None:
            return None
        _, cel = wewnetrzny
        return "str", cel

    return None


def _sciezka_modulu(dotted: str) -> Path | None:
    """Zamien dotted-path importu (np. "api.enm") na plik pod BACKEND_SRC, jesli istnieje."""
    baza = BACKEND_SRC / Path(*dotted.split("."))
    plik = baza.with_suffix(".py")
    if plik.is_file():
        return plik
    pakiet = baza / "__init__.py"
    if pakiet.is_file():
        return pakiet
    return None


def instrukcje_importu(tree: ast.AST) -> list[ast.Import | ast.ImportFrom]:
    """Wszystkie instrukcje `Import`/`ImportFrom` w `tree`, znalezione WYLACZNIE
    schodzeniem po polach-LISTACH-INSTRUKCJI (`body`/`orelse`/`finalbody`/
    `handlers`/...) - NIGDY po drzewach WYRAZEN (`Call`/`BinOp`/`Compare`/...),
    gdzie instrukcja importu nie moze sie pojawic z definicji skladni Pythona
    (`import` jest zawsze `stmt`, nigdy czescia `expr`).

    ZAMIENNIK `ast.walk(tree)` NA TEJ SAMEJ KLASIE WEZLOW DOCELOWYCH, wielokrotnie
    szybszy na typowym pliku (wlasny pomiar przy pisaniu tej karty: rozwiazywanie
    reeksportu oparte na `ast.walk` dawalo 55 s na pelen `api/`+`application/`,
    z czego sam `ast.walk` odpowiadal za wiekszosc czasu) - wiekszosc wezlow AST
    realnego modulu zyje w drzewach WYRAZEN (wywolania, dostep do atrybutow,
    literaly, warunki), nie w drzewie instrukcji sterujacych, a `ast.walk` placi
    za KAZDY wezel jednakowo.
    """
    # Stos LIFO odwiedzalby dzieci w kolejnosci ODWROTNEJ do zrodlowej (`pop()`
    # zdejmuje OSTATNI wypchniety); dla poprawnego "ostatni import wygrywa"
    # (`zbuduj_eksporty`, zaslanianie tej samej lokalnej nazwy) kolejnosc ZWROCONEJ
    # listy ma odpowiadac kolejnosci w PLIKU, wiec dzieci sa wypychane w kolejnosci
    # ODWROTNEJ - wtedy `pop()` zdejmuje je z powrotem w kolejnosci ZRODLOWEJ.
    wynik: list[ast.Import | ast.ImportFrom] = []
    stos: list[ast.AST] = [tree]
    while stos:
        biezacy = stos.pop()
        if isinstance(biezacy, ast.Import | ast.ImportFrom):
            wynik.append(biezacy)
            continue
        for _, wartosc in ast.iter_fields(biezacy):
            if isinstance(wartosc, list):
                for element in reversed(wartosc):
                    if isinstance(element, ast.stmt | ast.excepthandler):
                        stos.append(element)
            elif isinstance(wartosc, ast.stmt | ast.excepthandler):
                stos.append(wartosc)
    return wynik


def _moze_byc_mostem_reeksportu(dotted: str) -> bool:
    """Czy `dotted` (modul importu INNY niz `enm.store`) lezy pod jednym z
    `SCAN_ROOTS` - jedynym miejscem, w ktorym zmierzony REALNY most reeksportu
    zyje (`api.enm` -> `application.station_templates.apply`).

    GRANICA WYDAJNOSCIOWA, NAZWANA WPROST (2026-09-04, wlasny pomiar przy
    pisaniu tej karty). Bez tej granicy rozwiazywanie eksportu schodzilo
    KAZDYM importem az do korzenia `backend/src` (798 plikow, gesty graf
    zaleznosci miedzy warstwami solverow/domeny/ENM) - most reeksportu
    ZDEFINIOWANY poza `api/**`/`application/**` (np. w
    `network_model/solvers/**`) nie ma tez uzasadnienia MERYTORYCZNEGO: karta
    ograniczyla ZAKRES SKANU do tych dwoch warstw wlasnie dlatego, ze tam
    zyje dlug migracji stranglerowej.
    """
    return any(dotted == root or dotted.startswith(f"{root}.") for root in SCAN_ROOTS)


def zbuduj_eksporty(pliki: list[Path], drzewa: dict[Path, ast.AST]) -> dict[Path, dict[str, str]]:
    """Eksport (lokalna_nazwa -> kanoniczna_funkcja_magazynu) DLA KAZDEGO pliku
    w `pliki`, liczony PUNKTEM STALYM po grafie mostow reeksportu WEWNATRZ
    `SCAN_ROOTS` - zamiast rekurencyjnie, z pamiecia podreczna wrazliwa na cykl.

    KAZDY plik jest juz SPARSOWANY DOKLADNIE RAZ przez wywolujacego (`main`,
    w `drzewa`) - ta funkcja tylko go CZYTA, nigdy nie parsuje ponownie. To
    jest powod, dla ktorego jest szybsza (i prostsza) niz pierwsza,
    rekurencyjna wersja: zmierzony na tym repo koszt tamtej wersji to 2172
    wywolan `ast.parse` zamiast 407, bo JEDYNY prawdziwy cykl importow w
    zakresie skanu (`application/proof_engine/types.py` <->
    `.../latex_renderer.py`, zmierzone DFS-em po grafie importow tej karty)
    uniewaznial pamiec podreczna KAZDEGO pliku, ktory choc raz przechodzil
    przez niego w drodze do czegokolwiek dalej w grafie - nie tylko plikow
    faktycznie lezacych w cyklu. Ten sam cykl NIE psuje juz nic tutaj: patrz
    ponizej.

    ALGORYTM. Baza to wpisy BEZPOSREDNIE (`from enm.store import X as Y`) w
    kazdym pliku z osobna. Potem powtarzane sa przebiegi PO WSZYSTKICH mostach
    reeksportu (`from <inny_modul_w_zakresie> import Y [as Z]`), ktore
    uzupelniaja brakujace wpisy z JUZ POZNANYCH eksportow zaleznosci; petla
    konczy sie, gdy zaden przebieg nic nie dodal (PUNKT STALY). Dla grafu
    ACYKLICZNEGO to jest dokladnie jeden przebieg w porzadku topologicznym
    (znaleziony bez jego jawnego liczenia); dla cyklu to jest poprawna
    odpowiedz z definicji - cykl importow miedzy Y i Z sam z siebie NIE TWORZY
    nowej kanonicznej funkcji, tylko przekazuje juz istniejaca dalej, wiec
    punkt staly jest OSIAGALNY (i w praktyce bliski) w malej, skonczonej
    liczbie przebiegow - kazdy most (`SCAN_ROOTS`, zmierzone: 626 krawedzi)
    jest sprawdzany co przebieg, wiec calkowity koszt zostaje maly nawet w
    pesymistycznym przypadku.

    KAZDA LOKALNA NAZWA MA W `mosty[p]` NAJWYZEJ JEDNO ZRODLO (`dict`, nie
    `list`) - jesli plik dwukrotnie importuje pod TA SAMA nazwa lokalna z
    DWOCH mostow (rzadkie przeslanianie), OSTATNI import w kolejnosci AST
    wygrywa, dokladnie jak w prawdziwym Pythonie (druga instrukcja `import`
    po prostu podmienia zwiazanie pierwszej). WLASNY POMIAR PRZY PISANIU TEJ
    KARTY: bez tej deduplikacji petla ponizej mogla OSCYLOWAC w nieskonczonosc
    dla takiego (teoretycznego, niewystepujacego dzis w repo - zmierzone) pliku,
    bo dwa sprzeczne wpisy tej samej krawedzi na przemian nadpisywalyby sie w
    kolejnych przebiegach i `zmieniono` nigdy nie ustabilizowaloby sie na
    `False` - gwarancja zbieznosci ponizej stoi wprost na tym, ze KAZDA
    krawedz mostu jest ZWIAZANA raz na zawsze, zanim petla sie zacznie.
    """
    eksport: dict[Path, dict[str, str]] = {p: {} for p in pliki}
    mosty: dict[Path, dict[str, tuple[Path, str]]] = {p: {} for p in pliki}
    zbior_plikow = set(pliki)

    for p in pliki:
        drzewo = drzewa.get(p)
        if drzewo is None:
            continue
        for node in instrukcje_importu(drzewo):
            if not isinstance(node, ast.ImportFrom):
                continue
            if node.level or node.module is None:
                continue  # import wzgledny - nieobserwowany w repo, poza zakresem
            if node.module == "enm.store":
                for alias in node.names:
                    if alias.name in FUNKCJE_MAGAZYNU:
                        eksport[p][alias.asname or alias.name] = alias.name
                continue
            if not _moze_byc_mostem_reeksportu(node.module):
                continue
            zrodlo = _sciezka_modulu(node.module)
            if zrodlo is None or zrodlo == p or zrodlo not in zbior_plikow:
                continue
            for alias in node.names:
                mosty[p][alias.asname or alias.name] = (zrodlo, alias.name)

    zmieniono = True
    while zmieniono:
        zmieniono = False
        for p, krawedzie in mosty.items():
            for lokalna, (zrodlo, oryginalna) in krawedzie.items():
                kanoniczna = eksport[zrodlo].get(oryginalna)
                if kanoniczna is not None and eksport[p].get(lokalna) != kanoniczna:
                    eksport[p][lokalna] = kanoniczna
                    zmieniono = True

    return eksport


def nazwy_modulu_magazynu(tree: ast.AST) -> set[str]:
    """Lokalne nazwy, pod ktorymi PLIK widzi MODUL `enm.store` (droga `store.X`).

    Celowo NIEtranzytywne (brak zmierzonej potrzeby - patrz naglowek modulu):
    tylko `from enm import store [as X]` i `import enm.store as X` WPROST
    w skanowanym pliku.
    """
    nazwy: set[str] = set()
    for node in instrukcje_importu(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "enm" and not node.level:
            for alias in node.names:
                if alias.name == "store":
                    nazwy.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "enm.store":
                    nazwy.add(alias.asname or "store")
    return nazwy


def _kanoniczna_funkcja_wywolania(
    expr: ast.Call, nazwy_funkcji: dict[str, str], nazwy_modulu: set[str]
) -> str | None:
    """Kanoniczna nazwa funkcji magazynu wolanej w `expr` (przez alias importu), albo None."""
    func = expr.func
    if isinstance(func, ast.Name):
        return nazwy_funkcji.get(func.id)
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        if func.value.id in nazwy_modulu and func.attr in FUNKCJE_MAGAZYNU:
            return func.attr
    return None


def zbierz_naruszenia(tree: ast.AST, nazwy_funkcji: dict[str, str]) -> list[tuple[str, int]]:
    """Lista (`<funkcja>:<forma>:<cel>`, wiersz) dla jednego pliku."""
    nazwy_modulu = nazwy_modulu_magazynu(tree)
    if not nazwy_funkcji and not nazwy_modulu:
        return []

    naruszenia: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not node.args:
            continue
        funkcja = _kanoniczna_funkcja_wywolania(node, nazwy_funkcji, nazwy_modulu)
        if funkcja is None:
            continue
        opis = opis_argumentu_przypadku(node.args[0])
        if opis is None:
            continue
        forma, cel = opis
        naruszenia.append((f"{funkcja}:{forma}:{cel}", node.lineno))
    return naruszenia


def apply_ratchet(rel: str, naruszenia: list[tuple[str, int]], budzet: int) -> list[str]:
    """Porownaj znaleziska pliku z budzetem (liczba na plik) - W OBIE STRONY."""
    znaleziono = len(naruszenia)
    if znaleziono == budzet:
        return []

    opisy = "; ".join(
        f"{sygnatura} (linia {linia})"
        for sygnatura, linia in sorted(naruszenia, key=lambda z: z[1])
    )
    if znaleziono > budzet:
        return [
            f"  {rel}: zapadka zastanych kluczy przypadku: budzet {budzet}, "
            f"znaleziono {znaleziono} ({opisy or 'brak'}). NOWE wywolanie magazynu ENM "
            "surowym case_id jest naruszeniem - przetlumacz przez "
            "application/twin_key.py::klucz_twin_dla_przypadku, tak jak juz zmigrowane "
            "miejsca w tym pliku."
        ]
    return [
        f"  {rel}: zapadka zastanych kluczy przypadku: budzet {budzet}, "
        f"znaleziono {znaleziono} ({opisy or 'brak'}). Dlug ZMALAL - obniz budzet w "
        "ZASTANE_KLUCZE_PRZYPADKU, inaczej poprawa nie zostaje utrwalona."
    ]


def check_file(
    path: Path, tree: ast.AST, budzet: dict[str, int], nazwy_funkcji: dict[str, str]
) -> list[str]:
    """Naruszenia w jednym pliku (pusta lista = plik zgodny z budzetem).

    `tree` (juz sparsowany przez `main`) i `nazwy_funkcji` (juz rozwiazany
    przez `zbuduj_eksporty` dla WSZYSTKICH plikow naraz) sa przekazywane z
    zewnatrz, zeby zaden plik nie byl parsowany wiecej niz raz na przebieg.
    """
    rel = path.relative_to(BACKEND_SRC).as_posix()
    naruszenia = zbierz_naruszenia(tree, nazwy_funkcji)
    return apply_ratchet(rel, naruszenia, budzet.get(rel, 0))


# ---------------------------------------------------------------------------
# ZAPADKA - zmierzona 2026-09-04 (karta CV-1-G) skanem tego guarda z pusta
# zapadka na stanie repo w chwili wprowadzenia bramki. Kazdy wpis to DLUG
# MIGRACJI STRANGLEROWEJ (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2):
# miejsce jeszcze wola magazyn ENM surowym `case_id` zamiast przez
# `application/twin_key.py::klucz_twin_dla_przypadku`. Zero nie jest tu
# powodem merytorycznym (jak w solver_input_substitute_guard) - kazdy wpis
# MA MALEC do zera migracja, nie zostac zamrozony na stale.
# ---------------------------------------------------------------------------
ZASTANE_KLUCZE_PRZYPADKU: dict[str, int] = {
    # CV-1-W (a71bd91c): 17 plikow zeszlo do ZERA (wszystkie koncowki API i uslugi
    # aplikacji tlumacza `case_id` przez `api/klucz_twin_dep.py` /
    # `klucz_twin_dla_przypadku`). Jedyny zastany wyjatek: import archiwum ZIP
    # z wieloma snapshotami per przypadek — `restore_enm(str(new_case_id), ...)`
    # jest zapisem TYMCZASOWYM pod kluczem nowego przypadku, po ktorym
    # `migruj_klucz_przypadku_do_projektu` porownuje hashem i odklada model do
    # `legacy_przypadki/` z manifestem (nic nie ginie). Znika razem z legacy
    # postacia archiwum (procedura kasacji, CV-4).
    "application/project_archive/service.py": 1,
}


def main() -> int:
    if not BACKEND_SRC.is_dir():
        print(f"FAIL: brak korzenia skanowania: {BACKEND_SRC}")
        print("Bramka, ktora nie dosiega swojego korzenia, to falszywa zielen.")
        return 1

    pliki: list[Path] = []
    for root_name in SCAN_ROOTS:
        root = BACKEND_SRC / root_name
        if not root.is_dir():
            print(f"FAIL: korzen skanowania '{root_name}' nie istnieje pod {BACKEND_SRC}.")
            print("Zmiana ukladu katalogow nie moze po cichu wylaczyc zakresu bramki.")
            return 1
        pliki.extend(sorted(root.rglob("*.py")))

    # KAZDY plik parsowany DOKLADNIE RAZ - i eksport (`zbuduj_eksporty`), i
    # sam skan naruszen (`check_file`) czytaja to samo `drzewa[path]`.
    drzewa: dict[Path, ast.AST] = {}
    for path in pliki:
        try:
            drzewa[path] = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, UnicodeDecodeError):
            continue
        except SyntaxError as exc:
            print(f"WARN: {path}:{exc.lineno}: nie da sie sparsowac ({exc.msg})")

    eksporty = zbuduj_eksporty(pliki, drzewa)

    naruszenia: list[str] = []
    scanned = 0
    for path in pliki:
        rel = path.relative_to(BACKEND_SRC).as_posix()
        if rel in WYLACZONE_PLIKI:
            continue
        drzewo = drzewa.get(path)
        if drzewo is None:
            continue  # blad parsowania juz zaraportowany (WARN) wyzej
        scanned += 1
        naruszenia.extend(
            check_file(path, drzewo, ZASTANE_KLUCZE_PRZYPADKU, eksporty.get(path, {}))
        )

    print(
        f"Przeskanowano {scanned} plikow w zakresie: {', '.join(SCAN_ROOTS)} "
        f"(wylaczono: {', '.join(sorted(WYLACZONE_PLIKI))})."
    )

    if scanned == 0:
        print("FAIL: PUSTY SKAN - 0 plikow. Bramka, ktora nic nie obejrzala, nic nie dowodzi.")
        return 1

    # Wpis zapadki wskazujacy plik, ktorego nie ma, to martwy budzet - rejestr
    # moze tylko malec, wiec nieaktualny wpis jest bledem, nie ozdoba.
    martwe = [rel for rel in ZASTANE_KLUCZE_PRZYPADKU if not (BACKEND_SRC / rel).is_file()]
    if martwe:
        print("FAIL: zapadka wskazuje pliki, ktorych nie ma:")
        for rel in sorted(martwe):
            print(f"  {rel} - zdejmij wpis z ZASTANE_KLUCZE_PRZYPADKU.")
        return 1

    if naruszenia:
        print(
            "FAIL: wywolanie magazynu ENM surowym case_id zamiast kluczem projektu "
            "(docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2 - PROJECT owns ENM):"
        )
        for naruszenie in sorted(naruszenia):
            print(naruszenie)
        print(f"\n{len(naruszenia)} naruszen.")
        return 1

    suma = sum(ZASTANE_KLUCZE_PRZYPADKU.values())
    print(
        "PASS: zero nowych wywolan magazynu ENM surowym case_id "
        f"(zapadka: {len(ZASTANE_KLUCZE_PRZYPADKU)} plikow, suma {suma})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

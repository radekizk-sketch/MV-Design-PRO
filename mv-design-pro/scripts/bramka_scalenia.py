#!/usr/bin/env python3
"""BRAMKA SCALENIA — szybki, wyjaśnialny dowód dla zmiany względem wskazanej bazy.

PO CO (karta SZYBKIE-TESTY-DO-SCALENIA, dyrektywa właściciela 2026-10-15). Pełna regresja
backendu (~26 tys. testów) trwa na 4 CPU godzinę i dłużej, a integrator uruchamiał ją przed
KAŻDYM scaleniem partii (`ORKIESTRACJA_AGENTOW.md` §3a pkt 16). Ta bramka daje dowód
proporcjonalny do zmiany. UZUPEŁNIA pełny bieg, NIE zastępuje go: pełna regresja zostaje
w CI (`python-tests.yml`, `frontend-checks.yml`) po każdym push i przed scaleniem do `main`.

CZTERY CZĘŚCI, jedno polecenie, jeden kod wyjścia:

(a) Testy backendu wybrane WPŁYWEM zmiany: plik testu zmieniony albo przechodnio zależny od
    zmienionego pliku. Graf zależności z drzewa składni (rozwiązywanie importów:
    `scripts/importy_ast.py`, jedno źródło prawdy bramek importów — `import_graph_guard.py`
    pilnuje punktów wejścia frontu i indeksów dokumentacji, grafu importów Pythona NIE
    buduje). Krawędź zależności to każda z dróg, którą moduł może załadować kod:
    * `import` / `from … import …` (bezwzględne i względne, także leniwe w ciele funkcji
      i pod `TYPE_CHECKING`), z nazwą sprowadzaną z pakietu jako możliwym podmodułem;
    * każdy moduł zależy od swoich pakietów nadrzędnych (import `a.b.c` wykonuje
      `a/__init__.py` i `a/b/__init__.py`), także plik testu od pakietów `tests.*`;
    * stała napisowa równa nazwie modułu (`importlib.import_module("x.y")`, rejestry
      `"modul:atrybut"`, `pytest_plugins`);
    * stała napisowa kończąca się nazwą pliku `.py` z drzewa (ładowanie po ścieżce:
      `spec_from_file_location`, `subprocess` na skrypcie);
    * każdy `conftest.py` na drodze od `tests/` do pliku testu.
    Zbiór jest NADZBIOREM w sensie importów: każda z dróg dokłada krawędź, żadna nie odejmuje.
    Ponad importy działają dwie reguły danych (pliki nie-Pythonowe): plik `.py` zawierający
    nazwę zmienionego pliku (np. `zlote_hashe.json`, `openapi_snapshot.json`) jest traktowany
    jak zmieniony; zmiana pliku danych w `backend/src` albo `backend/tests` pociąga moduły
    `.py` z tego samego katalogu i katalogu nadrzędnego (ładowanie wzorcem `*.json`). Zmiana
    `backend/pyproject.toml` albo `backend/poetry.lock` (konfiguracja pytest, wersje
    zależności) wybiera komplet testów backendu.
(b) Stały rdzeń niezmienników — uruchamiany ZAWSZE, także dla zmiany samej dokumentacji
    (`rdzen_niezmiennikow`): katalogi `tests/golden` i `tests/invariants`, pliki testów
    z markerem `determinism` (zadeklarowanym w `pyproject.toml`) oraz pliki, których nazwa
    niesie determinizm, golden, odcisk albo zamrożony kontrakt wyniku / API
    (`WZORZEC_NAZWY_RDZENIA`). Nowy test spełniający regułę wchodzi do rdzenia sam.
(c) Testy vitest wybrane wpływem zmiany grafem modułów SAMEGO vitest (ta sama metoda co
    `vitest related`, z wyzwalaczami pełnego biegu i plikami `setupFiles`) — pomocnik
    `frontend/scripts/vitest_wplyw.mjs` dopisuje do wyboru uzasadnienie. Oba kroki vitest
    z `package.json`: bieg główny i krok budżetów czasu procesora (`--mode budzety`).
(d) `scripts/guardy_z_ci.py` — komplet strażników, samotestów, lintu i kroków npm z CI.

Testy backendu (a ∪ b) biegną pod pytest-xdist (`-n <procesy> --dist loadfile`, jak pełna
regresja w CI); brak xdist przy `--procesy` > 1 to czerwień biegu, nie cichy bieg
jednoprocesowy (xdist jest zależnością dev backendu).

Przed uruchomieniem bramka wypisuje wybrany zbiór i uzasadnienie: dla każdego testu łańcuch
od zmienionego pliku (test ← moduł ← … ← zmieniony plik). `--tylko-wybor` kończy na wypisaniu.

    # z katalogu backend/, interpreterem venv backendu (część testów i strażników importuje
    # zależności, których systemowy Python nie ma):
    poetry run python ../scripts/bramka_scalenia.py --baza <ref>            # drzewo robocze
    poetry run python ../scripts/bramka_scalenia.py --baza <ref> --glowa HEAD

Kod wyjścia: 0 = każda część zielona; 1 = co najmniej jedna część czerwona; 2 = błąd użycia.
Część bez wybranych testów (np. zmiana bez plików frontu) jest wypisana jawnie jako „brak
testów wybranych wpływem”, nigdy jako cicha zieleń; rdzeń niezmienników i strażniki biegną
zawsze.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from importy_ast import (  # noqa: E402
    ImportPonadKorzen,
    moduly_dotkniete,
    nazwa_modulu,
    pakiet_pliku,
)

PROJEKT = Path(__file__).resolve().parent.parent
REPO = PROJEKT.parent
BACKEND = PROJEKT / "backend"
SRC = BACKEND / "src"
TESTY = BACKEND / "tests"
SKRYPTY_BACKENDU = BACKEND / "scripts"
SKRYPTY = PROJEKT / "scripts"
FRONTEND = PROJEKT / "frontend"
#: Pomocnik wyboru vitest (moduł ESM musi leżeć w `frontend/`, żeby rozwiązać `vitest/node`).
POMOCNIK_VITEST = FRONTEND / "scripts" / "vitest_wplyw.mjs"

#: Korzenie drzew Pythona, z których bramka buduje graf. `backend/src` to przestrzeń importu
#: produktu (conftest dokłada ją do `sys.path`), `backend` — testów (`tests.*`) i narzędzi
#: backendu (`scripts.*`), `mv-design-pro/scripts` — strażników importowanych po samej nazwie.
DRZEWA_PYTHONA: tuple[Path, ...] = (SRC, TESTY, SKRYPTY_BACKENDU, SKRYPTY)

#: Pliki, których zmiana zmienia warunki KAŻDEGO testu backendu (konfiguracja pytest,
#: wersje zależności) — wybór wpływem nie ma tu sensu, bramka bierze komplet.
WYZWALACZE_PELNEGO_BACKENDU: frozenset[str] = frozenset(
    {
        "mv-design-pro/backend/pyproject.toml",
        "mv-design-pro/backend/poetry.lock",
    }
)

#: Rdzeń niezmienników (b): nazwy plików testów niosące determinizm, golden, odcisk
#: (fingerprint) albo zamrożony kontrakt wyniku i API (ResultSet v1, migawka OpenAPI).
WZORZEC_NAZWY_RDZENIA = re.compile(
    r"determinism|determinizm|deterministic|golden|fingerprint|result_contract|resultset"
    r"|openapi_snapshot"
)
#: Katalogi rdzenia (b): złote sieci i wyrocznie oraz niezmienniki własności modelu.
KATALOGI_RDZENIA: tuple[str, ...] = ("golden", "invariants")
MARKER_RDZENIA = re.compile(r"\bmark\.determinism\b")

#: Selekcja markerów 1:1 z kroku `Run pytest` w `python-tests.yml`.
MARKERY_CI = "not pandapower and not andes"

_NAZWA_MODULU_W_NAPISIE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$")


def _wzgledna(sciezka: Path) -> str:
    return sciezka.resolve().relative_to(REPO).as_posix()


def _czy_test(rel: str) -> bool:
    """Plik zbierany przez pytest backendu (`testpaths = tests`, `python_files = test_*.py`)."""
    return rel.startswith("mv-design-pro/backend/tests/") and Path(rel).name.startswith("test_")


def nazwy_modulu(rel: str) -> tuple[str, ...]:
    """Nazwy, pod którymi plik `.py` (ścieżka względem repozytorium) jest importowany.

    Działa także dla pliku usuniętego — nazwa wynika ze ścieżki, nie z dysku."""
    plik = REPO / rel
    if plik.is_relative_to(SRC):
        return (nazwa_modulu(plik, SRC),)
    if plik.is_relative_to(SKRYPTY_BACKENDU):
        return (nazwa_modulu(plik, BACKEND), nazwa_modulu(plik, SKRYPTY_BACKENDU))
    if plik.is_relative_to(BACKEND):
        return (nazwa_modulu(plik, BACKEND),)
    if plik.is_relative_to(SKRYPTY):
        return (nazwa_modulu(plik, SKRYPTY),)
    return ()


def _pakiet(plik: Path) -> str:
    """`__package__` pliku w jego głównej przestrzeni importu (dla importów względnych)."""
    if plik.is_relative_to(SRC):
        return pakiet_pliku(plik, SRC)
    if plik.is_relative_to(BACKEND):
        return pakiet_pliku(plik, BACKEND)
    return pakiet_pliku(plik, SKRYPTY)


def _z_przodkami(nazwa: str) -> Iterable[str]:
    czesci = nazwa.split(".")
    for i in range(1, len(czesci) + 1):
        yield ".".join(czesci[:i])


def _conftesty(plik: Path) -> list[str]:
    """Nazwy modułów `conftest.py` obowiązujących plik testu (od `tests/` w dół)."""
    nazwy: list[str] = []
    if (BACKEND / "conftest.py").exists():
        nazwy.append("conftest")
    katalog = TESTY
    for czesc in (*plik.parent.relative_to(TESTY).parts, None):
        if (katalog / "conftest.py").exists():
            nazwy.append(nazwa_modulu(katalog / "conftest.py", BACKEND))
        if czesc is None:
            break
        katalog = katalog / czesc
    return nazwy


@dataclass
class Graf:
    """Graf zależności plików Pythona drzewa roboczego, odwrócony: kto zależy od czego."""

    #: ścieżka względna → tekst źródła
    zrodla: dict[str, str] = field(default_factory=dict)
    #: nazwa modułu → pliki, które go (mogą) ładować
    odbiorcy_nazwy: dict[str, set[str]] = field(default_factory=dict)
    #: nazwa pliku `.py` (bez katalogu) → pliki ładujące go po ścieżce
    odbiorcy_pliku: dict[str, set[str]] = field(default_factory=dict)
    #: pliki, których źródło nie dało się sparsować (wypisywane jawnie)
    nieparsowalne: list[str] = field(default_factory=list)

    def odbiorcy(self, rel: str) -> set[str]:
        """Pliki bezpośrednio zależne od pliku `rel` (istniejącego albo usuniętego)."""
        wynik: set[str] = set()
        for nazwa in nazwy_modulu(rel):
            wynik |= self.odbiorcy_nazwy.get(nazwa, set())
        nazwa_pliku = Path(rel).name
        if nazwa_pliku != "__init__.py":
            wynik |= self.odbiorcy_pliku.get(nazwa_pliku, set())
        wynik.discard(rel)
        return wynik


def zbuduj_graf() -> Graf:
    graf = Graf()
    pliki = sorted(
        {
            plik
            for drzewo in DRZEWA_PYTHONA
            if drzewo.is_dir()
            for plik in drzewo.rglob("*.py")
            if "__pycache__" not in plik.parts
        }
    )
    znane_nazwy_plikow = {plik.name for plik in pliki} - {"__init__.py"}
    for plik in pliki:
        rel = _wzgledna(plik)
        tekst = plik.read_text(encoding="utf-8", errors="replace")
        graf.zrodla[rel] = tekst
        nazwy: set[str] = set()
        pliki_po_sciezce: set[str] = set()
        if plik.is_relative_to(TESTY) and (_czy_test(rel) or plik.name == "conftest.py"):
            nazwy.update(_conftesty(plik))
        for wlasna in nazwy_modulu(rel):
            nazwy.update(list(_z_przodkami(wlasna))[:-1])
        try:
            drzewo = ast.parse(tekst, filename=str(plik))
        except SyntaxError:
            graf.nieparsowalne.append(rel)
            drzewo = None
        if drzewo is not None:
            pakiet = _pakiet(plik)
            for wezel in ast.walk(drzewo):
                if isinstance(wezel, ast.Import | ast.ImportFrom):
                    try:
                        nazwy.update(moduly_dotkniete(pakiet, wezel))
                    except ImportPonadKorzen:
                        continue
                elif isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
                    napis = wezel.value.strip()
                    modul = napis.split(":", 1)[0]
                    if _NAZWA_MODULU_W_NAPISIE.match(modul):
                        nazwy.add(modul)
                    koncowka = napis.rsplit("/", 1)[-1]
                    if koncowka in znane_nazwy_plikow:
                        pliki_po_sciezce.add(koncowka)
        for nazwa in nazwy:
            graf.odbiorcy_nazwy.setdefault(nazwa, set()).add(rel)
        for nazwa_pliku in pliki_po_sciezce:
            graf.odbiorcy_pliku.setdefault(nazwa_pliku, set()).add(rel)
    return graf


@dataclass(frozen=True)
class Wybor:
    """Wybór testów backendu wpływem zmiany, z uzasadnieniem."""

    #: plik testu → łańcuch od testu do zmienionego pliku (ostatni element: przyczyna)
    testy: dict[str, tuple[str, ...]]
    #: przyczyna wyboru kompletu (wyzwalacz pełnego biegu) albo None
    pelny_bieg: str | None


def _czytajacy_po_nazwie(graf: Graf, zmienione: Iterable[str]) -> dict[str, str]:
    """Pliki `.py`, których tekst zawiera nazwę zmienionego pliku → ten zmieniony plik.

    Jeden przebieg po źródłach z jednym wzorcem wszystkich nazw (nie N przebiegów)."""
    po_nazwie: dict[str, str] = {}
    for rel in sorted(zmienione):
        nazwa = Path(rel).name
        if nazwa and nazwa != "__init__.py":
            po_nazwie.setdefault(nazwa, rel)
    if not po_nazwie:
        return {}
    wzorzec = re.compile(
        r"(?<![\w.-])("
        + "|".join(re.escape(n) for n in sorted(po_nazwie, key=len, reverse=True))
        + r")(?![\w-])"
    )
    wynik: dict[str, str] = {}
    for rel, tekst in graf.zrodla.items():
        dopasowanie = wzorzec.search(tekst)
        if dopasowanie is not None:
            wynik[rel] = po_nazwie[dopasowanie.group(1)]
    return wynik


def wybierz_testy_backendu(graf: Graf, zmienione: Iterable[str]) -> Wybor:
    """Testy backendu zależne (przechodnio) od zmienionych plików — patrz nagłówek, część (a)."""
    zmienione = sorted(set(zmienione))
    wszystkie_testy = sorted(rel for rel in graf.zrodla if _czy_test(rel))
    wyzwalacze = [rel for rel in zmienione if rel in WYZWALACZE_PELNEGO_BACKENDU]
    if wyzwalacze:
        przyczyna = f"wyzwalacz pełnego biegu backendu: {', '.join(wyzwalacze)}"
        return Wybor(testy={t: (t, przyczyna) for t in wszystkie_testy}, pelny_bieg=przyczyna)

    # Ziarna: plik → (następnik w łańcuchu, opis przyczyny).
    rodzic: dict[str, str] = {}
    przyczyna_ziarna: dict[str, str] = {}
    kolejka: deque[str] = deque()

    def zasiej(rel: str, przyczyna: str) -> None:
        if rel not in przyczyna_ziarna and rel not in rodzic:
            przyczyna_ziarna[rel] = przyczyna
            kolejka.append(rel)

    def rozprowadz() -> None:
        while kolejka:
            biezacy = kolejka.popleft()
            for odbiorca in sorted(graf.odbiorcy(biezacy)):
                if odbiorca in rodzic or odbiorca in przyczyna_ziarna:
                    continue
                rodzic[odbiorca] = biezacy
                kolejka.append(odbiorca)

    # Faza 1: krawędzie importu od zmienionych plików `.py`. Faza 2: reguły danych — tylko
    # pliki jeszcze nieosiągnięte (ten sam zbiór, ale uzasadnienie woli łańcuch importu).
    for rel in zmienione:
        if rel.endswith(".py") and nazwy_modulu(rel):
            zasiej(rel, f"zmieniony: {rel}")
    rozprowadz()
    for rel, zrodlo_zmiany in sorted(_czytajacy_po_nazwie(graf, zmienione).items()):
        zasiej(rel, f"czyta plik po nazwie: {zrodlo_zmiany}")
    for rel in zmienione:
        if rel.endswith(".py"):
            continue
        plik = REPO / rel
        if not (plik.is_relative_to(SRC) or plik.is_relative_to(TESTY)):
            continue
        for katalog in (plik.parent, plik.parent.parent):
            for kandydat in sorted(katalog.glob("*.py")):
                zasiej(_wzgledna(kandydat), f"moduł katalogu pliku danych: {rel}")
    rozprowadz()

    testy: dict[str, tuple[str, ...]] = {}
    for rel in sorted({*rodzic, *przyczyna_ziarna}):
        if not _czy_test(rel) or not (REPO / rel).exists():
            continue
        lancuch = [rel]
        while lancuch[-1] in rodzic:
            lancuch.append(rodzic[lancuch[-1]])
        lancuch.append(przyczyna_ziarna[lancuch[-1]])
        testy[rel] = tuple(lancuch)
    return Wybor(testy=testy, pelny_bieg=None)


def rdzen_niezmiennikow(graf: Graf) -> dict[str, str]:
    """Rdzeń niezmienników (b): plik testu → reguła, która go wybrała."""
    rdzen: dict[str, str] = {}
    for rel, tekst in sorted(graf.zrodla.items()):
        if not _czy_test(rel):
            continue
        czesci = Path(rel).relative_to("mv-design-pro/backend/tests").parts
        if czesci[0] in KATALOGI_RDZENIA:
            rdzen[rel] = f"katalog rdzenia tests/{czesci[0]}"
        elif WZORZEC_NAZWY_RDZENIA.search(Path(rel).name):
            rdzen[rel] = "nazwa pliku: determinizm / golden / odcisk / zamrożony kontrakt"
        elif MARKER_RDZENIA.search(tekst):
            rdzen[rel] = "marker determinism"
    return rdzen


def plan_backendu(wybor: Wybor, rdzen: dict[str, str]) -> list[str]:
    """Pliki testów backendu do biegu: wybór wpływem (a) ∪ rdzeń niezmienników (b)."""
    return sorted({*wybor.testy, *rdzen})


def _git(*argumenty: str) -> str:
    wynik = subprocess.run(
        ["git", "-C", str(REPO), *argumenty], capture_output=True, text=True, check=False
    )
    if wynik.returncode != 0:
        raise SystemExit(f"BLAD: git {' '.join(argumenty)}: {wynik.stderr.strip()}")
    return wynik.stdout


def zmienione_pliki(baza: str, glowa: str | None) -> list[str]:
    """Pliki zmienione względem bazy (ścieżki względem repozytorium; usunięte też)."""
    if glowa is not None:
        # Graf zależności jest z drzewa roboczego, więc głowa musi być jego HEAD albo jego
        # przodkiem (zmiana jednej karty oceniana na drzewie scalonym partii); głowa spoza
        # historii HEAD oznaczałaby wybór na grafie kodu, którego zmiana nie dotyczy.
        wynik = subprocess.run(
            ["git", "-C", str(REPO), "merge-base", "--is-ancestor", glowa, "HEAD"],
            capture_output=True,
            check=False,
        )
        if wynik.returncode != 0:
            raise SystemExit(
                f"BLAD: --glowa {glowa} nie jest HEAD ani przodkiem HEAD drzewa roboczego — "
                "graf zależności budowany jest z drzewa roboczego."
            )
        lista = _git("diff", "--name-only", "--no-renames", baza, glowa).splitlines()
    else:
        lista = _git("diff", "--name-only", "--no-renames", baza).splitlines()
        lista += _git("ls-files", "--others", "--exclude-standard").splitlines()
    return sorted({p for p in lista if p})


#: Kroki vitest (`package.json` „test”): bieg główny (`test`) i krok budżetów czasu procesora
#: (`--mode budzety`, własny zbiór plików — `vite.config.ts`). Bramka wybiera i uruchamia oba.
KROKI_VITEST: tuple[str, ...] = ("test", "budzety")


def wybierz_testy_frontu(
    zmienione: list[str], wyjscie: Path, tryb: str
) -> dict[str, object] | None:
    """Wybór vitest pomocnikiem `vitest_wplyw.mjs` w kroku `tryb`; None, gdy zmiana nie dotyka
    frontu."""
    frontowe = [
        rel[len("mv-design-pro/frontend/") :]
        for rel in zmienione
        if rel.startswith("mv-design-pro/frontend/")
    ]
    if not frontowe:
        return None
    if not (FRONTEND / "node_modules").is_dir():
        raise SystemExit(
            "BLAD: frontend/node_modules nieobecne — wybór vitest wymaga `npm ci` "
            "(albo dowiązania katalogu z innego drzewa roboczego)."
        )
    wynik = subprocess.run(
        ["node", str(POMOCNIK_VITEST), str(wyjscie), tryb, *frontowe],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
        check=False,
    )
    if wynik.returncode != 0:
        print(wynik.stdout + wynik.stderr, file=sys.stderr)
        raise SystemExit(f"BLAD: wybór vitest zakończony kodem {wynik.returncode}")
    dane: dict[str, object] = json.loads(wyjscie.read_text(encoding="utf-8"))
    return dane


def _uruchom(nazwa: str, polecenie: list[str], cwd: Path) -> tuple[int, float]:
    print(f"\n=== {nazwa} ===\n$ {' '.join(polecenie)}", flush=True)
    start = time.monotonic()
    rc = subprocess.run(polecenie, cwd=cwd, check=False).returncode
    czas = time.monotonic() - start
    print(f"=== {nazwa}: RC={rc}, {czas:.1f} s ===", flush=True)
    return rc, czas


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--baza", required=True, help="commit bazowy diffu")
    parser.add_argument(
        "--glowa", help="commit głowy (HEAD albo jego przodek); brak = drzewo robocze"
    )
    parser.add_argument(
        "--procesy",
        type=int,
        default=os.cpu_count() or 1,
        help="procesy pytest-xdist dla testów backendu (1 = jeden proces)",
    )
    parser.add_argument("--basetemp", help="katalog tymczasowy pytest (domyślnie nowy, prywatny)")
    parser.add_argument("--tylko-wybor", action="store_true", help="wypisz wybór i zakończ")
    args = parser.parse_args(argv)

    start = time.monotonic()
    zmienione = zmienione_pliki(args.baza, args.glowa)
    print(f"Zmienione pliki względem {args.baza}: {len(zmienione)}")

    graf = zbuduj_graf()
    if graf.nieparsowalne:
        # Plik, którego nie da się sparsować, nie ma krawędzi importu — wybór testów
        # wpływem byłby po cichu zaniżony. Czerwień zamiast ostrzeżenia.
        for rel in graf.nieparsowalne:
            print(f"FAIL: {rel}: nieparsowalny plik Pythona — graf importów niepełny")
        return 1
    wybor = wybierz_testy_backendu(graf, zmienione)
    rdzen = rdzen_niezmiennikow(graf)
    wszystkich = sum(1 for rel in graf.zrodla if _czy_test(rel))

    print(f"\n--- (a) testy backendu wybrane wpływem: {len(wybor.testy)} z {wszystkich} ---")
    if wybor.pelny_bieg:
        print(f"KOMPLET — {wybor.pelny_bieg}")
    else:
        for test, lancuch in wybor.testy.items():
            print(f"{test}  ←  " + "  ←  ".join(lancuch[1:]))
    print(f"\n--- (b) rdzeń niezmienników (zawsze): {len(rdzen)} plików ---")
    for test, regula in rdzen.items():
        print(f"{test}  [{regula}]")
    do_biegu = plan_backendu(wybor, rdzen)
    print(f"\nBackend razem (a ∪ b): {len(do_biegu)} plików testów z {wszystkich}")

    katalog_roboczy = Path(tempfile.mkdtemp(prefix="bramka-scalenia-"))
    testy_frontu: dict[str, list[str]] = {}
    for tryb in KROKI_VITEST:
        front = wybierz_testy_frontu(zmienione, katalog_roboczy / f"vitest_{tryb}.json", tryb)
        if front is None:
            print(f"\n--- (c) vitest [{tryb}]: zmiana nie dotyka frontendu — brak testów ---")
            continue
        mapa = front["testy"]
        assert isinstance(mapa, dict)
        testy_frontu[tryb] = sorted(mapa)
        print(f"\n--- (c) vitest [{tryb}] wybrane wpływem: {len(mapa)} z {front['wszystkich']} ---")
        if front["pelny_bieg"]:
            print(f"KOMPLET — {front['pelny_bieg']}")
        for test in sorted(mapa):
            przyczyny = ", ".join(_wzgledna(Path(p)) for p in mapa[test])
            print(f"{_wzgledna(Path(test))}  ←  {przyczyny}")
    print(f"\nWybór gotowy po {time.monotonic() - start:.1f} s.")
    if args.tylko_wybor:
        return 0

    wyniki: list[tuple[str, int, float]] = []
    polecenie = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "-p",
        "no:cacheprovider",
        "-m",
        MARKERY_CI,
        f"--basetemp={args.basetemp or katalog_roboczy / 'pytest'}",
    ]
    if args.procesy > 1:
        polecenie += ["-n", str(args.procesy), "--dist", "loadfile"]
    polecenie += [str(REPO / rel) for rel in do_biegu]
    wyniki.append(("(a)+(b) pytest backendu", *_uruchom("pytest backendu", polecenie, BACKEND)))

    for tryb, pliki in testy_frontu.items():
        if not pliki:
            continue
        polecenie = ["npx", "vitest", "run", *(["--mode", tryb] if tryb != "test" else []), *pliki]
        wyniki.append((f"(c) vitest [{tryb}]", *_uruchom(f"vitest [{tryb}]", polecenie, FRONTEND)))

    polecenie = [sys.executable, str(SKRYPTY / "guardy_z_ci.py")]
    wyniki.append(("(d) guardy_z_ci.py", *_uruchom("guardy_z_ci.py", polecenie, BACKEND)))

    print("\n=== PODSUMOWANIE BRAMKI SCALENIA ===")
    for nazwa, rc, czas in wyniki:
        print(f"{'ZIELONY ' if rc == 0 else 'CZERWONY'} {nazwa}: RC={rc}, {czas:.1f} s")
    print(f"Czas całkowity: {time.monotonic() - start:.1f} s")
    return 0 if all(rc == 0 for _n, rc, _c in wyniki) else 1


if __name__ == "__main__":
    sys.exit(main())

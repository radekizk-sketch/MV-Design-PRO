#!/usr/bin/env python3
"""Guard: predykat pasma napięciowego (nN/SN/WN) wyłącznie w jednym źródle i jednym lustrze.

PO CO (karta PASMO-1KV, 2026-09-25). Produkt rozstrzygał przynależność napięcia do pasma
w kilkudziesięciu miejscach, każde z własnym progiem: `voltage_kv < 1.0` (szyna 1 kV = SN),
`voltage_kv > 1` (szyna 1 kV = nN), `voltage_kv <= 60` (górna granica SN bez podstawy
w dokumentach). Dwa predykaty tej samej granicy to defekt klasy (reguła KLASA §3,
CLAUDE.md): przy danych brzegowych (sieć 1000 V w górnictwie i przemyśle) walidator liczył
szynę jako SN, a pętla zwarcia TN odmawiała jej jako „poza pasmem nN".

Granice mają JEDNO źródło z podstawą prawną:
  * backend — `backend/src/network_model/pochodne/pasma_napieciowe.py` (liść grafu importów,
    importowany przez każdą warstwę, także `network_model/core/**` i `catalog/**`),
  * frontend — `frontend/src/ui2/model/pasmaNapieciowe.ts` (lustro; parytet przez tablice
    `backend/schemas/pasmo_nn_parytet_v1.json` i `pole_transformatorowe_parytet_v1.json`).

CO WYKRYWA:
  * Python (AST, `backend/src/**`): porównanie porządkowe (`<`, `<=`, `>`, `>=`), w którym
    jedna strona to literał granicy pasma (1, 60, 110, 1000 — z wariantami `.0`), a druga to
    wyrażenie o nazwie wielkości napięcia (`kv`, `volt`, `napi…`, `u_n`, `un`), z wyłączeniem
    wielkości w jednostkach względnych (`…_pu`); porównanie z przepisaną lokalnie stałą
    pasma (`PASMO_NN_MAX_KV`, `PASMO_SN_MAX_KV`, `…BAND…`); definicję lokalnej kopii stałej
    granicy pasma (nazwa z `PASMO`/`BAND`/`GRANICA` i `KV`, wartość-literał granicy).
  * TypeScript (analiza tekstu po zdjęciu komentarzy, `frontend/src/**` bez testów): to samo
    porównanie literału granicy z operandem o nazwie wielkości napięcia (`kv`/`Kv`/`volt`/
    `napi`/`unKv`/`un_kv`) oraz definicja stałej granicy pasma.

CZEGO NIE WYKRYWA (świadomie): napisów i komentarzy (tekst dla projektanta ma jedno
brzmienie w stałej opisu obok granicy; pilnują go testy komunikatów) — wyrażenie `${…}`
w szablonie TS jest kodem i JEST skanowane; wielkości względnych (p.u.); mocy (`kva`,
`kvar`); liczności kolekcji (`len(...)`, `.length`, `…Count`); odchyłek (`abs(a - b) < 1`);
równości z literałem (`hv_voltage_key != 110` — tożsamość pozycji katalogu, nie pasmo).

ZAKRES I WYJĄTKI: allowlista PUSTA. Rdzenie zamrożone B-01 (`scripts/rdzenie_b01.py`)
edytuje wyłącznie decyzja właściciela — ich trafienia guard WYPISUJE jako pozycje do decyzji
(kod wyjścia 0 dla nich), żeby nie zniknęły z widoku, ale nie może ich naprawić sam.

Kod wyjścia: 0 = czysto, 1 = naruszenie, 2 = brak katalogu skanu.
"""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rdzenie_b01 import jest_rdzeniem_b01  # noqa: E402

#: Jedyne źródło (backend) i jedyne lustro (frontend) granic pasm.
ZRODLO_PY = "network_model/pochodne/pasma_napieciowe.py"
LUSTRO_TS = "ui2/model/pasmaNapieciowe.ts"

#: Allowlista — PUSTA po karcie PASMO-1KV. Nowy wpis wymaga uzasadnienia merytorycznego
#: (inna wielkość normowa, nie granica pasma) i przepięcia go na źródło jest zawsze
#: pierwszą opcją.
ALLOWLIST: dict[str, str] = {}

#: Literały granic pasm: 1 kV (nN/SN), 60 kV (dawna, bezpodstawna granica SN/WN),
#: 110 kV (SN/WN wg rozporządzenia), 1000 V (ta sama granica w woltach).
LITERALY_GRANIC: frozenset[float] = frozenset({1.0, 60.0, 110.0, 1000.0})

#: Nazwa wielkości napięcia. `kv(?!a)` wyklucza moc (`kva`, `kvar`).
_NAPIECIE_RE = re.compile(
    r"kv(?!a)|volt|napi|(?:^|[^a-z0-9])u_?n(?:[^a-z0-9]|$)|(?:^|[^a-z0-9])un_?kv", re.IGNORECASE
)
#: Wielkość względna (p.u.) — inna wielkość niż napięcie znamionowe szyny.
_WZGLEDNA_RE = re.compile(r"(?:^|[_.])pu(?:$|[_.)\]\s])|Pu\b|PU\b|per_unit")
#: Przepisana lokalnie stała granicy pasma.
_STALA_PASMA_RE = re.compile(r"PASMO_(?:NN|SN|WN)|VOLTAGE_BAND|LV_BAND|BAND_LIMIT")
#: Stała granicy STRONY/PASMA o dowolnej wartości — nazwa łączy stronę napięcia (nN/SN/WN,
#: LV/MV/HV) z granicą (LIMIT/MAX/MIN/GRANICA/PROG/THRESHOLD) i jednostką kV
#: (`STATION_LV_VOLTAGE_LIMIT_KV = 0.5` — ta sama klasa z progiem spoza zbioru literałów).
_STALA_STRONY_RE = re.compile(
    r"\b(?:[A-Z0-9]+_)*(?:NN|SN|WN|LV|MV|HV)(?:_[A-Z0-9]+)*"
    r"_(?:LIMIT|MAX|MIN|GRANICA|PROG|THRESHOLD)(?:_[A-Z0-9]+)*_KV\b"
)
#: Definicja stałej granicy pasma: nazwa wielkości w kV z wartością-literałem granicy
#: (`LV_DOMAIN_MAX_KV = 1.0`, `MAX_STATION_NN_SOURCE_VOLTAGE_KV = 1.0`,
#: `PASMO_SN_MAX_KV = 60.0`). Współczynnik przeliczenia jednostek (`_KV_TO_V = 1000.0`)
#: nie jest granicą pasma.
_NAZWA_STALEJ_GRANICY_RE = re.compile(r"kv(?!a)", re.IGNORECASE)
_PRZELICZNIK_RE = re.compile(r"kv_?(?:to|na)_|(?:to|na)_?kv", re.IGNORECASE)
#: Operand, który nie jest wielkością napięcia, choć nazwa kolekcji o nim mówi: liczność
#: (`len(voltage_nodes)`, `nnVoltageLevels.length`, `nnVoltageLevelsCount`) i odchyłka
#: (`Math.abs(lvKv - 15) < 1` — tolerancja dopasowania katalogu, nie granica pasma).
_NIE_NAPIECIE_RE = re.compile(r"length|size\b|count|\blen\(|\babs\(", re.IGNORECASE)


@dataclass(frozen=True)
class Trafienie:
    plik: str
    linia: int
    tresc: str

    def __str__(self) -> str:
        return f"{self.plik}:{self.linia}: {self.tresc}"


# ---------------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------------

#: Granica pasma to relacja PORZĄDKU (`<`, `<=`, `>`, `>=`). Równość z literałem
#: (`hv_voltage_key != 110` — pokrycie katalogu GPZ, jedyna strona górna pozycji
#: katalogowych) jest tożsamością wartości katalogowej, nie przynależnością do pasma.
_OPERATORY_PORZADKU = (ast.Lt, ast.LtE, ast.Gt, ast.GtE)


def _literal_granicy(wezel: ast.expr) -> bool:
    if isinstance(wezel, ast.UnaryOp) and isinstance(wezel.op, ast.USub):
        return False
    return (
        isinstance(wezel, ast.Constant)
        and isinstance(wezel.value, int | float)
        and not isinstance(wezel.value, bool)
        and float(wezel.value) in LITERALY_GRANIC
    )


def _nazwa_stalej_granicy(nazwa: str) -> bool:
    return bool(_NAZWA_STALEJ_GRANICY_RE.search(nazwa)) and not _PRZELICZNIK_RE.search(nazwa)


def _operand_napiecia(tekst: str) -> bool:
    return (
        bool(_NAPIECIE_RE.search(tekst))
        and not _WZGLEDNA_RE.search(tekst)
        and not _NIE_NAPIECIE_RE.search(tekst)
    )


def skanuj_python(kod: str) -> list[tuple[int, str]]:
    """Trafienia klasy w jednym module Pythona: (linia, wyrażenie)."""
    drzewo = ast.parse(kod)
    wynik: list[tuple[int, str]] = []
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Compare):
            czlony = [wezel.left, *wezel.comparators]
            trafione = False
            for op, lewy, prawy in zip(wezel.ops, czlony, czlony[1:], strict=False):
                if not isinstance(op, _OPERATORY_PORZADKU):
                    continue
                for literal, inny in ((lewy, prawy), (prawy, lewy)):
                    if _literal_granicy(literal) and _operand_napiecia(ast.unparse(inny)):
                        trafione = True
            if any(
                _STALA_PASMA_RE.search(ast.unparse(czlon))
                or _STALA_STRONY_RE.search(ast.unparse(czlon))
                for czlon in czlony
                if not isinstance(czlon, ast.Constant)
            ):
                trafione = True
            if trafione:
                wynik.append((wezel.lineno, ast.unparse(wezel)))
        elif isinstance(wezel, ast.Assign | ast.AnnAssign):
            cele = wezel.targets if isinstance(wezel, ast.Assign) else [wezel.target]
            wartosc = wezel.value
            if wartosc is None or not isinstance(wartosc, ast.Constant):
                continue
            for cel in cele:
                nazwa = cel.id if isinstance(cel, ast.Name) else ""
                if _STALA_STRONY_RE.search(nazwa) and isinstance(wartosc.value, int | float):
                    wynik.append((wezel.lineno, ast.unparse(wezel)))
                elif _literal_granicy(wartosc) and _nazwa_stalej_granicy(nazwa):
                    wynik.append((wezel.lineno, ast.unparse(wezel)))
    return sorted(set(wynik))


# ---------------------------------------------------------------------------
# TypeScript
# ---------------------------------------------------------------------------

_LITERAL_TS = r"(?:1|1\.0|60|60\.0|110|110\.0|1000|1000\.0)(?![\w.])"
_OPERAND_TS = r"[\w$.?!\[\]'\"]+(?:\([^()]*\))?"
_OP_TS = r"(?:<=|>=|<(?!=)|>(?!=))"
_POROWNANIE_TS = re.compile(
    rf"(?P<a>{_OPERAND_TS})\s*{_OP_TS}\s*(?P<la>{_LITERAL_TS})"
    rf"|(?<![\w.])(?P<lb>{_LITERAL_TS})\s*{_OP_TS}\s*(?P<b>{_OPERAND_TS})"
)
_STALA_STRONY_TS = re.compile(
    r"\bconst\s+(?P<nazwa>[A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*\d+(?:\.\d+)?\s*;"
)
_STALA_TS = re.compile(
    rf"\bconst\s+(?P<nazwa>[A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*{_LITERAL_TS}\s*;"
)


def zdejmij_komentarze_ts(kod: str) -> str:
    """Usuwa komentarze `//` i `/* */` oraz TREŚĆ napisów, zachowując numerację linii.

    Treść napisu `'…'`/`"…"` i tekst szablonu `` `…` `` zamieniane są na spacje (napis dla
    projektanta nie jest predykatem), ale wyrażenie `${…}` w szablonie zostaje kodem — tam
    siedziały predykaty precyzji wyświetlania (`toFixed(un_kv < 1 ? 3 : 2)`).
    """
    wynik: list[str] = []
    i, n = 0, len(kod)
    napis: str | None = None
    #: Stos kontekstów: "`" = tekst szablonu, liczba = głębokość klamer wyrażenia `${…}`.
    stos: list[str | int] = []

    def puste(znak: str) -> str:
        return "\n" if znak == "\n" else " "

    while i < n:
        znak = kod[i]
        if napis is not None:
            if znak == "\\" and i + 1 < n:
                wynik.append(" " + puste(kod[i + 1]))
                i += 2
                continue
            if znak == napis or znak == "\n":
                napis = None
                wynik.append(znak)
            else:
                wynik.append(" ")
            i += 1
            continue
        if stos and stos[-1] == "`":
            if znak == "\\" and i + 1 < n:
                wynik.append(" " + puste(kod[i + 1]))
                i += 2
                continue
            if znak == "`":
                stos.pop()
                wynik.append(znak)
                i += 1
                continue
            if kod.startswith("${", i):
                stos.append(0)
                wynik.append("${")
                i += 2
                continue
            wynik.append(puste(znak))
            i += 1
            continue
        if znak in "'\"":
            napis = znak
            wynik.append(znak)
            i += 1
            continue
        if znak == "`":
            stos.append("`")
            wynik.append(znak)
            i += 1
            continue
        if kod.startswith("//", i):
            koniec = kod.find("\n", i)
            i = n if koniec == -1 else koniec
            continue
        if kod.startswith("/*", i):
            koniec = kod.find("*/", i + 2)
            fragment = kod[i : n if koniec == -1 else koniec + 2]
            wynik.append("\n" * fragment.count("\n"))
            i = n if koniec == -1 else koniec + 2
            continue
        if stos and isinstance(stos[-1], int):
            if znak == "{":
                stos[-1] += 1
            elif znak == "}":
                if stos[-1] == 0:
                    stos.pop()
                else:
                    stos[-1] -= 1
        wynik.append(znak)
        i += 1
    return "".join(wynik)


def skanuj_ts(kod: str) -> list[tuple[int, str]]:
    """Trafienia klasy w jednym module TypeScript: (linia, treść linii)."""
    wynik: list[tuple[int, str]] = []
    for nr, linia in enumerate(zdejmij_komentarze_ts(kod).splitlines(), start=1):
        trafione = False
        for dop in _POROWNANIE_TS.finditer(linia):
            operand = dop.group("a") or dop.group("b") or ""
            if _operand_napiecia(operand):
                trafione = True
        if _STALA_STRONY_RE.search(linia) and not _STALA_STRONY_TS.search(linia):
            if re.search(_OP_TS, linia.replace("=>", "")):
                trafione = True
        for dop in _STALA_STRONY_TS.finditer(linia):
            if _STALA_STRONY_RE.search(dop.group("nazwa")):
                trafione = True
        for dop in _STALA_TS.finditer(linia):
            if _nazwa_stalej_granicy(dop.group("nazwa")):
                trafione = True
        if trafione:
            wynik.append((nr, linia.strip()))
    return wynik


# ---------------------------------------------------------------------------
# Przebieg
# ---------------------------------------------------------------------------


def _pliki_ts(katalog: Path) -> list[Path]:
    return sorted(
        p
        for p in katalog.rglob("*.ts*")
        if p.suffix in {".ts", ".tsx"}
        and "__tests__" not in p.parts
        and ".test." not in p.name
        and ".spec." not in p.name
        and not p.name.endswith(".d.ts")
    )


def zmierz() -> tuple[list[Trafienie], list[Trafienie], int]:
    """(naruszenia, pozycje B-01 do decyzji właściciela, liczba przeskanowanych plików)."""
    naruszenia: list[Trafienie] = []
    b01: list[Trafienie] = []
    liczba = 0
    for plik in sorted(BACKEND_SRC.rglob("*.py")):
        wzgledna = plik.relative_to(BACKEND_SRC).as_posix()
        if wzgledna == ZRODLO_PY:
            continue
        liczba += 1
        for linia, tresc in skanuj_python(plik.read_text(encoding="utf-8")):
            trafienie = Trafienie(f"backend/src/{wzgledna}", linia, tresc)
            if jest_rdzeniem_b01(wzgledna):
                b01.append(trafienie)
            elif f"backend/src/{wzgledna}:{tresc}" not in ALLOWLIST:
                naruszenia.append(trafienie)
    for plik in _pliki_ts(FRONTEND_SRC):
        wzgledna = plik.relative_to(FRONTEND_SRC).as_posix()
        if wzgledna == LUSTRO_TS:
            continue
        liczba += 1
        for linia, tresc in skanuj_ts(plik.read_text(encoding="utf-8")):
            if f"frontend/src/{wzgledna}:{tresc}" in ALLOWLIST:
                continue
            naruszenia.append(Trafienie(f"frontend/src/{wzgledna}", linia, tresc))
    return naruszenia, b01, liczba


def main() -> int:
    if not BACKEND_SRC.is_dir() or not FRONTEND_SRC.is_dir():
        print("pasmo-napieciowe-guard: brak katalogu skanu", file=sys.stderr)
        return 2
    naruszenia, b01, liczba = zmierz()
    for trafienie in b01:
        print(f"B-01 (do decyzji właściciela, bez edycji): {trafienie}")
    if naruszenia:
        print(
            "pasmo-napieciowe-guard: predykat pasma napięciowego poza jednym źródłem "
            f"({ZRODLO_PY}) i jednym lustrem ({LUSTRO_TS}):",
            file=sys.stderr,
        )
        for trafienie in naruszenia:
            print(f"  {trafienie}", file=sys.stderr)
        return 1
    print(f"pasmo-napieciowe-guard: OK, przeskanowano {liczba} plików, allowlista pusta")
    return 0


if __name__ == "__main__":
    sys.exit(main())

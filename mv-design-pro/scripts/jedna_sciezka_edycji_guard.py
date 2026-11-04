#!/usr/bin/env python3
"""Strażnik jednej ścieżki edycji modelu (karta JEDNA-SCIEZKA-EDYCJI).

PO CO. Model ENM jest jedyną prawdą, a operacja domenowa — jedyną drogą jego zmiany. Karta
odcinka SN miała osiem kontrolek, które pisały wyłącznie do lokalnego stanu komponentu
(oznaczenie, rodzina, przekrój, długość, warunki ułożenia, Idd), karta rozdzielnicy SN —
trzy kontrolki bez obsługi, a formularze operacji bez zarejestrowanego formularza otwierały
się w ślepy zaułek. Testy zielone tego nie widziały, bo kontrolka „działała" (zmieniała się
na ekranie). Strażnik łapie KLASĘ, nie instancję:

1. ``kontrolka_bez_zapisu`` — plik warstwy prezentacji (``ui/**``, ``ui2/**``), który CZYTA
   model (subskrypcja ``snapshot`` magazynu migawki) i ma kontrolkę formularza
   (``<input>``, ``<select>``, ``<textarea>``) z ``onChange`` wołającym lokalny setter stanu
   ``setX(...)`` pary ``const [x, setX] = useState``, a stan ``x`` nie trafia do żadnej drogi
   zapisu: nie występuje w argumentach wywołania zapisu (``executeDomainOperation``,
   ``openOperationForm``, ``.zapis(``, ``.mutate(``, wywołanie zwrotne rodzica ``onX(``/
   ``onX?.(``) ani w ciele funkcji, która takie wywołanie zawiera. Taka kontrolka edytuje kopię
   danych modelu, której nikt nie zapisze (dawna karta odcinka SN: osiem pól w ``data``, choć
   plik wołał operację dla typu katalogowego — dlatego reguła patrzy na STAN kontrolki, nie na
   sam fakt istnienia operacji w pliku).
2. ``kontrolka_martwa`` — kontrolka z pustym ``onChange`` (``() => {}`` / ``() => undefined``).
3. ``formularz_null`` — ``openOperationForm('<op>')`` dla operacji, której wpis w
   ``OPERATION_FORM_REGISTRY`` (``ui/workspace/operationFormRegistry.tsx``) jest ``null``:
   powierzchnia operacji pokazuje wtedy „brak formularza" — ślepy zaułek dla użytkownika.

Kontrolka stanu WIDOKU (filtr, wyszukiwarka, przełącznik zakładki) w pliku czytającym model
nie jest edycją modelu: plik deklaruje to jawnie znacznikiem ``// stan-widoku: <powód>``
w linii kontrolki albo w linii nad nią. Znacznik bez powodu jest naruszeniem. ALLOWLIST jest
pusta i może tylko maleć (zapadka w dół) — nowe miejsce to naprawa, nie wpis.

Kod wyjścia: 0 = zero naruszeń, 1 = naruszenia (lista na wyjściu). Pusty skan (zero plików)
to błąd.

    python scripts/jedna_sciezka_edycji_guard.py
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"
SCAN_DIRS: tuple[Path, ...] = (FRONTEND_SRC / "ui", FRONTEND_SRC / "ui2")
REGISTRY_FILE = FRONTEND_SRC / "ui" / "workspace" / "operationFormRegistry.tsx"

# Zapadka w dół: wpis = (reguła, ścieżka względem frontend/src). Pusta od początku.
ALLOWLIST: frozenset[tuple[str, str]] = frozenset()

CZYTA_MODEL = re.compile(r"\.snapshot\b\s*\)|state\.snapshot\b|s\.snapshot\b")
WYWOLANIE_ZAPISU = re.compile(
    r"\bexecuteDomainOperation\s*\(|\bopenOperationForm\s*\(|\.zapis\s*\(|\.mutate(?:Async)?\s*\("
    r"|\bon[A-Z]\w*\s*(?:\?\.)?\s*\(|\bprops\.on[A-Z]\w*\s*(?:\?\.)?\s*\("
    # Żądanie do backendu (parametry analizy, nie dane modelu, też mają drogę — do solvera).
    r"|\b(?:fetch|pobierz|policz|oblicz|uruchom|wyslij|zapisz|post)[A-Z]\w*\s*\("
)
STRZALKA_Z_BLOKIEM = re.compile(r"=>\s*\{")
ZWRACA_JSX = re.compile(r"return\s*\(?\s*<[A-Za-z>]")
PARA_STANU = re.compile(r"const\s*\[\s*(\w+)\s*,\s*(set[A-Z]\w*)\s*\]\s*=\s*useState")
DEKLARACJA_FUNKCJI = re.compile(
    r"(?:const|let)\s+\w+\s*=\s*(?:useCallback\(\s*)?(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>"
    r"|function\s+\w+\s*\("
)
# Kontrolka natywna albo komponent pola (``<NumberField onChange=…>``) — dawna karta odcinka
# trzymała pola w komponentach ``Field``/``NumberField``/``SelectField``, nie w ``<input>``.
KONTROLKA = re.compile(r"<(input|select|textarea|[A-Z]\w*)\b")
ON_CHANGE = re.compile(r"onChange=\{")
SETTER = re.compile(r"\b(set[A-Z]\w*)\(")
ON_CHANGE_PUSTY = re.compile(r"onChange=\{\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|undefined)\s*\}")
ZNACZNIK = re.compile(r"//\s*stan-widoku:(.*)$|\{/\*\s*stan-widoku:(.*?)\*/\}")
OPEN_FORM = re.compile(r"openOperationForm\(\s*['\"]([a-z0-9_]+)['\"]")
WPIS_NULL = re.compile(r"^\s*([a-z0-9_]+)\s*:\s*null\s*,", re.M)


@dataclass(frozen=True, order=True)
class Naruszenie:
    regula: str
    plik: str
    linia: int
    opis: str


def _pliki(katalogi: tuple[Path, ...]) -> list[Path]:
    wynik: list[Path] = []
    for katalog in katalogi:
        for plik in sorted(katalog.rglob("*.tsx")):
            czesci = set(plik.parts)
            if "__tests__" in czesci or plik.name.endswith((".test.tsx", ".spec.tsx")):
                continue
            wynik.append(plik)
    return wynik


def _blok_kontrolki(tekst: str, start: int) -> str:
    """Atrybuty kontrolki JSX od ``<tag`` do zamykającego ``>`` z bilansem nawiasów ``{}``."""
    glebokosc = 0
    for i in range(start, min(len(tekst), start + 4000)):
        znak = tekst[i]
        if znak == "{":
            glebokosc += 1
        elif znak == "}":
            glebokosc -= 1
        elif znak == ">" and glebokosc == 0:
            return tekst[start : i + 1]
    return tekst[start : start + 4000]


def _znacznik_przy(linie: list[str], nr_linii: int) -> str | None:
    """Treść znacznika ``stan-widoku``: linia kontrolki, dwie nad nią albo pierwsza w znaczniku.

    Linia pod ``<select`` (komentarz ``//`` między atrybutami) służy kontrolce, która jest
    jedynym dzieckiem wyrażenia (``cond ? (<select …`` nie przyjmie komentarza JSX nad sobą).
    """
    for nr in (nr_linii, nr_linii - 1, nr_linii - 2, nr_linii + 1):
        if 1 <= nr <= len(linie):
            dopasowanie = ZNACZNIK.search(linie[nr - 1])
            if dopasowanie:
                return (dopasowanie.group(1) or dopasowanie.group(2) or "").strip()
    return None


def _zbalansowane(tekst: str, start: int, otwarcie: str, zamkniecie: str) -> str:
    """Tekst od pierwszego ``otwarcie`` od ``start`` do pasującego ``zamkniecie``."""
    poczatek = tekst.find(otwarcie, start)
    if poczatek < 0:
        return ""
    glebokosc = 0
    for i in range(poczatek, len(tekst)):
        if tekst[i] == otwarcie:
            glebokosc += 1
        elif tekst[i] == zamkniecie:
            glebokosc -= 1
            if glebokosc == 0:
                return tekst[poczatek : i + 1]
    return tekst[poczatek:]


def _cialo_procedury_zapisu(cialo: str) -> bool:
    """Ciało funkcji obsługi z wywołaniem zapisu — nie ciało KOMPONENTU (zwraca JSX).

    Ciało komponentu zawiera wszystko (stan, kontrolki, operacje), więc liczone jako „droga
    zapisu" maskowałoby każdą kontrolkę bez zapisu w tym komponencie (iniekcja: dawna karta
    odcinka SN przechodziła, bo komponent wołał operację dla typu katalogowego).
    """
    return bool(cialo) and bool(WYWOLANIE_ZAPISU.search(cialo)) and not ZWRACA_JSX.search(cialo)


def _teksty_zapisu(tekst: str) -> list[str]:
    """Argumenty wywołań zapisu oraz ciała funkcji obsługi, które zawierają wywołanie zapisu."""
    wynik = [_zbalansowane(tekst, m.end() - 1, "(", ")") for m in WYWOLANIE_ZAPISU.finditer(tekst)]
    for deklaracja in DEKLARACJA_FUNKCJI.finditer(tekst):
        cialo = _zbalansowane(tekst, deklaracja.end(), "{", "}")
        if _cialo_procedury_zapisu(cialo):
            wynik.append(cialo)
    # Funkcje strzałkowe w JSX (``onClick={() => { … executeDomainOperation(…) }}``).
    for strzalka in STRZALKA_Z_BLOKIEM.finditer(tekst):
        cialo = _zbalansowane(tekst, strzalka.end() - 1, "{", "}")
        if _cialo_procedury_zapisu(cialo):
            wynik.append(cialo)
    return wynik


IDENTYFIKATOR = re.compile(r"\b[A-Za-z_]\w*\b")
POCHODNA = re.compile(r"const\s+(\w+)\s*=\s*(?:useMemo|useCallback)\s*\(")


def _identyfikatory_zapisywane(tekst: str, stan_settera: dict[str, str]) -> frozenset[str]:
    """Identyfikatory, które docierają do drogi zapisu — wprost albo przez pośrednika.

    Punkt stały: identyfikator w tekście zapisu jest zapisywany; argument ``setY(…)`` stanu
    ``y`` zapisywanego też (szkic → zapytanie → ``pobierz…(zapytanie)``); ciało
    ``const y = useMemo(…)`` / ``useCallback(…)`` zapisywanego ``y`` też.
    """
    zapisywane: set[str] = set()
    for fragment in _teksty_zapisu(tekst):
        zapisywane.update(IDENTYFIKATOR.findall(fragment))
    wywolania_setterow = [
        (stan_settera[m.group(1)], _zbalansowane(tekst, m.end() - 1, "(", ")"))
        for m in SETTER.finditer(tekst)
        if m.group(1) in stan_settera
    ]
    pochodne = [
        (m.group(1), _zbalansowane(tekst, m.end() - 1, "(", ")")) for m in POCHODNA.finditer(tekst)
    ]
    while True:
        przed = len(zapisywane)
        for stan, argumenty in wywolania_setterow + pochodne:
            if stan in zapisywane:
                zapisywane.update(IDENTYFIKATOR.findall(argumenty))
        if len(zapisywane) == przed:
            return frozenset(zapisywane)


def _onchange_handler(blok: str) -> str:
    dopasowanie = ON_CHANGE.search(blok)
    return _zbalansowane(blok, dopasowanie.end() - 1, "{", "}") if dopasowanie else ""


def operacje_bez_formularza(plik_rejestru: Path = REGISTRY_FILE) -> frozenset[str]:
    tekst = plik_rejestru.read_text(encoding="utf-8")
    return frozenset(WPIS_NULL.findall(tekst))


def skanuj_plik(plik: Path, tekst: str, bez_formularza: frozenset[str]) -> list[Naruszenie]:
    rel = (
        plik.relative_to(FRONTEND_SRC).as_posix()
        if plik.is_relative_to(FRONTEND_SRC)
        else plik.name
    )
    linie = tekst.splitlines()
    wynik: list[Naruszenie] = []
    czyta_model = bool(CZYTA_MODEL.search(tekst))
    stan_settera = {setter: stan for stan, setter in PARA_STANU.findall(tekst)}
    zapisywane = _identyfikatory_zapisywane(tekst, stan_settera) if czyta_model else frozenset()

    def stan_zapisywany(stan: str) -> bool:
        return stan in zapisywane

    for dopasowanie in KONTROLKA.finditer(tekst):
        blok = _blok_kontrolki(tekst, dopasowanie.start())
        nr = tekst.count("\n", 0, dopasowanie.start()) + 1
        znacznik = _znacznik_przy(linie, nr)
        if znacznik is not None:
            if not znacznik:
                wynik.append(
                    Naruszenie("znacznik_bez_powodu", rel, nr, "znacznik stan-widoku bez powodu")
                )
            continue
        if ON_CHANGE_PUSTY.search(blok):
            wynik.append(
                Naruszenie(
                    "kontrolka_martwa", rel, nr, f"<{dopasowanie.group(1)}> z pustym onChange"
                )
            )
            continue
        handler = _onchange_handler(blok)
        settery = [m.group(1) for m in SETTER.finditer(handler)]
        if not czyta_model or not settery or WYWOLANIE_ZAPISU.search(handler):
            continue
        stany = [stan_settera[s] for s in settery if s in stan_settera]
        if stany and not any(stan_zapisywany(stan) for stan in stany):
            wynik.append(
                Naruszenie(
                    "kontrolka_bez_zapisu",
                    rel,
                    nr,
                    f"<{dopasowanie.group(1)}> zmienia lokalny stan w pliku czytającym model "
                    "bez drogi do operacji modelu",
                )
            )
    for dopasowanie in OPEN_FORM.finditer(tekst):
        operacja = dopasowanie.group(1)
        if operacja in bez_formularza:
            nr = tekst.count("\n", 0, dopasowanie.start()) + 1
            wynik.append(
                Naruszenie(
                    "formularz_null",
                    rel,
                    nr,
                    f"openOperationForm('{operacja}') — operacja bez formularza w rejestrze",
                )
            )
    return wynik


def skanuj(katalogi: tuple[Path, ...] = SCAN_DIRS) -> list[Naruszenie]:
    bez_formularza = operacje_bez_formularza()
    pliki = _pliki(katalogi)
    if not pliki:
        raise SystemExit("jedna_sciezka_edycji_guard: pusty skan — zero plików .tsx")
    wynik: list[Naruszenie] = []
    for plik in pliki:
        wynik.extend(skanuj_plik(plik, plik.read_text(encoding="utf-8"), bez_formularza))
    return sorted(wynik)


def main() -> int:
    naruszenia = [n for n in skanuj() if (n.regula, n.plik) not in ALLOWLIST]
    nieaktualne = sorted(
        wpis for wpis in ALLOWLIST if not any((n.regula, n.plik) == wpis for n in skanuj())
    )
    for wpis in nieaktualne:
        print(f"ALLOWLIST nieaktualna (usuń wpis — zapadka w dół): {wpis}")
    for n in naruszenia:
        print(f"{n.plik}:{n.linia}: [{n.regula}] {n.opis}")
    if naruszenia or nieaktualne:
        print(f"jedna_sciezka_edycji_guard: {len(naruszenia)} naruszeń")
        return 1
    print("jedna_sciezka_edycji_guard: OK — każda kontrolka modelu ma drogę do operacji")
    return 0


if __name__ == "__main__":
    sys.exit(main())

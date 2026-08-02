#!/usr/bin/env python3
"""
Guard: utf8_mojibake_guard.py

Scans authored repository content for common mojibake fragments that usually
appear when UTF-8 Polish text is decoded with the wrong code page.

Dwie klasy uszkodzen (obie realnie wystapily w repo):
1. FRAGMENTY MOJIBAKE \u2014 polska litera zapisana jako para/trojka bajtow innej
   strony kodowej ("\u00c4\u2026", "\u0139\u013a", "\u00c3\u00b3"): wykrywane wzorcem tekstowym,
2. ZNAK ZASTEPCZY '?' W SLOWIE \u2014 polska litera zamieniona na ASCII '?'
   (zapis z nawiasami, zeby ten opis sam nie zapalal reguly: "Dost[?]pne",
   "napi[?]cia", "Brak wynik[?]w"): konwersja STRATNA, wiec nie ma juz sladu
   mojibake do dopasowania. Klasa dodana po V12K-283, gdzie 23 takie miejsca
   siedzialy w komunikatach operacji domenowych, a guard ich nie widzial.

ZAKRES \u2014 JEDNA LISTA, WYPROWADZONA PRZEZ ODJECIE (karta W4, dlug z V12K-317)
==========================================================================
Do karty W4 zakres byl DODAWANY: dwie listy katalogow (`SCAN_DIRS`, `SCAN_FILES`)
wymienialy miejsca do przeskanowania, wiec kazdy katalog, ktorego nikt nie
dopisal, byl niewidoczny. Zmierzone skutki tego mechanizmu:

  * `backend/tests` (576 plikow) NIGDY nie byl skanowany \u2014 referencja katalogowa
    zapisana jako mojibake nie mogla odpowiadac zadnej pozycji katalogu i utrwalala
    test, ktory przechodzil z bledna referencja (ustalenie V12K-317),
  * `frontend/e2e` (74 pliki) tak samo \u2014 dlug nazwany juz w V12K-271,
  * wzorce wykluczen dopasowywane jako PODCIAG nazwy chowaly kod PRODUKCYJNY:
    "build" lapal `frontend/src/ui/network-build` (143 pliki), "dist" lapal
    `frontend/src/ui/power-distribution`. W tak ukrytym pliku siedzialy dwie
    etykiety UI z polska litera zamieniona na '?' (karta W4 naprawia je u zrodla).

Dlatego zakres jest teraz ODWROTNOSCIA listy: guard obchodzi CALE repozytorium i
pomija WYLACZNIE segmenty sciezki, ktore nie niosa tresci pisanej przez czlowieka
(`SEGMENTY_POMIJANE` \u2014 kazdy z powodem). Nowy katalog jest objety domyslnie, wiec
klasa "ktos zapomnial dopisac katalog" nie moze wrocic. Wzorce dopasowywane sa do
SEGMENTU sciezki, nie do jej podciagu.

PROBKI CELOWE \u2014 KOMENTARZ W KODZIE, NIE LISTA WYKLUCZEN W GUARDZIE
=================================================================
Sa miejsca, w ktorych uszkodzony zapis jest TRESCIA: dokumentacja defektu i
asercja, ktora pilnuje, zeby mojibake nie wrocila na ekran. Takie miejsce oznacza
sie znacznikiem `mojibake-guard: probka celowa` z uzasadnieniem \u2014 w linii
trafienia albo w linii bezposrednio nad nia. Znacznik BEZ uzasadnienia nie
zwalnia niczego (inaczej bylby cicha lista wykluczen rozproszona po plikach).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

SUSPICIOUS_FRAGMENTS: dict[str, str] = {
    "\u00c4\u2026": "\u0105 zapisane jako mojibake",
    "\u00c4\u2122": "\u0119 zapisane jako mojibake",
    "\u00c4\u2021": "\u0107 zapisane jako mojibake",
    "\u00c4\u017a": "\u017a zapisane jako mojibake",
    "\u00c4\u203a": "\u015b zapisane jako mojibake",
    "\u00c5\u201a": "\u0142 zapisane jako mojibake",
    "\u00c5\u201e": "\u0144 zapisane jako mojibake",
    "\u00c5\u203a": "\u015b zapisane jako mojibake",
    "\u00c5\u00bc": "\u017c zapisane jako mojibake",
    "\u00c5\u00ba": "\u017a zapisane jako mojibake",
    "\u00c3\u00b3": "\u00f3 zapisane jako mojibake",
    # DLUG ZAMKNIETY (karta KD-6, poz. 4). Klasa "\u0139" (zapis UTF-8 odczytany
    # jako CP1250: "przek\u0139\u201aadnik" zamiast "przek\u0142adnik") byla tu wpisana jako
    # dlug, bo zapalala ponad tysiac miejsc \u2014 CALE dokumenty docs/*.md oraz
    # frontend/src/ui/sld/canonical_symbols/ports.json. Naprawa masowa poszla
    # narzedziem `scripts/napraw_mojibake.py` (odwrocenie uszkodzenia, nie
    # przepisywanie tresci: 37 545 znakow w 47 plikach), wiec klasa jest juz
    # PILNOWANA, a nie odkladana.
    "\u0139\u201a": "\u0142 zapisane jako mojibake CP1250",
    "\u0139\u201e": "\u0144 zapisane jako mojibake CP1250",
    "\u0139\u203a": "\u015b zapisane jako mojibake CP1250",
    "\u0139\u015f": "\u017a zapisane jako mojibake CP1250",
    "\u0139\u013d": "\u017c zapisane jako mojibake CP1250",
    "\u0139\u0161": "\u015a zapisane jako mojibake CP1250",
    "\u0139\u0105": "\u0179 zapisane jako mojibake CP1250",
    "\u0139\u00bb": "\u017b zapisane jako mojibake CP1250",
    "\u0139\u0081": "\u0141 zapisane jako mojibake CP1250",
    "\u0139\u0083": "\u0143 zapisane jako mojibake CP1250",
    "\u0102\u0142": "\u00f3 zapisane jako mojibake CP1250",
    "\u0102\u201c": "\u00d3 zapisane jako mojibake CP1250",
    "\u00c4\u201e": "\u0104 zapisane jako mojibake CP1250",
    "\u00c4\u2020": "\u0106 zapisane jako mojibake CP1250",
    "\u00c4\u0098": "\u0118 zapisane jako mojibake CP1250",
    "\u00c5\u0082": "\u0142 zapisane jako mojibake CP1252",
    # Ramki i bloki rysunkowe (U+2500..U+259F) w tej samej klasie uszkodzenia \u2014
    # to one dawaly najwiecej wystapien w dokumentach ze schematami ASCII.
    "\u00e2\u201d": "ramka rysunkowa zapisana jako mojibake",
    "\u00e2\u2022": "ramka podwojna zapisana jako mojibake",
    "\u00e2\u20ac\u2122": "apostrof zapisany jako mojibake",
    "\u00e2\u20ac\u201c": "pauza zapisana jako mojibake",
    "\u00e2\u20ac\u201d": "myslnik zapisany jako mojibake",
    "\u00e2\u20ac\u02d8": "punktor zapisany jako mojibake",
    "\ufffd": "znak zastepczy Unicode",
}

#: Litery, ktore moga sasiadowac ze znakiem zastepczym w polskim slowie.
_LITERA = "A-Za-z\u0104\u0106\u0118\u0141\u0143\u00d3\u015a\u0179\u017b"
_LITERA += "\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c"

#: Znak zapytania W SRODKU slowa = polska litera zamieniona na '?' (konwersja
#: stratna). Wzorzec celowo waski: '?' MIEDZY literami. Nie lapie zdan pytajnych
#: ("czy to dziala?"), operatorow TS ("a ? b : c", "pole?: string", "obj?.pole")
#: ani parametrow zapytania w adresach (te wycinamy nizej).
ZNAK_ZASTEPCZY_W_SLOWIE = re.compile(rf"[{_LITERA}]\?[{_LITERA}]")

#: Parametr zapytania w adresie ("/api/quality/flicker?run_id=") \u2014 to NIE jest
#: uszkodzenie tekstu, tylko dokumentacja koncowki. Wycinany przed sprawdzeniem.
_PARAMETR_ZAPYTANIA = re.compile(r"[\w./{}-]+\?[\w]+=")

#: Kwantyfikator wyrazenia regularnego po sekwencji ucieczki (`\\s?`, `\\d?`,
#: `\\w?`) \u2014 to skladnia, nie uszkodzone slowo. Wzorzec `[litera]?[litera]`
#: trafia w "s\u003fb" w `/\\bwhite\\s?box\\b/i`, choc zaden znak nie zginal.
#: Rozstrzygniecie: '?' poprzedzony sekwencja ucieczki jest kwantyfikatorem.
#: Zawezenie jest WASKIE \u2014 wymaga odwrotnego ukosnika BEZPOSREDNIO przed
#: litera, wiec uszkodzone slowo ("Pr\u003fd", "Odbi\u003fr") nadal zapala regule.
#: (Probki zapisane sekwencjami \\uXXXX \u2014 inaczej TEN opis zapalalby regule,
#: ktora wlasnie tlumaczy; ta sama konwencja co w `napraw_mojibake.py`.)
_UCIECZKA_REGEXP = re.compile(r"\\[A-Za-z]\?")

#: Znacznik probki celowej \u2014 patrz naglowek modulu. Musi niesc uzasadnienie,
#: dlatego wzorzec wymaga tresci PO znaczniku (co najmniej 10 znakow).
ZNACZNIK_PROBKI = "mojibake-guard: probka celowa"
_ZNACZNIK_Z_UZASADNIENIEM = re.compile(
    re.escape(ZNACZNIK_PROBKI) + r"\s*[-\u2014:]?\s*(?P<uzasadnienie>\S.{9,})"
)

#: Segmenty sciezki BEZ tresci pisanej przez czlowieka \u2014 jedyne, ktore guard
#: pomija. Powod stoi przy kazdym wpisie, bo lista jest odwrotnoscia zakresu:
#: wszystko, czego tu nie ma, JEST skanowane.
SEGMENTY_POMIJANE: dict[str, str] = {
    ".git": "wewnetrzny magazyn gita \u2014 zapis obiektowy, nie tresc autorska",
    ".claude": "worktree agentow \u2014 kopie repozytorium w trakcie pracy innych sesji",
    ".codex-backups": "kopie zapasowe narzedzia \u2014 duplikaty plikow, nie zrodlo",
    ".codex-screenshots": "zrzuty ekranu narzedzia \u2014 wyjscie przebiegu",
    "node_modules": "zaleznosci npm \u2014 kod obcy, nie nasz tekst",
    ".venv": "srodowisko wirtualne Pythona \u2014 zaleznosci",
    "venv": "srodowisko wirtualne Pythona \u2014 zaleznosci",
    "dist": "wyjscie budowania frontu",
    "build": "wyjscie budowania",
    "__pycache__": "bajtkod Pythona",
    ".pytest_cache": "pamiec podreczna pytest",
    ".mypy_cache": "pamiec podreczna mypy",
    ".ruff_cache": "pamiec podreczna ruff",
    "coverage": "raport pokrycia \u2014 wyjscie narzedzia",
    "playwright-report": "raport Playwright \u2014 wyjscie przebiegu",
    "test-results": "artefakty przebiegu testow",
    # STAN URUCHOMIENIOWY, nie zrodlo: magazyn migawek ENM zapisywany przez
    # dzialajaca aplikacje i przez testy (`enm/dziennik_zmian.py`). Bez tego wpisu
    # wynik guarda zalezalby od tego, czy ktos wczesniej uruchomil testy \u2014 a nazwy
    # elementow z migawki nie sa tekstem, ktory ktokolwiek w tym repo napisal.
    ".enm_store": "magazyn migawek ENM \u2014 stan uruchomieniowy zapisany przez aplikacje",
    # DLUG NAZWANY (karta W4). `tmp/` to zrzuty przebiegow QA i audytu (odpowiedzi
    # HTTP, eksporty, zrzuty ekranu) \u2014 tresc pochodzi z PRZEBIEGU, nie od autora,
    # a narzedzie zrzucajace rozjechalo kodowanie. Pomiar: 425 trafien w 10 plikach
    # JSON, z czego 4 pliki niosa klase STRATNA ('\u003f' zamiast litery: "Odbi\u003fr",
    # "ko\u003fcowa"), ktorej nie da sie odwrocic \u2014 jedyna naprawa to WYKONANIE ZRZUTU
    # OD NOWA z zywego stosu (precedens: `backend/scripts/zrzut_api_audytu.py`,
    # karta KD-3 poz. 12b), a sesje QA sprzed zmian modelu sa nieodtwarzalne.
    "tmp": "zrzuty przebiegow QA/audytu \u2014 wyjscie narzedzia (dlug: karta W4)",
}

SKANOWANE_ROZSZERZENIA = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".md",
    ".json",
    ".css",
}

#: Korzen skanu \u2014 CALE repozytorium (skrypt lezy w `<repo>/mv-design-pro/scripts`).
KORZEN = Path(__file__).resolve().parents[2]


def should_scan(path: Path) -> bool:
    """Czy plik o tym rozszerzeniu niesie tekst, ktory guard umie ocenic."""
    return path.suffix.lower() in SKANOWANE_ROZSZERZENIA


def czy_segment_pomijany(nazwa: str) -> bool:
    """Czy segment sciezki o tej nazwie nie niesie tresci autorskiej.

    Dopasowanie do CALEGO segmentu, nie do podciagu nazwy: `network-build` i
    `power-distribution` to katalogi PRODUKCYJNE i musza byc skanowane, choc
    zawieraja w nazwie "build" i "dist". Do karty W4 wykluczenia dzialaly wlasnie
    podciagiem i ukrywaly 143 pliki `network-build` razem z uszkodzonymi
    etykietami UI.

    JEDYNY predykat pomijania — obchod drzewa wola TE funkcje, wiec nie da sie
    zmienic regule dopasowania tak, zeby test tego nie zobaczyl.
    """
    return nazwa in SEGMENTY_POMIJANE


def ignorowane_przez_gita(baza: Path, sciezki: list[Path]) -> set[Path]:
    """Podzbior sciezek, ktorych repozytorium SWIADOMIE nie sledzi.

    Zakres liczymy przez ODJECIE, wiec kazdy nowy katalog stanu uruchomieniowego
    (raport narzedzia, magazyn migawek, zrzut przebiegu) wchodzilby do skanu SAM
    — a wtedy wynik straznika zalezalby od tego, co ktos wczesniej uruchomil na
    swoim dysku. Takie katalogi sa juz opisane w `.gitignore`, wiec pytamy git o
    JEDNO zrodlo tej wiedzy zamiast dopisywac wpis po wpisie do
    `SEGMENTY_POMIJANE` (CLAUDE.md: KLASA, NIE INSTANCJA). Precedens: katalog
    `frontend/audyt-r4/` wywracal test zakresu wylacznie na dysku, na ktorym
    audyt kiedykolwiek uruchomiono — na czystym drzewie test przechodzil pusto.

    Plik NIESLEDZONY, ale i NIEIGNOROWANY (swiezo napisany) nie jest odejmowany
    — nowa tresc ma byc pilnowana od pierwszej chwili.

    Gdy git jest niedostepny albo `baza` nie jest repozytorium, nie odejmujemy
    NICZEGO: straznik ma wtedy skanowac WIECEJ, nigdy mniej.
    """
    if not sciezki:
        return set()
    try:
        wynik = subprocess.run(
            ["git", "check-ignore", "-z", "--stdin"],
            input="\0".join(str(p) for p in sciezki) + "\0",
            cwd=baza,
            capture_output=True,
            text=True,
        )
    except OSError:
        return set()
    # 0 = cos jest ignorowane, 1 = nic; kazdy inny kod to blad wywolania
    # (nie-repozytorium, brak uprawnien) — wtedy skanujemy wszystko.
    if wynik.returncode not in (0, 1):
        return set()
    return {Path(s) for s in wynik.stdout.split("\0") if s}


def iter_scannable_files(korzen: Path | None = None) -> list[Path]:
    """Wszystkie pliki z trescia autorska \u2014 JEDNO zrodlo zakresu.

    Uzywane zarowno przez ten guard, jak i przez `scripts/napraw_mojibake.py`:
    wykrywacz i naprawiacz musza widziec DOKLADNIE ten sam zbior, inaczej
    naprawa nie siega tam, gdzie guard zaglada (predykaty parami, CLAUDE.md).
    """
    baza = (korzen or KORZEN).resolve()
    zebrane: list[Path] = []
    for katalog, podkatalogi, pliki in os.walk(baza):
        biezacy = Path(katalog)
        # Przycinamy drzewo W TRAKCIE obchodu — inaczej wejscie w `.claude`
        # oznaczaloby obejscie kopii repozytorium kazdej rownoleglej sesji.
        podkatalogi[:] = sorted(n for n in podkatalogi if not czy_segment_pomijany(n))
        for nazwa in sorted(pliki):
            sciezka = biezacy / nazwa
            if should_scan(sciezka):
                zebrane.append(sciezka)
    pominiete = ignorowane_przez_gita(baza, zebrane)
    return [p for p in zebrane if p not in pominiete]


def _probka_celowa(linie: list[str], indeks: int) -> bool:
    """Czy trafienie jest oznaczona probka celowa (znacznik + uzasadnienie).

    Znacznik czytamy z linii trafienia albo z linii bezposrednio nad nia \u2014 druga
    forma jest potrzebna tam, gdzie linii nie da sie skomentowac (wnetrze
    wywolania, tekst dokumentacyjny modulu).
    """
    for kandydat in (linie[indeks], linie[indeks - 1] if indeks > 0 else ""):
        dopasowanie = _ZNACZNIK_Z_UZASADNIENIEM.search(kandydat)
        if dopasowanie and dopasowanie.group("uzasadnienie").strip():
            return True
    return False


def znajdz_trafienia(linie: list[str]) -> list[tuple[int, str, str]]:
    """(numer linii, tresc, powod) dla kazdego uszkodzenia w podanych liniach."""
    trafienia: list[tuple[int, str, str]] = []
    for indeks, linia in enumerate(linie):
        powody: list[str] = []
        for fragment, powod in SUSPICIOUS_FRAGMENTS.items():
            if fragment in linia:
                powody.append(powod)
        linia_bez_skladni = _UCIECZKA_REGEXP.sub(" ", _PARAMETR_ZAPYTANIA.sub(" ", linia))
        trafienie = ZNAK_ZASTEPCZY_W_SLOWIE.search(linia_bez_skladni)
        if trafienie:
            powody.append(f"polska litera zamieniona na znak zapytania ({trafienie.group(0)!r})")
        if not powody or _probka_celowa(linie, indeks):
            continue
        for powod in powody:
            trafienia.append((indeks + 1, linia.strip(), powod))
    return trafienia


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    kandydaci = iter_scannable_files()
    violations: list[tuple[str, int, str, str]] = []

    for path in kandydaci:
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        linie = text.splitlines()
        for numer, tresc, powod in znajdz_trafienia(linie):
            violations.append((str(path.relative_to(KORZEN)), numer, tresc, powod))

    print("=" * 60)
    print("GUARD: utf8_mojibake_guard")
    print("=" * 60)
    print(f"\nPlikow przeskanowanych: {len(kandydaci)}")

    if violations:
        print(f"\nFOUND {len(violations)} suspicious fragment(s):\n")
        for rel_path, line_no, line, reason in violations:
            print(f"  {rel_path}:{line_no}")
            print(f"    {line}")
            print(f"    -> {reason}\n")
        print("=" * 60)
        print(f"FAILED: {len(violations)} violation(s)")
        return 1

    print("\nPASSED: No mojibake fragments found")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
r"""
CI Guard: ui_math_guard.py (karta V12.7 §0.11, KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md)

Zasada nadrzedna: matematyka widoczna dla projektanta renderuje sie KaTeX-em
(`ui/proof/MathRenderer.tsx`), nigdy jako surowy zapis ASCII (`<=`, `sqrt(`,
`Z_grid(f)` bez `\mathrm`, ` * ` miedzy symbolami). Ten guard skanuje TEKSTY
UZYTKOWNIKA (literaly lancuchowe) w:

  - frontend/src/ui/** i frontend/src/ui2/**  (*.ts, *.tsx)
  - backend/src/application/analyses/v126_katalog.py
  - backend/src/application/analyses/werdykt_projektowy.py

na szesc wzorcow ASCII-matematyki:
  - `<=` / `>=`                — nierownosc ASCII zamiast `\leq`/`\geq`
  - `sqrt(`                    — funkcja ASCII zamiast `\sqrt{...}`
  - `^-1` / `^2` POZA LaTeX     — potega ASCII zamiast `^{-1}`/`^2` w LaTeX
  - ` * ` miedzy symbolami      — mnozenie ASCII zamiast `\cdot`
  - `_slowo,` bez `\mathrm`     — indeks dolny z przecinkiem bez opakowania
  - goly indeks symbolu        — `U_f`, `I_C`, `Z_0`, `I_Δn` w prozie poza wzorem `$...$`
                                 (decyzja architekta 2026-10-30, karta UX-04/ZU): symbol
                                 renderuje `MathRenderer` z pola `*_latex` albo `TekstZWzorami`
                                 z segmentu `$...$`; atrybuty i natywne `<option>` dostaja
                                 `tekstBezWzorow` (ui2/kreatory/rama/tekstZWzorami.tsx)

"POZA LATEX": literal juz oznaczony jako LaTeX (zawiera polecenie `\komenda`
LaTeX-a albo jest w calosci owiniety `$...$`/`$$...$$`) NIE jest sprawdzany
wzorcami `^-1`/`^2`/` * ` — `x^2` i `A \cdot B` sa tam poprawna skladnia.
Wzorce `<=`/`>=`/`sqrt(` sa sprawdzane ZAWSZE (nigdy nie sa poprawnym LaTeX-em).

PRECYZJA SKANU (klasy false-positive i false-negative usuniete u zrodla, nie wyjatkiem):
  1. Teksty TS/TSX wyciaga parser kompilatora TypeScript (`teksty_ts.mjs`), nie wyrazenie
     regularne na wierszach: literal szablonowy ma wylacznie czesci literalne (interpolacja
     `${wyrazenie}` to KOD), a literal zagniezdzony w interpolacji, literal wielowierszowy
     i tekst miedzy znacznikami JSX sa osobnymi wpisami (skan wierszy ich nie widzial).
     Komentarz nie jest literalem. Specyfikator modulu, typ literalowy, nazwa wlasciwosci
     i argument dostepu indeksowego sa kodem.
  2. Docstring Pythona (pierwsza instrukcja modulu/klasy/funkcji) to komentarz
     dla programisty, nie tekst UI. Wylaczony ze skanu przez pozycje ustalone
     `ast`-em (patrz `_linie_docstringow`), nie przez `WYJATKI_ZNANE`.
  3. Pola kontraktu, ktore z definicji nie sa proza (wzorzec golego indeksu i pozostale):
     wartosc pola `*_latex` oraz identyfikator `symbol` w parze z `symbol_latex` w tym
     samym wywolaniu/slowniku (`_literaly_symboli`, skan Pythona po drzewie `ast`).
     W TS ten sam wyjatek ma wlasciwosc `*_latex:`/`*Latex:` i atrybut `latex=`
     (`KLUCZ_LATEX_TS_RE`).
  4. Identyfikator kodu: klucz danych malymi literami (`bus_ref`) zawsze; stala TS
     (`'V_MAGNITUDE'`, kod metryki `'I_A'`) tylko poza modulem `strings.ts` i poza
     wlasciwoscia tekstowa (`etykieta:`, `jednostka:`, ...) — `_jest_identyfikatorem`.
  5. Polecenie LaTeX z pojedynczym ukosnikiem w literale JS (`'$\\Delta$'` w zrodle
     zapisane jako `'$\Delta$'`) — ukosnik ginie albo tworzy znak sterujacy; wykrywane
     w segmentach `$...$` i w wartosci pola LaTeX (`POJEDYNCZY_UKOSNIK_RE`).

ZAPADKA (pin z pomiaru, TYLKO W DOL — karta V12.7 §0.11): PIN ponizej jest
SUFITEM zmierzonym na tym drzewie po naprawach karty V12.7 i po dwoch
poprawkach precyzji skanu powyzej. Rezydualne wystapienia to PRZEDKARTOWY dlug
w ekranach SPOZA zakresu karty V12.7 (nie „Analizy specjalistyczne"/„Ocena
techniczna wynikow") — patrz komentarz przy `PIN`. Nowe wystapienie ponad PIN
jest czerwonym testem; spadek ponizej PIN nie jest bledem (ale obniz PIN przy
najblizszej okazji, zeby zapadka nie stala sie martwa liczba).

EXIT 0 = pass (liczba <= PIN), EXIT 1 = fail (liczba > PIN, albo brakuje
katalogu do skanowania).
"""

from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from guard_parsowanie import BladZrodla, czytaj_tekst, sparsuj_tekst, uruchom  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_UI2 = ROOT / "frontend" / "src" / "ui2"
#: Warstwa `ui/**` (decyzja architekta 2026-10-30: kryterium jest to, co widzi projektant,
#: nie warstwa kodu) — ten sam skan i ten sam PIN co `ui2/**`.
FRONTEND_UI = ROOT / "frontend" / "src" / "ui"
BACKEND_PLIKI = (
    ROOT / "backend" / "src" / "application" / "analyses" / "v126_katalog.py",
    ROOT / "backend" / "src" / "application" / "analyses" / "werdykt_projektowy.py",
)

#: Zapadka — SUFIT liczby wystapien. Pomiar 2026-10-30 (karta
#: UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5): 0. Wzorzec golego indeksu (decyzja architekta
#: 2026-10-30) zmierzyl przed naprawa 122 trafienia w 31 plikach (`ui2/**` i katalog analiz
#: V12.6); wszystkie naprawione u zrodla (symbol jako `$...$` + `TekstZWzorami`), PIN 0. Wszystkie 9 rezydualnych
#: wystapien z pomiaru 2026-09-16 naprawiono u zrodla: wzory sladu obszaru PQ
#: i odpowiedzi OSD (`formula_latex`) sa czystym LaTeX-em z proza w `\text{}`;
#: proza z symbolami (estymacja, SSCI, weryfikacja aparatury, opis kolumn
#: importu arkusza) niesie symbole jako `$...$` skladane przez `TekstZWzorami`
#: albo nazwy kolumn w `<code>`; proza katalogu analiz specjalistycznych
#: (`v126_katalog.py`) niesie symbole jako `$...$`, a ekran skladany przez
#: `TekstZWzorami` (pin tresci: `tests/test_v126_katalog_analiz.py::
#: test_proza_katalogu_niesie_symbole_wylacznie_jako_wzory_inline`); identyfikator
#: wewnetrzny `WielkoscGlowna.symbol` nie niesie juz przecinka w indeksie.
#: Kazde nowe wystapienie czerwieni strażnik — naprawiasz je u zrodla.
PIN = 0

#: Pliki/katalogi wylaczone ze skanu ui2/** (testy same niosa fixture'y ASCII
#: nie renderowane na ekranie — to samo wylaczenie co forbidden_ui_terms_guard).
WYLACZONE_WZORCE = ("__tests__", ".test.", ".spec.", "/dist/", "/node_modules/")

#: Komenda LaTeX (`\cdot`, `\leq`, `\mathrm{...}`, `\frac{...}{...}`…) —
#: obecnosc oznacza, ze literal jest juz zapisem LaTeX, nie proza z symbolami.
LATEX_KOMENDA_RE = re.compile(r"\\[a-zA-Z]+")
DELIMITER_DOLAR_RE = re.compile(r"^\$\$?.*\$\$?$", re.DOTALL)

WZORZEC_NIEROWNOSC = re.compile(r"<=|>=")
WZORZEC_SQRT = re.compile(r"sqrt\(")
WZORZEC_POTEGA = re.compile(r"\^-1|\^2\b")
WZORZEC_MNOZENIE = re.compile(r"(?<=[A-Za-z0-9_)\]}])\s\*\s(?=[A-Za-z0-9_({])")
WZORZEC_INDEKS_BEZ_MATHRM = re.compile(r"\\?_[a-zA-Z][a-zA-Z]+,(?!.*\\mathrm)")
#: Goły indeks dolny symbolu w prozie (`U_f`, `I_C`, `Z_0`, `I_k2min`, `Z_{grid}`, `I_Δn`, `φ_r`):
#: jedna litera — także grecka (nie poprzedzona literą, cyfrą, `_` ani `\\`) + `_` + indeks
#: z liter/cyfr (Unicode) albo w klamrach, bez dalszego `_` — symbol
#: wielkości zapisany ASCII zamiast wzoru `$…$`/`*_latex`. Stałe kodu (`SC_1F`, `NO_TRIP`) nie
#: pasują (przed `_` więcej niż jedna litera); klucze danych (`u_f`, `bus_ref`) wyłącza
#: `IDENTYFIKATOR_KODU` (cały literał to identyfikator małymi literami).
WZORZEC_GOLY_INDEKS = re.compile(r"(?<![\w\\])[^\W\d_]_(?:\{[^}]*\}|[^\W_]+)(?!\w)")
#: Segment wzoru w prozie (`$…$` / `$$…$$`) — składany przez KaTeX, nie jest ASCII.
SEGMENT_WZORU_RE = re.compile(r"\$\$?[^$]+\$\$?")
#: Literał będący identyfikatorem kodu (klucz danych, ścieżka, selektor): małe litery, cyfry,
#: `_ . - : / # @` — nie jest tekstem dla projektanta.
IDENTYFIKATOR_KODU = re.compile(r"[a-z0-9_.\-:/#@]+")
#: Literał będący stałą kodu TS (`'V_MAGNITUDE'`, `'A_WTORNY'`, `'Z_POL'`, kod metryki `'I_A'`):
#: jeden identyfikator bez spacji i bez znaków spoza ASCII — kod wyliczenia kontraktu, nie
#: tekst UI. Uznawany za kod WYŁĄCZNIE poza kontekstem tekstu UI (`_kontekst_tekstu_ui_ts`):
#: ten sam napis w module `strings.ts` albo jako wartość właściwości tekstowej (`etykieta:`,
#: `jednostka:`, `naglowek…:` …) jest etykietą ekranu i podlega wzorcowi gołego indeksu.
IDENTYFIKATOR_STALEJ = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+")
#: Właściwość obiektu TS, której wartością jest tekst pokazywany projektantowi.
KLUCZ_TEKSTU_UI_RE = re.compile(
    r"\b(?:etykieta|jednostka|naglowek|tytul|opis|nazwa|label|title|placeholder|tekst|"
    r"komunikat|message|wiersz|kol|param|pomoc|podpowiedz)\w*\s*:\s*$",
    re.IGNORECASE,
)
#: Moduł tekstów UI — każdy literał w nim jest tekstem ekranu.
NAZWA_MODULU_TEKSTOW_UI = "strings.ts"
#: Wlasciwosc TS niosaca zapis LaTeX (`formula_latex:`, `symbolLatex:`) — odpowiednik pola
#: `*_latex` skanu Pythona (`_literaly_symboli`): wartosc renderuje `MathInline`, nie jest proza.
#: Klucz moze stac w cudzyslowie (`"formula_latex":` — dane wynikowe zapisane w TS jako JSON),
#: a w JSX zapis LaTeX niesie atrybut `latex="..."` / `latex={`...`}` (`FormulaBlock`,
#: `MathInline`) albo `*Latex=`.
KLUCZ_LATEX_TS_RE = re.compile(r"""(?:\b\w*_latex|\b\w*Latex|\blatex)['"]?\s*(?::|=\{?)\s*$""")
#: Literal bedacy lista klas CSS z wartoscia dowolna Tailwind (`bg-[radial-gradient(...)] w-4`):
#: kazdy token rozdzielony spacja to klasa ASCII (litery, cyfry, `_ - : / . ! # %`), a co
#: najmniej jeden niesie wartosc dowolna — `prefiks-[...]` albo wlasciwosc dowolna `[wl:wart]`
#: — kod stylu, nie tekst UI. Jednostka w nawiasie prozy (`I_th [kA]`) nie ma prefiksu `-`
#: ani dwukropka, a proza z polskimi znakami nie jest ASCII — nie sa lista klas.
TOKEN_KLASY_CSS_RE = re.compile(r"[!\w:/.#%-]*(?:\[[^\s\]]*\][\w:/.%-]*)?", re.ASCII)
WARTOSC_DOWOLNA_CSS_RE = re.compile(r"-\[[^\s\]]+\]|(?:^|:)\[[^\s\]:]+:[^\s\]]+\]")


def _jest_lista_klas_css(wartosc: str) -> bool:
    tokeny = wartosc.split()
    return (
        bool(tokeny)
        and any(WARTOSC_DOWOLNA_CSS_RE.search(token) for token in tokeny)
        and all(TOKEN_KLASY_CSS_RE.fullmatch(token) for token in tokeny)
    )


#: Polecenie LaTeX zapisane w literale TS POJEDYNCZYM ukosnikiem (nieparzysta liczba `\`
#: przed litera): w literale lancuchowym `'\Delta'` traci ukosnik (`Delta`), a `'\varphi'`,
#: `'\frac'`, `'\times'`, `'\beta'`, `'\nu'`, `'\rho'` zamieniaja sie na znak sterujacy —
#: KaTeX dostaje inny wzor, niz napisano. Poprawny zapis w zrodle to `\\Delta`. Ucieczki
#: Unicode (`\u00b7`, `\u{…}`, `\x41`) nie sa poleceniem.
POJEDYNCZY_UKOSNIK_RE = re.compile(r"(?<!\\)(?:\\\\)*\\(?![ux][0-9a-fA-F{])[a-zA-Z]")


def _sprawdz_ukosniki(zapisy_latex: list[str]) -> bool:
    return any(POJEDYNCZY_UKOSNIK_RE.search(zapis) for zapis in zapisy_latex)


POWOD_UKOSNIKA = (
    "polecenie LaTeX z pojedynczym ukosnikiem w literale TS "
    "(ginie albo staje sie znakiem sterujacym) — zapisz `\\\\polecenie`"
)


def _jest_juz_latex(wartosc: str) -> bool:
    return bool(LATEX_KOMENDA_RE.search(wartosc)) or bool(DELIMITER_DOLAR_RE.match(wartosc.strip()))


def _jest_identyfikatorem(wartosc: str, *, stala_kodu_dozwolona: bool) -> bool:
    """Czy cały literał jest identyfikatorem kodu, nie tekstem dla projektanta.

    Klucz danych małymi literami (`bus_ref`, `u_pu@`) jest kodem zawsze; stała wyliczenia
    (`V_MAGNITUDE`, `I_A`) — tylko gdy wywołujący stwierdził, że literał NIE stoi w kontekście
    tekstu UI (`stala_kodu_dozwolona`)."""
    if IDENTYFIKATOR_KODU.fullmatch(wartosc):
        return True
    return stala_kodu_dozwolona and bool(IDENTYFIKATOR_STALEJ.fullmatch(wartosc))


def _dopasowania(wartosc: str, *, stala_kodu_dozwolona: bool = False) -> list[str]:
    trafienia: list[str] = []
    if WZORZEC_NIEROWNOSC.search(wartosc):
        trafienia.append("ASCII '<='/'>=' zamiast \\leq/\\geq")
    if WZORZEC_SQRT.search(wartosc):
        trafienia.append("ASCII 'sqrt(' zamiast \\sqrt{...}")
    if not _jest_juz_latex(wartosc):
        if WZORZEC_POTEGA.search(wartosc):
            trafienia.append("ASCII '^2'/'^-1' poza LaTeX")
        if WZORZEC_MNOZENIE.search(wartosc):
            trafienia.append("ASCII ' * ' miedzy symbolami zamiast \\cdot")
        if WZORZEC_INDEKS_BEZ_MATHRM.search(wartosc):
            trafienia.append("indeks '_slowo,' bez \\mathrm{}")
    proza = SEGMENT_WZORU_RE.sub(" ", wartosc)
    if (
        not _jest_identyfikatorem(wartosc, stala_kodu_dozwolona=stala_kodu_dozwolona)
        and not _jest_juz_latex(proza)
        and WZORZEC_GOLY_INDEKS.search(proza)
    ):
        trafienia.append("goly indeks symbolu (np. 'U_f') poza wzorem $...$/*_latex")
    return trafienia


#: Skrypt wyciagajacy literaly i teksty JSX parserem kompilatora TypeScript.
SKRYPT_TEKSTOW_TS = Path(__file__).resolve().parent / "teksty_ts.mjs"


def wpisy_ts(pliki: list[Path]) -> dict[Path, list[dict[str, object]]]:
    """Literaly lancuchowe/szablonowe i teksty JSX plikow TS/TSX (`teksty_ts.mjs`) — jeden
    proces `node` na cala liste. Parser, nie wyrazenie regularne: literal szablonowy
    zagniezdzony w interpolacji, literal wielowierszowy i tekst miedzy znacznikami JSX sa
    osobnymi wezlami. Brak `node` albo blad parsera => `BladZrodla` (straznik nie zgaduje)."""
    if not pliki:
        return {}
    node = shutil.which("node")
    if node is None:
        raise BladZrodla(f"{SKRYPT_TEKSTOW_TS}:0: brak `node` — teksty TS nie zostaly ocenione")
    proces = subprocess.run(  # noqa: S603 — stala sciezka skryptu repozytorium
        [node, str(SKRYPT_TEKSTOW_TS)],
        input="\n".join(str(plik) for plik in pliki),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if proces.returncode != 0:
        raise BladZrodla(f"{SKRYPT_TEKSTOW_TS}:0: parser TS zakonczyl sie bledem: {proces.stderr}")
    wynik: dict[Path, list[dict[str, object]]] = {}
    for wpis in json.loads(proces.stdout):
        wynik.setdefault(Path(str(wpis["plik"])), []).append(wpis)
    return wynik


def skanuj_ts(
    plik: Path, wpisy: list[dict[str, object]] | None = None
) -> list[tuple[int, str, str]]:
    """Wzorce ASCII-matematyki na literalach pliku TS/TSX (wpisy `rodzaj == "literal"`).

    Kontekst literalu (`przed` — tekst wiersza przed nim) rozstrzyga: wartosc wlasciwosci
    LaTeX (`formula_latex:`, `latex=`) nie jest proza; klasa CSS nie jest tekstem; stala kodu
    (`'V_MAGNITUDE'`) jest kodem tylko poza `strings.ts` i poza wlasciwoscia tekstowa.
    Polecenie LaTeX z pojedynczym ukosnikiem jest sprawdzane w kazdym literale JS (nie
    w napisie atrybutu JSX, gdzie ukosnik jest dosłowny)."""
    if wpisy is None:
        wpisy = wpisy_ts([plik]).get(plik, [])
    wyniki: list[tuple[int, str, str]] = []
    modul_tekstow = plik.name == NAZWA_MODULU_TEKSTOW_UI
    for wpis in wpisy:
        if wpis["rodzaj"] != "literal":
            continue
        numer = int(str(wpis["linia"]))
        wiersz = str(wpis["wiersz"]).strip()[:140]
        wartosc = str(wpis["wartosc"])
        przed = str(wpis["przed"])
        klucz_latex = bool(KLUCZ_LATEX_TS_RE.search(przed))
        if not wpis["atrybut_jsx"]:
            zapisy_latex = [wartosc] if klucz_latex else SEGMENT_WZORU_RE.findall(wartosc)
            if _sprawdz_ukosniki(zapisy_latex):
                wyniki.append((numer, wiersz, POWOD_UKOSNIKA))
        if klucz_latex:
            # Wartosc pola LaTeX (`formula_latex:`, `symbolLatex:`) — zrodlo `MathInline`,
            # z definicji nie proza; ta sama regula co `*_latex` w skanie Pythona.
            continue
        if _jest_lista_klas_css(wartosc):
            continue
        tekst_ui = modul_tekstow or bool(KLUCZ_TEKSTU_UI_RE.search(przed))
        for powod in _dopasowania(wartosc, stala_kodu_dozwolona=not tekst_ui):
            wyniki.append((numer, wiersz, powod))
    return wyniki


def skanuj_jsx(teksty: list[tuple[int, str]]) -> list[tuple[int, str, str]]:
    """Wzorce ASCII-matematyki na tekstach JSX pliku — zawsze tekst UI (bez wyjatku stalej
    kodu). Segment `$...$` w tekscie JSX NIE jest wzorem: tekst JSX nie przechodzi przez
    `TekstZWzorami`, wiec projektant zobaczylby dolary — symbol idzie przez `MathInline`."""
    wyniki: list[tuple[int, str, str]] = []
    for numer, tekst in teksty:
        powody = _dopasowania(tekst)
        if SEGMENT_WZORU_RE.search(tekst):
            powody.append("segment $...$ w tekscie JSX — wyswietli sie z dolarami (MathInline)")
        for powod in powody:
            wyniki.append((numer, tekst[:140], powod))
    return wyniki


def _teksty_jsx(wpisy: list[dict[str, object]]) -> list[tuple[int, str]]:
    return [
        (int(str(wpis["linia"])), str(wpis["tekst"])) for wpis in wpisy if wpis["rodzaj"] == "jsx"
    ]


def skanuj_plik_frontu(
    plik: Path, wpisy: list[dict[str, object]] | None = None
) -> list[tuple[int, str, str]]:
    """Skan pliku frontu: literaly lancuchowe/szablonowe i teksty JSX."""
    if wpisy is None:
        wpisy = wpisy_ts([plik]).get(plik, [])
    wyniki = skanuj_ts(plik, wpisy) + skanuj_jsx(_teksty_jsx(wpisy))
    wyniki.sort(key=lambda trafienie: trafienie[0])
    return wyniki


def _linie_docstringow(drzewo: ast.Module) -> set[int]:
    """Zbior numerow linii nalezacych do docstringow (modulu/klasy/funkcji) —
    to komentarz dla programisty, nie tekst prezentowany uzytkownikowi UI, wiec
    nie podlega wzorcom ASCII-matematyki tego guarda."""
    linie: set[int] = set()
    kontenery = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, kontenery):
            continue
        cialo = wezel.body
        if not cialo:
            continue
        pierwsza = cialo[0]
        if (
            isinstance(pierwsza, ast.Expr)
            and isinstance(pierwsza.value, ast.Constant)
            and isinstance(pierwsza.value.value, str)
        ):
            koniec = getattr(pierwsza, "end_lineno", pierwsza.lineno)
            linie.update(range(pierwsza.lineno, koniec + 1))
    return linie


def _pola_klas(drzewo: ast.Module) -> dict[str, list[str]]:
    """Kolejność pól klas modułu (adnotacje w ciele klasy, bez `ClassVar`) — mapuje argument
    pozycyjny konstruktora dataclass na nazwę pola."""
    pola: dict[str, list[str]] = {}
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.ClassDef):
            continue
        nazwy = [
            instrukcja.target.id
            for instrukcja in wezel.body
            if isinstance(instrukcja, ast.AnnAssign)
            and isinstance(instrukcja.target, ast.Name)
            and "ClassVar" not in ast.unparse(instrukcja.annotation)
        ]
        if nazwy:
            pola[wezel.name] = nazwy
    return pola


def _literaly_symboli(drzewo: ast.Module) -> set[int]:
    """Literały, które NIE są tekstem UI z mocy kontraktu pola (identyfikatory `id()` węzłów):

    - wartość pola `*_latex` (argument nazwany, pozycyjny dataclass albo klucz słownika) —
      zapis LaTeX renderowany KaTeX-em (`MathInline`), z definicji nie proza;
    - wartość pola `symbol` w tym samym wywołaniu/słowniku, który niesie `symbol_latex` —
      identyfikator wielkości, której postacią ekranową jest `symbol_latex` (para pól z jednego
      kontraktu; ekran nie wyświetla `symbol` jako tekstu).
    Każda inna wartość — także `symbol` BEZ pary `symbol_latex` — jest skanowana."""
    pola = _pola_klas(drzewo)
    pomin: set[int] = set()

    def _oznacz(przypisane: dict[str, ast.expr]) -> None:
        for pole, wartosc in przypisane.items():
            if pole.endswith("_latex") or (pole == "symbol" and "symbol_latex" in przypisane):
                for wezel in ast.walk(wartosc):
                    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
                        pomin.add(id(wezel))

    for wezel in ast.walk(drzewo):
        przypisane: dict[str, ast.expr] = {}
        if isinstance(wezel, ast.Call):
            funkcja = wezel.func
            nazwa = (
                funkcja.id
                if isinstance(funkcja, ast.Name)
                else funkcja.attr if isinstance(funkcja, ast.Attribute) else ""
            )
            nazwy_pol = pola.get(nazwa, [])
            for indeks, argument in enumerate(wezel.args):
                if indeks < len(nazwy_pol):
                    przypisane[nazwy_pol[indeks]] = argument
            for slowo in wezel.keywords:
                if slowo.arg is not None:
                    przypisane[slowo.arg] = slowo.value
        elif isinstance(wezel, ast.Dict):
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
                if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str):
                    przypisane[klucz.value] = wartosc
        _oznacz(przypisane)
    return pomin


def skanuj_py(plik: Path) -> list[tuple[int, str, str]]:
    """Skan literałów łańcuchowych modułu Pythona po drzewie `ast` (literały sklejone
    niejawnie są jednym tekstem; części `f"…"` poza `{…}` — jak interpolacja TS — są tekstem,
    wyrażenia w `{…}` kodem). Docstringi i literały pól LaTeX/identyfikatorów symboli
    (`_literaly_symboli`) są poza skanem."""
    wyniki: list[tuple[int, str, str]] = []
    tekst = czytaj_tekst(plik)
    drzewo = sparsuj_tekst(tekst, str(plik))
    linie_docstringow = _linie_docstringow(drzewo)
    pomin = _literaly_symboli(drzewo)
    linie = tekst.splitlines()
    for wezel in ast.walk(drzewo):
        if not (isinstance(wezel, ast.Constant) and isinstance(wezel.value, str)):
            continue
        if wezel.lineno in linie_docstringow or id(wezel) in pomin:
            continue
        for powod in _dopasowania(wezel.value):
            wyniki.append((wezel.lineno, linie[wezel.lineno - 1].strip()[:140], powod))
    wyniki.sort(key=lambda trafienie: trafienie[0])
    return wyniki


#: Wyjatki ZNANE (sciezka wzgledna, linia) — rezydualne, zaakceptowane
#: wystapienia z uzasadnieniem. KAZDY wpis to jedna kontrolowana pozycja, nie
#: maskowanie klasy — nowe wystapienie SPOZA tej listy zuzywa PIN normalnie.
#: Nie liczy sie do PIN (wypisywany osobno, dla jawnosci).
WYJATKI_ZNANE: frozenset[tuple[str, int]] = frozenset()


def wyjatki_osierocone(root: Path) -> list[str]:
    """Zapadka swiezosci `WYJATKI_ZNANE` — kazdy wpis musi wskazywac plik,
    ktory (a) istnieje ORAZ (b) nadal produkuje >=1 trafienie skanu w TEJ
    DOKLADNEJ linii, gdyby nie byl wylaczony (predykaty parami,
    KLASA-NIE-INSTANCJA §3 CLAUDE.md). Ten sam wzorzec co
    `no_raw_ids_in_ui_guard.check_excluded_relative_files_freshness` — dopisany
    TU OD RAZU (nie po drugim incydencie osierocenia — ten pierwszy juz raz
    kosztowal, patrz uzasadnienie w tamtym guardzie)."""
    problemy: list[str] = []
    for wzgledna, numer in sorted(WYJATKI_ZNANE):
        pelna = root / wzgledna
        if not pelna.is_file():
            problemy.append(
                f"[ui-math-wyjatek-osierocony] WYJATKI_ZNANE zawiera {wzgledna}:{numer}, "
                "ktorego juz nie ma w repo — usun ten wpis"
            )
            continue
        trafienia = skanuj_py(pelna) if pelna.suffix == ".py" else skanuj_plik_frontu(pelna)
        if any(linia_numer == numer for linia_numer, _linia, _powod in trafienia):
            continue
        problemy.append(
            f"[ui-math-wyjatek-osierocony] WYJATKI_ZNANE zawiera {wzgledna}:{numer}, "
            "ktory juz nie produkuje zadnego trafienia w tej linii — usun ten wpis"
        )
    return problemy


def main() -> int:
    print("=" * 70)
    print("GUARD: ui_math_guard (karta V12.7 — matematyka wylacznie KaTeX)")
    print("=" * 70)

    katalogi_frontu = (FRONTEND_UI, FRONTEND_UI2)
    for katalog in katalogi_frontu:
        if not katalog.is_dir():
            print(f"BLAD: katalog nie istnieje: {katalog}")
            return 1
    for plik in BACKEND_PLIKI:
        if not plik.is_file():
            print(f"BLAD: plik nie istnieje: {plik}")
            return 1

    wszystkie: list[tuple[str, int, str, str]] = []
    wyjatki_trafione: list[tuple[str, int, str, str]] = []

    pliki_frontu = [
        plik
        for katalog in katalogi_frontu
        for plik in sorted(katalog.rglob("*.ts")) + sorted(katalog.rglob("*.tsx"))
    ]
    pliki_frontu = [
        plik
        for plik in pliki_frontu
        if not any(wzorzec in plik.relative_to(ROOT).as_posix() for wzorzec in WYLACZONE_WZORCE)
    ]
    wpisy = wpisy_ts(pliki_frontu)
    for plik in pliki_frontu:
        wzgledna = plik.relative_to(ROOT).as_posix()
        for numer, linia, powod in skanuj_plik_frontu(plik, wpisy.get(plik, [])):
            cel = wyjatki_trafione if (wzgledna, numer) in WYJATKI_ZNANE else wszystkie
            cel.append((wzgledna, numer, linia, powod))

    for plik in BACKEND_PLIKI:
        wzgledna = plik.relative_to(ROOT).as_posix()
        for numer, linia, powod in skanuj_py(plik):
            cel = wyjatki_trafione if (wzgledna, numer) in WYJATKI_ZNANE else wszystkie
            cel.append((wzgledna, numer, linia, powod))

    if wyjatki_trafione:
        print(f"Wyjatki ZNANE (nie licza sie do PIN): {len(wyjatki_trafione)}")
        for sciezka, numer, _linia, powod in wyjatki_trafione:
            print(f"  {sciezka}:{numer}  ({powod})")
        print()

    print(f"Zmierzono: {len(wszystkie)} wystapien (PIN = {PIN}).")
    if wszystkie:
        for sciezka, numer, linia, powod in wszystkie:
            print(f"  {sciezka}:{numer}")
            print(f"    {linia}")
            print(f"    -> {powod}")

    osierocone = wyjatki_osierocone(ROOT)
    if osierocone:
        print()
        for problem in osierocone:
            print(problem)

    if len(wszystkie) > PIN:
        print(f"\nFAILED: {len(wszystkie)} wystapien ASCII-matematyki > PIN ({PIN}).")
        return 1

    if osierocone:
        print(f"\nFAILED: {len(osierocone)} wyjatek/wyjatki WYJATKI_ZNANE osierocone.")
        return 1

    if len(wszystkie) < PIN:
        print(
            f"\nUWAGA: zmierzono {len(wszystkie)} < PIN ({PIN}) — obniz PIN w tym pliku "
            "przy najblizszej okazji (zapadka tylko w dol)."
        )

    print(f"\nPASSED: {len(wszystkie)} wystapien <= PIN ({PIN}).")
    return 0


if __name__ == "__main__":
    sys.exit(uruchom(main))

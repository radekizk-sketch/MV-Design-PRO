#!/usr/bin/env python3
r"""
CI Guard: ui_math_guard.py (karta V12.7 §0.11, KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md)

Zasada nadrzedna: matematyka widoczna dla projektanta renderuje sie KaTeX-em
(`ui/proof/MathRenderer.tsx`), nigdy jako surowy zapis ASCII (`<=`, `sqrt(`,
`Z_grid(f)` bez `\mathrm`, ` * ` miedzy symbolami). Ten guard skanuje TEKSTY
UZYTKOWNIKA (literaly lancuchowe) w:

  - frontend/src/ui2/**  (*.ts, *.tsx) — zapadka globalna `PIN`
  - backend/src/**       (*.py, cale drzewo, karta PROZA-BEZ-SYMBOLI-ASCII) — zapadka per
                           plik `PINY_BACKENDU` w obie strony; poza skanem wylacznie pola wzorow
                           (`*_latex`, adnotacja `ZapisLatex`) i identyfikatory z mocy skladni
                           (operand porownania, indeks, klucz odczytu, nazwa atrybutu)

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

PRECYZJA SKANU (dwie klasy false-positive usuniete u zrodla, nie wyjatkiem):
  1. Template literal TS/TSX (`` `...` ``) moze zawierac interpolacje
     `${wyrazenie}` — to KOD (np. `v * 100`, `item.u_n_kv, 1`), nie tekst dla
     uzytkownika. Skanujemy WYLACZNIE czesc literalna, z wybalansowanym
     usunieciem kazdego `${...}` (patrz `_usun_interpolacje`).
  2. Docstring Pythona (pierwsza instrukcja modulu/klasy/funkcji) to komentarz
     dla programisty, nie tekst UI. Wylaczony ze skanu przez pozycje ustalone
     `ast`-em (patrz `_linie_docstringow`), nie przez `WYJATKI_ZNANE`.
  3. Pola kontraktu, ktore z definicji nie sa proza (wzorzec golego indeksu i pozostale):
     wartosc pola `*_latex` oraz identyfikator `symbol` w parze z `symbol_latex` w tym
     samym wywolaniu/slowniku (`_literaly_symboli`, skan Pythona po drzewie `ast`).
     W TS ten sam wyjatek ma wlasciwosc `*_latex:`/`*Latex:` (`KLUCZ_LATEX_TS_RE`).
  4. Identyfikator kodu: klucz danych malymi literami (`bus_ref`) zawsze; stala TS
     (`'V_MAGNITUDE'`, kod metryki `'I_A'`) tylko poza modulem `strings.ts` i poza
     wlasciwoscia tekstowa (`etykieta:`, `jednostka:`, ...) — `_jest_identyfikatorem`.

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
import re
import sys
from pathlib import Path

from guard_parsowanie import czytaj_tekst, sparsuj_tekst, uruchom  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_UI2 = ROOT / "frontend" / "src" / "ui2"
BACKEND_SRC = ROOT / "backend" / "src"
#: Skan backendu obejmuje CAŁE `backend/src` (karta PROZA-BEZ-SYMBOLI-ASCII, 2026-11-05):
#: proza backendu trafia na ekrany, do raportów PDF/DOCX, dokumentów dowodowych, werdyktów,
#: podpowiedzi i eksportów. Poza skanem są WYŁĄCZNIE pola wzorów (`*_latex`, adnotacja
#: `ZapisLatex` z `werdykt/zapis_latex.py`) i identyfikatory z mocy składni — żadnej listy
#: plików wyłączonych.

#: Zapadka frontendu `ui2/**` — SUFIT liczby wystąpień. Pomiar 2026-10-30 (karta
#: UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5): 0 — symbol jako `$...$` + `TekstZWzorami` albo pole
#: `*_latex`. Każde nowe wystąpienie czerwieni strażnik — naprawiasz je u źródła.
PIN = 0

#: Zapadka backendu per plik (ścieżka względem `backend/src`). Plik spoza słownika ma pin 0.
#: Pomiar w obie strony: liczba trafień pliku > pin — nowe wystąpienie (czerwono); < pin —
#: pin nieaktualny, obniż go do pomiaru (czerwono, żeby zapadka nie była martwą liczbą); wpis
#: pliku, którego nie ma — osierocony (czerwono). Wpisy z rdzeni B-01 (`rdzenie_b01.py`) czekają
#: na zgodę architekta na edycję rdzenia — nie wolno ich obniżać bez tej zgody, nie wolno też
#: ukrywać. Słownik zmierzony na drzewie karty PROZA-BEZ-SYMBOLI-ASCII.
PINY_BACKENDU: dict[str, int] = {
    # opis pola zrzutu FROZEN resultset_dynamic_v2 (STOP)
    "application/contracts/resultset_dynamic_v2.py": 1,
    # jednostka „p.u. (U_n)” wspólna z rdzeniami NC RfG — zmiana razem z nimi (B-01)
    "application/ncrfg_compliance/ocena_wymagan.py": 1,
    "catalog/profiles/nc_rfg/loader.py": 2,  # rdzeń B-01
    # opis pola schematu FROZEN resultset_v1 — zmiana tylko z podniesieniem wersji (STOP)
    "domain/result_contract_v1.py": 2,
    "network_model/solvers/frt_hvrt/contracts.py": 3,  # rdzeń B-01
    "network_model/solvers/ncrfg_ptpiree/engine.py": 24,  # rdzeń B-01
    "network_model/solvers/phase_state_sn.py": 2,  # rdzeń B-01
    "network_model/solvers/power_flow_newton_internal.py": 1,  # rdzeń B-01
    "network_model/solvers/protection_iec60255.py": 3,  # rdzeń B-01
    "network_model/solvers/short_circuit_contributions.py": 1,  # rdzeń B-01
    "network_model/solvers/short_circuit_iec60909.py": 18,  # rdzeń B-01
    "network_model/solvers/state_estimation_wls.py": 1,  # rdzeń B-01
    "network_model/solvers/v126_academic.py": 98,  # rdzeń B-01
    # jednostka „p.u. (U_n)” wspólna z rdzeniami NC RfG — zmiana razem z nimi (B-01)
    "werdykt/kontrakt.py": 1,
}

#: Pliki/katalogi wylaczone ze skanu ui2/** (testy same niosa fixture'y ASCII
#: nie renderowane na ekranie — to samo wylaczenie co forbidden_ui_terms_guard).
WYLACZONE_WZORCE = ("__tests__", ".test.", ".spec.", "/dist/", "/node_modules/")

STRING_LITERAL_TS_RE = re.compile(
    r"""(?P<quote>['"`])(?P<value>(?:\\.|(?!(?P=quote)).)*)(?P=quote)""",
)

#: Komenda LaTeX (`\cdot`, `\leq`, `\mathrm{...}`, `\frac{...}{...}`…) —
#: obecnosc oznacza, ze literal jest juz zapisem LaTeX, nie proza z symbolami.
LATEX_KOMENDA_RE = re.compile(r"\\[a-zA-Z]+")
DELIMITER_DOLAR_RE = re.compile(r"^\$\$?.*\$\$?$", re.DOTALL)

WZORZEC_NIEROWNOSC = re.compile(r"<=|>=")
WZORZEC_SQRT = re.compile(r"sqrt\(")
WZORZEC_POTEGA = re.compile(r"\^-1|\^2\b")
WZORZEC_MNOZENIE = re.compile(r"(?<=[A-Za-z0-9_)\]}])\s\*\s(?=[A-Za-z0-9_({])")
BIALY_ZNAK_RE = re.compile(r"\s")
WZORZEC_INDEKS_BEZ_MATHRM = re.compile(r"\\?_[a-zA-Z][a-zA-Z]+,(?!.*\\mathrm)")
#: Goły indeks dolny symbolu w prozie (`U_f`, `I_C`, `Z_0`, `I_k2min`, `Z_{grid}`, `I_Δn`, `φ_r`):
#: jedna litera — także grecka (nie poprzedzona literą, cyfrą, `_` ani `\\`) + `_` + indeks
#: z liter/cyfr (Unicode) albo w klamrach, bez dalszego `_` — symbol
#: wielkości zapisany ASCII zamiast wzoru `$…$`/`*_latex`. Stałe kodu (`SC_1F`, `NO_TRIP`) nie
#: pasują (przed `_` więcej niż jedna litera); klucze danych (`u_f`, `bus_ref`) wyłącza
#: `IDENTYFIKATOR_KODU` (cały literał to identyfikator małymi literami).
#: Podstawa symbolu może być też skrótem 2–4 wielkich liter z indeksem małymi literami
#: (`ALF_eff`, `ALF_wym`, `RX_min`) — ten sam symbol wielkości w prozie; stałe kodu
#: (`SC_1F`, `BRAK_METODY`) mają indeks wielkimi literami albo cyfrą, więc nie pasują.
WZORZEC_GOLY_INDEKS = re.compile(r"(?<![\w\\])[^\W\d_]_(?:\{[^}]*\}|[^\W_]+)(?!\w)")
#: Goły indeks symbolu o podstawie wieloliterowej (`ALF_eff`, `RX_min`). Stosowany WYŁĄCZNIE
#: w literale z odstępem (proza): bez odstępu ten kształt to identyfikator (`std:DFIG_converter`).
WZORZEC_GOLY_INDEKS_WIELOLITEROWY = re.compile(
    r"(?<![\w\\])[A-Z]{2,4}_[a-z][^\W_]*(?!\w)"
)
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
#: Stała kodu Pythona (`"Z_POL"`, `"A_WTORNY"` w `Literal[...]`/wyliczeniu): WYŁĄCZNIE wielkie
#: litery i cyfry — proza backendu nie jest napisem z samych wielkich liter, a symbol wielkości
#: (`"I_b"`, `"U_n"`) ma małą literę w indeksie, więc zostaje w skanie.
IDENTYFIKATOR_STALEJ_PY = re.compile(r"[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+")
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
#: Klucz może stać w cudzysłowie (`"formula_latex": …` w danych przykładowych), a właściwość
#: komponentu JSX (`latex="…"`, `latex={`…`}`) niesie wzór tak samo jak pole obiektu.
KLUCZ_LATEX_TS_RE = re.compile(
    r"""(?:\b\w*(?:_latex|Latex)|\blatex)['"]?\s*(?::|=\s*\{?)\s*$"""
)


#: Klucz obiektu TS: literał na początku linii albo po `{`/`,`, za nim dwukropek.
KLUCZ_OBIEKTU_PRZED_RE = re.compile(r"(?:^|[{,])\s*$")
DWUKROPEK_PO_RE = re.compile(r"\s*:")


def _usun_interpolacje(wartosc: str) -> str:
    """Usuwa segmenty `${...}` (kod JS/TS) z wnetrza template literal TS/TSX —
    zostaje wylacznie tekst literalny widoczny dla uzytkownika. Balansuje
    klamry, wiec `${foo({a: 1})}` znika w calosci, nie tylko do pierwszej `}`.
    """
    wynik: list[str] = []
    i = 0
    n = len(wartosc)
    while i < n:
        if wartosc[i] == "$" and i + 1 < n and wartosc[i + 1] == "{":
            glebokosc = 1
            i += 2
            while i < n and glebokosc > 0:
                if wartosc[i] == "{":
                    glebokosc += 1
                elif wartosc[i] == "}":
                    glebokosc -= 1
                i += 1
            continue
        wynik.append(wartosc[i])
        i += 1
    return "".join(wynik)


def _jest_juz_latex(wartosc: str) -> bool:
    return bool(LATEX_KOMENDA_RE.search(wartosc)) or bool(
        DELIMITER_DOLAR_RE.match(wartosc.strip())
    )


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
    # Wzorce skladni ASCII sprawdzane na PROZIE literalu: segment `$…$` jest wzorem KaTeX/LaTeX
    # (`I_{th}^2` jest tam poprawna skladnia), wiec wypada przed kontrola.
    proza = SEGMENT_WZORU_RE.sub(" ", wartosc)
    if not _jest_juz_latex(wartosc):
        if WZORZEC_POTEGA.search(proza):
            trafienia.append("ASCII '^2'/'^-1' poza LaTeX")
        if WZORZEC_MNOZENIE.search(proza):
            trafienia.append("ASCII ' * ' miedzy symbolami zamiast \\cdot")
        # `_slowo,` w napisie bez odstępów to kod (klasa CSS, selektor), nie proza dla projektanta.
        if WZORZEC_INDEKS_BEZ_MATHRM.search(proza) and BIALY_ZNAK_RE.search(wartosc):
            trafienia.append("indeks '_slowo,' bez \\mathrm{}")
    if (
        not _jest_identyfikatorem(wartosc, stala_kodu_dozwolona=stala_kodu_dozwolona)
        and not _jest_juz_latex(proza)
        and (
            WZORZEC_GOLY_INDEKS.search(proza)
            or (
                BIALY_ZNAK_RE.search(wartosc)
                and WZORZEC_GOLY_INDEKS_WIELOLITEROWY.search(proza)
            )
        )
    ):
        trafienia.append("goly indeks symbolu (np. 'U_f') poza wzorem $...$/*_latex")
    return trafienia


def skanuj_ts(plik: Path) -> list[tuple[int, str, str]]:
    wyniki: list[tuple[int, str, str]] = []
    tekst = czytaj_tekst(plik)
    modul_tekstow = plik.name == NAZWA_MODULU_TEKSTOW_UI
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        oczyszczona = linia.strip()
        if oczyszczona.startswith(("//", "*", "/*")):
            continue
        for dopasowanie in STRING_LITERAL_TS_RE.finditer(linia):
            wartosc = dopasowanie.group("value")
            if dopasowanie.group("quote") == "`":
                wartosc = _usun_interpolacje(wartosc)
            przed = linia[: dopasowanie.start()]
            if KLUCZ_LATEX_TS_RE.search(przed):
                # Wartosc pola LaTeX (`formula_latex:`, `symbolLatex:`) — zrodlo `MathInline`,
                # z definicji nie proza; ta sama regula co `*_latex` w skanie Pythona.
                continue
            if KLUCZ_OBIEKTU_PRZED_RE.search(przed) and DWUKROPEK_PO_RE.match(
                linia[dopasowanie.end() :]
            ):
                # Literał jest KLUCZEM obiektu (`'Load.p_mw': [...]`) — nazwą pola, nie tekstem
                # ekranu; wartość ternarnego `? 'a' : 'b'` nie pasuje (przed nią stoi `?`).
                continue
            tekst_ui = modul_tekstow or bool(KLUCZ_TEKSTU_UI_RE.search(przed))
            for powod in _dopasowania(wartosc, stala_kodu_dozwolona=not tekst_ui):
                wyniki.append((numer, oczyszczona[:140], powod))
    if plik.suffix == ".tsx":
        wyniki += _skanuj_tekst_jsx(tekst)
    return sorted(wyniki)


#: Tekst JSX między znacznikami w jednej linii (`<dt>Prąd I_th</dt>`).
TEKST_JSX_W_LINII_RE = re.compile(r">([^<>{}]+)<")
#: Linia będąca w całości tekstem JSX (dziecko znacznika rozpisane na wiele linii): bez znaków
#: składni kodu. Linia zaczynająca się operatorem (`? x`, `: y`, `&& z`, `.map`) albo
#: kończąca przecinkiem/nawiasem otwierającym jest kodem, nie tekstem.
LINIA_TEKSTU_JSX_RE = re.compile(r"[^<>{}=;'\"`?:.&|+\-*/()\[\]!][^<>{}=;'\"`]*")
WLASCIWOSC_TS_RE = re.compile(r"^\w+\??\s*:")
KONIEC_KODU = (",", "(", "?", "&&", "||", "=>")
#: Wywołanie funkcji (`nazwa(`, `f?.(` bez odstępu) — linia jest argumentem kodu, nie tekstem JSX.
WYWOLANIE_RE = re.compile(r"[\w.]\(")


def _skanuj_tekst_jsx(tekst: str) -> list[tuple[int, str, str]]:
    """Tekst JSX (dzieci znaczników) — renderowany projektantowi wprost, poza literałami
    napisów, więc skan literałów go nie widzi. Literały i interpolacje `{…}` wycięte przed
    dopasowaniem; komentarze blokowe `{/* … */}` pominięte."""
    wyniki: list[tuple[int, str, str]] = []
    w_komentarzu = False
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        if w_komentarzu:
            if "*/" in linia:
                w_komentarzu = False
            continue
        oczyszczona = linia.strip()
        if oczyszczona.startswith(("//", "*")):
            continue
        if "/*" in linia and "*/" not in linia.split("/*", 1)[1]:
            w_komentarzu = True
            linia = linia.split("/*", 1)[0]
            oczyszczona = linia.strip()
        bez_literalow = STRING_LITERAL_TS_RE.sub('""', linia)
        kandydaci = [m.group(1) for m in TEKST_JSX_W_LINII_RE.finditer(bez_literalow)]
        if (
            not kandydaci
            and LINIA_TEKSTU_JSX_RE.fullmatch(oczyszczona)
            and not WLASCIWOSC_TS_RE.match(oczyszczona)
            and not oczyszczona.endswith(KONIEC_KODU)
            and not WYWOLANIE_RE.search(oczyszczona)
        ):
            kandydaci.append(oczyszczona)
        for kandydat in kandydaci:
            for powod in _dopasowania(kandydat.strip()):
                wyniki.append((numer, oczyszczona[:140], powod))
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


#: Adnotacja pola/parametru niosącego wzór LaTeX pod zamrożoną nazwą (`werdykt/zapis_latex.py`).
ADNOTACJA_LATEX = "ZapisLatex"
#: Adnotacja pola/parametru niosącego identyfikator kontraktu czytany maszynowo (nazwa kolumny
#: arkusza importu, klucz wyniku, kod) — `werdykt/zapis_latex.py::IdentyfikatorKontraktu`.
ADNOTACJA_IDENTYFIKATORA = "IdentyfikatorKontraktu"
#: Adnotacje wyłączające wartość z prozy — jedno źródło dla `_tryb_pola`.
ADNOTACJE_POZA_PROZA = (ADNOTACJA_LATEX, ADNOTACJA_IDENTYFIKATORA)
#: Adnotacja słownika, którego KLUCZE są wzorami albo identyfikatorami
#: (`dict[ZapisLatex, str]`, `dict[IdentyfikatorKontraktu, type]`) — wartości skanowane.
ADNOTACJA_KLUCZY_LATEX_RE = re.compile(
    r"^(?:dict|Dict|Mapping|typing\.Mapping)\[\s*(?:ZapisLatex|IdentyfikatorKontraktu)\b"
)
#: Metody, których pierwszy argument łańcuchowy jest kluczem odczytu (identyfikator, nie proza).
METODY_KLUCZA = frozenset({"get", "pop", "setdefault", "__getitem__"})
#: Funkcje wbudowane, których drugi argument jest nazwą atrybutu (identyfikator).
FUNKCJE_ATRYBUTU = frozenset({"getattr", "hasattr", "setattr", "delattr"})

#: Tryb pola: wszystkie literały wartości są wzorem (`"caly"`) albo tylko klucze słownika
#: (`"klucze"`).
Tryb = str


def _tryb_pola(nazwa: str, adnotacja: ast.expr | None) -> Tryb | None:
    """Czy pole/parametr niesie wzór LaTeX albo identyfikator kontraktu — z nazwy (`*_latex`)
    albo adnotacji `ZapisLatex` / `IdentyfikatorKontraktu`."""
    if nazwa.endswith("_latex"):
        return "caly"
    if adnotacja is None:
        return None
    tekst = ast.unparse(adnotacja).strip("'\"")
    if not any(re.search(rf"\b{a}\b", tekst) for a in ADNOTACJE_POZA_PROZA):
        return None
    return "klucze" if ADNOTACJA_KLUCZY_LATEX_RE.match(tekst) else "caly"


def _parametry(
    funkcja: ast.FunctionDef | ast.AsyncFunctionDef, *, metoda: bool
) -> list[tuple[str, Tryb | None]]:
    """Parametry pozycyjne funkcji (bez `self`/`cls` metody) z trybem pola LaTeX."""
    argumenty = [*funkcja.args.posonlyargs, *funkcja.args.args]
    statyczna = any(
        isinstance(d, ast.Name) and d.id == "staticmethod"
        for d in funkcja.decorator_list
    )
    if metoda and not statyczna and argumenty:
        argumenty = argumenty[1:]
    wynik = [(a.arg, _tryb_pola(a.arg, a.annotation)) for a in argumenty]
    wynik += [(a.arg, _tryb_pola(a.arg, a.annotation)) for a in funkcja.args.kwonlyargs]
    return wynik


def _indeks_modulu(drzewo: ast.Module) -> dict[str, list[tuple[str, Tryb | None]]]:
    """Sygnatury wywoływalnych bytów modułu: klasa (pola dataclass albo `__init__`), metoda
    (`Klasa.metoda` oraz `.metoda` dla wywołań przez `self`/`cls`) i funkcja modułu."""
    indeks: dict[str, list[tuple[str, Tryb | None]]] = {}
    for wezel in drzewo.body:
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            indeks[wezel.name] = _parametry(wezel, metoda=False)
    # Funkcje zagnieżdżone (domknięcia wywoływane nazwą gołą w ciele funkcji zewnętrznej).
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            for dziecko in ast.walk(wezel):
                if dziecko is not wezel and isinstance(
                    dziecko, ast.FunctionDef | ast.AsyncFunctionDef
                ):
                    indeks.setdefault(dziecko.name, _parametry(dziecko, metoda=False))
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.ClassDef):
            continue
        pola = [
            (
                instrukcja.target.id,
                _tryb_pola(instrukcja.target.id, instrukcja.annotation),
            )
            for instrukcja in wezel.body
            if isinstance(instrukcja, ast.AnnAssign)
            and isinstance(instrukcja.target, ast.Name)
            and "ClassVar" not in ast.unparse(instrukcja.annotation)
        ]
        for instrukcja in wezel.body:
            if isinstance(instrukcja, ast.FunctionDef | ast.AsyncFunctionDef):
                parametry = _parametry(instrukcja, metoda=True)
                if instrukcja.name == "__init__":
                    pola = parametry
                indeks[f"{wezel.name}.{instrukcja.name}"] = parametry
                indeks.setdefault(f".{instrukcja.name}", parametry)
        if pola:
            indeks[wezel.name] = pola
    return indeks


_INDEKS_GLOBALNY: dict[Path, dict[str, list[tuple[str, Tryb | None]]]] = {}


def _indeks_globalny() -> dict[str, list[tuple[str, Tryb | None]]]:
    """Sygnatury klas i funkcji całego `backend/src` — wywołanie `ProofValue.create(...)`
    w module A trafia na adnotację parametru zdefiniowaną w module B. Klucz zdefiniowany
    w kilku modułach dostaje sumę trybów (pole LaTeX w którejkolwiek definicji)."""
    if BACKEND_SRC not in _INDEKS_GLOBALNY:
        zbiorczy: dict[str, list[tuple[str, Tryb | None]]] = {}
        for plik in pliki_backendu():
            for klucz, parametry in _indeks_modulu(
                sparsuj_tekst(czytaj_tekst(plik), str(plik))
            ).items():
                if klucz.startswith("."):
                    continue
                dotychczas = zbiorczy.get(klucz)
                if dotychczas is None or not any(t for _n, t in dotychczas):
                    if dotychczas is None or any(t for _n, t in parametry):
                        zbiorczy[klucz] = parametry
        _INDEKS_GLOBALNY[BACKEND_SRC] = zbiorczy
    return _INDEKS_GLOBALNY[BACKEND_SRC]


def _klucz_wywolania(funkcja: ast.expr) -> list[str]:
    if isinstance(funkcja, ast.Name):
        return [funkcja.id]
    if isinstance(funkcja, ast.Attribute):
        klucze = (
            [f".{funkcja.attr}"]
            if isinstance(funkcja.value, ast.Name)
            and funkcja.value.id
            in (
                "self",
                "cls",
            )
            else []
        )
        if isinstance(funkcja.value, ast.Name):
            klucze.append(f"{funkcja.value.id}.{funkcja.attr}")
        klucze.append(funkcja.attr)
        return klucze
    return []


def _oznacz_wartosc(wartosc: ast.expr, tryb: Tryb, pomin: set[int]) -> None:
    if tryb == "klucze":
        if isinstance(wartosc, ast.Dict):
            for klucz, element in zip(wartosc.keys, wartosc.values, strict=True):
                if klucz is not None:
                    _oznacz_wartosc(klucz, "caly", pomin)
                else:
                    _oznacz_wartosc(
                        element, "klucze", pomin
                    )  # `**{...}` — rozpakowanie
        elif isinstance(wartosc, ast.BinOp):  # `{...} | {...}`
            _oznacz_wartosc(wartosc.left, "klucze", pomin)
            _oznacz_wartosc(wartosc.right, "klucze", pomin)
        elif isinstance(wartosc, ast.IfExp):
            _oznacz_wartosc(wartosc.body, "klucze", pomin)
            _oznacz_wartosc(wartosc.orelse, "klucze", pomin)
        return
    for wezel in ast.walk(wartosc):
        if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
            pomin.add(id(wezel))


def _literaly_identyfikatorow(drzewo: ast.Module, pomin: set[int]) -> None:
    """Literał w roli identyfikatora z mocy składni (nie tekst dla projektanta): operand
    porównania (`x == "Q_max"`, `k in ("I_k", "I_b")`), indeks subskrypcji (`d["I_k"]`),
    klucz odczytu (`d.get("I_k")`) i nazwa atrybutu (`getattr(o, "I_k")`)."""

    def _stale(wezel: ast.expr) -> None:
        if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
            pomin.add(id(wezel))
        elif isinstance(wezel, ast.Tuple | ast.List | ast.Set):
            for element in wezel.elts:
                _stale(element)

    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Dict):
            # Klucz struktury danych (`{"I_dyn": {...}}`, `{"I_k": [...]}`): wartością jest
            # obiekt albo lista — klucz to nazwa pola zapisu JSON, nie tekst dla projektanta.
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
                if klucz is not None and isinstance(
                    wartosc,
                    ast.Dict | ast.List | ast.Tuple | ast.DictComp | ast.ListComp,
                ):
                    _stale(klucz)
        if isinstance(wezel, ast.Compare):
            for operand in (wezel.left, *wezel.comparators):
                _stale(operand)
        elif isinstance(wezel, ast.Subscript):
            _stale(wezel.slice)
        elif isinstance(wezel, ast.Call) and wezel.args:
            funkcja = wezel.func
            if isinstance(funkcja, ast.Attribute) and funkcja.attr in METODY_KLUCZA:
                _stale(wezel.args[0])
            elif (
                isinstance(funkcja, ast.Name)
                and funkcja.id in FUNKCJE_ATRYBUTU
                and len(wezel.args) > 1
            ):
                _stale(wezel.args[1])


def _literaly_symboli(drzewo: ast.Module) -> set[int]:
    """Literały, które NIE są tekstem UI z mocy kontraktu pola (identyfikatory `id()` węzłów):

    - wartość pola `*_latex` albo pola/parametru z adnotacją `ZapisLatex`
      (`werdykt/zapis_latex.py`) — argument nazwany, pozycyjny (sygnatura klasy, metody albo
      funkcji z indeksu całego `backend/src`), klucz słownika, wartość domyślna parametru,
      przypisanie z adnotacją i wartość `return` funkcji `-> ZapisLatex`; adnotacja
      `dict[ZapisLatex, ...]` wyłącza wyłącznie KLUCZE słownika;
    - wartość pola `symbol` w tym samym wywołaniu/słowniku, który niesie `symbol_latex` —
      identyfikator wielkości, której postacią ekranową jest `symbol_latex` (para pól z jednego
      kontraktu; ekran nie wyświetla `symbol` jako tekstu);
    - literał w roli identyfikatora z mocy składni (`_literaly_identyfikatorow`).
    Każda inna wartość — także `symbol` BEZ pary `symbol_latex` — jest skanowana."""
    lokalny = _indeks_modulu(drzewo)
    globalny = _indeks_globalny()
    pomin: set[int] = set()

    def _sygnatura(funkcja: ast.expr) -> list[tuple[str, Tryb | None]]:
        for klucz in _klucz_wywolania(funkcja):
            if klucz in lokalny:
                return lokalny[klucz]
            if klucz in globalny:
                return globalny[klucz]
        return []

    def _oznacz(przypisane: dict[str, tuple[ast.expr, Tryb | None]]) -> None:
        for pole, (wartosc, tryb) in przypisane.items():
            if tryb is None and pole == "symbol" and "symbol_latex" in przypisane:
                tryb = "caly"
            if tryb is not None:
                _oznacz_wartosc(wartosc, tryb, pomin)

    for wezel in ast.walk(drzewo):
        przypisane: dict[str, tuple[ast.expr, Tryb | None]] = {}
        if isinstance(wezel, ast.Call):
            sygnatura = _sygnatura(wezel.func)
            tryby = dict(sygnatura)
            pozycyjne = [nazwa for nazwa, _t in sygnatura]
            for indeks, argument in enumerate(wezel.args):
                if indeks < len(pozycyjne):
                    przypisane[pozycyjne[indeks]] = (argument, tryby[pozycyjne[indeks]])
            for slowo in wezel.keywords:
                if slowo.arg is not None:
                    przypisane[slowo.arg] = (
                        slowo.value,
                        tryby.get(slowo.arg) or _tryb_pola(slowo.arg, None),
                    )
        elif isinstance(wezel, ast.Dict):
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
                if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str):
                    przypisane[klucz.value] = (wartosc, _tryb_pola(klucz.value, None))
        elif isinstance(wezel, ast.AnnAssign) and wezel.value is not None:
            nazwa = wezel.target.id if isinstance(wezel.target, ast.Name) else ""
            tryb = _tryb_pola(nazwa, wezel.annotation)
            if tryb is not None:
                _oznacz_wartosc(wezel.value, tryb, pomin)
        elif isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            argumenty = [*wezel.args.posonlyargs, *wezel.args.args]
            for argument, domyslna in zip(
                argumenty[len(argumenty) - len(wezel.args.defaults) :],
                wezel.args.defaults,
                strict=False,
            ):
                tryb = _tryb_pola(argument.arg, argument.annotation)
                if tryb is not None:
                    _oznacz_wartosc(domyslna, tryb, pomin)
            for argument, domyslna in zip(
                wezel.args.kwonlyargs, wezel.args.kw_defaults, strict=False
            ):
                tryb = _tryb_pola(argument.arg, argument.annotation)
                if tryb is not None and domyslna is not None:
                    _oznacz_wartosc(domyslna, tryb, pomin)
            _oznacz_zmienne_latex(wezel, pomin)
            tryb_zwrotu = _tryb_pola("", wezel.returns)
            if tryb_zwrotu is not None:
                for instrukcja in _instrukcje_wlasne(wezel):
                    if (
                        isinstance(instrukcja, ast.Return)
                        and instrukcja.value is not None
                    ):
                        _oznacz_wartosc(instrukcja.value, tryb_zwrotu, pomin)
        _oznacz(przypisane)
    _literaly_identyfikatorow(drzewo, pomin)
    return pomin


def _oznacz_zmienne_latex(
    funkcja: ast.FunctionDef | ast.AsyncFunctionDef, pomin: set[int]
) -> None:
    """Zmienna lokalna zadeklarowana adnotacją `ZapisLatex` (także bez wartości, przed
    rozgałęzieniem: `wejscia: list[tuple[ZapisLatex, str]]`) — każde jej przypisanie w tej
    funkcji niesie wzór; przypisanie krotkowe wymaga adnotacji WSZYSTKICH celów."""
    instrukcje = _instrukcje_wlasne(funkcja)
    zmienne: dict[str, Tryb] = {}
    for instrukcja in instrukcje:
        if isinstance(instrukcja, ast.AnnAssign) and isinstance(
            instrukcja.target, ast.Name
        ):
            tryb = _tryb_pola(instrukcja.target.id, instrukcja.annotation)
            if tryb is not None:
                zmienne[instrukcja.target.id] = tryb
    if not zmienne:
        return
    for instrukcja in instrukcje:
        if (
            isinstance(instrukcja, ast.AugAssign)
            and isinstance(instrukcja.target, ast.Name)
            and instrukcja.target.id in zmienne
        ):
            # Dopisanie do zmiennej wzoru (`podstawienie += r" \le S_{min}"`) niesie wzór.
            _oznacz_wartosc(instrukcja.value, zmienne[instrukcja.target.id], pomin)
            continue
        if not isinstance(instrukcja, ast.Assign):
            continue
        for cel in instrukcja.targets:
            if isinstance(cel, ast.Name) and cel.id in zmienne:
                _oznacz_wartosc(instrukcja.value, zmienne[cel.id], pomin)
            elif (
                isinstance(cel, ast.Tuple)
                and cel.elts
                and all(
                    isinstance(e, ast.Name) and zmienne.get(e.id) == "caly"
                    for e in cel.elts
                )
            ):
                _oznacz_wartosc(instrukcja.value, "caly", pomin)


def _instrukcje_wlasne(
    funkcja: ast.FunctionDef | ast.AsyncFunctionDef,
) -> list[ast.AST]:
    """Węzły ciała funkcji bez ciał funkcji zagnieżdżonych (ich `return` ma własny typ)."""
    wynik: list[ast.AST] = []
    stos: list[ast.AST] = [
        w
        for w in funkcja.body
        if not isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef)
    ]
    while stos:
        wezel = stos.pop()
        wynik.append(wezel)
        for dziecko in ast.iter_child_nodes(wezel):
            if not isinstance(
                dziecko, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda
            ):
                stos.append(dziecko)
    return wynik


#: Literał w całości adresem URL — odsyłacz, nie proza (składnia zapytania niesie `_`).
ADRES_URL_RE = re.compile(r"https?://\S+")
#: Literał-instrukcja SQL (początek słowem kluczowym DML/DDL) — kod zapytania, nie proza.
INSTRUKCJA_SQL_RE = re.compile(r"(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER) ")


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
        if ADRES_URL_RE.fullmatch(wezel.value) or INSTRUKCJA_SQL_RE.match(wezel.value):
            # Adres (`https://…?p_Doc_Ref=…`) i instrukcja SQL (`SELECT * FROM …`) to kod
            # albo odsyłacz, nie proza: znaki `_`/`*` należą do ich składni.
            continue
        stala_kodu = bool(IDENTYFIKATOR_STALEJ_PY.fullmatch(wezel.value))
        for powod in _dopasowania(wezel.value, stala_kodu_dozwolona=stala_kodu):
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
        trafienia = skanuj_py(pelna) if pelna.suffix == ".py" else skanuj_ts(pelna)
        if any(linia_numer == numer for linia_numer, _linia, _powod in trafienia):
            continue
        problemy.append(
            f"[ui-math-wyjatek-osierocony] WYJATKI_ZNANE zawiera {wzgledna}:{numer}, "
            "ktory juz nie produkuje zadnego trafienia w tej linii — usun ten wpis"
        )
    return problemy


def pliki_frontendu() -> list[Path]:
    """Moduły TS/TSX warstwy prezentacji: `ui2/**` i jej sąsiada `ui/**` (ten sam katalog
    `frontend/src`) — oba renderują tekst dla projektanta, więc podlegają tej samej regule.
    """
    pliki: list[Path] = []
    for katalog in (FRONTEND_UI2, FRONTEND_UI2.parent / "ui"):
        if katalog.is_dir():
            pliki += sorted(katalog.rglob("*.ts")) + sorted(katalog.rglob("*.tsx"))
    return pliki


def pliki_backendu() -> list[Path]:
    """Wszystkie moduły Pythona `backend/src` (bez `__pycache__`), w porządku ścieżek."""
    return sorted(p for p in BACKEND_SRC.rglob("*.py") if "__pycache__" not in p.parts)


def zmierz_backend() -> dict[str, list[tuple[int, str, str]]]:
    """Trafienia skanu per plik backendu (ścieżka względem `backend/src`), bez `WYJATKI_ZNANE`."""
    wynik: dict[str, list[tuple[int, str, str]]] = {}
    for plik in pliki_backendu():
        wzgledna_root = plik.relative_to(ROOT).as_posix()
        trafienia = [
            t for t in skanuj_py(plik) if (wzgledna_root, t[0]) not in WYJATKI_ZNANE
        ]
        if trafienia:
            wynik[plik.relative_to(BACKEND_SRC).as_posix()] = trafienia
    return wynik


def problemy_pinow_backendu(pomiar: dict[str, list[tuple[int, str, str]]]) -> list[str]:
    """Porównanie pomiaru z `PINY_BACKENDU` w obie strony + osierocone wpisy."""
    problemy: list[str] = []
    for wzgledna in sorted(set(pomiar) | set(PINY_BACKENDU)):
        liczba = len(pomiar.get(wzgledna, []))
        pin = PINY_BACKENDU.get(wzgledna, 0)
        if wzgledna in PINY_BACKENDU and not (BACKEND_SRC / wzgledna).is_file():
            problemy.append(
                f"[ui-math-pin-osierocony] {wzgledna}: pliku nie ma — usuń wpis"
            )
        elif liczba > pin:
            problemy.append(
                f"[ui-math-nowe] {wzgledna}: {liczba} trafień > pin {pin} — napraw u źródła"
            )
        elif liczba < pin:
            problemy.append(
                f"[ui-math-pin-nieaktualny] {wzgledna}: {liczba} trafień < pin {pin} — "
                f"obniż pin do {liczba}"
            )
    return problemy


def main() -> int:
    print("=" * 70)
    print("GUARD: ui_math_guard (karta V12.7 — matematyka wylacznie KaTeX)")
    print("=" * 70)

    if not FRONTEND_UI2.is_dir():
        print(f"BLAD: katalog nie istnieje: {FRONTEND_UI2}")
        return 1
    if not BACKEND_SRC.is_dir():
        print(f"BLAD: katalog nie istnieje: {BACKEND_SRC}")
        return 1

    wszystkie: list[tuple[str, int, str, str]] = []
    wyjatki_trafione: list[tuple[str, int, str, str]] = []

    for plik in pliki_frontendu():
        wzgledna = plik.relative_to(ROOT).as_posix()
        if any(wzorzec in wzgledna for wzorzec in WYLACZONE_WZORCE):
            continue
        for numer, linia, powod in skanuj_ts(plik):
            cel = wyjatki_trafione if (wzgledna, numer) in WYJATKI_ZNANE else wszystkie
            cel.append((wzgledna, numer, linia, powod))

    if wyjatki_trafione:
        print(f"Wyjatki ZNANE (nie licza sie do PIN): {len(wyjatki_trafione)}")
        for sciezka, numer, _linia, powod in wyjatki_trafione:
            print(f"  {sciezka}:{numer}  ({powod})")
        print()

    print(f"Frontend ui2 + ui: zmierzono {len(wszystkie)} wystapien (PIN = {PIN}).")
    for sciezka, numer, linia, powod in wszystkie:
        print(f"  {sciezka}:{numer}")
        print(f"    {linia}")
        print(f"    -> {powod}")

    pomiar = zmierz_backend()
    razem = sum(len(t) for t in pomiar.values())
    print(
        f"Backend src: zmierzono {razem} wystapien w {len(pomiar)} plikach "
        f"(suma pinow = {sum(PINY_BACKENDU.values())})."
    )
    problemy = problemy_pinow_backendu(pomiar)
    for problem in problemy:
        print(f"  {problem}")
        wzgledna = problem.split("] ", 1)[1].split(":", 1)[0]
        if problem.startswith("[ui-math-nowe]"):
            for numer, linia, powod in pomiar.get(wzgledna, []):
                print(f"    {numer}: {linia}")
                print(f"      -> {powod}")

    osierocone = wyjatki_osierocone(ROOT)
    if osierocone:
        print()
        for problem in osierocone:
            print(problem)

    if len(wszystkie) > PIN:
        print(f"\nFAILED: {len(wszystkie)} wystapien ASCII-matematyki > PIN ({PIN}).")
        return 1
    if problemy:
        print(
            f"\nFAILED: {len(problemy)} rozbieżności zapadki backendu (PINY_BACKENDU)."
        )
        return 1
    if osierocone:
        print(f"\nFAILED: {len(osierocone)} wyjatek/wyjatki WYJATKI_ZNANE osierocone.")
        return 1
    if len(wszystkie) < PIN:
        print(
            f"\nUWAGA: zmierzono {len(wszystkie)} < PIN ({PIN}) — obniz PIN w tym pliku "
            "przy najblizszej okazji (zapadka tylko w dol)."
        )

    print(
        f"\nPASSED: frontend {len(wszystkie)} <= PIN ({PIN}); backend zgodny z PINY_BACKENDU."
    )
    return 0


if __name__ == "__main__":
    sys.exit(uruchom(main))

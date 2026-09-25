#!/usr/bin/env python3
r"""
CI Guard: ui_math_guard.py (karta V12.7 §0.11, KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md)

Zasada nadrzedna: matematyka widoczna dla projektanta renderuje sie KaTeX-em
(`ui/proof/MathRenderer.tsx`), nigdy jako surowy zapis ASCII (`<=`, `sqrt(`,
`Z_grid(f)` bez `\mathrm`, ` * ` miedzy symbolami). Ten guard skanuje TEKSTY
UZYTKOWNIKA (literaly lancuchowe) w:

  - frontend/src/ui2/**  (*.ts, *.tsx)
  - backend/src/application/analyses/v126_katalog.py
  - backend/src/application/analyses/werdykt_projektowy.py

na piec wzorcow ASCII-matematyki:
  - `<=` / `>=`                — nierownosc ASCII zamiast `\leq`/`\geq`
  - `sqrt(`                    — funkcja ASCII zamiast `\sqrt{...}`
  - `^-1` / `^2` POZA LaTeX     — potega ASCII zamiast `^{-1}`/`^2` w LaTeX
  - ` * ` miedzy symbolami      — mnozenie ASCII zamiast `\cdot`
  - `_slowo,` bez `\mathrm`     — indeks dolny z przecinkiem bez opakowania

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
import io
import re
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_UI2 = ROOT / "frontend" / "src" / "ui2"
BACKEND_PLIKI = (
    ROOT / "backend" / "src" / "application" / "analyses" / "v126_katalog.py",
    ROOT / "backend" / "src" / "application" / "analyses" / "werdykt_projektowy.py",
)

#: Zapadka — SUFIT liczby wystapien (pomiar 2026-09-16, karta V12.7, PO
#: poprawkach precyzji skanu — usuniecie interpolacji `${...}` z template
#: literali TS i wylaczenie docstringow Pythona ze skanu — I PO naprawie
#: wszystkich wystapien w zakresie karty: 2x zbedne echo ASCII wzoru w
#: `warunek_pl` ekranu akademickiego (uziemienie, U_dot/U_kr — wzor jest juz
#: nad tym tekstem jako czysty KaTeX, echo usuniete), 3x `symbol_latex=I^2 t`
#: → `I^{2} t` (jawne klamry, kanoniczny zapis). 9 rezydualnych wystapien to:
#:   (a) 6x ekrany SPOZA zakresu karty V12.7 (kreatory/**, oze/obszar,
#:       oze/osd, spaces/projekt/arkusz, wyniki/estymacja, wyniki/ssci —
#:       odrebne okno z wlasnym modelem danych, patrz naglowek
#:       `ui2/wyniki/akademickie/api.ts` — , wyniki/zwarcia/aparatura) —
#:       naprawa wymagalaby redesignu ekranow, ktore karta V12.7 jawnie
#:       wylacza z zakresu („NIE: redesign, NIE: zmiany nawigacji");
#:   (b) 3x `v126_katalog.py` pola NIGDY nie renderowane jako surowy tekst:
#:       `wartosc_graniczna` (str) uzywane wylacznie gdy `typeof === 'number'`
#:       jest false, a wtedy UI renderuje `wzor_latex`+`wzor_opis_pl`, NIE tę
#:       wartosc (linie 581, 601); `DanaZModelu.nazwa_pl` to lista wymaganych
#:       pol karty katalogowej (prosty tekst opisowy, nie wzor — linia 690).
#: Nie podnosic bez pomiaru; obnizyc przy kazdej naprawie rezydualnego
#: wystapienia (nawet spoza karty V12.7 — kolejna karta obejmujaca dany ekran).
PIN = 9

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
WZORZEC_INDEKS_BEZ_MATHRM = re.compile(r"\\?_[a-zA-Z][a-zA-Z]+,(?!.*\\mathrm)")


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
    return bool(LATEX_KOMENDA_RE.search(wartosc)) or bool(DELIMITER_DOLAR_RE.match(wartosc.strip()))


def _dopasowania(wartosc: str) -> list[str]:
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
    return trafienia


def skanuj_ts(plik: Path) -> list[tuple[int, str, str]]:
    wyniki: list[tuple[int, str, str]] = []
    try:
        tekst = plik.read_text(encoding="utf-8")
    except OSError:
        return wyniki
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        oczyszczona = linia.strip()
        if oczyszczona.startswith("//") or oczyszczona.startswith("*"):
            continue
        for dopasowanie in STRING_LITERAL_TS_RE.finditer(linia):
            wartosc = dopasowanie.group("value")
            if dopasowanie.group("quote") == "`":
                wartosc = _usun_interpolacje(wartosc)
            for powod in _dopasowania(wartosc):
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


def skanuj_py(plik: Path) -> list[tuple[int, str, str]]:
    wyniki: list[tuple[int, str, str]] = []
    try:
        tekst = plik.read_text(encoding="utf-8")
    except OSError:
        return wyniki
    try:
        linie_docstringow = _linie_docstringow(ast.parse(tekst))
    except SyntaxError:
        linie_docstringow = set()
    try:
        tokeny = tokenize.generate_tokens(io.StringIO(tekst).readline)
        for tok in tokeny:
            if tok.type != tokenize.STRING:
                continue
            if tok.start[0] in linie_docstringow:
                continue
            wartosc = tok.string
            # Zdejmij prefiks r/f/b i cudzyslowy (pojedyncze/potrojne).
            wartosc = re.sub(r"^[a-zA-Z]*", "", wartosc)
            for cudzyslow in ('"""', "'''", '"', "'"):
                if wartosc.startswith(cudzyslow) and wartosc.endswith(cudzyslow):
                    wartosc = wartosc[len(cudzyslow) : -len(cudzyslow)]
                    break
            for powod in _dopasowania(wartosc):
                linia_tekst = tekst.splitlines()[tok.start[0] - 1].strip()
                wyniki.append((tok.start[0], linia_tekst[:140], powod))
    except (tokenize.TokenError, SyntaxError, IndexError):
        return wyniki
    return wyniki


#: Wyjatki ZNANE (sciezka wzgledna, linia) — rezydualne, zaakceptowane
#: wystapienia z uzasadnieniem. KAZDY wpis to jedna kontrolowana pozycja, nie
#: maskowanie klasy — nowe wystapienie SPOZA tej listy zuzywa PIN normalnie.
#: Nie liczy sie do PIN (wypisywany osobno, dla jawnosci).
WYJATKI_ZNANE: frozenset[tuple[str, int]] = frozenset(
    {
        # `WielkoscGlowna.symbol` (pierwszy pozycyjny argument) jest
        # identyfikatorem WEWNETRZNYM uzywanym wylacznie jako React `key`
        # (zweryfikowane grepem `\.symbol\b` w EkranAnalizAkademickich.tsx —
        # trzy uzycia, wszystkie w `key={...}`), nigdy nie renderowany jako
        # tekst. Widoczny zapis symbolu idzie WYLACZNIE przez `symbol_latex`
        # (pole obok, patrz `WielkoscGlowna.to_dict`).
        ("backend/src/application/analyses/v126_katalog.py", 453),
    }
)


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


def main() -> int:
    print("=" * 70)
    print("GUARD: ui_math_guard (karta V12.7 — matematyka wylacznie KaTeX)")
    print("=" * 70)

    if not FRONTEND_UI2.is_dir():
        print(f"BLAD: katalog nie istnieje: {FRONTEND_UI2}")
        return 1
    for plik in BACKEND_PLIKI:
        if not plik.is_file():
            print(f"BLAD: plik nie istnieje: {plik}")
            return 1

    wszystkie: list[tuple[str, int, str, str]] = []
    wyjatki_trafione: list[tuple[str, int, str, str]] = []

    for plik in sorted(FRONTEND_UI2.rglob("*.ts")) + sorted(FRONTEND_UI2.rglob("*.tsx")):
        wzgledna = plik.relative_to(ROOT).as_posix()
        if any(wzorzec in wzgledna for wzorzec in WYLACZONE_WZORCE):
            continue
        for numer, linia, powod in skanuj_ts(plik):
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
    sys.exit(main())

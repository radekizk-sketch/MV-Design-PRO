#!/usr/bin/env python3
"""
CI Guard: forbidden_ui_terms_guard.py

Scans frontend source for forbidden English technical terms that must be
replaced with Polish equivalents in UI-visible strings.

Rules:
- "materializacja" allowed (it's Polish)
- "binding" → "powiązanie z katalogiem"
- "namespace" → "kategoria katalogu"
- "drift" → "rozbieżność katalogu"
- "readiness" → "gotowość obliczeń"
- "fix actions" → "szybkie naprawy"
- "blocker" → use severity indicators, not the word

EXIT 0 = pass, EXIT 1 = fail
"""

import os
import re
import sys

# Forbidden terms in UI-visible strings (JSX text, aria-label, title, placeholder, etc.)
# These are checked in .tsx and .ts files for string literals
FORBIDDEN_TERMS_IN_UI: dict[str, str] = {
    r"\bnamespace\b": "namespace (użyj 'kategoria katalogu')",
    r"\bdrift\b": "drift (użyj 'rozbieżność katalogu')",
    r"\bfix\s+actions?\b": "fix action(s) (użyj 'szybkie naprawy')",
    # Karta TODO-UI2 (2026-09-16), klasa "stany zastępcze w ui2" — CLAUDE.md
    # ZASADA NR 1 (zakaz "funkcja w przygotowaniu"/TODO/zaślepek) egzekwowana
    # na literałach UI-widocznych (a nie tylko na komentarzach, patrz
    # repo_hygiene_guard.check_todo_fixme dla komentarzy/kodu).
    r"\bwkrótce\b": "'wkrótce' jako stan ekranu (funkcja w przygotowaniu — ZASADA NR 1)",
    r"w przygotowaniu": "'w przygotowaniu' (funkcja w przygotowaniu — ZASADA NR 1)",
    r"niedostępne w tej karcie": "'niedostępne w tej karcie' (odroczenie do karty — ZASADA NR 3)",
    r"\bTODO\b": "TODO w literale UI-widocznym (dług widoczny użytkownikowi)",
    r"\bTODO-KARTA\b": "TODO-KARTA w literale UI-widocznym (odroczenie do karty — ZASADA NR 3)",
    r"patrz kart[aę]": "'patrz karta/kartę' w literale UI-widocznym (odesłanie do karty — ZASADA NR 3)",
}

STRING_LITERAL_RE = re.compile(
    r"""(?P<quote>['"])(?P<value>(?:\\.|(?! (?P=quote)).)*)(?P=quote)""",
    re.VERBOSE,
)

# Karta TODO-UI2 (2026-09-16) §0.4(ii): tekst renderowany JAKO DZIECKO JSX
# (`<span>English (EN) - w przygotowaniu</span>`) jest RÓWNIE widoczny
# użytkownikowi jak literał w cudzysłowie, ale `STRING_LITERAL_RE` (wyżej) go
# nie widzi — dopasowuje wyłącznie treść W cudzysłowach. Przypadek realny
# repo: `ui/settings/SettingsPanel.tsx` niósł `w przygotowaniu` jako SUROWY
# tekst opcji `<option>`, nie literał — bez tego wzorca guard milczałby na
# CAŁEJ klasie „tekst wpisany wprost do JSX". Dopasowanie: treść między `>`
# a `<` na jednej linii, bez `{`/`}` (wyklucza wyrażenia/interpolację JS).
JSX_TEXT_RE = re.compile(r">(?P<value>[^<>{}\n]+)<")

# Exempted file patterns (test files, type definitions, internal code)
EXEMPT_PATTERNS: list[str] = [
    "__tests__",
    ".test.",
    ".spec.",
    "test/",
    "types.ts",
    "types/",
    "contracts/",
    ".d.ts",
    "node_modules",
    "dist/",
    "build/",
    # Plik będący DEFINICJĄ kanonu zakazanych słów etykiet PL (literały-wzorce
    # 'TODO', 'w przygotowaniu', ... którymi TEN plik sam skanuje UI) — dopasowanie
    # do własnej definicji kanonu jest tautologicznym fałszywym trafieniem, nie
    # instancją naruszenia (ta sama zasada co wyjątek w repo_hygiene_guard.py).
    os.path.join("ui", "canon", "labelGuards.ts"),
]

# Directories to scan (ui2 = docelowa powierzchnia Programu UI/UX — N-D9)
SCAN_DIRS: list[str] = [
    os.path.join("frontend", "src", "ui"),
    os.path.join("frontend", "src", "ui2"),
    os.path.join("frontend", "src", "designer"),
]


def is_exempt(filepath: str) -> bool:
    """Check if file is exempt from scanning."""
    for pattern in EXEMPT_PATTERNS:
        if pattern in filepath:
            return True
    return False


def scan_file(filepath: str) -> list[tuple[int, str, str]]:
    """Scan a single file for forbidden terms. Returns [(line_no, line, reason)]."""
    violations: list[tuple[int, str, str]] = []

    try:
        with open(filepath, encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except OSError:
        return violations

    for line_no, line in enumerate(lines, start=1):
        # Skip comments and imports
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("import "):
            continue
        if stripped.startswith("*") or stripped.startswith("/*"):
            continue

        for literal in STRING_LITERAL_RE.finditer(line):
            value = literal.group("value")
            for pattern, reason in FORBIDDEN_TERMS_IN_UI.items():
                if re.search(pattern, value, re.IGNORECASE):
                    violations.append((line_no, stripped[:120], reason))

        for tekst in JSX_TEXT_RE.finditer(line):
            value = tekst.group("value")
            if not value.strip():
                continue
            for pattern, reason in FORBIDDEN_TERMS_IN_UI.items():
                if re.search(pattern, value, re.IGNORECASE):
                    violations.append((line_no, stripped[:120], reason))

    return violations


# ---------------------------------------------------------------------------
# Reguła komunikatu zapytania (karta komunikatów, commit 4, 2026-10-30).
# Komunikat o nieudanym zapytaniu do serwera składa JEDNO miejsce:
# `frontend/src/ui2/shared/bladZapytania.ts` (`bladZapytania`, `komunikatZapytania`).
# Lokalne kopie dawały projektantowi surowy adres zapytania („Request ${url} failed”,
# „Zapytanie ${url} nie powiodło się”), angielski `statusText` serwera albo goły „HTTP 404”.
# Reguła działa na CAŁEJ treści pliku (szablon może mieć wiele linii), po usunięciu komentarzy,
# na wszystkich plikach `frontend/src` poza testami i samym plikiem źródła prawdy.
# ---------------------------------------------------------------------------

PLIK_KOMUNIKATU_ZAPYTANIA = os.path.join("frontend", "src", "ui2", "shared", "bladZapytania.ts")
SKAN_KOMUNIKATU_ZAPYTANIA = os.path.join("frontend", "src")
_WYJATKI_TESTOW = ("__tests__", ".test.", ".spec.", os.path.join("src", "test") + os.sep)

_KOMENTARZ_BLOKOWY_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_KOMENTARZ_LINIOWY_RE = re.compile(r"^[ \t]*//.*$", re.MULTILINE)
_SZABLON_RE = re.compile(r"`(?:[^`\\]|\\.)*`", re.DOTALL)
_ARGUMENT_ERROR_RE = re.compile(
    r"new\s+Error\(\s*(?P<lit>`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\")",
    re.DOTALL,
)
_STATUS_TEXT_RE = re.compile(r"\.statusText\b|\$\{[^}`]*\bstatusText\b")
_SUROWY_ADRES_RE = re.compile(r"\$\{\s*(?:url|adres|path|sciezka|endpoint)\s*\}")
_SLOWA_BLEDU_RE = re.compile(
    r"nie powiod|niedostępn|nie udał|nie udal|błąd|blad|failed|request|HTTP|\$\{[^}]*\bstatus\b",
    re.IGNORECASE,
)
# Kod statusu odpowiedzi HTTP wklejany lokalnie do zdania (`(HTTP ${odpowiedz.status})`,
# `: ${res.status}`) — opis i kod statusu składa wyłącznie `komunikatZapytania`.
_STATUS_ODPOWIEDZI_RE = re.compile(
    r"\$\{\s*(?:response|res|resp|odpowiedz|odp|r|[a-z]+Odp)\.status\s*\}"
)
# Ścieżka zapytania wpisana literalnie w komunikat błędu (`POST /api/projects → 500`).
_SCIEZKA_API_RE = re.compile(r"/api/")
_ANGIELSKI_TRANSPORT_RE = re.compile(r"\b(?:request|failed|failure)\b", re.IGNORECASE)
_INTERPOLACJA_RE = re.compile(r"\$\{[^}]*\}")
# Szablon, którego JEDYNĄ treścią stałą jest „HTTP”/„API” (z „Błąd” i dwukropkiem lub bez):
# `HTTP ${s}`, `Błąd HTTP: ${s}`, `Błąd API ${s}` — kod zamiast zdania dla projektanta.
_GOLY_KOD_HTTP_RE = re.compile(r"^\s*(?:Błąd\s+)?(?:HTTP|API)\s*:?\s*$", re.IGNORECASE)


def _bez_komentarzy(tresc: str) -> str:
    """Komentarze zastąpione spacjami/nowymi liniami — numery linii zostają."""

    def _zastap(m: re.Match[str]) -> str:
        return "".join("\n" if z == "\n" else " " for z in m.group(0))

    return _KOMENTARZ_LINIOWY_RE.sub(_zastap, _KOMENTARZ_BLOKOWY_RE.sub(_zastap, tresc))


def scan_komunikat_zapytania(filepath: str) -> list[tuple[int, str, str]]:
    """Naruszenia reguły komunikatu zapytania w jednym pliku: [(linia, fragment, powód)]."""
    try:
        with open(filepath, encoding="utf-8", errors="ignore") as f:
            tresc = _bez_komentarzy(f.read())
    except OSError:
        return []
    naruszenia: list[tuple[int, str, str]] = []

    def _dodaj(start: int, fragment: str, powod: str) -> None:
        linia = tresc.count("\n", 0, start) + 1
        naruszenia.append((linia, " ".join(fragment.split())[:120], powod))

    # `statusText` to angielska fraza serwera (pod HTTP/2 pusta): w kodzie produktu służy
    # wyłącznie do składania komunikatu — w szablonie, w `detail || response.statusText`,
    # w `catch(() => response.statusText)` i w polach klas błędów. Każdy odczyt pola
    # (`.statusText`) i każda interpolacja w szablonie są naruszeniem; status opisuje
    # `opisStatusuHttp`. Zmienna lokalna o tej nazwie (np. opis stanu ekranu) nie jest.
    for m in _STATUS_TEXT_RE.finditer(tresc):
        koniec_linii = tresc.find("\n", m.start())
        poczatek_linii = tresc.rfind("\n", 0, m.start()) + 1
        _dodaj(
            m.start(),
            tresc[poczatek_linii : koniec_linii if koniec_linii >= 0 else len(tresc)],
            "angielski statusText serwera w komunikacie — użyj komunikatZapytania "
            "(ui2/shared/bladZapytania.ts)",
        )
    for m in _SZABLON_RE.finditer(tresc):
        szablon = m.group(0)
        if _SUROWY_ADRES_RE.search(szablon) and _SLOWA_BLEDU_RE.search(szablon):
            _dodaj(
                m.start(),
                szablon,
                "surowy adres zapytania w komunikacie błędu — użyj bladZapytania "
                "(adres zostaje w polu diagnostycznym)",
            )
        if _INTERPOLACJA_RE.search(szablon) and _GOLY_KOD_HTTP_RE.match(
            _INTERPOLACJA_RE.sub("", szablon[1:-1])
        ):
            _dodaj(
                m.start(),
                szablon,
                "goły kod HTTP zamiast zdania dla projektanta — użyj komunikatZapytania",
            )
    for m in _SZABLON_RE.finditer(tresc):
        if _STATUS_ODPOWIEDZI_RE.search(m.group(0)):
            _dodaj(
                m.start(),
                m.group(0),
                "kod statusu HTTP wklejony lokalnie do zdania — użyj komunikatZapytania",
            )
    for m in _ARGUMENT_ERROR_RE.finditer(tresc):
        if _SCIEZKA_API_RE.search(m.group("lit")):
            _dodaj(
                m.start(),
                m.group("lit"),
                "ścieżka zapytania w komunikacie błędu — użyj bladZapytania",
            )
        if _ANGIELSKI_TRANSPORT_RE.search(m.group("lit")):
            _dodaj(
                m.start(),
                m.group("lit"),
                "angielski komunikat nieudanego zapytania — użyj bladZapytania",
            )
    return naruszenia


def naruszenia_komunikatu_zapytania(root: str) -> list[tuple[str, int, str, str]]:
    """Reguła komunikatu zapytania na całym `frontend/src` (poza testami i źródłem prawdy)."""
    wynik: list[tuple[str, int, str, str]] = []
    katalog = os.path.join(root, SKAN_KOMUNIKATU_ZAPYTANIA)
    for dirpath, dirs, filenames in os.walk(katalog):
        dirs.sort()
        for filename in sorted(filenames):
            if not filename.endswith((".tsx", ".ts")) or filename.endswith(".d.ts"):
                continue
            filepath = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(filepath, root)
            if rel_path == PLIK_KOMUNIKATU_ZAPYTANIA:
                continue
            if any(w in rel_path for w in _WYJATKI_TESTOW):
                continue
            for line_no, line, reason in scan_komunikat_zapytania(filepath):
                wynik.append((rel_path, line_no, line, reason))
    return wynik


def main() -> int:
    print("=" * 60)
    print("GUARD: forbidden_ui_terms_guard")
    print("=" * 60)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    all_violations: list[tuple[str, int, str, str]] = []

    for scan_dir in SCAN_DIRS:
        full_dir = os.path.join(root, scan_dir)
        if not os.path.isdir(full_dir):
            print(f"  SKIP: Directory not found: {scan_dir}")
            continue

        for dirpath, _dirs, filenames in os.walk(full_dir):
            for filename in sorted(filenames):
                if not filename.endswith((".tsx", ".ts")):
                    continue

                filepath = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(filepath, root)

                if is_exempt(rel_path):
                    continue

                violations = scan_file(filepath)
                for line_no, line, reason in violations:
                    all_violations.append((rel_path, line_no, line, reason))

    all_violations.extend(naruszenia_komunikatu_zapytania(root))

    # Report
    if all_violations:
        print(f"\nFOUND {len(all_violations)} forbidden UI term(s):\n")
        for filepath, line_no, line, reason in all_violations:
            print(f"  {filepath}:{line_no}")
            print(f"    {line}")
            print(f"    -> {reason}\n")
        print(f"{'=' * 60}")
        print(f"FAILED: {len(all_violations)} violation(s)")
        return 1

    print("\nPASSED: No forbidden UI terms found")
    return 0


if __name__ == "__main__":
    sys.exit(main())

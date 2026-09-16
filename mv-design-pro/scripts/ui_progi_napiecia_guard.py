#!/usr/bin/env python3
"""
UI Progi Napieciowe Guard — karta W3-J (jedno zrodlo kryteriow napieciowych,
2026-09-16).

Blokuje literaly progow napieciowych PN-EN 50160/kryterium ostrzezenia
(0.95 / 1.05 / 0.9 / 1.1, wraz z ich forma "0.90"/"1.10" i przecinkowa PL
"0,95"/"1,05"/"0,9"/"1,1"/"0,90"/"1,10") w warstwie prezentacji
(`frontend/src/ui/**`, `frontend/src/ui2/**"), zaszyte NIEZALEZNIE od jednego
zrodla prawdy `analysis.normative.kryteria_napiecia` (backend). Odzielny plik
od `ui_no_physics_guard.py` (karta W3-J §0.5, opcja "albo osobny
ui_progi_napiecia_guard.py"): ten strażnik ma WLASNA, WASKA klase defektu
(cztery konkretne liczby progu napieciowego) — dopisanie go do istniejacego
strażnika wymagaloby przeliczenia jego OSOBNEGO, precyzyjnie udokumentowanego
pomiaru (docstring cytuje dokladna liczbe trafien), co byloby niepotrzebnym
ryzykiem dla niezwiazanej klasy defektu.

PO CO TA BRAMKA. Inwentarz karty W3-J wykryl próg 0,95/1,05 (i pochodne
0,90/1,10) zaszyty NIEZALEZNIE w >=6 miejscach backendu i frontendu, z czego
JEDNO mialo BLEDNA podstawe normatywna ("EN 50160 / IRiESD ±5%" — PN-EN 50160
w rzeczywistosci dopuszcza ±10 %). Migracja skonwergowala zrodlo w backendzie
(`analysis/normative/kryteria_napiecia.py`) i przekazuje kryteria do UI
ADDYTYWNIE w odpowiedzi API (`kryteria_napiecia`) — od tej pory UI NIE MOZE
mieć wlasnej kopii tych liczb, tylko czytac je z odpowiedzi.

CO WYKRYWA: literal `0.95`/`0,95`, `1.05`/`1,05`, `0.9`/`0,9` (lub
`0.90`/`0,90`), `1.1`/`1,1` (lub `1.10`/`1,10`) — z lewa i prawa granica
slowa (`\\b`), zeby NIE lapac fragmentu wiekszej liczby (np. "21.1" numer
paragrafu, "10.95" inna wartosc) — na linii, ktora RÓWNIEŻ zawiera token
kontekstu napieciowego p.u. (`pu`/`Pu`/`PU` jako koniec identyfikatora, np.
`v_pu`/`ostrzezenie_min_pu`/`voltagePu`/`uPu`, LUB prefiks `napi`
np. `napiecie`/`napięcie`/`Napięcie`).

CO NIE JEST DETEKOWANE (celowo, unikanie false positive): komentarze
(jednoliniowe `//`, blokowe `/* */`/`*`), importy, deklaracje typow/interfejsow,
specyfikator modulu re-eksportu — te SAME wzorce pomijania co
`ui_no_physics_guard.py` (ten sam kontrakt "linia bez efektu w czasie
wykonania nie jest defektem tej klasy").

ALLOWLIST (per plik+linia, uzasadniona): wpis dopuszczony WYLACZNIE gdy liczba
NIE jest kryterium oceny wyniku sieci — parametr sterowania DER (krzywa
Q(U)/cosφ(P)/FRT, nastawa regulacji zrodla), wspolczynnik napieciowy `c`
IEC 60909 (c_max/c_min), albo nastawa/zalecany zakres przekaznika
anti-islanding (sanity danych WEJSCIOWYCH urzadzenia, nie ocena wyniku
solvera). Literal bedacy realnym kryterium oceny wyniku sieci (np. druga,
niezalezna kopia progu ostrzezenia/przekroczenia) MUSI byc naprawiony
(przeczytany z odpowiedzi backendu), NIGDY allowlistowany.

EXIT CODES:
  0 = clean (no violations)
  1 = violation found
  2 = scan directory not found (skip)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [
    REPO_ROOT / "frontend" / "src" / "ui",
    REPO_ROOT / "frontend" / "src" / "ui2",
]

# Explicit allowlist (measured 2026-09-16, karta W3-J). Keyed by
# (repo-relative path, 1-based line number) — nie caly plik, zeby nowe
# trafienie w INNEJ linii allowlistowanego pliku nadal bylo zlapane.
ALLOWLIST: dict[tuple[str, int], str] = {
    (
        "frontend/src/ui/network-build/forms/profiles/CosPhiOfPProfileForm.tsx",
        23,
    ): "domyslny punkt krzywej cosφ(P) falownika (parametr sterowania DER), nie kryterium oceny wyniku sieci",
    (
        "frontend/src/ui/network-build/station-der/frtEnvelopeValidator.ts",
        57,
    ): "punkt krzywej obwiedni FRT (parametr sterowania/katalogowy DER), nie kryterium oceny wyniku sieci",
    (
        "frontend/src/ui/network-build/station-der/frtEnvelopeValidator.ts",
        64,
    ): "jw. — drugi punkt krzywej obwiedni FRT",
    (
        "frontend/src/ui/network-build/station-der/antiIslandingValidator.ts",
        64,
    ): "domyslna nastawa przekaznika anti-islanding (parametr sterowania DER), nie kryterium oceny wyniku sieci",
    (
        "frontend/src/ui/network-build/station-der/antiIslandingValidator.ts",
        91,
    ): "sanity zalecanego zakresu nastawy przekaznika anti-islanding (wejscie urzadzenia), nie ocena wyniku solvera",
    (
        "frontend/src/ui/network-build/station-der/antiIslandingValidator.ts",
        93,
    ): "tekst komunikatu o jw. zalecanym zakresie nastawy",
    (
        "frontend/src/ui/network-build/station-der/antiIslandingValidator.ts",
        99,
    ): "sanity zalecanego zakresu nastawy przekaznika anti-islanding (jw., prog gorny)",
    (
        "frontend/src/ui/network-build/station-der/antiIslandingValidator.ts",
        101,
    ): "tekst komunikatu o jw. zalecanym zakresie nastawy (prog gorny)",
    (
        "frontend/src/ui/network-build/forms/inverterModeHelper.ts",
        78,
    ): "walidacja ksztaltu krzywej sterowania Q(U) falownika (parametr DER), nie kryterium oceny wyniku sieci",
    (
        "frontend/src/ui/network-build/forms/inverterModeHelper.ts",
        79,
    ): "tekst komunikatu o jw. wymaganym ksztalcie krzywej Q(U)",
    (
        "frontend/src/ui/network-build/forms/inverterModeHelper.ts",
        81,
    ): "jw. — koniec krzywej Q(U)",
    (
        "frontend/src/ui/network-build/forms/inverterModeHelper.ts",
        82,
    ): "tekst komunikatu o jw. (koniec krzywej Q(U))",
    (
        "frontend/src/ui/network-build/forms/profiles/QofUProfileForm.tsx",
        32,
    ): "domyslny punkt krzywej sterowania Q(U) falownika (parametr DER), nie kryterium oceny wyniku sieci",
    (
        "frontend/src/ui/network-build/forms/profiles/QofUProfileForm.tsx",
        34,
    ): "jw. — drugi domyslny punkt krzywej Q(U)",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts",
        309,
    ): "walidacja pasma nastawy regulacji napiecia zrodla OZE (parametr sterowania DER), nie kryterium wyniku sieci",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts",
        310,
    ): "tekst komunikatu o jw. paśmie nastawy",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts",
        447,
    ): "domyslna wartosc cosφ — typowe wymaganie NC RfG dla modulow typu B/C (parametr sterowania DER)",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts",
        449,
    ): "domyslna dolna granica pasma nieczulosci Q(U) zrodla OZE (parametr sterowania DER)",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts",
        450,
    ): "domyslna gorna granica pasma nieczulosci Q(U) zrodla OZE (parametr sterowania DER)",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/strings.ts",
        104,
    ): "opis pasma nieczulosci Q(U) NC RfG (parametr sterowania DER) w formularzu zrodla OZE",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/strings.ts",
        111,
    ): "jw. — opis dopuszczalnego pasma nastawy regulacji napiecia",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/strings.ts",
        527,  # 528 -> 527 po S-1/S-4 (kasacja etykiety no_module wyzej w pliku; odbior 2026-09-16)
    ): "jw. — opis pasma statyzmu regulacji napiecia zrodla OZE",
    (
        "frontend/src/ui2/kreatory/zrodlo-oze/strings.ts",
        557,  # 558 -> 557, jw.
    ): "jw. — opis pasma nastawy w trybach regulacji mocy biernej",
    (
        "frontend/src/ui2/kreatory/kompensator/strings.ts",
        90,
    ): "przykladowa wartosc w tekscie edukacyjnym o zaleznosci Q kompensatora od napiecia (nie prog klasyfikacji)",
    (
        "frontend/src/ui2/kreatory/kompensator/strings.ts",
        91,
    ): "jw. — kontynuacja przykladu edukacyjnego",
}

# Liczby progu (karta W3-J §0.5): 0.95, 1.05, 0.9(0), 1.1(0) — kropka LUB
# przecinek, z granica slowa po obu stronach (nie lapie fragmentu wiekszej
# liczby, np. "21.1" numeru paragrafu).
_PROG_LICZBY = r"\b(?:0[.,]95|1[.,]05|0[.,]90?|1[.,]10?)\b"

# Kontekst napieciowy p.u. w tej samej linii: koniec identyfikatora "pu"/"Pu"/
# "PU" (v_pu, ostrzezenie_min_pu, voltagePu, uPu) LUB prefiks "napi"
# (napiecie/napięcie, niezaleznie od wielkosci liter).
_KONTEKST_NAPIECIOWY = r"(?:pu\b|Pu\b|PU\b|napi)"

PROG_NAPIECIOWY_PATTERN = re.compile(
    rf"(?=.*{_PROG_LICZBY})(?=.*{_KONTEKST_NAPIECIOWY})",
    re.IGNORECASE,
)
# Wersja case-sensitive samego kontekstu, bo IGNORECASE powyzej dotyczylby
# rowniez _PROG_LICZBY (nieszkodliwe — cyfry/kropka/przecinek nie maja
# wielkosci liter) — zostawione jawnie w jednym re.compile dla prostoty.

# Linie bez efektu w czasie wykonania — te same wzorce co
# `ui_no_physics_guard.py` (komentarze, importy, deklaracje typow).
SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*//"),
    re.compile(r"^\s*\*"),
    re.compile(r"^\s*/\*"),
    re.compile(r"^\s*import\s"),
    re.compile(r"^\s*export\s+type"),
    re.compile(r"^\s*export\s+interface"),
    re.compile(r"^\s*\*\s*@"),
    re.compile(r"^\s*\*\s*-"),
    re.compile(r"^\s*\}?\s*from\s+['\"]"),
    re.compile(r"^\s*export\s+(?:\*|\{[^}]*\}|type\s+\{[^}]*\})\s+from\s+['\"]"),
    re.compile(r"^\s*\{\s*/\*.*\*/\s*\}\s*$"),
]

SCAN_EXTENSIONS = {".ts", ".tsx"}

EXCLUDE_PATTERNS = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
]


def _should_skip_line(line: str) -> bool:
    return any(pattern.search(line) for pattern in SKIP_LINE_PATTERNS)


def _should_exclude_file(path: Path) -> bool:
    path_str = str(path).replace("\\", "/")
    return any(pattern.search(path_str) for pattern in EXCLUDE_PATTERNS)


def _relative_path_str(path: Path) -> str | None:
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return None


def _is_allowlisted(path: Path, line_no: int) -> bool:
    rel = _relative_path_str(path)
    if rel is None:
        return False
    return (rel, line_no) in ALLOWLIST


def scan_file(path: Path) -> list[tuple[int, str]]:
    """Scan one file. Returns (line_number, line_content) for raw hits."""
    hits: list[tuple[int, str]] = []
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return hits
    for line_no, line in enumerate(content.splitlines(), start=1):
        if _should_skip_line(line):
            continue
        if PROG_NAPIECIOWY_PATTERN.search(line):
            hits.append((line_no, line.strip()))
    return hits


def scan_tree_raw(scan_dirs: list[Path]) -> list[tuple[Path, int, str]]:
    """Wszystkie trafienia PRZED filtrem ALLOWLIST — zasila rowniez zapadke
    swiezosci (ten sam wzorzec co `ui_no_physics_guard.py::scan_tree_raw`)."""
    all_hits: list[tuple[Path, int, str]] = []
    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for path in sorted(scan_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix not in SCAN_EXTENSIONS:
                continue
            if _should_exclude_file(path):
                continue
            for line_no, line_content in scan_file(path):
                all_hits.append((path, line_no, line_content))
    return all_hits


def scan_tree(scan_dirs: list[Path]) -> list[tuple[Path, int, str]]:
    return [
        (path, line_no, line_content)
        for path, line_no, line_content in scan_tree_raw(scan_dirs)
        if not _is_allowlisted(path, line_no)
    ]


def check_allowlist_freshness(raw_hits: list[tuple[Path, int, str]]) -> list[str]:
    """Zapadka swiezosci ALLOWLIST — kazdy wpis musi nadal odpowiadac
    REALNEMU dzisiejszemu trafieniu (ten sam kontrakt co
    `ui_no_physics_guard.py::check_allowlist_freshness`)."""
    covered: set[tuple[str, int]] = set()
    for path, line_no, _content in raw_hits:
        if _is_allowlisted(path, line_no):
            rel = _relative_path_str(path)
            if rel is not None:
                covered.add((rel, line_no))

    violations: list[str] = []
    for (rel_path, line_no), reason in sorted(ALLOWLIST.items()):
        if (rel_path, line_no) in covered:
            continue
        violations.append(
            f"[ui-progi-napiecia-wpis-osierocony] ALLOWLIST[({rel_path!r}, {line_no})] "
            "nie odpowiada juz zadnemu trafieniu wzorca progu napieciowego w dzisiejszym "
            f"drzewie — usun ten wpis (uzasadnienie bylo: {reason})"
        )
    return violations


def main() -> int:
    if not any(d.exists() for d in SCAN_DIRS):
        print(
            "ui-progi-napiecia-guard: no scan directory found: "
            + ", ".join(str(d) for d in SCAN_DIRS),
            file=sys.stderr,
        )
        return 2

    raw_hits = scan_tree_raw(SCAN_DIRS)
    all_violations = [
        (path, line_no, line_content)
        for path, line_no, line_content in raw_hits
        if not _is_allowlisted(path, line_no)
    ]
    freshness_violations = check_allowlist_freshness(raw_hits)

    if all_violations:
        print("UI-PROGI-NAPIECIA-GUARD VIOLATIONS (ui/**, ui2/**):", file=sys.stderr)
        for path, line_no, line_content in all_violations:
            rel_path = path.relative_to(REPO_ROOT)
            print(f"  {rel_path}:{line_no}: {line_content}", file=sys.stderr)
        print(
            f"\n{len(all_violations)} violation(s) found. Progi napieciowe (0.95/1.05/0.9/1.1) "
            "MUSZA pochodzic z odpowiedzi backendu (`kryteria_napiecia`, karta W3-J), nie byc "
            "zaszyte w UI. Jesli to genuinie parametr sterowania DER/cosφ/c_factor (nie "
            "kryterium oceny wyniku sieci), dodaj uzasadniony wpis ALLOWLIST.",
            file=sys.stderr,
        )

    if freshness_violations:
        print("UI-PROGI-NAPIECIA-GUARD ALLOWLIST FRESHNESS VIOLATIONS:", file=sys.stderr)
        for violation in freshness_violations:
            print(f"  {violation}", file=sys.stderr)

    if all_violations or freshness_violations:
        return 1

    print("ui-progi-napiecia-guard: PASS (0 violations in ui/**, ui2/**)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

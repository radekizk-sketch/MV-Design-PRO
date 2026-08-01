#!/usr/bin/env python3
"""
Guard: utf8_mojibake_guard.py

Scans active source and docs for common mojibake fragments that usually appear
when UTF-8 Polish text is decoded with the wrong code page.

Dwie klasy uszkodzen (obie realnie wystapily w repo):
1. FRAGMENTY MOJIBAKE \u2014 polska litera zapisana jako para/trojka bajtow innej
   strony kodowej ("\u00c4\u2026", "\u0139\u013a", "\u00c3\u00b3"): wykrywane wzorcem tekstowym,
2. ZNAK ZASTEPCZY '?' W SLOWIE \u2014 polska litera zamieniona na ASCII '?'
   (zapis z nawiasami, zeby ten opis sam nie zapalal reguly: "Dost[?]pne",
   "napi[?]cia", "Brak wynik[?]w"): konwersja STRATNA, wiec nie ma juz sladu
   mojibake do dopasowania. Klasa dodana po V12K-283, gdzie 23 takie miejsca
   siedzialy w komunikatach operacji domenowych, a guard ich nie widzial.
"""

from __future__ import annotations

import re
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

EXEMPT_PATTERNS = [
    "__tests__",
    ".test.",
    ".spec.",
    "node_modules",
    "dist",
    "build",
    # DLUG ZAMKNIETY (karta KD-3, poz. 12b). Byly tu dwa zapisy odpowiedzi API z
    # audytu, uszkodzone w OBU klasach naraz. Wykluczenie ich ze skanu bylo
    # maskowaniem dlugu (Zero-Debt pkt 1), a reczna "naprawa" znakow falszowalaby
    # zapis audytu. Zrzuty zostaly WYKONANE OD NOWA poprawnym narzedziem
    # (`backend/scripts/zrzut_api_audytu.py`, jawne UTF-8) i sa czyste, wiec
    # wykluczenie zniknelo \u2014 od teraz pilnuje ich ten sam guard co reszte repo.
]

SCAN_DIRS = [
    Path("frontend") / "src",
    Path("backend") / "src",
    Path("docs"),
    Path("scripts"),
]

SCAN_FILES = [
    Path("AGENTS.md"),
    Path("ARCHITECTURE.md"),
    Path("SYSTEM_SPEC.md"),
    Path("PLANS.md"),
]


def is_exempt(path: Path) -> bool:
    normalized = str(path).replace("\\", "/")
    return any(pattern in normalized for pattern in EXEMPT_PATTERNS)


def iter_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.is_file()]


def should_scan(path: Path) -> bool:
    return path.suffix.lower() in {
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".py",
        ".md",
        ".json",
        ".css",
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    root = Path(__file__).resolve().parents[1]
    candidates = [path for scan_dir in SCAN_DIRS for path in iter_files(root / scan_dir)]
    candidates.extend(root / path for path in SCAN_FILES if (root / path).exists())

    violations: list[tuple[str, int, str, str]] = []

    for path in candidates:
        if is_exempt(path) or not should_scan(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            for fragment, reason in SUSPICIOUS_FRAGMENTS.items():
                if fragment in line:
                    violations.append((str(path.relative_to(root)), line_no, line.strip(), reason))
            linia_bez_adresow = _PARAMETR_ZAPYTANIA.sub(" ", line)
            trafienie = ZNAK_ZASTEPCZY_W_SLOWIE.search(linia_bez_adresow)
            if trafienie:
                violations.append(
                    (
                        str(path.relative_to(root)),
                        line_no,
                        line.strip(),
                        f"polska litera zamieniona na znak zapytania ({trafienie.group(0)!r})",
                    )
                )

    print("=" * 60)
    print("GUARD: utf8_mojibake_guard")
    print("=" * 60)

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

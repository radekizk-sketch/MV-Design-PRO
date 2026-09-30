#!/usr/bin/env python3
"""Guard wskrzeszenia (karta W5-B): dawne słowniki pól nie wracają do kodu ani do danych.

PO CO. Do karty W5-B pola rozdzielnicy żyły w trzech nietypowanych słownikach migawki
(`Substation.meta.field_specs`, `Substation.meta.nn_field_specs`,
`BranchPointSN.materialized_params.switchgear_field_specs`) obok typowanej kolekcji `bays`.
Karta skasowała je bez trybu zgodności: jedynym nośnikiem pól jest `bays` (`enm.models.Bay`),
jedynym czytelnikiem dawnych kluczy — migracja przy wczytaniu
(`backend/src/enm/migrations/field_specs_promocja.py`). Zapowiedź tego guarda:
`docs/architecture/CONVERGENCE_ROADMAP.md` (CV-5) i `CANONICAL_TWIN_ARCHITECTURE.md` §6
(„po cutover odczyt `meta.field_specs` = naruszenie guardu, nie «kompatybilność»").

CO WYKRYWA:
  * KOD — każde wystąpienie napisów `field_specs`, `nn_field_specs`, `switchgear_field_specs`
    (także w komentarzach i docstringach: komentarz opisujący nieistniejący nośnik jest
    dokumentacją fikcji) oraz identyfikatorów TS `fieldSpecs`/`nnFieldSpecs`/
    `switchgearFieldSpecs` w `backend/src`, `backend/scripts`, `backend/tests`, `frontend/src`,
    `frontend/e2e`, `frontend/scripts`, `scripts` — poza ALLOWLISTĄ (migracja i jej test,
    ten guard i jego self-test);
  * DANE — każdy plik JSON pod `frontend/src`, `frontend/public`, `frontend/scripts`,
    `backend/tests`, `backend/schemas`, w którym którykolwiek obiekt niesie klucz
    `field_specs`/`nn_field_specs`/`switchgear_field_specs` (fikstury generuje się narzędziami
    repo z produktu, który tych kluczy już nie pisze — obecność klucza = fikstura sprzed
    karty albo ręcznie dopisana).

Allowlista jest ZAMKNIĘTA (zapadka tylko w dół): nowe miejsce = naruszenie, nie nowy wiersz.
Kod wyjścia: 0 = czysto, 1 = naruszenie, 2 = brak katalogów skanu.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

#: Katalogi kodu (relatywnie do `mv-design-pro/`).
KATALOGI_KODU: tuple[str, ...] = (
    "backend/src",
    "backend/scripts",
    "backend/tests",
    "frontend/src",
    "frontend/e2e",
    "frontend/scripts",
    "scripts",
)
#: Katalogi danych JSON.
KATALOGI_DANYCH: tuple[str, ...] = (
    "frontend/src",
    "frontend/public",
    "frontend/scripts",
    "backend/tests",
    "backend/schemas",
)
ROZSZERZENIA_KODU: frozenset[str] = frozenset(
    {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"}
)
POMIJANE_KATALOGI: frozenset[str] = frozenset(
    {
        "node_modules",
        "__pycache__",
        ".venv",
        "dist",
        "playwright-report",
        "test-results",
    }
)

#: JEDYNE miejsca, którym wolno znać dawne klucze (relatywnie do `mv-design-pro/`).
ALLOWLIST: frozenset[str] = frozenset(
    {
        "backend/src/enm/migrations/field_specs_promocja.py",
        "backend/tests/enm/migrations/test_field_specs_promocja.py",
        "scripts/meta_field_specs_resurrection_guard.py",
        "scripts/test_meta_field_specs_resurrection_guard.py",
    }
)

KLUCZE_DANYCH: frozenset[str] = frozenset(
    {"field_specs", "nn_field_specs", "switchgear_field_specs"}
)
WZORZEC_KODU = re.compile(
    r"\b(?:nn_|switchgear_)?field_specs\b|\b(?:nn|switchgear)?[fF]ieldSpecs\b"
)


def _pliki(
    root: Path, katalogi: tuple[str, ...], rozszerzenia: frozenset[str]
) -> list[Path]:
    wynik: list[Path] = []
    for rel in katalogi:
        katalog = root / rel
        if not katalog.is_dir():
            continue
        for plik in katalog.rglob("*"):
            if not plik.is_file() or plik.suffix not in rozszerzenia:
                continue
            if any(
                czesc in POMIJANE_KATALOGI for czesc in plik.relative_to(root).parts
            ):
                continue
            wynik.append(plik)
    return sorted(wynik)


def _klucze_json(obiekt: object) -> bool:
    if isinstance(obiekt, dict):
        if any(klucz in KLUCZE_DANYCH for klucz in obiekt):
            return True
        return any(_klucze_json(wartosc) for wartosc in obiekt.values())
    if isinstance(obiekt, list):
        return any(_klucze_json(element) for element in obiekt)
    return False


def sprawdz(root: Path) -> list[str]:
    """Naruszenia w drzewie `root` (kod i dane); pusta lista = czysto."""
    naruszenia: list[str] = []
    for plik in _pliki(root, KATALOGI_KODU, ROZSZERZENIA_KODU):
        rel = plik.relative_to(root).as_posix()
        if rel in ALLOWLIST:
            continue
        try:
            tresc = plik.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for numer, linia in enumerate(tresc.splitlines(), start=1):
            if WZORZEC_KODU.search(linia):
                naruszenia.append(f"KOD {rel}:{numer}: {linia.strip()[:120]}")
    for plik in _pliki(root, KATALOGI_DANYCH, frozenset({".json"})):
        rel = plik.relative_to(root).as_posix()
        if rel in ALLOWLIST:
            continue
        try:
            dane = json.loads(plik.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        if _klucze_json(dane):
            naruszenia.append(f"DANE {rel}: obiekt z kluczem dawnego nośnika pól")
    return naruszenia


def main() -> int:
    if not any((PROJECT_ROOT / rel).is_dir() for rel in KATALOGI_KODU):
        print(
            "meta_field_specs_resurrection_guard: brak katalogów skanu", file=sys.stderr
        )
        return 2
    naruszenia = sprawdz(PROJECT_ROOT)
    if naruszenia:
        print(
            "meta_field_specs_resurrection_guard: dawny nośnik pól (meta.field_specs / "
            "nn_field_specs / switchgear_field_specs) wrócił — jedynym nośnikiem jest `bays`:"
        )
        for wpis in naruszenia:
            print(f"  {wpis}")
        print(f"RAZEM: {len(naruszenia)}")
        return 1
    print("meta_field_specs_resurrection_guard: OK (0 wystąpień dawnego nośnika pól)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

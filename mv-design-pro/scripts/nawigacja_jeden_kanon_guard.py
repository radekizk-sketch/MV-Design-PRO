#!/usr/bin/env python3
"""NAWIGACJA — JEDEN KANON (decyzje D1 + D2 + D4).

PO CO. Audyt Phase A-D nazwal glowny dlug frontu klasa DUPLICATED: dwie
powloki, dwie palety komend, dwie nawigacje. Kasacja duplikatu bez zapadki jest
polowa roboty — nastepna karta odtworzy go w dobrej wierze, bo nic tego nie
zabrania. Ten guard pilnuje czterech regul, ktore razem znacza „nawigacja ma
JEDEN kanon: siedem przestrzeni ui2".

REGULA A — literaly tras hash zyja w JEDNYM pliku.
    `frontend/src/ui/navigation/routes.ts` jest jedynym miejscem, gdzie wolno
    napisac `'#sld'`, `'#analysis'`, `'#report'` itd. Kazdy inny modul odwoluje
    sie do `ROUTES.*` / `ALIAS_ROUTES.*`. Bez tego rozjezdzaja sie zbiory: most
    przestrzeni zna piec tras, orkiestrator siedem, a komponent gdzies z boku
    ma odnosnik do trasy, ktorej NIE MA w zadnym rejestrze (pomiar przed karta:
    `TimeCurrentChart` prowadzil do `#protection-library` — strona „Nieznana
    trasa"). Lista tras jest CZYTANA z `routes.ts`, nie wpisana tutaj — guard
    nie ma wlasnej, drugiej definicji kanonu.

REGULA B — zero drugiej nawigacji (rejestr obszarow + rownolegly stan).
    Rejestr `ui/navigation/areaRegistry` (dziewiec obszarow z etykietami,
    ikonami i skrotami Ctrl+1-9) oraz stan `activeArea`/`setActiveArea` nie
    moga wrocic. Panel kontekstu jest PROJEKCJA trasy (`ui2/legacy/mostObszarow`).

REGULA C — flaga powloki V3 nie istnieje.
    `USE_LAYOUT_V3` (D2) znika na amen — nazwa nie moze wystapic w kodzie
    frontu, skryptach ani workflowach CI.

REGULA D — dokladnie JEDNA definicja komponentu palety komend.
    Kanon: `frontend/src/ui2/search/CommandPalette.tsx` (D4).

Uruchomienie:
    python scripts/nawigacja_jeden_kanon_guard.py

Kod wyjscia: 0 = czysto, 1 = naruszenie.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

#: Jedyne miejsce z literalami tras hash (regula A).
PLIK_TRAS = FRONTEND_SRC / "ui" / "navigation" / "routes.ts"

#: Jedyny most trasa -> powloka; tylko on trzyma tabele przestrzeni/obszarow.
PLIK_MOSTU = FRONTEND_SRC / "ui2" / "legacy" / "mostObszarow.ts"

#: Kanoniczna paleta komend (regula D).
PLIK_PALETY = FRONTEND_SRC / "ui2" / "search" / "CommandPalette.tsx"

#: Skasowany rejestr drugiej nawigacji (regula B).
SCIEZKA_REJESTRU_OBSZAROW = FRONTEND_SRC / "ui" / "navigation" / "areaRegistry.ts"

ROZSZERZENIA = {".ts", ".tsx"}

#: Testy wolno pisac literalem trasy — spec MUSI umiec ustawic `location.hash`
#: na konkretny adres, inaczej badalby wlasna atrape zamiast produktu.
KATALOGI_POMIJANE = {"__tests__", "node_modules"}

#: ...a czesc specow lezy OBOK zrodla (`urlState.test.ts`), nie w `__tests__`.
PRZYROSTKI_TESTOW = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")

BLOK_KOMENTARZA = re.compile(r"/\*.*?\*/", re.DOTALL)
LINIA_KOMENTARZA = re.compile(r"//[^\n]*")

IMPORT_REJESTRU_OBSZAROW = re.compile(r"""['"][^'"]*navigation/areaRegistry['"]""")
STAN_OBSZARU = re.compile(r"\b(?:set)?[aA]ctiveArea\b")
FLAGA_V3 = re.compile(r"\bUSE_LAYOUT_V3\b|\bVITE_USE_LAYOUT_V3\b")
#: Guard i jego test — jedyne pliki, w ktorych zakazane nazwy sa dozwolone.
PLIKI_WLASNE_GUARDA = frozenset({Path(__file__).name, f"test_{Path(__file__).name}"})

DEFINICJA_PALETY = re.compile(
    r"^\s*(?:export\s+)?(?:function|const|class)\s+CommandPalette\b", re.MULTILINE
)


def bez_komentarzy(tekst: str) -> str:
    """Tresc pliku bez komentarzy — komentarz cytujacy trase to nie kod."""
    return LINIA_KOMENTARZA.sub("", BLOK_KOMENTARZA.sub("", tekst))


def pliki_frontu(*, z_testami: bool = False) -> list[Path]:
    wynik: list[Path] = []
    for sciezka in sorted(FRONTEND_SRC.rglob("*")):
        if sciezka.suffix not in ROZSZERZENIA or not sciezka.is_file():
            continue
        if not z_testami and (
            KATALOGI_POMIJANE & set(sciezka.parts)
            or sciezka.name.endswith(PRZYROSTKI_TESTOW)
        ):
            continue
        wynik.append(sciezka)
    return wynik


def trasy_kanoniczne() -> list[str]:
    """Adresy hash odczytane z `routes.ts` — guard nie ma drugiej listy."""
    if not PLIK_TRAS.is_file():
        return []
    tekst = PLIK_TRAS.read_text(encoding="utf-8")
    trasy = set(re.findall(r"hash:\s*'(#[a-z0-9-]+)'", tekst))
    poczatek = tekst.find("ALIAS_ROUTES")
    if poczatek >= 0:
        koniec = tekst.find("}", poczatek)
        trasy.update(re.findall(r"'(#[a-z0-9-]+)'", tekst[poczatek:koniec]))
    return sorted(trasy)


def regula_a_literaly_tras() -> list[str]:
    trasy = trasy_kanoniczne()
    if not trasy:
        return ["[trasy-brak-kanonu] nie odczytano zadnej trasy z routes.ts"]

    wzorzec = re.compile(
        r"""['"`](""" + "|".join(re.escape(t) for t in trasy) + r""")(?:[?'"`])"""
    )
    naruszenia: list[str] = []
    for sciezka in pliki_frontu():
        if sciezka == PLIK_TRAS:
            continue
        tresc = bez_komentarzy(sciezka.read_text(encoding="utf-8"))
        for numer, linia in enumerate(tresc.splitlines(), start=1):
            dopasowanie = wzorzec.search(linia)
            if dopasowanie is None:
                continue
            naruszenia.append(
                f"[trasa-literal] {sciezka.relative_to(REPO_ROOT)}:{numer} "
                f"literal trasy {dopasowanie.group(1)!r} poza routes.ts — "
                f"uzyj ROUTES.* / ALIAS_ROUTES.*"
            )
    return naruszenia


def regula_b_druga_nawigacja() -> list[str]:
    naruszenia: list[str] = []
    if SCIEZKA_REJESTRU_OBSZAROW.exists():
        naruszenia.append(
            f"[obszary-rejestr] {SCIEZKA_REJESTRU_OBSZAROW.relative_to(REPO_ROOT)} "
            f"istnieje — rejestr 9 obszarow to druga nawigacja (D1)"
        )
    if not PLIK_MOSTU.is_file():
        naruszenia.append(
            f"[obszary-most] brak {PLIK_MOSTU.relative_to(REPO_ROOT)} — "
            f"projekcja trasa -> przestrzen/obszar musi miec JEDNO miejsce"
        )
    for sciezka in pliki_frontu(z_testami=True):
        tresc = bez_komentarzy(sciezka.read_text(encoding="utf-8"))
        for numer, linia in enumerate(tresc.splitlines(), start=1):
            if IMPORT_REJESTRU_OBSZAROW.search(linia):
                naruszenia.append(
                    f"[obszary-import] {sciezka.relative_to(REPO_ROOT)}:{numer} "
                    f"import skasowanego rejestru obszarow"
                )
            if STAN_OBSZARU.search(linia):
                naruszenia.append(
                    f"[obszary-stan] {sciezka.relative_to(REPO_ROOT)}:{numer} "
                    f"rownolegly stan nawigacji `activeArea` — kanonem jest "
                    f"przestrzen powloki (`useShellStore.activeSpace`)"
                )
    return naruszenia


def regula_c_flaga_v3() -> list[str]:
    naruszenia: list[str] = []
    katalogi = [
        REPO_ROOT / "frontend" / "src",
        REPO_ROOT / "frontend" / "e2e",
        REPO_ROOT / "scripts",
        REPO_ROOT.parent / ".github" / "workflows",
    ]
    for katalog in katalogi:
        if not katalog.is_dir():
            continue
        for sciezka in sorted(katalog.rglob("*")):
            if not sciezka.is_file() or sciezka.suffix not in {
                ".ts",
                ".tsx",
                ".py",
                ".yml",
                ".yaml",
            }:
                continue
            # Guard i JEGO TEST musza wymieniac zakazana nazwe — inaczej
            # regula nie da sie ani zapisac, ani udowodnic (test, ktory nie
            # potrafi zapalic guarda na czerwono, niczego nie pilnuje).
            if sciezka.name in PLIKI_WLASNE_GUARDA:
                continue
            for numer, linia in enumerate(
                sciezka.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1
            ):
                if FLAGA_V3.search(linia):
                    naruszenia.append(
                        f"[flaga-v3] {sciezka.relative_to(REPO_ROOT.parent)}:{numer} "
                        f"flaga powloki V3 wrocila (D2: usunieta na amen)"
                    )
    return naruszenia


def regula_d_jedna_paleta() -> list[str]:
    definicje: list[Path] = []
    for sciezka in pliki_frontu():
        tresc = bez_komentarzy(sciezka.read_text(encoding="utf-8"))
        if DEFINICJA_PALETY.search(tresc):
            definicje.append(sciezka)

    if definicje == [PLIK_PALETY]:
        return []
    if not definicje:
        return ["[paleta-brak] nie znaleziono ZADNEJ definicji palety komend"]
    return [
        "[paleta-duplikat] paleta komend ma "
        f"{len(definicje)} definicje zamiast jednej: "
        + ", ".join(str(p.relative_to(REPO_ROOT)) for p in definicje)
        + f" — kanonem jest {PLIK_PALETY.relative_to(REPO_ROOT)} (D4)"
    ]


def main() -> int:
    if not FRONTEND_SRC.is_dir():
        print(f"BLAD: brak katalogu {FRONTEND_SRC}", file=sys.stderr)
        return 1

    naruszenia: list[str] = []
    naruszenia += regula_a_literaly_tras()
    naruszenia += regula_b_druga_nawigacja()
    naruszenia += regula_c_flaga_v3()
    naruszenia += regula_d_jedna_paleta()

    if naruszenia:
        print("NAWIGACJA-JEDEN-KANON: NARUSZENIA")
        for wpis in naruszenia:
            print(f"  {wpis}")
        print(f"\nRazem: {len(naruszenia)}")
        return 1

    print("NAWIGACJA-JEDEN-KANON: czysto (trasy, obszary, flaga V3, paleta)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

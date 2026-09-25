#!/usr/bin/env python3
"""Straznik nazwania twardych regul katalogu (AST).

PO CO (karta KATALOG-NIEZMIENNIKI, 2026-09-17). Katalog mial 33 twarde bramki
rekordu rozsiane po piaciu modulach i ZADNA nie mowila, na czym stoi: czy
zlamanie opisuje obiekt, ktory nie moze istniec, czy tylko rekord nietypowy dla
zbioru, ktory akurat mamy. Rejestr `network_model/catalog/niezmienniki_katalogu.py`
nazywa kazda z nich kodem, klasa mocy i podstawa — ale rejestr bez straznika jest
obietnica, a nie mechanizmem: pierwsza nowa walidacja dopisana `raise ValueError`
obok istniejacych wrocilaby do stanu sprzed karty, a rejestr dalej twierdzilby, ze
„kazda twarda regula jest nazwana".

Ten guard zamyka te luke trzema sprawdzeniami:

  1. `types.py` (glowny kontrakt katalogu) nie ma ANI JEDNEGO `raise ValueError` —
     kazda odmowa idzie przez `odmowa_twarda(kod, komunikat)`.
  2. Zadna funkcja WALIDACJI REKORDU w `network_model/catalog/**` (`__post_init__`,
     `from_dict`, `validate_*`, `_validate_*`) nie podnosi `ValueError` wprost.
     To jest KLASA, nie instancja: nowy modul katalogu z wlasnym `__post_init__`
     wchodzi tu sam, bez dopisywania go do jakiejkolwiek listy.
  3. Kazdy kod przekazany do `odmowa_twarda("KAT-T-nnn", …)` ISTNIEJE w rejestrze i
     ma klase twarda. Literal spoza rejestru jest czerwienia tutaj, a nie dopiero
     przy pierwszym uruchomieniu tamtej sciezki.

JEDYNE WYLACZENIE: `niezmienniki_katalogu.py`, czyli modul, ktory `odmowa_twarda`
DEFINIUJE. Jego wlasne `raise` dotycza spojnosci REJESTRU (kod nieznany, klasa
miekka, duplikat), a nie dopuszczalnosci rekordu katalogu — i musza dzialac, zanim
`odmowa_twarda` w ogole istnieje. Wylaczenie jest JEDNO, nazwane i sprawdzone
testem `scripts/test_niezmienniki_katalogu_guard.py`.

SCAN: `mv-design-pro/backend/src/network_model/catalog/**/*.py`

Uruchomienie (z katalogu `mv-design-pro`):
    python scripts/niezmienniki_katalogu_guard.py

EXIT CODES:
  0 = kazda twarda bramka rekordu katalogu jest nazwana kodem z rejestru
  1 = naruszenie (surowy `raise ValueError` w walidacji rekordu / nieznany kod)
"""

from __future__ import annotations

import ast
import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

PROJECT_ROOT = Path(__file__).resolve().parent.parent
KATALOG_DIR = PROJECT_ROOT / "backend" / "src" / "network_model" / "catalog"
PLIK_TYPOW = KATALOG_DIR / "types.py"
PLIK_REJESTRU = KATALOG_DIR / "niezmienniki_katalogu.py"
#: Liść predykatu nazwy (`network_model/nazwy.py`, tylko biblioteka standardowa) — jedyny
#: import projektu w rejestrze (karta NAZWY-JEDNO-ZRODLO: nazwa reguły sprawdzana tym samym
#: `jest_nazwa` co każda nazwa w `src`).
PLIK_PREDYKATU_NAZWY = PROJECT_ROOT / "backend" / "src" / "network_model" / "nazwy.py"
MODUL_PREDYKATU_NAZWY = "network_model.nazwy"

#: Funkcje, ktorych zadaniem jest ROZSTRZYGNIECIE o dopuszczalnosci rekordu
#: katalogu. Prefiks `_validate`/`validate` obejmuje rowniez pomocnicze walidatory
#: pol wolane z `__post_init__`.
NAZWY_WALIDACJI_REKORDU: tuple[str, ...] = ("__post_init__", "from_dict")
PREFIKSY_WALIDACJI_REKORDU: tuple[str, ...] = ("validate_", "_validate_", "waliduj_", "_waliduj_")

#: Jedyny plik zwolniony ze sprawdzenia 1 i 2 — patrz naglowek.
PLIKI_ZWOLNIONE: frozenset[str] = frozenset({"niezmienniki_katalogu.py"})


def _zaladuj_lisc_predykatu_nazwy() -> None:
    """Rejestr importuje `network_model.nazwy`. Samo `backend/src` na `sys.path` NIE wystarcza
    pod gołym `python3` CI: import `network_model.nazwy` wykonuje `network_model/__init__.py`
    → `core` → `networkx` (`ModuleNotFoundError`, zmierzone w karcie NAZWY-JEDNO-ZRODLO).
    Liść ładowany jest więc JAWNIE z pliku pod swoją pełną nazwą modułu — mechanizm importu
    zwraca go z `sys.modules` bez wykonywania pakietu nadrzędnego."""
    if MODUL_PREDYKATU_NAZWY in sys.modules:
        return
    spec = importlib.util.spec_from_file_location(MODUL_PREDYKATU_NAZWY, PLIK_PREDYKATU_NAZWY)
    assert spec and spec.loader
    modul = importlib.util.module_from_spec(spec)
    sys.modules[MODUL_PREDYKATU_NAZWY] = modul
    spec.loader.exec_module(modul)


def modul_rejestru() -> ModuleType:
    """Zaladuj rejestr regul bez wykonywania `network_model/__init__.py`.

    Ten sam wzorzec co `readiness_codes_guard.py::modul_rejestru`: guard ma
    dzialac golym `python3` w CI, a rejestr potrzebuje wylacznie stdlib i liscia
    `network_model/nazwy.py` (ladowanego jawnie z pliku, patrz `_zaladuj_lisc_predykatu_nazwy`).
    """
    juz = sys.modules.get("network_model.catalog.niezmienniki_katalogu") or sys.modules.get(
        "_rejestr_niezmiennikow_katalogu"
    )
    if juz is not None:
        return juz
    _zaladuj_lisc_predykatu_nazwy()
    spec = importlib.util.spec_from_file_location("_rejestr_niezmiennikow_katalogu", PLIK_REJESTRU)
    assert spec and spec.loader
    modul = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modul
    spec.loader.exec_module(modul)
    return modul


@dataclass(frozen=True)
class Naruszenie:
    plik: str
    linia: int
    opis: str


def _wzgledna(sciezka: Path) -> str:
    """Sciezka wzgledem repozytorium; poza nim (skan syntetyczny w tescie) — pelna."""
    try:
        return str(sciezka.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(sciezka)


def _jest_walidacja_rekordu(nazwa: str) -> bool:
    return nazwa in NAZWY_WALIDACJI_REKORDU or nazwa.startswith(PREFIKSY_WALIDACJI_REKORDU)


class _Skaner(ast.NodeVisitor):
    def __init__(self, sciezka: Path, sprawdzaj_wszystkie_raise: bool) -> None:
        self.sciezka = sciezka
        self.sprawdzaj_wszystkie_raise = sprawdzaj_wszystkie_raise
        self.stos_funkcji: list[str] = []
        self.naruszenia: list[Naruszenie] = []
        self.kody_odmowy: list[tuple[int, str]] = []

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        self.stos_funkcji.append(node.name)
        self.generic_visit(node)
        self.stos_funkcji.pop()

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        self.stos_funkcji.append(node.name)
        self.generic_visit(node)
        self.stos_funkcji.pop()

    def visit_Raise(self, node: ast.Raise) -> None:  # noqa: N802
        exc = node.exc
        nazwa = None
        if isinstance(exc, ast.Call) and isinstance(exc.func, ast.Name):
            nazwa = exc.func.id
        elif isinstance(exc, ast.Name):
            nazwa = exc.id
        if nazwa == "ValueError":
            w_walidacji = any(_jest_walidacja_rekordu(f) for f in self.stos_funkcji)
            if self.sprawdzaj_wszystkie_raise:
                self.naruszenia.append(
                    Naruszenie(
                        plik=_wzgledna(self.sciezka),
                        linia=node.lineno,
                        opis=(
                            "surowy `raise ValueError` w types.py — kazda odmowa rekordu "
                            "katalogu idzie przez `odmowa_twarda(kod, komunikat)`"
                        ),
                    )
                )
            elif w_walidacji:
                self.naruszenia.append(
                    Naruszenie(
                        plik=_wzgledna(self.sciezka),
                        linia=node.lineno,
                        opis=(
                            f"surowy `raise ValueError` w walidacji rekordu "
                            f"`{self.stos_funkcji[-1]}` — uzyj `odmowa_twarda(kod, komunikat)` "
                            "z kodem z rejestru REGULY_KATALOGU"
                        ),
                    )
                )
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        wywolana = None
        if isinstance(node.func, ast.Name):
            wywolana = node.func.id
        elif isinstance(node.func, ast.Attribute):
            wywolana = node.func.attr
        if wywolana == "odmowa_twarda" and node.args:
            pierwszy = node.args[0]
            if isinstance(pierwszy, ast.Constant) and isinstance(pierwszy.value, str):
                self.kody_odmowy.append((node.lineno, pierwszy.value))
            else:
                self.naruszenia.append(
                    Naruszenie(
                        plik=_wzgledna(self.sciezka),
                        linia=node.lineno,
                        opis=(
                            "kod reguly w `odmowa_twarda` musi byc literalem tekstowym — "
                            "kod liczony w czasie wykonania omija to sprawdzenie"
                        ),
                    )
                )
        self.generic_visit(node)


def zbadaj(katalog: Path | None = None, plik_typow: Path | None = None) -> list[Naruszenie]:
    """Skan katalogu regul. Parametry sluza WYLACZNIE testowi straznika (skan syntetyczny).

    Domyslnie skanuje prawdziwy `network_model/catalog/**`; test podaje wlasny
    katalog z modulem-iniekcja, zeby dowod czerwieni nie wymagal psucia zrodel
    produkcyjnych i przywracania ich w `finally`.
    """
    katalog = katalog or KATALOG_DIR
    plik_typow = plik_typow if plik_typow is not None else PLIK_TYPOW
    if not katalog.is_dir():
        return [Naruszenie(plik=str(katalog), linia=0, opis="brak katalogu do skanu")]
    rejestr = modul_rejestru()
    kody_twarde = set(rejestr.KODY_TWARDE)
    wszystkie_kody = set(rejestr.REGULY_KATALOGU)

    naruszenia: list[Naruszenie] = []
    zbadane = 0
    for sciezka in sorted(katalog.rglob("*.py")):
        if sciezka.name in PLIKI_ZWOLNIONE:
            continue
        zbadane += 1
        drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
        skaner = _Skaner(sciezka, sprawdzaj_wszystkie_raise=sciezka == plik_typow)
        skaner.visit(drzewo)
        naruszenia.extend(skaner.naruszenia)
        for linia, kod in skaner.kody_odmowy:
            wzgledna = _wzgledna(sciezka)
            if kod not in wszystkie_kody:
                naruszenia.append(
                    Naruszenie(
                        plik=wzgledna,
                        linia=linia,
                        opis=f"kod {kod!r} nie istnieje w rejestrze REGULY_KATALOGU",
                    )
                )
            elif kod not in kody_twarde:
                naruszenia.append(
                    Naruszenie(
                        plik=wzgledna,
                        linia=linia,
                        opis=(
                            f"kod {kod!r} ma klase MIEKKA — wiarygodnosc raportuje przez "
                            "`przeglad_wiarygodnosci`, nigdy nie odmawia rekordu"
                        ),
                    )
                )
    if zbadane == 0:
        return [
            Naruszenie(
                plik=str(katalog),
                linia=0,
                opis="PUSTY SKAN — zero zbadanych plikow to blad, nie sukces",
            )
        ]
    return naruszenia


def main() -> int:
    naruszenia = zbadaj()
    if naruszenia:
        print(f"\n{'=' * 60}")
        print("NIEZMIENNIKI KATALOGU: twarda bramka rekordu bez nazwanej reguly")
        print(f"{'=' * 60}\n")
        for n in naruszenia:
            print(f"  VIOLATION: {n.plik}:{n.linia} — {n.opis}")
        print()
        print("  Napraw: zamien `raise ValueError(...)` na")
        print('          `odmowa_twarda("KAT-T-nnn", "...")` i dopisz regule do')
        print("          backend/src/network_model/catalog/niezmienniki_katalogu.py")
        print()
        return 1
    rejestr = modul_rejestru()
    print(
        "Niezmienniki katalogu: OK "
        f"({len(rejestr.KODY_TWARDE)} regul twardych, "
        f"{len(rejestr.KODY_WIARYGODNOSCI) } regul wiarygodnosci, "
        "zero surowych `raise ValueError` w walidacji rekordu)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
CI Guard: result_status_writer_guard.py - karta CV-2-W (2026-09-05).

INWARIANT (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §B.4): status wynikow
PRZYPADKU OBLICZENIOWEGO (`StudyCase.result_status`: NONE / FRESH / OUTDATED) jest
WYPROWADZANY z biegow przypadku i koperty rewizji
(`application/result_freshness.py::status_wynikow_przypadku`, wolane przez
`application/study_case/status_wynikow.py`) - NIGDY zapisywany. Kolumna
`study_cases.result_status` zostaje w bazie jako DANE ZASTANE i nikt jej nie pisze.

PO CO TA BRAMKA. Do CV-2-W status byl POLEM, a jego prawdziwosc zalezala od tego,
czy KAZDA sciezka mutujaca model pamietala o wywolaniu "uniewazniacza". Pisarzy
bylo siedmiu (`ResultInvalidator`, `StudyCaseService.mark_all_outdated` /
`mark_case_outdated` / `mark_case_fresh`, `case_repository.mark_*`,
`invalidate_cases_for_snapshot`, `update_cases_snapshot_binding`,
`LifecycleService`, regula OUTDATED w `StudyCase.with_network_snapshot_id` i w
`with_updated_config` / `with_protection_config`, dwie koncowki HTTP
`/invalidate-all` i `/invalidate`), a sciezek mutujacych model wiecej - wiec luka
byla nieunikniona i zmierzona: zmiana typu katalogowego nie uniewazniala NICZEGO,
a przypadek meldowal "wyniki aktualne" przy modelu, ktory pojechal dalej.
Kasacja pisarzy bez zapadki jest odwracalna jednym kopiuj-wklej - ta bramka
zamyka droge powrotna (budzet ZERO, nie malejacy: to nie jest dlug do splacenia,
tylko wzorzec zakazany).

CO WYKRYWA (analiza skladni, nie dopasowanie tekstu)
-----------------------------------------------------
A. PRZYPISANIE ATRYBUTU `X.result_status = ...` (takze `+=` i z adnotacja)
   w pliku, ktory w ogole zajmuje sie przypadkiem obliczeniowym (tresc zawiera
   identyfikator `StudyCase`). Wyjatek: `self.result_status = ...` wewnatrz
   `__init__` - nadanie polu WLASNEGO obiektu w konstruktorze nie jest przejsciem
   statusu przypadku (tak powstaja np. pola wyjatkow).

B. ARGUMENT `result_status=` w konstrukcji przypadku: `StudyCaseORM(...)`,
   `StudyCase(...)`, `new_study_case(...)`.

C. ARGUMENT `result_status=` w `...values(...)` instrukcji DML, ktorej lancuch
   wywolan wymienia `StudyCaseORM` (czyli `update(StudyCaseORM)....values(...)`).

D. WYSTAPIENIE identyfikatora `StudyCaseResultStatus` gdziekolwiek w zakresie.
   Ten typ zostal skasowany razem z polem; jego powrot znaczylby, ze przypadek
   znowu przechowuje status.

CZEGO NIE WYKRYWA (i dlaczego)
------------------------------
`CanonicalRun.result_status` (status BIEGU kanonicznego, `canonical_runs`) oraz
legacy `AnalysisRun.result_status` (`analysis_runs`) sa POZA zakresem tej karty -
to inne byty w innym slowniku (VALID/OUTDATED), kasowane razem z torem legacy
w CV-4. Rozroznienie jest strukturalne, nie nazwowe: reguly B i C wymagaja
konstruktora/lancucha PRZYPADKU, a regula A dziala wylacznie w plikach
wspominajacych `StudyCase` - repozytoria biegow (`canonical_run_repository.py`,
`analysis_run_repository.py`) nie wspominaja go ani razu (pomiar 2026-09-05).

ZAKRES SKANU I JEDYNE WYLACZENIE
--------------------------------
Caly `backend/src`, z jednym wylaczeniem: `application/project_archive/service.py`.
Archiwum projektu przenosi wiersz `study_cases` 1:1 (eksport -> ZIP -> import),
razem z kolumnami zastanymi; przy odtworzeniu podstawia z powrotem WARTOSC Z
ARCHIWUM, a nie werdykt swiezosci - i nikt tej wartosci potem nie czyta. Zdjecie
kolumny z archiwum wymagaloby podbicia `ARCHIVE_SCHEMA_VERSION` i migracji
starych paczek, czyli zmiany kontraktu deterministycznego artefaktu - poza karta
CV-2-W. Wylaczenie jest JAWNE i przypiete testem
(`scripts/test_result_status_writer_guard.py`).
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Jedyny plik wylaczony z reguly - patrz "ZAKRES SKANU I JEDYNE WYLACZENIE".
WYLACZONE_PLIKI: frozenset[str] = frozenset({"application/project_archive/service.py"})

#: Pole objete zakazem zapisu.
POLE_STATUSU = "result_status"

#: Konstrukcje, w ktorych `result_status=` jest zapisem statusu PRZYPADKU (regula B).
KONSTRUKTORY_PRZYPADKU: frozenset[str] = frozenset({"StudyCaseORM", "StudyCase", "new_study_case"})

#: Identyfikator, ktorego obecnosc w zakresie jest sama w sobie naruszeniem (regula D).
ZAKAZANY_TYP_STATUSU = "StudyCaseResultStatus"

#: Plik jest "przypadkowy" (regula A dziala w nim), gdy wspomina ten identyfikator.
TOKEN_PRZYPADKU = "StudyCase"


def _cel_atrybutu(target: ast.expr) -> ast.Attribute | None:
    """`target`, jesli jest przypisaniem do atrybutu `result_status`; inaczej None."""
    if isinstance(target, ast.Attribute) and target.attr == POLE_STATUSU:
        return target
    return None


def _jest_polem_wlasnym_w_init(target: ast.Attribute, nazwa_funkcji: str | None) -> bool:
    """`self.result_status = ...` wewnatrz `__init__` - nadanie pola wlasnego obiektu."""
    return (
        nazwa_funkcji == "__init__"
        and isinstance(target.value, ast.Name)
        and target.value.id == "self"
    )


def _nazwa_wywolania(expr: ast.Call) -> str | None:
    """Nazwa wolanej funkcji (`f(...)` -> "f", `a.b(...)` -> "b")."""
    if isinstance(expr.func, ast.Name):
        return expr.func.id
    if isinstance(expr.func, ast.Attribute):
        return expr.func.attr
    return None


def _ma_kwarg_statusu(expr: ast.Call) -> bool:
    return any(kw.arg == POLE_STATUSU for kw in expr.keywords)


def _lancuch_wymienia_przypadek(expr: ast.expr) -> bool:
    """Czy lancuch wywolan przed `.values(...)` wymienia `StudyCaseORM`.

    Rozroznia `update(StudyCaseORM)....values(result_status=...)` (naruszenie)
    od `update(AnalysisRunORM)....values(result_status=...)` (bieg legacy, poza
    zakresem) - bez tego rozroznienia bramka karalaby tor, ktorego karta nie
    dotyczy, i zostalaby wylaczona przy pierwszej kolizji.
    """
    return any(isinstance(node, ast.Name) and node.id == "StudyCaseORM" for node in ast.walk(expr))


class _Skaner(ast.NodeVisitor):
    """Zbiera naruszenia jednego pliku; zna nazwe funkcji, w ktorej sie znajduje."""

    def __init__(self, *, plik_przypadkowy: bool) -> None:
        self.plik_przypadkowy = plik_przypadkowy
        self.naruszenia: list[tuple[str, int]] = []
        self._funkcja: str | None = None

    # -- kontekst funkcji (dla wyjatku `__init__`) --------------------------

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        poprzednia, self._funkcja = self._funkcja, node.name
        self.generic_visit(node)
        self._funkcja = poprzednia

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        poprzednia, self._funkcja = self._funkcja, node.name
        self.generic_visit(node)
        self._funkcja = poprzednia

    # -- regula A: przypisanie atrybutu ------------------------------------

    def _sprawdz_cele(self, cele: list[ast.expr], lineno: int) -> None:
        if not self.plik_przypadkowy:
            return
        for target in cele:
            atrybut = _cel_atrybutu(target)
            if atrybut is None:
                continue
            if _jest_polem_wlasnym_w_init(atrybut, self._funkcja):
                continue
            self.naruszenia.append(("przypisanie:.result_status", lineno))

    def visit_Assign(self, node: ast.Assign) -> None:  # noqa: N802
        self._sprawdz_cele(list(node.targets), node.lineno)
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:  # noqa: N802
        if node.value is not None:
            self._sprawdz_cele([node.target], node.lineno)
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:  # noqa: N802
        self._sprawdz_cele([node.target], node.lineno)
        self.generic_visit(node)

    # -- reguly B i C: argument `result_status=` ---------------------------

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        if _ma_kwarg_statusu(node):
            nazwa = _nazwa_wywolania(node)
            if nazwa in KONSTRUKTORY_PRZYPADKU:
                self.naruszenia.append((f"konstrukcja:{nazwa}(result_status=)", node.lineno))
            elif (
                nazwa == "values"
                and isinstance(node.func, ast.Attribute)
                and _lancuch_wymienia_przypadek(node.func.value)
            ):
                self.naruszenia.append(
                    ("dml:update(StudyCaseORM).values(result_status=)", node.lineno)
                )
        self.generic_visit(node)

    # -- regula D: zakazany typ statusu ------------------------------------

    def visit_Name(self, node: ast.Name) -> None:  # noqa: N802
        if node.id == ZAKAZANY_TYP_STATUSU:
            self.naruszenia.append((f"typ:{ZAKAZANY_TYP_STATUSU}", node.lineno))
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:  # noqa: N802
        if node.attr == ZAKAZANY_TYP_STATUSU:
            self.naruszenia.append((f"typ:{ZAKAZANY_TYP_STATUSU}", node.lineno))
        self.generic_visit(node)


def zbierz_naruszenia(tresc: str, drzewo: ast.AST) -> list[tuple[str, int]]:
    """Naruszenia jednego pliku: lista (sygnatura, numer wiersza)."""
    skaner = _Skaner(plik_przypadkowy=TOKEN_PRZYPADKU in tresc)
    skaner.visit(drzewo)
    return skaner.naruszenia


def main() -> int:
    if not BACKEND_SRC.is_dir():
        print(f"FAIL: brak korzenia skanowania: {BACKEND_SRC}")
        print("Bramka, ktora nie dosiega swojego korzenia, to falszywa zielen.")
        return 1

    naruszenia: list[str] = []
    przeskanowano = 0
    for path in sorted(BACKEND_SRC.rglob("*.py")):
        rel = path.relative_to(BACKEND_SRC).as_posix()
        if rel in WYLACZONE_PLIKI:
            continue
        try:
            tresc = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        try:
            drzewo = ast.parse(tresc, filename=str(path))
        except SyntaxError as exc:
            print(f"WARN: {path}:{exc.lineno}: nie da sie sparsowac ({exc.msg})")
            continue
        przeskanowano += 1
        for sygnatura, linia in zbierz_naruszenia(tresc, drzewo):
            naruszenia.append(f"  {rel}:{linia}: {sygnatura}")

    print(
        f"Przeskanowano {przeskanowano} plikow pod {BACKEND_SRC} "
        f"(wylaczono: {', '.join(sorted(WYLACZONE_PLIKI))})."
    )

    if przeskanowano == 0:
        print("FAIL: PUSTY SKAN - 0 plikow. Bramka, ktora nic nie obejrzala, nic nie dowodzi.")
        return 1

    martwe = [rel for rel in WYLACZONE_PLIKI if not (BACKEND_SRC / rel).is_file()]
    if martwe:
        print("FAIL: wylaczenie wskazuje pliki, ktorych nie ma:")
        for rel in sorted(martwe):
            print(f"  {rel} - zdejmij wpis z WYLACZONE_PLIKI.")
        return 1

    if naruszenia:
        print(
            "FAIL: zapis statusu wynikow PRZYPADKU obliczeniowego "
            "(status jest WYPROWADZANY z biegow - application/study_case/status_wynikow.py, "
            "docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §B.4):"
        )
        for wiersz in sorted(naruszenia):
            print(wiersz)
        print(f"\n{len(naruszenia)} naruszen. Budzet tej bramki to ZERO i nie rosnie.")
        return 1

    print("PASS: zaden kod nie zapisuje statusu wynikow przypadku (budzet 0).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

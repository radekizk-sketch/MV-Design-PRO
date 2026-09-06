#!/usr/bin/env python3
"""Guard proweniencji: pole proweniencji biegu nie moze byc literalem bez zrodla (CV-2, H2/H3).

DLUG, KTORY TEN GUARD ZAMYKA (audyt twin A2/A9, karta CV-2 H2/H3). Bloki
„reproducibility" biegow niosly stale udajace dane: `"solver_version": ... or "1.0.0"`,
`"catalog_schema_version": "catalog_v1"`, `variant_ref = ... or "variant.uklad_normalny"`.
Konsument (ekran „Reprodukowalnosc", raport) nie odroznia takiej stalej od odczytu —
wynik policzony bez wybranego wariantu prezentowal sie jak policzony „w ukladzie
normalnym", a katalog bez tozsamosci jak „catalog_v1". Karta CV-2 usunela te stale;
guard pilnuje, zeby nie wrocily w zadnym budowniczym proweniencji.

REGULA (waska, mierzalna): w zakresie skanu (`domain`, `api`, `application`, `enm`,
`solver_input` — czyli budowniczowie proweniencji POZA solverami; solver deklarujacy
wlasna wersje w swoim sladzie jest ZRODLEM, nie fabrykacja) zabronione sa:
  1. `{"<klucz proweniencji>": "<literal>"}` — wartosc pola proweniencji jako literal
     lancuchowy w wyrazeniu slownikowym,
  2. `{"<klucz proweniencji>": <cokolwiek> or "<literal>"}` — literal jako domyslna
     wartosc zastepcza (cichy zastepnik),
  3. stale modulowe o nazwach z `ZAKAZANE_STALE` (wskrzeszenie usunietych stalych).
Klucze proweniencji: `KLUCZE_PROWENIENCJI` nizej — pola, ktorych wartosc MUSI
pochodzic z danych (koperta rewizji, slad solvera, opcje biegu) albo byc `None`.
Etykiety wersji KONTRAKTOW (`report_contract_version`, `method_version`,
`formula_set_version`...) nazywaja kod, nie dane — swiadomie POZA regula.

Uruchomienie: `python scripts/provenance_constant_guard.py` (czysty AST, bez zaleznosci).
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Korzenie skanu wzgledem BACKEND_SRC (budowniczowie proweniencji poza solverami).
SCAN_ROOTS: tuple[str, ...] = ("domain", "api", "application", "enm", "solver_input")

#: Pola proweniencji, ktorych wartosc musi pochodzic z danych albo byc `None`.
KLUCZE_PROWENIENCJI: frozenset[str] = frozenset(
    {
        "solver_version",
        "catalog_schema_version",
        "catalog_fingerprint",
        "catalog_snapshot_ref",
        "model_revision",
        "variant_ref",
        "operating_variant_ref",
        "switching_snapshot_ref",
        "switching_state_ref",
        "enm_hash",
        "snapshot_ref",
        "enm_snapshot_ref",
        "input_hash",
        "result_hash",
    }
)

#: Stale, ktorych powrot jest naruszeniem (usuniete w CV-2 jako etykiety bez encji).
ZAKAZANE_STALE: frozenset[str] = frozenset(
    {
        "DEFAULT_OPERATING_VARIANT_REF",
        "DEFAULT_SWITCHING_SNAPSHOT_REF",
        "DEFAULT_CATALOG_SCHEMA_VERSION",
        "DEFAULT_SOLVER_VERSION",
    }
)


def _literal_lancuchowy(wezel: ast.AST) -> bool:
    return isinstance(wezel, ast.Constant) and isinstance(wezel.value, str)


def _konczy_sie_literalem(wezel: ast.AST) -> bool:
    """`a or b or "x"` — ostatni operand alternatywy jest literalem lancuchowym."""
    return (
        isinstance(wezel, ast.BoolOp)
        and isinstance(wezel.op, ast.Or)
        and _literal_lancuchowy(wezel.values[-1])
    )


def zbierz_naruszenia(tree: ast.AST) -> list[tuple[int, str]]:
    naruszenia: list[tuple[int, str]] = []
    for wezel in ast.walk(tree):
        if isinstance(wezel, ast.Dict):
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
                if not (isinstance(klucz, ast.Constant) and isinstance(klucz.value, str)):
                    continue
                if klucz.value not in KLUCZE_PROWENIENCJI:
                    continue
                if _literal_lancuchowy(wartosc):
                    naruszenia.append(
                        (
                            wezel.lineno,
                            f"pole proweniencji {klucz.value!r} = literal {wartosc.value!r}",
                        )
                    )
                elif _konczy_sie_literalem(wartosc):
                    domyslna = wartosc.values[-1]
                    assert isinstance(domyslna, ast.Constant)
                    naruszenia.append(
                        (
                            wezel.lineno,
                            f"pole proweniencji {klucz.value!r} z literalem zastepczym "
                            f"{domyslna.value!r} (`... or ...`)",
                        )
                    )
        elif isinstance(wezel, ast.Assign):
            for cel in wezel.targets:
                if isinstance(cel, ast.Name) and cel.id in ZAKAZANE_STALE:
                    naruszenia.append((wezel.lineno, f"wskrzeszona stala {cel.id}"))
        elif isinstance(wezel, ast.AnnAssign):
            if isinstance(wezel.target, ast.Name) and wezel.target.id in ZAKAZANE_STALE:
                naruszenia.append((wezel.lineno, f"wskrzeszona stala {wezel.target.id}"))
    return naruszenia


def skanuj(korzen: Path) -> tuple[int, list[str]]:
    przeskanowano = 0
    komunikaty: list[str] = []
    for root_name in SCAN_ROOTS:
        katalog = korzen / root_name
        if not katalog.is_dir():
            continue
        for sciezka in sorted(katalog.rglob("*.py")):
            przeskanowano += 1
            try:
                tree = ast.parse(sciezka.read_text(encoding="utf-8"))
            except SyntaxError as exc:
                komunikaty.append(f"{sciezka.relative_to(korzen)}: blad skladni: {exc}")
                continue
            for linia, opis in zbierz_naruszenia(tree):
                komunikaty.append(f"{sciezka.relative_to(korzen).as_posix()}:{linia}: {opis}")
    return przeskanowano, komunikaty


def main() -> int:
    if not BACKEND_SRC.is_dir():
        print(f"FAIL: brak korzenia skanowania: {BACKEND_SRC}")
        return 1
    przeskanowano, komunikaty = skanuj(BACKEND_SRC)
    print(f"Przeskanowano {przeskanowano} plikow w zakresie: {', '.join(SCAN_ROOTS)}.")
    if komunikaty:
        print(
            "FAIL: pole proweniencji biegu z literalem bez zrodla (CV-2 H2/H3 — "
            "wartosc ma pochodzic z koperty rewizji, sladu solvera albo opcji biegu, "
            "inaczej byc None):"
        )
        for komunikat in komunikaty:
            print(f"  {komunikat}")
        print(f"\n{len(komunikaty)} naruszen.")
        return 1
    print("PASS: zadne pole proweniencji nie jest literalem bez zrodla.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

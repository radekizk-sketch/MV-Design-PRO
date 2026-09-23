#!/usr/bin/env python3
"""Dynamika Zero-Default Guard (karta W6-1 SS0 p.1/p.3, SS2).

Pilnuje, żeby ŻADNE pole FIZYCZNE (liczbowe) kontraktu parametrów dynamicznych
nie miało domyślnej wartości liczbowej — brak danej wejściowej ma być brakiem
pola wymaganego (Pydantic `ValidationError`), nigdy cichą domyślką (zero
fabrykacji, ZASADA NR 1 CLAUDE.md; dopełnienie precedensu k_sc DEFAULT_FORBIDDEN
— S-2, karta W6-0).

SCAN FILES (KLASA, nie jeden plik — ten sam kontrakt żyje w czterech miejscach;
czwarte, `enm/badanie_zgodnosci.py`, dopisane kartą AB-1a D4):
  backend/src/enm/dynamika_modele.py                          (ParametryDynamiczne)
  backend/src/network_model/catalog/der_dynamic/models.py     (profile DER — mapują
                                                                 się 1:1 na powyższe)
  backend/src/network_model/solvers/dynamika/kontrakty.py     (wejście rdzenia DAE:
                                                                 nastawy solvera i
                                                                 elementy sieci)

CO JEST DOZWOLONE (jedyne dwa legalne wyjątki, oba NIEliczbowe albo jawnie None):
  * `rodzina`/`typ`/`tryb`/`priorytet_ogranicznika`/... — dyskryminator/literał
    TEKSTOWY z domyślną wartością tekstową (np. `rodzina: Literal["synchroniczna"]
    = "synchroniczna"`) — to NIE jest domyślka FIZYCZNA, to stała nazwa wariantu.
  * `default=None` na polu `X | None` — `None` NIE jest liczbą; brak wartości
    reprezentowany jawnym `None` jest DOZWOLONY (np. `virtual_inertia_h_s`,
    `wzbudzenie`/`turbina`/`stabilizator`/`crowbar`/`przeksztaltnik` — bloki
    opcjonalne z fizycznym uzasadnieniem udokumentowanym w kontrakcie).
  * pola NIE-fizyczne (`profile_id`, `profile_name_pl`, `proweniencja`) — tożsamość
    i proweniencja, nie wielkość fizyczna.

CO JEST ZAKAZANE: jakikolwiek `int`/`float` LITERAŁ jako domyślna wartość pola
(`= 5.0`, `Field(default=5.0, ...)`, `Field(5.0, ...)`) na polu innym niż powyższe
wyjątki. AST, nie regex — łapie zarówno `Field(default=X)` jak i `pole: float = X`.

Self-test z czerwoną iniekcją: `scripts/test_dynamika_zero_default_guard.py`.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCAN_FILES: tuple[str, ...] = (
    "backend/src/enm/dynamika_modele.py",
    "backend/src/network_model/catalog/der_dynamic/models.py",
    # Karta W6-2: TRZECIE miejsce, w którym żyje kontrakt danych dynamiki —
    # wejście rdzenia DAE (`WejscieDynamiki`, `NastawySolvera`, elementy sieci).
    # Ten sam zakaz domyślek liczbowych: brak nastawy albo brak parametru sieci
    # to brak pola wymaganego, nigdy cicha wartość zastępcza.
    "backend/src/network_model/solvers/dynamika/kontrakty.py",
    # Karta AB-1a D4: CZWARTE miejsce — kontrakt badania zgodnosci na zaciskach
    # (`BadanieZgodnosci`: bodziec, impedancja zastepcza sieci, pasmo waznosci
    # modelu). Ten sam zakaz: W-98 zabrania domyslnej impedancji sieci.
    "backend/src/enm/badanie_zgodnosci.py",
)

#: Pola dozwolone z domyślką TEKSTOWĄ (dyskryminator wariantu, nie wielkość
#: fizyczna) — zamknięty zbiór nazw pól, niezależny od klasy, bo dyskryminator
#: nazywa się tak samo w każdej rodzinie unii.
POLA_DYSKRYMINATORA = frozenset({"rodzina", "typ", "tryb"})


def _stala_liczbowa(node: ast.expr | None) -> bool:
    """Czy węzeł AST jest literałem int/float (NIE bool, NIE None, NIE string)."""
    if node is None:
        return False
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return _stala_liczbowa(node.operand)
    if not isinstance(node, ast.Constant):
        return False
    wartosc = node.value
    if isinstance(wartosc, bool):
        return False
    return isinstance(wartosc, int | float)


def _domyslka_z_field_call(call: ast.Call) -> ast.expr | None:
    """Wartość `default=` z wywołania `Field(...)`, albo pierwszy argument
    pozycyjny (Pydantic dopuszcza `Field(5.0, ge=...)` jako skrót `default=5.0`)."""
    for kw in call.keywords:
        if kw.arg == "default":
            return kw.value
    if call.args:
        return call.args[0]
    return None


def _nazwa_wywolania(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def znajdz_naruszenia(sciezka: Path) -> list[str]:
    tekst = sciezka.read_text(encoding="utf-8")
    drzewo = ast.parse(tekst, filename=str(sciezka))
    naruszenia: list[str] = []

    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.ClassDef):
            continue
        for stmt in wezel.body:
            if not isinstance(stmt, ast.AnnAssign) or not isinstance(stmt.target, ast.Name):
                continue
            pole = stmt.target.id
            if pole in POLA_DYSKRYMINATORA:
                continue
            wartosc = stmt.value
            if wartosc is None:
                continue
            domyslka: ast.expr | None
            if isinstance(wartosc, ast.Call) and _nazwa_wywolania(wartosc.func) == "Field":
                domyslka = _domyslka_z_field_call(wartosc)
            else:
                domyslka = wartosc
            if _stala_liczbowa(domyslka):
                try:
                    rel = sciezka.relative_to(ROOT).as_posix()
                except ValueError:
                    rel = str(sciezka)
                naruszenia.append(
                    f"{rel}:{stmt.lineno}: klasa {wezel.name}.{pole} ma domyślkę "
                    f"liczbową ({ast.dump(domyslka)}) — pole fizyczne musi być "
                    "WYMAGANE (zero fabrykacji, karta W6-1)"
                )
    return naruszenia


def main() -> int:
    wszystkie: list[str] = []
    for rel in SCAN_FILES:
        sciezka = ROOT / rel
        if not sciezka.exists():
            print(f"[missing-scan-file] {rel}", file=sys.stderr)
            return 1
        wszystkie.extend(znajdz_naruszenia(sciezka))

    if wszystkie:
        print("Dynamika Zero-Default Guard failed:")
        for n in wszystkie:
            print(f" - {n}")
        return 1

    print(f"Dynamika Zero-Default Guard: OK ({len(SCAN_FILES)} plików, 0 domyślek liczbowych).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

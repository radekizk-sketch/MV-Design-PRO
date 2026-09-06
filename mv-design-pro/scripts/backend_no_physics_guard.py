#!/usr/bin/env python3
"""Guard: formuły fizyczne poza `network_model/solvers/**` i `network_model/pochodne/**`
(CV-4.3 K4, C.2.3).

Rodziny wykrywane (AST, nie grep — patrz karta `karta_cv43_a3.md`, K4.4):
√3 (`sqrt(3)`/`3**0.5`/literał `1.7320508...`) w mnożeniu/dzieleniu, κ IEC
60909 (`1.02 + 0.98*exp(...)` / `exp(-3*x)`), całka Joule'a I²t (`x**2 * t`,
gdzie `t` to wielkość czasowa — nazwa zawiera „t"/„tk"/„time"/„czas"), korekta
temperaturowa (`1 + alpha*(theta - cokolwiek)`), impedancja/moc bazowa
Z = U²/S (`u**2 / s`, dzielenie z KWADRATEM wprost w liczniku). Napis,
komentarz i docstring NIE są liczone — to jest AST wyrażeń, nie tekst.

Jedyne recenzowane miejsce dla tych formuł: `network_model/pochodne/`
(karta CV-4.3-A3, K4.1). ALLOWLIST jest PUSTA — żadne miejsce nie ma prawa
liczyć tych wzorów poza `pochodne/`, poza zapadką `ZASTANE` (tylko w dół).

`network_model/pochodne/` jest SIOSTRĄ `network_model/core/` i
`network_model/solvers/`, NIE potomkiem `solvers/` (relokacja architekta,
2026-09-06): `network_model/solvers/__init__.py` (FROZEN) gorliwie importuje
wszystkie solvery zależne od `network_model.core.graph.NetworkGraph`, więc
gdyby `pochodne/` leżało pod `solvers/`, żaden plik `network_model/core/*.py`
nie mógłby go importować NA POZIOMIE MODUŁU bez cyklu. Jako siostra obu
katalogów, `pochodne/` (importuje WYŁĄCZNIE `math`) jest prawdziwym liściem
grafu importów — każda warstwa, włącznie z `network_model/core/**`, importuje
ją na poziomie modułu.

ZAPADKA W OBIE STRONY (`ZASTANE`): wzrost = dług urósł (czerwony), spadek =
obniż zapadkę (czerwony, żeby pomiar nie kłamał). Po karcie CV-4.3-A3 zapadka
zawiera WYŁĄCZNIE `application/reference_networks/**` — cały pakiet jest
kasowany w karcie A2 (po odbiorze A1); jego trafienia FORMUŁA celowo NIE są
przenoszone do `pochodne/`, bo cały plik i tak znika.
"""

from __future__ import annotations

import ast
import re
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Całe drzewo rdzeni solverów jest wykluczone ze skanu — to JEDYNE miejsce,
#: gdzie fizyka wolno liczyć (reguła NOT-A-SOLVER, CLAUDE.md). Osobno
#: wykluczony `network_model/pochodne/` — JEDYNE recenzowane miejsce dla
#: formuł z tego guarda (K4.1); leży SIOSTRZANO wobec `solvers/`, nie pod
#: nim (relokacja architekta 2026-09-06: `solvers/__init__.py` FROZEN
#: gorliwie ładuje rdzenie zależne od `network_model.core.graph.NetworkGraph`,
#: więc pod `solvers/` `pochodne/` nie mógłby być importowany na poziomie
#: modułu z `network_model/core/*.py` bez cyklu — patrz docstring modułu
#: `wielkosci_pochodne.py`).
WYKLUCZONY_PREFIKSY = ("network_model/solvers/", "network_model/pochodne/")

#: Allowlista (nie liczona, z powodem) — PUSTA (K4.4). Żadne miejsce poza
#: solverami/`pochodne/` nie ma sankcjonowanego prawa liczyć tych formuł.
ALLOWLIST: dict[str, str] = {}

#: Pomiar CV-4.3-A3 (2026-09-06, po przepięciu 59 miejsc na `pochodne/`):
#: zostaje WYŁĄCZNIE `application/reference_networks/computation.py`
#: (`_power_flow_newton_raphson`, `z_base = (base_kv**2)/base_mva` ×2 —
#: WŁASNA implementacja Newtona-Raphsona żyjąca poza solverami, dług
#: nazwany już w CV-4.3 inwentarzu A.2, nie K4) — pakiet `reference_networks`
#: kasowany w karcie A2 po odbiorze A1 (adnotacja A2, patrz `docs/
#: architecture/CANONICAL_TWIN_ARCHITECTURE.md` C.2.3 i `karta_cv43_a3.md`).
#: Nie jest to dług przeniesiony do `pochodne/`: cały plik znika w A2, więc
#: przenoszenie formuły z pliku przeznaczonego do kasacji byłoby pracą do
#: wyrzucenia. (`station_archetype_substrate.py::_SQRT3 = 3.0**0.5` NIE jest
#: tu wpisany: to bare przypisanie stałej, nigdy nie jest bezpośrednim
#: operandem mnożenia/dzielenia w TYM miejscu — K4.4 liczy rodzinę A tylko
#: „w mnożeniu/dzieleniu"; użycia `_SQRT3` gdzie indziej w tym pliku idą
#: przez nazwę zmiennej, nie przez świeże wyrażenie `sqrt(3)`/`3**0.5`.)
ZASTANE: dict[str, dict[str, int]] = {
    "application/reference_networks/computation.py": {"G_z_u2_s": 2},
}

_TIME_RE = re.compile(r"(^|_)(t|tk|time|czas)(_|$)", re.IGNORECASE)


def _dotted_name(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _dotted_name(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return None


def _num(node: ast.expr) -> float | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        if isinstance(node.value, bool):
            return None
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = _num(node.operand)
        return -inner if inner is not None else None
    return None


def _is_sqrt3_leaf(node: ast.expr) -> bool:
    """`sqrt(3)`/`sqrt(3.0)` (bare lub `math.`/`np.`/`cmath.` qualified),
    `3 ** 0.5`, albo literał w promieniu 1e-4 od √3 (warianty zaokrąglone
    zmierzone w inwentarzu: `1.7320508075688772`, itp.)."""
    if isinstance(node, ast.Call):
        fname = _dotted_name(node.func)
        if fname and fname.rsplit(".", 1)[-1] == "sqrt" and len(node.args) == 1:
            arg = _num(node.args[0])
            if arg is not None and abs(arg - 3.0) < 1e-9:
                return True
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
        base, exp = _num(node.left), _num(node.right)
        if base is not None and exp is not None:
            if abs(base - 3.0) < 1e-9 and abs(exp - 0.5) < 1e-9:
                return True
    literal = _num(node)
    if literal is not None and abs(literal - 3.0) > 1e-6 and abs(literal - 3.0**0.5) < 1e-4:
        return True
    return False


def _is_kappa_exp_shape(node: ast.expr) -> bool:
    """`exp(-3 * x)` (człon wykładniczy κ) albo `1.02 + 0.98 * (...)` (κ pełne)."""
    if isinstance(node, ast.Call):
        fname = _dotted_name(node.func)
        if fname and fname.rsplit(".", 1)[-1] == "exp" and len(node.args) == 1:
            arg = node.args[0]
            if isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Mult):
                for side in (arg.left, arg.right):
                    v = _num(side)
                    if v is not None and abs(v + 3.0) < 1e-9:
                        return True
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        for a, b in ((node.left, node.right), (node.right, node.left)):
            va = _num(a)
            if (
                va is not None
                and abs(va - 1.02) < 1e-9
                and isinstance(b, ast.BinOp)
                and isinstance(b.op, ast.Mult)
            ):
                for x in (b.left, b.right):
                    vx = _num(x)
                    if vx is not None and abs(vx - 0.98) < 1e-9:
                        return True
    return False


def _is_pow2(node: ast.expr) -> bool:
    return isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow) and _num(node.right) == 2.0


def _idents(node: ast.expr) -> list[str]:
    return [
        n.id if isinstance(n, ast.Name) else n.attr
        for n in ast.walk(node)
        if isinstance(n, ast.Name | ast.Attribute)
    ]


def _has_time_marker(node: ast.expr) -> bool:
    return any(_TIME_RE.search(name) for name in _idents(node))


def _is_i2t_shape(node: ast.expr) -> bool:
    """`x ** 2 * t` (całka Joule'a) — kwadrat razy wielkość CZASOWĄ (nazwa z
    markerem czasu), nie dowolny kwadrat razy współczynnik (odróżnia od
    regresji wielomianowych typu IEEE 1584 arc-flash, gdzie kwadrat mnoży się
    przez współczynnik tabelaryczny, nie przez czas)."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
        if _is_pow2(node.left) and _has_time_marker(node.right):
            return True
        if _is_pow2(node.right) and _has_time_marker(node.left):
            return True
    return False


def _contains_sub(node: ast.expr) -> bool:
    return any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Sub) for n in ast.walk(node))


def _is_temp_corr_shape(node: ast.expr) -> bool:
    """`1 + alpha * (theta - cokolwiek)` — korekta temperaturowa liniowa
    (IEC 60909-0: R_theta = R20*[1+alpha*(theta-20)]); wartość odejmowana
    (referencyjna, zwykle 20°C) NIE jest wymagana literałem — bywa nazwaną
    stałą (`REFERENCE_TEMPERATURE_C`), więc dopasowujemy KSZTAŁT, nie liczbę."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        for a, b in ((node.left, node.right), (node.right, node.left)):
            va = _num(a)
            if (
                va is not None
                and abs(va - 1.0) < 1e-9
                and isinstance(b, ast.BinOp)
                and isinstance(b.op, ast.Mult)
                and _contains_sub(b)
            ):
                return True
    return False


def _is_z_u2_s_shape(node: ast.expr) -> bool:
    """`u ** 2 / s` — impedancja/moc bazowa (Z=U²/S), kwadrat WPROST w liczniku
    dzielenia (nie ukryty w mnożeniu — te przypadki są formułami wieloczłonowymi
    IEC 60909 poza zakresem karty, patrz meldunek)."""
    return isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div) and _is_pow2(node.left)


def _walk_z_rodzicem(node: ast.AST, rodzic: ast.AST | None = None):
    yield node, rodzic
    for dziecko in ast.iter_child_nodes(node):
        yield from _walk_z_rodzicem(dziecko, node)


def zlicz_wzorce(tree: ast.AST) -> dict[str, int]:
    """Wzorce fizyki w drzewie AST, per rodzina. Rodzina A (√3) liczona
    WYŁĄCZNIE jako operand bezpośredni mnożenia/dzielenia (K4.4: „w mnożeniu/
    dzieleniu") — bez tego kwalifikatora bare literały (np. `1.5` gdzieś w
    kodzie) i przypadkowe zbieżności liczbowe fałszywie by trafiały."""
    licznik: Counter[str] = Counter()
    for node, rodzic in _walk_z_rodzicem(tree):
        if not isinstance(node, ast.expr):
            continue
        if (
            _is_sqrt3_leaf(node)
            and isinstance(rodzic, ast.BinOp)
            and isinstance(rodzic.op, ast.Mult | ast.Div)
        ):
            licznik["A_sqrt3"] += 1
        if _is_kappa_exp_shape(node):
            licznik["B_kappa_exp"] += 1
        if _is_i2t_shape(node):
            licznik["C_i2t_joule"] += 1
        if _is_temp_corr_shape(node):
            licznik["D_korekta_temperaturowa"] += 1
        if _is_z_u2_s_shape(node):
            licznik["G_z_u2_s"] += 1
    return dict(sorted(licznik.items()))


def zmierz(korzen: Path = BACKEND_SRC) -> dict[str, dict[str, int]]:
    pomiar: dict[str, dict[str, int]] = {}
    for plik in sorted(korzen.rglob("*.py")):
        wzgledna = plik.relative_to(korzen).as_posix()
        if wzgledna.startswith(WYKLUCZONY_PREFIKSY) or wzgledna in ALLOWLIST:
            continue
        try:
            tree = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        licznik = zlicz_wzorce(tree)
        if licznik:
            pomiar[wzgledna] = licznik
    return pomiar


def porownaj_z_zapadka(
    pomiar: dict[str, dict[str, int]], zapadka: dict[str, dict[str, int]]
) -> list[str]:
    bledy: list[str] = []
    for plik, licznik in sorted(pomiar.items()):
        zastane = zapadka.get(plik)
        if zastane is None:
            bledy.append(
                f"[dlug-urosl] {plik}: {licznik} — formula fizyczna poza "
                "network_model/solvers/** i network_model/pochodne/**; "
                "przenies do network_model/pochodne/wielkosci_pochodne.py"
            )
            continue
        for nazwa, ile in licznik.items():
            if ile > zastane.get(nazwa, 0):
                bledy.append(f"[dlug-urosl] {plik}: {nazwa} {zastane.get(nazwa, 0)} -> {ile}")
            elif ile < zastane.get(nazwa, 0):
                bledy.append(
                    f"[dlug-zmalal] {plik}: {nazwa} {zastane.get(nazwa, 0)} -> {ile} — obniz ZASTANE"
                )
        for nazwa in zastane:
            if nazwa not in licznik:
                bledy.append(f"[dlug-zmalal] {plik}: {nazwa} 0 wystapien — usun wpis z ZASTANE")
    for plik in sorted(zapadka):
        if plik not in pomiar:
            bledy.append(f"[dlug-zmalal] {plik}: 0 wystapien — usun wpis z ZASTANE")
    return bledy


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    dom = BACKEND_SRC / "network_model" / "pochodne"
    if not dom.exists():
        print("BLAD: brak podpakietu network_model/pochodne/")
        return 1
    pomiar = zmierz()
    razem = sum(sum(v.values()) for v in pomiar.values())
    razem_zapadka = sum(sum(v.values()) for v in ZASTANE.values())
    print(
        f"backend_no_physics_guard: {len(pomiar)} plikow z formulami poza "
        f"{', '.join(WYKLUCZONY_PREFIKSY)}, {razem} wzorcow (zapadka {razem_zapadka})"
    )
    if "--pomiar" in argv:
        for plik, licznik in sorted(pomiar.items()):
            print(f"  {plik}: {licznik}")
    bledy = porownaj_z_zapadka(pomiar, ZASTANE)
    if bledy:
        print("NARUSZENIA:")
        for blad in bledy:
            print("  " + blad)
        return 1
    print(
        "OK: zero formul fizycznych poza network_model/solvers/** i "
        "network_model/pochodne/** (zapadka zgodna z pomiarem)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

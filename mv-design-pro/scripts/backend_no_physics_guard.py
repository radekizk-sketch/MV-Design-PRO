#!/usr/bin/env python3
"""Guard: formuły fizyczne poza `network_model/solvers/**` i `network_model/pochodne/**`
(CV-4.3 K4, C.2.3).

Rodziny wykrywane (AST, nie grep — patrz karta `karta_cv43_a3.md`, K4.4, oraz
`KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md` §0.13 dla rodziny E):
√3 (`sqrt(3)`/`3**0.5`/literał `1.7320508...`) w mnożeniu/dzieleniu, κ IEC
60909 (`1.02 + 0.98*exp(...)` / `exp(-3*x)`), całka Joule'a I²t (`x**2 * t`,
gdzie `t` to wielkość czasowa — nazwa zawiera „t"/„tk"/„time"/„czas"), korekta
temperaturowa (`1 + alpha*(theta - cokolwiek)`), IDMT IEC 60255
t = TMS·A/(M^B−1) (`a / (m**b - 1)`, mianownik `Pow(*, *) − 1` z DOWOLNYM
wykładnikiem — inline albo przez zmienną lokalną, `math.pow(...)` też się
liczy), impedancja/moc bazowa Z = U²/S (`u**2 / s`, dzielenie z KWADRATEM
wprost w liczniku). Napis, komentarz i docstring NIE są liczone — to jest AST
wyrażeń, nie tekst.

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

#: Karta K2 (2026-09-09): `application/reference_networks/**` (w tym jedyny
#: pozostały wpis zapadki, `computation.py` — własna implementacja Newtona-
#: Raphsona, `z_base = (base_kv**2)/base_mva` ×2) skasowany w całości —
#: `station_archetype_substrate.py` przeniesiony do `backend/tests/` (poza
#: skanem tego guarda, `BACKEND_SRC`), reszta pakietu usunięta. Zapadka
#: opróżniona (może tylko maleć, nigdy wrócić w górę — nowy wpis oznaczałby
#: nowy dług, nie odzyskanie starego).
#: Pomiar W3-A (2026-09, po konsolidacji rodziny A IDMT §0.1 do
#: `compute_idmt_generic`): `application/analyses/protection/overcurrent/
#: calculator.py::_iec_ni_time` (`denominator = (ratio**0.02) - 1.0`, tylko
#: SI, V12K-189) jest CZWARTĄ implementacją IDMT z inwentarza W3 rodzina A —
#: W3-C KASUJE cały plik `overcurrent/**` razem z V12K-189 (§0.2/§0.11,
#: pipeline zapisu ma 0 wywołań produkcyjnych), więc migracja do
#: `pochodne/wielkosci_pochodne.py` byłaby pracą do wyrzucenia w kolejnej
#: podkarcie tej samej fali — TYMCZASOWY dług nazwany, nie cichy.
ZASTANE: dict[str, dict[str, int]] = {
    "application/analyses/protection/overcurrent/calculator.py": {"E_idmt_shape": 1},
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


def _is_pow_any_exponent(node: ast.expr) -> bool:
    """`x ** b` (DOWOLNY wykładnik — zmienna, literał różny od 2.0, wyrażenie)
    albo wywołanie `pow(x, b)` / `math.pow(x, b)` / `cmath.pow(x, b)`. W
    odróżnieniu od `_is_pow2` (rodzina C — wymaga literału 2.0 w `ast.BinOp`
    WYŁĄCZNIE), tu wykładnik jest DOWOLNY i wywołanie funkcyjne też się liczy
    — bo IDMT IEC 60255 ma wykładnik B zmienny per typ krzywej (0,02/1,0/2,0)
    i bywał zapisywany jako `math.pow(M, B)` (patrz rodzina E, karta W3-A)."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
        return True
    if isinstance(node, ast.Call):
        fname = _dotted_name(node.func)
        if fname and fname.rsplit(".", 1)[-1] == "pow" and len(node.args) == 2:
            return True
    return False


def _is_idmt_denominator_shape(
    expr: ast.expr, przypisania: dict[str, ast.expr] | None = None
) -> bool:
    """`M**B - 1` (wykładnik DOWOLNY, `math.pow(...)` też się liczy) —
    kształt MIANOWNIKA formuły IEC 60255 IDMT `t = TMS·A/(M^B−1)` (rodzina E,
    karta W3-A §0.1/§0.13). Kanon: `network_model/solvers/
    protection_iec60255.py::compute_idmt_generic` — JEDYNE miejsce, gdzie ten
    kształt wolno liczyć poza `pochodne/`. Różni się od rodziny G
    (`_is_z_u2_s_shape`, kwadrat w LICZNIKU dzielenia) tym, że tu potęga z
    odejmowaniem jedynki leży w MIANOWNIKU, i od rodziny C (`_is_i2t_shape`,
    mnożenie przez znacznik czasu) tym, że tu jest ODEJMOWANIE, nie mnożenie,
    a wykładnik NIE musi być literałem 2.0.

    `przypisania`, gdy podane, rozwiązuje DRUGI poziom pośredniości: strona
    potęgi (`expr.left`) bywa sama nazwą zmiennej przypisaną w OSOBNYM
    wyrażeniu (`m_power_b = math.pow(M, B)`, POTEM `denominator = m_power_b
    - 1.0`) — dokładnie kształt znaleziony w `domain/protection_engine_v1.py::
    iec_curve_time_seconds` (drugi silnik IDMT, B-01 STOP, patrz ZASTANE).
    Bez tego poziomu rozwiązania to konkretne miejsce byłoby niewidzialne dla
    guarda mimo identycznej fizyki co reszta rodziny E."""
    if not (isinstance(expr, ast.BinOp) and isinstance(expr.op, ast.Sub)):
        return False
    lewy = expr.left
    if isinstance(lewy, ast.Name) and przypisania and lewy.id in przypisania:
        lewy = przypisania[lewy.id]
    if not _is_pow_any_exponent(lewy):
        return False
    prawy = _num(expr.right)
    return prawy is not None and abs(prawy - 1.0) < 1e-9


def _walk_z_rodzicem(node: ast.AST, rodzic: ast.AST | None = None):
    yield node, rodzic
    for dziecko in ast.iter_child_nodes(node):
        yield from _walk_z_rodzicem(dziecko, node)


_ZASIEG_FUNKCJI = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def _walk_bez_zagniezdzonych_zasiegow(node: ast.AST):
    """Jak `ast.walk`, ale NIE wchodzi do ciał zagnieżdżonych
    FunctionDef/AsyncFunctionDef/Lambda — te mają WŁASNY zasięg zmiennych
    (osobny przebieg `_licz_idmt_w_pliku` odwiedzi je jako własne korzenie)."""
    for dziecko in ast.iter_child_nodes(node):
        yield dziecko
        if not isinstance(dziecko, _ZASIEG_FUNKCJI):
            yield from _walk_bez_zagniezdzonych_zasiegow(dziecko)


def _idmt_lokalne_przypisania(zasieg: ast.AST) -> dict[str, ast.expr]:
    """`nazwa -> ostatnie przypisane wyrażenie` dla PROSTYCH przypisań
    (`x = wyrażenie`, jeden cel typu `Name`) w BEZPOŚREDNIM zasięgu (funkcja
    albo moduł), bez schodzenia do zagnieżdżonych funkcji/lambd. Wystarcza do
    wykrycia wzorca `denominator = (m**b) - 1; ... a / denominator` — stylu
    użytego w 3 z 4 zdublowanych implementacji IDMT znalezionych w inwentarzu
    W3 rodzina A — bez pełnej analizy przepływu danych: fałszywe negatywy przy
    bardziej złożonym kodzie (rozgałęzienia, reassignment) są akceptowalne,
    bo poprawność formuł w strefie dozwolonej pilnują testy parytetu z
    podstawieniem do normy, NIE ten guard (patrz docstring modułu)."""
    przypisania: dict[str, ast.expr] = {}
    for wezel in _walk_bez_zagniezdzonych_zasiegow(zasieg):
        if (
            isinstance(wezel, ast.Assign)
            and len(wezel.targets) == 1
            and isinstance(wezel.targets[0], ast.Name)
        ):
            przypisania[wezel.targets[0].id] = wezel.value
    return przypisania


def _licz_idmt_w_zasiegu(zasieg: ast.AST) -> int:
    """Zlicz `A / (M**B - 1)` w JEDNYM zasięgu (funkcja albo moduł) —
    dzielenie, którego mianownik ma kształt rodziny E BEZPOŚREDNIO (inline)
    ALBO przez nazwę zmiennej przypisaną w TYM SAMYM zasięgu (patrz
    `_idmt_lokalne_przypisania`). Rodzina E jest jedyną z sześciu wymagającą
    świadomości zasięgu — pozostałe (A-D, G) dopasowują wyłącznie kształt
    inline w płaskim przejściu całego pliku (`zlicz_wzorce`)."""
    przypisania = _idmt_lokalne_przypisania(zasieg)
    total = 0
    for wezel in _walk_bez_zagniezdzonych_zasiegow(zasieg):
        if not (isinstance(wezel, ast.BinOp) and isinstance(wezel.op, ast.Div)):
            continue
        denom = wezel.right
        if isinstance(denom, ast.Name) and denom.id in przypisania:
            denom = przypisania[denom.id]
        if _is_idmt_denominator_shape(denom, przypisania):
            total += 1
    return total


def _licz_idmt_w_pliku(tree: ast.AST) -> int:
    """Suma trafień rodziny E po WSZYSTKICH zasięgach pliku: moduł (kod poza
    funkcjami) + każda funkcja/metoda, w tym zagnieżdżone (`ast.walk` trafia
    każdy `FunctionDef`/`AsyncFunctionDef` niezależnie od głębokości; każdy
    dostaje WŁASNY przebieg `_licz_idmt_w_zasiegu`, więc zagnieżdżenie nie
    powoduje ani podwójnego liczenia, ani przecieku zmiennych między
    zasięgami)."""
    total = _licz_idmt_w_zasiegu(tree)
    for wezel in ast.walk(tree):
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            total += _licz_idmt_w_zasiegu(wezel)
    return total


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
    # Rodzina E: jedyna wymagająca świadomości zasięgu (przypisanie do
    # zmiennej lokalnej, potem użycie w dzieleniu) — osobny przebieg, nie
    # płaski `_walk_z_rodzicem` powyżej (patrz `_licz_idmt_w_pliku`).
    idmt = _licz_idmt_w_pliku(tree)
    if idmt:
        licznik["E_idmt_shape"] += idmt
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

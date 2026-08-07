#!/usr/bin/env python3
"""
CI Guard: no_direct_fault_params_guard.py — PR-19, przepisany na AST (V12K-306),
rozszerzony o formy pośrednie i zapadkę liczoną na WYWOŁANIE (audyt 2026-08-01, defekt H).

Inwariant: parametry zwarcia trafiają do solvera WYŁĄCZNIE przez kanoniczne
wiązanie FaultScenario, a nie jako surowy identyfikator węzła wstrzykiwany
z warstwy API/analiz.

Wykrywa (analiza składni, nie dopasowanie tekstu):
  A. Wywołanie funkcji/metody WARSTWY SOLVERA z argumentem kluczowym
     `fault_node_id=`.  Adresat rozwiązywany po imporcie (`network_model.solvers`,
     `analysis.machine_short_circuit`) ORAZ po drodze pośredniej (niżej), więc
     odczyt `result.fault_node_id`, kolumna ORM, literał w słowniku, docstring
     i nazwa pola DTO nie są trafieniami Z KONSTRUKCJI REGUŁY — bez żadnej
     białej listy dla warstwy odczytu wyniku.  Budowa obiektu danych (klasa
     CamelCase, `cls(...)`) odtwarza wynik, który JUŻ istnieje, więc nie jest
     wejściem w fizykę.
  B. Wywołanie `execute_short_circuit` albo `_execute_short_circuit` poza
     warstwą wiązania — również przez nazwę pośrednią.  Definicja funkcji
     (`def`) naruszeniem nie jest — naruszeniem jest jej wołanie z pominięciem
     kanonicznej ścieżki.
  C. Przekazanie identyfikatora POZYCYJNIE do funkcji warstwy solvera, której
     sygnatura deklaruje parametr `fault_node_id`.  Pozycja parametru jest
     ODCZYTYWANA Z KODU solvera (`solver_signature_index`), a nie zapisana w
     bramce — dzięki temu zmiana sygnatury nie rozbraja reguły po cichu.
     Pomiar 2026-08-01: 15 funkcji warstwy solvera deklaruje `fault_node_id`,
     każda na pozycji 1 (po pominięciu `self`/`cls`); w `backend/src` jest
     5 zastanych wywołań pozycyjnych (wszystkie `compute_machine_contributions`,
     wszystkie w plikach z zapadki — objęte budżetem).

FORMY POŚREDNIE (rozszerzenie z audytu 2026-08-01, defekt H / znalezisko P8).
Przed rozszerzeniem adresat był rozpoznawany wyłącznie przez najbardziej lewą
NAZWĘ wyrażenia, więc trzy zwykłe formy wołania TEGO SAMEGO adresata przechodziły
bez sygnału (zmierzone: 3 iniekcje w pliku bez wykluczeń -> RC=0):
  * zmienna pośrednia — `solver = ShortCircuitIEC60909Solver` /
    `f = compute_3ph_short_circuit`, potem `solver.compute_3ph_short_circuit(...)`
    albo `f(...)`;
  * element kolekcji (tablica dyspozycji) —
    `_DYSPOZYTOR = {"3F": ShortCircuitIEC60909Solver.compute_3ph_short_circuit}`,
    potem `_DYSPOZYTOR["3F"](...)`;
  * atrybut instancji i wywołanie na instancji —
    `self._solver = ShortCircuitIEC60909Solver` + `self._solver.compute_...(...)`
    oraz `ShortCircuitIEC60909Solver().compute_3ph_short_circuit(...)`.
Referencja jest propagowana po przypisaniach (`=`, `:=`, adnotowane, cel w krotce
/ liście / indeksie, atrybut, cel pętli `for`, wartość domyślna parametru) aż do
punktu stałego, w obrębie JEDNEGO pliku.  Propagacja jest świadomie nadmiarowa
(bez rozdzielania zasięgów funkcji): dla bramki bezpieczniejszy jest fałszywy
alarm niż cicha dziura, a zasięg pliku ogranicza jego skutek.
Rozróżnienie referencja vs wynik: `x = Solver()` NIESIE referencję (metody
statyczne są osiągalne przez instancję), a `x = Solver.compute_3ph(...)` NIE —
to już policzony wynik, na którym odczyt `fault_node_id` jest legalny.

GRANICE BRAMKI — czego ta detekcja NIE wykrywa (jawnie, zamiast cicho):
  1. Opakowanie identyfikatora w obiekt wejściowy (`Wejscie(fault_node_id=...)`,
     potem `solve(wejscie)`): budowa DTO jest z definicji dozwolona (odtwarza
     dane, które już istnieją), a samo wywołanie nie niesie ani argumentu
     kluczowego, ani identyfikatora na pozycji z sygnatury.
  2. Przepływ MIĘDZY funkcjami: referencja solvera przekazana jako ARGUMENT
     wywołania (`uruchom(solver=Solver.compute_3ph)`) albo zwrócona z fabryki
     (`return Solver.compute_3ph`) — rozwiązanie wymagałoby analizy
     międzyproceduralnej.  Wartość DOMYŚLNA parametru jest wykrywana.
  3. Adresowanie dynamiczne, w którym nazwa celu nie istnieje w drzewie składni:
     `getattr(Solver, nazwa)(...)`, `importlib.import_module(...)`, rejestr
     zapełniany w czasie wykonania, rozpakowanie `f(*argumenty)`.  Pomiar
     2026-08-01: 0 wywołań `getattr` na module/klasie warstwy solvera w
     `backend/src`.
  4. Przepływ MIĘDZY plikami: kontener albo atrybut zapełniony referencją
     w INNYM module (`rejestr.py: REJESTR["3F"] = Solver.compute_3ph`,
     `uzycie.py: REJESTR["3F"](...)`) — rozwiązanie referencji jest per plik.
  5. Parametr węzła zwarcia nazwany w sygnaturze solvera INACZEJ niż
     `fault_node_id` — inwariant jest zdefiniowany na tej jednej nazwie
     (reguła A po nazwie argumentu, reguła C po nazwie parametru sygnatury).
  6. Wykonanie z napisu (`eval`, `exec`, `compile`) — poza zasięgiem analizy
     składni z założenia.

Dozwolone lokalizacje: warstwa wiązania (WHITELISTED_PATHS), warstwa solvera
(SOLVER_LAYER_PREFIXES), testy i skrypty.

ZAPADKA (LEGACY_DIRECT_SOLVER_CALLERS) wiąże KONKRETNE zastane WYWOŁANIA, nie
pliki: dla każdego pliku trzyma budżet w postaci `{"<reguła>:<adresat>": liczba}`
zmierzoną na stanie zamrożenia.  Plik z zapadki jest normalnie parsowany i
liczony; NADWYŻKA ponad budżet to naruszenie, więc nowe wejście w solver w
`enm/canonical_analysis.py` zapala CI tak samo jak w pliku spoza listy.
Zapadka działa W OBIE STRONY (konwencja `mypy_ratchet_guard.py`): gdy wywołań
UBĘDZIE, bramka też jest czerwona i żąda obniżenia budżetu — inaczej poprawa nie
zostaje utrwalona i dług wraca po cichu.  Wpis z pustym budżetem (`{}`) znaczy:
plik figuruje na historycznej liście, ale dziś nie ma ANI JEDNEGO bezpośredniego
wejścia w solver — każde nowe jest naruszeniem.

Exit 0 = PASS, Exit 1 = FAIL.
An EMPTY SCAN (missing scan root or 0 inspected files) is a FAIL, not a PASS:
a guard that looks at nothing must never report green.
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from collections.abc import Iterator
from pathlib import Path

# Korzeń źródeł backendu.
# UWAGA (V12K-306 / audyt 2026-08-01, defekt D3): ten plik leży w
# <repo>/mv-design-pro/scripts/, więc parent.parent to JUŻ <repo>/mv-design-pro.
# Historyczna stała doklejała drugi segment "mv-design-pro" i kierowała skan do
# katalogu, który nigdy nie istniał — bramka skanowała 0 plików i kończyła się
# kodem 0 od dnia powstania.  Nie przywracaj zdublowanego segmentu.
# Stała BACKEND_TESTS została USUNIĘTA (V12K-306): skan testów nie jest treścią
# inwariantu, bo testy z definicji wołają solvery bezpośrednio.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Moduły warstwy solvera — callee zaimportowany stąd to wejście w fizykę.
SOLVER_MODULE_PREFIXES = ("network_model.solvers", "analysis.machine_short_circuit")

#: Warstwa solvera po ścieżce pliku: `fault_node_id` jest tam nazwą parametru
#: WŁASNEJ sygnatury i wewnętrznym wywołaniem fizyki, nie iniekcją z zewnątrz.
SOLVER_LAYER_PREFIXES = ("network_model/solvers/", "analysis/machine_short_circuit/")

#: Nazwy wywołań kanonicznego wiązania (naruszenie B).
BINDING_CALL_NAMES = frozenset({"execute_short_circuit", "_execute_short_circuit"})

#: Nazwa parametru, na której stoi cały inwariant.
FAULT_NODE_PARAM = "fault_node_id"

#: Kanoniczna warstwa wiązania FaultScenario — tu parametry zwarcia mają prawo
#: powstawać i przechodzić do solvera.
WHITELISTED_PATHS = {
    "domain/fault_scenario.py",
    "application/solvers/short_circuit_binding.py",
    "application/execution_engine/service.py",
    "application/result_mapping/short_circuit_to_resultset_v1.py",
    "application/fault_scenario_service.py",
}

#: ZAPADKA zastanych WYWOŁAŃ (stan zamrożony w V12K-306, przeliczony w audycie
#: 2026-08-01 przy zamykaniu defektu H / znaleziska N2).
#: Klucz: ścieżka pliku względem `backend/src`.  Wartość: budżet zastanych wejść
#: w solver w postaci `{"<reguła>:<adresat>": liczba}` — dokładnie tyle, ile
#: plik miał w chwili zamrożenia.  NADWYŻKA = naruszenie, NIEDOBÓR = żądanie
#: obniżenia budżetu (zapadka w obie strony).  Konsolidacja tych ścieżek do
#: jednego wiązania to OSOBNY dług architektoniczny prowadzony w rejestrze — nie
#: wolno go tutaj cicho zamykać.
#: Historia: przed 2026-08-01 wykluczenie działało na PLIK i wracało PRZED
#: parsowaniem, więc liczba bezpośrednich wejść w tych dziesięciu plikach mogła
#: rosnąć bez sygnału (zmierzone: piąte wejście dopisane do
#: `enm/canonical_analysis.py` -> RC=0).  Obietnica „lista ZAMKNIĘTA: KAŻDE NOWE
#: miejsce = naruszenie" była prawdziwa tylko na poziomie NAZWY PLIKU.
#: Pomiar zamrożenia (2026-08-01): 13 wejść regułami A/B + 5 wejść regułą C.
#: Wpisy `C:` to formy, których poprzednia detekcja NIE WIDZIAŁA W OGÓLE — dopisanie
#: ich do budżetu nie poszerza wyjątku, tylko po raz pierwszy go WIĄŻE: wcześniej
#: liczba wywołań pozycyjnych mogła rosnąć w KAŻDYM pliku repozytorium.
LEGACY_DIRECT_SOLVER_CALLERS: dict[str, dict[str, int]] = {
    # `api/case_runs.py` usunięty kartą BATCH-ROUTER (2026-08-07) — fantomowy,
    # nigdy niewpięty magazyn biegów; wpis zapadki zdjęty razem z plikiem
    # (rejestr może tylko MALEĆ).
    "api/fault_loop.py": {},
    "api/proof_pack.py": {
        "C:compute_machine_contributions": 1,
    },
    "application/analyses/fault_loop/service.py": {},
    "application/analysis_run/service.py": {
        "A:compute_1ph_short_circuit": 1,
        "A:compute_2ph_ground_short_circuit": 1,
        "A:compute_2ph_short_circuit": 1,
        "A:compute_3ph_short_circuit": 1,
        "C:compute_machine_contributions": 1,
    },
    "application/network_wizard/service.py": {},
    "application/proof_engine/packs/sc_symmetrical.py": {
        "A:compute_3ph_short_circuit": 1,
        "C:compute_machine_contributions": 1,
    },
    "application/reference_networks/computation.py": {
        "A:compute_2ph_short_circuit": 1,
        "A:compute_3ph_short_circuit": 1,
    },
    "application/reference_networks/station_archetype_substrate.py": {
        "A:compute_3ph_short_circuit": 1,
        "C:compute_machine_contributions": 2,
    },
    "enm/canonical_analysis.py": {
        "A:compute_1ph_short_circuit": 1,
        "A:compute_2ph_ground_short_circuit": 1,
        "A:compute_2ph_short_circuit": 1,
        "A:compute_3ph_short_circuit": 1,
        "B:_execute_short_circuit": 1,
    },
}


#: Pamięć podręczna mapy sygnatur (klucz: korzeń skanowania). Budowa mapy parsuje
#: całą warstwę solvera, więc bez pamięci kosztowałaby tyle razy, ile plików skanujemy.
_SIGNATURE_CACHE: dict[Path, dict[str, int]] = {}


def relative_to_backend(filepath: Path) -> str | None:
    """Ścieżka względem korzenia skanowania albo None, gdy pliku nie da się odnieść."""
    try:
        return filepath.relative_to(BACKEND_SRC).as_posix()
    except ValueError:
        return None


def is_whitelisted(filepath: Path) -> bool:
    """Czy plik jest poza zakresem inwariantu.

    UWAGA: zapadka zastanych wywołań NIE jest tutaj.  Plik z
    `LEGACY_DIRECT_SOLVER_CALLERS` jest normalnie parsowany, a jego wywołania
    liczone wobec budżetu — wcześniejszy powrót przed parsowaniem był właśnie tym
    mechanizmem, który pozwalał zapadce cicho rosnąć.
    """
    # Testy i skrypty są zawsze dozwolone.
    absolute = str(filepath)
    if "/tests/" in absolute or "/scripts/" in absolute:
        return True

    # Plik, którego nie da się wyrazić względem korzenia skanowania, NIE jest
    # białolistowany: połknięcie ValueError bieliło KAŻDY plik, gdy korzeń był
    # zepsuty (druga warstwa pustki defektu D3). Reguła fail-closed.
    rel = relative_to_backend(filepath)
    if rel is None:
        return False

    if any(rel.startswith(prefix) for prefix in SOLVER_LAYER_PREFIXES):
        return True
    return rel in WHITELISTED_PATHS


def solver_signature_index() -> dict[str, int]:
    """Mapa: nazwa funkcji warstwy solvera -> POZYCJA parametru `fault_node_id`.

    Czytana Z KODU warstwy solvera (pamięć podręczna per korzeń skanowania), a nie
    zapisana w bramce: ręczna lista sygnatur milczałaby po zmianie kolejności
    parametrów, czyli dokładnie wtedy, kiedy reguła C jest najbardziej potrzebna.
    `self`/`cls` jest pomijane, bo przy wywołaniu przez klasę albo instancję Python
    wiąże je poza listą argumentów wywołania.  Kolizja nazw o różnych pozycjach
    rozstrzygana jest na korzyść WYKRYWANIA (pozycja najmniejsza).
    """
    root = BACKEND_SRC
    cached = _SIGNATURE_CACHE.get(root)
    if cached is not None:
        return cached

    signatures: dict[str, int] = {}
    for prefix in SOLVER_LAYER_PREFIXES:
        for path in sorted((root / prefix).rglob("*.py")):
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except (OSError, UnicodeDecodeError, SyntaxError):
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                    continue
                params = [arg.arg for arg in node.args.posonlyargs + node.args.args]
                if params and params[0] in {"self", "cls"}:
                    params = params[1:]
                if FAULT_NODE_PARAM not in params:
                    continue
                index = params.index(FAULT_NODE_PARAM)
                zastane = signatures.get(node.name)
                signatures[node.name] = index if zastane is None else min(zastane, index)

    _SIGNATURE_CACHE[root] = signatures
    return signatures


def solver_aliases(tree: ast.AST) -> set[str]:
    """Nazwy lokalne (funkcje, klasy, moduły) zaimportowane z warstwy solvera."""
    aliases: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if any(
                module == prefix or module.startswith(prefix + ".")
                for prefix in SOLVER_MODULE_PREFIXES
            ):
                for alias in node.names:
                    aliases.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if any(
                    alias.name == prefix or alias.name.startswith(prefix + ".")
                    for prefix in SOLVER_MODULE_PREFIXES
                ):
                    aliases.add(alias.asname or alias.name.split(".")[0])
    return aliases


def callee_name(call: ast.Call) -> str:
    """Nazwa wołanego obiektu (`f()` -> `f`, `a.b.f()` -> `f`, `D["3F"]()` -> `D['3F']`)."""
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return ast.unparse(call.func)


def is_data_construction(call: ast.Call) -> bool:
    """Czy to budowa obiektu danych, a nie wejście w obliczenie.

    Klasa (nazwa CamelCase) albo `cls(...)` w metodzie klasowej odtwarza DTO,
    wiersz ORM lub model żądania z danych, które JUŻ istnieją — to nie jest
    wstrzyknięcie parametru do fizyki.  Wyrażenie złożone (indeks kontenera,
    wynik wywołania) nazwą klasy nie jest, więc nigdy nie korzysta z tego
    wyjątku — inaczej tablica dyspozycji o nazwie WIELKĄ literą (`DYSPOZYTOR["3F"]`)
    wychodziłaby z zakresu reguły przez sam swój zapis.
    """
    if isinstance(call.func, ast.Name):
        name = call.func.id
    elif isinstance(call.func, ast.Attribute):
        name = call.func.attr
    else:
        return False
    return name == "cls" or name[:1].isupper()


def carries_ref(expr: ast.expr, names: set[str], attrs: set[str]) -> bool:
    """Czy WYRAŻENIE ADRESATA sięga referencji z `names`/`attrs`.

    Rozwijane formy: `x`, `x.a.b`, `x[...]`, `x(...)` (wywołanie na instancji),
    `await x`.  Warunkiem trafienia pozostaje korzeń: nazwa musi być referencją
    warstwy solvera, więc `slownik[klucz](fault_node_id=...)` na zwykłym słowniku
    trafieniem nie jest.
    """
    while True:
        if isinstance(expr, ast.Name):
            return expr.id in names
        if isinstance(expr, ast.Attribute):
            if expr.attr in attrs:
                return True
            expr = expr.value
        elif isinstance(expr, ast.Call):
            expr = expr.func
        elif isinstance(expr, ast.Subscript | ast.Await | ast.Starred):
            expr = expr.value
        else:
            return False


def value_carries_ref(value: ast.expr, names: set[str], attrs: set[str]) -> bool:
    """Czy PRZYPISYWANA WARTOŚĆ niesie referencję (a nie policzony wynik).

    Kontener literalny niesie referencję, gdy niesie ją którykolwiek element —
    stąd tablica dyspozycji.  Wywołanie niesie referencję TYLKO jako utworzenie
    instancji (`Solver()`); zwykłe wywołanie (`Solver.compute_3ph(...)`) zwraca
    WYNIK, a odczyt wyniku jest legalny i nie może zarazić nazwy.
    """
    if isinstance(value, ast.Tuple | ast.List | ast.Set):
        return any(value_carries_ref(element, names, attrs) for element in value.elts)
    if isinstance(value, ast.Dict):
        return any(
            item is not None and value_carries_ref(item, names, attrs) for item in value.values
        )
    if isinstance(value, ast.Call):
        return is_data_construction(value) and carries_ref(value.func, names, attrs)
    return carries_ref(value, names, attrs)


def bind_target(target: ast.expr, names: set[str], attrs: set[str]) -> bool:
    """Zapisz cel przypisania jako nośnik referencji; zwróć, czy coś przybyło."""
    if isinstance(target, ast.Name):
        if target.id in names:
            return False
        names.add(target.id)
        return True
    if isinstance(target, ast.Attribute):
        if target.attr in attrs:
            return False
        attrs.add(target.attr)
        return True
    if isinstance(target, ast.Subscript):
        # `REJESTR["3F"] = Solver.compute_3ph` — nośnikiem staje się kontener.
        return bind_target(target.value, names, attrs)
    if isinstance(target, ast.Tuple | ast.List):
        return any(bind_target(element, names, attrs) for element in target.elts)
    if isinstance(target, ast.Starred):
        return bind_target(target.value, names, attrs)
    return False


def default_bindings(args: ast.arguments) -> Iterator[tuple[str, ast.expr]]:
    """Pary (nazwa parametru, wartość domyślna) — statyczne, więc rozwiązywalne."""
    positional = args.posonlyargs + args.args
    if args.defaults:
        for arg, default in zip(positional[-len(args.defaults) :], args.defaults, strict=True):
            yield arg.arg, default
    for arg, kw_default in zip(args.kwonlyargs, args.kw_defaults, strict=True):
        if kw_default is not None:
            yield arg.arg, kw_default


def propagate_refs(tree: ast.AST, names: set[str], attrs: set[str]) -> None:
    """Rozszerz zbiory nośników referencji do punktu stałego (w obrębie pliku)."""
    bindings: list[tuple[ast.expr, ast.expr]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            bindings.extend((target, node.value) for target in node.targets)
        elif isinstance(node, ast.AnnAssign):
            if node.value is not None:
                bindings.append((node.target, node.value))
        elif isinstance(node, ast.NamedExpr):
            bindings.append((node.target, node.value))
        elif isinstance(node, ast.For):
            bindings.append((node.target, node.iter))
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            for nazwa, default in default_bindings(node.args):
                bindings.append((ast.Name(id=nazwa, ctx=ast.Store()), default))

    changed = True
    while changed:
        changed = False
        for target, value in bindings:
            if value_carries_ref(value, names, attrs) and bind_target(target, names, attrs):
                changed = True


def solver_reference_sets(tree: ast.AST) -> tuple[set[str], set[str]]:
    """Nośniki referencji do warstwy solvera: (nazwy, atrybuty)."""
    names = solver_aliases(tree)
    attrs: set[str] = set()
    if names:
        propagate_refs(tree, names, attrs)
    return names, attrs


def binding_reference_sets(tree: ast.AST) -> tuple[set[str], set[str]]:
    """Nośniki referencji do kanonicznego wiązania: (nazwy, atrybuty)."""
    names = set(BINDING_CALL_NAMES)
    attrs = set(BINDING_CALL_NAMES)
    propagate_refs(tree, names, attrs)
    return names, attrs


def collect_findings(tree: ast.AST, filepath: Path) -> list[tuple[str, int, str]]:
    """Znaleziska w jednym drzewie: (sygnatura, wiersz, komunikat)."""
    solver_names, solver_attrs = solver_reference_sets(tree)
    binding_names, binding_attrs = binding_reference_sets(tree)
    signatures = solver_signature_index()

    findings: list[tuple[str, int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue

        name = callee_name(node)
        adresat = ast.unparse(node.func)
        wejscie_w_solver = carries_ref(node.func, solver_names, solver_attrs) and (
            not is_data_construction(node)
        )
        wezel_po_nazwie = any(keyword.arg == FAULT_NODE_PARAM for keyword in node.keywords)

        if wejscie_w_solver and wezel_po_nazwie:
            findings.append(
                (
                    f"A:{name}",
                    node.lineno,
                    f"  {filepath}:{node.lineno}: iniekcja 'fault_node_id=' do wywolania "
                    f"warstwy solvera '{name}' poza warstwa wiazania FaultScenario "
                    f"(adresat: {adresat})",
                )
            )

        pozycja = signatures.get(name)
        if (
            wejscie_w_solver
            and not wezel_po_nazwie
            and pozycja is not None
            and pozycja < len(node.args)
        ):
            findings.append(
                (
                    f"C:{name}",
                    node.lineno,
                    f"  {filepath}:{node.lineno}: iniekcja identyfikatora wezla POZYCYJNIE "
                    f"(argument nr {pozycja + 1}, sygnatura solvera '{name}') poza warstwa "
                    f"wiazania FaultScenario (adresat: {adresat})",
                )
            )

        if carries_ref(node.func, binding_names, binding_attrs):
            findings.append(
                (
                    f"B:{name}",
                    node.lineno,
                    f"  {filepath}:{node.lineno}: bezposrednie wywolanie '{name}' "
                    f"poza warstwa wiazania FaultScenario (adresat: {adresat})",
                )
            )

    return findings


def apply_ratchet(
    filepath: Path,
    findings: list[tuple[str, int, str]],
    budget: dict[str, int],
) -> list[str]:
    """Porównaj znaleziska pliku z zapadki z jego budżetem zastanych wywołań."""
    violations: list[str] = []
    licznik = Counter(signature for signature, _, _ in findings)

    for signature in sorted(set(licznik) | set(budget)):
        znalezione = licznik.get(signature, 0)
        dozwolone = budget.get(signature, 0)
        if znalezione == dozwolone:
            continue

        wiersze = ", ".join(
            str(lineno)
            for sig, lineno, _ in sorted(findings, key=lambda f: f[1])
            if sig == signature
        )
        if znalezione > dozwolone:
            violations.append(
                f"  {filepath}: zapadka zastanych wywolan '{signature}': budzet {dozwolone}, "
                f"znaleziono {znalezione} (wiersze: {wiersze or 'brak'}). NOWE bezposrednie "
                "wejscie w solver w pliku z zapadki jest naruszeniem — uzyj kanonicznego "
                "wiazania FaultScenario."
            )
        else:
            violations.append(
                f"  {filepath}: zapadka zastanych wywolan '{signature}': budzet {dozwolone}, "
                f"znaleziono {znalezione} (wiersze: {wiersze or 'brak'}). Dlug ZMALAL — obniz "
                "budzet w LEGACY_DIRECT_SOLVER_CALLERS, inaczej poprawa nie zostaje utrwalona."
            )

    return violations


def check_file(filepath: Path) -> list[str]:
    """Naruszenia w jednym pliku (pusta lista = plik czysty)."""
    violations: list[str] = []

    if filepath.suffix != ".py":
        return violations

    if is_whitelisted(filepath):
        return violations

    try:
        source = filepath.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    try:
        tree = ast.parse(source, filename=str(filepath))
    except SyntaxError as exc:
        # Plik liczy się jako obejrzany; ostrzeżenie zamiast wywrócenia bramki.
        print(f"WARN: {filepath}:{exc.lineno}: nie da sie sparsowac ({exc.msg})")
        return violations

    findings = collect_findings(tree, filepath)

    rel = relative_to_backend(filepath)
    budget = LEGACY_DIRECT_SOLVER_CALLERS.get(rel) if rel is not None else None
    if budget is not None:
        return apply_ratchet(filepath, findings, budget)

    return [message for _, _, message in findings]


def main() -> int:
    violations: list[str] = []

    if not BACKEND_SRC.exists():
        print(f"FAIL: Backend source directory not found: {BACKEND_SRC}")
        print("A guard that cannot reach its scan root is a false green — fix the path.")
        return 1

    # Reguła C stoi na sygnaturach czytanych z warstwy solvera. Gdy warstwa istnieje,
    # ale nie oddaje ani jednej sygnatury z `fault_node_id`, mapa jest pusta i reguła
    # milczy — to byłaby cicha dziura, więc bramka mówi to wprost i pada.
    signatures = solver_signature_index()
    warstwa_solvera_istnieje = any(
        (BACKEND_SRC / prefix).is_dir() for prefix in SOLVER_LAYER_PREFIXES
    )
    if warstwa_solvera_istnieje and not signatures:
        print("FAIL: Warstwa solvera nie oddala ani jednej sygnatury z 'fault_node_id'.")
        print("Regula C (iniekcja pozycyjna) bylaby martwa — napraw mape sygnatur.")
        return 1

    scanned = 0
    for py_file in sorted(BACKEND_SRC.rglob("*.py")):
        scanned += 1
        violations.extend(check_file(py_file))

    print(f"Scanned {scanned} Python file(s) under {BACKEND_SRC}.")

    if scanned == 0:
        print("FAIL: Empty scan — 0 files inspected. An empty guard proves nothing.")
        return 1

    if violations:
        print("FAIL: Direct fault parameter usage detected outside whitelisted modules:")
        for violation in sorted(violations):
            print(violation)
        print(f"\n{len(violations)} violation(s) found.")
        print("Use FaultScenario domain objects instead of raw fault parameters.")
        return 1

    print("PASS: No direct fault parameter violations found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

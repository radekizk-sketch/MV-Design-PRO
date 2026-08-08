#!/usr/bin/env python3
"""
CI Guard: solver_input_substitute_guard.py — karta QU-FABRYKACJA (2026-08-08).

Inwariant: gdy DANA WEJSCIOWA jest nieobecna, warstwa solvera MELDUJE BRAK albo
POMIJA element — nie podstawia w jej miejsce liczby, ktora idzie dalej do arytmetyki.

PO CO TA BRAMKA (pomiar, nie przekonanie). Karta QU-FABRYKACJA usunela siedem
stalych podstawianych za dane wejsciowe i nazwala dziewiec dalszych jako dlug.
Nadzorca sprawdzil naprawe INIEKCJA i pokazal, ze jest INWENTARZOWA, a nie
zabezpieczona: dopisanie NOWEGO zastepnika w SASIEDNIEJ funkcji tego samego pliku
(`_power_quality`: `harmonic = f_hz / (model.base_frequency_hz or 50.0)`) przeszlo
26 z 26 testow nowego pliku karty i 114 testow rodziny V12.6 na zielono. Pin
roznicowy 50/60 Hz tego nie widzi, bo uspiony `or` odpala sie tylko przy wartosci
falsy, a w testach jej nie ma. Naprawiono siedem pozycji, ale nic nie stalo na
drodze pozycji dziesiatej.

DOWOD, ZE KLASA JEST REALNA — TEN SAM PLIK, TA SAMA DANA, DWA ZACHOWANIA:
  * `v126_academic.py` w. 249 (`_grid_source_shunt_admittance`):
        if not bus.fault_level_mva:
            continue                      # UCZCIWIE pomija wezel bez danej
  * `v126_academic.py` (`_voltage_stability`, przed karta):
        fault_level = bus.fault_level_mva or max(25.0, bus.nominal_kv * 10.0)
                                          # PODSTAWIA 150 MVA dla szyny 15 kV
Pole `fault_level_mva` jest podane dla 1 z 315 szyn sieci odniesienia, wiec druga
forma zmyslala wejscie dla 99,7 % wezlow. Roznica miedzy tymi dwoma wierszami jest
dokladnie tym, co ta bramka mierzy.

CO WYKRYWA (analiza skladni, nie dopasowanie tekstu)
----------------------------------------------------
Trafieniem jest ODCZYT POLA KONTRAKTU WEJSCIOWEGO z GALEZIA ZAPASOWA LICZBOWA:
  A. `<obiekt>.<pole> or <wyrazenie liczbowe>`
  B. `... <obiekt>.<pole> ... if <warunek> else <wyrazenie liczbowe>`
  C. `getattr(<obiekt>, "<pole>", <wyrazenie liczbowe>)`

Dwa warunki musza zajsc RAZEM i oba sa czytane Z KODU, nie z listy w bramce:

1. `<pole>` jest POLEM ZADEKLAROWANYM w modelu wejsciowym — zbior pol powstaje
   z adnotacji klas w `solver_input/**` i `enm/models.py` (`contract_fields`).
   Dzieki temu odczyt slownika (`parameters.get("H", 1.0)`, `entry.get("step_norm", 0)`)
   NIE JEST trafieniem Z KONSTRUKCJI REGULY, a nie przez wyjatek w komentarzu:
   klucz slownika nie jest zadeklarowanym polem kontraktu. To rozroznienie realizuje
   wymog „parametr projektowy z kontrolka w oknie nie wchodzi do budzetu" —
   parametry projektowe docieraja przez `model.parameters`, czyli slownik, a ich
   parytet z kontrolkami pilnuje OSOBNY, istniejacy mechanizm
   (`backend/tests/ci/test_v126_rodzaje_parytet.py::test_kazdy_czytany_parametr_ma_kontrolke`).
   Bramka nie powtarza tamtej roboty (reuzycie zamiast duplikacji).

2. Galaz zapasowa jest WYRAZENIEM LICZBOWYM (`is_numeric`) — stala, dzialanie
   arytmetyczne, `float/int/abs/max/min/round`. Galaz `None` NIE jest trafieniem,
   bo `None` to wlasnie uczciwy meldunek braku; napis i wartosc logiczna tez nie,
   bo nie wchodza do arytmetyki fizyki. Pomiar tej granicy: bez niej skan warstwy
   solverow daje 40 trafien, z czego 26 to formy UCZCIWE albo niefizyczne
   (`... if ... else None`, nazwa do wyswietlenia, flaga `in_service`, sposob
   uziemienia jako napis) — budzet, w ktorym dwie trzecie pozycji to falszywe
   alarmy, uczy ludzi ignorowac bramke i zamraza poprawne konstrukcje.
   Z granica: 14 trafien w warstwie solverow, wszystkie realne.

GRANICE BRAMKI — czego ta detekcja NIE wykrywa (jawnie, zamiast cicho)
----------------------------------------------------------------------
 1. **Naga stala w dzialaniu** — `0.15 * z`, `0.45 ** 2`, `0.12 * saifi`,
    `mcov * 2.8`, `betavariate(5, 2)`. Skladniowo nierozroznialne od stalej
    normowej (`0.157` z rownan IEEE 80) i od parametru metody: obie sa literalem
    w wyrazeniu. Rozstrzyga TYLKO czlowiek, wiec te pozycje sa nazwane imiennie
    w `docs/audit/INWENTARZ_STALYCH_V126_2026-08-08.md`, a nie w budzecie tej
    bramki. To jest najwazniejsza granica: **budzet ponizej NIE pokrywa dziewieciu
    dlugow karty QU-FABRYKACJA** — one naleza do tej drugiej, niedetekowalnej
    formy. Twierdzenie odwrotne byloby falszywa pewnoscia.
 2. **Podloga i sufit na danej** — `max(bus.load_mw, 0.05)`, `min(x, 0.98)`.
    To inny defekt (ciche przycinanie danej OBECNEJ), a nie podstawienie za
    nieobecna; do tego forma zlewa sie z zabezpieczeniem dzielenia
    (`max(nominal_kv, 1e-6)`). Pomiar: 1 trafienie w warstwie solverow i jest to
    epsilon `1e-6`, wiec budzet zlozony z samych falszywych alarmow.
 3. **Podstawienie o dwa kroki dalej** — `x = pole; ...; if x is None: x = 1.0`
    (instrukcja `if`, nie wyrazenie warunkowe) oraz podstawienie w innej funkcji
    niz odczyt. Wymagaloby analizy przeplywu danych; forma wyrazeniowa jest
    wykrywana, instrukcyjna nie.
 4. **Wartosc domyslna w SYGNATURZE pola kontraktu** — `ampacity_a: float = 300.0`
    w modelu pydantic. To swiadoma czesc kontraktu (i osobna decyzja projektowa),
    a nie podstawienie w kodzie liczacym. Bramka patrzy na warstwe solverow i
    mostu, nie na definicje modeli.
 5. **Pole o nazwie nieistniejacej w zadnym modelu wejsciowym** — regula stoi na
    zbiorze zadeklarowanych pol, wiec dana czytana przez `dict`/`Any` bez modelu
    jest niewidoczna. Pomiar mapy pol: patrz `main()`, ktory PADA przy pustej
    mapie — martwa regula byloby cicha dziura.
 6. **Wykonanie z napisu** (`eval`, `exec`) — poza zasiegiem analizy skladni.

ZAKRES SKANU
------------
`network_model/solvers/**` (tam mieszka fizyka — regula NOT-A-SOLVER) ORAZ
`solver_input/**` (tam wejscia solvera POWSTAJA). Drugi korzen jest w zakresie,
bo zastepnik wstrzykniety po drodze do solvera jest w skutku identyczny, a nawet
gorszy: solver nie ma jak odroznic go od pomiaru. Pomiar potwierdzil, ze to nie
teoria — most `build_v126_input_from_enm` zmysla `length_km = 1.0` km dla odcinka
bez dlugosci oraz `r_ohm_per_km = 0.18` i `x_ohm_per_km = 0.12`.

SKALA POZA ZAKRESEM (pomiar 2026-08-08, ta sama regula na calym `backend/src`):
55 trafien w 19 plikach, wiec 22 w zakresie i 33 poza nim — najwiecej w
`enm/mapping.py` (11) i `enm/zero_sequence_transformer.py` (3). Rozszerzenie
zakresu na `enm/**` jest uzasadnione i ZGLOSZONE jako nazwany, zmierzony dlug
(wiersz QU-FABRYKACJA rejestru) — nie robimy tego w tej karcie, zeby zamrozic
budzet, ktorego nikt nie przeczytal.

ZAPADKA (`ZASTANE_ZASTEPNIKI`)
-----------------------------
Konwencja `no_direct_fault_params_guard.py` i `mypy_ratchet_guard.py`: budzet
wiaze KONKRETNE zastane wystapienia w postaci `{"<forma>:<cel>": liczba}` na plik,
zmierzona na stanie zamrozenia. Plik z zapadki jest normalnie parsowany i liczony.
Zapadka dziala W OBIE STRONY: NADWYZKA ponad budzet to naruszenie (nowy zastepnik
zapala CI), a NIEDOBOR tez jest czerwony i zada obnizenia budzetu — inaczej
poprawa nie zostaje utrwalona i dlug wraca po cichu. Kazdy wpis ma POWOD.
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Korzenie skanowania (wzgledem `BACKEND_SRC`) — patrz „ZAKRES SKANU".
SCAN_ROOTS: tuple[str, ...] = ("network_model/solvers", "solver_input")

#: Zrodla zbioru pol kontraktow wejsciowych. Zbior jest CZYTANY Z KODU, zeby
#: zmiana kontraktu nie rozbrajala reguly po cichu.
CONTRACT_SOURCES: tuple[str, ...] = ("solver_input", "enm/models.py")

#: Wywolania, ktore na pewno daja liczbe — galaz zapasowa z nimi jest zastepnikiem.
_NUMERIC_CALLS: frozenset[str] = frozenset(
    {"float", "int", "abs", "max", "min", "round", "sum", "len"}
)

#: Zapadka zastanych zastepnikow: plik -> {"<forma>:<cel>": liczba}.
#: Pomiar zamrozenia 2026-08-08 (karta QU-FABRYKACJA, runda poprawkowa):
#: 14 wystapien w warstwie solverow + 8 w moscie wejsc = 22 w 4 plikach.
#: KAZDY wpis niesie powod. „Poza zakresem karty" powodem NIE jest.
ZASTANE_ZASTEPNIKI: dict[str, dict[str, int]] = {
    # Rozdzial mocy odbioru na czesc stala ZIP: gdy `base_p/base_q` nie podano,
    # brana jest moc ze specyfikacji odbioru — czyli dana RZECZYWISTA, a nie stala.
    # Trafienie wynika z `float(base_p)` w galezi `else` (wywolanie liczbowe), nie
    # ze zmyslonej liczby. DLUG: forma jest nieodroznialna dla bramki, wiec pozycje
    # zostaja w budzecie jako zamrozone; rozstrzygniecie merytoryczne — bez zmiany.
    "network_model/solvers/power_flow_zip.py": {
        "B:ifexp:spec.p_mw": 1,
        "B:ifexp:spec.q_mvar": 1,
    },
    # Slad K_t transformatora: impedancja zastepcza liczona z danych znamionowych,
    # gdy gałąź ich nie ma. DLUG NAZWANY — patrz inwentarz stalych, pozycja
    # „dane znamionowe transformatora w sladzie".
    "network_model/solvers/short_circuit_iec60909.py": {
        "B:ifexp:branch.rated_power_mva": 1,
    },
    # Karta falownika (SSCI): pola nieobowiazkowe podstawiane zerem/jednostka.
    # Trzy pola OBOWIAZKOWE (pasmo petli pradowej, pasmo PLL, indukcyjnosc filtra)
    # sa juz uczciwe — ich brak daje `ValueError` i meldunek „dane niekompletne",
    # bez zadnej wartosci zastepczej. Pozostale (rezystancja filtra, opoznienie
    # regulacji, punkt pracy P/Q, moc i napiecie znamionowe) maja udokumentowane
    # zalozenie w docstringu `_z_conv_components`. DLUG NAZWANY: zalozenie
    # udokumentowane to nadal zalozenie — do zamiany na meldunek braku.
    # Dwa wpisy `A:or:item.*` to koordynacja izolacji: napiecie obnizone i TOV
    # podstawiane z krotnosci MCOV, gdy karta katalogowa ogranicznika nie istnieje
    # (`mcov * 2.8`). To pozycja z inwentarza stalych — jedyna z dziewieciu dlugow
    # karty, ktora ta bramka w ogole WIDZI, bo ma forme zapasowa; osiem pozostalych
    # to nagie stale w dzialaniu (granica nr 1).
    "network_model/solvers/v126_academic.py": {
        "A:or:converter.p_mw": 1,
        "A:or:converter.q_mvar": 1,
        "A:or:item.arrester_residual_10ka_kv": 1,
        "A:or:item.predicted_tov_kv": 1,
        "B:ifexp:converter.control_delay_ms": 2,
        "B:ifexp:converter.filter_r_pu": 2,
        "B:ifexp:converter.rated_mva": 3,
    },
    # Most ENM -> wejscie V12.6. NAJGORSZA rodzina w calym zakresie: solver nie ma
    # jak odroznic tych liczb od pomiaru. `length_km = 1.0` km dla odcinka bez
    # dlugosci oraz `r/x_ohm_per_km = 0.18/0.12` to zmyslone parametry gałęzi.
    # DLUG NAZWANY WPROST w rejestrze — do zamiany na brak elementu w wejsciu
    # albo na meldunek „dane niekompletne" dla calej analizy.
    "solver_input/v126_contracts.py": {
        "A:or:enm.frequency_hz": 1,
        "A:or:generator.q_mvar": 1,
        "A:or:transformer.p0_kw": 1,
        "B:ifexp:enm.frequency_hz": 1,
        "C:getattr:b_siemens_per_km": 1,
        "C:getattr:length_km": 1,
        "C:getattr:r_ohm_per_km": 1,
        "C:getattr:x_ohm_per_km": 1,
    },
}


def contract_fields() -> set[str]:
    """Nazwy pol zadeklarowanych w modelach wejsciowych — CZYTANE Z KODU.

    Zbior powstaje z adnotacji `nazwa: typ` w cialach klas `solver_input/**`
    i `enm/models.py`. To on odsiewa odczyty slownikowe: klucz `parameters` nie
    jest zadeklarowanym polem, wiec nie moze byc trafieniem.
    """
    fields: set[str] = set()
    for entry in CONTRACT_SOURCES:
        root = BACKEND_SRC / entry
        files = sorted(root.rglob("*.py")) if root.is_dir() else ([root] if root.is_file() else [])
        for path in files:
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except (OSError, SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.ClassDef):
                    continue
                for stmt in node.body:
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        fields.add(stmt.target.id)
    return fields


def leftmost_name(expr: ast.expr) -> str | None:
    """Najbardziej lewa NAZWA lancucha atrybutow/indeksow/wywolan."""
    current: ast.expr = expr
    while isinstance(current, ast.Attribute | ast.Subscript | ast.Call):
        if isinstance(current, ast.Attribute | ast.Subscript):
            current = current.value
        else:
            current = current.func
    return current.id if isinstance(current, ast.Name) else None


def reads_contract_field(expr: ast.expr, fields: set[str]) -> str | None:
    """`<baza>.<pole>` gdy wyrazenie czyta zadeklarowane pole kontraktu."""
    if isinstance(expr, ast.Attribute) and expr.attr in fields:
        base = leftmost_name(expr)
        if base is not None:
            return f"{base}.{expr.attr}"
    return None


def nested_contract_field(expr: ast.expr, fields: set[str]) -> str | None:
    """Pierwsze (deterministycznie: najplytsze, potem najwczesniejsze) pole w drzewie."""
    for node in ast.walk(expr):
        target = reads_contract_field(node, fields)
        if target is not None:
            return target
    return None


def is_numeric(expr: ast.expr) -> bool:
    """Czy wyrazenie NA PEWNO daje liczbe wchodzaca dalej do arytmetyki.

    `None` (uczciwy meldunek braku), napis i wartosc logiczna sa POZA regula —
    to granica, ktora odsiewa dwie trzecie falszywych alarmow (patrz docstring).
    """
    if isinstance(expr, ast.Constant):
        return isinstance(expr.value, int | float) and not isinstance(expr.value, bool)
    if isinstance(expr, ast.UnaryOp) and isinstance(expr.op, ast.USub | ast.UAdd):
        return is_numeric(expr.operand)
    if isinstance(expr, ast.BinOp):
        return is_numeric(expr.left) or is_numeric(expr.right)
    if isinstance(expr, ast.Call) and isinstance(expr.func, ast.Name):
        return expr.func.id in _NUMERIC_CALLS
    if isinstance(expr, ast.IfExp):
        return is_numeric(expr.body) or is_numeric(expr.orelse)
    return False


def collect_findings(tree: ast.AST, fields: set[str]) -> list[tuple[str, int]]:
    """Lista (`<forma>:<cel>`, wiersz) dla jednego pliku."""
    findings: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        # A. dana or <liczba>
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
            for index, value in enumerate(node.values[:-1]):
                target = reads_contract_field(value, fields)
                if target is not None and is_numeric(node.values[index + 1]):
                    findings.append((f"A:or:{target}", node.lineno))
        # B. ... dana ... if <warunek> else <liczba>
        if isinstance(node, ast.IfExp):
            target = nested_contract_field(node.body, fields)
            if (
                target is not None
                and is_numeric(node.orelse)
                and nested_contract_field(node.orelse, fields) is None
            ):
                findings.append((f"B:ifexp:{target}", node.lineno))
        # C. getattr(obj, "dana", <liczba>)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "getattr" and len(node.args) == 3:
                key = node.args[1].value if isinstance(node.args[1], ast.Constant) else None
                if isinstance(key, str) and key in fields and is_numeric(node.args[2]):
                    findings.append((f"C:getattr:{key}", node.lineno))
    return findings


def apply_ratchet(
    rel: str,
    findings: list[tuple[str, int]],
    budget: dict[str, int],
) -> list[str]:
    """Porownaj znaleziska pliku z budzetem — W OBIE STRONY."""
    violations: list[str] = []
    counted = Counter(signature for signature, _ in findings)

    for signature in sorted(set(counted) | set(budget)):
        found = counted.get(signature, 0)
        allowed = budget.get(signature, 0)
        if found == allowed:
            continue
        lines = ", ".join(
            str(ln) for sig, ln in sorted(findings, key=lambda f: f[1]) if sig == signature
        )
        if found > allowed:
            violations.append(
                f"  {rel}: zapadka zastanych zastepnikow '{signature}': budzet {allowed}, "
                f"znaleziono {found} (wiersze: {lines or 'brak'}). NOWE podstawienie liczby "
                "za nieobecna dana wejsciowa jest naruszeniem — pomin element albo zamelduj "
                "brak (`None` + powod), tak jak `_grid_source_shunt_admittance`."
            )
        else:
            violations.append(
                f"  {rel}: zapadka zastanych zastepnikow '{signature}': budzet {allowed}, "
                f"znaleziono {found} (wiersze: {lines or 'brak'}). Dlug ZMALAL — obniz budzet "
                "w ZASTANE_ZASTEPNIKI, inaczej poprawa nie zostaje utrwalona."
            )
    return violations


def check_file(path: Path, fields: set[str]) -> list[str]:
    """Naruszenia w jednym pliku (pusta lista = plik czysty)."""
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        print(f"WARN: {path}:{exc.lineno}: nie da sie sparsowac ({exc.msg})")
        return []

    rel = path.relative_to(BACKEND_SRC).as_posix()
    findings = collect_findings(tree, fields)
    budget = ZASTANE_ZASTEPNIKI.get(rel)
    if budget is not None:
        return apply_ratchet(rel, findings, budget)

    return [
        f"  {rel}:{lineno}: podstawienie liczby za nieobecna dana wejsciowa "
        f"('{signature}'). Gdy danej nie ma, POMIN element albo zamelduj brak "
        "(`None` + powod po polsku) — nie podstawiaj liczby, ktora wejdzie do "
        "arytmetyki jako pomiar."
        for signature, lineno in findings
    ]


def main() -> int:
    if not BACKEND_SRC.is_dir():
        print(f"FAIL: brak korzenia skanowania: {BACKEND_SRC}")
        print("Bramka, ktora nie dosiega swojego korzenia, to falszywa zielen.")
        return 1

    fields = contract_fields()
    if not fields:
        print("FAIL: zbior pol kontraktow wejsciowych jest PUSTY.")
        print("Cala regula stoi na tym zbiorze — bez niego bramka milczalaby o wszystkim.")
        return 1

    violations: list[str] = []
    scanned = 0
    for root_name in SCAN_ROOTS:
        root = BACKEND_SRC / root_name
        if not root.is_dir():
            print(f"FAIL: korzen skanowania '{root_name}' nie istnieje pod {BACKEND_SRC}.")
            print("Zmiana ukladu katalogow nie moze po cichu wylaczyc zakresu bramki.")
            return 1
        for path in sorted(root.rglob("*.py")):
            scanned += 1
            violations.extend(check_file(path, fields))

    print(f"Pol kontraktow wejsciowych: {len(fields)}.")
    print(f"Przeskanowano {scanned} plikow w zakresie: {', '.join(SCAN_ROOTS)}.")

    if scanned == 0:
        print("FAIL: PUSTY SKAN — 0 plikow. Bramka, ktora nic nie obejrzala, nic nie dowodzi.")
        return 1

    # Wpis zapadki wskazujacy plik, ktorego nie ma, to martwy budzet: rejestr
    # moze tylko malec, wiec nieaktualny wpis jest bledem, nie ozdoba.
    martwe = [rel for rel in ZASTANE_ZASTEPNIKI if not (BACKEND_SRC / rel).is_file()]
    if martwe:
        print("FAIL: zapadka wskazuje pliki, ktorych nie ma:")
        for rel in sorted(martwe):
            print(f"  {rel} — zdejmij wpis z ZASTANE_ZASTEPNIKI.")
        return 1

    if violations:
        print("FAIL: podstawianie liczb za nieobecne dane wejsciowe:")
        for violation in sorted(violations):
            print(violation)
        print(f"\n{len(violations)} naruszen.")
        return 1

    print("PASS: zadnego nowego podstawienia liczby za nieobecna dana wejsciowa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

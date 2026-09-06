#!/usr/bin/env python3
"""
UI No-Physics Guard — U5-UI-HIGIENA (part B) + H-1 (scope) + K7-B (patterns)

Blocks merge if the presentation layer (frontend/src/ui/** and frontend/src/ui2/**)
computes network physics. Physics belongs in backend solvers (network_model/solvers)
with a WHITE BOX trace; the UI only renders values the backend computed
authoritatively (formatting / rounding / axis scaling are fine).

SCOPE = frontend/src/ui/** AND frontend/src/ui2/**.
  ui2/** is the clean-room layer where new development happens, so a new
  `sensitivityAnalyzer`-class defect (physics leaking into the client) would land
  here first. ui/** is the legacy layer; the "relocate UI physics -> backend"
  epic (R1-R3, see docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md) closed it out for the
  quantities it enumerated; K7-B (2026-07-31) closed out the rest, found by
  widening the patterns (see the K7-B note below). Current measurement:
  ui/** = 18 raw pattern hits / 14 distinct lines, ui2/** = 1, all class-b
  (string, label, comment continuation, ratio of two backend values, unit
  conversion, chart-axis normalisation), 0 class-a. See ALLOWLIST below for the
  itemised, reasoned list — every entry names its class and why it is not
  network physics. No entry hides a class-a defect: none remains.

K7-B (2026-07-31) — DLACZEGO DOSZLY NOWE WZORCE. Zakres guarda obejmowal juz
cale `ui/**`, ale jego WZORCE opisywaly wylacznie klase defektu, ktora go
powolala (`sensitivityAnalyzer`: √3, impedancje, dU/dP). Inwentarz karty K7-B
znalazl w `ui/**` pietnascie miejsc realnej fizyki sieci, ktorych zaden z tych
wzorcow nie widzial — bo liczyly z INNYCH wielkosci: charakterystyki IDMT
IEC 60255 (t = k·TMS/((I/Ip)^α − 1)), skalowanie wytrzymalosci cieplnej
aparatu (I_th_eff = I_th_zn·√(t_zn/t_wyl)), dobor przekroju adiabatyczny
(S_min = I·√t / k), rezystancje uziemien (IEEE 80 / wzor Dwighta), bilanse mocy
wtornej przekladnikow (IEC 61869), THD wg PN-EN 50160 i moc przylaczeniowa.
Guard byl wiec zielony nad kodem, ktory reguła NOT-A-SOLVER wprost zakazuje.
Wzorce ponizej sa rozszerzone o te wlasnie rodziny wielkosci; kod, ktory je
uruchamial, zostal przeniesiony do backendu albo usuniety (patrz
`docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md` §7).

WHAT IS DETECTED — strong, unambiguous network-physics computation signals:
  - Math.sqrt(3) / √3 used in an arithmetic expression (3-phase line math).
  - Math.sqrt(2) used in an arithmetic expression (peak / RMS conversion,
    IEC 60909 ip = κ·√2·Ik").
  - Arithmetic (multiply/divide) on impedance / admittance / reactance /
    susceptance / resistivity / conductivity quantities.
  - Load-flow sensitivity coefficients dUdP / dUdQ used in arithmetic, and the
    voltage-drop shorthand deltaU used in arithmetic (the removed
    `sensitivityAnalyzer` did `deltaU = dUdP*P + dUdQ*Q`).
  - Arithmetic on short-circuit / withstand quantities: `i_th`, `i_dyn`,
    `i_peak`, `ikss`, `fault_current`, `short_circuit` (K7-B: the removed
    `validateDeviceWithstand` did `i_th_1s_ka * Math.sqrt(t_rated / t_clearing)`).
  - Arithmetic on inverse-time characteristic settings: `tms`, `tds`, `pickup`,
    and `Math.pow(<x>, alpha)` (K7-B: three parallel copies of IEC 60255-151
    lived in ui/**, each with its own k/α table).
  - Arithmetic on conductor-sizing / instrument-transformer-burden quantities:
    `ampacity`, `cross_section`, `burden` (K7-B: adiabatic S_min = I·√t / k and
    IEC 61869 secondary-burden balances were computed in the browser).
  - Arithmetic on `thd` (PN-EN 50160 harmonic distortion).

WHAT IS NOT DETECTED (deliberately, to avoid false positives):
  - The bare token `current`: ubiquitous NON-physics in React/DOM
    (`aria-current`, Tailwind `bg-current`/`text-current`/`border-current`,
    `data-testid="...current..."`, React setState updaters `(current) => current + 1`,
    ref `.current`). It is therefore excluded from detection entirely.
  - Formatting / rounding / unit conversion / axis scaling of a value already
    computed by the backend (e.g. `sk_mva` read + `toFixed`, `MW -> kW`).
  - Reading/labelling backend short-circuit results (Ik", ip, Ith, Sk columns).
  - Comments, imports, type/interface declarations, string/JSDoc lines.
  - Screen geometry: `Math.sqrt(dx*dx + dy*dy)` / `Math.hypot` over canvas
    coordinates is pixel distance, not network physics.
  - `Math.sqrt(P² + Q²)` and cos φ = P/S over an operating point the backend
    already delivered (K7-B classification): restating the SAME pair (P, Q) in
    polar coordinates introduces no impedance, no topology and no normative
    constant — it is the two-dimensional sibling of `MW -> kW`, and forcing it
    through an endpoint would also make an SLD renderer asynchronous, breaking
    the determinism contract. A value derived from anything BEYOND that pair
    (rating, catalog constant, standard) is physics and is detected.

ALLOWLIST (explicit, per file+line, reasoned — see below):
  A hit is allowlisted ONLY if it is (b) a false positive (string literal /
  trailing comment the regex cannot distinguish from code) or (c) a fixed
  catalog constant / catalog-matching conversion defined by an IEC standard
  (not derived from live network topology/state). A hit that computes an
  engineering result FROM network data (ΔU, Ik, load flow, ...) is a class-a
  defect and MUST NOT be allowlisted — it is relocated to a backend solver
  instead (see docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md for the pattern).

EXCLUDED PATHS:
  **/__tests__/**, **/*.test.*, **/*.spec.*  (tests reference physics in fixtures).

EXIT CODES:
  0 = clean (no violations)
  1 = violation found
  2 = scan directory not found (skip)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [
    REPO_ROOT / "frontend" / "src" / "ui",
    REPO_ROOT / "frontend" / "src" / "ui2",
]

# Explicit allowlist for frontend/src/ui/** (H-1, measured 2026-07-22).
# Keyed by (repo-relative path, 1-based line number) — NOT whole-file, so a new
# violation appearing on a different line of an allowlisted file is still
# caught. Every entry carries its classification (b = false positive,
# c = justified catalog-constant exception) and a one-line reason.
ALLOWLIST: dict[tuple[str, int], str] = {
    # PONOWNY POMIAR 2026-07-28 (V12K-267). Bylo 18 wpisow / 22 surowych trafien,
    # jest 5 wpisow / 5 trafien. Trzynascie wpisow wskazywalo na
    # station-der/protection-catalogs.ts (katalog przekladnikow napieciowych VT).
    # Ich przedmiot WYJECHAL Z UI do backendu w dc525539 (V12K-257/258, „koniec
    # rownoleglych katalogow VT"), wiec wpisy przestaly odpowiadac
    # czemukolwiek — a wyjatek, ktory nie wskazuje na istniejacy kod, przestaje
    # byc weryfikowalny i zaczyna byc martwa zgoda na cokolwiek pod ta sciezka.
    # Test `test_ui_allowlist_entries_are_not_stale` zlapal to poprawnie; nikt
    # nie zaktualizowal pomiaru po tamtej karcie. Wszystkie 5 pozostalych
    # trafien to klasa b (napis/komentarz), zero klasy a (realna fizyka).
    # StationWizardStepContent.tsx — dwa wpisy (374: napis etykiety VT,
    # 684: napis metody IEC 60909-0) USUNIETE 2026-07-31: karta KD-1 (V12K-289)
    # skasowala caly martwy komponent kreatora stacji v2, wiec wpisy przestaly
    # wskazywac na istniejacy kod. Pomiar bazowy obnizony 18 -> 16.
    # station-wizard-v2 (metersContract.ts 57, calculationTemplateContract.ts
    # 64) — wpisy USUNIETE 2026-08-13: kasacja N-D3 (wiersz N-D3-POMIAR-U2 w
    # docs/v12xx/REJESTR_KONFLIKTOW.md) skasowala cala biblioteke kontraktow
    # (zero konsumentow zmierzone na obu galeziach). Pomiar bazowy 16 -> 13.
    # sldCanonKit.tsx — string template building a display label.
    (
        "frontend/src/ui/sld/v2/station-rozdzielnia/canon/sldCanonKit.tsx",
        55,
    ): "b: string template building a display label ('VT . ${primary}/root3'), computes nothing",
    # ozeTypes.ts — trailing comment documenting a field's meaning.
    (
        "frontend/src/ui/sld/v2/station-rozdzielnia/companions/ozeTypes.ts",
        49,
    ): "b: trailing line comment documenting a field's meaning, not code",
    # =========================================================================
    # K7-B (2026-07-31) — trafienia NOWYCH wzorcow (rodzina zwarciowa / IDMT /
    # dobor / THD). Pomiar PO przeniesieniu i usunieciu fizyki: ui/** 18 surowych
    # trafien / 14 unikalnych linii, ui2/** 1; 0 klasy (a). Kazdy wpis nazywa
    # swoja klase i powod.
    # =========================================================================
    (
        "frontend/src/ui/canon/technicalDebtRegistry.ts",
        71,
    ): "b: string z komendą powłoki ('pytest tests/test_short_circuit_iec60909.py') — ukośnik jest separatorem ścieżki",
    (
        "frontend/src/ui/protection-curves/itCurveAdapter.ts",
        80,
    ): "b: normalizacja osi X wykresu TCC (krotność I/Ip) na punktach krzywej otrzymanych z backendu — skalowanie osi, wprost dozwolone w kontrakcie tego strażnika",
    (
        "frontend/src/ui/sld/v2/canvas/SldShortCircuitOverlay.tsx",
        256,
    ): "b: literał tekstowy stanu pustego ('(brak ip/Ith)') — nazywa brak danej, niczego nie liczy",
    (
        "frontend/src/ui/sld/v2/renderer/EquipmentProofBadge.tsx",
        30,
    ): "b: etykieta legendy odznaki ('>80% Ith/Idyn') — napis w słowniku kolorów",
    (
        "frontend/src/ui/sld/v2/renderer/EquipmentProofBadge.tsx",
        97,
    ): "b: wykorzystanie = iloraz DWÓCH wielkości policzonych przez backend (Ith obliczone / Ith znamionowe z pakietu dowodowego aparatu) — procent, nie wzór; brak stałej normowej i brak trzeciej wielkości",
    (
        "frontend/src/ui/sld/v2/renderer/EquipmentProofBadge.tsx",
        100,
    ): "b: jw. dla kryterium dynamicznego (Idyn obliczone / Idyn znamionowe)",
    (
        "frontend/src/ui/sld/v2/station-rozdzielnia/StationRozdzielniaSN.tsx",
        1225,
    ): "b: kontynuacja wielolinijkowego komentarza JSX ({/* ... */}) — poza zasięgiem reguł pomijania, które widzą pojedynczą linię",
    (
        # KD-1 (2026-07-31): numer wiersza zdryfował po wcześniejszych edycjach
        # pliku — guard był CZERWONY na gałęzi bazowej. Wpis dotyczy TEGO SAMEGO
        # napisu (opis analizy w katalogu ekranów), tylko pod aktualnym wierszem.
        # CV-4.2 (2026-09-05): kolejny dryf o 1 wiersz (dodanie `activeCaseId`
        # z `useAppStateStore` WCZEŚNIEJ w pliku, przy przepięciu P12 na bieg
        # kanoniczny) — TEN SAM napis, wiersz 2633 → 2632.
        "frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx",
        2632,
    ): "b: opis analizy w katalogu ekranów ('IEC 60909, Ik″/ip/Ith z śladem Y-bus') — napis",
    (
        # Karta WB-ROZPLYW: numer wiersza zdryfował po dopisaniu kontraktu
        # `branch_flow_trace`/hooka `useRozplywZwarciowy` WCZEŚNIEJ w pliku
        # (ślad WHITE BOX podziału prądu zwarciowego, TH-1). Wpis dotyczy TEGO
        # SAMEGO napisu (skalowanie A→kA), tylko pod aktualnym wierszem.
        "frontend/src/ui2/wyniki/zwarcia/api.ts",
        81,
    ): "b: przeliczenie jednostki A→kA wartości otrzymanej z backendu (ikss_partial_a / 1000) — wprost dozwolone skalowanie jednostek",
}

# Impedance-family electrical quantities (matched inside identifiers too, e.g.
# `reactanceOhmPerKm`). Multiplying/dividing these is network physics.
# K7-B: + resistivity / conductivity — the removed earthing-grid (IEEE 80) and
# instrument-transformer-burden code multiplied exactly those.
_IMPEDANCE_FAMILY = r"\w*(?:impedance|admittance|reactance|susceptance|resistivity|conductivity)\w*"

# K7-B: short-circuit / withstand quantities. Case-insensitive, because real
# identifiers came in every spelling (`i_th_1s_ka`, `calculated_Ith_kA`,
# `shortCircuitKa`, `i_peak_calculated_ka`).
#
# Two shapes, deliberately: the ABBREVIATED symbols (Ith / Idyn / Ipeak) are short
# enough to appear inside ordinary words — `w-ith-stand` contains `ith` — so they
# are anchored to identifier boundaries (optional `prefix_` / `_suffix` segments
# only). The DESCRIPTIVE ones cannot collide, so they match as substrings.
_FAULT_ABBREV = r"(?:\w+_)?i_?(?:th|dyn|peak|fault)(?:_\w+)?|\w*ikss\w*"
_FAULT_DESCRIPTIVE = r"\w*(?:fault_?current|short_?circuit)\w*"
_FAULT_FAMILY = rf"(?:{_FAULT_ABBREV}|{_FAULT_DESCRIPTIVE})"

# K7-B: inverse-time characteristic settings (IEC 60255-151). Case-SENSITIVE and
# lowercase on purpose — `</Pickup>` in an XML export template is a tag name, not
# a setting, and must not be reported. Segmenty `prefix_` / `_suffix` sa dopuszczone,
# bo usuniety `ProtectionWizard.computeAutoTms` pisal `i_fault_A / i_pickup_A` —
# sam token `pickup` bez tej tolerancji nie zlapalby ani jednej realnej linii.
_IDMT_TOKENS = r"(?:\w+_)?(?:tms|tds|pickup)(?:_\w+)?"

# K7-B: conductor sizing / instrument-transformer burden.
_SIZING_FAMILY = r"\w*(?:ampacity|cross_?section|burden)\w*"


def _przed_operatorem(rodzina: str) -> str:
    """Wielkosc z rodziny stoi PRZED mnozeniem/dzieleniem.

    K7-B: dopuszczamy domykajace nawiasy miedzy wielkoscia a operatorem —
    `((a - computedBurdenVa) / rated)` to nadal dzielenie przez wielkosc z
    rodziny, a bez tego wzorzec widzialby tylko najprostszy zapis.
    """
    return rf"\b{rodzina}\b\s*\)*\s*[*/]"


def _po_operatorze(rodzina: str) -> str:
    """Wielkosc z rodziny stoi PO mnozeniu/dzieleniu.

    K7-B: dopuszczamy otwierajace nawiasy i dostep przez wlasciwosc
    (`/ c.ratedBurdenVa`, `* (device.i_dyn_ka)`) — realny kod tak wlasnie wyglada.
    """
    return rf"[*/]\s*\(*\s*(?:[A-Za-z_$][\w$]*\.)*\b{rodzina}\b"


# Strong physics-computation patterns. Each indicates a formula, not formatting.
PHYSICS_PATTERNS = [
    # √3 (3-phase line factor) participating in arithmetic.
    re.compile(r"Math\.sqrt\(\s*3(?:\.0+)?\s*\)\s*[*/]"),
    re.compile(r"[*/]\s*Math\.sqrt\(\s*3(?:\.0+)?\s*\)"),
    re.compile(r"√\s*3\s*[*/]"),
    re.compile(r"[*/]\s*√\s*3"),
    # √2 (peak factor, IEC 60909 ip = κ·√2·Ik") participating in arithmetic.
    re.compile(r"Math\.sqrt\(\s*2(?:\.0+)?\s*\)\s*[*/]"),
    re.compile(r"[*/]\s*Math\.sqrt\(\s*2(?:\.0+)?\s*\)"),
    re.compile(r"√\s*2\s*[*/]"),
    re.compile(r"[*/]\s*√\s*2"),
    # Arithmetic on impedance-family quantities. K7-B: case-insensitive, bo realne
    # identyfikatory w tym repo sa camelCase (`soilResistivityOhmM`,
    # `conductivityMperOhmMm2`) — wzorzec wrazliwy na wielkosc liter widzial tylko
    # `reactanceOhmPerKm` i przepuszczal caly kalkulator uziemien.
    re.compile(_przed_operatorem(_IMPEDANCE_FAMILY), re.IGNORECASE),
    re.compile(_po_operatorze(_IMPEDANCE_FAMILY), re.IGNORECASE),
    # Load-flow sensitivity coefficients used in arithmetic.
    re.compile(r"\b(?:dUdP|dUdQ)\b\s*[-+*/]"),
    re.compile(r"[-+*/]\s*\b(?:dUdP|dUdQ)\b"),
    # Voltage-drop shorthand used in arithmetic (not plain assignment from API).
    re.compile(r"\bdeltaU\b\s*[-+*/]"),
    re.compile(r"[-+*/]\s*\bdeltaU\b"),
    # K7-B: short-circuit / withstand quantities in arithmetic.
    re.compile(_przed_operatorem(_FAULT_FAMILY), re.IGNORECASE),
    re.compile(_po_operatorze(_FAULT_FAMILY), re.IGNORECASE),
    # K7-B: IDMT settings in arithmetic + the characteristic's own exponent.
    re.compile(_przed_operatorem(_IDMT_TOKENS)),
    re.compile(_po_operatorze(_IDMT_TOKENS)),
    re.compile(r"Math\.pow\([^,]+,\s*[\w.]*alpha\b"),
    # K7-B: conductor sizing / burden quantities in arithmetic.
    #
    # TYLKO jako LEWY argument — i to jest rozstrzygniecie, nie wygoda. Wyliczanie
    # NOWEJ obciazalnosci albo NOWEJ mocy wtornej (`ratedAmpacityA * groupingFactor`,
    # `computedBurdenVa) / ratedBurdenVa`) to dobor: powstaje wielkosc, ktorej w
    # danych nie bylo. Podzielenie zmierzonego pradu PRZEZ podana obciazalnosc
    # (`loadCurrentA / ampacityA`) to procent wykorzystania — ta sama klasa co
    # `MW -> kW`. Gdyby lapac obie strony, allowlista rosla by o wpisy „to tylko
    # procent", a kazdy taki wpis oslabia strażnika bardziej niz wezszy wzorzec.
    re.compile(_przed_operatorem(_SIZING_FAMILY), re.IGNORECASE),
    # K7-B: harmonic distortion (PN-EN 50160). Lowercase on purpose — `THDu` in a
    # menu label is a caption, `thduSquared * x` is a computation.
    re.compile(r"\bthd\w*\b\s*[*/+]"),
    re.compile(r"[*/+]\s*\bthd\w*\b"),
]

# Lines to skip (comments, imports, type declarations, JSDoc, description fields).
SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*//"),  # Single-line comment
    re.compile(r"^\s*\*"),  # Block comment continuation
    re.compile(r"^\s*/\*"),  # Block comment start
    re.compile(r"^\s*import\s"),  # Import statements
    re.compile(r"^\s*export\s+type"),  # Type exports
    re.compile(r"^\s*export\s+interface"),  # Interface exports
    re.compile(r"^\s*\*\s*@"),  # JSDoc annotations
    re.compile(r"^\s*\*\s*-"),  # JSDoc list items
    re.compile(r"^\s*description:"),  # Description fields
    # K7-B: module specifier of an import / re-export (`} from './X';`,
    # `export { X } from './X';`, `export * from './X';`). The `./` in the path is
    # a slash, not a division.
    re.compile(r"^\s*\}?\s*from\s+['\"]"),
    re.compile(r"^\s*export\s+(?:\*|\{[^}]*\}|type\s+\{[^}]*\})\s+from\s+['\"]"),
    # K7-B: JSX comment occupying the whole line (`{/* ... */}`). It is a comment
    # in every sense except the one `^\s*//` recognises.
    re.compile(r"^\s*\{\s*/\*.*\*/\s*\}\s*$"),
]

# File extensions to scan
SCAN_EXTENSIONS = {".ts", ".tsx"}

# Path fragments excluded from scanning.
EXCLUDE_PATTERNS = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
]


def _should_skip_line(line: str) -> bool:
    for pattern in SKIP_LINE_PATTERNS:
        if pattern.search(line):
            return True
    return False


def _should_exclude_file(path: Path) -> bool:
    path_str = str(path).replace("\\", "/")
    for pattern in EXCLUDE_PATTERNS:
        if pattern.search(path_str):
            return True
    return False


def _relative_path_str(path: Path) -> str | None:
    """Repo-relative POSIX-style path, or None if path is outside REPO_ROOT
    (e.g. a tmp_path fixture in tests) — such paths are never allowlisted."""
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return None


def _is_allowlisted(path: Path, line_no: int) -> bool:
    rel = _relative_path_str(path)
    if rel is None:
        return False
    return (rel, line_no) in ALLOWLIST


def scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Scan one file. Returns (line_number, line_content, matched_pattern)."""
    violations: list[tuple[int, str, str]] = []
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    for line_no, line in enumerate(content.splitlines(), start=1):
        if _should_skip_line(line):
            continue
        for pattern in PHYSICS_PATTERNS:
            if pattern.search(line):
                violations.append((line_no, line.strip(), pattern.pattern))

    return violations


def scan_tree_raw(scan_dirs: list[Path]) -> list[tuple[Path, int, str, str]]:
    """Wszystkie trafienia PHYSICS_PATTERNS PRZED filtrem ALLOWLIST.

    Karta ZAPADKI-ALLOWLIST-RESZTA (pozycja a, 2026-08-12): wydzielone z
    `scan_tree()`, zeby zasilic ROWNIEZ zapadke swiezosci
    (`check_allowlist_freshness`) tym samym surowym skanem, ktorego uzywa
    filtr allowlisty — bez tego wydzielenia zapadka i filtr liczylyby z dwoch
    rownoleglych przejsc po drzewie plikow, ktore moglyby z czasem dryfowac
    (regula KLASA-NIE-INSTANCJA S3, predykaty parami).
    """
    all_hits: list[tuple[Path, int, str, str]] = []
    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for path in sorted(scan_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix not in SCAN_EXTENSIONS:
                continue
            if _should_exclude_file(path):
                continue
            for line_no, line_content, pattern in scan_file(path):
                all_hits.append((path, line_no, line_content, pattern))
    return all_hits


def scan_tree(scan_dirs: list[Path]) -> list[tuple[Path, int, str, str]]:
    """Scan the given directories, returning all NON-allowlisted violations.

    Raw detection lives in scan_file() (untouched by the allowlist), so a
    baseline hit-count measurement can still be taken against it; allowlist
    filtering happens only here, keyed to the exact (repo-relative path, line)
    of each reasoned ALLOWLIST entry — a new hit elsewhere in an allowlisted
    file is never silently absorbed. Filters `scan_tree_raw()` through
    `_is_allowlisted()` — the SAME predicate `check_allowlist_freshness()`
    uses below to decide whether a raw hit still covers its ALLOWLIST entry.
    """
    return [
        (path, line_no, line_content, pattern)
        for path, line_no, line_content, pattern in scan_tree_raw(scan_dirs)
        if not _is_allowlisted(path, line_no)
    ]


def check_allowlist_freshness(
    raw_hits: list[tuple[Path, int, str, str]],
) -> list[str]:
    """Zapadka swiezosci ALLOWLIST (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja a).

    Osierocenie JUZ SIE RAZ ZDARZYLO w tym guardzie (13 wpisow na usuniety
    katalog VT, wykryte dopiero recznym pomiarem V12K-267 — jedyny automatyczny
    detektor, `test_ui_allowlist_entries_are_not_stale`, zyje wylacznie w
    `backend/tests/ci/`, POZA guardem: `python scripts/ui_no_physics_guard.py`
    uruchomiony samodzielnie (tak jak w CI, `guardy_z_ci.py`) nie widzial i nie
    widzi tamtego testu. Ta funkcja przenosi zapadke DO SAMEGO GUARDA, zeby
    `main()` failowal niezaleznie od tego, czy pytest w ogole sie uruchamia.

    Kazdy wpis ALLOWLIST musi nadal odpowiadac REALNEMU dzisiejszemu trafieniu:
    plik istnieje (bo inaczej `raw_hits` nigdy by go nie wyprodukowal — `scan_tree_raw`
    czyta z dysku) ORAZ wzorzec fizyki faktycznie wystepuje w TYM pliku na TEJ
    linii. Sprawdzane przez `_is_allowlisted()` — TA SAMA funkcja, ktora
    `scan_tree()` uzywa do ODEJMOWANIA allowlisty od surowych trafien; tutaj
    uzywana do SUMOWANIA, ktore wpisy maja jeszcze co odejmowac (predykaty
    parami, KLASA-NIE-INSTANCJA S3 — nie ma drugiej, rownoleglej definicji
    "trafienie odpowiada wpisowi").
    """
    covered: set[tuple[str, int]] = set()
    for path, line_no, _content, _pattern in raw_hits:
        if _is_allowlisted(path, line_no):
            rel = _relative_path_str(path)
            if rel is not None:
                covered.add((rel, line_no))

    violations: list[str] = []
    for (rel_path, line_no), reason in sorted(ALLOWLIST.items()):
        if (rel_path, line_no) in covered:
            continue
        violations.append(
            f"[ui-no-physics-wpis-osierocony] ALLOWLIST[({rel_path!r}, {line_no})] "
            "nie odpowiada juz zadnemu trafieniu wzorca fizyki w dzisiejszym drzewie "
            f"— usun ten wpis (uzasadnienie bylo: {reason})"
        )
    return violations


def main() -> int:
    if not any(d.exists() for d in SCAN_DIRS):
        print(
            "ui-no-physics-guard: no scan directory found: " + ", ".join(str(d) for d in SCAN_DIRS),
            file=sys.stderr,
        )
        return 2

    raw_hits = scan_tree_raw(SCAN_DIRS)
    all_violations = [
        (path, line_no, line_content, pattern)
        for path, line_no, line_content, pattern in raw_hits
        if not _is_allowlisted(path, line_no)
    ]
    freshness_violations = check_allowlist_freshness(raw_hits)

    if all_violations:
        print("UI-NO-PHYSICS-GUARD VIOLATIONS (ui/**, ui2/**):", file=sys.stderr)
        for path, line_no, line_content, pattern in all_violations:
            rel_path = path.relative_to(REPO_ROOT)
            print(f"  {rel_path}:{line_no}: {line_content}", file=sys.stderr)
            print(f"    Matched pattern: {pattern}", file=sys.stderr)
        print(
            f"\n{len(all_violations)} violation(s) found. The presentation layer "
            "(ui/**, ui2/**) must not compute network physics (move it to a "
            "backend solver/analysis with a WHITE BOX trace, or add a reasoned "
            "ALLOWLIST entry if it is genuinely not physics — see module "
            "docstring).",
            file=sys.stderr,
        )

    if freshness_violations:
        print("UI-NO-PHYSICS-GUARD ALLOWLIST FRESHNESS VIOLATIONS:", file=sys.stderr)
        for violation in freshness_violations:
            print(f"  {violation}", file=sys.stderr)

    if all_violations or freshness_violations:
        return 1

    print("ui-no-physics-guard: PASS (0 violations in ui/**, ui2/**)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

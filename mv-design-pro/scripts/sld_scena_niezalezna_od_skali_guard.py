#!/usr/bin/env python3
"""Strażnik „scena SLD niezależna od skali" (karta SLD-SKALA-I-NAWIGACJA, R1/R3/R9).

Kontrakt wiążący: `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md` v2.0 „Skala, gęstość
informacji i nawigacja". Kanwa schematu ma JEDNĄ scenę na migawkę modelu
(`buildSceneV3(snapshot)`), niezależną od skali kamery. Kamera jest czystym
przekształceniem; skala steruje wyłącznie gęstością NAPISÓW (jedna czysta funkcja
`canvas/gestoscInformacji.ts`), nigdy torem, aparatem, stanem ani tożsamością.
Strażnik łapie statycznie klasę zmian, która przywróciłaby zależność sceny od skali
albo osłabiła kontrakt ciągłości toru (dyrektywa właściciela z oceny ekranu 2/10,
wymóg 3: tor od źródła przez magistralę do stacji jest zawsze wyrysowany):

  GUARD 1 — wyrocznia ciągłości `scene/ciagloscToru.ts` deklaruje PEŁNY kontrakt klas
            toru prądowego, aparatów ciągłości i powodów braków;
  GUARD 2 — test kontraktowy `ciagloscToru.test.ts` sprawdza wszystkie powody i ma
            sekcję regresji wstrzykniętej;
  GUARD 3 — budowa sceny przyjmuje WYŁĄCZNIE migawkę (`buildSceneV3`, `scenaSld` —
            dokładnie jeden parametr), a moduły sceny, kompozycji, układu i symboli nie
            importują kamery ani funkcji gęstości informacji;
  GUARD 4 — tor mocy nie jest przypięty do przełączalnej warstwy;
  GUARD 5 — próg czytelności (`isLabelReadableAtScale`, `czytelnyNaEkranie`) stoi
            w kanwie wyłącznie w kontekście napisu;
  GUARD 6 — zero identyfikatorów dawnego mechanizmu poziomów szczegółu w źródłach
            frontendu, w e2e i w skryptach (`SceneLod`, `lodOverride`, `fitTargetLod`,
            postaci zwinięte, rozwijanie bloku GPZ, przenikanie poziomów);
  GUARD 7 — strażnik i test kontraktowy wpięte w bramkę determinizmu SLD.

Ścieżki są stałymi modułu czytanymi w chwili wywołania `main()`, więc test strażnika
podmienia je na drzewo tymczasowe i wstrzykuje regresję
(`scripts/test_sld_scena_niezalezna_od_skali_guard.py`).

Exit code: 0 = OK, 1 = naruszenia.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND = REPO_ROOT / "frontend"
WORKFLOW = REPO_ROOT.parent / ".github" / "workflows" / "sld-determinism.yml"

RED = "\033[91m"
GREEN = "\033[92m"
RESET = "\033[0m"

# Kontrakt KLAS TORU PRĄDOWEGO — skrócenie tej listy w kodzie (np. wypadnięcie
# `snTrunk`) to dokładnie zmiana, przed którą wymóg 3 chroni.
REQUIRED_SEGMENT_KINDS = ["snTrunk", "sn", "lv", "bus", "busGpz"]
REQUIRED_CONTINUITY_APPARATUS = [
    "breaker",
    "disconnector",
    "loadBreakSwitch",
    "fuseSwitch",
    "noPoint",
    # Łącznik/wyłącznik sekcyjny NA torze ciągu (glify z portami W/E).
    "lineSwitch",
    "lineBreaker",
    # Rysunek QElectroTech EN 60617 łączników toru pola liniowego GPZ (karta UX-04).
    "qetBreaker",
    # Ten sam wyłącznik toru ze znakiem napędu silnikowego M (rekord `naped`, karta UX-04).
    "qetBreakerZNapedem",
    "qetDisconnector",
    "qetLoadBreakSwitch",
    "qetFuseSwitch",
    "qetThreePositionSwitch",
    # Łącznik trójpołożeniowy ze znakiem napędu zasobnikowego (decyzja architekta 2026-10-30)
    # i wyłącznik w wykonaniu wysuwnym, bez i z napędem M (rekord `wykonanie`,
    # rozstrzygnięcie architekta 2026-10-30 pkt 3) — te same aparaty ciągłości toru.
    "qetThreePositionSwitchZNapedem",
    "qetBreakerWysuwny",
    "qetBreakerWysuwnyZNapedem",
]
REQUIRED_GAP_REASONS = [
    "brak-toru-glownego",
    "brak-aparatow-ciaglosci",
    "brak-zrodla",
    "stacja-odcieta",
]

# Funkcje budowy sceny: dokładnie jeden parametr (migawka modelu).
SCENE_BUILDERS = {
    "buildSceneV3": "ui/sld/v3/scene/buildScene.ts",
    "scenaSld": "ui/sld/v3/scene/scenaSld.ts",
}
# Katalogi, w których powstaje scena — nie mogą znać kamery ani gęstości informacji.
SCENE_DIRS = ["scene", "compose", "layout", "symbols", "sheet"]
FORBIDDEN_SCENE_IMPORTS = re.compile(r"from\s+'[^']*canvas/(camera|gestoscInformacji)'")

# Identyfikatory dawnego mechanizmu poziomów szczegółu (karta R1/R9). Każde wystąpienie
# w kodzie, teście, e2e albo skrypcie oznacza, że ktoś przywraca scenę zależną od skali.
FORBIDDEN_IDENTIFIERS = [
    "SceneLod",
    "lodOverride",
    "fitTargetLod",
    "stationCollapsed",
    "gpzCollapsed",
    "StationCollapsedGlyph",
    "GpzCollapsedGlyph",
    "data-scene-lod",
    "expandCollapsedBlock",
    "lodFromScale",
    "DEFAULT_LOD_THRESHOLDS",
    "LABEL_PLAN_PRODUCTION_SCALES",
    "SCENE_LOD_LABELS_PL",
    "LOD_CROSSFADE",
    "miniRmuGrammar",
    "lodController",
]
SCAN_ROOTS = ["src", "e2e", "scripts"]
SCAN_SUFFIXES = {".ts", ".tsx", ".mjs", ".js"}


def passed(msg: str) -> None:
    print(f"{GREEN}PASS{RESET} {msg}")


def read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def declared_list(source: str, const_name: str) -> list[str] | None:
    """Elementy literału tablicowego przypisanego do stałej (kolejność z kodu)."""
    match = re.search(
        rf"export const {re.escape(const_name)}[^=]*=\s*\[(.*?)\]",
        source,
        re.DOTALL,
    )
    if not match:
        return None
    return re.findall(r"'([^']+)'", match.group(1))


def function_params(source: str, name: str) -> list[str] | None:
    """Parametry deklaracji `export function name(...)` (nawiasy zbalansowane)."""
    match = re.search(rf"export function {re.escape(name)}\s*(<[^>]*>)?\s*\(", source)
    if not match:
        return None
    depth = 1
    i = match.end()
    start = i
    while i < len(source) and depth:
        if source[i] in "([{<":
            depth += 1
        elif source[i] in ")]}>" and source[i - 1 : i + 1] != "=>":
            depth -= 1
        i += 1
    inner = source[start : i - 1]
    params: list[str] = []
    depth = 0
    current = ""
    for k, ch in enumerate(inner):
        if ch in "([{<":
            depth += 1
        elif ch in ")]}>" and inner[k - 1 : k + 1] != "=>":
            depth -= 1
        if ch == "," and depth == 0:
            params.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        params.append(current.strip())
    return params


def guard_continuity(violations: list[str]) -> None:
    v3 = FRONTEND / "src" / "ui" / "sld" / "v3"
    module = v3 / "scene" / "ciagloscToru.ts"
    defs = v3 / "symbols" / "defs.ts"
    module_src = read(module)
    if module_src is None:
        violations.append(f"GUARD 1: brak modułu wyroczni ciągłości — {rel(module)}")
    else:
        segment_kinds = declared_list(module_src, "CURRENT_PATH_SEGMENT_KINDS")
        apparatus = declared_list(read(defs) or "", "CONTINUITY_APPARATUS_SYMBOL_IDS")
        if not re.search(
            r"export \{\s*CONTINUITY_APPARATUS_SYMBOL_IDS\s*\} from '\.\./symbols/defs'",
            module_src,
        ):
            violations.append(
                "GUARD 1: wyrocznia nie reeksportuje CONTINUITY_APPARATUS_SYMBOL_IDS z rejestru"
                " symboli (druga kopia zbioru albo brak kontraktu)"
            )
        if segment_kinds is None:
            violations.append("GUARD 1: brak deklaracji CURRENT_PATH_SEGMENT_KINDS")
        else:
            missing = [k for k in REQUIRED_SEGMENT_KINDS if k not in segment_kinds]
            if missing:
                violations.append(
                    "GUARD 1: klasy odcinków toru prądowego USUNIĘTE z kontraktu — "
                    + ", ".join(missing)
                )
        if apparatus is None:
            violations.append("GUARD 1: brak deklaracji CONTINUITY_APPARATUS_SYMBOL_IDS")
        else:
            missing = [k for k in REQUIRED_CONTINUITY_APPARATUS if k not in apparatus]
            if missing:
                violations.append(
                    "GUARD 1: aparaty ciągłości USUNIĘTE z kontraktu — " + ", ".join(missing)
                )
        for reason in REQUIRED_GAP_REASONS:
            if f"'{reason}'" not in module_src:
                violations.append(f"GUARD 1: wyrocznia nie zgłasza braku '{reason}'")
    if not any(v.startswith("GUARD 1:") for v in violations):
        passed("GUARD 1: kontrakt klas toru prądowego kompletny w wyroczni")

    test = v3 / "scene" / "__tests__" / "ciagloscToru.test.ts"
    test_src = read(test)
    if test_src is None:
        violations.append(f"GUARD 2: brak testu kontraktowego — {rel(test)}")
    else:
        for reason in REQUIRED_GAP_REASONS:
            if f"'{reason}'" not in test_src:
                violations.append(f"GUARD 2: test nie sprawdza braku '{reason}'")
        if "REGRESJA WSTRZYKNIĘTA" not in test_src:
            violations.append("GUARD 2: test bez sekcji regresji wstrzykniętej (dowodu, że gryzie)")
    if not any(v.startswith("GUARD 2:") for v in violations):
        passed("GUARD 2: test kontraktowy ciągłości obecny i pełny")


def guard_scene_signature(violations: list[str]) -> None:
    src_root = FRONTEND / "src"
    for name, path_rel in SCENE_BUILDERS.items():
        path = src_root / path_rel
        source = read(path)
        if source is None:
            violations.append(f"GUARD 3: brak modułu budowy sceny — {rel(path)}")
            continue
        params = function_params(source, name)
        if params is None:
            violations.append(f"GUARD 3: brak deklaracji `export function {name}` w {rel(path)}")
        elif len(params) != 1:
            violations.append(
                f"GUARD 3: `{name}` przyjmuje {len(params)} parametry ({', '.join(params)}) — "
                "scena może zależeć wyłącznie od migawki modelu"
            )
    v3 = src_root / "ui" / "sld" / "v3"
    for directory in SCENE_DIRS:
        base = v3 / directory
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if path.suffix not in {".ts", ".tsx"} or "__tests__" in path.parts:
                continue
            for line_no, line in enumerate((read(path) or "").splitlines(), start=1):
                if FORBIDDEN_SCENE_IMPORTS.search(line):
                    violations.append(
                        "GUARD 3: moduł sceny importuje kamerę albo gęstość informacji — "
                        f"{rel(path)}:{line_no}"
                    )
    if not any(v.startswith("GUARD 3:") for v in violations):
        passed("GUARD 3: scena budowana wyłącznie z migawki, bez wiedzy o kamerze")


def guard_layers(violations: list[str]) -> None:
    layers = FRONTEND / "src" / "ui" / "sld" / "v3" / "canvas" / "layers.ts"
    layers_src = read(layers)
    if layers_src is None:
        violations.append(f"GUARD 4: brak {rel(layers)}")
        return
    for const_name in ("STATIONS_APPARATUS_KINDS", "DER_SOURCES_KINDS"):
        match = re.search(
            rf"const {const_name}[^=]*=\s*new Set\(\[(.*?)\]\)", layers_src, re.DOTALL
        )
        members = re.findall(r"'([^']+)'", match.group(1)) if match else []
        if "segment" in members:
            violations.append(
                f"GUARD 4: tor mocy (elementKind 'segment') przypięty do warstwy {const_name} "
                "— przełącznik warstw mógłby ukryć cały tor"
            )
    if not any(v.startswith("GUARD 4:") for v in violations):
        passed("GUARD 4: tor mocy poza filtrem warstw (zawsze widoczny)")


READABILITY_FUNCTIONS = ("isLabelReadableAtScale", "czytelnyNaEkranie")
LABEL_CONTEXT = re.compile(r"label|etykiet|napis|opis|font|typograf|tozsam", re.IGNORECASE)


def guard_readability(violations: list[str]) -> None:
    canvas_dir = FRONTEND / "src" / "ui" / "sld" / "v3" / "canvas"
    paths = sorted(p for p in canvas_dir.glob("*.ts*") if p.name != "gestoscInformacji.ts")
    for path in paths:
        for line_no, line in enumerate((read(path) or "").splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith(("//", "*", "/*", "import ")):
                continue
            used = [fn for fn in READABILITY_FUNCTIONS if f"{fn}(" in line]
            if not used:
                continue
            reszta = line
            for fn in READABILITY_FUNCTIONS:
                reszta = reszta.replace(fn, "")
            if not LABEL_CONTEXT.search(reszta):
                violations.append(
                    "GUARD 5: próg czytelności użyty poza kontekstem napisu — "
                    f"{rel(path)}:{line_no}"
                )
    if not any(v.startswith("GUARD 5:") for v in violations):
        passed("GUARD 5: próg czytelności ograniczony do napisów")


def guard_forbidden_identifiers(violations: list[str]) -> None:
    pattern = re.compile(r"\b(" + "|".join(re.escape(i) for i in FORBIDDEN_IDENTIFIERS) + r")\b")
    for root_name in SCAN_ROOTS:
        root = FRONTEND / root_name
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix not in SCAN_SUFFIXES or "node_modules" in path.parts:
                continue
            for line_no, line in enumerate((read(path) or "").splitlines(), start=1):
                match = pattern.search(line)
                if match:
                    violations.append(
                        f"GUARD 6: identyfikator dawnych poziomów szczegółu `{match.group(1)}` — "
                        f"{rel(path)}:{line_no}"
                    )
    if not any(v.startswith("GUARD 6:") for v in violations):
        passed("GUARD 6: zero identyfikatorów dawnych poziomów szczegółu")


def guard_workflow(violations: list[str]) -> None:
    workflow_src = read(WORKFLOW)
    if workflow_src is None:
        violations.append(f"GUARD 7: brak workflow {WORKFLOW}")
        return
    if "sld_scena_niezalezna_od_skali_guard.py" not in workflow_src:
        violations.append("GUARD 7: strażnik nie jest uruchamiany w sld-determinism.yml")
    if "ciagloscToru.test.ts" not in workflow_src:
        violations.append("GUARD 7: test kontraktowy ciągłości nie jest uruchamiany w CI")
    if not any(v.startswith("GUARD 7:") for v in violations):
        passed("GUARD 7: strażnik + test wpięte w bramkę determinizmu SLD")


def main() -> int:
    violations: list[str] = []
    guard_continuity(violations)
    guard_scene_signature(violations)
    guard_layers(violations)
    guard_readability(violations)
    guard_forbidden_identifiers(violations)
    guard_workflow(violations)
    print()
    if violations:
        print(f"{RED}TOTAL: {len(violations)} naruszeń — CI BLOCKED{RESET}")
        for v in violations:
            print(f"  {v}")
        return 1
    print(f"{GREEN}TOTAL: 0 naruszeń — scena SLD niezależna od skali kamery{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

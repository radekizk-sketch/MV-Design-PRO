#!/usr/bin/env python3
"""SLD LOD Continuity Guard — strażnik ciągłości toru energii w poziomach szczegółu (LOD).

Karta K11-B §0.3 (b), dyrektywa właściciela z oceny ekranu 2/10, wymóg 3:
„LOD NIGDY nie ukrywa toru przepływu energii ani aparatów ciągłości elektrycznej
(odłącznik/wyłącznik w torze) — na KAŻDYM poziomie LOD tor od źródła przez
magistralę do stacji pozostaje wyrysowany."

DWA POZIOMY OCHRONY (karta §0.3). Poziom (a) to WYROCZNIA DYNAMICZNA — test
kontraktowy `ui/sld/v3/scene/__tests__/lodContinuity.test.ts` liczy realną
ciągłość na sieci referencyjnej dla każdego LOD (i ma sekcję regresji
wstrzykniętej, która dowodzi, że gryzie). Poziom (b) to TEN strażnik: asercja
STATYCZNA na kodzie, która łapie klasę zmian, jakiej test dynamiczny z natury
nie złapie w CI, jeżeli ktoś przy okazji ruszy też sam test — czyli ciche
osłabienie KONTRAKTU (skrócenie listy klas toru prądowego, przypięcie toru do
przełączalnej warstwy, rozciągnięcie progu czytelności z etykiet na symbole,
uzależnienie emisji magistrali od poziomu LOD, wypięcie testu z CI).

Exit code: 0 = OK, 1 = naruszenia.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
V3 = FRONTEND_SRC / "ui" / "sld" / "v3"
WORKFLOW = REPO_ROOT.parent / ".github" / "workflows" / "sld-determinism.yml"

CONTINUITY_MODULE = V3 / "scene" / "lodContinuity.ts"
CONTINUITY_TEST = V3 / "scene" / "__tests__" / "lodContinuity.test.ts"
LAYERS_MODULE = V3 / "canvas" / "layers.ts"
CANVAS_MODULE = V3 / "canvas" / "SldCanvasV3.tsx"
SCENE_MODULE = V3 / "scene" / "buildScene.ts"

RED = "\033[91m"
GREEN = "\033[92m"
RESET = "\033[0m"

# Kontrakt KLAS TORU PRĄDOWEGO — musi być zadeklarowany w module wyroczni
# w całości. Skrócenie tej listy w kodzie (np. wypadnięcie `snTrunk`) to
# dokładnie ta zmiana, przed którą wymóg 3 chroni.
REQUIRED_SEGMENT_KINDS = ["snTrunk", "sn", "lv", "bus", "busGpz"]
REQUIRED_CONTINUITY_APPARATUS = [
    "breaker",
    "disconnector",
    "loadBreakSwitch",
    "fuseSwitch",
    "noPoint",
]
# Powody braków, które wyrocznia MUSI umieć zgłosić (i test — sprawdzić).
REQUIRED_GAP_REASONS = [
    "brak-toru-glownego",
    "brak-aparatow-ciaglosci",
    "brak-zrodla",
    "stacja-odcieta",
]


def passed(msg: str) -> None:
    print(f"{GREEN}PASS{RESET} {msg}")


def read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


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


def main() -> int:
    violations: list[str] = []

    # -- GUARD 1: moduł wyroczni istnieje i deklaruje PEŁNY kontrakt klas. ----
    module_src = read(CONTINUITY_MODULE)
    if module_src is None:
        violations.append(
            f"GUARD 1: brak modułu wyroczni ciągłości — {CONTINUITY_MODULE.relative_to(REPO_ROOT)}"
        )
    else:
        segment_kinds = declared_list(module_src, "CURRENT_PATH_SEGMENT_KINDS")
        apparatus = declared_list(module_src, "CONTINUITY_APPARATUS_SYMBOL_IDS")
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

    # -- GUARD 2: test kontraktowy istnieje i sprawdza WSZYSTKIE powody. ------
    test_src = read(CONTINUITY_TEST)
    if test_src is None:
        violations.append(
            f"GUARD 2: brak testu kontraktowego — {CONTINUITY_TEST.relative_to(REPO_ROOT)}"
        )
    else:
        for reason in REQUIRED_GAP_REASONS:
            if f"'{reason}'" not in test_src:
                violations.append(f"GUARD 2: test nie sprawdza braku '{reason}'")
        # Sekcja regresji wstrzykniętej jest częścią kontraktu: bez niej zielony
        # wynik testu nie dowodzi, że wyrocznia w ogóle gryzie.
        if "REGRESJA WSTRZYKNIĘTA" not in test_src:
            violations.append("GUARD 2: test bez sekcji regresji wstrzykniętej (dowodu, że gryzie)")
    if not any(v.startswith("GUARD 2:") for v in violations):
        passed("GUARD 2: test kontraktowy ciągłości obecny i pełny")

    # -- GUARD 3: emisja magistrali NIE jest bramkowana poziomem LOD. --------
    scene_src = read(SCENE_MODULE)
    if scene_src is None:
        violations.append(f"GUARD 3: brak {SCENE_MODULE.relative_to(REPO_ROOT)}")
    else:
        lod_gate = re.compile(r"\blod\s*(===|!==|>=|<=|>|<)")
        for line_no, line in enumerate(scene_src.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            if "snTrunk" in line and lod_gate.search(line):
                violations.append(
                    "GUARD 3: emisja toru magistrali bramkowana poziomem LOD — "
                    f"{SCENE_MODULE.relative_to(REPO_ROOT)}:{line_no}"
                )
        if not any(v.startswith("GUARD 3:") for v in violations):
            passed("GUARD 3: magistrala emitowana niezależnie od poziomu LOD")

    # -- GUARD 4: tor mocy nie jest przypięty do PRZEŁĄCZALNEJ warstwy. ------
    # `layerIdForElementMeta` zwraca `null` = element ZAWSZE widoczny. Segmenty
    # toru mocy niosą `elementKind === 'segment'`; gdyby ta kategoria trafiła do
    # zbioru którejś warstwy, przełącznik warstw mógłby wygasić cały tor.
    layers_src = read(LAYERS_MODULE)
    if layers_src is None:
        violations.append(f"GUARD 4: brak {LAYERS_MODULE.relative_to(REPO_ROOT)}")
    else:
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

    # -- GUARD 5: próg czytelności dotyczy WYŁĄCZNIE etykiet. ----------------
    # Etykieta poniżej progu znika W CAŁOŚCI (uczciwie, V12K-218). Rozciągnięcie
    # tej samej reguły na symbole/odcinki złamałoby wymóg 3 — tor przestałby być
    # rysowany przy oddaleniu. Sprawdzamy, że każde użycie progu w kanwie stoi
    # w kontekście etykiety.
    canvas_src = read(CANVAS_MODULE)
    if canvas_src is None:
        violations.append(f"GUARD 5: brak {CANVAS_MODULE.relative_to(REPO_ROOT)}")
    else:
        for line_no, line in enumerate(canvas_src.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            if "isLabelReadableAtScale" not in line:
                continue
            if "label" not in line.lower():
                violations.append(
                    "GUARD 5: próg czytelności użyty poza kontekstem etykiety — "
                    f"{CANVAS_MODULE.relative_to(REPO_ROOT)}:{line_no}"
                )
        if not any(v.startswith("GUARD 5:") for v in violations):
            passed("GUARD 5: próg czytelności ograniczony do etykiet")

    # -- GUARD 6: strażnik i test wpięte w bramkę determinizmu SLD. ----------
    workflow_src = read(WORKFLOW)
    if workflow_src is None:
        violations.append(f"GUARD 6: brak workflow {WORKFLOW}")
    else:
        if "sld_lod_continuity_guard.py" not in workflow_src:
            violations.append("GUARD 6: strażnik nie jest uruchamiany w sld-determinism.yml")
        if "lodContinuity.test.ts" not in workflow_src:
            violations.append("GUARD 6: test kontraktowy ciągłości nie jest uruchamiany w CI")
        if not any(v.startswith("GUARD 6:") for v in violations):
            passed("GUARD 6: strażnik + test wpięte w bramkę determinizmu SLD")

    print()
    if violations:
        print(f"{RED}TOTAL: {len(violations)} naruszeń — CI BLOCKED{RESET}")
        for v in violations:
            print(f"  {v}")
        return 1
    print(f"{GREEN}TOTAL: 0 naruszeń — ciągłość toru energii chroniona na każdym LOD{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

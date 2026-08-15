#!/usr/bin/env python3
"""
SLD-LAYER-ID-SCOPE GUARD — `SldLayerId` tylko w warstwie renderera.

BINDING RULE (PR-O konsolidacji UI - kierunek pkt 3):
- `SldLayerId` (typ z `LodPolicy.ts`) jest niskopoziomową kategorią
  warstw renderera SldCanvasV2. Nie powinien przeciekać do warstwy UX
  (LayerTogglePanel, BuildSidebar) ani do logiki domenowej.
- Komponenty UX MUSZĄ używać `LayerId` z `layerToggle.ts` + mapowanie
  przez `layerMapping.ts:mapLayerStateToRenderVisibility()`.

Cel: zachować pojedyncze źródło prawdy dla user-facing toggle warstw
i nie pozwolić by SldLayerId stał się znowu drugim systemem warstw.

Dozwolone lokalizacje (whitelist):
- `frontend/src/ui/sld/v2/lod/` - definicja typu + most LAYER_RENDER_MAPPING
- `frontend/src/ui/sld/v2/canvas/` - SldCanvasV2 i jego pomocnicze pliki

Usage:
  python scripts/sld_layer_id_scope_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_DIRS = ["frontend/src"]
FILE_EXTENSIONS = {".ts", ".tsx"}

# Whitelist - katalogi w których SldLayerId może występować
ALLOWED_DIR_PREFIXES = (
    "frontend/src/ui/sld/v2/lod/",
    "frontend/src/ui/sld/v2/canvas/",
    # Testy v2 - asercje wewnętrzne contract testów
    "frontend/src/ui/sld/v2/__tests__/",
)

# Pliki indywidualnie wyłączone (legacy do migracji w future PR-ach):
LEGACY_FILES = {
    # LayersSection - panel warstw w build-sidebar, używa SldLayerId.
    # Nieaktywny w produkcyjnym UI (tylko w testach jednostkowych
    # BuildSidebar). Do migracji na LayerId + mapowanie w osobnym PR.
    "frontend/src/ui/network-build/build-sidebar/LayersSection.tsx",
    # DWA WPISY USUNIETE 2026-08-12 (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja f
    # — POMIAR PRZED NAPRAWA): check_legacy_files_freshness() zastala je jako
    # sieroty — oba pliki istnieja, ale ZADEN juz nie odwoluje sie wprost do
    # SldLayerId/DEFAULT_LAYER_VISIBILITY/LAYER_LABELS_PL (potwierdzone
    # niezaleznym grep). BuildSidebar.tsx konsumuje LayersSection przez
    # `LayersSectionProps`, nie przez surowy typ warstwy renderera. Usuniecie
    # nie odslania naruszenia w glownej petli main() (scan_file() na obu
    # plikach juz dzis zwraca []):
    # "frontend/src/ui/network-build/build-sidebar/BuildSidebar.tsx",
    # "frontend/src/ui/network-build/build-sidebar/__tests__/BuildSidebar.test.tsx".
}

# Wzorce wykrywające użycie typu/wartości SldLayerId
LAYER_ID_PATTERN = re.compile(
    r"\bSldLayerId\b|\bDEFAULT_LAYER_VISIBILITY\b|\bLAYER_LABELS_PL\b(?=\s*\[)",
)

IGNORE_PATTERN = re.compile(r"//\s*sld-layer-id-ignore")


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str
    match: str


def is_allowed(file_path: Path) -> bool:
    rel = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    if rel in LEGACY_FILES:
        return True
    return any(rel.startswith(d) for d in ALLOWED_DIR_PREFIXES)


def scan_file(file_path: Path) -> list[Violation]:
    rel_path = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    violations: list[Violation] = []
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return violations

    for i, line in enumerate(content.splitlines(), start=1):
        if IGNORE_PATTERN.search(line):
            continue
        m = LAYER_ID_PATTERN.search(line)
        if m:
            violations.append(
                Violation(
                    file_path=rel_path,
                    line_number=i,
                    line_content=line.strip(),
                    match=m.group(),
                )
            )
    return violations


def check_legacy_files_freshness() -> list[str]:
    """Zapadka swiezosci LEGACY_FILES (karta ZAPADKI-ALLOWLIST-RESZTA,
    pozycja f, 2026-08-12).

    Kazdy wpis jest opisany jako "uzywa SldLayerId" (dlug legacy do migracji) —
    czyli deklaruje ZNANE, REALNE trafienie wzorca, nie tylko role. Pelna
    zapadka dwukierunkowa: plik musi istniec ORAZ nadal produkowac >=1
    trafienie `scan_file()`, gdyby nie byl wylaczony — `scan_file()` nie
    zaglada do LEGACY_FILES samo z siebie (filtrowanie robi `is_allowed()`
    PRZED jej wywolaniem w `main()`), wiec mozna ja wywolac wprost i uzyskac
    ten sam predykat (predykaty parami, KLASA-NIE-INSTANCJA S3). Wpis, ktory
    przestal trafiac (plik zmigrowany na LayerId, ale zapomniany na liscie),
    jest martwym wyjatkiem: gdyby SldLayerId kiedys WROCIL do TEGO SAMEGO
    pliku, przeszedlby bez kontroli.
    """
    violations: list[str] = []
    for rel_path in sorted(LEGACY_FILES):
        full_path = REPO_ROOT / rel_path
        if not full_path.is_file():
            violations.append(
                f"[sld-layer-id-wpis-osierocony] LEGACY_FILES zawiera {rel_path!r}, "
                "ktorego juz nie ma w repo — usun ten wpis"
            )
            continue
        if scan_file(full_path):
            continue
        violations.append(
            f"[sld-layer-id-wpis-osierocony] LEGACY_FILES zawiera {rel_path!r}, ktory juz "
            "nie zawiera zadnego uzycia SldLayerId/DEFAULT_LAYER_VISIBILITY/LAYER_LABELS_PL "
            "— usun ten wpis"
        )
    return violations


def main() -> int:
    all_violations: list[Violation] = []
    for scan_dir in SCAN_DIRS:
        base = REPO_ROOT / scan_dir
        if not base.exists():
            continue
        for file_path in base.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix not in FILE_EXTENSIONS:
                continue
            if is_allowed(file_path):
                continue
            all_violations.extend(scan_file(file_path))

    if all_violations:
        print("=" * 60)
        print("GUARD: sld_layer_id_scope_guard")
        print("=" * 60)
        print()
        print(
            f"FAIL: {len(all_violations)} użyć SldLayerId/DEFAULT_LAYER_VISIBILITY "
            "poza warstwą renderera."
        )
        print()
        print(
            "Zasada: SldLayerId jest niskopoziomowym typem warstw renderera.\n"
            "Komponenty UX MUSZĄ używać LayerId z layerToggle.ts + mapowanie:\n"
            "  import { mapLayerStateToRenderVisibility } from '.../lod/layerMapping';\n"
        )
        for v in all_violations:
            print(f"  {v.file_path}:{v.line_number}: znaleziono '{v.match}'")
            print(f"    {v.line_content}")
        print()
        print(
            "Jeśli plik jest legacy lub potrzebuje świadomego dostępu - dodaj komentarz\n"
            "// sld-layer-id-ignore na końcu linii lub dodaj do LEGACY_FILES w guardzie."
        )

    freshness_violations = check_legacy_files_freshness()
    if freshness_violations:
        print("=" * 60)
        print("GUARD: sld_layer_id_scope_guard — LEGACY_FILES OSIEROCONE")
        print("=" * 60)
        for message in freshness_violations:
            print(f"  {message}")
        print()

    if all_violations or freshness_violations:
        return 1

    print("sld-layer-id-scope-guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

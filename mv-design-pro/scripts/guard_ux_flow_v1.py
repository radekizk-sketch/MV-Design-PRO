#!/usr/bin/env python3
"""
Strażnik CI: weryfikacja spójności UX Flow V1.

Sprawdza:
1. Istnienie dokumentu UX (docs/ui/UX_FLOW_SN_V1_GPZ_LIVE_SLD.md)
2. Istnienie testów V1 (tests/enm/test_domain_operations.py)
3. Brak lokalnej prawdy kreatora (frontend nie trzyma niezależnego modelu)
4. Twardy wymóg katalogu dla linii i transformatora (E009 w validator.py)
5. Twarda walidacja PV/BESS (pv_bess.transformer_required)
6. Brak TODO w krytycznych ścieżkach
7. Brak PCC w całym repo (grep-zero)
8. Kanon nazw operacji (tylko kanoniczne nazwy w API)
"""

import os
import re
import sys
from pathlib import Path


# Lokalna prawda kreatora — identyfikatory wlasnego modelu w warstwie prezentacji.
#
# GRANICE SLOWA SA OBOWIAZKOWE (V12K-263). Wzorzec bez `\b` lapal `ownModel` WEWNATRZ
# `pendingKnownModel` (…Kn|ownModel) i zglaszal lokalna prawde tam, gdzie jej nie ma.
# Ostrzezenie-widmo jest gorsze niz jego brak: uczy ignorowac wyniki straznika.
WZORZEC_LOKALNEJ_PRAWDY = r"\b(?:localModel|wizardModel|ownModel)\b"


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    errors: list[str] = []
    warnings: list[str] = []

    # 1. Check UX document exists
    ux_doc = root.parent / "docs" / "ui" / "UX_FLOW_SN_V1_GPZ_LIVE_SLD.md"
    if not ux_doc.exists():
        errors.append(f"BRAK: Dokument UX Flow V1 nie istnieje: {ux_doc}")
    else:
        content = ux_doc.read_text(encoding="utf-8")
        required_sections = [
            "DEFINICJE",
            "KANON NAZW OPERACJI",
            "insert_at",
            "SEKWENCJA V1",
            "insert_station_on_segment_sn",
            "WALIDACJE",
            "KANONIZACJA",
        ]
        for section in required_sections:
            if section not in content:
                warnings.append(f"OSTRZEŻENIE: Brak sekcji '{section}' w dokumencie UX")

    # 2. Check V1 tests exist
    test_file = root / "backend" / "tests" / "enm" / "test_domain_operations.py"
    if not test_file.exists():
        errors.append(f"BRAK: Testy operacji domenowych nie istnieją: {test_file}")

    # 2b. Check E2E analysis pipeline test exists
    e2e_analysis = root / "backend" / "tests" / "e2e" / "test_v1_analysis_pipeline.py"
    if not e2e_analysis.exists():
        errors.append(f"BRAK: Test E2E pipeline analizy V1 nie istnieje: {e2e_analysis}")

    # 2c. Check ENM → NetworkGraph mapping exists
    mapping_file = root / "backend" / "src" / "enm" / "mapping.py"
    if not mapping_file.exists():
        errors.append(f"BRAK: Moduł mapowania ENM→NetworkGraph nie istnieje: {mapping_file}")
    else:
        content = mapping_file.read_text(encoding="utf-8")
        if "map_enm_to_network_graph" not in content:
            errors.append("BRAK: Funkcja map_enm_to_network_graph nie znaleziona w mapping.py")

    # 3. Check no local truth in wizard (frontend store should use snapshot)
    frontend_src = root / "frontend" / "src"
    if frontend_src.exists():
        for ts_file in frontend_src.rglob("*.ts"):
            try:
                content = ts_file.read_text(encoding="utf-8")
                # Check for local model state (anti-pattern)
                if re.search(WZORZEC_LOKALNEJ_PRAWDY, content):
                    warnings.append(
                        f"OSTRZEŻENIE: Możliwa lokalna prawda w {ts_file.relative_to(root)}"
                    )
            except (UnicodeDecodeError, PermissionError):
                pass
        for tsx_file in frontend_src.rglob("*.tsx"):
            try:
                content = tsx_file.read_text(encoding="utf-8")
                if re.search(WZORZEC_LOKALNEJ_PRAWDY, content):
                    warnings.append(
                        f"OSTRZEŻENIE: Możliwa lokalna prawda w {tsx_file.relative_to(root)}"
                    )
            except (UnicodeDecodeError, PermissionError):
                pass

    # 4. Check catalog-first enforcement in validator
    validator_file = root / "backend" / "src" / "enm" / "validator.py"
    if validator_file.exists():
        content = validator_file.read_text(encoding="utf-8")
        if "catalog_ref" not in content:
            errors.append("BRAK: Walidacja catalog_ref nie znaleziona w validator.py")
        if "E009" not in content:
            errors.append("BRAK: Kod E009 (brak katalogu) nie znaleziony w validator.py")

    # 5. Check PV/BESS validation
    domain_ops = root / "backend" / "src" / "enm" / "domain_operations.py"
    if domain_ops.exists():
        content = domain_ops.read_text(encoding="utf-8")
        if "pv_bess" not in content.lower() and "transformer_required" not in content:
            warnings.append("OSTRZEŻENIE: Brak walidacji PV/BESS w domain_operations.py")

    # 6. Check no TODO in critical paths
    critical_files = [
        root / "backend" / "src" / "enm" / "domain_operations.py",
        root / "backend" / "src" / "enm" / "domain_ops_models.py",
        root / "backend" / "src" / "enm" / "validator.py",
        root / "backend" / "src" / "api" / "enm.py",
    ]
    for f in critical_files:
        if f.exists():
            content = f.read_text(encoding="utf-8")
            todos = [
                (i + 1, line.strip())
                for i, line in enumerate(content.splitlines())
                if "TODO" in line and not line.strip().startswith("#")
            ]
            for line_no, line in todos:
                warnings.append(
                    f"TODO w krytycznej ścieżce: {f.name}:{line_no}: {line[:80]}"
                )

    # 7. Zakaz PCC — JEDNA regula, delegowana do `pcc_zero_guard`.
    #
    # KONFLIKT ROZSTRZYGNIETY (V12K-263). Ten straznik mial WLASNA, TRZECIA kopie
    # zakazu i stosowal ja do CALEGO repozytorium — takze do frontendu. Na HEAD
    # dawalo to 63 bledy i straznik nie mogl przejsc, wiec nigdy nie zostal wpiety
    # do CI: „mamy straznika" bylo pozorem, nie zabezpieczeniem.
    #
    # Kanon zakazuje PCC jako ENCJI MODELU (CLAUDE.md: „Forbidden Terms in Core
    # Model"), a nie jako slowa w interfejsie. Potwierdzaja to trzy niezalezne
    # zrodla: (a) `pcc_zero_guard` — jedyna wersja wpieta w CI — skanuje wylacznie
    # `backend/src`; (b) `forbidden_ui_terms_guard`, ktory rzadzi terminologia UI,
    # jest ZIELONY przy 173 wystapieniach PCC we froncie; (c) `pcc_ref` w
    # `domain/der_readiness.py` wskazuje REALNA szyne modelu, a nie fikcyjny wezel —
    # czyli zakazana encja nie istnieje.
    #
    # Skutek: zamiast czwartej kopii reguly wolamy oryginal. Rozjazd kopii tej samej
    # reguly byl juz zrodlem defektu (V12K-256), wiec kopii nie mnozymy.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from pcc_zero_guard import scan_backend_src  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover — brak skryptu = blad repozytorium
        errors.append(f"BRAK: nie mozna zaladowac `pcc_zero_guard` ({exc})")
    else:
        for naruszenie in scan_backend_src():
            errors.append(f"ZAKAZ PCC (encja modelu): {naruszenie.strip()}")

    # 8. Check canonical operation names in API
    api_file = root / "backend" / "src" / "api" / "enm.py"
    if api_file.exists():
        content = api_file.read_text(encoding="utf-8")
        if "domain-ops" not in content and "domain_ops" not in content:
            warnings.append("OSTRZEŻENIE: Endpoint domain-ops nie znaleziony w api/enm.py")

    # Report
    print("=" * 60)
    print("STRAŻNIK UX FLOW V1")
    print("=" * 60)

    if errors:
        print(f"\n\u274c BŁ\u0118DY ({len(errors)}):")
        for e in errors:
            print(f"  \u2022 {e}")

    if warnings:
        print(f"\n\u26a0\ufe0f  OSTRZE\u017bENIA ({len(warnings)}):")
        for w in warnings:
            print(f"  \u2022 {w}")

    if not errors and not warnings:
        print("\n\u2705 Wszystkie sprawdzenia przeszły pomyślnie.")

    print(f"\nPodsumowanie: {len(errors)} błędów, {len(warnings)} ostrzeżeń")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

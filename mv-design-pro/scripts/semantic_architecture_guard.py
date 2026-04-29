from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
SRC = FRONTEND / "src"
V12XX = ROOT / "docs" / "v12xx"

REQUIRED_FILES = (
    "frontend/src/ui/engineering-semantic/resultFreshness.ts",
    "frontend/src/ui/engineering-semantic/__tests__/sld-view-change-does-not-invalidate-calculation-results.test.ts",
    "frontend/src/ui/engineering-semantic/__tests__/semantic-change-invalidates-result.test.ts",
    "frontend/src/ui/engineering-semantic/__tests__/engineer-workflow-gpz-bay-segment-through-station.test.tsx",
    "frontend/src/ui/engineering-semantic/semanticDiagnosticsReport.ts",
    "frontend/src/ui/engineering-semantic/semanticSelection.ts",
    "frontend/src/ui/engineering-semantic/__tests__/semantic-diagnostics-report.test.ts",
    "frontend/src/ui/engineering-semantic/__tests__/semantic-selection.test.ts",
    "frontend/src/ui/sld/SldSemanticDiagnosticsPanel.tsx",
    "frontend/src/ui/sld/__tests__/SldSemanticDiagnosticsPanel.test.tsx",
    "docs/v12xx/REJESTR_DECYZJI_SEMANTYCZNYCH.md",
)

REQUIRED_DECISION_MARKERS = (
    "V12S-001",
    "V12S-002",
    "V12S-003",
    "M0",
    "M4",
    "GPZ uproszczony -> szyna SN -> pole odplywowe SN",
    "Diagnostyka semantyczna modelu",
    "ZMAPOWANY_CZESCIOWO",
)

FILE_PATTERN_RULES: dict[str, list[tuple[str, str]]] = {
    "frontend/src/ui/network-build/operationContextResolvers.ts": [
        ("nop-from-branch-type", r"branch\.type\s*===\s*['\"](?:switch|breaker|bus_coupler|disconnector)['\"]"),
        ("nop-without-logical-views", r"resolveNopCandidates\s*\(\s*snapshot\s*\)"),
    ],
    "frontend/src/engine/sld-layout/phase2-bay-detection.ts": [
        ("bay-name-fragment-classification", r"\belementName\s*\.\s*includes\s*\("),
        ("bay-terminal-name-classification", r"\bterminalNames\b"),
        ("bay-label-fragment-classification", r"\b(label|name)\s*\.\s*toLowerCase\s*\(\s*\)\s*\.\s*includes\s*\("),
    ],
    "frontend/src/ui/engineering-semantic/sldProjectionAdapter.ts": [
        ("unknown-node-fallback", r"UnknownNode|unknown.*rectangle|fallback.*node"),
    ],
    "frontend/src/ui/sld/SLDView.tsx": [
        ("local-semantic-kind-mapping", r"function\s+mapSemanticElementKindToElementType\s*\("),
        ("local-semantic-selection-builder", r"function\s+createSemanticSelectedElement\s*\("),
    ],
    "frontend/src/ui/sld/SldEditorPage.tsx": [
        ("local-semantic-kind-mapping", r"function\s+mapSemanticElementKindToElementType\s*\("),
        ("local-semantic-element-lookup", r"function\s+findSemanticElement\s*\("),
    ],
}


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8", errors="ignore")


def line_number(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def check_required_files() -> list[str]:
    violations: list[str] = []
    for relative_path in REQUIRED_FILES:
        if not (ROOT / relative_path).exists():
            violations.append(f"[missing-file] {relative_path}")
    return violations


def check_decision_register() -> list[str]:
    path = V12XX / "REJESTR_DECYZJI_SEMANTYCZNYCH.md"
    if not path.exists():
        return ["[missing-decision-register] docs/v12xx/REJESTR_DECYZJI_SEMANTYCZNYCH.md"]
    text = path.read_text(encoding="utf-8", errors="ignore")
    return [
        f"[semantic-decision-register] missing marker {marker!r}"
        for marker in REQUIRED_DECISION_MARKERS
        if marker not in text
    ]


def check_file_patterns() -> list[str]:
    violations: list[str] = []
    for relative_path, rules in FILE_PATTERN_RULES.items():
        path = ROOT / relative_path
        if not path.exists():
            violations.append(f"[missing-guard-target] {relative_path}")
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for label, pattern in rules:
            match = re.search(pattern, text, re.IGNORECASE)
            if match is None:
                continue
            violations.append(
                f"[{label}] {relative_path}:{line_number(text, match.start())}: local semantic shortcut is forbidden"
            )
    return violations


def check_semantic_model_contract() -> list[str]:
    text = read_text("frontend/src/ui/engineering-semantic/types.ts")
    match = re.search(r"export interface EngineeringSemanticModel \{(?P<body>[\s\S]*?)\n\}", text)
    if match is None:
        return ["[semantic-model-contract] EngineeringSemanticModel interface not found"]
    body = match.group("body")
    forbidden = ("violations", "diagnosticsHash", "readinessHash", "inputHash", "viewHash", "overlayHash")
    return [
        f"[semantic-model-core] EngineeringSemanticModel must not contain {field}"
        for field in forbidden
        if re.search(rf"\b{re.escape(field)}\b", body)
    ]


def check_required_contract_fields() -> list[str]:
    text = read_text("frontend/src/ui/engineering-semantic/types.ts")
    required_pairs = {
        "ResultBinding": ("elementRefId", "semanticHash", "inputSnapshotRefId", "inputHash", "proofRefId", "reportEligibility"),
        "SldOverlayProjection": ("baseViewHash", "overlayHash", "resultHash", "inputSnapshotRefId"),
        "SldRoute": ("connectionId", "pathPoints", "routeClass"),
        "EngineeringConnection": ("validatedByRuleRefs", "orientation", "connectionKind"),
        "SemanticDiagnosticsReport": (
            "enmElementsWithoutSemanticElement",
            "semanticElementsWithoutRole",
            "semanticElementsWithoutPorts",
            "semanticElementsWithoutNetworkPosition",
            "semanticElementsWithoutCatalogOrEquivalent",
            "enmElementsNotProductionRenderable",
            "elementsRenderedAsSketch",
            "elementsRenderedAsSemanticBlock",
            "legacySilentPromotionRefIds",
        ),
    }
    violations: list[str] = []
    for interface_name, fields in required_pairs.items():
        match = re.search(rf"export interface {interface_name} \{{(?P<body>[\s\S]*?)\n\}}", text)
        if match is None:
            violations.append(f"[missing-interface] {interface_name}")
            continue
        body = match.group("body")
        for field in fields:
            if not re.search(rf"\b{re.escape(field)}\b", body):
                violations.append(f"[missing-contract-field] {interface_name}.{field}")
    return violations


def check_legacy_mapping_status_contract() -> list[str]:
    text = read_text("frontend/src/ui/engineering-semantic/types.ts")
    required_statuses = (
        "ZMAPOWANY_PELNIE",
        "ZMAPOWANY_CZESCIOWO",
        "WYMAGA_DECYZJI_UZYTKOWNIKA",
        "NIEZGODNY_Z_KANONEM",
        "ODRZUCONY",
    )
    violations: list[str] = []
    for status in required_statuses:
        if status not in text:
            violations.append(f"[missing-legacy-mapping-status] {status}")
    return violations


def check_guard_script_registered() -> list[str]:
    package_json = (FRONTEND / "package.json").read_text(encoding="utf-8", errors="ignore")
    if '"guard:semantic-architecture"' not in package_json:
        return ["[missing-npm-script] frontend package.json must expose guard:semantic-architecture"]
    return []


def main() -> int:
    violations: list[str] = []
    violations.extend(check_required_files())
    violations.extend(check_decision_register())
    violations.extend(check_file_patterns())
    violations.extend(check_semantic_model_contract())
    violations.extend(check_required_contract_fields())
    violations.extend(check_legacy_mapping_status_contract())
    violations.extend(check_guard_script_registered())

    if violations:
        print("Semantic architecture guard failed:")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("Semantic architecture guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

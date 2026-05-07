from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
SRC = FRONTEND / "src"
V12XX = ROOT / "docs" / "v12xx"

REQUIRED_FILES = (
    "frontend/src/ui/engineering-semantic/semanticInspectorAdapter.ts",
    "frontend/src/ui/inspector-panel/SemanticInspectorCard.tsx",
    "frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx",
    "frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx",
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
    "frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx": [
        ("local-semantic-kind-mapping", r"function\s+mapSemanticElementKindToElementType\s*\("),
        ("local-semantic-selection-builder", r"function\s+createSemanticSelectedElement\s*\("),
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
    text = read_text("frontend/src/ui/engineering-semantic/semanticInspectorAdapter.ts")
    match = re.search(r"export interface EngineeringSemanticModelForInspector \{(?P<body>[\s\S]*?)\n\}", text)
    if match is None:
        return ["[semantic-model-contract] EngineeringSemanticModelForInspector interface not found"]
    body = match.group("body")
    forbidden = ("diagnosticsHash", "readinessHash", "inputHash", "viewHash", "overlayHash")
    return [
        f"[semantic-model-core] EngineeringSemanticModelForInspector must not contain {field}"
        for field in forbidden
        if re.search(rf"\b{re.escape(field)}\b", body)
    ]


def check_required_contract_fields() -> list[str]:
    text = read_text("frontend/src/ui/engineering-semantic/semanticInspectorAdapter.ts")
    required_pairs = {
        "EngineeringSemanticModelForInspector": ("semanticHash", "elements"),
        "EngineeringElementForInspector": (
            "refId",
            "elementKind",
            "engineeringRole",
            "functionalRole",
            "networkPosition",
            "voltageDomain",
            "completeness",
            "reportEligibility",
            "dataQualityState",
            "ports",
        ),
        "SemanticInspectorCardModel": (
            "status",
            "titlePl",
            "semanticHash",
            "refId",
            "displayName",
            "messagePl",
            "repairActionPl",
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
    text = read_text("frontend/src/ui/engineering-semantic/semanticInspectorAdapter.ts")
    required_statuses = (
        "SEMANTYKA_OK",
        "BLOKADA_SEMANTYCZNA",
        "MODEL_TECHNICZNY_NIEPELNY",
        "MODEL_TECHNICZNY_PELNY",
        "NIERAPORTOWALNY_BRAK_DANYCH",
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

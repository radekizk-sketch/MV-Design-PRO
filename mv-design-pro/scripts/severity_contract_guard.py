from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEVERITY_CONTRACT_PATH = ROOT / "backend" / "src" / "enm" / "severity.py"
VALIDATION_BOUNDARY_FILES = (
    ROOT / "backend" / "src" / "api" / "analysis_case_context.py",
    ROOT / "backend" / "src" / "api" / "enm.py",
    ROOT / "backend" / "src" / "enm" / "validator.py",
)

PUBLIC_SEVERITY_VALUES = {"BLOCKER", "IMPORTANT", "INFO"}
PUBLIC_STATUS_VALUES = {"OK", "WARN", "FAIL"}
FORBIDDEN_INLINE_VALUES = PUBLIC_SEVERITY_VALUES | PUBLIC_STATUS_VALUES
REQUIRED_CONTRACT_SYMBOLS = (
    "ValidationSeverity",
    "ValidationStatus",
    "SEVERITY_BLOCKER",
    "SEVERITY_IMPORTANT",
    "SEVERITY_INFO",
    "STATUS_OK",
    "STATUS_WARN",
    "STATUS_FAIL",
    "empty_severity_counts",
    "is_failed_status",
    "is_blocking_severity",
    "is_warning_severity",
    "severity_rank",
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def display_path(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _symbol_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def check_contract_exports() -> list[str]:
    if not SEVERITY_CONTRACT_PATH.exists():
        return [
            f"[severity-contract-missing] {SEVERITY_CONTRACT_PATH.relative_to(ROOT).as_posix()}"
        ]
    tree = ast.parse(
        read_text(SEVERITY_CONTRACT_PATH), filename=str(SEVERITY_CONTRACT_PATH)
    )
    symbols = _symbol_names(tree)
    return [
        f"[severity-contract-symbol] missing {symbol}"
        for symbol in REQUIRED_CONTRACT_SYMBOLS
        if symbol not in symbols
    ]


def _constant_parent_map(tree: ast.AST) -> dict[ast.AST, ast.AST]:
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    return parents


def _is_import_constant(node: ast.Constant, parents: dict[ast.AST, ast.AST]) -> bool:
    parent = parents.get(node)
    return isinstance(parent, ast.ImportFrom)


def check_no_inline_validation_severity() -> list[str]:
    violations: list[str] = []
    for path in VALIDATION_BOUNDARY_FILES:
        if not path.exists():
            violations.append(f"[severity-boundary-missing] {display_path(path)}")
            continue
        tree = ast.parse(read_text(path), filename=str(path))
        parents = _constant_parent_map(tree)
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and node.value in FORBIDDEN_INLINE_VALUES
                and not _is_import_constant(node, parents)
            ):
                violations.append(
                    f"[severity-inline-literal] {display_path(path)}:{node.lineno}: use enm.severity contract for {node.value!r}"
                )
    return violations


def check_severity_contract() -> list[str]:
    violations: list[str] = []
    violations.extend(check_contract_exports())
    violations.extend(check_no_inline_validation_severity())
    return violations


def main() -> int:
    violations = check_severity_contract()
    if violations:
        print("severity-contract-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("severity-contract-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

from __future__ import annotations

import ast
import sys
from pathlib import Path

import api_lifecycle_guard

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "backend" / "src" / "api"

FORBIDDEN_IMPORTS = {
    "application.analysis_dispatch",
    "application.analysis_run.service",
    "domain.analysis_run",
}
FORBIDDEN_NAMES = {
    "AnalysisRun",
    "OperatingCase",
    "get_operating_case",
    "operating_case_id",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def active_api_module_paths() -> list[Path]:
    module_paths: list[Path] = []
    seen: set[Path] = set()
    for module_name, _include_prefix in api_lifecycle_guard._main_included_routers():
        module_path = API_DIR / f"{module_name}.py"
        if module_path.exists() and module_path not in seen:
            seen.add(module_path)
            module_paths.append(module_path)
    return sorted(module_paths)


def check_legacy_public_paths() -> list[str]:
    violations: list[str] = []
    for module_path in active_api_module_paths():
        tree = ast.parse(read_text(module_path), filename=str(module_path))
        rel_path = module_path.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module in FORBIDDEN_IMPORTS:
                violations.append(
                    f"[legacy-public-import] {rel_path}:{node.lineno}: {node.module}"
                )
            if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
                violations.append(
                    f"[legacy-public-name] {rel_path}:{node.lineno}: {node.id}"
                )
            if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_NAMES:
                violations.append(
                    f"[legacy-public-attr] {rel_path}:{node.lineno}: {node.attr}"
                )
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if "operating_case_id" in node.value:
                    violations.append(
                        f"[legacy-public-string] {rel_path}:{node.lineno}: operating_case_id"
                    )
    return violations


def main() -> int:
    violations = check_legacy_public_paths()
    if violations:
        print("legacy-public-path-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("legacy-public-path-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

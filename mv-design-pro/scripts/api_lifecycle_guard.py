from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "backend" / "src" / "api"
MAIN_PATH = API_DIR / "main.py"
API_MATRIX_PATH = ROOT / "docs" / "v12xx" / "MACIERZ_KOMPATYBILNOSCI_API.md"

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
IGNORED_PATHS = {
    "/openapi.json",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
}
VALID_STATUSES = {"aktywny", "deprecated", "adapter", "usuniety"}


@dataclass(frozen=True)
class RouteContract:
    method: str
    path: str
    source: str

    @property
    def key(self) -> str:
        return f"{self.method} {self.path}"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _string_literal(node: ast.AST | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _join_paths(*parts: str) -> str:
    cleaned = []
    for part in parts:
        if not part:
            continue
        cleaned.append(part.strip("/"))
    if not cleaned:
        return "/"
    return "/" + "/".join(cleaned)


def _router_prefix(module_path: Path) -> str:
    tree = ast.parse(read_text(module_path), filename=str(module_path))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id == "APIRouter":
            for keyword in node.keywords:
                if keyword.arg == "prefix":
                    return _string_literal(keyword.value) or ""
    return ""


def _route_decorators(module_path: Path) -> list[tuple[str, str, int]]:
    tree = ast.parse(read_text(module_path), filename=str(module_path))
    routes: list[tuple[str, str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            func = decorator.func
            if not isinstance(func, ast.Attribute) or func.attr not in HTTP_METHODS:
                continue
            value = _string_literal(decorator.args[0]) if decorator.args else ""
            if value is None:
                continue
            routes.append((func.attr.upper(), value, node.lineno))
    return routes


def _main_router_imports() -> dict[str, str]:
    tree = ast.parse(read_text(MAIN_PATH), filename=str(MAIN_PATH))
    imports: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        if not node.module or not node.module.startswith("api."):
            continue
        module_name = node.module.removeprefix("api.")
        for alias in node.names:
            if alias.name != "router":
                continue
            imports[alias.asname or alias.name] = module_name
    return imports


def _main_included_routers() -> list[tuple[str, str]]:
    tree = ast.parse(read_text(MAIN_PATH), filename=str(MAIN_PATH))
    imports = _main_router_imports()
    included: list[tuple[str, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (
            isinstance(func, ast.Attribute)
            and func.attr == "include_router"
            and isinstance(func.value, ast.Name)
            and func.value.id == "app"
        ):
            continue
        if not node.args or not isinstance(node.args[0], ast.Name):
            continue
        module_name = imports.get(node.args[0].id)
        if not module_name:
            continue
        include_prefix = ""
        for keyword in node.keywords:
            if keyword.arg == "prefix":
                include_prefix = _string_literal(keyword.value) or ""
        included.append((module_name, include_prefix))
    return included


def discover_active_api_routes() -> list[RouteContract]:
    routes: list[RouteContract] = []
    seen: set[str] = set()
    for module_name, include_prefix in _main_included_routers():
        module_path = API_DIR / f"{module_name}.py"
        if not module_path.exists():
            continue
        router_prefix = _router_prefix(module_path)
        for method, route_path, line_no in _route_decorators(module_path):
            full_path = _join_paths(include_prefix, router_prefix, route_path)
            if full_path in IGNORED_PATHS or not full_path.startswith("/api/"):
                continue
            key = f"{method} {full_path}"
            if key in seen:
                continue
            seen.add(key)
            routes.append(
                RouteContract(
                    method=method,
                    path=full_path,
                    source=f"{module_path.relative_to(ROOT).as_posix()}:{line_no}",
                )
            )
    return sorted(routes, key=lambda item: item.key)


def markdown_table_rows(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_headers: list[str] | None = None
    expecting_separator = False

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            current_headers = None
            expecting_separator = False
            continue

        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if expecting_separator:
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                expecting_separator = False
                continue
            current_headers = None
            expecting_separator = False

        if current_headers is None:
            current_headers = cells
            expecting_separator = True
            continue

        if len(cells) != len(current_headers):
            continue
        rows.append(dict(zip(current_headers, cells, strict=True)))
    return rows


def normalize_endpoint(endpoint: str) -> str:
    return endpoint.strip().strip("`")


def load_api_matrix_rows() -> dict[str, dict[str, str]]:
    rows_by_endpoint: dict[str, dict[str, str]] = {}
    for row in markdown_table_rows(read_text(API_MATRIX_PATH)):
        endpoint = normalize_endpoint(row.get("Endpoint", ""))
        if endpoint:
            rows_by_endpoint[endpoint] = row
    return rows_by_endpoint


def check_api_lifecycle_matrix() -> list[str]:
    if not API_MATRIX_PATH.exists():
        return [f"[missing-api-matrix] {API_MATRIX_PATH.relative_to(ROOT).as_posix()}"]

    matrix_rows = load_api_matrix_rows()
    violations: list[str] = []

    for route in discover_active_api_routes():
        row = matrix_rows.get(route.key)
        if row is None:
            violations.append(
                f"[api-lifecycle-missing] {route.key} from {route.source}"
            )
            continue
        status = row.get("Status", "")
        if status not in VALID_STATUSES:
            violations.append(
                f"[api-lifecycle-status] {route.key} has invalid status {status!r}"
            )
        if status in {"deprecated", "adapter"} and row.get("Data wylaczenia", "") in {
            "",
            "-",
        }:
            violations.append(
                f"[api-lifecycle-shutdown-date] {route.key} requires Data wylaczenia"
            )
        for field in (
            "Wersja",
            "Data wejscia",
            "Zakres kompatybilnosci",
            "Testy",
            "Wlasciciel",
        ):
            if not row.get(field, "").strip():
                violations.append(
                    f"[api-lifecycle-field] {route.key} missing field {field}"
                )

    return violations


def main() -> int:
    violations = check_api_lifecycle_matrix()
    if violations:
        print("api-lifecycle-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("api-lifecycle-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

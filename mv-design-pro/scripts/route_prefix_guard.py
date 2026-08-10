"""Spójność rodzin tras używanych przez frontend i serwowanych przez backend."""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import api_lifecycle_guard

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = ROOT / "frontend" / "src"
SOURCE_SUFFIXES = {".ts", ".tsx"}
API_PATH_RE = re.compile(r"/api/([A-Za-z0-9_-]+)(?=[/?`'\"${]|$)")
API_BASE_PATH_RE = re.compile(r"\$\{API_BASE\}/([A-Za-z0-9_-]+)(?=[/?`'\"${]|$)")
PLAIN_API_BASE_RE = re.compile(r"\b(?:const|let|var)\s+API_BASE\s*=\s*['\"]/api['\"]")


@dataclass(frozen=True, order=True)
class ClientRoute:
    family: str
    source: str


def _without_comments(text: str) -> str:
    """Usuń komentarze, zachowując literały używane przez kod klienta."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return re.sub(r"(^|\s)//[^\n]*", r"\1", text)


def discover_client_routes(frontend_src: Path = FRONTEND_SRC) -> list[ClientRoute]:
    routes: set[ClientRoute] = set()
    for path in sorted(frontend_src.rglob("*")):
        if path.suffix not in SOURCE_SUFFIXES or "__tests__" in path.parts:
            continue
        text = _without_comments(path.read_text(encoding="utf-8", errors="ignore"))
        matches = list(API_PATH_RE.finditer(text))
        if PLAIN_API_BASE_RE.search(text):
            matches.extend(API_BASE_PATH_RE.finditer(text))
        for match in sorted(matches, key=lambda item: item.start()):
            line = text.count("\n", 0, match.start()) + 1
            display_path = (
                path.relative_to(ROOT)
                if path.is_relative_to(ROOT)
                else path.relative_to(frontend_src)
            )
            routes.add(
                ClientRoute(
                    family=match.group(1),
                    source=f"{display_path.as_posix()}:{line}",
                )
            )
    return sorted(routes)


def served_families(paths: list[str]) -> set[str]:
    return {match.group(1) for path in paths if (match := API_PATH_RE.search(path)) is not None}


def discover_backend_paths() -> list[str]:
    """Odczytaj wszystkie zamontowane routery, także importowane pod aliasem."""
    tree = ast.parse(api_lifecycle_guard.read_text(api_lifecycle_guard.MAIN_PATH))
    imports: dict[str, tuple[str, str]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("api."):
            module = node.module.removeprefix("api.")
            for alias in node.names:
                if alias.name in {"router", "production_router"}:
                    imports[alias.asname or alias.name] = (module, alias.name)

    paths: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if (
            node.func.attr != "include_router"
            or not node.args
            or not isinstance(node.args[0], ast.Name)
        ):
            continue
        imported = imports.get(node.args[0].id)
        if imported is None:
            continue
        module, _router_name = imported
        module_path = api_lifecycle_guard.API_DIR / f"{module}.py"
        include_prefix = ""
        for keyword in node.keywords:
            if keyword.arg == "prefix":
                include_prefix = api_lifecycle_guard._string_literal(keyword.value) or ""
        router_prefix = api_lifecycle_guard._router_prefix(module_path)
        for _method, route_path, _line in api_lifecycle_guard._route_decorators(module_path):
            paths.append(api_lifecycle_guard._join_paths(include_prefix, router_prefix, route_path))
    return sorted(set(paths))


def unsupported_client_families(
    client_routes: list[ClientRoute], backend_paths: list[str]
) -> dict[str, list[str]]:
    served = served_families(backend_paths)
    unsupported: dict[str, list[str]] = {}
    for route in client_routes:
        if route.family not in served:
            unsupported.setdefault(route.family, []).append(route.source)
    return unsupported


def check_route_prefixes(
    client_routes: list[ClientRoute] | None = None,
    backend_paths: list[str] | None = None,
) -> list[str]:
    routes = discover_client_routes() if client_routes is None else client_routes
    if not routes:
        return ["[empty-client-scan] skan frontendu nie znalazł żadnej trasy /api/"]
    paths = discover_backend_paths() if backend_paths is None else backend_paths
    if not paths:
        return ["[empty-backend-scan] skan backendu nie znalazł żadnej aktywnej trasy /api/"]
    return [
        f"[unserved-client-family] /api/{family}: {', '.join(sources)}"
        for family, sources in sorted(unsupported_client_families(routes, paths).items())
    ]


def main() -> int:
    violations = check_route_prefixes()
    if violations:
        print("route-prefix-guard: BŁĄD")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("route-prefix-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

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


@dataclass(frozen=True)
class RouterSource:
    """Router modulu `api/*` rozwiazany do POSTACI, w ktorej da sie policzyc trasy.

    `var` jest nazwa zmiennej, na ktorej wisza dekoratory tras (dla routera
    pochodnego — nazwa routera BAZOWEGO, z ktorego kopiowane sa trasy).
    `excluded` to zbior `(sciezka_routera, METODA)` odjety przy budowie routera
    pochodnego, czyli trasy, ktorych w aplikacji produkcyjnej NIE MA.
    """

    module: str
    var: str
    prefix: str
    excluded: frozenset[tuple[str, str]]


class UnresolvedRouter(Exception):
    """Router wpiety do aplikacji, ktorego nie da sie rozwiazac statycznie.

    Guard jest FAIL-CLOSED: nierozpoznany ksztalt routera konczy sie naruszeniem,
    nie cichym pominieciem. To wlasnie ciche pominiecie ukrylo 62 trasy `/api`
    (patrz naglowek `_main_router_imports`).
    """


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


def _module_level_assignments(tree: ast.Module) -> dict[str, ast.expr]:
    """Przypisania na POZIOMIE MODULU: nazwa -> wyrazenie przypisane."""
    assignments: dict[str, ast.expr] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                assignments[target.id] = node.value
    return assignments


def _apirouter_prefix(call: ast.Call) -> str:
    for keyword in call.keywords:
        if keyword.arg == "prefix":
            return _string_literal(keyword.value) or ""
    return ""


def _route_key_set(node: ast.expr) -> frozenset[tuple[str, str]]:
    """Zbior literalow `("/sciezka", "METODA")` — klucze tras wylaczonych."""
    keys: set[tuple[str, str]] = set()
    if not isinstance(node, ast.Set):
        return frozenset()
    for element in node.elts:
        if not isinstance(element, ast.Tuple) or len(element.elts) != 2:
            continue
        first = _string_literal(element.elts[0])
        second = _string_literal(element.elts[1])
        if first is None or second is None:
            continue
        keys.add((first, second.upper()))
    return frozenset(keys)


def _derived_router(
    tree: ast.Module, assignments: dict[str, ast.expr], factory_name: str
) -> tuple[str, frozenset[tuple[str, str]]]:
    """Rozwiazuje router POCHODNY budowany funkcja fabryczna.

    Kanoniczny ksztalt w `api/enm.py` i `api/catalog.py`: fabryka tworzy pusty
    `APIRouter()`, przepisuje do niego trasy routera bazowego i pomija te, ktore
    stoja w module-level zbiorze `(sciezka, METODA)`. Zwraca (nazwa_bazy, wylaczone).
    """
    factory = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
            and node.name == factory_name
        ),
        None,
    )
    if factory is None:
        raise UnresolvedRouter(f"brak definicji fabryki {factory_name}")

    base_names = {
        node.iter.value.id
        for node in ast.walk(factory)
        if isinstance(node, ast.For)
        and isinstance(node.iter, ast.Attribute)
        and node.iter.attr == "routes"
        and isinstance(node.iter.value, ast.Name)
    }
    if len(base_names) != 1:
        raise UnresolvedRouter(
            f"fabryka {factory_name} nie kopiuje tras z dokladnie jednego routera"
        )
    base_name = base_names.pop()

    excluded: set[tuple[str, str]] = set()
    for node in ast.walk(factory):
        if isinstance(node, ast.Name) and node.id in assignments:
            excluded |= _route_key_set(assignments[node.id])
    return base_name, frozenset(excluded)


def _reexport_target(tree: ast.Module, symbol: str) -> tuple[str, str] | None:
    """Reeksport `from api.<inny> import <nazwa> as <symbol>` -> (inny, nazwa)."""
    for node in tree.body:
        if not isinstance(node, ast.ImportFrom) or not node.module:
            continue
        if not node.module.startswith("api."):
            continue
        for alias in node.names:
            if (alias.asname or alias.name) == symbol:
                return node.module.removeprefix("api."), alias.name
    return None


def resolve_router(module_name: str, symbol: str, _depth: int = 0) -> RouterSource:
    """Rozwiazuje `api.<module_name>.<symbol>` do zrodla tras (fail-closed)."""
    if _depth > 5:
        raise UnresolvedRouter(f"{module_name}.{symbol}: cykl reeksportow routera")
    module_path = API_DIR / f"{module_name}.py"
    if not module_path.exists():
        raise UnresolvedRouter(f"brak modulu api/{module_name}.py")
    tree = ast.parse(read_text(module_path), filename=str(module_path))
    assignments = _module_level_assignments(tree)

    value = assignments.get(symbol)
    if value is None:
        # Modul-alias nazwy trasy (np. `api/protection_analysis_runs.py` reeksportuje
        # router z `api/protection_runs.py`) — idziemy do modulu, ktory router TWORZY.
        reexport = _reexport_target(tree, symbol)
        if reexport is not None:
            return resolve_router(reexport[0], reexport[1], _depth + 1)
        raise UnresolvedRouter(
            f"{module_name}.{symbol} nie jest przypisany na poziomie modulu"
        )

    if isinstance(value, ast.Call) and isinstance(value.func, ast.Name):
        if value.func.id == "APIRouter":
            return RouterSource(
                module_name, symbol, _apirouter_prefix(value), frozenset()
            )
        base_name, excluded = _derived_router(tree, assignments, value.func.id)
        base_value = assignments.get(base_name)
        if not (
            isinstance(base_value, ast.Call)
            and isinstance(base_value.func, ast.Name)
            and base_value.func.id == "APIRouter"
        ):
            raise UnresolvedRouter(
                f"{module_name}.{symbol} kopiuje trasy z {base_name}, "
                "ktory nie jest bezposrednim APIRouter"
            )
        return RouterSource(
            module_name, base_name, _apirouter_prefix(base_value), excluded
        )

    raise UnresolvedRouter(f"{module_name}.{symbol} ma nierozpoznany ksztalt routera")


def _route_decorators(module_path: Path, router_var: str) -> list[tuple[str, str, int]]:
    """Trasy zadeklarowane dekoratorami NA WSKAZANEJ zmiennej routera."""
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
            if not (isinstance(func.value, ast.Name) and func.value.id == router_var):
                continue
            value = _string_literal(decorator.args[0]) if decorator.args else ""
            if value is None:
                continue
            routes.append((func.attr.upper(), value, node.lineno))
    return routes


def _main_router_imports() -> dict[str, tuple[str, str]]:
    """Alias uzyty w `main.py` -> (modul `api/*`, nazwa symbolu w tym module).

    DEFEKT, KTORY TO USUWA (KD-9). Poprzednia wersja przyjmowala WYLACZNIE
    `alias.name == "router"`, wiec `from api.enm import production_router` i
    `from api.catalog import production_router` nie trafialy do mapy w ogole —
    a `include_router` na nierozpoznanym aliasie byl cicho pomijany. To samo
    dotyczylo reeksportu `from api.protection_runs import router` w
    `api/protection_analysis_runs.py`.

    POMIAR (2026-07-31, HEAD przed naprawa): stary guard widzial 200 tras `/api`,
    aplikacja wystawia 262. Niewidoczne 62 trasy: 18 pod `/api/cases` (ENM,
    m.in. `station-fault-loop` i `dziennik-zmian`), 38 pod `/api/catalog`,
    4 pod `/api/protection-runs`, 2 pod `/api/projects`. Z tego 19 nie mialo
    w ogole wiersza w macierzy kompatybilnosci — przy calkowicie zielonym
    guardzie. Nazwa zmiennej nie jest kontraktem — kontraktem jest to, co
    aplikacja realnie wpina przez `include_router`.
    """
    tree = ast.parse(read_text(MAIN_PATH), filename=str(MAIN_PATH))
    imports: dict[str, tuple[str, str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        if not node.module or not node.module.startswith("api."):
            continue
        module_name = node.module.removeprefix("api.")
        for alias in node.names:
            imports[alias.asname or alias.name] = (module_name, alias.name)
    return imports


def _main_included_routers() -> list[tuple[str, str, str]]:
    """(modul, symbol, prefiks z include_router) dla KAZDEGO `app.include_router`."""
    tree = ast.parse(read_text(MAIN_PATH), filename=str(MAIN_PATH))
    imports = _main_router_imports()
    included: list[tuple[str, str, str]] = []
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
        include_prefix = ""
        for keyword in node.keywords:
            if keyword.arg == "prefix":
                include_prefix = _string_literal(keyword.value) or ""
        if not node.args or not isinstance(node.args[0], ast.Name):
            included.append(("", "<wyrazenie nie bedace nazwa>", include_prefix))
            continue
        alias = node.args[0].id
        target = imports.get(alias)
        if target is None:
            included.append(("", alias, include_prefix))
            continue
        included.append((target[0], target[1], include_prefix))
    return included


def discover_active_api_routes() -> list[RouteContract]:
    routes, _ = discover_active_api_routes_with_problems()
    return routes


def unresolved_router_problems() -> list[str]:
    _, problems = discover_active_api_routes_with_problems()
    return problems


def discover_active_api_routes_with_problems() -> tuple[list[RouteContract], list[str]]:
    """Trasy `/api` realnie wpiete do aplikacji + routery nierozwiazane."""
    routes: list[RouteContract] = []
    seen: set[str] = set()
    problems: list[str] = []
    for module_name, symbol, include_prefix in _main_included_routers():
        try:
            if not module_name:
                raise UnresolvedRouter(f"include_router({symbol}) bez importu z api.*")
            source = resolve_router(module_name, symbol)
        except UnresolvedRouter as error:
            problems.append(f"[api-lifecycle-unresolved-router] {error}")
            continue
        module_path = API_DIR / f"{source.module}.py"
        for method, route_path, line_no in _route_decorators(module_path, source.var):
            router_path = _join_paths(source.prefix, route_path)
            if (router_path, method) in source.excluded:
                continue
            full_path = _join_paths(include_prefix, source.prefix, route_path)
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
    return sorted(routes, key=lambda item: item.key), problems


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
    # Router wpiety do aplikacji, ktorego guard nie umie rozwiazac, jest
    # NARUSZENIEM — nie cichym pominieciem (patrz `_main_router_imports`).
    violations: list[str] = unresolved_router_problems()

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

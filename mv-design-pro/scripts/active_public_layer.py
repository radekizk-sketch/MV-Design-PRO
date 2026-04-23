#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = ROOT / "frontend" / "src"
BACKEND_API = ROOT / "backend" / "src" / "api"

FRONTEND_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".css")
BACKEND_EXTENSIONS = (".py",)
FRONTEND_ENTRYPOINTS = (
    FRONTEND_SRC / "main.tsx",
    FRONTEND_SRC / "App.tsx",
    FRONTEND_SRC / "ui" / "navigation" / "routes.ts",
)
BACKEND_ENTRYPOINTS = (
    BACKEND_API / "main.py",
)
SKIP_PATH_PARTS = {
    "__tests__",
    "designer",
    "dist",
    "build",
    "coverage",
    "node_modules",
    "archive",
    "archives",
}
SKIP_FILE_PARTS = (".test.", ".spec.", ".snap")

STATIC_IMPORT_PATTERN = re.compile(
    r"""(?x)
    (?:import|export)
    \s+
    (?:
        type\s+
    )?
    (?:
        [^'"]*?\s+from\s+
    )?
    ["']
    (?P<specifier>\.[^"']+)
    ["']
    """
)
DYNAMIC_IMPORT_PATTERN = re.compile(
    r"""(?x)
    import
    \(
        \s*["']
        (?P<specifier>\.[^"']+)
        ["']\s*
    \)
    """
)
PYTHON_IMPORT_PATTERN = re.compile(
    r"""(?x)
    ^
    \s*from\s+api\.(?P<module>[a-zA-Z0-9_\.]+)\s+import\s+
    """,
    re.MULTILINE,
)


def normalize(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def is_skipped(path: Path) -> bool:
    rel_parts = set(path.relative_to(ROOT).parts)
    if rel_parts & SKIP_PATH_PARTS:
        return True
    rel_path = normalize(path)
    return any(token in rel_path for token in SKIP_FILE_PARTS)


def _resolve_candidate(base: Path) -> Path | None:
    if base.exists() and base.is_file():
        return base

    suffix = base.suffix.lower()
    if suffix:
        return None

    for extension in FRONTEND_EXTENSIONS:
        candidate = base.with_suffix(extension)
        if candidate.exists() and candidate.is_file():
            return candidate

    if base.exists() and base.is_dir():
        for extension in FRONTEND_EXTENSIONS:
            candidate = base / f"index{extension}"
            if candidate.exists() and candidate.is_file():
                return candidate

    return None


def resolve_frontend_specifier(origin: Path, specifier: str) -> Path | None:
    if not specifier.startswith("."):
        return None
    candidate = _resolve_candidate((origin.parent / specifier).resolve())
    if candidate is None:
        return None
    try:
        candidate.relative_to(FRONTEND_SRC)
    except ValueError:
        return None
    if is_skipped(candidate):
        return None
    return candidate


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def iter_frontend_dependencies(path: Path) -> list[Path]:
    text = _read_text(path)
    specifiers = {
        match.group("specifier")
        for match in STATIC_IMPORT_PATTERN.finditer(text)
    }
    specifiers.update(
        match.group("specifier")
        for match in DYNAMIC_IMPORT_PATTERN.finditer(text)
    )

    resolved: list[Path] = []
    for specifier in sorted(specifiers):
        candidate = resolve_frontend_specifier(path, specifier)
        if candidate is not None:
            resolved.append(candidate)
    return resolved


def collect_active_frontend_files() -> list[Path]:
    discovered: set[Path] = set()
    queue: deque[Path] = deque(
        path for path in FRONTEND_ENTRYPOINTS if path.exists() and not is_skipped(path)
    )

    while queue:
        current = queue.popleft()
        if current in discovered:
            continue
        discovered.add(current)
        for dependency in iter_frontend_dependencies(current):
            if dependency not in discovered:
                queue.append(dependency)

    return sorted(discovered)


def collect_active_backend_api_files() -> list[Path]:
    discovered: set[Path] = set()
    queue: deque[Path] = deque(path for path in BACKEND_ENTRYPOINTS if path.exists())

    while queue:
        current = queue.popleft()
        if current in discovered:
            continue
        discovered.add(current)

        text = _read_text(current)
        for match in PYTHON_IMPORT_PATTERN.finditer(text):
            module_path = BACKEND_API / (match.group("module").replace(".", "/") + ".py")
            if module_path.exists():
                queue.append(module_path)

    return sorted(discovered)


def build_report() -> dict[str, list[str]]:
    return {
        "frontend": [normalize(path) for path in collect_active_frontend_files()],
        "backend_api": [normalize(path) for path in collect_active_backend_api_files()],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="List active public-layer source files.")
    parser.add_argument(
        "--scope",
        choices=("frontend", "backend", "all"),
        default="all",
        help="Which active layer scope to print.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print JSON instead of newline-separated paths.",
    )
    args = parser.parse_args()

    report = build_report()
    if args.scope == "frontend":
        payload: object = report["frontend"]
    elif args.scope == "backend":
        payload = report["backend_api"]
    else:
        payload = report

    if args.json:
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    if isinstance(payload, dict):
        for scope, paths in payload.items():
            print(f"[{scope}]")
            for path in paths:
                print(path)
        return 0

    for path in payload:
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())

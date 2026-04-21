from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _iter_files(base: Path, extensions: tuple[str, ...]) -> list[Path]:
    return sorted(path for ext in extensions for path in base.rglob(f"*{ext}"))


def test_no_alert_calls_in_frontend_source():
    pattern = re.compile(r"\b(?:window\.)?(?:alert|confirm|prompt)\s*\(")
    frontend_root = REPO_ROOT / "frontend" / "src"
    violations: list[str] = []
    for path in _iter_files(frontend_root, (".ts", ".tsx", ".js", ".jsx")):
        path_norm = str(path).replace("\\", "/")
        if "/__tests__/" in path_norm:
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                continue
            if pattern.search(line):
                violations.append(str(path.relative_to(REPO_ROOT)))
                break
    assert not violations, f"Zabronione wywołania alert/confirm/prompt: {violations}"


def test_no_project_codenames_in_user_visible_proof_docs_and_ui():
    pattern = re.compile(r"\b[Pp](?!0\b)\d+\b")
    targets = [
        REPO_ROOT / "docs" / "proof",
        REPO_ROOT / "docs" / "audit" / "PROOF",
        REPO_ROOT / "frontend" / "src" / "ui" / "proof",
    ]
    violations: list[str] = []
    for target in targets:
        if not target.exists():
            continue
        for path in _iter_files(target, (".md", ".ts", ".tsx", ".json")):
            if "/__tests__/" in str(path).replace("\\", "/"):
                continue
            text = path.read_text(encoding="utf-8")
            if pattern.search(text):
                violations.append(str(path.relative_to(REPO_ROOT)))
    assert not violations, f"Wykryto nazwy kodowe w obszarach user-visible: {violations}"

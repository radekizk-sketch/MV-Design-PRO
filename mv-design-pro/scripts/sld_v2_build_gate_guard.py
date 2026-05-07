#!/usr/bin/env python3
"""
SLD V2 Build Gate Guard (Phase -1)

Egzekwuje Acceptance Invariant nr 15 z planu: build/type-check/test/guards
zielone na każdej granicy merge dla aktywnego SLD V2. Konkretnie sprawdza:

1. Każdy plik źródłowy w `frontend/src/ui/sld/v2/` (z wyjątkiem testów)
   nie importuje z V1 SLD:
   - `src/ui/sld/core/...`
   - `src/ui/sld/inspector/...`
   - top-level `src/ui/sld/<file>.ts/.tsx` (poza ścieżkami `v2/...`)
2. Smoke test `buildGate.test.ts` istnieje (Phase -1 deliverable).
3. Audit doc `docs/audit/SLD_V2_BUILD_GATE_2026.md` istnieje.
4. tsconfig.json wciąż wyłącza V1 SLD przez `exclude` (do Phase 9).

Guard NIE uruchamia type-check (to robi `python-tests.yml` /
`frontend-checks.yml` w CI) — sprawdza fakt strukturalny i tripwire dokumentów.

Exit code:
  0 — wszystko OK
  1 — wykryto naruszenia (lista wypisana)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
V2_DIR = FRONTEND / "src" / "ui" / "sld" / "v2"
SLD_DIR = FRONTEND / "src" / "ui" / "sld"
TSCONFIG = FRONTEND / "tsconfig.json"
AUDIT_DOC = ROOT / "docs" / "audit" / "SLD_V2_BUILD_GATE_2026.md"
SMOKE_TEST = V2_DIR / "__tests__" / "buildGate.test.ts"

# Wzorce zakazanych importów z V1 (relatywne i absolutne).
# Pasują do ścieżek typu '../../../sld/core/X', '../../core/X', '../core/X' itp.
FORBIDDEN_V1_PATTERNS = [
    re.compile(r"""['\"](?:\.\./)+sld/core/"""),
    re.compile(r"""['\"](?:\.\./)+sld/inspector/"""),
    # Top-level pliki V1 (np. ../../sld/SldEditorPage, ../../sld/SldShellLayout)
    # — celowo NIE blokujemy importu samego "../../sld" jeśli idzie do v2/.
    re.compile(r"""['\"](?:\.\./)+sld/[A-Z][A-Za-z0-9_]*['\"]"""),
    re.compile(r"""['\"](?:\.\./)+sld/[A-Z][A-Za-z0-9_]*\.(?:ts|tsx)['\"]"""),
]

# Pliki testowe wykluczamy z gate'u (mogą importować V1 dla porównań golden /
# regression — choć obecnie nie robią tego).
EXCLUDED_PATH_FRAGMENTS = (
    "/__tests__/",
    ".test.ts",
    ".test.tsx",
)


def iter_v2_source_files() -> list[Path]:
    files: list[Path] = []
    for path in V2_DIR.rglob("*.ts*"):
        rel = str(path.as_posix())
        if any(frag in rel for frag in EXCLUDED_PATH_FRAGMENTS):
            continue
        files.append(path)
    return sorted(files)


def scan_forbidden_imports(files: list[Path]) -> list[tuple[Path, int, str]]:
    violations: list[tuple[Path, int, str]] = []
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as exc:  # pragma: no cover
            violations.append((path, 0, f"read error: {exc}"))
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if not (
                stripped.startswith("import ")
                or stripped.startswith("export ")
                or "import(" in stripped
            ):
                continue
            for pattern in FORBIDDEN_V1_PATTERNS:
                if pattern.search(line):
                    violations.append((path, lineno, line.strip()))
                    break
    return violations


def check_tsconfig_excludes() -> list[str]:
    """Potwierdź, że V1 SLD jest excluded w tsconfig.json (do Phase 9)."""
    if not TSCONFIG.exists():
        return [f"tsconfig.json missing at {TSCONFIG}"]
    raw = TSCONFIG.read_text(encoding="utf-8")
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as exc:
        return [f"tsconfig.json parse error: {exc}"]
    excludes = cfg.get("exclude", []) or []
    required = {
        "src/ui/sld/*.ts",
        "src/ui/sld/*.tsx",
        "src/ui/sld/core/**/*",
        "src/ui/sld/inspector/**/*",
    }
    missing = sorted(required - set(excludes))
    if missing:
        return [f"tsconfig.json exclude missing: {entry}" for entry in missing]
    return []


def check_artifacts() -> list[str]:
    issues: list[str] = []
    if not AUDIT_DOC.exists():
        issues.append(f"audit doc missing: {AUDIT_DOC.relative_to(ROOT)}")
    if not SMOKE_TEST.exists():
        issues.append(f"smoke test missing: {SMOKE_TEST.relative_to(ROOT)}")
    return issues


def main() -> int:
    issues: list[str] = []

    if not V2_DIR.exists():
        print(f"FATAL: V2 dir missing: {V2_DIR}", file=sys.stderr)
        return 2

    files = iter_v2_source_files()
    if not files:
        issues.append("no V2 source files found (sanity check failed)")

    forbidden = scan_forbidden_imports(files)
    for path, lineno, line in forbidden:
        rel = path.relative_to(FRONTEND)
        issues.append(f"forbidden V1 import: {rel}:{lineno}: {line}")

    issues.extend(check_tsconfig_excludes())
    issues.extend(check_artifacts())

    if issues:
        print("SLD V2 build gate FAILED:", file=sys.stderr)
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        return 1

    print(f"SLD V2 build gate OK: scanned {len(files)} V2 source files; no V1 imports.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

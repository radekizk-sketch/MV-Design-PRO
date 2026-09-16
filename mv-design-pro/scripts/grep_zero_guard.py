"""Grep-zero guard: wzorce, które mają mieć ZERO wystąpień na aktywnych ścieżkach.

Grupy konfiguracji (katalog `config/`), każda z trzema plikami
`grep_zero{grupa}patterns.txt` / `..._active_paths.txt` / `..._allowlist.txt`:

* ``""`` (V12.5-docs) — skasowane dokumenty/symbole w aktywnej dokumentacji i guardach,
* ``"kod_"`` (W5-A) — skasowane reprezentacje uziemienia w KODZIE (backend, front, e2e,
  skrypty, aktywne kontrakty docs): `Bus.grounding`, `substation.meta["nn_earthing_system"]`,
  domyślka układu nN, słowniki równoległe i komponenty frontu. Zapadka tylko w dół:
  allowlista to wyłącznie moduł migracji zastanego zapisu i jego testy (one muszą
  znać stare klucze, żeby je przenieść) — każde nowe miejsce to naruszenie.
* ``"w61_"`` (karta W6-1 SS0 p.8) — kasacja osieroconego `Load.meta["load_profile_ref"]`
  (zapis bez odczytu, K-E): pole `AddNNLoadPayload.load_profile_ref` (backend) i
  `AddNNLoadPayload.load_profile_ref` (front TS) skasowane. Profile czasowe wracają w
  W6-6 razem z konsumentem (QSTS) jako encja `ProfilCzasowy` — nowa nazwa, nie
  wskrzeszenie tego klucza. Allowlist: 3 fixtury SLD sprzed kasacji z wpisanym
  `"load_profile_ref": null` w `meta` (residualny klucz nieużywanego dict-a — SLD
  determinism CI-critical, edycja treści fixtur poza zakresem tej karty, uzasadnienie
  w pliku allowlisty).

Self-test z czerwoną iniekcją: `scripts/test_grep_zero_guard.py`.
"""

from __future__ import annotations

import fnmatch
import re
import sys
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"
GRUPY: tuple[str, ...] = ("", "kod_", "w61_")
TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
POMIJANE_KATALOGI = {
    "node_modules",
    "__pycache__",
    ".venv",
    "dist",
    "playwright-report",
    "test-results",
}


def load_config_lines(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"Missing config file: {path}")
    lines = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def normalize_rel_path(value: str) -> str:
    return value.replace("\\", "/").lstrip("./")


def iter_active_files(path: Path) -> Iterator[Path]:
    if path.is_file():
        yield path
        return
    for candidate in sorted(path.rglob("*")):
        if any(czesc in POMIJANE_KATALOGI for czesc in candidate.parts):
            continue
        if candidate.is_file() and candidate.suffix.lower() in TEXT_SUFFIXES:
            yield candidate


def is_allowlisted(rel_path: str, allowlist: list[str]) -> bool:
    for raw_token in allowlist:
        token = normalize_rel_path(raw_token)
        if token.endswith("/"):
            if rel_path.startswith(token):
                return True
            continue
        if any(char in token for char in "*?[]"):
            if fnmatch.fnmatch(rel_path, token):
                return True
            continue
        if rel_path == token:
            return True
    return False


def sprawdz(root: Path, grupa: str = "") -> list[str]:
    """Naruszenia jednej grupy konfiguracji względem drzewa ``root`` (config w ``root/config``)."""
    config_dir = root / "config"
    active_paths = [
        root / rel for rel in load_config_lines(config_dir / f"grep_zero_{grupa}active_paths.txt")
    ]
    allowlist = load_config_lines(config_dir / f"grep_zero_{grupa}allowlist.txt")
    patterns = [
        (raw, re.compile(raw))
        for raw in load_config_lines(config_dir / f"grep_zero_{grupa}patterns.txt")
    ]

    violations: list[str] = []
    seen_files: set[Path] = set()
    etykieta = f"grep-zero{'/' + grupa.rstrip('_') if grupa else ''}"

    for active_path in active_paths:
        if not active_path.exists():
            violations.append(f"[missing-active-path] {active_path.relative_to(root).as_posix()}")
            continue

        for file_path in iter_active_files(active_path):
            if file_path in seen_files:
                continue
            seen_files.add(file_path)

            rel_path = file_path.relative_to(root).as_posix()
            if is_allowlisted(rel_path, allowlist):
                continue

            text = file_path.read_text(encoding="utf-8", errors="ignore")
            for raw_pattern, compiled in patterns:
                match = compiled.search(text)
                if match is None:
                    continue
                line_no = text.count("\n", 0, match.start()) + 1
                snippet = text.splitlines()[line_no - 1].strip() if text.splitlines() else ""
                violations.append(
                    f"[{etykieta}] {rel_path}:{line_no}: pattern={raw_pattern!r}: {snippet}"
                )
                break
    return violations


def main() -> int:
    violations: list[str] = []
    for grupa in GRUPY:
        violations.extend(sprawdz(ROOT, grupa))

    if violations:
        print("V12.5 grep-zero guard failed:")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("V12.5 grep-zero guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

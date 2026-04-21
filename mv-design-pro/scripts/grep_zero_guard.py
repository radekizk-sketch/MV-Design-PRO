from __future__ import annotations

from pathlib import Path
import fnmatch
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"
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


def iter_active_files(path: Path):
    if path.is_file():
        yield path
        return
    for candidate in sorted(path.rglob("*")):
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


def main() -> int:
    active_paths = [ROOT / rel for rel in load_config_lines(CONFIG_DIR / "grep_zero_active_paths.txt")]
    allowlist = load_config_lines(CONFIG_DIR / "grep_zero_allowlist.txt")
    patterns = [
        (raw, re.compile(raw))
        for raw in load_config_lines(CONFIG_DIR / "grep_zero_patterns.txt")
    ]

    violations: list[str] = []
    seen_files: set[Path] = set()

    for active_path in active_paths:
        if not active_path.exists():
            violations.append(f"[missing-active-path] {active_path.relative_to(ROOT).as_posix()}")
            continue

        for file_path in iter_active_files(active_path):
            if file_path in seen_files:
                continue
            seen_files.add(file_path)

            rel_path = file_path.relative_to(ROOT).as_posix()
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
                    f"[grep-zero] {rel_path}:{line_no}: pattern={raw_pattern!r}: {snippet}"
                )
                break

    if violations:
        print("V12.5 grep-zero guard failed:")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("V12.5 grep-zero guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

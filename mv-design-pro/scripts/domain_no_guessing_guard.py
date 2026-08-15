#!/usr/bin/env python3
"""
Domain No-Guessing Guard

Blocks merge if domain operations contain hardcoded defaults or auto-detection
for critical parameters (voltage, length, etc.).

Domain operations must require EXPLICIT input for all critical parameters.
When not provided, they must ERROR — never silently guess or fall back.

SCAN FILES:
  backend/src/enm/domain_operations.py

FORBIDDEN PATTERNS:
  1. Hardcoded default lengths:  = 500 or = 100 with length context
  2. Hardcoded default voltage:  = 15.0 in voltage assignment context
  3. Hardcoded default nN voltage: = 0.4 in nn_voltage context
  4. Auto-detection keywords: auto_detect, best_guess, fallback
  5. Silent fallback defaults: or 15.0 / or 0.4 (silent voltage fallback)

ALLOWED:
  - 0.0 as placeholder (explicit "not yet set")
  - Topological inheritance: fetching bus.voltage_kv from a connected bus
  - Error messages (string literals) that mention these values
  - Comments and docstrings

EXIT CODES:
  0 = clean (no violations)
  1 = violations found
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_FILES = [
    "backend/src/enm/domain_operations.py",
]

# ---------------------------------------------------------------------------
# Forbidden pattern definitions
# ---------------------------------------------------------------------------

# Pattern 1: Hardcoded default lengths — `= 500` or `= 100` near length context
_PAT_DEFAULT_LENGTH = re.compile(
    r"=\s*(?:500|100)\b",
    re.IGNORECASE,
)

# Pattern 2: Hardcoded default voltage `= 15.0` in voltage context
_PAT_DEFAULT_VOLTAGE_15 = re.compile(
    r"=\s*15\.0\b",
    re.IGNORECASE,
)

# Pattern 3: Hardcoded default nN voltage `= 0.4` in nn_voltage context
_PAT_DEFAULT_VOLTAGE_04 = re.compile(
    r"=\s*0\.4\b",
    re.IGNORECASE,
)

# Pattern 4: Auto-detection / guessing keywords in identifiers or calls.
# These match as substrings inside identifiers (e.g., _auto_detect_trunk_end).
# The underscore _ is a word character in Python, so \b cannot sit between
# _ and a letter.  We use simple substring matching instead.
_PAT_AUTO_DETECT = re.compile(r"auto_detect", re.IGNORECASE)
_PAT_BEST_GUESS = re.compile(r"best_guess", re.IGNORECASE)
_PAT_FALLBACK_KEYWORD = re.compile(r"fallback", re.IGNORECASE)

# Pattern 5: Silent fallback defaults — `or 15.0` / `or 0.4`
_PAT_OR_FALLBACK_15 = re.compile(r"\bor\s+15\.0\b", re.IGNORECASE)
_PAT_OR_FALLBACK_04 = re.compile(r"\bor\s+0\.4\b", re.IGNORECASE)


# Each entry: (compiled regex, human-readable description, context type or None)
FORBIDDEN_PATTERNS: list[tuple[re.Pattern[str], str, str | None]] = [
    (
        _PAT_DEFAULT_LENGTH,
        "hardcoded default length (= 500 or = 100)",
        "length",
    ),
    (
        _PAT_DEFAULT_VOLTAGE_15,
        "hardcoded default voltage (= 15.0)",
        "voltage",
    ),
    (
        _PAT_DEFAULT_VOLTAGE_04,
        "hardcoded default nN voltage (= 0.4)",
        "nn_voltage",
    ),
    (_PAT_AUTO_DETECT, "auto-detection keyword (auto_detect)", "auto_detect"),
    (_PAT_BEST_GUESS, "guessing keyword (best_guess)", None),
    (_PAT_FALLBACK_KEYWORD, "fallback keyword", None),
    (_PAT_OR_FALLBACK_15, "silent fallback default (or 15.0)", None),
    (_PAT_OR_FALLBACK_04, "silent fallback default (or 0.4)", None),
]


# ---------------------------------------------------------------------------
# Context helpers — decide whether a match is actually a violation
# ---------------------------------------------------------------------------


def _is_comment_line(line: str) -> bool:
    """Check if the entire line is a comment."""
    stripped = line.lstrip()
    return stripped.startswith("#") or stripped.startswith("//")


def _is_inline_comment_region(line: str, match_start: int) -> bool:
    """Check if the match falls in an inline comment (# after code)."""
    # Find the first # that is NOT inside a string
    in_single = False
    in_double = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "'" and not in_double:
            in_single = not in_single
        elif ch == "\\" and (in_single or in_double):
            i += 1  # skip escaped char
        elif ch == "#" and not in_single and not in_double:
            # Everything from here to end of line is a comment
            return match_start >= i
        i += 1
    return False


def _is_inside_string_literal(line: str, match_start: int) -> bool:
    """Check if the match position is inside a string literal.

    Handles regular strings, f-strings, and escaped quotes.
    """
    in_single = False
    in_double = False
    i = 0
    while i < match_start and i < len(line):
        ch = line[i]
        # Handle triple-quote detection within a line
        if not in_single and line[i : i + 3] == '"""':
            close = line.find('"""', i + 3)
            if close != -1 and close < match_start:
                i = close + 3
                continue
            elif close == -1 or close >= match_start:
                return True
        if not in_double and line[i : i + 3] == "'''":
            close = line.find("'''", i + 3)
            if close != -1 and close < match_start:
                i = close + 3
                continue
            elif close == -1 or close >= match_start:
                return True
        if ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "'" and not in_double:
            in_single = not in_single
        elif ch == "\\" and (in_single or in_double):
            i += 1  # skip escaped char
        i += 1
    return in_single or in_double


def _has_voltage_context(line: str) -> bool:
    """Check if line has voltage-related context (variable names, dict keys)."""
    voltage_keywords = [
        "voltage",
        "napiec",
        "kv",
        "uhv",
        "ulv",
        "sn_voltage",
        "nn_voltage",
        "voltage_kv",
    ]
    lower = line.lower()
    return any(kw in lower for kw in voltage_keywords)


def _has_nn_voltage_context(line: str) -> bool:
    """Check if line has nN voltage context specifically."""
    nn_keywords = [
        "nn_voltage",
        "ulv",
        "lv_voltage",
        "nn_bus",
        "nn_napiec",
        "napiecie_nn",
    ]
    lower = line.lower()
    return any(kw in lower for kw in nn_keywords)


def _has_length_context(line: str) -> bool:
    """Check if line has length-related context."""
    length_keywords = [
        "length",
        "dlugosc",
        "dlug",
        "segment_len",
        "cable_len",
        "line_len",
    ]
    lower = line.lower()
    return any(kw in lower for kw in length_keywords)


def _is_topological_inheritance(line: str) -> bool:
    """Check if the line is fetching voltage from a connected bus (allowed).

    Topological inheritance means reading voltage_kv from an existing bus object
    — this is legitimate domain behavior, not guessing.
    """
    inheritance_patterns = [
        r'\.get\(\s*["\']voltage_kv["\']\s*\)',
        r"bus\.voltage_kv",
        r"from_bus.*voltage",
        r"hv_voltage\s*=.*\.get",
        r"lv_voltage\s*=.*\.get",
        r"voltage_kv\s*=\s*from_bus",
        r"voltage_kv\s*=.*\.get\(",
    ]
    for pat in inheritance_patterns:
        if re.search(pat, line, re.IGNORECASE):
            return True
    return False


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------


def _scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Scan a file for forbidden patterns.

    Returns list of (line_no, stripped_line, violation_description).
    """
    violations: list[tuple[int, str, str]] = []

    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    in_docstring = False
    docstring_char: str | None = None
    lines = content.splitlines()

    for line_no, line in enumerate(lines, start=1):
        stripped = line.strip()

        # Track multi-line docstring boundaries
        if in_docstring:
            if docstring_char and docstring_char in stripped:
                in_docstring = False
                docstring_char = None
            continue

        # Check if this line opens a docstring (line starting with triple-quote)
        if stripped.startswith('"""') or stripped.startswith("'''"):
            quote = '"""' if stripped.startswith('"""') else "'''"
            rest = stripped[3:]
            if quote in rest:
                # Opens and closes on same line — skip just this line
                continue
            else:
                in_docstring = True
                docstring_char = quote
                continue

        # Skip pure comment lines
        if _is_comment_line(line):
            continue

        # Check each forbidden pattern
        for pattern, description, context_type in FORBIDDEN_PATTERNS:
            match = pattern.search(line)
            if not match:
                continue

            # --- Allowance checks ---

            # Allow matches inside string literals (error messages, etc.)
            if _is_inside_string_literal(line, match.start()):
                continue

            # Allow matches in inline comments (# after code)
            if _is_inline_comment_region(line, match.start()):
                continue

            # Context-dependent checks for voltage/length patterns
            if context_type == "voltage":
                if not _has_voltage_context(line):
                    continue  # Not actually a voltage assignment
                if _is_topological_inheritance(line):
                    continue

            if context_type == "nn_voltage":
                if not _has_nn_voltage_context(line):
                    continue  # Not actually an nN voltage assignment
                if _is_topological_inheritance(line):
                    continue

            if context_type == "length":
                if not _has_length_context(line):
                    continue  # Not actually a length assignment

            # auto_detect: allow _auto_detect_trunk_end (deterministic
            # topology resolution — a trunk has exactly one end)
            if context_type == "auto_detect":
                if "trunk_end" in line.lower():
                    continue

            violations.append((line_no, stripped, description))

    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    all_violations: list[tuple[str, int, str, str]] = []

    scanned_count = 0
    for rel_path in SCAN_FILES:
        full_path = REPO_ROOT / rel_path
        if not full_path.exists():
            print(
                f"  SKIP: {rel_path} (file not found)",
                file=sys.stderr,
            )
            continue

        scanned_count += 1
        violations = _scan_file(full_path)
        for line_no, line_content, description in violations:
            all_violations.append((rel_path, line_no, line_content, description))

    if all_violations:
        print(
            "DOMAIN-NO-GUESSING-GUARD VIOLATIONS:",
            file=sys.stderr,
        )
        print(
            "=" * 72,
            file=sys.stderr,
        )
        for rel_path, line_no, line_content, description in all_violations:
            print(
                f"  {rel_path}:{line_no}: {line_content}",
                file=sys.stderr,
            )
            print(
                f"    -> {description}",
                file=sys.stderr,
            )
            print(file=sys.stderr)
        print(
            "=" * 72,
            file=sys.stderr,
        )
        print(
            f"\n{len(all_violations)} violation(s) found. "
            "Domain operations must NOT use hardcoded defaults or auto-detection "
            "for critical parameters (voltage, length). "
            "Require explicit input or return an error.",
            file=sys.stderr,
        )
        return 1

    print(f"domain-no-guessing-guard: PASS " f"({scanned_count} file(s) scanned, 0 violations)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

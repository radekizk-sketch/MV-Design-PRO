#!/usr/bin/env python3
"""
ui2_dead_handler_guard.py

Karta TODO-UI2 (2026-09-16), klasa "stany zastępcze w ui2" §0.4(iii):
zakaz martwych uchwytów `on<Prop>={() => undefined}` / `on<Prop>={() => {}}` /
`on<Prop>={noop}` w `frontend/src/ui2/**` — każdy `on*` przekazany jako
handler-widmo do komponentu ui2 jest martwym klikiem (żaden realny dostawca
akcji, przycisk wygląda aktywnie, ale nic nie robi). Precedens klasy:
`AppRoot.tsx:463` (`onOtworzDowod={() => undefined}`) — przycisk „Otwórz
dowód" na ekranie oceny technicznej, powierzchnia B-02 właściciela.

Naprawa: wpiąć realnego dostawcę (nawigacja / operacja domenowa / otwarcie
ekranu) ALBO nie renderować akcji (nie przekazywać propsa wcale — komponent,
który akcję renderuje wyłącznie, gdy handler jest podany, po prostu jej wtedy
nie pokazuje — to NIE jest martwy klik, bo nic klikalnego nie ma).

Exit codes: 0 = clean, 1 = violations found.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

UI2_ROOT = "frontend/src/ui2"

SKIP_FILE_MARKERS = (
    "__tests__",
    ".test.",
    ".spec.",
    "__pycache__",
)

# Wzorce z karty §0.4(iii), dosłownie: uchwyt `on<Prop>` (JSX prop zaczynający
# się od "on" + wielka litera) przypisany strzałce bez ciała (`() => undefined`
# / `() => {}`) albo nazwanej stałej `noop`. `\s*` obejmuje też nowe linie
# (Python `re` — bez DOTALL), więc łapie też sformatowany prop rozbity na kilka
# linii (prettier). Dopasowanie do PIERWSZEGO tokenu treści strzałki — coś PO
# `undefined`/`{}` (komentarz, spacja) przed zamykającym `}` propsa nie maskuje
# trafienia (realny przypadek: `AppRoot.tsx:463` niósł komentarz TODO-KARTA
# między `undefined` a `}`).
DEAD_HANDLER_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\bon[A-Z]\w*=\{\s*\(\)\s*=>\s*undefined\b"),
        "martwy uchwyt on*={() => undefined}",
    ),
    (
        re.compile(r"\bon[A-Z]\w*=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}"),
        "martwy uchwyt on*={() => {}}",
    ),
    (
        re.compile(r"\bon[A-Z]\w*=\{\s*void\s+0\s*\}"),
        "martwy uchwyt on*={void 0}",
    ),
    (
        re.compile(r"\bon[A-Z]\w*=\{\s*noop\s*\}"),
        "martwy uchwyt on*={noop}",
    ),
]


@dataclass(frozen=True)
class Violation:
    path: str
    line_no: int
    rule: str
    context: str

    def render(self) -> str:
        return f"  {self.path}:{self.line_no}: {self.context}\n    -> {self.rule}"


def _should_skip_file(path: Path) -> bool:
    normalized = str(path).replace("\\", "/")
    return any(marker in normalized for marker in SKIP_FILE_MARKERS)


def _iter_ui2_files(root: Path) -> list[Path]:
    base = root / UI2_ROOT
    if not base.is_dir():
        return []
    return sorted(
        p
        for p in base.rglob("*")
        if p.is_file() and p.suffix in (".ts", ".tsx") and not _should_skip_file(p)
    )


def _line_no_at(content: str, offset: int) -> int:
    return content.count("\n", 0, offset) + 1


def _context_line(content: str, offset: int) -> str:
    line_start = content.rfind("\n", 0, offset) + 1
    line_end = content.find("\n", offset)
    if line_end == -1:
        line_end = len(content)
    return content[line_start:line_end].strip()


def check_dead_handlers(root: Path = PROJECT_ROOT) -> list[Violation]:
    violations: list[Violation] = []
    for path in _iter_ui2_files(root):
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        rel_path = str(path.relative_to(root)).replace("\\", "/")
        for pattern, rule in DEAD_HANDLER_PATTERNS:
            for match in pattern.finditer(content):
                violations.append(
                    Violation(
                        path=rel_path,
                        line_no=_line_no_at(content, match.start()),
                        rule=rule,
                        context=_context_line(content, match.start()),
                    )
                )
    violations.sort(key=lambda v: (v.path, v.line_no))
    return violations


def main() -> int:
    print("=" * 72)
    print("GUARD: ui2_dead_handler_guard")
    print("=" * 72)

    violations = check_dead_handlers()
    if not violations:
        print("ui2-dead-handler-guard: OK (no dead on* handlers in frontend/src/ui2/**)")
        return 0

    for violation in violations:
        print(violation.render())

    print(f"\nui2-dead-handler-guard: FAIL ({len(violations)} dead handler(s) in ui2/**)")
    return 1


if __name__ == "__main__":
    sys.exit(main())

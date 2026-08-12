#!/usr/bin/env python3
"""Testy zapadki swiezosci `ALLOWLIST`/`EXCLUDED_FILES` w
`ui_production_codes_guard.py` (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja e,
2026-08-12).

ALLOWLIST i EXCLUDED_FILES sa DZIS PUSTE/prawie puste — obie zapadki musza
byc no-op na HEAD, ale wpiete JUZ TERAZ: pierwszy przyszly wpis dopisany bez
rownoczesnej zapadki usypia dokladnie to ryzyko, ktore juz raz
zmaterializowalo sie w ui_no_physics_guard.ALLOWLIST (pozycja a karty).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ui_production_codes_guard as guard  # noqa: E402


def test_allowlist_freshness_is_green_and_noop_on_empty_allowlist() -> None:
    assert guard.ALLOWLIST == {}
    assert guard.check_allowlist_freshness() == []


def test_excluded_files_freshness_is_green_on_repo() -> None:
    assert guard.check_excluded_files_freshness() == []


def test_excluded_files_entry_exists_and_has_a_reason() -> None:
    for rel_path, reason in guard.EXCLUDED_FILES.items():
        assert reason, f"EXCLUDED_FILES[{rel_path!r}] musi miec uzasadnienie"
        assert (guard.REPO_ROOT / rel_path).is_file(), f"brak pliku {rel_path!r}"


def test_allowlist_freshness_catches_orphaned_entry(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {
            ("backend/src/nigdy/nieistniejacy_plik.py", 1, "V12K-999"): (
                "wpis-sierota wstrzykniety testem"
            )
        },
    )

    violations = guard.check_allowlist_freshness()

    assert len(violations) == 1
    assert "[ui-production-codes-wpis-osierocony]" in violations[0]
    assert "V12K-999" in violations[0]


def test_allowlist_freshness_accepts_covered_entry(tmp_path: Path, monkeypatch) -> None:
    plik = tmp_path / "analiza.py"
    plik.write_text('OPIS = "rozstrzygniecie V12K-777 opcja B"\n', encoding="utf-8")

    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {("analiza.py", 1, "V12K-777"): "test: pokryty wpis"})

    assert guard.check_allowlist_freshness() == []


def test_excluded_files_freshness_catches_orphaned_entry(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "EXCLUDED_FILES",
        {"frontend/src/ui/nigdy/nieistniejacy_plik.ts": "wpis-sierota wstrzykniety testem"},
    )

    violations = guard.check_excluded_files_freshness()

    assert len(violations) == 1
    assert "[ui-production-codes-wykluczenie-osierocone]" in violations[0]
    assert "nieistniejacy_plik.ts" in violations[0]


def test_scan_python_file_raw_is_superset_of_scan_python_file() -> None:
    scan_dir = guard.REPO_ROOT / "backend" / "src" / "application" / "analyses"
    for path in sorted(scan_dir.rglob("*.py"))[:50]:
        raw = set(guard.scan_python_file_raw(path))
        filtered = set(guard.scan_python_file(path))
        assert filtered <= raw


def test_main_returns_1_when_allowlist_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {
            ("backend/src/nigdy/nieistniejacy_plik.py", 1, "V12K-999"): (
                "wpis-sierota wstrzykniety testem"
            )
        },
    )

    assert guard.main([]) == 1


def test_main_returns_1_when_excluded_files_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "EXCLUDED_FILES",
        {"frontend/src/ui/nigdy/nieistniejacy_plik.ts": "wpis-sierota wstrzykniety testem"},
    )

    assert guard.main([]) == 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

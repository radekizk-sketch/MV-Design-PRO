#!/usr/bin/env python3
"""Testy zapadki swiezosci `ALLOWLIST` w `export_codenames_guard.py` (karta
ZAPADKI-ALLOWLIST-RESZTA, pozycja e, 2026-08-12).

ALLOWLIST jest DZIS PUSTA — zapadka musi byc no-op na HEAD, ale wpieta JUZ
TERAZ: pierwszy przyszly wpis dopisany bez rownoczesnej zapadki usypia
dokladnie to ryzyko, ktore juz raz zmaterializowalo sie w
ui_no_physics_guard.ALLOWLIST (pozycja a karty).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import export_codenames_guard as guard  # noqa: E402


def test_allowlist_freshness_is_green_and_noop_on_empty_allowlist() -> None:
    assert guard.ALLOWLIST == {}
    assert guard.check_allowlist_freshness() == []


def test_allowlist_freshness_catches_orphaned_entry(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {
            ("backend/src/nigdy/nieistniejacy_plik.py", 1, "P999"): (
                "wpis-sierota wstrzykniety testem"
            )
        },
    )

    violations = guard.check_allowlist_freshness()

    assert len(violations) == 1
    assert "[export-codenames-wpis-osierocony]" in violations[0]
    assert "P999" in violations[0]


def test_allowlist_freshness_accepts_covered_entry(tmp_path: Path, monkeypatch) -> None:
    plik = tmp_path / "eksport.py"
    plik.write_text('TYTUL = "Dowod: rozplyw mocy (P32)"\n', encoding="utf-8")

    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {("eksport.py", 1, "P32"): "test: pokryty wpis"})

    assert guard.check_allowlist_freshness() == []


def test_scan_file_raw_is_superset_of_scan_file() -> None:
    for target in guard.SCAN_TARGETS:
        for path in guard.iter_files([target])[:20]:
            raw = set(guard.scan_file_raw(path))
            filtered = set(guard.scan_file(path))
            assert filtered <= raw


def test_main_returns_1_when_allowlist_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {
            ("backend/src/nigdy/nieistniejacy_plik.py", 1, "P999"): (
                "wpis-sierota wstrzykniety testem"
            )
        },
    )

    assert guard.main([]) == 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

#!/usr/bin/env python3
"""Testy zapadki swiezosci `EXCLUDED_RELATIVE_FILES` w
`no_raw_ids_in_ui_guard.py` (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja f,
2026-08-12).

Lista jest DZIS PUSTA — zapadka musi byc no-op na HEAD, ale wpieta JUZ TERAZ
(patrz uzasadnienie przy ui_no_physics_guard.ALLOWLIST, pozycja a tej samej
karty: osierocenie tam JUZ SIE RAZ ZDARZYLO bez detektora). Komentarz w
guardzie ("Test artifacts intencjonalnie używają tych literałów") deklaruje
semantyke "znane, realne trafienie", wiec zapadka jest PELNA (dwukierunkowa):
plik musi istniec ORAZ nadal produkowac >=1 trafienie scan_file().
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import no_raw_ids_in_ui_guard as guard  # noqa: E402


def test_excluded_relative_files_is_empty_and_freshness_is_noop() -> None:
    assert guard.EXCLUDED_RELATIVE_FILES == {}
    assert guard.check_excluded_relative_files_freshness(guard.REPO_ROOT) == []


def test_freshness_catches_missing_file(monkeypatch) -> None:
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/nigdy/nieistniejacy.tsx"}
    )

    violations = guard.check_excluded_relative_files_freshness(guard.REPO_ROOT)

    assert len(violations) == 1
    assert "[no-raw-ids-wykluczenie-osierocone]" in violations[0]
    assert "nieistniejacy.tsx" in violations[0]


def test_freshness_catches_file_without_pattern(tmp_path: Path, monkeypatch) -> None:
    katalog = tmp_path / "frontend" / "src" / "ui" / "czyste"
    katalog.mkdir(parents=True, exist_ok=True)
    plik = katalog / "Czysty.tsx"
    plik.write_text("export function Czysty() { return null; }\n", encoding="utf-8")
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/czyste/Czysty.tsx"})

    violations = guard.check_excluded_relative_files_freshness(tmp_path)

    assert len(violations) == 1
    assert "juz nie produkuje zadnego trafienia" in violations[0]


def test_freshness_accepts_file_still_matching(tmp_path: Path, monkeypatch) -> None:
    katalog = tmp_path / "frontend" / "src" / "ui" / "test-fixtures"
    katalog.mkdir(parents=True, exist_ok=True)
    plik = katalog / "Fixture.tsx"
    plik.write_text("const field = { key: 'content_hash', label: 'x' };\n", encoding="utf-8")
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/test-fixtures/Fixture.tsx"}
    )

    assert guard.check_excluded_relative_files_freshness(tmp_path) == []


def test_main_returns_1_when_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/nigdy/nieistniejacy.tsx"}
    )

    assert guard.main() == 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

#!/usr/bin/env python3
"""Testy zapadki swiezosci `EXCLUDED_RELATIVE_FILES` w
`domain_ops_unified_guard.py` (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja f,
2026-08-12).

Jedyny wpis (`domainApi.ts`) jest wykluczony PO ROLI (kanoniczny klient,
definiuje endpoint), nie dlatego, ze regex go dzis lapie — zmierzone: dzisiejsza
forma URL-a (`${API_BASE}/${caseId}/enm/domain-ops`, zlozona z interpolacji)
NIE trafia w prosty `ENDPOINT_PATTERN`. Zapadka jest wiec swiadomie MINIMALNA
(tylko istnienie pliku) — pelna zapadka usunelaby ten wpis jako rzekoma
sierote, ale wtedy przyszly refaktor URL-a na pojedynczy literal oznaczylby
WLASNY kanoniczny klient jako naruszenie reguly, ktora ma go dopuszczac.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import domain_ops_unified_guard as guard  # noqa: E402


def test_freshness_is_green_on_repo() -> None:
    assert guard.check_excluded_relative_files_freshness(guard.REPO_ROOT) == []


def test_excluded_relative_files_entry_exists() -> None:
    for rel_path in guard.EXCLUDED_RELATIVE_FILES:
        assert (guard.REPO_ROOT / rel_path).is_file(), f"brak pliku {rel_path!r}"


def test_domain_api_ts_does_not_match_endpoint_pattern_today() -> None:
    """Dokumentuje ZMIERZONY powod, dla ktorego zapadka jest minimalna, nie
    pelna: gdyby ten test kiedys zaczal failowac (regex zaczal lapac plik),
    nalezy PRZEJSC na pelna zapadke (patrz docstring
    check_excluded_relative_files_freshness) zamiast zostawiac martwy
    komentarz."""
    domain_api = guard.REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "domainApi.ts"
    assert domain_api.is_file()
    assert guard.scan_file(domain_api) == []


def test_freshness_catches_missing_file(monkeypatch) -> None:
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/nigdy/nieistniejacy.ts"}
    )

    violations = guard.check_excluded_relative_files_freshness(guard.REPO_ROOT)

    assert len(violations) == 1
    assert "[domain-ops-wykluczenie-osierocone]" in violations[0]
    assert "nieistniejacy.ts" in violations[0]


def test_main_returns_1_when_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/nigdy/nieistniejacy.ts"}
    )

    assert guard.main() == 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

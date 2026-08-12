#!/usr/bin/env python3
"""Testy zapadki swiezosci `META_AUDIT_ALLOWLIST` w `docs_archive_guard.py`
(karta ZAPADKI-ALLOWLIST-RESZTA, pozycja c, 2026-08-12).

Wpis META_AUDIT_ALLOWLIST wyjmuje dokument z kontroli
[historical-spec-ref] pod warunkiem, ze dokument RZECZYWISCIE wzmiankuje
docs/spec/ jako przedmiot audytu (a nie routuje przez niego kanon). Zapadka
pilnuje, zeby wpis nie osierocial: dokument musi istniec I nadal zawierac
choc jeden HISTORICAL_SPEC_PATTERNS — inaczej wpis jest MARTWYM wyjatkiem,
ktory po cichu poszerzylby zwolnienie na przyszly dokument pod ta sama
sciezka.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import docs_archive_guard as guard  # noqa: E402


def test_meta_audit_allowlist_freshness_is_green_on_repo() -> None:
    assert guard.check_meta_audit_allowlist_freshness() == []


def test_meta_audit_allowlist_entries_all_have_a_pattern_hit() -> None:
    """Kazdy wpis dzisiejszej listy ma >=1 trafienie HISTORICAL_SPEC_PATTERNS —
    potwierdzenie POMIARU PRZED NAPRAWA (9 sierot usunietych 2026-08-12)."""
    for rel_path in guard.META_AUDIT_ALLOWLIST:
        full_path = guard.ROOT / rel_path
        assert full_path.is_file(), f"META_AUDIT_ALLOWLIST: brak pliku {rel_path!r}"
        text = full_path.read_text(encoding="utf-8", errors="ignore")
        assert guard._historical_pattern_hits(text), (
            f"META_AUDIT_ALLOWLIST[{rel_path!r}] nie ma zadnego trafienia "
            "HISTORICAL_SPEC_PATTERNS -- sierota"
        )


def test_freshness_catches_missing_file(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "META_AUDIT_ALLOWLIST",
        {"docs/nigdy/nie-istniejacy-dokument-wstrzykniety-testem.md"},
    )

    violations = guard.check_meta_audit_allowlist_freshness()

    assert len(violations) == 1
    assert "[meta-audit-wpis-osierocony]" in violations[0]
    assert "nie-istniejacy-dokument-wstrzykniety-testem.md" in violations[0]
    assert "ktorego juz nie ma w repo" in violations[0]


def test_freshness_catches_document_without_pattern(tmp_path: Path, monkeypatch) -> None:
    """Dokument istnieje, ale zaden HISTORICAL_SPEC_PATTERNS juz w nim nie
    wystepuje -- wpis jest sierota semantyczna, nie tylko brakiem pliku."""
    doc_dir = tmp_path / "docs" / "audit"
    doc_dir.mkdir(parents=True, exist_ok=True)
    doc = doc_dir / "CZYSTY_DOKUMENT.md"
    doc.write_text("# Dokument bez zadnej wzmianki o starym katalogu spec\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "META_AUDIT_ALLOWLIST", {"docs/audit/CZYSTY_DOKUMENT.md"})

    violations = guard.check_meta_audit_allowlist_freshness()

    assert len(violations) == 1
    assert "[meta-audit-wpis-osierocony]" in violations[0]
    assert "juz nie zawiera zadnego wzorca" in violations[0]


def test_freshness_accepts_document_still_matching_pattern(tmp_path: Path, monkeypatch) -> None:
    doc_dir = tmp_path / "docs" / "audit"
    doc_dir.mkdir(parents=True, exist_ok=True)
    doc = doc_dir / "AUDYT.md"
    doc.write_text("Ten audyt omawia stan docs/spec/ jako archiwum.\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "META_AUDIT_ALLOWLIST", {"docs/audit/AUDYT.md"})

    assert guard.check_meta_audit_allowlist_freshness() == []


def test_main_returns_1_when_meta_audit_entry_is_orphaned(monkeypatch) -> None:
    """Zapadka W GUARDZIE: main() musi failowac na osieroconym wpisie, nie
    tylko funkcja pomocnicza."""
    monkeypatch.setattr(
        guard,
        "META_AUDIT_ALLOWLIST",
        {"docs/nigdy/nie-istniejacy-dokument-wstrzykniety-testem.md"},
    )

    assert guard.main() == 1


def test_historical_pattern_hits_is_the_shared_predicate() -> None:
    """`_historical_pattern_hits()` jest UZYWANA przez oba mechanizmy (filtr i
    zapadke) -- predykaty parami, KLASA-NIE-INSTANCJA S3. Regresja tego testu
    (np. gdyby ktos przywrocil dwie rownolegle petle po liniach) oznaczalaby,
    ze zapadka i check_indexed_active_docs_for_historical_spec_refs() moglyby
    dryfowac w rozne strony."""
    text = "linia zwykla\ndocs/spec/COS.md jest w tekscie\ninna linia\n"
    assert guard._historical_pattern_hits(text) == [2]


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

#!/usr/bin/env python3
"""Testy zapadki swiezosci `LEGACY_FILES` w `sld_layer_id_scope_guard.py`
(karta ZAPADKI-ALLOWLIST-RESZTA, pozycja f, 2026-08-12).

Kazdy wpis jest opisany jako "uzywa SldLayerId" (dlug legacy do migracji) —
deklaruje ZNANE, REALNE trafienie. Zapadka jest wiec PELNA (dwukierunkowa):
plik musi istniec ORAZ nadal produkowac >=1 trafienie scan_file().
POMIAR PRZED NAPRAWA (2026-08-12): 2 z 3 wpisow bylo juz DZIS sierotami
(BuildSidebar.tsx i jego test przestaly uzywac SldLayerId wprost — konsumuja
LayersSection przez LayersSectionProps) — usuniete z uzasadnieniem w
komentarzu przy LEGACY_FILES.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sld_layer_id_scope_guard as guard  # noqa: E402


def test_freshness_is_green_on_repo() -> None:
    assert guard.check_legacy_files_freshness() == []


def test_legacy_files_entries_all_have_a_raw_hit() -> None:
    """Kazdy dzisiejszy wpis LEGACY_FILES ma realny raw hit (potwierdzenie
    POMIARU PRZED NAPRAWA: 1 wpis pozostaje po usunieciu 2 sierot)."""
    assert guard.LEGACY_FILES == {"frontend/src/ui/network-build/build-sidebar/LayersSection.tsx"}
    for rel_path in guard.LEGACY_FILES:
        full_path = guard.REPO_ROOT / rel_path
        assert full_path.is_file(), f"brak pliku {rel_path!r}"
        assert guard.scan_file(full_path), f"LEGACY_FILES[{rel_path!r}] jest sierota"


def test_freshness_catches_missing_file(monkeypatch) -> None:
    monkeypatch.setattr(guard, "LEGACY_FILES", {"frontend/src/ui/nigdy/nieistniejacy.tsx"})

    violations = guard.check_legacy_files_freshness()

    assert len(violations) == 1
    assert "[sld-layer-id-wpis-osierocony]" in violations[0]
    assert "nieistniejacy.tsx" in violations[0]


def test_freshness_catches_file_without_pattern(tmp_path: Path, monkeypatch) -> None:
    katalog = tmp_path / "frontend" / "src" / "ui" / "legacy"
    katalog.mkdir(parents=True, exist_ok=True)
    plik = katalog / "Zmigrowany.tsx"
    plik.write_text("export function Zmigrowany() { return null; }\n", encoding="utf-8")
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "LEGACY_FILES", {"frontend/src/ui/legacy/Zmigrowany.tsx"})

    violations = guard.check_legacy_files_freshness()

    assert len(violations) == 1
    assert "juz nie zawiera zadnego uzycia" in violations[0]


def test_freshness_accepts_file_still_matching(tmp_path: Path, monkeypatch) -> None:
    katalog = tmp_path / "frontend" / "src" / "ui" / "legacy"
    katalog.mkdir(parents=True, exist_ok=True)
    plik = katalog / "NadalUzywa.tsx"
    plik.write_text("const x: SldLayerId = 'busbars';\n", encoding="utf-8")
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "LEGACY_FILES", {"frontend/src/ui/legacy/NadalUzywa.tsx"})

    assert guard.check_legacy_files_freshness() == []


def test_main_returns_1_when_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(guard, "LEGACY_FILES", {"frontend/src/ui/nigdy/nieistniejacy.tsx"})

    assert guard.main() == 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

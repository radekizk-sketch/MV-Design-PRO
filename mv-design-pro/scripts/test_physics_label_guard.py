#!/usr/bin/env python3
"""Testy zapadki swiezosci `ALLOWED_OPERATIONAL_SETPOINTS` w
`physics_label_guard.py` (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja d,
2026-08-12).

Wpis (nazwa_pliku, pole) wyjmuje pole fizyczne z inwariantu PR-10 (parametry
fizyczne nie moga byc edytowalne w modalach topologii) pod warunkiem, ze pole
jest nastawa OPERACYJNA (nie parametrem katalogowym). Zapadka pilnuje, zeby
wpis nie osierocial: plik o tej nazwie musi istniec w SCAN_DIRS I pole musi
nadal wystepowac tam w kontekscie edytowalnym — inaczej wpis jest MARTWYM
wyjatkiem: gdyby TO SAMO pole wrocilo w INNYM pliku o tej samej nazwie
(klucz jest po nazwie pliku, nie po pelnej sciezce), przeszloby bez kontroli.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import physics_label_guard as guard  # noqa: E402


def test_freshness_is_green_on_repo() -> None:
    assert guard.check_allowed_operational_setpoints_freshness(guard.REPO_ROOT) == []


def test_scan_file_raw_is_superset_of_scan_file() -> None:
    """scan_file() (filtrowany) musi byc podzbiorem scan_file_raw() (surowy)."""
    patterns = guard.build_patterns()
    for f in guard.iter_files(guard.REPO_ROOT):
        raw = set(guard.scan_file_raw(f, patterns))
        filtered = set(guard.scan_file(f, patterns))
        assert filtered <= raw


def test_allowed_operational_setpoints_entry_still_has_raw_hit() -> None:
    """Kazdy dzisiejszy wpis ALLOWED_OPERATIONAL_SETPOINTS ma realny surowy
    hit w SCAN_DIRS (potwierdzenie POMIARU PRZED NAPRAWA: 0 sierot dzis)."""
    patterns = guard.build_patterns()
    raw_by_filename: dict[str, set[str]] = {}
    for f in guard.iter_files(guard.REPO_ROOT):
        for hit in guard.scan_file_raw(f, patterns):
            raw_by_filename.setdefault(f.name, set()).add(hit.field_name)

    for (filename, field_name), reason in guard.ALLOWED_OPERATIONAL_SETPOINTS.items():
        assert reason, f"wpis {filename}:{field_name} musi miec uzasadnienie"
        assert field_name in raw_by_filename.get(filename, set()), (
            f"ALLOWED_OPERATIONAL_SETPOINTS[({filename!r}, {field_name!r})] "
            "nie ma zadnego surowego trafienia -- sierota"
        )


def test_freshness_catches_orphaned_entry(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "ALLOWED_OPERATIONAL_SETPOINTS",
        {
            ("NigdyNieIstniejacyModal.tsx", "cos_phi"): (
                "b: wpis-sierota wstrzykniety testem, plik nigdy nie istnial"
            )
        },
    )

    violations = guard.check_allowed_operational_setpoints_freshness(guard.REPO_ROOT)

    assert len(violations) == 1
    assert "[physics-label-wpis-osierocony]" in violations[0]
    assert "NigdyNieIstniejacyModal.tsx" in violations[0]
    assert "cos_phi" in violations[0]


def test_freshness_catches_entry_whose_field_moved_out(tmp_path: Path, monkeypatch) -> None:
    """Plik o tej nazwie istnieje, ale pole juz nie wystepuje w kontekscie
    wejsciowym -- sierota SEMANTYCZNA, nie tylko brak pliku."""
    scan_dir = tmp_path / "frontend" / "src" / "ui" / "topology" / "modals"
    scan_dir.mkdir(parents=True, exist_ok=True)
    modal = scan_dir / "PVInverterModal.tsx"
    modal.write_text(
        "export function PVInverterModal() {\n"
        "  return <div>brak pol fizycznych tutaj</div>;\n"
        "}\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(
        guard,
        "ALLOWED_OPERATIONAL_SETPOINTS",
        {("PVInverterModal.tsx", "cos_phi"): "test: pole juz nie wystepuje"},
    )

    violations = guard.check_allowed_operational_setpoints_freshness(tmp_path)

    assert len(violations) == 1
    assert "[physics-label-wpis-osierocony]" in violations[0]


def test_freshness_accepts_entry_whose_field_still_present(tmp_path: Path, monkeypatch) -> None:
    scan_dir = tmp_path / "frontend" / "src" / "ui" / "topology" / "modals"
    scan_dir.mkdir(parents=True, exist_ok=True)
    modal = scan_dir / "PVInverterModal.tsx"
    modal.write_text(
        "export function PVInverterModal() {\n" '  return <input name="cos_phi" />;\n' "}\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(
        guard,
        "ALLOWED_OPERATIONAL_SETPOINTS",
        {("PVInverterModal.tsx", "cos_phi"): "test: pole nadal wystepuje"},
    )

    assert guard.check_allowed_operational_setpoints_freshness(tmp_path) == []


def test_scan_file_still_filters_allowed_setpoint(tmp_path: Path, monkeypatch) -> None:
    """Regresja: filtr scan_file() musi nadal dzialac po refaktorze na
    scan_file_raw() -- bit-w-bit ten sam wynik jak przed refaktorem."""
    scan_dir = tmp_path / "frontend" / "src" / "ui" / "topology" / "modals"
    scan_dir.mkdir(parents=True, exist_ok=True)
    modal = scan_dir / "PVInverterModal.tsx"
    modal.write_text(
        "export function PVInverterModal() {\n" '  return <input name="cos_phi" />;\n' "}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(
        guard,
        "ALLOWED_OPERATIONAL_SETPOINTS",
        {("PVInverterModal.tsx", "cos_phi"): "test: dozwolona nastawa"},
    )

    patterns = guard.build_patterns()
    raw = guard.scan_file_raw(modal, patterns)
    filtered = guard.scan_file(modal, patterns)

    # `<input name="cos_phi" />` trafia dwa wzorce kontekstu naraz
    # (`name=` ogolny i `<input ... name=` specyficzny) -- surowy skan liczy
    # kazde trafienie wzorca, wiec >=1 (nie ==1) jest wlasciwym warunkiem.
    assert len(raw) >= 1, raw
    assert all(v.field_name == "cos_phi" for v in raw)
    assert filtered == []


def test_main_returns_1_when_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard,
        "ALLOWED_OPERATIONAL_SETPOINTS",
        {("NigdyNieIstniejacyModal.tsx", "cos_phi"): ("b: wpis-sierota wstrzykniety testem")},
    )

    assert guard.main() == 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))

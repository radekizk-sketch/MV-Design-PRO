#!/usr/bin/env python3
"""Testy zapadki swiezosci ALLOWLIST w `ui_no_physics_guard.py`.

Kontekst (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja a, 2026-08-12): osierocenie
JUZ SIE RAZ ZDARZYLO w tym guardzie (13 wpisow na usuniety katalog VT,
wykryte tylko recznym pomiarem V12K-267), a jedyny automatyczny detektor
(`test_ui_allowlist_entries_are_not_stale`) zyje wylacznie w
`backend/tests/ci/test_ui_no_physics_guard.py` — POZA samym guardem, wiec
`python scripts/ui_no_physics_guard.py` (dokladnie tak, jak go woла CI przez
`guardy_z_ci.py`) nigdy tego nie widzial. Testy ponizej pilnuja
`check_allowlist_freshness()` — mechanizmu przeniesionego DO guarda — oraz
tego, ze refaktor `scan_tree()`/`scan_tree_raw()` nie zmienil wyniku na
dzisiejszym drzewie repo (regula KLASA-NIE-INSTANCJA S2/S4: test jako iloczyn
cech, deklaracja z przypietym testem).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ui_no_physics_guard as guard  # noqa: E402


def test_allowlist_freshness_is_green_on_repo() -> None:
    """Kazdy wpis ALLOWLIST na HEAD musi nadal odpowiadac realnemu trafieniu."""
    raw_hits = guard.scan_tree_raw(guard.SCAN_DIRS)
    assert guard.check_allowlist_freshness(raw_hits) == []


def test_scan_tree_raw_is_superset_of_scan_tree() -> None:
    """`scan_tree()` (filtrowany) musi byc podzbiorem `scan_tree_raw()` (surowy)
    -- refaktor nie mogl zmienic zbioru surowych trafien, tylko wydzielic go."""
    raw_hits = set(guard.scan_tree_raw(guard.SCAN_DIRS))
    filtered_hits = set(guard.scan_tree(guard.SCAN_DIRS))
    assert filtered_hits <= raw_hits


def test_main_is_green_on_repo() -> None:
    assert guard.main() == 0


def test_check_allowlist_freshness_catches_orphaned_entry(monkeypatch) -> None:
    """Wpis ALLOWLIST bez pokrycia w surowych trafieniach -> naruszenie z NAZWA
    wpisu (sciezka + numer linii), nie cichy no-op."""
    orphan_key = ("frontend/src/ui/nigdy/nie-istniejacy-plik.ts", 999)
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {orphan_key: "b: wpis-sierota wstrzykniety testem, plik nigdy nie istnial"},
    )

    violations = guard.check_allowlist_freshness([])

    assert len(violations) == 1
    assert "[ui-no-physics-wpis-osierocony]" in violations[0]
    assert repr(orphan_key[0]) in violations[0]
    assert str(orphan_key[1]) in violations[0]


def test_check_allowlist_freshness_accepts_covered_entry(monkeypatch, tmp_path: Path) -> None:
    """Wpis z pokryciem w surowych trafieniach NIE jest zgloszony jako sierota."""
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    covered_key = ("frontend/src/ui/x.ts", 10)
    monkeypatch.setattr(guard, "ALLOWLIST", {covered_key: "b: pokryty wpis testowy"})
    hit = (tmp_path / covered_key[0], covered_key[1], "reactanceOhm * lengthKm", "wzorzec")

    violations = guard.check_allowlist_freshness([hit])

    assert violations == []


def test_orphaned_entry_but_real_violations_still_reported_bit_identical(
    tmp_path: Path, monkeypatch
) -> None:
    """Regresja KLASA-NIE-INSTANCJA S4: po refaktorze `scan_tree`/`scan_tree_raw`
    realne naruszenie fizyki musi byc zlapane z DOKLADNIE tym samym komunikatem
    jak przed refaktorem (ta sama zawartosc linii, ten sam wzorzec)."""
    physics_file = tmp_path / "frontend" / "src" / "ui" / "oze" / "badAnalyzer.ts"
    physics_file.parent.mkdir(parents=True, exist_ok=True)
    physics_file.write_text(
        "export function estimate(dUdP: number, dUdQ: number, p: number, q: number) {\n"
        "  const deltaU = dUdP * p + dUdQ * q;\n"
        "}\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})

    raw_hits = guard.scan_tree_raw([physics_file.parent])
    filtered = guard.scan_tree([physics_file.parent])

    assert raw_hits == filtered, "bez ALLOWLIST surowy i filtrowany zbior musza byc identyczne"
    flagged_lines = {line_no for _p, line_no, _c, _pat in filtered}
    assert 2 in flagged_lines


def test_main_returns_1_when_allowlist_entry_is_orphaned(monkeypatch) -> None:
    """`main()` -- nie tylko funkcja pomocnicza -- musi zwrocic RC=1, kiedy
    wpis ALLOWLIST osiera. To jest wlasnie ta zapadka W GUARDZIE, ktorej karta
    zadala: dawny jedyny detektor zyl wylacznie w pytest poza guardem."""
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {
            ("frontend/src/ui/nigdy/nie-istniejacy-plik.ts", 999): (
                "b: wpis-sierota wstrzykniety testem"
            )
        },
    )
    assert guard.main() == 1

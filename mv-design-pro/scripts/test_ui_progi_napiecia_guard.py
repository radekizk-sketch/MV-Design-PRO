#!/usr/bin/env python3
"""Testy `ui_progi_napiecia_guard.py` (karta W3-J, 2026-09-16).

Wzorzec self-testu ten sam co `test_ui_no_physics_guard.py`
(zapadka swiezosci ALLOWLIST prowadzona W SAMYM guardzie, bo
`python scripts/ui_progi_napiecia_guard.py` uruchamiany przez `guardy_z_ci.py`
nigdy nie widzi testu zyjacego wylacznie w `backend/tests/`). Dodatkowo:
iloczyn cech wlasny tego guarda — {liczba progu} x {kontekst pu/napi obecny/
nieobecny} x {linia kodu/komentarz} — bo detekcja tego strażnika (w
odroznieniu od `ui_no_physics_guard.py`) wymaga WSPOLWYSTAPIENIA liczby I
kontekstu na tej samej linii, nie samej liczby.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ui_progi_napiecia_guard as guard  # noqa: E402

# =============================================================================
# Zapadka swiezosci ALLOWLIST (ten sam kontrakt co ui_no_physics_guard)
# =============================================================================


def test_allowlist_freshness_is_green_on_repo() -> None:
    raw_hits = guard.scan_tree_raw(guard.SCAN_DIRS)
    assert guard.check_allowlist_freshness(raw_hits) == []


def test_scan_tree_raw_is_superset_of_scan_tree() -> None:
    raw_hits = set(guard.scan_tree_raw(guard.SCAN_DIRS))
    filtered_hits = set(guard.scan_tree(guard.SCAN_DIRS))
    assert filtered_hits <= raw_hits


def test_main_is_green_on_repo() -> None:
    assert guard.main() == 0


def test_check_allowlist_freshness_catches_orphaned_entry(monkeypatch) -> None:
    orphan_key = ("frontend/src/ui/nigdy/nie-istniejacy-plik.ts", 999)
    monkeypatch.setattr(
        guard,
        "ALLOWLIST",
        {orphan_key: "b: wpis-sierota wstrzykniety testem, plik nigdy nie istnial"},
    )

    violations = guard.check_allowlist_freshness([])

    assert len(violations) == 1
    assert "[ui-progi-napiecia-wpis-osierocony]" in violations[0]
    assert repr(orphan_key[0]) in violations[0]
    assert str(orphan_key[1]) in violations[0]


def test_check_allowlist_freshness_accepts_covered_entry(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    covered_key = ("frontend/src/ui/x.ts", 10)
    monkeypatch.setattr(guard, "ALLOWLIST", {covered_key: "b: pokryty wpis testowy"})
    hit = (tmp_path / covered_key[0], covered_key[1], "const napiecieMinPu = 0.95;")

    violations = guard.check_allowlist_freshness([hit])

    assert violations == []


def test_main_returns_1_when_allowlist_entry_is_orphaned(monkeypatch) -> None:
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


# =============================================================================
# Iloczyn cech wlasny: {liczba} x {kontekst} x {typ linii}
# =============================================================================


def _pisz(tmp_path: Path, tresc: str) -> Path:
    plik = tmp_path / "frontend" / "src" / "ui2" / "test_generated.ts"
    plik.parent.mkdir(parents=True, exist_ok=True)
    plik.write_text(tresc, encoding="utf-8")
    return plik


def test_wykrywa_prog_z_kontekstem_pu_snakecase(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(tmp_path, "export const NAPIECIE_MIN_PU = 0.95;\n")

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert any(line_no == 1 for _p, line_no, _c in hits)


def test_wykrywa_prog_z_kontekstem_pu_camelcase(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(tmp_path, "if (v_pu < 0.90 || v_pu > 1.10) { flag(); }\n")

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert any(line_no == 1 for _p, line_no, _c in hits)


def test_wykrywa_prog_z_kontekstem_napiecie_przecinkiem_pl(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(tmp_path, "  uwaga: 'Norma napięciowa ±5% Un — pasmo 0,95–1,05.',\n")

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert any(line_no == 1 for _p, line_no, _c in hits)


def test_nie_wykrywa_liczby_bez_kontekstu_napieciowego(tmp_path: Path, monkeypatch) -> None:
    """Liczba 0.95/1.05 BEZ tokenu pu/napi na tej samej linii nie jest tej
    klasy defektu (np. wspolczynnik mocy nieoznaczony jako napieciowy,
    tolerancja niezwiazana z napieciem)."""
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(tmp_path, "const tolerancjaZbieznosci = 0.95;\n")

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert hits == []


def test_nie_wykrywa_kontekstu_bez_liczby_progu(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(tmp_path, "const v_pu = wynik.napiecie_wezla;\n")

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert hits == []


def test_nie_wykrywa_liczby_bedacej_fragmentem_numeru_paragrafu(
    tmp_path: Path, monkeypatch
) -> None:
    """Granica slowa: '§21.1 napięcie' NIE jest liczba progu 1.1 — to numer
    paragrafu, w ktorym '1.1' jest fragmentem wiekszej liczby '21.1'."""
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(tmp_path, "// F13.1 (spec §21.1): napięcie szyny WN — etykieta\n")

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert hits == []


def test_pomija_linie_komentarza_blokowego(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    _pisz(
        tmp_path,
        "/**\n"
        " * Pasmo napiecia 0.95-1.05 pu — historyczny opis, nie kod.\n"
        " */\n"
        "export const x = 1;\n",
    )

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert hits == []


def test_pomija_katalog_testow(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "ALLOWLIST", {})
    plik = tmp_path / "frontend" / "src" / "ui2" / "__tests__" / "fixtures.test.ts"
    plik.parent.mkdir(parents=True, exist_ok=True)
    plik.write_text(
        "export const kryteriaFixture = { ostrzezenie_min_pu: 0.95 };\n", encoding="utf-8"
    )

    hits = guard.scan_tree_raw([tmp_path / "frontend" / "src" / "ui2"])

    assert hits == []


def test_allowlist_wylacza_konkretna_linie_ale_nie_inna_w_tym_samym_pliku(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    rel = "frontend/src/ui2/test_generated.ts"
    monkeypatch.setattr(guard, "ALLOWLIST", {(rel, 1): "b: wpis testowy dla linii 1"})
    _pisz(
        tmp_path,
        "const qCurvePointPu = 0.95; // linia 1 — allowlistowana w tescie\n"
        "const NAPIECIE_MAX_PU = 1.05; // linia 2 — NIE allowlistowana\n",
    )

    filtered = guard.scan_tree([tmp_path / "frontend" / "src" / "ui2"])

    assert filtered == [
        (tmp_path / rel, 2, "const NAPIECIE_MAX_PU = 1.05; // linia 2 — NIE allowlistowana")
    ]

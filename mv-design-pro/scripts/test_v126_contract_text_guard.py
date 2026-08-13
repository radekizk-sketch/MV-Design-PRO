"""Testy bramki `v126_contract_text_guard` (karta SUITA-BEZ-WYWOLANIA, 2026-08-12).

Ostrosc w obie strony:
  * czysty zbior plikow -> RC=0,
  * plik z zakazanym fragmentem (np. wstrzykniete "TODO") -> RC=1 i nazwany
    winowajca w komunikacie,
  * plik z listy, ktorego nie ma na dysku -> RC=1 (agregator NIE ma prawa
    milczec na widmowej sciezce — to dokladnie defekt, ktory ta karta naprawia).
"""

from __future__ import annotations

import v126_contract_text_guard as guard


def test_czysty_zbior_plikow_daje_rc0(tmp_path, monkeypatch, capsys) -> None:
    plik = tmp_path / "kontrakt.py"
    plik.write_text("def solve() -> int:\n    return 1\n", encoding="utf-8")
    monkeypatch.setattr(guard, "V126_CONTRACT_FILES", (plik,))

    kod = guard.run()

    assert kod == 0
    assert "OK" in capsys.readouterr().out


def test_zakazany_fragment_daje_rc1_i_nazywa_winowajce(tmp_path, monkeypatch, capsys) -> None:
    plik = tmp_path / "kontrakt.py"
    plik.write_text("def solve() -> int:\n    # TODO: dokonczyc\n    return 1\n", encoding="utf-8")
    monkeypatch.setattr(guard, "V126_CONTRACT_FILES", (plik,))

    kod = guard.run()

    stderr = capsys.readouterr().err
    assert kod == 1
    assert "TODO" in stderr
    assert "kontrakt.py" in stderr


def test_mojibake_daje_rc1(tmp_path, monkeypatch, capsys) -> None:
    plik = tmp_path / "kontrakt.md"
    plik.write_text("Wyniki sÂ… deterministyczne.\n", encoding="utf-8")
    monkeypatch.setattr(guard, "V126_CONTRACT_FILES", (plik,))

    kod = guard.run()

    assert kod == 1
    assert "Â" in capsys.readouterr().err


def test_nieistniejacy_plik_z_listy_daje_rc1_a_nie_cichy_zielony(
    tmp_path, monkeypatch, capsys
) -> None:
    widmowy = tmp_path / "nie_istnieje" / "kontrakt.tsx"
    monkeypatch.setattr(guard, "V126_CONTRACT_FILES", (widmowy,))

    kod = guard.run()

    stderr = capsys.readouterr().err
    assert kod == 1
    assert "nie istnieja" in stderr
    assert "kontrakt.tsx" in stderr


def test_realny_zbior_kontraktowy_v126_jest_dzis_zielony() -> None:
    """Regresja na zywym repo: kazdy plik z realnej listy musi istniec i byc czysty.

    To jest test WLASCIWY produktu (nie tylko infrastruktury guarda) — pilnuje,
    zeby V126_CONTRACT_FILES nie zgnilo tak, jak zgnila lista w skasowanym
    `verify_v12_6.py` (ktora wskazywala nieistniejacy `V126AcademicSurface.tsx`).
    """
    assert guard.run() == 0

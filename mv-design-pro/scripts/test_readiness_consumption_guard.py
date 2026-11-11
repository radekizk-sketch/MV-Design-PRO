"""Testy własne `readiness_consumption_guard`: emiter kodu gotowości w postaci dopisku.

Kanon komunikatów (rozstrzygnięcie architekta 2026-10-29): kod gotowości stoi w tekście dla
projektanta wyłącznie jako dopisek po zdaniu `(kod gotowości: <kod>)`. Emiter w tej postaci
jest drogą do projektanta tak samo jak literał kodu — bez tego strażnik uznałby kod za
martwy (pomiar 2026-10-30: `pv.control_mode_missing` emitowany wyłącznie dopiskiem
w `application/calculation_readiness/service.py`).

Iloczyn cech: postać emitera (literał w cudzysłowie / literał w apostrofach / dopisek kodu /
brak) × plik (produkcyjny / rejestr kanonu, którego literały nie są emiterem).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import readiness_consumption_guard as guard  # noqa: E402


def test_zywe_drzewo_zielone() -> None:
    assert guard.main() == 0


def test_dopisek_kodu_jest_emiterem_na_zywym_drzewie() -> None:
    """`pv.control_mode_missing` ma w kodzie produkcyjnym wyłącznie postać dopisku — i jest
    emitowany (droga do projektanta), nie martwy."""
    kod = "pv.control_mode_missing"
    produkcyjne = [
        plik.read_text(encoding="utf-8")
        for plik in guard.BACKEND_SRC.rglob("*.py")
        if plik not in guard._PLIKI_REJESTRU
    ]
    assert any(f"(kod gotowości: {kod})" in tresc for tresc in produkcyjne)
    assert not any(f'"{kod}"' in tresc or f"'{kod}'" in tresc for tresc in produkcyjne)
    assert kod in guard._kody_emitowane()


@pytest.mark.parametrize(
    ("tresc", "emitowany"),
    [
        ('KOD = "pv.control_mode_missing"\n', True),
        ("KOD = 'pv.control_mode_missing'\n", True),
        ('T = "Brak trybu sterowania (kod gotowości: pv.control_mode_missing)"\n', True),
        ('T = "Brak trybu sterowania (kod pola: pv.control_mode_missing)"\n', False),
        ('T = "brak trybu"\n', False),
    ],
)
@pytest.mark.parametrize("w_rejestrze", [False, True])
def test_postac_emitera_na_kopii_drzewa(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, tresc: str, emitowany: bool, w_rejestrze: bool
) -> None:
    """Na odizolowanym drzewie z jednym plikiem: literał i dopisek `kod gotowości` są
    emiterem, dopisek o innej etykiecie i brak — nie; plik rejestru nigdy nie emituje."""
    src = tmp_path / "src"
    plik = src / "domain" / "canonical_operations.py" if w_rejestrze else src / "modul.py"
    plik.parent.mkdir(parents=True)
    plik.write_text(tresc, encoding="utf-8")
    monkeypatch.setattr(guard, "BACKEND_SRC", src)
    monkeypatch.setattr(
        guard,
        "_PLIKI_REJESTRU",
        {src / "domain" / "canonical_operations.py", src / "domain" / "readiness_bridge.py"},
    )
    monkeypatch.setattr(guard, "ODWZOROWANIE_WALIDATOR_NA_KANON", {})
    wynik = "pv.control_mode_missing" in guard._kody_emitowane()
    assert wynik is (emitowany and not w_rejestrze)

"""Atrapy harnessu scen liczone z backendu (E2E-FULL-FIX-3, 2026-09-10).

JSON w `frontend/src/harness-fixtures/generated/` MUSI być równy świeżo
policzonej odpowiedzi (`scripts/eksport_fixtur_harnessu.py`) — rozjazd znaczy,
że kontrakt albo dane sceny się zmieniły, a zrzut do oceny pokazywałby stan
sprzed zmiany. Dwa uruchomienia dają identyczny wynik (determinizm atrapy).
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

_SKRYPT = Path(__file__).resolve().parents[2] / "scripts" / "eksport_fixtur_harnessu.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_harnessu", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_json_w_repo_rowny_odpowiedzi_backendu(nazwa: str) -> None:
    sciezka = eksport.FIXTURES_DIR / f"{nazwa}.json"
    assert sciezka.exists(), f"brak {sciezka} — uruchom scripts/eksport_fixtur_harnessu.py"
    assert json.loads(sciezka.read_text(encoding="utf-8")) == eksport.FIXTURY[nazwa]()


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_atrapa_jest_deterministyczna(nazwa: str) -> None:
    assert eksport.FIXTURY[nazwa]() == eksport.FIXTURY[nazwa]()


def test_zgodnosc_przekrojowa_ma_ksztalt_trasy() -> None:
    """Ten sam kształt co `run_ncrfg_compliance_from_model` (api/ncrfg_ptpiree_tests.py)."""
    odpowiedz = eksport.zgodnosc_przekrojowa_sceny_macierz()
    assert set(odpowiedz) == {"case_id", "operator_id", "der_count", "reports"}
    assert odpowiedz["der_count"] == len(odpowiedz["reports"]) == len(eksport.MODULY_SCENY_MACIERZ)
    for raport, modul in zip(odpowiedz["reports"], eksport.MODULY_SCENY_MACIERZ, strict=True):
        assert raport["der_ref"] == modul.der_ref
        assert raport["p_max_kw"] == modul.p_max_kw
        assert raport["voltage_kv"] == modul.voltage_kv
        # Klasa modułu: progi OD-5 (1 MW / 50 MW) — scena zasiewa moduły klasy B.
        assert raport["module_type"] == "B"
        assert {"overall_pass", "total_tests", "passed_count", "no_module_count"} <= set(raport)


def test_werdykt_bez_biegow_jest_niesprawdzony() -> None:
    """Scena `uwaga` zasiewa rozpływ tylko w kliencie — backend biegu nie zna."""
    werdykt = eksport.werdykt_projektowy_sceny_uwaga()
    assert werdykt["case_id"] == eksport.CASE_ID_HARNESSU
    assert werdykt["werdykt"] == "NIESPRAWDZONE"
    assert werdykt["podsumowanie"]["naruszone"] == 0
    assert all(
        pozycja["stan"] in {"NIESPRAWDZONE", "NIE_DOTYCZY"} for pozycja in werdykt["pozycje"]
    )

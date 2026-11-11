"""Nazwy rodzajów dowodu dla projektanta: każda wartość ``ProofType`` ma polską nazwę, a
komunikat oceny normatywnej o braku dowodu nazywa rodzaj słowami, nie kodem."""

from __future__ import annotations

from analysis.normative.evaluator import _missing_proof_item
from analysis.normative.rule_registry import RULES
from application.proof_engine.types import NAZWY_RODZAJOW_DOWODU_PL, ProofType


def test_kazdy_rodzaj_dowodu_ma_nazwe() -> None:
    assert set(NAZWY_RODZAJOW_DOWODU_PL) == set(ProofType)
    for rodzaj, nazwa in NAZWY_RODZAJOW_DOWODU_PL.items():
        assert rodzaj.value not in nazwa


def test_brak_dowodu_nazywa_rodzaj_slowami() -> None:
    for regula in RULES:
        pozycja = _missing_proof_item(regula)
        assert NAZWY_RODZAJOW_DOWODU_PL[regula.proof_type] in pozycja.why_pl
        assert regula.proof_type.value not in pozycja.why_pl
        assert "ProofDocument" not in pozycja.why_pl

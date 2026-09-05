"""FAB-E (E1): kontrakt formatowania braku WYNIKU w eksportach PDF/DOCX/tekst.

``format_wynik`` jest jedynym, jednolitym mechanizmem uzywanym przez eksporty
raportow (PDF/DOCX) do renderowania pol WYNIKU solvera — brak pola (``None``)
lub znacznik NaN solvera (wezel poza wyspa bilansujaca) NIGDY nie renderuje
sfabrykowanej liczby (``0.00``/``0.0e+00``), zawsze jednolity napis
``BRAK_DANYCH`` — analog ``formatPolishValue``/``MISSING_LABEL`` z UI.
"""

from __future__ import annotations

import math

from network_model.reporting.missing_value import BRAK_DANYCH, format_wynik


def test_missing_value_is_brak_danych_not_zero() -> None:
    assert format_wynik(None) == BRAK_DANYCH
    assert format_wynik(None, ".4g") == BRAK_DANYCH
    assert format_wynik(None, ".2e") == BRAK_DANYCH
    assert "0" not in BRAK_DANYCH


def test_nan_sentinel_is_brak_danych_not_zero() -> None:
    """Znacznik NaN solvera (wezel poza wyspa bilansujaca) = brak danych."""
    assert format_wynik(float("nan"), ".4g") == BRAK_DANYCH


def test_known_value_formats_with_requested_precision() -> None:
    """Wartosc ZNANA renderuje sie dokladnie jak przed poprawka (bez zmiany precyzji)."""
    assert format_wynik(1.23456, ".4g") == f"{1.23456:.4g}"
    assert format_wynik(0.0, ".4g") == "0"  # 0 ZE ZNANEGO wyniku to legalne 0, nie brak
    assert format_wynik(3.14159e-7, ".2e") == f"{3.14159e-7:.2e}"
    assert format_wynik(42) == "42"


def test_zero_is_not_confused_with_missing() -> None:
    """0.0 UZYSKANE z solvera pozostaje 0.0 — tylko None/NaN sa 'brak danych'."""
    assert format_wynik(0.0, ".4g") != BRAK_DANYCH
    assert math.isclose(float(format_wynik(0.0, ".4g")), 0.0)

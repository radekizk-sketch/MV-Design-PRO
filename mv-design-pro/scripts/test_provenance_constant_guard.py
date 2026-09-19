"""Testy wlasne `provenance_constant_guard.py` (CV-2 H2/H3): klasa naruszen jako
iloczyn cech (klucz proweniencji × postac literalu × postac dozwolona), plus
bramka na PRAWDZIWYM drzewie repo."""

from __future__ import annotations

import ast
from pathlib import Path

import provenance_constant_guard as guard
import pytest


def _naruszenia(kod: str) -> list[str]:
    return [opis for _, opis in guard.zbierz_naruszenia(ast.parse(kod))]


@pytest.mark.parametrize("klucz", sorted(guard.KLUCZE_PROWENIENCJI))
def test_literal_w_polu_proweniencji_jest_naruszeniem(klucz: str) -> None:
    assert _naruszenia(f'x = {{"{klucz}": "v1"}}') == [
        f"pole proweniencji {klucz!r} = literal 'v1'"
    ]


@pytest.mark.parametrize("klucz", ["solver_version", "variant_ref", "catalog_schema_version"])
def test_literal_zastepczy_po_or_jest_naruszeniem(klucz: str) -> None:
    wynik = _naruszenia(f'x = {{"{klucz}": trace.get("a") or opcje.get("b") or "1.0.0"}}')
    assert len(wynik) == 1 and "literalem zastepczym '1.0.0'" in wynik[0]


@pytest.mark.parametrize(
    "wartosc",
    [
        "trace.get('solver_version')",
        "koperta.catalog_fingerprint if koperta is not None else None",
        "None",
        "SOLVER_VERSION",
        "str(wartosc) if wartosc else None",
        "a or b",
    ],
)
def test_wartosc_z_danych_albo_none_nie_jest_naruszeniem(wartosc: str) -> None:
    assert _naruszenia(f'x = {{"solver_version": {wartosc}}}') == []


def test_klucz_spoza_listy_proweniencji_jest_poza_regula() -> None:
    # Etykiety wersji kontraktow nazywaja kod, nie dane — swiadomie poza regula.
    assert _naruszenia('x = {"report_contract_version": "analysis_report_v2"}') == []


@pytest.mark.parametrize("nazwa", sorted(guard.ZAKAZANE_STALE))
def test_wskrzeszona_stala_jest_naruszeniem(nazwa: str) -> None:
    assert _naruszenia(f'{nazwa} = "variant.uklad_normalny"') == [f"wskrzeszona stala {nazwa}"]
    assert _naruszenia(f'{nazwa}: str = "x"') == [f"wskrzeszona stala {nazwa}"]


def test_klucz_niebedacy_literalem_jest_pomijany() -> None:
    assert _naruszenia('x = {klucz: "v1"}') == []


def test_skan_na_katalogu_tymczasowym(tmp_path: Path) -> None:
    (tmp_path / "domain").mkdir()
    (tmp_path / "domain" / "a.py").write_text('x = {"solver_version": "1.0.0"}\n', encoding="utf-8")
    (tmp_path / "network_model").mkdir()
    (tmp_path / "network_model" / "solver.py").write_text(
        'trace = {"solver_version": "4.0.0"}\n', encoding="utf-8"
    )
    przeskanowano, komunikaty = guard.skanuj(tmp_path)
    # Solver deklarujacy wlasna wersje jest ZRODLEM — poza zakresem skanu.
    assert przeskanowano == 1
    assert komunikaty == ["domain/a.py:1: pole proweniencji 'solver_version' = literal '1.0.0'"]


def test_biezacy_stan_repozytorium_jest_zielony(capsys) -> None:
    """Bramka na PRAWDZIWYM drzewie repo — po CV-2 zero literalow proweniencji."""
    assert guard.main() == 0
    assert "PASS" in capsys.readouterr().out

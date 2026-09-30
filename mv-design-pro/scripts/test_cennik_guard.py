"""Testy własne strażnika cenników (karta W10-2a): iloczyn {rodzaj naruszenia} × {plik}.

Pliki próbne powstają w katalogu tymczasowym (``tmp_path``) — nigdy w drzewie repozytorium.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "src"))

pytest.importorskip("networkx")

import cennik_guard  # noqa: E402

_WZOR = """wersja: "{wersja}"
waluta: {waluta}
data_cen: {data}
opis_pl: próbka
energia_strat:
  cena_pln_mwh: null
  zrodlo: {{status: NIEUSTALONE, dokument: null, data: null, uwagi_pl: brak ceny energii}}
pozycje:
{pozycje}
"""
_POZYCJA = """  - type_id: {type_id}
    jednostka: "{jednostka}"
    capex_pln: 1000.0
    opex_pln_rok: null
    zrodlo: {{status: WSKAZANE, dokument: oferta 1/2026, data: 2026-09-01, uwagi_pl: null}}
"""


def _typ_katalogu() -> str:
    from catalog.cenniki import identyfikatory_typow

    return sorted(identyfikatory_typow())[0]


def _plik(
    katalog: Path,
    *,
    nazwa: str = "cennik_2026-09.yaml",
    wersja: str = "2026-09",
    waluta: str = "PLN",
    data: str = "2026-09-15",
    type_id: str | None = None,
    jednostka: str = "szt.",
) -> None:
    pozycje = (
        "  []"
        if type_id is None
        else _POZYCJA.format(type_id=type_id, jednostka=jednostka)
    )
    tresc = _WZOR.format(wersja=wersja, waluta=waluta, data=data, pozycje=pozycje)
    if type_id is None:
        tresc = tresc.replace("pozycje:\n  []", "pozycje: []")
    (katalog / nazwa).write_text(tresc, encoding="utf-8")


def test_cennik_w_repozytorium_zielony() -> None:
    assert cennik_guard.zmierz() == []


def test_szablon_i_pozycja_z_katalogu_zielone(tmp_path: Path) -> None:
    _plik(tmp_path, type_id=_typ_katalogu())
    assert cennik_guard.zmierz(tmp_path) == []


@pytest.mark.parametrize(
    ("opis", "parametry", "fragment"),
    [
        (
            "typ spoza katalogu",
            {"type_id": "typ-nieistniejacy"},
            "nie istnieje w katalogu",
        ),
        ("waluta", {"waluta": "EUR"}, "Waluta"),
        ("data spoza miesiąca", {"data": "2026-10-01"}, "spoza miesiąca wersji"),
        ("nazwa ≠ wersja", {"nazwa": "cennik_2026-08.yaml"}, "nazwa i wersja różne"),
        ("nazwa spoza wzorca", {"nazwa": "ceny.yaml"}, "nazwa spoza wzorca"),
        ("jednostka", {"jednostka": "m"}, "jednostka"),
    ],
)
def test_kazde_naruszenie_czerwone(
    tmp_path: Path, opis: str, parametry: dict[str, str], fragment: str
) -> None:
    if "type_id" not in parametry and opis in {"jednostka"}:
        parametry = {**parametry, "type_id": _typ_katalogu()}
    _plik(tmp_path, **parametry)
    naruszenia = cennik_guard.zmierz(tmp_path)
    assert naruszenia, opis
    assert any(fragment in naruszenie for naruszenie in naruszenia), naruszenia


def test_pusty_katalog_czerwony(tmp_path: Path) -> None:
    assert cennik_guard.zmierz(tmp_path) != []

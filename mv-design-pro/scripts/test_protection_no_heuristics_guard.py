"""Samotest guarda `protection_no_heuristics_guard` — iniekcja każdej klasy defektu.

Iloczyn cech: rodzaj defektu {heurystyka, liczba zastępcza (or / .get / getattr), stan
logiczny zastępczy atrybutu (getattr), napis zastępczy pola nastawy, połknięty wyjątek} × miejsce {plik w całości, funkcja w zakresie,
funkcja poza zakresem} oraz brak pliku z listy (kod 2) i stan repozytorium (kod 0).
"""

from __future__ import annotations

from pathlib import Path

import protection_no_heuristics_guard as guard
import pytest

PLIK = "backend/src/app/tor.py"


def _uruchom(tmp_path: Path, tresc: str, zakres: frozenset[str] | None = None) -> list[str]:
    sciezka = tmp_path / PLIK
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(tresc, encoding="utf-8")
    zakresy = {PLIK: zakres} if zakres is not None else {}
    stare = guard.ZAKRES_FUNKCJI
    guard.ZAKRES_FUNKCJI = zakresy
    try:
        naruszenia, brakujace = guard.skanuj(tmp_path, (PLIK,))
    finally:
        guard.ZAKRES_FUNKCJI = stare
    assert brakujace == []
    return [rodzaj for _p, _l, _t, rodzaj in naruszenia]


@pytest.mark.parametrize(
    ("kod", "rodzaj"),
    [
        ("x = nastawa.time_multiplier or 0.3\n", "wartość domyślna (or <stała>)"),
        ("x = wpis.get('threshold_a', 100.0)\n", "wartość domyślna (odczyt ze stałą zastępczą)"),
        ("x = getattr(n, 'tms', 1)\n", "wartość domyślna (odczyt ze stałą zastępczą)"),
        (
            "if not getattr(galaz, 'in_service', True):\n    pass\n",
            "wartość domyślna (odczyt ze stałą zastępczą)",
        ),
        ("x = wpis.get('curve_type', 'IEC_SI')\n", "wartość domyślna (odczyt ze stałą zastępczą)"),
        ("x = nastawa.krzywa or 'SI'\n", "wartość domyślna (or <stała>)"),
        ("x = float(w.get('i_contrib_a') or 0.0)\n", "wartość domyślna (or <stała>)"),
        (
            "try:\n    y = float(s)\nexcept ValueError:\n    pass\n",
            "połknięty wyjątek",
        ),
        (
            "def f(s):\n    try:\n        return float(s)\n    except (TypeError, ValueError):\n"
            "        return None\n",
            "połknięty wyjątek",
        ),
        ("wynik = auto_select(urzadzenia)\n", "heurystyka 'auto_select'"),
        ("x = heuristic\n", "heurystyka 'heuristic'"),
    ],
)
def test_iniekcja_wykryta(tmp_path: Path, kod: str, rodzaj: str) -> None:
    assert rodzaj in _uruchom(tmp_path, kod)


@pytest.mark.parametrize(
    "kod",
    [
        "x = nazwa or 'Wyłącznik bez nazwy'\n",
        "x = wpis.get('name', 'bez nazwy')\n",
        "x = wpis.get('threshold_a')\n",
        "x = galaz.in_service\n",
        "try:\n    y = float(s)\nexcept ValueError as blad:\n    raise RuntimeError('x') from blad\n",
        "try:\n    y = float(s)\nexcept ValueError:\n    braki.append('jednostka')\n",
        "# fallback w komentarzu\nx = 1\n",
    ],
)
def test_wzorce_dozwolone(tmp_path: Path, kod: str) -> None:
    assert _uruchom(tmp_path, kod) == []


def test_zakres_funkcji_ogranicza_ast_ale_nie_heurystyki(tmp_path: Path) -> None:
    kod = (
        "def pisarz(p):\n    return p.get('time_delay_s', 0.1)\n\n"
        "def inna(p):\n    return p.get('moc', 0)\n\n"
        "def trzecia():\n    return fallback\n"
    )
    rodzaje = _uruchom(tmp_path, kod, frozenset({"pisarz"}))
    assert rodzaje.count("wartość domyślna (odczyt ze stałą zastępczą)") == 1
    assert "heurystyka 'fallback'" in rodzaje


def test_brak_pliku_z_listy_to_kod_2(tmp_path: Path) -> None:
    assert guard.main(tmp_path, ("backend/src/nie_ma.py",)) == 2


def test_lista_wyjatkow_pusta() -> None:
    assert guard.ALLOWLIST == frozenset()


def test_repozytorium_czyste() -> None:
    assert guard.main() == 0

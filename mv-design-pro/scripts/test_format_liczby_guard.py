"""Testy strażnika jednego źródła zapisu liczby (`format_liczby_guard.py`)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import format_liczby_guard as guard  # noqa: E402


@pytest.mark.parametrize(
    ("kod", "kopie"),
    [
        ('t = f"{x:.3g}".replace(".", ",")\n', [1]),  # przecinek zwykły
        ('t = f"{x:.3g}".replace(".", "{,}")\n', [1]),  # przecinek LaTeX
        ('def _lp(x):\n    return str(x).replace(".", ",")\n', [2]),  # lokalny pomocnik
        ('t = s.replace(".", "_")\n', []),  # inna zamiana — nie jest zapisem liczby
        ('t = s.replace(",", ".")\n', []),  # odczyt liczby z tekstu — kierunek odwrotny
        ("t = format_liczba(x)\n", []),  # jedno źródło
    ],
)
def test_kopia_rozpoznana_iloczyn_zamiennik_i_postac(
    tmp_path: Path, kod: str, kopie: list[int]
) -> None:
    """Iloczyn: zamiennik {",", "{,}", inny} × postać {w miejscu, pomocnik, jedno źródło}."""
    plik = tmp_path / "m.py"
    plik.write_text(kod, encoding="utf-8")
    assert guard.kopie_w_pliku(plik) == kopie


def test_zapadka_dwukierunkowa(tmp_path: Path) -> None:
    """Nowa kopia ponad pin i spadek poniżej pinu są czerwone; plik spoza pinów = pin 0."""
    assert guard.problemy({"a.py": [1, 2]}, {"a.py": 1})[0].startswith(
        "[format-liczby-nowe]"
    )
    assert guard.problemy({"a.py": [1]}, {"a.py": 2})[0].startswith(
        "[format-liczby-pin]"
    )
    assert guard.problemy({"b.py": [3]}, {})[0].startswith("[format-liczby-nowe]")
    assert guard.problemy({"a.py": [1]}, {"a.py": 1}) == []


def test_zrodlo_poza_pomiarem_i_piny_zgodne_z_drzewem() -> None:
    """Jedyne źródło (`werdykt/wyjasnienie.py`) nie jest kopią; piny = pomiar tego drzewa."""
    pomiar = guard.zmierz()
    assert guard.ZRODLO not in pomiar
    assert "def format_liczba(" in (guard.BACKEND_SRC / guard.ZRODLO).read_text(encoding="utf-8")
    assert guard.problemy(pomiar) == []
    for wzgledna in guard.PINY:
        assert (guard.BACKEND_SRC / wzgledna).is_file(), wzgledna

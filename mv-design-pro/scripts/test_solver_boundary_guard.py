"""Samotest `solver_boundary_guard.py`: ścieżki chronione = cała lista B-01 + jawne dodatki.

Partia integracji 10: ręczna lista `WATCHED_PATHS` pomijała rozpływ NR/GS/FD, NC RfG
z profilami, FRT/HVRT, WLS, stan fazowy SN i V12.6 — zmiana tych rdzeni przechodziła przez
strażnika bez sankcji. Lista jest teraz wyprowadzona z `scripts/rdzenie_b01.py`.

Iloczyn cech: grupa rdzenia B-01 (8 grup listy) × rodzaj zmiany {plik-wpis, nowy plik
w katalogu-wpisie} × sankcja {brak, obecna}; do tego predykaty parami (lista B-01 ⇔ ścieżki
chronione, klucz sankcji ⇔ ścieżka chroniona) i istnienie dodatków. Zmiany podaje atrapa
`zmienione_pliki` — strażnik nigdy nie czyta tu żywego diffa.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import rdzenie_b01  # noqa: E402
import solver_boundary_guard as guard  # noqa: E402
from guard_diff_base import WynikBazy  # noqa: E402

REPO = SCRIPTS.parent


def _plik_grupy(grupa: str) -> str:
    """Przykładowa ścieżka zmiany w grupie (plik-wpis albo plik z katalogu-wpisu)."""
    wpis = rdzenie_b01.RDZENIE_B01[grupa][0]
    if wpis.endswith("/"):
        return f"mv-design-pro/backend/src/{wpis}modul_przykladowy.py"
    return f"mv-design-pro/backend/src/{wpis}"


def _uruchom(monkeypatch: pytest.MonkeyPatch, pliki: tuple[str, ...], sankcje: dict) -> int:
    monkeypatch.setattr(guard, "sprawdz_granice_dynamiki", lambda: 0)
    monkeypatch.setattr(
        guard, "zmienione_pliki", lambda: WynikBazy(pliki=pliki, baza="atrapa...HEAD")
    )
    monkeypatch.setattr(guard, "SANCTIONED_CHANGES", sankcje)
    return guard.main()


def test_sciezki_chronione_to_lista_b01_plus_dodatki() -> None:
    """Predykat parami: zbiór ścieżek chronionych = lista B-01 ∪ dodatki, bez ręcznej kopii."""
    b01 = {f"backend/src/{s}" for s in rdzenie_b01.sciezki_b01()}
    assert set(guard.WATCHED_PATHS) == b01 | set(guard.DODATKOWE_CHRONIONE)
    assert not b01 & set(guard.DODATKOWE_CHRONIONE), "dodatek dubluje wpis listy B-01"


@pytest.mark.parametrize("sciezka", guard.DODATKOWE_CHRONIONE)
def test_dodatek_wskazuje_istniejacy_plik(sciezka: str) -> None:
    assert (REPO / sciezka).is_file(), sciezka


@pytest.mark.parametrize("grupa", sorted(rdzenie_b01.RDZENIE_B01))
def test_zmiana_rdzenia_bez_sankcji_jest_czerwona(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], grupa: str
) -> None:
    plik = _plik_grupy(grupa)
    assert _uruchom(monkeypatch, (plik,), {}) == 1
    assert plik in capsys.readouterr().out


@pytest.mark.parametrize("grupa", sorted(rdzenie_b01.RDZENIE_B01))
def test_zmiana_rdzenia_z_sankcja_jest_zielona(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], grupa: str
) -> None:
    wpis = f"backend/src/{rdzenie_b01.RDZENIE_B01[grupa][0]}"
    plik = _plik_grupy(grupa)
    assert _uruchom(monkeypatch, (plik,), {wpis: "decyzja testowa"}) == 0
    assert "SANKCJA" in capsys.readouterr().out


@pytest.mark.parametrize(
    "wpis", [w for w in rdzenie_b01.sciezki_b01() if w.endswith("/")], ids=lambda w: w
)
def test_nowy_plik_w_katalogu_rdzenia_jest_zmiana_chroniona(
    monkeypatch: pytest.MonkeyPatch, wpis: str
) -> None:
    plik = f"mv-design-pro/backend/src/{wpis}podkatalog/nowy.py"
    assert _uruchom(monkeypatch, (plik,), {}) == 1


@pytest.mark.parametrize("sciezka", guard.DODATKOWE_CHRONIONE)
def test_zmiana_dodatku_bez_sankcji_jest_czerwona(
    monkeypatch: pytest.MonkeyPatch, sciezka: str
) -> None:
    assert _uruchom(monkeypatch, (f"mv-design-pro/{sciezka}",), {}) == 1


def test_plik_spoza_rdzeni_nie_jest_chroniony(monkeypatch: pytest.MonkeyPatch) -> None:
    plik = "mv-design-pro/backend/src/network_model/solvers/cable_voltage_drop.py"
    assert _uruchom(monkeypatch, (plik,), {}) == 0


def test_brak_bazy_porownania_jest_czerwony(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(guard, "sprawdz_granice_dynamiki", lambda: 0)
    monkeypatch.setattr(
        guard, "zmienione_pliki", lambda: WynikBazy(pliki=None, baza=None, powod_bledu="brak")
    )
    assert guard.main() == 1


def test_kazda_sankcja_dotyczy_sciezki_chronionej() -> None:
    """Predykat parami: sankcja bez ścieżki chronionej jest martwa (nigdy nie zadziała)."""
    martwe = [klucz for klucz in guard.SANCTIONED_CHANGES if klucz not in guard.WATCHED_PATHS]
    assert martwe == []

"""Samotest `solver_diff_guard.py`: odcisk obejmuje KAŻDĄ grupę rdzeni B-01 i łapie zmianę,
usunięcie oraz dodanie pliku (decyzja B-01 partii integracji 9, delegacja O-59).

Iloczyn cech: grupa rdzenia B-01 (8 grup listy) × zdarzenie na pliku {bez zmian, zmiana,
usunięcie, nowy plik w katalogu rdzenia} — zdarzenia sprawdzane na KOPII drzewa (nigdy
w żywym repozytorium), na pliku-wpisie i na pliku z katalogu-wpisu.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import rdzenie_b01  # noqa: E402
import solver_diff_guard  # noqa: E402

SRC = SCRIPTS.parent / "backend" / "src"


@pytest.mark.parametrize("grupa", sorted(rdzenie_b01.RDZENIE_B01))
def test_kazda_grupa_b01_ma_odcisk(grupa: str) -> None:
    """Każda grupa listy B-01 ma co najmniej jeden plik pod odciskiem (przed decyzją partii 9
    grupy NC RfG, FRT/HVRT, WLS, stan fazowy SN i V12.6 nie miały żadnego)."""
    pilnowane = set(solver_diff_guard.PROTECTED_FILES)
    for wpis in rdzenie_b01.RDZENIE_B01[grupa]:
        if wpis.endswith("/"):
            assert any(p.startswith(wpis) for p in pilnowane), (grupa, wpis)
        else:
            assert wpis in pilnowane, (grupa, wpis)


def test_zbior_pilnowany_jest_rozwinieciem_listy_b01() -> None:
    """Predykat parami: plik pod odciskiem ⇔ plik rdzenia B-01 (jedno źródło — lista B-01)."""
    oczekiwane: set[str] = set()
    for wpis in rdzenie_b01.sciezki_b01():
        if wpis.endswith("/"):
            oczekiwane |= {
                p.relative_to(SRC).as_posix()
                for p in (SRC / wpis).rglob("*")
                if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"
            }
        else:
            oczekiwane.add(wpis)
    assert set(solver_diff_guard.PROTECTED_FILES) == oczekiwane
    assert all(rdzenie_b01.jest_rdzeniem_b01(p) for p in solver_diff_guard.PROTECTED_FILES)


def test_zapisany_odcisk_obejmuje_dokladnie_zbior_pilnowany() -> None:
    odcisk = json.loads(solver_diff_guard.REFERENCE_FILE.read_text(encoding="utf-8"))
    assert set(odcisk) == set(solver_diff_guard.PROTECTED_FILES)


@pytest.fixture()
def kopia(tmp_path: Path) -> tuple[Path, Path]:
    """Kopia plików rdzeni (tylko one) i odcisk policzony na kopii."""
    src = tmp_path / "src"
    for rel in solver_diff_guard.PROTECTED_FILES:
        cel = src / rel
        cel.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SRC / rel, cel)
    odcisk = tmp_path / "solver_hashes.json"
    solver_diff_guard.zapisz_odcisk(solver_diff_guard.odciski_biezace(src), odcisk)
    return src, odcisk


#: Po jednym pliku z każdej grupy: wpis-plik wprost, wpis-katalog przez pierwszy plik w nim
#: (pusty napis, gdy grupa nie ma pliku pod odciskiem — test grupy zgłasza to jako błąd).
PLIK_GRUPY = {
    grupa: next(
        (
            p
            for p in solver_diff_guard.PROTECTED_FILES
            if any(p == w or (w.endswith("/") and p.startswith(w)) for w in wpisy)
        ),
        "",
    )
    for grupa, wpisy in rdzenie_b01.RDZENIE_B01.items()
}


def test_kopia_bez_zmian_przechodzi(kopia: tuple[Path, Path]) -> None:
    src, odcisk = kopia
    assert solver_diff_guard.sprawdz(src, odcisk) == 0


@pytest.mark.parametrize("grupa", sorted(PLIK_GRUPY))
def test_zmiana_pliku_grupy_lamie_odcisk(
    grupa: str, kopia: tuple[Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    src, odcisk = kopia
    assert PLIK_GRUPY[grupa], f"grupa {grupa} bez pliku pod odciskiem"
    plik = src / PLIK_GRUPY[grupa]
    plik.write_bytes(plik.read_bytes() + b"\n")
    assert solver_diff_guard.sprawdz(src, odcisk) == 1
    assert f"{PLIK_GRUPY[grupa]}: MODIFIED" in capsys.readouterr().err


@pytest.mark.parametrize("grupa", sorted(PLIK_GRUPY))
def test_usuniecie_pliku_grupy_lamie_odcisk(
    grupa: str, kopia: tuple[Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    src, odcisk = kopia
    assert PLIK_GRUPY[grupa], f"grupa {grupa} bez pliku pod odciskiem"
    (src / PLIK_GRUPY[grupa]).unlink()
    assert solver_diff_guard.sprawdz(src, odcisk) == 1
    assert f"{PLIK_GRUPY[grupa]}: FILE DELETED" in capsys.readouterr().err


@pytest.mark.parametrize("katalog", sorted(w for w in rdzenie_b01.sciezki_b01() if w.endswith("/")))
def test_nowy_plik_w_katalogu_rdzenia_lamie_odcisk(
    katalog: str, kopia: tuple[Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    src, odcisk = kopia
    nowy = src / katalog / "nowy_modul_bez_odcisku.py"
    nowy.write_text("X = 1\n", encoding="utf-8")
    assert solver_diff_guard.sprawdz(src, odcisk) == 1
    assert f"{katalog}nowy_modul_bez_odcisku.py: NEW FILE" in capsys.readouterr().err


def test_artefakty_interpretera_nie_sa_plikami_rdzenia(kopia: tuple[Path, Path]) -> None:
    src, odcisk = kopia
    katalog = next(w for w in rdzenie_b01.sciezki_b01() if w.endswith("/"))
    pamiec = src / katalog / "__pycache__"
    pamiec.mkdir(exist_ok=True)
    (pamiec / "modul.cpython-311.pyc").write_bytes(b"\x00")
    assert solver_diff_guard.sprawdz(src, odcisk) == 0


def test_brak_pliku_odcisku_to_kod_2(kopia: tuple[Path, Path]) -> None:
    src, odcisk = kopia
    odcisk.unlink()
    assert solver_diff_guard.sprawdz(src, odcisk) == 2

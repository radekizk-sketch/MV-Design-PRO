"""Sprzątanie jawnego `--basetemp` po biegu — `tests/conftest.py::pytest_unconfigure`.

Iloczyn: bieg jednoprocesowy × bieg pod xdist (`-n 2`, katalogi `popen-gwN` procesów
roboczych). Bieg używa `tmp_path` (katalog naprawdę powstaje w trakcie), a po biegu katalogu
nie ma. Bez haka katalog zostaje — iniekcja zapisana w meldunku karty SZYBKIE-TESTY-2.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
#: Szybki test używający `tmp_path` (katalog bazowy powstaje naprawdę).
TEST_Z_TMP = "tests/ci/test_guardy_z_ci.py::test_pusty_skan_jest_bledem_a_nie_zieloną_bramka"


@pytest.mark.parametrize("procesy", [[], ["-n", "2"]], ids=["jeden-proces", "xdist"])
def test_jawny_basetemp_skasowany_po_biegu(tmp_path: Path, procesy: list[str]) -> None:
    basetemp = tmp_path / "bt"
    swiadek = tmp_path / "swiadek.txt"
    wynik = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-p",
            "no:cacheprovider",
            f"--basetemp={basetemp}",
            *procesy,
            TEST_Z_TMP,
            "-p",
            "tests.ci.wtyczka_swiadka_basetemp",
        ],
        cwd=BACKEND,
        env={**os.environ, "SWIADEK_BASETEMP": str(swiadek)},
        capture_output=True,
        text=True,
        check=False,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    # Świadek: test naprawdę utworzył katalog pod basetemp (wtyczka zapisała ścieżkę).
    utworzone = swiadek.read_text(encoding="utf-8").split()
    assert utworzone and all(Path(p).is_relative_to(basetemp) for p in utworzone), utworzone
    assert not basetemp.exists(), sorted(p.name for p in basetemp.rglob("*"))

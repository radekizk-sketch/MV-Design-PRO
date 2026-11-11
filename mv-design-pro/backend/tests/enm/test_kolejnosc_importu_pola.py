"""Import każdego modułu pola liniowego GPZ z ŚWIEŻEGO interpretera (karta UX-04/POLE-LINIOWE-
WZORZEC).

PO CO. Szablony pól (`network_model.catalog.bay_templates`) czytają kanon ról pola z `enm`,
a `enm` (operacje, walidator, ocena pola) czyta szablony i rodziny rozdzielnic — cykl jest
przerwany importami leniwymi. W jednym procesie testów kolejność importu ustala pierwszy test,
więc cykl, który pęka tylko przy imporcie z określonego modułu, jest tam niewidoczny. Każdy
moduł importowany osobno, w nowym procesie, jako PIERWSZY.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
MODULY = [
    "network_model.catalog.bay_templates",
    "network_model.catalog.rodzaje_aparatury",
    "network_model.catalog.przekladniki",
    "network_model.catalog.funkcje_eaz",
    "network_model.catalog.gazy_fluorowane",
    "network_model.catalog.switchgear",
    "network_model.catalog.switchgear.families",
    "enm.pole_liniowe_gpz",
    "enm.zgodnosc_szablonu_pola",
    "enm.gaz_fluorowany_pola",
    "enm.stan_obiektu_pola",
    "enm.wyposazenie_pola",
    "enm.validator",
    "enm.domain_operations",
    "application.field_read_model",
    "api.catalog",
]


@pytest.mark.parametrize("modul", MODULY)
def test_modul_importuje_sie_jako_pierwszy(modul: str):
    srodowisko = {**os.environ, "PYTHONPATH": f"{BACKEND / 'src'}{os.pathsep}{BACKEND}"}
    wynik = subprocess.run(
        [sys.executable, "-c", f"import {modul}"],
        cwd=BACKEND,
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert wynik.returncode == 0, wynik.stderr[-2000:]

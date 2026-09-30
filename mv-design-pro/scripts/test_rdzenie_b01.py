"""Samotest listy rdzeni B-01 (`rdzenie_b01.py`): lista jest prawdziwa i jest JEDYNĄ granicą."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import rdzenie_b01  # noqa: E402
import solver_diff_guard  # noqa: E402

REPO = SCRIPTS.parent
SRC = REPO / "backend" / "src"

#: Dokumenty, z których wykonawca czyta granicę B-01 — każdy odsyła do jednej listy.
DOKUMENTY_GRANICY = (
    REPO / "STAN_REPO.md",
    REPO / "ORKIESTRACJA_AGENTOW.md",
    REPO.parent / ".claude" / "agents" / "worker.md",
    REPO.parent / ".claude" / "agents" / "worker-rdzen.md",
)


@pytest.mark.parametrize("wpis", rdzenie_b01.sciezki_b01())
def test_kazdy_wpis_wskazuje_istniejacy_plik_albo_katalog(wpis: str) -> None:
    sciezka = SRC / wpis
    if wpis.endswith("/"):
        assert sciezka.is_dir(), f"katalog z listy B-01 nie istnieje: {wpis}"
    else:
        assert sciezka.is_file(), f"plik z listy B-01 nie istnieje: {wpis}"


def test_pliki_z_odciskiem_sa_podzbiorem_listy() -> None:
    poza_lista = [
        p for p in solver_diff_guard.PROTECTED_FILES if not rdzenie_b01.jest_rdzeniem_b01(p)
    ]
    assert not poza_lista, f"solver_diff_guard pilnuje plików spoza listy B-01: {poza_lista}"


@pytest.mark.parametrize(
    ("sciezka", "oczekiwane"),
    [
        ("network_model/solvers/short_circuit_core.py", True),
        ("network_model/solvers/ncrfg_ptpiree/engine.py", True),
        ("catalog/profiles/nc_rfg/warstwy/nc_rfg.yaml", True),
        ("network_model/solvers/frt_hvrt/__init__.py", True),
        ("network_model/solvers/cable_ampacity_derating.py", False),
        ("network_model/solvers/fault_loop_builder.py", False),
        ("network_model/solvers/dynamika/silnik.py", False),
        ("network_model/solvers/equipment_checks/slad.py", False),
        ("network_model/solvers/short_circuit_core_extra.py", False),
        ("network_model/solvers/ncrfg_ptpiree_kopia/engine.py", False),
    ],
)
def test_przynaleznosc_do_rdzenia(sciezka: str, oczekiwane: bool) -> None:
    assert rdzenie_b01.jest_rdzeniem_b01(sciezka) is oczekiwane


@pytest.mark.parametrize("dokument", DOKUMENTY_GRANICY, ids=lambda p: p.name)
def test_dokumenty_granicy_odsylaja_do_jednej_listy(dokument: Path) -> None:
    assert "scripts/rdzenie_b01.py" in dokument.read_text(
        encoding="utf-8"
    ), f"{dokument.name} opisuje granicę B-01 bez odesłania do scripts/rdzenie_b01.py"

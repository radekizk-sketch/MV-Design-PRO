"""Kolejność importów — każdy moduł listy importowany jako PIERWSZY w osobnym procesie.

PO CO (karta AB-H0 §0.0, P10). Cykl importów objawia się wyłącznie przy określonej
KOLEJNOŚCI: w pełnym biegu pytest moduły są już załadowane przez wcześniejsze testy, więc
cykl pozostaje niewidoczny, dopóki ktoś nie zaimportuje modułu jako pierwszego (skrypt,
worker, nowy konsument). Zmierzone przed kartą:

* ``werdykt.kontrakt`` → ``solver_input.provenance`` → gorliwe ``solver_input/__init__.py``
  → ``solver_input.builder`` → ``network_model.catalog.repository``: katalog
  (``network_model.catalog.types``) nie mógł zaimportować kontraktu werdyktu;
* ``enm.domain_operations_v2`` jako pierwszy moduł procesu: ``ImportError: cannot import
  name 'ALL_V2_HANDLERS' from partially initialized module`` (V1 importował V2 „z dołu").

Każdy moduł ``MODULY`` jest importowany w ŚWIEŻYM interpreterze (``subprocess``) jako
pierwszy moduł własny procesu — kod wyjścia 0. Drugi test: domknięcie importu kontraktu
werdyktu i liścia ``dziedziny`` nie zawiera żadnego modułu warstw produktu.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
SRC = BACKEND / "src"


def _moduly_dziedziny() -> list[str]:
    katalog = SRC / "dziedziny"
    moduly = ["dziedziny"]
    for plik in sorted(katalog.glob("*.py")):
        if plik.stem != "__init__":
            moduly.append(f"dziedziny.{plik.stem}")
    return moduly


#: Moduły, które MUSZĄ dać się zaimportować jako pierwsze (kontrakty, katalog, ENM,
#: profile regulacyjne, most V12.6, pliki operacji domenowych i ich rejestr).
MODULY: tuple[str, ...] = (
    *_moduly_dziedziny(),
    "werdykt.kontrakt",
    "werdykt.proweniencja",
    "solver_input.provenance",
    "solver_input.v126_contracts",
    "network_model.catalog.types",
    "network_model.catalog.repository",
    "network_model.catalog.materialization",
    "network_model.catalog.sekcje_modelu",
    "network_model.catalog.karty_widmowe",
    "network_model.catalog.odcisk",
    "enm.models",
    "enm.katalog_projektu",
    "enm.katalog_projektu_karty",
    "enm.domain_operations",
    "enm.domain_operations_v2",
    "enm.rejestr_operacji",
    "catalog.profiles.nc_rfg.loader",
    "application.model_urzadzenia.sekcje_elementu",
)

#: Korzenie warstw produktu, których NIE MOŻE zawierać domknięcie kontraktów-liści.
WARSTWY_PRODUKTU: tuple[str, ...] = (
    "network_model",
    "enm",
    "application",
    "api",
    "analysis",
    "catalog",
    "domain",
    "solver_input",
    "infrastructure",
    "solvers",
)


def _uruchom(kod: str) -> subprocess.CompletedProcess[str]:
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = str(SRC)
    return subprocess.run(  # noqa: S603 — stały, lokalny argv
        [sys.executable, "-c", kod],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(BACKEND),
        env=srodowisko,
        timeout=300,
    )


def test_lista_modulow_dziedziny_nie_jest_pusta() -> None:
    assert len(_moduly_dziedziny()) >= 9, "skan liścia `dziedziny` stracił kotwicę"


@pytest.mark.parametrize("modul", MODULY)
def test_modul_importowany_jako_pierwszy_w_procesie(modul: str) -> None:
    wynik = _uruchom(f"import {modul}")
    assert wynik.returncode == 0, (
        f"`import {modul}` jako pierwszy moduł procesu kończy się kodem {wynik.returncode}:\n"
        f"{wynik.stderr[-3000:]}"
    )


@pytest.mark.parametrize("modul", ["werdykt.kontrakt", "dziedziny"])
def test_domkniecie_kontraktow_nie_zawiera_warstw_produktu(modul: str) -> None:
    wynik = _uruchom("import sys\n" f"import {modul}\n" "print('\\n'.join(sorted(sys.modules)))\n")
    assert wynik.returncode == 0, wynik.stderr[-3000:]
    zaladowane = wynik.stdout.split()
    obce = sorted(m for m in zaladowane if m.split(".")[0] in WARSTWY_PRODUKTU)
    assert not obce, f"domknięcie `import {modul}` zawiera moduły warstw produktu: {obce}"
    wlasne = sorted(
        {m.split(".")[0] for m in zaladowane if m.split(".")[0] in {"werdykt", "dziedziny"}}
    )
    assert "werdykt" in wlasne

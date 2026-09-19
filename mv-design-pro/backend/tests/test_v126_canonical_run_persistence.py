"""V12.6 Academic: bieg przeżywa restart procesu i jest widoczny innym workerom.

Karta CV-4.3-A4 (K5.2, 2026-09-06). Do tej karty biegi V12.6 żyły w słowniku
`api.v126_academic._runs` — module-level dict procesu Python: zerował się przy
każdym restarcie serwera, a przy wielu workerach uvicorn/gunicorn POST i
następujący GET mogły trafić do RÓŻNYCH workerów (GET zwracał 404 mimo że POST
się powiódł), bo żaden mechanizm synchronizacji między procesami dla tego
słownika nie istniał.

Ten test dowodzi WŁASNOŚCI, której żaden słownik w pamięci procesu nie mógł
dać: bieg V12.6 utworzony i wykonany w JEDNYM procesie (ten proces testowy)
jest odczytywalny przez CAŁKOWICIE ODDZIELNY proces systemu operacyjnego
(subprocess, własny interpreter Pythona, ZERO stanu współdzielonego poza
plikiem bazy SQLite wskazanym `DATABASE_URL`) — dokładnie tak, jak POST i GET
tej samej analizy trafiłyby dziś do dwóch różnych workerów uvicorn.

Baza W PLIKU (nie w pamięci): domyślna izolacja testów (`tests/conftest.py::
_izolowana_baza_przebiegow`) daje każdemu testowi bazę W PAMIĘCI procesu
(`sqlite+pysqlite:///file:...?mode=memory&cache=shared`) — SQLite trzyma taką
bazę WEWNĄTRZ jednego procesu biblioteki, więc subprocess nie mógłby jej
zobaczyć niezależnie od poprawności kodu produkcyjnego (ograniczenie SQLite,
nie test). Ten test nadpisuje `DATABASE_URL` własnym `monkeypatch` (fixture
autouse jawnie dopuszcza to nadpisanie) na plik w `tmp_path` — jedyny sposób,
żeby "inny proces" znaczyło naprawdę inny proces, nie inny obiekt Pythona w
tym samym procesie.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import UUID

import pytest

from tests.ci.generuj_odpowiedzi_v126 import model_wejsciowy

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_BACKEND_SRC = _BACKEND_ROOT / "src"

_SUBPROCESS_SCRIPT = _BACKEND_ROOT / "tests" / "_v126_persistence_reader.py"


@pytest.fixture(autouse=True)
def _wyczysc_cache_silnika_po_tescie():
    """Zwolnij silnik SQLAlchemy wskazujący na plik tymczasowy PO teście.

    Bez tego `_cached_engine` modułu trzymałby otwarte połączenie do pliku w
    `tmp_path` po jego usunięciu przez pytest — ten sam wzorzec sprzątania co
    `tests/conftest.py::_izolowana_baza_przebiegow`.
    """
    yield
    from infrastructure.persistence.repositories import canonical_run_repository as repo

    if repo._cached_engine is not None:
        repo._cached_engine.dispose()
    repo._cached_engine = None
    repo._cached_session_factory = None
    repo._cached_database_url = None


def test_v126_run_survives_fresh_process(tmp_path, monkeypatch) -> None:
    from enm.canonical_analysis import create_run, execute_run

    baza_path = tmp_path / "przebiegi_v126_persist.db"
    database_url = f"sqlite+pysqlite:///{baza_path}"
    # Nadpisuje `DATABASE_URL` z fixture autouse (`_izolowana_baza_przebiegow`,
    # baza w pamięci) — jedyny sposób na PLIK widoczny drugiemu procesowi.
    monkeypatch.setenv("DATABASE_URL", database_url)
    from infrastructure.persistence.repositories import canonical_run_repository as repo

    repo._cached_engine = None
    repo._cached_session_factory = None
    repo._cached_database_url = None

    model = model_wejsciowy()
    run = create_run(
        case_id="persist-v126",
        klucz_twin="persist-v126",
        analysis_type="v126:opf_loss_lcc",
        options={"model": model.model_dump(mode="json")},
    )
    run = execute_run(run.id)
    assert run.status == "FINISHED", run.error_message
    assert run.raw_result is not None
    oczekiwany_hash = run.raw_result["deterministic_hash"]
    assert oczekiwany_hash

    # PROCES B: własny interpreter, ZERO obiektów Pythona współdzielonych z
    # procesem testowym — jedyny wspólny byt to plik bazy wskazany env var.
    env = dict(os.environ)
    env["DATABASE_URL"] = database_url
    env["PYTHONPATH"] = os.pathsep.join(
        [str(_BACKEND_ROOT), str(_BACKEND_SRC), env.get("PYTHONPATH", "")]
    ).strip(os.pathsep)

    wynik = subprocess.run(
        # `-P` (Python 3.11+, PEP 706): NIE dopisuj katalogu skryptu na start
        # `sys.path`. Bez tego `_v126_persistence_reader.py` leżący w
        # `backend/tests/` przesłoniłby prawdziwy pakiet domenowy `enm`
        # (`backend/src/enm/`) własnym `backend/tests/enm/__init__.py` (fikstury
        # testowe tego samego imienia) — `import enm` w procesie B trafiałby w
        # PUSTY pakiet testowy zamiast w `enm.canonical_analysis`. Zmierzone
        # empirycznie: bez `-P` błąd `ModuleNotFoundError: No module named
        # 'enm.canonical_analysis'`, mimo poprawnego `PYTHONPATH`.
        [sys.executable, "-P", str(_SUBPROCESS_SCRIPT), str(run.id)],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert wynik.returncode == 0, (
        f"proces czytający bieg V12.6 zakończył się błędem\n"
        f"stdout: {wynik.stdout}\nstderr: {wynik.stderr}"
    )
    odczyt = json.loads(wynik.stdout)

    assert odczyt["found"] is True
    assert odczyt["status"] == "FINISHED"
    assert odczyt["analysis_type"] == "v126:opf_loss_lcc"
    assert odczyt["deterministic_hash"] == oczekiwany_hash
    assert odczyt["result_present"] is True
    assert odczyt["case_id"] == "persist-v126"
    # Tożsamość biegu (`run.id`) NIE jest zależna od hasha wyniku (dawny słownik
    # `_runs` wyprowadzał `run_id` z `deterministic_hash[:32]`; rejestr R1 nadaje
    # UUID losowy przy `create_run` — dowód, że proces B trafił we WŁAŚCIWY
    # wiersz, nie w przypadkową kolizję identyfikatorów).
    assert UUID(odczyt["run_id"]) == run.id

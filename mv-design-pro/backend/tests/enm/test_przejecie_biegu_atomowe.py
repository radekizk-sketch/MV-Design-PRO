"""Atomowe przejęcie biegu do wykonania — jeden bieg liczy się DOKŁADNIE RAZ.

CO TEN TEST PILNUJE. `execute_run` sprawdzał status biegu osobnym odczytem, a
dopiero potem zapisywał `RUNNING`. Zbiór stanów blokujących nie zawierał
`RUNNING`, więc dwa równoległe `POST /api/execution/runs/{id}/execute` na TYM
SAMYM biegu przechodziły OBA: solver liczył się dwa razy i oba zapisy trafiały w
ten sam wiersz. Przy biegu zwarciowym sieci 50 stacji okno miało ~171 s (pomiar
w `docs/evidence/CONVERGENCE_EVIDENCE.md`), więc defekt był osiągalny zwykłym
dwuklikiem, nie tylko teoretycznym wyścigiem.

DLACZEGO TEST WĄTKOWY, A NIE SYNTETYCZNY. Zero-Debt pkt 5: test, który
„przechodzi" dzięki obejściu realnej ścieżki, maskuje defekt produktu. Sekwencyjne
wywołanie `claim_for_execution` przeszłoby także na KODZIE SPRZED naprawy (bo
drugie wywołanie zobaczyłoby już zapisany `RUNNING`). Wyścig wykrywa dopiero
RÓWNOCZESNE wejście wielu wątków w to samo okno — dlatego bariera startowa
(`threading.Barrier`) i realne wątki, nie `dispatch` po kolei.

REGUŁA KLASA, NIE INSTANCJA. Testujemy iloczyn cech, nie przykład: przejęcie ×
{poziom repozytorium, poziom `execute_run`} oraz × {stan startowy PENDING,
RUNNING, FINISHED, FAILED} — żeby predykat wejścia (`claim_for_execution`) i
predykat wyjścia (stany, którymi kończy `execute_run`) pozostały JEDNYM źródłem
prawdy (`_STANY_NIEPRZEJMOWALNE`).
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

sqlalchemy = pytest.importorskip("sqlalchemy")

from enm import canonical_analysis as ca  # noqa: E402
from enm.canonical_analysis import CanonicalRun, execute_run, get_run  # noqa: E402
from infrastructure.persistence.repositories.canonical_run_repository import (  # noqa: E402
    _STANY_NIEPRZEJMOWALNE,
    canonical_run_repository_scope,
)

LICZBA_WATKOW = 8


@pytest.fixture(autouse=True)
def _baza_plikowa(tmp_path, monkeypatch):
    """Baza PLIKOWA zamiast domyślnej `mode=memory&cache=shared` z `conftest`.

    SQLite w trybie shared-cache zgłasza `SQLITE_LOCKED` („database table is
    locked") przy równoczesnym dostępie dwóch połączeń do tej samej TABELI, a
    `busy_timeout` tego przypadku NIE obejmuje (pokrywa `SQLITE_BUSY`, nie
    `SQLITE_LOCKED`). Domyślna fikstura sesji jest więc niezdatna do pomiaru
    współbieżności — nie dlatego, że produkt jest wadliwy, tylko dlatego, że
    współdzielony cache w pamięci ma inny model blokad niż baza plikowa.
    Tor dev/e2e i produkcyjny używają bazy plikowej z `journal_mode=WAL` i
    `busy_timeout` (`infrastructure/persistence/db.py`), gdzie równoległy zapis
    CZEKA. Mierzymy więc kształt, który faktycznie jest wdrażany.
    Fikstura `conftest` jawnie dopuszcza nadpisanie `DATABASE_URL` przez test.
    """
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'przejecie.db'}")
    from infrastructure.persistence.repositories import canonical_run_repository as repo

    def wyczysc_cache() -> None:
        if repo._cached_engine is not None:
            repo._cached_engine.dispose()
        repo._cached_engine = None
        repo._cached_session_factory = None
        repo._cached_database_url = None

    wyczysc_cache()
    yield
    wyczysc_cache()


def _bieg(status: str = "PENDING", run_id: UUID | None = None) -> CanonicalRun:
    """Wiersz biegu wprost przez repozytorium — bez solvera i bez ENM.

    Przedmiotem pomiaru jest PRZEJĘCIE biegu, nie fizyka: sieć wzorcowa
    dokładałaby sekundy do testu wyścigu, nie dokładając nic do jego mocy.
    """
    run = CanonicalRun(
        id=run_id or uuid4(),
        case_id="case-przejecie",
        project_id="proj-przejecie",
        analysis_type="short_circuit_sn",
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-przejecie",
        input_hash="in-przejecie",
        snapshot={},
        validation={},
        readiness={},
        options={},
    )
    with canonical_run_repository_scope() as repozytorium:
        repozytorium.create(run)
    return run


def _rownolegle(zadanie, liczba: int = LICZBA_WATKOW) -> list:
    """Uruchom `zadanie` w `liczba` wątkach wpuszczonych barierą w to samo okno."""
    bariera = threading.Barrier(liczba)
    wyniki: list = []
    zamek = threading.Lock()

    def uruchom() -> None:
        bariera.wait()
        wynik = zadanie()
        with zamek:
            wyniki.append(wynik)

    watki = [threading.Thread(target=uruchom) for _ in range(liczba)]
    for w in watki:
        w.start()
    for w in watki:
        w.join(timeout=60)
    assert all(not w.is_alive() for w in watki), "wątek nie zakończył się w limicie"
    return wyniki


def test_przejecie_wygrywa_dokladnie_jeden_watek() -> None:
    """Poziom repozytorium: `claim_for_execution` jest atomowe."""
    run = _bieg()

    def probuj() -> bool:
        with canonical_run_repository_scope() as repozytorium:
            return repozytorium.claim_for_execution(run.id, started_at=datetime.now(UTC))

    wyniki = _rownolegle(probuj)

    assert sum(wyniki) == 1, f"przejęcie wygrało {sum(wyniki)} wątków zamiast 1"
    assert len(wyniki) == LICZBA_WATKOW
    zapisany = get_run(run.id)
    assert zapisany is not None
    assert zapisany.status == "RUNNING"
    assert zapisany.started_at is not None


@pytest.mark.parametrize("stan_startowy", sorted(_STANY_NIEPRZEJMOWALNE))
def test_biegu_w_stanie_nieprzejmowalnym_nie_da_sie_przejac(stan_startowy: str) -> None:
    """Predykat wejścia pokrywa KAŻDY stan blokujący — nie tylko terminalne."""
    run = _bieg(status=stan_startowy)

    with canonical_run_repository_scope() as repozytorium:
        przejety = repozytorium.claim_for_execution(run.id, started_at=datetime.now(UTC))

    assert przejety is False, f"bieg w stanie {stan_startowy} został przejęty"
    zapisany = get_run(run.id)
    assert zapisany is not None
    assert zapisany.status == stan_startowy, "stan biegu zmieniony mimo odmowy przejęcia"


def test_execute_run_liczy_analize_dokladnie_raz(monkeypatch: pytest.MonkeyPatch) -> None:
    """Poziom `execute_run`: równoległe wywołania liczą solver DOKŁADNIE RAZ.

    Dyspozycja fizyki podmieniona sondą liczącą wejścia — mierzymy przejęcie,
    nie solver. Sonda ŚPI, żeby okno między przejęciem a zapisem FINISHED było
    szersze niż czas przełączenia wątku; bez tego wyścig bywa niewidoczny.
    """
    run = _bieg()
    wejscia = 0
    zamek = threading.Lock()

    def sonda(bieg: CanonicalRun, uow_factory=None) -> None:  # noqa: ANN001
        nonlocal wejscia
        with zamek:
            wejscia += 1
        threading.Event().wait(0.05)

    monkeypatch.setattr(ca, "_wykonaj_analize_biegu", sonda)

    wyniki = _rownolegle(lambda: execute_run(run.id))

    assert wejscia == 1, f"analiza policzona {wejscia} razy zamiast 1"
    assert len(wyniki) == LICZBA_WATKOW
    assert all(w is not None for w in wyniki), "wywołanie zwróciło None zamiast biegu"
    zapisany = get_run(run.id)
    assert zapisany is not None
    assert zapisany.status == "FINISHED"


def test_execute_run_nie_powtarza_biegu_zakonczonego(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bieg terminalny nie jest liczony ponownie (zachowanie sprzed naprawy — pin)."""
    run = _bieg(status="FINISHED")
    wejscia = 0

    def sonda(bieg: CanonicalRun, uow_factory=None) -> None:  # noqa: ANN001
        nonlocal wejscia
        wejscia += 1

    monkeypatch.setattr(ca, "_wykonaj_analize_biegu", sonda)

    wynik = execute_run(run.id)

    assert wejscia == 0, "bieg zakończony został policzony ponownie"
    assert wynik.status == "FINISHED"

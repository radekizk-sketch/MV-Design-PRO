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

import os
import threading
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

sqlalchemy = pytest.importorskip("sqlalchemy")

from enm import canonical_analysis as ca  # noqa: E402
from enm.canonical_analysis import (  # noqa: E402
    CanonicalRun,
    execute_run,
    get_run,
    zamknij_osierocone_biegi,
)
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


def _bieg(status: str = "CREATED", run_id: UUID | None = None) -> CanonicalRun:
    """Wiersz biegu wprost przez repozytorium — bez solvera i bez ENM.

    Przedmiotem pomiaru jest PRZEJĘCIE biegu, nie fizyka: sieć wzorcowa
    dokładałaby sekundy do testu wyścigu, nie dokładając nic do jego mocy.

    Stan startowy to ``CREATED`` — JEDYNY stan, w którym `create_run` tworzy bieg
    (`canonical_analysis.py:943`). Wcześniejsza wersja tego testu używała
    ``"PENDING"``, którego domena NIE ZNA: ``PENDING`` jest wyłącznie renderem
    HTTP stanu ``CREATED`` w `to_execution_dict()`. Test przechodził, bo warunek
    przejęcia to `NOT IN (...)`, który przepuszcza dowolny napis — czyli
    przechodził NIE ĆWICZĄC realnego stanu (Zero-Debt pkt 5). Na ``"PENDING"``
    `to_execution_dict()` wywala `KeyError`, więc bieg w tym stanie nie mógłby
    nawet wrócić z API.
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


@pytest.mark.parametrize("stan_startowy", ["CREATED"])
def test_execute_run_liczy_analize_dokladnie_raz(
    stan_startowy: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Poziom `execute_run`: równoległe wywołania liczą solver DOKŁADNIE RAZ.

    Dyspozycja fizyki podmieniona sondą liczącą wejścia — mierzymy przejęcie,
    nie solver. Sonda ŚPI, żeby okno między przejęciem a zapisem FINISHED było
    szersze niż czas przełączenia wątku; bez tego wyścig bywa niewidoczny.
    """
    run = _bieg(status=stan_startowy)
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


def test_osierocony_bieg_w_running_jest_zamykany_przy_starcie() -> None:
    """Bieg przerwany restartem procesu MA sciezke wyjscia z RUNNING.

    Atomowe przejecie slusznie blokuje ponowne uruchomienie biegu w RUNNING —
    ale bez tego zamiatania bieg przerwany w polowie zostalby w RUNNING NA ZAWSZE
    (przed naprawa dawal sie uruchomic ponownie PRZYPADKIEM, tym samym defektem,
    ktory pozwalal na podwojne wykonanie). Zamieniamy odzyskiwanie przypadkowe
    na jawne — i pinujemy je testem, bo deklaracja bez testu to falszywa pewnosc.
    """
    osierocony = _bieg(status="RUNNING")
    nietkniety_utworzony = _bieg(status="CREATED")
    nietkniety_finished = _bieg(status="FINISHED")

    zamkniete = zamknij_osierocone_biegi()

    assert zamkniete == 1, f"zamknieto {zamkniete} biegow zamiast 1"
    po = get_run(osierocony.id)
    assert po is not None
    assert po.status == "FAILED"
    assert po.finished_at is not None
    assert (
        po.error_message and "restart procesu" in po.error_message
    ), "powod musi nazywac przyczyne, a nie byc pustym FAILED"
    # Zamiatanie NIE dotyka biegow, ktore nie sa osierocone.
    assert get_run(nietkniety_utworzony.id).status == "CREATED"  # type: ignore[union-attr]
    assert get_run(nietkniety_finished.id).status == "FINISHED"  # type: ignore[union-attr]


def test_bieg_odzyskany_po_zamiataniu_da_sie_uruchomic_ponownie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Zamkniecie osieroconego biegu przywraca mozliwosc policzenia go od nowa.

    Iloczyn cech: {osierocony RUNNING} x {ponowne wykonanie} — samo przejscie do
    FAILED nie wystarcza, jesli projektant nadal nie moze uruchomic analizy.
    """
    run = _bieg(status="RUNNING")
    zamknij_osierocone_biegi()

    wejscia = 0

    def sonda(bieg: CanonicalRun, uow_factory=None) -> None:  # noqa: ANN001
        nonlocal wejscia
        wejscia += 1

    monkeypatch.setattr(ca, "_wykonaj_analize_biegu", sonda)

    # Bieg jest teraz FAILED, wiec `execute_run` go NIE wznawia (stan terminalny) —
    # wznowienie idzie przez utworzenie nowego biegu. Pinujemy zachowanie jawnie,
    # zeby nikt nie uznal, ze zamiatanie samo restartuje obliczenia.
    wynik = execute_run(run.id)
    assert wynik.status == "FAILED"
    assert wejscia == 0, "zamiatanie nie moze samo wznawiac obliczen"

    # Nowy bieg na tym samym przypadku liczy sie normalnie.
    swiezy = _bieg(status="CREATED")
    execute_run(swiezy.id)
    assert wejscia == 1
    assert get_run(swiezy.id).status == "FINISHED"  # type: ignore[union-attr]


def test_stany_konczace_sa_nieprzejmowalne() -> None:
    """Niezmiennik pary predykatow: co `execute_run` ZAPISUJE, tego nie da sie przejac.

    `claim_for_execution` deklaruje, ze stany konczace bieg zawieraja sie w
    `_STANY_NIEPRZEJMOWALNE`. Bez tego testu byla to sama deklaracja (regula
    KLASA, NIE INSTANCJA pkt 4). Gdyby ktos dodal `execute_run` nowy stan
    koncowy (np. "CANCELLED") i nie dopisal go do zbioru blokujacego, bieg
    zakonczony dalby sie policzyc DRUGI RAZ — dokladnie naprawiony defekt.

    Stany czytamy ze ZRODLA (`inspect.getsource`), nie z listy przepisanej
    recznie: lista przepisana rozjechalaby sie z kodem przy pierwszej zmianie.
    """
    import inspect
    import re

    zrodlo = inspect.getsource(ca.execute_run)
    zapisywane = set(re.findall(r'run\.status = "([A-Z_]+)"', zrodlo))

    assert zapisywane, "nie wykryto zadnego przypisania run.status — test stracil kontakt z kodem"
    poza = zapisywane - set(_STANY_NIEPRZEJMOWALNE)
    assert not poza, (
        f"execute_run zapisuje stan(y) {sorted(poza)}, ktorych claim_for_execution nie blokuje "
        f"— bieg w takim stanie da sie przejac ponownie i policzyc dwa razy"
    )


def test_przegrany_dostaje_stan_biezacy_i_nie_dotyka_wiersza(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Przegrany wyscig NIE liczy, NIE psuje wiersza i oddaje UCZCIWY stan RUNNING.

    Bez tego testu pokryte bylo tylko `w is not None`. Zachowanie przegranego jest
    widoczne w HTTP: `POST /api/execution/runs/{id}/execute` moze teraz zwrocic 200
    ze statusem RUNNING i BEZ wynikow — wolajacy ma odpytywac dalej, a nie uznac
    bieg za policzony. Pinujemy to jawnie, bo to zmiana obserwowalna dla klienta.
    """
    run = _bieg()
    # Zwyciezca "trzyma" bieg: przejmujemy go recznie, tak jak zrobilby to inny watek.
    with canonical_run_repository_scope() as repozytorium:
        assert repozytorium.claim_for_execution(run.id, started_at=datetime.now(UTC))

    wejscia = 0

    def sonda(bieg: CanonicalRun, uow_factory=None) -> None:  # noqa: ANN001
        nonlocal wejscia
        wejscia += 1

    monkeypatch.setattr(ca, "_wykonaj_analize_biegu", sonda)

    wynik = execute_run(run.id)

    assert wejscia == 0, "przegrany policzyl analize mimo przegranego wyscigu"
    assert wynik.status == "RUNNING", "przegrany musi oddac stan biezacy, nie udawac sukcesu"
    assert wynik.raw_result in (None, {}), "przegrany nie moze zwrocic wynikow, ktorych nie ma"
    # Wiersz nietkniety: nadal RUNNING, bez finished_at i bez bledu.
    zapisany = get_run(run.id)
    assert zapisany is not None
    assert zapisany.status == "RUNNING"
    assert zapisany.finished_at is None
    assert zapisany.error_message is None


def test_zamiatanie_stoi_na_zalozeniu_jednego_procesu_api() -> None:
    """Pin zalozenia, na ktorym stoi TRANSITIONAL SINGLE-EXECUTOR RECOVERY.

    `fail_orphaned_running` kasuje KAZDY wiersz RUNNING bez filtra po wlascicielu.
    Poprawne WYLACZNIE dopoki wykonanie biegu nalezy do JEDNEGO procesu API.
    Wieloprocesowosc ma wiecej niz jeden ksztalt i pin musi pokrywac je RAZEM
    (KLASA, NIE INSTANCJA) — kazdy z osobna wystarczy do szkody:
      (a) wiele workerow w jednym kontenerze (uvicorn --workers, gunicorn),
      (b) wiele KONTENEROW/replik przy tej samej bazie (compose replicas/scale;
          `container_name` blokuje `--scale`, wiec tez jest pinowany),
      (c) przeniesienie wykonania do puli procesow albo kolejki (DT-12).
    W kazdym z nich start jednego procesu WYWALILBY biegi trwajace w drugim —
    przy oknie liczonym w minutach.

    Gdy ktorykolwiek warunek przestanie byc prawdziwy, ma zapalic sie TU, a nie u
    projektanta, a mechanizm ma zostac ZASTAPIONY dzierzawa (`worker_id`,
    `lease_until`, `heartbeat_at` albo rownowaznym kontraktem lease/heartbeat).
    Globalne zamiatanie jest rozwiazaniem PRZEJSCIOWYM, nie architektura docelowa.
    """
    from pathlib import Path

    korzen = Path(__file__).resolve().parents[2]

    dockerfile = (korzen / "Dockerfile").read_text(encoding="utf-8")
    assert "--workers" not in dockerfile, (
        "Dockerfile uruchamia wiele procesow API — zamiatanie osieroconych biegow "
        "przestalo byc bezpieczne (patrz fail_orphaned_running)"
    )
    assert "gunicorn" not in dockerfile, "gunicorn oznacza wiele workerow — patrz komentarz wyzej"

    # (b) wiele kontenerow/replik przy tej samej bazie
    compose = (korzen.parent / "docker-compose.yml").read_text(encoding="utf-8")
    # `command:` w compose NADPISUJE CMD z Dockerfile, wiec sam Dockerfile nie wystarczy:
    # `command: uvicorn ... --workers 4` uruchomiloby wiele procesow mimo czystego obrazu.
    for wzorzec in ("--workers", "gunicorn"):
        assert wzorzec not in compose, (
            f"docker-compose uruchamia backend z {wzorzec} — to wiele procesow API przy jednej "
            "bazie, wiec globalne zamiatanie RUNNING przestalo byc bezpieczne"
        )
    for wzorzec in ("replicas:", "scale:"):
        assert wzorzec not in compose, (
            f"docker-compose deklaruje {wzorzec} — repliki backendu to wiele procesow "
            "przy jednej bazie, wiec globalne zamiatanie RUNNING przestalo byc bezpieczne"
        )
    assert "container_name: mv-design-pro-backend" in compose, (
        "zniknal container_name backendu — compose pozwala wtedy na --scale, "
        "czyli wiele procesow API przy jednej bazie (patrz docstring)"
    )

    zakazane = ("ProcessPoolExecutor", "multiprocessing", "concurrent.futures")
    trafienia = [
        f"{sciezka.relative_to(korzen)}:{nazwa}"
        for sciezka in (korzen / "src").rglob("*.py")
        for nazwa in zakazane
        if nazwa in sciezka.read_text(encoding="utf-8")
    ]
    assert not trafienia, (
        "wykonanie moze juz isc w osobnych procesach "
        f"({trafienia}) — zamiatanie po statusie RUNNING wymaga wtedy dzierzawy "
        "z biciem serca zamiast globalnego UPDATE"
    )


def test_kazdy_status_domenowy_ma_odwzorowanie_http() -> None:
    """Zbior statusow ZAPISYWANYCH przez domene = zbior kluczy mapowania HTTP.

    KLASA, NIE INSTANCJA. Instancja defektu: ten plik budowal biegi w statusie
    "PENDING", ktorego domena NIE ZNA (PENDING to render HTTP stanu CREATED), a
    testy i tak przechodzily. Klasa defektu: `CanonicalRun.status` jest golym
    `str` (`canonical_analysis.py:497`) BEZ ograniczenia `Literal`, wiec dowolna
    literowka przechodzi zarowno przez model, jak i przez predykat przejecia
    (`NOT IN` przepuszcza kazdy napis). Bez tego pinu kolejny status dopisany do
    domeny bez wpisu w `to_execution_dict()` wywalilby endpoint `KeyError`-em
    dopiero u projektanta.

    UWAGA — `VALIDATED` NIE jest stanem `CanonicalRun`. Nalezy do legacy rejestru
    R2 (`domain/analysis_run.py::AnalysisRunStatus`), ktory jest INNA klasa i nie
    dotyka tabeli `canonical_runs`; zaden zapis nie wstawia go tutaj (sprawdzone
    grepem). Dlatego zbior domenowy wyprowadzamy ZE ZRODLA modulu, a nie z listy
    statusow innego rejestru.
    """
    import inspect
    import re

    from infrastructure.persistence.repositories import canonical_run_repository as repo

    # Statusy zapisywane przez DOMENE...
    zrodlo_modulu = inspect.getsource(ca)
    zapisywane = set(re.findall(r'run\.status = "([A-Z_]+)"', zrodlo_modulu))
    zapisywane |= set(re.findall(r'status="([A-Z_]+)"', inspect.getsource(ca.create_run)))
    # ...ORAZ przez REPOZYTORIUM. `claim_for_execution` ustawia RUNNING zdaniem
    # `UPDATE ... .values(status="RUNNING")`, wiec status potrafi powstac POZA
    # `canonical_analysis`. Pominiecie tej sciezki zostawialoby luke dokladnie tam,
    # gdzie wprowadzono nowy wzorzec zapisu (i gdzie dopisze go karta D-4).
    zapisywane |= set(re.findall(r'status="([A-Z_]+)"', inspect.getsource(repo)))

    assert zapisywane, "nie wykryto zadnego zapisu statusu — test stracil kontakt z kodem"

    # Mapowanie czytamy WPROST ze stalej (jedyne zrodlo prawdy), nie z parsowania
    # zrodla `to_execution_dict` — inaczej refaktor samego mapowania wywalalby test
    # bez zadnego defektu produktu.
    odwzorowane = set(ca.STATUS_WYKONAWCZY)

    bez_odwzorowania = zapisywane - odwzorowane
    assert not bez_odwzorowania, (
        f"domena zapisuje status(y) {sorted(bez_odwzorowania)} bez wpisu w to_execution_dict() "
        f"— endpoint wywali KeyError; STATUS_WYKONAWCZY zna {sorted(odwzorowane)}"
    )


# --------------------------------------------------------------------------
# Postgres: ten sam kontrakt na dialekcie PRODUKCYJNYM
# --------------------------------------------------------------------------
# `docker-compose.yml` uruchamia backend na `postgresql+psycopg://` (DT-13:
# „Postgres docelowo, SQLite dev/test"), a `conftest.py` wymusza SQLite — wiec
# bez tego testu atomowosc przejecia bylaby sprawdzana WYLACZNIE na dialekcie,
# ktory nie jest produkcyjny. Test wlacza sie, gdy wskazesz baze zmienna
# `MV_TEST_POSTGRES_URL`, np.:
#   MV_TEST_POSTGRES_URL=postgresql+psycopg://postgres@127.0.0.1:5432/mvtest
# Bez niej jest pomijany (a NIE cicho zielony).
POSTGRES_URL = os.environ.get("MV_TEST_POSTGRES_URL")


@pytest.mark.skipif(
    not POSTGRES_URL, reason="brak MV_TEST_POSTGRES_URL — dialekt produkcyjny niesprawdzany"
)
def test_przejecie_jest_atomowe_takze_na_postgresie(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ten sam niezmiennik, ten sam wyscig, dialekt produkcyjny.

    Wzorzec `UPDATE ... WHERE status NOT IN (...)` + `rowcount` jest poprawny w
    obu silnikach, ale poprawnosc rozumowania to nie to samo co wykonany dowod.
    Zmierzone przy dodawaniu tego testu (PostgreSQL 16.13, 12 watkow, bariera):
    kod SPRZED naprawy liczyl solver **12 razy**, kod PO naprawie — **1 raz**.
    """
    from infrastructure.persistence.repositories import canonical_run_repository as repo

    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    repo._cached_engine = None
    repo._cached_session_factory = None
    repo._cached_database_url = None

    run = _bieg()
    wejscia = 0
    zamek = threading.Lock()

    def sonda(bieg: CanonicalRun, uow_factory=None) -> None:  # noqa: ANN001
        nonlocal wejscia
        with zamek:
            wejscia += 1
        threading.Event().wait(0.05)

    monkeypatch.setattr(ca, "_wykonaj_analize_biegu", sonda)

    _rownolegle(lambda: execute_run(run.id))

    assert wejscia == 1, f"na Postgresie analiza policzona {wejscia} razy zamiast 1"
    zapisany = get_run(run.id)
    assert zapisany is not None
    assert zapisany.status == "FINISHED"

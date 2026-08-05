"""Leniwa inicjalizacja silnika bazy biegow pod rownoczesnym dostepem.

Testy przypiete do dwoch DEKLARACJI postawionych przy osi wspolbieznosci
programu 10x — zgodnie z regula „deklaracja bez testu = falszywa pewnosc":

1. `get_canonical_run_session_factory()` tworzy DOKLADNIE JEDEN silnik, choc
   wola je rownoczesnie wiele watkow (przed naprawa: kazdy watek, ktory zdazyl
   zobaczyc pusty cache, budowal wlasny silnik i wykonywal `init_db`; nadmiarowe
   silniki zostawaly osierocone z otwartymi polaczeniami).
2. Silnik SQLite w pamieci znosi zamkniecie polaczenia z INNEGO watku niz jego
   tworca — bez tego `dispose()` w teardownie zostawia otwarte polaczenia, a
   baza „izolowana per test" nie znika.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

pytest.importorskip("sqlalchemy")


def test_rownoczesne_wolania_buduja_jeden_silnik(monkeypatch, tmp_path) -> None:
    """N watkow startujacych z pustym cache dostaje TEN SAM silnik.

    Bariera ustawia wszystkie watki dokladnie na progu wywolania — bez niej
    pierwszy watek zdazylby wypelnic cache, zanim reszta w ogole go sprawdzi, i
    test przechodzilby takze na kodzie bez blokady (czyli nie bylby bramka).
    """
    from infrastructure.persistence.repositories import canonical_run_repository as repo

    monkeypatch.setenv(
        "DATABASE_URL",
        f"sqlite+pysqlite:///file:jeden-silnik-{tmp_path.name}?mode=memory&cache=shared&uri=true",
    )

    if repo._cached_engine is not None:
        repo._cached_engine.dispose()
    repo._cached_engine = None
    repo._cached_session_factory = None
    repo._cached_database_url = None

    liczba_watkow = 8
    utworzone: list[object] = []
    zamek = threading.Lock()
    oryginalne_create = repo.create_engine_from_url

    def liczace_create(url: str, **kwargs: object) -> object:
        silnik = oryginalne_create(url, **kwargs)  # type: ignore[arg-type]
        with zamek:
            utworzone.append(silnik)
        return silnik

    monkeypatch.setattr(repo, "create_engine_from_url", liczace_create)

    bariera = threading.Barrier(liczba_watkow)

    def wolaj() -> object:
        bariera.wait()
        return repo.get_canonical_run_session_factory()

    try:
        with ThreadPoolExecutor(max_workers=liczba_watkow) as pula:
            fabryki = list(pula.map(lambda _: wolaj(), range(liczba_watkow)))

        # Wszyscy dostali TEN SAM obiekt fabryki...
        assert all(f is fabryki[0] for f in fabryki)
        # ...i powstal DOKLADNIE JEDEN silnik (przed naprawa: do `liczba_watkow`).
        assert len(utworzone) == 1, (
            f"Powstalo {len(utworzone)} silnikow zamiast jednego — leniwa "
            "inicjalizacja nie jest serializowana."
        )
    finally:
        if repo._cached_engine is not None:
            repo._cached_engine.dispose()
        repo._cached_engine = None
        repo._cached_session_factory = None
        repo._cached_database_url = None


def test_silnik_w_pamieci_znosi_zamkniecie_z_innego_watku(tmp_path) -> None:
    """`dispose()` z watku glownego zamyka polaczenie zalozone w watku roboczym.

    To jest dokladnie uklad z teardownu fikstury izolacji bazy: polaczenia
    zakladaja watki puli obslugujace zadania, a sprzata je watek glowny.
    """
    from infrastructure.persistence.db import create_engine_from_url, init_db
    from sqlalchemy import text

    url = f"sqlite+pysqlite:///file:zamkniecie-{tmp_path.name}?mode=memory&cache=shared&uri=true"
    engine = create_engine_from_url(url)
    init_db(engine)

    def uzyj_w_watku_roboczym() -> int:
        with engine.connect() as conn:
            return int(conn.execute(text("SELECT 1")).scalar_one())

    with ThreadPoolExecutor(max_workers=1) as pula:
        assert pula.submit(uzyj_w_watku_roboczym).result() == 1

    # Przed naprawa: `sqlite3.ProgrammingError` polkniety przez pule i zalogowany
    # jako ERROR, z polaczeniem pozostawionym otwartym.
    engine.dispose()


@pytest.mark.parametrize(
    ("adres", "oczekiwany_klucz", "oczekiwana_pula"),
    [
        # Plik: SQLAlchemy sam podaje `check_same_thread=False` i pule `QueuePool`,
        # wiec NIE dokladamy klucza — byloby to cicha zmiana konfiguracji toru
        # produkcyjnego pod pretekstem naprawy toru testowego.
        ("plikowy", False, "QueuePool"),
        # Pamiec: SQLAlchemy wybiera `SingletonThreadPool` i ZOSTAWIA straznik
        # wlaczony — tu klucz jest konieczny.
        ("w_pamieci", True, "SingletonThreadPool"),
    ],
)
def test_rozluznienie_straznika_watku_tylko_dla_bazy_w_pamieci(
    monkeypatch, tmp_path, adres: str, oczekiwany_klucz: bool, oczekiwana_pula: str
) -> None:
    """`check_same_thread=False` trafia WYLACZNIE do adresow w pamieci.

    Test podglada argumenty, ktore `create_engine_from_url` faktycznie przekazuje
    sterownikowi — `dialect.create_connect_args()` pokazuje wylacznie wybory
    samego SQLAlchemy i o naszej decyzji nie mowi nic.
    """
    from infrastructure.persistence import db

    url = (
        f"sqlite+pysqlite:///{tmp_path / 'plik.db'}"
        if adres == "plikowy"
        else f"sqlite+pysqlite:///file:straznik-{tmp_path.name}"
        "?mode=memory&cache=shared&uri=true"
    )

    przechwycone: dict[str, object] = {}
    oryginalne_create_engine = db.create_engine

    def podgladajace(url_: str, **kwargs: object) -> object:
        przechwycone.update(kwargs.get("connect_args") or {})  # type: ignore[arg-type]
        return oryginalne_create_engine(url_, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(db, "create_engine", podgladajace)

    engine = db.create_engine_from_url(url)
    try:
        assert przechwycone["timeout"] == db._SQLITE_BUSY_TIMEOUT_S
        assert ("check_same_thread" in przechwycone) is oczekiwany_klucz
        assert type(engine.pool).__name__ == oczekiwana_pula
    finally:
        engine.dispose()

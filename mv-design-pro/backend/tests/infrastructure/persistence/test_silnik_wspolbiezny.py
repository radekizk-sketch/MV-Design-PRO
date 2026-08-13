"""Leniwa inicjalizacja silnika bazy biegow pod rownoczesnym dostepem.

Testy przypiete do DEKLARACJI postawionych przy osi wspolbieznosci programu
10x — zgodnie z regula „deklaracja bez testu = falszywa pewnosc":

1. `get_canonical_run_session_factory()` tworzy DOKLADNIE JEDEN silnik, choc
   wola je rownoczesnie wiele watkow (przed naprawa: kazdy watek, ktory zdazyl
   zobaczyc pusty cache, budowal wlasny silnik i wykonywal `init_db`; nadmiarowe
   silniki zostawaly osierocone z otwartymi polaczeniami).
2. Konfiguracja sterownika SQLite dla bazy W PAMIECI zostaje przy `check_same_thread`
   WLACZONYM — patrz `test_baza_w_pamieci_zachowuje_strażnika_watku` nizej.
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


def test_baza_w_pamieci_zachowuje_straznika_watku(monkeypatch, tmp_path) -> None:
    """Adres SQLite W PAMIECI NIE MOZE dostac `check_same_thread=False`.

    PULAPKA UDOKUMENTOWANA POMIAREM (2026-08-05). Dla adresu w pamieci SQLAlchemy
    wybiera `SingletonThreadPool` — pule, ktora trzyma polaczenie NA WATEK i przy
    przekroczeniu rozmiaru zamyka polaczenia NALEZACE DO INNYCH WATKOW. Przy
    domyslnym `check_same_thread=True` takie zamkniecie po prostu sie nie udaje
    (`sqlite3.ProgrammingError` polkniety przez pule i zalogowany), wiec uzywane
    polaczenie PRZEZYWA — straznik dziala tu jak zabezpieczenie.

    Proba „posprzatania" tego szumu przez `check_same_thread=False` sprawia, ze
    zamkniecie SIE UDAJE — pula zamyka polaczenie, z ktorego inny watek wlasnie
    korzysta, i proces konczy sie SEGMENTATION FAULT w warstwie C sqlite3
    (zmierzone: `tests/api/test_wspolbieznosc_biegow.py`, K=10 watkow). Naprawa
    kosmetycznego wpisu w logu kosztowalaby awarie procesu.

    WLASCIWE ROZWIAZANIE jest gdzie indziej i jest juz wdrozone: test
    wspolbieznosci biegow uzywa bazy PLIKOWEJ — tej samej konfiguracji co tor
    produkcyjny (`QueuePool`, WAL, busy timeout) — zamiast skrotu ze wspolnym
    cache w pamieci, ktorego produkcja nigdy nie uzywa.

    Ten test pilnuje, ze nikt nie „naprawi" tego ponownie.
    """
    from infrastructure.persistence import db

    przechwycone: dict[str, object] = {}
    oryginalne_create_engine = db.create_engine

    def podgladajace(url_: str, **kwargs: object) -> object:
        przechwycone.update(kwargs.get("connect_args") or {})  # type: ignore[arg-type]
        return oryginalne_create_engine(url_, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(db, "create_engine", podgladajace)

    url = f"sqlite+pysqlite:///file:straznik-{tmp_path.name}?mode=memory&cache=shared&uri=true"
    engine = db.create_engine_from_url(url)
    try:
        assert type(engine.pool).__name__ == "SingletonThreadPool"
        assert "check_same_thread" not in przechwycone, (
            "Baza w pamieci dostala rozluzniony straznik watku — "
            "SingletonThreadPool zamknie polaczenie uzywane przez inny watek "
            "(segmentation fault)."
        )
        assert przechwycone["timeout"] == db._SQLITE_BUSY_TIMEOUT_S
    finally:
        engine.dispose()


def test_silnik_plikowy_jest_wielowatkowy(tmp_path) -> None:
    """Tor PLIKOWY (produkcja/dev) obsluguje wiele watkow bez zadnych dodatkow.

    To jest konfiguracja, w ktorej dziala offload koncowek do puli watkow:
    `QueuePool` + `check_same_thread=False` podane przez samo SQLAlchemy.
    """
    from infrastructure.persistence.db import create_engine_from_url, init_db
    from sqlalchemy import text

    engine = create_engine_from_url(f"sqlite+pysqlite:///{tmp_path / 'plik.db'}")
    try:
        init_db(engine)
        assert type(engine.pool).__name__ == "QueuePool"

        def uzyj() -> int:
            with engine.connect() as conn:
                return int(conn.execute(text("SELECT 1")).scalar_one())

        with ThreadPoolExecutor(max_workers=4) as pula:
            assert list(pula.map(lambda _: uzyj(), range(8))) == [1] * 8
    finally:
        # Zamkniecie z watku glownego polaczen zalozonych przez watki robocze —
        # dla `QueuePool` poprawne, bo straznik watku jest wylaczony przez
        # SQLAlchemy dla adresow plikowych.
        engine.dispose()

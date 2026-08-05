from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

#: Budżet oczekiwania na blokadę zapisu SQLite [s]. Zmierzone (2026-07-30,
#: pełna suita e2e, równolegli workerzy na wspólnej bazie dev): zapis dużego
#: artefaktu wyniku biegu potrafi trzymać blokadę zapisu na tyle długo, że
#: WSPÓŁBIEŻNY POST (np. utworzenie projektu) kończył się
#: `sqlite3.OperationalError: database is locked` → 500, zamiast chwilę
#: poczekać. 30 s pokrywa zmierzony ogon zapisu artefaktu z zapasem.
_SQLITE_BUSY_TIMEOUT_S = 30


def create_engine_from_url(url: str, *, echo: bool = False) -> Engine:
    if url.startswith("sqlite"):
        # Tor deweloperski/e2e (produkcja: DATABASE_URL wskazuje Postgres).
        # (1) `timeout` sterownika = busy timeout połączenia — współbieżny
        # zapis CZEKA na zwolnienie blokady zamiast błądzić natychmiast.
        # (2) WAL: czytelnicy nie blokują pisarza i odwrotnie — jedyny tryb
        # dziennika, w którym równoległe sesje API na jednej bazie plikowej
        # są poprawne. Ustawienia deterministyczne (konfiguracja silnika,
        # zero wpływu na treść danych i wyniki).
        # (3) `check_same_thread=False` dla bazy W PAMIECI. Sterownik sqlite3
        # domyslnie zabrania UZYCIA polaczenia w innym watku niz ten, ktory je
        # utworzyl — i liczy do tego rowniez `close()`. Dla adresu plikowego
        # SQLAlchemy sam wylacza ten straznik (pula `QueuePool`), ale dla adresu
        # w pamieci wybiera `SingletonThreadPool` i zostawia straznik wlaczony.
        # Skutek zmierzony (2026-08-05, tor testowy po przeniesieniu koncowek do
        # puli watkow): `engine.dispose()` z watku glownego probuje zamknac
        # polaczenia utworzone przez watki robocze i konczy sie
        # `sqlite3.ProgrammingError: SQLite objects created in a thread can only
        # be used in that same thread`. Blad jest POLYKANY przez pule (leci do
        # logu jako ERROR), wiec nie wywraca testu — zostawia za to otwarte
        # polaczenie, przez ktore baza w pamieci ze wspolnym cache NIE ZNIKA po
        # teardownie, wbrew temu, co deklaruje fikstura izolacji.
        # ZAKRES ZMIANY: kazdy watek nadal dostaje WLASNE polaczenie
        # (`SingletonThreadPool` trzyma je per watek) — nie wprowadzamy
        # wspoldzielenia jednego polaczenia miedzy watkami. Zmienia sie
        # wylacznie dopuszczalnosc zamkniecia polaczenia z zewnatrz.
        w_pamieci = "mode=memory" in url or ":memory:" in url
        connect_args: dict[str, Any] = {"timeout": _SQLITE_BUSY_TIMEOUT_S}
        if w_pamieci:
            connect_args["check_same_thread"] = False

        engine = create_engine(
            url,
            echo=echo,
            future=True,
            connect_args=connect_args,
        )

        @event.listens_for(engine, "connect")
        def _ustaw_pragmy_sqlite(dbapi_connection: Any, _record: Any) -> None:
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute(f"PRAGMA busy_timeout={_SQLITE_BUSY_TIMEOUT_S * 1000}")
            finally:
                cursor.close()

        return engine
    return create_engine(url, echo=echo, future=True)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, class_=Session)


@contextmanager
def session_scope(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)

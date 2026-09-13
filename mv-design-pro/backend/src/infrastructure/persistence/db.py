from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import Engine, create_engine, event, inspect, text
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
        engine = create_engine(
            url,
            echo=echo,
            future=True,
            connect_args={"timeout": _SQLITE_BUSY_TIMEOUT_S},
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
    _dolacz_kolumny_addytywne(engine)


def _dolacz_kolumny_addytywne(engine: Engine) -> None:
    """Dołóż do ISTNIEJĄCYCH tabel kolumny, których `create_all` nie tworzy.

    `Base.metadata.create_all` tworzy tylko BRAKUJĄCE TABELE — kolumna dopisana do
    modelu ORM nie trafia do bazy, która tę tabelę już ma (baza deweloperska
    `mv_design_pro.db`, baza e2e). Bez tego kroku pierwszy zapis kończył się
    `OperationalError: table … has no column named …`, a stan „model zna kolumnę,
    baza nie" był niewidoczny w testach (te budują bazę od zera).

    Reguła jest wąska i jawna: dokładane są WYŁĄCZNIE kolumny dopuszczające NULL
    (`ALTER TABLE … ADD COLUMN`, składnia wspólna dla SQLite i PostgreSQL). Kolumna
    NOT NULL bez wartości domyślnej w istniejącej tabeli to ZMIANA SCHEMATU, nie
    dołożenie — kończy się jawnym błędem, żeby nikt nie dostał bazy w stanie
    pośrednim. Typ kolumny jest kompilowany dialektem silnika (ten sam, którym
    `create_all` tworzy tabele od zera), więc obie drogi dają tę samą definicję.
    """
    inspektor = inspect(engine)
    istniejace_tabele = set(inspektor.get_table_names())
    for tabela in Base.metadata.sorted_tables:
        if tabela.name not in istniejace_tabele:
            continue
        obecne = {kolumna["name"] for kolumna in inspektor.get_columns(tabela.name)}
        for kolumna in tabela.columns:
            if kolumna.name in obecne:
                continue
            if not kolumna.nullable and kolumna.server_default is None:
                raise RuntimeError(
                    f"Kolumna {tabela.name}.{kolumna.name} jest NOT NULL bez wartosci "
                    "domyslnej — nie da sie jej dolozyc do istniejacej tabeli bez zmiany "
                    "schematu; to nie jest kolumna addytywna."
                )
            typ = kolumna.type.compile(dialect=engine.dialect)
            with engine.begin() as polaczenie:
                polaczenie.execute(
                    text(f'ALTER TABLE "{tabela.name}" ADD COLUMN "{kolumna.name}" {typ}')
                )

"""Konfiguracja silnika SQLite pod wspolbieznosc (V12K-283, odbior K9-B).

Zmierzony defekt (pelna suita e2e, rownolegli workerzy na wspolnej bazie dev):
zapis duzego artefaktu wyniku biegu trzymal blokade zapisu SQLite, a
WSPOLBIEZNY POST (utworzenie projektu) konczyl sie
``sqlite3.OperationalError: database is locked`` -> 500 zamiast chwile
poczekac. Naprawa u zrodla: fabryka silnika ustawia dla SQLite tryb WAL
(czytelnicy nie blokuja pisarza) oraz budzet oczekiwania na blokade
(busy timeout sterownika + PRAGMA). Ten test PRZYPINA te konfiguracje —
jej regresja bylaby inaczej niewidoczna az do niedeterministycznych flakow
wspolbieznych biegow e2e.
"""

from __future__ import annotations

from pathlib import Path

from infrastructure.persistence.db import create_engine_from_url
from sqlalchemy import text


def test_sqlite_file_engine_uses_wal_and_busy_timeout(tmp_path: Path) -> None:
    engine = create_engine_from_url(f"sqlite+pysqlite:///{tmp_path / 'proba.db'}")
    try:
        with engine.connect() as connection:
            journal_mode = connection.execute(text("PRAGMA journal_mode")).scalar_one()
            busy_timeout_ms = connection.execute(text("PRAGMA busy_timeout")).scalar_one()
        assert str(journal_mode).lower() == "wal"
        assert int(busy_timeout_ms) >= 30000
    finally:
        engine.dispose()


def test_non_sqlite_url_is_untouched_by_sqlite_pragmas() -> None:
    # Fabryka nie moze zakladac SQLite dla innych sterownikow — sciezka
    # produkcyjna (Postgres) przechodzi przez galaz bez pragm. Tu wystarczy
    # potwierdzic, ze utworzenie silnika dla nie-SQLite URL nie wykonuje
    # zadnych operacji na polaczeniu (lazy connect) i nie rzuca.
    engine = create_engine_from_url("postgresql+psycopg://uzytkownik@localhost/testowa")
    try:
        assert engine.dialect.name == "postgresql"
    finally:
        engine.dispose()

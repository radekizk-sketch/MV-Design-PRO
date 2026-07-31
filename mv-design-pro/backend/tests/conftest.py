from __future__ import annotations

import importlib.util
import inspect
import sys
from pathlib import Path

import pytest

# Add backend/src to path for imports
backend_src = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(backend_src))

# Korzen backendu na sciezce — WYMAGANY przez tryb importu `importlib`
# (pyproject: `[tool.pytest.ini_options] addopts = "--import-mode=importlib"`;
# tryb NIE ma wlasnego klucza ini, wiec wchodzi przez addopts). Tryb `importlib` celowo
# NIE dopisuje niczego do `sys.path` (to wlasnie ta samowolka powodowala
# cieniowanie pakietow zrodlowych przez testowe), a 58 modulow testowych importuje
# wspoldzielone budowniczki przez `from tests.<pakiet> import ...`. Dopisujemy
# wiec dokladnie JEDEN katalog — korzen backendu — zamiast pozwalac pytestowi
# wstrzykiwac katalog bazowy kazdego modulu testowego z osobna.
backend_root = Path(__file__).parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))


def _install_httpx_testclient_compat() -> None:
    """Bridge starlette<=0.27 TestClient onto httpx>=0.28 for backend tests."""
    if importlib.util.find_spec("httpx") is None:
        return

    import httpx

    if getattr(httpx.Client.__init__, "_backend_test_compat", False):
        return
    if "app" in inspect.signature(httpx.Client.__init__).parameters:
        return

    original_init = httpx.Client.__init__

    def _compat_init(self, *args, app=None, **kwargs):
        return original_init(self, *args, **kwargs)

    _compat_init._backend_test_compat = True  # type: ignore[attr-defined]
    httpx.Client.__init__ = _compat_init


_install_httpx_testclient_compat()

_MISSING_DEPS = {
    name for name in ("sqlalchemy", "numpy", "networkx") if importlib.util.find_spec(name) is None
}


def pytest_ignore_collect(collection_path, config):
    if not _MISSING_DEPS:
        return False
    path_str = str(collection_path)
    if "tests/proof_engine" in path_str:
        return False
    return True


@pytest.fixture(autouse=True)
def _izolowana_baza_przebiegow(tmp_path, monkeypatch):
    """Każdy test dostaje WŁASNĄ bazę przebiegów kanonicznych (V12K-267).

    DEFEKT, KTÓRY TO USUWA. ``canonical_run_repository`` rozwiązuje adres bazy
    przez ``os.getenv("DATABASE_URL", "sqlite+pysqlite:///./mv_design_pro.db")``
    i CACHUJE silnik w zmiennej modułu. Testy, które nie ustawiły ``DATABASE_URL``
    same (a robiło to 12 plików na kilkaset), pisały do JEDNEGO pliku w katalogu
    roboczym — wspólnego dla całej sesji testowej i TRWAŁEGO MIĘDZY URUCHOMIENIAMI
    (plik urósł do 15 MB). Skutek zmierzony: sporadyczne
    ``sqlalchemy.orm.exc.StaleDataError: UPDATE statement on table 'canonical_runs'
    expected to update 1 row(s); 0 were matched`` — raz w
    ``test_dowod_v12k040``, raz w ``test_odpowiedz_osd_service``, przy kolejnych
    przebiegach zielono. Test, który przechodzi albo nie w zależności od tego, co
    zostawił po sobie POPRZEDNI przebieg, nie jest bramką: mógł tak samo
    przepuścić prawdziwą regresję. Łamie to też regułę determinizmu kanonu
    („to samo wejście = ten sam wynik").

    Fixture jest ``autouse``, bo izolacja nie może zależeć od tego, czy autor
    testu o niej pamiętał. Testy ustawiające ``DATABASE_URL`` własnym
    ``monkeypatch`` nadal wygrywają — nadpisują tę samą zmienną po nas.
    """
    if importlib.util.find_spec("sqlalchemy") is None:
        yield
        return

    monkeypatch.setenv(
        "DATABASE_URL",
        # Baza W PAMIĘCI ze wspólnym cache: izolacja bez kosztu tworzenia schematu
        # na dysku (pomiar: 29 s wobec 80 s dla pliku tymczasowego, przy tym samym
        # zestawie 531 testów). Nazwa bierze się z katalogu tymczasowego pytest,
        # który jest unikalny per test — NIE z `id()` obiektu, bo identyfikatory
        # bywają ponownie użyte po zwolnieniu pamięci i dwa testy mogłyby trafić
        # na tę samą bazę. Baza znika, gdy zamknie się ostatnie połączenie
        # (robi to `wyczysc_cache` w teardownie).
        f"sqlite+pysqlite:///file:przebiegi-{tmp_path.name}" "?mode=memory&cache=shared&uri=true",
    )

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


@pytest.fixture()
def db_engine(tmp_path):
    if importlib.util.find_spec("sqlalchemy") is None:
        pytest.skip("SQLAlchemy not available in test environment.")

    from infrastructure.persistence.db import (
        create_engine_from_url,
        init_db,
    )

    db_path = tmp_path / "test.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session_factory(db_engine):
    from infrastructure.persistence.db import create_session_factory

    return create_session_factory(db_engine)


@pytest.fixture()
def uow_factory(db_session_factory):
    from infrastructure.persistence.unit_of_work import build_uow_factory

    return build_uow_factory(db_session_factory)


@pytest.fixture()
def test_db_session(db_session_factory):
    """Provide a test database session for integration tests."""
    session = db_session_factory()
    yield session
    session.rollback()
    session.close()

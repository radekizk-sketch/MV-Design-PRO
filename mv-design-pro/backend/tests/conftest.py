from __future__ import annotations

import importlib.util
import inspect
import sys
from pathlib import Path

import pytest

# Add backend/src to path for imports
backend_src = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(backend_src))


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

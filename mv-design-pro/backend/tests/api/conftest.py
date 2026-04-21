from __future__ import annotations

import importlib.util

import pytest

FASTAPI_AVAILABLE = importlib.util.find_spec("fastapi") is not None
SQLALCHEMY_AVAILABLE = importlib.util.find_spec("sqlalchemy") is not None


@pytest.fixture()
def app_client(uow_factory):
    if not FASTAPI_AVAILABLE:
        pytest.skip("fastapi nie jest dostępne w środowisku testowym")
    if not SQLALCHEMY_AVAILABLE:
        pytest.skip("sqlalchemy nie jest dostępne w środowisku testowym")

    from api.dependencies import get_uow_factory
    from api.main import app
    from fastapi.testclient import TestClient

    # Keep the override signature parameterless so FastAPI does not attempt to
    # validate a stringified Request annotation under postponed evaluation.
    def _override_get_uow_factory():
        return uow_factory

    app.dependency_overrides[get_uow_factory] = _override_get_uow_factory
    app.state.uow_factory = uow_factory
    client = TestClient(app)
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_uow_factory, None)
        app.state.uow_factory = None
        client.close()

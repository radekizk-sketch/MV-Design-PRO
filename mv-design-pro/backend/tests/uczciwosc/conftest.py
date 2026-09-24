"""Wspólne przygotowanie testów uczciwości natychmiastowej (ocena niewykonana).

Klient HTTP na tej samej aplikacji i fabryce jednostki pracy, co testy końcówek
w `tests/api/` — testy tego katalogu idą REALNĄ ścieżką użytkownika (końcówka →
serwis → widok), a nie wołaniem funkcji pomocniczych z pominięciem API.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from enm.canonical_analysis import reset_canonical_runs
from enm.store import reset_enm_store


@pytest.fixture()
def app_client(uow_factory: Any) -> Iterator[Any]:
    from api.dependencies import get_uow_factory
    from api.main import app
    from fastapi.testclient import TestClient

    def _override_get_uow_factory() -> Any:
        return uow_factory

    app.dependency_overrides[get_uow_factory] = _override_get_uow_factory
    app.state.uow_factory = uow_factory
    klient = TestClient(app)
    try:
        yield klient
    finally:
        app.dependency_overrides.pop(get_uow_factory, None)
        app.state.uow_factory = None
        klient.close()


@pytest.fixture(autouse=True)
def _czysty_rejestr_biegow() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()

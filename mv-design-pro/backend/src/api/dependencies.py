from __future__ import annotations

from collections.abc import Callable

from fastapi import Request
from infrastructure.persistence.unit_of_work import UnitOfWork


def get_uow_factory(request: Request) -> Callable[[], UnitOfWork]:
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        raise RuntimeError("UnitOfWork factory not configured")
    return uow_factory

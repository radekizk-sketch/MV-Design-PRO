"""Health endpoint — rozszerzony status z informacjami o bazie, silnikach i solwerach."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Request
from sqlalchemy import exc as sa_exc
from sqlalchemy import text

router = APIRouter(prefix="/api/health", tags=["health"])

logger = logging.getLogger("mv_design_pro.api.health")

#: Błędy BRAKU POŁĄCZENIA z bazą (karta #151): serwer niedostępny/odrzucił połączenie
#: (`OperationalError`), zerwany interfejs sterownika (`InterfaceError`), wyczerpana
#: pula połączeń (`TimeoutError` SQLAlchemy). To jedyna nazwana reakcja sondy — „baza
#: niedostępna" = `db_ok: false`. Każdy inny wyjątek (błąd programu) wybucha jako 500.
BLEDY_POLACZENIA_BAZY: tuple[type[Exception], ...] = (
    sa_exc.OperationalError,
    sa_exc.InterfaceError,
    sa_exc.TimeoutError,
)

_start_time = time.monotonic()

AVAILABLE_SOLVERS = [
    "sc_iec60909",
    "pf_newton",
    "pf_gauss_seidel",
    "pf_fast_decoupled",
]

APP_VERSION = "4.0.0"


@router.get("")
def health_check(request: Request) -> dict[str, Any]:
    """
    Rozszerzony health check.

    Zwraca:
    - status: ok / degraded
    - db_ok: czy baza danych jest dostępna
    - engine_ok: czy silniki obliczeniowe są gotowe
    - version: wersja aplikacji
    - solvers: lista dostępnych solwerów
    - uptime_seconds: czas działania w sekundach
    """
    uptime = time.monotonic() - _start_time

    # Check DB connectivity
    db_ok = False
    engine = getattr(request.app.state, "engine", None)
    if engine is not None:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except BLEDY_POLACZENIA_BAZY as exc:
            logger.warning("Sonda zdrowia: baza niedostępna (%s): %s", type(exc).__name__, exc)

    # Engine check — solvery są częścią pakietu: ich import nie ma odmowy danych. Dawne
    # `except Exception` (a po zawężeniu `except ImportError`) meldowało „silniki
    # niegotowe" przy defekcie wydania; teraz taki defekt wybucha (500) — karta #151.
    from network_model.solvers import (  # noqa: F401
        PowerFlowNewtonSolver,
        ShortCircuitIEC60909Solver,
    )

    engine_ok = True

    overall_status = "ok" if db_ok and engine_ok else "degraded"

    return {
        "status": overall_status,
        "db_ok": db_ok,
        "engine_ok": engine_ok,
        "version": APP_VERSION,
        "solvers": AVAILABLE_SOLVERS,
        "uptime_seconds": round(uptime, 1),
    }

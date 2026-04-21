"""Health endpoint — rozszerzony status z informacjami o bazie, silnikach i solwerach."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/health", tags=["health"])

_start_time = time.monotonic()

AVAILABLE_SOLVERS = [
    "sc_iec60909",
    "pf_newton",
    "pf_gauss_seidel",
    "pf_fast_decoupled",
]

APP_VERSION = "4.0.0"


@router.get("")
async def health_check(request: Request) -> dict[str, Any]:
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
    try:
        engine = getattr(request.app.state, "engine", None)
        if engine is not None:
            from sqlalchemy import text

            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass

    # Engine check — verify solver imports
    engine_ok = False
    try:
        from network_model.solvers import (  # noqa: F401
            PowerFlowNewtonSolver,
            ShortCircuitIEC60909Solver,
        )

        engine_ok = True
    except Exception:
        pass

    overall_status = "ok" if db_ok and engine_ok else "degraded"

    return {
        "status": overall_status,
        "db_ok": db_ok,
        "engine_ok": engine_ok,
        "version": APP_VERSION,
        "solvers": AVAILABLE_SOLVERS,
        "uptime_seconds": round(uptime, 1),
    }

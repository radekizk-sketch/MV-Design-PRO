"""Zero-Error Harness: global exception handlers for structured error responses."""

from __future__ import annotations

import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from network_model.brak_zasobu import BrakZasobuError
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana

logger = logging.getLogger("mv_design_pro")


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the app."""

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
        logger.error(
            "Unhandled exception rid=%s path=%s: %s\n%s",
            request_id,
            request.url.path,
            str(exc),
            "".join(tb),
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Wewnętrzny błąd serwera",
                "request_id": request_id,
                "error_type": type(exc).__name__,
            },
            headers={"X-Request-Id": request_id},
        )

    # Karta ODMOWA-DANYCH-422: 422 daje WYŁĄCZNIE nazwana odmowa `OdmowaDanychError` (reguła
    # modelu, walidacja wejścia, brak danych projektowych). Dawny handler `ValueError` → 422
    # przebierał KAŻDY `ValueError` — także błąd programu (uszkodzona fikstura, zły indeks,
    # niezmiennik kontraktu) — za „błąd danych", z ostrzeżeniem bez śladu w dzienniku. Zwykły
    # `ValueError` idzie teraz do handlera `Exception` wyżej: 500 i pełny ślad.
    @app.exception_handler(OdmowaDanychError)
    async def value_error_handler(request: Request, exc: OdmowaDanychError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.warning(
            "OdmowaDanychError rid=%s path=%s: %s",
            request_id,
            request.url.path,
            str(exc),
        )
        content: dict[str, object] = {
            "detail": str(exc),
            "request_id": request_id,
            "error_type": "ValueError",
        }
        # Karty W10-2a / OD-17a: odmowa nazwana niesie kod maszynowy w POLU (nie w zdaniu)
        # i dane strukturalne — addytywnie obok `detail`.
        if isinstance(exc, OdmowaNazwana):
            content["kod"] = exc.kod
            content["dane"] = dict(exc.dane)
        return JSONResponse(
            status_code=422,
            content=content,
            headers={"X-Request-Id": request_id},
        )

    # Karta #151: 404 daje WYŁĄCZNIE nazwana odmowa `BrakZasobuError` (jawne wyszukanie
    # po identyfikatorze bez wyniku). Dawny handler `KeyError` → 404 przebierał KAŻDY
    # `KeyError` — także odczyt słownika w kodzie, czyli błąd programu — za „nie znaleziono
    # zasobu", z ostrzeżeniem bez śladu w dzienniku. Zwykły `KeyError` idzie teraz do
    # handlera `Exception` wyżej: 500 i pełny ślad.
    @app.exception_handler(BrakZasobuError)
    async def key_error_handler(request: Request, exc: BrakZasobuError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.warning(
            "BrakZasobuError rid=%s path=%s: %s",
            request_id,
            request.url.path,
            str(exc),
        )
        return JSONResponse(
            status_code=404,
            content={
                "detail": f"Nie znaleziono zasobu: {exc}",
                "request_id": request_id,
                "error_type": "KeyError",
            },
            headers={"X-Request-Id": request_id},
        )

"""Zero-Error Harness: global exception handlers for structured error responses."""

from __future__ import annotations

import logging
import traceback

from api.odmowa_http import OdmowaHttpError, pola_odmowy
from enm.slownik_komunikatow import opis_pozycji_walidacji
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from network_model.brak_zasobu import BrakZasobuError
from network_model.odmowa_danych import OdmowaDanychError

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

    # Błąd walidacji żądania (ciało, zapytanie, ścieżka) — domyślny handler FastAPI oddawał
    # w `detail[].msg` angielski opis biblioteki pydantic („Field required", „Input should be
    # a valid number") i echo wejścia z kontekstem biblioteki. Treść idzie teraz z jednego
    # mapowania komunikatów (`enm.slownik_komunikatow.opis_pozycji_walidacji`); kształt pozycji
    # zgodny ze schematem `HTTPValidationError` OpenAPI (`loc`, `msg`, `type` — `loc` i `type`
    # to klucze maszynowe dla klienta, nie treść dla projektanta).
    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        pozycje = [
            {
                "type": str(pozycja.get("type") or ""),
                "loc": list(pozycja.get("loc", ())),
                "msg": opis_pozycji_walidacji(pozycja),
            }
            for pozycja in exc.errors()
        ]
        logger.warning(
            "RequestValidationError rid=%s path=%s: %s",
            request_id,
            request.url.path,
            [(p["loc"], p["type"]) for p in pozycje],
        )
        return JSONResponse(
            status_code=422,
            content={
                "detail": pozycje,
                "request_id": request_id,
                "error_type": "RequestValidationError",
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
        # Karty W10-2a / OD-17a, partia integracji 10: pola strukturalne odmowy (`kod`,
        # `dane`, `rekordy`) addytywnie obok `detail` — jedna funkcja dla obu dróg odmowy.
        content.update(pola_odmowy(exc))
        return JSONResponse(
            status_code=422,
            content=content,
            headers={"X-Request-Id": request_id},
        )

    # Partia integracji 10: odmowa danych ze statusem innym niż 422 (409, 404, 400, 503)
    # albo z prefiksem zdania — to samo ciało co wyżej, status z kontraktu routera.
    @app.exception_handler(OdmowaHttpError)
    async def odmowa_http_handler(request: Request, exc: OdmowaHttpError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.warning(
            "OdmowaHttpError rid=%s path=%s status=%s: %s",
            request_id,
            request.url.path,
            exc.status_code,
            exc.detail,
        )
        content: dict[str, object] = {
            "detail": exc.detail,
            "request_id": request_id,
            "error_type": "ValueError",
        }
        content.update(pola_odmowy(exc.odmowa))
        return JSONResponse(
            status_code=exc.status_code,
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

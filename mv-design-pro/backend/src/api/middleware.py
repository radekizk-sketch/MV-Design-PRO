"""Zero-Error Harness: request-id middleware + structured error logging."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("mv_design_pro")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Adds X-Request-Id header to every request/response for error correlation."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:  # type: ignore[type-arg]
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.monotonic()
        response: Response = await call_next(request)
        elapsed_ms = round((time.monotonic() - start) * 1000, 1)

        response.headers["X-Request-Id"] = request_id

        status = response.status_code
        method = request.method
        path = request.url.path

        if status >= 500:
            logger.error(
                "HTTP %s %s %s -> %d (%.1fms) rid=%s",
                method,
                path,
                request.url.query,
                status,
                elapsed_ms,
                request_id,
            )
        elif status >= 400:
            logger.warning(
                "HTTP %s %s %s -> %d (%.1fms) rid=%s",
                method,
                path,
                request.url.query,
                status,
                elapsed_ms,
                request_id,
            )
        else:
            logger.info(
                "HTTP %s %s -> %d (%.1fms) rid=%s",
                method,
                path,
                status,
                elapsed_ms,
                request_id,
            )

        return response

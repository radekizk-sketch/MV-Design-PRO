from __future__ import annotations

from pathlib import Path

import api_lifecycle_guard as guard


def write_doc(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_guard_reports_active_api_route_missing_from_matrix(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `GET /api/health` | v12xx | aktywny | 2026-04-24 | - | Healthcheck API. | health tests | Architekt API |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(
        guard,
        "discover_active_api_routes",
        lambda: [
            guard.RouteContract(
                method="GET",
                path="/api/health",
                source="backend/src/api/health.py:24",
            ),
            guard.RouteContract(
                method="POST",
                path="/api/cases/{case_id}/runs/short-circuit",
                source="backend/src/api/enm.py:498",
            ),
        ],
    )

    violations = guard.check_api_lifecycle_matrix()

    assert any("[api-lifecycle-missing]" in violation for violation in violations)
    assert any(
        "POST /api/cases/{case_id}/runs/short-circuit" in violation for violation in violations
    )


def test_guard_accepts_complete_active_and_adapter_rows(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `GET /api/health` | v12xx | aktywny | 2026-04-24 | - | Healthcheck API. | health tests | Architekt API |
| `GET /api/cases/{case_id}/enm/v2-projection` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Read-only projection. | projection tests | Architekt migracji |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(
        guard,
        "discover_active_api_routes",
        lambda: [
            guard.RouteContract(
                method="GET",
                path="/api/health",
                source="backend/src/api/health.py:24",
            ),
            guard.RouteContract(
                method="GET",
                path="/api/cases/{case_id}/enm/v2-projection",
                source="backend/src/api/enm.py:91",
            ),
        ],
    )

    assert guard.check_api_lifecycle_matrix() == []


def test_guard_requires_shutdown_date_for_adapter(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `GET /api/cases/{case_id}/enm/v2-projection` | v12xx.m1 | adapter | 2026-04-24 | - | Read-only projection. | projection tests | Architekt migracji |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(
        guard,
        "discover_active_api_routes",
        lambda: [
            guard.RouteContract(
                method="GET",
                path="/api/cases/{case_id}/enm/v2-projection",
                source="backend/src/api/enm.py:91",
            )
        ],
    )

    violations = guard.check_api_lifecycle_matrix()

    assert any("[api-lifecycle-shutdown-date]" in violation for violation in violations)


def test_guard_reports_active_matrix_row_without_route(tmp_path, monkeypatch) -> None:
    """Wiersz „aktywny" bez trasy w aplikacji = widmo (kierunek odwrotny); „usuniety" — nie."""
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `GET /api/health` | v12xx | aktywny | 2026-04-24 | - | Healthcheck API. | health tests | Architekt API |
| `GET /api/widmo` | v12xx | aktywny | 2026-04-24 | - | Trasa skasowana. | - | Architekt API |
| `GET /api/stare` | v12xx | usuniety | 2026-04-24 | 2026-09-01 | Skasowana. | - | Architekt API |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(
        guard,
        "discover_active_api_routes",
        lambda: [
            guard.RouteContract(
                method="GET", path="/api/health", source="backend/src/api/health.py:24"
            )
        ],
    )

    violations = guard.check_api_lifecycle_matrix()

    widma = [v for v in violations if "[api-lifecycle-ghost-row]" in v]
    assert len(widma) == 1 and "GET /api/widmo" in widma[0]

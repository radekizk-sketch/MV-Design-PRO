from __future__ import annotations

import pytest

import route_prefix_guard as guard


@pytest.mark.parametrize("templated", [False, True], ids=["statyczna", "szablon"])
@pytest.mark.parametrize("served", [False, True], ids=["nieserwowana", "serwowana"])
@pytest.mark.parametrize("client_exists", [False, True], ids=["bez-klienta", "z-klientem"])
def test_iloczyn_rodzina_klient_skladnia(templated, served, client_exists) -> None:
    family = "projekty"
    suffix = "/${projectId}" if templated else "/lista"
    routes = (
        [guard.ClientRoute(family, f"frontend/src/api.ts:1 ({suffix})")] if client_exists else []
    )
    backend = [f"/api/{family}/{{project_id}}"] if served else ["/api/zdrowie"]

    violations = guard.check_route_prefixes(routes, backend)

    if not client_exists:
        assert violations == ["[empty-client-scan] skan frontendu nie znalazł żadnej trasy /api/"]
    elif served:
        assert violations == []
    else:
        assert violations == [
            f"[unserved-client-family] /api/{family}: frontend/src/api.ts:1 ({suffix})"
        ]


def test_odkrywa_sciezke_statyczna_i_szablonowa(tmp_path) -> None:
    (tmp_path / "api.ts").write_text(
        "fetch('/api/statyczna/lista');\nfetch(`/api/szablonowa/${id}`);\n",
        encoding="utf-8",
    )
    assert {route.family for route in guard.discover_client_routes(tmp_path)} == {
        "statyczna",
        "szablonowa",
    }


def test_odkrywa_sciezke_skladana_z_api_base(tmp_path) -> None:
    (tmp_path / "api.ts").write_text(
        "const API_BASE = '/api';\nfetch(`${API_BASE}/porownania/${id}`);\n",
        encoding="utf-8",
    )
    assert [route.family for route in guard.discover_client_routes(tmp_path)] == ["porownania"]


def test_pusty_skan_backendu_jest_bledem() -> None:
    assert guard.check_route_prefixes([guard.ClientRoute("x", "api.ts:1")], []) == [
        "[empty-backend-scan] skan backendu nie znalazł żadnej aktywnej trasy /api/"
    ]

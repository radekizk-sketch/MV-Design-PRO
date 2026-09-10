from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "ncrfg-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_ncrfg_catalog_endpoint_exposes_ptpiree_test_pack(client: TestClient) -> None:
    response = client.get("/api/ncrfg-tests/catalog")

    assert response.status_code == 200
    payload = response.json()
    assert payload["procedure_version"] == "PTPiREE Procedura testowania v3.0"
    assert len(payload["tests"]) == 20
    assert any(item["operator_id"] == "enea" for item in payload["operators"])


def test_ncrfg_catalog_endpoint_niesie_krzywe_lvrt_hvrt_per_operator(
    client: TestClient,
) -> None:
    """Karta FAB-J: front nie ma już własnej kopii krzywych LVRT/HVRT — musi
    je dostać stąd, jako jawne listy punktów (czas, U/Un), z każdego profilu.
    """
    response = client.get("/api/ncrfg-tests/catalog")
    assert response.status_code == 200
    payload = response.json()

    for operator in payload["operators"]:
        ride_through = operator["ride_through"]
        assert ride_through["lvrt"], f"{operator['operator_id']}: brak punktów LVRT"
        assert ride_through["hvrt"], f"{operator['operator_id']}: brak punktów HVRT"
        for punkt in [*ride_through["lvrt"], *ride_through["hvrt"]]:
            assert "time_s" in punkt
            assert "voltage_pu" in punkt


class TestKlasyfikacjaModuluEndpoint:
    """`GET /api/ncrfg-tests/modul` — karta FAB-J: jedyne źródło klasyfikacji.

    Naprawa 2026-09-05 (odbiór FAB-J): `modul_nc_rfg` deleguje do
    `NcRfgProfile.classify_module` (profil YAML solvera PTPiREE) zamiast
    własnej tabeli progów URE — granice A/B i B/C przesunęły się na 1 000 kW
    i 50 000 kW (patrz `compliance/nc_rfg_modul.py` dla pełnej rozbieżności).
    """

    def test_moc_200_kw_daje_modul_a(self, client: TestClient) -> None:
        response = client.get(
            "/api/ncrfg-tests/modul", params={"p_max_mw": 0.2, "napiecie_kv": 0.4}
        )
        assert response.status_code == 200
        assert response.json() == {"modul": "A"}

    def test_moc_ponizej_1_mw_daje_modul_a(self, client: TestClient) -> None:
        response = client.get(
            "/api/ncrfg-tests/modul", params={"p_max_mw": 0.05, "napiecie_kv": 0.4}
        )
        assert response.json() == {"modul": "A"}

    def test_moc_1_2_mw_daje_modul_b(self, client: TestClient) -> None:
        response = client.get(
            "/api/ncrfg-tests/modul", params={"p_max_mw": 1.2, "napiecie_kv": 15.0}
        )
        assert response.json() == {"modul": "B"}

    def test_napiecie_powyzej_110_kv_daje_modul_d_niezaleznie_od_mocy(
        self, client: TestClient
    ) -> None:
        """`voltage_kv_max: 110` w profilu YAML wyklucza z A/B/C tylko napięcie
        ŚCIŚLE większe niż 110 kV (warunek `voltage_kv > mt.voltage_kv_max`) —
        dokładnie 110,0 kV NADAL dopasowuje kategorię wg mocy (patrz
        `test_napiecie_dokladnie_110_kv_nie_wymusza_modulu_d` niżej)."""
        response = client.get(
            "/api/ncrfg-tests/modul", params={"p_max_mw": 0.001, "napiecie_kv": 110.1}
        )
        assert response.json() == {"modul": "D"}

    def test_napiecie_dokladnie_110_kv_nie_wymusza_modulu_d(self, client: TestClient) -> None:
        response = client.get(
            "/api/ncrfg-tests/modul", params={"p_max_mw": 0.001, "napiecie_kv": 110.0}
        )
        assert response.json() == {"modul": "A"}

    def test_moc_75_mw_daje_modul_d(self, client: TestClient) -> None:
        response = client.get(
            "/api/ncrfg-tests/modul", params={"p_max_mw": 75.0, "napiecie_kv": 15.0}
        )
        assert response.json() == {"modul": "D"}


def test_ncrfg_run_endpoint_returns_trace_and_hash(client: TestClient) -> None:
    response = client.post(
        "/api/ncrfg-tests/run",
        json={
            "modules": [
                {
                    "der_ref": "pv-1",
                    "der_name": "PV 2 MW",
                    "der_kind": "PV",
                    "operator_id": "enea",
                    "p_max_kw": 2000,
                    "p_min_kw": 100,
                    "voltage_kv": 15,
                    "certificate_status": "ptpiree_verified",
                    "has_lvrt_curve": True,
                    "has_hvrt_curve": True,
                    "has_pf_droop": True,
                    "has_qu_curve": True,
                    "has_dynamic_model": True,
                    "has_scada_communication": True,
                    "has_disturbance_recorder": True,
                    "active_power_control_enabled": True,
                    "droop_percent": 5,
                    "dead_band_hz": 0.2,
                    "ramp_rate_pct_per_min": 10,
                    "cos_phi_min": 0.95,
                    "q_range_pct_pn_min": -0.33,
                    "q_range_pct_pn_max": 0.33,
                    "reactive_current_gain": 2,
                    "p_recovery_time_s": 0.8,
                    "harmonic_thdu_percent": 3,
                }
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["contract"] == "NcRfgPtpireeTestResultV1"
    assert payload["deterministic_hash"]
    assert payload["modules"][0]["module_type"] == "B"
    assert payload["white_box_trace"]
    assert payload["report_pl"].startswith("Raport symulacyjny NC RfG / PTPiREE")

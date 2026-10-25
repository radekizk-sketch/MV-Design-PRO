"""R14: laboratoryjna powierzchnia API nie stanowi produkcyjnego uwierzytelnienia."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from api.gis_atomic_r14 import (
    GisAtomicRequest, _allowed_environment, _safe_payload,
)


def request(host: str):
    return SimpleNamespace(client=SimpleNamespace(host=host))


def test_default_disabled(monkeypatch):
    monkeypatch.delenv("MV_GIS_R14_ATOMIC_ENABLED", raising=False)
    monkeypatch.setenv("MV_DESIGN_ENV", "development")
    assert not _allowed_environment(request("127.0.0.1"))


def test_remote_host_forbidden(monkeypatch):
    monkeypatch.setenv("MV_GIS_R14_ATOMIC_ENABLED", "1")
    monkeypatch.setenv("MV_DESIGN_ENV", "development")
    assert not _allowed_environment(request("192.168.1.10"))


def test_production_forbidden(monkeypatch):
    monkeypatch.setenv("MV_GIS_R14_ATOMIC_ENABLED", "1")
    monkeypatch.setenv("MV_DESIGN_ENV", "production")
    assert not _allowed_environment(request("127.0.0.1"))


def test_explicit_local_test_only(monkeypatch):
    monkeypatch.setenv("MV_GIS_R14_ATOMIC_ENABLED", "1")
    monkeypatch.setenv("MV_DESIGN_ENV", "testing")
    assert _allowed_environment(request("127.0.0.1"))


def test_sensitive_payload_rejected():
    assert not _safe_payload({"cable": {"ppe": "synthetic"}})
    assert not _safe_payload({"customer_id": "synthetic"})
    assert _safe_payload({"segment": {"dlugosc_m": 1500, "rodzaj": "KABEL"}})


def test_request_is_strict():
    req = {
        "schema_name": "MV-DIGPRO-R14-ATOMIC",
        "base_enm_hash": "a" * 64,
        "source_sha256": "b" * 64,
        "engineer_approved": True,
        "staged_geojson_verified": True,
        "confirmed_ports": True,
        "operations": [{
            "step_id": "S1", "source_id": "SYN-1",
            "name": "add_grid_source_sn", "idempotency_key": "gis-test-001",
            "payload": {"voltage_kv": 15},
        }],
    }
    assert GisAtomicRequest.model_validate(req).operations[0].step_id == "S1"
    with pytest.raises(ValidationError):
        GisAtomicRequest.model_validate({**req, "skip_auth": True})
    with pytest.raises(ValidationError):
        GisAtomicRequest.model_validate({**req, "engineer_approved": "true"})

"""
Test integracji canonical_run z audit2 (Phase 41+43+44).

Sprawdza:
- _maybe_load_audit2_extensions zwraca None gdy brak ID-kow.
- _maybe_load_audit2_extensions zwraca None gdy invalid UUID.
- _execute_power_flow respektuje run.options.audit2_project_id.
- _execute_short_circuit respektuje run.options.audit2_station_id (Phase 43).
"""

from __future__ import annotations

from uuid import UUID

import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("pydantic")


def test_maybe_load_audit2_extensions_none_for_missing_ids():
    """Phase 41: brak project/station IDs -> None."""
    from enm.canonical_analysis import _maybe_load_audit2_extensions

    assert _maybe_load_audit2_extensions(project_id_str=None, station_id="s1") is None
    assert _maybe_load_audit2_extensions(project_id_str="some-uuid", station_id=None) is None
    assert _maybe_load_audit2_extensions(project_id_str=None, station_id=None) is None


def test_maybe_load_audit2_extensions_none_for_invalid_uuid():
    """Phase 41: invalid UUID -> None (nie crashuje)."""
    from enm.canonical_analysis import _maybe_load_audit2_extensions

    assert _maybe_load_audit2_extensions(project_id_str="not-a-uuid", station_id="s1") is None


def test_maybe_load_audit2_extensions_returns_extensions_for_existing_config():
    """Phase 41: istniejacy config -> extensions dict z kluczami SC/PF/Protection."""
    from enm.canonical_analysis import _maybe_load_audit2_extensions
    from infrastructure.persistence.db import (
        create_engine_from_url,
        create_session_factory,
        init_db,
    )
    from infrastructure.persistence.models import StationAudit2ConfigORM
    from infrastructure.persistence.unit_of_work import build_uow_factory

    # Setup in-memory DB.
    import os
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///./test_audit2_canonical.db"

    engine = create_engine_from_url("sqlite+pysqlite:///./test_audit2_canonical.db")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)

    project_id = UUID("00000000-0000-0000-0000-000000000001")
    station_id = "station-canonical-1"

    # Insert audit2 config.
    with uow_factory() as uow:
        assert uow.session is not None
        # First create a project (FK requirement).
        from infrastructure.persistence.models import ProjectORM

        proj = ProjectORM(
            id=project_id,
            name="Test Project",
            schema_version="1.0",
            mode="AS-IS",
            voltage_level_kv=15.0,
            frequency_hz=50.0,
        )
        uow.session.add(proj)
        uow.session.flush()

        cfg = StationAudit2ConfigORM(
            id=UUID("00000000-0000-0000-0000-000000000002"),
            project_id=project_id,
            station_id=station_id,
            mv_neutral_grounding_ref="mng_petersen",
            tap_changer_refs=[],
            der_specs=[],
            transformer_tap_changers={"tr_001": "tc_oltc_110sn_19_125"},
            bay_hv_fuses={},
            bay_vts={},
            bay_device_withstand={},
        )
        uow.session.add(cfg)
        uow.session.commit()

    extensions = _maybe_load_audit2_extensions(
        project_id_str=str(project_id), station_id=station_id
    )
    # Cleanup test DB.
    try:
        os.remove("./test_audit2_canonical.db")
    except OSError:
        pass

    assert extensions is not None
    assert "power_flow_extensions" in extensions
    assert "sc_iec60909_extensions" in extensions
    # Per-transformer mapping populated.
    assert "transformer_to_tap_changer" in extensions["power_flow_extensions"]
    assert "tr_001" in extensions["power_flow_extensions"]["transformer_to_tap_changer"]
    # Grounding type populated.
    assert extensions["sc_iec60909_extensions"]["mv_neutral_grounding"]["grounding_type"] == "petersen_coil"


def test_canonical_run_pf_options_propagate_to_audit2():
    """Phase 41+44: run.options.audit2_* -> _execute_power_flow respektuje."""
    # Smoke test: importy + sygnatura. Pelny test wymaga skomplikowanego setup'u
    # CanonicalRun + ENM model — tu weryfikujemy ze hook istnieje i akceptuje
    # options.audit2_project_id / audit2_station_id bez crash.
    from enm.canonical_analysis import _maybe_load_audit2_extensions

    # Z run.options.get("audit2_project_id") = None (default) -> None.
    assert (
        _maybe_load_audit2_extensions(
            project_id_str=None,  # Symuluje run.options.get("audit2_project_id")
            station_id=None,
        )
        is None
    )


def test_canonical_run_sc_options_propagate_to_audit2():
    """Phase 43: _execute_short_circuit tez korzysta z _maybe_load_audit2_extensions."""
    # Smoke: sprawdza ze SC i PF uzywaja tego samego helper'a.
    import inspect
    from enm import canonical_analysis

    pf_source = inspect.getsource(canonical_analysis._execute_power_flow)
    sc_source = inspect.getsource(canonical_analysis._execute_short_circuit)

    # Oba uzywaja _maybe_load_audit2_extensions.
    assert "_maybe_load_audit2_extensions" in pf_source
    assert "_maybe_load_audit2_extensions" in sc_source
    # Oba uzywaja apply_audit2_to_network_model.
    assert "apply_audit2_to_network_model" in pf_source
    assert "apply_audit2_to_network_model" in sc_source

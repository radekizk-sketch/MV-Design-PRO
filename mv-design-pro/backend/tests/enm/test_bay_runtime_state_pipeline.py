"""Phase 0B-1: BayRuntimeState telemetry pipeline end-to-end.

Sprawdza:
  1. Bay ENM model akceptuje opcjonalne `runtime_state: BayRuntimeState | None`.
  2. Serializacja i deserializacja Bay z runtime_state przez Pydantic.
  3. Bay z runtime_state w EnergyNetworkModel — round-trip JSON.
  4. Brak runtime_state (default None) — back-compat dla legacy ENM.
  5. primary_device_states z konwencją kluczy `apparatus_<kind>_<q-designation>`.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from enm.models import (
    Bay,
    BayEnergizationSafetyState,
    BayRuntimeState,
    BaySwitchState,
    EnergyNetworkModel,
)


def _make_runtime_state() -> BayRuntimeState:
    """Buduje runtime_state z 3 aparatami (CB+DS+ES) — kanon polskiego pola."""
    return BayRuntimeState(
        secondary_communication_status="ok",
        last_good_update_at=datetime(2026, 5, 7, 12, 0, 0, tzinfo=UTC),
        control_availability="dostepne",
        measurement_availability="dostepne",
        primary_device_states={
            "apparatus_cb_q0": BaySwitchState(
                actual_state="zamkniety",
                commanded_state=None,
                control_mode="zdalne",
                armed_for_close=True,
                armed_for_open=True,
                communication_ok=True,
                interlock_blocked=False,
            ),
            "apparatus_ds_lin_q9": BaySwitchState(
                actual_state="otwarty",
                commanded_state=None,
                control_mode="zdalne",
                communication_ok=True,
                interlock_blocked=False,
            ),
            "apparatus_es_q8": BaySwitchState(
                actual_state="otwarty",
                commanded_state=None,
                control_mode="zdalne",
                communication_ok=True,
                interlock_blocked=False,
            ),
        },
        active_alarms=[],
        pending_command=None,
        energization_and_safety=BayEnergizationSafetyState(
            energized_from_bus_side=True,
            energized_from_feeder_side=False,
            grounded=False,
            visible_isolation_gap=False,
            safe_to_work=False,
        ),
    )


def test_bay_default_runtime_state_is_none() -> None:
    """Bay bez runtime_state — back-compat (default = None)."""
    bay = Bay(
        ref_id="bay-1",
        name="Pole 1",
        bay_role="OUT",
        substation_ref="gpz-1",
        bus_ref="bus-1",
    )
    assert bay.runtime_state is None


def test_bay_accepts_runtime_state() -> None:
    """Bay przyjmuje BayRuntimeState i zachowuje wszystkie subpola."""
    rt = _make_runtime_state()
    bay = Bay(
        ref_id="bay-1",
        name="Pole 1",
        bay_role="OUT",
        substation_ref="gpz-1",
        bus_ref="bus-1",
        runtime_state=rt,
    )
    assert bay.runtime_state is not None
    assert bay.runtime_state.secondary_communication_status == "ok"
    assert "apparatus_cb_q0" in bay.runtime_state.primary_device_states
    cb = bay.runtime_state.primary_device_states["apparatus_cb_q0"]
    assert cb.actual_state == "zamkniety"
    assert cb.control_mode == "zdalne"
    assert cb.communication_ok is True


def test_bay_runtime_state_round_trip_json() -> None:
    """Bay z runtime_state → JSON → Bay (równość po round-trip)."""
    rt = _make_runtime_state()
    bay = Bay(
        ref_id="bay-1",
        name="Pole 1",
        bay_role="OUT",
        substation_ref="gpz-1",
        bus_ref="bus-1",
        runtime_state=rt,
    )
    payload = bay.model_dump_json()
    raw = json.loads(payload)
    assert (
        raw["runtime_state"]["primary_device_states"]["apparatus_cb_q0"]["actual_state"]
        == "zamkniety"
    )
    restored = Bay.model_validate(raw)
    assert restored.runtime_state is not None
    assert (
        restored.runtime_state.primary_device_states["apparatus_cb_q0"].actual_state == "zamkniety"
    )
    assert (
        restored.runtime_state.primary_device_states["apparatus_ds_lin_q9"].actual_state
        == "otwarty"
    )


def test_enm_with_bay_runtime_state_round_trip() -> None:
    """Pełen ENM z Bay z runtime_state → JSON → ENM (telemetry zachowana)."""
    rt = _make_runtime_state()
    bay = Bay(
        ref_id="bay-1",
        name="Pole 1",
        bay_role="OUT",
        substation_ref="gpz-1",
        bus_ref="bus-1",
        runtime_state=rt,
    )
    enm = EnergyNetworkModel(
        header={
            "enm_version": "1.0",
            "name": "test",
            "created_at": "2026-05-07T00:00:00Z",
            "updated_at": "2026-05-07T00:00:00Z",
            "revision": 1,
            "hash_sha256": "a" * 64,
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
        },
        bays=[bay],
    )
    raw = json.loads(enm.model_dump_json())
    assert (
        raw["bays"][0]["runtime_state"]["primary_device_states"]["apparatus_cb_q0"]["actual_state"]
        == "zamkniety"
    )

    restored = EnergyNetworkModel.model_validate(raw)
    assert len(restored.bays) == 1
    assert restored.bays[0].runtime_state is not None
    assert (
        restored.bays[0].runtime_state.primary_device_states["apparatus_cb_q0"].actual_state
        == "zamkniety"
    )


def test_bay_runtime_state_legacy_enm_back_compat() -> None:
    """Legacy ENM bez `runtime_state` w Bay — round-trip nadal działa."""
    legacy_payload = {
        "ref_id": "bay-1",
        "name": "Pole 1",
        "tags": [],
        "meta": {},
        "bay_role": "OUT",
        "substation_ref": "gpz-1",
        "bus_ref": "bus-1",
        "equipment_refs": [],
    }
    bay = Bay.model_validate(legacy_payload)
    assert bay.runtime_state is None


def test_bay_runtime_state_actual_state_enum_values() -> None:
    """BaySwitchState.actual_state akceptuje wszystkie warianty Literal."""
    states = [
        "zamkniety",
        "otwarty",
        "zamkniety_naped_rozbrojony",
        "otwarty_naped_rozbrojony",
        "nieznany",
        "awaria",
    ]
    for state in states:
        sw = BaySwitchState(
            actual_state=state,  # type: ignore[arg-type]
            control_mode="zdalne",
            communication_ok=True,
            interlock_blocked=False,
        )
        assert sw.actual_state == state

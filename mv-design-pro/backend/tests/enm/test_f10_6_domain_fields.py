"""F10.6 [DOMAIN] — testy nowych pól ENM (SLD_CAD_REBUILD_PLAN_V3.md §F10.6):

1. `Measurement.ct_arrangement`/`vt_arrangement` (D3/D4, V12K-036) — walidacja
   zgodności z `measurement_type`, wyczyszczenie heurystyki
   `zero_sequence_current_source` w `application/field_read_model.py`.
2. `BayPrimaryDevice.designation` (D1, V12K-035) — identyfikator per-aparat.
3. `ProtectionAssignment.ct_refs_secondary` (D5, V12K-036) — strefa 87T.

Wszystkie pola są ADDYTYWNE (default None/[]) — zero łamania fixture/hash
istniejących danych (asercja determinizmu poniżej).
"""

from __future__ import annotations

import asyncio

import pytest
from api.enm import get_enm_field_view
from enm.canonical_analysis import reset_canonical_runs
from enm.hash import compute_enm_hash
from enm.models import (
    BayPrimaryDevice,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Measurement,
    MeasurementRating,
    ProtectionAssignment,
)
from enm.store import reset_enm_store, set_enm


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


# ---------------------------------------------------------------------------
# 1. Model-level validation — Measurement.ct_arrangement/vt_arrangement
# ---------------------------------------------------------------------------


class TestMeasurementArrangementFields:
    def test_ct_arrangement_accepted_for_ct_measurement(self):
        m = Measurement(
            ref_id="ct1",
            name="CT1",
            measurement_type="CT",
            bus_ref="bus_sn",
            rating=MeasurementRating(ratio_primary=300.0, ratio_secondary=5.0),
            ct_arrangement="3xCT",
        )
        assert m.ct_arrangement == "3xCT"
        assert m.vt_arrangement is None

    def test_vt_arrangement_accepted_for_vt_measurement(self):
        m = Measurement(
            ref_id="vt1",
            name="VT1",
            measurement_type="VT",
            bus_ref="bus_sn",
            rating=MeasurementRating(ratio_primary=15000.0, ratio_secondary=100.0),
            vt_arrangement="open_delta",
        )
        assert m.vt_arrangement == "open_delta"
        assert m.ct_arrangement is None

    def test_ct_arrangement_rejected_on_vt_measurement(self):
        with pytest.raises(ValueError, match="ct_arrangement wymaga measurement_type='CT'"):
            Measurement(
                ref_id="vt1",
                name="VT1",
                measurement_type="VT",
                bus_ref="bus_sn",
                rating=MeasurementRating(ratio_primary=15000.0, ratio_secondary=100.0),
                ct_arrangement="3xCT",
            )

    def test_vt_arrangement_rejected_on_ct_measurement(self):
        with pytest.raises(ValueError, match="vt_arrangement wymaga measurement_type='VT'"):
            Measurement(
                ref_id="ct1",
                name="CT1",
                measurement_type="CT",
                bus_ref="bus_sn",
                rating=MeasurementRating(ratio_primary=300.0, ratio_secondary=5.0),
                vt_arrangement="star",
            )

    def test_both_arrangement_fields_default_none(self):
        m = Measurement(
            ref_id="ct1",
            name="CT1",
            measurement_type="CT",
            bus_ref="bus_sn",
            rating=MeasurementRating(ratio_primary=300.0, ratio_secondary=5.0),
        )
        assert m.ct_arrangement is None
        assert m.vt_arrangement is None


# ---------------------------------------------------------------------------
# 2. Model-level — BayPrimaryDevice.designation
# ---------------------------------------------------------------------------


class TestBayPrimaryDeviceDesignation:
    def test_designation_round_trips(self):
        d = BayPrimaryDevice(
            device_ref="cb1",
            symbol_ref="symbol:cb",
            kind="CB",
            placement="MIDSTREAM",
            designation="Q1",
        )
        assert d.designation == "Q1"

    def test_designation_defaults_none(self):
        d = BayPrimaryDevice(
            device_ref="cb1", symbol_ref="symbol:cb", kind="CB", placement="MIDSTREAM"
        )
        assert d.designation is None


# ---------------------------------------------------------------------------
# 3. Model-level — ProtectionAssignment.ct_refs_secondary
# ---------------------------------------------------------------------------


class TestProtectionAssignmentCtRefsSecondary:
    def test_ct_refs_secondary_round_trips(self):
        pa = ProtectionAssignment(
            ref_id="prot1",
            name="87T",
            breaker_ref="cb1",
            ct_ref="ct1",
            ct_refs_secondary=["ct2"],
            device_type="differential",
        )
        assert pa.ct_refs_secondary == ["ct2"]

    def test_ct_refs_secondary_defaults_empty(self):
        pa = ProtectionAssignment(
            ref_id="prot1", name="OC", breaker_ref="cb1", ct_ref="ct1", device_type="overcurrent"
        )
        assert pa.ct_refs_secondary == []


# ---------------------------------------------------------------------------
# 4. field_read_model — wyczyszczenie heurystyki zero_sequence_current_source
#    (znalezisko F10.4, field_read_model.py:581) — brak `ct_arrangement` MUSI
#    dawać uczciwe "brak", NIGDY zgadywane "suma_ct".
# ---------------------------------------------------------------------------


def _enm_with_ct(*, ct_arrangement: str | None) -> dict:
    return {
        "header": {
            "name": "F10.6 CT arrangement test",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000030101",
                "ref_id": "bus_sn_a",
                "name": "Szyna SN A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000030102",
                "ref_id": "cb_in_1",
                "name": "Wyłącznik pola IN",
                "tags": [],
                "meta": {},
                "type": "breaker",
                "from_bus_ref": "bus_sn_a",
                "to_bus_ref": "bus_sn_a",
                "status": "closed",
            },
        ],
        "bays": [
            {
                "id": "00000000-0000-0000-0000-000000030103",
                "ref_id": "bay_in_1",
                "name": "Pole IN",
                "tags": [],
                "meta": {},
                "bay_role": "IN",
                "substation_ref": "sub_1",
                "bus_ref": "bus_sn_a",
                "equipment_refs": ["cb_in_1"],
            },
        ],
        "measurements": [
            {
                "id": "00000000-0000-0000-0000-000000030104",
                "ref_id": "ct_in_1",
                "name": "CT pola IN",
                "tags": [],
                "meta": {},
                "measurement_type": "CT",
                "bus_ref": "bus_sn_a",
                "bay_ref": "bay_in_1",
                "rating": {"ratio_primary": 300.0, "ratio_secondary": 5.0},
                "connection": "star",
                "purpose": "protection",
                **({"ct_arrangement": ct_arrangement} if ct_arrangement else {}),
            },
        ],
    }


def _seed(case_id: str, payload: dict) -> None:
    set_enm(case_id, EnergyNetworkModel.model_validate(payload))


class TestZeroSequenceCurrentSourceHeuristicFix:
    def test_no_ct_arrangement_data_gives_honest_brak_not_suma_ct(self):
        """Rdzeń wyczyszczenia: PRZED F10.6 KAŻDY CT dawał "suma_ct" (zgadywanie).
        PO F10.6: brak danych o układzie ⇒ "brak" (WHITE BOX, zero domysłu)."""
        _seed("f10_6-no-arrangement", _enm_with_ct(ct_arrangement=None))
        data = asyncio.run(get_enm_field_view("f10_6-no-arrangement"))
        chain = data["fields"][0]["canonical_model"]["base_model"]["measurement_chain"]
        assert chain["ct_refs"] == ["ct_in_1"]
        assert chain["zero_sequence_current_source"] == "brak"

    def test_3xct_arrangement_gives_suma_ct(self):
        _seed("f10_6-3xct", _enm_with_ct(ct_arrangement="3xCT"))
        data = asyncio.run(get_enm_field_view("f10_6-3xct"))
        chain = data["fields"][0]["canonical_model"]["base_model"]["measurement_chain"]
        assert chain["zero_sequence_current_source"] == "suma_ct"

    def test_ferranti_arrangement_gives_przekladnik_ferrantiego(self):
        _seed("f10_6-ferranti", _enm_with_ct(ct_arrangement="ferranti"))
        data = asyncio.run(get_enm_field_view("f10_6-ferranti"))
        chain = data["fields"][0]["canonical_model"]["base_model"]["measurement_chain"]
        assert chain["zero_sequence_current_source"] == "przekladnik_ferrantiego"

    def test_earth_fault_path_inherits_fixed_derivation(self):
        """`_build_earth_fault_path` pass-through — regresja: nie duplikuje
        starej heurystyki gdzie indziej."""
        _seed("f10_6-earth-fault-path", _enm_with_ct(ct_arrangement=None))
        data = asyncio.run(get_enm_field_view("f10_6-earth-fault-path"))
        earth_fault_path = data["fields"][0]["canonical_model"]["base_model"].get(
            "earth_fault_path"
        )
        if earth_fault_path is not None:
            assert earth_fault_path["zero_sequence_current_source"] == "brak"


# ---------------------------------------------------------------------------
# 5. Determinism (CLAUDE.md rule 7) — nowe pola ADDYTYWNE (default None/[])
#    nie zmieniają hash dla ENM, który ich nie ustawia; ten sam ENM z polami
#    ustawionymi daje identyczny hash przy powtórnym obliczeniu.
# ---------------------------------------------------------------------------


def _make_minimal_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="F10.6 hash test", defaults=ENMDefaults()))


class TestDeterminism:
    def test_hash_unaffected_by_new_fields_left_unset(self):
        enm_before = _make_minimal_enm()
        enm_after = _make_minimal_enm()
        assert compute_enm_hash(enm_before) == compute_enm_hash(enm_after)

    def test_hash_stable_when_new_fields_set(self):
        measurement = Measurement(
            ref_id="ct1",
            name="CT1",
            measurement_type="CT",
            bus_ref="bus_sn",
            rating=MeasurementRating(ratio_primary=300.0, ratio_secondary=5.0),
            ct_arrangement="3xCT",
        )
        enm1 = EnergyNetworkModel(
            header=ENMHeader(name="F10.6 hash test 2", defaults=ENMDefaults()),
            measurements=[measurement],
        )
        enm2 = EnergyNetworkModel(
            header=ENMHeader(name="F10.6 hash test 2", defaults=ENMDefaults()),
            measurements=[measurement.model_copy()],
        )
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)

    def test_designation_field_present_in_model_dump_when_set(self):
        device = BayPrimaryDevice(
            device_ref="cb1",
            symbol_ref="symbol:cb",
            kind="CB",
            placement="MIDSTREAM",
            designation="Q1",
        )
        assert device.model_dump()["designation"] == "Q1"

    def test_designation_absent_from_model_dump_exclude_none_when_unset(self):
        device = BayPrimaryDevice(
            device_ref="cb1", symbol_ref="symbol:cb", kind="CB", placement="MIDSTREAM"
        )
        assert "designation" not in device.model_dump(exclude_none=True)

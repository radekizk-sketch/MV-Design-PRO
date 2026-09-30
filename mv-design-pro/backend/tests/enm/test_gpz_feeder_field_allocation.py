"""
Kanon dedykowanych pól liniowych GPZ (dyrektywa właściciela, 2026-07-17):
z jednego pola liniowego NIGDY nie wychodzą dwa kable — każde wyprowadzenie
na sieć terenową (magistrala i każdy feeder) ma WŁASNE, dedykowane pole
liniowe GPZ.

`start_branch_segment_sn` z pola GPZ:
  1. przydziela pole wskazane w `from_ref`, jeśli WOLNE;
  2. inaczej pierwsze WOLNE pole liniowe tej samej sekcji;
  3. inaczej tworzy NOWE pole liniowe (rola FEEDER, bez aparatury —
     konfiguracja aparatów to osobna decyzja inżynierska w produkcie);
  4. limit `MAX_GPZ_LINE_FIELDS_PER_SECTION` wyczerpany ⇒ błąd
     `branch_connection.gpz_line_fields_exhausted` (test negatywny —
     operacja NIGDY nie zawiesza dwóch kabli na jednym polu).
Relacja zapisywana dwustronnie: `field_spec.meta.assigned_corridor_ref`
oraz `corridor.meta.gpz_field_ref` (SLD rysuje feeder z JEGO pola —
relacja pierwszoklasowa, zero zgadywania po kolejności).
"""

from __future__ import annotations

from enm.domain_operations import (
    MAX_GPZ_LINE_FIELDS_PER_SECTION,
    execute_domain_operation,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _add_grid_source(enm_dict: dict, **extra_payload) -> dict:
    payload = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": "src-gpz-15kv-250mva-rx010",
        # Karta FAB-G: transformator WN/SN GPZ wymaga jawnej pary
        # hv_voltage_kv + transformer_sn_mva (albo transformer_catalog_ref).
        "hv_voltage_kv": 110.0,
        "transformer_sn_mva": 25.0,
    }
    payload.update(extra_payload)
    return execute_domain_operation(
        enm_dict=enm_dict, op_name="add_grid_source_sn", payload=payload
    )


def _continue_trunk(enm_dict: dict) -> dict:
    return execute_domain_operation(
        enm_dict=enm_dict,
        op_name="continue_trunk_segment_sn",
        payload={
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )


def _gpz_substation(snapshot: dict) -> dict:
    return next(s for s in snapshot["substations"] if str(s.get("ref_id", "")).startswith("gpz/"))


def _gpz_line_fields(snapshot: dict) -> list[dict]:
    return [
        spec
        for spec in _gpz_substation(snapshot).get("meta", {}).get("field_specs", [])
        if "gpz_line_field" in (spec.get("tags") or [])
    ]


def _start_branch_from_field(snapshot: dict, field_ref: str, dlugosc_m: int = 200) -> dict:
    return execute_domain_operation(
        enm_dict=snapshot,
        op_name="start_branch_segment_sn",
        payload={
            "from_ref": f"{field_ref}.BRANCH",
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": dlugosc_m,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )


def _branch_corridor(snapshot: dict, branch_ref: str) -> dict:
    return next(
        c
        for c in snapshot.get("corridors", [])
        if branch_ref in (c.get("ordered_segment_refs") or [])
    )


def _build_gpz_with_trunk(**source_payload) -> dict:
    r = _add_grid_source(_empty_enm(), **source_payload)
    assert not r.get("error"), r.get("error")
    r = _continue_trunk(r["snapshot"])
    assert not r.get("error"), r.get("error")
    return r["snapshot"]


class TestGpzFeederDedicatedField:
    def test_feeder_from_occupied_field_creates_dedicated_field(self):
        """GPZ z 1 polem (zajętym przez magistralę): feeder dostaje NOWE pole,
        relacja zapisana dwustronnie, pole 0 dostaje jawny przydział magistrali."""
        snapshot = _build_gpz_with_trunk()
        fields_before = _gpz_line_fields(snapshot)
        assert len(fields_before) == 1

        result = _start_branch_from_field(snapshot, fields_before[0]["field_ref"])
        assert not result.get("error"), result.get("error")
        after = result["snapshot"]

        fields = _gpz_line_fields(after)
        assert len(fields) == 2, "feeder z zajętego pola MUSI dostać nowe, dedykowane pole"
        new_field = next(f for f in fields if f["field_ref"] != fields_before[0]["field_ref"])
        assert new_field["bay_role"] == "FEEDER"
        assert new_field["meta"]["gpz_line_field_index"] == 1
        assert new_field["equipment_refs"] == [], "zero fabrykacji aparatury nowego pola"

        branch_ref = next(b["ref_id"] for b in after["branches"] if "branch_segment" in b["ref_id"])
        corridor = _branch_corridor(after, branch_ref)
        assert corridor["meta"]["gpz_field_ref"] == new_field["field_ref"]
        assert new_field["meta"]["assigned_corridor_ref"] == corridor["ref_id"]

        # Samonaprawa: pole 0 (magistrali) dostaje jawny przydział.
        trunk_field = next(f for f in fields if f["meta"]["gpz_line_field_index"] == 0)
        assigned = trunk_field["meta"].get("assigned_corridor_ref", "")
        assert "/corridor_" in assigned

    def test_feeder_uses_free_preconfigured_field(self):
        """GPZ z 2 polami (drugie WOLNE): feeder dostaje istniejące wolne pole —
        ŻADNE nowe pole nie powstaje."""
        snapshot = _build_gpz_with_trunk(line_fields_count=2)
        fields_before = _gpz_line_fields(snapshot)
        assert len(fields_before) == 2
        occupied_ref = next(
            f["field_ref"] for f in fields_before if f["meta"]["gpz_line_field_index"] == 0
        )
        free_ref = next(
            f["field_ref"] for f in fields_before if f["meta"]["gpz_line_field_index"] == 1
        )

        # Celowo wskazujemy pole ZAJĘTE — operacja ma przydzielić WOLNE.
        result = _start_branch_from_field(snapshot, occupied_ref)
        assert not result.get("error"), result.get("error")
        after = result["snapshot"]

        assert len(_gpz_line_fields(after)) == 2, "wolne pole istnieje — zero nowych pól"
        branch_ref = next(b["ref_id"] for b in after["branches"] if "branch_segment" in b["ref_id"])
        corridor = _branch_corridor(after, branch_ref)
        assert corridor["meta"]["gpz_field_ref"] == free_ref

    def test_two_feeders_get_two_distinct_fields(self):
        """Dwa feedery ⇒ dwa RÓŻNE dedykowane pola (nigdy wspólne)."""
        snapshot = _build_gpz_with_trunk()
        field_ref = _gpz_line_fields(snapshot)[0]["field_ref"]

        r1 = _start_branch_from_field(snapshot, field_ref, dlugosc_m=200)
        assert not r1.get("error"), r1.get("error")
        r2 = _start_branch_from_field(r1["snapshot"], field_ref, dlugosc_m=300)
        assert not r2.get("error"), r2.get("error")
        after = r2["snapshot"]

        fields = _gpz_line_fields(after)
        assert len(fields) == 3
        feeder_corridors = [c for c in after["corridors"] if c.get("meta", {}).get("gpz_field_ref")]
        assert len(feeder_corridors) == 2
        allocated = {c["meta"]["gpz_field_ref"] for c in feeder_corridors}
        assert len(allocated) == 2, "każdy feeder MA WŁASNE pole — zero współdzielenia"

    def test_branch_from_station_field_untouched(self):
        """Odgałęzienie ze STACJI (nie GPZ): przydział pól GPZ nie dotyczy —
        korytarz bez gpz_field_ref, pola GPZ bez zmian."""
        snapshot = _build_gpz_with_trunk()
        seg_ref = snapshot["corridors"][0]["ordered_segment_refs"][0]
        r = execute_domain_operation(
            enm_dict=snapshot,
            op_name="insert_station_on_segment_sn",
            payload={
                "segment_ref": seg_ref,
                # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "station_type": "B",
                "insert_at": {"value": 0.5},
                "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
                "sn_fields": ["IN", "OUT"],
                "transformer": {
                    "create": True,
                    "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                },
            },
        )
        assert not r.get("error"), r.get("error")
        snapshot = r["snapshot"]
        gpz_fields_before = len(_gpz_line_fields(snapshot))

        station = next(s for s in snapshot["substations"] if str(s["ref_id"]).startswith("stn/"))
        station_field = next(
            spec
            for spec in station.get("meta", {}).get("field_specs", [])
            if str(spec.get("bay_role", "")).upper() in {"OUT", "FEEDER"}
        )
        result = _start_branch_from_field(snapshot, station_field["field_ref"])
        assert not result.get("error"), result.get("error")
        after = result["snapshot"]

        assert len(_gpz_line_fields(after)) == gpz_fields_before
        branch_ref = next(b["ref_id"] for b in after["branches"] if "branch_segment" in b["ref_id"])
        corridor = _branch_corridor(after, branch_ref)
        assert "gpz_field_ref" not in (corridor.get("meta") or {})

    def test_field_limit_exhausted_rejects_with_error(self):
        """Test NEGATYWNY (wyrocznia gryzie): limit pól sekcji wyczerpany ⇒
        operacja ODMAWIA (nigdy dwa kable z jednego pola)."""
        snapshot = _build_gpz_with_trunk(line_fields_count=MAX_GPZ_LINE_FIELDS_PER_SECTION)
        field_ref = _gpz_line_fields(snapshot)[0]["field_ref"]
        # Pole 0 zajęte przez magistralę ⇒ wolnych jest MAX-1; zapełnij je.
        for i in range(MAX_GPZ_LINE_FIELDS_PER_SECTION - 1):
            r = _start_branch_from_field(snapshot, field_ref, dlugosc_m=100 + i)
            assert not r.get("error"), f"feeder {i}: {r.get('error')}"
            snapshot = r["snapshot"]
        assert len(_gpz_line_fields(snapshot)) == MAX_GPZ_LINE_FIELDS_PER_SECTION

        result = _start_branch_from_field(snapshot, field_ref, dlugosc_m=999)
        assert result.get("error"), "limit pól wyczerpany MUSI dawać błąd"
        assert result.get("error_code") == "branch_connection.gpz_line_fields_exhausted"

"""R14: inwariant zero zapisu po nieudanym kroku + jedno zatwierdzenie."""
from __future__ import annotations

from copy import deepcopy

import pytest

from application.gis.digpro_atomic_r14 import (
    AtomicImportRejected, commit_once, prepare_atomic_import, refs_in_model,
)

BASE = "a" * 64
AFTER = "b" * 64


def model():
    return {"header": {"revision": 4, "hash_sha256": BASE}, "buses": [], "substations": []}


def steps(n=2):
    return [
        {"name": "add_sn_bay", "step_id": f"S{i}",
         "idempotency_key": f"gis-synthetic-{i:04}",
         "payload": {"ref": f"synthetic/{i}"}}
        for i in range(n)
    ]


def handler(snapshot, name, payload):
    if name == "reject":
        return {"error_code": "synthetic.refused"}
    ref = f"bus/{len(snapshot['buses']) + 1}"
    snapshot["buses"].append({"ref_id": ref})
    return {"snapshot": snapshot, "changes": {"created_element_ids": [ref]}}


def refusal(code, call):
    with pytest.raises(AtomicImportRejected) as exc:
        call()
    assert exc.value.code == code


def prepare(xs=None, op=handler):
    return prepare_atomic_import(
        model(), expected_hash=BASE,
        operations=steps() if xs is None else xs,
        execute_canonical_operation=op,
    )


def test_two_steps_do_not_modify_input():
    original = model()
    result = prepare_atomic_import(
        original, expected_hash=BASE, operations=steps(),
        execute_canonical_operation=handler,
    )
    assert original["buses"] == []
    assert [s["ref_id"] for s in result.snapshot["buses"]] == ["bus/1", "bus/2"]


def test_second_step_failed_zero_persistence():
    source = model()
    operations = steps()
    operations[1]["name"] = "reject"
    refusal("DOMAIN_OPERATION_REJECTED", lambda: prepare_atomic_import(
        source, expected_hash=BASE, operations=operations,
        execute_canonical_operation=handler))
    assert source["buses"] == []


def test_one_commit_with_multiple_operations():
    prepared = prepare()
    commits = []

    def save(snapshot, _prepared):
        commits.append(1)
        snapshot["header"] = {"revision": 5, "hash_sha256": AFTER}
        return snapshot

    result = commit_once(read_current=model, save_once=save,
                         expected_hash=BASE, prepared=prepared)
    assert commits == [1]
    assert result["committed_steps"] == 2
    assert result["revision"] == 5


def test_revision_conflict_without_persistence():
    prepared = prepare()
    written = []
    refusal("COMMIT_REVISION_CONFLICT", lambda: commit_once(
        read_current=lambda: {"header": {"revision": 5, "hash_sha256": AFTER}},
        save_once=lambda state, evidence: written.append(state),
        expected_hash=BASE, prepared=prepared,
    ))
    assert written == []


def test_nested_field_ref():
    def nested(snapshot, _, __):
        snapshot["substations"] = [
            {"ref_id": "station/1", "meta": {"field_specs": [{"field_ref": "field/1"}]}}
        ]
        return {"snapshot": snapshot, "changes": {"created_element_ids": ["field/1"]}}
    assert "field/1" in refs_in_model(prepare(steps(1), nested).snapshot)


def test_reject_nonexistent_ref():
    def fake(snapshot, _, __):
        return {"snapshot": snapshot, "changes": {"created_element_ids": ["ghost"]}}
    refusal("DOMAIN_REF_NOT_PERSISTED", lambda: prepare(steps(1), fake))


def test_reject_deletion():
    def delete(snapshot, _, __):
        return {"snapshot": snapshot, "changes": {"deleted_element_ids": ["existing"]}}
    refusal("DELETIONS_NOT_SUPPORTED_FOR_DIGPRO_IMPORT", lambda: prepare(steps(1), delete))


def test_reject_no_changes():
    def nochange(snapshot, _, __):
        return {"snapshot": snapshot, "changes": {}}
    refusal("NO_DOMAIN_CHANGE", lambda: prepare(steps(1), nochange))


def test_reject_duplicate_idempotency_key():
    dup = steps()
    dup[1]["idempotency_key"] = dup[0]["idempotency_key"]
    refusal("IDEMPOTENCY_INVALID", lambda: prepare(dup))


def test_reject_empty_batch():
    refusal("OPERATIONS_INVALID", lambda: prepare([]))


def test_reject_adapter_readonly():
    def adapter(snapshot, _, __):
        return {"snapshot": snapshot, "adapter_only": True, "changes": {"updated_element_ids": ["bus/1"]}}
    refusal("ADAPTER_OPERATION_NOT_MUTATION", lambda: prepare(steps(1), adapter))


def test_reject_missing_snapshot():
    def missing(snapshot, _, __):
        return {"changes": {"created_element_ids": ["bus/1"]}}
    refusal("DOMAIN_SNAPSHOT_MISSING", lambda: prepare(steps(1), missing))


def test_initial_hash_must_match():
    refusal("BASE_REVISION_CONFLICT", lambda: prepare_atomic_import(
        model(), expected_hash=AFTER, operations=steps(), execute_canonical_operation=handler,
    ))


def test_commit_prepared_for_different_base_fails():
    p = prepare()
    refusal("PREPARED_BASE_MISMATCH", lambda: commit_once(
        read_current=lambda: {"header": {"hash_sha256": AFTER, "revision": 5}},
        save_once=lambda *_: {},
        expected_hash=AFTER, prepared=p,
    ))


def test_invalid_intermediate_hash():
    def handler_forged(snapshot, _, __):
        snapshot["header"]["hash_sha256"] = AFTER
        snapshot["buses"].append({"ref_id": "bus/1"})
        return {"snapshot": snapshot, "changes": {"created_element_ids": ["bus/1"]}}
    refusal("INTERMEDIATE_HEADER_FORGED", lambda: prepare(steps(1), handler_forged))


def test_metadata_ref_id_is_not_accepted_as_real_element():
    from application.gis.digpro_atomic_r14 import refs_in_model

    fake = model()
    fake["buses"] = [{"ref_id": "bus/real", "meta": {"ref_id": "bus/forged"}}]
    assert "bus/real" in refs_in_model(fake)
    assert "bus/forged" not in refs_in_model(fake)


def test_operation_cannot_claim_ref_only_in_arbitrary_metadata():
    def forged(snapshot, _name, _payload):
        snapshot["buses"].append({"ref_id": "bus/real", "meta": {"ref_id": "bus/fake"}})
        return {"snapshot": snapshot, "changes": {"created_element_ids": ["bus/fake"]}}

    refusal("DOMAIN_REF_NOT_PERSISTED", lambda: prepare(steps(1), forged))


def test_top_level_connection_node_is_canonical_element():
    from application.gis.digpro_atomic_r14 import refs_in_model

    typed = model()
    typed["connection_nodes"] = [{"ref_id": "connection/SN/01"}]
    assert "connection/SN/01" in refs_in_model(typed)


def test_nested_station_field_is_valid_but_generic_terminal_is_not():
    from application.gis.digpro_atomic_r14 import refs_in_model

    typed = model()
    typed["substations"] = [{
        "ref_id": "station/SN01",
        "meta": {"field_specs": [{"field_ref": "field/SN/01"}],
                 "debug": {"terminal_ref": "unverified/terminal"}}
    }]
    refs = refs_in_model(typed)
    assert "station/SN01" in refs
    assert "field/SN/01" in refs
    assert "unverified/terminal" not in refs

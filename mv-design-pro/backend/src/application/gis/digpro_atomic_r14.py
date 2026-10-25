"""GIS R14: atomowy etap przygotowania wielu kanonicznych operacji ENM.

BRAK zapisu i brak dodatkowej fizyki. Wołający musi utrzymać blokadę twin
przez odczyt, przygotowanie, sprawdzenie rewizji i JEDEN zapis set_enm.
Blokada ENM jest w jednym procesie; nie gwarantuje izolacji wieloprocesowej.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any, Callable


class AtomicImportRejected(ValueError):
    def __init__(self, code: str, step: int | None = None):
        self.code, self.step = code, step
        super().__init__(code)


@dataclass(frozen=True)
class PreparedImport:
    snapshot: dict[str, Any]
    step_evidence: tuple[dict[str, Any], ...]
    created_refs: tuple[str, ...]
    updated_refs: tuple[str, ...]
    origin_hash: str


def _require(ok: bool, code: str, step: int | None = None) -> None:
    if not ok:
        raise AtomicImportRejected(code, step)


def refs_in_model(model: Any) -> set[str]:
    """Uwzględnia wewnętrzne meta.field_specs[].field_ref i terminale stacji."""
    refs: set[str] = set()
    stack = [(model, 0)]
    seen = 0
    while stack:
        node, depth = stack.pop()
        seen += 1
        _require(seen <= 250_000 and depth <= 40, "MODEL_TOO_COMPLEX")
        if isinstance(node, dict):
            for key, value in node.items():
                if key in {"ref_id", "field_ref", "terminal_ref", "segment_ref"} and isinstance(value, str):
                    refs.add(value)
                elif isinstance(value, (dict, list)):
                    stack.append((value, depth + 1))
        elif isinstance(node, list):
            stack.extend((value, depth + 1) for value in node if isinstance(value, (dict, list)))
    return refs


def prepare_atomic_import(
    original: dict[str, Any],
    *, expected_hash: str,
    operations: list[dict[str, Any]],
    execute_canonical_operation: Callable[[dict[str, Any], str, dict[str, Any]], dict[str, Any]],
) -> PreparedImport:
    """Żadnego set_enm: albo wszystkie komendy w pamięci, albo odmowa."""
    _require(isinstance(original, dict) and isinstance(original.get("header"), dict), "MODEL_INVALID")
    _require(isinstance(expected_hash, str) and re.fullmatch(r"[0-9a-f]{64}", expected_hash) is not None,
             "BASE_HASH_INVALID")
    _require(original["header"].get("hash_sha256") == expected_hash, "BASE_REVISION_CONFLICT")
    _require(isinstance(operations, list) and 0 < len(operations) <= 128, "OPERATIONS_INVALID")
    state = deepcopy(original)
    steps: list[dict[str, Any]] = []
    created_total: list[str] = []
    updated_total: list[str] = []
    step_ids: set[str] = set()
    keys: set[str] = set()
    for i, item in enumerate(operations):
        _require(isinstance(item, dict), "STEP_INVALID", i)
        name, uid, idem, payload = (item.get(k) for k in ("name", "step_id", "idempotency_key", "payload"))
        _require(isinstance(name, str) and bool(name), "OPERATION_NAME_INVALID", i)
        _require(isinstance(payload, dict) and bool(payload), "OPERATION_PAYLOAD_INVALID", i)
        _require(isinstance(uid, str) and bool(uid) and uid not in step_ids, "STEP_ID_INVALID", i)
        _require(isinstance(idem, str) and len(idem) >= 8 and idem not in keys, "IDEMPOTENCY_INVALID", i)
        step_ids.add(uid)
        keys.add(idem)
        result = execute_canonical_operation(deepcopy(state), name, deepcopy(payload))
        _require(isinstance(result, dict) and not result.get("error") and not result.get("error_code"),
                 "DOMAIN_OPERATION_REJECTED", i)
        _require(result.get("adapter_only") is not True, "ADAPTER_OPERATION_NOT_MUTATION", i)
        candidate = result.get("snapshot")
        _require(isinstance(candidate, dict), "DOMAIN_SNAPSHOT_MISSING", i)
        changes = result.get("changes")
        _require(isinstance(changes, dict), "DOMAIN_CHANGES_MISSING", i)
        made, modified, deleted = (
            changes.get(k, []) for k in ("created_element_ids", "updated_element_ids", "deleted_element_ids")
        )
        _require(all(isinstance(v, list) and all(isinstance(x, str) and bool(x) for x in v)
                     for v in (made, modified, deleted)), "CHANGE_REFS_INVALID", i)
        _require(bool(made or modified or deleted), "NO_DOMAIN_CHANGE", i)
        _require(not deleted, "DELETIONS_NOT_SUPPORTED_FOR_DIGPRO_IMPORT", i)
        refs = refs_in_model(candidate)
        _require(all(v in refs for v in (*made, *modified)), "DOMAIN_REF_NOT_PERSISTED", i)
        _require(candidate.get("header", {}).get("hash_sha256") in (expected_hash, None),
                 "INTERMEDIATE_HEADER_FORGED", i)
        steps.append({"step_id": uid, "operation": name,
                      "created_refs": list(made), "updated_refs": list(modified)})
        created_total.extend(made)
        updated_total.extend(modified)
        state = deepcopy(candidate)
    return PreparedImport(snapshot=state, step_evidence=tuple(steps),
                          created_refs=tuple(created_total), updated_refs=tuple(updated_total),
                          origin_hash=expected_hash)


def commit_once(
    *, read_current: Callable[[], dict[str, Any]],
    save_once: Callable[[dict[str, Any], PreparedImport], dict[str, Any]],
    expected_hash: str, prepared: PreparedImport,
) -> dict[str, Any]:
    """Wymaga zewnętrznej blokady. Zapis jest wykonany raz po sprawdzeniu CAS."""
    current = read_current()
    _require(current.get("header", {}).get("hash_sha256") == expected_hash, "COMMIT_REVISION_CONFLICT")
    _require(prepared.origin_hash == expected_hash, "PREPARED_BASE_MISMATCH")
    persisted = save_once(deepcopy(prepared.snapshot), prepared)
    _require(isinstance(persisted, dict) and isinstance(persisted.get("header"), dict),
             "COMMIT_READBACK_INVALID")
    _require(persisted["header"].get("hash_sha256") != expected_hash, "COMMIT_NO_CHANGE")
    _require(isinstance(persisted["header"].get("revision"), int) and
             persisted["header"]["revision"] > current["header"]["revision"],
             "COMMIT_REVISION_NOT_ADVANCED")
    return {"revision": persisted["header"]["revision"],
            "hash_sha256": persisted["header"]["hash_sha256"],
            "committed_steps": len(prepared.step_evidence),
            "created_refs": list(prepared.created_refs),
            "updated_refs": list(prepared.updated_refs),
            "step_evidence": list(prepared.step_evidence)}

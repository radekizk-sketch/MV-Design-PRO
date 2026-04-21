from __future__ import annotations

from datetime import UTC, datetime

from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

_enm_store: dict[str, EnergyNetworkModel] = {}


def get_enm(case_id: str) -> EnergyNetworkModel:
    """Return the current ENM snapshot for a case, creating a default model if needed."""
    if case_id not in _enm_store:
        enm = EnergyNetworkModel(
            header=ENMHeader(
                name=f"Model sieci - {case_id[:8]}",
                defaults=ENMDefaults(),
            ),
        )
        enm.header.hash_sha256 = compute_enm_hash(enm)
        _enm_store[case_id] = enm
    return _enm_store[case_id]


def set_enm(case_id: str, enm: EnergyNetworkModel) -> EnergyNetworkModel:
    """Persist an ENM snapshot with deterministic hash and revision management."""
    existing = _enm_store.get(case_id)
    if existing is not None:
        same_revision_candidate = enm.model_copy(deep=True)
        same_revision_candidate.header.revision = existing.header.revision
        if compute_enm_hash(same_revision_candidate) == existing.header.hash_sha256:
            return existing

    old_rev = existing.header.revision if existing else 0
    enm.header.revision = old_rev + 1
    enm.header.updated_at = datetime.now(UTC)
    enm.header.hash_sha256 = compute_enm_hash(enm)
    _enm_store[case_id] = enm
    return enm


def reset_enm_store() -> None:
    _enm_store.clear()

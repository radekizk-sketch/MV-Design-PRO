from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path

from enm.catalog_completion import complete_catalog_defaults
from enm.dziennik_zmian import dopisz as dopisz_do_dziennika
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


@dataclass(frozen=True)
class ZrodloZmiany:
    """Przyczyna nowej rewizji modelu — kanoniczna nazwa operacji + dotkniete elementy.

    Wypelnia ja warstwa, ktora ZNA operacje (koncowka operacji domenowych), bo
    `set_enm` widzi tylko rezultat. Pola listowe pochodza WPROST z
    `changes.{created,updated,deleted}_element_ids` odpowiedzi operacji — zadna
    z nich nie jest tu wyliczana ani zgadywana.
    """

    operacja: str | None
    utworzone: tuple[str, ...] = ()
    zmienione: tuple[str, ...] = ()
    usuniete: tuple[str, ...] = ()


_enm_store: dict[str, EnergyNetworkModel] = {}
_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[2] / ".enm_store"


def _store_dir() -> Path:
    configured = os.getenv("ENM_STORE_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def _case_path(case_id: str) -> Path:
    digest = sha256(case_id.encode("utf-8")).hexdigest()
    return _store_dir() / f"{digest}.json"


def _load_persisted_enm(case_id: str) -> EnergyNetworkModel | None:
    path = _case_path(case_id)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    snapshot = payload.get("snapshot")
    if not isinstance(snapshot, dict):
        return None
    try:
        return EnergyNetworkModel.model_validate(snapshot)
    except ValueError:
        return None


def _persist_enm(case_id: str, enm: EnergyNetworkModel) -> None:
    store_dir = _store_dir()
    store_dir.mkdir(parents=True, exist_ok=True)
    path = _case_path(case_id)
    tmp_path = path.with_suffix(".tmp")
    payload = {
        "case_id": case_id,
        "snapshot": enm.model_dump(mode="json"),
        "hash_sha256": enm.header.hash_sha256,
        "revision": enm.header.revision,
        "updated_at": enm.header.updated_at.isoformat(),
    }
    tmp_path.write_text(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def has_enm(case_id: str) -> bool:
    """Return whether a case already has a materialized ENM snapshot."""
    return case_id in _enm_store or _case_path(case_id).exists()


def get_enm(case_id: str) -> EnergyNetworkModel:
    """Return the current ENM snapshot for a case, creating a default model if needed."""
    if case_id not in _enm_store:
        persisted = _load_persisted_enm(case_id)
        if persisted is not None:
            _enm_store[case_id] = persisted
        else:
            enm = EnergyNetworkModel(
                header=ENMHeader(
                    name=f"Model sieci - {case_id[:8]}",
                    defaults=ENMDefaults(),
                ),
            )
            enm.header.hash_sha256 = compute_enm_hash(enm)
            _enm_store[case_id] = enm
    completed, changed = complete_catalog_defaults(_enm_store[case_id])
    if changed:
        return set_enm(case_id, completed)
    return _enm_store[case_id]


def set_enm(
    case_id: str,
    enm: EnergyNetworkModel,
    *,
    zrodlo_zmiany: ZrodloZmiany | None = None,
) -> EnergyNetworkModel:
    """Persist an ENM snapshot with deterministic hash and revision management.

    `zrodlo_zmiany` (V12K-264) niesie PRZYCZYNE nowej rewizji do dziennika zmian —
    to jedyne miejsce w systemie, w ktorym rewizja rosnie, wiec tylko tutaj wpis
    moze powstac dokladnie raz na rewizje. Parametr jest OPCJONALNY i nie zmienia
    zadnego hasha: dziennik jest zapisem rownoleglym (patrz `enm/dziennik_zmian.py`),
    a nie polem modelu. Zapis bez zrodla trafia do dziennika z `operacja = None` —
    projektant ma wiedziec, ze rewizja powstala, nawet gdy przyczyna nie zostala
    zarejestrowana; cisza w tym miejscu bylaby luka w historii.
    """
    enm, _ = complete_catalog_defaults(enm)
    existing = _enm_store.get(case_id)
    if existing is not None:
        same_revision_candidate = enm.model_copy(deep=True)
        same_revision_candidate.header.revision = existing.header.revision
        if compute_enm_hash(same_revision_candidate) == existing.header.hash_sha256:
            _persist_enm(case_id, existing)
            return existing

    old_rev = existing.header.revision if existing else 0
    enm.header.revision = old_rev + 1
    enm.header.updated_at = datetime.now(UTC)
    enm.header.hash_sha256 = compute_enm_hash(enm)
    _enm_store[case_id] = enm
    _persist_enm(case_id, enm)
    dopisz_do_dziennika(
        case_id,
        rewizja=enm.header.revision,
        operacja=zrodlo_zmiany.operacja if zrodlo_zmiany else None,
        utworzone=zrodlo_zmiany.utworzone if zrodlo_zmiany else (),
        zmienione=zrodlo_zmiany.zmienione if zrodlo_zmiany else (),
        usuniete=zrodlo_zmiany.usuniete if zrodlo_zmiany else (),
        znacznik_czasu=enm.header.updated_at,
    )
    return enm


def reset_enm_store(*, remove_persisted: bool = True) -> None:
    _enm_store.clear()
    if not remove_persisted:
        return
    store_dir = _store_dir()
    if not store_dir.exists():
        return
    for path in store_dir.glob("*.json"):
        path.unlink(missing_ok=True)
    for path in store_dir.glob("*.tmp"):
        path.unlink(missing_ok=True)
